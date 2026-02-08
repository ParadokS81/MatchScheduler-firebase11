// TeamInfo Component - Team information display for left sidebar
// Following PRD v2 Architecture with Revealing Module Pattern
// Enhanced for Slice 5.0.1: Roster display adapts to grid display mode
// Slice 13.0f: Split rendering - identity container (logo+name+tag) and roster container

const TeamInfo = (function() {
    'use strict';

    // Private variables
    let _identityContainer = null;
    let _rosterContainer = null;
    let _currentUser = null;
    let _userProfile = null;
    let _userTeams = [];
    let _selectedTeam = null;
    let _selectedTeamId = null;
    let _teamListener = null; // Direct Firebase listener for selected team
    let _userProfileListener = null;
    let _initialized = false;

    // Initialize component - now takes two container IDs
    function init(identityContainerId, rosterContainerId) {
        if (_initialized) return;

        _identityContainer = document.getElementById(identityContainerId);
        _rosterContainer = document.getElementById(rosterContainerId);

        if (!_identityContainer) {
            console.error('❌ TeamInfo: Identity container not found:', identityContainerId);
            return;
        }
        if (!_rosterContainer) {
            console.error('❌ TeamInfo: Roster container not found:', rosterContainerId);
            return;
        }

        _initialized = true;
        _render();

        // Set up event listeners for coordination
        window.addEventListener('profile-setup-complete', _handleProfileSetupComplete);
        window.addEventListener('team-joined', _handleTeamJoined);
        window.addEventListener('team-created', _handleTeamCreated);
        window.addEventListener('team-left', _handleTeamLeft);

        // Slice 5.0.1: Re-render roster when display mode or player colors change
        window.addEventListener('display-mode-changed', _render);
        window.addEventListener('player-colors-changed', _render);

        console.log('🏆 TeamInfo component initialized (split containers)');
    }

    // Update with user data
    function updateUser(user, userProfile) {
        const userChanged = _currentUser !== user;
        const profileChanged = JSON.stringify(_userProfile) !== JSON.stringify(userProfile);

        _currentUser = user;
        _userProfile = userProfile;

        if (user && userProfile) {
            // Only setup listener if user actually changed
            if (userChanged) {
                _setupUserProfileListener();
                // Render immediately to show correct state while listener loads
                _render();
            } else if (profileChanged) {
                // Just reload teams if profile changed but user didn't
                _loadUserTeams();
            }
        } else {
            _userTeams = [];
            _selectedTeam = null;
            _cleanupListeners();
            _render();
        }
    }

    // Setup real-time listener for user profile changes (teams map)
    async function _setupUserProfileListener() {
        if (!_currentUser) return;

        // Clean up existing listener
        if (_userProfileListener) {
            _userProfileListener();
            _userProfileListener = null;
        }

        try {
            const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const db = window.firebase.db;

            const userDocRef = doc(db, 'users', _currentUser.uid);

            _userProfileListener = onSnapshot(
                userDocRef,
                (doc) => {
                    if (doc.exists()) {
                        const userData = doc.data();
                        _userProfile = userData;

                        // Load teams whenever user profile changes
                        _loadUserTeams();

                        // Update FavoritesService when favorites change (Slice 3.2)
                        if (typeof FavoritesService !== 'undefined') {
                            FavoritesService.updateFromFirestore(userData.favoriteTeams);
                        }

                        console.log('👤 User profile updated, reloading teams...');
                    } else {
                        console.warn('⚠️ User profile document does not exist');
                        _userTeams = [];
                        _selectedTeam = null;
                        _render();
                    }
                },
                (error) => {
                    console.error('❌ User profile listener error:', error);
                    // Attempt to reconnect after delay
                    setTimeout(() => {
                        if (_currentUser) {
                            _setupUserProfileListener();
                        }
                    }, 5000);
                }
            );

        } catch (error) {
            console.error('❌ Error setting up user profile listener:', error);
        }
    }

    // Load user's teams
    async function _loadUserTeams() {
        if (!_currentUser || !_userProfile) return;

        try {
            // Check if TeamService is available
            if (typeof TeamService === 'undefined') {
                console.error('❌ TeamService not available');
                return;
            }

            const teams = await TeamService.getUserTeams(_currentUser.uid);

            // Check if teams actually changed (handle first-load case where both are empty)
            const teamsChanged = JSON.stringify(_userTeams) !== JSON.stringify(teams);
            const isFirstLoad = _userTeams.length === 0 && teams.length === 0;

            // Update teams
            _userTeams = teams;

            // Select first team if available and no team currently selected
            if (teams.length > 0 && !_selectedTeam) {
                _selectTeam(teams[0]);
            } else if (teams.length === 0) {
                _selectedTeam = null;
                // Always render when user has no teams (to show "Join or Create Team" UI)
                _render();
            }

            if (teamsChanged) {
                _render();
                console.log('🔄 User teams updated:', teams.length, 'teams');
            } else {
                console.log('📦 User teams unchanged');
            }

        } catch (error) {
            console.error('❌ Error loading user teams:', error);
            _userTeams = [];
            _selectedTeam = null;
            _render();
        }
    }

    // Select team and setup direct Firebase listener
    async function _selectTeam(team) {
        if (_selectedTeamId === team.id) {
            return; // Already selected
        }

        // Clean up previous listener
        if (_teamListener) {
            _teamListener();
            _teamListener = null;
        }

        _selectedTeam = team;
        _selectedTeamId = team.id;

        // Setup direct Firebase listener for this team
        try {
            const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const db = window.firebase.db;

            const teamDocRef = doc(db, 'teams', team.id);

            _teamListener = onSnapshot(
                teamDocRef,
                (doc) => {
                    if (doc.exists()) {
                        const teamData = { id: doc.id, ...doc.data() };

                        // Check if meaningful data changed (avoid Firestore timestamp comparison issues)
                        const hasChanged = !_selectedTeam ||
                            _selectedTeam.teamName !== teamData.teamName ||
                            _selectedTeam.teamTag !== teamData.teamTag ||
                            _selectedTeam.joinCode !== teamData.joinCode ||
                            _selectedTeam.maxPlayers !== teamData.maxPlayers ||
                            _selectedTeam.leaderId !== teamData.leaderId ||
                            _selectedTeam.playerRoster?.length !== teamData.playerRoster?.length ||
                            _selectedTeam.activeLogo?.logoId !== teamData.activeLogo?.logoId;

                        if (hasChanged) {
                            // Check if roster membership changed (for grid re-render)
                            const oldRosterIds = (_selectedTeam?.playerRoster || []).map(p => p.userId).sort().join(',');
                            const newRosterIds = (teamData.playerRoster || []).map(p => p.userId).sort().join(',');
                            const rosterMembershipChanged = oldRosterIds !== newRosterIds;

                            _selectedTeam = teamData;

                            // Update team in userTeams array
                            const index = _userTeams.findIndex(t => t.id === teamData.id);
                            if (index !== -1) {
                                _userTeams[index] = teamData;
                            }

                            // Update TeamService cache with real-time data
                            if (typeof TeamService !== 'undefined') {
                                TeamService.updateCachedTeam(doc.id, teamData);
                            }

                            _render();

                            // Notify grid to re-render with updated roster
                            if (rosterMembershipChanged) {
                                window.dispatchEvent(new CustomEvent('roster-changed', {
                                    detail: { team: teamData }
                                }));
                                console.log('👥 Roster membership changed, notifying grid');
                            }

                            console.log('🔄 Team data updated via direct listener:', teamData.teamName);
                        } else {
                            console.log('📦 Team listener fired but no data change detected');
                        }
                    } else {
                        console.warn('⚠️ Team document does not exist:', team.id);
                        _selectedTeam = null;
                        _selectedTeamId = null;

                        // Update TeamService cache to remove deleted team
                        if (typeof TeamService !== 'undefined') {
                            TeamService.updateCachedTeam(team.id, null);
                        }

                        _render();
                    }
                },
                (error) => {
                    console.error('❌ Team listener error:', error);
                    // Attempt to reconnect after delay
                    setTimeout(() => {
                        if (_selectedTeamId === team.id) {
                            _selectTeam(team);
                        }
                    }, 5000);
                }
            );

            console.log('📡 Direct Firebase listener attached for team:', team.teamName);

        } catch (error) {
            console.error('❌ Error setting up team listener:', error);
        }

        // Notify the app of team selection change for availability listeners
        if (typeof MatchSchedulerApp !== 'undefined' && MatchSchedulerApp.setSelectedTeam) {
            MatchSchedulerApp.setSelectedTeam(team);
        }

        // Dispatch event for other components (like the old TeamNameDisplay pattern)
        window.dispatchEvent(new CustomEvent('team-selected', {
            detail: { team }
        }));

        _render();
    }

    // Handle team switching (HOT PATH - must be instant)
    function _handleTeamSwitch(teamId) {
        const team = _userTeams.find(t => t.id === teamId);
        if (team) {
            // This is now instant since team data is already cached in _userTeams
            _selectTeam(team);
            console.log('⚡ Team switched instantly from cache:', team.teamName);
        }
    }

    // Handle team settings click (Slice 6.0a)
    function _handleTeamSettingsClick() {
        if (!_selectedTeam) return;

        if (typeof TeamManagementModal !== 'undefined') {
            TeamManagementModal.show(_selectedTeam.id);
        } else {
            console.error('❌ TeamManagementModal not available');
        }
    }

    // Render component - split into identity and roster containers
    function _render() {
        if (!_identityContainer || !_rosterContainer) return;

        if (!_currentUser) {
            // Guest mode
            _renderGuestMode();
        } else if (_userTeams.length === 0) {
            // No teams
            _renderNoTeamsMode();
        } else {
            // Has teams
            _renderTeamsMode();
        }

        _attachEventListeners();
    }

    // Render guest mode
    function _renderGuestMode() {
        _identityContainer.innerHTML = `
            <div class="text-center py-4">
                <div class="w-16 h-16 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
                    <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                </div>
                <p class="text-sm text-muted-foreground mb-4">
                    Sign in to create or join teams
                </p>
                <div class="flex flex-col gap-2 px-4">
                    <button id="teaminfo-discord-signin" class="w-full font-medium py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-2 text-sm" type="button" style="background-color: #5865F2; color: white;">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                        Discord
                    </button>
                    <button id="teaminfo-google-signin" class="w-full font-medium py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-2 text-sm border" type="button" style="background-color: transparent; color: var(--foreground); border-color: var(--border);">
                        <svg class="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Google
                    </button>
                </div>
            </div>
        `;

        _rosterContainer.innerHTML = '';
    }

    // Render no teams mode
    function _renderNoTeamsMode() {
        _identityContainer.innerHTML = `
            <div class="text-center py-4">
                <div class="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                    </svg>
                </div>
                <h4 class="text-sm font-medium text-foreground mb-1">No teams yet</h4>
                <p class="text-xs text-muted-foreground mb-4">
                    Join an existing team or create your own
                </p>

                <button
                    id="join-create-team-btn"
                    class="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors text-sm"
                >
                    Join or Create Team
                </button>
            </div>
        `;

        _rosterContainer.innerHTML = '';
    }

    // Render teams mode - Slice 13.0f: Split into identity + roster
    function _renderTeamsMode() {
        if (!_selectedTeam) return;

        // Get current display mode for roster visuals
        const displayMode = typeof PlayerDisplayService !== 'undefined'
            ? PlayerDisplayService.getDisplayMode()
            : 'initials';

        // === Identity Section (Logo + Name + Tag) ===
        const activeLogoUrl = _selectedTeam.activeLogo?.urls?.medium;
        const activeLogoContent = activeLogoUrl
            ? `<img src="${activeLogoUrl}" alt="${_selectedTeam.teamName} logo" class="w-full h-full object-cover">`
            : `<span class="text-3xl font-bold text-muted-foreground">${_selectedTeam.teamTag}</span>`;

        // Inactive team logo (if user has 2 teams)
        let inactiveLogoHTML = '';
        const inactiveTeam = _userTeams.find(t => t.id !== _selectedTeam.id);
        if (inactiveTeam) {
            const inactiveLogoUrl = inactiveTeam.activeLogo?.urls?.medium;
            const inactiveLogoContent = inactiveLogoUrl
                ? `<img src="${inactiveLogoUrl}" alt="${inactiveTeam.teamName} logo" class="w-full h-full object-cover">`
                : `<span class="text-sm font-bold text-muted-foreground">${inactiveTeam.teamTag}</span>`;

            inactiveLogoHTML = `
                <div class="team-logo-switch w-12 h-12 rounded-md overflow-hidden cursor-pointer border border-border flex items-center justify-center transition-all hover:border-primary"
                     data-team-id="${inactiveTeam.id}" title="Switch to ${inactiveTeam.teamName}">
                    ${inactiveLogoContent}
                </div>
            `;
        }

        // Determine logo size based on whether there's a second team
        const logoSize = inactiveTeam ? 'w-28 h-28' : 'w-36 h-36';

        _identityContainer.innerHTML = `
            <div class="flex flex-col items-center text-center">
                <!-- Logo row -->
                <div class="flex items-end justify-center gap-2 mb-3">
                    <div class="team-logo-clickable overflow-hidden ${logoSize} flex items-center justify-center cursor-pointer transition-all"
                         data-action="team-manage" title="Manage team">
                        ${activeLogoContent}
                    </div>
                    ${inactiveLogoHTML}
                </div>
                <!-- Team name + tag (larger, prominent) -->
                <div class="flex items-center justify-center gap-2 mb-3">
                    <span class="text-lg font-semibold text-primary">${_selectedTeam.teamName}</span>
                    <span class="text-muted-foreground">${_selectedTeam.teamTag || ''}</span>
                    <span class="team-settings-icon opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                          data-action="open-settings" title="Team Settings">
                        <svg class="w-4 h-4 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </span>
                </div>
            </div>
        `;

        // === Roster Section (centered) ===
        const rosterHTML = _selectedTeam.playerRoster.map(player => {
            const colorOrDefault = typeof PlayerColorService !== 'undefined'
                ? PlayerColorService.getPlayerColorOrDefault(player.userId)
                : '#6B7280';

            const leaderBadge = player.role === 'leader' ? `
                <svg class="w-4 h-4 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
            ` : '';

            let visualElement;
            if (displayMode === 'coloredDots') {
                visualElement = `<span class="w-4 h-4 rounded-full flex-shrink-0" style="background-color: ${colorOrDefault}"></span>`;
            } else if (displayMode === 'avatars' && player.photoURL) {
                visualElement = `
                    <div class="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                        <img src="${player.photoURL}" alt="${player.initials}" class="w-full h-full object-cover">
                    </div>
                `;
            } else if (displayMode === 'coloredInitials') {
                visualElement = `<span class="text-sm font-bold flex-shrink-0" style="color: ${colorOrDefault}">${player.initials}</span>`;
            } else {
                visualElement = `<span class="text-sm font-bold text-muted-foreground flex-shrink-0">${player.initials}</span>`;
            }

            return `
                <div class="roster-member group flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer"
                     data-user-id="${player.userId}">
                    ${visualElement}
                    <span class="text-sm font-medium text-foreground truncate">${player.displayName}</span>
                    ${leaderBadge}
                </div>
            `;
        }).join('');

        _rosterContainer.innerHTML = `
            <div class="space-y-0.5 max-w-fit mx-auto">
                ${rosterHTML}
            </div>
        `;
    }

    // Attach event listeners
    function _attachEventListeners() {
        // Guest mode login buttons
        const discordBtn = document.getElementById('teaminfo-discord-signin');
        if (discordBtn) {
            discordBtn.addEventListener('click', async () => {
                discordBtn.disabled = true;
                discordBtn.textContent = 'Signing in...';
                try {
                    await AuthService.signInWithDiscord();
                } catch (err) {
                    console.error('Discord sign-in failed:', err);
                    if (typeof ToastService !== 'undefined') {
                        ToastService.show('Sign-in failed. Please try again.', 'error');
                    }
                } finally {
                    discordBtn.disabled = false;
                }
            });
        }
        const googleBtn = document.getElementById('teaminfo-google-signin');
        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                googleBtn.disabled = true;
                googleBtn.textContent = 'Signing in...';
                try {
                    await AuthService.signInWithGoogle();
                } catch (err) {
                    console.error('Google sign-in failed:', err);
                    if (typeof ToastService !== 'undefined') {
                        ToastService.show('Sign-in failed. Please try again.', 'error');
                    }
                } finally {
                    googleBtn.disabled = false;
                }
            });
        }

        // Join/Create team button (no-team state)
        const joinCreateBtn = document.getElementById('join-create-team-btn');
        if (joinCreateBtn) {
            joinCreateBtn.addEventListener('click', _handleJoinCreateTeam);
        }

        // Logo-as-switcher: active logo click → team management modal
        const activeLogos = document.querySelectorAll('[data-action="team-manage"]');
        activeLogos.forEach(logo => {
            logo.addEventListener('click', _handleJoinCreateTeam);
        });

        // Logo-as-switcher: inactive team logo click → switch team
        const inactiveLogos = document.querySelectorAll('.team-logo-switch');
        inactiveLogos.forEach(logo => {
            logo.addEventListener('click', (e) => {
                const teamId = e.currentTarget.dataset.teamId;
                if (teamId) _handleTeamSwitch(teamId);
            });
        });

        // Team settings gear icon
        const settingsIcons = document.querySelectorAll('[data-action="open-settings"]');
        settingsIcons.forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                _handleTeamSettingsClick();
            });
        });

        // Slice 5.0.1: Roster member click for color picker (only in colored modes)
        const displayMode = typeof PlayerDisplayService !== 'undefined'
            ? PlayerDisplayService.getDisplayMode()
            : 'initials';

        if (displayMode === 'coloredInitials' || displayMode === 'coloredDots') {
            const rosterMembers = document.querySelectorAll('.roster-member');
            rosterMembers.forEach(member => {
                member.addEventListener('click', (e) => {
                    const userId = member.dataset.userId;
                    if (userId && typeof ColorPickerPopover !== 'undefined') {
                        ColorPickerPopover.show(member, userId);
                    }
                });
            });
        }
    }

    // Handle join/create team
    function _handleJoinCreateTeam() {
        if (!_currentUser) {
            console.error('❌ User not authenticated');
            return;
        }

        // Check if OnboardingModal is available
        if (typeof OnboardingModal === 'undefined') {
            console.error('❌ OnboardingModal not available');
            return;
        }

        // 2-step flow: Check if user has completed profile setup (has initials)
        if (!_userProfile?.initials) {
            // Step 1: Show profile setup modal first
            console.log('User needs to set up profile - showing profile setup modal first');
            if (typeof ProfileModal !== 'undefined') {
                ProfileModal.show(_currentUser, _userProfile);
                // Step 2 will be triggered by profile-setup-complete event listener
            } else {
                console.error('❌ ProfileModal not available');
            }
        } else {
            // Step 2: User has profile, show onboarding modal directly
            OnboardingModal.show(_currentUser, _userProfile);
        }
    }

    // Handle profile setup complete event for 2-step flow
    async function _handleProfileSetupComplete(event) {
        console.log('Profile setup complete - refreshing profile and showing onboarding modal');
        const { user } = event.detail;

        try {
            // Refresh user profile from Firebase to get latest data
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', user.uid));

            if (userDoc.exists()) {
                const refreshedProfile = userDoc.data();

                // Update the component with the new profile data (this will set up listeners)
                updateUser(user, refreshedProfile);

                // Show onboarding modal with refreshed profile
                if (typeof OnboardingModal !== 'undefined') {
                    OnboardingModal.show(user, refreshedProfile);
                }
            }
        } catch (error) {
            console.error('❌ Failed to refresh profile after setup:', error);
        }
    }

    // Handle team joined event
    function _handleTeamJoined(event) {
        console.log('Team joined event received - refreshing team data');
        // The Firebase listener should pick this up automatically, but let's force a refresh
        _loadUserTeams();
    }

    // Handle team created event
    function _handleTeamCreated(event) {
        console.log('Team created event received - refreshing team data');
        _loadUserTeams();
    }

    // Handle team left event - refresh to switch team or show no-team state
    function _handleTeamLeft(event) {
        console.log('Team left event received - refreshing team data');
        const leftTeamId = event.detail?.teamId;

        // Remove the left team from local state immediately for instant feedback
        _userTeams = _userTeams.filter(t => t.id !== leftTeamId);

        if (_selectedTeam?.id === leftTeamId) {
            // Clear selection so _loadUserTeams will pick the remaining team via _selectTeam
            _selectedTeam = null;
            _selectedTeamId = null;
            _cleanupListeners();
        }

        // Re-render immediately (shows remaining team or no-team state), then reload
        _render();
        _loadUserTeams();
    }

    // Cleanup listeners
    function _cleanupListeners() {
        // Clean up team listener
        if (_teamListener) {
            _teamListener();
            _teamListener = null;
            console.log('🧹 Cleaned up team listener');
        }

        // Clean up user profile listener
        if (_userProfileListener) {
            _userProfileListener();
            _userProfileListener = null;
            console.log('🧹 Cleaned up user profile listener');
        }
    }

    // Cleanup function
    function cleanup() {
        _cleanupListeners();
        _initialized = false;
    }

    // Slice 13.0f: Get the currently selected team (for other components to access)
    function getSelectedTeam() {
        return _selectedTeam;
    }

    // Public API
    return {
        init,
        updateUser,
        getSelectedTeam,
        cleanup
    };
})();
