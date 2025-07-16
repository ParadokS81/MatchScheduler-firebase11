// ToastService - Simple toast notification system
// Following PRD v2 Architecture with Revealing Module Pattern

const ToastService = (function() {
    'use strict';
    
    // Private variables
    let _container = null;
    let _toastCounter = 0;
    let _initialized = false;
    
    // Initialize toast service
    function init() {
        if (_initialized) return;
        
        _container = document.getElementById('toast-container');
        if (!_container) {
            console.error('❌ ToastService: Container not found');
            return;
        }
        
        _initialized = true;
        console.log('🍞 ToastService initialized');
    }
    
    // Show success toast (green)
    function showSuccess(message, duration = 3000) {
        return _showToast(message, 'success', duration);
    }
    
    // Show error toast (red)
    function showError(message, duration = 7000) {
        return _showToast(message, 'error', duration);
    }
    
    // Show warning toast (yellow)
    function showWarning(message, duration = 5000) {
        return _showToast(message, 'warning', duration);
    }
    
    // Show info toast (blue)
    function showInfo(message, duration = 4000) {
        return _showToast(message, 'info', duration);
    }
    
    // Show persistent toast (no auto-dismiss)
    function showPersistent(message, type = 'warning') {
        return _showToast(message, type, 0);
    }
    
    // Create and show toast
    function _showToast(message, type, duration) {
        if (!_container) {
            console.error('❌ ToastService not initialized');
            return;
        }
        
        const toastId = `toast-${++_toastCounter}`;
        
        // Create toast element
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast-notification ${_getToastClasses(type)}`;
        toast.innerHTML = `
            <div class="flex items-center gap-2">
                ${_getToastIcon(type)}
                <span class="text-sm font-medium">${message}</span>
                <button class="ml-auto text-current opacity-70 hover:opacity-100 transition-opacity" onclick="ToastService.hide('${toastId}')">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        // Add to container
        _container.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.classList.add('toast-show');
        }, 10);
        
        // Auto-dismiss if duration is set
        if (duration > 0) {
            setTimeout(() => {
                hide(toastId);
            }, duration);
        }
        
        return toastId;
    }
    
    // Hide specific toast
    function hide(toastId) {
        const toast = document.getElementById(toastId);
        if (!toast) return;
        
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
    
    // Hide all toasts
    function hideAll() {
        if (!_container) return;
        
        const toasts = _container.querySelectorAll('.toast-notification');
        toasts.forEach(toast => {
            hide(toast.id);
        });
    }
    
    // Get toast CSS classes by type
    function _getToastClasses(type) {
        const baseClasses = 'toast-base';
        
        switch (type) {
            case 'success':
                return `${baseClasses} toast-success`;
            case 'error':
                return `${baseClasses} toast-error`;
            case 'warning':
                return `${baseClasses} toast-warning`;
            case 'info':
                return `${baseClasses} toast-info`;
            default:
                return `${baseClasses} toast-info`;
        }
    }
    
    // Get toast icon by type
    function _getToastIcon(type) {
        switch (type) {
            case 'success':
                return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>`;
            case 'error':
                return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>`;
            case 'warning':
                return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                </svg>`;
            case 'info':
                return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>`;
            default:
                return '';
        }
    }
    
    // Public API
    return {
        init,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        showPersistent,
        hide,
        hideAll
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', ToastService.init);