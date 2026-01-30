# Slice 5.1b: Team Detail View + Match History

## Slice Definition
- **Slice ID:** 5.1b
- **Name:** Team Detail View + Match History from QW Hub
- **User Story:** As a user browsing teams, I can select a team from Browse Teams and see a rich detail view with roster and recent match results, so I can evaluate their activity and performance without redundant UI
- **Success Criteria:**
  - Teams tab bottom-center shows full-width team detail (no redundant team list)
  - Team selection in Browse Teams (bottom-right) drives the detail view
  - Detail view shows team header, roster, and recent 4on4 matches from QW Hub
  - Match list shows date, map, score, opponent, W/L indicator
  - "View on QW Hub" link opens filtered results on hub.quakeworld.nu
  - Teams without teamTag show appropriate message
  - Loading and error states handled gracefully
  - Teams/Players toggle preserved — Players view unchanged

## Problem Statement

The current Teams tab (Slice 5.1) has a two-panel layout: team list on the left, detail on the right. But Browse Teams in the bottom-right panel already provides team search, division filtering, and selection. This creates redundancy — two team lists side by side doing the same job.

Additionally, users want to know:
- How active is a team?
- How are they performing recently?
- Who have they been playing against?

This information exists on hub.quakeworld.nu but requires manual lookup.

## Solution

**Redesign the Teams tab** to remove the redundant team list. Browse Teams (bottom-right) becomes the sole navigator. The entire bottom-center panel becomes a full-width team detail canvas showing:
1. Team header (logo, name, division, player count, star)
2. Roster (leader first, then alphabetical)
3. Recent Matches from QW Hub API (new)

The **Players view** (toggle) remains unchanged — it still has its own search bar and division filters since Browse Teams doesn't cover player search.

---

## Visual Design

### Layout Overview (Teams tab active)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Bottom-Left          │  Bottom-Center                   │  Bottom-Right         │
│  (Upcoming Games)     │  (Team Detail - FULL WIDTH)      │  (Browse Teams)       │
│                       │                                  │                       │
│  Coming soon          │  [Teams] [Players]  toggle       │  Search box           │
│                       │                                  │  Div 1  Div 2  Div 3  │
│                       │  ┌──────────────────────────┐    │                       │
│                       │  │ [LOGO]  Slackers         │    │  Bear Beer Bal...  ☆  │
│                       │  │         D1 • 5 players ☆ │    │  Black Book      ☆  │
│                       │  │                          │    │  Death Dealers   ☆  │
│                       │  │ Roster                   │    │  Deathbound      ☆  │
│                       │  │ ● ParadokS (Leader)      │    │  Demolition Crew ☆  │
│                       │  │ ○ Zero                   │    │  ...              │
│                       │  │ ○ Grisling               │    │                       │
│                       │  │ ○ Phrenic                │    │                       │
│                       │  │ ○ Macler                 │    │                       │
│                       │  │                          │    │                       │
│                       │  │ Recent Matches  [Hub →]  │    │                       │
│                       │  │ ──────────────────────── │    │                       │
│                       │  │ Jan 28  schloss  ]sr[    │    │                       │
│                       │  │   269-157  [hx]     W   │    │                       │
│                       │  │ Jan 28  dm2      ]sr[    │    │                       │
│                       │  │   288-178  [hx]     W   │    │                       │
│                       │  │ Jan 27  dm3      ]sr[    │    │                       │
│                       │  │   298-118  -s-      W   │    │                       │
│                       │  └──────────────────────────┘    │                       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Teams View - No Team Selected

```
┌────────────────────────────────────────────────────────┐
│  [Teams]  [Players]                                    │
│                                                        │
│                                                        │
│              Select a team from Browse Teams            │
│              to view details                           │
│                                                        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Teams View - Team Selected (Full Width Detail)

```
┌────────────────────────────────────────────────────────┐
│  [Teams]  [Players]                                    │
│                                                        │
│  ┌─────────┐                                           │
│  │  [SLK]  │  Slackers  ☆                              │
│  │  LOGO   │  Division 1 • 5 players                   │
│  └─────────┘                                           │
│                                                        │
│  ──────────────────────────────────────────────────── │
│                                                        │
│  Roster                                                │
│  ● ParadokS (Leader)                                   │
│  ○ Zero                                                │
│  ○ Grisling                                            │
│  ○ Phrenic                                             │
│  ○ Macler                                              │
│                                                        │
│  ──────────────────────────────────────────────────── │
│                                                        │
│  Recent Matches                     [View on QW Hub →] │
│  ──────────────────────────────────────────────────── │
│  Jan 28   schloss   ]sr[  269 - 157  [hx]          W  │
│  Jan 28   dm2       ]sr[  288 - 178  [hx]          W  │
│  Jan 27   dm3       ]sr[  298 - 118  -s-           W  │
│  Jan 27   dm2       ]sr[  147 - 263  -s-           L  │
│  Jan 27   schloss   ]sr[  240 - 220  -s-           W  │
│  Showing last 5 matches                                │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Players View (Unchanged)

```
┌────────────────────────────────────────────────────────┐
│  [Teams]  [Players]                                    │
│  Search teams or players...    Filter: D1 D2 D3       │
│                                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │[SLK] │ │[SLK] │ │[BB]  │ │[DD]  │ │[DB]  │        │
│  │Parad.│ │Zero  │ │Gris. │ │Phre. │ │Duce  │        │
│  │  +1  │ │      │ │      │ │  +1  │ │      │        │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
│  ...                                                   │
└────────────────────────────────────────────────────────┘
```

### Match History States

**Loading:**
```
Recent Matches                              [View on QW Hub →]
─────────────────────────────────────────────────────────────
Loading match history...
```

**No teamTag configured:**
```
Recent Matches
─────────────────────────────────────────────────────────────
Match history not available
Team leader can configure QW Hub tag in Team Settings
```

**No Matches Found:**
```
Recent Matches                              [View on QW Hub →]
─────────────────────────────────────────────────────────────
No recent 4on4 matches found
```

**Error:**
```
Recent Matches                              [View on QW Hub →]
─────────────────────────────────────────────────────────────
Couldn't load match history
[Retry]
```

---

## Architecture Changes

### Key Design Decision: Browse Teams Drives Detail View

**Current flow (Slice 5.1):**
```
TeamsBrowserPanel has its own team list + detail (self-contained)
Browse Teams (bottom-right) is independent, used for Compare feature
No communication between them
```

**New flow (Slice 5.1b):**
```
Browse Teams (bottom-right) → dispatches 'team-browser-detail-select' event
    → TeamsBrowserPanel listens → renders full-width detail in Teams view
TeamsBrowserPanel keeps Players view self-contained (own search/filter)
```

### Event Contract

```javascript
// Browse Teams dispatches when user clicks a team for detail viewing
// (distinct from existing multi-select for Compare)
window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
    detail: { teamId: 'team-123' }
}));
```

**Why a new event?** TeamBrowser already has `team-selection-changed` for multi-select/Compare. We need a separate single-click action: "show me this team's details." This could be triggered by:
- Single-click on team name in Browse Teams (currently does nothing useful)
- Or a dedicated "view" icon/button on each team row

The existing star-click and multi-select behaviors remain unchanged.

---

## QW Hub API Integration

### API Response Structure

```json
{
  "id": 193820,
  "timestamp": "2026-01-27T22:42:21+00:00",
  "mode": "4on4",
  "map": "schloss",
  "teams": [
    { "name": "]sr[", "frags": 240 },
    { "name": "-s-", "frags": 220 }
  ],
  "players": [
    { "name": "ParadokS", "team": "]sr[", "frags": 69 }
  ],
  "demo_sha256": "88e5320cb..."
}
```

### QWHubService (New Service)

```javascript
const QWHubService = (function() {
    'use strict';

    const API_BASE = 'https://ncsphkjfominimxztjip.supabase.co/rest/v1/v1_games';
    const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Public anon key

    const _matchCache = new Map();  // teamTag -> { data, fetchedAt }
    const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes

    function _encodeTeamNames(...teams) {
        const joined = teams.join(',');
        return encodeURIComponent(`{${joined}}`);
    }

    async function getRecentMatches(teamTag, limit = 5) {
        if (!teamTag) return [];

        // Check cache (HOT PATH)
        const cached = _matchCache.get(teamTag);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
            return cached.data.slice(0, limit);
        }

        // Fetch from API (COLD PATH)
        const url = `${API_BASE}` +
            `?select=id,timestamp,map,teams` +
            `&mode=eq.4on4` +
            `&team_names=cs.${_encodeTeamNames(teamTag)}` +
            `&order=timestamp.desc` +
            `&limit=${limit}`;

        const response = await fetch(url, {
            headers: { 'apikey': API_KEY }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const rawData = await response.json();
        const matches = rawData.map(match => _transformMatch(match, teamTag));

        _matchCache.set(teamTag, {
            data: matches,
            fetchedAt: Date.now()
        });

        return matches;
    }

    function _transformMatch(apiMatch, ourTeamTag) {
        const ourTeam = apiMatch.teams.find(t =>
            t.name.toLowerCase() === ourTeamTag.toLowerCase()
        );
        const opponent = apiMatch.teams.find(t =>
            t.name.toLowerCase() !== ourTeamTag.toLowerCase()
        );

        const won = ourTeam && opponent && ourTeam.frags > opponent.frags;
        const lost = ourTeam && opponent && ourTeam.frags < opponent.frags;

        return {
            id: apiMatch.id,
            date: new Date(apiMatch.timestamp),
            map: apiMatch.map,
            ourTag: ourTeam?.name || ourTeamTag,
            ourScore: ourTeam?.frags || 0,
            opponentTag: opponent?.name || '???',
            opponentScore: opponent?.frags || 0,
            result: won ? 'W' : lost ? 'L' : 'D',
            demoHash: apiMatch.demo_sha256
        };
    }

    function getHubUrl(teamTag) {
        return `https://hub.quakeworld.nu/games/?mode=4on4&team=${encodeURIComponent(teamTag)}`;
    }

    function getMatchUrl(matchId) {
        return `https://hub.quakeworld.nu/games/${matchId}`;
    }

    function clearCache() {
        _matchCache.clear();
    }

    return {
        getRecentMatches,
        getHubUrl,
        getMatchUrl,
        clearCache
    };
})();
```

---

## Component Changes

### 1. TeamsBrowserPanel - Redesigned Teams View

**Remove:** The two-panel split layout (team list + detail)
**Replace with:** Full-width detail view driven by Browse Teams selection

```javascript
// ========================================
// NEW: Teams View (Full-Width Detail)
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

    return `
        <div class="team-detail-full">
            ${_renderTeamHeader(team)}
            <div class="team-detail-sections">
                ${_renderTeamRoster(team)}
                ${_renderMatchHistory(team)}
            </div>
        </div>
    `;
}
```

**Toolbar changes:**
- Teams mode: Only show the Teams/Players toggle (no search, no div filters)
- Players mode: Show toggle + search bar + division filters (unchanged)

```javascript
function _renderToolbar() {
    return `
        <div class="teams-browser-toolbar">
            <div class="toolbar-row">
                ${_currentView === 'players' ? `
                    <input type="text" id="teams-browser-search"
                           class="search-input" placeholder="Search players..."
                           value="${_searchQuery}">
                ` : ''}
                <div class="view-toggle">
                    <button class="view-toggle-btn ${_currentView === 'teams' ? 'active' : ''}"
                            data-view="teams">Teams</button>
                    <button class="view-toggle-btn ${_currentView === 'players' ? 'active' : ''}"
                            data-view="players">Players</button>
                </div>
            </div>
            ${_currentView === 'players' ? `
                <div class="division-filters">
                    <span class="filter-label">Filter:</span>
                    <button class="division-filter-btn" data-division="D1">D1</button>
                    <button class="division-filter-btn" data-division="D2">D2</button>
                    <button class="division-filter-btn" data-division="D3">D3</button>
                </div>
            ` : ''}
        </div>
    `;
}
```

### 2. New Event Listener in TeamsBrowserPanel

```javascript
async function init(containerId) {
    _container = document.getElementById(containerId);
    if (!_container) return;

    _allTeams = TeamService.getAllTeams() || [];
    _allPlayers = _extractAllPlayers(_allTeams);

    _render();
    await _subscribeToTeams();

    // Listen for team selection from Browse Teams (NEW)
    window.addEventListener('team-browser-detail-select', _handleBrowseTeamSelect);
    window.addEventListener('favorites-updated', _handleFavoritesUpdate);
}

function _handleBrowseTeamSelect(event) {
    const { teamId } = event.detail;
    if (!teamId || _currentView !== 'teams') return;

    _selectedTeamId = teamId;
    _renderCurrentView();

    // If team has teamTag, load match history async
    const team = _allTeams.find(t => t.id === teamId);
    if (team?.teamTag) {
        _loadMatchHistory(team.teamTag);
    }
}

function cleanup() {
    if (_unsubscribe) _unsubscribe();
    window.removeEventListener('team-browser-detail-select', _handleBrowseTeamSelect);
    window.removeEventListener('favorites-updated', _handleFavoritesUpdate);
    _selectedTeamId = null;
}
```

### 3. TeamBrowser - Dispatch Detail Select Event

```javascript
// In TeamBrowser's team row click handler
// Single click on team name/row → dispatch detail event
function _handleTeamClick(teamId) {
    window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
        detail: { teamId }
    }));
}
```

This is separate from the existing star-click and multi-select behaviors.

### 4. Match History Rendering (New)

```javascript
function _renderMatchHistory(team) {
    const hasTag = !!team.teamTag;

    return `
        <div class="match-history-section">
            <div class="section-header">
                <h4 class="section-title">Recent Matches</h4>
                ${hasTag ? `
                    <a href="${QWHubService.getHubUrl(team.teamTag)}"
                       target="_blank"
                       class="link-muted text-xs">
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
        if (container.dataset.teamTag !== teamTag) return;

        container.innerHTML = `
            <div class="text-muted-foreground text-sm">
                <p>Couldn't load match history</p>
                <button class="btn-link text-xs mt-1"
                        onclick="TeamsBrowserPanel.retryMatchHistory('${teamTag}')">
                    Retry
                </button>
            </div>
        `;
    }
}

function _renderMatchRow(match) {
    const dateStr = match.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const resultClass = match.result === 'W' ? 'text-green-500'
                      : match.result === 'L' ? 'text-red-500'
                      : 'text-muted-foreground';

    return `
        <a href="${QWHubService.getMatchUrl(match.id)}" target="_blank"
           class="match-row" title="View on QW Hub">
            <span class="match-date">${dateStr}</span>
            <span class="match-map">${match.map}</span>
            <span class="match-score">
                <span class="match-our-tag">${match.ourTag}</span>
                <span class="match-frags">${match.ourScore} - ${match.opponentScore}</span>
                <span class="match-opp-tag">${match.opponentTag}</span>
            </span>
            <span class="match-result ${resultClass}">${match.result}</span>
        </a>
    `;
}
```

---

## CSS Additions

Add to `src/css/input.css`:

```css
/* ========================================
   Team Detail - Full Width (Slice 5.1b)
   ======================================== */

.team-detail-full {
    padding: 1rem;
    overflow-y: auto;
    height: 100%;
}

.team-detail-sections {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.team-detail-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
}

/* Match History Section */
.match-history-section {
    padding-top: 1rem;
    border-top: 1px solid var(--border);
}

.match-history-section .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
}

.match-history-section .section-title {
    font-size: 0.875rem;
    font-weight: 600;
}

/* Match List */
.match-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.match-row {
    display: grid;
    grid-template-columns: 3.5rem 4rem 1fr 1.5rem;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    text-decoration: none;
    color: inherit;
    transition: background-color 150ms;
}

.match-row:hover {
    background-color: var(--accent);
}

.match-date {
    color: var(--muted-foreground);
}

.match-map {
    color: var(--foreground);
    font-family: monospace;
}

.match-score {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.match-our-tag {
    color: var(--primary);
    font-weight: 500;
    min-width: 3rem;
    text-align: right;
}

.match-frags {
    color: var(--foreground);
    font-family: monospace;
}

.match-opp-tag {
    color: var(--muted-foreground);
    min-width: 3rem;
}

.match-result {
    font-weight: 600;
    text-align: center;
}
```

---

## Data Flow

```
User clicks team in Browse Teams (bottom-right)
    ↓
TeamBrowser dispatches 'team-browser-detail-select' event
    ↓
TeamsBrowserPanel._handleBrowseTeamSelect(event)
    ↓
Sets _selectedTeamId, calls _renderCurrentView()
    ↓
_renderTeamsView() → _renderTeamHeader() + _renderTeamRoster() + _renderMatchHistory()
    ↓
_renderMatchHistory checks team.teamTag
    ↓
If exists: render loading placeholder, call _loadMatchHistory(tag)
If missing: render "not configured" message
    ↓
QWHubService.getRecentMatches(tag)
    ↓
Check in-memory cache → if fresh, return instantly (HOT PATH)
    ↓
If stale/missing: fetch from QW Hub API (COLD PATH)
    ↓
Transform response → cache → return matches
    ↓
Guard against stale render (team may have changed)
    ↓
Render match rows in container
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Toggle between Teams/Players views: Pure DOM swap
- Render team detail from cache: Instant
- Return cached matches: In-memory lookup
- Switch between teams with cached match data: Instant

COLD PATHS (<2s):
- First match fetch for a team: ~500-1000ms (external API)
- Cache miss after 5-min TTL: Same as first fetch
```

### Caching Strategy
- In-memory cache with 5-minute TTL in QWHubService
- Cache keyed by teamTag
- Cleared on page refresh (acceptable)
- Team data from TeamService cache (instant)

---

## Test Scenarios

### Layout & Navigation
- [ ] Teams tab shows full-width detail view (no team list column)
- [ ] "Select a team" placeholder shown when nothing selected
- [ ] Clicking team in Browse Teams shows its detail in center panel
- [ ] Toggle to Players view works, shows player grid with search/filters
- [ ] Toggle back to Teams view preserves selected team
- [ ] Search bar and division filters only visible in Players view

### Match History - Happy Path
- [ ] Team with teamTag shows loading then match list
- [ ] Match rows show date, map, our tag, score, opponent tag, W/L indicator
- [ ] W colored green, L colored red, D gray
- [ ] "View on QW Hub" link opens correct filtered page in new tab
- [ ] Clicking a match row opens that match on QW Hub in new tab
- [ ] Switching teams loads correct history
- [ ] Cached data returns instantly on re-select

### Match History - Edge Cases
- [ ] Team without teamTag shows "not configured" message
- [ ] Team with teamTag but no matches shows "no matches found"
- [ ] API error shows retry button
- [ ] Retry button re-fetches data
- [ ] Rapid team switching doesn't cause stale renders (race condition guard)
- [ ] Special characters in tags (brackets, dots) display correctly

### Cross-Component Integration
- [ ] Browse Teams star toggle still works independently
- [ ] Compare feature (multi-select) still works alongside detail select
- [ ] Favorites panel still updates when stars toggled
- [ ] Team data updates via Firebase listener reflect in detail view

---

## File Changes Summary

```
NEW FILES:
public/js/services/QWHubService.js
  - getRecentMatches(teamTag, limit) with caching
  - getHubUrl(teamTag), getMatchUrl(matchId)
  - _transformMatch() internal
  - clearCache()

MODIFIED FILES:
public/js/components/TeamsBrowserPanel.js
  - REMOVE: Two-panel split layout (_renderTeamsView team list)
  - REMOVE: Search bar and div filters from Teams view toolbar
  - ADD: Full-width detail view for Teams mode
  - ADD: Listen for 'team-browser-detail-select' event
  - ADD: _renderMatchHistory(), _loadMatchHistory(), _renderMatchRow()
  - ADD: retryMatchHistory() public method
  - KEEP: Players view entirely unchanged
  - KEEP: Toggle between Teams/Players

public/js/components/TeamBrowser.js
  - ADD: Dispatch 'team-browser-detail-select' on team click
  - KEEP: All existing behavior (star, multi-select, search, filters)

public/index.html
  - ADD: <script src="js/services/QWHubService.js"> tag

src/css/input.css
  - ADD: .team-detail-full styles
  - ADD: .match-history-section styles
  - ADD: .match-list and .match-row styles
  - REMOVE: .teams-list-panel styles (no longer needed)
```

---

## Dependencies

- **Slice 5.1:** TeamsBrowserPanel component (done)
- **Slice 5.1a:** teamTag field on teams (done)
- **QW Hub API:** Public Supabase endpoint with anon key

---

## Common Pitfalls

1. **Race condition on rapid team switching** — Always guard with `container.dataset.teamTag !== teamTag` before updating DOM after async fetch
2. **teamTag vs qwHubTag** — Slice 5.1a merged these into `teamTag`. Use `team.teamTag` everywhere, not `team.qwHubTag`
3. **Event cleanup** — Must remove `team-browser-detail-select` listener in `cleanup()` to avoid memory leaks when tab switches
4. **Players view unchanged** — Don't accidentally remove search/filter functionality from Players view while restructuring Teams view toolbar
5. **Browse Teams independence** — Don't break existing Browse Teams behavior (stars, multi-select for Compare). Detail select is additive.

---

## Future Enhancements (Out of Scope)

- Click match row to see per-player stats in detail
- Filter matches by map
- Show more than 5 matches (pagination/scroll)
- Demo playback link (requires FTE web client)
- **5.1c:** Head-to-head compare view
- Availability heatmap in team detail
- Win/loss trend chart

---

*Slice updated: 2026-01-29*
*Depends on: Slice 5.1, 5.1a*
*Replaces previous version (was detail-panel-only approach)*
