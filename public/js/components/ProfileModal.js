// ProfileModal Component - First-time user profile creation
// Following PRD v2 Architecture with Revealing Module Pattern

const ProfileModal = (function() {
    'use strict';
    
    // Private variables
    let _isVisible = false;
    let _currentUser = null;
    let _userProfile = null;
    let _mode = 'create';
    let _keydownHandler = null;
    
    // Show profile modal (create or edit mode)
    function show(user, mode = 'create', userProfile = null) {
        if (_isVisible) return;
        
        _currentUser = user;
        _userProfile = userProfile;
        _mode = mode;
        _isVisible = true;
        
        const modalHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-md">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-slate-700">
                        <h2 class="text-xl font-bold text-sky-400">${_mode === 'create' ? 'Complete Your Profile' : 'Edit Profile'}</h2>
                        <div class="w-6 h-6"></div> <!-- Spacer to center title -->
                    </div>
                    
                    <!-- Body -->
                    <div class="p-4">
                        <div class="space-y-4">
                            <!-- Welcome Message -->
                            <div class="text-center">
                                <div class="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-3">
                                    ${user.photoURL ? 
                                        `<img src="${user.photoURL}" alt="Profile" class="w-full h-full rounded-full object-cover">` :
                                        `<svg class="w-8 h-8 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                        </svg>`
                                    }
                                </div>
                                <p class="text-sm text-muted-foreground">
                                    ${_mode === 'create' ? 'Welcome to MatchScheduler! Let\'s set up your gaming profile.' : 'Update your profile information below.'}
                                </p>
                            </div>
                            
                            <!-- Profile Form -->
                            <form id="profile-form" class="space-y-4">
                                <!-- Player Nick -->
                                <div>
                                    <label for="displayName" class="block text-sm font-medium text-foreground mb-1">
                                        Player Nick
                                    </label>
                                    <input 
                                        type="text" 
                                        id="displayName" 
                                        name="displayName"
                                        value="${_userProfile?.displayName || user.displayName || ''}"
                                        placeholder="Enter your gaming name"
                                        class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                        required
                                        minlength="2"
                                        maxlength="30"
                                    >
                                    <p class="text-xs text-muted-foreground mt-1">
                                        This will be shown to your teammates
                                    </p>
                                </div>
                                
                                <!-- Initials -->
                                <div>
                                    <label for="initials" class="block text-sm font-medium text-foreground mb-1">
                                        Initials (3 characters)
                                    </label>
                                    <input 
                                        type="text" 
                                        id="initials" 
                                        name="initials"
                                        value="${_userProfile?.initials || ''}"
                                        placeholder="ABC"
                                        class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary uppercase"
                                        required
                                        minlength="3"
                                        maxlength="3"
                                        pattern="[A-Z]{3}"
                                        style="text-transform: uppercase;"
                                    >
                                    <p class="text-xs text-muted-foreground mt-1">
                                        Used in availability grids (must be unique per team)
                                    </p>
                                </div>
                                
                                <!-- Error Display -->
                                <div id="profile-error" class="hidden bg-red-900/50 border border-red-600 rounded-md p-3">
                                    <div class="flex items-center gap-2">
                                        <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        <span class="text-red-400 text-sm" id="profile-error-text"></span>
                                    </div>
                                </div>
                                
                                <!-- Discord Account Section -->
                                <div class="border-t border-border pt-4">
                                    <h4 class="text-sm font-medium text-foreground mb-3">Discord Account (Optional)</h4>
                                    <div class="space-y-3">
                                        <!-- Discord Username -->
                                        <div>
                                            <label for="discordUsername" class="block text-sm font-medium text-foreground mb-1">
                                                Discord Username
                                            </label>
                                            <input 
                                                type="text" 
                                                id="discordUsername" 
                                                name="discordUsername"
                                                value="${_userProfile?.discordUsername || ''}"
                                                placeholder="Username#1234"
                                                class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                                maxlength="50"
                                            >
                                            <p class="text-xs text-muted-foreground mt-1">
                                                Your Discord username with tag (e.g., Player#1234)
                                            </p>
                                        </div>
                                        
                                        <!-- Discord User ID -->
                                        <div>
                                            <label for="discordUserId" class="block text-sm font-medium text-foreground mb-1">
                                                Discord User ID
                                            </label>
                                            <input 
                                                type="text" 
                                                id="discordUserId" 
                                                name="discordUserId"
                                                value="${_userProfile?.discordUserId || ''}"
                                                placeholder="123456789012345678"
                                                class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                                pattern="[0-9]*"
                                                maxlength="20"
                                            >
                                            <p class="text-xs text-muted-foreground mt-1">
                                                Your Discord user ID (18-digit number)
                                            </p>
                                        </div>
                                        
                                        <!-- Helper Info -->
                                        <div class="bg-muted rounded-md p-3">
                                            <div class="flex items-center gap-2 mb-2">
                                                <svg class="w-4 h-4 text-[#5865F2]" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 2.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.010c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.188.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-2.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                                                </svg>
                                                <span class="text-sm font-medium text-foreground">How to find your Discord ID:</span>
                                            </div>
                                            <ol class="text-xs text-muted-foreground space-y-1">
                                                <li>1. Open Discord and go to User Settings</li>
                                                <li>2. Go to Advanced → Enable Developer Mode</li>
                                                <li>3. Right-click your username → Copy User ID</li>
                                            </ol>
                                            ${_mode === 'edit' && _userProfile?.discordUserId ? `
                                            <div class="mt-2 pt-2 border-t border-border">
                                                <button 
                                                    type="button" 
                                                    id="discord-clear-btn"
                                                    class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    Clear Discord Info
                                                </button>
                                            </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            </form>
                            
                            <!-- Gaming Context Info -->
                            ${_mode === 'create' ? `
                            <div class="bg-muted rounded-md p-3">
                                <h4 class="text-sm font-medium text-foreground mb-2">Next Steps:</h4>
                                <ul class="text-xs text-muted-foreground space-y-1">
                                    <li>• Join your team with a join code</li>
                                    <li>• Create a new team for tournaments</li>
                                    <li>• Set your availability for matches</li>
                                    <li>• Schedule matches with opponents</li>
                                </ul>
                            </div>` : ''}
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div class="flex items-center justify-end p-4 border-t border-slate-700 gap-3">
                        <button 
                            type="button" 
                            id="profile-cancel-btn"
                            class="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            id="profile-save-btn"
                            form="profile-form"
                            class="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors"
                        >
                            ${_mode === 'create' ? 'Create Profile' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = modalHTML;
        modalContainer.classList.remove('hidden');
        
        _attachEventListeners();
        _focusFirstInput();
    }
    
    // Hide modal
    function hide() {
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
    }
    
    // Attach event listeners
    function _attachEventListeners() {
        const form = document.getElementById('profile-form');
        const cancelBtn = document.getElementById('profile-cancel-btn');
        const initialsInput = document.getElementById('initials');
        const discordClearBtn = document.getElementById('discord-clear-btn');
        
        if (form) {
            form.addEventListener('submit', _handleSubmit);
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', _handleCancel);
        }
        
        if (initialsInput) {
            initialsInput.addEventListener('input', _handleInitialsInput);
        }
        
        if (discordClearBtn) {
            discordClearBtn.addEventListener('click', _handleDiscordClear);
        }
        
        // Close on backdrop click
        const modalContainer = document.getElementById('modal-container');
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                _handleCancel();
            }
        });
        
        // Close on escape key
        _keydownHandler = _handleKeyDown;
        document.addEventListener('keydown', _keydownHandler);
    }
    
    // Handle form submission
    async function _handleSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const displayName = formData.get('displayName').trim();
        const initials = formData.get('initials').trim().toUpperCase();
        const discordUsername = formData.get('discordUsername').trim();
        const discordUserId = formData.get('discordUserId').trim();
        
        // Validate input
        if (!_validateInput(displayName, initials, discordUsername, discordUserId)) {
            return;
        }
        
        const saveBtn = document.getElementById('profile-save-btn');
        
        // Show loading state
        _setButtonLoading(saveBtn, true);
        _hideError();
        
        try {
            // Check if AuthService is available
            if (typeof AuthService === 'undefined') {
                throw new Error('Authentication service not available');
            }
            
            const profileData = {
                displayName,
                initials
            };
            
            // Add Discord data if provided
            if (discordUsername || discordUserId) {
                profileData.discordUsername = discordUsername;
                profileData.discordUserId = discordUserId;
            }
            
            if (_mode === 'create') {
                await AuthService.createProfile(profileData);
                console.log('✅ Profile created successfully');
            } else {
                await AuthService.updateProfile(profileData);
                console.log('✅ Profile updated successfully');
            }
            
            hide();
            
            // Emit profile creation event for coordination
            if (_mode === 'create') {
                // Use simple event coordination as per architecture
                window.dispatchEvent(new CustomEvent('profile-created', {
                    detail: { user: _currentUser, profileData }
                }));
            }
            
        } catch (error) {
            console.error(`❌ Profile ${_mode === 'create' ? 'creation' : 'update'} failed:`, error);
            _showError(error.message);
            _setButtonLoading(saveBtn, false);
        }
    }
    
    // Handle cancel
    function _handleCancel() {
        // Don't sign out user when canceling profile creation - let them stay signed in
        // They can create their profile later when they want to join/create a team
        console.log('📋 Profile creation cancelled - user remains signed in');
        hide();
    }
    
    // Handle initials input (force uppercase)
    function _handleInitialsInput(e) {
        e.target.value = e.target.value.toUpperCase();
    }
    
    // Handle keyboard events
    function _handleKeyDown(e) {
        if (e.key === 'Escape') {
            _handleCancel();
        }
    }
    
    // Handle Discord clear
    function _handleDiscordClear() {
        const discordUsernameInput = document.getElementById('discordUsername');
        const discordUserIdInput = document.getElementById('discordUserId');
        
        if (discordUsernameInput) {
            discordUsernameInput.value = '';
        }
        if (discordUserIdInput) {
            discordUserIdInput.value = '';
        }
    }
    
    // Validate input
    function _validateInput(displayName, initials, discordUsername, discordUserId) {
        if (!displayName || displayName.length < 2) {
            _showError('Display name must be at least 2 characters');
            return false;
        }
        
        if (displayName.length > 30) {
            _showError('Display name must be less than 30 characters');
            return false;
        }
        
        if (!initials || initials.length !== 3) {
            _showError('Initials must be exactly 3 characters');
            return false;
        }
        
        if (!/^[A-Z]{3}$/.test(initials)) {
            _showError('Initials must be 3 uppercase letters');
            return false;
        }
        
        // Validate Discord data if provided
        if (discordUsername && discordUsername.length > 50) {
            _showError('Discord username is too long');
            return false;
        }
        
        if (discordUserId) {
            if (!/^[0-9]*$/.test(discordUserId)) {
                _showError('Discord user ID must contain only numbers');
                return false;
            }
            if (discordUserId.length < 17 || discordUserId.length > 19) {
                _showError('Discord user ID must be 17-19 digits');
                return false;
            }
        }
        
        // If one Discord field is filled, both should be filled
        if ((discordUsername && !discordUserId) || (!discordUsername && discordUserId)) {
            _showError('Please provide both Discord username and user ID');
            return false;
        }
        
        return true;
    }
    
    // Show error message
    function _showError(message) {
        const errorDiv = document.getElementById('profile-error');
        const errorText = document.getElementById('profile-error-text');
        
        if (errorDiv && errorText) {
            errorText.textContent = message;
            errorDiv.classList.remove('hidden');
        }
    }
    
    // Hide error message
    function _hideError() {
        const errorDiv = document.getElementById('profile-error');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    }
    
    // Set button loading state
    function _setButtonLoading(button, isLoading) {
        if (!button) return;
        
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = `
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                <span>${_mode === 'create' ? 'Creating...' : 'Saving...'}</span>
            `;
        } else {
            button.disabled = false;
            button.innerHTML = _mode === 'create' ? 'Create Profile' : 'Save Changes';
        }
    }
    
    // Focus first input
    function _focusFirstInput() {
        setTimeout(() => {
            const firstInput = document.getElementById('displayName');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }
    
    // Public API
    return {
        show,
        hide
    };
})();