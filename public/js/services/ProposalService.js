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

    /**
     * Update proposal settings (game type, standin)
     * @param {Object} data - { proposalId, gameType?, standin? }
     * @returns {Object} { success: boolean }
     */
    async function updateProposalSettings(data) {
        return TeamService.callFunction('updateProposalSettings', data);
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
     * @param {Object} [standinSettings] - { proposerStandin: boolean, opponentStandin: boolean }
     * @returns {Array<{ slotId, proposerCount, opponentCount, proposerRoster, opponentRoster }>}
     */
    function computeViableSlots(proposerTeamId, opponentTeamId, weekId, minFilter, standinSettings) {
        // Get availability from cache
        const proposerAvail = AvailabilityService.getCachedData(proposerTeamId, weekId);
        const opponentAvail = AvailabilityService.getCachedData(opponentTeamId, weekId);

        if (!proposerAvail || !opponentAvail) {
            console.warn('⚠️ computeViableSlots: cache miss', {
                proposerTeamId, opponentTeamId, weekId,
                hasProposer: !!proposerAvail, hasOpponent: !!opponentAvail
            });
            return [];
        }

        const proposerSlots = proposerAvail.slots || {};
        const opponentSlots = opponentAvail.slots || {};

        // Get blocked slots for both teams
        const proposerBlocked = ScheduledMatchService.getBlockedSlotsForTeam(proposerTeamId, weekId);
        const opponentBlocked = ScheduledMatchService.getBlockedSlotsForTeam(opponentTeamId, weekId);

        // Standin adds virtual +1, capped at 4
        const pStandin = standinSettings?.proposerStandin ? 1 : 0;
        const oStandin = standinSettings?.opponentStandin ? 1 : 0;

        const viableSlots = [];
        const allSlotIds = new Set([
            ...Object.keys(proposerSlots),
            ...Object.keys(opponentSlots)
        ]);

        let blockedCount = 0;
        let belowFilterCount = 0;
        for (const slotId of allSlotIds) {
            // Skip blocked slots
            if (proposerBlocked.has(slotId) || opponentBlocked.has(slotId)) {
                blockedCount++;
                continue;
            }

            const proposerPlayers = proposerSlots[slotId] || [];
            const opponentPlayers = opponentSlots[slotId] || [];
            const effectiveProposer = Math.min(4, proposerPlayers.length + pStandin);
            const effectiveOpponent = Math.min(4, opponentPlayers.length + oStandin);

            if (effectiveProposer >= minFilter.yourTeam &&
                effectiveOpponent >= minFilter.opponent) {
                viableSlots.push({
                    slotId,
                    proposerCount: proposerPlayers.length,
                    opponentCount: opponentPlayers.length,
                    proposerStandin: pStandin > 0 && proposerPlayers.length < 4,
                    opponentStandin: oStandin > 0 && opponentPlayers.length < 4,
                    proposerRoster: proposerPlayers,
                    opponentRoster: opponentPlayers
                });
            } else {
                belowFilterCount++;
            }
        }

        // Diagnostic: log when result is 0 but data exists
        if (viableSlots.length === 0 && allSlotIds.size > 0) {
            // Find the slot with highest combined player count (the one most likely to be "viable")
            let bestSlot = null;
            let bestTotal = -1;
            for (const sid of allSlotIds) {
                if (proposerBlocked.has(sid) || opponentBlocked.has(sid)) continue;
                const p = proposerSlots[sid];
                const o = opponentSlots[sid];
                const pLen = Array.isArray(p) ? p.length : (p ? 'NOT_ARRAY:' + typeof p : 0);
                const oLen = Array.isArray(o) ? o.length : (o ? 'NOT_ARRAY:' + typeof o : 0);
                const total = (typeof pLen === 'number' ? pLen : 0) + (typeof oLen === 'number' ? oLen : 0);
                if (total > bestTotal) {
                    bestTotal = total;
                    bestSlot = { sid, pLen, oLen };
                }
            }
            console.warn(
                `⚠️ computeViableSlots: 0 viable | ${allSlotIds.size} total | blocked=${blockedCount} belowFilter=${belowFilterCount}` +
                ` | filter=${minFilter.yourTeam}v${minFilter.opponent}` +
                ` | proposerKeys=${Object.keys(proposerSlots).length} opponentKeys=${Object.keys(opponentSlots).length}` +
                ` | best: ${bestSlot ? bestSlot.sid + ' ' + bestSlot.pLen + 'v' + bestSlot.oLen : 'none'}` +
                ` | teams: ${proposerTeamId.slice(0,8)}.. vs ${opponentTeamId.slice(0,8)}.. | week=${weekId}`
            );
            // Dump top-5 slots by combined count for deeper analysis
            const ranked = [...allSlotIds]
                .filter(sid => !proposerBlocked.has(sid) && !opponentBlocked.has(sid))
                .map(sid => {
                    const p = proposerSlots[sid] || [];
                    const o = opponentSlots[sid] || [];
                    return `${sid}:${Array.isArray(p)?p.length:'!'}v${Array.isArray(o)?o.length:'!'}`;
                })
                .sort((a, b) => {
                    const aTotal = a.split(':')[1].split('v').reduce((s,n) => s + (parseInt(n)||0), 0);
                    const bTotal = b.split(':')[1].split('v').reduce((s,n) => s + (parseInt(n)||0), 0);
                    return bTotal - aTotal;
                })
                .slice(0, 5);
            console.warn('  top-5 slots:', ranked.join(', '));
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
        updateProposalSettings,
        // Computation
        computeViableSlots
    };
})();
