/**
 * LogoUploadModal - Modal for uploading and cropping team logos
 *
 * Pattern: Revealing module pattern (transient modal, no Firebase listeners needed)
 * Dependencies: Cropper.js, LogoUploadService, ToastService
 */
const LogoUploadModal = (function() {
    let _modalElement = null;
    let _cropper = null;
    let _teamId = null;
    let _userId = null;
    let _objectUrl = null;

    /**
     * Show the logo upload modal
     * @param {string} teamId - The team ID
     * @param {string} userId - The current user's ID
     */
    function show(teamId, userId) {
        _teamId = teamId;
        _userId = userId;
        _renderModal();
        _attachListeners();
    }

    function _renderModal() {
        const container = document.getElementById('modal-container');
        container.innerHTML = `
            <div class="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm" id="logo-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg">
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-xl font-bold text-primary">Upload Team Logo</h2>
                        <button id="logo-modal-close" class="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
                    </div>
                    <div class="p-4">
                        <!-- File Selection State -->
                        <div id="logo-select-state">
                            <input type="file" id="logo-file-input" accept="image/*" class="hidden">
                            <div id="logo-drop-zone" class="w-full py-8 border-2 border-dashed border-border rounded-lg hover:border-primary transition-colors cursor-pointer">
                                <div class="flex flex-col items-center pointer-events-none">
                                    <svg class="w-10 h-10 text-muted-foreground mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                    </svg>
                                    <span class="text-muted-foreground">Drop image here or click to browse</span>
                                    <span class="text-sm text-muted-foreground mt-1">Max 5MB, JPG/PNG/WebP</span>
                                </div>
                            </div>
                        </div>

                        <!-- Crop State -->
                        <div id="logo-crop-state" class="hidden">
                            <div class="w-full aspect-square bg-muted rounded-lg overflow-hidden">
                                <img id="logo-crop-image" class="max-w-full">
                            </div>
                            <p class="text-sm text-muted-foreground mt-2 text-center">Drag to adjust crop area</p>
                        </div>

                        <!-- Upload Progress State -->
                        <div id="logo-progress-state" class="hidden">
                            <div class="flex flex-col items-center py-8">
                                <div class="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <p class="mt-4 text-muted-foreground">Uploading...</p>
                                <div class="w-full bg-muted rounded-full h-2 mt-4">
                                    <div id="logo-progress-bar" class="bg-primary h-2 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Success State -->
                        <div id="logo-success-state" class="hidden">
                            <div class="flex flex-col items-center py-8">
                                <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                                <p class="mt-4 text-foreground font-medium">Logo uploaded successfully!</p>
                                <p class="text-sm text-muted-foreground mt-1">Processing may take a moment...</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center justify-end p-4 border-t border-border gap-3">
                        <button id="logo-cancel-btn" class="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button id="logo-upload-btn" class="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg transition-colors hidden">
                            Upload Logo
                        </button>
                    </div>
                </div>
            </div>
        `;
        _modalElement = container.firstElementChild;
        container.classList.remove('hidden');
    }

    function _attachListeners() {
        // Close button
        document.getElementById('logo-modal-close').addEventListener('click', close);

        // Cancel button
        document.getElementById('logo-cancel-btn').addEventListener('click', close);

        // Backdrop click to close
        document.getElementById('logo-modal-backdrop').addEventListener('click', (e) => {
            if (e.target.id === 'logo-modal-backdrop') {
                close();
            }
        });

        // File select via click
        const dropZone = document.getElementById('logo-drop-zone');
        dropZone.addEventListener('click', () => {
            document.getElementById('logo-file-input').click();
        });

        // File input change
        document.getElementById('logo-file-input').addEventListener('change', _handleFileSelect);

        // Drag and drop support
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('border-primary', 'bg-primary/10');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('border-primary', 'bg-primary/10');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('border-primary', 'bg-primary/10');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                _processFile(files[0]);
            }
        });

        // Upload button
        document.getElementById('logo-upload-btn').addEventListener('click', _handleUpload);
    }

    function _handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            _processFile(file);
        }
    }

    function _processFile(file) {
        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            ToastService.showError('Image must be under 5MB');
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            ToastService.showError('Please select an image file');
            return;
        }

        // Show crop state
        document.getElementById('logo-select-state').classList.add('hidden');
        document.getElementById('logo-crop-state').classList.remove('hidden');
        document.getElementById('logo-upload-btn').classList.remove('hidden');

        // Create object URL and initialize Cropper.js
        const image = document.getElementById('logo-crop-image');

        // Revoke any previous object URL
        if (_objectUrl) {
            URL.revokeObjectURL(_objectUrl);
        }
        _objectUrl = URL.createObjectURL(file);
        image.src = _objectUrl;

        image.onload = () => {
            if (_cropper) _cropper.destroy();
            _cropper = new Cropper(image, {
                aspectRatio: 1, // Square only
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 0.9,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false
            });
        };
    }

    async function _handleUpload() {
        if (!_cropper) return;

        // Show progress state
        document.getElementById('logo-crop-state').classList.add('hidden');
        document.getElementById('logo-progress-state').classList.remove('hidden');
        document.getElementById('logo-upload-btn').classList.add('hidden');
        document.getElementById('logo-cancel-btn').classList.add('hidden');

        try {
            // Get cropped canvas and convert to blob
            const canvas = _cropper.getCroppedCanvas({
                width: 400,  // Output size
                height: 400,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png', 0.9);
            });

            // Upload
            await LogoUploadService.uploadLogo(_teamId, _userId, blob, (progress) => {
                document.getElementById('logo-progress-bar').style.width = `${progress}%`;
            });

            // Show success
            document.getElementById('logo-progress-state').classList.add('hidden');
            document.getElementById('logo-success-state').classList.remove('hidden');

            ToastService.showSuccess('Logo uploaded! Processing...');

            // Auto-close after delay
            setTimeout(() => close(), 2000);

        } catch (error) {
            console.error('Logo upload failed:', error);
            ToastService.showError('Upload failed - please try again');

            // Reset to crop state
            document.getElementById('logo-progress-state').classList.add('hidden');
            document.getElementById('logo-crop-state').classList.remove('hidden');
            document.getElementById('logo-upload-btn').classList.remove('hidden');
            document.getElementById('logo-cancel-btn').classList.remove('hidden');
        }
    }

    function close() {
        cleanup();
        const container = document.getElementById('modal-container');
        container.innerHTML = '';
        container.classList.add('hidden');
    }

    function cleanup() {
        // Destroy Cropper instance
        if (_cropper) {
            _cropper.destroy();
            _cropper = null;
        }

        // Revoke object URL to prevent memory leak
        if (_objectUrl) {
            URL.revokeObjectURL(_objectUrl);
            _objectUrl = null;
        }

        _modalElement = null;
        _teamId = null;
        _userId = null;
    }

    return { show, close, cleanup };
})();
