// BotRegistrationService - Voice bot registration management (Phase 1a)
// Following CLAUDE.md architecture: Cache + Listeners pattern

const BotRegistrationService = (function() {
    'use strict';

    // Bot client ID for Discord invite link
    const BOT_CLIENT_ID = '1470520759842640024';
    // Permissions: Manage Channels + View Channel + Send Messages + Attach Files + Connect + Speak + Move Members = 19958800
    const BOT_PERMISSIONS = '19958800';

    let _initialized = false;
    let _db = null;
    let _functions = null;
    let _cache = new Map(); // Key: teamId, Value: registration data or null
    let _initRetryCount = 0;

    /**
     * Initialize the service
     */
    function init() {
        if (_initialized) return;

        if (typeof window.firebase === 'undefined') {
            if (_initRetryCount < 50) {
                _initRetryCount++;
                setTimeout(init, 100);
                return;
            }
            console.error('❌ BotRegistrationService: Firebase failed to load');
            return;
        }

        _initRetryCount = 0;
        _db = window.firebase.db;
        _functions = window.firebase.functions;
        _initialized = true;

        console.log('🤖 BotRegistrationService initialized');
    }

    /**
     * Get the Discord bot invite URL
     */
    function getBotInviteUrl() {
        return `https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}&permissions=${BOT_PERMISSIONS}&scope=bot+applications.commands`;
    }

    /**
     * Call Cloud Function to create pending registration
     */
    async function connectBot(teamId) {
        if (!_initialized || !_functions) {
            throw new Error('BotRegistrationService not initialized');
        }

        const { httpsCallable } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
        );

        const manageBotRegistration = httpsCallable(_functions, 'manageBotRegistration');
        const result = await manageBotRegistration({ action: 'connect', teamId });

        if (result.data.success) {
            const regData = {
                ...result.data.registration,
                botAlreadyInGuilds: result.data.botAlreadyInGuilds || [],
            };
            _cache.set(teamId, regData);
            return regData;
        }

        throw new Error(result.data.error || 'Failed to connect bot');
    }

    /**
     * Call Cloud Function to delete registration
     */
    async function disconnectBot(teamId) {
        if (!_initialized || !_functions) {
            throw new Error('BotRegistrationService not initialized');
        }

        const { httpsCallable } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
        );

        const manageBotRegistration = httpsCallable(_functions, 'manageBotRegistration');
        const result = await manageBotRegistration({ action: 'disconnect', teamId });

        if (result.data.success) {
            _cache.delete(teamId);
            return true;
        }

        throw new Error(result.data.error || 'Failed to disconnect bot');
    }

    /**
     * Call Cloud Function to update auto-record and schedule channel settings
     * @param {string} teamId
     * @param {{ autoRecord?: object, scheduleChannel?: object }} settings
     */
    async function updateSettings(teamId, settings) {
        if (!_initialized || !_functions) {
            throw new Error('BotRegistrationService not initialized');
        }

        const { httpsCallable } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
        );

        const manageBotRegistration = httpsCallable(_functions, 'manageBotRegistration');
        const result = await manageBotRegistration({ action: 'updateSettings', teamId, ...settings });

        if (result.data.success) {
            // Update local cache with new settings
            if (_cache.has(teamId) && _cache.get(teamId)) {
                const cached = _cache.get(teamId);
                if (settings.autoRecord !== undefined) cached.autoRecord = settings.autoRecord;
                if (settings.scheduleChannel !== undefined) cached.scheduleChannel = settings.scheduleChannel;
            }
            return { success: true };
        }

        return { success: false, error: result.data.error || 'Failed to update settings' };
    }

    /**
     * Request bot to create a schedule channel in the Discord guild
     * @param {string} teamId
     * @param {string} channelName - Channel name (default: 'schedule')
     */
    async function createChannel(teamId, channelName = 'schedule') {
        if (!_initialized || !_functions) {
            throw new Error('BotRegistrationService not initialized');
        }

        const { httpsCallable } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
        );

        const manageBotRegistration = httpsCallable(_functions, 'manageBotRegistration');
        const result = await manageBotRegistration({ action: 'createChannel', teamId, channelName });
        return result.data;
    }

    /**
     * Get current registration status (one-time read, cache-first)
     */
    async function getRegistration(teamId) {
        if (_cache.has(teamId)) {
            return _cache.get(teamId);
        }

        if (!_initialized || !_db) return null;

        try {
            const { doc, getDoc } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
            );

            const docSnap = await getDoc(doc(_db, 'botRegistrations', teamId));
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() };
                _cache.set(teamId, data);
                return data;
            }

            _cache.set(teamId, null);
            return null;
        } catch (error) {
            console.error('❌ Error getting bot registration:', error);
            return null;
        }
    }

    /**
     * Real-time listener for registration status changes.
     * Auto-updates when bot completes /register in Discord (pending → active).
     * Returns unsubscribe function.
     */
    function onRegistrationChange(teamId, callback) {
        if (!_initialized || !_db) {
            console.warn('BotRegistrationService not initialized');
            return () => {};
        }

        // Use synchronous require-style since we need to return unsubscribe immediately
        // The listener will be set up asynchronously
        let unsubscribeFn = null;

        (async () => {
            try {
                const { doc, onSnapshot } = await import(
                    'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
                );

                const docRef = doc(_db, 'botRegistrations', teamId);

                unsubscribeFn = onSnapshot(
                    docRef,
                    (docSnap) => {
                        if (docSnap.exists()) {
                            const data = { id: docSnap.id, ...docSnap.data() };
                            // Treat 'disconnecting' as not registered — UI reverts immediately
                            if (data.status === 'disconnecting') {
                                _cache.delete(teamId);
                                callback(null);
                            } else {
                                _cache.set(teamId, data);
                                callback(data);
                            }
                        } else {
                            _cache.delete(teamId);
                            callback(null);
                        }
                    },
                    (error) => {
                        console.error('❌ Bot registration listener error:', error);
                        callback(null);
                    }
                );
            } catch (error) {
                console.error('❌ Error setting up bot registration listener:', error);
                callback(null);
            }
        })();

        // Return a function that will unsubscribe when the async setup completes
        return () => {
            if (unsubscribeFn) unsubscribeFn();
        };
    }

    /**
     * Get cached registration (synchronous, for initial render)
     */
    function getCachedRegistration(teamId) {
        return _cache.has(teamId) ? _cache.get(teamId) : undefined;
    }

    /**
     * Load ALL bot registrations (admin only).
     * Returns array of all registration docs.
     */
    async function loadAllRegistrations() {
        if (!_initialized || !_db) {
            init();
            if (!_db) return [];
        }

        const { collection, getDocs } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        const snapshot = await getDocs(
            collection(_db, 'botRegistrations')
        );

        const registrations = [];
        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            _cache.set(doc.id, data);
            registrations.push(data);
        });
        return registrations;
    }

    // Public API
    return {
        init,
        getBotInviteUrl,
        connectBot,
        disconnectBot,
        updateSettings,
        createChannel,
        getRegistration,
        onRegistrationChange,
        getCachedRegistration,
        loadAllRegistrations
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', BotRegistrationService.init);
