/**
 * AvatarUploadService.js
 * Handles user avatar uploads to Firebase Storage
 * Storage trigger processAvatarUpload will process the image
 */
const AvatarUploadService = (function() {

    /**
     * Upload cropped avatar blob to Firebase Storage
     * @param {string} userId - User ID
     * @param {Blob} croppedBlob - Cropped image blob from Cropper.js
     * @param {Function} onProgress - Progress callback (0-100)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function uploadAvatar(userId, croppedBlob, onProgress) {
        try {
            const { ref, uploadBytesResumable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js');

            const storage = window.firebase.storage;
            const timestamp = Date.now();
            const fileName = `avatar_${timestamp}.png`;
            const storagePath = `avatar-uploads/${userId}/${fileName}`;

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
                        console.error('Avatar upload failed:', error);
                        reject({ success: false, error: error.message });
                    },
                    () => {
                        // Upload complete - Cloud Function will process
                        resolve({ success: true });
                    }
                );
            });
        } catch (error) {
            console.error('Avatar upload error:', error);
            return { success: false, error: error.message };
        }
    }

    return { uploadAvatar };
})();
