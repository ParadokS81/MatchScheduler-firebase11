/**
 * FeedbackUploadService.js
 * Handles screenshot compression, upload to Firebase Storage,
 * and feedback submission via Cloud Function
 */
const FeedbackUploadService = (function() {

    /**
     * Compress image client-side using Canvas API
     * @param {File} file - Original image file
     * @param {number} maxWidth - Max width in pixels (default 1200)
     * @returns {Promise<Blob>} - Compressed JPEG blob
     */
    function compressImage(file, maxWidth = 1200) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxWidth / img.width, 1);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
                    'image/jpeg',
                    0.8
                );
                URL.revokeObjectURL(img.src);
            };
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error('Failed to load image'));
            };
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Upload screenshot to Firebase Storage and return download URL
     * @param {string} userId
     * @param {Blob} compressedBlob
     * @param {Function} onProgress - Progress callback (0-100)
     * @returns {Promise<string>} - Download URL
     */
    async function uploadScreenshot(userId, compressedBlob, onProgress) {
        const { ref, uploadBytesResumable, getDownloadURL } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js'
        );

        const storage = window.firebase.storage;
        const timestamp = Date.now();
        const fileName = `feedback_${timestamp}.jpg`;
        const storagePath = `feedback-uploads/${userId}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        const uploadTask = uploadBytesResumable(storageRef, compressedBlob, {
            contentType: 'image/jpeg'
        });

        return new Promise((resolve, reject) => {
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    if (onProgress) onProgress(progress);
                },
                (error) => {
                    console.error('Screenshot upload failed:', error);
                    reject(error);
                },
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        resolve(downloadURL);
                    } catch (error) {
                        console.error('Failed to get download URL:', error);
                        reject(error);
                    }
                }
            );
        });
    }

    /**
     * Submit feedback via Cloud Function
     * @param {Object} feedbackData - { category, message, screenshotUrl, currentUrl, browserInfo }
     * @returns {Promise<Object>} - { success, feedbackId }
     */
    async function submitFeedback(feedbackData) {
        return TeamService.callFunction('submitFeedback', feedbackData);
    }

    return { compressImage, uploadScreenshot, submitFeedback };
})();
