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
 * Cloud Function triggered when a new logo is uploaded to the temporary path.
 * This function will:
 * 1. Verify the uploader is the team leader.
 * 2. Resize and compress the image into multiple formats.
 * 3. Save the processed logos to the public team-logos/ path.
 * 4. Update the team's document in Firestore with the new logo URLs.
 * 5. Clean up the original temporary file.
 */
exports.processLogoUpload = onObjectFinalized({ region: 'europe-west10' }, async (event) => {
    const object = event.data;
    const filePath = object.name; // e.g., 'logo-uploads/teamId/userId/logo_123.png'
    const contentType = object.contentType;
    const bucket = storage.bucket(object.bucket);

    // --- Basic validation and exit conditions ---

    // Exit if this is not an image.
    if (!contentType || !contentType.startsWith('image/')) {
        console.log('This is not an image.');
        return null;
    }

    // Exit if the file is not in the temporary upload directory.
    if (!filePath.startsWith('logo-uploads/')) {
        console.log('Not a logo upload, skipping processing.');
        return null;
    }

    // --- Start Processing ---
    console.log(`Processing logo upload: ${filePath}`);

    // 1. Extract teamId and userId from filePath
    const parts = filePath.split('/');
    if (parts.length !== 4) {
        console.error(`Invalid file path structure: ${filePath}`);
        return null;
    }
    const teamId = parts[1];
    const userId = parts[2];
    const originalFileName = parts[3];

    // 2. Verify leader permissions
    const teamRef = db.collection('teams').doc(teamId);
    try {
        const teamDoc = await teamRef.get();

        if (!teamDoc.exists || teamDoc.data().leaderId !== userId) {
            console.error(`Permission denied. User ${userId} is not the leader of team ${teamId}. Cleaning up.`);
            return bucket.file(filePath).delete();
        }
    } catch (error) {
        console.error(`Error verifying leader permissions for team ${teamId}:`, error);
        return bucket.file(filePath).delete();
    }

    // 3. Download image to a temporary location in the Cloud Function's environment
    const tempFilePath = path.join(os.tmpdir(), originalFileName);
    const tempThumbDir = path.join(os.tmpdir(), 'thumbnails');
    
    try {
        // Ensure thumbnail directory exists
        if (!fs.existsSync(tempThumbDir)){
            fs.mkdirSync(tempThumbDir);
        }

        await bucket.file(filePath).download({ destination: tempFilePath });
        console.log('Image downloaded locally to', tempFilePath);

        // 4. Use Sharp to create thumbnails
        const newLogoId = db.collection('teams').doc().id; // Generate ONE unique ID for this logo version
        const sizes = [
            { name: 'large', width: 400 },
            { name: 'medium', width: 150 },
            { name: 'small', width: 48 }
        ];

        const uploadPromises = sizes.map(async (size) => {
            const thumbFileName = `${size.name}_${newLogoId}.png`;
            const thumbFilePath = path.join(tempThumbDir, thumbFileName);

            await sharp(tempFilePath)
                .resize(size.width, size.width, { fit: 'cover' }) // Use square cover to ensure dimensions
                .png({ quality: 85 })
                .toFile(thumbFilePath);

            // 5. Upload thumbnails to the public folder
            const destination = `team-logos/${teamId}/${newLogoId}/${thumbFileName}`;
            
            const [file] = await bucket.upload(thumbFilePath, {
                destination: destination,
                metadata: {
                    contentType: 'image/png',
                    cacheControl: 'public, max-age=31536000', // Cache for 1 year
                },
            });

            // Clean up the local thumbnail file
            fs.unlinkSync(thumbFilePath);

            return { size: size.name, path: destination };
        });

        const processedLogos = await Promise.all(uploadPromises);

        // 6. Get public URLs for all processed logos
        const urlPromises = processedLogos.map(async (logo) => {
            const file = bucket.file(logo.path);
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2491' // A very long time in the future
            });
            return { size: logo.size, url: url };
        });

        const logoUrlsWithSizes = await Promise.all(urlPromises);
        const logoUrls = logoUrlsWithSizes.reduce((acc, curr) => {
            acc[curr.size] = curr.url;
            return acc;
        }, {});


        // 7. Update Firestore database
        const newLogoDoc = {
            status: 'active',
            uploadedBy: userId,
            uploadedAt: FieldValue.serverTimestamp(),
            urls: logoUrls
        };

        await db.runTransaction(async (transaction) => {
            const currentTeamDoc = await transaction.get(teamRef);
            const currentTeamData = currentTeamDoc.data();
            
            if (currentTeamData.activeLogo && currentTeamData.activeLogo.logoId) {
                const oldLogoRef = teamRef.collection('logos').doc(currentTeamData.activeLogo.logoId);
                transaction.update(oldLogoRef, { status: 'archived' });
            }

            const newLogoRef = teamRef.collection('logos').doc(newLogoId);
            transaction.set(newLogoRef, newLogoDoc);

            transaction.update(teamRef, {
                activeLogo: {
                    logoId: newLogoId,
                    urls: logoUrls
                }
            });
        });

        console.log(`Successfully processed and saved new logo ${newLogoId} for team ${teamId}.`);

    } catch (error) {
        console.error('An error occurred during logo processing:', error);
    } finally {
        // 8. Clean up the original temporary files
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        if (fs.existsSync(tempThumbDir)) {
            fs.rmdirSync(tempThumbDir, { recursive: true });
        }
        await bucket.file(filePath).delete();
        console.log(`Cleaned up temporary files for ${filePath}`);
    }
});
