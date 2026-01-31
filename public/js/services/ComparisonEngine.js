// ComparisonEngine.js - Manages team comparison state and calculations
// Slice 3.4: Basic Comparison
// Follows Cache + Event pattern per CLAUDE.md

const ComparisonEngine = (function() {
    'use strict';

    // Constants
    const FULL_MATCH_THRESHOLD = 4; // 4v4 game requirement

    // State
    let _active = false;
    let _userTeamId = null;
    let _opponentTeamIds = [];
    let _filters = { yourTeam: 1, opponent: 1 };
    let _matches = {}; // fullSlotId → [{ teamId, teamTag, teamName, availablePlayers, unavailablePlayers }]
    let _userTeamCounts = {}; // fullSlotId → number (user team player count per slot)

    // ========================================
    // Private Helpers
    // ========================================

    /**
     * Get visible week IDs based on current week number
     * @returns {string[]} Array of week IDs like ['2026-05', '2026-06']
     */
    function _getVisibleWeeks() {
        const currentWeek = WeekNavigation.getCurrentWeekNumber();
        const now = new Date();
        const year = now.getUTCFullYear();

        // Format: "YYYY-WW" (ISO format with leading zero)
        const week1 = `${year}-${String(currentWeek).padStart(2, '0')}`;

        // Handle year boundary
        let week2;
        if (currentWeek >= 52) {
            week2 = `${year + 1}-01`;
        } else {
            week2 = `${year}-${String(currentWeek + 1).padStart(2, '0')}`;
        }

        return [week1, week2];
    }

    /**
     * Calculate matching slots between user team and opponents
     */
    async function _calculateMatches() {
        _matches = {};
        _userTeamCounts = {};

        const weeks = _getVisibleWeeks();

        for (const weekId of weeks) {
            // Load user team availability (cache-first)
            const userAvail = await AvailabilityService.loadWeekAvailability(_userTeamId, weekId);
            const userSlots = userAvail?.slots || {};

            for (const opponentId of _opponentTeamIds) {
                // Skip if this is somehow the user's team
                if (opponentId === _userTeamId) continue;

                // Load opponent availability (cache-first)
                const opponentAvail = await AvailabilityService.loadWeekAvailability(opponentId, weekId);
                const opponentSlots = opponentAvail?.slots || {};

                // Get opponent team data from cache (synchronous)
                const opponentTeam = TeamService.getTeamFromCache(opponentId);
                const opponentRoster = opponentTeam?.playerRoster || [];

                // Check each slot where user team has availability
                const allSlotIds = new Set([
                    ...Object.keys(userSlots),
                    ...Object.keys(opponentSlots)
                ]);

                for (const slotId of allSlotIds) {
                    const userPlayers = userSlots[slotId] || [];
                    const opponentPlayers = opponentSlots[slotId] || [];
                    const userCount = userPlayers.length;
                    const opponentCount = opponentPlayers.length;

                    const fullSlotId = `${weekId}_${slotId}`;

                    // Store user team count for later reference
                    if (userCount > 0) {
                        _userTeamCounts[fullSlotId] = userCount;
                    }

                    // Check if this slot matches filter criteria
                    const meetsUserFilter = userCount >= _filters.yourTeam;
                    const meetsOpponentFilter = opponentCount >= _filters.opponent;

                    if (meetsUserFilter && meetsOpponentFilter) {
                        if (!_matches[fullSlotId]) {
                            _matches[fullSlotId] = [];
                        }

                        // Build roster details for tooltip
                        const availablePlayers = opponentRoster.filter(p =>
                            opponentPlayers.includes(p.userId)
                        );
                        const unavailablePlayers = opponentRoster.filter(p =>
                            !opponentPlayers.includes(p.userId)
                        );

                        _matches[fullSlotId].push({
                            teamId: opponentId,
                            teamTag: opponentTeam?.teamTag || '??',
                            teamName: opponentTeam?.teamName || 'Unknown',
                            leaderId: opponentTeam?.leaderId || null,
                            availablePlayers,
                            unavailablePlayers
                        });
                    }
                }
            }
        }

        // Dispatch update event
        window.dispatchEvent(new CustomEvent('comparison-updated', {
            detail: { matches: _matches }
        }));
    }

    // ========================================
    // Public API
    // ========================================

    /**
     * Start comparison mode
     * @param {string} userTeamId - The user's team ID
     * @param {string[]} opponentTeamIds - Array of opponent team IDs
     * @param {Object} filters - { yourTeam: number, opponent: number }
     */
    async function startComparison(userTeamId, opponentTeamIds, filters) {
        _userTeamId = userTeamId;
        _opponentTeamIds = opponentTeamIds;
        _filters = filters || { yourTeam: 1, opponent: 1 };
        _active = true;

        await _calculateMatches();

        window.dispatchEvent(new CustomEvent('comparison-started', {
            detail: { userTeamId, opponentTeamIds }
        }));
    }

    /**
     * End comparison mode
     */
    function endComparison() {
        _active = false;
        _userTeamId = null;
        _opponentTeamIds = [];
        _matches = {};
        _userTeamCounts = {};

        window.dispatchEvent(new CustomEvent('comparison-ended'));
    }

    /**
     * Check if a slot has any matches
     * @param {string} weekId - Week ID (e.g., '2026-05')
     * @param {string} slotId - Slot ID (e.g., 'mon_1900')
     * @returns {boolean}
     */
    function isSlotMatch(weekId, slotId) {
        const fullSlotId = `${weekId}_${slotId}`;
        return _active && (_matches[fullSlotId]?.length > 0);
    }

    /**
     * Get matches for a specific slot
     * @param {string} weekId - Week ID
     * @param {string} slotId - Slot ID
     * @returns {Array} Array of match objects
     */
    function getSlotMatches(weekId, slotId) {
        const fullSlotId = `${weekId}_${slotId}`;
        return _matches[fullSlotId] || [];
    }

    /**
     * Get detailed match info for a slot (includes full/partial status)
     * @param {string} weekId - Week ID
     * @param {string} slotId - Slot ID
     * @returns {Object} { hasMatch: boolean, isFullMatch: boolean, matches: Array }
     */
    function getSlotMatchInfo(weekId, slotId) {
        const fullSlotId = `${weekId}_${slotId}`;
        const matches = _matches[fullSlotId] || [];

        if (!_active || matches.length === 0) {
            return { hasMatch: false, isFullMatch: false, matches: [] };
        }

        // Check if ANY opponent has 4+ available AND user team has 4+
        const userCount = _userTeamCounts[fullSlotId] || 0;
        const isFullMatch = userCount >= FULL_MATCH_THRESHOLD &&
            matches.some(m => m.availablePlayers.length >= FULL_MATCH_THRESHOLD);

        return {
            hasMatch: true,
            isFullMatch,
            matches
        };
    }

    /**
     * Get current comparison state
     * @returns {Object}
     */
    function getComparisonState() {
        return {
            active: _active,
            userTeamId: _userTeamId,
            opponentTeamIds: [..._opponentTeamIds],
            matches: { ..._matches }
        };
    }

    /**
     * Get user team info for tooltip display
     * @param {string} weekId - Week ID
     * @param {string} slotId - Slot ID
     * @returns {Object|null} { teamId, teamTag, teamName, availablePlayers, unavailablePlayers }
     */
    function getUserTeamInfo(weekId, slotId) {
        if (!_active || !_userTeamId) return null;

        const fullSlotId = `${weekId}_${slotId}`;
        const userCount = _userTeamCounts[fullSlotId];
        if (!userCount) return null;

        // Get user team data from cache
        const userTeam = TeamService.getTeamFromCache(_userTeamId);
        if (!userTeam) return null;

        const userRoster = userTeam.playerRoster || [];

        // Get availability data from cache
        const userAvail = AvailabilityService.getCachedData(_userTeamId, weekId);
        const userSlots = userAvail?.slots || {};
        const availablePlayerIds = userSlots[slotId] || [];

        const availablePlayers = userRoster.filter(p =>
            availablePlayerIds.includes(p.userId)
        );
        const unavailablePlayers = userRoster.filter(p =>
            !availablePlayerIds.includes(p.userId)
        );

        return {
            teamId: _userTeamId,
            teamTag: userTeam.teamTag || '??',
            teamName: userTeam.teamName || 'Your Team',
            leaderId: userTeam.leaderId || null,
            availablePlayers,
            unavailablePlayers
        };
    }

    /**
     * Recalculate matches (called when filters change or availability updates)
     */
    function recalculate() {
        if (_active) {
            _calculateMatches();
        }
    }

    /**
     * Check if comparison mode is active
     * @returns {boolean}
     */
    function isActive() {
        return _active;
    }

    // ========================================
    // Event Listeners
    // ========================================

    // Listen for filter changes
    window.addEventListener('filter-changed', (e) => {
        if (_active) {
            _filters = {
                yourTeam: e.detail.yourTeam,
                opponent: e.detail.opponent
            };
            _calculateMatches();
        }
    });

    // Public API
    return {
        startComparison,
        endComparison,
        isSlotMatch,
        getSlotMatches,
        getSlotMatchInfo,
        getUserTeamInfo,
        getComparisonState,
        recalculate,
        isActive
    };
})();

// Make globally accessible
window.ComparisonEngine = ComparisonEngine;
