// MatchScheduler Application Entry Point
// Following PRD v2 Architecture with Revealing Module Pattern

const MatchSchedulerApp = (function() {
    'use strict';
    
    // Private variables
    let _initialized = false;
    let _currentUser = null;
    let _selectedTeam = null;
    
    // Initialize application
    function init() {
        if (_initialized) return;
        
        console.log('🚀 MatchScheduler v3.0 - Initializing...');
        
        // Wait for Firebase to be ready
        if (typeof window.firebase === 'undefined') {
            setTimeout(init, 100);
            return;
        }
        
        _initializeComponents();
        _setupEventListeners();
        _initialized = true;
        
        console.log('✅ MatchScheduler initialized successfully');
    }
    
    // Initialize components
    function _initializeComponents() {
        // Initialize UserProfile component in top-left panel
        UserProfile.init('panel-top-left');
        
        // Initialize ToastService for notifications
        ToastService.init();
        
        console.log('🧩 Components initialized');
    }
    
    // Setup event listeners
    function _setupEventListeners() {
        // Settings button
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', _handleSettingsClick);
        }
        
        // Save button
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', _handleSaveClick);
        }
    }
    
    
    // Event handlers
    function _handleSettingsClick() {
        console.log('⚙️ Settings clicked');
        // TODO: Implement settings modal
    }
    
    function _handleSaveClick() {
        console.log('💾 Save clicked');
        // TODO: Implement save functionality
    }
    
    // Cleanup function
    function cleanup() {
        if (typeof UserProfile !== 'undefined') {
            UserProfile.cleanup();
        }
    }
    
    // Public API
    return {
        init: init,
        cleanup: cleanup,
        getCurrentUser: () => _currentUser,
        getSelectedTeam: () => _selectedTeam
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', MatchSchedulerApp.init);

// Initialize when Firebase is ready (fallback)
window.addEventListener('load', MatchSchedulerApp.init);

// Cleanup when page unloads
window.addEventListener('beforeunload', MatchSchedulerApp.cleanup);