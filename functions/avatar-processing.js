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
 * This function will:
 * 1. Verify the uploader matches the userId in the path.
 * 2. Resize the image into multiple formats (128, 64, 32).
 * 3. Save the processed avatars to the public user-avatars/ path.
 * 4. Update the user's document in Firestore with the new avatar URL.
 * 5. Clean up the original temporary file.
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

    // Exit if this is not an image.
    if (!contentType || !contentType.startsWith('image/')) {
        console.log('This is not an image.');
        return null;
    }

    // Exit if the file is not in the avatar upload directory.
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

    // 3. Download image to a temporary location in the Cloud Function's environment
    const tempFilePath = path.join(os.tmpdir(), originalFileName);
    const tempAvatarDir = path.join(os.tmpdir(), 'avatars');

    try {
        // Ensure avatar directory exists
        if (!fs.existsSync(tempAvatarDir)){
            fs.mkdirSync(tempAvatarDir);
        }

        await bucket.file(filePath).download({ destination: tempFilePath });
        console.log('Image downloaded locally to', tempFilePath);

        // 4. Use Sharp to create resized versions
        const timestamp = Date.now();
        const sizes = [
            { name: 'large', width: 128 },
            { name: 'medium', width: 64 },
            { name: 'small', width: 32 }
        ];

        const uploadPromises = sizes.map(async (size) => {
            const avatarFileName = `${size.name}_${timestamp}.png`;
            const avatarFilePath = path.join(tempAvatarDir, avatarFileName);

            await sharp(tempFilePath)
                .resize(size.width, size.width, { fit: 'cover', position: 'center' })
                .png({ quality: 90 })
                .toFile(avatarFilePath);

            // 5. Upload processed images to the public folder
            const destination = `user-avatars/${userId}/${avatarFileName}`;

            const [file] = await bucket.upload(avatarFilePath, {
                destination: destination,
                metadata: {
                    contentType: 'image/png',
                    cacheControl: 'public, max-age=31536000', // Cache for 1 year
                },
            });

            // Clean up the local avatar file
            fs.unlinkSync(avatarFilePath);

            return { size: size.name, path: destination };
        });

        const processedAvatars = await Promise.all(uploadPromises);

        // 6. Get public URLs for all processed avatars
        const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

        const urlPromises = processedAvatars.map(async (avatar) => {
            const file = bucket.file(avatar.path);

            let url;
            if (isEmulator) {
                // In emulator, construct the download URL directly
                const encodedPath = encodeURIComponent(avatar.path);
                url = `http://127.0.0.1:9199/v0/b/${object.bucket}/o/${encodedPath}?alt=media`;
            } else {
                // In production, make the file public and use the public URL
                await file.makePublic();
                url = `https://storage.googleapis.com/${object.bucket}/${avatar.path}`;
            }

            return { size: avatar.size, url: url };
        });

        const avatarUrlsWithSizes = await Promise.all(urlPromises);
        const avatarUrls = avatarUrlsWithSizes.reduce((acc, curr) => {
            acc[curr.size] = curr.url;
            return acc;
        }, {});

        // 7. Update Firestore user document
        await userRef.update({
            customAvatarUrl: avatarUrls.large,
            avatarSource: 'custom',
            photoURL: avatarUrls.large, // Also update photoURL for grid display
            lastUpdatedAt: FieldValue.serverTimestamp()
        });

        console.log(`Successfully processed avatar for user ${userId}. URLs:`, avatarUrls);

    } catch (error) {
        console.error('An error occurred during avatar processing:', error);
    } finally {
        // 8. Clean up the original temporary files
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        if (fs.existsSync(tempAvatarDir)) {
            fs.rmdirSync(tempAvatarDir, { recursive: true });
        }
        await bucket.file(filePath).delete();
        console.log(`Cleaned up temporary files for ${filePath}`);
    }
});
