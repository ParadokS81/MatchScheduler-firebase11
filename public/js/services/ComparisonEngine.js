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
        const year = DateUtils.getISOWeekYear(new Date());
        const maxWeek = DateUtils.getISOWeeksInYear(year);

        // Format: "YYYY-WW" (ISO format with leading zero)
        const week1 = `${year}-${String(currentWeek).padStart(2, '0')}`;

        // Handle year boundary (week 52 or 53 → week 1 of next year)
        let week2;
        if (currentWeek >= maxWeek) {
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
        const validOpponents = _opponentTeamIds.filter(id => id !== _userTeamId);

        for (const weekId of weeks) {
            // Load user team + ALL opponent availability in parallel
            const loadPromises = [
                AvailabilityService.loadWeekAvailability(_userTeamId, weekId),
                ...validOpponents.map(id => AvailabilityService.loadWeekAvailability(id, weekId))
            ];
            const [userAvail, ...opponentAvails] = await Promise.all(loadPromises);

            const userSlots = userAvail?.slots || {};

            // Get blocked slots for user team (matches already scheduled)
            const userBlocked = typeof ScheduledMatchService !== 'undefined'
                ? ScheduledMatchService.getBlockedSlotsForTeam(_userTeamId, weekId)
                : new Set();

            for (let i = 0; i < validOpponents.length; i++) {
                const opponentId = validOpponents[i];
                const opponentSlots = opponentAvails[i]?.slots || {};

                // Get blocked slots for opponent team
                const opponentBlocked = typeof ScheduledMatchService !== 'undefined'
                    ? ScheduledMatchService.getBlockedSlotsForTeam(opponentId, weekId)
                    : new Set();

                // Get opponent team data from cache (synchronous)
                const opponentTeam = TeamService.getTeamFromCache(opponentId);

                // Privacy: skip teams that hide from comparison
                if (opponentTeam?.hideFromComparison) continue;

                const opponentRoster = opponentTeam?.playerRoster || [];

                // Check each slot where either team has availability
                const allSlotIds = new Set([
                    ...Object.keys(userSlots),
                    ...Object.keys(opponentSlots)
                ]);

                for (const slotId of allSlotIds) {
                    // Skip slots blocked by either team's existing matches
                    if (userBlocked.has(slotId) || opponentBlocked.has(slotId)) continue;

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
                        let availablePlayers, unavailablePlayers;

                        if (opponentTeam?.hideRosterNames) {
                            // Privacy: anonymous placeholders (counts preserved, names hidden)
                            availablePlayers = opponentPlayers.map((_, i) => ({
                                userId: `anon-${i}`, displayName: null, initials: null, photoURL: null, _anonymous: true
                            }));
                            unavailablePlayers = opponentRoster
                                .filter(p => !opponentPlayers.includes(p.userId))
                                .map((_, i) => ({
                                    userId: `anon-u-${i}`, displayName: null, initials: null, photoURL: null, _anonymous: true
                                }));
                        } else {
                            availablePlayers = opponentRoster.filter(p =>
                                opponentPlayers.includes(p.userId)
                            );
                            unavailablePlayers = opponentRoster.filter(p =>
                                !opponentPlayers.includes(p.userId)
                            );
                        }

                        _matches[fullSlotId].push({
                            teamId: opponentId,
                            teamTag: opponentTeam?.teamTag || '??',
                            teamName: opponentTeam?.teamName || 'Unknown',
                            leaderId: opponentTeam?.leaderId || null,
                            hideRosterNames: opponentTeam?.hideRosterNames || false,
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
            matches: { ..._matches },
            filters: { ..._filters }
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

    // Recalculate when weeks change (user navigates weeks while comparison is active)
    window.addEventListener('week-navigation-changed', () => {
        if (_active) {
            _calculateMatches();
        }
    });

    // Listen for filter changes
    window.addEventListener('filter-changed', (e) => {
        _filters = {
            yourTeam: e.detail.yourTeam,
            opponent: e.detail.opponent
        };
        if (_active) {
            _calculateMatches();
        }
    });

    // Slice 17.0a: Always react to team selection — no autoMode gate
    window.addEventListener('team-selection-changed', (e) => {
        // Derive user team fresh each time
        const userTeamId = (typeof MatchSchedulerApp !== 'undefined' && MatchSchedulerApp.getSelectedTeam()?.id)
            || (typeof MobileApp !== 'undefined' && MobileApp.getSelectedTeamId())
            || null;

        if (!userTeamId) return; // No team selected in grid — can't compare

        _userTeamId = userTeamId;

        // Get current filters
        if (typeof FilterService !== 'undefined') {
            _filters = FilterService.getFilters();
        }

        const selected = e.detail.selectedTeams || [];
        _opponentTeamIds = selected.filter(id => id !== userTeamId);

        if (_opponentTeamIds.length > 0) {
            const wasActive = _active;
            _active = true;
            _calculateMatches();
            if (!wasActive) {
                window.dispatchEvent(new CustomEvent('comparison-started', {
                    detail: { userTeamId: _userTeamId, opponentTeamIds: _opponentTeamIds }
                }));
            }
        } else {
            if (_active) {
                _active = false;
                _matches = {};
                _userTeamCounts = {};
                window.dispatchEvent(new CustomEvent('comparison-ended'));
            }
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
