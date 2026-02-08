/**
 * LogoUploadService - Handles team logo uploads to Firebase Storage
 *
 * Pattern: Upload to logo-uploads/ path, Cloud Function processes and moves to team-logos/
 */
const LogoUploadService = (function() {

    /**
     * Upload a cropped logo blob to Firebase Storage
     * @param {string} teamId - The team ID
     * @param {string} userId - The uploading user's ID
     * @param {Blob} croppedBlob - The cropped image blob
     * @param {function} onProgress - Progress callback (0-100)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function uploadLogo(teamId, userId, croppedBlob, onProgress) {
        if (!teamId || !userId) {
            return { success: false, error: 'Missing team or user ID' };
        }

        const { ref, uploadBytesResumable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js');

        const storage = window.firebase.storage;
        const timestamp = Date.now();
        const fileName = `logo_${timestamp}.png`;
        const storagePath = `logo-uploads/${teamId}/${userId}/${fileName}`;

        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, croppedBlob, {
            contentType: 'image/png'
        });

        return new Promise((resolve, reject) => {
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    if (onProgress) onProgress(progress);
                },
                (error) => {
                    console.error('Logo upload failed:', error);
                    reject({ success: false, error: error.message });
                },
                () => {
                    // Upload complete - Cloud Function will process
                    resolve({ success: true });
                }
            );
        });
    }

    return { uploadLogo };
})();
