# Slice 3.1: Team Browser

## 1. Slice Definition
- **Slice ID:** 3.1
- **Name:** Team Browser
- **User Story:** As a team member, I can browse all active teams in the system so that I can find potential opponents for matches
- **Success Criteria:** User can see a scrollable list of all teams in the bottom-right panel, search by team name/tag OR player name (unified search), filter by division, and select teams for future comparison. Search results show Teams section first, then Players section (clicking a player selects their team). Team cards show name, tag, division, player count, and a star button (visual only).

## 2. PRD Mapping
```
PRIMARY SECTIONS:
- 4.2.1 Bottom Right - Browse All Teams:
  - Scrollable list of all active teams
  - Click team card to select/deselect for comparison
  - Star icon on each card to add/remove from favorites (visual only this slice)
  - Search/filter functionality
  - Shows team name, tag, division, player count

DEPENDENT SECTIONS:
- 5.3 Data Caching Strategy: Pre-load all team data (~28KB)
- 5.4 Real-time Update Architecture: Direct component listeners for team changes
- 6.1 Sacred 3x3 Grid: Bottom-right panel dimensions fixed
- 6.4 Component Interaction Patterns: Click-to-select pattern (no checkboxes)

IGNORED SECTIONS (for this slice):
- 4.2.1 Middle Right - Favorites Panel: Comes in Slice 3.2
- 4.2.1 Top Right - Filter Settings: Min player filters come in Slice 3.3
- 4.2.2-4.2.4 Comparison Process: Comes in Slices 3.4-3.5
```

## 3. Full Stack Architecture
```
FRONTEND COMPONENTS:
- TeamBrowser (NEW)
  - Firebase listeners: onSnapshot on /teams collection (active teams only)
  - Cache interactions:
    - Reads from TeamService.getAllTeams() for initial load
    - Updates cache when new teams added or teams modified
  - UI responsibilities:
    - Render scrollable list with two sections when searching:
      1. Teams section - teams matching search by name/tag
      2. Players section - players matching search, shows their team
    - Search input for unified search (teams + players)
    - Division filter buttons (All, D1, D2, D3)
    - Handle team card selection (toggle highlight)
    - Show star button (non-functional, visual only)
  - User actions:
    - Type in search box → filter inline, show Teams/Players sections
    - Click player result → selects their team for comparison
    - Select division → filter displayed teams
    - Click team card → toggle selection state
    - Click star button → no action (Slice 3.2)

- TeamCard (NEW - internal to TeamBrowser)
  - Display team info: name, tag, division(s), player count
  - Optional: team logo (if available)
  - Selection state indicator (highlighted background)
  - Star button (visual, non-functional)

FRONTEND SERVICES:
- TeamService (ENHANCED)
  - getAllTeams() → returns all active teams from cache
  - subscribeToAllTeams(callback) → real-time updates for team list
  - getTeam(teamId) → returns specific team (existing)
  - NEW: updateCachedTeam(teamId, data) → update single team in cache

- TeamBrowserState (NEW - lightweight state helper)
  - getSelectedTeams() → returns Set of selected teamIds
  - toggleTeamSelection(teamId) → add/remove from selection
  - clearSelection() → deselect all teams
  - getSearchQuery() → returns current search text
  - setSearchQuery(query) → update search filter
  - getDivisionFilter() → returns current division filter
  - setDivisionFilter(division) → update division filter

BACKEND REQUIREMENTS:
⚠️ NO NEW CLOUD FUNCTIONS NEEDED
- Team data already available from existing team documents
- All reads use existing security rules
- Team documents already contain all needed fields

- Firestore Operations:
  - READ: /teams (where status == 'active')
  - Index needed: teams collection on status field for active filtering

- Security Rules:
  - No changes needed - authenticated users can already read all teams

INTEGRATION POINTS:
- Frontend data flow:
  TeamService.getAllTeams() → filter by search/division → render TeamCards
- Real-time updates:
  onSnapshot(/teams) → TeamService.updateCachedTeam() → TeamBrowser.refresh()
- Selection state:
  Click card → TeamBrowserState.toggleTeamSelection() → re-render card
```

## 4. Integration Code Examples

### TeamBrowserState (NEW - lightweight state helper)
```javascript
// TeamBrowserState.js - Selection and filter state for team browser
const TeamBrowserState = (function() {
    'use strict';

    // Selection state
    let _selectedTeams = new Set();

    // Filter state
    let _searchQuery = '';
    let _divisionFilter = 'all'; // 'all', 'D1', 'D2', 'D3'

    // Callbacks for state changes
    let _onSelectionChange = null;
    let _onFilterChange = null;

    // Selection methods
    function getSelectedTeams() {
        return new Set(_selectedTeams);
    }

    function isTeamSelected(teamId) {
        return _selectedTeams.has(teamId);
    }

    function toggleTeamSelection(teamId) {
        if (_selectedTeams.has(teamId)) {
            _selectedTeams.delete(teamId);
        } else {
            _selectedTeams.add(teamId);
        }

        if (_onSelectionChange) {
            _onSelectionChange(_selectedTeams);
        }

        console.log('📋 Team selection:', Array.from(_selectedTeams));
        return isTeamSelected(teamId);
    }

    function selectTeam(teamId) {
        if (!_selectedTeams.has(teamId)) {
            _selectedTeams.add(teamId);
            if (_onSelectionChange) {
                _onSelectionChange(_selectedTeams);
            }
        }
    }

    function deselectTeam(teamId) {
        if (_selectedTeams.has(teamId)) {
            _selectedTeams.delete(teamId);
            if (_onSelectionChange) {
                _onSelectionChange(_selectedTeams);
            }
        }
    }

    function clearSelection() {
        _selectedTeams.clear();
        if (_onSelectionChange) {
            _onSelectionChange(_selectedTeams);
        }
    }

    function getSelectionCount() {
        return _selectedTeams.size;
    }

    // Filter methods
    function getSearchQuery() {
        return _searchQuery;
    }

    function setSearchQuery(query) {
        _searchQuery = (query || '').toLowerCase().trim();
        if (_onFilterChange) {
            _onFilterChange({ search: _searchQuery, division: _divisionFilter });
        }
    }

    function getDivisionFilter() {
        return _divisionFilter;
    }

    function setDivisionFilter(division) {
        _divisionFilter = division || 'all';
        if (_onFilterChange) {
            _onFilterChange({ search: _searchQuery, division: _divisionFilter });
        }
    }

    // Event handlers
    function onSelectionChange(callback) {
        _onSelectionChange = callback;
    }

    function onFilterChange(callback) {
        _onFilterChange = callback;
    }

    // Cleanup
    function reset() {
        _selectedTeams.clear();
        _searchQuery = '';
        _divisionFilter = 'all';
    }

    return {
        // Selection
        getSelectedTeams,
        isTeamSelected,
        toggleTeamSelection,
        selectTeam,
        deselectTeam,
        clearSelection,
        getSelectionCount,

        // Filters
        getSearchQuery,
        setSearchQuery,
        getDivisionFilter,
        setDivisionFilter,

        // Events
        onSelectionChange,
        onFilterChange,

        // Lifecycle
        reset
    };
})();
```

### TeamBrowser Component (NEW)
```javascript
// TeamBrowser.js - Browse all teams panel (bottom-right)
const TeamBrowser = (function() {
    'use strict';

    let _container = null;
    let _unsubscribe = null;
    let _allTeams = [];
    let _currentUserId = null;
    let _currentTeamId = null;

    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) {
            console.error('TeamBrowser: Container not found:', containerId);
            return;
        }

        _currentUserId = window.firebase?.auth?.currentUser?.uid;
        _currentTeamId = MatchSchedulerApp?.getSelectedTeam()?.id;

        // Get initial team data from cache
        _allTeams = TeamService.getAllTeams() || [];

        // Render initial UI
        _render();

        // Set up filter listeners
        TeamBrowserState.onFilterChange(() => _renderTeamList());
        TeamBrowserState.onSelectionChange(() => _renderTeamList());

        // Subscribe to real-time team updates
        await _subscribeToTeams();

        console.log('🔍 TeamBrowser initialized with', _allTeams.length, 'teams');
    }

    async function _subscribeToTeams() {
        const { collection, query, where, onSnapshot } = await import('firebase/firestore');
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
                }
            });

            _renderTeamList();
        }, (error) => {
            console.error('TeamBrowser: Subscription error:', error);
        });
    }

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
                               placeholder="Search teams..."
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

                    <!-- Division Filter -->
                    <div class="flex gap-1">
                        <button class="division-filter-btn active" data-division="all">All</button>
                        <button class="division-filter-btn" data-division="D1">D1</button>
                        <button class="division-filter-btn" data-division="D2">D2</button>
                        <button class="division-filter-btn" data-division="D3">D3</button>
                    </div>
                </div>

                <!-- Team List -->
                <div id="team-list-container" class="team-list flex-1 overflow-y-auto space-y-1.5">
                    <!-- Team cards rendered here -->
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

        // Division filter buttons
        const filterBtns = _container.querySelectorAll('.division-filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Update filter
                TeamBrowserState.setDivisionFilter(btn.dataset.division);
            });
        });
    }

    // Get search results - returns { teams: [], players: [] }
    function _getSearchResults() {
        const searchQuery = TeamBrowserState.getSearchQuery();
        const divisionFilter = TeamBrowserState.getDivisionFilter();

        // Apply division filter first
        const divisionFiltered = _allTeams.filter(team => {
            if (team.id === _currentTeamId) return false;
            if (divisionFilter !== 'all') {
                const teamDivisions = team.divisions || [];
                if (!teamDivisions.includes(divisionFilter)) return false;
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
        });

        // Attach click handlers to player results (selects their team)
        listContainer.querySelectorAll('.player-result').forEach(item => {
            item.addEventListener('click', () => {
                const teamId = item.dataset.teamId;
                TeamBrowserState.selectTeam(teamId);
            });
        });

        // Star button handlers (visual feedback only)
        listContainer.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.classList.toggle('starred');
                console.log('⭐ Star clicked (visual only):', btn.dataset.teamId);
            });
        });

        _updateSelectionInfo();
    }

    function _renderPlayerResult(player) {
        return `
            <div class="player-result" data-team-id="${player.teamId}">
                <div class="flex items-center gap-2">
                    <div class="player-initials">${player.initials || '??'}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-foreground truncate">
                            ${player.displayName}
                        </div>
                        <div class="text-xs text-muted-foreground">
                            [${player.teamTag}] ${player.teamName}
                        </div>
                    </div>
                    <svg class="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                </div>
            </div>
        `;
    }

    function _renderTeamCard(team) {
        const isSelected = TeamBrowserState.isTeamSelected(team.id);
        const playerCount = team.playerRoster?.length || 0;
        const divisions = (team.divisions || []).join(', ') || 'No division';

        // Truncate long team names
        const displayName = team.teamName?.length > 18
            ? team.teamName.substring(0, 16) + '...'
            : team.teamName;

        return `
            <div class="team-card ${isSelected ? 'selected' : ''}" data-team-id="${team.id}">
                <div class="card-content flex items-center gap-2">
                    <!-- Team Tag Badge -->
                    <div class="team-tag-badge">
                        ${team.teamTag || '??'}
                    </div>

                    <!-- Team Info -->
                    <div class="flex-1 min-w-0">
                        <div class="team-name text-sm font-medium text-foreground truncate"
                             title="${team.teamName}">
                            ${displayName}
                        </div>
                        <div class="team-meta text-xs text-muted-foreground">
                            ${divisions} • ${playerCount} player${playerCount !== 1 ? 's' : ''}
                        </div>
                    </div>

                    <!-- Star Button (visual only) -->
                    <button class="star-btn p-1 text-muted-foreground hover:text-yellow-400 transition-colors"
                            data-team-id="${team.id}"
                            title="Add to favorites">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                        </svg>
                    </button>
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
        TeamBrowserState.reset();
        _allTeams = [];
        if (_container) {
            _container.innerHTML = '';
        }
    }

    return {
        init,
        refresh,
        setCurrentTeam,
        cleanup
    };
})();
```

### Enhanced TeamService - Add updateCachedTeam method
```javascript
// Addition to TeamService.js

// Cache for all teams
let _allTeamsCache = {};

/**
 * Load all active teams into cache
 */
async function loadAllTeams() {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const db = window.firebase.db;

    const teamsQuery = query(
        collection(db, 'teams'),
        where('status', '==', 'active')
    );

    const snapshot = await getDocs(teamsQuery);
    _allTeamsCache = {};

    snapshot.forEach(doc => {
        _allTeamsCache[doc.id] = { id: doc.id, ...doc.data() };
    });

    console.log('📂 Loaded', Object.keys(_allTeamsCache).length, 'teams into cache');
    return Object.values(_allTeamsCache);
}

/**
 * Get all teams from cache
 */
function getAllTeams() {
    return Object.values(_allTeamsCache);
}

/**
 * Update a single team in cache
 */
function updateCachedTeam(teamId, teamData) {
    if (teamData.status === 'archived') {
        delete _allTeamsCache[teamId];
    } else {
        _allTeamsCache[teamId] = { id: teamId, ...teamData };
    }
}

/**
 * Check if teams are loaded
 */
function hasTeamsLoaded() {
    return Object.keys(_allTeamsCache).length > 0;
}

// Add to public API
return {
    // ... existing methods
    loadAllTeams,
    getAllTeams,
    updateCachedTeam,
    hasTeamsLoaded
};
```

### CSS for Team Browser
```css
/* Add to src/css/input.css */

/* ========================================
   Team Browser (bottom-right panel)
   ======================================== */

.team-browser {
    height: 100%;
}

/* Division Filter Buttons */
.division-filter-btn {
    @apply px-2 py-0.5 text-xs rounded-md transition-colors;
    @apply bg-muted text-muted-foreground hover:bg-accent;
}

.division-filter-btn.active {
    @apply bg-primary text-primary-foreground;
}

/* Team List Container */
.team-list {
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
}

.team-list::-webkit-scrollbar {
    width: 4px;
}

.team-list::-webkit-scrollbar-track {
    background: transparent;
}

.team-list::-webkit-scrollbar-thumb {
    background-color: var(--border);
    border-radius: 2px;
}

/* Team Card */
.team-card {
    @apply p-2 rounded-md cursor-pointer transition-all;
    @apply bg-muted/30 border border-transparent;
    @apply hover:bg-muted/50 hover:border-border;
}

.team-card.selected {
    @apply bg-primary/15 border-primary/50;
}

.team-card.selected:hover {
    @apply bg-primary/20;
}

/* Team Tag Badge */
.team-tag-badge {
    @apply flex items-center justify-center;
    @apply w-10 h-8 rounded text-xs font-bold uppercase;
    @apply bg-secondary text-secondary-foreground;
    letter-spacing: 0.02em;
}

/* Star Button */
.star-btn {
    flex-shrink: 0;
}

.star-btn.starred svg {
    fill: currentColor;
    @apply text-yellow-400;
}

.star-btn:hover svg {
    @apply text-yellow-400;
}

/* Selection Info Footer */
.selection-info {
    @apply text-center;
}

/* Search Section Headers */
.search-section-header {
    @apply text-xs font-semibold text-muted-foreground uppercase tracking-wide;
    @apply py-1 px-1 mb-1;
}

/* Player Result Item */
.player-result {
    @apply p-2 rounded-md cursor-pointer transition-all;
    @apply bg-muted/20 border border-transparent;
    @apply hover:bg-accent/50 hover:border-border;
}

.player-initials {
    @apply flex items-center justify-center;
    @apply w-8 h-8 rounded-full text-xs font-semibold;
    @apply bg-accent text-accent-foreground;
}
```

### App.js Integration
```javascript
// Add to app.js initialization

async function initApp() {
    // ... existing init code ...

    // Load all teams into cache on app start
    await TeamService.loadAllTeams();

    // Initialize TeamBrowser in bottom-right panel
    if (document.getElementById('bottom-right-panel')) {
        await TeamBrowser.init('bottom-right-panel');
    }

    // Update TeamBrowser when user switches teams
    // (so current team is excluded from browse list)
    function onTeamSwitch(newTeamId) {
        TeamBrowser.setCurrentTeam(newTeamId);
    }
}

// Cleanup on logout
function cleanup() {
    // ... existing cleanup ...
    TeamBrowser.cleanup();
}
```

## 5. Performance Classification
```
HOT PATHS (<50ms):
- Search input filtering: Pure JavaScript filter on cached array
- Division filter selection: Pure JavaScript filter on cached array
- Team card selection toggle: Class toggle + state update
- Rendering filtered team list: DOM manipulation only

COLD PATHS (<2s):
- Initial team list load: Already cached by TeamService on app start
- Real-time team updates: Firebase listener, incremental updates

BACKEND PERFORMANCE:
- No Cloud Functions in this slice
- Firestore index needed: teams collection on 'status' field
- All data pre-loaded in TeamService cache (~28KB for 40 teams)
```

## 6. Data Flow Diagram
```
INITIAL LOAD:
App Start → TeamService.loadAllTeams() → Cache all teams (~28KB)
                                                ↓
User logs in → TeamBrowser.init() → Read from cache
                                         ↓
                                   Render team list (excluding current team)
                                         ↓
                                   Set up onSnapshot listener for updates

SEARCH/FILTER:
User types in search → TeamBrowserState.setSearchQuery()
                              ↓
                        onFilterChange callback fires
                              ↓
                        _getFilteredTeams() filters cache
                              ↓
                        _renderTeamList() updates DOM

TEAM SELECTION:
User clicks team card → TeamBrowserState.toggleTeamSelection()
                               ↓
                         onSelectionChange callback fires
                               ↓
                         _renderTeamList() updates card styling
                               ↓
                         Selection count updated in footer

REAL-TIME UPDATE:
Team created/modified → Firestore triggers onSnapshot
                               ↓
                         snapshot.docChanges() processed
                               ↓
                         _allTeams array updated
                               ↓
                         TeamService.updateCachedTeam()
                               ↓
                         _renderTeamList() refreshes display
```

## 7. Test Scenarios
```
FRONTEND TESTS:
- [ ] Team list displays all active teams (excluding current user's team)
- [ ] Team cards show correct info: name, tag, divisions, player count
- [ ] Long team names are truncated with ellipsis
- [ ] Teams are sorted alphabetically by name
- [ ] Empty state shows when no teams match filters
- [ ] Scrollbar appears when list exceeds container height
- [ ] Division filter buttons show correct active state

SEARCH FUNCTIONALITY (UNIFIED - TEAMS + PLAYERS):
- [ ] Search filters by team name (partial match, case-insensitive)
- [ ] Search filters by team tag (partial match, case-insensitive)
- [ ] Search filters by player name (partial match, case-insensitive)
- [ ] When searching, results show "Teams (N)" section header
- [ ] When searching, results show "Players (N)" section below teams
- [ ] Player results show: initials, name, team tag, team name
- [ ] Clicking player result selects their team (highlights team card)
- [ ] Empty search shows all teams (no player section, no headers)
- [ ] Search updates list instantly as user types
- [ ] Clearing search input shows all teams again

DIVISION FILTER:
- [ ] "All" shows teams from all divisions
- [ ] D1/D2/D3 buttons filter to only teams with that division
- [ ] Division filter works with teams in multiple divisions
- [ ] Filter updates list instantly on button click
- [ ] Active filter button is visually highlighted

TEAM SELECTION:
- [ ] Clicking team card toggles selection state
- [ ] Selected cards have highlighted background
- [ ] Multiple teams can be selected simultaneously
- [ ] Selection count shows in footer when teams selected
- [ ] Selection persists when filters change
- [ ] Deselecting team removes highlight

STAR BUTTON:
- [ ] Star button is visible on each card
- [ ] Clicking star toggles visual fill state
- [ ] Star click does not trigger card selection
- [ ] Star state resets on page refresh (no persistence)

INTEGRATION TESTS (CRITICAL):
- [ ] Team browser loads with cached data on app start
- [ ] Real-time: New team created → Appears in list within 2s
- [ ] Real-time: Team archived → Disappears from list
- [ ] Real-time: Team name changed → Updates in list
- [ ] Team switch: Switching teams excludes new current team from list
- [ ] Search + division: Combined filters work correctly
- [ ] Large list (40+ teams) scrolls smoothly

END-TO-END TESTS:
- [ ] User logs in → Sees team list in bottom-right panel
- [ ] User searches for team → Finds correct team(s)
- [ ] User filters by D1 → Only D1 teams shown
- [ ] User selects 3 teams → Selection count shows "3"
- [ ] User clears search → All teams visible again
- [ ] Page refresh → Teams reload from cache/Firebase
```

## 8. Common Integration Pitfalls
- [ ] Forgetting to exclude current user's team from browse list
- [ ] Not updating TeamService cache on real-time updates
- [ ] Search not being case-insensitive
- [ ] Selection state not persisting when filters change
- [ ] Division filter not handling teams with multiple divisions
- [ ] Star button click propagating to card selection
- [ ] Not handling empty team arrays (divisions, playerRoster)
- [ ] Listener not unsubscribed on cleanup
- [ ] Missing loading state during initial team fetch
- [ ] Panel overflow not handling long team lists
- [ ] Player search not including all roster members
- [ ] Player click not selecting the correct team
- [ ] Section headers showing when not searching (should only show during active search)

## 9. Implementation Notes

### File Structure
```
public/js/
├── services/
│   └── TeamService.js          (ENHANCED - add cache methods)
│   └── TeamBrowserState.js     (NEW - selection/filter state)
├── components/
│   └── TeamBrowser.js          (NEW - main component)

src/css/
└── input.css                   (ADD team browser styles)
```

### Panel Location
Team Browser goes in the **bottom-right panel** of the sacred 3x3 grid:
- Container ID: `bottom-right-panel` (or similar)
- Panel has fixed height based on grid layout
- Must handle overflow with internal scrolling

### Firestore Index
Ensure index exists for teams collection:
```
Collection: teams
Field: status (Ascending)
```
This enables efficient querying of active teams only.

### Team Data Structure
Team documents include (from SCHEMA.md):
```javascript
{
  teamName: string,           // Display name
  teamTag: string,            // 2-4 char uppercase
  divisions: string[],        // ['D1', 'D2', etc.]
  playerRoster: PlayerEntry[],
  status: 'active' | 'archived',
  leaderId: string,
  // ... other fields
}
```

### Excluding Current Team
The user's currently selected team should NOT appear in the browse list. This prevents accidentally selecting your own team for comparison.

### Star Button State
The star button is visual-only in this slice. Clicking it toggles a `starred` class for visual feedback, but:
- State is NOT persisted to localStorage
- State is NOT synced to Firebase
- State resets on page refresh

Full functionality comes in Slice 3.2 (Favorites System).

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Maximum 40 teams in system (per project scale)
- **Rationale**: PRD states ~40 teams, so no pagination needed
- **Alternative**: Could add pagination, but unnecessary at this scale

- **[ASSUMPTION]**: Teams sorted alphabetically by name
- **Rationale**: Simple, predictable sorting for users
- **Alternative**: Could sort by player count, last activity, etc.

- **[ASSUMPTION]**: Star button visual feedback only, no persistence
- **Rationale**: Per user decision, full favorites come in Slice 3.2
- **Alternative**: Could store in localStorage now, but risks inconsistency

- **[ASSUMPTION]**: Search matches both name AND tag
- **Rationale**: Users may remember either identifier
- **Alternative**: Could have separate search modes

- **[ASSUMPTION]**: Division filter is OR logic (team in ANY selected division)
- **Rationale**: Simpler UX, consistent with single-select filter buttons
- **Alternative**: Could support AND logic if needed

---

## Quality Checklist

Before considering this slice spec complete:
- [x] Frontend AND backend requirements specified
- [x] All PRD requirements mapped (4.2.1 Bottom Right panel)
- [x] Architecture follows established patterns (Cache + Listeners)
- [x] Hot paths clearly identified (all filtering is client-side)
- [x] Test scenarios cover full stack
- [x] No anti-patterns present
- [x] Data flow complete (Cache → Filter → Render)
- [x] Integration examples show actual code
- [x] Error handling specified (empty states)
- [x] Loading states defined (relies on pre-cached data)
- [x] Event logging checked (not required for browse)
- [x] API contracts fully specified
- [x] Security rules documented (no changes needed)

---

*Slice created: 2026-01-25*
