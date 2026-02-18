# Slice A4: Admin Aggregated Grid

## Slice Definition

| Field | Value |
|-------|-------|
| **ID** | A4 |
| **Name** | Admin Aggregated Availability Grid |
| **Depends on** | A1 (admin foundation — `admin-mode-changed` event) |
| **Blocks** | None |

**User Story:** As the app admin, I want the top availability grids to show aggregated player counts per time slot (across all teams) when in admin mode, filtered by the right sidebar division/favorites filters, so I can see community-wide scheduling patterns.

**Success Criteria:**
1. When admin mode activates, both week grids show aggregated counts instead of player badges
2. Each cell displays the total number of available players across all filtered teams
3. Right sidebar division filters (D1/D2/D3) affect which teams are counted
4. Favorites filter limits aggregation to favorited teams only
5. Color intensity of cells scales with player count (heatmap effect)
6. Week navigation works normally — each week shows its own aggregated data
7. When admin mode deactivates, grids return to normal single-team badge display
8. Drag selection is disabled in aggregated mode (read-only view)

---

## Architecture

### Files Changed

| File | Action | What |
|------|--------|------|
| `public/js/components/AvailabilityGrid.js` | Modify | Add aggregated mode: data loading, count rendering, filter listener |
| `public/js/services/AvailabilityService.js` | Modify | Add `getAllCachedWeekData(weekId)` helper |
| `src/css/input.css` | Modify | Aggregated count cell styles + heatmap colors |

---

## Implementation Details

### 1. `AvailabilityGrid.js` — Aggregated Mode

The AvailabilityGrid is created via `AvailabilityGrid.create(container, options)` which returns an instance. Each WeekDisplay has its own grid instance. Changes go inside the `create()` factory function.

**New state variables** (inside `create()`):
```javascript
let _aggregatedMode = false;
let _aggregatedData = null;  // { [utcSlotId]: count }
let _filterUnsubscribe = null;
```

**Listen for admin mode** (in the returned object's init or after creation):
```javascript
window.addEventListener('admin-mode-changed', _handleAdminModeChanged);
```

**Handler:**
```javascript
function _handleAdminModeChanged(e) {
    if (e.detail.active) {
        _enterAggregatedMode();
    } else {
        _exitAggregatedMode();
    }
}

async function _enterAggregatedMode() {
    _aggregatedMode = true;

    // Disable drag selection
    _disableDragSelection();

    // Listen to filter changes
    if (typeof TeamBrowserState !== 'undefined') {
        _filterUnsubscribe = TeamBrowserState.onFilterChange(_recomputeAggregated);
    }

    await _recomputeAggregated();
}

function _exitAggregatedMode() {
    _aggregatedMode = false;

    // Unsubscribe from filter changes
    if (_filterUnsubscribe) { _filterUnsubscribe(); _filterUnsubscribe = null; }

    // Re-enable drag selection
    _enableDragSelection();

    // Restore normal display
    refreshDisplay();
}
```

**Core aggregation logic:**
```javascript
async function _recomputeAggregated() {
    if (!_aggregatedMode) return;

    const weekId = _weekId;  // Current week ID from grid instance

    // 1. Load all team availability for this week
    await AvailabilityService.loadAllTeamAvailability(weekId);

    // 2. Get all teams, apply filters
    const allTeams = TeamService.getAllTeams();
    const filteredTeams = _applyFilters(allTeams);

    // 3. Aggregate counts per UTC slot
    const slotCounts = {};
    for (const team of filteredTeams) {
        const data = AvailabilityService.getCachedData(team.id, weekId);
        if (!data?.slots) continue;

        for (const [slotId, userIds] of Object.entries(data.slots)) {
            if (!slotCounts[slotId]) slotCounts[slotId] = 0;
            slotCounts[slotId] += userIds.length;
        }
    }

    _aggregatedData = slotCounts;

    // 4. Render
    _renderAggregatedCells();
}

function _applyFilters(teams) {
    if (typeof TeamBrowserState === 'undefined') return teams;

    const divisionFilters = TeamBrowserState.getDivisionFilters();
    const favoritesActive = TeamBrowserState.isFavoritesFilterActive();
    const favorites = favoritesActive ? TeamBrowserState.getFavoriteTeamIds() : null;
    const searchQuery = TeamBrowserState.getSearchQuery()?.toLowerCase();

    return teams.filter(team => {
        // Division filter
        if (divisionFilters.size > 0) {
            const teamDivisions = team.divisions || [];
            const matchesDivision = teamDivisions.some(d => divisionFilters.has(d));
            if (!matchesDivision) return false;
        }

        // Favorites filter
        if (favorites && !favorites.has(team.id)) return false;

        // Search filter
        if (searchQuery) {
            const nameMatch = (team.teamName || '').toLowerCase().includes(searchQuery);
            const tagMatch = (team.teamTag || '').toLowerCase().includes(searchQuery);
            if (!nameMatch && !tagMatch) return false;
        }

        // Privacy: skip teams that hide from comparison
        if (team.hideFromComparison) return false;

        return true;
    });
}
```

**Cell rendering for aggregated mode:**
```javascript
function _renderAggregatedCells() {
    if (!_container || !_aggregatedData) return;

    const allCells = _container.querySelectorAll('.grid-cell');
    const maxCount = Math.max(1, ...Object.values(_aggregatedData));

    allCells.forEach(cell => {
        const utcSlot = cell.dataset.utcSlot;
        const count = _aggregatedData[utcSlot] || 0;

        if (count > 0) {
            // Heatmap intensity: 0.2 (min) to 1.0 (max)
            const intensity = 0.2 + (count / maxCount) * 0.8;
            cell.innerHTML = `<span class="aggregated-count">${count}</span>`;
            cell.classList.add('has-players', 'aggregated-cell');
            cell.style.setProperty('--heat-intensity', intensity.toFixed(2));
        } else {
            cell.innerHTML = '';
            cell.classList.remove('has-players', 'aggregated-cell');
            cell.style.removeProperty('--heat-intensity');
        }
    });
}
```

**Disable/enable drag selection:**
```javascript
function _disableDragSelection() {
    // Remove or disable the mousedown/mousemove/mouseup handlers
    // that drive drag-to-select. Store them so we can re-enable.
    _container.classList.add('aggregated-mode');
    // The CSS will set pointer-events or cursor to indicate read-only
}

function _enableDragSelection() {
    _container.classList.remove('aggregated-mode');
}
```

**Guard existing handlers.** In the existing mousedown/mousemove handlers for drag selection, add early return:
```javascript
// At top of drag selection handler
if (_aggregatedMode) return;
```

**Guard ALL entry points that write to cells.** When aggregated mode is active, skip normal rendering. Add early returns to:

```javascript
// 1. Main entry point
function updateTeamDisplay(availabilityData, playerRoster, currentUserId) {
    if (_aggregatedMode) return;
    // ... existing logic
}

// 2. Refresh display (called by comparison, display mode changes, etc.)
function refreshDisplay() {
    if (_aggregatedMode) return;
    // ... existing logic
}

// 3. Any other public method that writes cell innerHTML
// Search for all callers of _renderPlayerBadges and guard them
```

**Week change handling.** When the grid's weekId changes (navigation), re-aggregate:
```javascript
// In the existing setWeek() or week change handler:
if (_aggregatedMode) {
    _recomputeAggregated();
    return;
}
```

### 2. `AvailabilityService.js` — Helper Method

Add method to get all cached data for a week:

```javascript
/**
 * Get cached availability data for a specific team+week.
 * Returns null if not in cache.
 */
function getCachedData(teamId, weekId) {
    const cacheKey = `${teamId}_${weekId}`;
    return _cache.get(cacheKey) || null;
}
```

Check if this already exists — the exploration found it at line 558. If it exists, no change needed. If the signature is different, adapt.

### 3. CSS Additions (`src/css/input.css`)

```css
/* Aggregated mode */
.aggregated-mode .grid-cell {
    cursor: default;
}

.aggregated-count {
    font-size: 0.875rem;
    font-weight: 700;
    color: oklch(from var(--primary) l c h);
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
}

/* Heatmap: cell background intensity driven by CSS variable */
.grid-cell.aggregated-cell {
    background: oklch(from var(--primary) l c h / var(--heat-intensity, 0.2));
}

/* High count highlight */
.grid-cell.aggregated-cell .aggregated-count {
    color: oklch(from var(--foreground) l c h);
}
```

---

## Data Flow

```
Admin tab activated (A1)
  → 'admin-mode-changed' { active: true }
  → AvailabilityGrid._handleAdminModeChanged() (both Week 1 and Week 2 grids)
  → _enterAggregatedMode()
      → Disable drag selection
      → Subscribe to TeamBrowserState.onFilterChange()
      → _recomputeAggregated()
          → AvailabilityService.loadAllTeamAvailability(weekId)
          → Filter teams by division/favorites/search
          → Sum player counts per UTC slot
          → _renderAggregatedCells()
              → Each cell shows count number
              → CSS heatmap intensity via --heat-intensity

Filter change (user toggles D1/D2/D3 or favorites):
  → TeamBrowserState.onFilterChange fires
  → _recomputeAggregated() re-runs
  → Cells update with new counts

Week navigation:
  → WeekDisplay.setWeek() triggers
  → _recomputeAggregated() for new weekId

Admin tab deactivated:
  → 'admin-mode-changed' { active: false }
  → _exitAggregatedMode()
  → Unsubscribe from filter changes
  → Re-enable drag selection
  → refreshDisplay() restores normal badge view
```

---

## Performance Classification

- **Aggregation computation:** Cold path. Reads from AvailabilityService cache (already loaded by `loadAllTeamAvailability`). ~40 teams × ~50 slots = 2,000 iterations. Instant.
- **Initial load:** One Firestore batch query via `loadAllTeamAvailability()`. Cold path, ~40 docs. Acceptable latency (<500ms).
- **Filter changes:** Hot path after initial load — re-aggregation from cache is instant, no Firestore reads.
- **Cell rendering:** Hot path — DOM updates for ~50 visible cells. Instant.

---

## Test Scenarios

1. **Activate admin mode** → both grids show numbers instead of player badges
2. **Counts are correct** → pick a time slot, manually count availability across teams, verify
3. **Division filter** → toggle D1 off → counts decrease (only D2/D3 teams counted)
4. **Favorites filter** → activate → only favorited teams counted
5. **Search filter** → type team name → only matching teams counted
6. **Week navigation** → navigate to next week → aggregated data refreshes
7. **Deactivate admin mode** → grids return to normal player badges
8. **Drag selection disabled** → clicking/dragging in grid does nothing in admin mode
9. **Heatmap** → cells with more players appear more saturated
10. **Privacy** → teams with `hideFromComparison: true` are excluded

---

## Common Pitfalls

- **Both grids must react.** `admin-mode-changed` event reaches both WeekDisplay instances (Week 1 and Week 2). Each has its own AvailabilityGrid — both must enter/exit aggregated mode.
- **UTC slot IDs.** The aggregation works on UTC slot IDs from Firestore (`data-utc-slot`). Don't accidentally use local cell IDs (`data-cell-id`) — they may differ if user is not in UTC.
- **`updateTeamDisplay()` guard.** Without the early return guard, the normal team data refresh will overwrite the aggregated view whenever availability changes for the user's team.
- **Filter unsubscribe on exit.** Forgetting to unsubscribe from `TeamBrowserState.onFilterChange` will cause stale callbacks to fire when user changes filters in normal mode.
- **`loadAllTeamAvailability` deduplication.** This method tracks loaded weeks in a Set. Calling it multiple times for the same weekId is safe — it won't re-fetch.
