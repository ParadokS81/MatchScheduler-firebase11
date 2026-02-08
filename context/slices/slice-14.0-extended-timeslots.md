# Slice 14.0 — Extended Timeslot Support

## Overview

Allows users to add timeslots outside the base 18:00–23:00 CET window (e.g., 12:00–16:00 CET for NA/BR cross-region matches). The grid scrolls vertically when visible slots exceed the panel height. Per-user setting — does not affect teammates.

**Subslices:**
- **14.0a** — TimezoneService engine: `extraTimeSlots` state + modified `getVisibleTimeSlots()`
- **14.0b** — Scrollable grid: CSS overflow, min-height rows, auto-scroll to EU evening
- **14.0c** — Modal UI + persistence: "Add time range" section in Edit Timeslots modal, Firestore read/write

---

## Slice 14.0a — Extra Timeslot Engine

### 1. Slice Definition

- **Slice ID:** 14.0a
- **Name:** Extra Timeslot Engine
- **User Story:** As a player, my grid can display timeslots beyond the base EU evening range so that I can mark availability at non-standard hours
- **Success Criteria:** `TimezoneService.getVisibleTimeSlots()` returns base slots (minus hidden) PLUS any extra slots, sorted chronologically. All downstream consumers (grid rendering, UTC mapping, selection) work without changes.

### 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.1.1 Grid Structure: Extending the time slot range beyond 18:00-23:00

DEPENDENT SECTIONS:
- 4.1.4 Grid Tools: Timeslot filtering (Slice 12.0a foundation)

IGNORED SECTIONS:
- 4.1.2 Display Modes: No changes to team view / comparison
- 4.1.3 Selection: No changes to drag/shift/click (works automatically)
```

### 3. Full Stack Architecture

```
FRONTEND SERVICES:
- TimezoneService (public/js/services/TimezoneService.js)
  - New constant: ALL_HALF_HOUR_SLOTS (48 entries: '0000' through '2330')
  - New state: _extraTimeSlots = new Set()
  - New methods:
    - setExtraTimeSlots(slots: string[]): boolean
    - getExtraTimeSlots(): string[]
    - getAllHalfHourSlots(): string[]
  - Modified methods:
    - getVisibleTimeSlots(): returns sorted (base - hidden) ∪ extra

BACKEND REQUIREMENTS:
- Cloud Function: updateProfile (functions/user-profile.js)
  - Add extraTimeSlots to destructured params
  - Add validation: must be array of HHMM strings, each in ALL_HALF_HOUR_SLOTS range
  - Max array length: 37 (48 total minus 11 base = 37 possible extras)
  - Persist to /users/{userId}.extraTimeSlots

INTEGRATION POINTS:
- UserProfile._loadUserProfile() loads extraTimeSlots and calls TimezoneService.setExtraTimeSlots()
- Dispatches 'timeslots-changed' event (existing flow handles grid rebuild)
```

### 4. Integration Code Examples

```javascript
// TimezoneService — new constant
const ALL_HALF_HOUR_SLOTS = [];
for (let h = 0; h < 24; h++) {
    ALL_HALF_HOUR_SLOTS.push(String(h).padStart(2, '0') + '00');
    ALL_HALF_HOUR_SLOTS.push(String(h).padStart(2, '0') + '30');
}
// → ['0000', '0030', '0100', ..., '2300', '2330']

let _extraTimeSlots = new Set();

// TimezoneService — modified getVisibleTimeSlots()
function getVisibleTimeSlots() {
    // Base slots minus hidden
    let slots = DISPLAY_TIME_SLOTS.filter(s => !_hiddenTimeSlots.has(s));
    // Add extra slots (only those NOT in base range, to avoid duplicates)
    if (_extraTimeSlots.size > 0) {
        const extras = Array.from(_extraTimeSlots)
            .filter(s => !DISPLAY_TIME_SLOTS.includes(s));
        slots = slots.concat(extras);
    }
    // Sort chronologically by numeric value
    return slots.sort((a, b) => parseInt(a) - parseInt(b));
}

// TimezoneService — setExtraTimeSlots()
function setExtraTimeSlots(extraSlots) {
    const valid = new Set(
        extraSlots.filter(s => ALL_HALF_HOUR_SLOTS.includes(s))
    );
    _extraTimeSlots = valid;
    return true;
}

function getExtraTimeSlots() {
    return Array.from(_extraTimeSlots);
}

function getAllHalfHourSlots() {
    return ALL_HALF_HOUR_SLOTS;
}
```

```javascript
// UserProfile._loadUserProfile() — load extra timeslots
// (add after the existing hiddenTimeSlots block, ~line 179)
if (typeof TimezoneService !== 'undefined' && Array.isArray(_userProfile.extraTimeSlots)) {
    TimezoneService.setExtraTimeSlots(_userProfile.extraTimeSlots);
    window.dispatchEvent(new CustomEvent('timeslots-changed', {
        detail: { extraTimeSlots: _userProfile.extraTimeSlots }
    }));
}
```

```javascript
// functions/user-profile.js — validation for extraTimeSlots
// (add after hiddenTimeSlots validation block, ~line 276)
if (extraTimeSlots !== undefined) {
    if (!Array.isArray(extraTimeSlots)) {
        throw new functions.https.HttpsError('invalid-argument', 'extraTimeSlots must be an array');
    }
    const validPattern = /^([01]\d|2[0-3])(00|30)$/;
    for (const slot of extraTimeSlots) {
        if (!validPattern.test(slot)) {
            throw new functions.https.HttpsError('invalid-argument', `Invalid extra time slot: ${slot}`);
        }
    }
    if (extraTimeSlots.length > 37) {
        throw new functions.https.HttpsError('invalid-argument', 'Too many extra time slots');
    }
    updates.extraTimeSlots = extraTimeSlots;
}
```

### 5. Performance Classification

```
HOT PATHS (<50ms):
- getVisibleTimeSlots(): Array filter + concat + sort on max 48 items — instant
- buildGridToUtcMap(): Iterates visible slots × 7 days — max 336 entries — instant

COLD PATHS (<2s):
- setExtraTimeSlots persistence via updateProfile Cloud Function
- Only called when user saves in modal (14.0c)
```

### 6. Data Flow Diagram

```
App startup → UserProfile._loadUserProfile()
  → reads /users/{userId}.extraTimeSlots from Firestore
  → TimezoneService.setExtraTimeSlots(slots)
  → dispatch 'timeslots-changed' event
  → app.js listener: _updateGridLayout() + rebuildGrid()
  → AvailabilityGrid._getTimeSlots() returns expanded set
  → _buildUtcMaps() creates correct UTC mappings for all visible slots
  → _render() builds grid rows for all visible slots
```

### 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] getVisibleTimeSlots() returns base slots when no extras set
- [ ] getVisibleTimeSlots() includes extra slots sorted chronologically
- [ ] Extra slots that overlap base range are not duplicated
- [ ] setExtraTimeSlots() rejects invalid HHMM strings
- [ ] buildGridToUtcMap() includes extra slot UTC mappings
- [ ] buildUtcToGridMap() maps UTC back to extra slot grid positions
- [ ] _getTimeSlots() in AvailabilityGrid picks up extra slots

BACKEND TESTS:
- [ ] updateProfile accepts valid extraTimeSlots array
- [ ] updateProfile rejects non-array extraTimeSlots
- [ ] updateProfile rejects invalid HHMM patterns
- [ ] updateProfile rejects arrays longer than 37

INTEGRATION TESTS:
- [ ] Extra slots loaded from Firestore appear in grid on login
- [ ] 'timeslots-changed' event triggers grid rebuild with extra slots
- [ ] Availability written to extra slot UTC IDs persists correctly
- [ ] Existing hiddenTimeSlots still works alongside extraTimeSlots
```

### 8. Common Integration Pitfalls

- [ ] Forgetting to sort the combined array — grid row order would be wrong
- [ ] Not filtering duplicates between extra and base — would create duplicate grid rows
- [ ] Not rebuilding UTC maps after extra slots change — grid cells would have stale mappings
- [ ] Backend validation allowing slots outside 00:00-23:30 range

### 9. Implementation Notes

- `_updateGridLayout()` in app.js uses `getVisibleTimeSlots().length` to scale `gridTemplateRows`. With >11 slots, the top grid row fraction would exceed 1fr, making it taller than the bottom. This is addressed in 14.0b with the scroll approach — for 14.0a alone, the grid just gets taller rows (acceptable for testing).
- The `_getCellsInRectangle()` function uses `.indexOf()` on the sorted `_getTimeSlots()` array. This works correctly as long as the array is sorted, which `getVisibleTimeSlots()` guarantees.
- All 48 possible slots map cleanly to UTC via `_toUtcWithOffset()` — no changes needed in conversion logic.

---

## Slice 14.0b — Scrollable Grid

### 1. Slice Definition

- **Slice ID:** 14.0b
- **Name:** Scrollable Availability Grid
- **User Story:** As a player with extra timeslots, my grid scrolls vertically so that all slots are accessible without breaking the layout
- **Success Criteria:** Grid body scrolls when visible slots exceed threshold. Day headers stay pinned. Default scroll position shows EU evening window. Normal users (≤11 slots) see zero visual change.

### 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.1.1 Grid Structure: Grid must fit within sacred layout

DEPENDENT SECTIONS:
- Slice 14.0a: Extra timeslot engine provides expanded slot list
- Pillar 1 Section 3.2: Sacred 3×3 grid layout constraints

IGNORED SECTIONS:
- Mobile scroll (documented as future enhancement — touch-to-select conflicts)
```

### 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- AvailabilityGrid (public/js/components/AvailabilityGrid.js)
  - _render(): Add .scrollable class to .grid-body when slots > SCROLL_THRESHOLD
  - New: _scrollToDefaultPosition() — scrolls to EU evening row after render
  - Modified: _render() calls _scrollToDefaultPosition() when scrollable

- app.js
  - _updateGridLayout(): Modified to cap top grid row fraction at 1fr when extra slots present

FRONTEND CSS:
- src/css/input.css
  - New: .grid-body.scrollable rules (overflow-y: auto, scrollbar styling)
  - New: .grid-body.scrollable .grid-row rules (flex: 0 0 auto, min-height)
  - Existing .grid-body rules unchanged (no-scroll path preserved)

BACKEND REQUIREMENTS:
- None (pure frontend)

INTEGRATION POINTS:
- 14.0b depends on 14.0a (extra slots must be in getVisibleTimeSlots())
- 'timeslots-changed' event → rebuildGrid() → _render() applies scroll if needed
```

### 4. Integration Code Examples

```css
/* src/css/input.css — scrollable grid body */

.grid-body.scrollable {
    flex: 1;
    overflow-y: auto;
    min-height: 0;

    /* Thin scrollbar styling */
    scrollbar-width: thin;
    scrollbar-color: var(--muted-foreground) transparent;
}

.grid-body.scrollable::-webkit-scrollbar {
    width: 0.375rem;
}

.grid-body.scrollable::-webkit-scrollbar-track {
    background: transparent;
}

.grid-body.scrollable::-webkit-scrollbar-thumb {
    background-color: var(--muted-foreground);
    border-radius: 0.1875rem;
}

.grid-body.scrollable .grid-row {
    flex: 0 0 auto;       /* Don't flex — use fixed height */
    min-height: 2.5rem;   /* ~40px, matches natural 8-slot row height */
}
```

```javascript
// AvailabilityGrid._render() — add scrollable class conditionally
// (inside _render(), after building grid HTML)

const SCROLL_THRESHOLD = 11; // Same as base slot count

function _render() {
    if (!_container) return;
    _buildUtcMaps();

    const timeSlots = _getTimeSlots();
    const dayLabelsWithDates = getDayLabelsWithDates(_weekId);
    const refDate = DateUtils.getMondayOfWeek(_weekId);

    _container.innerHTML = `
        <div class="availability-grid-container">
            <div class="grid-header">
                <div class="time-label-spacer"></div>
                ${DAYS.map((day, idx) => `
                    <div class="day-header clickable" data-day="${day}">${dayLabelsWithDates[idx]}</div>
                `).join('')}
            </div>
            <div class="grid-body${timeSlots.length > SCROLL_THRESHOLD ? ' scrollable' : ''}">
                ${timeSlots.map(time => {
                    const displayTime = typeof TimezoneService !== 'undefined'
                        ? TimezoneService.baseToLocalDisplay(time, refDate)
                        : formatTime(time);
                    return `
                    <div class="grid-row">
                        <div class="time-label clickable" data-time="${time}">${displayTime}</div>
                        ${DAYS.map(day => {
                            const cellId = `${day}_${time}`;
                            const utcSlotId = _localToUtc(cellId);
                            return `<div class="grid-cell" data-cell-id="${cellId}" data-utc-slot="${utcSlotId}"></div>`;
                        }).join('')}
                    </div>
                `;}).join('')}
            </div>
        </div>
    `;

    _attachEventListeners();

    // Auto-scroll to EU evening window
    if (timeSlots.length > SCROLL_THRESHOLD) {
        _scrollToDefaultPosition();
    }
}
```

```javascript
// AvailabilityGrid — scroll to EU evening window
function _scrollToDefaultPosition() {
    const gridBody = _container?.querySelector('.grid-body');
    if (!gridBody) return;

    // Target: 19:30 CET (first "real action" slot for most EU users)
    // Falls back to first slot in base range if 1930 isn't visible
    const targetTime = '1930';
    const targetRow = gridBody.querySelector(`.time-label[data-time="${targetTime}"]`);

    if (targetRow) {
        const row = targetRow.closest('.grid-row');
        if (row) {
            // Scroll so target row is near the top of visible area
            gridBody.scrollTop = row.offsetTop - gridBody.offsetTop;
        }
    }
}
```

```javascript
// app.js — _updateGridLayout() modification
function _updateGridLayout() {
    const grid = document.querySelector('.main-grid-v3');
    if (!grid) return;

    const isMobile = window.matchMedia('(max-width: 1024px) and (orientation: landscape)').matches;
    if (isMobile) {
        grid.style.gridTemplateRows = '';
        return;
    }

    const count = typeof TimezoneService !== 'undefined'
        ? TimezoneService.getVisibleTimeSlots().length
        : 11;

    // Cap at 1fr — extra slots handled by scroll, not by making panel taller
    const fraction = Math.min(count / 11, 1);
    grid.style.gridTemplateRows = `${fraction}fr 3rem 1fr`;
}
```

### 5. Performance Classification

```
HOT PATHS (<50ms):
- Scroll: Native browser overflow — zero JS overhead
- _scrollToDefaultPosition(): Single DOM query + scrollTop assignment — instant

COLD PATHS:
- None — this subslice is pure rendering
```

### 6. Data Flow Diagram

```
timeslots-changed event (from 14.0a or 14.0c)
  → app.js: _updateGridLayout() — caps row fraction at 1fr
  → app.js: rebuildGrid()
    → AvailabilityGrid.cleanup() + init()
      → _render()
        → _getTimeSlots() returns 11+ slots
        → .grid-body gets .scrollable class
        → All rows rendered (including extra)
        → _scrollToDefaultPosition() → scrollTop to 1930 row
        → _attachEventListeners() — drag/click/hover work within scrollable container
```

### 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] ≤11 visible slots: .grid-body does NOT have .scrollable class
- [ ] >11 visible slots: .grid-body HAS .scrollable class
- [ ] Scrollable grid: day headers remain visible (pinned outside scroll container)
- [ ] Scrollable grid: default scroll position shows 19:30 CET row near top
- [ ] After week change: scroll position resets to default (19:30 row)
- [ ] _updateGridLayout() caps fraction at 1fr when extra slots present
- [ ] Grid rows have fixed min-height in scrollable mode (not squished)

INTERACTION TESTS:
- [ ] Click selection works in scrollable grid (above and below fold)
- [ ] Drag selection works across scroll boundary
- [ ] Shift+click selection works with scrolled grid
- [ ] Day header click selects full column (including scrolled-out rows)
- [ ] Time label click selects full row
- [ ] Overflow tooltip positions correctly for cells near scroll edge

VISUAL TESTS:
- [ ] Standard 8-slot user sees zero visual change
- [ ] 15-slot user: scrollbar appears, thin styling matches theme
- [ ] Scrollbar does not overlap grid cells
- [ ] Grid cells maintain proper aspect ratio in scroll mode
```

### 8. Common Integration Pitfalls

- [ ] Scroll position not restored after `rebuildGrid()` (week change, team switch)
- [ ] Drag selection broken when pointer moves outside scrollable area — `_handlePointerMove` uses `elementFromPoint` which works across scroll boundaries, but verify
- [ ] `_updateGridLayout()` making top panel taller than bottom when extra slots present — must cap at 1fr
- [ ] Mobile: accidentally enabling scroll where touch-to-select is primary interaction — skip `.scrollable` on mobile for v1
- [ ] Player tooltip positioning off when grid is scrolled — tooltip uses `getBoundingClientRect()` which returns viewport coords, so should be fine

### 9. Implementation Notes

- **Mobile exclusion**: On mobile (`max-width: 1024px`), do NOT add `.scrollable` class. Extra slots would just make rows thinner (same as having all 11 base slots visible). Mobile users with extra slots get a dense grid but no scroll — prevents touch-action conflict. Can revisit with two-finger-scroll in a future slice.
- **Drag across scroll**: `_handlePointerMove` already uses `document.elementFromPoint(e.clientX, e.clientY)` which works correctly regardless of scroll position. The main risk is auto-scrolling during drag (when dragging to a cell below the visible area). This is a nice-to-have, not required for v1 — user can scroll first, then drag.
- **Comparison mode**: `updateComparisonHighlights()` queries all `.grid-cell` elements by DOM — includes scrolled-out cells. No change needed.
- **Scheduled match labels**: `updateScheduledMatchHighlights()` also queries all cells — works regardless of scroll.

---

## Slice 14.0c — Modal UI + Persistence

### 1. Slice Definition

- **Slice ID:** 14.0c
- **Name:** Extended Timeslot Editor
- **User Story:** As a player, I can add and remove extra time ranges through the Edit Timeslots modal so that my grid shows non-standard hours
- **Success Criteria:** User can select a from/to time range (in their local timezone), add it, see extra slots appear in their grid, and have the preference persist across sessions.

### 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.1.4 Grid Tools: Extending the timeslot editor

DEPENDENT SECTIONS:
- Slice 14.0a: Extra timeslot engine
- Slice 14.0b: Scrollable grid (visual result of adding slots)
- Slice 12.0b: Existing timeslot modal (base to extend)

IGNORED SECTIONS:
- Game frequency data for extra slots (no data available outside EU evening)
```

### 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- GridActionButtons (public/js/components/GridActionButtons.js)
  - _showTimeslotsModal(): Enhanced with "Add extra timeslots" collapsible section
  - New: _renderExtraTimeslotsSection() — builds the add-range UI
  - New: _persistExtraTimeslots(extraSlots) — calls AuthService.updateProfile
  - Modified: Save button persists both hiddenTimeSlots AND extraTimeSlots

FRONTEND SERVICES:
- TimezoneService (from 14.0a): setExtraTimeSlots(), getExtraTimeSlots(), getAllHalfHourSlots()
- AuthService: updateProfile({ extraTimeSlots: [...] })

BACKEND REQUIREMENTS:
- updateProfile Cloud Function (from 14.0a): Already validates extraTimeSlots

INTEGRATION POINTS:
- Modal save → TimezoneService.setExtraTimeSlots() + AuthService.updateProfile()
- Dispatch 'timeslots-changed' → grid rebuilds with scroll (14.0b)
```

### 4. Integration Code Examples

```javascript
// GridActionButtons._showTimeslotsModal() — enhanced modal structure
// After the existing timeslot toggles div, before the footer:

function _buildExtraTimeslotsSection() {
    const currentExtras = TimezoneService.getExtraTimeSlots();
    const refDate = new Date();

    // Build dropdown options (all 48 half-hour slots in user's local time)
    // Exclude slots already in the base DISPLAY_TIME_SLOTS range
    const baseSet = new Set(TimezoneService.DISPLAY_TIME_SLOTS);
    const allSlots = TimezoneService.getAllHalfHourSlots();
    const availableSlots = allSlots.filter(s => !baseSet.has(s));

    const optionsHtml = availableSlots.map(slot => {
        const localDisplay = TimezoneService.baseToLocalDisplay(slot, refDate);
        return `<option value="${slot}">${localDisplay}</option>`;
    }).join('');

    // Group current extras into contiguous ranges for display
    const ranges = _groupSlotsIntoRanges(currentExtras);
    const rangesHtml = ranges.length > 0
        ? ranges.map(range => {
            const fromLocal = TimezoneService.baseToLocalDisplay(range.from, refDate);
            const toLocal = TimezoneService.baseToLocalDisplay(range.to, refDate);
            return `
                <div class="flex items-center justify-between py-1">
                    <span class="text-sm">${fromLocal} – ${toLocal}</span>
                    <button class="extra-range-remove text-muted-foreground hover:text-destructive text-xs px-1"
                            data-from="${range.from}" data-to="${range.to}">✕</button>
                </div>
            `;
        }).join('')
        : '<p class="text-xs text-muted-foreground">None added</p>';

    return `
        <div class="mt-3 border-t border-border pt-3">
            <button id="extra-timeslots-toggle" class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full text-left">
                <span class="extra-toggle-arrow">▸</span>
                <span>Add extra timeslots</span>
            </button>
            <div id="extra-timeslots-panel" class="hidden mt-2">
                <p class="text-xs text-muted-foreground mb-2">
                    Add slots outside the standard evening window.
                    Only you see these — other players are not affected.
                </p>
                <div class="flex items-center gap-2 mb-2">
                    <label class="text-xs text-muted-foreground">From</label>
                    <select id="extra-from" class="bg-input border border-border rounded text-sm px-2 py-1 flex-1">
                        ${optionsHtml}
                    </select>
                    <label class="text-xs text-muted-foreground">To</label>
                    <select id="extra-to" class="bg-input border border-border rounded text-sm px-2 py-1 flex-1">
                        ${optionsHtml}
                    </select>
                    <button id="extra-add-btn" class="btn-primary px-2 py-1 rounded text-xs">Add</button>
                </div>
                <div id="extra-ranges-list" class="mb-1">
                    ${rangesHtml}
                </div>
            </div>
        </div>
    `;
}
```

```javascript
// Group individual HHMM slots into contiguous ranges
// e.g., ['1200','1230','1300'] → [{ from: '1200', to: '1300' }]
function _groupSlotsIntoRanges(slots) {
    if (!slots || slots.length === 0) return [];

    const sorted = [...slots].sort((a, b) => parseInt(a) - parseInt(b));
    const ranges = [];
    let rangeStart = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const expected = _nextHalfHour(prev);
        if (sorted[i] === expected) {
            prev = sorted[i];
        } else {
            ranges.push({ from: rangeStart, to: prev });
            rangeStart = sorted[i];
            prev = sorted[i];
        }
    }
    ranges.push({ from: rangeStart, to: prev });
    return ranges;
}

// Get next half-hour slot (e.g., '1230' → '1300', '2330' → '0000')
function _nextHalfHour(slot) {
    let mins = parseInt(slot.slice(0, 2)) * 60 + parseInt(slot.slice(2));
    mins += 30;
    if (mins >= 1440) mins -= 1440;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return String(h).padStart(2, '0') + String(m).padStart(2, '0');
}
```

```javascript
// Expand a from/to range into individual HHMM slots
// e.g., ('1200', '1330') → ['1200', '1230', '1300', '1330']
function _expandRange(from, to) {
    const slots = [];
    let current = from;
    // Safety limit to prevent infinite loop (max 48 iterations)
    for (let i = 0; i < 48; i++) {
        slots.push(current);
        if (current === to) break;
        current = _nextHalfHour(current);
    }
    return slots;
}
```

```javascript
// Modal event wiring — inside _showTimeslotsModal()

// Toggle expand/collapse
modal.querySelector('#extra-timeslots-toggle')?.addEventListener('click', () => {
    const panel = modal.querySelector('#extra-timeslots-panel');
    const arrow = modal.querySelector('.extra-toggle-arrow');
    if (panel) {
        panel.classList.toggle('hidden');
        arrow.textContent = panel.classList.contains('hidden') ? '▸' : '▾';
    }
});

// Add range button
modal.querySelector('#extra-add-btn')?.addEventListener('click', () => {
    const from = modal.querySelector('#extra-from').value;
    const to = modal.querySelector('#extra-to').value;

    if (parseInt(from) > parseInt(to)) {
        ToastService.showError('From time must be before To time');
        return;
    }

    const newSlots = _expandRange(from, to);
    const currentExtras = TimezoneService.getExtraTimeSlots();
    const merged = [...new Set([...currentExtras, ...newSlots])];

    // Update in-memory state (persisted on modal Save)
    _pendingExtraSlots = merged;
    _refreshExtraRangesList(modal);
});

// Remove range buttons (delegated)
modal.querySelector('#extra-ranges-list')?.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.extra-range-remove');
    if (!removeBtn) return;

    const from = removeBtn.dataset.from;
    const to = removeBtn.dataset.to;
    const rangeSlots = new Set(_expandRange(from, to));
    const currentExtras = _pendingExtraSlots || TimezoneService.getExtraTimeSlots();
    _pendingExtraSlots = currentExtras.filter(s => !rangeSlots.has(s));
    _refreshExtraRangesList(modal);
});
```

```javascript
// Save handler — enhanced to persist both hidden and extra
modal.querySelector('#timeslots-save-btn').addEventListener('click', async () => {
    const saveBtn = modal.querySelector('#timeslots-save-btn');

    // Collect hidden slots (existing logic)
    const unchecked = [];
    checkboxes.forEach(cb => {
        if (!cb.checked) unchecked.push(cb.dataset.slot);
    });

    // Apply hidden slots
    const hiddenApplied = TimezoneService.setHiddenTimeSlots(unchecked);

    // Apply extra slots (if modified)
    const extraSlots = _pendingExtraSlots !== null
        ? _pendingExtraSlots
        : TimezoneService.getExtraTimeSlots();
    TimezoneService.setExtraTimeSlots(extraSlots);

    // Dispatch change event
    window.dispatchEvent(new CustomEvent('timeslots-changed', {
        detail: { hiddenTimeSlots: unchecked, extraTimeSlots: extraSlots }
    }));

    // Persist to Firestore
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        await _persistTimeslotPreferences(unchecked, extraSlots);
    } catch (error) {
        // Error handled inside persist function
    }
    closeModal();
});

// Combined persistence
async function _persistTimeslotPreferences(hiddenSlots, extraSlots) {
    try {
        if (typeof AuthService !== 'undefined') {
            await AuthService.updateProfile({
                hiddenTimeSlots: hiddenSlots,
                extraTimeSlots: extraSlots
            });
        }
    } catch (error) {
        console.error('Failed to save timeslot preferences:', error);
        if (typeof ToastService !== 'undefined') {
            ToastService.showError('Failed to save timeslot preferences');
        }
    }
}
```

### 5. Performance Classification

```
HOT PATHS (<50ms):
- Toggle expand/collapse: Pure CSS class toggle
- Add/Remove range in modal: In-memory array manipulation, DOM update
- Dropdown interactions: Native select elements

COLD PATHS (<2s):
- Save: AuthService.updateProfile() → Cloud Function → Firestore write
- Loading state: Save button shows "Saving..." during persistence
```

### 6. Data Flow Diagram

```
User opens Edit Timeslots modal
  → _showTimeslotsModal() renders base toggles + extra timeslots section
  → User expands "Add extra timeslots"
  → Selects From: 13:00, To: 16:00 (local time)
  → Clicks "Add"
    → _expandRange('1200', '1500') → ['1200','1230',...,'1500'] (CET times)
    → _pendingExtraSlots updated in memory
    → Range list refreshed in modal
  → User clicks "Save"
    → TimezoneService.setHiddenTimeSlots(unchecked)
    → TimezoneService.setExtraTimeSlots(extraSlots)
    → dispatch 'timeslots-changed'
      → app.js: _updateGridLayout() + rebuildGrid()
      → Grid re-renders with extra rows + scrollable
    → AuthService.updateProfile({ hiddenTimeSlots, extraTimeSlots })
      → Cloud Function validates + writes to /users/{userId}
    → Modal closes
```

### 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] "Add extra timeslots" section is collapsed by default
- [ ] Clicking toggle expands/collapses the section
- [ ] From/To dropdowns show times in user's local timezone
- [ ] Dropdowns exclude base range slots (1800-2300)
- [ ] "Add" creates correct CET slot array from local time range
- [ ] "Add" with From > To shows error toast
- [ ] Added range appears in active ranges list
- [ ] Remove button removes the correct range
- [ ] Multiple non-contiguous ranges can be added
- [ ] Duplicate slots are deduplicated on add

BACKEND TESTS:
- [ ] updateProfile accepts valid extraTimeSlots alongside hiddenTimeSlots
- [ ] Saved extraTimeSlots persists and loads correctly on next session

INTEGRATION TESTS:
- [ ] Save → grid immediately shows extra slots (no page refresh)
- [ ] Save → scroll to default position (EU evening visible)
- [ ] Save → availability data in extra slots is writeable (click cells, add me)
- [ ] Remove all extra ranges → Save → grid returns to base slots only
- [ ] Extra slots survive page refresh (loaded from Firestore on init)

END-TO-END TESTS:
- [ ] User adds 13:00-15:00 range, marks availability at 14:00 Tue, saves
- [ ] Refreshes page → extra slots visible, availability at 14:00 Tue persists
- [ ] User removes the range → 14:00 Tue availability still in Firestore but no longer visible in grid
```

### 8. Common Integration Pitfalls

- [ ] Local-to-CET conversion in dropdown: User selects "13:00 local" but we need to store the CET equivalent — use existing `baseToLocalDisplay()` in reverse, or store CET directly since dropdowns are populated from CET values
- [ ] _pendingExtraSlots not initialized on modal open — must start as null (meaning "unchanged") vs empty array (meaning "remove all")
- [ ] Forgetting to persist extraTimeSlots alongside hiddenTimeSlots — both should go in single updateProfile call
- [ ] Modal re-open after save: must read fresh state from TimezoneService, not stale closure
- [ ] Edge: user has extras from a previous session but they're no longer needed — "Remove" must work for previously-saved ranges

### 9. Implementation Notes

- **Dropdown values are CET times, labels are local times.** The `<option value="1200">` displays as the user's local equivalent via `baseToLocalDisplay('1200')`. This avoids a conversion step on save — we always store CET strings.
- **From/To wrapping across midnight:** If user selects From=23:00, To=02:00 local — this maps to CET times that might wrap. For v1, disallow From > To (simple numeric comparison on CET values). Midnight-crossing ranges are an edge case of an edge case — can be addressed later if needed.
- **No frequency data for extra slots.** The bars in the toggle section only exist for the base 11 slots. Extra slots added via the range picker don't get bars — that's fine since there's no EU 4on4 data for those times anyway.
- **The existing `_persistHiddenTimeslots()` function gets replaced** by the combined `_persistTimeslotPreferences()` that sends both fields in one call.

### 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Extra slot ranges cannot wrap across midnight (From must be < To numerically)
- **Rationale**: Simplifies validation significantly. A user needing 23:00-01:00 CET can add two ranges: 23:00-23:30 and 00:00-01:00
- **Alternative**: Support wrapping by splitting into two ranges internally

- **[ASSUMPTION]**: No hard cap on total visible slots beyond the natural 48 maximum
- **Rationale**: Nobody will add 37 extra slots. The UI naturally limits via range picker. Backend validates max 37 extras.
- **Alternative**: Cap at 24 total visible — rejected as unnecessary constraint

---

## Schema Changes Summary

```
/users/{userId}
  hiddenTimeSlots: string[] | null    // EXISTING — unchanged
  extraTimeSlots: string[] | null     // NEW — CET HHMM strings outside base range
                                      // Default: null (no extra slots)
                                      // Example: ['1200', '1230', '1300', '1330']
                                      // Max: 37 entries (48 total - 11 base)
                                      // Validated by updateProfile Cloud Function
```

## Implementation Order

1. **14.0a** — Engine changes (TimezoneService + backend validation + UserProfile loading)
2. **14.0b** — Scrollable grid (CSS + _render changes + auto-scroll)
3. **14.0c** — Modal UI (range picker + persistence)

Each subslice is independently testable. 14.0a can be verified by manually setting `extraTimeSlots` in Firestore. 14.0b can be verified by temporarily hardcoding extra slots. 14.0c completes the user-facing feature.

## Files Touched

| File | Subslice | Changes |
|------|----------|---------|
| `public/js/services/TimezoneService.js` | 14.0a | New constant, state, methods; modified `getVisibleTimeSlots()` |
| `functions/user-profile.js` | 14.0a | Add `extraTimeSlots` validation in `updateProfile` |
| `public/js/components/UserProfile.js` | 14.0a | Load `extraTimeSlots` on login |
| `context/SCHEMA.md` | 14.0a | Document new field |
| `src/css/input.css` | 14.0b | `.grid-body.scrollable` rules |
| `public/js/components/AvailabilityGrid.js` | 14.0b | Conditional `.scrollable` class, `_scrollToDefaultPosition()` |
| `public/js/app.js` | 14.0b | Cap `_updateGridLayout()` fraction at 1fr |
| `public/js/components/GridActionButtons.js` | 14.0c | Enhanced modal with range picker |
