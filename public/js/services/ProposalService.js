// ProposalService.js - Match proposal cache + Cloud Function calls
// Slice 8.0b: Manages proposal cache, viable slot computation, and backend calls
// Following Cache + Listener pattern per CLAUDE.md: Service manages cache only, components own listeners

const ProposalService = (function() {
    'use strict';

    // Cache: proposalId → proposal data
    let _proposalCache = new Map();

    // Slot sort order for consistent display
    const DAY_ORDER = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

    // ─── Cache Management ──────────────────────────────────────────────

    /**
     * Get all cached proposals
     * @returns {Array} Array of proposal objects
     */
    function getProposalsFromCache() {
        return Array.from(_proposalCache.values());
    }

    /**
     * Get a specific proposal from cache
     * @param {string} proposalId
     * @returns {Object|null}
     */
    function getProposal(proposalId) {
        return _proposalCache.get(proposalId) || null;
    }

    /**
     * Update cache entry (called by component listeners)
     * @param {string} proposalId
     * @param {Object} data - Proposal data from Firestore
     */
    function updateCache(proposalId, data) {
        if (data) {
            _proposalCache.set(proposalId, { id: proposalId, ...data });
        } else {
            _proposalCache.delete(proposalId);
        }
    }

    /**
     * Remove a proposal from cache
     * @param {string} proposalId
     */
    function removeFromCache(proposalId) {
        _proposalCache.delete(proposalId);
    }

    /**
     * Clear all cached proposals
     */
    function clearCache() {
        _proposalCache.clear();
    }

    // ─── Cloud Function Calls ──────────────────────────────────────────

    /**
     * Create a new match proposal
     * @param {Object} data - { proposerTeamId, opponentTeamId, weekId, minFilter }
     * @returns {Object} { success: boolean, proposalId?: string, error?: string }
     */
    async function createProposal(data) {
        return TeamService.callFunction('createProposal', data);
    }

    /**
     * Confirm a slot on a proposal
     * @param {string} proposalId
     * @param {string} slotId - UTC slot ID
     * @param {string} gameType - 'official' or 'practice' (required)
     * @returns {Object} { success: boolean, matched?: boolean, scheduledMatchId?: string }
     */
    async function confirmSlot(proposalId, slotId, gameType) {
        return TeamService.callFunction('confirmSlot', { proposalId, slotId, gameType });
    }

    /**
     * Withdraw confirmation from a slot
     * @param {string} proposalId
     * @param {string} slotId
     * @returns {Object} { success: boolean }
     */
    async function withdrawConfirmation(proposalId, slotId) {
        return TeamService.callFunction('withdrawConfirmation', { proposalId, slotId });
    }

    /**
     * Cancel a proposal
     * @param {string} proposalId
     * @returns {Object} { success: boolean }
     */
    async function cancelProposal(proposalId) {
        return TeamService.callFunction('cancelProposal', { proposalId });
    }

    /**
     * Cancel a scheduled match and revert its proposal to active
     * @param {string} matchId
     * @returns {Object} { success: boolean, error?: string }
     */
    async function cancelScheduledMatch(matchId) {
        return TeamService.callFunction('cancelScheduledMatch', { matchId });
    }

    // ─── Viable Slot Computation ───────────────────────────────────────

    /**
     * Compute viable slots from cached availability data, filtering blocked slots.
     * Reuses ComparisonEngine's slot-matching logic but scoped to a single opponent + week.
     *
     * @param {string} proposerTeamId
     * @param {string} opponentTeamId
     * @param {string} weekId
     * @param {Object} minFilter - { yourTeam: number, opponent: number }
     * @returns {Array<{ slotId, proposerCount, opponentCount, proposerRoster, opponentRoster }>}
     */
    function computeViableSlots(proposerTeamId, opponentTeamId, weekId, minFilter) {
        // Get availability from cache
        const proposerAvail = AvailabilityService.getCachedData(proposerTeamId, weekId);
        const opponentAvail = AvailabilityService.getCachedData(opponentTeamId, weekId);

        if (!proposerAvail || !opponentAvail) return [];

        const proposerSlots = proposerAvail.slots || {};
        const opponentSlots = opponentAvail.slots || {};

        // Get blocked slots for both teams
        const proposerBlocked = ScheduledMatchService.getBlockedSlotsForTeam(proposerTeamId, weekId);
        const opponentBlocked = ScheduledMatchService.getBlockedSlotsForTeam(opponentTeamId, weekId);

        const viableSlots = [];
        const allSlotIds = new Set([
            ...Object.keys(proposerSlots),
            ...Object.keys(opponentSlots)
        ]);

        for (const slotId of allSlotIds) {
            // Skip blocked slots
            if (proposerBlocked.has(slotId) || opponentBlocked.has(slotId)) continue;

            const proposerPlayers = proposerSlots[slotId] || [];
            const opponentPlayers = opponentSlots[slotId] || [];

            if (proposerPlayers.length >= minFilter.yourTeam &&
                opponentPlayers.length >= minFilter.opponent) {
                viableSlots.push({
                    slotId,
                    proposerCount: proposerPlayers.length,
                    opponentCount: opponentPlayers.length,
                    proposerRoster: proposerPlayers,
                    opponentRoster: opponentPlayers
                });
            }
        }

        return viableSlots.sort((a, b) => _slotSortOrder(a.slotId) - _slotSortOrder(b.slotId));
    }

    /**
     * Sort order for slots: day first, then time
     * @param {string} slotId - e.g., "mon_2000"
     * @returns {number}
     */
    function _slotSortOrder(slotId) {
        const [day, time] = slotId.split('_');
        return (DAY_ORDER[day] || 0) * 10000 + parseInt(time || '0');
    }

    // ─── Public API ────────────────────────────────────────────────────

    return {
        // Cache
        getProposalsFromCache,
        getProposal,
        updateCache,
        removeFromCache,
        clearCache,
        // Cloud Function calls
        createProposal,
        confirmSlot,
        withdrawConfirmation,
        cancelProposal,
        cancelScheduledMatch,
        // Computation
        computeViableSlots
    };
})();
