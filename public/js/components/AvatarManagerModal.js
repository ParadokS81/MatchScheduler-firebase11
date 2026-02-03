/**
 * AvatarManagerModal.js
 * Modal for selecting avatar source and managing custom uploads
 * Opens when user clicks their avatar in ProfileModal
 *
 * Avatar sources (in order of display):
 * - Custom Upload: User-uploaded image
 * - Discord Avatar: From Discord OAuth (with refresh)
 * - Google Avatar: From Google OAuth (with refresh)
 * - Initials: Fallback showing user's initials
 */
const AvatarManagerModal = (function() {
    'use strict';

    let _userId = null;
    let _userProfile = null;
    let _currentUser = null;
    let _onSave = null;  // Callback when avatar changes are saved
    let _pendingCustomUrl = null;  // Temp preview URL after upload

    /**
     * Show the avatar manager modal
     * @param {string} userId - User ID
     * @param {Object} userProfile - Current user profile data
     * @param {Object} currentUser - Current Firebase user
     * @param {Function} onSave - Callback with { avatarSource, photoURL } when saved
     */
    function show(userId, userProfile, currentUser, onSave) {
        _userId = userId;
        _userProfile = userProfile;
        _currentUser = currentUser;
        _onSave = onSave;
        _pendingCustomUrl = null;

        _renderModal();
        _attachListeners();
    }

    function _renderModal() {
        const currentSource = _detectCurrentSource();
        const container = document.getElementById('avatar-modal-container');

        container.innerHTML = `
            <div class="fixed inset-0 bg-black/75 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" id="avatar-manager-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-lg font-bold text-primary">Choose Avatar</h2>
                        <button id="avatar-manager-close" class="text-muted-foreground hover:text-foreground text-2xl leading-none">&times;</button>
                    </div>

                    <!-- Body -->
                    <div class="p-4">
                        <!-- Avatar Preview -->
                        <div class="flex justify-center mb-6">
                            <div id="avatar-manager-preview" class="w-24 h-24 rounded-full bg-muted border-4 border-border flex items-center justify-center overflow-hidden">
                                ${_renderPreview(currentSource)}
                            </div>
                        </div>

                        <!-- Source Options -->
                        <div class="space-y-2">
                            ${_renderCustomOption(currentSource)}
                            ${_renderProviderOption('discord', 'Discord Avatar', 'Use your Discord profile picture', currentSource)}
                            ${_renderProviderOption('google', 'Google Avatar', 'Use your Google profile picture', currentSource)}
                            ${_renderSourceOption('initials', 'Initials', 'Show your initials instead', currentSource)}
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="flex items-center justify-end p-4 border-t border-border gap-3">
                        <button id="avatar-manager-cancel" class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button id="avatar-manager-save" class="px-4 py-2 text-sm bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg transition-colors">
                            Save
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.classList.remove('hidden');
    }

    /**
     * Render the custom upload option with Edit button if custom avatar exists
     */
    function _renderCustomOption(currentSource) {
        const isSelected = currentSource === 'custom';
        const hasCustomAvatar = !!(_userProfile?.photoURL && _userProfile?.avatarSource === 'custom');
        const selectedClass = isSelected ? 'border-primary bg-primary/10' : 'border-border';

        return `
            <div class="avatar-source-option flex items-center gap-3 p-3 rounded-lg border ${selectedClass} cursor-pointer hover:bg-muted/50 transition-colors"
                 data-source="custom">
                <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    ${_renderSourcePreview('custom')}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-foreground text-sm">Custom Upload</div>
                    <div class="text-xs text-muted-foreground">${hasCustomAvatar ? 'Your uploaded avatar' : 'Upload your own image'}</div>
                </div>
                ${hasCustomAvatar ? `
                    <button class="avatar-edit-btn p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="Change image">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                    </button>
                ` : ''}
                ${isSelected ? `
                    <svg class="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render Discord/Google provider option with Refresh button
     */
    function _renderProviderOption(source, label, description, currentSource) {
        const isSelected = source === currentSource;
        const isAvailable = source === 'discord' ? _hasDiscordAvatar() : _hasGoogleAvatar();
        const disabledClass = !isAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50';
        const selectedClass = isSelected ? 'border-primary bg-primary/10' : 'border-border';

        return `
            <div class="avatar-source-option flex items-center gap-3 p-3 rounded-lg border ${selectedClass} ${disabledClass} transition-colors"
                 data-source="${source}" ${!isAvailable ? 'data-disabled="true"' : ''}>
                <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    ${_renderSourcePreview(source)}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-foreground text-sm">${label}</div>
                    <div class="text-xs text-muted-foreground">${!isAvailable ? 'Not linked' : description}</div>
                </div>
                ${isAvailable ? `
                    <button class="avatar-refresh-btn p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                            data-provider="${source}" title="Refresh from ${source === 'discord' ? 'Discord' : 'Google'}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                    </button>
                ` : ''}
                ${isSelected ? `
                    <svg class="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                ` : ''}
            </div>
        `;
    }

    function _renderSourceOption(source, label, description, currentSource, disabled = false) {
        const isSelected = source === currentSource;
        const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50';
        const selectedClass = isSelected ? 'border-primary bg-primary/10' : 'border-border';

        return `
            <div class="avatar-source-option flex items-center gap-3 p-3 rounded-lg border ${selectedClass} ${disabledClass} transition-colors"
                 data-source="${source}" ${disabled ? 'data-disabled="true"' : ''}>
                <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    ${_renderSourcePreview(source)}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-foreground text-sm">${label}</div>
                    <div class="text-xs text-muted-foreground">${description}</div>
                </div>
                ${isSelected ? `
                    <svg class="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                ` : ''}
            </div>
        `;
    }

    function _renderSourcePreview(source) {
        const url = _resolveAvatarUrl(source);
        if (url) {
            return `<img src="${url}" alt="${source}" class="w-full h-full object-cover">`;
        }
        // Fallback to initials
        return `<span class="text-sm font-bold text-muted-foreground">${_userProfile?.initials || '?'}</span>`;
    }

    function _renderPreview(source) {
        const url = _resolveAvatarUrl(source);
        if (url) {
            return `<img src="${url}" alt="Avatar" class="w-full h-full object-cover">`;
        }
        return `<span class="text-3xl font-bold text-muted-foreground">${_userProfile?.initials || '?'}</span>`;
    }

    function _detectCurrentSource() {
        if (_userProfile?.avatarSource) {
            // Map 'default' to 'initials' for legacy data
            if (_userProfile.avatarSource === 'default') return 'initials';
            return _userProfile.avatarSource;
        }
        if (_userProfile?.photoURL && _userProfile?.avatarSource === 'custom') return 'custom';
        if (_userProfile?.discordAvatarHash) return 'discord';
        if (_userProfile?.authProvider === 'google' && _currentUser?.photoURL) return 'google';
        return 'initials';
    }

    function _resolveAvatarUrl(source) {
        switch (source) {
            case 'custom':
                // Use pending URL if we just uploaded, otherwise use stored custom URL
                if (_pendingCustomUrl) return _pendingCustomUrl;
                if (_userProfile?.avatarSource === 'custom' && _userProfile?.photoURL) {
                    return _userProfile.photoURL;
                }
                return null;
            case 'discord':
                if (_userProfile?.discordUserId && _userProfile?.discordAvatarHash) {
                    const hash = _userProfile.discordAvatarHash;
                    const ext = hash.startsWith('a_') ? 'gif' : 'png';
                    return `https://cdn.discordapp.com/avatars/${_userProfile.discordUserId}/${hash}.${ext}?size=128`;
                }
                return null;
            case 'google':
                return _currentUser?.photoURL || null;
            case 'initials':
                return null;
            default:
                return null;
        }
    }

    function _hasDiscordAvatar() {
        return !!(_userProfile?.discordUserId && _userProfile?.discordAvatarHash);
    }

    function _hasGoogleAvatar() {
        return _userProfile?.authProvider === 'google' || !!_currentUser?.photoURL;
    }

    function _attachListeners() {
        // Close buttons
        document.getElementById('avatar-manager-close').addEventListener('click', close);
        document.getElementById('avatar-manager-cancel').addEventListener('click', close);
        document.getElementById('avatar-manager-backdrop').addEventListener('click', (e) => {
            if (e.target.id === 'avatar-manager-backdrop') close();
        });

        // Save button
        document.getElementById('avatar-manager-save').addEventListener('click', _handleSave);

        // Edit button for custom avatar
        const editBtn = document.querySelector('.avatar-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger card selection
                _openUploadModal();
            });
        }

        // Refresh buttons for Discord/Google
        document.querySelectorAll('.avatar-refresh-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger card selection
                const provider = btn.dataset.provider;
                _refreshProviderAvatar(provider);
            });
        });

        // Source selection
        document.querySelectorAll('.avatar-source-option').forEach(option => {
            option.addEventListener('click', (e) => {
                // Ignore if clicking on edit/refresh buttons
                if (e.target.closest('.avatar-edit-btn') || e.target.closest('.avatar-refresh-btn')) {
                    return;
                }

                const source = option.dataset.source;
                const disabled = option.dataset.disabled === 'true';

                if (disabled) return;

                // Custom without existing avatar - open upload
                if (source === 'custom' && !_hasCustomAvatar() && !_pendingCustomUrl) {
                    _openUploadModal();
                    return;
                }

                _selectSource(source);
            });
        });
    }

    function _hasCustomAvatar() {
        return !!(_userProfile?.photoURL && _userProfile?.avatarSource === 'custom');
    }

    function _selectSource(source) {
        // Update visual selection
        document.querySelectorAll('.avatar-source-option').forEach(option => {
            const isSelected = option.dataset.source === source;
            option.classList.toggle('border-primary', isSelected);
            option.classList.toggle('bg-primary/10', isSelected);
            option.classList.toggle('border-border', !isSelected);

            // Update checkmark (but preserve edit/refresh buttons)
            const existingCheck = option.querySelector('svg:not(.avatar-edit-btn svg):not(.avatar-refresh-btn svg)');
            if (existingCheck && !existingCheck.closest('.avatar-edit-btn') && !existingCheck.closest('.avatar-refresh-btn')) {
                existingCheck.remove();
            }

            if (isSelected) {
                option.insertAdjacentHTML('beforeend', `
                    <svg class="w-5 h-5 text-primary flex-shrink-0 checkmark-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                `);
            }
        });

        // Update main preview
        const preview = document.getElementById('avatar-manager-preview');
        if (preview) {
            preview.innerHTML = _renderPreview(source);
        }
    }

    function _openUploadModal() {
        if (typeof AvatarUploadModal !== 'undefined' && _userId) {
            AvatarUploadModal.show(_userId, (previewUrl) => {
                // Upload completed - store preview and select custom
                _pendingCustomUrl = previewUrl;
                _selectSource('custom');

                // Update the custom option preview thumbnail
                const customOption = document.querySelector('[data-source="custom"] .w-10');
                if (customOption && previewUrl) {
                    // Validate URL is a safe blob: or data: URL from the upload flow
                    if (previewUrl.startsWith('blob:') || previewUrl.startsWith('data:image/')) {
                        customOption.innerHTML = '';
                        const img = document.createElement('img');
                        img.src = previewUrl;
                        img.alt = 'custom';
                        img.className = 'w-full h-full object-cover';
                        customOption.appendChild(img);
                    }
                }
            });
        } else {
            console.error('AvatarUploadModal not available');
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Avatar upload not available');
            }
        }
    }

    async function _refreshProviderAvatar(provider) {
        const btn = document.querySelector(`.avatar-refresh-btn[data-provider="${provider}"]`);
        if (btn) {
            // Show loading state
            btn.innerHTML = `
                <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            `;
            btn.disabled = true;
        }

        try {
            if (provider === 'discord') {
                // Re-fetch Discord avatar hash via API
                // For now, just show a message - full implementation would call a Cloud Function
                if (typeof ToastService !== 'undefined') {
                    ToastService.showInfo('Re-link your Discord account to refresh avatar');
                }
            } else if (provider === 'google') {
                // Google avatar is from currentUser.photoURL - it's already fresh from auth
                if (_currentUser?.photoURL) {
                    _selectSource('google');
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showSuccess('Google avatar refreshed');
                    }
                }
            }
        } catch (error) {
            console.error(`Error refreshing ${provider} avatar:`, error);
            if (typeof ToastService !== 'undefined') {
                ToastService.showError(`Failed to refresh ${provider} avatar`);
            }
        } finally {
            // Restore button
            if (btn) {
                btn.innerHTML = `
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                `;
                btn.disabled = false;
            }
        }
    }

    function _handleSave() {
        // Find selected source
        const selectedOption = document.querySelector('.avatar-source-option.border-primary');
        const source = selectedOption?.dataset.source || 'initials';
        const photoURL = _resolveAvatarUrl(source);

        // Call callback with result
        if (_onSave) {
            _onSave({
                avatarSource: source,
                photoURL: photoURL,
                pendingCustomUpload: source === 'custom' && !!_pendingCustomUrl
            });
        }

        close();
    }

    function close() {
        _userId = null;
        _userProfile = null;
        _currentUser = null;
        _onSave = null;
        _pendingCustomUrl = null;

        const container = document.getElementById('avatar-modal-container');
        if (container) {
            container.innerHTML = '';
            container.classList.add('hidden');
        }
    }

    return { show, close };
})();
