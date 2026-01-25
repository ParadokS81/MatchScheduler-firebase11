# Slice 3.4: Basic Comparison

## 1. Slice Definition

- **Slice ID:** 3.4
- **Name:** Basic Comparison
- **User Story:** As a team leader, I can click "Compare Now" to see which time slots match with selected opponent teams, so I can quickly identify potential match times.
- **Success Criteria:**
  - User clicks "Compare Now" with 2+ teams selected
  - Grid enters comparison mode showing:
    - Normal view with user's initials in their slots (no extra border)
    - **Green outline**: Full match slots (4+ players on both sides - ready for 4v4)
    - **Amber outline**: Partial match slots (meets filter but <4 - possible with standins)
    - Hover on match slot reveals opponent roster available at that time
  - Comparison updates automatically when filters change
  - User can exit comparison mode to return to normal grid view

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.2.2: Team Selection Pattern - Click-to-select already implemented (Slice 3.1/3.2)
- 4.2.3: Comparison Process - "Compare Now" button triggers comparison calculation

DEPENDENT SECTIONS:
- 4.1.1: Grid Structure - Existing grid to be enhanced with comparison mode
- 3.3: Filter Panel - Min player filters (yourTeam, opponent) from Slice 3.3

IGNORED SECTIONS (for this slice):
- 4.2.4: Comparison Details Modal - Clicking match slot actions (Slice 3.5)
- 4.2.5: Overflow handling - Multiple teams matching in one slot (Slice 3.5)
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

- ComparisonEngine (NEW SERVICE)
  - Firebase listeners: None (state management only)
  - Cache interactions:
    - Reads from AvailabilityService cache for all selected teams
    - Reads from TeamService cache for roster data
  - Responsibilities:
    - Calculate matching slots between user's team and selected opponents
    - Maintain comparison state (active/inactive, results)
    - Dispatch events for UI updates
  - Events dispatched:
    - 'comparison-started': When comparison begins
    - 'comparison-updated': When results change (filter change, availability change)
    - 'comparison-ended': When user exits comparison mode

- FavoritesPanel (MODIFY)
  - Replace stub "Compare Now" handler with real implementation
  - Add "Exit Comparison" button when comparison active
  - User actions: "Compare Now" click → ComparisonEngine.startComparison()

- AvailabilityGrid (MODIFY)
  - Add comparison mode rendering
  - Match slots get highlight class + match indicator
  - Hover on match slot shows opponent tooltip
  - Listen for comparison events to trigger re-render

- ComparisonTooltip (NEW - part of AvailabilityGrid)
  - Shows opponent roster on hover of match slot
  - Displays: team tag, players available (bold), players not available (muted)

FRONTEND SERVICES:

- ComparisonEngine (NEW):
  - startComparison(userTeamId, opponentTeamIds, filters)
  - endComparison()
  - getComparisonState() → { active, userTeamId, opponentTeamIds, matches }
  - isSlotMatch(slotId) → boolean
  - getSlotMatches(slotId) → [{ teamId, teamTag, availablePlayers, unavailablePlayers }]
  - recalculate() → called when filters change or availability updates

BACKEND REQUIREMENTS:
⚠️ NO CLOUD FUNCTIONS NEEDED FOR THIS SLICE
- This is purely frontend calculation using cached data
- All availability and team data already cached by existing services
- No new Firestore operations required

INTEGRATION POINTS:
- Event-based communication:
  - FilterService dispatches 'filter-changed' → ComparisonEngine.recalculate()
  - ComparisonEngine dispatches 'comparison-updated' → AvailabilityGrid re-renders
  - TeamBrowserState 'team-selection-changed' → FavoritesPanel updates button state
```

---

## 4. Integration Code Examples

### Compare Now Button Handler (FavoritesPanel.js)
```javascript
// Replace stub handler in _attachButtonHandlers()
document.getElementById('compare-now-btn')?.addEventListener('click', async () => {
    const selected = TeamBrowserState.getSelectedTeams();
    if (selected.size < 2) return;

    // Get user's team (first selected, or get from context)
    const userTeamId = TeamContext.getCurrentTeamId();
    const opponentIds = Array.from(selected).filter(id => id !== userTeamId);

    // If user's team not in selection, treat first selected as user's team
    const actualUserTeam = selected.has(userTeamId) ? userTeamId : Array.from(selected)[0];
    const actualOpponents = Array.from(selected).filter(id => id !== actualUserTeam);

    const filters = FilterService.getFilters();

    // Start comparison
    await ComparisonEngine.startComparison(actualUserTeam, actualOpponents, filters);
});
```

### ComparisonEngine Core Logic
```javascript
const ComparisonEngine = (function() {
    'use strict';

    let _active = false;
    let _userTeamId = null;
    let _opponentTeamIds = [];
    let _filters = { yourTeam: 1, opponent: 1 };
    let _matches = {}; // slotId → [{ teamId, teamTag, availablePlayers, unavailablePlayers }]

    async function startComparison(userTeamId, opponentTeamIds, filters) {
        _userTeamId = userTeamId;
        _opponentTeamIds = opponentTeamIds;
        _filters = filters;
        _active = true;

        await _calculateMatches();

        window.dispatchEvent(new CustomEvent('comparison-started', {
            detail: { userTeamId, opponentTeamIds }
        }));
    }

    async function _calculateMatches() {
        _matches = {};

        // Get current visible weeks
        const weeks = WeekNavigation.getVisibleWeeks(); // e.g., ['2024-05', '2024-06']

        for (const weekId of weeks) {
            // Load user team availability
            const userAvail = await AvailabilityService.loadWeekAvailability(_userTeamId, weekId);

            for (const opponentId of _opponentTeamIds) {
                const opponentAvail = await AvailabilityService.loadWeekAvailability(opponentId, weekId);
                const opponentTeam = TeamService.getTeamFromCache(opponentId);

                // Check each slot
                for (const slotId of Object.keys(userAvail.slots || {})) {
                    const userCount = userAvail.slots[slotId]?.length || 0;
                    const opponentPlayers = opponentAvail.slots?.[slotId] || [];
                    const opponentCount = opponentPlayers.length;

                    // Check if this slot matches filter criteria
                    if (userCount >= _filters.yourTeam && opponentCount >= _filters.opponent) {
                        const fullSlotId = `${weekId}_${slotId}`;
                        if (!_matches[fullSlotId]) {
                            _matches[fullSlotId] = [];
                        }

                        // Get roster details for tooltip
                        const roster = opponentTeam?.playerRoster || [];
                        const availablePlayers = roster.filter(p => opponentPlayers.includes(p.userId));
                        const unavailablePlayers = roster.filter(p => !opponentPlayers.includes(p.userId));

                        _matches[fullSlotId].push({
                            teamId: opponentId,
                            teamTag: opponentTeam?.teamTag || '??',
                            teamName: opponentTeam?.teamName || 'Unknown',
                            availablePlayers,
                            unavailablePlayers
                        });
                    }
                }
            }
        }

        window.dispatchEvent(new CustomEvent('comparison-updated', {
            detail: { matches: _matches }
        }));
    }

    function endComparison() {
        _active = false;
        _userTeamId = null;
        _opponentTeamIds = [];
        _matches = {};

        window.dispatchEvent(new CustomEvent('comparison-ended'));
    }

    function isSlotMatch(weekId, slotId) {
        const fullSlotId = `${weekId}_${slotId}`;
        return _active && _matches[fullSlotId]?.length > 0;
    }

    function getSlotMatches(weekId, slotId) {
        const fullSlotId = `${weekId}_${slotId}`;
        return _matches[fullSlotId] || [];
    }

    function getComparisonState() {
        return {
            active: _active,
            userTeamId: _userTeamId,
            opponentTeamIds: _opponentTeamIds,
            matches: _matches
        };
    }

    function recalculate() {
        if (_active) {
            _calculateMatches();
        }
    }

    // Listen for filter changes
    window.addEventListener('filter-changed', (e) => {
        if (_active) {
            _filters = e.detail;
            _calculateMatches();
        }
    });

    return {
        startComparison,
        endComparison,
        isSlotMatch,
        getSlotMatches,
        getComparisonState,
        recalculate
    };
})();
```

### Grid Cell Rendering with Match Highlight
```javascript
// In AvailabilityGrid._renderCell() - add comparison check
function _renderCell(day, time, playerIds, playerRoster) {
    const slotId = `${day}_${time}`;
    const matchInfo = ComparisonEngine.getSlotMatchInfo(_weekId, slotId);
    // matchInfo = { hasMatch: boolean, isFullMatch: boolean, matches: [...] }

    let matchClass = '';
    if (matchInfo.hasMatch) {
        // Full match = 4+ on both sides, ready for 4v4
        // Partial match = meets filter criteria but <4 on either side
        matchClass = matchInfo.isFullMatch ? 'comparison-match-full' : 'comparison-match-partial';
    }

    return `
        <div class="availability-cell ${matchClass}"
             data-cell-id="${slotId}"
             data-has-match="${matchInfo.hasMatch}"
             data-full-match="${matchInfo.isFullMatch}">
            ${_renderPlayerBadges(playerIds, playerRoster)}
        </div>
    `;
}
```

### ComparisonEngine Match Classification
```javascript
// Match classification logic
const FULL_MATCH_THRESHOLD = 4; // 4v4 game requirement

function getSlotMatchInfo(weekId, slotId) {
    const fullSlotId = `${weekId}_${slotId}`;
    const matches = _matches[fullSlotId] || [];

    if (matches.length === 0) {
        return { hasMatch: false, isFullMatch: false, matches: [] };
    }

    // Check if ANY opponent has 4+ available AND user team has 4+
    const userCount = _getUserTeamCount(weekId, slotId);
    const isFullMatch = userCount >= FULL_MATCH_THRESHOLD &&
        matches.some(m => m.availablePlayers.length >= FULL_MATCH_THRESHOLD);

    return {
        hasMatch: true,
        isFullMatch,
        matches
    };
}
```

### Match Slot Hover Tooltip
```javascript
// Tooltip showing opponent roster on hover
function _showMatchTooltip(cell, weekId, slotId) {
    const matches = ComparisonEngine.getSlotMatches(weekId, slotId);
    if (matches.length === 0) return;

    const tooltipHtml = matches.map(match => `
        <div class="match-team-section">
            <div class="match-team-header">
                <span class="match-team-tag">[${match.teamTag}]</span>
                <span class="match-team-name">${match.teamName}</span>
            </div>
            <div class="match-roster">
                ${match.availablePlayers.map(p => `
                    <span class="player-available">${p.displayName}</span>
                `).join('')}
                ${match.unavailablePlayers.map(p => `
                    <span class="player-unavailable text-muted">${p.displayName}</span>
                `).join('')}
            </div>
        </div>
    `).join('<hr class="match-divider">');

    _matchTooltip.innerHTML = tooltipHtml;
    // Position near cell...
    _matchTooltip.style.display = 'block';
}
```

### FavoritesPanel with Exit Comparison
```javascript
// Updated render to show Exit button when comparison active
function _render() {
    const comparison = ComparisonEngine.getComparisonState();
    const selectedTeams = TeamBrowserState.getSelectedTeams();

    // ... existing render code ...

    // Bottom action area
    const actionButton = comparison.active
        ? `<button id="exit-comparison-btn"
                   class="w-full py-2 px-4 rounded-lg font-medium transition-colors
                          bg-muted text-foreground hover:bg-muted/80">
               Exit Comparison
           </button>`
        : `<button id="compare-now-btn"
                   class="w-full py-2 px-4 rounded-lg font-medium transition-colors
                          ${selectedTeams.size >= 2
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : 'bg-muted text-muted-foreground cursor-not-allowed'}"
                   ${selectedTeams.size < 2 ? 'disabled' : ''}>
               Compare Now (${selectedTeams.size} selected)
           </button>`;

    // Render actionButton in the bottom section
}

// Handler for exit
document.getElementById('exit-comparison-btn')?.addEventListener('click', () => {
    ComparisonEngine.endComparison();
});
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Filter value change: Recalculation uses cached data only, no network calls
- Hover on match slot: Tooltip data already calculated, instant display
- Exit comparison: Just clears state and dispatches event

COLD PATHS (<2s):
- "Compare Now" click: May need to load availability for multiple teams/weeks
  - Mitigation: Show loading state on button
  - Pre-load availability for visible weeks when teams are selected
  - Cache persists, so subsequent comparisons are instant

REAL-TIME UPDATES:
- Availability changes from Firebase listeners trigger recalculation
- Grid re-renders only changed cells (via comparison-updated event)
```

---

## 6. Data Flow Diagram

```
USER ACTION: Click "Compare Now"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ FavoritesPanel.handleCompareClick()                         │
│   - Get selected teams from TeamBrowserState                │
│   - Get filters from FilterService                          │
│   - Show loading state                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ ComparisonEngine.startComparison(userTeam, opponents, filters)│
│   - Set active = true                                        │
│   - Store team IDs and filters                               │
│   - Call _calculateMatches()                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ _calculateMatches()                                         │
│   - For each visible week:                                  │
│     - Load user team availability (cache hit)               │
│     - For each opponent:                                    │
│       - Load opponent availability (cache hit or fetch)     │
│       - For each slot:                                      │
│         - userCount = slots[slotId].length                  │
│         - opponentCount = opponentSlots[slotId].length      │
│         - If userCount >= filter.yourTeam                   │
│           AND opponentCount >= filter.opponent              │
│           → Add to _matches                                 │
│   - Dispatch 'comparison-updated'                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ window.dispatchEvent('comparison-started')                  │
│ window.dispatchEvent('comparison-updated')                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ AvailabilityGrid listens to 'comparison-started'            │
│   - Re-renders with comparison mode active                  │
│   - Match slots get 'comparison-match' class                │
│   - Match indicator badge shows opponent count              │
│   - Hover shows opponent roster tooltip                     │
└─────────────────────────────────────────────────────────────┘

FILTER CHANGE FLOW:
FilterService.setYourTeamMinimum(3)
         │
         ▼
window.dispatchEvent('filter-changed')
         │
         ▼
ComparisonEngine listener catches event
         │
         ▼
ComparisonEngine.recalculate()
         │
         ▼
_calculateMatches() with new filters
         │
         ▼
window.dispatchEvent('comparison-updated')
         │
         ▼
AvailabilityGrid re-renders match highlights
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] "Compare Now" button disabled with < 2 teams selected
- [ ] "Compare Now" button enabled with 2+ teams selected
- [ ] Click "Compare Now" dispatches comparison-started event
- [ ] ComparisonEngine.isSlotMatch() returns correct boolean
- [ ] Match slots receive 'comparison-match' CSS class
- [ ] Hover on match slot shows tooltip with opponent info
- [ ] "Exit Comparison" button appears when comparison active
- [ ] Click "Exit Comparison" dispatches comparison-ended event
- [ ] Grid returns to normal view after exit comparison

BACKEND TESTS:
- N/A (no backend for this slice)

INTEGRATION TESTS (CRITICAL):
- [ ] Select 2 teams → Click Compare → Grid shows matches
- [ ] Filter change → Matches recalculate automatically
- [ ] Match slot tooltip shows correct roster (available vs unavailable)
- [ ] Availability update (via listener) → Matches recalculate
- [ ] Exit comparison → Grid shows normal view
- [ ] Re-enter comparison → Previous results not stale

END-TO-END TESTS:
- [ ] Full flow: Select teams → Set filters → Compare → See matches → Hover → Exit
- [ ] Filter edge cases: min=4 with teams having exactly 4 available
- [ ] Multiple opponents: Verify all matching teams shown in tooltip
- [ ] Week navigation during comparison: New weeks calculate correctly
```

---

## 8. Common Integration Pitfalls

- [ ] **Forgetting to listen for comparison events in AvailabilityGrid**
  - Grid must subscribe to 'comparison-started', 'comparison-updated', 'comparison-ended'

- [ ] **Not handling case when user's team isn't in selection**
  - Need to determine which team is "yours" vs "opponents"
  - Could default to first selected, or require TeamContext

- [ ] **Missing loading state during initial comparison**
  - First "Compare Now" may fetch multiple availability docs
  - Button should show "Comparing..." during this time

- [ ] **Not recalculating when filters change**
  - ComparisonEngine must listen to 'filter-changed' and call recalculate()

- [ ] **Tooltip positioning issues**
  - Match tooltip may go off-screen; needs boundary checking

- [ ] **Cache not being used for opponent availability**
  - Must use AvailabilityService.loadWeekAvailability() which is cache-first

- [ ] **Week navigation breaks comparison**
  - When user navigates to new weeks, comparison should include those weeks

---

## 9. Implementation Notes

### Visual Design: Match Slot Indicators

**Design Rationale:**
- Your own slots already show colored initials/badges - no border needed
- Match quality indicated by outline color:
  - **Green outline**: Full match (4+ players on both sides) - ready for 4v4
  - **Yellow/amber outline**: Partial match (meets filter but <4) - possible with standins

```
┌─────────────────────────────────────────────────────────────┐
│  Normal slot (your availability):  No border, just badges   │
│  ┌─────────┐                                                │
│  │ CV  BK  │  ← Purple badges show who's available          │
│  └─────────┘                                                │
│                                                             │
│  Full match (4+ each):  Green outline                       │
│  ┌─────────┐                                                │
│  │ CV  BK  │  ← Green border = ready to play 4v4            │
│  │ AS  EB  │                                                │
│  └─────────┘                                                │
│                                                             │
│  Partial match (<4):  Amber/yellow outline                  │
│  ┌─────────┐                                                │
│  │ CV  BK  │  ← Amber border = possible with standins       │
│  └─────────┘                                                │
└─────────────────────────────────────────────────────────────┘
```

### CSS Classes to Add (src/css/input.css)
```css
/* Remove default border from availability cells during comparison */
.comparison-mode .availability-cell {
    border-color: transparent;
}

/* Full match - 4+ players on both sides, ready for 4v4 */
.comparison-match-full {
    border: 2px solid hsl(var(--success)) !important;
    box-shadow: 0 0 0 1px hsl(var(--success) / 0.3);
}

.comparison-match-full:hover {
    border-color: hsl(var(--success)) !important;
    box-shadow: 0 0 0 2px hsl(var(--success) / 0.4);
}

/* Partial match - meets filter but <4 players, possible with standins */
.comparison-match-partial {
    border: 2px solid hsl(var(--warning)) !important;
    box-shadow: 0 0 0 1px hsl(var(--warning) / 0.3);
}

.comparison-match-partial:hover {
    border-color: hsl(var(--warning)) !important;
    box-shadow: 0 0 0 2px hsl(var(--warning) / 0.4);
}

/* Match tooltip */
.match-tooltip {
    position: fixed;
    z-index: 100;
    background: hsl(var(--popover));
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 0.75rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    max-width: 20rem;
}

.match-team-header {
    font-weight: 600;
    margin-bottom: 0.5rem;
}

.match-team-tag {
    color: hsl(var(--primary));
}

.player-available {
    color: hsl(var(--foreground));
}

.player-unavailable {
    color: hsl(var(--muted-foreground));
    opacity: 0.6;
}

.match-divider {
    margin: 0.5rem 0;
    border-color: hsl(var(--border));
}
```

### Dependencies on Other Slices
- **Slice 3.1** (TeamBrowser): TeamBrowserState.getSelectedTeams()
- **Slice 3.2** (Favorites): FavoritesPanel exists with stub button
- **Slice 3.3** (Filters): FilterService.getFilters() and 'filter-changed' event
- **Slice 2.1** (Grid): AvailabilityGrid exists with cell rendering
- **Slice 2.2** (Availability): AvailabilityService.loadWeekAvailability() with cache

### Determining "Your Team" vs Opponents
For this slice, use simple logic:
1. If TeamContext exists and user has a current team, that's "your team"
2. Otherwise, first selected team is treated as "your team"
3. All other selected teams are opponents

Future enhancement (Slice 4.x): Allow explicit "my team" designation

### Files to Create
1. `/public/js/services/ComparisonEngine.js` - Core comparison logic

### Files to Modify
1. `/public/js/components/FavoritesPanel.js` - Real button handler, exit button
2. `/public/js/components/AvailabilityGrid.js` - Match rendering, tooltip
3. `/src/css/input.css` - Comparison styles
4. `/public/js/app.js` - Initialize ComparisonEngine

---

## 10. Pragmatic Assumptions

**ASSUMPTION**: When no explicit "your team" context exists, first selected team is treated as the user's team for comparison purposes.
- **Rationale**: Simplest approach that works for the common case where user selects their team first
- **Alternative**: Require TeamContext to always have a current team set

**ASSUMPTION**: Comparison calculates across all visible weeks (typically 2 weeks shown)
- **Rationale**: Users want to see matches for the time range they're viewing
- **Alternative**: Only calculate for explicitly selected week
