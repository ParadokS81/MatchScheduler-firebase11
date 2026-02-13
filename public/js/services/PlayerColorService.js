// PlayerColorService.js - Player color assignment management
// Following CLAUDE.md architecture: Lightweight helper service
// Slice 5.0.1: Manages per-user color assignments for roster members

const PlayerColorService = (function() {
    'use strict';

    // Local cache of player colors (loaded from current user's document)
    let _playerColors = {};
    let _initialized = false;
    let _unsubscribe = null;

    // Default color for unassigned players (used in coloredDots mode)
    const DEFAULT_COLOR = '#6B7280'; // gray-500

    // Preset colors - 6 colors at 60° hue intervals (+ gray default = 7 distinct)
    const PRESET_COLORS = [
        '#E06666', // Red      (0°)
        '#FFD966', // Yellow   (60°)
        '#93C47D', // Green    (120°)
        '#76A5AF', // Teal     (180°)
        '#6D9EEB', // Blue     (240°)
        '#C27BA0', // Pink     (300°)
    ];

    /**
     * Initialize the service and load colors from current user's document
     */
    async function init() {
        if (_initialized) return;

        const userId = window.firebase?.auth?.currentUser?.uid;
        if (!userId) {
            console.log('PlayerColorService: No user, skipping init');
            return;
        }

        try {
            const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const db = window.firebase.db;

            // Set up listener for user document to get playerColors
            _unsubscribe = onSnapshot(
                doc(db, 'users', userId),
                (docSnapshot) => {
                    if (docSnapshot.exists()) {
                        _playerColors = docSnapshot.data().playerColors || {};
                        console.log('🎨 Player colors loaded:', Object.keys(_playerColors).length, 'assignments');

                        // Notify listeners that colors changed
                        window.dispatchEvent(new CustomEvent('player-colors-changed'));
                    }
                },
                (error) => {
                    console.error('PlayerColorService listener error:', error);
                }
            );

            _initialized = true;
            console.log('🎨 PlayerColorService initialized');

        } catch (error) {
            console.error('Failed to initialize PlayerColorService:', error);
        }
    }

    /**
     * Get color assigned to a player by current user
     * @param {string} targetUserId - The player to get color for
     * @returns {string|null} Hex color or null if not assigned
     */
    function getPlayerColor(targetUserId) {
        return _playerColors[targetUserId] || null;
    }

    /**
     * Get color for a player, with deterministic random fallback from preset palette
     * @param {string} targetUserId - The player to get color for
     * @returns {string} Hex color (assigned or random-from-palette)
     */
    function getPlayerColorOrDefault(targetUserId) {
        if (_playerColors[targetUserId]) return _playerColors[targetUserId];
        // Deterministic "random" color based on userId hash — same user always gets same color
        let hash = 0;
        for (let i = 0; i < targetUserId.length; i++) {
            hash = ((hash << 5) - hash) + targetUserId.charCodeAt(i);
            hash |= 0;
        }
        return PRESET_COLORS[Math.abs(hash) % PRESET_COLORS.length];
    }

    /**
     * Set color for a player (persisted to current user's Firestore document)
     * @param {string} targetUserId - The player to assign color to
     * @param {string|null} color - Hex color or null to clear
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function setPlayerColor(targetUserId, color) {
        const userId = window.firebase?.auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: 'Not authenticated' };
        }

        // Validate color format if provided
        if (color && !isValidHex(color)) {
            return { success: false, error: 'Invalid color format' };
        }

        // Optimistic update
        const previousColor = _playerColors[targetUserId];
        if (color) {
            _playerColors[targetUserId] = color;
        } else {
            delete _playerColors[targetUserId];
        }

        // Notify listeners immediately (optimistic)
        window.dispatchEvent(new CustomEvent('player-colors-changed'));

        try {
            const { doc, setDoc, updateDoc, deleteField } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const db = window.firebase.db;
            const userRef = doc(db, 'users', userId);

            if (color) {
                // Use updateDoc with dot-notation path (not setDoc+merge which can fail on new fields)
                await updateDoc(userRef, {
                    [`playerColors.${targetUserId}`]: color
                });
            } else {
                // Use updateDoc with deleteField to remove the color
                await updateDoc(userRef, {
                    [`playerColors.${targetUserId}`]: deleteField()
                });
            }

            console.log('🎨 Player color saved:', targetUserId, color || '(cleared)');
            return { success: true };

        } catch (error) {
            console.error('Failed to save player color:', error);

            // Revert optimistic update
            if (previousColor) {
                _playerColors[targetUserId] = previousColor;
            } else {
                delete _playerColors[targetUserId];
            }
            window.dispatchEvent(new CustomEvent('player-colors-changed'));

            return { success: false, error: error.message };
        }
    }

    /**
     * Get all player colors (for bulk operations)
     * @returns {Object} Map of userId -> color
     */
    function getAllPlayerColors() {
        return { ..._playerColors };
    }

    /**
     * Get preset color palette
     * @returns {string[]} Array of hex colors
     */
    function getPresetColors() {
        return [...PRESET_COLORS];
    }

    /**
     * Get default color for unassigned players
     * @returns {string} Hex color
     */
    function getDefaultColor() {
        return DEFAULT_COLOR;
    }

    /**
     * Validate hex color format
     * @param {string} str - String to validate
     * @returns {boolean} True if valid hex color
     */
    function isValidHex(str) {
        return /^#[0-9A-Fa-f]{6}$/.test(str);
    }

    /**
     * Cleanup the service (call on logout)
     */
    function cleanup() {
        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }
        _playerColors = {};
        _initialized = false;
        console.log('🧹 PlayerColorService cleaned up');
    }

    /**
     * Re-initialize after user change
     */
    async function reinit() {
        cleanup();
        await init();
    }

    /**
     * Setup auth listener to reinit when user changes
     */
    function _setupAuthListener() {
        // Listen for auth state changes via AuthService
        if (typeof AuthService !== 'undefined') {
            AuthService.onAuthStateChange(async (user) => {
                if (user) {
                    // User signed in - initialize
                    await init();
                } else {
                    // User signed out - cleanup
                    cleanup();
                }
            });
        }
    }

    // Auto-setup auth listener when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _setupAuthListener);
    } else {
        // DOM already loaded, setup immediately
        setTimeout(_setupAuthListener, 100); // Small delay to ensure AuthService is ready
    }

    return {
        init,
        cleanup,
        reinit,
        getPlayerColor,
        getPlayerColorOrDefault,
        setPlayerColor,
        getAllPlayerColors,
        getPresetColors,
        getDefaultColor,
        isValidHex
    };
})();
