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
    let _hasInitialRender = false;
    
    // Initialize component
    function init(panelId) {
        _panel = document.getElementById(panelId);
        if (!_panel) {
            console.error('❌ UserProfile: Panel not found:', panelId);
            return;
        }
        
        // Show loading state initially instead of guest mode
        _panel.innerHTML = `
            <div class="panel-content">
                <div class="flex items-center justify-center h-full">
                    <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
            </div>
        `;
        
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

        // Listen for profile updates (from ProfileModal save)
        window.addEventListener('profile-updated', _handleProfileUpdated);

        console.log('🔗 Setting up auth listener...');
        _authUnsubscribe = AuthService.onAuthStateChange(async (user) => {
            // Skip if user state hasn't actually changed AND we've already done initial render
            if (_currentUser === user && _hasInitialRender) {
                console.log('🔄 Auth state unchanged, skipping render');
                return;
            }
            
            console.log('🔄 Auth state changed:', user ? 'authenticated' : 'guest');
            _currentUser = user;
            _hasInitialRender = true;
            
            if (user) {
                console.log('📧 User email:', user.email);
                console.log('👤 User displayName:', user.displayName);

                // Load user profile from database
                await _loadUserProfile(user.uid);

                // Only render once after profile is loaded
                console.log('🎨 Rendering authenticated mode...');
                _renderAuthenticatedMode();

                // Force profile setup if user hasn't set nick/initials yet
                if (!_userProfile?.initials) {
                    console.log('🔒 No initials set - forcing profile setup modal');
                    setTimeout(() => {
                        if (typeof ProfileModal !== 'undefined') {
                            ProfileModal.show(user, _userProfile);
                        }
                    }, 300);
                }

                // Also update compact view if it exists (Slice 5.0a)
                _renderCompactContent();

                // Update TeamInfo component with user data (Slice 5.0a: moved here to work in compact-only mode)
                if (typeof TeamInfo !== 'undefined') {
                    TeamInfo.updateUser(_currentUser, _userProfile);
                }
            } else {
                console.log('🎨 Rendering guest mode...');
                _userProfile = null;

                // Clear FavoritesService on logout (Slice 3.2)
                if (typeof FavoritesService !== 'undefined') {
                    FavoritesService.clear();
                }
                if (typeof FavoritesPanel !== 'undefined') {
                    FavoritesPanel.cleanup();
                }

                _renderGuestMode();

                // Also update compact view if it exists (Slice 5.0a)
                _renderCompactContent();

                // Update TeamInfo to show guest mode (Slice 5.0a: moved here to work in compact-only mode)
                if (typeof TeamInfo !== 'undefined') {
                    TeamInfo.updateUser(null, null);
                }
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

                // Check if user has completed their player profile (has initials)
                const hasPlayerProfile = !!_userProfile.initials;

                if (hasPlayerProfile) {
                    console.log('📊 User profile loaded:', _userProfile.displayName);
                } else {
                    console.log('📊 User exists but needs to set up player profile (no initials)');
                }

                // Load user's templates (only if profile is complete)
                if (hasPlayerProfile && typeof TemplateService !== 'undefined') {
                    TemplateService.loadUserTemplates();
                }

                // Initialize FavoritesService with user's favorites (Slice 3.2)
                if (typeof FavoritesService !== 'undefined') {
                    FavoritesService.init(uid, _userProfile.favoriteTeams || []);
                }

                // Slice 13.0e: FavoritesPanel deprecated - functionality moved to unified sidebar
                // Favorites filter is now part of TeamBrowser

                // Load timezone preference (Slice 7.0c)
                if (typeof TimezoneService !== 'undefined' && _userProfile.timezone) {
                    const currentTz = TimezoneService.getUserTimezone();
                    if (currentTz !== _userProfile.timezone) {
                        TimezoneService.setUserTimezone(_userProfile.timezone);
                        window.dispatchEvent(new CustomEvent('timezone-changed', {
                            detail: { timezone: _userProfile.timezone }
                        }));
                    }
                }

                // Load hidden timeslots preference (Slice 12.0b + 13.0d)
                // Only override defaults if user has explicitly saved a preference
                // - undefined/null: keep defaults (1800, 1830, 1900 hidden)
                // - []: user explicitly chose to show all
                // - ['1800']: user's custom preference
                if (typeof TimezoneService !== 'undefined' && Array.isArray(_userProfile.hiddenTimeSlots)) {
                    const applied = TimezoneService.setHiddenTimeSlots(_userProfile.hiddenTimeSlots);
                    if (applied) {
                        window.dispatchEvent(new CustomEvent('timeslots-changed', {
                            detail: { hiddenTimeSlots: _userProfile.hiddenTimeSlots }
                        }));
                    }
                }

                // Load extra timeslots preference (Slice 14.0a)
                if (typeof TimezoneService !== 'undefined' && Array.isArray(_userProfile.extraTimeSlots)) {
                    TimezoneService.setExtraTimeSlots(_userProfile.extraTimeSlots);
                    window.dispatchEvent(new CustomEvent('timeslots-changed', {
                        detail: { extraTimeSlots: _userProfile.extraTimeSlots }
                    }));
                }
            } else {
                console.log('⚠️ User document not found - this should not happen with new flow');
                _userProfile = null;
            }
        } catch (error) {
            console.error('❌ Error loading user profile:', error);
            _userProfile = null;
        }
    }
    
    // Render guest mode UI with Discord (primary) and Google (secondary) sign-in options
    function _renderGuestMode() {
        // Skip if no panel (compact-only mode)
        if (!_panel) return;

        console.log('🎨 Rendering guest mode UI...');
        _panel.innerHTML = `
            <div class="panel-content">
                <div class="flex flex-row gap-2 h-full justify-center items-center">
                    <!-- Discord Sign-In (Primary) -->
                    <button
                        id="discord-signin-btn"
                        class="flex-1 font-medium py-2 px-3 rounded-md transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
                        type="button"
                        style="background-color: #5865F2; color: white;"
                        title="Sign in with Discord"
                    >
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                        <span>Discord</span>
                    </button>

                    <!-- Google Sign-In (Secondary) -->
                    <button
                        id="google-signin-btn"
                        class="flex-1 font-medium py-2 px-3 rounded-md transition-colors duration-200 flex items-center justify-center gap-2 text-sm border"
                        type="button"
                        style="background-color: transparent; color: var(--foreground); border-color: var(--border);"
                        title="Sign in with Google"
                    >
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span>Google</span>
                    </button>
                </div>
            </div>
        `;

        console.log('🎨 Guest mode HTML rendered, attaching listeners...');
        _attachGuestEventListeners();
    }
    
    // Render authenticated mode UI
    function _renderAuthenticatedMode() {
        // Skip if no panel (compact-only mode)
        if (!_panel) return;
        if (!_currentUser) return;

        const displayName = _userProfile?.displayName || _currentUser.displayName || 'User';
        const initials = _userProfile?.initials || '';
        console.log('🎯 Displaying authenticated user:', displayName);

        _panel.innerHTML = `
            <div class="panel-content">
                <button
                    id="edit-profile-btn"
                    class="flex items-center gap-3 h-full w-full hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
                    type="button"
                    title="Edit Profile"
                >
                    <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        ${_userProfile?.photoURL || _currentUser.photoURL ?
                            `<img src="${_userProfile?.photoURL || _currentUser.photoURL}" alt="Profile" class="w-full h-full rounded-full object-cover">` :
                            `<svg class="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                            </svg>`
                        }
                    </div>
                    <div class="text-sm font-medium text-foreground">
                        ${displayName}${initials ? ` · ${initials}` : ''}
                    </div>
                </button>
            </div>
        `;

        _attachAuthenticatedEventListeners();
    }
    
    // Attach event listeners for guest mode
    function _attachGuestEventListeners() {
        const discordBtn = _panel.querySelector('#discord-signin-btn');
        const googleBtn = _panel.querySelector('#google-signin-btn');

        if (discordBtn) {
            discordBtn.addEventListener('click', _handleDiscordSignIn);
            console.log('✅ Discord sign-in button listener attached');
        }

        if (googleBtn) {
            googleBtn.addEventListener('click', _handleGoogleSignIn);
            console.log('✅ Google sign-in button listener attached');
        }

        if (!discordBtn && !googleBtn) {
            console.error('❌ Sign-in buttons not found in DOM');
        }
    }
    
    // Attach event listeners for authenticated mode
    function _attachAuthenticatedEventListeners() {
        const editProfileBtn = _panel.querySelector('#edit-profile-btn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', _handleEditProfile);
        }
    }
    
    // Handle Discord sign-in (Primary method)
    async function _handleDiscordSignIn() {
        const btn = _panel?.querySelector('#discord-signin-btn') || _compactContainer?.querySelector('#compact-discord-btn');
        if (!btn) return;

        // Store original button content
        const originalContent = btn.innerHTML;

        // Show loading state
        btn.disabled = true;
        btn.innerHTML = `
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        `;

        try {
            const result = await AuthService.signInWithDiscord();

            // Handle account unification prompt
            if (result.requiresLinking) {
                console.log('Account unification required');
                _showAccountLinkingModal(result);

                // Reset button
                btn.disabled = false;
                btn.innerHTML = originalContent;
                return;
            }

            if (result.isNewUser) {
                console.log('👋 New Discord user signed in - forcing profile setup');
                // Profile setup will be triggered by auth state change detecting no initials
            }

        } catch (error) {
            console.error('❌ Discord sign-in failed:', error);
            _showError(error.message);

            // Reset button
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }

    // Show modal for account linking decision
    function _showAccountLinkingModal(linkingData) {
        const { existingEmail, discordUser } = linkingData;

        // Create modal HTML
        const modalHtml = `
            <div id="account-linking-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                <div class="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md mx-4 shadow-xl">
                    <h3 class="text-lg font-semibold text-foreground mb-4">
                        Existing Account Found
                    </h3>
                    <p class="text-sm text-muted-foreground mb-4">
                        We found an existing account with <strong class="text-foreground">${existingEmail}</strong>.
                        Would you like to link your Discord account (${discordUser.username}) to it?
                    </p>
                    <div class="flex flex-col gap-2">
                        <button id="link-existing-btn"
                            class="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                            Link to Existing Account
                        </button>
                        <button id="create-new-btn"
                            class="w-full py-2 px-4 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors">
                            Create Separate Account
                        </button>
                        <button id="cancel-linking-btn"
                            class="w-full py-2 px-4 text-muted-foreground hover:text-foreground transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Attach handlers
        document.getElementById('link-existing-btn').addEventListener('click', async () => {
            _closeAccountLinkingModal();
            // Sign in with Google, then link Discord
            try {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showInfo('Please sign in with Google to link your accounts');
                }
                await AuthService.signInWithGoogle();
                // After Google sign-in, link the Discord account
                await AuthService.linkDiscordAccount();
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('Accounts linked successfully!');
                }
            } catch (error) {
                console.error('Account linking failed:', error);
                _showError('Failed to link accounts: ' + error.message);
            }
        });

        document.getElementById('create-new-btn').addEventListener('click', async () => {
            _closeAccountLinkingModal();
            // Force create new account (pass flag to skip email check)
            try {
                await AuthService.signInWithDiscord({ forceNew: true });
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('New account created!');
                }
            } catch (error) {
                console.error('Account creation failed:', error);
                _showError('Failed to create account: ' + error.message);
            }
        });

        document.getElementById('cancel-linking-btn').addEventListener('click', () => {
            _closeAccountLinkingModal();
        });
    }

    // Close the account linking modal
    function _closeAccountLinkingModal() {
        const modal = document.getElementById('account-linking-modal');
        if (modal) modal.remove();
    }

    // Handle Google sign-in (Secondary method)
    async function _handleGoogleSignIn() {
        const btn = _panel?.querySelector('#google-signin-btn') || _compactContainer?.querySelector('#compact-google-btn');
        if (!btn) return;

        // Store original button content
        const originalContent = btn.innerHTML;

        // Show loading state
        btn.disabled = true;
        btn.innerHTML = `
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>
        `;

        try {
            const result = await AuthService.signInWithGoogle();

            if (result.isNewUser) {
                console.log('👋 New Google user signed in - forcing profile setup');
                // Profile setup will be triggered by auth state change detecting no initials
            }

        } catch (error) {
            console.error('❌ Sign-in failed:', error);
            _showError(error.message);

            // Reset button
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
    
    // Handle edit profile
    function _handleEditProfile() {
        console.log('✏️ Edit profile clicked');
        if (_currentUser) {
            // Always pass the profile - modal will detect if setup is needed (no initials)
            ProfileModal.show(_currentUser, _userProfile);
        } else {
            console.error('❌ Cannot edit profile - user not authenticated');
        }
    }

    // Handle profile updated event (from ProfileModal save)
    async function _handleProfileUpdated(event) {
        console.log('📊 Profile updated event received, refreshing...');
        if (_currentUser) {
            // Reload profile from database
            await _loadUserProfile(_currentUser.uid);
            // Re-render with new data
            _renderAuthenticatedMode();
        }
    }

    // Show error message
    function _showError(message) {
        console.error('❌ Error:', message);
        if (typeof ToastService !== 'undefined') {
            ToastService.showError(message);
        }
    }
    
    // ========================================
    // Slice 5.0a: Compact Profile Renderer
    // ========================================

    let _compactContainer = null;

    /**
     * Render compact profile in the divider row
     * Shows avatar + nickname, clickable to open ProfileModal
     * @param {string} containerId - ID of the compact container element
     */
    function renderCompact(containerId) {
        _compactContainer = document.getElementById(containerId);
        if (!_compactContainer) {
            console.error('UserProfile: Compact container not found:', containerId);
            return;
        }

        // Set up auth listener if not already done (Slice 5.0a: standalone compact mode)
        if (!_authUnsubscribe) {
            _setupAuthListener();
        }

        // Initial render based on current state
        _renderCompactContent();

        // Re-render when profile is updated (e.g., from ProfileModal)
        window.addEventListener('profile-updated', _renderCompactContent);
    }

    /**
     * Render the compact profile content based on current user state
     */
    function _renderCompactContent() {
        if (!_compactContainer) return;

        if (_currentUser && _userProfile) {
            // Authenticated user
            const displayName = _userProfile.displayName || _currentUser.displayName || 'User';
            const photoURL = _userProfile.photoURL || _currentUser.photoURL;
            const initials = _userProfile.initials || '';

            _compactContainer.innerHTML = `
                <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-3">
                        <button id="feedback-compact-btn" class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-muted-foreground hover:text-foreground" title="Give Feedback">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            <span class="text-xs">Give Feedback</span>
                            <span id="feedback-badge" class="hidden min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[0.625rem] font-bold flex items-center justify-center leading-none"></span>
                        </button>
                        ${window.matchMedia('(display-mode: standalone)').matches ? `
                            <button id="pwa-refresh-btn" class="ml-auto p-1 cursor-pointer hover:opacity-80 transition-opacity text-muted-foreground hover:text-foreground" title="Refresh">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                    <button id="profile-compact-btn" class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" title="Edit Profile">
                        ${photoURL ?
                            `<img src="${photoURL}" alt="avatar" class="w-8 h-8 rounded-full object-cover">` :
                            `<div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                                <svg class="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                </svg>
                            </div>`
                        }
                        <span class="text-sm font-medium text-foreground">${displayName}${initials ? ` · ${initials}` : ''}</span>
                    </button>
                </div>
            `;

            // Attach click handlers
            const feedbackBtn = _compactContainer.querySelector('#feedback-compact-btn');
            if (feedbackBtn) {
                feedbackBtn.addEventListener('click', () => {
                    if (typeof FeedbackModal !== 'undefined') {
                        FeedbackModal.show();
                    }
                });
            }

            const refreshBtn = _compactContainer.querySelector('#pwa-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => window.location.reload());
            }

            const btn = _compactContainer.querySelector('#profile-compact-btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    if (typeof ProfileModal !== 'undefined') {
                        ProfileModal.show(_currentUser, _userProfile);
                    }
                });
            }

            // Check for new feedback (admin only, fails silently for non-admins)
            _checkFeedbackCount();
        } else if (_currentUser) {
            // Authenticated but no profile yet
            _compactContainer.innerHTML = `
                <button id="profile-compact-btn" class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" title="Set up profile">
                    <div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <svg class="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                        </svg>
                    </div>
                    <span class="text-sm text-muted-foreground">Set up profile</span>
                </button>
            `;

            const btn = _compactContainer.querySelector('#profile-compact-btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    if (typeof ProfileModal !== 'undefined') {
                        ProfileModal.show(_currentUser, _userProfile);
                    }
                });
            }
        } else {
            // Guest - show compact sign in buttons
            _compactContainer.innerHTML = `
                <div class="flex items-center gap-2">
                    <button id="compact-discord-btn" class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors" style="background-color: #5865F2; color: white;" title="Sign in with Discord">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                        <span>Discord</span>
                    </button>
                    <button id="compact-google-btn" class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors" style="background-color: transparent; color: var(--foreground); border-color: var(--border);" title="Sign in with Google">
                        <svg class="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span>Google</span>
                    </button>
                </div>
            `;

            // Attach sign-in handlers
            const discordBtn = _compactContainer.querySelector('#compact-discord-btn');
            const googleBtn = _compactContainer.querySelector('#compact-google-btn');

            if (discordBtn) {
                discordBtn.addEventListener('click', _handleDiscordSignIn);
            }
            if (googleBtn) {
                googleBtn.addEventListener('click', _handleGoogleSignIn);
            }
        }
    }

    /**
     * Check for new feedback items (admin only).
     * Calls getFeedbackCount Cloud Function - server checks admin permission.
     * Non-admins get permission-denied (silenced). Other errors shown as "?" badge.
     */
    async function _checkFeedbackCount() {
        if (!_currentUser?.uid) return;

        try {
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const functions = window.firebase.functions;
            const getFeedbackCount = httpsCallable(functions, 'getFeedbackCount');
            const result = await getFeedbackCount({});

            const count = result.data.count;
            _updateFeedbackBadge(count);
        } catch (e) {
            // permission-denied = not admin, expected for most users
            if (e.code === 'functions/permission-denied') return;
            console.warn('⚠️ Feedback badge failed:', e.code || e.message, '| UID:', _currentUser?.uid);
            _updateFeedbackBadge('?');
        }
    }

    function _updateFeedbackBadge(count) {
        const badge = document.getElementById('feedback-badge');
        if (!badge) return;

        badge.textContent = typeof count === 'number' && count > 99 ? '99+' : count;
        badge.classList.remove('hidden');

        if (count === 0) {
            badge.classList.remove('bg-red-500');
            badge.style.backgroundColor = 'rgba(156, 163, 175, 0.4)';
        } else if (count === '?') {
            badge.classList.remove('bg-red-500');
            badge.style.backgroundColor = '#ca8a04';
        } else {
            badge.style.backgroundColor = '';
            badge.classList.add('bg-red-500');
        }
    }

    // Cleanup
    function cleanup() {
        if (_authUnsubscribe) {
            _authUnsubscribe();
            _authUnsubscribe = null;
        }
        _authServiceRetryCount = 0;
        _compactContainer = null;
        window.removeEventListener('profile-updated', _renderCompactContent);
    }

    // Get avatar URL for external consumers (e.g. MobileBottomBar)
    function getAvatarUrl() {
        return _userProfile?.photoURL || _currentUser?.photoURL || null;
    }

    // Open profile modal from external caller (e.g. MobileBottomBar avatar tap)
    function openProfileModal() {
        if (_currentUser && typeof ProfileModal !== 'undefined') {
            ProfileModal.show(_currentUser, _userProfile);
        }
    }

    // Public API
    return {
        init,
        renderCompact,
        getAvatarUrl,
        openProfileModal,
        cleanup
    };
})();