// PlayerDisplayService.js - Display mode management and player lookup
// Following CLAUDE.md architecture: Lightweight helper service
// Slice 5.0.1: Expanded to 4 display modes with color support

const PlayerDisplayService = (function() {
    'use strict';

    const STORAGE_KEY = 'matchscheduler_display_mode';
    const DEFAULT_MODE = 'initials';

    // Valid display modes (Slice 5.0.1)
    const VALID_MODES = ['initials', 'coloredInitials', 'coloredDots', 'avatars'];

    /**
     * Get current display mode from localStorage
     * @returns {'initials' | 'coloredInitials' | 'coloredDots' | 'avatars'}
     */
    function getDisplayMode() {
        const stored = localStorage.getItem(STORAGE_KEY);
        // Validate stored mode is still valid (handles legacy 'avatars' -> new modes)
        if (stored && VALID_MODES.includes(stored)) {
            return stored;
        }
        return DEFAULT_MODE;
    }

    /**
     * Set display mode and persist to localStorage
     * @param {'initials' | 'coloredInitials' | 'coloredDots' | 'avatars'} mode
     * @returns {boolean} Success
     */
    function setDisplayMode(mode) {
        if (VALID_MODES.includes(mode)) {
            localStorage.setItem(STORAGE_KEY, mode);
            console.log('📺 Display mode set to:', mode);

            // Dispatch event for listeners
            window.dispatchEvent(new CustomEvent('display-mode-changed', {
                detail: { mode }
            }));

            return true;
        }
        return false;
    }

    /**
     * Get all valid display modes
     * @returns {string[]}
     */
    function getValidModes() {
        return [...VALID_MODES];
    }

    /**
     * Get display info for a player
     * @param {string} userId - The player's user ID
     * @param {Array} playerRoster - Team's playerRoster array
     * @param {string} currentUserId - Current logged-in user ID
     * @returns {Object} { initials, displayName, photoURL, isCurrentUser, found }
     */
    function getPlayerDisplay(userId, playerRoster, currentUserId) {
        const player = playerRoster?.find(p => p.userId === userId);

        if (!player) {
            return {
                initials: '??',
                displayName: 'Unknown Player',
                photoURL: null,
                isCurrentUser: userId === currentUserId,
                found: false
            };
        }

        return {
            initials: player.initials || player.displayName?.substring(0, 2).toUpperCase() || '??',
            displayName: player.displayName || 'Unknown',
            photoURL: player.photoURL || null,
            isCurrentUser: userId === currentUserId,
            found: true
        };
    }

    /**
     * Get display info for multiple players
     * @param {Array<string>} userIds - Array of user IDs
     * @param {Array} playerRoster - Team's playerRoster array
     * @param {string} currentUserId - Current logged-in user ID
     * @returns {Array} Array of player display objects with userId included
     */
    function getPlayersDisplay(userIds, playerRoster, currentUserId) {
        return userIds.map(userId => ({
            userId,
            ...getPlayerDisplay(userId, playerRoster, currentUserId)
        }));
    }

    return {
        getDisplayMode,
        setDisplayMode,
        getValidModes,
        getPlayerDisplay,
        getPlayersDisplay
    };
})();
