// AuthService - Firebase v11 Authentication
// Following PRD v2 Architecture with Revealing Module Pattern

const AuthService = (function() {
    'use strict';

    // ============================================
    // DEV MODE CONFIGURATION
    // ============================================
    // Set to true to auto-sign-in on localhost using Auth emulator
    const DEV_MODE = true;

    // Dev user credentials for Auth emulator
    // MUST MATCH values in scripts/seed-emulator.js
    const DEV_PASSWORD = 'devmode123'; // Same password for all dev users

    const DEV_USERS = [
        { uid: 'dev-user-001', email: 'dev@matchscheduler.test', displayName: 'ParadokS', initials: 'PDX' },
        { uid: 'fake-user-001', email: 'alex@fake.test', displayName: 'Alex Storm', initials: 'AS' },
        { uid: 'fake-user-002', email: 'bella@fake.test', displayName: 'Bella Knight', initials: 'BK' },
        { uid: 'fake-user-003', email: 'carlos@fake.test', displayName: 'Carlos Vega', initials: 'CV' },
        { uid: 'fake-user-004', email: 'diana@fake.test', displayName: 'Diana Cross', initials: 'DC' },
        { uid: 'fake-user-005', email: 'erik@fake.test', displayName: 'Erik Blade', initials: 'EB' },
    ];

    // Default dev user (backwards compatible)
    const DEV_USER = DEV_USERS[0];
    DEV_USER.password = DEV_PASSWORD;
    // ============================================

    // Private variables
    let _initialized = false;
    let _currentUser = null;
    let _authListeners = [];
    let _auth = null;
    let _initRetryCount = 0;
    let _isDevMode = false;

    /**
     * Check if we should use dev mode (localhost + DEV_MODE enabled)
     */
    function _shouldUseDevMode() {
        if (!DEV_MODE) return false;
        const hostname = window.location.hostname;
        return hostname === 'localhost' ||
               hostname === '127.0.0.1' ||
               hostname.startsWith('192.168.') ||
               hostname.startsWith('172.') ||
               hostname.startsWith('100.');
    }

    /**
     * Auto sign-in to Auth emulator in dev mode
     * IMPORTANT: User must be pre-seeded via `npm run seed:emulator`
     * This ensures the UID matches the seeded Firestore data
     */
    async function _devModeAutoSignIn() {
        try {
            const { signInWithEmailAndPassword } =
                await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js');

            // Check if a specific user was previously selected
            const savedUid = localStorage.getItem('devSelectedUser');
            const targetUser = savedUid
                ? DEV_USERS.find(u => u.uid === savedUid) || DEV_USER
                : DEV_USER;

            // Sign in to pre-seeded user (created by seed-emulator.js with fixed UID)
            const result = await signInWithEmailAndPassword(_auth, targetUser.email, DEV_PASSWORD);
            console.log('🔧 DEV MODE: Signed in as', targetUser.displayName, '(UID:', result.user.uid, ')');

            // Verify UID matches expected value
            if (result.user.uid !== targetUser.uid) {
                console.warn('⚠️ DEV MODE: UID mismatch! Expected:', targetUser.uid, 'Got:', result.user.uid);
                console.warn('⚠️ Run `npm run seed:emulator` to re-seed with correct UID');
            }

            return;
        } catch (error) {
            console.error('❌ DEV MODE auto sign-in failed:', error);
            console.log('');
            console.log('ℹ️  To fix this, run: npm run seed:emulator');
            console.log('    This creates the dev user with the correct fixed UID');
            console.log('');
        }
    }

    // Initialize AuthService
    function init() {
        if (_initialized) return;

        _isDevMode = _shouldUseDevMode();

        // Wait for Firebase to be ready with retry limit
        if (typeof window.firebase === 'undefined') {
            if (_initRetryCount < 50) { // Max 5 seconds (50 * 100ms)
                _initRetryCount++;
                setTimeout(init, 100);
                return;
            } else {
                console.error('❌ Firebase failed to load after 5 seconds');
                return;
            }
        }

        // Reset retry counter on success
        _initRetryCount = 0;

        _auth = window.firebase.auth;
        _setupAuthStateListener();

        // Auto sign-in in dev mode after auth listener is set up
        if (_isDevMode) {
            console.log('🔧 DEV MODE ENABLED - Auto signing in to Auth emulator');
            _devModeAutoSignIn();
        }

        _initialized = true;
        console.log('🔐 AuthService initialized');
    }
    
    // Setup Firebase auth state listener
    async function _setupAuthStateListener() {
        try {
            const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js');
            
            // Listen for auth state changes
            onAuthStateChanged(_auth, (user) => {
                _currentUser = user;
                _notifyAuthListeners(user);
            });
        } catch (error) {
            console.error('❌ Failed to setup auth listener:', error);
        }
    }
    
    // Sign in with Google (or email in dev mode)
    async function signInWithGoogle() {
        // Dev mode - sign in with email/password to Auth emulator
        if (_isDevMode) {
            await _devModeAutoSignIn();

            // Wait for auth state to update
            await new Promise(resolve => setTimeout(resolve, 100));

            if (_currentUser) {
                // Check if user profile exists
                const hasProfile = await _checkUserProfile(_currentUser.uid);
                return {
                    user: _currentUser,
                    isNewUser: !hasProfile
                };
            }
            throw new Error('Dev mode sign-in failed');
        }

        try {
            const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js');

            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(_auth, provider);

            console.log('✅ Google sign-in successful:', result.user.email);

            // Check if user profile exists
            const hasProfile = await _checkUserProfile(result.user.uid);

            return {
                user: result.user,
                isNewUser: !hasProfile
            };

        } catch (error) {
            console.error('❌ Google sign-in failed:', error);
            throw new Error(_getAuthErrorMessage(error));
        }
    }

    // Sign out
    async function signOutUser() {
        try {
            const { signOut } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js');
            await signOut(_auth);
            console.log('👋 User signed out');

            // In dev mode, auto sign back in after a delay (unless switching users)
            if (_isDevMode && !_isSwitchingUser) {
                console.log('🔧 DEV MODE: Will auto sign-in again in 2 seconds...');
                setTimeout(_devModeAutoSignIn, 2000);
            }
        } catch (error) {
            console.error('❌ Sign out failed:', error);
            throw new Error('Failed to sign out');
        }
    }

    // Flag to prevent auto-signin during user switch
    let _isSwitchingUser = false;

    /**
     * Switch to a different dev user (DEV MODE ONLY)
     * @param {string} uid - The UID of the dev user to switch to
     */
    async function switchToDevUser(uid) {
        if (!_isDevMode) {
            console.warn('switchToDevUser only works in dev mode');
            return;
        }

        const targetUser = DEV_USERS.find(u => u.uid === uid);
        if (!targetUser) {
            console.error('Unknown dev user UID:', uid);
            return;
        }

        console.log(`🔄 Switching to dev user: ${targetUser.displayName}...`);
        _isSwitchingUser = true;

        try {
            const { signOut, signInWithEmailAndPassword } =
                await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js');

            // Sign out current user
            await signOut(_auth);

            // Sign in as new user
            const result = await signInWithEmailAndPassword(_auth, targetUser.email, DEV_PASSWORD);
            console.log(`✅ Switched to ${targetUser.displayName} (${result.user.uid})`);

            // Store selected user for page refresh persistence
            localStorage.setItem('devSelectedUser', uid);

            return result.user;
        } catch (error) {
            console.error('❌ Failed to switch user:', error);
            throw error;
        } finally {
            _isSwitchingUser = false;
        }
    }

    /**
     * Get list of available dev users (DEV MODE ONLY)
     */
    function getDevUsers() {
        if (!_isDevMode) return [];
        return DEV_USERS.map(u => ({ uid: u.uid, displayName: u.displayName, initials: u.initials }));
    }

    /**
     * Check if currently in dev mode
     */
    function isDevMode() {
        return _isDevMode;
    }
    
    // Check if user profile exists in Firestore
    async function _checkUserProfile(uid) {
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const db = window.firebase.db;
            
            const userDoc = await getDoc(doc(db, 'users', uid));
            return userDoc.exists();
        } catch (error) {
            console.error('❌ Error checking user profile:', error);
            return false;
        }
    }
    
    // Create user profile (to be called after profile modal)
    async function createProfile(profileData) {
        if (!_currentUser) {
            throw new Error('No authenticated user');
        }
        
        try {
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const functions = window.firebase.functions;
            
            const createProfileFunction = httpsCallable(functions, 'createProfile');
            const result = await createProfileFunction(profileData);
            
            console.log('✅ User profile created');
            return result.data.profile;
            
        } catch (error) {
            console.error('❌ Error creating user profile:', error);
            throw new Error(error.message || 'Failed to create user profile');
        }
    }
    
    // Update user profile
    async function updateProfile(profileData) {
        if (!_currentUser) {
            throw new Error('No authenticated user');
        }
        
        try {
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const functions = window.firebase.functions;
            
            const updateProfileFunction = httpsCallable(functions, 'updateProfile');
            const result = await updateProfileFunction(profileData);
            
            console.log('✅ User profile updated');
            
            // Show success toast
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Profile updated successfully!');
            }
            
            return result.data.updates;
            
        } catch (error) {
            console.error('❌ Error updating user profile:', error);
            throw new Error(error.message || 'Failed to update user profile');
        }
    }
    
    // Get current user
    function getCurrentUser() {
        return _currentUser;
    }
    
    // Check if user is authenticated
    function isAuthenticated() {
        return _currentUser !== null;
    }
    
    // Add auth state listener
    function onAuthStateChange(callback) {
        _authListeners.push(callback);
        // Call immediately with current state
        callback(_currentUser);
        
        // Return unsubscribe function
        return () => {
            const index = _authListeners.indexOf(callback);
            if (index > -1) {
                _authListeners.splice(index, 1);
            }
        };
    }
    
    // Notify all auth listeners
    function _notifyAuthListeners(user) {
        _authListeners.forEach(callback => {
            try {
                callback(user);
            } catch (error) {
                console.error('❌ Error in auth listener:', error);
            }
        });
    }
    
    // Get user-friendly error message
    function _getAuthErrorMessage(error) {
        switch (error.code) {
            case 'auth/popup-blocked':
                return 'Sign-in popup was blocked. Please allow popups for this site.';
            case 'auth/popup-closed-by-user':
                return 'Sign-in was cancelled. Please try again.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your connection and try again.';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Please try again later.';
            default:
                return 'Sign-in failed. Please try again.';
        }
    }
    
    // Public API
    return {
        init,
        signInWithGoogle,
        signOutUser,
        createProfile,
        updateProfile,
        getCurrentUser,
        isAuthenticated,
        onAuthStateChange,
        // Dev mode only
        isDevMode,
        getDevUsers,
        switchToDevUser
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', AuthService.init);