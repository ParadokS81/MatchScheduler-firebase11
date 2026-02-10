// ProfileModal Component - User profile setup and editing
// Following PRD v2 Architecture with Revealing Module Pattern

const ProfileModal = (function() {
    'use strict';

    // Private variables
    let _isVisible = false;
    let _currentUser = null;
    let _userProfile = null;
    let _isSetupMode = false;  // true if user needs to set up profile (no initials)
    let _keydownHandler = null;
    let _pendingCustomAvatarUrl = null; // Temp preview URL after upload, before save

    // Show profile modal
    // Setup mode is auto-detected based on whether profile has initials
    function show(user, userProfile = null) {
        if (_isVisible) return;

        _currentUser = user;
        _userProfile = userProfile;
        // Setup mode = user exists but hasn't set their player profile (no initials)
        _isSetupMode = !userProfile?.initials;
        _isVisible = true;
        
        const avatarUrl = _getCurrentAvatarUrl();

        const modalHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-md">
                    <!-- Header with clickable avatar -->
                    <div class="flex items-center justify-between p-4 border-b border-slate-700">
                        <div class="flex items-center gap-3">
                            <button type="button" id="avatar-change-btn" class="group relative flex-shrink-0">
                                <div id="avatar-preview" class="w-12 h-12 rounded-full bg-muted border-2 border-border flex items-center justify-center overflow-hidden transition-all group-hover:border-primary">
                                    ${avatarUrl ?
                                        `<img src="${avatarUrl}" alt="Avatar" class="w-full h-full object-cover">` :
                                        `<span class="text-lg font-bold text-muted-foreground">${_userProfile?.initials || '?'}</span>`
                                    }
                                </div>
                                <div class="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    </svg>
                                </div>
                            </button>
                            <h2 class="text-xl font-bold text-sky-400">${_isSetupMode ? 'Set Up Profile' : 'Edit Profile'}</h2>
                        </div>
                    </div>

                    <!-- Body -->
                    <div class="p-4">
                        <form id="profile-form" class="space-y-4">
                            <!-- Hidden inputs for avatar data -->
                            <input type="hidden" name="avatarSource" id="avatarSource" value="${_detectDefaultSource()}">
                            <input type="hidden" name="photoURL" id="photoURL" value="${avatarUrl || ''}">

                            ${_isSetupMode ? `
                            <p class="text-sm text-muted-foreground">
                                Welcome! Set your player nick and initials to get started.
                            </p>
                            ` : ''}

                            <!-- Player Nick + Initials Row -->
                            <div class="flex gap-3">
                                <div class="flex-1">
                                    <label for="displayName" class="block text-sm font-medium text-foreground mb-1">
                                        Player Nick
                                    </label>
                                    <input
                                        type="text"
                                        id="displayName"
                                        name="displayName"
                                        value="${_isSetupMode ? '' : (_userProfile?.displayName || user.displayName || '')}"
                                        placeholder="Your gaming name"
                                        class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                        required
                                        minlength="2"
                                        maxlength="30"
                                    >
                                </div>
                                <div class="w-24">
                                    <label for="initials" class="block text-sm font-medium text-foreground mb-1">
                                        Initials
                                    </label>
                                    <input
                                        type="text"
                                        id="initials"
                                        name="initials"
                                        value="${_userProfile?.initials || ''}"
                                        placeholder="ABC"
                                        class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary uppercase text-center"
                                        required
                                        minlength="1"
                                        maxlength="3"
                                        pattern="[A-Z]{1,3}"
                                        style="text-transform: uppercase;"
                                    >
                                </div>
                            </div>

                            <!-- Error Display -->
                            <div id="profile-error" class="hidden bg-red-900/50 border border-red-600 rounded-md p-3">
                                <div class="flex items-center gap-2">
                                    <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <span class="text-red-400 text-sm" id="profile-error-text"></span>
                                </div>
                            </div>

                            <!-- Discord Account Section -->
                            <div class="border-t border-border pt-4" id="discord-section-container">
                                ${_renderDiscordSection()}
                            </div>

                            <!-- Timezone Section (Slice 7.0c) -->
                            <div class="border-t border-border pt-4">
                                <label class="block text-sm font-medium text-muted-foreground mb-2">Timezone</label>
                                <select id="profile-timezone" name="timezone" class="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                                    ${_renderTimezoneOptions()}
                                </select>
                            </div>
                        </form>
                    </div>

                    <!-- Footer -->
                    <div class="flex items-center justify-between p-4 border-t border-slate-700">
                        <div class="flex items-center gap-2">
                            ${!_isSetupMode ? `
                            <button
                                type="button"
                                id="profile-logout-btn"
                                class="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
                            >
                                Sign Out
                            </button>
                            <button
                                type="button"
                                id="profile-delete-btn"
                                class="px-3 py-2 text-sm text-muted-foreground hover:text-red-500 hover:border-red-500 border border-border rounded-md transition-colors"
                            >
                                Delete
                            </button>
                            ` : `
                            <button
                                type="button"
                                id="profile-logout-btn"
                                class="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
                            >
                                Sign Out
                            </button>
                            `}
                        </div>
                        <div class="flex items-center gap-2">
                            ${!_isSetupMode ? `
                            <button
                                type="button"
                                id="profile-cancel-btn"
                                class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            ` : ''}
                            <button
                                type="submit"
                                id="profile-save-btn"
                                form="profile-form"
                                class="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors"
                            >
                                ${_isSetupMode ? 'Confirm & Continue' : 'Save'}
                            </button>
                        </div>
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

        // Reset pending avatar URL
        _pendingCustomAvatarUrl = null;

        const modalContainer = document.getElementById('modal-container');
        modalContainer.classList.add('hidden');
        modalContainer.innerHTML = '';
    }
    
    // Attach event listeners
    function _attachEventListeners() {
        const form = document.getElementById('profile-form');
        const cancelBtn = document.getElementById('profile-cancel-btn');
        const logoutBtn = document.getElementById('profile-logout-btn');
        const initialsInput = document.getElementById('initials');
        const discordClearBtn = document.getElementById('discord-clear-btn');

        if (form) {
            form.addEventListener('submit', _handleSubmit);
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', _handleCancel);
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', _handleLogout);
        }

        const deleteBtn = document.getElementById('profile-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', _handleDeleteAccount);
        }

        if (initialsInput) {
            initialsInput.addEventListener('input', _handleInitialsInput);
        }

        if (discordClearBtn) {
            discordClearBtn.addEventListener('click', _handleDiscordClear);
        }

        // Attach Discord link/unlink event listeners
        _attachDiscordEventListeners();

        // Attach avatar source selection listeners
        _attachAvatarListeners();

        // Close on backdrop click (disabled in setup mode - must complete profile)
        const modalContainer = document.getElementById('modal-container');
        if (!_isSetupMode) {
            modalContainer.addEventListener('click', (e) => {
                if (e.target === modalContainer) {
                    _handleCancel();
                }
            });
        }

        // Close on escape key (disabled in setup mode - must complete profile)
        if (!_isSetupMode) {
            _keydownHandler = _handleKeyDown;
            document.addEventListener('keydown', _keydownHandler);
        }
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

            // Add avatar source preference
            const avatarSource = formData.get('avatarSource');
            const photoURL = formData.get('photoURL');
            if (avatarSource) {
                profileData.avatarSource = avatarSource;
                // Never send blob: or data: URLs to backend - those are local previews only
                // For pending custom uploads, processAvatarUpload Cloud Function sets the real URL
                const isSafeUrl = photoURL && !photoURL.startsWith('blob:') && !photoURL.startsWith('data:');
                if (isSafeUrl) {
                    profileData.photoURL = photoURL;
                } else if (avatarSource !== 'custom') {
                    // Non-custom sources with no URL → clear photoURL (e.g. initials)
                    profileData.photoURL = null;
                }
                // For custom source with pending upload: skip photoURL, let Cloud Function handle it
            }

            // Add timezone (Slice 7.0c)
            const timezone = formData.get('timezone');
            if (timezone) {
                profileData.timezone = timezone;
            }

            // Always use updateProfile (user doc already exists from sign-in)
            await AuthService.updateProfile(profileData);
            console.log('✅ Profile saved successfully');

            // Update TimezoneService if timezone changed (Slice 7.0c)
            if (timezone && typeof TimezoneService !== 'undefined') {
                const currentTz = TimezoneService.getUserTimezone();
                if (currentTz !== timezone) {
                    TimezoneService.setUserTimezone(timezone);
                    window.dispatchEvent(new CustomEvent('timezone-changed', {
                        detail: { timezone }
                    }));
                }
            }

            hide();

            // Always emit profile-updated event so components can refresh
            window.dispatchEvent(new CustomEvent('profile-updated', {
                detail: { user: _currentUser, profileData, isSetupMode: _isSetupMode }
            }));

            // Emit profile-setup event if this was initial setup (for TeamInfo to show onboarding)
            if (_isSetupMode) {
                window.dispatchEvent(new CustomEvent('profile-setup-complete', {
                    detail: { user: _currentUser, profileData }
                }));
            }
            
        } catch (error) {
            console.error('❌ Profile save failed:', error);
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

    // Handle logout
    async function _handleLogout() {
        hide();
        try {
            if (typeof AuthService !== 'undefined') {
                await AuthService.signOutUser();
                console.log('👋 User signed out from profile modal');
            }
        } catch (error) {
            console.error('❌ Sign out failed:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Failed to sign out');
            }
        }
    }

    // Handle delete account
    async function _handleDeleteAccount() {
        // Show confirmation dialog
        const confirmed = confirm(
            'Are you sure you want to delete your account?\n\n' +
            'This will permanently remove:\n' +
            '• Your profile and all data\n' +
            '• Your membership from all teams\n\n' +
            'This action cannot be undone!'
        );

        if (!confirmed) return;

        // Double-check with a second confirmation
        const doubleConfirmed = confirm(
            'This is your final warning!\n\n' +
            'Click OK to permanently delete your account.'
        );

        if (!doubleConfirmed) return;

        const deleteBtn = document.getElementById('profile-delete-btn');
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
        }

        try {
            if (typeof AuthService !== 'undefined') {
                await AuthService.deleteAccount();
                console.log('🗑️ Account deleted successfully');

                hide();

                // Show success message
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('Account deleted successfully');
                }
            }
        } catch (error) {
            console.error('❌ Account deletion failed:', error);
            _showError(error.message || 'Failed to delete account');

            // Reset button
            if (deleteBtn) {
                deleteBtn.disabled = false;
                deleteBtn.textContent = 'Delete';
            }
        }
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

    // Discord icon SVG path (reused across sections)
    const DISCORD_ICON_PATH = 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z';

    // ============================================
    // AVATAR SECTION HELPERS
    // ============================================

    // Detect current avatar source based on existing data
    function _detectDefaultSource() {
        if (_userProfile?.avatarSource) return _userProfile.avatarSource;
        if (_userProfile?.customAvatarUrl) return 'custom';
        if (_userProfile?.discordAvatarHash) return 'discord';
        if (_userProfile?.authProvider === 'discord' && _userProfile?.photoURL) return 'discord';
        if (_userProfile?.authProvider === 'google' && _currentUser?.photoURL) return 'google';
        return 'initials';
    }

    // Resolve avatar URL based on source
    function _resolveAvatarUrl(source) {
        switch (source) {
            case 'custom':
                return _pendingCustomAvatarUrl || _userProfile?.customAvatarUrl;
            case 'discord':
                if (_userProfile?.discordUserId && _userProfile?.discordAvatarHash) {
                    const hash = _userProfile.discordAvatarHash;
                    const ext = hash.startsWith('a_') ? 'gif' : 'png';
                    return `https://cdn.discordapp.com/avatars/${_userProfile.discordUserId}/${hash}.${ext}?size=128`;
                }
                // Fall back to stored photoURL (e.g., Discord user without avatarHash)
                return _userProfile?.photoURL || null;
            case 'google':
                return _currentUser?.photoURL;
            case 'default':
                return '/img/default-avatar.png';
            case 'initials':
                return null;
            default:
                return null;
        }
    }

    // Get current avatar URL for display
    function _getCurrentAvatarUrl() {
        const source = _detectDefaultSource();
        return _resolveAvatarUrl(source);
    }

    // Avatar section is now integrated into the header - this function is no longer needed
    // but kept for reference in case we need to restore it

    // Handle avatar change button click - opens AvatarManagerModal
    function _handleAvatarChangeClick() {
        if (typeof AvatarManagerModal !== 'undefined' && _currentUser) {
            AvatarManagerModal.show(
                _currentUser.uid,
                _userProfile,
                _currentUser,
                (result) => {
                    // Callback when avatar selection is saved
                    _pendingCustomAvatarUrl = result.pendingCustomUpload ? result.photoURL : null;

                    // Update hidden inputs
                    const sourceInput = document.getElementById('avatarSource');
                    const photoUrlInput = document.getElementById('photoURL');
                    if (sourceInput) sourceInput.value = result.avatarSource;
                    if (photoUrlInput) photoUrlInput.value = result.photoURL || '';

                    // Update preview in ProfileModal
                    const preview = document.getElementById('avatar-preview');
                    if (preview) {
                        preview.innerHTML = result.photoURL ?
                            `<img src="${result.photoURL}" alt="Avatar" class="w-full h-full object-cover">` :
                            `<span class="text-2xl font-bold text-muted-foreground">${_userProfile?.initials || '?'}</span>`;
                    }
                }
            );
        } else {
            console.error('AvatarManagerModal not available');
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Avatar manager not available');
            }
        }
    }

    // Attach avatar event listeners
    function _attachAvatarListeners() {
        const avatarBtn = document.getElementById('avatar-change-btn');
        if (avatarBtn) {
            avatarBtn.addEventListener('click', _handleAvatarChangeClick);
        }
    }

    // Render timezone select options (Slice 7.0c)
    function _renderTimezoneOptions() {
        if (typeof TimezoneService === 'undefined') return '<option>UTC</option>';

        const groups = TimezoneService.getTimezoneOptions();
        const currentTz = _userProfile?.timezone || TimezoneService.getUserTimezone();

        let html = '';
        for (const group of groups) {
            html += `<optgroup label="${group.region}">`;
            for (const tz of group.timezones) {
                const selected = tz.id === currentTz ? ' selected' : '';
                html += `<option value="${tz.id}"${selected}>${tz.label}</option>`;
            }
            html += '</optgroup>';
        }
        return html;
    }

    // Render Discord section based on auth state
    function _renderDiscordSection() {
        const isDiscordAuth = _userProfile?.authProvider === 'discord';
        const hasLinkedDiscord = _userProfile?.discordUserId && !isDiscordAuth;

        // Case 1: User signed in with Discord - read-only display (compact)
        if (isDiscordAuth) {
            return `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-[#5865F2]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="${DISCORD_ICON_PATH}"/>
                        </svg>
                        <span class="text-sm text-foreground">${_userProfile?.discordUsername || 'Discord User'}</span>
                        <span class="text-xs text-muted-foreground">(${_userProfile?.discordUserId})</span>
                        <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                </div>
                <input type="hidden" name="discordUsername" value="${_userProfile?.discordUsername || ''}">
                <input type="hidden" name="discordUserId" value="${_userProfile?.discordUserId || ''}">
            `;
        }

        // Case 2: Google user with linked Discord - compact single line with unlink
        if (hasLinkedDiscord) {
            return `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-[#5865F2]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="${DISCORD_ICON_PATH}"/>
                        </svg>
                        <span class="text-sm text-foreground">${_userProfile?.discordUsername || 'Discord User'}</span>
                        <span class="text-xs text-muted-foreground">(${_userProfile?.discordUserId})</span>
                        <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <button type="button" id="unlink-discord-btn"
                        class="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        Unlink
                    </button>
                </div>
                <input type="hidden" name="discordUsername" id="discordUsername" value="${_userProfile?.discordUsername || ''}">
                <input type="hidden" name="discordUserId" id="discordUserId" value="${_userProfile?.discordUserId || ''}">
            `;
        }

        // Case 3: Google user without Discord - show Link button
        return `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-[#5865F2]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="${DISCORD_ICON_PATH}"/>
                    </svg>
                    <span class="text-sm text-muted-foreground">Discord</span>
                    <span class="text-xs text-muted-foreground">(Optional)</span>
                </div>
                <button type="button" id="link-discord-btn"
                    class="text-xs px-3 py-1 rounded transition-colors hover:opacity-90"
                    style="background-color: #5865F2; color: white;">
                    Link
                </button>
            </div>
            <input type="hidden" name="discordUsername" id="discordUsername" value="">
            <input type="hidden" name="discordUserId" id="discordUserId" value="">
        `;
    }

    // Re-render Discord section after link/unlink
    function _rerenderDiscordSection() {
        const container = document.getElementById('discord-section-container');
        if (container) {
            container.innerHTML = _renderDiscordSection();
            _attachDiscordEventListeners();
        }
    }

    // Attach Discord-specific event listeners
    function _attachDiscordEventListeners() {
        const linkBtn = document.getElementById('link-discord-btn');
        const unlinkBtn = document.getElementById('unlink-discord-btn');

        if (linkBtn) {
            linkBtn.addEventListener('click', _handleLinkDiscord);
        }

        if (unlinkBtn) {
            unlinkBtn.addEventListener('click', _handleUnlinkDiscord);
        }
    }

    // Handle link Discord click
    async function _handleLinkDiscord() {
        const btn = document.getElementById('link-discord-btn');
        if (!btn) return;

        const originalContent = btn.innerHTML;

        // Show loading state
        btn.disabled = true;
        btn.innerHTML = `
            <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span>Linking...</span>
        `;

        try {
            const result = await AuthService.linkDiscordAccount();

            if (result.success) {
                // Update cached profile with Discord data (including photoURL for avatar)
                _userProfile = {
                    ..._userProfile,
                    discordUsername: result.user.discordUsername,
                    discordUserId: result.user.discordUserId,
                    discordAvatarHash: result.user.discordAvatarHash,
                    photoURL: result.user.photoURL
                };

                // Re-render Discord section to show linked status
                _rerenderDiscordSection();

                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('Discord account linked!');
                }
            }
        } catch (error) {
            console.error('Discord linking failed:', error);
            _showError(error.message);

            // Reset button
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }

    // Handle unlink Discord click
    async function _handleUnlinkDiscord() {
        if (!confirm('Unlink your Discord account? You can re-link it anytime.')) {
            return;
        }

        const btn = document.getElementById('unlink-discord-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Unlinking...';
        }

        try {
            // Clear Discord fields
            await AuthService.updateProfile({
                discordUsername: '',
                discordUserId: '',
                discordAvatarHash: null
            });

            // Update cached profile
            _userProfile = {
                ..._userProfile,
                discordUsername: null,
                discordUserId: null,
                discordAvatarHash: null
            };

            // Re-render to show "Link Discord" button
            _rerenderDiscordSection();

            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Discord account unlinked');
            }
        } catch (error) {
            console.error('Discord unlinking failed:', error);
            _showError('Failed to unlink Discord account');

            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Unlink';
            }
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
        
        if (!initials || initials.length < 1 || initials.length > 3) {
            _showError('Initials must be 1-3 characters');
            return false;
        }

        if (!/^[A-Z]{1,3}$/.test(initials)) {
            _showError('Initials must be 1-3 uppercase letters');
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
                <span>Saving...</span>
            `;
        } else {
            button.disabled = false;
            button.innerHTML = _isSetupMode ? 'Confirm & Continue' : 'Save';
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