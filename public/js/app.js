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
        
        _setupEventListeners();
        _checkAuthState();
        _initialized = true;
        
        console.log('✅ MatchScheduler initialized successfully');
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
    
    // Check authentication state
    function _checkAuthState() {
        const { auth } = window.firebase;
        
        auth.onAuthStateChanged((user) => {
            if (user) {
                _currentUser = user;
                _loadUserData();
                console.log('👤 User authenticated:', user.email);
            } else {
                _currentUser = null;
                _showAuthUI();
                console.log('🔒 User not authenticated');
            }
        });
    }
    
    // Load user data
    function _loadUserData() {
        // TODO: Implement user data loading
        console.log('📊 Loading user data...');
    }
    
    // Show authentication UI
    function _showAuthUI() {
        // TODO: Implement authentication UI
        console.log('🔐 Showing authentication UI...');
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
    
    // Public API
    return {
        init: init,
        getCurrentUser: () => _currentUser,
        getSelectedTeam: () => _selectedTeam
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', MatchSchedulerApp.init);

// Initialize when Firebase is ready (fallback)
window.addEventListener('load', MatchSchedulerApp.init);