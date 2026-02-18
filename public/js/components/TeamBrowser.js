// TeamBrowser.js - Browse all teams panel
// Slice 13.0e: Unified right sidebar - split header/list containers
// Follows Cache + Listener pattern per CLAUDE.md

const TeamBrowser = (function() {
    'use strict';

    let _headerContainer = null;
    let _listContainer = null;
    let _container = null; // Legacy single container support
    let _unsubscribe = null;
    let _allTeams = [];
    let _currentUserId = null;
    let _currentTeamId = null;
    let _discordCache = new Map();

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize TeamBrowser
     * Slice 13.0e: Supports split containers (header + list) or legacy single container
     * @param {string} containerId - Either 'team-browser-header' for split mode, or legacy container ID
     */
    async function init(containerId) {
        // Check for split container mode (Slice 13.0e)
        _headerContainer = document.getElementById('team-browser-header');
        _listContainer = document.getElementById('team-browser-list');

        if (_headerContainer && _listContainer) {
            // Split mode - new unified sidebar
            _container = null;
        } else {
            // Legacy single container mode
            _container = document.getElementById(containerId);
            if (!_container) {
                console.error('TeamBrowser: Container not found:', containerId);
                return;
            }
            _headerContainer = null;
            _listContainer = null;
        }

        _currentUserId = window.firebase?.auth?.currentUser?.uid;
        _currentTeamId = typeof MatchSchedulerApp !== 'undefined'
            ? MatchSchedulerApp.getSelectedTeam()?.id
            : null;

        // Get initial team data from cache
        _allTeams = TeamService.getAllTeams() || [];

        // Render initial UI
        _render();

        // Set up filter listeners
        TeamBrowserState.onFilterChange(() => {
            // When filters change, deselect teams that no longer match
            _syncSelectionWithFilters();
            _renderTeamList();
        });
        TeamBrowserState.onSelectionChange(() => _renderTeamList());

        // Listen for favorites changes to update star display
        window.addEventListener('favorites-updated', _renderTeamList);

        // Subscribe to real-time team updates
        await _subscribeToTeams();

        console.log('🔍 TeamBrowser initialized with', _allTeams.length, 'teams');
    }

    // ========================================
    // Firebase Listener (Component owns this)
    // ========================================

    async function _subscribeToTeams() {
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
                    // Update local array
                    const index = _allTeams.findIndex(t => t.id === teamData.id);
                    if (index >= 0) {
                        _allTeams[index] = teamData;
                    } else {
                        _allTeams.push(teamData);
                    }
                    // Update service cache
                    TeamService.updateCachedTeam(teamData.id, teamData);
                } else if (change.type === 'removed') {
                    _allTeams = _allTeams.filter(t => t.id !== teamData.id);
                    TeamService.updateCachedTeam(teamData.id, null);
                }
            });

            _renderTeamList();
        }, (error) => {
            console.error('TeamBrowser: Subscription error:', error);
        });
    }

    // ========================================
    // Rendering
    // ========================================

    function _render() {
        if (_headerContainer && _listContainer) {
            // Split mode (Slice 13.0e)
            _renderSplitMode();
        } else if (_container) {
            // Legacy single container mode
            _renderLegacyMode();
        }

        _attachListeners();
        _renderTeamList();
    }

    /**
     * Slice 13.0e: Render to split containers (header + list)
     */
    function _renderSplitMode() {
        // Header: Search + Min Filters (one row) + Filter buttons (two rows)
        _headerContainer.innerHTML = `
            <div class="browser-header">
                <!-- Search + Min Filters row -->
                <div class="flex gap-2 items-center mb-2" id="search-filter-row">
                    <div class="relative flex-1 min-w-0">
                        <input type="search"
                               id="team-search-input"
                               placeholder="Search teams..."
                               inputmode="search"
                               autocomplete="off"
                               autocorrect="off"
                               autocapitalize="off"
                               spellcheck="false"
                               class="w-full pl-3 pr-8 py-1.5 text-sm bg-muted border border-border rounded-md
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

                <!-- Row 1: Division toggles -->
                <div class="flex gap-1 mb-1.5">
                    <button class="division-filter-btn flex-1 ${TeamBrowserState.isDivisionActive('D1') ? 'active' : ''}" data-division="D1">Div 1</button>
                    <button class="division-filter-btn flex-1 ${TeamBrowserState.isDivisionActive('D2') ? 'active' : ''}" data-division="D2">Div 2</button>
                    <button class="division-filter-btn flex-1 ${TeamBrowserState.isDivisionActive('D3') ? 'active' : ''}" data-division="D3">Div 3</button>
                </div>

                <!-- Row 2: Fav filter + All + Clear -->
                <div class="flex gap-1">
                    <button class="division-filter-btn fav-filter-btn flex-1 ${TeamBrowserState.isFavoritesFilterActive() ? 'active' : ''}"
                            data-filter="fav">★ Fav</button>
                    <button id="select-all-btn" class="division-filter-btn flex-1"
                            title="Select all visible teams">All</button>
                    <button id="clear-selection-btn" class="division-filter-btn flex-1"
                            title="Clear all selections">Clear</button>
                </div>
            </div>
        `;

        // Move compare-controls (min filters) into the search row
        // FilterPanel already rendered into compare-controls before TeamBrowser init
        const compareControls = document.getElementById('compare-controls');
        const searchRow = document.getElementById('search-filter-row');
        if (compareControls && searchRow) {
            searchRow.appendChild(compareControls);
        }

        // List container structure (content rendered by _renderTeamList)
        _listContainer.innerHTML = `
            <div class="team-browser h-full">
                <div id="team-list-container" class="team-list h-full overflow-y-auto space-y-1.5">
                    <!-- Team cards rendered here -->
                </div>
            </div>
        `;
    }

    /**
     * Legacy single container mode
     */
    function _renderLegacyMode() {
        _container.innerHTML = `
            <div class="team-browser flex flex-col h-full">
                <!-- Header with Search -->
                <div class="browser-header mb-2">
                    <!-- Search Input -->
                    <div class="relative mb-2">
                        <input type="search"
                               id="team-search-input"
                               placeholder="Search teams or players..."
                               inputmode="search"
                               autocomplete="off"
                               autocorrect="off"
                               autocapitalize="off"
                               spellcheck="false"
                               class="w-full pl-3 pr-8 py-1.5 text-sm bg-muted border border-border rounded-md
                                      focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                                      placeholder:text-muted-foreground"
                        />
                        <svg class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                    </div>

                    <!-- Row 1: Division toggles -->
                    <div class="flex gap-1 mb-1.5">
                        <button class="division-filter-btn flex-1 ${TeamBrowserState.isDivisionActive('D1') ? 'active' : ''}" data-division="D1">Div 1</button>
                        <button class="division-filter-btn flex-1 ${TeamBrowserState.isDivisionActive('D2') ? 'active' : ''}" data-division="D2">Div 2</button>
                        <button class="division-filter-btn flex-1 ${TeamBrowserState.isDivisionActive('D3') ? 'active' : ''}" data-division="D3">Div 3</button>
                    </div>

                    <!-- Row 2: Fav filter + All + Clear -->
                    <div class="flex gap-1">
                        <button class="division-filter-btn fav-filter-btn flex-1 ${TeamBrowserState.isFavoritesFilterActive() ? 'active' : ''}"
                                data-filter="fav">★ Fav</button>
                        <button id="select-all-btn" class="division-filter-btn flex-1"
                                title="Select all visible teams">All</button>
                        <button id="clear-selection-btn" class="division-filter-btn flex-1"
                                title="Clear all selections">Clear</button>
                    </div>
                </div>

                <!-- Team List -->
                <div id="team-list-container" class="team-list flex-1 overflow-y-auto space-y-1.5">
                    <!-- Team cards and player results rendered here -->
                </div>
            </div>
        `;
    }

    function _attachListeners() {
        // Search input
        const searchInput = document.getElementById('team-search-input');
        searchInput?.addEventListener('input', (e) => {
            TeamBrowserState.setSearchQuery(e.target.value);
        });

        // Find the container that has the filter buttons
        const filterContainer = _headerContainer || _container;
        if (!filterContainer) return;

        // Fav filter button
        const favBtn = filterContainer.querySelector('.fav-filter-btn');
        favBtn?.addEventListener('click', () => {
            TeamBrowserState.toggleFavoritesFilter();
            favBtn.classList.toggle('active');
        });

        // Division filter buttons (toggles) - exclude action buttons
        filterContainer.querySelectorAll('.division-filter-btn:not(.fav-filter-btn):not(#select-all-btn):not(#clear-selection-btn)').forEach(btn => {
            btn.addEventListener('click', () => {
                const division = btn.dataset.division;
                if (division) {
                    TeamBrowserState.toggleDivisionFilter(division);
                    btn.classList.toggle('active');
                }
            });
        });

        // Select All — selects all visible/filtered teams
        const selectAllBtn = document.getElementById('select-all-btn');
        selectAllBtn?.addEventListener('click', () => {
            const { teams } = _getSearchResults();
            const visibleTeamIds = teams.map(t => t.id);
            if (visibleTeamIds.length === 0) return;
            TeamBrowserState.selectTeams(visibleTeamIds);
        });

        // Clear — deselects everything + clears search (turns off comparison)
        const clearBtn = document.getElementById('clear-selection-btn');
        clearBtn?.addEventListener('click', () => {
            TeamBrowserState.clearSelection();
            const searchInput = document.getElementById('team-search-input');
            if (searchInput && searchInput.value) {
                searchInput.value = '';
                TeamBrowserState.setSearchQuery('');
            }
        });
    }

    // ========================================
    // Search & Filtering
    // ========================================

    function _getSearchResults() {
        const searchQuery = TeamBrowserState.getSearchQuery();
        const divisionFilters = TeamBrowserState.getDivisionFilters();
        const favoritesOnly = TeamBrowserState.isFavoritesFilterActive();

        // Build favorites set if filter is active
        const favoriteTeamIds = favoritesOnly && typeof FavoritesService !== 'undefined'
            ? new Set(FavoritesService.getFavorites())
            : null;

        // Apply filters
        const divisionFiltered = _allTeams.filter(team => {
            // Exclude current user's team
            if (team.id === _currentTeamId) return false;

            // Favorites filter
            if (favoriteTeamIds && !favoriteTeamIds.has(team.id)) return false;

            // Division filter (if any divisions selected, team must have at least one)
            if (divisionFilters.size > 0) {
                const teamDivisions = team.divisions || [];
                // Normalize divisions to "D1" format before comparison
                // (handles "1", "D1", 1, etc.)
                const normalizedTeamDivisions = teamDivisions.map(d => {
                    if (typeof d === 'number') return `D${d}`;
                    if (typeof d === 'string' && /^\d+$/.test(d)) return `D${d}`;
                    return d;
                });
                // Check if team has ANY of the selected divisions
                const hasMatchingDivision = normalizedTeamDivisions.some(d => divisionFilters.has(d));
                if (!hasMatchingDivision) return false;
            }
            return true;
        });

        // If no search query, return all teams (no player section)
        if (!searchQuery) {
            return {
                teams: divisionFiltered,
                players: [],
                isSearching: false
            };
        }

        // Search teams by name/tag
        const matchingTeams = divisionFiltered.filter(team => {
            const nameMatch = team.teamName?.toLowerCase().includes(searchQuery);
            const tagMatch = team.teamTag?.toLowerCase().includes(searchQuery);
            return nameMatch || tagMatch;
        });

        // Search players across all division-filtered teams
        const matchingPlayers = [];
        divisionFiltered.forEach(team => {
            const roster = team.playerRoster || [];
            roster.forEach(player => {
                if (player.displayName?.toLowerCase().includes(searchQuery)) {
                    matchingPlayers.push({
                        ...player,
                        teamId: team.id,
                        teamName: team.teamName,
                        teamTag: team.teamTag
                    });
                }
            });
        });

        return {
            teams: matchingTeams,
            players: matchingPlayers,
            isSearching: true
        };
    }

    function _renderTeamList() {
        const listContainer = document.getElementById('team-list-container');
        if (!listContainer) {
            return;
        }

        const { teams, players, isSearching } = _getSearchResults();
        const hasResults = teams.length > 0 || players.length > 0;

        // Update Select All button state
        _updateSelectAllButton(teams);

        if (!hasResults) {
            listContainer.innerHTML = `
                <div class="empty-state text-center py-6">
                    <p class="text-sm text-muted-foreground">No results found</p>
                    <p class="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
                </div>
            `;
            _updateSelectionInfo();
            return;
        }

        let html = '';

        // Teams section
        if (teams.length > 0) {
            const sortedTeams = [...teams].sort((a, b) =>
                (a.teamName || '').localeCompare(b.teamName || '')
            );

            if (isSearching) {
                html += `<div class="search-section-header">Teams (${teams.length})</div>`;
            }
            html += sortedTeams.map(team => _renderTeamCard(team)).join('');
        }

        // Players section (only when searching)
        if (isSearching && players.length > 0) {
            const sortedPlayers = [...players].sort((a, b) =>
                (a.displayName || '').localeCompare(b.displayName || '')
            );

            html += `<div class="search-section-header mt-3">Players (${players.length})</div>`;
            html += sortedPlayers.map(player => _renderPlayerResult(player)).join('');
        }

        listContainer.innerHTML = html;

        // Attach click handlers to team cards
        listContainer.querySelectorAll('.team-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.star-btn')) return;
                const teamId = card.dataset.teamId;
                TeamBrowserState.toggleTeamSelection(teamId);

                // Dispatch detail-select event for TeamsBrowserPanel (Slice 5.1b)
                window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
                    detail: { teamId }
                }));

                // On mobile: toggle roster tooltip on tap (no hover available)
                if (typeof MobileLayout !== 'undefined' && MobileLayout.isMobile()) {
                    const team = _allTeams.find(t => t.id === teamId);
                    if (team && team.playerRoster?.length > 0) {
                        // Toggle: if tooltip is already showing for this team, hide it
                        if (_teamTooltip && _teamTooltip.style.display !== 'none' &&
                            _teamTooltip.dataset.teamId === teamId) {
                            _hideTeamTooltipImmediate();
                        } else {
                            _showTeamTooltip(card, team);
                            if (_teamTooltip) _teamTooltip.dataset.teamId = teamId;
                        }
                    }
                }
            });

            // Hover handlers for player roster tooltip (desktop only)
            if (typeof MobileLayout === 'undefined' || !MobileLayout.isMobile()) {
                card.addEventListener('mouseenter', (e) => {
                    const teamId = card.dataset.teamId;
                    const team = _allTeams.find(t => t.id === teamId);
                    if (team && team.playerRoster?.length > 0) {
                        _showTeamTooltip(card, team);
                    }
                });

                card.addEventListener('mouseleave', () => {
                    _hideTeamTooltip();
                });
            }
        });

        // Attach click handlers to player results (navigates to their team)
        listContainer.querySelectorAll('.player-result').forEach(item => {
            item.addEventListener('click', () => {
                const teamId = item.dataset.teamId;
                TeamBrowserState.selectTeam(teamId);

                // Navigate to team details (same as clicking a team card)
                window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
                    detail: { teamId }
                }));
            });

            // Hover handlers for team roster tooltip (desktop only)
            if (typeof MobileLayout === 'undefined' || !MobileLayout.isMobile()) {
                item.addEventListener('mouseenter', () => {
                    const teamId = item.dataset.teamId;
                    const team = _allTeams.find(t => t.id === teamId);
                    if (team && team.playerRoster?.length > 0) {
                        _showTeamTooltip(item, team);
                    }
                });

                item.addEventListener('mouseleave', () => {
                    _hideTeamTooltip();
                });
            }
        });

        // Star button handlers - integrated with FavoritesService
        listContainer.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const teamId = btn.dataset.teamId;
                FavoritesService.toggleFavorite(teamId);
            });
        });

        _updateSelectionInfo();
    }

    /**
     * Update All/Clear button states based on current selection
     */
    function _updateSelectAllButton(teams) {
        const selectAllBtn = document.getElementById('select-all-btn');
        const clearBtn = document.getElementById('clear-selection-btn');

        const visibleTeamIds = teams.map(t => t.id);
        const allSelected = visibleTeamIds.length > 0 && TeamBrowserState.areAllSelected(visibleTeamIds);
        const hasSelection = TeamBrowserState.getSelectionCount() > 0;

        if (selectAllBtn) {
            selectAllBtn.classList.toggle('active', allSelected);
        }
        if (clearBtn) {
            clearBtn.classList.toggle('active', hasSelection);
        }
    }

    /**
     * Sync selection with current filters - deselect teams that no longer match
     */
    function _syncSelectionWithFilters() {
        const { teams } = _getSearchResults();
        const visibleTeamIds = new Set(teams.map(t => t.id));
        const selectedTeams = TeamBrowserState.getSelectedTeams();

        // Find selected teams that are no longer visible
        const teamsToDeselect = [];
        selectedTeams.forEach(teamId => {
            if (!visibleTeamIds.has(teamId)) {
                teamsToDeselect.push(teamId);
            }
        });

        // Deselect teams that no longer match filters
        if (teamsToDeselect.length > 0) {
            TeamBrowserState.deselectTeams(teamsToDeselect);
        }
    }

    // ========================================
    // Team Roster Tooltip
    // ========================================

    let _teamTooltip = null;
    let _tooltipHideTimeout = null;
    let _tooltipSourceElement = null; // Track which element triggered the tooltip

    function _createTeamTooltip() {
        if (_teamTooltip) return;

        _teamTooltip = document.createElement('div');
        _teamTooltip.id = 'team-roster-tooltip';
        _teamTooltip.className = 'player-tooltip'; // Reuse existing tooltip styles
        _teamTooltip.style.display = 'none';
        document.body.appendChild(_teamTooltip);

        // Keep tooltip visible when hovering over it (only if source is still valid)
        _teamTooltip.addEventListener('mouseenter', () => {
            if (_tooltipHideTimeout) {
                clearTimeout(_tooltipHideTimeout);
                _tooltipHideTimeout = null;
            }
        });

        _teamTooltip.addEventListener('mouseleave', () => {
            _hideTeamTooltip();
        });
    }

    async function _fetchDiscordInfo(userId) {
        if (_discordCache.has(userId)) return _discordCache.get(userId);
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', userId));
            if (!userDoc.exists()) { _discordCache.set(userId, null); return null; }
            const data = userDoc.data();
            const info = data.discordUsername
                ? { discordUsername: data.discordUsername, discordUserId: data.discordUserId || null }
                : null;
            _discordCache.set(userId, info);
            return info;
        } catch { _discordCache.set(userId, null); return null; }
    }

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function _showTeamTooltip(card, team) {
        _createTeamTooltip();

        // If switching to a different element, hide immediately first
        if (_tooltipSourceElement && _tooltipSourceElement !== card) {
            _teamTooltip.style.display = 'none';
        }
        _tooltipSourceElement = card;

        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }

        const roster = team.playerRoster || [];

        // Sort: leader first, then alphabetically
        const sortedRoster = [...roster].sort((a, b) => {
            if (a.role === 'leader') return -1;
            if (b.role === 'leader') return 1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        // Build roster HTML — no initials, leader in purple with Discord icon
        const rosterHtml = sortedRoster.map(player => {
            const isLeader = player.role === 'leader';
            const discordSlot = isLeader && player.userId
                ? `<span class="tooltip-leader-discord" data-uid="${player.userId}"></span>`
                : '';
            return `
                <div class="tooltip-player${isLeader ? ' tooltip-current' : ''}">
                    <span class="tooltip-name${isLeader ? ' tooltip-leader-name' : ''}">${_escapeHtml(player.displayName || 'Unknown')}</span>
                    ${discordSlot}
                </div>
            `;
        }).join('');

        _teamTooltip.innerHTML = `
            <div class="tooltip-header">
                <a href="#" class="tooltip-team-link" data-team-id="${team.id}">${_escapeHtml(team.teamName)}</a>
            </div>
            <div class="tooltip-list">
                ${rosterHtml}
            </div>
        `;

        // Make team name clickable to navigate to team details
        const teamLink = _teamTooltip.querySelector('.tooltip-team-link');
        if (teamLink) {
            teamLink.addEventListener('click', (e) => {
                e.preventDefault();
                const teamId = teamLink.dataset.teamId;
                _hideTeamTooltipImmediate();
                TeamBrowserState.selectTeam(teamId);
                window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
                    detail: { teamId }
                }));
            });
        }

        // Async load Discord DM icon for leader (opens Discord app via protocol handler)
        const leader = sortedRoster.find(p => p.role === 'leader');
        if (leader?.userId) {
            _fetchDiscordInfo(leader.userId).then(info => {
                if (!_teamTooltip || _teamTooltip.style.display === 'none') return;
                const slot = _teamTooltip.querySelector(`.tooltip-leader-discord[data-uid="${CSS.escape(leader.userId)}"]`);
                if (!slot || !info?.discordUserId) return;
                const username = _escapeHtml(info.discordUsername || '');
                slot.innerHTML = `<button class="tooltip-discord-link" title="DM ${username} on Discord"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg></button>`;
                slot.querySelector('button').addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.location.href = `discord://discord.com/users/${info.discordUserId}`;
                });
            });
        }

        // Position tooltip near card (to the left since browser is on the right)
        const cardRect = card.getBoundingClientRect();

        // Make tooltip visible (but off-screen) to measure it
        _teamTooltip.style.visibility = 'hidden';
        _teamTooltip.style.display = 'block';
        const tooltipRect = _teamTooltip.getBoundingClientRect();

        // Show to the left of the card
        let left = cardRect.left - tooltipRect.width - 8;
        let top = cardRect.top;

        // If tooltip would go off left edge, show on right
        if (left < 8) {
            left = cardRect.right + 8;
        }

        // If tooltip would go off bottom, adjust up
        if (top + tooltipRect.height > window.innerHeight) {
            top = window.innerHeight - tooltipRect.height - 8;
        }

        // Ensure tooltip doesn't go off top
        if (top < 8) {
            top = 8;
        }

        _teamTooltip.style.left = `${left}px`;
        _teamTooltip.style.top = `${top}px`;
        _teamTooltip.style.visibility = 'visible';
    }

    function _hideTeamTooltip() {
        _tooltipHideTimeout = setTimeout(() => {
            if (_teamTooltip) {
                // Verify mouse isn't still over source element or tooltip
                const isOverSource = _tooltipSourceElement?.matches(':hover');
                const isOverTooltip = _teamTooltip.matches(':hover');
                if (!isOverSource && !isOverTooltip) {
                    _teamTooltip.style.display = 'none';
                    _tooltipSourceElement = null;
                }
            }
        }, 150); // Small delay to allow moving to tooltip
    }

    function _hideTeamTooltipImmediate() {
        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }
        if (_teamTooltip) {
            _teamTooltip.style.display = 'none';
        }
        _tooltipSourceElement = null;
    }

    function _renderTeamCard(team) {
        const isSelected = TeamBrowserState.isTeamSelected(team.id);
        const isFavorite = typeof FavoritesService !== 'undefined' && FavoritesService.isFavorite(team.id);
        const playerCount = team.playerRoster?.length || 0;
        // Normalize divisions - handle both "D1" strings and legacy numeric values
        const rawDivisions = team.divisions || [];
        const normalizedDivisions = rawDivisions.map(d => {
            if (typeof d === 'number') return `D${d}`;
            if (typeof d === 'string' && /^\d+$/.test(d)) return `D${d}`;
            return d;
        });
        const divisions = normalizedDivisions.join(', ') || 'No division';

        const displayName = team.teamName;

        // Check for small logo
        const smallLogoUrl = team.activeLogo?.urls?.small;
        const badgeContent = smallLogoUrl
            ? `<img src="${smallLogoUrl}" alt="${team.teamTag}" class="w-full h-full">`
            : (team.teamTag || '??');

        return `
            <div class="team-card ${isSelected ? 'selected' : ''}" data-team-id="${team.id}">
                <div class="card-content flex items-center gap-2">
                    <!-- Team Tag Badge / Logo -->
                    <div class="team-tag-badge overflow-hidden">
                        ${badgeContent}
                    </div>

                    <!-- Team Info -->
                    <div class="flex-1 min-w-0">
                        <div class="team-name text-sm font-medium text-foreground truncate"
                             title="${team.teamName || ''}">
                            ${displayName || 'Unknown Team'}
                            <span class="division-pill">${normalizedDivisions[0] || ''}</span>
                        </div>
                        <div class="team-meta text-xs text-muted-foreground flex items-center gap-1">
                            <span>${divisions}</span>
                            <span>•</span>
                            <span>${playerCount}p</span>
                            <!-- Star Button (hover-only) -->
                            <button class="star-btn ml-auto ${isFavorite ? 'starred text-yellow-500' : 'text-muted-foreground'} hover:text-yellow-400 transition-colors"
                                    data-team-id="${team.id}"
                                    title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                                <svg class="w-3 h-3" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function _renderPlayerResult(player) {
        return `
            <div class="player-result" data-team-id="${player.teamId}">
                <div class="flex items-center gap-2">
                    <div class="player-initials">${player.initials || '??'}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-foreground truncate">
                            ${player.displayName || 'Unknown Player'}
                        </div>
                        <div class="text-xs text-muted-foreground">
                            [${player.teamTag || '??'}] ${player.teamName || 'Unknown Team'}
                        </div>
                    </div>
                    <svg class="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                </div>
            </div>
        `;
    }

    function _updateSelectionInfo() {
        const infoContainer = document.getElementById('selection-info');
        const countSpan = document.getElementById('selection-count');

        if (!infoContainer || !countSpan) return;

        const count = TeamBrowserState.getSelectionCount();
        countSpan.textContent = count;

        if (count > 0) {
            infoContainer.classList.remove('hidden');
        } else {
            infoContainer.classList.add('hidden');
        }
    }

    // ========================================
    // Public Methods
    // ========================================

    function refresh() {
        _renderTeamList();
    }

    function setCurrentTeam(teamId) {
        _currentTeamId = teamId;
        _renderTeamList(); // Re-render to exclude new current team
    }

    function cleanup() {
        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }
        // Cleanup tooltip
        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }
        if (_teamTooltip) {
            _teamTooltip.remove();
            _teamTooltip = null;
        }
        _tooltipSourceElement = null;
        // Remove favorites listener
        window.removeEventListener('favorites-updated', _renderTeamList);
        TeamBrowserState.reset();
        _allTeams = [];
        if (_container) {
            _container.innerHTML = '';
        }
    }

    // Public API
    return {
        init,
        refresh,
        setCurrentTeam,
        cleanup
    };
})();
