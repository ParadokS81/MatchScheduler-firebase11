// TeamBrowser.js - Browse all teams panel (bottom-right)
// Follows Cache + Listener pattern per CLAUDE.md

const TeamBrowser = (function() {
    'use strict';

    let _container = null;
    let _unsubscribe = null;
    let _allTeams = [];
    let _currentUserId = null;
    let _currentTeamId = null;

    // ========================================
    // Initialization
    // ========================================

    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) {
            console.error('TeamBrowser: Container not found:', containerId);
            return;
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
        TeamBrowserState.onFilterChange(() => _renderTeamList());
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
        if (!_container) return;

        _container.innerHTML = `
            <div class="team-browser flex flex-col h-full">
                <!-- Header with Search -->
                <div class="browser-header mb-3">
                    <h3 class="text-sm font-semibold text-foreground mb-2">Browse Teams</h3>

                    <!-- Search Input -->
                    <div class="relative mb-2">
                        <input type="text"
                               id="team-search-input"
                               placeholder="Search teams or players..."
                               class="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-md
                                      focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                                      placeholder:text-muted-foreground"
                        />
                        <svg class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                    </div>

                    <!-- Division Filter (toggles - none selected = show all) -->
                    <div class="flex gap-1 flex-wrap">
                        <button class="division-filter-btn" data-division="D1">Div 1</button>
                        <button class="division-filter-btn" data-division="D2">Div 2</button>
                        <button class="division-filter-btn" data-division="D3">Div 3</button>
                    </div>
                </div>

                <!-- Team List -->
                <div id="team-list-container" class="team-list flex-1 overflow-y-auto space-y-1.5">
                    <!-- Team cards and player results rendered here -->
                </div>

                <!-- Selection Info -->
                <div id="selection-info" class="selection-info mt-2 pt-2 border-t border-border hidden">
                    <span class="text-xs text-muted-foreground">
                        <span id="selection-count">0</span> team(s) selected
                    </span>
                </div>
            </div>
        `;

        _attachListeners();
        _renderTeamList();
    }

    function _attachListeners() {
        // Search input
        const searchInput = document.getElementById('team-search-input');
        searchInput?.addEventListener('input', (e) => {
            TeamBrowserState.setSearchQuery(e.target.value);
        });

        // Division filter buttons (toggles)
        _container.querySelectorAll('.division-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const division = btn.dataset.division;
                TeamBrowserState.toggleDivisionFilter(division);
                // Update visual state
                btn.classList.toggle('active');
            });
        });
    }

    // ========================================
    // Search & Filtering
    // ========================================

    function _getSearchResults() {
        const searchQuery = TeamBrowserState.getSearchQuery();
        const divisionFilters = TeamBrowserState.getDivisionFilters();

        // Apply division filter first
        const divisionFiltered = _allTeams.filter(team => {
            // Exclude current user's team
            if (team.id === _currentTeamId) return false;

            // Division filter (if any divisions selected, team must have at least one)
            if (divisionFilters.size > 0) {
                const teamDivisions = team.divisions || [];
                // Check if team has ANY of the selected divisions
                const hasMatchingDivision = teamDivisions.some(d => divisionFilters.has(d));
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
        if (!listContainer) return;

        const { teams, players, isSearching } = _getSearchResults();
        const hasResults = teams.length > 0 || players.length > 0;

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
            });

            // Hover handlers for player roster tooltip
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
        });

        // Attach click handlers to player results (selects their team)
        listContainer.querySelectorAll('.player-result').forEach(item => {
            item.addEventListener('click', () => {
                const teamId = item.dataset.teamId;
                TeamBrowserState.selectTeam(teamId);
            });

            // Hover handlers for team roster tooltip (same as team cards)
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

    // ========================================
    // Team Roster Tooltip
    // ========================================

    let _teamTooltip = null;
    let _tooltipHideTimeout = null;

    function _createTeamTooltip() {
        if (_teamTooltip) return;

        _teamTooltip = document.createElement('div');
        _teamTooltip.id = 'team-roster-tooltip';
        _teamTooltip.className = 'player-tooltip'; // Reuse existing tooltip styles
        _teamTooltip.style.display = 'none';
        document.body.appendChild(_teamTooltip);

        // Keep tooltip visible when hovering over it
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

    function _showTeamTooltip(card, team) {
        _createTeamTooltip();

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

        // Build roster HTML
        const rosterHtml = sortedRoster.map(player => {
            const leaderBadge = player.role === 'leader' ? ' <span class="tooltip-you">(Leader)</span>' : '';
            const leaderClass = player.role === 'leader' ? 'tooltip-current' : '';
            return `
                <div class="tooltip-player ${leaderClass}">
                    <span class="tooltip-initials">${player.initials || '??'}</span>
                    <span class="tooltip-name">${player.displayName || 'Unknown'}${leaderBadge}</span>
                </div>
            `;
        }).join('');

        _teamTooltip.innerHTML = `
            <div class="tooltip-header">${team.teamName} - ${roster.length} players</div>
            <div class="tooltip-list">
                ${rosterHtml}
            </div>
        `;

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
                _teamTooltip.style.display = 'none';
            }
        }, 150); // Small delay to allow moving to tooltip
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

        // Truncate long team names
        const displayName = team.teamName?.length > 18
            ? team.teamName.substring(0, 16) + '...'
            : team.teamName;

        // Check for small logo
        const smallLogoUrl = team.activeLogo?.urls?.small;
        const badgeContent = smallLogoUrl
            ? `<img src="${smallLogoUrl}" alt="${team.teamTag}" class="w-full h-full object-cover">`
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
                        </div>
                        <div class="team-meta text-xs text-muted-foreground">
                            ${divisions} • ${playerCount} player${playerCount !== 1 ? 's' : ''}
                        </div>
                    </div>

                    <!-- Star Button -->
                    <button class="star-btn p-1 ${isFavorite ? 'text-yellow-500' : 'text-muted-foreground'} hover:text-yellow-400 transition-colors"
                            data-team-id="${team.id}"
                            title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                        <svg class="w-4 h-4" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                        </svg>
                    </button>
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
