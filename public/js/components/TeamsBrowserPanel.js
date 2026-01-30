// TeamsBrowserPanel.js - Full Teams/Players Browser for bottom panel
// Slice 5.1: Dedicated browsing view with two-panel layout and player grid
// Slice 5.1b: Teams view redesigned to full-width detail driven by Browse Teams
// Follows Cache + Listener pattern per CLAUDE.md

const TeamsBrowserPanel = (function() {
    'use strict';

    // Private state
    let _container = null;
    let _unsubscribe = null;
    let _currentView = 'teams'; // 'teams' | 'players'
    let _selectedTeamId = null;
    let _activeTab = 'details'; // 'details' | 'history' | 'h2h'
    let _searchQuery = '';
    let _divisionFilters = new Set();
    let _allTeams = [];
    let _allPlayers = [];
    let _tooltip = null;
    let _tooltipHideTimeout = null;

    // ========================================
    // Initialization
    // ========================================

    async function init(containerId, view) {
        _container = document.getElementById(containerId);
        if (!_container) {
            console.error('TeamsBrowserPanel: Container not found:', containerId);
            return;
        }

        // Set view from parameter (driven by nav tab)
        _currentView = view || 'teams';

        // Get initial data from cache (HOT PATH)
        _allTeams = TeamService.getAllTeams() || [];
        _allPlayers = _extractAllPlayers(_allTeams);

        // Render initial UI
        _render();

        // Set up real-time listener for team updates
        await _subscribeToTeams();

        // Listen for favorites changes to update star display
        window.addEventListener('favorites-updated', _handleFavoritesUpdate);

        // Listen for team selection from Browse Teams (Slice 5.1b)
        window.addEventListener('team-browser-detail-select', _handleBrowseTeamSelect);

        console.log('TeamsBrowserPanel initialized with', _allTeams.length, 'teams,', _allPlayers.length, 'players');
    }

    // ========================================
    // Firebase Listener (Component owns this)
    // ========================================

    async function _subscribeToTeams() {
        try {
            const { collection, query, where, onSnapshot } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
            );
            const db = window.firebase.db;

            const teamsQuery = query(
                collection(db, 'teams'),
                where('status', '==', 'active')
            );

            _unsubscribe = onSnapshot(teamsQuery, (snapshot) => {
                snapshot.docChanges().forEach(change => {
                    const teamData = { id: change.doc.id, ...change.doc.data() };

                    if (change.type === 'added' || change.type === 'modified') {
                        const index = _allTeams.findIndex(t => t.id === teamData.id);
                        if (index >= 0) {
                            _allTeams[index] = teamData;
                        } else {
                            _allTeams.push(teamData);
                        }
                        TeamService.updateCachedTeam(teamData.id, teamData);
                    } else if (change.type === 'removed') {
                        _allTeams = _allTeams.filter(t => t.id !== teamData.id);
                        TeamService.updateCachedTeam(teamData.id, null);

                        // Clear selection if removed team was selected
                        if (_selectedTeamId === teamData.id) {
                            _selectedTeamId = null;
                        }
                    }
                });

                // Rebuild players list and re-render current view
                _allPlayers = _extractAllPlayers(_allTeams);
                _renderCurrentView();
            }, (error) => {
                console.error('TeamsBrowserPanel: Subscription error:', error);
            });
        } catch (error) {
            console.error('TeamsBrowserPanel: Failed to subscribe:', error);
        }
    }

    // ========================================
    // Player Extraction
    // ========================================

    function _extractAllPlayers(teams) {
        const playerMap = new Map();

        teams.forEach(team => {
            (team.playerRoster || []).forEach(player => {
                // Use userId as primary key, fallback to displayName
                const key = player.userId || player.displayName;
                if (!key) return;

                const teamInfo = {
                    teamId: team.id,
                    teamName: team.teamName,
                    teamTag: team.teamTag,
                    division: _normalizeDivisions(team.divisions)?.[0],
                    divisions: _normalizeDivisions(team.divisions),
                    logoUrl: team.activeLogo?.urls?.small,
                    role: player.role,
                    joinedAt: player.joinedAt
                };

                if (!playerMap.has(key)) {
                    playerMap.set(key, {
                        ...player,
                        key,
                        teams: [teamInfo]
                    });
                } else {
                    playerMap.get(key).teams.push(teamInfo);
                }
            });
        });

        // Sort each player's teams by joinedAt (earliest = primary)
        playerMap.forEach((player) => {
            player.teams.sort((a, b) => {
                const dateA = _getDateValue(a.joinedAt);
                const dateB = _getDateValue(b.joinedAt);
                return dateA - dateB;
            });
            // Primary team is first in sorted array
            player.primaryTeam = player.teams[0];
        });

        return Array.from(playerMap.values())
            .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    }

    function _getDateValue(timestamp) {
        if (!timestamp) return new Date(0);
        if (timestamp.toDate) return timestamp.toDate();
        if (timestamp instanceof Date) return timestamp;
        return new Date(timestamp);
    }

    function _normalizeDivisions(divisions) {
        if (!divisions || !Array.isArray(divisions)) return [];
        return divisions.map(d => {
            if (typeof d === 'number') return `D${d}`;
            if (typeof d === 'string' && /^\d+$/.test(d)) return `D${d}`;
            return d;
        });
    }

    // ========================================
    // Main Render
    // ========================================

    function _render() {
        if (!_container) return;

        _container.innerHTML = `
            <div class="teams-browser flex flex-col h-full">
                ${_renderToolbar()}
                <div class="teams-browser-content flex-1 min-h-0">
                    ${_currentView === 'teams' ? _renderTeamsView() : _renderPlayersView()}
                </div>
            </div>
        `;

        _attachListeners();
    }

    function _renderCurrentView() {
        const content = _container?.querySelector('.teams-browser-content');
        if (!content) return;

        content.innerHTML = _currentView === 'teams' ? _renderTeamsView() : _renderPlayersView();
        _attachViewListeners();

        // If teams view with Details tab and a team with teamTag is selected, load map stats
        if (_currentView === 'teams' && _selectedTeamId && _activeTab === 'details') {
            const team = _allTeams.find(t => t.id === _selectedTeamId);
            if (team?.teamTag) {
                _loadMapStats(team.teamTag);
            }
        }
        // If teams view with History tab and a team with teamTag is selected, load match history
        if (_currentView === 'teams' && _selectedTeamId && _activeTab === 'history') {
            const team = _allTeams.find(t => t.id === _selectedTeamId);
            if (team?.teamTag) {
                _loadMatchHistory(team.teamTag);
            }
        }
    }

    // ========================================
    // Toolbar
    // ========================================

    function _renderToolbar() {
        // Teams mode: no toolbar needed (Browse Teams panel handles search/filters)
        // Players mode: search + division filters
        if (_currentView === 'teams') return '';

        return `
            <div class="teams-browser-toolbar flex-shrink-0 p-3 border-b border-border">
                <div class="flex items-center gap-3 mb-2">
                    <!-- Search Input -->
                    <div class="relative flex-1">
                        <input type="text"
                               id="teams-browser-search"
                               placeholder="Search players..."
                               value="${_escapeHtml(_searchQuery)}"
                               class="w-full px-3 py-1.5 pr-8 text-sm bg-muted border border-border rounded-md
                                      focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                                      placeholder:text-muted-foreground"
                        />
                        <svg class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                    </div>
                </div>

                <!-- Division Filters -->
                <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground">Filter:</span>
                    <div class="flex gap-1">
                        <button class="division-filter-btn ${_divisionFilters.has('D1') ? 'active' : ''}" data-division="D1">D1</button>
                        <button class="division-filter-btn ${_divisionFilters.has('D2') ? 'active' : ''}" data-division="D2">D2</button>
                        <button class="division-filter-btn ${_divisionFilters.has('D3') ? 'active' : ''}" data-division="D3">D3</button>
                    </div>
                </div>
            </div>
        `;
    }

    // ========================================
    // Teams View (Full-Width Detail - Slice 5.1b)
    // ========================================

    function _renderTeamsView() {
        if (!_selectedTeamId) {
            return `
                <div class="team-detail-empty">
                    <p class="text-muted-foreground text-sm">
                        Select a team from Browse Teams to view details
                    </p>
                </div>
            `;
        }

        const team = _allTeams.find(t => t.id === _selectedTeamId);
        if (!team) {
            return `
                <div class="team-detail-empty">
                    <p class="text-muted-foreground text-sm">Team not found</p>
                </div>
            `;
        }

        // Render tab bar + active tab content
        let tabContent = '';
        switch (_activeTab) {
            case 'details':
                tabContent = _renderDetailsTab(team);
                break;
            case 'history':
                tabContent = _renderMatchHistoryTab(team);
                break;
            case 'h2h':
                tabContent = '<div class="text-sm text-muted-foreground p-4">Head to Head (coming soon)</div>';
                break;
        }

        return `
            <div class="team-detail-full flex flex-col h-full">
                ${_renderTabBar()}
                <div class="team-detail-tab-content">
                    ${tabContent}
                </div>
            </div>
        `;
    }

    // ========================================
    // Tab Bar (Slice 5.2a)
    // ========================================

    function _renderTabBar() {
        const tabs = [
            { id: 'details', label: 'Details' },
            { id: 'history', label: 'Match History' },
            { id: 'h2h', label: 'Head to Head' }
        ];

        return `
            <div class="team-detail-tabs">
                ${tabs.map(tab => `
                    <button class="team-detail-tab ${_activeTab === tab.id ? 'active' : ''}"
                            data-tab="${tab.id}">
                        ${tab.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    // ========================================
    // Details Tab (Slice 5.2a)
    // ========================================

    function _renderDetailsTab(team) {
        const logoUrl = team.activeLogo?.urls?.large || team.activeLogo?.urls?.medium;
        const divisions = _normalizeDivisions(team.divisions)
            .map(d => `Division ${d.replace('D', '')}`)
            .join(', ') || 'No division';

        const roster = team.playerRoster || [];
        const sortedRoster = [...roster].sort((a, b) => {
            if (a.role === 'leader') return -1;
            if (b.role === 'leader') return 1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        const rosterHtml = sortedRoster.length > 0
            ? sortedRoster.map(player => {
                const avatarHtml = player.photoURL
                    ? `<img class="roster-avatar" src="${player.photoURL}" alt="">`
                    : `<div class="roster-avatar roster-avatar-fallback">${_escapeHtml(player.initials || (player.displayName || '?')[0].toUpperCase())}</div>`;
                return `
                    <div class="team-details-roster-item">
                        ${avatarHtml}
                        <span>${_escapeHtml(player.displayName || 'Unknown')}</span>
                        ${player.role === 'leader' ? '<span class="leader-badge">(L)</span>' : ''}
                    </div>
                `;
            }).join('')
            : '<span class="text-xs text-muted-foreground">No players</span>';

        const hasTag = !!team.teamTag;

        return `
            <div class="team-details-landing">
                <!-- Left: Identity — hero logo + centered roster -->
                <div class="team-details-identity">
                    <div class="team-details-hero">
                        <div class="team-details-logo">
                            ${logoUrl
                                ? `<img src="${logoUrl}" alt="${_escapeHtml(team.teamName)}">`
                                : `<div class="team-details-logo-placeholder">${_escapeHtml(team.teamTag || '??')}</div>`
                            }
                        </div>
                    </div>
                    <div class="team-details-roster">
                        ${rosterHtml}
                    </div>
                </div>

                <!-- Right: Title + Division + Activity + Upcoming -->
                <div class="team-details-activity">
                    <div class="team-details-right-title">
                        <span class="team-details-right-name">${_escapeHtml(team.teamName || 'Unknown Team')}</span>
                        <span class="team-details-right-division">${divisions}</span>
                    </div>
                    <div class="team-details-activity-header" id="map-stats-label">Activity</div>
                    <div id="map-stats-content" data-team-tag="${team.teamTag || ''}">
                        ${hasTag
                            ? '<div class="text-xs text-muted-foreground">Loading activity...</div>'
                            : `<div class="text-xs text-muted-foreground">
                                <p>Match history not available</p>
                                <p class="mt-1">Team leader can set QW Hub tag in Team Settings</p>
                               </div>`
                        }
                    </div>
                    ${hasTag ? `
                        <div class="team-details-activity-footer">
                            <span class="team-details-activity-total" id="map-stats-total"></span>
                            <button class="team-details-h2h-btn"
                                    onclick="TeamsBrowserPanel.switchTab('h2h')">
                                Compare H2H &rarr;
                            </button>
                        </div>
                    ` : ''}
                    <div class="team-details-upcoming">
                        <div class="team-details-upcoming-header">Upcoming</div>
                        <div class="text-xs text-muted-foreground">No scheduled games</div>
                    </div>
                </div>
            </div>
        `;
    }

    // ========================================
    // Map Stats (Slice 5.2a)
    // ========================================

    async function _loadMapStats(teamTag) {
        let container = document.getElementById('map-stats-content');
        let label = document.getElementById('map-stats-label');
        if (!container || container.dataset.teamTag !== teamTag) return;

        try {
            const stats = await QWHubService.getTeamMapStats(teamTag, 6);

            // Re-query DOM after async (original elements may have been replaced by re-render)
            container = document.getElementById('map-stats-content');
            label = document.getElementById('map-stats-label');
            if (!container || container.dataset.teamTag !== teamTag) return;

            if (!stats || stats.totalMatches === 0) {
                container.innerHTML = '<p class="text-xs text-muted-foreground">No matches found in the last 6 months</p>';
                return;
            }

            // Update header with period
            if (label) {
                label.textContent = `Last 6 months`;
            }

            // Update footer total
            const totalEl = document.getElementById('map-stats-total');
            if (totalEl) {
                totalEl.textContent = `${stats.totalMatches} matches`;
            }

            // Find max for bar scaling
            const maxCount = stats.maps[0]?.total || 1;

            container.innerHTML = `
                <div class="map-stats-list">
                    ${stats.maps.map(m => `
                        <div class="map-stat-row">
                            <span class="map-stat-name">${m.map}</span>
                            <div class="map-stat-bar">
                                <div class="map-stat-bar-fill" style="width: ${Math.round((m.total / maxCount) * 100)}%"></div>
                            </div>
                            <span class="map-stat-count">${m.total}</span>
                            <span class="map-stat-record"><span class="win">${m.wins}</span><span class="sep">-</span><span class="loss">${m.losses}</span>${m.draws > 0 ? `<span class="sep">-</span>${m.draws}` : ''}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (error) {
            console.error('Failed to load map stats:', error);
            container = document.getElementById('map-stats-content');
            if (!container || container.dataset.teamTag !== teamTag) return;

            container.innerHTML = `
                <div class="text-xs text-muted-foreground">
                    <p>Couldn't load activity data</p>
                    <button class="text-xs mt-1 text-primary hover:underline cursor-pointer"
                            onclick="TeamsBrowserPanel.retryMapStats('${_escapeHtml(teamTag)}')">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    /**
     * Retry loading map stats (called from retry button onclick).
     */
    function retryMapStats(teamTag) {
        QWHubService.clearCache();
        _loadMapStats(teamTag);
    }

    // ========================================
    // Match History (Slice 5.1b)
    // ========================================

    function _renderMatchHistoryTab(team) {
        const hasTag = !!team.teamTag;

        return `
            <div class="match-history-section">
                <div class="section-header">
                    <h4 class="section-title">Recent Matches</h4>
                    ${hasTag ? `
                        <a href="${QWHubService.getHubUrl(team.teamTag)}"
                           target="_blank"
                           class="text-xs text-muted-foreground hover:text-foreground transition-colors">
                            View on QW Hub &rarr;
                        </a>
                    ` : ''}
                </div>

                <div id="match-history-content" data-team-tag="${team.teamTag || ''}">
                    ${hasTag
                        ? '<div class="text-muted-foreground text-sm">Loading matches...</div>'
                        : `
                            <div class="text-muted-foreground text-sm">
                                <p>Match history not available</p>
                                <p class="text-xs mt-1">Team leader can configure QW Hub tag in Team Settings</p>
                            </div>
                        `
                    }
                </div>
            </div>
        `;
    }

    async function _loadMatchHistory(teamTag) {
        const container = document.getElementById('match-history-content');
        if (!container || container.dataset.teamTag !== teamTag) return;

        try {
            const matches = await QWHubService.getRecentMatches(teamTag, 5);

            // Guard against stale render (user switched teams during fetch)
            if (container.dataset.teamTag !== teamTag) return;

            if (matches.length === 0) {
                container.innerHTML = `
                    <p class="text-muted-foreground text-sm">No recent 4on4 matches found</p>
                `;
                return;
            }

            container.innerHTML = `
                <div class="match-list">
                    ${matches.map(m => _renderMatchRow(m)).join('')}
                </div>
                <p class="text-xs text-muted-foreground mt-2">Showing last ${matches.length} matches</p>
            `;
        } catch (error) {
            console.error('Failed to load match history:', error);
            if (container.dataset.teamTag !== teamTag) return;

            container.innerHTML = `
                <div class="text-muted-foreground text-sm">
                    <p>Couldn't load match history</p>
                    <button class="text-xs mt-1 text-primary hover:underline cursor-pointer"
                            onclick="TeamsBrowserPanel.retryMatchHistory('${_escapeHtml(teamTag)}')">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    // Store match data by ID for scoreboard rendering (avoids data attributes)
    const _matchDataById = new Map();

    function _renderMatchRow(match) {
        // Cache full match data for scoreboard rendering
        _matchDataById.set(String(match.id), match);

        const dateStr = match.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const resultClass = match.result === 'W' ? 'text-green-500'
                          : match.result === 'L' ? 'text-red-500'
                          : 'text-muted-foreground';

        return `
            <div class="match-row-wrapper">
                <div class="match-row clickable"
                     data-match-id="${match.id}"
                     onclick="TeamsBrowserPanel.toggleScoreboard(this)">
                    <span class="match-date">${dateStr}</span>
                    <span class="match-map">${match.map}</span>
                    <span class="match-score">
                        <span class="match-our-tag">${_escapeHtml(match.ourTag)}</span>
                        <span class="match-frags">${match.ourScore} - ${match.opponentScore}</span>
                        <span class="match-opp-tag">${_escapeHtml(match.opponentTag)}</span>
                    </span>
                    <span class="match-result ${resultClass}">${match.result}</span>
                </div>
                <div class="match-scoreboard-container" style="display:none;"></div>
            </div>
        `;
    }

    /**
     * Toggle scoreboard display for a match row.
     * Uses Supabase data (teams/players) already cached in match object — instant, no fetch needed.
     */
    function toggleScoreboard(rowEl) {
        const wrapper = rowEl.closest('.match-row-wrapper');
        const container = wrapper.querySelector('.match-scoreboard-container');

        // Toggle off if already showing
        if (container.style.display !== 'none') {
            container.style.display = 'none';
            return;
        }

        const matchId = rowEl.dataset.matchId;
        const match = _matchDataById.get(matchId);

        if (!match || !match.teams.length) {
            container.style.display = 'block';
            container.innerHTML = '<p class="text-xs text-muted-foreground p-2">No scoreboard data</p>';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = _renderScoreboard(match);
    }

    /**
     * Render hub-style scoreboard from Supabase match data.
     * Replicates hub.quakeworld.nu/src/servers/Scoreboard.jsx layout.
     */
    function _renderScoreboard(match) {
        const mapshotUrl = QWHubService.getMapshotUrl(match.map, 'lg');
        const hasTeams = match.teams.length > 0;

        // Sort teams and players by frags desc (hub behavior)
        const sortedTeams = [...match.teams].sort((a, b) => b.frags - a.frags);
        const sortedPlayers = [...match.players].sort((a, b) => b.frags - a.frags);

        // Team summary rows
        const teamRowsHtml = hasTeams ? sortedTeams.map(team => `
            <div class="sc-row">
                <span class="sc-ping">${team.ping ? team.ping + ' ms' : ''}</span>
                <span class="sc-frags" style="${QWHubService.getFragColorStyle(team.color)}">${team.frags}</span>
                <span class="sc-team">${QWHubService.coloredQuakeName(
                    team.name.substring(0, 4),
                    (team.name_color || '').substring(0, 4)
                )}</span>
                <span></span>
            </div>
        `).join('') : '';

        // Divider between teams and players
        const dividerHtml = hasTeams ? '<div class="sb-team-divider"></div>' : '';

        // Player rows
        const playerRowsHtml = sortedPlayers.map(player => {
            const pingText = player.is_bot ? '(bot)' : (player.ping ? Math.min(666, player.ping) + ' ms' : '');
            const nameClass = player.is_bot ? 'sc-name sc-name-bot' : 'sc-name';
            const cc = player.cc;
            const flagHtml = cc && cc !== 'none'
                ? `<img src="https://www.quakeworld.nu/images/flags/${cc.toLowerCase()}.gif" alt="${cc}" width="16" height="11">`
                : '';

            return `
                <div class="sc-row">
                    <span class="sc-ping">${pingText}</span>
                    <span class="sc-frags" style="${QWHubService.getFragColorStyle(player.color)}">${player.frags}</span>
                    ${hasTeams ? `<span class="sc-team">${QWHubService.coloredQuakeName(
                        (player.team || '').substring(0, 4),
                        (player.team_color || '').substring(0, 4)
                    )}</span>` : ''}
                    <span class="${nameClass}">
                        ${flagHtml}
                        <span>${QWHubService.coloredQuakeName(player.name, player.name_color)}</span>
                    </span>
                </div>
            `;
        }).join('');

        return `
            <div class="match-scoreboard" style="background-image: url('${mapshotUrl}');">
                <div class="sb-overlay sb-text-outline">
                    <div class="sb-scoreboard">
                        ${teamRowsHtml}
                        ${dividerHtml}
                        ${playerRowsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Retry loading match history (called from retry button onclick).
     */
    function retryMatchHistory(teamTag) {
        QWHubService.clearCache();
        _loadMatchHistory(teamTag);
    }

    // ========================================
    // Browse Teams Event Handler (Slice 5.1b)
    // ========================================

    function _handleBrowseTeamSelect(event) {
        const { teamId } = event.detail;
        if (!teamId) return;

        // If not in teams view, switch to it via the BottomPanelController
        if (_currentView !== 'teams') {
            if (typeof BottomPanelController !== 'undefined') {
                // Store the pending team selection for after tab switch
                _selectedTeamId = teamId;
                _activeTab = 'details'; // Reset to Details on new team
                BottomPanelController.switchTab('teams');
                return; // switchTab will re-init us in teams mode
            }
        }

        // Reset to Details tab when selecting a new team
        _activeTab = 'details';
        _selectedTeamId = teamId;
        _render(); // Full re-render

        // Load map stats if team has tag (Details tab is default)
        const team = _allTeams.find(t => t.id === teamId);
        if (team?.teamTag) {
            _loadMapStats(team.teamTag);
        }
    }

    /**
     * Switch to a specific tab. Public method for programmatic tab switching
     * (e.g., H2H button calls switchTab('h2h')).
     */
    function switchTab(tabName) {
        if (!_selectedTeamId) return;
        _activeTab = tabName;
        _renderCurrentView();
    }

    // ========================================
    // Players View (Grid) - UNCHANGED from Slice 5.1
    // ========================================

    function _renderPlayersView() {
        const filteredPlayers = _getFilteredPlayers();

        return `
            <div class="players-grid-container overflow-y-auto h-full p-3">
                ${filteredPlayers.length > 0 ? `
                    <div class="players-grid">
                        ${filteredPlayers.map(player => _renderPlayerCard(player)).join('')}
                    </div>
                ` : `
                    <div class="empty-state flex flex-col items-center justify-center h-full text-center">
                        <p class="text-sm text-muted-foreground">No players found</p>
                        <p class="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
                    </div>
                `}
            </div>
        `;
    }

    function _renderPlayerCard(player) {
        const primaryTeam = player.primaryTeam || {};
        const logoUrl = primaryTeam.logoUrl;

        return `
            <div class="player-card" data-player-key="${_escapeHtml(player.key)}">
                <!-- Team Logo -->
                <div class="player-card-logo flex-shrink-0">
                    ${logoUrl
                        ? `<img src="${logoUrl}" alt="${primaryTeam.teamTag}" class="w-full h-full object-cover">`
                        : `<span class="text-xs font-bold text-muted-foreground">${primaryTeam.teamTag || '??'}</span>`
                    }
                </div>
                <!-- Player Name -->
                <div class="player-card-name" title="${_escapeHtml(player.displayName || '')}">
                    ${_escapeHtml(player.displayName || 'Unknown')}
                </div>
                ${player.teams.length > 1 ? `<div class="player-card-multi-badge">+${player.teams.length - 1}</div>` : ''}
            </div>
        `;
    }

    // ========================================
    // Filtering (Players view only now)
    // ========================================

    function _getFilteredPlayers() {
        const query = _searchQuery.toLowerCase();

        return _allPlayers.filter(player => {
            // Division filter: show player if ANY of their teams match
            if (_divisionFilters.size > 0) {
                const hasMatchingTeam = player.teams.some(team => {
                    const teamDivisions = team.divisions || [];
                    return teamDivisions.some(d => _divisionFilters.has(d));
                });
                if (!hasMatchingTeam) return false;
            }

            // Search filter
            if (query) {
                const nameMatch = (player.displayName || '').toLowerCase().includes(query);
                if (!nameMatch) return false;
            }

            return true;
        });
    }

    // ========================================
    // Event Handlers
    // ========================================

    function _attachListeners() {
        // Search input (only present in Players mode)
        const searchInput = _container.querySelector('#teams-browser-search');
        searchInput?.addEventListener('input', (e) => {
            _searchQuery = e.target.value.trim();
            _renderCurrentView();
        });

        // Division filters (only present in Players mode)
        _container.querySelectorAll('.division-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const division = btn.dataset.division;
                if (_divisionFilters.has(division)) {
                    _divisionFilters.delete(division);
                    btn.classList.remove('active');
                } else {
                    _divisionFilters.add(division);
                    btn.classList.add('active');
                }
                _renderCurrentView();
            });
        });

        _attachViewListeners();
    }

    function _attachViewListeners() {
        if (_currentView === 'teams') {
            _attachTeamsViewListeners();
        } else {
            _attachPlayersViewListeners();
        }
    }

    function _attachTeamsViewListeners() {
        // Tab click listeners
        _container.querySelectorAll('.team-detail-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                if (tabId && tabId !== _activeTab) {
                    switchTab(tabId);
                }
            });
        });
    }

    function _attachPlayersViewListeners() {
        // Player cards with tooltip
        _container.querySelectorAll('.player-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                const playerKey = card.dataset.playerKey;
                const player = _allPlayers.find(p => p.key === playerKey);
                if (player && player.teams.length > 0) {
                    _showPlayerTooltip(card, player);
                }
            });

            card.addEventListener('mouseleave', () => {
                _hideTooltip();
            });
        });
    }

    function _handleFavoritesUpdate() {
        _renderCurrentView();
    }

    // ========================================
    // Player Tooltip
    // ========================================

    function _createTooltip() {
        if (_tooltip) return;

        _tooltip = document.createElement('div');
        _tooltip.id = 'teams-browser-tooltip';
        _tooltip.className = 'player-tooltip';
        _tooltip.style.display = 'none';
        document.body.appendChild(_tooltip);

        _tooltip.addEventListener('mouseenter', () => {
            if (_tooltipHideTimeout) {
                clearTimeout(_tooltipHideTimeout);
                _tooltipHideTimeout = null;
            }
        });

        _tooltip.addEventListener('mouseleave', () => {
            _hideTooltip();
        });
    }

    function _showPlayerTooltip(card, player) {
        _createTooltip();

        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }

        // Build tooltip content
        const teamsHtml = player.teams.map((team, index) => {
            const isPrimary = index === 0;
            const roleText = team.role === 'leader' ? ' (Leader)' : '';
            return `
                <div class="tooltip-team-entry ${isPrimary ? 'tooltip-primary-team' : ''}">
                    <div class="tooltip-team-name">
                        ${team.teamName || 'Unknown'} (${team.division || 'No div'})${roleText}
                    </div>
                </div>
            `;
        }).join('');

        _tooltip.innerHTML = `
            <div class="tooltip-header">${_escapeHtml(player.displayName || 'Unknown')} plays for:</div>
            <div class="tooltip-list">
                ${teamsHtml}
            </div>
        `;

        // Position tooltip
        const cardRect = card.getBoundingClientRect();

        _tooltip.style.visibility = 'hidden';
        _tooltip.style.display = 'block';
        const tooltipRect = _tooltip.getBoundingClientRect();

        // Show above the card if there's room, otherwise below
        let left = cardRect.left + (cardRect.width / 2) - (tooltipRect.width / 2);
        let top = cardRect.top - tooltipRect.height - 8;

        if (top < 8) {
            top = cardRect.bottom + 8;
        }

        // Keep within viewport horizontally
        if (left < 8) left = 8;
        if (left + tooltipRect.width > window.innerWidth - 8) {
            left = window.innerWidth - tooltipRect.width - 8;
        }

        _tooltip.style.left = `${left}px`;
        _tooltip.style.top = `${top}px`;
        _tooltip.style.visibility = 'visible';
    }

    function _hideTooltip() {
        _tooltipHideTimeout = setTimeout(() => {
            if (_tooltip) {
                _tooltip.style.display = 'none';
            }
        }, 150);
    }

    // ========================================
    // Utilities
    // ========================================

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // ========================================
    // Cleanup
    // ========================================

    function cleanup() {
        // Unsubscribe from Firebase
        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }

        // Remove event listeners
        window.removeEventListener('favorites-updated', _handleFavoritesUpdate);
        window.removeEventListener('team-browser-detail-select', _handleBrowseTeamSelect);

        // Cleanup tooltip
        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }
        if (_tooltip) {
            _tooltip.remove();
            _tooltip = null;
        }

        // Reset state
        _container = null;
        _currentView = 'teams';
        _selectedTeamId = null;
        _activeTab = 'details';
        _searchQuery = '';
        _divisionFilters.clear();
        _allTeams = [];
        _allPlayers = [];

        console.log('TeamsBrowserPanel cleaned up');
    }

    // Public API
    return {
        init,
        cleanup,
        switchTab,
        retryMapStats,
        retryMatchHistory,
        toggleScoreboard
    };
})();
