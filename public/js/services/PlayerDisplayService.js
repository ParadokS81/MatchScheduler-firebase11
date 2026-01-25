// PlayerDisplayService.js - Display mode management and player lookup
// Following CLAUDE.md architecture: Lightweight helper service

const PlayerDisplayService = (function() {
    'use strict';

    const STORAGE_KEY = 'matchscheduler_display_mode';
    const DEFAULT_MODE = 'initials';

    /**
     * Get current display mode from localStorage
     * @returns {'initials' | 'avatars'}
     */
    function getDisplayMode() {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE;
    }

    /**
     * Set display mode and persist to localStorage
     * @param {'initials' | 'avatars'} mode
     * @returns {boolean} Success
     */
    function setDisplayMode(mode) {
        if (mode === 'initials' || mode === 'avatars') {
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
        getPlayerDisplay,
        getPlayersDisplay
    };
})();
