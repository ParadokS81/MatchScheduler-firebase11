// AuthService - Firebase v11 Authentication
// Following PRD v2 Architecture with Revealing Module Pattern

const AuthService = (function() {
    'use strict';
    
    // Private variables
    let _initialized = false;
    let _currentUser = null;
    let _authListeners = [];
    let _auth = null;
    let _initRetryCount = 0;
    
    // Initialize AuthService
    function init() {
        if (_initialized) return;
        
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
    
    // Sign in with Google
    async function signInWithGoogle() {
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
        } catch (error) {
            console.error('❌ Sign out failed:', error);
            throw new Error('Failed to sign out');
        }
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
        onAuthStateChange
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', AuthService.init);