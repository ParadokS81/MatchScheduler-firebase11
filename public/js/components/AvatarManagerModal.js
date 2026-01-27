/**
 * AvatarManagerModal.js
 * Modal for selecting avatar source and managing custom uploads
 * Opens when user clicks their avatar in ProfileModal
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
                            ${_renderSourceOption('custom', 'Custom Upload', 'Upload your own image', currentSource)}
                            ${_renderSourceOption('discord', 'Discord Avatar', 'Use your Discord profile picture', currentSource, !_hasDiscordAvatar())}
                            ${_renderSourceOption('google', 'Google Avatar', 'Use your Google profile picture', currentSource, !_hasGoogleAvatar())}
                            ${_renderSourceOption('default', 'Default', 'Use the default avatar', currentSource)}
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
        if (_userProfile?.avatarSource) return _userProfile.avatarSource;
        if (_userProfile?.customAvatarUrl) return 'custom';
        if (_userProfile?.discordAvatarHash) return 'discord';
        if (_userProfile?.authProvider === 'google' && _currentUser?.photoURL) return 'google';
        return 'default';
    }

    function _resolveAvatarUrl(source) {
        switch (source) {
            case 'custom':
                return _pendingCustomUrl || _userProfile?.customAvatarUrl;
            case 'discord':
                if (_userProfile?.discordUserId && _userProfile?.discordAvatarHash) {
                    const hash = _userProfile.discordAvatarHash;
                    const ext = hash.startsWith('a_') ? 'gif' : 'png';
                    return `https://cdn.discordapp.com/avatars/${_userProfile.discordUserId}/${hash}.${ext}?size=128`;
                }
                return null;
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

        // Source selection
        document.querySelectorAll('.avatar-source-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const source = option.dataset.source;
                const disabled = option.dataset.disabled === 'true';

                if (disabled) return;

                // Special handling for custom - open upload modal
                if (source === 'custom') {
                    _openUploadModal();
                    return;
                }

                _selectSource(source);
            });
        });
    }

    function _selectSource(source) {
        // Update visual selection
        document.querySelectorAll('.avatar-source-option').forEach(option => {
            const isSelected = option.dataset.source === source;
            option.classList.toggle('border-primary', isSelected);
            option.classList.toggle('bg-primary/10', isSelected);
            option.classList.toggle('border-border', !isSelected);

            // Update checkmark
            const existingCheck = option.querySelector('svg');
            if (existingCheck) existingCheck.remove();

            if (isSelected) {
                option.insertAdjacentHTML('beforeend', `
                    <svg class="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            });
        } else {
            console.error('AvatarUploadModal not available');
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Avatar upload not available');
            }
        }
    }

    function _handleSave() {
        // Find selected source
        const selectedOption = document.querySelector('.avatar-source-option.border-primary');
        const source = selectedOption?.dataset.source || 'default';
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
