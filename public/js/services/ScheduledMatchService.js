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
        return Array.from(_matchCache.values()).filter(m => !_isMatchPast(m));
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

    // ─── Time Helpers ─────────────────────────────────────────────────

    /**
     * Check if a scheduled match's time has passed.
     * Uses scheduledDate (ISO date) + slotId (UTC time like "thu_2200").
     * Match is considered past 30 minutes after slot start (one timeslot).
     * Mirrors: functions/expire-scheduled-matches.js isMatchPast()
     */
    function _isMatchPast(match) {
        if (!match.scheduledDate || !match.slotId) return false;

        const timePart = match.slotId.split('_')[1]; // "2200"
        if (!timePart || timePart.length < 4) return false;

        const hours = parseInt(timePart.slice(0, 2));
        const minutes = parseInt(timePart.slice(2));

        const matchDate = new Date(match.scheduledDate + 'T00:00:00Z');
        matchDate.setUTCHours(hours, minutes, 0, 0);

        // 30 min buffer — one timeslot. Match at 20:00 expires at 20:30.
        const expiryTime = matchDate.getTime() + 30 * 60 * 1000;

        return Date.now() > expiryTime;
    }

    // ─── Blocked Slot Lookups ──────────────────────────────────────────

    /**
     * Get blocked slot IDs for a team in a specific week.
     * A slot is blocked when a scheduled match exists for that team + week + slot.
     * Also blocks the previous and next 30-min slots as buffer (can't start a match
     * 30 min before or after another one).
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
                const before = _prevSlot(match.blockedSlot);
                if (before) blocked.add(before);
                const after = _nextSlot(match.blockedSlot);
                if (after) blocked.add(after);
            }
        }

        return blocked;
    }

    /**
     * Compute the next 30-min slot after a given slotId.
     * e.g. "thu_2230" → "thu_2300", "thu_2330" → "fri_0000"
     * Returns null if it would wrap past Sunday (end of week).
     */
    function _nextSlot(slotId) {
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const [day, time] = slotId.split('_');
        let h = parseInt(time.slice(0, 2));
        let m = parseInt(time.slice(2));
        let dayIdx = days.indexOf(day);

        m += 30;
        if (m >= 60) { m = 0; h++; }
        if (h >= 24) { h = 0; dayIdx++; }
        if (dayIdx >= days.length) return null; // past end of week

        return `${days[dayIdx]}_${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
    }

    /**
     * Compute the previous 30-min slot before a given slotId.
     * e.g. "thu_2300" → "thu_2230", "fri_0000" → "thu_2330"
     * Returns null if it would wrap before Monday (start of week).
     */
    function _prevSlot(slotId) {
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const [day, time] = slotId.split('_');
        let h = parseInt(time.slice(0, 2));
        let m = parseInt(time.slice(2));
        let dayIdx = days.indexOf(day);

        m -= 30;
        if (m < 0) { m = 30; h--; }
        if (h < 0) { h = 23; dayIdx--; }
        if (dayIdx < 0) return null; // before start of week

        return `${days[dayIdx]}_${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
    }

    /**
     * Get upcoming matches for specific team IDs
     * @param {string[]} teamIds
     * @returns {Array} Filtered matches
     */
    function getUpcomingMatchesForTeams(teamIds) {
        return Array.from(_matchCache.values()).filter(match =>
            match.status === 'upcoming' &&
            !_isMatchPast(match) &&
            (teamIds.includes(match.teamAId) || teamIds.includes(match.teamBId))
        );
    }

    // ─── Cloud Function Calls ──────────────────────────────────────────

    /**
     * Quick-add a pre-arranged match (bypasses proposal workflow).
     * @param {Object} params
     * @param {string} params.teamId - Your team
     * @param {string} params.opponentTeamId - Opponent team
     * @param {string} params.dateTime - ISO 8601 UTC datetime
     * @param {string} params.gameType - 'official' or 'practice'
     * @returns {Promise<{success: boolean, matchId?: string, error?: string}>}
     */
    async function quickAddMatch({ teamId, opponentTeamId, dateTime, gameType }) {
        try {
            return await TeamService.callFunction('quickAddMatch', {
                teamId, opponentTeamId, dateTime, gameType
            });
        } catch (error) {
            console.error('quickAddMatch error:', error);
            return { success: false, error: error.message || 'Unknown error' };
        }
    }

    /**
     * Reschedule an existing match to a new time slot.
     * @param {string} matchId
     * @param {string} dateTime - ISO 8601 UTC datetime
     * @returns {Promise<{success: boolean, newSlotId?: string, error?: string}>}
     */
    async function rescheduleMatch(matchId, dateTime) {
        try {
            return await TeamService.callFunction('rescheduleMatch', { matchId, dateTime });
        } catch (error) {
            console.error('rescheduleMatch error:', error);
            return { success: false, error: error.message || 'Unknown error' };
        }
    }

    // ─── Public API ────────────────────────────────────────────────────

    return {
        getMatchesFromCache,
        getMatch,
        updateCache,
        removeFromCache,
        clearCache,
        getBlockedSlotsForTeam,
        getUpcomingMatchesForTeams,
        quickAddMatch,
        rescheduleMatch
    };
})();
