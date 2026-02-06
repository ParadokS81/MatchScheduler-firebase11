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
    let _playersSortMode = 'alpha'; // 'alpha' | 'teams'
    let _pendingTeamId = null;       // Survives cleanup for cross-view navigation

    // Slice 5.2b: Match History split-panel state
    let _historyMatches = [];        // Full fetched match list (all within period)
    let _historyMapFilter = '';       // '' = all maps
    let _historyOpponentFilter = '';  // '' = all opponents
    let _historyPeriod = 3;           // Default 3 months
    let _hoveredMatchId = null;       // Currently hovered match (preview)
    let _selectedMatchId = null;      // Clicked/sticky match
    let _selectedMatchStats = null;   // ktxstats for selected match
    let _statsLoading = false;        // Loading indicator for ktxstats fetch

    // Sortable table state
    let _sortColumn = 'date';         // 'date' | 'map' | 'scoreUs' | 'scoreThem' | 'opponent' | 'result'
    let _sortDirection = 'desc';      // 'asc' | 'desc'

    // Stats table tab state
    let _activeStatsTab = 'performance'; // 'performance' | 'weapons' | 'resources'

    // Slice 11.0a: H2H state
    let _h2hTeamAId = null;           // Override Team A id (null = use _selectedTeamId)
    let _h2hOpponentId = null;        // Selected Team B id (from MatchScheduler teams)

    /** Effective Team A for H2H — override or browsed team (only if has teamTag) */
    function _getH2HTeamAId() {
        if (_h2hTeamAId) return _h2hTeamAId;
        // Only use browsed team as default if it has a teamTag
        const selectedTeam = _allTeams.find(t => t.id === _selectedTeamId);
        return selectedTeam?.teamTag ? _selectedTeamId : null;
    }
    let _h2hSubTab = 'h2h';           // Active sub-tab: 'h2h' | 'form' | 'maps'
    let _h2hPeriod = 3;               // Period in months: 1, 3, or 6
    let _h2hMapFilter = '';            // '' = all maps (H2H sub-tab only)
    let _h2hResults = null;            // API response from /api/h2h
    let _h2hRosterA = null;            // API response from /api/roster for Team A
    let _h2hRosterB = null;            // API response from /api/roster for Team B
    let _h2hLoading = false;           // Loading state for H2H data fetch
    let _h2hHoveredId = null;          // Hovered result row (for scoreboard preview)
    let _h2hSelectedId = null;         // Clicked/sticky result row
    let _h2hSelectedStats = null;      // ktxstats for selected result
    let _h2hStatsLoading = false;      // Loading ktxstats
    const _h2hDataById = new Map();    // Result objects by ID for hover/click lookup

    // Slice 11.0b: Form tab state
    let _formResultsA = null;          // QWStatsService.getForm() response for Team A
    let _formResultsB = null;          // QWStatsService.getForm() response for Team B
    let _formLoading = false;          // Loading state
    let _formHoveredSide = null;       // 'left' | 'right' | null
    let _formHoveredId = null;         // Hovered result ID
    let _formSelectedSide = null;      // 'left' | 'right' | null — sticky selection
    let _formSelectedId = null;        // Clicked/sticky result ID
    let _formSelectedStats = null;     // ktxstats for selected result
    let _formStatsLoading = false;     // Loading ktxstats
    const _formDataByIdA = new Map();  // Team A result objects by ID
    const _formDataByIdB = new Map();  // Team B result objects by ID

    // Slice 11.0c: Maps tab state
    let _mapsDataA = null;             // QWStatsService.getMaps() for Team A
    let _mapsDataB = null;             // QWStatsService.getMaps() for Team B
    let _mapsLoading = false;          // Loading state

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

        // If cache wasn't ready yet, wait for it and re-render
        if (_allTeams.length === 0 && !TeamService.isCacheReady()) {
            const checkCache = setInterval(() => {
                if (TeamService.isCacheReady()) {
                    clearInterval(checkCache);
                    _allTeams = TeamService.getAllTeams() || [];
                    _allPlayers = _extractAllPlayers(_allTeams);
                    _render();
                }
            }, 200);
            setTimeout(() => clearInterval(checkCache), 10000);
        }

        _allPlayers = _extractAllPlayers(_allTeams);

        // Check for pending cross-view team selection (e.g. players → teams)
        if (_pendingTeamId) {
            _selectedTeamId = _pendingTeamId;
            _activeTab = 'details';
            _pendingTeamId = null;
        }

        // Render initial UI
        _render();

        // Load map stats if team was pre-selected
        if (_selectedTeamId) {
            const team = _allTeams.find(t => t.id === _selectedTeamId);
            if (team?.teamTag) _loadMapStats(team.teamTag);
        }

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
        // If teams view with H2H tab and opponent selected, lazy-load H2H data
        if (_currentView === 'teams' && _selectedTeamId && _activeTab === 'h2h' && _h2hOpponentId) {
            const team = _allTeams.find(t => t.id === _getH2HTeamAId());
            const opponent = _allTeams.find(t => t.id === _h2hOpponentId);
            if (team?.teamTag && opponent?.teamTag && !_h2hResults && !_h2hLoading) {
                _loadH2HData();
            }
        }
    }

    // ========================================
    // Toolbar
    // ========================================

    function _renderToolbar() {
        // Teams mode: no toolbar needed (Browse Teams panel handles search/filters)
        if (_currentView === 'teams') return '';

        // Players mode: sort toggle (A-Z vs By Team)
        return `
            <div class="teams-browser-toolbar flex-shrink-0 px-4 py-2 border-b border-border">
                <div class="flex items-center gap-3">
                    <span class="text-xs text-muted-foreground">Sort:</span>
                    <div class="flex gap-1">
                        <button class="division-filter-btn ${_playersSortMode === 'alpha' ? 'active' : ''}" data-sort-mode="alpha">A-Z</button>
                        <button class="division-filter-btn ${_playersSortMode === 'teams' ? 'active' : ''}" data-sort-mode="teams">By Team</button>
                    </div>
                </div>
            </div>
        `;
    }

    // ========================================
    // Division Overview (No team selected)
    // ========================================

    function _renderDivisionOverview() {
        const divisions = { 'D1': [], 'D2': [], 'D3': [] };

        _allTeams.forEach(team => {
            const norms = _normalizeDivisions(team.divisions);
            norms.forEach(div => {
                if (divisions[div]) {
                    divisions[div].push(team);
                }
            });
        });

        // Sort each division alphabetically
        Object.values(divisions).forEach(list =>
            list.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || ''))
        );

        function renderColumn(divLabel, teams) {
            const rows = teams.map(team => {
                const logoUrl = team.activeLogo?.urls?.small;
                const tag = team.teamTag || '??';
                const badgeContent = logoUrl
                    ? `<img src="${logoUrl}" alt="${tag}" class="w-full h-full object-contain">`
                    : `<span>${tag}</span>`;
                const playerCount = (team.playerRoster || []).length;

                return `
                    <tr class="division-overview-row" data-team-id="${team.id}">
                        <td class="division-overview-badge">
                            <div class="team-tag-badge">${badgeContent}</div>
                        </td>
                        <td class="division-overview-name">${team.teamName || tag}</td>
                        <td class="division-overview-players">${playerCount}</td>
                    </tr>
                `;
            }).join('');

            return `
                <div class="division-overview-column">
                    <div class="division-overview-header">
                        <span>${divLabel}</span>
                        <svg class="header-players-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <div class="division-overview-scroll">
                        <table class="division-overview-table">
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        return `
            <div class="division-overview">
                ${renderColumn('Division 1', divisions['D1'])}
                ${renderColumn('Division 2', divisions['D2'])}
                ${renderColumn('Division 3', divisions['D3'])}
            </div>
        `;
    }

    // ========================================
    // Teams View (Full-Width Detail - Slice 5.1b)
    // ========================================

    function _renderTeamsView() {
        if (!_selectedTeamId) {
            return _renderDivisionOverview();
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
                tabContent = _renderH2HTab(team);
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
        const isH2H = _activeTab === 'h2h';

        const h2hSubTabs = [
            { id: 'h2h', label: 'Head to Head' },
            { id: 'form', label: 'Form' },
            { id: 'maps', label: 'Maps' }
        ];

        return `
            <div class="team-detail-tabs">
                <button class="team-detail-tab ${_activeTab === 'details' ? 'active' : ''}"
                        data-tab="details">
                    Details
                </button>
                <button class="team-detail-tab ${_activeTab === 'history' ? 'active' : ''}"
                        data-tab="history">
                    Match History
                </button>
                ${isH2H ? `
                    <div class="h2h-tab-cluster">
                        ${h2hSubTabs.map(st => `
                            <button class="h2h-cluster-tab ${_h2hSubTab === st.id ? 'active' : ''}"
                                    onclick="TeamsBrowserPanel.switchH2HSubTab('${st.id}')">
                                ${st.label}
                            </button>
                        `).join('')}
                    </div>
                ` : `
                    <button class="team-detail-tab" data-tab="h2h">
                        Head to Head
                    </button>
                `}
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
                <!-- Left: Identity — title spanning, then logo + roster side by side -->
                <div class="team-details-identity">
                    <div class="team-details-identity-title">
                        <span class="team-details-right-name">${_escapeHtml(team.teamName || 'Unknown Team')}</span>
                        <span class="team-details-right-division">${divisions}</span>
                    </div>
                    <div class="team-details-identity-body">
                        <div class="team-details-logo">
                            ${logoUrl
                                ? `<img src="${logoUrl}" alt="${_escapeHtml(team.teamName)}">`
                                : `<div class="team-details-logo-placeholder">${_escapeHtml(team.teamTag || '??')}</div>`
                            }
                        </div>
                        <div class="team-details-roster">
                            ${rosterHtml}
                        </div>
                    </div>
                </div>

                <!-- Right: Activity + Upcoming -->
                <div class="team-details-activity">
                    <div class="team-details-activity-title">
                        <span class="team-details-right-name">Match Stats</span>
                        <span class="team-details-right-division">Last 6 months</span>
                    </div>
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

        if (!hasTag) {
            return `
                <div class="text-sm text-muted-foreground p-4">
                    <p>Match history not available</p>
                    <p class="text-xs mt-1">Team leader can configure QW Hub tag in Team Settings</p>
                </div>
            `;
        }

        return `
            <div class="match-history-split" data-team-tag="${team.teamTag}">
                <!-- Left: Match List -->
                <div class="mh-list-panel">
                    ${_renderMatchFilters()}
                    <div class="mh-match-list" id="mh-match-list">
                        <div class="text-xs text-muted-foreground p-2">Loading matches...</div>
                    </div>
                </div>

                <!-- Right: Preview Panel -->
                <div class="mh-preview-panel" id="mh-preview-panel">
                    <div class="mh-preview-empty">
                        <p class="text-xs text-muted-foreground">Hover a match to preview scoreboard</p>
                    </div>
                </div>
            </div>
        `;
    }

    // Store match data by ID for scoreboard rendering (avoids data attributes)
    const _matchDataById = new Map();

    /**
     * Render the match filter bar (map dropdown derived from fetched data).
     */
    function _renderMatchFilters() {
        const uniqueMaps = [...new Set(_historyMatches.map(m => m.map))].sort();
        const uniqueOpponents = [...new Set(_historyMatches.map(m => m.opponentTag))].sort();

        return `
            <div class="mh-filters">
                <select class="mh-filter-select" id="mh-map-filter"
                        onchange="TeamsBrowserPanel.filterByMap(this.value)">
                    <option value="">All Maps</option>
                    ${uniqueMaps.map(map => `
                        <option value="${map}" ${_historyMapFilter === map ? 'selected' : ''}>${map}</option>
                    `).join('')}
                </select>
                <select class="mh-filter-select" id="mh-opponent-filter"
                        onchange="TeamsBrowserPanel.filterByOpponent(this.value)">
                    <option value="">All Opponents</option>
                    ${uniqueOpponents.map(opp => `
                        <option value="${opp}" ${_historyOpponentFilter === opp ? 'selected' : ''}>${_escapeHtml(opp)}</option>
                    `).join('')}
                </select>
                <select class="mh-filter-select mh-period-select" id="mh-period-filter"
                        onchange="TeamsBrowserPanel.changePeriod(Number(this.value))">
                    <option value="3" ${_historyPeriod === 3 ? 'selected' : ''}>3 months</option>
                    <option value="6" ${_historyPeriod === 6 ? 'selected' : ''}>6 months</option>
                </select>
            </div>
        `;
    }

    /**
     * Sort matches by current sort column and direction.
     */
    function _sortMatches(matches) {
        const sorted = [...matches];
        const dir = _sortDirection === 'asc' ? 1 : -1;

        sorted.sort((a, b) => {
            switch (_sortColumn) {
                case 'date':
                    return dir * (a.date - b.date);
                case 'map':
                    return dir * a.map.localeCompare(b.map);
                case 'scoreUs':
                    return dir * (a.ourScore - b.ourScore);
                case 'scoreThem':
                    return dir * (a.opponentScore - b.opponentScore);
                case 'opponent':
                    return dir * a.opponentTag.localeCompare(b.opponentTag);
                case 'result':
                    // W > D > L
                    const order = { 'W': 2, 'D': 1, 'L': 0 };
                    return dir * ((order[a.result] || 0) - (order[b.result] || 0));
                default:
                    return 0;
            }
        });
        return sorted;
    }

    /**
     * Handle column header click for sorting.
     */
    function sortByColumn(column) {
        if (_sortColumn === column) {
            _sortDirection = _sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            _sortColumn = column;
            _sortDirection = column === 'date' ? 'desc' : 'desc';
        }
        _applyFiltersAndUpdate();
    }

    /**
     * Switch the stats table tab (Performance / Weapons / Resources).
     * Re-renders just the preview panel to show the new tab.
     */
    function switchStatsTab(tab) {
        _activeStatsTab = tab;
        if (_selectedMatchId && _selectedMatchStats) {
            const panel = document.getElementById('mh-preview-panel');
            if (panel) {
                panel.innerHTML = _renderPreviewPanel(_selectedMatchId);
            }
        }
    }

    /**
     * Render sort indicator arrow for a column header.
     */
    function _sortIndicator(column) {
        if (_sortColumn !== column) return '';
        return _sortDirection === 'asc' ? ' &#9650;' : ' &#9660;';
    }

    /**
     * Render the left-panel match list as a sortable table.
     */
    function _renderMatchList(matches) {
        if (matches.length === 0) {
            return '<p class="text-xs text-muted-foreground p-2">No matches found</p>';
        }

        const sorted = _sortMatches(matches);

        const headerHtml = `
            <div class="mh-table-header">
                <span class="mh-th mh-th-date" onclick="TeamsBrowserPanel.sortByColumn('date')">date${_sortIndicator('date')}</span>
                <span></span>
                <span class="mh-th mh-th-map" onclick="TeamsBrowserPanel.sortByColumn('map')">map${_sortIndicator('map')}</span>
                <span class="mh-th mh-th-us">us</span>
                <span class="mh-th mh-th-score" onclick="TeamsBrowserPanel.sortByColumn('scoreUs')">#${_sortIndicator('scoreUs')}</span>
                <span class="mh-th mh-th-score" onclick="TeamsBrowserPanel.sortByColumn('scoreThem')">#${_sortIndicator('scoreThem')}</span>
                <span class="mh-th mh-th-vs" onclick="TeamsBrowserPanel.sortByColumn('opponent')">vs${_sortIndicator('opponent')}</span>
                <span class="mh-th mh-th-result" onclick="TeamsBrowserPanel.sortByColumn('result')">w/l${_sortIndicator('result')}</span>
            </div>
        `;

        const rowsHtml = sorted.map(m => {
            const dateStr = m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const resultClass = m.result === 'W' ? 'mh-result-win'
                              : m.result === 'L' ? 'mh-result-loss'
                              : 'mh-result-draw';
            const isSelected = String(m.id) === _selectedMatchId;

            return `
                <div class="mh-table-row ${isSelected ? 'selected' : ''}"
                     data-match-id="${m.id}"
                     onmouseenter="TeamsBrowserPanel.previewMatch('${m.id}')"
                     onmouseleave="TeamsBrowserPanel.clearPreview()"
                     onclick="TeamsBrowserPanel.selectMatch('${m.id}')">
                    <span class="mh-td mh-td-date">${dateStr}</span>
                    <span></span>
                    <span class="mh-td mh-td-map">${m.map}</span>
                    <span class="mh-td mh-td-us">${_escapeHtml(m.ourTag)}</span>
                    <span class="mh-td mh-td-score">${m.ourScore}</span>
                    <span class="mh-td mh-td-score">${m.opponentScore}</span>
                    <span class="mh-td mh-td-opponent">${_escapeHtml(m.opponentTag)}</span>
                    <span class="mh-td mh-td-result ${resultClass}">${m.result}</span>
                </div>
            `;
        }).join('');

        return headerHtml + rowsHtml;
    }

    /**
     * Render unified stats-on-map view: map background + stats table + action links.
     * Shown when a match is sticky-selected and ktxstats are loaded.
     */
    function _renderStatsView(match, ktxstats) {
        const mapshotUrl = QWHubService.getMapshotUrl(match.map, 'lg');
        const hubUrl = `https://hub.quakeworld.nu/games/?gameId=${match.id}`;
        const tableHtml = _renderStatsTable(ktxstats, match);

        return `
            <div class="mh-stats-view" style="background-image: url('${mapshotUrl}');">
                <div class="mh-stats-overlay sb-text-outline">
                    ${tableHtml}
                    <div class="mh-actions">
                        <a href="${hubUrl}" target="_blank" class="mh-action-link">
                            View on QW Hub &rarr;
                        </a>
                        <button class="mh-action-link" onclick="TeamsBrowserPanel.openFullStats('${match.id}')">
                            Full Stats &#x29C9;
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render the right-panel preview.
     * Hover: classic scoreboard. Click (sticky): unified stats-on-map view.
     */
    function _renderPreviewPanel(matchId) {
        const match = _matchDataById.get(String(matchId));
        if (!match) return '';

        const isSticky = String(matchId) === _selectedMatchId;

        if (isSticky) {
            if (_selectedMatchStats && !_statsLoading) {
                // Unified stats-on-map view
                return _renderStatsView(match, _selectedMatchStats);
            }
            // Still loading — show scoreboard + loading indicator
            let html = _renderScoreboard(match);
            if (_statsLoading) {
                html += '<div class="mh-stats-loading sb-text-outline">Loading stats...</div>';
            }
            return html;
        }

        // Hover — scoreboard + summary if ktxstats cached
        let html = _renderScoreboard(match);
        const cachedStats = match.demoHash ? QWHubService.getCachedGameStats(match.demoHash) : null;
        if (cachedStats) {
            html += _renderScoreboardSummary(cachedStats, match);
        }
        return html;
    }

    // Track ApexCharts instance for cleanup
    let _activityChart = null;

    /**
     * Resolve a CSS custom property to a hex color string.
     * Needed because ApexCharts can't use oklch() or var() in JS options.
     */
    function _cssVarToHex(varName) {
        const temp = document.createElement('div');
        temp.style.color = `var(${varName})`;
        temp.style.display = 'none';
        document.body.appendChild(temp);
        const computed = getComputedStyle(temp).color;
        document.body.removeChild(temp);
        // computed is usually "rgb(r, g, b)" or "rgba(r, g, b, a)"
        const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;
        const [, r, g, b] = match;
        return '#' + [r, g, b].map(c => Number(c).toString(16).padStart(2, '0')).join('');
    }

    /**
     * Return container HTML for the activity chart.
     * Call _mountActivityChart() after inserting into DOM.
     */
    function _renderActivityGraph(matches) {
        return `
            <div class="mh-activity-section">
                <div class="mh-section-label">Activity <span class="mh-activity-total">${matches.length} matches</span></div>
                <div id="mh-activity-chart"></div>
            </div>
        `;
    }

    /**
     * Mount ApexCharts line chart into #mh-activity-chart.
     * Must be called after the container is in the DOM.
     */
    function _mountActivityChart(matches) {
        // Destroy previous instance
        if (_activityChart) {
            _activityChart.destroy();
            _activityChart = null;
        }

        const el = document.getElementById('mh-activity-chart');
        if (!el || matches.length === 0) return;

        // Build weekly buckets spanning the full period
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth() - _historyPeriod, now.getDate());

        // Get Monday of periodStart's week
        const startDay = periodStart.getDay();
        const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
        const firstMonday = new Date(periodStart);
        firstMonday.setDate(periodStart.getDate() + mondayOffset);
        firstMonday.setHours(0, 0, 0, 0);

        // Generate all weeks
        const weeks = [];
        const cursor = new Date(firstMonday);
        while (cursor <= now) {
            weeks.push({ start: new Date(cursor), count: 0 });
            cursor.setDate(cursor.getDate() + 7);
        }

        // Bucket matches into weeks
        matches.forEach(m => {
            const matchDate = m.date;
            for (let i = weeks.length - 1; i >= 0; i--) {
                if (matchDate >= weeks[i].start) {
                    weeks[i].count++;
                    break;
                }
            }
        });

        if (weeks.length < 2) return;

        // Resolve CSS custom properties to hex for ApexCharts
        // (ApexCharts can't use oklch() or var() in its JS options)
        const chartColor = _cssVarToHex('--primary') || '#6366f1';
        const mutedColor = _cssVarToHex('--muted-foreground') || '#888888';

        const options = {
            chart: {
                type: 'area',
                height: 120,
                sparkline: { enabled: false },
                toolbar: { show: false },
                zoom: { enabled: false },
                background: 'transparent',
                fontFamily: 'inherit',
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 400
                }
            },
            theme: { mode: 'dark' },
            series: [{
                name: 'Matches',
                data: weeks.map(w => w.count)
            }],
            xaxis: {
                categories: weeks.map((w, i) => {
                    // Show month abbreviation at first week and at month boundaries
                    if (i === 0) return w.start.toLocaleDateString('en-US', { month: 'short' });
                    const prevMonth = weeks[i - 1].start.getMonth();
                    const curMonth = w.start.getMonth();
                    if (curMonth !== prevMonth) {
                        return w.start.toLocaleDateString('en-US', { month: 'short' });
                    }
                    return ' ';
                }),
                labels: {
                    show: true,
                    rotate: 0,
                    hideOverlappingLabels: false,
                    trim: false,
                    style: { fontSize: '10px', colors: mutedColor }
                },
                axisBorder: { show: false },
                axisTicks: { show: false },
                tooltip: {
                    enabled: true,
                    formatter: function(val, opts) {
                        const idx = opts?.dataPointIndex;
                        if (idx !== undefined && idx >= 0 && idx < weeks.length) {
                            return weeks[idx].start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }
                        return val;
                    }
                }
            },
            yaxis: {
                show: false,
                min: 0
            },
            colors: [chartColor],
            stroke: {
                curve: 'smooth',
                width: 2
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.3,
                    opacityTo: 0.05,
                    stops: [0, 100]
                }
            },
            dataLabels: {
                enabled: true,
                formatter: function(val) { return val > 0 ? val : ''; },
                offsetY: -6,
                style: {
                    fontSize: '9px',
                    colors: [mutedColor],
                    fontWeight: 400
                },
                background: { enabled: false }
            },
            markers: {
                size: 0,
                hover: { size: 4 }
            },
            tooltip: {
                theme: 'dark',
                x: { show: true },
                y: {
                    formatter: function(val) { return val + ' matches'; }
                }
            },
            grid: {
                show: false,
                padding: { left: 4, right: 4, top: 0, bottom: 0 }
            }
        };

        _activityChart = new ApexCharts(el, options);
        _activityChart.render();
    }

    /**
     * Render summary stats panel (shown when no match is hovered/selected).
     * Derives all data client-side from filtered matches.
     * Breakdowns adapt to active filters:
     *   - Map filtered → show only Opponents breakdown
     *   - Opponent filtered → show only Maps breakdown
     *   - Both/neither → show both breakdowns
     */
    function _renderSummaryPanel() {
        const filtered = _getFilteredHistoryMatches();
        if (filtered.length === 0 && _historyMatches.length === 0) {
            return `
                <div class="mh-preview-empty">
                    <p class="text-xs text-muted-foreground">No match data available</p>
                </div>
            `;
        }

        // Use filtered matches for activity + breakdowns
        const matches = filtered.length > 0 ? filtered : _historyMatches;

        // --- Weekly activity line graph (reflects filters) ---
        const activityHtml = _renderActivityGraph(matches);

        // Determine which breakdowns to show based on active filters
        const hasMapFilter = !!_historyMapFilter;
        const hasOppFilter = !!_historyOpponentFilter;
        const showMaps = !hasMapFilter || hasOppFilter; // Show maps unless only map is filtered
        const showOpponents = !hasOppFilter || hasMapFilter; // Show opponents unless only opp is filtered
        // If both filters active, show both (edge case)
        // If no filters, show both (default)

        // --- Map breakdown ---
        let mapsHtml = '';
        if (showMaps) {
            const mapAgg = {};
            matches.forEach(m => {
                if (!mapAgg[m.map]) mapAgg[m.map] = { name: m.map, total: 0, wins: 0, losses: 0 };
                mapAgg[m.map].total++;
                if (m.result === 'W') mapAgg[m.map].wins++;
                else if (m.result === 'L') mapAgg[m.map].losses++;
            });
            const mapRows = Object.values(mapAgg).sort((a, b) => b.total - a.total);

            mapsHtml = `
                <div class="mh-breakdown-col">
                    <div class="mh-section-label">Maps</div>
                    <div class="mh-breakdown-table">
                        <div class="mh-breakdown-hdr">
                            <span class="mh-bd-name">Map</span>
                            <span class="mh-bd-count">#</span>
                            <span class="mh-bd-record">W-L</span>
                        </div>
                        ${mapRows.map(r => `
                            <div class="mh-breakdown-row" onclick="TeamsBrowserPanel.filterByMap('${r.name}')">
                                <span class="mh-bd-name">${r.name}</span>
                                <span class="mh-bd-count">${r.total}</span>
                                <span class="mh-bd-record"><span class="mh-bd-win">${r.wins}</span>-<span class="mh-bd-loss">${r.losses}</span></span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // --- Opponent breakdown ---
        let oppsHtml = '';
        if (showOpponents) {
            const oppAgg = {};
            matches.forEach(m => {
                const opp = m.opponentTag;
                if (!oppAgg[opp]) oppAgg[opp] = { name: opp, total: 0, wins: 0, losses: 0 };
                oppAgg[opp].total++;
                if (m.result === 'W') oppAgg[opp].wins++;
                else if (m.result === 'L') oppAgg[opp].losses++;
            });
            const oppRows = Object.values(oppAgg).sort((a, b) => b.total - a.total);

            oppsHtml = `
                <div class="mh-breakdown-col">
                    <div class="mh-section-label">Opponents</div>
                    <div class="mh-breakdown-table">
                        <div class="mh-breakdown-hdr">
                            <span class="mh-bd-name">Team</span>
                            <span class="mh-bd-count">#</span>
                            <span class="mh-bd-record">W-L</span>
                        </div>
                        ${oppRows.map(r => `
                            <div class="mh-breakdown-row" onclick="TeamsBrowserPanel.filterByOpponent('${_escapeHtml(r.name)}')">
                                <span class="mh-bd-name">${_escapeHtml(r.name)}</span>
                                <span class="mh-bd-count">${r.total}</span>
                                <span class="mh-bd-record"><span class="mh-bd-win">${r.wins}</span>-<span class="mh-bd-loss">${r.losses}</span></span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Use single column layout when only one breakdown is shown
        const isSingleCol = !showMaps || !showOpponents;
        const breakdownHtml = `
            <div class="mh-breakdown-columns ${isSingleCol ? 'mh-breakdown-single' : ''}">
                ${mapsHtml}
                ${oppsHtml}
            </div>
        `;

        return `
            <div class="mh-summary-panel">
                ${activityHtml}
                ${breakdownHtml}
            </div>
        `;
    }

    // ========================================
    // Stats Table: Per-player stats with 3 tabs
    // ========================================

    const STATS_COLUMNS = {
        performance: [
            { key: 'eff', label: 'Eff', suffix: '%' },
            { key: 'deaths', label: 'D', highlightInverse: true },
            { key: 'dmg', label: 'Dmg', format: 'k' },
            { key: 'ewep', label: 'EWEP', format: 'k' },
            { key: 'toDie', label: 'ToDie' }
        ],
        weapons: [
            { key: 'sgPct', label: '%', suffix: '%', group: 'sg' },
            { key: 'rlKills', label: 'Kills', group: 'rl', groupStart: true, groupLabel: 'Rocket Launcher' },
            { key: 'rlTook', label: 'Took', group: 'rl' },
            { key: 'rlDropped', label: 'Drop', group: 'rl', highlightInverse: true },
            { key: 'rlXfer', label: 'Xfer', group: 'rl' },
            { key: 'lgPct', label: '%', suffix: '%', group: 'lg', groupStart: true, groupLabel: 'Lightning Gun' },
            { key: 'lgKills', label: 'Kills', group: 'lg' },
            { key: 'lgTook', label: 'Took', group: 'lg' },
            { key: 'lgDropped', label: 'Drop', group: 'lg', highlightInverse: true },
            { key: 'lgXfer', label: 'Xfer', group: 'lg' }
        ],
        resources: [
            { key: 'ga', label: 'GA', colorClass: 'mh-hdr-ga' },
            { key: 'ya', label: 'YA', colorClass: 'mh-hdr-ya' },
            { key: 'ra', label: 'RA', colorClass: 'mh-hdr-ra' },
            { key: 'mh', label: 'MH', colorClass: 'mh-hdr-mh' },
            { key: 'q', label: 'Q', colorClass: 'mh-hdr-q' },
            { key: 'p', label: 'P', colorClass: 'mh-hdr-p' },
            { key: 'r', label: 'R', colorClass: 'mh-hdr-r' }
        ]
    };

    function _escapeHtmlLocal(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Extract per-player stats for a given tab.
     */
    function _extractPlayerStats(player, tab) {
        const s = player.stats || {};
        const d = player.dmg || {};
        const w = player.weapons || {};
        const it = player.items || {};

        if (tab === 'performance') {
            const eff = (s.kills + s.deaths) > 0
                ? Math.round(100 * s.kills / (s.kills + s.deaths)) : 0;
            return {
                eff,
                deaths: s.deaths || 0,
                dmg: d.given || 0,
                ewep: d['enemy-weapons'] || 0,
                toDie: d['taken-to-die'] || 0
            };
        }
        if (tab === 'weapons') {
            const sg = w.sg || {};
            const rl = w.rl || {};
            const lg = w.lg || {};
            return {
                sgPct: sg.acc && sg.acc.attacks > 0
                    ? Math.round(100 * sg.acc.hits / sg.acc.attacks) : 0,
                rlKills: rl.kills ? rl.kills.enemy || 0 : 0,
                rlTook: rl.pickups ? rl.pickups.taken || 0 : 0,
                rlDropped: rl.pickups ? rl.pickups.dropped || 0 : 0,
                rlXfer: player.xferRL || 0,
                lgPct: lg.acc && lg.acc.attacks > 0
                    ? Math.round(100 * lg.acc.hits / lg.acc.attacks) : 0,
                lgKills: lg.kills ? lg.kills.enemy || 0 : 0,
                lgTook: lg.pickups ? lg.pickups.taken || 0 : 0,
                lgDropped: lg.pickups ? lg.pickups.dropped || 0 : 0,
                lgXfer: player.xferLG || 0
            };
        }
        // resources
        return {
            ga: it.ga ? it.ga.took || 0 : 0,
            ya: it.ya ? it.ya.took || 0 : 0,
            ra: it.ra ? it.ra.took || 0 : 0,
            mh: it.health_100 ? it.health_100.took || 0 : 0,
            q: it.q ? it.q.took || 0 : 0,
            p: it.p ? it.p.took || 0 : 0,
            r: it.r ? it.r.took || 0 : 0
        };
    }

    /**
     * Aggregate team stats from an array of players for a given tab.
     * Percentages are recomputed from totals (not averaged).
     */
    function _aggregateTeamStats(players, tab) {
        if (players.length === 0) return null;

        // Sum all fields
        const agg = {};
        players.forEach(p => {
            const stats = _extractPlayerStats(p, tab);
            Object.keys(stats).forEach(key => {
                agg[key] = (agg[key] || 0) + stats[key];
            });
        });

        if (tab === 'performance') {
            // Recompute eff from totals
            const totalKills = players.reduce((s, p) => s + (p.stats?.kills || 0), 0);
            const totalDeaths = players.reduce((s, p) => s + (p.stats?.deaths || 0), 0);
            agg.eff = (totalKills + totalDeaths) > 0
                ? Math.round(100 * totalKills / (totalKills + totalDeaths)) : 0;
            // toDie is averaged
            agg.toDie = Math.round(agg.toDie / players.length);
        }
        if (tab === 'weapons') {
            // Recompute percentages from raw totals
            const sgHits = players.reduce((s, p) => s + (p.weapons?.sg?.acc?.hits || 0), 0);
            const sgAtks = players.reduce((s, p) => s + (p.weapons?.sg?.acc?.attacks || 0), 0);
            agg.sgPct = sgAtks > 0 ? Math.round(100 * sgHits / sgAtks) : 0;
            const lgHits = players.reduce((s, p) => s + (p.weapons?.lg?.acc?.hits || 0), 0);
            const lgAtks = players.reduce((s, p) => s + (p.weapons?.lg?.acc?.attacks || 0), 0);
            agg.lgPct = lgAtks > 0 ? Math.round(100 * lgHits / lgAtks) : 0;
        }
        return agg;
    }

    /**
     * Render per-player stats table with 3 toggleable tabs.
     * Replaces the old aggregated stats bar.
     */
    function _renderStatsTable(ktxstats, match) {
        if (!ktxstats || !ktxstats.players) return '';

        const tab = _activeStatsTab;
        const columns = STATS_COLUMNS[tab];
        const ourTagLower = match.ourTag.toLowerCase();

        // Filter bogus players (ping === 0) and split by team
        const validPlayers = ktxstats.players.filter(p => p.ping !== 0);
        const ourPlayers = validPlayers
            .filter(p => QWHubService.qwToAscii(p.team).toLowerCase() === ourTagLower)
            .sort((a, b) => (b.stats?.frags || 0) - (a.stats?.frags || 0));
        const theirPlayers = validPlayers
            .filter(p => QWHubService.qwToAscii(p.team).toLowerCase() !== ourTagLower)
            .sort((a, b) => (b.stats?.frags || 0) - (a.stats?.frags || 0));

        // Tab buttons
        const tabs = ['performance', 'weapons', 'resources', 'awards'];
        const tabLabels = { performance: 'Perf', weapons: 'Weapons', resources: 'Resources', awards: 'Awards' };
        const tabsHtml = tabs.map(t =>
            `<button class="mh-stab${t === tab ? ' mh-stab-active' : ''}"
                    onclick="TeamsBrowserPanel.switchStatsTab('${t}')">${tabLabels[t]}</button>`
        ).join('');

        // Awards tab — completely different layout
        if (tab === 'awards') {
            return _renderAwardsTab(tabsHtml, validPlayers);
        }

        // Header row — with group labels for weapons tab
        let headerCells = '';
        if (tab === 'weapons') {
            // Group header row: SG | RL | LG
            headerCells = columns.map(col => {
                const classes = [col.colorClass || '', col.groupStart ? 'mh-group-start' : ''].filter(Boolean).join(' ');
                return `<th class="${classes}">${col.label}</th>`;
            }).join('');
        } else {
            headerCells = columns.map(col => {
                const classes = [col.colorClass || ''].filter(Boolean).join(' ');
                return `<th class="${classes}">${col.label}</th>`;
            }).join('');
        }

        // Pre-compute per-column top value across all individual players
        const allIndividualStats = [...ourPlayers, ...theirPlayers].map(p => _extractPlayerStats(p, tab));
        const skipHighlight = new Set(['p', 'r', 'rlXfer', 'lgXfer']);
        const columnTopVal = {};
        columns.forEach(col => {
            if (skipHighlight.has(col.key) || col.noHighlight) return;
            const vals = allIndividualStats.map(s => s[col.key] || 0).filter(v => v > 0);
            const maxVal = Math.max(...vals, 0);
            // Only highlight if the top value is unique (not tied by multiple players)
            const count = vals.filter(v => v === maxVal).length;
            if (maxVal > 0 && count === 1) {
                columnTopVal[col.key] = maxVal;
            }
        });

        // Build a single data row
        function renderRow(stats, nameHtml, frags, isAggregate) {
            const rowCls = isAggregate ? 'mh-st-agg' : 'mh-st-player';
            const cells = columns.map(col => {
                const val = stats[col.key] || 0;
                let display;
                if (col.format === 'k' && val >= 1000) {
                    display = (val / 1000).toFixed(1) + 'k';
                } else {
                    display = String(val) + (col.suffix || '');
                }
                const dimmed = val === 0 ? ' mh-dim' : '';
                const groupCls = col.groupStart ? ' mh-group-start' : '';

                // Highlight #1 value for individual player rows
                const isTop = !isAggregate && val > 0 && columnTopVal[col.key] === val;
                if (isTop) {
                    const colorType = col.highlightInverse ? 'red' : 'green';
                    display = `<span class="mh-top mh-top-${colorType}">${display}</span>`;
                }

                return `<td class="${dimmed}${groupCls}">${display}</td>`;
            }).join('');
            return `<tr class="${rowCls}">
                <td class="mh-st-frags">${frags}</td>
                <td class="mh-st-name">${nameHtml}</td>
                ${cells}
            </tr>`;
        }

        // Team aggregate rows
        const ourAgg = _aggregateTeamStats(ourPlayers, tab);
        const theirAgg = _aggregateTeamStats(theirPlayers, tab);
        const ourTotalFrags = ourPlayers.reduce((s, p) => s + (p.stats?.frags || 0), 0);
        const theirTotalFrags = theirPlayers.reduce((s, p) => s + (p.stats?.frags || 0), 0);
        const ourTeamName = ourPlayers.length > 0
            ? QWHubService.qwToAscii(ourPlayers[0].team) : match.ourTag;
        const theirTeamName = theirPlayers.length > 0
            ? QWHubService.qwToAscii(theirPlayers[0].team) : (match.opponentTag || '?');

        let rowsHtml = '';
        if (ourAgg) rowsHtml += renderRow(ourAgg, `<strong>${_escapeHtmlLocal(ourTeamName)}</strong>`, ourTotalFrags, true);
        if (theirAgg) rowsHtml += renderRow(theirAgg, `<strong>${_escapeHtmlLocal(theirTeamName)}</strong>`, theirTotalFrags, true);

        // Divider between aggregates and individual players
        const colSpan = 2 + columns.length;
        rowsHtml += `<tr class="mh-st-divider"><td colspan="${colSpan}"></td></tr>`;

        // Individual player rows: our team first, then opponent
        const allPlayerGroups = [ourPlayers, theirPlayers];
        allPlayerGroups.forEach((group, groupIdx) => {
            group.forEach(player => {
                const stats = _extractPlayerStats(player, tab);
                const nameHtml = QWHubService.coloredQuakeNameFromBytes(player.name);
                rowsHtml += renderRow(stats, nameHtml, player.stats?.frags || 0, false);
            });
            // Team separator between player groups
            if (groupIdx < allPlayerGroups.length - 1 && group.length > 0) {
                rowsHtml += `<tr class="mh-st-team-sep"><td colspan="${colSpan}"></td></tr>`;
            }
        });

        // Weapon group header row (sits above the column headers)
        let groupHeaderHtml = '';
        if (tab === 'weapons') {
            groupHeaderHtml = `<tr class="mh-st-group-hdr">
                <th></th><th></th>
                <th>Shotgun</th>
                <th class="mh-group-start" colspan="4">Rocket Launcher</th>
                <th class="mh-group-start" colspan="5">Lightning Gun</th>
            </tr>`;
        }

        return `
            <div class="mh-stats-table-wrap">
                <div class="mh-stab-bar">${tabsHtml}</div>
                <div class="mh-stats-table-scroll">
                    <table class="mh-stats-table">
                        <thead>
                            ${groupHeaderHtml}
                            <tr>
                                <th class="mh-st-frags-hdr">Frags</th>
                                <th class="mh-st-name-hdr">Nick</th>
                                ${headerCells}
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ========================================
    // Match History Interaction Handlers
    // ========================================

    /**
     * Preview a match scoreboard on hover (instant from Supabase data).
     * Does NOT override sticky selection.
     */
    function previewMatch(matchId) {
        if (_selectedMatchId) return; // Don't override sticky

        _hoveredMatchId = matchId;
        const panel = document.getElementById('mh-preview-panel');
        if (panel) {
            panel.innerHTML = _renderPreviewPanel(matchId);
        }

        // Prefetch ktxstats in background — if cached, summary already shown above.
        // If not cached, fetch and re-render when ready (if still hovering this match).
        const match = _matchDataById.get(String(matchId));
        if (match?.demoHash && !QWHubService.getCachedGameStats(match.demoHash)) {
            QWHubService.getGameStats(match.demoHash).then(() => {
                if (_hoveredMatchId === matchId && !_selectedMatchId && panel) {
                    panel.innerHTML = _renderPreviewPanel(matchId);
                }
            }).catch(() => {}); // silent fail — summary is optional
        }
    }

    /**
     * Clear hover preview. If sticky selection exists, keep showing it.
     */
    function clearPreview() {
        _hoveredMatchId = null;
        if (!_selectedMatchId) {
            const panel = document.getElementById('mh-preview-panel');
            if (panel) {
                panel.innerHTML = _renderSummaryPanel();
                _mountActivityChart(_historyMatches);
            }
        }
    }

    /**
     * Click a match to stick the selection. Fetches ktxstats for team stats bar.
     * Clicking the same match again un-sticks it (toggle off).
     */
    async function selectMatch(matchId) {
        // Toggle off if clicking same match
        if (_selectedMatchId === String(matchId)) {
            _selectedMatchId = null;
            _selectedMatchStats = null;
            _statsLoading = false;
            // Mouse is still over this row, so show hover preview instead of summary
            _hoveredMatchId = String(matchId);
            const panel = document.getElementById('mh-preview-panel');
            if (panel) {
                panel.innerHTML = _renderPreviewPanel(matchId);
            }
            _updateMatchListHighlights();
            return;
        }

        _selectedMatchId = String(matchId);
        _selectedMatchStats = null;
        _statsLoading = true;
        _updateMatchListHighlights();

        // Render scoreboard immediately (from Supabase data)
        const panel = document.getElementById('mh-preview-panel');
        if (panel) {
            panel.innerHTML = _renderPreviewPanel(matchId);
        }

        // Fetch ktxstats for detailed team stats (cold path)
        const match = _matchDataById.get(String(matchId));
        if (match?.demoHash) {
            try {
                const stats = await QWHubService.getGameStats(match.demoHash);
                // Guard: still the same selected match?
                if (_selectedMatchId === String(matchId)) {
                    _selectedMatchStats = stats;
                    _statsLoading = false;
                    if (panel) {
                        panel.innerHTML = _renderPreviewPanel(matchId);
                    }
                }
            } catch (error) {
                console.error('Failed to load game stats:', error);
                _statsLoading = false;
                if (_selectedMatchId === String(matchId) && panel) {
                    panel.innerHTML = _renderPreviewPanel(matchId);
                }
            }
        } else {
            _statsLoading = false;
        }
    }

    /**
     * Apply filters and update the match list + preview panel.
     */
    function _applyFiltersAndUpdate() {
        const filtered = _getFilteredHistoryMatches();

        // Clear selection if selected match no longer in filtered list
        if (_selectedMatchId && !filtered.some(m => String(m.id) === _selectedMatchId)) {
            _selectedMatchId = null;
            _selectedMatchStats = null;
            _statsLoading = false;
        }

        // Update preview panel
        const panel = document.getElementById('mh-preview-panel');
        if (panel) {
            if (_selectedMatchId) {
                panel.innerHTML = _renderPreviewPanel(_selectedMatchId);
            } else {
                panel.innerHTML = _renderSummaryPanel();
                // Activity chart uses filtered matches to reflect current filters
                _mountActivityChart(filtered.length > 0 ? filtered : _historyMatches);
            }
        }

        // Update match list
        const listEl = document.getElementById('mh-match-list');
        if (listEl) {
            listEl.innerHTML = _renderMatchList(filtered);
        }
    }

    function filterByMap(map) {
        _historyMapFilter = map;
        // Sync dropdown
        const select = document.getElementById('mh-map-filter');
        if (select) select.value = map;
        _applyFiltersAndUpdate();
    }

    /**
     * Filter match list by opponent tag.
     */
    function filterByOpponent(tag) {
        _historyOpponentFilter = tag;
        // Sync dropdown
        const select = document.getElementById('mh-opponent-filter');
        if (select) select.value = tag;
        _applyFiltersAndUpdate();
    }

    /**
     * Change the time period and re-fetch matches.
     */
    async function changePeriod(months) {
        _historyPeriod = months;
        _selectedMatchId = null;
        _selectedMatchStats = null;
        _statsLoading = false;
        _historyMapFilter = '';
        _historyOpponentFilter = '';

        // Find current team tag from DOM
        const splitPanel = document.querySelector('.match-history-split');
        if (!splitPanel) return;
        const teamTag = splitPanel.dataset.teamTag;
        if (!teamTag) return;

        // Show loading state
        const listEl = document.getElementById('mh-match-list');
        if (listEl) {
            listEl.innerHTML = '<div class="text-xs text-muted-foreground p-2">Loading matches...</div>';
        }
        const panel = document.getElementById('mh-preview-panel');
        if (panel) {
            panel.innerHTML = '<div class="mh-preview-empty"><p class="text-xs text-muted-foreground">Loading...</p></div>';
        }

        await _loadMatchHistory(teamTag);
    }

    /**
     * Get filtered history matches based on current map + opponent filters.
     */
    function _getFilteredHistoryMatches() {
        let matches = _historyMatches;
        if (_historyMapFilter) {
            matches = matches.filter(m => m.map === _historyMapFilter);
        }
        if (_historyOpponentFilter) {
            matches = matches.filter(m => m.opponentTag === _historyOpponentFilter);
        }
        return matches;
    }

    /**
     * Update selected/hovered highlights on match rows (DOM-only, no re-render).
     */
    function _updateMatchListHighlights() {
        const rows = document.querySelectorAll('.mh-table-row');
        rows.forEach(row => {
            row.classList.toggle('selected', row.dataset.matchId === _selectedMatchId);
        });
    }

    /**
     * Placeholder for Full Stats button (Slice 5.2c).
     */
    function openFullStats(matchId) {
        console.log('Full Stats requested for match:', matchId, '(Slice 5.2c placeholder)');
    }

    /**
     * Load match history for a team tag. Fetches 20 matches and populates state.
     */
    async function _loadMatchHistory(teamTag) {
        const splitPanel = document.querySelector('.match-history-split');
        if (!splitPanel || splitPanel.dataset.teamTag !== teamTag) return;

        const listEl = document.getElementById('mh-match-list');
        if (!listEl) return;

        try {
            const matches = await QWHubService.getMatchHistory(teamTag, _historyPeriod);

            // Guard against stale render (user switched teams during fetch)
            const currentPanel = document.querySelector('.match-history-split');
            if (!currentPanel || currentPanel.dataset.teamTag !== teamTag) return;

            // Populate state
            _historyMatches = matches;
            _matchDataById.clear();
            matches.forEach(m => _matchDataById.set(String(m.id), m));

            if (matches.length === 0) {
                listEl.innerHTML = '<p class="text-xs text-muted-foreground p-2">No recent 4on4 matches found</p>';
                // Show empty summary
                const previewPanel = document.getElementById('mh-preview-panel');
                if (previewPanel) {
                    previewPanel.innerHTML = _renderSummaryPanel();
                    _mountActivityChart(matches);
                }
                return;
            }

            // Update filter dropdowns with available maps and opponents
            _updateFilterDropdowns(matches);

            // Render match list
            const filtered = _getFilteredHistoryMatches();
            listEl.innerHTML = _renderMatchList(filtered);

            // Show summary panel in right side
            const previewPanel = document.getElementById('mh-preview-panel');
            if (previewPanel && !_selectedMatchId) {
                previewPanel.innerHTML = _renderSummaryPanel();
                _mountActivityChart(matches);
            }

        } catch (error) {
            console.error('Failed to load match history:', error);
            const currentPanel = document.querySelector('.match-history-split');
            if (!currentPanel || currentPanel.dataset.teamTag !== teamTag) return;

            listEl.innerHTML = `
                <div class="text-xs text-muted-foreground p-2">
                    <p>Couldn't load match history</p>
                    <button class="text-xs mt-1 text-primary hover:underline cursor-pointer"
                            onclick="TeamsBrowserPanel.retryMatchHistory('${_escapeHtml(teamTag)}')">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    /**
     * Update filter dropdown options after match data loads.
     */
    function _updateFilterDropdowns(matches) {
        const uniqueMaps = [...new Set(matches.map(m => m.map))].sort();
        const uniqueOpponents = [...new Set(matches.map(m => m.opponentTag))].sort();

        const mapSelect = document.getElementById('mh-map-filter');
        if (mapSelect) {
            mapSelect.innerHTML = `
                <option value="">All Maps</option>
                ${uniqueMaps.map(map => `
                    <option value="${map}" ${_historyMapFilter === map ? 'selected' : ''}>${map}</option>
                `).join('')}
            `;
        }

        const oppSelect = document.getElementById('mh-opponent-filter');
        if (oppSelect) {
            oppSelect.innerHTML = `
                <option value="">All Opponents</option>
                ${uniqueOpponents.map(opp => `
                    <option value="${opp}" ${_historyOpponentFilter === opp ? 'selected' : ''}>${opp}</option>
                `).join('')}
            `;
        }
    }

    /**
     * Render awards tab with achievement cards.
     */
    function _renderAwardsTab(tabsHtml, players) {
        const awards = [
            {
                icon: '🎯', title: 'Top Fragger',
                calc: p => p.stats?.frags || 0,
                format: v => `${v} frags`
            },
            {
                icon: '⚡', title: 'Most Efficient',
                calc: p => {
                    const k = p.stats?.kills || 0, d = p.stats?.deaths || 0;
                    return (k + d) > 0 ? Math.round(100 * k / (k + d)) : 0;
                },
                format: v => `${v}%`
            },
            {
                icon: '💀', title: 'RL Killer',
                calc: p => p.weapons?.rl?.kills?.enemy || 0,
                format: v => `${v} kills`
            },
            {
                icon: '🔫', title: 'Sharpshooter',
                calc: p => {
                    const sg = p.weapons?.sg;
                    return sg?.acc?.attacks > 0 ? Math.round(100 * sg.acc.hits / sg.acc.attacks) : 0;
                },
                format: v => `${v}% SG`
            },
            {
                icon: '⚡', title: 'Shafter',
                calc: p => {
                    const lg = p.weapons?.lg;
                    return lg?.acc?.attacks > 0 ? Math.round(100 * lg.acc.hits / lg.acc.attacks) : 0;
                },
                format: v => `${v}% LG`
            },
            {
                icon: '💎', title: 'Quadrunner',
                calc: p => p.items?.q?.took || 0,
                format: v => `${v} pickups`
            },
            {
                icon: '🛡️', title: 'Pentstealer',
                calc: p => p.items?.p?.took || 0,
                format: v => `${v} pickups`
            },
            {
                icon: '💥', title: 'Damage Dealer',
                calc: p => (p.dmg?.given || 0) - (p.dmg?.taken || 0),
                format: v => `${v > 0 ? '+' : ''}${v}`
            }
        ];

        const cardsHtml = awards.map(award => {
            let best = null;
            let bestVal = 0;
            players.forEach(p => {
                const val = award.calc(p);
                if (val > bestVal) {
                    bestVal = val;
                    best = p;
                }
            });

            if (!best || bestVal === 0) return '';

            const name = QWHubService.coloredQuakeNameFromBytes(best.name);
            const team = QWHubService.qwToAscii(best.team);

            return `
                <div class="mh-award-card">
                    <div class="mh-award-header">
                        <span class="mh-award-icon">${award.icon}</span>
                        <span class="mh-award-title">${award.title}</span>
                    </div>
                    <div class="mh-award-player">${name}</div>
                    <div class="mh-award-detail">
                        <span class="mh-award-team">${_escapeHtmlLocal(team)}</span>
                        <span class="mh-award-value">${award.format(bestVal)}</span>
                    </div>
                </div>
            `;
        }).filter(Boolean).join('');

        return `
            <div class="mh-stats-table-wrap">
                <div class="mh-stab-bar">${tabsHtml}</div>
                <div class="mh-awards-grid">
                    ${cardsHtml}
                </div>
            </div>
        `;
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

        // Helper: render QW name with proper encoding
        const useRawQW = match._useRawQW;
        function qwName(name, nameColor) {
            if (useRawQW && !nameColor) return QWHubService.coloredQuakeNameFromBytes(name);
            return QWHubService.coloredQuakeName(name, nameColor);
        }

        // Team summary rows
        const teamRowsHtml = hasTeams ? sortedTeams.map(team => `
            <div class="sc-row">
                <span class="sc-ping">${team.ping ? team.ping + ' ms' : ''}</span>
                <span class="sc-frags" style="${QWHubService.getFragColorStyle(team.color)}">${team.frags}</span>
                <span class="sc-team">${qwName(
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
                    ${hasTeams ? `<span class="sc-team">${qwName(
                        (player.team || '').substring(0, 4),
                        (player.team_color || '').substring(0, 4)
                    )}</span>` : ''}
                    <span class="${nameClass}">
                        ${flagHtml}
                        <span>${qwName(player.name, player.name_color)}</span>
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
     * Render curated team summary stats below the scoreboard.
     * Shows: Pent, Quad, Ring | RA, YA | RL (Took/Drop/Xfer), LG (Took/Drop/Xfer)
     */
    function _renderScoreboardSummary(ktxstats, match) {
        if (!ktxstats || !ktxstats.players) return '';

        const ourTagLower = match.ourTag.toLowerCase();
        const validPlayers = ktxstats.players.filter(p => p.ping !== 0);

        // Split into our team / their team
        const ourPlayers = validPlayers.filter(p =>
            QWHubService.qwToAscii(p.team).toLowerCase() === ourTagLower);
        const theirPlayers = validPlayers.filter(p =>
            QWHubService.qwToAscii(p.team).toLowerCase() !== ourTagLower);

        function sumTeam(players, getter) {
            return players.reduce((s, p) => s + (getter(p) || 0), 0);
        }

        function teamStats(players) {
            return {
                q: sumTeam(players, p => p.items?.q?.took),
                p: sumTeam(players, p => p.items?.p?.took),
                r: sumTeam(players, p => p.items?.r?.took),
                ra: sumTeam(players, p => p.items?.ra?.took),
                ya: sumTeam(players, p => p.items?.ya?.took),
                rlK: sumTeam(players, p => p.weapons?.rl?.kills?.enemy),
                rlT: sumTeam(players, p => p.weapons?.rl?.pickups?.taken),
                rlD: sumTeam(players, p => p.weapons?.rl?.pickups?.dropped),
                rlX: sumTeam(players, p => p.xferRL),
                lgK: sumTeam(players, p => p.weapons?.lg?.kills?.enemy),
                lgT: sumTeam(players, p => p.weapons?.lg?.pickups?.taken),
                lgD: sumTeam(players, p => p.weapons?.lg?.pickups?.dropped),
                lgX: sumTeam(players, p => p.xferLG),
            };
        }

        const our = teamStats(ourPlayers);
        const their = teamStats(theirPlayers);

        const ourName = ourPlayers.length > 0
            ? QWHubService.qwToAscii(ourPlayers[0].team) : match.ourTag;
        const theirName = theirPlayers.length > 0
            ? QWHubService.qwToAscii(theirPlayers[0].team) : (match.opponentTag || '?');

        function dim(val) {
            return val === 0 ? 'mh-dim' : '';
        }

        function renderTeamRow(name, s) {
            return `<tr>
                <td class="sb-sum-team">${_escapeHtmlLocal(name)}</td>
                <td class="sb-sum-q ${dim(s.q)}">${s.q}</td>
                <td class="sb-sum-p ${dim(s.p)}">${s.p}</td>
                <td class="sb-sum-r ${dim(s.r)}">${s.r}</td>
                <td class="sb-sum-ra ${dim(s.ra)}">${s.ra}</td>
                <td class="sb-sum-ya ${dim(s.ya)}">${s.ya}</td>
                <td class="sb-sum-sep ${dim(s.rlK)}">${s.rlK}</td>
                <td class="${dim(s.rlT)}">${s.rlT}</td>
                <td class="${dim(s.rlD)}">${s.rlD}</td>
                <td class="${dim(s.rlX)}">${s.rlX}</td>
                <td class="sb-sum-sep ${dim(s.lgK)}">${s.lgK}</td>
                <td class="${dim(s.lgT)}">${s.lgT}</td>
                <td class="${dim(s.lgD)}">${s.lgD}</td>
                <td class="${dim(s.lgX)}">${s.lgX}</td>
            </tr>`;
        }

        return `
            <div class="sb-summary sb-text-outline">
                <table class="sb-summary-table">
                    <thead>
                        <tr class="sb-sum-group-hdr">
                            <th></th>
                            <th colspan="3">Powerups</th>
                            <th colspan="2">Armor</th>
                            <th class="sb-sum-sep" colspan="4">Rocket Launcher</th>
                            <th class="sb-sum-sep" colspan="4">Lightning Gun</th>
                        </tr>
                        <tr>
                            <th></th>
                            <th class="sb-sum-q">Q</th>
                            <th class="sb-sum-p">P</th>
                            <th class="sb-sum-r">R</th>
                            <th class="sb-sum-ra">RA</th>
                            <th class="sb-sum-ya">YA</th>
                            <th class="sb-sum-sep">Kills</th>
                            <th>Took</th>
                            <th>Drop</th>
                            <th>Xfer</th>
                            <th class="sb-sum-sep">Kills</th>
                            <th>Took</th>
                            <th>Drop</th>
                            <th>Xfer</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderTeamRow(ourName, our)}
                        ${renderTeamRow(theirName, their)}
                    </tbody>
                </table>
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
    // H2H Tab (Slice 11.0a)
    // ========================================

    /**
     * Main H2H tab renderer. Shows team selector + sub-tab content.
     */
    function _renderH2HTab(team) {
        // Always show H2H interface - users can select teams manually via dropdowns
        // If current team has no teamTag, they can still pick other teams to compare
        return `
            <div class="h2h-tab-wrapper flex flex-col h-full">
                ${_h2hSubTab !== 'h2h' ? _renderH2HCompactControls() : ''}
                <div class="h2h-content flex-1 min-h-0 flex flex-col" id="h2h-subtab-content">
                    ${_renderH2HSubTabContent()}
                </div>
            </div>
        `;
    }

    /**
     * Compact single-row controls bar for Form/Maps tabs (period only).
     * Team selection is handled by the right panel roster dropdowns.
     */
    function _renderH2HCompactControls() {
        const periods = [1, 3, 6];

        return `
            <div class="h2h-compact-controls">
                <div class="h2h-period-buttons">
                    ${periods.map(m => `
                        <button class="h2h-period-btn ${_h2hPeriod === m ? 'active' : ''}"
                                onclick="TeamsBrowserPanel.changeH2HPeriod(${m})">
                            ${m}M
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Team A (fixed) + Team B (dropdown) + period buttons + map filter.
     */
    function _renderTeamSelector(teamA) {
        const allTeams = _allTeams
            .filter(t => t.id !== teamA.id && t.teamTag)
            .sort((a, b) => a.teamName.localeCompare(b.teamName));

        const periods = [1, 3, 6];

        return `
            <div class="h2h-header">
                <div class="h2h-teams-row">
                    <div class="h2h-team h2h-team-a">
                        ${teamA.activeLogo?.urls?.small
                            ? `<img src="${teamA.activeLogo.urls.small}" class="h2h-team-logo" alt="">`
                            : ''}
                        <span class="h2h-team-name">${_escapeHtml(teamA.teamName)}</span>
                    </div>
                    <span class="h2h-vs">VS</span>
                    <div class="h2h-team h2h-team-b">
                        <select class="h2h-opponent-select" onchange="TeamsBrowserPanel.selectOpponent(this.value)">
                            <option value="">Select opponent...</option>
                            ${allTeams.map(t => `
                                <option value="${t.id}" ${t.id === _h2hOpponentId ? 'selected' : ''}>
                                    ${_escapeHtml(t.teamName)} (${_escapeHtml(t.teamTag)})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div class="h2h-controls-row">
                    <div class="h2h-period-buttons">
                        ${periods.map(m => `
                            <button class="h2h-period-btn ${_h2hPeriod === m ? 'active' : ''}"
                                    onclick="TeamsBrowserPanel.changeH2HPeriod(${m})">
                                ${m}M
                            </button>
                        `).join('')}
                    </div>
                    ${_h2hSubTab === 'h2h' ? `
                        <select class="mh-filter-select" onchange="TeamsBrowserPanel.filterH2HByMap(this.value)">
                            <option value="">All Maps</option>
                            ${_getH2HMapOptions().map(map => `
                                <option value="${map}" ${_h2hMapFilter === map ? 'selected' : ''}>
                                    ${map}
                                </option>
                            `).join('')}
                        </select>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Dispatch to active sub-tab renderer.
     */
    function _renderH2HSubTabContent() {
        switch (_h2hSubTab) {
            case 'h2h':
                return _renderH2HDirectTab();
            case 'form':
                return _renderFormTab();
            case 'maps':
                return _renderMapsTab();
            default:
                return '';
        }
    }

    /**
     * Left-panel header row: period buttons + map filter + W/L record, aligned to data grid.
     * Grid matches result rows: date | map | score | score | result
     */
    function _renderH2HLeftHeader(games) {
        const periods = [1, 3, 6];

        const wins = (games || []).filter(g => g.result === 'W').length;
        const losses = (games || []).filter(g => g.result === 'L').length;
        const total = (games || []).length;
        const winRate = total > 0 ? Math.round(wins / total * 100) : 0;

        return `
            <div class="h2h-column-header">
                <div class="h2h-period-buttons">
                    ${periods.map(m => `
                        <button class="h2h-period-btn ${_h2hPeriod === m ? 'active' : ''}"
                                onclick="TeamsBrowserPanel.changeH2HPeriod(${m})">
                            ${m}M
                        </button>
                    `).join('')}
                </div>
                <select class="mh-filter-select h2h-map-filter" onchange="TeamsBrowserPanel.filterH2HByMap(this.value)">
                    <option value="">All Maps</option>
                    ${_getH2HMapOptions().map(map => `
                        <option value="${map}" ${_h2hMapFilter === map ? 'selected' : ''}>
                            ${map}
                        </option>
                    `).join('')}
                </select>
                ${total > 0 ? `
                    <span class="h2h-header-record">
                        <span class="mh-result-win">${wins}W</span>
                        <span class="mh-result-loss">${losses}L</span>
                        <span class="text-xs text-muted-foreground">${winRate}%</span>
                    </span>
                ` : `<span></span><span></span><span></span>`}
            </div>
        `;
    }

    /**
     * H2H direct matchup split panel: results left, roster/scoreboard right.
     */
    function _renderH2HDirectTab() {
        const games = _h2hOpponentId ? _getFilteredH2HResults() : [];

        // Left panel content depends on state
        let leftContent = '';
        if (!_h2hOpponentId) {
            leftContent = `
                ${_renderH2HLeftHeader(null)}
                <div class="h2h-empty-state">
                    <p class="text-sm text-muted-foreground">Select teams to compare</p>
                </div>
            `;
        } else if (_h2hLoading) {
            leftContent = `
                ${_renderH2HLeftHeader(null)}
                <div class="h2h-skeleton">Loading results...</div>
            `;
        } else if (!_h2hResults || games.length === 0) {
            const teamA = _allTeams.find(t => t.id === _getH2HTeamAId());
            const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
            leftContent = `
                ${_renderH2HLeftHeader(null)}
                <div class="h2h-empty-state">
                    <p class="text-sm text-muted-foreground">
                        No direct matchups found between ${_escapeHtml(teamA?.teamName || '?')}
                        and ${_escapeHtml(teamB?.teamName || '?')}
                    </p>
                    <p class="text-xs text-muted-foreground mt-1">
                        Try extending the period, or check the Form tab
                    </p>
                </div>
            `;
        } else {
            leftContent = `
                ${_renderH2HLeftHeader(games)}
                <div class="mh-match-list" id="h2h-result-list">
                    ${_renderH2HResultList(games)}
                </div>
            `;
        }

        // Right panel: scoreboard on hover/click, roster panel otherwise (always has team selectors)
        let rightContent = '';
        if (_h2hSelectedId) {
            rightContent = _renderH2HPreviewPanel(_h2hSelectedId);
        } else if (_h2hHoveredId) {
            rightContent = _renderH2HPreviewPanel(_h2hHoveredId);
        } else {
            rightContent = _renderH2HRosterPanel();
        }

        return `
            <div class="h2h-split">
                <div class="mh-list-panel">
                    ${leftContent}
                </div>
                <div class="mh-preview-panel" id="h2h-preview-panel">
                    ${rightContent}
                </div>
            </div>
        `;
    }

    /**
     * Summary bar showing W/L record from Team A perspective.
     */
    function _renderH2HSummaryBar(games) {
        const wins = games.filter(g => g.result === 'W').length;
        const losses = games.filter(g => g.result === 'L').length;
        const draws = games.filter(g => g.result === 'D').length;
        const total = games.length;
        const winRate = total > 0 ? Math.round(wins / total * 100) : 0;

        return `
            <div class="h2h-summary-bar">
                <span class="h2h-record">
                    <span class="mh-result-win">${wins}W</span>
                    ${draws > 0 ? `<span class="mh-result-draw">${draws}D</span>` : ''}
                    <span class="mh-result-loss">${losses}L</span>
                </span>
                <span class="text-xs text-muted-foreground">${winRate}% from Team A perspective</span>
            </div>
        `;
    }

    /**
     * Render result rows for left panel.
     */
    function _renderH2HResultList(games) {
        if (games.length === 0) {
            return '<p class="text-xs text-muted-foreground p-2">No results</p>';
        }

        return games.map(g => {
            const dateStr = new Date(g.playedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const resultClass = g.result === 'W' ? 'mh-result-win'
                              : g.result === 'L' ? 'mh-result-loss'
                              : 'mh-result-draw';
            const isSelected = String(g.id) === _h2hSelectedId;

            return `
                <div class="mh-table-row ${isSelected ? 'selected' : ''}"
                     data-result-id="${g.id}"
                     onmouseenter="TeamsBrowserPanel.previewH2HResult('${g.id}')"
                     onmouseleave="TeamsBrowserPanel.clearH2HPreview()"
                     onclick="TeamsBrowserPanel.selectH2HResult('${g.id}')">
                    <span class="mh-td mh-td-date">${dateStr}</span>
                    <span class="mh-td mh-td-map">${g.map}</span>
                    <span class="mh-td mh-td-score">${g.teamAFrags}</span>
                    <span class="mh-td mh-td-score">${g.teamBFrags}</span>
                    <span class="mh-td mh-td-result ${resultClass}">${g.result}</span>
                </div>
            `;
        }).join('');
    }

    /**
     * Right panel default: two symmetrical columns with logo, team selector, roster.
     * Center section shows scheduled match times between the two teams.
     */
    function _renderH2HRosterPanel() {
        const teamAId = _getH2HTeamAId();
        const teamA = _allTeams.find(t => t.id === teamAId);
        const teamB = _h2hOpponentId ? _allTeams.find(t => t.id === _h2hOpponentId) : null;

        // Find scheduled matches between these two teams
        const scheduledTimesHtml = _renderScheduledMatchTimes(teamAId, _h2hOpponentId);

        return `
            <div class="h2h-roster-panel">
                <div class="h2h-roster-columns">
                    ${_renderRosterColumn(teamA, _h2hRosterA, 'A')}
                    ${scheduledTimesHtml}
                    ${_renderRosterColumn(teamB, _h2hRosterB, 'B')}
                </div>
            </div>
        `;
    }

    /**
     * Render scheduled match times between two teams (for H2H center section).
     */
    function _renderScheduledMatchTimes(teamAId, teamBId) {
        if (!teamAId || !teamBId) return '';
        if (typeof ScheduledMatchService === 'undefined') return '';

        const matches = ScheduledMatchService.getMatchesFromCache()
            .filter(m => m.status === 'upcoming')
            .filter(m =>
                (m.teamAId === teamAId && m.teamBId === teamBId) ||
                (m.teamAId === teamBId && m.teamBId === teamAId)
            )
            .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

        if (matches.length === 0) return '';

        const timesHtml = matches.map(match => {
            let dateStr = '';
            if (match.scheduledDate) {
                const d = new Date(match.scheduledDate + 'T00:00:00');
                dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
            let timeStr = '';
            if (typeof TimezoneService !== 'undefined' && TimezoneService.formatSlotForDisplay && match.slotId) {
                const formatted = TimezoneService.formatSlotForDisplay(match.slotId);
                timeStr = formatted.timeLabel || '';
            }
            return `
                <div class="h2h-scheduled-match">
                    <span class="h2h-scheduled-date">${dateStr}</span>
                    <span class="h2h-scheduled-time">${timeStr}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="h2h-scheduled-times">
                ${timesHtml}
            </div>
        `;
    }

    /**
     * Single roster column: logo → team dropdown → roster table.
     */
    function _renderRosterColumn(teamObj, rosterData, side) {
        const logoUrl = teamObj?.activeLogo?.urls?.medium || teamObj?.activeLogo?.urls?.small || '';
        const selectedId = side === 'A' ? _getH2HTeamAId() : _h2hOpponentId;
        const handler = side === 'A' ? 'selectH2HTeamA' : 'selectOpponent';

        // Build team options (exclude the other side's selected team)
        const otherId = side === 'A' ? _h2hOpponentId : _getH2HTeamAId();
        const teamOptions = _allTeams
            .filter(t => t.teamTag && t.id !== otherId)
            .sort((a, b) => a.teamName.localeCompare(b.teamName));

        const hasRoster = rosterData && rosterData.players?.length > 0;
        const maxGames = hasRoster ? (rosterData.players[0]?.games || 1) : 1;

        return `
            <div class="h2h-roster-col">
                <div class="h2h-roster-identity">
                    ${logoUrl
                        ? `<img src="${logoUrl}" class="h2h-roster-logo-lg" alt="">`
                        : `<div class="h2h-roster-logo-placeholder"></div>`
                    }
                    <select class="h2h-team-select" onchange="TeamsBrowserPanel.${handler}(this.value)">
                        <option value="">Select team...</option>
                        ${teamOptions.map(t => `
                            <option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>
                                ${_escapeHtml(t.teamName)}
                            </option>
                        `).join('')}
                    </select>
                </div>
                ${hasRoster ? `
                    <div class="h2h-roster-header">
                        <span>Member</span>
                        <span class="h2h-roster-stat-header">Maps</span>
                        <span class="h2h-roster-stat-header">Att</span>
                    </div>
                    <div class="h2h-roster-list">
                        ${rosterData.players.slice(0, 8).map((p) => {
                            const pct = Math.round((p.games / maxGames) * 100);
                            return `
                                <div class="h2h-roster-row">
                                    <span class="h2h-roster-name">${_escapeHtml(p.player)}</span>
                                    <span class="h2h-roster-stat">${p.games}</span>
                                    <span class="h2h-roster-stat">${pct}%</span>
                                </div>
                        `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Preview panel renderer for hover/click.
     * Hover: simple scoreboard. Click: full stats view if ktxstats loaded.
     */
    function _renderH2HPreviewPanel(resultId) {
        const game = _h2hDataById.get(String(resultId));
        if (!game) return '';

        const isSticky = _h2hSelectedId === String(resultId);

        if (isSticky && _h2hSelectedStats) {
            return _renderStatsView(_transformH2HGameForScoreboard(game), _h2hSelectedStats);
        }

        if (isSticky && _h2hStatsLoading) {
            return `
                ${_renderH2HSimpleScoreboard(game)}
                <div class="mh-stats-loading sb-text-outline">Loading detailed stats...</div>
            `;
        }

        // Use full scoreboard + summary if ktxstats is cached
        const cached = game.demoSha256 ? QWHubService.getCachedGameStats(game.demoSha256) : null;
        if (cached) {
            const matchObj = _transformH2HGameForScoreboard(game);
            return _renderScoreboard(_buildScoreboardMatch(game, cached))
                + _renderScoreboardSummary(cached, matchObj);
        }

        return _renderH2HSimpleScoreboard(game);
    }

    /**
     * Simple scoreboard (hover preview) — team names + frags + mapshot background.
     * No player rows since the QW Stats API /api/h2h doesn't include per-player data.
     */
    function _renderH2HSimpleScoreboard(game) {
        const mapImg = `https://a.quake.world/mapshots/webp/lg/${game.map}.webp`;
        const dateStr = new Date(game.playedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
        const resultClass = game.result === 'W' ? 'mh-result-win'
                          : game.result === 'L' ? 'mh-result-loss'
                          : 'mh-result-draw';

        const teamA = _h2hResults?.teamA || '';
        const teamB = _h2hResults?.teamB || '';

        return `
            <div class="h2h-scoreboard" style="background-image: url('${mapImg}')">
                <div class="h2h-scoreboard-overlay">
                    <div class="h2h-scoreboard-date">${dateStr} — ${game.map}</div>
                    <div class="h2h-scoreboard-score">
                        <span class="h2h-scoreboard-tag">${_escapeHtml(teamA)}</span>
                        <span class="h2h-scoreboard-frags ${resultClass}">${game.teamAFrags}</span>
                        <span class="h2h-scoreboard-separator">-</span>
                        <span class="h2h-scoreboard-frags">${game.teamBFrags}</span>
                        <span class="h2h-scoreboard-tag">${_escapeHtml(teamB)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Transform QW Stats API game → Match History format for scoreboard/stats reuse.
     */
    function _transformH2HGameForScoreboard(game) {
        return {
            id: game.id,
            map: game.map,
            date: new Date(game.playedAt),
            ourTag: _h2hResults?.teamA || '',
            opponentTag: _h2hResults?.teamB || '',
            ourScore: game.teamAFrags,
            opponentScore: game.teamBFrags,
            result: game.result,
            demoHash: game.demoSha256
        };
    }

    /**
     * Build a scoreboard-compatible match object from ktxstats data + game info.
     * Allows reusing _renderScoreboard() for H2H/Form hover previews.
     */
    function _buildScoreboardMatch(game, ktxstats) {
        const validPlayers = (ktxstats.players || []).filter(p => p.ping !== 0);

        // ktxstats uses "top-color"/"bottom-color" fields, hub uses color: [top, bottom] array
        function playerColor(p) {
            if (Array.isArray(p.color)) return p.color;
            if (p['top-color'] != null || p['bottom-color'] != null) {
                return [p['top-color'] || 0, p['bottom-color'] || 0];
            }
            return [0, 0];
        }

        // Build teams array from ktxstats
        const teamMap = {};
        for (const p of validPlayers) {
            const teamAscii = QWHubService.qwToAscii(p.team || '').toLowerCase();
            if (!teamMap[teamAscii]) {
                teamMap[teamAscii] = {
                    name: p.team || '',
                    name_color: p.team_color || '',
                    color: playerColor(p),
                    frags: 0,
                    ping: 0,
                    _useRawQW: !p.team_color
                };
            }
            teamMap[teamAscii].frags += p.stats?.frags || 0;
        }

        return {
            map: game.map,
            _useRawQW: true,
            teams: Object.values(teamMap).sort((a, b) => b.frags - a.frags),
            players: validPlayers.map(p => ({
                name: p.name || '',
                name_color: p.name_color || '',
                team: p.team || '',
                team_color: p.team_color || '',
                color: playerColor(p),
                frags: p.stats?.frags || 0,
                ping: p.ping || 0,
                cc: p.cc || '',
                is_bot: false,
                _useRawQW: !p.name_color
            })).sort((a, b) => b.frags - a.frags)
        };
    }

    /**
     * Get unique maps from H2H results for the filter dropdown.
     */
    function _getH2HMapOptions() {
        if (!_h2hResults?.games) return [];
        return [...new Set(_h2hResults.games.map(g => g.map))].sort();
    }

    /**
     * Get filtered H2H results based on map filter.
     */
    function _getFilteredH2HResults() {
        if (!_h2hResults?.games) return [];
        if (!_h2hMapFilter) return _h2hResults.games;
        return _h2hResults.games.filter(g => g.map === _h2hMapFilter);
    }

    /**
     * Update selected/hover highlights on result rows without full re-render.
     */
    function _updateH2HHighlights() {
        const rows = document.querySelectorAll('#h2h-result-list .mh-table-row');
        rows.forEach(row => {
            const id = row.dataset.resultId;
            row.classList.toggle('selected', id === _h2hSelectedId);
        });
    }

    // ========================================
    // H2H Data Loading (Slice 11.0a)
    // ========================================

    /**
     * Fetch H2H results + both rosters in parallel.
     */
    async function _loadH2HData() {
        const teamAId = _getH2HTeamAId();
        const teamA = _allTeams.find(t => t.id === teamAId);
        const teamB = _allTeams.find(t => t.id === _h2hOpponentId);

        if (!teamA?.teamTag || !teamB?.teamTag) return;

        _h2hLoading = true;
        _h2hResults = null;
        _h2hRosterA = null;
        _h2hRosterB = null;
        _h2hHoveredId = null;
        _h2hSelectedId = null;
        _h2hSelectedStats = null;
        _h2hDataById.clear();
        _renderCurrentView();

        try {
            const [h2hData, rosterA, rosterB] = await Promise.all([
                QWStatsService.getH2H(teamA.teamTag, teamB.teamTag, {
                    months: _h2hPeriod,
                    limit: 10
                }),
                QWStatsService.getRoster(teamA.teamTag, { months: _h2hPeriod }),
                QWStatsService.getRoster(teamB.teamTag, { months: _h2hPeriod })
            ]);

            // Guard: still viewing same teams?
            if (_getH2HTeamAId() !== teamA.id || _h2hOpponentId !== teamB.id) return;

            _h2hResults = h2hData;
            _h2hRosterA = rosterA;
            _h2hRosterB = rosterB;

            // Populate lookup map for hover/click
            if (h2hData.games) {
                h2hData.games.forEach(g => {
                    _h2hDataById.set(String(g.id), g);
                });
            }
        } catch (error) {
            console.error('Failed to load H2H data:', error);
            _h2hResults = { error: true };
        } finally {
            _h2hLoading = false;
            _renderCurrentView();
        }
    }

    // ========================================
    // H2H Public Handlers (Slice 11.0a)
    // ========================================

    /**
     * Team A dropdown change handler (H2H right panel).
     */
    function selectH2HTeamA(teamId) {
        _h2hTeamAId = teamId || null;
        _h2hResults = null;
        _h2hRosterA = null;
        _h2hRosterB = null;
        _h2hHoveredId = null;
        _h2hSelectedId = null;
        _h2hSelectedStats = null;
        _h2hMapFilter = '';
        _h2hDataById.clear();
        _resetMapsState();
        _resetFormState();

        if (_getH2HTeamAId() && _h2hOpponentId) {
            _loadH2HData();
        } else {
            _renderCurrentView();
        }
    }

    /**
     * Team B dropdown change handler.
     */
    function selectOpponent(teamId) {
        _h2hOpponentId = teamId || null;
        _h2hResults = null;
        _h2hRosterA = null;
        _h2hRosterB = null;
        _h2hHoveredId = null;
        _h2hSelectedId = null;
        _h2hSelectedStats = null;
        _h2hMapFilter = '';
        _h2hDataById.clear();
        _resetMapsState();
        _resetFormState();

        // Update URL with opponent selection
        if (typeof Router !== 'undefined' && _selectedTeamId) {
            Router.pushH2HOpponent(_selectedTeamId, _h2hOpponentId);
        }

        if (_h2hOpponentId) {
            _loadH2HData();
        } else {
            _renderCurrentView();
        }
    }

    /**
     * Sub-tab click handler (h2h | form | maps).
     */
    function switchH2HSubTab(subTab) {
        if (_h2hSubTab === subTab) return;
        _h2hSubTab = subTab;
        _renderCurrentView();

        // Load form data when switching to form tab (if not already loaded)
        if (subTab === 'form' && _h2hOpponentId && !_formResultsA && !_formLoading) {
            _loadFormData();
        }

        // Load maps data when switching to maps tab (if not already loaded)
        if (subTab === 'maps' && _h2hOpponentId && !_mapsDataA && !_mapsLoading) {
            _loadMapsData();
        }
    }

    /**
     * Period button click handler.
     */
    function changeH2HPeriod(months) {
        if (_h2hPeriod === months) return;
        _h2hPeriod = months;
        if (_h2hOpponentId) {
            _loadH2HData();
            // Re-fetch form data if form tab is active or was previously loaded
            if (_formResultsA || _h2hSubTab === 'form') {
                _loadFormData();
            }
            // Re-fetch maps data if maps tab is active or was previously loaded
            if (_mapsDataA || _h2hSubTab === 'maps') {
                _loadMapsData();
            }
        } else {
            _renderCurrentView();
        }
    }

    /**
     * Map filter change handler (H2H sub-tab only).
     */
    function filterH2HByMap(map) {
        _h2hMapFilter = map;
        // Client-side filter — just re-render left panel
        const listEl = document.getElementById('h2h-result-list');
        if (listEl) {
            const games = _getFilteredH2HResults();
            listEl.innerHTML = _renderH2HResultList(games);
        }
    }

    /**
     * Hover handler for H2H result row.
     */
    function previewH2HResult(resultId) {
        if (_h2hSelectedId) return; // Don't override sticky
        _h2hHoveredId = String(resultId);
        const panel = document.getElementById('h2h-preview-panel');
        if (panel) {
            panel.innerHTML = _renderH2HPreviewPanel(resultId);
        }

        // Eagerly fetch ktxstats in background for full scoreboard
        const game = _h2hDataById.get(String(resultId));
        if (game?.demoSha256 && !QWHubService.getCachedGameStats(game.demoSha256)) {
            QWHubService.getGameStats(game.demoSha256).then(() => {
                // Re-render if still hovering this result
                if (_h2hHoveredId === String(resultId) && !_h2hSelectedId) {
                    const p = document.getElementById('h2h-preview-panel');
                    if (p) p.innerHTML = _renderH2HPreviewPanel(resultId);
                }
            }).catch(() => {}); // Silently fail — simple scoreboard remains
        }
    }

    /**
     * Mouse leave handler for H2H result row.
     */
    function clearH2HPreview() {
        _h2hHoveredId = null;
        if (!_h2hSelectedId) {
            const panel = document.getElementById('h2h-preview-panel');
            if (panel) {
                panel.innerHTML = _renderH2HRosterPanel();
            }
        }
    }

    /**
     * Click handler for H2H result row. Toggles sticky selection + fetches ktxstats.
     */
    async function selectH2HResult(resultId) {
        const id = String(resultId);

        // Toggle off
        if (_h2hSelectedId === id) {
            _h2hSelectedId = null;
            _h2hSelectedStats = null;
            const panel = document.getElementById('h2h-preview-panel');
            if (panel) panel.innerHTML = _renderH2HRosterPanel();
            _updateH2HHighlights();
            return;
        }

        _h2hSelectedId = id;
        _h2hSelectedStats = null;
        _h2hStatsLoading = true;
        _updateH2HHighlights();

        // Render scoreboard immediately from API data
        const panel = document.getElementById('h2h-preview-panel');
        if (panel) panel.innerHTML = _renderH2HPreviewPanel(id);

        // Fetch ktxstats for detailed stats (cold path)
        const game = _h2hDataById.get(id);
        if (game?.demoSha256) {
            try {
                const stats = await QWHubService.getGameStats(game.demoSha256);
                if (_h2hSelectedId === id) { // Guard
                    _h2hSelectedStats = stats;
                    _h2hStatsLoading = false;
                    const p = document.getElementById('h2h-preview-panel');
                    if (p) p.innerHTML = _renderH2HPreviewPanel(id);
                }
            } catch (error) {
                console.error('Failed to load game stats:', error);
                _h2hStatsLoading = false;
                if (_h2hSelectedId === id) {
                    const p = document.getElementById('h2h-preview-panel');
                    if (p) p.innerHTML = _renderH2HPreviewPanel(id);
                }
            }
        } else {
            _h2hStatsLoading = false;
        }
    }

    /**
     * Reset all H2H state (called when switching teams).
     */
    function _resetH2HState() {
        _h2hTeamAId = null;
        _h2hOpponentId = null;
        _h2hSubTab = 'h2h';
        _h2hPeriod = 3;
        _h2hMapFilter = '';
        _h2hResults = null;
        _h2hRosterA = null;
        _h2hRosterB = null;
        _h2hLoading = false;
        _h2hHoveredId = null;
        _h2hSelectedId = null;
        _h2hSelectedStats = null;
        _h2hStatsLoading = false;
        _h2hDataById.clear();
        _resetFormState();
        _resetMapsState();
    }

    // ========================================
    // Slice 11.0b: Form Tab
    // ========================================

    /**
     * Load form data for both teams in parallel.
     */
    async function _loadFormData() {
        const teamAId = _getH2HTeamAId();
        const teamA = _allTeams.find(t => t.id === teamAId);
        const teamB = _allTeams.find(t => t.id === _h2hOpponentId);

        if (!teamA?.teamTag || !teamB?.teamTag) return;

        _formLoading = true;
        _formResultsA = null;
        _formResultsB = null;
        _formHoveredSide = null;
        _formHoveredId = null;
        _formSelectedSide = null;
        _formSelectedId = null;
        _formSelectedStats = null;
        _formDataByIdA.clear();
        _formDataByIdB.clear();
        _rerenderFormTab();

        try {
            const [formA, formB] = await Promise.all([
                QWStatsService.getForm(teamA.teamTag, { months: _h2hPeriod, limit: 10 }),
                QWStatsService.getForm(teamB.teamTag, { months: _h2hPeriod, limit: 10 })
            ]);

            // Guard against stale response
            if (_getH2HTeamAId() !== teamA.id || _h2hOpponentId !== teamB.id) return;

            _formResultsA = formA;
            _formResultsB = formB;

            if (formA.games) formA.games.forEach(g => _formDataByIdA.set(String(g.id), g));
            if (formB.games) formB.games.forEach(g => _formDataByIdB.set(String(g.id), g));
        } catch (error) {
            console.error('Failed to load form data:', error);
        } finally {
            _formLoading = false;
            _rerenderFormTab();
        }
    }

    /**
     * Form tab dispatcher — routes to default/hover-left/hover-right layout.
     */
    function _renderFormTab() {
        if (!_h2hOpponentId) {
            return `
                <div class="h2h-empty-state">
                    <p class="text-sm text-muted-foreground">Select an opponent to compare form</p>
                </div>
            `;
        }

        if (_formLoading) {
            return `
                <div class="form-split form-split-default">
                    <div class="form-side"><div class="h2h-skeleton">Loading...</div></div>
                    <div class="form-divider"></div>
                    <div class="form-side"><div class="h2h-skeleton">Loading...</div></div>
                </div>
            `;
        }

        const activeSide = _formSelectedSide || _formHoveredSide;
        const activeId = _formSelectedId || _formHoveredId;

        if (!activeSide) {
            return _renderFormDefault();
        } else if (activeSide === 'left') {
            return _renderFormHoverLeft(activeId);
        } else {
            return _renderFormHoverRight(activeId);
        }
    }

    /**
     * Render form side header with team logo + tag + label.
     */
    function _renderFormSideHeader(teamObj, label, games) {
        const tag = teamObj?.teamTag || '?';
        const logoUrl = teamObj?.activeLogo?.urls?.small || '';
        const wins = (games || []).filter(g => g.result === 'W').length;
        const losses = (games || []).filter(g => g.result === 'L').length;
        const total = (games || []).length;
        const pct = total > 0 ? Math.round((wins / total) * 100) : 0;

        return `
            <div class="form-column-header">
                <div class="form-header-identity">
                    ${logoUrl ? `<img src="${logoUrl}" class="form-side-logo" alt="">` : ''}
                    <span class="font-bold">${_escapeHtml(tag)}</span>
                    <span class="form-side-label">${label}</span>
                </div>
                ${total > 0 ? `
                    <span class="form-header-record">
                        <span class="mh-result-win">${wins}W</span>
                        <span class="mh-result-loss">${losses}L</span>
                        <span class="text-xs text-muted-foreground">${pct}%</span>
                    </span>
                ` : `<span></span><span></span><span></span>`}
            </div>
        `;
    }

    /**
     * Default symmetric ~50/50 layout.
     */
    function _renderFormDefault() {
        const teamA = _allTeams.find(t => t.id === _getH2HTeamAId());
        const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
        const gamesA = _formResultsA?.games || [];
        const gamesB = _formResultsB?.games || [];

        return `
            <div class="form-split form-split-default">
                <div class="form-side form-side-left">
                    ${_renderFormSideHeader(teamA, 'Recent Form', gamesA)}
                    ${gamesA.length > 0
                        ? _renderFormResultList(gamesA, 'left')
                        : '<div class="h2h-empty-state"><p class="text-xs text-muted-foreground">No recent matches</p></div>'
                    }
                </div>
                <div class="form-divider">
                    <p>Hover a result to see scores</p>
                    <p>Click a result to browse stats</p>
                </div>
                <div class="form-side form-side-right">
                    ${_renderFormSideHeader(teamB, 'Recent Form', gamesB)}
                    ${gamesB.length > 0
                        ? _renderFormResultList(gamesB, 'right')
                        : '<div class="h2h-empty-state"><p class="text-xs text-muted-foreground">No recent matches</p></div>'
                    }
                </div>
            </div>
        `;
    }

    /**
     * Hover-left layout: list ~40% left, scoreboard ~60% right.
     */
    /**
     * Render form content panel inner HTML — uses full scoreboard if ktxstats cached.
     */
    function _renderFormContentPreview(game, side, isSticky) {
        if (!game) {
            return '<div class="mh-preview-empty"><p class="text-xs text-muted-foreground">Hover a result</p></div>';
        }

        if (isSticky && _formSelectedStats) {
            return _renderStatsView(_transformFormGameForScoreboard(game, side), _formSelectedStats);
        }

        if (isSticky && _formStatsLoading) {
            const cached = game.demoSha256 ? QWHubService.getCachedGameStats(game.demoSha256) : null;
            if (cached) {
                return _renderScoreboard(_buildScoreboardMatch(game, cached))
                    + '<div class="mh-stats-loading sb-text-outline">Loading detailed stats...</div>';
            }
            return _renderFormSimpleScoreboard(_transformFormGameToH2HFormat(game, side))
                + '<div class="mh-stats-loading sb-text-outline">Loading detailed stats...</div>';
        }

        // Hover — use full scoreboard + summary if ktxstats cached
        const cached = game.demoSha256 ? QWHubService.getCachedGameStats(game.demoSha256) : null;
        if (cached) {
            const matchObj = _transformFormGameForScoreboard(game, side);
            return _renderScoreboard(_buildScoreboardMatch(game, cached))
                + _renderScoreboardSummary(cached, matchObj);
        }

        return _renderFormSimpleScoreboard(_transformFormGameToH2HFormat(game, side));
    }

    function _renderFormHoverLeft(activeId) {
        const teamA = _allTeams.find(t => t.id === _getH2HTeamAId());
        const gamesA = _formResultsA?.games || [];
        const game = _formDataByIdA.get(String(activeId));
        const isSticky = _formSelectedSide === 'left';

        return `
            <div class="form-split form-split-hover-left">
                <div class="form-side form-side-left form-side-narrow">
                    ${_renderFormSideHeader(teamA, '', gamesA)}
                    ${_renderFormResultList(gamesA, 'left')}
                </div>
                <div class="form-content-panel" id="form-content-panel"
                     onclick="TeamsBrowserPanel.clearFormSelection()">
                    ${_renderFormContentPreview(game, 'left', isSticky)}
                </div>
            </div>
        `;
    }

    /**
     * Hover-right layout: scoreboard ~60% left, list ~40% right.
     */
    function _renderFormHoverRight(activeId) {
        const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
        const gamesB = _formResultsB?.games || [];
        const game = _formDataByIdB.get(String(activeId));
        const isSticky = _formSelectedSide === 'right';

        return `
            <div class="form-split form-split-hover-right">
                <div class="form-content-panel" id="form-content-panel"
                     onclick="TeamsBrowserPanel.clearFormSelection()">
                    ${_renderFormContentPreview(game, 'right', isSticky)}
                </div>
                <div class="form-side form-side-right form-side-narrow">
                    ${_renderFormSideHeader(teamB, '', gamesB)}
                    ${_renderFormResultList(gamesB, 'right')}
                </div>
            </div>
        `;
    }

    /**
     * Render result rows for one side.
     */
    function _renderFormResultList(games, side) {
        return `
            <div class="mh-match-list">
                ${games.map(g => {
                    const dateStr = new Date(g.playedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric'
                    });
                    const resultClass = g.result === 'W' ? 'mh-result-win'
                                      : g.result === 'L' ? 'mh-result-loss'
                                      : 'mh-result-draw';
                    const isSelected = _formSelectedSide === side && _formSelectedId === String(g.id);
                    const isHovered = _formHoveredSide === side && _formHoveredId === String(g.id);

                    return `
                        <div class="mh-table-row ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}"
                             data-result-id="${g.id}"
                             data-side="${side}"
                             onmouseenter="TeamsBrowserPanel.previewFormResult('${g.id}', '${side}')"
                             onmouseleave="TeamsBrowserPanel.clearFormPreview('${side}')"
                             onclick="TeamsBrowserPanel.selectFormResult('${g.id}', '${side}')">
                            <span class="mh-td mh-td-date">${dateStr}</span>
                            <span class="mh-td mh-td-map">${g.map}</span>
                            <span class="mh-td mh-td-score">${g.teamFrags}</span>
                            <span class="mh-td mh-td-score">${g.oppFrags}</span>
                            <span class="mh-td mh-td-opponent">${_escapeHtml(g.opponent)}</span>
                            <span class="mh-td mh-td-result ${resultClass}">${g.result}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * Record summary at bottom of each side (e.g., "4W 1D 2L (57%)").
     */
    function _renderFormSummary(games) {
        const wins = games.filter(g => g.result === 'W').length;
        const draws = games.filter(g => g.result === 'D').length;
        const losses = games.filter(g => g.result === 'L').length;
        const total = games.length;
        const pct = total > 0 ? Math.round((wins / total) * 100) : 0;

        return `
            <div class="form-summary">
                <span class="mh-result-win">${wins}W</span>
                <span class="mh-result-draw">${draws}D</span>
                <span class="mh-result-loss">${losses}L</span>
                <span class="text-muted-foreground">(${pct}%)</span>
            </div>
        `;
    }

    /**
     * Simple scoreboard for Form tab — takes explicit teamA/teamB from the game object
     * instead of reading from _h2hResults (which is H2H-specific).
     */
    function _renderFormSimpleScoreboard(game) {
        const mapImg = `https://a.quake.world/mapshots/webp/lg/${game.map}.webp`;
        const dateStr = new Date(game.playedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
        const resultClass = game.result === 'W' ? 'mh-result-win'
                          : game.result === 'L' ? 'mh-result-loss'
                          : 'mh-result-draw';

        return `
            <div class="h2h-scoreboard" style="background-image: url('${mapImg}')">
                <div class="h2h-scoreboard-overlay">
                    <div class="h2h-scoreboard-date">${dateStr} — ${game.map}</div>
                    <div class="h2h-scoreboard-score">
                        <span class="h2h-scoreboard-tag">${_escapeHtml(game.teamA)}</span>
                        <span class="h2h-scoreboard-frags ${resultClass}">${game.teamAFrags}</span>
                        <span class="h2h-scoreboard-separator">-</span>
                        <span class="h2h-scoreboard-frags">${game.teamBFrags}</span>
                        <span class="h2h-scoreboard-tag">${_escapeHtml(game.teamB)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Transform Form API game → H2H scoreboard format (for simple scoreboard).
     */
    function _transformFormGameToH2HFormat(game, side) {
        const teamTag = side === 'left'
            ? (_allTeams.find(t => t.id === _getH2HTeamAId())?.teamTag || '')
            : (_allTeams.find(t => t.id === _h2hOpponentId)?.teamTag || '');

        return {
            map: game.map,
            playedAt: game.playedAt,
            teamAFrags: game.teamFrags,
            teamBFrags: game.oppFrags,
            result: game.result,
            demoSha256: game.demoSha256,
            teamA: teamTag,
            teamB: game.opponent
        };
    }

    /**
     * Transform Form API game → stats view format (for full ktxstats view).
     */
    function _transformFormGameForScoreboard(game, side) {
        const teamTag = side === 'left'
            ? (_allTeams.find(t => t.id === _getH2HTeamAId())?.teamTag || '')
            : (_allTeams.find(t => t.id === _h2hOpponentId)?.teamTag || '');

        return {
            id: game.id,
            map: game.map,
            date: new Date(game.playedAt),
            ourTag: teamTag,
            opponentTag: game.opponent,
            ourScore: game.teamFrags,
            opponentScore: game.oppFrags,
            result: game.result,
            demoHash: game.demoSha256
        };
    }

    // -- Form tab interaction handlers --

    /**
     * Hover handler with side awareness.
     */
    function previewFormResult(resultId, side) {
        if (_formSelectedSide) return; // Don't override sticky
        _formHoveredSide = side;
        _formHoveredId = String(resultId);

        // If still in default layout, switch to hover layout
        const currentSplit = document.querySelector('.form-split');
        if (currentSplit && currentSplit.classList.contains('form-split-default')) {
            _rerenderFormTab();
        } else {
            // Already in hover layout — just update content panel directly
            const panel = document.getElementById('form-content-panel');
            if (panel) {
                const dataMap = side === 'left' ? _formDataByIdA : _formDataByIdB;
                const game = dataMap.get(String(resultId));
                if (game) {
                    panel.innerHTML = _renderFormContentPreview(game, side, false);
                }
            }
        }

        // Eagerly fetch ktxstats in background for full scoreboard
        const dataMap = side === 'left' ? _formDataByIdA : _formDataByIdB;
        const game = dataMap.get(String(resultId));
        if (game?.demoSha256 && !QWHubService.getCachedGameStats(game.demoSha256)) {
            QWHubService.getGameStats(game.demoSha256).then(() => {
                if (_formHoveredId === String(resultId) && _formHoveredSide === side && !_formSelectedSide) {
                    const p = document.getElementById('form-content-panel');
                    if (p) p.innerHTML = _renderFormContentPreview(game, side, false);
                }
            }).catch(() => {});
        }
    }

    /**
     * Mouse leave handler.
     */
    function clearFormPreview(side) {
        if (_formHoveredSide !== side) return;
        _formHoveredSide = null;
        _formHoveredId = null;
        if (!_formSelectedSide) {
            _rerenderFormTab();
        }
    }

    /**
     * Click handler with side awareness — toggles sticky selection.
     */
    function clearFormSelection() {
        if (!_formSelectedSide) return;
        _formSelectedSide = null;
        _formSelectedId = null;
        _formSelectedStats = null;
        _formStatsLoading = false;
        _formHoveredSide = null;
        _formHoveredId = null;
        _rerenderFormTab();
    }

    async function selectFormResult(resultId, side) {
        const id = String(resultId);

        // Toggle off
        if (_formSelectedSide === side && _formSelectedId === id) {
            clearFormSelection();
            return;
        }

        _formSelectedSide = side;
        _formSelectedId = id;
        _formSelectedStats = null;
        _formStatsLoading = true;
        _rerenderFormTab();

        // Fetch ktxstats
        const dataMap = side === 'left' ? _formDataByIdA : _formDataByIdB;
        const game = dataMap.get(id);

        if (game?.demoSha256) {
            try {
                const stats = await QWHubService.getGameStats(game.demoSha256);
                if (_formSelectedSide === side && _formSelectedId === id) {
                    _formSelectedStats = stats;
                    _formStatsLoading = false;
                    _rerenderFormTab();
                }
            } catch (error) {
                console.error('Failed to load form game stats:', error);
                _formStatsLoading = false;
                if (_formSelectedSide === side && _formSelectedId === id) {
                    _rerenderFormTab();
                }
            }
        } else {
            _formStatsLoading = false;
        }
    }

    /**
     * Re-render just the form tab content area.
     */
    function _rerenderFormTab() {
        const container = document.querySelector('.team-detail-tab-content');
        if (container && _activeTab === 'h2h' && _h2hSubTab === 'form') {
            const formContainer = document.getElementById('h2h-subtab-content');
            if (formContainer) {
                formContainer.innerHTML = _renderFormTab();
            }
        }
    }

    /**
     * Reset all Form tab state.
     */
    function _resetFormState() {
        _formResultsA = null;
        _formResultsB = null;
        _formLoading = false;
        _formHoveredSide = null;
        _formHoveredId = null;
        _formSelectedSide = null;
        _formSelectedId = null;
        _formSelectedStats = null;
        _formStatsLoading = false;
        _formDataByIdA.clear();
        _formDataByIdB.clear();
    }

    // ========================================
    // Slice 11.0c: Maps Tab
    // ========================================

    /**
     * Maps tab renderer — alternating mapshot/stats rows.
     */
    function _renderMapsTab() {
        if (!_h2hOpponentId) {
            return `
                <div class="h2h-empty-state">
                    <p class="text-sm text-muted-foreground">Select an opponent to compare map strength</p>
                </div>
            `;
        }

        if (_mapsLoading) {
            return `
                <div class="maps-loading">
                    <div class="h2h-skeleton">Loading map analysis...</div>
                </div>
            `;
        }

        const mergedMaps = _mergeMapsData(_mapsDataA, _mapsDataB);

        if (mergedMaps.length === 0) {
            return `
                <div class="h2h-empty-state">
                    <p class="text-sm text-muted-foreground">No map data available for this matchup</p>
                    <p class="text-xs text-muted-foreground mt-1">Try extending the period to 6 months</p>
                </div>
            `;
        }

        return `
            <div class="maps-grid">
                ${mergedMaps.map(mapData => _renderMapCard(mapData)).join('')}
            </div>
        `;
    }

    /**
     * Single map card with mapshot background and overlay stats.
     */
    function _renderMapCard(mapData) {
        const mapshotUrl = `https://a.quake.world/mapshots/webp/lg/${mapData.map}.webp`;
        const teamA = _allTeams.find(t => t.id === _getH2HTeamAId());
        const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
        const tagA = teamA?.teamTag || '?';
        const tagB = teamB?.teamTag || '?';

        const annotation = _getMapAnnotation(mapData.statsA, mapData.statsB, tagA, tagB);

        return `
            <div class="maps-card" style="background-image: url('${mapshotUrl}');">
                <div class="maps-card-overlay">
                    <div class="maps-map-name">${mapData.map}</div>
                    <div class="maps-card-stats">
                        ${mapData.statsA ? `
                            <div class="maps-team-stat">
                                <span class="maps-tag">${_escapeHtml(tagA)}</span>
                                <span class="maps-record">${mapData.statsA.wins}-${mapData.statsA.losses}</span>
                                <span class="maps-winrate">(${Math.round(mapData.statsA.winRate)}%)</span>
                                <span class="maps-fragdiff ${mapData.statsA.avgFragDiff >= 0 ? 'positive' : 'negative'}">
                                    ${mapData.statsA.avgFragDiff >= 0 ? '+' : ''}${mapData.statsA.avgFragDiff.toFixed(1)}
                                </span>
                            </div>
                        ` : `
                            <div class="maps-team-stat maps-no-data">
                                <span class="maps-tag">${_escapeHtml(tagA)}</span>
                                <span class="maps-no-games">No games</span>
                                <span></span>
                                <span></span>
                            </div>
                        `}
                        ${mapData.statsB ? `
                            <div class="maps-team-stat">
                                <span class="maps-tag">${_escapeHtml(tagB)}</span>
                                <span class="maps-record">${mapData.statsB.wins}-${mapData.statsB.losses}</span>
                                <span class="maps-winrate">(${Math.round(mapData.statsB.winRate)}%)</span>
                                <span class="maps-fragdiff ${mapData.statsB.avgFragDiff >= 0 ? 'positive' : 'negative'}">
                                    ${mapData.statsB.avgFragDiff >= 0 ? '+' : ''}${mapData.statsB.avgFragDiff.toFixed(1)}
                                </span>
                            </div>
                        ` : `
                            <div class="maps-team-stat maps-no-data">
                                <span class="maps-tag">${_escapeHtml(tagB)}</span>
                                <span class="maps-no-games">No games</span>
                                <span></span>
                                <span></span>
                            </div>
                        `}
                    </div>
                    ${annotation ? `<div class="maps-annotation">${annotation}</div>` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Generate text annotation based on win rate comparison.
     */
    function _getMapAnnotation(statsA, statsB, tagA, tagB) {
        if (!statsA && !statsB) return '';

        // Only one team has data
        if (!statsA) return `${tagB} plays, ${tagA} doesn't`;
        if (!statsB) return `${tagA} plays, ${tagB} doesn't`;

        const wrA = statsA.winRate;
        const wrB = statsB.winRate;
        const diff = wrA - wrB;

        // Both strong (>60%)
        if (wrA >= 60 && wrB >= 60) return 'Both teams strong';

        // One dominates (>30% gap)
        if (diff >= 30) return `${tagA} dominates`;
        if (diff <= -30) return `${tagB} dominates`;

        // One favors (15-30% gap)
        if (diff >= 15) return `${tagA} favors`;
        if (diff <= -15) return `${tagB} favors`;

        // Both weak (<40%)
        if (wrA < 40 && wrB < 40) return 'Neither team favors';

        // Close
        return 'Even';
    }

    /**
     * Merge both teams' map data, sorted by combined games.
     */
    function _mergeMapsData(mapsA, mapsB) {
        const mapIndex = {};

        // Add Team A maps
        if (mapsA?.maps) {
            mapsA.maps.forEach(m => {
                mapIndex[m.map] = {
                    map: m.map,
                    statsA: m,
                    statsB: null,
                    totalGames: m.games
                };
            });
        }

        // Merge Team B maps
        if (mapsB?.maps) {
            mapsB.maps.forEach(m => {
                if (mapIndex[m.map]) {
                    mapIndex[m.map].statsB = m;
                    mapIndex[m.map].totalGames += m.games;
                } else {
                    mapIndex[m.map] = {
                        map: m.map,
                        statsA: null,
                        statsB: m,
                        totalGames: m.games
                    };
                }
            });
        }

        // Sort by combined activity (most played first)
        return Object.values(mapIndex)
            .sort((a, b) => b.totalGames - a.totalGames);
    }

    /**
     * Load map stats for both teams in parallel.
     */
    async function _loadMapsData() {
        const teamAId = _getH2HTeamAId();
        const teamA = _allTeams.find(t => t.id === teamAId);
        const teamB = _allTeams.find(t => t.id === _h2hOpponentId);

        if (!teamA?.teamTag || !teamB?.teamTag) return;

        _mapsLoading = true;
        _mapsDataA = null;
        _mapsDataB = null;

        // Re-render to show loading state
        _rerenderMapsTab();

        try {
            const [mapsA, mapsB] = await Promise.all([
                QWStatsService.getMaps(teamA.teamTag, { months: _h2hPeriod }),
                QWStatsService.getMaps(teamB.teamTag, { months: _h2hPeriod })
            ]);

            // Guard against stale response
            if (_getH2HTeamAId() !== teamA.id || _h2hOpponentId !== teamB.id) return;

            _mapsDataA = mapsA;
            _mapsDataB = mapsB;
        } catch (error) {
            console.error('Failed to load maps data:', error);
        } finally {
            _mapsLoading = false;
            _rerenderMapsTab();
        }
    }

    /**
     * Re-render just the maps tab content area.
     */
    function _rerenderMapsTab() {
        const container = document.querySelector('.team-detail-tab-content');
        if (container && _activeTab === 'h2h' && _h2hSubTab === 'maps') {
            const formContainer = document.getElementById('h2h-subtab-content');
            if (formContainer) {
                formContainer.innerHTML = _renderMapsTab();
            }
        }
    }

    /**
     * Reset all Maps tab state.
     */
    function _resetMapsState() {
        _mapsDataA = null;
        _mapsDataB = null;
        _mapsLoading = false;
    }

    // ========================================
    // Browse Teams Event Handler (Slice 5.1b)
    // ========================================

    /**
     * Reset all match history state (called when switching teams).
     */
    function _resetHistoryState() {
        _historyMatches = [];
        _historyMapFilter = '';
        _historyOpponentFilter = '';
        _historyPeriod = 3;
        _hoveredMatchId = null;
        _selectedMatchId = null;
        _selectedMatchStats = null;
        _statsLoading = false;
        _matchDataById.clear();
        _sortColumn = 'date';
        _sortDirection = 'desc';
        _activeStatsTab = 'performance';
        if (_activityChart) {
            _activityChart.destroy();
            _activityChart = null;
        }
    }

    function _handleBrowseTeamSelect(event) {
        const { teamId } = event.detail;
        if (!teamId) return;

        // Hide any visible tooltip
        _hideTooltip();

        // Reset match history state for new team
        _resetHistoryState();

        // If not in teams view, switch to it via the BottomPanelController
        if (_currentView !== 'teams') {
            if (typeof BottomPanelController !== 'undefined') {
                // Store pending team ID (survives cleanup/re-init cycle)
                _pendingTeamId = teamId;
                BottomPanelController.switchTab('teams');
                return; // switchTab will re-init us in teams mode; init() picks up _pendingTeamId
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
        // Notify router of sub-tab change
        if (typeof Router !== 'undefined') {
            if (tabName === 'h2h' && _h2hOpponentId) {
                Router.pushH2HOpponent(_selectedTeamId, _h2hOpponentId);
            } else {
                Router.pushTeamSubTab(_selectedTeamId, tabName);
            }
        }
    }

    // ========================================
    // Players View (3-column division layout)
    // ========================================

    function _renderPlayersView() {
        if (_playersSortMode === 'teams') {
            return _renderPlayersGroupedByTeam();
        }
        return _renderPlayersAlphabetical();
    }

    function _renderPlayersAlphabetical() {
        // Group players by division (player's primary team division)
        const divisions = { 'D1': [], 'D2': [], 'D3': [] };

        _allPlayers.forEach(player => {
            // Add player to each division they belong to
            const addedDivs = new Set();
            player.teams.forEach(team => {
                (team.divisions || []).forEach(div => {
                    if (divisions[div] && !addedDivs.has(div)) {
                        divisions[div].push(player);
                        addedDivs.add(div);
                    }
                });
            });
        });

        // Sort each division alphabetically
        Object.values(divisions).forEach(list =>
            list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
        );

        return _renderPlayersDivisionColumns(divisions);
    }

    function _renderPlayersGroupedByTeam() {
        const divisions = { 'D1': [], 'D2': [], 'D3': [] };

        _allTeams.forEach(team => {
            const norms = _normalizeDivisions(team.divisions);
            norms.forEach(div => {
                if (divisions[div]) {
                    divisions[div].push(team);
                }
            });
        });

        // Sort teams alphabetically within each division
        Object.values(divisions).forEach(list =>
            list.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || ''))
        );

        function renderColumn(divLabel, teams) {
            const sections = teams.map(team => {
                const roster = team.playerRoster || [];
                const sorted = [...roster].sort((a, b) => {
                    if (a.role === 'leader') return -1;
                    if (b.role === 'leader') return 1;
                    return (a.displayName || '').localeCompare(b.displayName || '');
                });

                const logoUrl = team.activeLogo?.urls?.small;
                const tag = team.teamTag || '??';
                const badgeContent = logoUrl
                    ? `<img src="${logoUrl}" alt="${tag}" class="w-full h-full object-contain">`
                    : `<span>${tag}</span>`;

                const rows = sorted.map(player => {
                    const avatarUrl = player.photoURL;
                    const initials = (player.displayName || '??').substring(0, 2).toUpperCase();
                    const avatarContent = avatarUrl
                        ? `<span class="avatar-initials-fallback">${initials}</span><img src="${avatarUrl}" alt="" class="avatar-img-layer" onerror="this.style.display='none'">`
                        : `<span class="avatar-initials-fallback">${initials}</span>`;
                    const leaderIcon = player.role === 'leader' ? '<span class="text-primary text-xs ml-0.5">★</span>' : '';

                    return `
                        <tr class="player-overview-row" data-player-key="${_escapeHtml(player.userId || player.displayName || '')}">
                            <td class="player-overview-avatar">
                                <div class="player-avatar-badge">${avatarContent}</div>
                            </td>
                            <td class="player-overview-name">${_escapeHtml(player.displayName || 'Unknown')}${leaderIcon}</td>
                        </tr>
                    `;
                }).join('');

                return `
                    <div class="players-team-group">
                        <div class="players-team-group-header" data-team-id="${_escapeHtml(team.id)}" style="cursor:pointer" title="View ${_escapeHtml(team.teamName)} details">
                            <div class="team-tag-badge" style="width:1.5rem;height:1.25rem;font-size:0.5rem">${badgeContent}</div>
                            <span>${_escapeHtml(team.teamName)}</span>
                            <span class="text-muted-foreground ml-auto">${roster.length}</span>
                        </div>
                        <table class="division-overview-table"><tbody>${rows}</tbody></table>
                    </div>
                `;
            }).join('');

            const playersIcon = `<svg class="header-players-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

            return `
                <div class="division-overview-column">
                    <div class="division-overview-header">
                        <span>${divLabel}</span>
                        ${playersIcon}
                    </div>
                    <div class="division-overview-scroll">${sections}</div>
                </div>
            `;
        }

        return `
            <div class="division-overview">
                ${renderColumn('Division 1', divisions['D1'])}
                ${renderColumn('Division 2', divisions['D2'])}
                ${renderColumn('Division 3', divisions['D3'])}
            </div>
        `;
    }

    function _renderPlayersDivisionColumns(divisions) {
        function renderColumn(divLabel, players) {
            const rows = players.map(player => {
                const avatarUrl = player.photoURL;
                const initials = (player.displayName || '??').substring(0, 2).toUpperCase();
                const avatarContent = avatarUrl
                    ? `<span class="avatar-initials-fallback">${initials}</span><img src="${avatarUrl}" alt="" class="avatar-img-layer" onerror="this.style.display='none'">`
                    : `<span class="avatar-initials-fallback">${initials}</span>`;
                const multiTeam = player.teams.length > 1
                    ? `<span class="player-multi-badge">+${player.teams.length - 1}</span>` : '';

                return `
                    <tr class="player-overview-row" data-player-key="${_escapeHtml(player.key)}">
                        <td class="player-overview-avatar">
                            <div class="player-avatar-badge">${avatarContent}</div>
                        </td>
                        <td class="player-overview-name">${_escapeHtml(player.displayName || 'Unknown')}${multiTeam}</td>
                    </tr>
                `;
            }).join('');

            const playersIcon = `<svg class="header-players-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

            return `
                <div class="division-overview-column">
                    <div class="division-overview-header">
                        <span>${divLabel}</span>
                        ${playersIcon}
                    </div>
                    <div class="division-overview-scroll">
                        <table class="division-overview-table"><tbody>${rows}</tbody></table>
                    </div>
                </div>
            `;
        }

        return `
            <div class="division-overview">
                ${renderColumn('Division 1', divisions['D1'])}
                ${renderColumn('Division 2', divisions['D2'])}
                ${renderColumn('Division 3', divisions['D3'])}
            </div>
        `;
    }

    // ========================================
    // Event Handlers
    // ========================================

    function _attachListeners() {
        // Sort mode toggle (Players mode)
        _container.querySelectorAll('[data-sort-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.sortMode;
                if (mode && mode !== _playersSortMode) {
                    _playersSortMode = mode;
                    _render(); // Full re-render to update toolbar + content
                    // Notify router of sort change
                    if (typeof Router !== 'undefined') {
                        Router.pushPlayerSort(mode);
                    }
                }
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
        // Division overview row clicks + hover tooltip (when no team selected)
        _container.querySelectorAll('.division-overview-row').forEach(row => {
            row.addEventListener('click', () => {
                const teamId = row.dataset.teamId;
                if (teamId) {
                    // Dispatch event so Router can track this navigation
                    window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
                        detail: { teamId }
                    }));
                }
            });

            row.addEventListener('mouseenter', () => {
                const teamId = row.dataset.teamId;
                const team = _allTeams.find(t => t.id === teamId);
                if (team) _showRosterTooltip(row, team);
            });

            row.addEventListener('mouseleave', () => {
                _hideTooltip();
            });
        });

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
        // Team group headers are clickable in by-team mode → navigate to team details
        if (_playersSortMode === 'teams') {
            _container.querySelectorAll('.players-team-group-header[data-team-id]').forEach(header => {
                header.addEventListener('click', () => {
                    const teamId = header.dataset.teamId;
                    if (teamId) {
                        window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
                            detail: { teamId }
                        }));
                    }
                });
            });
            return;
        }

        _container.querySelectorAll('.player-overview-row').forEach(row => {
            row.addEventListener('mouseenter', () => {
                const playerKey = row.dataset.playerKey;
                const player = _allPlayers.find(p => p.key === playerKey);
                if (player && player.teams.length > 0) {
                    _showPlayerTooltip(row, player);
                }
            });

            row.addEventListener('mouseleave', () => {
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

    function _showRosterTooltip(row, team) {
        _createTooltip();

        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }

        const roster = team.playerRoster || [];
        const sorted = [...roster].sort((a, b) => {
            if (a.role === 'leader') return -1;
            if (b.role === 'leader') return 1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        const rosterHtml = sorted.map(player => {
            const initials = (player.displayName || '??').substring(0, 2).toUpperCase();
            const leaderBadge = player.role === 'leader' ? ' <span class="tooltip-you">(Leader)</span>' : '';
            const leaderClass = player.role === 'leader' ? 'tooltip-current' : '';
            return `
                <div class="tooltip-player ${leaderClass}">
                    <span class="tooltip-initials">${initials}</span>
                    <span class="tooltip-name">${_escapeHtml(player.displayName || 'Unknown')}${leaderBadge}</span>
                </div>
            `;
        }).join('');

        _tooltip.innerHTML = `
            <div class="tooltip-list">${rosterHtml}</div>
        `;

        // Position: right-aligned within the column, first player aligned with team name
        const rowRect = row.getBoundingClientRect();
        const column = row.closest('.division-overview-column');
        const columnRect = column ? column.getBoundingClientRect() : rowRect;

        _tooltip.style.visibility = 'hidden';
        _tooltip.style.display = 'block';
        const tooltipRect = _tooltip.getBoundingClientRect();

        // Right-align tooltip with column right edge
        let left = columnRect.right - tooltipRect.width;
        let top = rowRect.top;

        // If goes off bottom, show above instead
        if (top + tooltipRect.height > window.innerHeight - 8) {
            top = rowRect.top - tooltipRect.height - 4;
        }

        // Keep within viewport
        if (left < 8) left = 8;
        if (top < 8) top = 8;

        _tooltip.style.left = `${left}px`;
        _tooltip.style.top = `${top}px`;
        _tooltip.style.visibility = 'visible';
    }

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

        // Delegated click on team name headers → navigate to team
        _tooltip.addEventListener('click', (e) => {
            const header = e.target.closest('.tooltip-team-link[data-team-id]');
            if (header) {
                const teamId = header.dataset.teamId;
                _hideTooltipImmediate();
                window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
                    detail: { teamId }
                }));
            }
        });
    }

    function _showPlayerTooltip(row, player) {
        _createTooltip();

        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }

        // Build tooltip: show full roster for each team, highlight this player
        const playerKey = player.key;
        const sectionsHtml = player.teams.map(teamInfo => {
            const team = _allTeams.find(t => t.id === teamInfo.teamId);
            const roster = team ? (team.playerRoster || []) : [];
            const sorted = [...roster].sort((a, b) => {
                if (a.role === 'leader') return -1;
                if (b.role === 'leader') return 1;
                return (a.displayName || '').localeCompare(b.displayName || '');
            });

            const rosterHtml = sorted.map(p => {
                const initials = (p.displayName || '??').substring(0, 2).toUpperCase();
                const isHighlighted = (p.userId || p.displayName) === playerKey;
                const leaderBadge = p.role === 'leader' ? ' <span class="tooltip-you">(Leader)</span>' : '';
                const classes = [
                    'tooltip-player',
                    isHighlighted ? 'tooltip-current' : '',
                ].filter(Boolean).join(' ');
                return `
                    <div class="${classes}">
                        <span class="tooltip-initials">${initials}</span>
                        <span class="tooltip-name">${_escapeHtml(p.displayName || 'Unknown')}${leaderBadge}</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="tooltip-header tooltip-team-link" data-team-id="${_escapeHtml(teamInfo.teamId)}" style="cursor:pointer" title="View ${_escapeHtml(teamInfo.teamName)}">${_escapeHtml(teamInfo.teamName)} (${teamInfo.division || '?'}) - ${roster.length} players</div>
                <div class="tooltip-list">${rosterHtml}</div>
            `;
        }).join('');

        _tooltip.innerHTML = sectionsHtml;

        // Position: to the right of the row, header aligned with the clicked row
        // so the user can slide their mouse horizontally into the tooltip
        const rowRect = row.getBoundingClientRect();
        const column = row.closest('.division-overview-column');
        const columnRect = column ? column.getBoundingClientRect() : rowRect;

        _tooltip.style.visibility = 'hidden';
        _tooltip.style.display = 'block';
        const tooltipRect = _tooltip.getBoundingClientRect();

        // Right-align tooltip within the column (same as teams view)
        let left = columnRect.right - tooltipRect.width;
        // Align tooltip top with the hovered row
        let top = rowRect.top;

        // Keep within viewport
        if (left < 8) left = 8;

        // If tooltip goes off the bottom, shift it up
        if (top + tooltipRect.height > window.innerHeight - 8) {
            top = window.innerHeight - tooltipRect.height - 8;
        }

        if (left < 8) left = 8;
        if (top < 8) top = 8;

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

    function _hideTooltipImmediate() {
        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }
        if (_tooltip) {
            _tooltip.style.display = 'none';
        }
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
    // Router Integration
    // ========================================

    /**
     * Programmatically select a team and show its details.
     * Used by Router for deep-link restoration.
     */
    function selectTeam(teamId) {
        if (!teamId) return;
        _resetHistoryState();
        _resetH2HState();
        _activeTab = 'details';
        _selectedTeamId = teamId;
        _render();
        const team = _allTeams.find(t => t.id === teamId);
        if (team?.teamTag) {
            _loadMapStats(team.teamTag);
        }
    }

    /**
     * Deselect current team and return to division overview.
     * Used by Router when navigating back to #/teams.
     */
    function deselectTeam() {
        if (!_selectedTeamId) return;
        _resetHistoryState();
        _resetH2HState();
        _selectedTeamId = null;
        _activeTab = 'details';
        if (_container) _render();
    }

    /**
     * Programmatically set players sort mode.
     * Used by Router for deep-link restoration.
     */
    function setPlayersSortMode(mode) {
        if (!mode || mode === _playersSortMode) return;
        _playersSortMode = mode;
        if (_container) _render();
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
        _playersSortMode = 'alpha';
        _divisionFilters.clear();
        _allTeams = [];
        _allPlayers = [];
        _resetHistoryState();
        _resetH2HState();

        console.log('TeamsBrowserPanel cleaned up');
    }

    // Public API
    return {
        init,
        cleanup,
        switchTab,
        retryMapStats,
        retryMatchHistory,
        // Slice 5.2b: Match History split-panel interactions
        previewMatch,
        clearPreview,
        selectMatch,
        filterByMap,
        filterByOpponent,
        changePeriod,
        openFullStats,
        sortByColumn,
        switchStatsTab,
        // Slice 11.0a: H2H interactions
        selectH2HTeamA,
        selectOpponent,
        switchH2HSubTab,
        changeH2HPeriod,
        filterH2HByMap,
        previewH2HResult,
        clearH2HPreview,
        selectH2HResult,
        // Slice 11.0b: Form tab interactions
        previewFormResult,
        clearFormPreview,
        selectFormResult,
        clearFormSelection,
        // Router integration
        selectTeam,
        deselectTeam,
        setPlayersSortMode
    };
})();
