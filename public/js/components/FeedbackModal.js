/**
 * FeedbackModal.js
 * Modal for submitting bug reports, feature requests, and general feedback
 * Supports up to 3 screenshot uploads with drag-drop, paste, and file browse
 */
const FeedbackModal = (function() {
    const MAX_SCREENSHOTS = 3;
    let _screenshotFiles = [];
    let _objectUrls = [];

    function show() {
        _renderModal();
        _attachListeners();
    }

    function _renderModal() {
        const container = document.getElementById('feedback-modal-container');
        container.innerHTML = `
            <div class="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="feedback-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-xl font-bold text-primary">Give Feedback</h2>
                        <button id="feedback-modal-close" class="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
                    </div>

                    <div class="p-4">
                        <!-- Form State -->
                        <div id="feedback-form-state">
                            <!-- Category selector -->
                            <div class="mb-4">
                                <label class="text-sm font-medium text-foreground mb-2 block">Category</label>
                                <div class="flex gap-2">
                                    <label class="flex-1 cursor-pointer">
                                        <input type="radio" name="feedback-category" value="bug" class="sr-only peer">
                                        <div class="text-center py-2 px-3 rounded-md border border-border text-sm
                                                    peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary
                                                    hover:bg-muted/50 transition-colors">
                                            Bug Report
                                        </div>
                                    </label>
                                    <label class="flex-1 cursor-pointer">
                                        <input type="radio" name="feedback-category" value="feature" class="sr-only peer">
                                        <div class="text-center py-2 px-3 rounded-md border border-border text-sm
                                                    peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary
                                                    hover:bg-muted/50 transition-colors">
                                            Feature Request
                                        </div>
                                    </label>
                                    <label class="flex-1 cursor-pointer">
                                        <input type="radio" name="feedback-category" value="other" class="sr-only peer" checked>
                                        <div class="text-center py-2 px-3 rounded-md border border-border text-sm
                                                    peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary
                                                    hover:bg-muted/50 transition-colors">
                                            Other
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <!-- Message textarea -->
                            <div class="mb-4">
                                <label class="text-sm font-medium text-foreground mb-2 block">Message</label>
                                <textarea id="feedback-message" rows="4" maxlength="2000"
                                    class="w-full rounded-md border border-border bg-background text-foreground p-3 text-sm
                                           placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                                    placeholder="Describe the bug, feature idea, or feedback..."></textarea>
                                <div class="text-xs text-muted-foreground mt-1 text-right">
                                    <span id="feedback-char-count">0</span>/2000
                                </div>
                            </div>

                            <!-- Screenshot drop zone -->
                            <div class="mb-2">
                                <label class="text-sm font-medium text-foreground mb-2 block">Screenshots <span class="text-muted-foreground font-normal">(optional, up to 3)</span></label>
                                <input type="file" id="feedback-file-input" accept="image/*" class="hidden">
                                <div id="feedback-drop-zone" class="w-full py-4 border-2 border-dashed border-border rounded-lg
                                     hover:border-primary transition-colors cursor-pointer">
                                    <div class="flex flex-col items-center pointer-events-none">
                                        <svg class="w-6 h-6 text-muted-foreground mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                        </svg>
                                        <span class="text-muted-foreground text-xs">Drop, paste, or click to browse</span>
                                    </div>
                                </div>
                                <!-- Previews row -->
                                <div id="feedback-screenshot-previews" class="flex gap-2 mt-2 flex-wrap"></div>
                            </div>
                        </div>

                        <!-- Progress State -->
                        <div id="feedback-progress-state" class="hidden">
                            <div class="flex flex-col items-center py-6">
                                <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <p id="feedback-progress-text" class="mt-3 text-muted-foreground text-sm">Submitting...</p>
                                <div class="w-full bg-muted rounded-full h-1.5 mt-3">
                                    <div id="feedback-progress-bar" class="bg-primary h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Success State -->
                        <div id="feedback-success-state" class="hidden">
                            <div class="flex flex-col items-center py-6">
                                <div class="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                                <p class="mt-3 text-foreground font-medium text-sm">Thank you for your feedback!</p>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div id="feedback-footer" class="flex items-center justify-end p-4 border-t border-border gap-3">
                        <button id="feedback-cancel-btn"
                                class="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button id="feedback-submit-btn"
                                class="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm rounded-lg transition-colors">
                            Submit
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.classList.remove('hidden');
    }

    function _attachListeners() {
        // Close buttons
        document.getElementById('feedback-modal-close').addEventListener('click', close);
        document.getElementById('feedback-cancel-btn').addEventListener('click', close);
        document.getElementById('feedback-modal-backdrop').addEventListener('click', (e) => {
            if (e.target.id === 'feedback-modal-backdrop') close();
        });
        document.addEventListener('keydown', _handleEscape);

        // File input & drop zone
        const fileInput = document.getElementById('feedback-file-input');
        const dropZone = document.getElementById('feedback-drop-zone');

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) _handleFileSelect(e.target.files[0]);
            fileInput.value = '';
        });

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

        // Character count
        const textarea = document.getElementById('feedback-message');
        textarea.addEventListener('input', () => {
            document.getElementById('feedback-char-count').textContent = textarea.value.length;
        });

        // Clipboard paste for screenshots
        document.addEventListener('paste', _handlePaste);

        // Submit
        document.getElementById('feedback-submit-btn').addEventListener('click', _handleSubmit);
    }

    function _handleEscape(e) {
        if (e.key === 'Escape') close();
    }

    function _handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) _handleFileSelect(file);
                return;
            }
        }
    }

    function _handleFileSelect(file) {
        if (_screenshotFiles.length >= MAX_SCREENSHOTS) {
            ToastService.showError(`Maximum ${MAX_SCREENSHOTS} screenshots`);
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            ToastService.showError('File too large - max 5MB');
            return;
        }
        if (!file.type.startsWith('image/')) {
            ToastService.showError('Please select an image file');
            return;
        }

        const url = URL.createObjectURL(file);
        _screenshotFiles.push(file);
        _objectUrls.push(url);
        _renderPreviews();
    }

    function _removeScreenshot(index) {
        URL.revokeObjectURL(_objectUrls[index]);
        _screenshotFiles.splice(index, 1);
        _objectUrls.splice(index, 1);
        _renderPreviews();
    }

    function _renderPreviews() {
        const container = document.getElementById('feedback-screenshot-previews');
        const dropZone = document.getElementById('feedback-drop-zone');

        // Show/hide drop zone based on count
        if (_screenshotFiles.length >= MAX_SCREENSHOTS) {
            dropZone.classList.add('hidden');
        } else {
            dropZone.classList.remove('hidden');
        }

        // Render thumbnail grid
        container.innerHTML = _objectUrls.map((url, i) => `
            <div class="relative inline-block">
                <img src="${url}" class="h-20 rounded border border-border object-cover">
                <button data-remove-idx="${i}"
                        class="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5
                               flex items-center justify-center text-xs hover:bg-black/80 cursor-pointer">&times;</button>
            </div>
        `).join('');

        // Attach remove handlers
        container.querySelectorAll('[data-remove-idx]').forEach(btn => {
            btn.addEventListener('click', () => {
                _removeScreenshot(parseInt(btn.dataset.removeIdx));
            });
        });
    }

    async function _handleSubmit() {
        const category = document.querySelector('input[name="feedback-category"]:checked')?.value;
        const message = document.getElementById('feedback-message').value.trim();

        if (!message) {
            ToastService.showError('Please enter a message');
            return;
        }

        // Transition to progress state
        document.getElementById('feedback-form-state').classList.add('hidden');
        document.getElementById('feedback-footer').classList.add('hidden');
        document.getElementById('feedback-progress-state').classList.remove('hidden');

        try {
            const screenshotUrls = [];

            // Upload screenshots sequentially
            if (_screenshotFiles.length > 0) {
                const userId = window.firebase.auth.currentUser.uid;
                const total = _screenshotFiles.length;

                for (let i = 0; i < total; i++) {
                    document.getElementById('feedback-progress-text').textContent =
                        `Compressing screenshot ${i + 1}/${total}...`;
                    const compressedBlob = await FeedbackUploadService.compressImage(_screenshotFiles[i]);

                    document.getElementById('feedback-progress-text').textContent =
                        `Uploading screenshot ${i + 1}/${total}...`;
                    const url = await FeedbackUploadService.uploadScreenshot(
                        userId,
                        compressedBlob,
                        (progress) => {
                            const overall = ((i + progress / 100) / total) * 100;
                            document.getElementById('feedback-progress-bar').style.width = `${overall}%`;
                        }
                    );
                    screenshotUrls.push(url);
                }
            }

            // Submit feedback
            document.getElementById('feedback-progress-text').textContent = 'Submitting feedback...';
            document.getElementById('feedback-progress-bar').style.width = '100%';

            const result = await FeedbackUploadService.submitFeedback({
                category: category || 'other',
                message,
                screenshotUrls,
                currentUrl: window.location.href,
                browserInfo: navigator.userAgent
            });

            if (result.success) {
                document.getElementById('feedback-progress-state').classList.add('hidden');
                document.getElementById('feedback-success-state').classList.remove('hidden');
                setTimeout(() => close(), 1500);
            } else {
                throw new Error(result.error || 'Failed to submit feedback');
            }
        } catch (error) {
            console.error('Feedback submission failed:', error);
            ToastService.showError('Failed to submit - please try again');

            // Reset to form state
            document.getElementById('feedback-progress-state').classList.add('hidden');
            document.getElementById('feedback-form-state').classList.remove('hidden');
            document.getElementById('feedback-footer').classList.remove('hidden');
        }
    }

    function close() {
        document.removeEventListener('keydown', _handleEscape);
        document.removeEventListener('paste', _handlePaste);
        _objectUrls.forEach(url => URL.revokeObjectURL(url));
        _objectUrls = [];
        _screenshotFiles = [];
        const container = document.getElementById('feedback-modal-container');
        if (container) {
            container.innerHTML = '';
            container.classList.add('hidden');
        }
    }

    return { show, close };
})();
