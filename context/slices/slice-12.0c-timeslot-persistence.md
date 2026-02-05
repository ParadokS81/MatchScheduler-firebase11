# Slice 12.0c: Timeslot Preference Persistence

**Dependencies:** Slice 12.0a (engine), Slice 12.0b (modal calls `_persistHiddenTimeslots`)
**User Story:** As a user, I want my hidden timeslot preferences saved to my account so they persist across devices and sessions.

---

## Scope

Add `hiddenTimeSlots` field to user document, validate in backend, load on frontend init. The modal (12.0b) already calls `AuthService.updateProfile({ hiddenTimeSlots })` — this slice makes that actually work.

---

## Changes

### 1. functions/user-profile.js — Backend validation

**File:** `functions/user-profile.js`

In `updateProfile` function:

**Add to destructuring** (line ~185):
```js
const { displayName, initials, discordUsername, discordUserId, avatarSource, photoURL, timezone, hiddenTimeSlots } = data;
```

**Add to `hasAnyField` check** (line ~188):
```js
const hasAnyField = displayName || initials ||
    discordUsername !== undefined || discordUserId !== undefined ||
    avatarSource !== undefined || photoURL !== undefined ||
    timezone !== undefined || hiddenTimeSlots !== undefined;
```

**Add validation block** (after the timezone block, ~line 259):
```js
// Handle hiddenTimeSlots update (Slice 12.0c)
if (hiddenTimeSlots !== undefined) {
    if (!Array.isArray(hiddenTimeSlots)) {
        throw new HttpsError('invalid-argument', 'hiddenTimeSlots must be an array');
    }
    const validSlots = ['1800', '1830', '1900', '1930', '2000', '2030', '2100', '2130', '2200', '2230', '2300'];
    for (const slot of hiddenTimeSlots) {
        if (!validSlots.includes(slot)) {
            throw new HttpsError('invalid-argument', `Invalid time slot: ${slot}`);
        }
    }
    if (hiddenTimeSlots.length > 7) {
        throw new HttpsError('invalid-argument', 'At least 4 time slots must remain visible');
    }
    updates.hiddenTimeSlots = hiddenTimeSlots;
}
```

**Note:** This field is user-only — does NOT propagate to team rosters, so no changes to the transaction's team-update logic.

### 2. UserProfile.js — Load on init

**File:** `public/js/components/UserProfile.js`

After the timezone loading block (~line 164), add:

```js
// Load hidden timeslots preference (Slice 12.0c)
if (typeof TimezoneService !== 'undefined' && _userProfile.hiddenTimeSlots) {
    const applied = TimezoneService.setHiddenTimeSlots(_userProfile.hiddenTimeSlots);
    if (applied) {
        window.dispatchEvent(new CustomEvent('timeslots-changed', {
            detail: { hiddenTimeSlots: _userProfile.hiddenTimeSlots }
        }));
    }
}
```

### 3. SCHEMA.md — Document new field

**File:** `context/SCHEMA.md`

Add to the UserDocument interface (after `timezone`):

```
hiddenTimeSlots    string[] | null    Array of HHMM time slots to hide, e.g. ["1800", "1830"]
                                      Default: null (all 11 slots visible)
                                      Max 7 hidden (min 4 must remain visible)
```

---

## Verification

1. Set some hidden timeslots via modal → save → refresh page
2. Grids should load with the saved hidden slots already applied
3. Check Firestore emulator UI: user document should have `hiddenTimeSlots` array field
4. Clear hidden slots (enable all) → save → refresh → all 11 slots visible
5. Test with a fresh user (no `hiddenTimeSlots` field) → defaults to all 11 visible
