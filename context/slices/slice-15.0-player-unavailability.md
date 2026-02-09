# Slice 15.0 — Player Unavailability Marking

## 1. Slice Definition

- **Slice ID:** 15.0
- **Name:** Player Unavailability Marking
- **User Story:** As a team member, I can mark specific timeslots as "unavailable" (vacation, known conflicts) so that my teammates know I definitely cannot play, distinct from simply not having marked availability.
- **Success Criteria:** Player can select cells, click "Unavailable" action button, and those cells display a greyscale badge with red prohibition overlay. Tooltip shows who's away. Marking unavailable auto-removes availability in the same slots. Data persists and syncs in real-time.

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Availability Grid: New unavailability state per slot per player
- Grid Action Buttons: New "Unavailable" action in SelectionActionButton

DEPENDENT SECTIONS:
- Team Management: playerRoster for member lookup, leader/scheduler roles for on-behalf-of
- Authentication: User identity for self-marking, role checks for on-behalf-of

IGNORED SECTIONS:
- Team Comparison: Unavailability is internal team view only, does not affect comparison engine
- Match Proposals: Future expansion (leader off-limits slots) — out of scope for this slice
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- SelectionActionButton
  - Firebase listeners: none (uses GridActionButtons service)
  - Cache interactions: reads AvailabilityService cache to check current state
  - UI responsibilities: New "Unavailable" button row in floating action panel
  - User actions: Click "⊘ Me" to mark self unavailable, "⊘ Others →" flyout for on-behalf-of

- AvailabilityGrid
  - Firebase listeners: existing onSnapshot on availability/{teamId}_{weekId}
  - Cache interactions: reads unavailable map from same availability document
  - UI responsibilities: Render unavailable badges (greyscale + red prohibition overlay),
    separated from available badges with a visual gap
  - User actions: none new (rendering only)

- PlayerTooltip
  - Firebase listeners: none
  - Cache interactions: reads player display data
  - UI responsibilities: Show "Available" and "Away" sections separately in tooltip
  - User actions: hover to view

FRONTEND SERVICES:
- AvailabilityService:
  - markUnavailable(teamId, weekId, slotIds) → Cloud Function or dev direct write
  - removeUnavailable(teamId, weekId, slotIds) → Cloud Function or dev direct write
  - markPlayerUnavailable(teamId, weekId, slotIds, targetUserId) → on-behalf-of
  - removePlayerUnavailable(teamId, weekId, slotIds, targetUserId) → on-behalf-of
  - getSlotUnavailablePlayers(teamId, weekId, slotId) → from cache
  - isUserUnavailableInSlot(teamId, weekId, slotId, userId) → from cache

- GridActionButtons:
  - markMeUnavailable() → calls AvailabilityService.markUnavailable()
  - markOtherUnavailable(targetUserId) → calls AvailabilityService.markPlayerUnavailable()
  - unmarkMeUnavailable() → calls AvailabilityService.removeUnavailable()
  - unmarkOtherUnavailable(targetUserId) → calls AvailabilityService.removePlayerUnavailable()

BACKEND REQUIREMENTS:
⚠️ CLOUD FUNCTION UPDATE IN /functions/availability.js:
- Cloud Functions:
  - updateAvailability(params) — EXTEND existing function:
    - File: /functions/availability.js
    - New actions: "markUnavailable" and "removeUnavailable"
    - Purpose: Add/remove userId from unavailable map, auto-remove from slots if marking unavailable
    - Validation: same as existing (auth, team membership, on-behalf-of permissions)
    - Operations:
      - "markUnavailable": arrayUnion userId to unavailable.{slotId}, arrayRemove from slots.{slotId}
      - "removeUnavailable": arrayRemove userId from unavailable.{slotId}
    - Returns: { success: boolean, error?: "message" }

  NOTE: No new Cloud Function needed — extend updateAvailability with new action values.

- Firestore Operations:
  - Collection: /availability/{teamId}_{weekId}
  - New field: `unavailable` map (mirrors `slots` structure)
  - CRUD: arrayUnion/arrayRemove on unavailable.{slotId}
  - Mutual exclusion: marking unavailable auto-removes from slots (same slot)

- Security Rules:
  - Same rules as availability slots — team members can read, authenticated members can write own,
    leaders/schedulers can write for others
  - No new rules needed since we're using the same document and Cloud Function validation

- Event Logging:
  - Type: "unavailability_marked" / "unavailability_removed"
  - Details: { teamId, weekId, slotIds, targetUserId? }
  - Optional for v1 — can add later

- External Services: none

INTEGRATION POINTS:
- Frontend → Backend: AvailabilityService methods → updateAvailability Cloud Function (extended)
- API Contract:
  - Request: { teamId, weekId, action: "markUnavailable"|"removeUnavailable", slotIds, targetUserId? }
  - Success: { success: true }
  - Error: { success: false, error: "message" }
- Real-time listeners: existing onSnapshot on availability doc picks up unavailable field automatically
- Data flow: User selects cells → clicks "⊘ Me" → AvailabilityService.markUnavailable() →
  optimistic cache update → Cloud Function/dev write → Firestore update → onSnapshot fires →
  AvailabilityGrid re-renders with unavailable badges
```

---

## 4. Integration Code Examples

### 4a. Data Model — Availability Document (extended)

```javascript
// /availability/{teamId}_{weekId}
{
  teamId: "abc123",
  weekId: "2026-06",
  slots: {
    "mon_1800": ["user1", "user2"],  // available players
    "tue_2000": ["user3"]
  },
  // NEW: unavailable map — same structure as slots
  // FUTURE: Could store objects instead of strings for type/source metadata
  // e.g., [{ userId: "user4", type: "player" }] — but for now, simple string arrays
  unavailable: {
    "mon_1800": ["user4"],           // user4 explicitly cannot play this slot
    "wed_2100": ["user1", "user5"]   // user1 and user5 away this slot
  },
  lastUpdated: Timestamp
}
```

### 4b. AvailabilityService — New Methods

```javascript
// In AvailabilityService (add to existing module)

async function markUnavailable(teamId, weekId, slotIds) {
    const userId = window.firebase.auth.currentUser?.uid;
    if (!userId) return { success: false, error: 'Not authenticated' };

    const cacheKey = `${teamId}_${weekId}`;
    const rollbackData = _cache.has(cacheKey)
        ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
        : null;

    // Optimistic update: add to unavailable, remove from slots (mutual exclusion)
    const currentData = _cache.get(cacheKey) || { teamId, weekId, slots: {}, unavailable: {} };
    if (!currentData.unavailable) currentData.unavailable = {};
    if (!currentData.slots) currentData.slots = {};

    slotIds.forEach(slotId => {
        // Add to unavailable
        if (!currentData.unavailable[slotId]) currentData.unavailable[slotId] = [];
        if (!currentData.unavailable[slotId].includes(userId)) {
            currentData.unavailable[slotId].push(userId);
        }
        // Remove from available (mutual exclusion)
        if (currentData.slots[slotId]) {
            currentData.slots[slotId] = currentData.slots[slotId].filter(id => id !== userId);
        }
    });
    _cache.set(cacheKey, currentData);

    try {
        if (_isDevMode()) {
            // Direct Firestore write
            const { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp }
                = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

            const docRef = doc(_db, 'availability', cacheKey);
            const updateData = { lastUpdated: serverTimestamp() };

            slotIds.forEach(slotId => {
                updateData[`unavailable.${slotId}`] = arrayUnion(userId);
                updateData[`slots.${slotId}`] = arrayRemove(userId); // mutual exclusion
            });

            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                await setDoc(docRef, { teamId, weekId, slots: {}, unavailable: {}, lastUpdated: serverTimestamp() });
            }
            await updateDoc(docRef, updateData);
            return { success: true };
        }

        // Production: Cloud Function
        const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
        const updateFn = httpsCallable(_functions, 'updateAvailability');
        const result = await updateFn({ teamId, weekId, action: 'markUnavailable', slotIds });

        if (!result.data.success) throw new Error(result.data.error || 'Failed to mark unavailable');
        return { success: true };

    } catch (error) {
        if (rollbackData) _cache.set(cacheKey, rollbackData);
        else _cache.delete(cacheKey);
        console.error('Failed to mark unavailable:', error);
        return { success: false, error: error.message };
    }
}
```

### 4c. Cloud Function — Extended updateAvailability

```javascript
// In functions/availability.js — extend the action validation and handling

// Change validation line:
if (!['add', 'remove', 'markUnavailable', 'removeUnavailable'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument',
        'Action must be "add", "remove", "markUnavailable", or "removeUnavailable"');
}

// After existing slot update logic, add:
if (action === 'markUnavailable') {
    slotIds.forEach(slotId => {
        updateData[`unavailable.${slotId}`] = FieldValue.arrayUnion(effectiveUserId);
        // Mutual exclusion: remove from available
        updateData[`slots.${slotId}`] = FieldValue.arrayRemove(effectiveUserId);
    });
} else if (action === 'removeUnavailable') {
    slotIds.forEach(slotId => {
        updateData[`unavailable.${slotId}`] = FieldValue.arrayRemove(effectiveUserId);
    });
}
```

### 4d. GridActionButtons — New Handlers

```javascript
// In GridActionButtons — follow exact pattern of _handleAddMe / _handleRemoveMe

async function _handleMarkMeUnavailable() {
    const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
    if (!teamId) { ToastService.showError('Please select a team first'); return; }

    const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
    if (selectedCells.length === 0) return;
    if (_onSyncStart) _onSyncStart(selectedCells);

    try {
        const cellsByWeek = _groupCellsByWeek(selectedCells);
        for (const [weekId, slotIds] of Object.entries(cellsByWeek)) {
            const result = await AvailabilityService.markUnavailable(teamId, weekId, slotIds);
            if (!result.success) throw new Error(result.error);
        }
        if (_clearSelections) _clearSelections();
    } catch (error) {
        console.error('Mark unavailable failed:', error);
        ToastService.showError(error.message || 'Failed to mark unavailable');
    } finally {
        if (_onSyncEnd) _onSyncEnd();
    }
}
```

### 4e. SelectionActionButton — New Button Row

```javascript
// In SelectionActionButton._buildLayout() — add row between remove and escape rows

// For scheduler layout:
// Row 1: [+ Me]         [+ Others →]
// Row 2: [− Me]         [− Others →]
// Row 3: [⊘ Me]         [⊘ Others →]     ← NEW
// Row 4: [Escape]       [Template]

// For non-scheduler layout:
// Row 1: [+ Me]         [Template]
// Row 2: [− Me]         [Escape]
// Row 3: [⊘ Me]                           ← NEW (no "others" for non-schedulers)
```

### 4f. AvailabilityGrid — Badge Rendering

```javascript
// In AvailabilityGrid._renderPlayerBadges() — after rendering available badges

// Render unavailable players (greyscale + red prohibition overlay)
const unavailablePlayers = unavailableData?.[cellId] || [];
if (unavailablePlayers.length > 0) {
    // Add visual separator between available and unavailable clusters
    if (availablePlayers.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'unavailable-separator';
        badgeContainer.appendChild(separator);
    }

    unavailablePlayers.forEach(userId => {
        const badge = _createBadge(userId, playerRoster, currentUserId, displayMode);
        badge.classList.add('unavailable');
        // The CSS class handles greyscale + prohibition overlay
        badgeContainer.appendChild(badge);
    });
}
```

### 4g. CSS — Unavailable Badge Styling

```css
/* In src/css/input.css */

/* Separator between available and unavailable badge clusters */
.unavailable-separator {
    width: 1px;
    background-color: var(--border);
    margin: 0 0.125rem;
    align-self: stretch;
}

/* Unavailable badge: greyscale + red prohibition overlay */
.player-badge.unavailable {
    filter: grayscale(100%) opacity(0.6);
    position: relative;
}

/* Red prohibition circle+slash overlay */
.player-badge.unavailable::after {
    content: '';
    position: absolute;
    inset: -1px;
    border: 1.5px solid var(--destructive);
    border-radius: inherit;
    /* Diagonal line via gradient */
    background: linear-gradient(
        to top right,
        transparent calc(50% - 0.75px),
        var(--destructive) calc(50% - 0.75px),
        var(--destructive) calc(50% + 0.75px),
        transparent calc(50% + 0.75px)
    );
    pointer-events: none;
}

/* Smaller prohibition on small screens */
@media (max-height: 800px) {
    .player-badge.unavailable::after {
        border-width: 1px;
    }
}
```

### 4h. PlayerTooltip — Separated Sections

```javascript
// In PlayerTooltip.show() — split players into available and unavailable groups

const availableHtml = sortedAvailable.map(player => {
    // ... existing badge rendering
}).join('');

const awayHtml = sortedUnavailable.length > 0 ? `
    <div class="tooltip-divider"></div>
    <div class="tooltip-header tooltip-away-header">Away</div>
    <div class="tooltip-list">
        ${sortedUnavailable.map(player => `
            <div class="tooltip-player tooltip-away">
                <span class="tooltip-initials">${escapeHtml(player.initials)}</span>
                <span class="tooltip-name">${escapeHtml(player.displayName)}</span>
            </div>
        `).join('')}
    </div>
` : '';

_tooltip.innerHTML = `
    <div class="tooltip-header">${availableCount} available</div>
    <div class="tooltip-list">${availableHtml}</div>
    ${awayHtml}
`;
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Mark self unavailable: Optimistic cache update → instant UI feedback → async persist
- View unavailable badges: Rendered from cache, no fetch needed
- Tooltip hover: Reads from same cached availability data, no extra query

COLD PATHS (<2s):
- Mark other player unavailable: Same optimistic pattern, loading state on button
- Initial load: Unavailable data comes with existing availability document — no extra query

BACKEND PERFORMANCE:
- Cloud Function: Extends existing updateAvailability — no cold start impact
- Database: Same document, same listener — zero additional reads
- No new indexes needed (unavailable map uses same pattern as slots)
```

---

## 6. Data Flow Diagram

```
MARK SELF UNAVAILABLE:
Select cells → Click "⊘ Me" → SelectionActionButton._handleMeAction('unavailable')
→ GridActionButtons.markMeUnavailable() → AvailabilityService.markUnavailable(teamId, weekId, slotIds)
→ Optimistic: add to cache.unavailable, remove from cache.slots → UI updates instantly
→ Cloud Function: updateAvailability({ action: 'markUnavailable', ... })
→ Firestore: arrayUnion unavailable.{slot}, arrayRemove slots.{slot}
→ onSnapshot fires → AvailabilityService cache updated → AvailabilityGrid re-renders
→ Unavailable badges (greyscale + ⊘) appear, available badge removed

MARK OTHER UNAVAILABLE (leader/scheduler):
Select cells → Hover "⊘ Others →" → Roster flyout → Click player
→ GridActionButtons.markOtherUnavailable(targetUserId)
→ AvailabilityService.markPlayerUnavailable(teamId, weekId, slotIds, targetUserId)
→ Same flow as above with targetUserId parameter

REAL-TIME SYNC:
Another user marks unavailable → Firestore update → onSnapshot on availability doc
→ AvailabilityService cache updated (includes unavailable map)
→ AvailabilityGrid.updateTeamDisplay() called → _renderPlayerBadges() renders both clusters

TOOLTIP:
Hover cell with unavailable players → PlayerTooltip.show()
→ Reads available from slots, unavailable from unavailable map
→ Renders two sections: "X available" + "Away: ..."
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] "⊘ Me" button appears in SelectionActionButton when cells are selected
- [ ] "⊘ Others →" button appears for leaders/schedulers only
- [ ] Clicking "⊘ Me" triggers markUnavailable with correct slotIds
- [ ] Unavailable badges render with greyscale + red prohibition overlay
- [ ] Available and unavailable badges are visually separated
- [ ] Tooltip shows separate "Available" and "Away" sections
- [ ] Badge overflow logic handles mixed available + unavailable players
- [ ] "⊘ Me" button disabled when user already unavailable in all selected slots

BACKEND TESTS:
- [ ] Cloud Function accepts "markUnavailable" action
- [ ] Cloud Function accepts "removeUnavailable" action
- [ ] Marking unavailable auto-removes from available slots (mutual exclusion)
- [ ] Marking available auto-removes from unavailable slots (mutual exclusion)
- [ ] On-behalf-of requires leader/scheduler role
- [ ] Target must be team member
- [ ] Unauthenticated requests rejected
- [ ] Invalid slot formats rejected

INTEGRATION TESTS (CRITICAL):
- [ ] Mark unavailable → badge appears with correct styling in real-time
- [ ] Mark unavailable → availability badge disappears from same slot
- [ ] Mark available on unavailable slot → unavailable badge disappears
- [ ] Other team members see unavailable badges via real-time listener
- [ ] Error from backend → cache rolls back → UI reverts
- [ ] Optimistic update shows immediately, confirmed by listener

END-TO-END TESTS:
- [ ] Full journey: select cells → mark unavailable → see badges → hover tooltip → unmark
- [ ] Leader marks player unavailable on their behalf
- [ ] Cross-week unavailability (slots spanning multiple weeks)
- [ ] Multiple players unavailable in same slot
```

---

## 8. Common Integration Pitfalls

- [ ] **Mutual exclusion not enforced**: Marking unavailable MUST also remove from available (both in optimistic update AND Cloud Function)
- [ ] **Cache missing unavailable field**: Existing cached availability docs won't have `unavailable` — default to empty object `{}`
- [ ] **Listener not picking up new field**: Existing onSnapshot already gets full document — unavailable map comes free. But rendering code must read it.
- [ ] **Overflow count wrong**: Badge overflow (4+ players) must count available and unavailable separately. Available players get priority for visible badge slots.
- [ ] **"Ready for match" threshold**: The purple highlight (4+ players) must only count available players, NOT unavailable ones.
- [ ] **Marking available doesn't clear unavailable**: When using existing "Add Me" on a slot where user is unavailable, must also remove from unavailable.
- [ ] **Loading states**: "⊘ Me" button should show "Marking..." during operation, same as existing pattern.
- [ ] **CSS specificity**: The `.unavailable` class must work across all display modes (initials, colored initials, dots, avatars). `filter: grayscale(100%)` handles this universally.

---

## 9. Implementation Notes

### Gotchas
- **Existing addMeToSlots/addPlayerToSlots must also remove unavailable**: When marking someone available, if they were previously marked unavailable in that slot, the unavailable entry must be cleaned up. This is the reverse side of mutual exclusion. Extend the existing `add` action in the Cloud Function to also do `arrayRemove` on `unavailable.{slotId}`.
- **Empty unavailable arrays**: After removing the last user from an unavailable slot, an empty array remains. This is fine (sparse storage pattern) — the rendering code should handle `[]` gracefully.
- **Badge sort order**: Within the unavailable cluster, maintain same sort order as available (current user first, then alphabetical).

### Future Expansion Notes
```
// FUTURE: The unavailable field currently stores simple userId arrays:
//   unavailable: { "mon_1800": ["userId1", "userId2"] }
//
// When expanding to support different unavailability types (leader blocks,
// team-level restrictions, proposal off-limits), migrate to object arrays:
//   unavailable: { "mon_1800": [
//     { userId: "userId1", type: "player", reason: "vacation" },
//     { userId: "userId2", type: "leader", setBy: "leaderId" }
//   ]}
//
// For proposal off-limits, could use a team-level marker:
//   unavailable: { "mon_1800": [
//     { type: "team", reason: "playoff_conflict", setBy: "leaderId" }
//   ]}
//
// The current simple array approach is intentional — keeps it lean for the
// common case (player self-reported) and the migration path is straightforward.
```

### Similar Patterns
- **On-behalf-of availability** (Slice 2.8): Same permission model, same targetUserId parameter, same flyout roster pattern. Unavailability on-behalf-of is identical.
- **Display modes** (Slice 5.0.1): The greyscale+overlay CSS approach means we don't need mode-specific rendering — `filter: grayscale(100%)` works universally on any badge type.

### Dependencies
- Existing `SelectionActionButton` layout must accommodate a 3rd row (for schedulers, 4th row total)
- Existing `updateAvailability` Cloud Function extended — backwards compatible (new action values)
- No new collections, no new Cloud Functions, no new listeners — minimal infrastructure change
