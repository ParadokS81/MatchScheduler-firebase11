/**
 * AvatarUploadModal.js
 * Modal for uploading and cropping user avatars
 * Reuses patterns from LogoUploadModal.js
 */
const AvatarUploadModal = (function() {
    let _userId = null;
    let _cropper = null;
    let _objectUrl = null;
    let _onSuccess = null;

    /**
     * Show the avatar upload modal
     * @param {string} userId - User ID for the avatar
     * @param {Function} onSuccess - Callback with preview URL when upload completes
     */
    function show(userId, onSuccess) {
        _userId = userId;
        _onSuccess = onSuccess;
        _renderModal();
        _attachListeners();
    }

    function _renderModal() {
        // Use dedicated avatar-modal-container to avoid conflict with ProfileModal
        const container = document.getElementById('avatar-modal-container');
        container.innerHTML = `
            <div class="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm" id="avatar-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-xl font-bold text-primary">Upload Avatar</h2>
                        <button id="avatar-modal-close" class="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
                    </div>
                    <div class="p-4">
                        <!-- File Selection State -->
                        <div id="avatar-select-state">
                            <input type="file" id="avatar-file-input" accept="image/*" class="hidden">
                            <div id="avatar-drop-zone" class="w-full py-6 border-2 border-dashed border-border rounded-lg hover:border-primary transition-colors cursor-pointer">
                                <div class="flex flex-col items-center pointer-events-none">
                                    <svg class="w-8 h-8 text-muted-foreground mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                    </svg>
                                    <span class="text-muted-foreground text-sm">Drop image or click to browse</span>
                                    <span class="text-xs text-muted-foreground mt-1">Max 2MB, square recommended</span>
                                </div>
                            </div>
                        </div>

                        <!-- Crop State -->
                        <div id="avatar-crop-state" class="hidden">
                            <div class="w-64 h-64 mx-auto bg-muted rounded-lg overflow-hidden">
                                <img id="avatar-crop-image" class="max-w-full">
                            </div>
                            <p class="text-sm text-muted-foreground mt-2 text-center">Adjust crop area</p>
                        </div>

                        <!-- Upload Progress State -->
                        <div id="avatar-progress-state" class="hidden">
                            <div class="flex flex-col items-center py-6">
                                <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <p class="mt-3 text-muted-foreground text-sm">Uploading...</p>
                                <div class="w-full bg-muted rounded-full h-1.5 mt-3">
                                    <div id="avatar-progress-bar" class="bg-primary h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Success State -->
                        <div id="avatar-success-state" class="hidden">
                            <div class="flex flex-col items-center py-6">
                                <div class="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                                <p class="mt-3 text-foreground font-medium text-sm">Avatar uploaded!</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center justify-end p-4 border-t border-border gap-3">
                        <button id="avatar-cancel-btn" class="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button id="avatar-upload-btn" class="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm rounded-lg transition-colors hidden">
                            Upload
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.classList.remove('hidden');
    }

    function _attachListeners() {
        // Close buttons
        document.getElementById('avatar-modal-close').addEventListener('click', close);
        document.getElementById('avatar-cancel-btn').addEventListener('click', close);
        document.getElementById('avatar-modal-backdrop').addEventListener('click', (e) => {
            if (e.target.id === 'avatar-modal-backdrop') close();
        });

        // File input
        const fileInput = document.getElementById('avatar-file-input');
        const dropZone = document.getElementById('avatar-drop-zone');

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                _handleFileSelect(e.target.files[0]);
            }
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-primary');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-primary');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-primary');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                _handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        // Upload button
        document.getElementById('avatar-upload-btn').addEventListener('click', _handleUpload);
    }

    function _handleFileSelect(file) {
        // Validate file size (2MB max)
        if (file.size > 2 * 1024 * 1024) {
            ToastService.showError('File too large - max 2MB');
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            ToastService.showError('Please select an image file');
            return;
        }

        // Revoke previous object URL if exists
        if (_objectUrl) {
            URL.revokeObjectURL(_objectUrl);
        }

        // Create object URL and show crop state
        _objectUrl = URL.createObjectURL(file);
        const cropImage = document.getElementById('avatar-crop-image');
        cropImage.src = _objectUrl;

        cropImage.onload = () => {
            // Switch to crop state
            document.getElementById('avatar-select-state').classList.add('hidden');
            document.getElementById('avatar-crop-state').classList.remove('hidden');
            document.getElementById('avatar-upload-btn').classList.remove('hidden');

            // Destroy previous cropper if exists
            if (_cropper) {
                _cropper.destroy();
            }

            // Initialize Cropper.js
            _cropper = new Cropper(cropImage, {
                aspectRatio: 1, // Square only
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 0.9,
                guides: true,
                center: true,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false
            });
        };
    }

    async function _handleUpload() {
        if (!_cropper) return;

        // Show progress state
        document.getElementById('avatar-crop-state').classList.add('hidden');
        document.getElementById('avatar-progress-state').classList.remove('hidden');
        document.getElementById('avatar-upload-btn').classList.add('hidden');
        document.getElementById('avatar-cancel-btn').classList.add('hidden');

        try {
            // Get cropped canvas
            const canvas = _cropper.getCroppedCanvas({
                width: 256, // Higher res for quality
                height: 256,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            // Convert to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png', 0.9);
            });

            // Upload via service
            await AvatarUploadService.uploadAvatar(_userId, blob, (progress) => {
                document.getElementById('avatar-progress-bar').style.width = `${progress}%`;
            });

            // Show success state
            document.getElementById('avatar-progress-state').classList.add('hidden');
            document.getElementById('avatar-success-state').classList.remove('hidden');

            // Callback with preview URL (actual URL comes from Cloud Function)
            if (_onSuccess) {
                _onSuccess(canvas.toDataURL('image/png'));
            }

            // Auto-close after 1.5s
            setTimeout(() => close(), 1500);

        } catch (error) {
            console.error('Avatar upload failed:', error);
            ToastService.showError('Upload failed - please try again');

            // Reset to crop state
            document.getElementById('avatar-progress-state').classList.add('hidden');
            document.getElementById('avatar-crop-state').classList.remove('hidden');
            document.getElementById('avatar-upload-btn').classList.remove('hidden');
            document.getElementById('avatar-cancel-btn').classList.remove('hidden');
        }
    }

    function close() {
        cleanup();
        // Use dedicated avatar-modal-container to avoid conflict with ProfileModal
        const container = document.getElementById('avatar-modal-container');
        if (container) {
            container.innerHTML = '';
            container.classList.add('hidden');
        }
    }

    function cleanup() {
        // Destroy cropper
        if (_cropper) {
            _cropper.destroy();
            _cropper = null;
        }

        // Revoke object URL
        if (_objectUrl) {
            URL.revokeObjectURL(_objectUrl);
            _objectUrl = null;
        }

        // Reset state
        _userId = null;
        _onSuccess = null;
    }

    return { show, close, cleanup };
})();
