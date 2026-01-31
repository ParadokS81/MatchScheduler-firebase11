// ScheduledMatchService.js - Scheduled match cache + blocked slot lookups
// Slice 8.0b: Manages scheduled match cache for double-booking prevention
// Following Cache + Listener pattern per CLAUDE.md: Service manages cache only, components own listeners

const ScheduledMatchService = (function() {
    'use strict';

    // Cache: matchId → match data
    let _matchCache = new Map();

    // ─── Cache Management ──────────────────────────────────────────────

    /**
     * Get all cached matches
     * @returns {Array} Array of match objects
     */
    function getMatchesFromCache() {
        return Array.from(_matchCache.values());
    }

    /**
     * Get a specific match from cache
     * @param {string} matchId
     * @returns {Object|null}
     */
    function getMatch(matchId) {
        return _matchCache.get(matchId) || null;
    }

    /**
     * Update cache entry (called by component listeners)
     * @param {string} matchId
     * @param {Object} data - Match data from Firestore
     */
    function updateCache(matchId, data) {
        if (data) {
            _matchCache.set(matchId, { id: matchId, ...data });
        } else {
            _matchCache.delete(matchId);
        }
    }

    /**
     * Remove a match from cache
     * @param {string} matchId
     */
    function removeFromCache(matchId) {
        _matchCache.delete(matchId);
    }

    /**
     * Clear all cached matches
     */
    function clearCache() {
        _matchCache.clear();
    }

    // ─── Blocked Slot Lookups ──────────────────────────────────────────

    /**
     * Get blocked slot IDs for a team in a specific week.
     * A slot is blocked when a scheduled match exists for that team + week + slot.
     *
     * @param {string} teamId
     * @param {string} weekId
     * @returns {Set<string>} Set of blocked slotIds
     */
    function getBlockedSlotsForTeam(teamId, weekId) {
        const blocked = new Set();

        for (const match of _matchCache.values()) {
            if (match.weekId === weekId &&
                match.status === 'upcoming' &&
                match.blockedTeams?.includes(teamId)) {
                blocked.add(match.blockedSlot);
            }
        }

        return blocked;
    }

    /**
     * Get upcoming matches for specific team IDs
     * @param {string[]} teamIds
     * @returns {Array} Filtered matches
     */
    function getUpcomingMatchesForTeams(teamIds) {
        return Array.from(_matchCache.values()).filter(match =>
            match.status === 'upcoming' &&
            (teamIds.includes(match.teamAId) || teamIds.includes(match.teamBId))
        );
    }

    // ─── Public API ────────────────────────────────────────────────────

    return {
        getMatchesFromCache,
        getMatch,
        updateCache,
        removeFromCache,
        clearCache,
        getBlockedSlotsForTeam,
        getUpcomingMatchesForTeams
    };
})();
