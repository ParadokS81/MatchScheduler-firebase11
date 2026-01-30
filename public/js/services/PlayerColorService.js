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

    // Preset colors optimized for dark backgrounds
    const PRESET_COLORS = [
        '#FF6B6B', // Red
        '#FF8E53', // Orange
        '#FFD93D', // Yellow
        '#6BCB77', // Green
        '#4ECDC4', // Teal
        '#45B7D1', // Cyan
        '#5D9CEC', // Blue
        '#A78BFA', // Purple
        '#F472B6', // Pink
        '#9CA3AF', // Gray
        '#FBBF24', // Amber
        '#34D399', // Emerald
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
     * Get color for a player, with default fallback for display modes that need a color
     * @param {string} targetUserId - The player to get color for
     * @returns {string} Hex color (assigned or default gray)
     */
    function getPlayerColorOrDefault(targetUserId) {
        return _playerColors[targetUserId] || DEFAULT_COLOR;
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
                // Use setDoc with merge to add/update the color
                await setDoc(userRef, {
                    playerColors: { [targetUserId]: color }
                }, { merge: true });
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
