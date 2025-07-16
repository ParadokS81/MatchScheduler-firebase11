// UserProfile Component - Top-left panel authentication UI
// Following PRD v2 Architecture with Revealing Module Pattern

const UserProfile = (function() {
    'use strict';
    
    // Private variables
    let _panel;
    let _currentUser = null;
    let _userProfile = null;
    let _authUnsubscribe = null;
    let _authServiceRetryCount = 0;
    
    // Initialize component
    function init(panelId) {
        _panel = document.getElementById(panelId);
        if (!_panel) {
            console.error('❌ UserProfile: Panel not found:', panelId);
            return;
        }
        
        // Initial render (will be overridden by auth state)
        _renderGuestMode();
        
        // Setup auth state listener
        _setupAuthListener();
        
        console.log('👤 UserProfile component initialized');
    }
    
    // Setup authentication state listener
    function _setupAuthListener() {
        // Wait for AuthService to be ready with retry limit
        if (typeof AuthService === 'undefined') {
            if (_authServiceRetryCount < 50) { // Max 5 seconds (50 * 100ms)
                _authServiceRetryCount++;
                console.log('⏳ Waiting for AuthService...');
                setTimeout(() => _setupAuthListener(), 100);
                return;
            } else {
                console.error('❌ AuthService failed to load after 5 seconds');
                return;
            }
        }
        
        // Reset retry counter on success
        _authServiceRetryCount = 0;
        
        console.log('🔗 Setting up auth listener...');
        _authUnsubscribe = AuthService.onAuthStateChange(async (user) => {
            console.log('🔄 Auth state changed:', user ? 'authenticated' : 'guest');
            _currentUser = user;
            
            if (user) {
                console.log('📧 User email:', user.email);
                console.log('👤 User displayName:', user.displayName);
                
                // Load user profile from database
                await _loadUserProfile(user.uid);
                
                console.log('🎨 Rendering authenticated mode...');
                _renderAuthenticatedMode();
            } else {
                console.log('🎨 Rendering guest mode...');
                _userProfile = null;
                _renderGuestMode();
            }
        });
    }
    
    // Load user profile from database
    async function _loadUserProfile(uid) {
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const db = window.firebase.db;
            
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
                _userProfile = userDoc.data();
                console.log('📊 User profile loaded:', _userProfile.displayName);
            } else {
                console.log('⚠️ User profile not found in database');
                _userProfile = null;
            }
        } catch (error) {
            console.error('❌ Error loading user profile:', error);
            _userProfile = null;
        }
    }
    
    // Render guest mode UI
    function _renderGuestMode() {
        console.log('🎨 Rendering guest mode UI...');
        _panel.innerHTML = `
            <div class="panel-content">
                <div class="flex items-center justify-center h-full">
                    <button 
                        id="google-signin-btn"
                        class="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-md transition-colors duration-200 flex items-center justify-center gap-2"
                        type="button"
                        style="background-color: #4285f4; color: white; border: 1px solid #4285f4;"
                    >
                        <svg class="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign In with Google
                    </button>
                </div>
            </div>
        `;
        
        console.log('🎨 Guest mode HTML rendered, attaching listeners...');
        _attachGuestEventListeners();
    }
    
    // Render authenticated mode UI
    function _renderAuthenticatedMode() {
        if (!_currentUser) return;
        
        console.log('🎨 Rendering authenticated mode...');
        console.log('📊 _userProfile:', _userProfile);
        console.log('👤 _currentUser.displayName:', _currentUser.displayName);
        const displayName = _userProfile?.displayName || _currentUser.displayName || 'User';
        console.log('🎯 Will display:', displayName);
        
        _panel.innerHTML = `
            <div class="panel-content">
                <div class="flex items-center justify-between h-full">
                    <p class="font-medium text-foreground text-lg">
                        ${displayName}
                    </p>
                    
                    <button 
                        id="edit-profile-btn"
                        class="bg-secondary hover:bg-secondary/90 text-secondary-foreground p-2 rounded-md transition-colors duration-200 flex items-center justify-center"
                        type="button"
                        title="Edit Profile"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        _attachAuthenticatedEventListeners();
    }
    
    // Attach event listeners for guest mode
    function _attachGuestEventListeners() {
        const signInBtn = _panel.querySelector('#google-signin-btn');
        console.log('🔍 Looking for sign-in button:', signInBtn ? 'found' : 'NOT FOUND');
        if (signInBtn) {
            signInBtn.addEventListener('click', _handleGoogleSignIn);
            console.log('✅ Sign-in button listener attached');
        } else {
            console.error('❌ Sign-in button not found in DOM');
        }
    }
    
    // Attach event listeners for authenticated mode
    function _attachAuthenticatedEventListeners() {
        const editProfileBtn = _panel.querySelector('#edit-profile-btn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', _handleEditProfile);
        }
    }
    
    // Handle Google sign-in
    async function _handleGoogleSignIn() {
        const btn = _panel.querySelector('#google-signin-btn');
        if (!btn) return;
        
        // Show loading state
        btn.disabled = true;
        btn.innerHTML = `
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
            <span>Signing in...</span>
        `;
        
        try {
            const result = await AuthService.signInWithGoogle();
            
            if (result.isNewUser) {
                // Show profile creation modal
                _showProfileCreationModal();
            }
            
        } catch (error) {
            console.error('❌ Sign-in failed:', error);
            _showError(error.message);
            
            // Reset button
            btn.disabled = false;
            btn.innerHTML = `
                <svg class="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign In with Google
            `;
        }
    }
    
    // Handle edit profile
    function _handleEditProfile() {
        console.log('✏️ Edit profile clicked');
        if (_currentUser && _userProfile) {
            ProfileModal.show(_currentUser, 'edit', _userProfile);
        } else {
            console.error('❌ Cannot edit profile - missing user or profile data');
        }
    }
    
    // Show profile creation modal
    function _showProfileCreationModal() {
        ProfileModal.show(_currentUser);
    }
    
    // Show error message
    function _showError(message) {
        console.error('❌ Error:', message);
        if (typeof ToastService !== 'undefined') {
            ToastService.showError(message);
        }
    }
    
    // Get user initials from name
    function _getUserInitials() {
        if (!_currentUser?.displayName) return '?';
        
        const names = _currentUser.displayName.split(' ');
        if (names.length === 1) {
            return names[0].charAt(0).toUpperCase();
        }
        return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
    }
    
    // Cleanup
    function cleanup() {
        if (_authUnsubscribe) {
            _authUnsubscribe();
            _authUnsubscribe = null;
        }
        _authServiceRetryCount = 0;
    }
    
    // Public API
    return {
        init,
        cleanup
    };
})();