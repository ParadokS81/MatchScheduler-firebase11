// ConfirmationModal Service - Generic confirmation dialogs
// Following the same theme as OnboardingModal

const ConfirmationModal = (function() {
    'use strict';
    
    // Private variables
    let _isVisible = false;
    let _resolveCallback = null;
    let _keydownHandler = null;
    
    // Show confirmation modal
    function show({
        title = 'Confirm Action',
        message = 'Are you sure you want to proceed?',
        confirmText = 'Confirm',
        confirmClass = 'bg-primary hover:bg-primary/90',
        cancelText = 'Cancel'
    }) {
        return new Promise((resolve) => {
            if (_isVisible) {
                resolve(false);
                return;
            }
            
            _isVisible = true;
            _resolveCallback = resolve;
            
            _renderModal({
                title,
                message,
                confirmText,
                confirmClass,
                cancelText
            });
            _attachEventListeners();
            _focusConfirmButton();
        });
    }
    
    // Hide modal
    function hide(result = false) {
        if (!_isVisible) return;
        
        _isVisible = false;
        
        // Clean up event listeners
        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.classList.add('hidden');
        modalContainer.innerHTML = '';
        
        // Resolve the promise
        if (_resolveCallback) {
            _resolveCallback(result);
            _resolveCallback = null;
        }
    }
    
    // Render modal content
    function _renderModal({ title, message, confirmText, confirmClass, cancelText }) {
        const modalContainer = document.getElementById('modal-container');
        
        const modalHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-md">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-slate-700">
                        <h2 class="text-xl font-bold text-sky-400">${title}</h2>
                        <button id="confirmation-close-btn" class="text-slate-400 hover:text-white">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    
                    <!-- Body -->
                    <div class="p-6">
                        <div class="space-y-4">
                            <!-- Message -->
                            <div class="text-center">
                                <div class="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                                    <svg class="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                                    </svg>
                                </div>
                                <p class="text-foreground text-sm leading-relaxed">${message}</p>
                            </div>
                            
                            <!-- Actions -->
                            <div class="flex gap-3 pt-2">
                                <button 
                                    id="confirmation-confirm-btn"
                                    class="flex-1 px-4 py-2 ${confirmClass} text-white font-medium rounded-md transition-colors"
                                >
                                    ${confirmText}
                                </button>
                                <button 
                                    id="confirmation-cancel-btn"
                                    class="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium rounded-md transition-colors"
                                >
                                    ${cancelText}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        modalContainer.innerHTML = modalHTML;
        modalContainer.classList.remove('hidden');
    }
    
    // Attach event listeners
    function _attachEventListeners() {
        const confirmBtn = document.getElementById('confirmation-confirm-btn');
        const cancelBtn = document.getElementById('confirmation-cancel-btn');
        const closeBtn = document.getElementById('confirmation-close-btn');
        const modalContainer = document.getElementById('modal-container');
        
        // Button clicks
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => hide(true));
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => hide(false));
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => hide(false));
        }
        
        // Close on backdrop click
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                hide(false);
            }
        });
        
        // Close on escape key
        _keydownHandler = _handleKeyDown;
        document.addEventListener('keydown', _keydownHandler);
    }
    
    // Handle keyboard events
    function _handleKeyDown(e) {
        if (e.key === 'Escape') {
            hide(false);
        } else if (e.key === 'Enter') {
            hide(true);
        }
    }
    
    // Focus confirm button
    function _focusConfirmButton() {
        setTimeout(() => {
            const confirmBtn = document.getElementById('confirmation-confirm-btn');
            if (confirmBtn) {
                confirmBtn.focus();
            }
        }, 100);
    }
    
    // Public API
    return {
        show
    };
})();

// Make globally available
window.showConfirmModal = ConfirmationModal.show;