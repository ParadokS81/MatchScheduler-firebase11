// AvailabilityService.js - Availability data management with cache + listener pattern
// Following CLAUDE.md architecture: Service manages cache only, components own listeners

const AvailabilityService = (function() {
    'use strict';

    let _initialized = false;
    let _db = null;
    let _functions = null;
    let _cache = new Map(); // Key: "{teamId}_{weekId}", Value: availability doc
    let _listeners = new Map(); // Key: "{teamId}_{weekId}", Value: unsubscribe fn

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

    /**
     * Unsubscribe from a team/week
     * @param {string} teamId - Team ID
     * @param {string} weekId - Week ID
     */
    function unsubscribe(teamId, weekId) {
        const cacheKey = `${teamId}_${weekId}`;
        const unsub = _listeners.get(cacheKey);
        if (unsub) {
            unsub();
            _listeners.delete(cacheKey);
        }
    }

    /**
     * Unsubscribe from all listeners
     */
    function unsubscribeAll() {
        _listeners.forEach(unsub => unsub());
        _listeners.clear();
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
        slotIds.forEach(slotId => {
            if (!currentData.slots[slotId]) {
                currentData.slots[slotId] = [];
            }
            if (!currentData.slots[slotId].includes(userId)) {
                currentData.slots[slotId].push(userId);
            }
        });
        _cache.set(cacheKey, currentData);

        try {
            // DEV MODE: Direct Firestore write (no Cloud Function)
            if (_isDevMode()) {
                const { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = {};

                slotIds.forEach(slotId => {
                    updateData[`slots.${slotId}`] = arrayUnion(userId);
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
        slotIds.forEach(slotId => {
            if (!currentData.slots[slotId]) {
                currentData.slots[slotId] = [];
            }
            if (!currentData.slots[slotId].includes(targetUserId)) {
                currentData.slots[slotId].push(targetUserId);
            }
        });
        _cache.set(cacheKey, currentData);

        try {
            if (_isDevMode()) {
                const { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

                const docRef = doc(_db, 'availability', cacheKey);
                const updateData = {};
                slotIds.forEach(slotId => {
                    updateData[`slots.${slotId}`] = arrayUnion(targetUserId);
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

        // Optimistic update
        const currentData = _cache.get(cacheKey);
        if (currentData && currentData.slots) {
            slotIds.forEach(slotId => {
                if (currentData.slots[slotId]) {
                    currentData.slots[slotId] = currentData.slots[slotId]
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
                });
                updateData.lastUpdated = serverTimestamp();

                await updateDoc(docRef, updateData);
                console.log(`🔧 DEV: Removed ${userId} from ${slotIds.length} slots`);
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

        // Optimistic update
        const currentData = _cache.get(cacheKey);
        if (currentData && currentData.slots) {
            slotIds.forEach(slotId => {
                if (currentData.slots[slotId]) {
                    currentData.slots[slotId] = currentData.slots[slotId]
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
                });
                updateData.lastUpdated = serverTimestamp();

                await updateDoc(docRef, updateData);
                console.log(`🔧 DEV: Removed ${targetUserId} from ${slotIds.length} slots (by ${currentUserId})`);
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

    /**
     * Cleanup - clear all listeners and cache
     */
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
        unsubscribeAll,
        addMeToSlots,
        addPlayerToSlots,
        removeMeFromSlots,
        removePlayerFromSlots,
        getSlotPlayers,
        isUserInSlot,
        getCachedData,
        updateCache,
        cleanup
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', AvailabilityService.init);
