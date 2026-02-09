# Slice 17.0: Implicit Comparison Mode

## Overview
Remove the explicit "Compare: ON/OFF" toggle and make comparison mode activate implicitly based on team selection state. If no opponent teams are selected in the browser, comparison is off. If any opponent team is selected, comparison is on. This eliminates a confusing intermediate step without losing any capability.

## User Value
- **Simpler mental model** — "click a team, see matches" instead of "toggle compare, then click a team"
- **Removes confusion** — users no longer wonder "why aren't highlights showing?" (answer was: toggle was off)
- **Fewer controls** — one less button to understand in an already dense sidebar
- **Zero capability loss** — deselecting all teams = compare off (natural "off" state)

## Current State

### The Problem
Three UI locations render a compare toggle button:
1. **FilterPanel** (desktop right sidebar header) — `compare-toggle` button with on/off classes
2. **FavoritesPanel** (desktop favorites area) — `compare-toggle-btn` showing "Compare: ON (N)" / "Compare: OFF"
3. **MobileBottomBar** (mobile) — `mobile-bb-compare-btn` showing "Compare ON" / "Compare"

Users must: (1) toggle Compare ON, (2) select teams, (3) see highlights. Step 1 is unnecessary — the only reason to select an opponent team is to compare.

### Current Architecture
```
User clicks Compare toggle
    → FilterPanel/FavoritesPanel/MobileBottomBar handler
    → ComparisonEngine.enableAutoMode(userTeamId)  // sets _autoMode = true
    → Now listens to team-selection-changed events
    → Team click → recalculate → highlights

User clicks Compare OFF
    → ComparisonEngine.endComparison()  // sets _autoMode = false, _active = false
    → comparison-ended event → grids clear highlights
```

**Key state variables in ComparisonEngine:**
- `_autoMode` — persistent toggle flag (true = reactive to team selection)
- `_active` — transient flag (true = highlights currently showing)
- `_userTeamId` — set by enableAutoMode(), from MatchSchedulerApp.getSelectedTeam()

### Files Currently Involved
| File | Compare Toggle Role |
|------|-------------------|
| ComparisonEngine.js | `_autoMode` flag, `enableAutoMode()`, `isAutoMode()`, `comparison-mode-changed` event |
| FilterPanel.js | Toggle button render, click handler, state sync listeners |
| FavoritesPanel.js | Toggle button render, click handler, state sync listeners |
| MobileBottomBar.js | Toggle button render, click handler, state sync |
| MatchesPanel.js | "Load Grid View" calls `enableAutoMode()` |
| app.js | Listens to comparison-started/updated/ended events |
| AvailabilityGrid.js | `_comparisonMode` flag, enter/exit/update highlight methods |
| WeekDisplay.js | Delegates comparison methods to grid |
| input.css | `.compare-toggle.on/.off` styles, `.comparison-mode` container class |

---

## Target State

### New Architecture
```
User selects opponent team in browser/favorites
    → TeamBrowserState dispatches team-selection-changed
    → ComparisonEngine ALWAYS listens (no _autoMode gate)
    → Derives _userTeamId from MatchSchedulerApp.getSelectedTeam()
    → If opponents > 0: activate, calculate, dispatch comparison-started
    → If opponents = 0: deactivate, dispatch comparison-ended

No toggle. No _autoMode. Selection IS the toggle.
```

### State Simplification
```
REMOVE: _autoMode flag
REMOVE: enableAutoMode() method
REMOVE: isAutoMode() method
REMOVE: comparison-mode-changed event

KEEP: _active flag (true when opponents selected and highlights showing)
KEEP: _userTeamId (now derived on every selection change, not set once)
KEEP: comparison-started / comparison-updated / comparison-ended events
KEEP: All grid highlighting logic (unchanged)
KEEP: ComparisonModal (unchanged)
KEEP: Min filter reactivity (unchanged)
```

---

## Sub-slices

### Sub-slice 17.0a: ComparisonEngine — Remove autoMode, Always React

**File:** `public/js/services/ComparisonEngine.js`

**Changes:**

1. **Remove `_autoMode` state variable** (line 13)

2. **Remove `enableAutoMode()` function** (lines 188-221)

3. **Remove `isAutoMode()` function** (lines 227-229)

4. **Remove `comparison-mode-changed` event dispatch** (lines 218-220)

5. **Remove `autoMode` from `getComparisonState()`** (line 286)

6. **Remove `enableAutoMode` and `isAutoMode` from public API** (lines 400-401)

7. **Modify `team-selection-changed` listener** (lines 369-394):
   - Remove the `if (!_autoMode || !_userTeamId) return;` guard (line 371)
   - Derive `_userTeamId` fresh from `MatchSchedulerApp.getSelectedTeam()?.id` on every event
   - If no user team: skip comparison silently (user hasn't selected their own team yet)
   - If opponents > 0 and not already active: dispatch `comparison-started`
   - If opponents > 0 and already active: recalculate, dispatch `comparison-updated`
   - If opponents = 0: deactivate, dispatch `comparison-ended`

8. **Modify `filter-changed` listener** (line 358):
   - Change `if (_active || _autoMode)` to just `if (_active)`

9. **Modify `endComparison()`** (lines 173-182):
   - Remove `_autoMode = false;` (line 175) — no longer exists
   - Keep the rest: clear state, dispatch `comparison-ended`

10. **Keep `startComparison()` as-is** — still useful for programmatic use (e.g., future features)

**New `team-selection-changed` handler:**
```javascript
window.addEventListener('team-selection-changed', (e) => {
    // Derive user team fresh each time
    const userTeamId = typeof MatchSchedulerApp !== 'undefined'
        ? MatchSchedulerApp.getSelectedTeam()?.id
        : null;

    if (!userTeamId) return; // No team selected in grid — can't compare

    _userTeamId = userTeamId;

    // Get current filters
    if (typeof FilterService !== 'undefined') {
        _filters = FilterService.getFilters();
    }

    const selected = e.detail.selectedTeams || [];
    _opponentTeamIds = selected.filter(id => id !== userTeamId);

    if (_opponentTeamIds.length > 0) {
        const wasActive = _active;
        _active = true;
        _calculateMatches();
        if (!wasActive) {
            window.dispatchEvent(new CustomEvent('comparison-started', {
                detail: { userTeamId: _userTeamId, opponentTeamIds: _opponentTeamIds }
            }));
        }
    } else {
        if (_active) {
            _active = false;
            _matches = {};
            _userTeamCounts = {};
            window.dispatchEvent(new CustomEvent('comparison-ended'));
        }
    }
});
```

**Edge case — user switches their own team via team switcher:**
The grid already dispatches a `team-changed` or re-init event when the user switches teams. The next `team-selection-changed` event will pick up the new `_userTeamId` automatically. If the user's new team IS one of the selected opponents, it gets filtered out. No special handling needed.

---

### Sub-slice 17.0b: Remove Toggle UI from All Three Locations

**File 1:** `public/js/components/FilterPanel.js`

Changes:
- **Remove compare toggle button** from `_render()` (lines 50-54) — keep only the min-filter-group
- **Remove `_handleCompareToggle()`** function (lines 166-187)
- **Remove listeners** for `comparison-mode-changed` event (lines 194, 228)
- **Remove `_handleComparisonChanged()`** that syncs button state (lines 213-221)
- Keep `comparison-started`/`comparison-ended` listeners IF they're used for anything else (check: they call `_handleComparisonChanged` which just updates the removed button — so remove those too)
- **Keep** filter-changed listener and min-filter UI (unchanged)

**File 2:** `public/js/components/FavoritesPanel.js`

Changes:
- **Remove the compare toggle button** from `_render()` (lines 171-185, the `actionButton` variable)
- **Remove the `<div class="mt-3 pt-2">` wrapper** that held the button (lines 208-210)
- **Remove compare toggle click handler** from `_attachButtonHandlers()` (lines 286-310)
- **Remove `_isComparing` state** and comparison state check (lines 165-169)
- **Remove listeners** for `comparison-mode-changed`, `comparison-started`, `comparison-ended` (lines 360-362, 396-398) — only keep `team-selection-changed` listener if it's used for rendering selected state on cards
- Favorites panel now shows: Select All/Deselect All + team cards. Simpler.

**File 3:** `public/js/MobileBottomBar.js`

Changes:
- **Remove compare toggle button** from render (lines 114-119, `_compareBtn` creation)
- **Remove `_handleCompareToggle()`** function (lines 194-203)
- **Remove `_syncCompareState()`** function (lines 258-265)
- **Remove listeners** for comparison events that sync button state (lines 299-301)
- **Remove dimmed class logic** on filter number buttons (lines 128, 264-265) — filter numbers should always be visible now
- **Keep** the min-filter number buttons (`_yourNumBtn`, `_oppNumBtn`) and vs label — these still matter for controlling comparison thresholds
- Layout: compare group now shows just `[1] v [1]` (min filters) without the compare button

---

### Sub-slice 17.0c: Update MatchesPanel "Load Grid View"

**File:** `public/js/components/MatchesPanel.js`

Changes to `_handleLoadGridView()` (lines 1055-1094):
- **Remove** the `ComparisonEngine.enableAutoMode()` call (lines 1086-1090)
- The flow becomes:
  1. Set week number
  2. Switch to calendar tab
  3. Clear selection + select opponent team (this triggers `team-selection-changed`)
  4. Dispatch `filter-changed` with proposal filters
  5. **Done** — comparison activates automatically from step 3

This is actually simpler than before. The team selection event triggers comparison, filter-changed refines it.

---

### Sub-slice 17.0d: CSS Cleanup

**File:** `src/css/input.css`

Changes:
- **Remove `.compare-toggle` button styles** (lines ~423-442): `.compare-toggle`, `.compare-toggle.off`, `.compare-toggle.on`
- **Keep** all comparison-mode grid styles: `.comparison-mode`, `.comparison-match-full`, `.comparison-match-partial`, `.match-count-badge`
- **Keep** `.mobile-bb-compare-btn` removal or repurpose (remove if button is gone)
- **Remove** any mobile compare button active states

---

## Files Affected Summary

| File | Sub-slice | Change Type | Scope |
|------|-----------|-------------|-------|
| `public/js/services/ComparisonEngine.js` | 17.0a | MODIFY | Remove autoMode, simplify listener |
| `public/js/components/FilterPanel.js` | 17.0b | MODIFY | Remove toggle button + handlers |
| `public/js/components/FavoritesPanel.js` | 17.0b | MODIFY | Remove toggle button + handlers |
| `public/js/MobileBottomBar.js` | 17.0b | MODIFY | Remove toggle button + handlers |
| `public/js/components/MatchesPanel.js` | 17.0c | MODIFY | Remove enableAutoMode call |
| `src/css/input.css` | 17.0d | MODIFY | Remove toggle button styles |

**NOT affected (no changes needed):**
| File | Why Unchanged |
|------|--------------|
| `app.js` | Listeners for comparison-started/updated/ended remain identical |
| `AvailabilityGrid.js` | `_comparisonMode`, enter/exit/update methods unchanged |
| `WeekDisplay.js` | Delegation methods unchanged |
| `ComparisonModal.js` | Uses `getComparisonState()` and match data — no autoMode dependency |
| `TeamBrowserState.js` | Dispatches `team-selection-changed` as before |
| `FilterService.js` | Dispatches `filter-changed` as before |
| `team-operations.js` | Backend privacy flags unrelated to toggle |
| `TeamManagementModal.js` | hideFromComparison/hideRosterNames settings unchanged |

---

## Implementation Order

1. **17.0a first** — ComparisonEngine changes. This is the core. Once autoMode is removed and the listener always fires, comparison works implicitly. All existing UI toggles will break (they call removed methods), but that's fixed in 17.0b.
2. **17.0b second** — Remove all three toggle UIs. Must happen immediately after 17.0a or the app throws errors on `isAutoMode()` / `enableAutoMode()` calls.
3. **17.0c third** — Fix MatchesPanel's Load Grid View. Small change, removes the now-nonexistent `enableAutoMode()` call.
4. **17.0d last** — CSS cleanup. Cosmetic, no functional impact.

**Practical note:** 17.0a and 17.0b should be done together in one pass — they're tightly coupled. The sub-slice split is for clarity, not for separate deployment.

---

## Risk Assessment

**Low risk:**
- This is a removal/simplification, not adding new logic
- The event system (`comparison-started/updated/ended`) is untouched
- Grid highlighting code is untouched
- ComparisonModal is untouched

**Medium risk — edge cases to verify:**
1. **No user team selected yet** — If user hasn't picked their team in the grid (fresh session), `MatchSchedulerApp.getSelectedTeam()` returns null. Comparison silently skips. Once they select a team, next opponent click triggers comparison. Graceful.
2. **User's own team in opponent selection** — Already handled: `selected.filter(id => id !== userTeamId)`. If user selects their own team in browser, it's excluded from opponents.
3. **"Load Grid View" timing** — Team selection + filter dispatch happen synchronously. The `team-selection-changed` listener fires first, starts comparison with default filters. Then `filter-changed` fires, recalculates with correct filters. Net result: two quick recalculations, second one has correct filters. Could optimize with a microtask defer but not necessary for this scale.
4. **Filter numbers dimmed when compare is off (mobile)** — Currently MobileBottomBar dims filter buttons when compare is off. With implicit mode, filters should always be visible. Users might change filters before selecting opponents — that's fine, filters persist and apply when comparison activates.

---

## Test Scenarios

### Desktop
- [ ] Select opponent team in browser → grid shows comparison highlights immediately
- [ ] Select second opponent → highlights update for both
- [ ] Deselect all opponents → highlights clear
- [ ] Change min filter → highlights recalculate
- [ ] Click highlighted slot → ComparisonModal opens correctly
- [ ] No user team selected → selecting opponent does nothing (no errors)
- [ ] "Load Grid View" from MatchesPanel → navigates to week, selects opponent, shows highlights

### Mobile
- [ ] Select opponent → highlights appear (no compare button needed)
- [ ] Filter number buttons always visible (not dimmed)
- [ ] Deselect opponents → highlights clear

### Regression
- [ ] Favorites panel still shows team cards with select/deselect
- [ ] Select All / Deselect All buttons still work
- [ ] Team browser search/filter still works
- [ ] Compare toggle button is gone from all three locations
- [ ] No console errors referencing `isAutoMode` or `enableAutoMode`

---

## Performance Impact
**Zero.** The `team-selection-changed` listener was already firing and being checked. The only difference is removing the `if (!_autoMode)` guard — one fewer boolean check per event. Match calculation is pure JS on cached data (<5ms for 40 teams).

## Firestore Impact
**Zero additional reads.** Comparison runs entirely on cached availability data.
