// AvailabilityService.js - Availability data management with cache + listener pattern
// Following CLAUDE.md architecture: Service manages cache only, components own listeners

const AvailabilityService = (function() {
    'use strict';

    let _initialized = false;
    let _db = null;
    let _functions = null;
    let _cache = new Map(); // Key: "{teamId}_{weekId}", Value: availability doc
    let _listeners = new Map(); // Key: "{teamId}_{weekId}", Value: unsubscribe fn
    let _callbacks = new Map(); // Key: "{teamId}_{weekId}", Value: Set<callback>
    let _allTeamsLoadedWeeks = new Set(); // Track which weeks have all teams loaded (Find Standin)

    /**
     * Check if running in local dev mode
     */
    function _isDevMode() {
        return window.firebase?.isLocalDev === true;
    }

    async function init() {
        if (_initialized) return;

        if (typeof window.firebase === 'undefined') {
            setTimeout(init, 100);
            return;
        }

        _db = window.firebase.db;
        _functions = window.firebase.functions;
        _initialized = true;
        console.log('📅 AvailabilityService initialized', _isDevMode() ? '(DEV MODE - direct writes)' : '(Cloud Functions)');
    }

    /**
     * Load availability for a team/week (cache-first)
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID in ISO format (YYYY-WW)
     * @returns {Object} Availability document
     */
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

    /**
     * Subscribe to real-time updates for a team/week
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID in ISO format (YYYY-WW)
     * @param {Function} callback - Called when data changes
     */
    async function subscribe(teamId, weekId, callback) {
        const cacheKey = `${teamId}_${weekId}`;

        // Register callback
        if (!_callbacks.has(cacheKey)) {
            _callbacks.set(cacheKey, new Set());
        }
        _callbacks.get(cacheKey).add(callback);

        // If listener already exists, just fire callback with cached data (if available)
        if (_listeners.has(cacheKey)) {
            const cached = _cache.get(cacheKey);
            if (cached) callback(cached);
            return;
        }

        const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

        const docRef = doc(_db, 'availability', cacheKey);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            const data = docSnap.exists()
                ? { id: docSnap.id, ...docSnap.data() }
                : { id: cacheKey, teamId, weekId, slots: {} };

            _cache.set(cacheKey, data);
            // Notify all registered callbacks
            const cbs = _callbacks.get(cacheKey);
            if (cbs) cbs.forEach(cb => cb(data));
        }, (error) => {
            console.error('Availability listener error:', error);
        });

        _listeners.set(cacheKey, unsubscribe);
    }

    /**
     * Unsubscribe a specific callback from a team/week.
     * Only tears down the Firestore listener when no callbacks remain.
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {Function} [callback] - Specific callback to remove. If omitted, removes ALL callbacks and listener.
     */
    function unsubscribe(teamId, weekId, callback) {
        const cacheKey = `${teamId}_${weekId}`;

        if (callback) {
            // Remove specific callback
            const cbs = _callbacks.get(cacheKey);
            if (cbs) {
                cbs.delete(callback);
                // Only tear down listener if no callbacks remain
                if (cbs.size === 0) {
                    _callbacks.delete(cacheKey);
                    const unsub = _listeners.get(cacheKey);
                    if (unsub) {
                        unsub();
                        _listeners.delete(cacheKey);
                    }
                }
            }
        } else {
            // Remove all callbacks and listener
            _callbacks.delete(cacheKey);
            const unsub = _listeners.get(cacheKey);
            if (unsub) {
                unsub();
                _listeners.delete(cacheKey);
            }
        }
    }

    /**
     * Unsubscribe from all listeners
     */
    function unsubscribeAll() {
        _listeners.forEach(unsub => unsub());
        _listeners.clear();
        _callbacks.clear();
    }

    /**
     * Add current user to slots (optimistic update)
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {Array<string>} slotIds - Array of slot IDs (e.g., ['mon_1800', 'tue_1900'])
     * @returns {Object} { success: boolean, error?: string }
     */
    async function addMeToSlots(teamId, weekId, slotIds) {
        const userId = window.firebase.auth.currentUser?.uid;
        if (!userId) {
            return { success: false, error: 'Not authenticated' };
        }

        const cacheKey = `${teamId}_${weekId}`;

        // Capture rollback state
        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update
        const currentData = _cache.get(cacheKey) || { teamId, weekId, slots: {} };
        // Ensure slots object exists (might be missing from cached data)
        if (!currentData.slots) {
            currentData.slots = {};
        }
        if (!currentData.unavailable) {
            currentData.unavailable = {};
        }
        slotIds.forEach(slotId => {
            if (!currentData.slots[slotId]) {
                currentData.slots[slotId] = [];
            }
            if (!currentData.slots[slotId].includes(userId)) {
                currentData.slots[slotId].push(userId);
            }
            // Mutual exclusion: remove from unavailable when adding availability
            if (currentData.unavailable[slotId]) {
                currentData.unavailable[slotId] = currentData.unavailable[slotId].filter(id => id !== userId);
            }
        });
        _cache.set(cacheKey, currentData);

        try {
            // DEV MODE: Direct Firestore write (no Cloud Function)
            if (_isDevMode()) {
                const { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = {};

                slotIds.forEach(slotId => {
                    updateData[`slots.${slotId}`] = arrayUnion(userId);
                    // Mutual exclusion: remove from unavailable
                    updateData[`unavailable.${slotId}`] = arrayRemove(userId);
                });
                updateData.lastUpdated = serverTimestamp();

                // Check if document exists
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    // Document exists - use updateDoc for nested field updates
                    await updateDoc(docRef, updateData);
                } else {
                    // Document doesn't exist - create it with setDoc
                    await setDoc(docRef, {
                        teamId,
                        weekId,
                        slots: {},
                        lastUpdated: serverTimestamp()
                    });
                    // Then update with the slots
                    await updateDoc(docRef, updateData);
                }

                console.log(`🔧 DEV: Added to ${slotIds.length} slots`);
                return { success: true };
            }

            // PRODUCTION: Call Cloud Function
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

    /**
     * Add another player to slots on their behalf (leader/scheduler only)
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {Array<string>} slotIds - Array of slot IDs
     * @param {string} targetUserId - User ID of the player to add
     * @returns {Object} { success: boolean, error?: string }
     */
    async function addPlayerToSlots(teamId, weekId, slotIds, targetUserId) {
        const currentUserId = window.firebase.auth.currentUser?.uid;
        if (!currentUserId) {
            return { success: false, error: 'Not authenticated' };
        }
        if (!targetUserId) {
            return { success: false, error: 'Target user ID required' };
        }

        const cacheKey = `${teamId}_${weekId}`;

        // Capture rollback state
        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update with targetUserId
        const currentData = _cache.get(cacheKey) || { teamId, weekId, slots: {} };
        if (!currentData.slots) {
            currentData.slots = {};
        }
        if (!currentData.unavailable) {
            currentData.unavailable = {};
        }
        slotIds.forEach(slotId => {
            if (!currentData.slots[slotId]) {
                currentData.slots[slotId] = [];
            }
            if (!currentData.slots[slotId].includes(targetUserId)) {
                currentData.slots[slotId].push(targetUserId);
            }
            // Mutual exclusion: remove from unavailable
            if (currentData.unavailable[slotId]) {
                currentData.unavailable[slotId] = currentData.unavailable[slotId].filter(id => id !== targetUserId);
            }
        });
        _cache.set(cacheKey, currentData);

        try {
            if (_isDevMode()) {
                const { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = {};
                slotIds.forEach(slotId => {
                    updateData[`slots.${slotId}`] = arrayUnion(targetUserId);
                    // Mutual exclusion: remove from unavailable
                    updateData[`unavailable.${slotId}`] = arrayRemove(targetUserId);
                });
                updateData.lastUpdated = serverTimestamp();

                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    await updateDoc(docRef, updateData);
                } else {
                    await setDoc(docRef, {
                        teamId, weekId, slots: {},
                        lastUpdated: serverTimestamp()
                    });
                    await updateDoc(docRef, updateData);
                }

                console.log(`🔧 DEV: Added ${targetUserId} to ${slotIds.length} slots (by ${currentUserId})`);
                return { success: true };
            }

            // PRODUCTION: Call Cloud Function with targetUserId
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const updateFn = httpsCallable(_functions, 'updateAvailability');

            const result = await updateFn({
                teamId,
                weekId,
                action: 'add',
                slotIds,
                targetUserId
            });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to update availability');
            }

            return { success: true };

        } catch (error) {
            if (rollbackData) {
                _cache.set(cacheKey, rollbackData);
            } else {
                _cache.delete(cacheKey);
            }
            console.error('Failed to add availability for player:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Remove current user from slots (optimistic update)
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {Array<string>} slotIds - Array of slot IDs
     * @returns {Object} { success: boolean, error?: string }
     */
    async function removeMeFromSlots(teamId, weekId, slotIds) {
        const userId = window.firebase.auth.currentUser?.uid;
        if (!userId) {
            return { success: false, error: 'Not authenticated' };
        }

        const cacheKey = `${teamId}_${weekId}`;

        // Capture rollback state
        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update - remove from both slots and unavailable (away)
        const currentData = _cache.get(cacheKey);
        if (currentData) {
            slotIds.forEach(slotId => {
                if (currentData.slots?.[slotId]) {
                    currentData.slots[slotId] = currentData.slots[slotId]
                        .filter(id => id !== userId);
                }
                if (currentData.unavailable?.[slotId]) {
                    currentData.unavailable[slotId] = currentData.unavailable[slotId]
                        .filter(id => id !== userId);
                }
            });
            _cache.set(cacheKey, currentData);
        }

        try {
            // DEV MODE: Direct Firestore write (no Cloud Function)
            if (_isDevMode()) {
                const { doc, updateDoc, arrayRemove, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = {};

                slotIds.forEach(slotId => {
                    updateData[`slots.${slotId}`] = arrayRemove(userId);
                    updateData[`unavailable.${slotId}`] = arrayRemove(userId);
                });
                updateData.lastUpdated = serverTimestamp();

                await updateDoc(docRef, updateData);
                console.log(`🔧 DEV: Removed ${userId} from ${slotIds.length} slots (including away)`);
                return { success: true };
            }

            // PRODUCTION: Call Cloud Function
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

    /**
     * Remove another player from slots on their behalf (leader/scheduler only)
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {Array<string>} slotIds - Array of slot IDs
     * @param {string} targetUserId - User ID of the player to remove
     * @returns {Object} { success: boolean, error?: string }
     */
    async function removePlayerFromSlots(teamId, weekId, slotIds, targetUserId) {
        const currentUserId = window.firebase.auth.currentUser?.uid;
        if (!currentUserId) {
            return { success: false, error: 'Not authenticated' };
        }
        if (!targetUserId) {
            return { success: false, error: 'Target user ID required' };
        }

        const cacheKey = `${teamId}_${weekId}`;

        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update - remove from both slots and unavailable (away)
        const currentData = _cache.get(cacheKey);
        if (currentData) {
            slotIds.forEach(slotId => {
                if (currentData.slots?.[slotId]) {
                    currentData.slots[slotId] = currentData.slots[slotId]
                        .filter(id => id !== targetUserId);
                }
                if (currentData.unavailable?.[slotId]) {
                    currentData.unavailable[slotId] = currentData.unavailable[slotId]
                        .filter(id => id !== targetUserId);
                }
            });
            _cache.set(cacheKey, currentData);
        }

        try {
            if (_isDevMode()) {
                const { doc, updateDoc, arrayRemove, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = {};
                slotIds.forEach(slotId => {
                    updateData[`slots.${slotId}`] = arrayRemove(targetUserId);
                    updateData[`unavailable.${slotId}`] = arrayRemove(targetUserId);
                });
                updateData.lastUpdated = serverTimestamp();

                await updateDoc(docRef, updateData);
                console.log(`🔧 DEV: Removed ${targetUserId} from ${slotIds.length} slots including away (by ${currentUserId})`);
                return { success: true };
            }

            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const updateFn = httpsCallable(_functions, 'updateAvailability');

            const result = await updateFn({
                teamId,
                weekId,
                action: 'remove',
                slotIds,
                targetUserId
            });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to update availability');
            }

            return { success: true };

        } catch (error) {
            if (rollbackData) {
                _cache.set(cacheKey, rollbackData);
            }
            console.error('Failed to remove availability for player:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get players in a specific slot from cache
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {string} slotId - Slot ID (e.g., 'mon_1800')
     * @returns {Array<string>} Array of user IDs
     */
    function getSlotPlayers(teamId, weekId, slotId) {
        const cacheKey = `${teamId}_${weekId}`;
        const data = _cache.get(cacheKey);
        return data?.slots?.[slotId] || [];
    }

    /**
     * Check if user is in a slot
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {string} slotId - Slot ID
     * @param {string} userId - User ID to check
     * @returns {boolean}
     */
    function isUserInSlot(teamId, weekId, slotId, userId) {
        const players = getSlotPlayers(teamId, weekId, slotId);
        return players.includes(userId);
    }

    /**
     * Get cached data directly
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @returns {Object|undefined} Cached availability data
     */
    function getCachedData(teamId, weekId) {
        return _cache.get(`${teamId}_${weekId}`);
    }

    /**
     * Update cache directly (called by listeners)
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {Object} data - New data
     */
    function updateCache(teamId, weekId, data) {
        _cache.set(`${teamId}_${weekId}`, data);
    }

    // ---------------------------------------------------------------
    // Unavailability methods (Slice 15.0)
    // ---------------------------------------------------------------

    /**
     * Get unavailable players in a specific slot from cache
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {string} slotId - Slot ID (e.g., 'mon_1800')
     * @returns {Array<string>} Array of user IDs
     */
    function getSlotUnavailablePlayers(teamId, weekId, slotId) {
        const cacheKey = `${teamId}_${weekId}`;
        const data = _cache.get(cacheKey);
        return data?.unavailable?.[slotId] || [];
    }

    /**
     * Check if user is unavailable in a slot
     */
    function isUserUnavailableInSlot(teamId, weekId, slotId, userId) {
        const players = getSlotUnavailablePlayers(teamId, weekId, slotId);
        return players.includes(userId);
    }

    /**
     * Mark current user as unavailable in slots (optimistic update)
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     * @param {Array<string>} slotIds - Array of slot IDs
     * @returns {Object} { success: boolean, error?: string }
     */
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
            if (!currentData.unavailable[slotId]) currentData.unavailable[slotId] = [];
            if (!currentData.unavailable[slotId].includes(userId)) {
                currentData.unavailable[slotId].push(userId);
            }
            // Mutual exclusion: remove from available
            if (currentData.slots[slotId]) {
                currentData.slots[slotId] = currentData.slots[slotId].filter(id => id !== userId);
            }
        });
        _cache.set(cacheKey, currentData);

        try {
            if (_isDevMode()) {
                const { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp }
                    = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = { lastUpdated: serverTimestamp() };

                slotIds.forEach(slotId => {
                    updateData[`unavailable.${slotId}`] = arrayUnion(userId);
                    updateData[`slots.${slotId}`] = arrayRemove(userId);
                });

                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    await setDoc(docRef, { teamId, weekId, slots: {}, unavailable: {}, lastUpdated: serverTimestamp() });
                }
                await updateDoc(docRef, updateData);

                console.log(`🔧 DEV: Marked unavailable in ${slotIds.length} slots`);
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

    /**
     * Remove unavailable marking for current user
     */
    async function removeUnavailable(teamId, weekId, slotIds) {
        const userId = window.firebase.auth.currentUser?.uid;
        if (!userId) return { success: false, error: 'Not authenticated' };

        const cacheKey = `${teamId}_${weekId}`;
        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update
        const currentData = _cache.get(cacheKey);
        if (currentData && currentData.unavailable) {
            slotIds.forEach(slotId => {
                if (currentData.unavailable[slotId]) {
                    currentData.unavailable[slotId] = currentData.unavailable[slotId].filter(id => id !== userId);
                }
            });
            _cache.set(cacheKey, currentData);
        }

        try {
            if (_isDevMode()) {
                const { doc, updateDoc, arrayRemove, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = { lastUpdated: serverTimestamp() };
                slotIds.forEach(slotId => {
                    updateData[`unavailable.${slotId}`] = arrayRemove(userId);
                });
                await updateDoc(docRef, updateData);

                console.log(`🔧 DEV: Removed unavailable from ${slotIds.length} slots`);
                return { success: true };
            }

            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const updateFn = httpsCallable(_functions, 'updateAvailability');
            const result = await updateFn({ teamId, weekId, action: 'removeUnavailable', slotIds });

            if (!result.data.success) throw new Error(result.data.error || 'Failed to remove unavailable');
            return { success: true };

        } catch (error) {
            if (rollbackData) _cache.set(cacheKey, rollbackData);
            console.error('Failed to remove unavailable:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Mark another player as unavailable (leader/scheduler only)
     */
    async function markPlayerUnavailable(teamId, weekId, slotIds, targetUserId) {
        const currentUserId = window.firebase.auth.currentUser?.uid;
        if (!currentUserId) return { success: false, error: 'Not authenticated' };
        if (!targetUserId) return { success: false, error: 'Target user ID required' };

        const cacheKey = `${teamId}_${weekId}`;
        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update
        const currentData = _cache.get(cacheKey) || { teamId, weekId, slots: {}, unavailable: {} };
        if (!currentData.unavailable) currentData.unavailable = {};
        if (!currentData.slots) currentData.slots = {};

        slotIds.forEach(slotId => {
            if (!currentData.unavailable[slotId]) currentData.unavailable[slotId] = [];
            if (!currentData.unavailable[slotId].includes(targetUserId)) {
                currentData.unavailable[slotId].push(targetUserId);
            }
            if (currentData.slots[slotId]) {
                currentData.slots[slotId] = currentData.slots[slotId].filter(id => id !== targetUserId);
            }
        });
        _cache.set(cacheKey, currentData);

        try {
            if (_isDevMode()) {
                const { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp }
                    = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = { lastUpdated: serverTimestamp() };
                slotIds.forEach(slotId => {
                    updateData[`unavailable.${slotId}`] = arrayUnion(targetUserId);
                    updateData[`slots.${slotId}`] = arrayRemove(targetUserId);
                });

                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    await setDoc(docRef, { teamId, weekId, slots: {}, unavailable: {}, lastUpdated: serverTimestamp() });
                }
                await updateDoc(docRef, updateData);

                console.log(`🔧 DEV: Marked ${targetUserId} unavailable in ${slotIds.length} slots (by ${currentUserId})`);
                return { success: true };
            }

            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const updateFn = httpsCallable(_functions, 'updateAvailability');
            const result = await updateFn({ teamId, weekId, action: 'markUnavailable', slotIds, targetUserId });

            if (!result.data.success) throw new Error(result.data.error || 'Failed to mark unavailable');
            return { success: true };

        } catch (error) {
            if (rollbackData) _cache.set(cacheKey, rollbackData);
            else _cache.delete(cacheKey);
            console.error('Failed to mark player unavailable:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Remove unavailable marking for another player (leader/scheduler only)
     */
    async function removePlayerUnavailable(teamId, weekId, slotIds, targetUserId) {
        const currentUserId = window.firebase.auth.currentUser?.uid;
        if (!currentUserId) return { success: false, error: 'Not authenticated' };
        if (!targetUserId) return { success: false, error: 'Target user ID required' };

        const cacheKey = `${teamId}_${weekId}`;
        const rollbackData = _cache.has(cacheKey)
            ? JSON.parse(JSON.stringify(_cache.get(cacheKey)))
            : null;

        // Optimistic update
        const currentData = _cache.get(cacheKey);
        if (currentData && currentData.unavailable) {
            slotIds.forEach(slotId => {
                if (currentData.unavailable[slotId]) {
                    currentData.unavailable[slotId] = currentData.unavailable[slotId].filter(id => id !== targetUserId);
                }
            });
            _cache.set(cacheKey, currentData);
        }

        try {
            if (_isDevMode()) {
                const { doc, updateDoc, arrayRemove, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = { lastUpdated: serverTimestamp() };
                slotIds.forEach(slotId => {
                    updateData[`unavailable.${slotId}`] = arrayRemove(targetUserId);
                });
                await updateDoc(docRef, updateData);

                console.log(`🔧 DEV: Removed ${targetUserId} unavailable from ${slotIds.length} slots (by ${currentUserId})`);
                return { success: true };
            }

            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const updateFn = httpsCallable(_functions, 'updateAvailability');
            const result = await updateFn({ teamId, weekId, action: 'removeUnavailable', slotIds, targetUserId });

            if (!result.data.success) throw new Error(result.data.error || 'Failed to remove unavailable');
            return { success: true };

        } catch (error) {
            if (rollbackData) _cache.set(cacheKey, rollbackData);
            console.error('Failed to remove player unavailable:', error);
            return { success: false, error: error.message };
        }
    }

    // ---------------------------------------------------------------
    // Community-wide loading (Slice 16.0a — Find Standin)
    // ---------------------------------------------------------------

    /**
     * Load availability for ALL teams for a given week (batch).
     * Skips teams already cached. Tracks loaded weeks to avoid redundant fetches.
     * @param {string} weekId - Week ID in ISO format (YYYY-WW)
     */
    async function loadAllTeamAvailability(weekId) {
        if (_allTeamsLoadedWeeks.has(weekId)) return; // already loaded

        const allTeams = typeof TeamService !== 'undefined' ? TeamService.getAllTeams() : [];
        const promises = allTeams.map(team => {
            const cacheKey = `${team.id}_${weekId}`;
            if (_cache.has(cacheKey)) return Promise.resolve(); // already cached
            return loadWeekAvailability(team.id, weekId);
        });

        await Promise.all(promises);
        _allTeamsLoadedWeeks.add(weekId);
    }

    /**
     * Get all players across all teams who are available in ANY of the given slots (OR logic).
     * Reads from cache only — call loadAllTeamAvailability() first.
     * @param {string} weekId - Week ID
     * @param {Array<string>} slotIds - UTC slot IDs (e.g., ['thu_1900', 'thu_1930'])
     * @returns {Map<string, Object>} Map<userId, { displayName, teamId, teamTag, teamName, divisions, availableSlots[], photoURL, initials }>
     */
    function getCommunityAvailability(weekId, slotIds) {
        const result = new Map();
        const allTeams = typeof TeamService !== 'undefined' ? TeamService.getAllTeams() : [];

        for (const team of allTeams) {
            // Respect privacy
            if (team.hideFromComparison) continue;

            const cacheKey = `${team.id}_${weekId}`;
            const data = _cache.get(cacheKey);
            if (!data?.slots) continue;

            const roster = team.playerRoster || [];

            // Check each requested slot (OR logic)
            for (const slotId of slotIds) {
                const playersInSlot = data.slots[slotId] || [];
                for (const userId of playersInSlot) {
                    if (!result.has(userId)) {
                        const playerInfo = roster.find(p => p.userId === userId) || {};
                        result.set(userId, {
                            displayName: playerInfo.displayName || userId,
                            teamId: team.id,
                            teamTag: team.teamTag || '??',
                            teamName: team.teamName || '',
                            divisions: team.divisions || [],
                            availableSlots: [],
                            photoURL: playerInfo.photoURL || null,
                            initials: playerInfo.initials || (playerInfo.displayName || '??').substring(0, 2).toUpperCase(),
                            role: playerInfo.role || 'member',
                            hideRosterNames: team.hideRosterNames || false
                        });
                    }
                    const entry = result.get(userId);
                    if (!entry.availableSlots.includes(slotId)) {
                        entry.availableSlots.push(slotId);
                    }
                }
            }
        }
        return result;
    }

    /**
     * Cleanup - clear all listeners and cache
     */
    function cleanup() {
        _listeners.forEach(unsub => unsub());
        _listeners.clear();
        _callbacks.clear();
        _cache.clear();
        _allTeamsLoadedWeeks.clear();
        console.log('🧹 AvailabilityService cleaned up');
    }

    return {
        init,
        loadWeekAvailability,
        subscribe,
        unsubscribe,
        unsubscribeAll,
        addMeToSlots,
        addPlayerToSlots,
        removeMeFromSlots,
        removePlayerFromSlots,
        getSlotPlayers,
        isUserInSlot,
        // Unavailability (Slice 15.0)
        getSlotUnavailablePlayers,
        isUserUnavailableInSlot,
        markUnavailable,
        removeUnavailable,
        markPlayerUnavailable,
        removePlayerUnavailable,
        getCachedData,
        updateCache,
        // Community-wide loading (Slice 16.0a — Find Standin)
        loadAllTeamAvailability,
        getCommunityAvailability,
        cleanup
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', AvailabilityService.init);
