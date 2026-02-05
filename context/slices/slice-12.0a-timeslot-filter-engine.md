# Slice 12.0a: Timeslot Filter Engine

**Dependencies:** TimezoneService (Slice 7.0), AvailabilityGrid (Slice 2.x)
**User Story:** As the foundation for editable timeslots, the system needs to support a dynamic set of visible time slots so that grids render only enabled slots and the layout adjusts proportionally.

---

## Scope

This slice builds the invisible engine — no UI yet. After this slice, dispatching a `timeslots-changed` event with hidden slots will cause both grids to rebuild with fewer rows and the top panel to shrink.

---

## Changes

### 1. TimezoneService.js — Hidden slots state

**File:** `public/js/services/TimezoneService.js`

Add private state and three new methods:

```js
let _hiddenTimeSlots = new Set();

function getVisibleTimeSlots() {
    if (_hiddenTimeSlots.size === 0) return DISPLAY_TIME_SLOTS;
    return DISPLAY_TIME_SLOTS.filter(s => !_hiddenTimeSlots.has(s));
}

function setHiddenTimeSlots(hiddenSlots) {
    const newHidden = new Set(
        hiddenSlots.filter(s => DISPLAY_TIME_SLOTS.includes(s))
    );
    if (DISPLAY_TIME_SLOTS.length - newHidden.size < 4) {
        console.warn('Cannot hide — minimum 4 slots must remain visible');
        return false;
    }
    _hiddenTimeSlots = newHidden;
    return true;
}

function getHiddenTimeSlots() {
    return Array.from(_hiddenTimeSlots);
}
```

Expose `getVisibleTimeSlots`, `setHiddenTimeSlots`, `getHiddenTimeSlots` in the return object.

### 2. AvailabilityGrid.js — Dynamic time slots

**File:** `public/js/components/AvailabilityGrid.js`

Replace the module-level `const TIME_SLOTS` (line 11-13) with a function:

```js
function _getTimeSlots() {
    return typeof TimezoneService !== 'undefined'
        ? TimezoneService.getVisibleTimeSlots()
        : ['1800','1830','1900','1930','2000','2030','2100','2130','2200','2230','2300'];
}
```

Replace **every** `TIME_SLOTS` reference inside `create()` with `_getTimeSlots()`. The affected callsites (search for `TIME_SLOTS` in file):
- `_render()` — row generation loop
- `_getCellsInRectangle()` — drag selection index lookup
- `_handleDayHeaderClick()` — column toggle iterates slots
- `_handleTimeHeaderClick()` — row toggle iterates slots
- `selectAll()` — all-cell selection
- `_buildUtcMaps()` — pass visible slots to map builders

**Important:** `_getTimeSlots()` is a module-level function (not inside `create()`), so all grid instances share the same visible set. This is correct — both week grids should show the same slots.

### 3. app.js — Event wiring + layout adjustment

**File:** `public/js/app.js`

Add a layout adjustment function:

```js
function _updateGridLayout() {
    const grid = document.querySelector('.main-grid-v3');
    if (!grid) return;
    const count = typeof TimezoneService !== 'undefined'
        ? TimezoneService.getVisibleTimeSlots().length
        : 11;
    grid.style.gridTemplateRows = `${count / 11}fr 3rem 1fr`;
}
```

Add `timeslots-changed` listener (place right after the existing `timezone-changed` listener at ~line 143):

```js
window.addEventListener('timeslots-changed', () => {
    _updateGridLayout();
    _weekDisplay1.rebuildGrid();
    _weekDisplay2.rebuildGrid();
    if (_selectedTeam) {
        _setupAvailabilityListeners(_selectedTeam.id);
    }
    _updateScheduledMatchHighlights();
});
```

Also call `_updateGridLayout()` at the end of `_initializeAvailabilityGrid()` so saved preferences (loaded in a later slice) apply on startup.

---

## Verification

After this slice, you can test via browser console:
```js
TimezoneService.setHiddenTimeSlots(['1800', '1830', '1900']);
window.dispatchEvent(new CustomEvent('timeslots-changed'));
```
Expected: both grids rebuild with 8 rows, top panel shrinks, bottom panel grows. Team data still populates correctly.

```js
TimezoneService.setHiddenTimeSlots([]);
window.dispatchEvent(new CustomEvent('timeslots-changed'));
```
Expected: back to 11 rows, 50/50 split restored.
