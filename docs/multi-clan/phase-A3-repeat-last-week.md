# Phase A3: Repeat Last Week

## Context

Users commonly have similar availability week-to-week. Currently they must manually re-select all their time slots each week. This phase adds a "Repeat Last Week" button that copies the user's Week 1 (current week) availability to Week 2 (next week) in one click.

Read `AVAILABILITY-ENHANCEMENT-CONTRACT.md` at the orchestrator level for the full contract.

**Prerequisite**: Phase A2 should be complete (same UI area), though this feature is functionally independent.

---

## What Changes

1. **New method in `AvailabilityService.js`**: `repeatLastWeek(teamId, sourceWeekId, targetWeekId)`
2. **New button in the Template modal/popover**: "Repeat Last Week → W2"
3. **Disabled state**: Button grayed out when user has no availability in the current week

---

## Files to Modify

### 1. `public/js/services/AvailabilityService.js`

Add a new method that reads the user's slots from one week and writes them to another:

```javascript
/**
 * Copy current user's availability from source week to target week.
 * Only adds slots — does not remove existing target week availability.
 * Skips slots where user is already present.
 *
 * @param {string} teamId
 * @param {string} sourceWeekId - e.g., "2026-09" (current week)
 * @param {string} targetWeekId - e.g., "2026-10" (next week)
 * @returns {Promise<{success: boolean, slotsCopied: number, error?: string}>}
 */
async function repeatLastWeek(teamId, sourceWeekId, targetWeekId) {
    const userId = window.firebase.auth.currentUser?.uid;
    if (!userId) return { success: false, slotsCopied: 0, error: 'Not signed in' };

    // Read source week
    const sourceDocId = `${teamId}_${sourceWeekId}`;
    // ... read source doc, extract all slot IDs where userId is in the array
    // ... for each slot, write arrayUnion(userId) to the target week doc
    // ... count how many were actually new (not already present)
}
```

**Implementation details:**
- Read `availability/{teamId}_{sourceWeekId}` doc
- Iterate `doc.data().slots` — collect all slot IDs where the user's UID is in the array
- If zero slots found, return `{ success: false, slotsCopied: 0, error: 'No availability to copy' }`
- Read `availability/{teamId}_{targetWeekId}` doc (may not exist yet)
- For each source slot: if user NOT already in target slot, add via `arrayUnion`
- Also remove user from `unavailable` for those slots in the target (mutual exclusion)
- Use a batched write for atomicity
- Return the count of slots that were actually new

**Note**: This does NOT need a Cloud Function — the user has write access to availability docs for their team. Use the Firebase client SDK directly (same pattern as other AvailabilityService methods).

### 2. `public/js/components/TemplatesModal.js`

Add the "Repeat Last Week → W2" button to the template modal UI. Place it between the template section and the "Clear Availability" button.

```html
<div class="border-t border-border pt-3">
    <button id="templates-repeat-btn"
            class="w-full px-3 py-2 text-sm rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            ${!hasCurrentWeekAvailability ? 'disabled title="No availability this week to copy"' : ''}>
        Repeat Last Week → W2
    </button>
</div>
```

**To check if user has current week availability:**
- Call `AvailabilityService` to check if the current user has any slots in the current week's availability doc
- Or use the cached availability data that the grid already has loaded
- The simplest approach: check if `AvailabilityGrid` reports any user slots for week 1

**Button handler:**
```javascript
async function _handleRepeatLastWeek() {
    const teamId = /* get from current team context */;
    const currentWeekId = /* current ISO week */;
    const nextWeekId = /* next ISO week */;

    const result = await AvailabilityService.repeatLastWeek(teamId, currentWeekId, nextWeekId);

    if (result.success) {
        ToastService.show(`Copied ${result.slotsCopied} slots to next week`, 'success');
        hide();
    } else {
        ToastService.show(result.error || 'Failed to copy', 'error');
    }
}
```

### 3. Mobile (`MobileBottomBar.js`)

Add the same "Repeat Last Week" button to the mobile template popup.

---

## Edge Cases

- **No availability in current week**: Button disabled, tooltip explains why
- **Target week already has some availability**: New slots are added, existing ones preserved (arrayUnion is additive)
- **User is marked "unavailable" for some slots in target week**: The copy should override unavailable status (remove from `unavailable`, add to `slots`) — same mutual exclusion as normal availability marking

---

## Verification

1. Mark availability for several days in Week 1
2. Click "Repeat Last Week → W2" in the template modal
3. Verify Week 2 grid shows the same availability
4. Verify toast shows correct slot count
5. Clear Week 1 availability → verify button becomes disabled
6. Mark partial availability in Week 2, then repeat → verify existing W2 slots are preserved and new ones added
7. Mobile: verify the button works in the bottom bar popup
