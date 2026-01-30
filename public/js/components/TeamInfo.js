// TeamInfo Component - Team information display for middle-left panel
// Following PRD v2 Architecture with Revealing Module Pattern
// Enhanced for Slice 5.0.1: Roster display adapts to grid display mode
// Enhanced for Slice 6.0b: Grid Tools drawer below roster

const TeamInfo = (function() {
    'use strict';

    // Private variables
    let _panel = null;
    let _currentUser = null;
    let _userProfile = null;
    let _userTeams = [];
    let _selectedTeam = null;
    let _selectedTeamId = null;
    let _teamListener = null; // Direct Firebase listener for selected team
    let _userProfileListener = null;
    let _initialized = false;
    let _drawerExpanded = false; // Slice 6.0b: Track drawer state
    
    // Initialize component
    function init(panelId) {
        if (_initialized) return;
        
        _panel = document.getElementById(panelId);
        if (!_panel) {
            console.error('❌ TeamInfo: Panel not found:', panelId);
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

        // Slice 6.0b: Update drawer height when templates change
        window.addEventListener('templates-updated', _updateDrawerHeight);

        console.log('🏆 TeamInfo component initialized');
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
    
    // Render component
    function _render() {
        if (!_panel) return;
        
        let content = '';
        
        if (!_currentUser) {
            // Guest mode
            content = _renderGuestMode();
        } else if (_userTeams.length === 0) {
            // No teams
            content = _renderNoTeamsMode();
        } else {
            // Has teams
            content = _renderTeamsMode();
        }
        
        _panel.innerHTML = `
            <div class="panel-content">
                ${content}
            </div>
        `;
        
        _attachEventListeners();
    }
    
    // Render guest mode
    function _renderGuestMode() {
        return `
            <div class="space-y-4">
                <h3 class="text-lg font-semibold">Team Info</h3>
                
                <div class="text-center py-6">
                    <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                        </svg>
                    </div>
                    <h4 class="text-sm font-medium text-foreground mb-2">Sign in to join teams</h4>
                    <p class="text-xs text-muted-foreground">
                        Sign in with Google to create or join gaming teams
                    </p>
                </div>
            </div>
        `;
    }
    
    // Render no teams mode
    function _renderNoTeamsMode() {
        return `
            <div class="space-y-4">
                <!-- Empty team card placeholder -->
                <div class="bg-card border border-dashed border-border rounded-lg p-6 text-center">
                    <div class="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </div>
                    <h4 class="text-sm font-medium text-foreground mb-2">No teams yet</h4>
                    <p class="text-xs text-muted-foreground mb-4">
                        Join an existing team or create your own
                    </p>
                    
                    <button 
                        id="join-create-team-btn"
                        class="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors"
                    >
                        Join or Create Team
                    </button>
                </div>
            </div>
        `;
    }
    
    // Render teams mode
    function _renderTeamsMode() {
        // Get current display mode for roster visuals and drawer header
        const displayMode = typeof PlayerDisplayService !== 'undefined'
            ? PlayerDisplayService.getDisplayMode()
            : 'initials';

        // Logo + team name section - logo on top, name below, clickable
        let logoSection = '';
        if (_selectedTeam) {
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
                    <div class="team-logo-switch w-12 h-12 rounded-md overflow-hidden cursor-pointer border border-border flex items-center justify-center transition-all"
                         data-team-id="${inactiveTeam.id}" title="Switch to ${inactiveTeam.teamName}">
                        ${inactiveLogoContent}
                    </div>
                `;
            }

            // Team name with gear icon below logo
            const teamNameRow = `
                <div class="group flex items-center justify-center gap-1.5">
                    <span class="text-sm font-semibold text-muted-foreground truncate">${_selectedTeam.teamName}</span>
                    <span class="team-settings-icon opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-pointer"
                          data-action="open-settings" title="Team Settings">
                        <svg class="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </span>
                </div>
            `;

            logoSection = inactiveLogoHTML
                ? `<div class="flex flex-col items-center gap-1.5 mb-3">
                        <div class="flex items-end justify-center gap-2">
                            <div class="team-logo-clickable bg-card border border-border rounded-lg overflow-hidden w-28 h-28 flex items-center justify-center cursor-pointer transition-all"
                                 data-action="team-manage" title="Manage team">
                                ${activeLogoContent}
                            </div>
                            ${inactiveLogoHTML}
                        </div>
                        ${teamNameRow}
                    </div>`
                : `<div class="flex flex-col items-center gap-1.5 mb-3">
                        <div class="team-logo-clickable bg-card border border-border rounded-lg overflow-hidden w-36 h-36 flex items-center justify-center cursor-pointer transition-all"
                             data-action="team-manage" title="Manage team">
                            ${activeLogoContent}
                        </div>
                        ${teamNameRow}
                    </div>`;
        }

        // Roster
        let rosterHTML = '';
        if (_selectedTeam) {
            rosterHTML = _selectedTeam.playerRoster.map(player => {
                const playerColor = typeof PlayerColorService !== 'undefined'
                    ? PlayerColorService.getPlayerColor(player.userId)
                    : null;
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
        }

        // Display mode buttons for drawer header (inline, always visible)
        const _modeBtn = (id, mode, label, content) => `
            <button id="${id}"
                    class="display-mode-btn px-1.5 py-0.5 text-xs rounded ${displayMode === mode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}"
                    data-mode="${mode}"
                    title="${label}">${content}</button>`;

        const displayModeButtons = `
            <div class="flex items-center gap-0.5" id="display-mode-buttons">
                ${_modeBtn('display-mode-initials', 'initials', 'Plain initials', 'ABC')}
                ${_modeBtn('display-mode-coloredInitials', 'coloredInitials', 'Colored initials', '<span class="text-rainbow font-semibold">ABC</span>')}
                ${_modeBtn('display-mode-coloredDots', 'coloredDots', 'Colored dots', '<span class="inline-flex gap-0.5"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span><span class="w-1.5 h-1.5 rounded-full bg-green-400"></span><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span></span>')}
                ${_modeBtn('display-mode-avatars', 'avatars', 'Avatar badges', '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>')}
            </div>
        `;

        // Grid Tools overlay drawer with inline display mode buttons in header
        const gridToolsDrawer = `
            <div class="grid-tools-drawer ${_drawerExpanded ? 'drawer-open' : 'drawer-closed'}">
                <div class="grid-tools-header w-full flex items-center gap-2 px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors bg-card"
                     aria-expanded="${_drawerExpanded}"
                     aria-controls="grid-tools-drawer-content">
                    <span class="cursor-pointer select-none flex-shrink-0" data-action="toggle-drawer">Templates</span>
                    ${displayModeButtons}
                    <svg class="drawer-arrow w-4 h-4 transition-transform duration-300 cursor-pointer flex-shrink-0"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24"
                         data-action="toggle-drawer"
                         style="transform: rotate(${_drawerExpanded ? '180deg' : '0deg'})">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
                    </svg>
                </div>
                <div id="grid-tools-drawer-content" class="grid-tools-drawer-body bg-card px-3 pb-3">
                    <!-- GridActionButtons will render here (templates only) -->
                </div>
            </div>
        `;

        // Container
        return `
            <div class="team-info-container h-full flex flex-col relative overflow-hidden">
                <div class="space-y-2 flex-1 min-h-0 overflow-y-auto pb-6 px-1">
                    ${logoSection}
                    <div class="space-y-0.5 max-w-fit mx-auto">
                        ${rosterHTML}
                    </div>
                </div>
                ${gridToolsDrawer}
            </div>
        `;
    }
    
    // Attach event listeners
    function _attachEventListeners() {
        if (!_panel) return;
        
        // Join/Create team button (no-team state)
        const joinCreateBtn = _panel.querySelector('#join-create-team-btn');
        if (joinCreateBtn) {
            joinCreateBtn.addEventListener('click', _handleJoinCreateTeam);
        }

        // Logo-as-switcher: active logo click → team management modal
        const activeLogos = _panel.querySelectorAll('[data-action="team-manage"]');
        activeLogos.forEach(logo => {
            logo.addEventListener('click', _handleJoinCreateTeam);
        });

        // Logo-as-switcher: inactive team logo click → switch team
        const inactiveLogos = _panel.querySelectorAll('.team-logo-switch');
        inactiveLogos.forEach(logo => {
            logo.addEventListener('click', (e) => {
                const teamId = e.currentTarget.dataset.teamId;
                if (teamId) _handleTeamSwitch(teamId);
            });
        });

        // Team settings gear icon
        const settingsIcons = _panel.querySelectorAll('[data-action="open-settings"]');
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
            const rosterMembers = _panel.querySelectorAll('.roster-member');
            rosterMembers.forEach(member => {
                member.addEventListener('click', (e) => {
                    const userId = member.dataset.userId;
                    if (userId && typeof ColorPickerPopover !== 'undefined') {
                        ColorPickerPopover.show(member, userId);
                    }
                });
            });
        }

        // Slice 6.0b: Grid Tools drawer toggle — only label and arrow toggle, not display mode buttons
        const drawerToggles = _panel.querySelectorAll('[data-action="toggle-drawer"]');
        drawerToggles.forEach(el => {
            el.addEventListener('click', _toggleGridToolsDrawer);
        });

        // Dispatch event so GridActionButtons can initialize into the drawer
        if (_panel.querySelector('.grid-tools-header')) {
            window.dispatchEvent(new CustomEvent('grid-tools-drawer-ready'));
        }
    }

    // Slice 6.0b: Toggle Grid Tools drawer expanded/collapsed
    function _toggleGridToolsDrawer() {
        const drawer = _panel.querySelector('.grid-tools-drawer');
        const header = _panel.querySelector('.grid-tools-header');
        const arrow = header?.querySelector('.drawer-arrow');

        if (!drawer) return;

        _drawerExpanded = !_drawerExpanded;

        if (_drawerExpanded) {
            // Expand - slide up to show content
            drawer.classList.remove('drawer-closed');
            drawer.classList.add('drawer-open');
            header.setAttribute('aria-expanded', 'true');
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        } else {
            // Collapse - slide down to hide content
            drawer.classList.remove('drawer-open');
            drawer.classList.add('drawer-closed');
            header.setAttribute('aria-expanded', 'false');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }

        // Dispatch event so GridActionButtons can know drawer state changed
        window.dispatchEvent(new CustomEvent('grid-tools-drawer-toggled', {
            detail: { expanded: _drawerExpanded }
        }));
    }

    // Slice 6.0b: Placeholder for drawer height updates (not needed for overlay style)
    function _updateDrawerHeight() {
        // No-op for overlay drawer - height is fixed
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
    
    // Handle copy join code
    async function _handleCopyJoinCode(e) {
        const joinCode = e.target.dataset.joinCode;
        if (!joinCode) return;
        
        try {
            await navigator.clipboard.writeText(joinCode);
            
            // Show success feedback
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Join code copied to clipboard!');
            }
            
            // Temporary button feedback
            const originalText = e.target.textContent;
            e.target.textContent = 'Copied!';
            e.target.classList.add('text-primary');
            
            setTimeout(() => {
                e.target.textContent = originalText;
                e.target.classList.remove('text-primary');
            }, 1000);
            
        } catch (error) {
            console.error('❌ Error copying to clipboard:', error);
            
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Failed to copy join code');
            }
        }
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

        // Slice 6.0b: Remove drawer-related event listeners
        window.removeEventListener('templates-updated', _updateDrawerHeight);

        _initialized = false;
        _drawerExpanded = false;
    }
    
    // Public API
    return {
        init,
        updateUser,
        cleanup
    };
})();