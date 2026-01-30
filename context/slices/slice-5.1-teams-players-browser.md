# Slice 5.1: Teams/Players Browser

## Slice Definition
- **Slice ID:** 5.1
- **Name:** Teams/Players Browser
- **User Story:** As a user, I can browse all teams and players in an organized, dedicated view so I can find opponents and see who plays where
- **Success Criteria:**
  - Clicking "Teams" tab shows the browser (replaces placeholder)
  - Teams View: Two-panel layout with team list and detail panel
  - Players View: Multi-column responsive grid of player cards
  - Toggle between Teams/Players views
  - Search, division filters work in both views
  - Hover tooltips show team rosters (reuse existing pattern)

---

## PRD Mapping

```
PRIMARY SECTIONS:
- Pillar 1, Section 4.2.1: Team/Player browsing functionality
  - Two-panel layout for team inspection
  - Player directory with team associations
  - Search and filter capabilities

DEPENDENT SECTIONS:
- Pillar 1, Section 4.2: Team comparison workflow context
  - TeamBrowser patterns and tooltip behavior
- Pillar 2, Section 5.3-5.4: Data caching and real-time updates
  - Cache + listener pattern
  - Performance classification (hot/cold paths)

IGNORED SECTIONS:
- Pillar 1, Section 5.1a-5.1c: QW Hub integration (separate slices)
  - qwHubTag field (5.1a)
  - Match history display (5.1b)
  - Head-to-head comparison (5.1c)
```

---

## Problem Statement

The current "Teams" tab shows a placeholder. Users need a proper way to:
1. Browse all teams with their rosters visible
2. Browse all players and see which teams they belong to
3. Search and filter efficiently
4. Get more detail than the compact TeamBrowser in bottom-right provides

The existing TeamBrowser (bottom-right panel) is good for quick selection during comparison but lacks space for detailed viewing.

## Solution

Replace the Teams tab placeholder with a full browser interface:

### Teams View (Two-Panel Layout)
- **Left panel:** Scrollable list of team cards (compact)
- **Right panel:** Detail view for selected team (logo, name, division, roster)
- Click a team → shows details on right
- Star button for favorites (reuse FavoritesService)

### Players View (Multi-Column Grid)
- Responsive grid of player cards (4-5 columns based on width)
- Each card: Team logo/tag + player name
- Hover: Tooltip with all teams player belongs to + their rosters
- Multi-team players show primary team on card

---

## Visual Design

### Teams View Layout
```
┌────────────────────────────────────────────────────────────────────┐
│  [🔍 Search...              ] [Div 1] [Div 2] [Div 3]              │
│  [● Teams] [○ Players]                          Sort: [A-Z ▼]     │
├──────────────────────────────┬─────────────────────────────────────┤
│                              │                                     │
│  Black Book            D1 ★  │      ← Select a team to view       │
│  ─────────────────────────── │        details                      │
│  Death Dealers         D1    │                                     │
│  ─────────────────────────── │   OR (when team selected):          │
│ >Slackers              D1  < │                                     │
│  ─────────────────────────── │      ┌─────────┐                    │
│  Exodus                D2    │      │  [SLK]  │   Slackers         │
│  ─────────────────────────── │      └─────────┘   Division 1       │
│  Deathbound            D3    │                    5 players        │
│  ─────────────────────────── │                                     │
│  ...                         │      Roster:                        │
│                              │      ● ParadokS (Leader) ★          │
│  (scrollable)                │      ○ Zero                         │
│                              │      ○ Grisling                     │
│                              │      ○ Phrenic                      │
│                              │      ○ Macler                       │
│                              │                                     │
│                              │      (future: Recent Matches)       │
│                              │                                     │
└──────────────────────────────┴─────────────────────────────────────┘
```

### Players View Layout
```
┌────────────────────────────────────────────────────────────────────┐
│  [🔍 Search...              ] [Div 1] [Div 2] [Div 3]              │
│  [○ Teams] [● Players]                          Sort: [A-Z ▼]     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  [BB]   │  │  [DD]   │  │  [SLK]  │  │  [EX]   │  │  [DC]   │  │
│  │ParadokS │  │ Zero    │  │Grisling │  │ Razor   │  │ Frost   │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
│                                                                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  [BB]   │  │  [DD]   │  │  [SLK]  │  │  [EX]   │  │  [DC]   │  │
│  │ Phrenic │  │ Macler  │  │  Nova   │  │ Storm   │  │ Blaze   │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
│                                                                    │
│  ... (scrollable grid)                                             │
│                                                                    │
│  Hover tooltip shows:                                              │
│  ┌──────────────────────────┐                                      │
│  │ ParadokS plays for:      │                                      │
│  │ ─────────────────────    │                                      │
│  │ Slackers (D1) - Leader   │                                      │
│  │   Zero, Grisling, ...    │                                      │
│  │ ─────────────────────    │                                      │
│  │ Black Book (D1) - Member │                                      │
│  │   Player1, Player2, ...  │                                      │
│  └──────────────────────────┘                                      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

```
NEW COMPONENTS:
- TeamsBrowserPanel.js
  - Main container for Teams tab content
  - Owns the toolbar (search, filters, view toggle)
  - Manages Teams vs Players view state
  - Container for sub-components

- TeamsListView.js (or inline in TeamsBrowserPanel)
  - Left panel: team list
  - Right panel: team detail
  - Handles team selection state

- PlayersGridView.js (or inline in TeamsBrowserPanel)
  - Responsive grid of player cards
  - Player tooltip on hover

MODIFIED COMPONENTS:
- BottomPanelController.js
  - Replace 'teams' placeholder with TeamsBrowserPanel.init()
  - Handle cleanup when switching away

REUSED PATTERNS:
- FavoritesService (star/unstar)
- TeamBrowser tooltip pattern (roster on hover)
- TeamService cache (getAllTeams)
- Division filter pattern from existing TeamBrowser
```

---

## Full Stack Architecture

```
FRONTEND COMPONENTS:
- TeamsBrowserPanel
  - Firebase listeners: Collection listener on /teams for real-time roster updates
  - Cache interactions: Reads from TeamService.getAllTeams(), updates cache on listener events
  - UI responsibilities: Toolbar (search, filters, view toggle), Teams/Players views
  - User actions: Team selection, star toggle, search input, division filter, view toggle

FRONTEND SERVICES:
- TeamService (existing - no changes needed):
  - getAllTeams() → Returns cached teams array
  - getTeam(teamId) → Single team lookup from cache
  - updateCachedTeam(teamId, data) → Updates cache after listener events

- FavoritesService (existing - reuse):
  - toggleFavorite(teamId) → Calls updateFavorites Cloud Function
  - isFavorite(teamId) → Reads from cache
  - getFavorites() → Returns cached favorites array

BACKEND REQUIREMENTS:
⚠️ NO NEW CLOUD FUNCTIONS NEEDED - This slice is read-only + favorites (already implemented)

- Existing Cloud Functions Used:
  - updateFavorites(userId, favoriteTeams): Already exists for star toggle
    - File: /functions/user-profile.js
    - Called by: FavoritesService.toggleFavorite()

- Firestore Operations:
  - /teams collection: READ (collection listener for all teams)
  - /users/{userId}: READ/WRITE (favorites array via existing function)

- Security Rules:
  - Teams: Already allows authenticated read
  - Users: Already allows owner write for favorites

- Event Logging:
  - No new events needed - favorites already logged

INTEGRATION POINTS:
- Real-time listeners:
  - TeamsBrowserPanel → onSnapshot(/teams collection) → UI + Cache update
- Frontend → Backend calls:
  - Star button → FavoritesService.toggleFavorite() → updateFavorites Cloud Function
- Data flow:
  - Browse: TeamService cache → Render list
  - Updates: Firestore /teams → Collection listener → updateCachedTeam() → Re-render
  - Favorites: Click star → FavoritesService → Cloud Function → User doc → Listener → UI
```

---

## Data Flow

### Teams View
```
User clicks Teams tab
    ↓
BottomPanelController.switchTab('teams')
    ↓
TeamsBrowserPanel.init()
    ↓
Get teams from TeamService.getAllTeams() (cached)
    ↓
Render toolbar + two-panel layout
    ↓
User clicks team card
    ↓
Update selected team state
    ↓
Render team detail in right panel
```

### Players View
```
User clicks Players toggle
    ↓
TeamsBrowserPanel switches to Players view
    ↓
Extract all players from all teams (flatten rosters)
    ↓
Sort alphabetically
    ↓
Render responsive grid
    ↓
User hovers player card
    ↓
Show tooltip with all teams for that player
```

### Search/Filter Flow
```
User types in search OR clicks division filter
    ↓
Filter teams/players list
    ↓
Re-render current view (Teams or Players)
    ↓
If Teams view and selected team no longer in list → clear selection
```

---

## Implementation Details

### File Structure
```
public/js/components/
├── TeamsBrowserPanel.js     # Main panel component (NEW)
└── ... existing components
```

### TeamsBrowserPanel.js Structure
```javascript
const TeamsBrowserPanel = (function() {
    'use strict';

    let _container = null;
    let _currentView = 'teams';  // 'teams' | 'players'
    let _selectedTeamId = null;
    let _searchQuery = '';
    let _divisionFilters = new Set();
    let _allTeams = [];
    let _allPlayers = [];

    function init(containerId) {
        _container = document.getElementById(containerId);
        // Load from TeamService cache
        _allTeams = TeamService.getAllTeams() || [];
        _allPlayers = _extractAllPlayers(_allTeams);
        _render();
    }

    function _render() {
        _container.innerHTML = `
            ${_renderToolbar()}
            ${_currentView === 'teams' ? _renderTeamsView() : _renderPlayersView()}
        `;
        _attachListeners();
    }

    function _renderToolbar() { /* Search + filters + view toggle */ }
    function _renderTeamsView() { /* Two-panel layout */ }
    function _renderPlayersView() { /* Grid layout */ }
    function _renderTeamDetail(team) { /* Right panel content */ }

    function _extractAllPlayers(teams) {
        // Flatten all rosters, track which teams each player belongs to
        const playerMap = new Map();
        teams.forEach(team => {
            (team.playerRoster || []).forEach(player => {
                const key = player.odyseeId || player.displayName;
                if (!playerMap.has(key)) {
                    playerMap.set(key, { ...player, teams: [] });
                }
                playerMap.get(key).teams.push({
                    teamId: team.id,
                    teamName: team.teamName,
                    teamTag: team.teamTag,
                    division: team.divisions?.[0],
                    logoUrl: team.activeLogo?.urls?.small,
                    role: player.role
                });
            });
        });
        return Array.from(playerMap.values());
    }

    function cleanup() { /* Clear state */ }

    return { init, cleanup };
})();
```

### Integration with BottomPanelController
```javascript
// In BottomPanelController.switchTab()
case 'teams':
    _showTeamsBrowser();
    break;

function _showTeamsBrowser() {
    if (!_bottomPanel) return;

    // Clear panel
    _bottomPanel.innerHTML = '';

    // Create container for TeamsBrowserPanel
    const container = document.createElement('div');
    container.id = 'teams-browser-panel';
    container.className = 'h-full';
    _bottomPanel.appendChild(container);

    // Initialize
    TeamsBrowserPanel.init('teams-browser-panel');
}
```

---

## Integration Code Examples

### Real-time Listener Setup (Component owns the listener)
```javascript
// In TeamsBrowserPanel.init()
async function init(containerId) {
    _container = document.getElementById(containerId);

    // 1. Get instant data from cache (HOT PATH)
    _allTeams = TeamService.getAllTeams() || [];
    _allPlayers = _extractAllPlayers(_allTeams);
    _render();

    // 2. Set up real-time listener for updates
    const { collection, onSnapshot } = await import('firebase/firestore');
    _unsubscribe = onSnapshot(
        collection(window.firebase.db, 'teams'),
        (snapshot) => {
            snapshot.docChanges().forEach(change => {
                const teamData = { id: change.doc.id, ...change.doc.data() };

                if (change.type === 'added' || change.type === 'modified') {
                    // Update cache
                    TeamService.updateCachedTeam(change.doc.id, teamData);
                    // Update local state
                    const idx = _allTeams.findIndex(t => t.id === change.doc.id);
                    if (idx >= 0) {
                        _allTeams[idx] = teamData;
                    } else {
                        _allTeams.push(teamData);
                    }
                } else if (change.type === 'removed') {
                    _allTeams = _allTeams.filter(t => t.id !== change.doc.id);
                }
            });
            // Rebuild players list and re-render
            _allPlayers = _extractAllPlayers(_allTeams);
            _render();
        }
    );
}

function cleanup() {
    if (_unsubscribe) {
        _unsubscribe();
        _unsubscribe = null;
    }
    _container = null;
    _selectedTeamId = null;
}
```

### Star Button Integration (Reuses FavoritesService)
```javascript
// In TeamsBrowserPanel - star button click handler
async function _handleStarClick(teamId, event) {
    event.stopPropagation();

    // Optimistic UI update
    const starButton = event.target.closest('.star-btn');
    const wasStarred = FavoritesService.isFavorite(teamId);
    starButton.classList.toggle('starred', !wasStarred);

    try {
        // FavoritesService handles backend call + error handling
        await FavoritesService.toggleFavorite(teamId);
        // Success - FavoritesService cache is already updated
    } catch (error) {
        // Revert on failure
        starButton.classList.toggle('starred', wasStarred);
        console.error('Failed to toggle favorite:', error);
    }
}

// Rendering star button
function _renderStarButton(teamId) {
    const isStarred = FavoritesService.isFavorite(teamId);
    return `
        <button class="star-btn ${isStarred ? 'starred' : ''}"
                onclick="TeamsBrowserPanel._handleStarClick('${teamId}', event)"
                aria-label="${isStarred ? 'Remove from favorites' : 'Add to favorites'}">
            ${isStarred ? '★' : '☆'}
        </button>
    `;
}
```

### Player Primary Team Selection (Uses earliest joinedAt)
```javascript
function _extractAllPlayers(teams) {
    const playerMap = new Map();

    teams.forEach(team => {
        (team.playerRoster || []).forEach(player => {
            const key = player.userId || player.displayName;
            const teamInfo = {
                teamId: team.id,
                teamName: team.teamName,
                teamTag: team.teamTag,
                division: team.divisions?.[0],
                logoUrl: team.activeLogo?.urls?.small,
                role: player.role,
                joinedAt: player.joinedAt  // For primary team sort
            };

            if (!playerMap.has(key)) {
                playerMap.set(key, {
                    ...player,
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
            const dateA = a.joinedAt?.toDate?.() || a.joinedAt || new Date(0);
            const dateB = b.joinedAt?.toDate?.() || b.joinedAt || new Date(0);
            return dateA - dateB;
        });
        // Primary team is first in sorted array
        player.primaryTeam = player.teams[0];
    });

    return Array.from(playerMap.values())
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
```

### Tab Cleanup Integration
```javascript
// In BottomPanelController.switchTab()
function switchTab(tabId) {
    // Cleanup previous tab's component
    if (_currentTab === 'teams') {
        TeamsBrowserPanel.cleanup();  // Unsubscribes listener
    }

    _currentTab = tabId;
    // ... rest of tab switching logic
}
```

---

## CSS Considerations

### Two-Panel Layout (Teams View)
```css
.teams-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.teams-browser-toolbar {
    flex-shrink: 0;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
}

.teams-browser-content {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1.5fr;  /* List takes 40%, detail 60% */
    min-height: 0;  /* Allow flex child to scroll */
}

.teams-list-panel {
    border-right: 1px solid var(--border);
    overflow-y: auto;
}

.teams-detail-panel {
    overflow-y: auto;
    padding: 1rem;
}
```

### Responsive Player Grid
```css
.players-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
    gap: 0.5rem;
    padding: 0.75rem;
    overflow-y: auto;
}

.player-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem;
    border-radius: 0.375rem;
    background: var(--muted);
    cursor: default;
}

.player-card:hover {
    background: var(--accent);
}

.player-card-logo {
    width: 2rem;
    height: 2rem;
    border-radius: 0.25rem;
    overflow: hidden;
    margin-bottom: 0.25rem;
}

.player-card-name {
    font-size: 0.75rem;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
}
```

### View Toggle Buttons
```css
.view-toggle {
    display: inline-flex;
    border-radius: 0.375rem;
    overflow: hidden;
    border: 1px solid var(--border);
}

.view-toggle-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
}

.view-toggle-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- View toggle (Teams ↔ Players): Pure DOM swap
- Team selection: Instant render from cache
- Search/filter keystrokes: Filter in-memory array
- Hover tooltip: Already implemented pattern

COLD PATHS (<2s):
- Initial load when switching to Teams tab: Build from TeamService cache
- Real-time team updates: Firestore listener (already exists)
```

---

## Test Scenarios

### Teams View
- [ ] Clicking Teams tab replaces placeholder with browser
- [ ] Team list shows all teams sorted alphabetically
- [ ] Search filters teams by name/tag
- [ ] Division toggles filter teams
- [ ] Clicking team shows detail in right panel
- [ ] Star button toggles favorite (updates FavoritesService)
- [ ] Empty state shown when no teams match filters
- [ ] Right panel shows "Select a team" initially

### Players View
- [ ] Toggle switches to Players view
- [ ] Grid shows all players from all teams
- [ ] Search filters players by name
- [ ] Division filters work (show players from matching teams)
- [ ] Hover shows tooltip with all teams for player
- [ ] Multi-team players show all teams in tooltip
- [ ] Grid is responsive (adjusts columns to container width)

### Integration
- [ ] Switching back to Calendar tab works
- [ ] Switching between tabs preserves state (view mode, search, selection)
- [ ] Real-time team updates reflect in browser
- [ ] Works at 1080p and 1440p

---

## Edge Cases

1. **Player on multiple teams:** Show primary team (earliest joinedAt) on card, all teams in tooltip
2. **Team with no players:** Show team in list, detail shows "No players yet"
3. **Search matches both team and players:** In Teams view, only filter teams. In Players view, only filter players.
4. **Selected team deleted:** Clear selection, show empty state
5. **Division filter + search combined:** Apply both filters (AND logic)

---

## Common Integration Pitfalls

This checklist prevents the most common implementation mistakes:

- [ ] **Listener cleanup forgotten** - Must call `_unsubscribe()` in cleanup(), otherwise memory leak
- [ ] **Cache not updated after listener** - `TeamService.updateCachedTeam()` must be called on every change
- [ ] **Star button doesn't use FavoritesService** - Must reuse existing service, not call Firestore directly
- [ ] **Missing optimistic UI on star** - Star should toggle immediately, not wait for backend
- [ ] **No rollback on star failure** - If backend fails, must revert star state
- [ ] **Script tag missing from index.html** - TeamsBrowserPanel.js must be loaded before use
- [ ] **Cleanup not called on tab switch** - BottomPanelController must call cleanup() when leaving Teams tab
- [ ] **Primary team logic wrong** - Must use earliest `joinedAt`, not first team alphabetically
- [ ] **Player key collision** - Use `userId` as primary key, fallback to `displayName`
- [ ] **Division filter doesn't work in Players view** - Must filter by player's team divisions

---

## File Changes Summary

```
NEW FILES:
public/js/components/TeamsBrowserPanel.js

MODIFIED FILES:
public/js/components/BottomPanelController.js
  - Replace placeholder with TeamsBrowserPanel initialization
  - Add cleanup handling

public/index.html
  - Add TeamsBrowserPanel.js script tag

src/css/input.css
  - Add teams-browser styles
  - Add players-grid styles
  - Add view-toggle styles
```

---

## Dependencies

- TeamService.getAllTeams() - for team data
- FavoritesService - for star functionality
- Existing tooltip pattern from TeamBrowser
- BottomPanelController - for tab integration

---

## Future Enhancements (Out of Scope)

- **5.1a:** Add qwHubTag field to teams
- **5.1b:** Show recent matches in team detail panel (QW Hub API)
- **5.1c:** Head-to-head compare button in detail panel

---

## Verified Design Decisions

Decisions verified against schema and existing code:

- **Primary team selection**: Use earliest `joinedAt` timestamp
  - **Schema reference**: `PlayerEntry.joinedAt: Date` (SCHEMA.md line 146)
  - **User confirmed**: "First team joined" option selected during planning

- **Real-time updates**: Collection listener on `/teams`
  - **Existing pattern**: TeamBrowser.js:76, TeamInfo.js:223 use same approach
  - **User confirmed**: "Collection listener" option selected during planning

- **State preservation**: NOT preserved when switching tabs
  - **Existing pattern**: BottomPanelController clears content on tab switch
  - **Rationale**: Matches existing tab behavior, simpler implementation

- **Division filter in Players view**: Filter by ANY of player's team divisions
  - **Rationale**: "Show D1 players" = players on at least one D1 team
  - **Logic**: Player shown if ANY team matches filter (OR logic across teams)

---

## Quality Checklist

**Core Requirements:**
- [x] User story defined
- [x] Visual mockups provided
- [x] Component architecture specified
- [x] Data flow documented
- [x] CSS considerations addressed
- [x] Performance classified
- [x] Test scenarios listed
- [x] Edge cases identified
- [x] File changes summarized
- [x] Dependencies noted

**Full Stack Requirements (Template v2):**
- [x] PRD mapping with primary/dependent/ignored sections
- [x] Full Stack Architecture (frontend + backend + integration points)
- [x] Integration code examples showing actual connections
- [x] Common integration pitfalls checklist
- [x] Design decisions verified against schema/code
- [x] Frontend AND backend requirements specified
- [x] Hot paths clearly identified with implementation approach
- [x] Error handling specified for all operations
- [x] Loading states defined for backend calls (N/A - read-only slice)
- [x] Real-time listeners documented with cleanup

---

*Slice created: 2026-01-29*
*Updated: 2026-01-29 (Template v2 compliance)*
*Builds on: Slice 5.0a (tab infrastructure), existing TeamBrowser patterns*
