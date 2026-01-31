# Slice 8.1: Reactive Comparison Mode + Shared Date Utilities

**Dependencies:** Slice 8.0 (Match Proposals), 3.4 (Comparison Engine)
**User Story:** As a team leader, I want comparison mode to update live as I select/deselect teams and change filters, so I don't have to manually activate/deactivate comparison each time.
**Success Criteria:**
- [ ] Comparison mode has an on/off toggle (not a one-shot action)
- [ ] When on: selecting/deselecting a team immediately recalculates comparison
- [ ] When on: changing min-vs-min filters immediately recalculates comparison
- [ ] When off: team selection and filter changes don't trigger comparison
- [ ] "Load Grid View" from MatchesPanel switches to Calendar tab, sets correct week, selects opponent, sets filters, and activates comparison
- [ ] All week-start calculations use a single shared `DateUtils.getMondayOfWeek()` utility
- [ ] No duplicate week calculation logic anywhere in the codebase

---

## Sub-slice 8.1a: Extract Shared DateUtils

### Problem
`getMondayOfWeek()` logic is duplicated in 5 places with 2 naming variations and 2 input format variations. This caused bug #4 during 8.0 testing (off-by-one-week in `_isSlotPast`).

### Current Duplication
| File | Function Name | Input Format |
|------|--------------|-------------|
| AvailabilityGrid.js:33-45 | `getMondayOfWeek(weekNumber)` | Number (e.g. `5`) |
| WeekDisplay.js:46-58 | `getMondayOfWeek(weekNumber)` | Number |
| ComparisonModal.js:28-41 | `_getRefDate(weekId)` | String `"YYYY-WW"` |
| OverflowModal.js:20-32 | `_getRefDate(weekId)` | String `"YYYY-WW"` |
| MatchesPanel.js:652-659 | inlined in `_isSlotPast()` | Year + week separate |

### Solution
Create `public/js/utils/DateUtils.js`:

```javascript
/**
 * Canonical week calculation for the entire app.
 * Week 1 = first full week starting Monday after Jan 1.
 *
 * @param {number|string} weekInput - Week number (5) or weekId string ("2026-05")
 * @param {number} [year] - Required if weekInput is a number
 * @returns {Date} UTC Monday 00:00 of that week
 */
export function getMondayOfWeek(weekInput, year) {
    let weekNumber;
    if (typeof weekInput === 'string') {
        const [y, w] = weekInput.split('-');
        year = parseInt(y);
        weekNumber = parseInt(w);
    } else {
        weekNumber = weekInput;
        if (!year) year = new Date().getUTCFullYear();
    }

    const jan1 = new Date(Date.UTC(year, 0, 1));
    const dayOfWeek = jan1.getUTCDay();
    const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));
    const monday = new Date(firstMonday);
    monday.setUTCDate(firstMonday.getUTCDate() + (weekNumber - 1) * 7);
    return monday;
}
```

### Migration
Replace all 5 duplications with imports from DateUtils. Each file changes from ~12 lines of inline calculation to a single function call.

---

## Sub-slice 8.1b: Reactive Comparison Mode

### Problem
Current UX requires: select teams → click Compare → view results → exit comparison → change selection → click Compare again. This felt natural in a slow Google Sheets app but feels clunky when everything else is live.

### Current Architecture (already close)
The event system is already wired:
- `team-selection-changed` fires on team toggle (from TeamBrowserState)
- `filter-changed` fires on min-vs-min change (from FilterPanel)
- `comparison-updated` fires when ComparisonEngine recalculates
- ComparisonEngine already listens to `filter-changed` and auto-recalculates

**What's missing:**
1. ComparisonEngine doesn't listen to `team-selection-changed`
2. No persistent "comparison mode on/off" toggle
3. The "Compare Now" button is a one-shot action, not a toggle

### Solution

**ComparisonEngine changes:**
- Add `_autoMode` flag (default: false)
- When `_autoMode` is true, listen to `team-selection-changed` events
- On team selection change: update `_opponentTeamIds` and recalculate
- On empty selection (0 teams): pause comparison (no highlights) but stay in auto mode
- On re-selection: resume comparison

**FavoritesPanel UI changes:**
- Replace "Compare Now" button with a toggle: "Compare: ON / OFF"
- When toggled ON: calls `ComparisonEngine.enableAutoMode(userTeamId)`
- When toggled OFF: calls `ComparisonEngine.stopComparison()`
- Toggle state persists while on Calendar tab
- Switching away from Calendar tab does NOT disable (comparison pauses naturally)

**Filter reactivity** - Already works. ComparisonEngine already listens to `filter-changed` and recalculates when comparison is active. No changes needed.

### UX Flow (After)
1. User is on Calendar tab, sees team list
2. Toggles "Compare: ON"
3. Clicks a team → grid immediately highlights matching slots
4. Clicks another team → highlights update for both opponents
5. Changes min 3v3 → highlights recalculate with stricter filter
6. Deselects a team → highlights update
7. Clicks a highlighted slot → ComparisonModal opens (unchanged)
8. Toggles "Compare: OFF" → all highlights clear

---

## Sub-slice 8.1c: Fix "Load Grid View" from MatchesPanel

### Problem
"Load Grid View" button in expanded proposal card is non-functional. The code exists ([MatchesPanel.js:604-623](public/js/components/MatchesPanel.js#L604-L623)) but fails silently.

### Investigation Needed
The handler calls:
1. `BottomPanelController.switchTab('calendar')` - switches tab
2. Dispatches `filter-changed` event - sets min-vs-min
3. `ComparisonEngine.startComparison()` - triggers comparison

Possible failure points:
- Tab switch might not complete before comparison starts
- Week navigation might not be on the proposal's week
- Team selection state might not include the opponent
- The handler may not have the correct proposal data in scope

### Expected Behavior
When clicking "Load Grid View" on a proposal card:
1. Switch to Calendar tab
2. Navigate to the proposal's week (if not already there)
3. Select the opponent team in the team browser
4. Set min-vs-min filters to match the proposal
5. Activate comparison mode (or auto-mode if 8.1b is done)
6. User sees the grid with the proposal's viable slots highlighted

### Integration with 8.1b
If reactive comparison (8.1b) is implemented first, Load Grid View just needs to:
1. Switch tab
2. Navigate to correct week
3. Select opponent team (auto-mode handles the rest)
4. Set filters

---

## Implementation Order
1. **8.1a first** - DateUtils extraction. Zero UX change, pure refactor, eliminates bug class.
2. **8.1c second** - Fix Load Grid View. Small scope, high user value.
3. **8.1b last** - Reactive comparison. Largest change, builds on 8.1a/c being stable.

## Files Affected
| File | 8.1a | 8.1b | 8.1c |
|------|------|------|------|
| `public/js/utils/DateUtils.js` | CREATE | - | - |
| `public/js/components/AvailabilityGrid.js` | MODIFY | - | - |
| `public/js/components/WeekDisplay.js` | MODIFY | - | - |
| `public/js/components/ComparisonModal.js` | MODIFY | - | - |
| `public/js/components/OverflowModal.js` | MODIFY | - | - |
| `public/js/components/MatchesPanel.js` | MODIFY | - | MODIFY |
| `public/js/services/ComparisonEngine.js` | - | MODIFY | - |
| `public/js/components/FavoritesPanel.js` | - | MODIFY | - |
| `functions/match-proposals.js` | MODIFY | - | - |

## Firestore Impact
**Zero additional reads.** All comparison logic runs on already-cached availability data. Reactive mode just re-runs `computeViableSlots()` (pure JS) more frequently.
