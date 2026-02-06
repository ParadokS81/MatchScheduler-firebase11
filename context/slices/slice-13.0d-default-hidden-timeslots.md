# Slice 13.0d: Default Hidden Timeslots

**Dependencies:** Slice 12.0 (timeslot filtering)
**User Story:** As a new user, I want the grid to start with rarely-used timeslots hidden so I see a cleaner, more relevant view by default.

---

## Context: Layout Restructure (Slice 13.0)

This slice is independent but complements the layout restructure. By hiding the 3 least-used timeslots (18:00, 18:30, 19:00) by default:
- Top grid row shrinks to ~73% height (8/11 timeslots)
- Bottom grid gains ~27% more vertical space
- Team panel (after 13.0a/b changes) comfortably fits logo + roster

Combined with moving team name and grid tools out, this ensures the team panel works well even with a smaller top row.

---

## Scope

Change the default hidden timeslots from empty to `['1800', '1830', '1900']` for new users:
- 18:00, 18:30, 19:00 are hidden by default (combined <1% usage)
- Users with existing preferences keep their settings
- Users can still show these timeslots via Edit Timeslots modal

---

## Changes

### 1. TimezoneService.js — Update default hidden slots

**File:** `public/js/services/TimezoneService.js`

Change the initial `_hiddenTimeSlots` from empty to the default set:

```javascript
// Before
let _hiddenTimeSlots = new Set();

// After
const DEFAULT_HIDDEN_TIMESLOTS = ['1800', '1830', '1900'];
let _hiddenTimeSlots = new Set(DEFAULT_HIDDEN_TIMESLOTS);
```

Add a method to get default hidden slots:

```javascript
function getDefaultHiddenTimeSlots() {
    return DEFAULT_HIDDEN_TIMESLOTS;
}

// Export in return object
return {
    // ... existing exports ...
    getDefaultHiddenTimeSlots,
};
```

---

### 2. User Profile Loading — Respect saved preferences

**File:** `public/js/services/TimezoneService.js` or wherever preferences are loaded

When loading user preferences from Firestore, the existing `setHiddenTimeSlots()` will be called with their saved array. This already works correctly - saved preferences override defaults.

For users WITHOUT saved preferences (new users), they'll get the new default.

To ensure backwards compatibility, update the loading logic:

```javascript
// When loading user profile:
function loadUserPreferences(userProfile) {
    // Timezone
    if (userProfile.timezone) {
        setUserTimezone(userProfile.timezone);
    }

    // Hidden timeslots - only override default if user has saved preferences
    if (userProfile.hiddenTimeSlots !== undefined) {
        // User has explicitly saved preferences (even if empty array)
        setHiddenTimeSlots(userProfile.hiddenTimeSlots);
    }
    // else: keep the default hidden slots
}
```

---

### 3. Saving Preferences — Explicit empty array

When a user explicitly enables all timeslots (hides none), save an empty array to Firestore:

```javascript
// Already handled in Slice 12.0c, but verify:
async function saveHiddenTimeSlots(hiddenSlots) {
    // Save even if empty - this means user explicitly chose to show all
    await updateProfile({ hiddenTimeSlots: hiddenSlots });
}
```

This ensures:
- New user (no `hiddenTimeSlots` field): Gets default `['1800', '1830', '1900']`
- User who shows all (empty `hiddenTimeSlots: []`): Gets empty, showing all
- User with custom (e.g. `hiddenTimeSlots: ['1800', '2300']`): Gets their custom

---

## Data Migration

No migration needed. The default is applied client-side on load, not stored in Firestore.

Existing users who have never touched timeslot settings will suddenly see 3 fewer rows. This is acceptable because:
1. These timeslots have <1% combined usage
2. Users can easily re-enable them in Edit Timeslots modal
3. The change improves default UX for all new users

If this is concerning, we could add a one-time migration flag, but it's probably overkill.

---

## Verification

1. **New user (no account):** Grid shows 8 rows (1930-2300)
2. **New user (fresh account):** Grid shows 8 rows
3. **Existing user (no saved prefs):** Grid shows 8 rows (new default)
4. **Existing user (saved prefs):** Grid shows their configured rows
5. **User enables all slots:** Saving stores `[]`, shows 11 rows
6. **User reloads after enabling all:** Still shows 11 rows

---

## Test Scenarios

- [ ] Fresh browser/incognito shows 8 rows
- [ ] Signing in as new user shows 8 rows
- [ ] Signing in as user with saved `hiddenTimeSlots: []` shows 11 rows
- [ ] Signing in as user with saved `hiddenTimeSlots: ['1800']` shows 10 rows
- [ ] Edit Timeslots modal shows 18:00, 18:30, 19:00 as OFF by default
- [ ] Toggling ON a hidden slot and saving persists correctly
- [ ] Toggling all ON and saving stores empty array

---

## Grid Impact

With 8 visible timeslots instead of 11:
- Top grid row height: `8/11 = 72.7%` of original
- This gives ~27% more space to bottom grid
- Team panel (top-left) has 27% less height, which is why 13.0a-b are prerequisites

The combination of:
1. Moving team name out (13.0a)
2. Moving grid tools out (13.0b)
3. Fewer timeslots by default (13.0d)

Results in a team panel that comfortably fits logo + 6-7 roster members without scrolling.
