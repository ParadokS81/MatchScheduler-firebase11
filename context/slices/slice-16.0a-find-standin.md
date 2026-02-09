# Slice 16.0a — Find Standin

## 1. Slice Definition

- **Slice ID:** 16.0a
- **Name:** Find Standin
- **User Story:** As a team leader, I can select timeslots on the grid and press "Find Standin" to instantly see which players across the community are available for those times, filtered by division, so I can quickly find a replacement when my team is short.
- **Success Criteria:** User selects cells on grid, clicks "Find Standin" in floating action buttons, bottom panel switches to Players tab filtered to available players for those slots in the user's division. Filter banner shows captured slots with [x] clear. Division filter chips allow switching divisions. Hovering a player shows which of the filtered slots they're available for.

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Grid Action Buttons: New "Find Standin" button in SelectionActionButton
- Bottom Panel Players Tab: Availability filtering + division filter chips

DEPENDENT SECTIONS:
- AvailabilityService: Bulk-load all team availability docs (community-wide scan)
- TeamService: Team division data for default filter + player roster data
- BottomPanelController: Tab switching from grid action

IGNORED SECTIONS:
- QWHub live server status: Separate slice (16.0b)
- Comparison engine: Find Standin is independent, does not interact with compare mode
- Match proposals: No proposal created from this flow (may add later)
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- SelectionActionButton
  - Firebase listeners: none (uses GridActionButtons)
  - Cache interactions: none
  - UI responsibilities: New "Find Standin" button in floating action panel
  - User actions: Click "Find Standin" → captures selected slots, switches to Players tab

- PlayersPanel (bottom panel Players tab)
  - Firebase listeners: none (reads from AvailabilityService cache)
  - Cache interactions: reads AvailabilityService cache for all teams, TeamService cache for rosters/divisions
  - UI responsibilities:
    - Filter banner showing captured timeslots with [x] clear button
    - Division filter chips (Div 1 / Div 2 / Div 3) — permanent addition, useful outside standin mode too
    - Filtered player list grouped by team (existing "By Team" sort)
    - Teams with zero available players hidden when filter active
    - Player hover tooltip showing which filtered slots they're available for
  - User actions: Change division filter, clear standin filter, hover players

FRONTEND SERVICES:
- AvailabilityService (EXTENDED):
  - loadAllTeamAvailability(weekId) → batch-load availability docs for ALL teams for a given week
  - getCommunityAvailability(weekId, slotIds) → returns Map<userId, { slots: string[], teamId, displayName }>
    for all players available in ANY of the given slots (OR logic)
  - Uses existing _cache — same Map<cacheKey, availabilityDoc> pattern
  - New: _allTeamsLoaded flag per weekId to avoid redundant batch loads

- StandinFinderService (NEW):
  - Lightweight coordinator — no Firebase, no listeners, just state
  - State: { active: boolean, capturedSlots: string[], weekId: string, defaultDivision: number }
  - activate(weekId, slotIds, division) → stores state, dispatches 'standin-search-started' event
  - deactivate() → clears state, dispatches 'standin-search-cleared' event
  - getFilteredPlayers(divisionFilter) → queries AvailabilityService.getCommunityAvailability()
    and filters by division from TeamService cache

BACKEND REQUIREMENTS:
- No new Cloud Functions
- No new Firestore collections
- No security rule changes
- Read-only: fetches existing /availability/{teamId}_{weekId} documents

INTEGRATION POINTS:
- Grid → StandinFinder: SelectionActionButton captures slots → StandinFinderService.activate()
- StandinFinder → PlayersPanel: 'standin-search-started' event → PlayersPanel re-renders filtered
- StandinFinder → AvailabilityService: getCommunityAvailability() → batch loads if needed
- PlayersPanel → StandinFinder: Division filter change → re-query → re-render
- PlayersPanel → StandinFinder: Clear [x] → StandinFinderService.deactivate() → normal view
```

---

## 4. Integration Code Examples

### 4a. StandinFinderService — New Module

```javascript
// public/js/services/StandinFinderService.js
const StandinFinderService = (function() {
    let _active = false;
    let _capturedSlots = [];  // UTC slot IDs e.g. ['thu_1900', 'thu_1930']
    let _weekId = null;       // e.g. '2026-06'
    let _defaultDivision = null;

    function activate(weekId, slotIds, division) {
        _active = true;
        _capturedSlots = [...slotIds];
        _weekId = weekId;
        _defaultDivision = division;
        window.dispatchEvent(new CustomEvent('standin-search-started', {
            detail: { weekId, slotIds: _capturedSlots, division }
        }));
    }

    function deactivate() {
        _active = false;
        _capturedSlots = [];
        _weekId = null;
        _defaultDivision = null;
        window.dispatchEvent(new CustomEvent('standin-search-cleared'));
    }

    function isActive() { return _active; }
    function getCapturedSlots() { return _capturedSlots; }
    function getWeekId() { return _weekId; }
    function getDefaultDivision() { return _defaultDivision; }

    return { activate, deactivate, isActive, getCapturedSlots, getWeekId, getDefaultDivision };
})();
```

### 4b. AvailabilityService — Extended for Community-Wide Loading

```javascript
// In AvailabilityService — add to existing module

let _allTeamsLoadedWeeks = new Set(); // track which weeks have all teams loaded

async function loadAllTeamAvailability(weekId) {
    if (_allTeamsLoadedWeeks.has(weekId)) return; // already loaded

    const allTeams = Object.values(TeamService.teams);
    const promises = allTeams.map(team => {
        const cacheKey = `${team.id}_${weekId}`;
        if (_cache.has(cacheKey)) return Promise.resolve(); // already cached
        return loadWeekAvailability(team.id, weekId); // existing method
    });

    await Promise.all(promises);
    _allTeamsLoadedWeeks.add(weekId);
}

function getCommunityAvailability(weekId, slotIds) {
    // Returns: Map<userId, { displayName, teamId, teamTag, division, availableSlots[] }>
    const result = new Map();
    const allTeams = Object.values(TeamService.teams);

    for (const team of allTeams) {
        // Respect privacy
        if (team.hideFromComparison) continue;

        const cacheKey = `${team.id}_${weekId}`;
        const data = _cache.get(cacheKey);
        if (!data?.slots) continue;

        const division = team.division || null;
        const roster = team.playerRoster || {};

        // Check each requested slot (OR logic)
        for (const slotId of slotIds) {
            const playersInSlot = data.slots[slotId] || [];
            for (const userId of playersInSlot) {
                if (!result.has(userId)) {
                    const playerInfo = roster[userId] || {};
                    result.set(userId, {
                        displayName: playerInfo.displayName || userId,
                        teamId: team.id,
                        teamTag: team.teamTag,
                        teamName: team.teamName,
                        division,
                        availableSlots: []
                    });
                }
                const entry = result.get(userId);
                if (!entry.availableSlots.includes(slotId)) {
                    entry.availableSlots.push(slotId);
                }
            }
        }
    }
    return result;
}
```

### 4c. SelectionActionButton — "Find Standin" Button

```javascript
// In SelectionActionButton — add to floating action panel layout
// New row after the existing action rows, before Escape row:

// For scheduler layout:
// Row 1: [+ Me]            [+ Others →]
// Row 2: [− Me]            [− Others →]
// Row 3: [⊘ Away]          [⊘ Others →]
// Row 4: [🔍 Find Standin]              ← NEW (full-width button)
// Row 5: [× Escape]        [📋 Template]

function _handleFindStandin() {
    const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
    if (!teamId) return;

    const team = TeamService.getTeam(teamId);
    const division = team?.division || 1;

    const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
    if (selectedCells.length === 0) return;

    // Group cells by week, get UTC slot IDs
    const cellsByWeek = _groupCellsByWeek(selectedCells);
    // For MVP, use the first week's slots (most common case: single-week selection)
    const [weekId, slotIds] = Object.entries(cellsByWeek)[0];

    // Activate standin finder
    StandinFinderService.activate(weekId, slotIds, division);

    // Switch bottom panel to Players tab
    BottomPanelController.switchTab('players');

    // Clear grid selection and dismiss floating buttons
    if (_clearSelections) _clearSelections();
}
```

### 4d. PlayersPanel — Filtered Rendering

```javascript
// In PlayersPanel — listen for standin events

function init() {
    // ... existing init ...

    window.addEventListener('standin-search-started', _handleStandinSearch);
    window.addEventListener('standin-search-cleared', _handleStandinCleared);
}

async function _handleStandinSearch(event) {
    const { weekId, slotIds, division } = event.detail;

    // Show loading state
    _showFilterBanner(slotIds);
    _setDivisionFilter(division);
    _setLoading(true);

    // Ensure all team availability is loaded
    await AvailabilityService.loadAllTeamAvailability(weekId);

    // Get filtered players
    const available = AvailabilityService.getCommunityAvailability(weekId, slotIds);

    // Render filtered view
    _renderFilteredPlayers(available, division);
    _setLoading(false);
}

function _showFilterBanner(slotIds) {
    // Render banner like: "Available: Thu 20:00, Thu 20:30  [×]"
    // slotIds are UTC, convert to display time for the banner
    const displaySlots = slotIds.map(s => _formatSlotForDisplay(s));
    const banner = document.createElement('div');
    banner.className = 'standin-filter-banner';
    banner.innerHTML = `
        <span class="filter-label">Available:</span>
        <span class="filter-slots">${displaySlots.join(', ')}</span>
        <button class="filter-clear" title="Clear filter">×</button>
    `;
    banner.querySelector('.filter-clear').addEventListener('click', () => {
        StandinFinderService.deactivate();
    });
    // Insert at top of Players panel
}

function _renderFilteredPlayers(availableMap, divisionFilter) {
    // Group by team, filter by division
    // Hide teams with zero available players
    // Show player count per team: "Bear Beer Balalaika  3 available"
    // Each player row shows: [avatar/initials] [name] [star if leader]
}
```

### 4e. Division Filter Chips — Permanent Addition

```javascript
// In PlayersPanel header, alongside "Sort: A-Z | By Team"
// Add: "Div 1 | Div 2 | Div 3 | All"

// These work in normal mode too (without standin filter active)
// When standin filter active, they control which divisions are shown
// Default: "All" in normal mode, user's division when Find Standin triggers

function _renderDivisionFilter(activeDiv) {
    const divs = [
        { label: 'All', value: null },
        { label: 'Div 1', value: 1 },
        { label: 'Div 2', value: 2 },
        { label: 'Div 3', value: 3 }
    ];
    // Render as chip buttons, highlight active
    // On click: update filter, re-render player list
}
```

### 4f. Player Tooltip — Slot Availability Detail

```javascript
// When hovering a player in the filtered standin results
// Show tooltip with:
// 1. Which of the filtered slots they're available for
// 2. Team name
// 3. (Phase 2: server status)

function _showStandinTooltip(userId, playerData, event) {
    const slots = playerData.availableSlots.map(s => _formatSlotForDisplay(s));
    const html = `
        <div class="standin-tooltip">
            <div class="tooltip-name">${escapeHtml(playerData.displayName)}</div>
            <div class="tooltip-team">${escapeHtml(playerData.teamTag)} · ${escapeHtml(playerData.teamName)}</div>
            <div class="tooltip-slots">
                ${slots.map(s => `<span class="tooltip-slot-chip">${s}</span>`).join('')}
            </div>
        </div>
    `;
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Division filter change: Re-filters already-loaded data from cache, instant re-render
- Clear standin filter [x]: State reset + re-render normal Players view from cache
- Hover player tooltip: Reads from already-computed filtered data

COLD PATHS (<2s):
- Find Standin button press: May trigger loadAllTeamAvailability() — ~40 small docs
  fetched in parallel. First time ~1-2s, subsequent uses instant (cached).
  Show loading spinner in Players tab during load.

BACKEND PERFORMANCE:
- No backend calls (all reads are Firestore client-side)
- ~40 Firestore reads on first activation per week (well within free tier)
- Cached for session duration — repeated Find Standin is instant
```

---

## 6. Data Flow Diagram

```
FIND STANDIN:
Select cells on grid → Floating action buttons appear
→ Click "Find Standin" → SelectionActionButton._handleFindStandin()
→ Capture: weekId, UTC slotIds, user's division
→ StandinFinderService.activate(weekId, slotIds, division)
→ Dispatches 'standin-search-started' event
→ Grid selection clears, floating buttons dismiss
→ BottomPanelController.switchTab('players')
→ PlayersPanel._handleStandinSearch():
  → Show filter banner: "Available: Thu 20:00, Thu 20:30 [×]"
  → Set division filter to user's division
  → AvailabilityService.loadAllTeamAvailability(weekId) — batch load ~40 docs
  → AvailabilityService.getCommunityAvailability(weekId, slotIds) — scan cache
  → Filter by division → Render filtered player list grouped by team

CHANGE DIVISION FILTER:
Click "Div 2" chip → Re-query getCommunityAvailability() with same slots
→ Filter by new division → Re-render player list

CLEAR FILTER:
Click [×] on banner → StandinFinderService.deactivate()
→ Dispatches 'standin-search-cleared' → PlayersPanel._handleStandinCleared()
→ Re-render normal unfiltered Players tab

RE-RUN WITH DIFFERENT SLOTS:
Go back to grid → Select different cells → Click "Find Standin" again
→ Previous filter replaced → New filter applied (one-shot, not cumulative)
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] "Find Standin" button appears in floating action panel when cells selected
- [ ] Clicking "Find Standin" switches to Players tab
- [ ] Filter banner shows correct slot labels with [×] button
- [ ] Division defaults to user's team division
- [ ] Division chips (All / Div 1 / Div 2 / Div 3) render and toggle
- [ ] Players filtered correctly — only those available for selected slots
- [ ] OR logic: selecting 2 slots shows players available for either
- [ ] Teams with zero available players hidden when filter active
- [ ] Hover tooltip shows slot availability detail
- [ ] Click [×] clears filter, returns to normal Players view
- [ ] Running Find Standin again replaces previous filter
- [ ] Division filter works in normal mode (without standin filter) too
- [ ] Grid returns to normal after Find Standin (can mark availability etc.)

DATA LOADING TESTS:
- [ ] loadAllTeamAvailability loads docs for all teams
- [ ] Already-cached teams not re-fetched
- [ ] Second Find Standin for same week is instant (no network)
- [ ] Loading spinner shown during first-time data fetch
- [ ] Privacy: teams with hideFromComparison excluded from results

EDGE CASES:
- [ ] No players available for selected slots → "No standins found" message
- [ ] Single slot selected → works correctly
- [ ] Many slots selected (e.g. 8 cells) → OR logic shows wider net
- [ ] User's own team players shown (they might have subs within team)
- [ ] Player on multiple teams → appears under each team they're available from
```

---

## 8. Common Integration Pitfalls

- [ ] **UTC vs local time**: Grid cells are displayed in user's timezone. The captured slotIds must be converted to UTC before querying availability data (which is stored in UTC). Use existing `_localToUtc()` from AvailabilityGrid.
- [ ] **Week boundary**: Selected cells might span two weeks (bottom of week 1, top of week 2 on the grid). `_groupCellsByWeek()` handles this — load availability for both weeks.
- [ ] **Division field name**: Check the exact field path in team docs — `team.division` or `team.divisionNumber` or similar. Verify against SCHEMA.md.
- [ ] **Privacy flags**: Must check `hideFromComparison` before including a team's players. Also check `hideRosterNames` — if set, show "X players available from [TeamTag]" without names.
- [ ] **Cache staleness**: If another user adds availability while you're browsing results, the cached data won't update (no listeners on other teams' docs). This is acceptable — data is a snapshot at search time.
- [ ] **Empty roster**: Some teams may have availability docs but empty playerRoster in team doc — handle gracefully with fallback to userId.
- [ ] **Bottom panel tab state**: After clearing standin filter, Players tab should stay on Players (not jump to Calendar).

---

## 9. Implementation Notes

### Gotchas
- **loadAllTeamAvailability parallelism**: Use `Promise.all()` but consider Firestore's client-side connection limit. 40 parallel reads should be fine, but if issues arise, batch in groups of 10.
- **Re-entrant activation**: If user clicks Find Standin while a previous search is loading, the new one should replace the old one cleanly. Use a generation counter or debounce.
- **Division filter is a permanent addition**: The Div 1/2/3/All chips should work even without an active standin search — they're a useful general-purpose filter for the Players tab.

### Dependencies
- Existing `SelectionActionButton` layout must accommodate an additional button row
- Existing `BottomPanelController.switchTab()` API
- Existing `AvailabilityService.loadWeekAvailability()` used in batch
- Existing `TeamService.teams` cache for roster/division data
- No new npm dependencies
- No backend changes
