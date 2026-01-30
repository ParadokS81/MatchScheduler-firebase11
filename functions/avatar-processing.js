const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const sharp = require('sharp');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Get Firebase Admin instances (already initialized in index.js)
const db = getFirestore();
const storage = getStorage();

/**
 * Cloud Function triggered when a new avatar is uploaded to the temporary path.
 *
 * Simplified pipeline (single 128px output):
 * 1. Verify the uploader matches the userId in the path
 * 2. Resize image to 128px (CSS handles display sizing)
 * 3. Save processed avatar to user-avatars/ path
 * 4. Update user document and team rosters with photoURL
 * 5. Clean up temporary files
 */
exports.processAvatarUpload = onObjectFinalized({
    region: 'europe-west10',
    bucket: 'matchscheduler-dev.firebasestorage.app'
}, async (event) => {
    console.log('=== processAvatarUpload TRIGGERED ===');
    console.log('Event data:', JSON.stringify(event.data, null, 2));

    const object = event.data;
    const filePath = object.name; // e.g., 'avatar-uploads/userId/avatar_123.png'
    const contentType = object.contentType;
    const bucket = storage.bucket(object.bucket);

    console.log(`File path: ${filePath}, Content type: ${contentType}, Bucket: ${object.bucket}`);

    // --- Basic validation and exit conditions ---

    // Exit if this is not an image
    if (!contentType || !contentType.startsWith('image/')) {
        console.log('This is not an image.');
        return null;
    }

    // Exit if the file is not in the avatar upload directory
    if (!filePath.startsWith('avatar-uploads/')) {
        console.log('Not an avatar upload, skipping processing.');
        return null;
    }

    // --- Start Processing ---
    console.log(`Processing avatar upload: ${filePath}`);

    // 1. Extract userId from filePath: avatar-uploads/{userId}/{fileName}
    const parts = filePath.split('/');
    if (parts.length !== 3) {
        console.error(`Invalid file path structure: ${filePath}`);
        return null;
    }
    const userId = parts[1];
    const originalFileName = parts[2];

    // 2. Verify user exists
    const userRef = db.collection('users').doc(userId);
    try {
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            console.error(`User ${userId} does not exist. Cleaning up.`);
            return bucket.file(filePath).delete();
        }
    } catch (error) {
        console.error(`Error verifying user ${userId}:`, error);
        return bucket.file(filePath).delete();
    }

    // 3. Download image to temporary location
    const tempFilePath = path.join(os.tmpdir(), originalFileName);
    const timestamp = Date.now();
    const avatarFileName = `avatar_${timestamp}.png`;
    const processedFilePath = path.join(os.tmpdir(), avatarFileName);

    try {
        await bucket.file(filePath).download({ destination: tempFilePath });
        console.log('Image downloaded locally to', tempFilePath);

        // 4. Resize to single 128px version (CSS handles display sizing)
        await sharp(tempFilePath)
            .resize(128, 128, { fit: 'cover', position: 'center' })
            .png({ quality: 90 })
            .toFile(processedFilePath);

        // 5. Upload processed avatar to public folder
        const destination = `user-avatars/${userId}/${avatarFileName}`;

        await bucket.upload(processedFilePath, {
            destination: destination,
            metadata: {
                contentType: 'image/png',
                cacheControl: 'public, max-age=31536000', // Cache for 1 year
            },
        });

        // 6. Get public URL
        const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
        let photoURL;

        if (isEmulator) {
            const encodedPath = encodeURIComponent(destination);
            photoURL = `http://127.0.0.1:9199/v0/b/${object.bucket}/o/${encodedPath}?alt=media`;
        } else {
            const file = bucket.file(destination);
            await file.makePublic();
            photoURL = `https://storage.googleapis.com/${object.bucket}/${destination}`;
        }

        // 7. Update Firestore user document
        await userRef.update({
            photoURL: photoURL,
            avatarSource: 'custom',
            lastUpdatedAt: FieldValue.serverTimestamp()
        });

        console.log(`Successfully processed avatar for user ${userId}. URL: ${photoURL}`);

        // 8. Update photoURL in all team rosters
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        if (userData?.teams) {
            const teamIds = Object.keys(userData.teams).filter(id => userData.teams[id] === true);

            for (const teamId of teamIds) {
                try {
                    const teamRef = db.collection('teams').doc(teamId);
                    const teamDoc = await teamRef.get();

                    if (teamDoc.exists) {
                        const teamData = teamDoc.data();
                        const updatedRoster = teamData.playerRoster.map(player => {
                            if (player.userId === userId) {
                                return {
                                    ...player,
                                    photoURL: photoURL
                                };
                            }
                            return player;
                        });

                        await teamRef.update({ playerRoster: updatedRoster });
                        console.log(`Updated avatar in team roster: ${teamId}`);
                    }
                } catch (err) {
                    console.error(`Failed to update avatar in team ${teamId}:`, err);
                    // Continue with other teams even if one fails
                }
            }
        }

    } catch (error) {
        console.error('An error occurred during avatar processing:', error);
    } finally {
        // 9. Clean up temporary files
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        if (fs.existsSync(processedFilePath)) {
            fs.unlinkSync(processedFilePath);
        }
        await bucket.file(filePath).delete();
        console.log(`Cleaned up temporary files for ${filePath}`);
    }
});
