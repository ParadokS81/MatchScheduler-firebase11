// TeamInfo Component - Team information display for middle-left panel
// Following PRD v2 Architecture with Revealing Module Pattern

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
    let _drawerInstance = null;
    
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
            
            // Only update if teams actually changed
            if (JSON.stringify(_userTeams) !== JSON.stringify(teams)) {
                _userTeams = teams;
                
                // Select first team if available and no team currently selected
                if (teams.length > 0 && !_selectedTeam) {
                    _selectTeam(teams[0]);
                } else if (teams.length === 0) {
                    _selectedTeam = null;
                }
                
                _render();
                console.log('🔄 User teams updated:', teams.length, 'teams');
            } else {
                console.log('📦 User teams unchanged, skipping update');
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
                        
                        // Only update if data actually changed (avoid duplicate cache updates)
                        if (!_selectedTeam || JSON.stringify(_selectedTeam) !== JSON.stringify(teamData)) {
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
        // Team switcher buttons (2 side by side)
        let teamSwitcher = '';
        if (_userTeams.length > 1) {
            teamSwitcher = `
                <div class="grid grid-cols-2 gap-2 mb-4">
                    ${_userTeams.map(team => `
                        <button 
                            class="team-switch-btn px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                _selectedTeam && _selectedTeam.id === team.id 
                                    ? 'bg-primary text-primary-foreground' 
                                    : 'bg-card hover:bg-accent text-card-foreground'
                            }"
                            data-team-id="${team.id}"
                        >
                            ${team.teamTag}
                        </button>
                    `).join('')}
                </div>
            `;
        } else if (_userTeams.length === 1) {
            // Single team button (full width)
            teamSwitcher = `
                <button class="w-full px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground mb-4">
                    ${_selectedTeam.teamTag}
                </button>
            `;
        }
        
        // Team card with logo placeholder and roster
        let teamCard = '';
        if (_selectedTeam) {
            // Build roster HTML separately to ensure clean structure
            const rosterHTML = _selectedTeam.playerRoster.map(player => `
                <div class="flex items-center gap-3 py-1">
                    <div class="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center">
                        <span class="text-xs font-bold text-primary">${player.initials}</span>
                    </div>
                    <div class="flex-1">
                        <div class="text-sm font-medium text-foreground">${player.displayName}</div>
                    </div>
                    ${player.role === 'leader' ? `
                        <div class="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                            <svg class="w-2 h-2 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                        </div>
                    ` : ''}
                </div>
            `).join('');
            
            teamCard = `
                <div class="mb-4" id="team-card-container">
                    <!-- Logo with its own frame -->
                    <div class="bg-card border border-border rounded-lg p-4 w-32 h-32 flex items-center justify-center mb-4 mx-auto">
                        <span class="text-2xl font-bold text-muted-foreground">${_selectedTeam.teamTag}</span>
                    </div>
                    
                    <!-- Roster below logo (no frame) -->
                    <div class="space-y-1">
                        ${rosterHTML}
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="space-y-4">
                <!-- Remove "Team Info" header -->
                ${_userTeams.length < 2 ? `
                    <div class="flex justify-end">
                        <button 
                            id="add-team-btn"
                            class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            title="Add second team"
                        >
                            + Add Team
                        </button>
                    </div>
                ` : ''}
                
                ${teamSwitcher}
                ${teamCard}
            </div>
        `;
    }
    
    // Attach event listeners
    function _attachEventListeners() {
        if (!_panel) return;
        
        // Join/Create team button
        const joinCreateBtn = _panel.querySelector('#join-create-team-btn');
        if (joinCreateBtn) {
            joinCreateBtn.addEventListener('click', _handleJoinCreateTeam);
        }
        
        // Add team button
        const addTeamBtn = _panel.querySelector('#add-team-btn');
        if (addTeamBtn) {
            addTeamBtn.addEventListener('click', _handleJoinCreateTeam);
        }
        
        // Team switch buttons
        const teamSwitchBtns = _panel.querySelectorAll('.team-switch-btn');
        teamSwitchBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const teamId = e.target.dataset.teamId;
                _handleTeamSwitch(teamId);
            });
        });
        
        // Copy join code button
        const copyJoinCodeBtn = _panel.querySelector('#copy-join-code-btn');
        if (copyJoinCodeBtn) {
            copyJoinCodeBtn.addEventListener('click', _handleCopyJoinCode);
        }
        
        // Initialize team management drawer if we have a team
        if (_selectedTeam && _currentUser && _userProfile) {
            _initializeDrawer();
        }
    }
    
    // Initialize team management drawer
    function _initializeDrawer() {
        if (!_selectedTeam || !_currentUser || !_userProfile) return;
        
        // Check if TeamManagementDrawer is available
        if (typeof TeamManagementDrawer === 'undefined') {
            console.warn('⚠️ TeamManagementDrawer not available');
            return;
        }
        
        // Find the panel content container for full width
        const panelContent = _panel.querySelector('.panel-content');
        if (!panelContent) {
            console.warn('⚠️ Panel content not found');
            return;
        }
        
        // Clean up existing drawer instance
        if (_drawerInstance) {
            _drawerInstance.cleanup();
            _drawerInstance = null;
        }
        
        // Create new drawer instance
        _drawerInstance = Object.create(TeamManagementDrawer);
        _drawerInstance.init(panelContent);
        
        // Determine if current user is leader
        const isLeader = _selectedTeam.playerRoster.some(
            player => player.userId === _currentUser.uid && player.role === 'leader'
        );
        
        // Update drawer with team data
        _drawerInstance.updateTeamData(_selectedTeam, isLeader);
        
        console.log('🔧 Team management drawer initialized for team:', _selectedTeam.teamName);
    }
    
    // Handle join/create team
    function _handleJoinCreateTeam() {
        if (!_currentUser || !_userProfile) {
            console.error('❌ User not authenticated');
            return;
        }
        
        // Check if OnboardingModal is available
        if (typeof OnboardingModal === 'undefined') {
            console.error('❌ OnboardingModal not available');
            return;
        }
        
        OnboardingModal.show(_currentUser, _userProfile);
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
        
        // Clean up drawer instance
        if (_drawerInstance) {
            _drawerInstance.cleanup();
            _drawerInstance = null;
            console.log('🧹 Cleaned up drawer instance');
        }
    }
    
    // Cleanup function
    function cleanup() {
        _cleanupListeners();
        _initialized = false;
    }
    
    // Public API
    return {
        init,
        updateUser,
        cleanup
    };
})();