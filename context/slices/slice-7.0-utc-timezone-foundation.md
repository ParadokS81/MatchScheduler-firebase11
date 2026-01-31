# Slice 7.0: UTC Timezone Foundation

**Dependencies:** Core grid working (Slice 2.x complete)
**User Story:** As a player in any timezone, I want the grid to show my local evening times while storing availability in UTC, so cross-timezone comparison works correctly and scheduled games can be served via API.
**Success Criteria:**
- [ ] All slot IDs in Firestore are UTC-based
- [ ] Grid displays local time labels (18:00-23:00 in user's timezone)
- [ ] User clicking "21:00 CET" stores `mon_2000` (UTC) in Firestore
- [ ] User clicking "21:00 EST" stores `tue_0200` (UTC) with day wrapping
- [ ] ComparisonEngine matches work correctly across timezones
- [ ] Week IDs computed from UTC (all users see same week boundaries)
- [ ] User document has `timezone` field (IANA string)
- [ ] Timezone auto-detected from browser on first use
- [ ] Timezone selector UI in grid panel header
- [ ] DST handled automatically via IANA + Intl API
- [ ] Templates store UTC slot IDs
- [ ] Modals (ComparisonModal, OverflowModal) display times in user's timezone
- [ ] Seed script generates UTC-based slot data

---

## Problem Statement

The current system has no timezone concept. Slot IDs like `mon_2100` are implicitly CET. This causes:
1. **Cross-timezone bugs** - Two users in different timezones write to different week documents for the same calendar moment
2. **Comparison failures** - `mon_1900` in EST and `mon_1900` in CET are treated as the same time (they're not)
3. **API blocker** - Can't serve scheduled game times to external consumers without UTC
4. **NA community excluded** - Grid only makes sense for CET users

Real-world data analysis (QWHub 4on4 data, 6 months, 2,447 team games) confirms the 18:00-23:00 local evening window captures 98% of self-scheduled matches across all timezones. No "grid modes" needed - evenings are evenings everywhere.

---

## Solution

1. **Slot IDs remain `day_time` format but represent UTC** - `mon_2000` = Monday 20:00 UTC (displays as 21:00 CET, 15:00 EST). Self-documenting, no lookup tables.
2. **New `TimezoneService.js`** - Central conversion logic: local↔UTC slot mapping, offset calculation via Intl API, DST-aware.
3. **IANA timezones** - Store `"Europe/Stockholm"` not `UTC+1`. Browser `Intl.DateTimeFormat` handles DST automatically.
4. **Grid unchanged visually** - CET users still see 18:00-23:00. The UTC conversion layer is invisible.
5. **Validation opens up** - Cloud Functions accept any hour (00-23) since different timezones map to different UTC hours.

---

## Sub-slice Breakdown

### Slice 7.0a: TimezoneService + Schema + Backend
- Create `TimezoneService.js` with all conversion logic
- Add `timezone` field to user document schema
- Update Cloud Function validation regex (both files)
- Update seed script for UTC-based slots
- Update `SCHEMA.md` documentation

### Slice 7.0b: Grid UTC Integration
- AvailabilityGrid uses TimezoneService for slot conversion
- Time labels show local time, store/load UTC
- Day wrapping handled in grid rendering
- WeekNavigation/WeekDisplay use UTC for week calculation
- ComparisonModal + OverflowModal format times via user timezone

### Slice 7.0c: Timezone Selector UI
- Dropdown in grid panel upper-right (near week nav)
- IANA timezone picker grouped by EU/NA/Other
- Auto-detect default from browser
- Persists to user document in Firestore
- Shows abbreviation (e.g., "CET", "EST")

---

## Schema Changes

### User document additions (`/users/{userId}`)
```typescript
// New field
timezone: string;           // IANA timezone, e.g., "Europe/Stockholm"
                           // Default: auto-detected from browser on first login
                           // Used for: grid display conversion, slot UTC mapping
```

### Availability document - no structural change
```typescript
// Slot IDs are now explicitly UTC
// mon_2000 = Monday 20:00 UTC
slots: {
  [slotId: string]: string[]  // Same format, UTC semantics
}
```

### Slot ID format (unchanged format, new semantics)
```
{day}_{time}  where day = mon|tue|wed|thu|fri|sat|sun, time = HHMM in UTC
Examples: mon_2000 (Monday 20:00 UTC), tue_0200 (Tuesday 02:00 UTC)
```

### Validation regex update
```javascript
// OLD: Only allowed 18-23 (CET hours)
const validSlotPattern = /^(mon|tue|wed|thu|fri|sat|sun)_(18|19|20|21|22|23)(00|30)$/;

// NEW: Allow any hour 00-23 (different timezones map to different UTC hours)
const validSlotPattern = /^(mon|tue|wed|thu|fri|sat|sun)_(0[0-9]|1[0-9]|2[0-3])(00|30)$/;
```

---

## Architecture: TimezoneService.js

New service following Revealing Module Pattern. No Firebase dependency - pure logic.

```
Location: public/js/services/TimezoneService.js
Pattern: Revealing Module (IIFE)
Dependencies: None (uses browser Intl API)
```

### Key Methods

```javascript
const TimezoneService = (function() {
    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DISPLAY_TIME_SLOTS = [
        '1800', '1830', '1900', '1930', '2000',
        '2030', '2100', '2130', '2200', '2230', '2300'
    ];

    let _userTimezone = null;  // IANA string

    function init(timezone) {
        _userTimezone = timezone || detectTimezone();
    }

    function detectTimezone() {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    // Get offset in minutes using Intl API (DST-aware)
    function getOffsetMinutes(date = new Date()) {
        // Compare UTC vs local date parts via Intl.DateTimeFormat
        // Returns e.g., +60 for CET, -300 for EST
    }

    // LOCAL → UTC: User clicks "mon 21:00" in CET → stores "mon_2000"
    function localToUtcSlot(localDay, localTime, refDate) {
        // Subtract offset, handle day wrapping
        // Returns { day, time, slotId }
    }

    // UTC → LOCAL: Firestore has "mon_2000" → display "21:00" for CET user
    function utcToLocalSlot(utcDay, utcTime, refDate) {
        // Add offset, handle day wrapping
        // Returns { day, time, displayTime }
    }

    // Build full grid mapping for one week
    function buildGridToUtcMap(refDate) {
        // Returns Map<localCellId, utcSlotId>
        // e.g., "mon_1800" → "mon_1700" for CET
    }

    function buildUtcToGridMap(refDate) {
        // Reverse of above
        // e.g., "mon_1700" → "mon_1800" for CET
    }

    // Format UTC slot for display: "mon_2000" → "Monday at 21:00"
    function formatSlotForDisplay(utcSlotId, refDate) {
        // Returns { dayLabel, timeLabel, fullLabel }
    }

    // Timezone UI helpers
    function getTimezoneAbbreviation(date) { }  // "CET", "EST"
    function getTimezoneLabel(date) { }          // "CET (UTC+1)"
    function getTimezoneOptions() { }            // Grouped picker data

    return { init, detectTimezone, getUserTimezone, setUserTimezone,
             getOffsetMinutes, getOffsetHours, localToUtcSlot, utcToLocalSlot,
             getDisplayTimeSlots, getUtcSlotsForDay, buildGridToUtcMap,
             buildUtcToGridMap, formatSlotForDisplay, getTimezoneAbbreviation,
             getTimezoneLabel, getTimezoneOptions, DAYS, DISPLAY_TIME_SLOTS };
})();
```

---

## AvailabilityGrid Changes (7.0b)

### Current flow (implicit CET):
```
User clicks cell → cellId = "mon_2100" → write to Firestore as "mon_2100"
Load from Firestore → "mon_2100" → render in grid row "21:00"
```

### New flow (UTC-aware):
```
User clicks cell → localCellId = "mon_2100"
  → TimezoneService.localToUtcSlot('mon', '2100', weekDate)
  → utcSlotId = "mon_2000"
  → write to Firestore as "mon_2000"

Load from Firestore → utcSlotId = "mon_2000"
  → TimezoneService.utcToLocalSlot('mon', '2000', weekDate)
  → localCellId = "mon_2100"
  → render in grid row "21:00"
```

### Key changes in AvailabilityGrid.js:

1. **Remove hardcoded TIME_SLOTS** - Use `TimezoneService.getDisplayTimeSlots()` instead
2. **`formatTime()`** - Still formats display slots (no change, they're already local)
3. **Cell click handling** - Convert local cell ID to UTC before passing to AvailabilityService
4. **`updateTeamDisplay()`** - Map incoming UTC slot data to local grid positions using `buildUtcToGridMap()`
5. **`getSelectedCells()`** - Return UTC slot IDs (convert from local cell IDs)
6. **Day header selection** - Toggle all UTC slots for that local day
7. **Time header selection** - Toggle all UTC slots for that local time row

### Grid construction changes:
```javascript
// OLD: cells use "mon_2100" as both display and storage ID
// NEW: cells use "mon_2100" as data-cell-id (display position)
//      but carry data-utc-slot="mon_2000" for storage

function _buildGrid(weekNumber) {
    const refDate = getMondayOfWeek(weekNumber);
    const gridToUtc = TimezoneService.buildGridToUtcMap(refDate);

    // Time labels: still DISPLAY_TIME_SLOTS (local times)
    // Cell IDs: still local (for CSS grid positioning)
    // Each cell gets data-utc-slot attribute for storage mapping
    DAYS.forEach(day => {
        TimezoneService.getDisplayTimeSlots().forEach(time => {
            const localCellId = `${day}_${time}`;
            const utcSlotId = gridToUtc.get(localCellId);
            // cell.dataset.cellId = localCellId;
            // cell.dataset.utcSlot = utcSlotId;
        });
    });
}
```

### Loading availability data:
```javascript
function updateTeamDisplay(availabilityData, playerRoster) {
    const refDate = getMondayOfWeek(_weekId);
    const utcToGrid = TimezoneService.buildUtcToGridMap(refDate);

    const slots = availabilityData?.slots || {};
    for (const [utcSlotId, userIds] of Object.entries(slots)) {
        const localCellId = utcToGrid.get(utcSlotId);
        if (!localCellId) continue;  // Slot outside our display range
        // Render player badges in the cell at localCellId
    }
}
```

---

## WeekNavigation/WeekDisplay Changes (7.0b)

### WeekNavigation.js
```javascript
// OLD: Uses new Date() (browser local time)
function _calculateCurrentWeekNumber() {
    const now = new Date();
    // ... calculates from local date
}

// NEW: Use UTC date components
function _calculateCurrentWeekNumber() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const jan1Day = jan1.getUTCDay();
    // ... same logic but using UTC methods
}
```

### WeekDisplay.js
```javascript
// OLD: getMondayOfWeek uses local Date
// NEW: getMondayOfWeek uses UTC Date

function getMondayOfWeek(weekNumber) {
    const year = new Date().getUTCFullYear();
    const jan1 = new Date(Date.UTC(year, 0, 1));
    // ... same logic but Date.UTC throughout
}
```

---

## Modal Changes (7.0b)

### ComparisonModal.js
```javascript
// OLD:
function _formatSlot(slotId) {
    const [day, time] = slotId.split('_');
    const formattedTime = `${time.slice(0, 2)}:${time.slice(2)}`;
    return `${dayNames[day]} at ${formattedTime}`;
}

// NEW:
function _formatSlot(utcSlotId, refDate) {
    const display = TimezoneService.formatSlotForDisplay(utcSlotId, refDate);
    return display.fullLabel;  // "Monday at 21:00" (in user's timezone)
}
```

### OverflowModal.js
Same pattern - use `TimezoneService.formatSlotForDisplay()`.

---

## Timezone Selector UI (7.0c)

### Location
Upper-right corner of the availability grid panel, near the week navigation arrows.

### Visual Design
```
┌──────────────────────────────────────────────────────────────────┐
│  ◄  2026  Week 5  Feb 2 - Feb 8  ►                  CET ▾     │
│                                                                  │
│        Mon 2nd   Tue 3rd   Wed 4th   ...                        │
│ 18:00  ●●        ●●        ●●                                  │
│ 18:30  ●●                                                       │
│ ...                                                              │
└──────────────────────────────────────────────────────────────────┘

Dropdown expanded:
┌─────────────────────────┐
│ Europe                  │
│   London (GMT/BST)      │
│   Stockholm (CET/CEST)  │  ◄ selected
│   Berlin (CET/CEST)     │
│   Helsinki (EET/EEST)   │
│   Moscow (MSK)          │
│ North America           │
│   New York (EST/EDT)    │
│   Chicago (CST/CDT)     │
│   Los Angeles (PST/PDT) │
└─────────────────────────┘
```

### Behavior
1. Auto-detect timezone from browser on first load (no timezone in user doc yet)
2. Show abbreviation button (e.g., "CET") - clicking opens dropdown
3. Selecting a timezone:
   - Updates `TimezoneService.setUserTimezone()`
   - Persists to user document in Firestore (`timezone` field)
   - Rebuilds grid mapping (new UTC↔local maps)
   - Re-renders grid with new time labels (same data, different display)
4. The grid data does NOT change when switching timezone - it's already UTC in Firestore

### CSS
```css
/* Add to src/css/input.css - Slice 7.0c */
.tz-selector {
    position: relative;
}

.tz-selector-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    padding: 0.25rem 0.5rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
}

.tz-selector-btn:hover {
    color: var(--text-primary);
    border-color: var(--text-secondary);
}

.tz-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 50;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.5rem 0;
    min-width: 14rem;
    max-height: 20rem;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tz-dropdown-region {
    padding: 0.25rem 0.75rem;
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
}

.tz-dropdown-item {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
}

.tz-dropdown-item:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
}

.tz-dropdown-item.active {
    color: var(--primary);
}
```

---

## Display Range Table

The grid always shows 11 slots (18:00-23:00 local). UTC backing varies by timezone:

| Local display | UTC (CET winter, +1) | UTC (CEST summer, +2) | UTC (GMT, +0) | UTC (EST, -5) |
|---|---|---|---|---|
| 18:00 | 17:00 | 16:00 | 18:00 | 23:00 |
| 18:30 | 17:30 | 16:30 | 18:30 | 23:30 |
| 19:00 | 18:00 | 17:00 | 19:00 | 00:00 (+1d) |
| 19:30 | 18:30 | 17:30 | 19:30 | 00:30 (+1d) |
| 20:00 | 19:00 | 18:00 | 20:00 | 01:00 (+1d) |
| 20:30 | 19:30 | 18:30 | 20:30 | 01:30 (+1d) |
| 21:00 | 20:00 | 19:00 | 21:00 | 02:00 (+1d) |
| 21:30 | 20:30 | 19:30 | 21:30 | 02:30 (+1d) |
| 22:00 | 21:00 | 20:00 | 22:00 | 03:00 (+1d) |
| 22:30 | 21:30 | 20:30 | 22:30 | 03:30 (+1d) |
| 23:00 | 22:00 | 21:00 | 23:00 | 04:00 (+1d) |

**(+1d)** = day wraps to next day in UTC storage.

---

## Seed Script Changes

```javascript
// OLD: Slots are CET times directly
const TIME_SLOTS = ['1800', '1830', '1900', ...];

// NEW: Generate UTC slots for CET test users (offset -1 in winter)
// CET 18:00 = UTC 17:00, CET 23:00 = UTC 22:00
const UTC_TIME_SLOTS = ['1700', '1730', '1800', '1830', '1900',
                         '1930', '2000', '2030', '2100', '2130', '2200'];
```

After seed, re-seed emulator: `npm run seed:emulator`

---

## Performance Classification

### HOT PATHS (<50ms)
- `TimezoneService.localToUtcSlot()` - Pure arithmetic, instant
- `TimezoneService.utcToLocalSlot()` - Pure arithmetic, instant
- `TimezoneService.buildGridToUtcMap()` - 77 slot conversions, instant
- Grid cell click → UTC conversion → optimistic update
- Timezone selector toggle (show/hide dropdown)

### COLD PATHS (<2s)
- Timezone change → grid re-render (rebuilds maps, re-renders all cells)
- Timezone preference save to Firestore (background, non-blocking)

---

## Data Flow

```
USER CLICKS CELL
    │
    ▼
AvailabilityGrid: localCellId = "mon_2100"
    │
    ▼
TimezoneService.localToUtcSlot('mon', '2100', weekDate)
    │ (CET user, offset +1)
    ▼
utcSlotId = "mon_2000"
    │
    ▼
AvailabilityService.addMeToSlots(teamId, weekId, ["mon_2000"])
    │
    ▼
Firestore: availability/{teamId}_{weekId}.slots.mon_2000 = [..., userId]
    │
    ▼
onSnapshot listener fires
    │
    ▼
AvailabilityGrid.updateTeamDisplay(data)
    │
    ▼
TimezoneService.buildUtcToGridMap(weekDate)
    │ maps "mon_2000" → "mon_2100"
    ▼
Render player badge in cell "mon_2100" (row 21:00, col Monday)
```

---

## Test Scenarios

- [ ] CET user: grid shows 18:00-23:00, clicking 21:00 Mon stores `mon_2000`
- [ ] Verify Firestore data shows UTC slot IDs (check emulator UI)
- [ ] Change timezone to GMT: grid still shows 18:00-23:00, 21:00 Mon now stores `mon_2100`
- [ ] Change timezone to EST: 21:00 Mon stores `tue_0200` (day wrap!)
- [ ] Load existing UTC data: dots appear in correct local grid positions
- [ ] Two browsers, different timezones: same user's dot appears at same UTC slot
- [ ] Week navigation: all timezones show same week number and date range
- [ ] DST test: set system clock to summer, verify offset shifts by 1h
- [ ] ComparisonModal shows times in user's local timezone
- [ ] OverflowModal shows times in user's local timezone
- [ ] Template apply: template slot IDs are UTC, applied correctly
- [ ] Timezone selector: opens, shows grouped list, selection persists
- [ ] Timezone auto-detect: new user gets browser timezone by default
- [ ] Seed data: fresh seed → grid displays correctly for CET user

---

## Common Integration Pitfalls

- [ ] Don't forget to pass `refDate` for DST-correct offset (use Monday of displayed week)
- [ ] Day header click must convert ALL local time slots for that day to UTC
- [ ] Time row header click must convert that time for ALL 7 local days to UTC
- [ ] Drag selection must collect UTC slot IDs, not local cell IDs
- [ ] When switching timezone, don't reload data - just rebuild the display maps
- [ ] Templates already store UTC - don't double-convert when applying
- [ ] Week boundaries in UTC mean the "Monday" in Firestore is always UTC Monday
- [ ] ComparisonEngine needs no changes - it already compares slot ID strings

---

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/js/services/TimezoneService.js` | **Create** | Central timezone utility (7.0a) |
| `context/SCHEMA.md` | Modify | Add timezone field, document UTC semantics (7.0a) |
| `functions/availability.js` | Modify | Update validation regex line 46 (7.0a) |
| `functions/templates.js` | Modify | Update validation regex line 9 (7.0a) |
| `scripts/seed-emulator.js` | Modify | UTC-based slot generation (7.0a) |
| `public/js/components/AvailabilityGrid.js` | Modify | UTC conversion layer, grid mapping (7.0b) |
| `public/js/components/WeekNavigation.js` | Modify | UTC week calculation (7.0b) |
| `public/js/components/WeekDisplay.js` | Modify | UTC week dates (7.0b) |
| `public/js/components/ComparisonModal.js` | Modify | Display times via TimezoneService (7.0b) |
| `public/js/components/OverflowModal.js` | Modify | Display times via TimezoneService (7.0b) |
| `public/index.html` | Modify | Load TimezoneService.js script (7.0a), TZ selector markup (7.0c) |
| `src/css/input.css` | Modify | TZ selector styles (7.0c) |

---

## Quality Checklist

- [ ] All Firestore slot IDs are UTC
- [ ] No hardcoded CET assumptions remain in codebase
- [ ] `TIME_SLOTS` constant only exists in TimezoneService (single source of truth)
- [ ] Intl API used for offset (no manual DST tables)
- [ ] Day wrapping tested for negative offsets (EST) and positive offsets (Moscow)
- [ ] Week boundaries identical across all timezones
- [ ] Grid visually unchanged for CET users
- [ ] Emulator data re-seeded with UTC slots
