# Slice 2.2: Personal Availability Setting

## 1. Slice Definition
- **Slice ID:** 2.2
- **Name:** Personal Availability Setting
- **User Story:** As a team member, I can add or remove myself from selected time slots so that my teammates know when I'm available to play
- **Success Criteria:** User can select slots, click "Add Me" to mark themselves available, see instant UI feedback with subtle sync indicator, and have changes persist to Firebase with real-time updates to other team members

## 2. PRD Mapping
```
PRIMARY SECTIONS:
- 4.1.3 Selection Mechanics: Single click to select/deselect cells (multi-select methods deferred to 2.3)
- 4.1.5 Performance Requirements: Adding/removing self must be instant (optimistic updates)

DEPENDENT SECTIONS:
- 5.1 Hot Paths: Availability updates < 50ms (optimistic)
- 5.3 Data Caching Strategy: Pre-load availability data
- 5.4 Real-time Update Architecture: Direct component listeners
- 5.6 Event Logging: Not required for availability changes (no audit trail needed per PRD)

IGNORED SECTIONS (for this slice):
- 4.1.3 Multi-select methods (drag, shift+click, header clicks) - comes in slice 2.3
- 4.1.4 Grid Tools Panel (templates, select all, display toggle) - comes in slice 2.4
- 4.1.2 Player initials/avatars in slots - comes in slice 2.5 (Team View Display)
```

## 3. Full Stack Architecture
```
FRONTEND COMPONENTS:
- AvailabilityGrid (ENHANCED)
  - Firebase listeners: onSnapshot for /availability/{teamId}_{weekId}
  - Cache interactions: Reads from AvailabilityService cache, updates cache on listener events
  - UI responsibilities:
    - Existing: Render grid, handle cell selection
    - NEW: Display sync indicator (shimmer) during Firebase writes
    - NEW: Show current user's availability state visually
    - NEW: Rollback UI on failed writes
  - User actions: Single-click to select/deselect cells (existing)

- GridActionButtons (NEW)
  - Firebase listeners: none (stateless UI)
  - Cache interactions: none
  - UI responsibilities:
    - Floating action buttons near grid: [Add Me] [Remove Me]
    - Disable buttons when no cells selected
    - Show loading state during operations
  - User actions:
    - Click "Add Me" → adds user to all selected slots
    - Click "Remove Me" → removes user from selected slots where present

FRONTEND SERVICES:
- AvailabilityService (NEW)
  - Cache: Map<string, AvailabilityDoc> keyed by "{teamId}_{weekId}"
  - Methods:
    - init() → Initialize service
    - loadWeekAvailability(teamId, weekId) → Load from cache or Firebase
    - addMeToSlots(teamId, weekId, slotIds) → Optimistic update + Firebase
    - removeMeFromSlots(teamId, weekId, slotIds) → Optimistic update + Firebase
    - updateCache(teamId, weekId, data) → Called by listeners
    - getSlotPlayers(teamId, weekId, slotId) → Get player list for slot
    - isUserInSlot(teamId, weekId, slotId, userId) → Check if user in slot
    - cleanup() → Clear listeners and cache

BACKEND REQUIREMENTS:
⚠️ CLOUD FUNCTIONS TO IMPLEMENT IN /functions/availability.js:

- Cloud Functions:
  - updateAvailability({ teamId, weekId, action, slotIds }):
    - File: /functions/availability.js
    - Purpose: Add or remove user from time slots
    - Validation:
      - User must be authenticated
      - User must be member of the team
      - SlotIds must be valid format (day_time)
      - WeekId must be valid (not in past, within 4-week window)
    - Operations:
      - action="add": arrayUnion user to each slot
      - action="remove": arrayRemove user from each slot
      - Update lastUpdated timestamp
    - Returns: { success: true } or { success: false, error: "message" }

- Function Exports Required:
  // In /functions/index.js add:
  const { updateAvailability } = require('./availability');
  exports.updateAvailability = updateAvailability;

- Firestore Operations:
  - Collection: /availability/{teamId}_{weekId}
  - Document structure:
    {
      teamId: string,
      weekId: string,  // ISO week: "2026-05"
      slots: {
        "mon_1800": ["userId1", "userId2"],
        "mon_1830": ["userId1"],
        // ... slots with player arrays
      },
      lastUpdated: Timestamp
    }
  - Operations: arrayUnion/arrayRemove for atomic slot updates

- Security Rules:
  match /availability/{docId} {
    // Anyone authenticated can read (for comparison features)
    allow read: if request.auth != null;

    // Only Cloud Functions can write (validated server-side)
    allow write: if false;
  }

- Authentication/Authorization:
  - Cloud Function validates user is team member before allowing updates
  - Checks team roster in /teams/{teamId} document

- Event Logging:
  - NOT REQUIRED for availability changes per PRD
  - Availability is high-frequency, low-audit-value data

INTEGRATION POINTS:
- Frontend → Backend: AvailabilityService.addMeToSlots() → updateAvailability Cloud Function
- Real-time listeners: AvailabilityGrid subscribes to /availability/{teamId}_{weekId}
- Cache update flow: Firebase change → onSnapshot → AvailabilityService.updateCache() → Grid re-render
```

## 4. Integration Code Examples

### AvailabilityService (NEW)
```javascript
// AvailabilityService.js - Availability data management
const AvailabilityService = (function() {
    'use strict';

    let _initialized = false;
    let _db = null;
    let _functions = null;
    let _cache = new Map(); // Key: "{teamId}_{weekId}", Value: availability doc
    let _listeners = new Map(); // Key: "{teamId}_{weekId}", Value: unsubscribe fn

    async function init() {
        if (_initialized) return;

        if (typeof window.firebase === 'undefined') {
            setTimeout(init, 100);
            return;
        }

        _db = window.firebase.db;
        _functions = window.firebase.functions;
        _initialized = true;
        console.log('📅 AvailabilityService initialized');
    }

    // Load availability for a team/week (cache-first)
    async function loadWeekAvailability(teamId, weekId) {
        const cacheKey = `${teamId}_${weekId}`;

        // Return from cache if available
        if (_cache.has(cacheKey)) {
            return _cache.get(cacheKey);
        }

        // Load from Firebase
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

        const docRef = doc(_db, 'availability', cacheKey);
        const docSnap = await getDoc(docRef);

        const data = docSnap.exists()
            ? { id: docSnap.id, ...docSnap.data() }
            : { id: cacheKey, teamId, weekId, slots: {} };

        _cache.set(cacheKey, data);
        return data;
    }

    // Subscribe to real-time updates for a team/week
    async function subscribe(teamId, weekId, callback) {
        const cacheKey = `${teamId}_${weekId}`;

        // Don't duplicate listeners
        if (_listeners.has(cacheKey)) {
            return;
        }

        const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

        const docRef = doc(_db, 'availability', cacheKey);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            const data = docSnap.exists()
                ? { id: docSnap.id, ...docSnap.data() }
                : { id: cacheKey, teamId, weekId, slots: {} };

            _cache.set(cacheKey, data);
            callback(data);
        }, (error) => {
            console.error('Availability listener error:', error);
        });

        _listeners.set(cacheKey, unsubscribe);
    }

    // Unsubscribe from a team/week
    function unsubscribe(teamId, weekId) {
        const cacheKey = `${teamId}_${weekId}`;
        const unsub = _listeners.get(cacheKey);
        if (unsub) {
            unsub();
            _listeners.delete(cacheKey);
        }
    }

    // Add current user to slots (optimistic update)
    async function addMeToSlots(teamId, weekId, slotIds) {
        const userId = window.firebase.auth.currentUser?.uid;
        if (!userId) throw new Error('Not authenticated');

        const cacheKey = `${teamId}_${weekId}`;

        // Capture rollback state
        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update
        const currentData = _cache.get(cacheKey) || { teamId, weekId, slots: {} };
        slotIds.forEach(slotId => {
            if (!currentData.slots[slotId]) {
                currentData.slots[slotId] = [];
            }
            if (!currentData.slots[slotId].includes(userId)) {
                currentData.slots[slotId].push(userId);
            }
        });
        _cache.set(cacheKey, currentData);

        // Call Cloud Function
        try {
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const updateFn = httpsCallable(_functions, 'updateAvailability');

            const result = await updateFn({
                teamId,
                weekId,
                action: 'add',
                slotIds
            });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to update availability');
            }

            return { success: true };

        } catch (error) {
            // Rollback on failure
            if (rollbackData) {
                _cache.set(cacheKey, rollbackData);
            } else {
                _cache.delete(cacheKey);
            }
            console.error('Failed to add availability:', error);
            return { success: false, error: error.message };
        }
    }

    // Remove current user from slots (optimistic update)
    async function removeMeFromSlots(teamId, weekId, slotIds) {
        const userId = window.firebase.auth.currentUser?.uid;
        if (!userId) throw new Error('Not authenticated');

        const cacheKey = `${teamId}_${weekId}`;

        // Capture rollback state
        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update
        const currentData = _cache.get(cacheKey);
        if (currentData) {
            slotIds.forEach(slotId => {
                if (currentData.slots[slotId]) {
                    currentData.slots[slotId] = currentData.slots[slotId]
                        .filter(id => id !== userId);
                }
            });
            _cache.set(cacheKey, currentData);
        }

        // Call Cloud Function
        try {
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const updateFn = httpsCallable(_functions, 'updateAvailability');

            const result = await updateFn({
                teamId,
                weekId,
                action: 'remove',
                slotIds
            });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to update availability');
            }

            return { success: true };

        } catch (error) {
            // Rollback on failure
            if (rollbackData) {
                _cache.set(cacheKey, rollbackData);
            }
            console.error('Failed to remove availability:', error);
            return { success: false, error: error.message };
        }
    }

    // Get players in a specific slot
    function getSlotPlayers(teamId, weekId, slotId) {
        const cacheKey = `${teamId}_${weekId}`;
        const data = _cache.get(cacheKey);
        return data?.slots?.[slotId] || [];
    }

    // Check if user is in a slot
    function isUserInSlot(teamId, weekId, slotId, userId) {
        const players = getSlotPlayers(teamId, weekId, slotId);
        return players.includes(userId);
    }

    // Get cached data directly
    function getCachedData(teamId, weekId) {
        return _cache.get(`${teamId}_${weekId}`);
    }

    // Cleanup
    function cleanup() {
        _listeners.forEach(unsub => unsub());
        _listeners.clear();
        _cache.clear();
        console.log('🧹 AvailabilityService cleaned up');
    }

    return {
        init,
        loadWeekAvailability,
        subscribe,
        unsubscribe,
        addMeToSlots,
        removeMeFromSlots,
        getSlotPlayers,
        isUserInSlot,
        getCachedData,
        cleanup
    };
})();

document.addEventListener('DOMContentLoaded', AvailabilityService.init);
```

### GridActionButtons Component (NEW)
```javascript
// GridActionButtons.js - Floating Add Me / Remove Me buttons
const GridActionButtons = (function() {
    'use strict';

    let _container = null;
    let _getSelectedCells = null; // Callback to get selected cells from grids
    let _clearSelections = null;  // Callback to clear selections after action
    let _onSyncStart = null;      // Callback when sync starts (for shimmer)
    let _onSyncEnd = null;        // Callback when sync ends

    function _render() {
        if (!_container) return;

        _container.innerHTML = `
            <div class="grid-action-buttons flex gap-2 p-2 bg-card border border-border rounded-lg shadow-md">
                <button id="add-me-btn"
                        class="btn-primary px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled>
                    Add Me
                </button>
                <button id="remove-me-btn"
                        class="btn-secondary px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled>
                    Remove Me
                </button>
            </div>
        `;

        _attachListeners();
    }

    function _attachListeners() {
        const addBtn = document.getElementById('add-me-btn');
        const removeBtn = document.getElementById('remove-me-btn');

        addBtn?.addEventListener('click', _handleAddMe);
        removeBtn?.addEventListener('click', _handleRemoveMe);
    }

    async function _handleAddMe() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        const addBtn = document.getElementById('add-me-btn');
        addBtn.disabled = true;
        addBtn.textContent = 'Adding...';

        // Notify sync start (triggers shimmer on cells)
        if (_onSyncStart) _onSyncStart(selectedCells);

        try {
            // Group cells by week
            const cellsByWeek = _groupCellsByWeek(selectedCells);

            // Get current team (from app state)
            const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
            if (!teamId) throw new Error('No team selected');

            // Process each week
            for (const [weekId, slotIds] of Object.entries(cellsByWeek)) {
                const result = await AvailabilityService.addMeToSlots(teamId, weekId, slotIds);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            // Clear selections on success
            if (_clearSelections) _clearSelections();

            ToastService.showSuccess('Added to selected slots!');

        } catch (error) {
            console.error('Add me failed:', error);
            ToastService.showError(error.message || 'Failed to add availability');
        } finally {
            addBtn.disabled = false;
            addBtn.textContent = 'Add Me';
            if (_onSyncEnd) _onSyncEnd();
            _updateButtonStates();
        }
    }

    async function _handleRemoveMe() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        const removeBtn = document.getElementById('remove-me-btn');
        removeBtn.disabled = true;
        removeBtn.textContent = 'Removing...';

        if (_onSyncStart) _onSyncStart(selectedCells);

        try {
            const cellsByWeek = _groupCellsByWeek(selectedCells);
            const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
            if (!teamId) throw new Error('No team selected');

            for (const [weekId, slotIds] of Object.entries(cellsByWeek)) {
                const result = await AvailabilityService.removeMeFromSlots(teamId, weekId, slotIds);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            if (_clearSelections) _clearSelections();

            ToastService.showSuccess('Removed from selected slots!');

        } catch (error) {
            console.error('Remove me failed:', error);
            ToastService.showError(error.message || 'Failed to remove availability');
        } finally {
            removeBtn.disabled = false;
            removeBtn.textContent = 'Remove Me';
            if (_onSyncEnd) _onSyncEnd();
            _updateButtonStates();
        }
    }

    function _groupCellsByWeek(cells) {
        // cells format: [{ weekId, slotId }, ...]
        const grouped = {};
        cells.forEach(cell => {
            if (!grouped[cell.weekId]) {
                grouped[cell.weekId] = [];
            }
            grouped[cell.weekId].push(cell.slotId);
        });
        return grouped;
    }

    function _updateButtonStates() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        const hasSelection = selectedCells.length > 0;

        const addBtn = document.getElementById('add-me-btn');
        const removeBtn = document.getElementById('remove-me-btn');

        if (addBtn) addBtn.disabled = !hasSelection;
        if (removeBtn) removeBtn.disabled = !hasSelection;
    }

    function init(containerId, options = {}) {
        _container = document.getElementById(containerId);
        _getSelectedCells = options.getSelectedCells;
        _clearSelections = options.clearSelections;
        _onSyncStart = options.onSyncStart;
        _onSyncEnd = options.onSyncEnd;

        _render();
    }

    // Called when selection changes
    function onSelectionChange() {
        _updateButtonStates();
    }

    function cleanup() {
        if (_container) _container.innerHTML = '';
    }

    return {
        init,
        onSelectionChange,
        cleanup
    };
})();
```

### Cloud Function - updateAvailability
```javascript
// /functions/availability.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

/**
 * Update user availability - add or remove from time slots
 */
const updateAvailability = onCall(async (request) => {
    const db = getFirestore();

    // Validate authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const userId = request.auth.uid;
    const { teamId, weekId, action, slotIds } = request.data;

    // Validate inputs
    if (!teamId || typeof teamId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid team ID');
    }

    if (!weekId || typeof weekId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid week ID');
    }

    if (!['add', 'remove'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Action must be "add" or "remove"');
    }

    if (!Array.isArray(slotIds) || slotIds.length === 0) {
        throw new HttpsError('invalid-argument', 'Must provide at least one slot');
    }

    // Validate slot ID format (day_time, e.g., "mon_1800")
    const validSlotPattern = /^(mon|tue|wed|thu|fri|sat|sun)_(18|19|20|21|22|23)(00|30)$/;
    for (const slotId of slotIds) {
        if (!validSlotPattern.test(slotId)) {
            throw new HttpsError('invalid-argument', `Invalid slot format: ${slotId}`);
        }
    }

    // Validate week ID format and range (ISO week: "2026-05")
    const weekPattern = /^\d{4}-\d{2}$/;
    if (!weekPattern.test(weekId)) {
        throw new HttpsError('invalid-argument', 'Invalid week format. Use YYYY-WW');
    }

    // Verify user is member of team
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
        throw new HttpsError('not-found', 'Team not found');
    }

    const teamData = teamDoc.data();
    const roster = teamData.roster || {};

    if (!roster[userId]) {
        throw new HttpsError('permission-denied', 'You are not a member of this team');
    }

    // Build update object for atomic operations
    const docId = `${teamId}_${weekId}`;
    const availRef = db.collection('availability').doc(docId);

    // Check if document exists - create with proper structure if not
    const existingDoc = await availRef.get();
    if (!existingDoc.exists) {
        await availRef.set({
            teamId,
            weekId,
            slots: {},
            lastUpdated: FieldValue.serverTimestamp()
        });
    }

    // Build slot updates
    // IMPORTANT: Use update() for nested paths, NOT set({ merge: true })
    // set({ merge: true }) with dot-notation creates literal top-level fields!
    const updateData = {
        lastUpdated: FieldValue.serverTimestamp()
    };

    slotIds.forEach(slotId => {
        if (action === 'add') {
            updateData[`slots.${slotId}`] = FieldValue.arrayUnion(userId);
        } else {
            updateData[`slots.${slotId}`] = FieldValue.arrayRemove(userId);
        }
    });

    // Use update() which correctly interprets dot notation as nested paths
    await availRef.update(updateData);

    console.log(`Availability ${action}: ${userId} ${action === 'add' ? 'added to' : 'removed from'} ${slotIds.length} slots in ${docId}`);

    return { success: true };
});

module.exports = { updateAvailability };
```

### Enhanced AvailabilityGrid (Sync Indicator)
```javascript
// Addition to AvailabilityGrid.js - sync indicator support

// Add to the instance methods:
function setSyncingCells(cellIds) {
    // Add shimmer class to cells being synced
    cellIds.forEach(cellId => {
        const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
        if (cell) {
            cell.classList.add('syncing');
        }
    });
}

function clearSyncingCells() {
    // Remove shimmer from all cells
    const syncingCells = _container?.querySelectorAll('.syncing');
    syncingCells?.forEach(cell => cell.classList.remove('syncing'));
}

// Add to public API:
const instance = {
    init,
    getSelectedCells,
    clearSelection,
    cleanup,
    getWeekId,
    setSyncingCells,    // NEW
    clearSyncingCells   // NEW
};
```

### CSS for Sync Indicator
```css
/* Add to src/css/input.css */

/* Sync shimmer animation for cells being saved */
@keyframes sync-shimmer {
    0% { opacity: 1; }
    50% { opacity: 0.6; }
    100% { opacity: 1; }
}

.grid-cell.syncing {
    animation: sync-shimmer 0.8s ease-in-out infinite;
    pointer-events: none;
}

/* User's own availability indicator (for future slice 2.5) */
.grid-cell.user-available {
    background-color: oklch(0.6801 0.1583 276.9349 / 0.3); /* primary with opacity */
    border-color: var(--primary);
}
```

## 5. Performance Classification
```
HOT PATHS (<50ms):
- Cell selection toggle: Pure DOM, no network - instant
- Add Me / Remove Me click: Optimistic update to UI - instant visual feedback
- Real-time listener update: Cache update + re-render - instant

COLD PATHS (<2s):
- Initial availability load: First Firebase fetch (then cached)
- Cloud Function execution: Network round-trip (but UI already updated)

BACKEND PERFORMANCE:
- Cloud Function: Simple arrayUnion/arrayRemove - very fast
- No complex queries or transactions needed
- Document size: ~2-5KB per team/week - instant reads/writes
```

## 6. Data Flow Diagram
```
ADD ME FLOW:
User selects cells → Clicks "Add Me" → GridActionButtons._handleAddMe()
                                              ↓
         ┌────────────────────────────────────┴───────────────────────────────────┐
         ↓                                                                         ↓
    [OPTIMISTIC PATH - INSTANT]                                          [FIREBASE PATH - ASYNC]
    AvailabilityService.addMeToSlots()                                   Cloud Function: updateAvailability()
    → Update local cache                                                 → Validate user is team member
    → Grid re-renders with new state                                     → arrayUnion userId to slots
    → Shimmer animation on syncing cells                                 → Update lastUpdated timestamp
         ↓                                                                         ↓
         └────────────────────────────────────┬───────────────────────────────────┘
                                              ↓
                                    [SUCCESS OR ROLLBACK]
                                    Success: Clear shimmer, clear selection
                                    Failure: Rollback cache, show error toast

REAL-TIME UPDATE FLOW (Other Team Members):
Firebase document change → onSnapshot fires → AvailabilityService.updateCache()
                                                      ↓
                                             Grid callback triggered
                                                      ↓
                                             UI re-renders with new data
```

## 7. Test Scenarios
```
FRONTEND TESTS:
- [ ] Add Me button disabled when no cells selected
- [ ] Remove Me button disabled when no cells selected
- [ ] Add Me button shows "Adding..." during operation
- [ ] Remove Me button shows "Removing..." during operation
- [ ] Cells show shimmer animation during sync
- [ ] Shimmer clears after successful sync
- [ ] Selection clears after successful add/remove
- [ ] Toast shows success message after add
- [ ] Toast shows success message after remove
- [ ] Toast shows error message on failure
- [ ] UI updates optimistically before Firebase confirms

BACKEND TESTS:
- [ ] Cloud Function rejects unauthenticated requests
- [ ] Cloud Function rejects invalid team ID
- [ ] Cloud Function rejects invalid week ID format
- [ ] Cloud Function rejects invalid slot ID format
- [ ] Cloud Function rejects users not on team
- [ ] Cloud Function successfully adds user to slots (arrayUnion)
- [ ] Cloud Function successfully removes user from slots (arrayRemove)
- [ ] Cloud Function creates document if it doesn't exist
- [ ] Security rules allow authenticated read
- [ ] Security rules deny direct client writes

INTEGRATION TESTS (CRITICAL):
- [ ] Select cells → Add Me → UI updates instantly → Firebase confirms
- [ ] Select cells → Remove Me → UI updates instantly → Firebase confirms
- [ ] Add Me fails → UI rolls back → Error toast shown
- [ ] Real-time: User A adds availability → User B sees update within 2 seconds
- [ ] Multi-week selection: Add Me applies to cells in both visible weeks
- [ ] Network offline → Add Me → UI updates → Reconnect → Firebase syncs

END-TO-END TESTS:
- [ ] New user with no availability can add themselves to slots
- [ ] User can remove themselves from slots they're in
- [ ] User cannot add to slots in archived teams
- [ ] User switching teams sees correct availability for each team
- [ ] Browser refresh preserves availability (loaded from Firebase)
```

## 8. Common Integration Pitfalls
- [ ] Forgetting to update cache after optimistic update
- [ ] Not handling rollback when Cloud Function fails
- [ ] Missing shimmer clear on error path
- [ ] Selection state not cleared after successful action
- [ ] Week ID format mismatch between frontend and backend
- [ ] Not validating user is team member before allowing action
- [ ] Listeners not cleaned up when switching teams
- [ ] Cache key mismatch (teamId_weekId vs teamId-weekId)

## 9. Implementation Notes

### File Structure
```
public/js/
├── services/
│   └── AvailabilityService.js  (NEW)
├── components/
│   ├── AvailabilityGrid.js     (ENHANCED - add sync indicator methods)
│   ├── GridActionButtons.js    (NEW)
│   ├── WeekDisplay.js          (ENHANCED - pass callbacks to grid)
│   └── WeekNavigation.js       (existing)

functions/
├── availability.js             (NEW)
└── index.js                    (ADD export)

src/css/
└── input.css                   (ADD sync shimmer animation)
```

### Slot ID Format
- Format: `{day}_{time}` where day is lowercase 3-letter and time is 24hr HHMM
- Examples: `mon_1800`, `tue_1930`, `sun_2300`
- Validation regex: `/^(mon|tue|wed|thu|fri|sat|sun)_(18|19|20|21|22|23)(00|30)$/`

### Week ID Format
- Format: ISO week `YYYY-WW` (e.g., "2026-05" for week 5 of 2026)
- Matches WeekNavigation.getCurrentWeekNumber() output
- Frontend must ensure consistent format when calling service

### Button Placement
- Floating buttons positioned near the grid (between panels or overlay)
- Exact placement TBD during implementation - can adjust based on visual fit
- Must not obscure grid content

### Dependencies
- Requires AuthService for current user ID
- Requires MatchSchedulerApp.getSelectedTeam() for team context
- Requires ToastService for user feedback

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Users can only set availability for teams they're currently on
- **Rationale**: Simplest permission model, prevents data pollution
- **Alternative**: Could allow setting availability before joining (more complex)

- **[ASSUMPTION]**: Week ID uses ISO week number format (YYYY-WW)
- **Rationale**: Consistent with existing WeekNavigation component
- **Alternative**: Could use start date of week, but ISO weeks are cleaner

- **[ASSUMPTION]**: No rate limiting on availability updates for MVP
- **Rationale**: 300 users, low frequency updates, Firestore handles it
- **Alternative**: Could add rate limiting if abuse detected post-launch

- **[ASSUMPTION]**: Empty slots array = no one available (not stored as empty)
- **Rationale**: Firestore charges for document size, sparse storage is efficient
- **Alternative**: Could store empty arrays, but wastes space

---

## Quality Checklist

Before considering this slice spec complete:
- [x] Frontend AND backend requirements specified
- [x] All PRD requirements mapped (4.1.3 single-click, 4.1.5 performance)
- [x] Architecture follows established patterns (Cache + Listeners + Revealing Module)
- [x] Hot paths clearly identified (optimistic updates)
- [x] Test scenarios cover full stack
- [x] No anti-patterns present
- [x] Data flow complete (UI → Cache → Firebase → Listener → UI)
- [x] Integration examples show actual code
- [x] Error handling specified (rollback on failure)
- [x] Loading states defined (shimmer animation, button text)
- [x] Event logging checked (not required per PRD)
- [x] API contracts fully specified
- [x] Security rules documented

---

*Slice created: 2026-01-23*
