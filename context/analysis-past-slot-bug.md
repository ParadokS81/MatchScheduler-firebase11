# Past-Slot Hiding Bug — Analysis Report

## The Bug (Confirmed, Reproducible)

When a user has **extra timeslots** (outside the standard 18:00–23:00 CET evening window) AND is in a **timezone far from CET** (e.g., PST = UTC-8), past-slot hiding produces impossible results:

**Observed:** In the PST view of the grid, row "17:00" on Tuesday is marked past/hidden, while row "10:30" on Tuesday is NOT. This is logically impossible — 10:30 comes before 17:00.

## How the Grid Works

The grid is **CET-anchored**:
- **Day columns** = CET days (Mon–Sun), with calendar dates like "Mon 9th", "Tue 10th"
- **Time rows** = CET base times stored as HHMM strings (e.g., `'1930'`, `'0200'`)
- **Cell IDs** = `{day}_{cetTime}` (e.g., `tue_0200`, `tue_1930`)
- **Display labels** = converted to user's local timezone (e.g., CET `'0200'` → PST `"17:00"`)
- **Rows sorted** by local display time (so grid reads chronologically for the user)

### Extra timeslots
Users can add slots outside the base 18:00–23:00 CET range. These are stored in CET base format. Example from the bugged user (in PST):
- Added ranges: "17:00–19:00 (02:00–04:00 CET)" and "20:00–22:00 (05:00–07:00 CET)"
- Stored as CET base: `'0200'`, `'0230'`, `'0300'`, `'0330'`, `'0400'`, `'0500'`, `'0530'`, `'0600'`, `'0630'`, `'0700'`

## The Root Cause

### Old `_buildPastCells` logic (buggy):
```javascript
// For each cell: convert CET base time to UTC, compare with now
const cetTotalMin = hour * 60 + min;           // CET time from slot string
const utcTotalMin = cetTotalMin - baseOffsetMin; // CET→UTC (baseOffsetMin=60 in winter)
const cellDate = new Date(monday.getTime());
cellDate.setUTCDate(monday.getUTCDate() + d);   // d = day index in grid column
cellDate.setUTCHours(0, 0, 0, 0);
cellDate.setUTCMinutes(utcTotalMin);             // Set the UTC time
```

### Traced example for PST user, Tuesday column:

**Cell `tue_0200`** (CET Tue 02:00, displays as "17:00 PST"):
- cetTotalMin = 120, utcTotalMin = 120 - 60 = 60
- cellDate = **Tuesday 01:00 UTC**
- This is correct for CET: CET Tue 02:00 = UTC Tue 01:00

**Cell `tue_1930`** (CET Tue 19:30, displays as "10:30 PST"):
- cetTotalMin = 1170, utcTotalMin = 1170 - 60 = 1110
- cellDate = **Tuesday 18:30 UTC**

**If current time = Tuesday 10:00 UTC:**
- `tue_0200` (displayed as 17:00): Tue 01:00 UTC < Tue 10:00 UTC → **PAST** ✗
- `tue_1930` (displayed as 10:30): Tue 18:30 UTC > Tue 10:00 UTC → **NOT PAST** ✓

**Result: 17:00 is marked past, 10:30 is not.** Impossible from user's perspective.

### Why it happens:

CET Tue 02:00 = UTC Tue 01:00 = **PST Mon 17:00** (previous day!)

The grid shows this cell in the **Tuesday column** at **17:00**, but the real PST moment is **Monday 17:00**. The old code checks against the CET/UTC moment (Tuesday 01:00 UTC), which is much earlier than the base evening slots on the same CET Tuesday. The display order (sorted by local time) doesn't match the CET chronological order when day boundaries are crossed.

## The Fix

### New `_buildPastCells` logic:
Instead of using the CET base time → UTC conversion, use the **displayed local time** → UTC:

```javascript
// Get what the user SEES for this row
const localDisplay = TimezoneService.baseToLocalDisplay(time, monday); // e.g., "17:00"
const localHour = parseInt(localDisplay.split(':')[0]);
const localMin = parseInt(localDisplay.split(':')[1]);
const localTotalMin = localHour * 60 + localMin;

// Convert "displayed day d + local time" to UTC
const utcTotalMin = localTotalMin - userOffsetMin; // userOffsetMin, NOT baseOffsetMin
const cellDate = new Date(monday.getTime());
cellDate.setUTCDate(monday.getUTCDate() + d);
cellDate.setUTCHours(0, 0, 0, 0);
cellDate.setUTCMinutes(utcTotalMin);
```

### Same trace with the fix:

**Cell `tue_0200`** (displays as "17:00 PST"):
- localTotalMin = 1020, userOffsetMin = -480 (PST)
- utcTotalMin = 1020 - (-480) = 1500
- cellDate = Tue 00:00 UTC + 1500 min = **Wed 01:00 UTC** (= Tue 17:00 PST) ✓

**Cell `tue_1930`** (displays as "10:30 PST"):
- localTotalMin = 630, utcTotalMin = 630 - (-480) = 1110
- cellDate = **Tue 18:30 UTC** (= Tue 10:30 PST) ✓

**If current time = Tuesday 10:00 UTC (= Tuesday 02:00 PST):**
- `tue_0200` (17:00 PST): Wed 01:00 UTC > Tue 10:00 UTC → **NOT PAST** ✓
- `tue_1930` (10:30 PST): Tue 18:30 UTC > Tue 10:00 UTC → **NOT PAST** ✓

Both are in the future. Consistent! ✓

**If current time = Tuesday 20:00 UTC (= Tuesday 12:00 PST):**
- `tue_0200` (17:00 PST): Wed 01:00 UTC > Tue 20:00 UTC → **NOT PAST** ✓
- `tue_1930` (10:30 PST): Tue 18:30 UTC < Tue 20:00 UTC → **PAST** ✓

10:30 is past, 17:00 is not. Consistent! ✓

### CET user verification (no change):
For CET users: `userOffsetMin = 60` and `baseToLocalDisplay` returns the CET time unchanged.
- Old: `utcTotalMin = cetTotalMin - 60`
- New: `localTotalMin = cetTotalMin` (same value), `utcTotalMin = cetTotalMin - 60`
- **Identical results.** ✓

## Trade-off

The fix interprets cells as "column day + local display time" rather than "CET day + CET time." For cells where the local day ≠ CET day (early-morning CET in western timezones), this shifts the past threshold by ~24 hours relative to the CET moment.

**This is correct** because:
1. The grid DISPLAYS "Tuesday 17:00" — users expect it to go past when their Tuesday 17:00 passes
2. The actual availability data and match scheduling use UTC slot IDs, unaffected by past-cell visual treatment
3. Past-cell hiding is purely a visual/interaction convenience, not a data-integrity feature

## Files Changed

1. `public/js/components/AvailabilityGrid.js` — `_buildPastCells()` function (~lines 127–165)
2. `src/css/input.css` — Changed `visibility: hidden` to `opacity: 0.15` (line 1103) so past cells are dimmed instead of invisible

## Questions for Review

1. Is the "displayed day + displayed local time" interpretation correct for past-cell detection?
2. Are there edge cases with `baseToLocalDisplay` wrapping around midnight that could produce wrong local times?
3. Should we add a console log or debug tool to inspect past-cell calculations?
