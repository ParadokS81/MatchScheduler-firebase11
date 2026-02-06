// Match Proposal Cloud Functions
// Slice 8.0a: Schema + Cloud Functions + Scheduler Delegation

const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate an eventLog document ID in PRD format:
 * YYYYMMDD-HHMM-teamname-eventtype_XXXX
 */
function generateEventId(teamName, eventType) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const teamNameClean = teamName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${dateStr}-${timeStr}-${teamNameClean}-${eventType}_${randomSuffix}`;
}

/**
 * Validate weekId format (YYYY-WW)
 */
function isValidWeekId(weekId) {
    return /^\d{4}-\d{2}$/.test(weekId);
}

/**
 * Validate slotId format (e.g., "mon_2000")
 */
function isValidSlotId(slotId) {
    return /^(mon|tue|wed|thu|fri|sat|sun)_\d{4}$/.test(slotId);
}

/**
 * Check if user is leader or scheduler for a team.
 * Uses LIVE team doc data (not snapshot).
 */
function isAuthorized(teamData, userId) {
    return teamData.leaderId === userId ||
        (teamData.schedulers || []).includes(userId);
}

/**
 * Compute Monday of a given ISO week (UTC).
 * Canonical frontend version: public/js/utils/DateUtils.js
 * Keep logic in sync if modifying.
 */
function getMondayOfWeek(year, weekNumber) {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const dayOfWeek = jan1.getUTCDay();
    const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));
    const monday = new Date(firstMonday);
    monday.setUTCDate(firstMonday.getUTCDate() + (weekNumber - 1) * 7);
    return monday;
}

/**
 * Compute expiresAt: Sunday 23:59:59 UTC of the given week.
 */
function computeExpiresAt(weekId) {
    const [yearStr, weekStr] = weekId.split('-');
    const year = parseInt(yearStr);
    const weekNumber = parseInt(weekStr);
    const monday = getMondayOfWeek(year, weekNumber);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);
    return sunday;
}

/**
 * Compute ISO date string from weekId + slotId.
 * E.g., weekId "2026-05", slotId "wed_2000" → "2026-02-04"
 */
function computeScheduledDate(weekId, slotId) {
    const dayMap = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
    const [yearStr, weekStr] = weekId.split('-');
    const year = parseInt(yearStr);
    const weekNumber = parseInt(weekStr);
    const monday = getMondayOfWeek(year, weekNumber);
    const dayOffset = dayMap[slotId.split('_')[0]];
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + dayOffset);
    return date.toISOString().slice(0, 10);
}

/**
 * Check if a weekId is current or future (max 4 weeks ahead).
 */
function isValidWeekRange(weekId) {
    const now = new Date();
    const currentYear = now.getUTCFullYear();

    // Compute current ISO week number
    const jan1 = new Date(Date.UTC(currentYear, 0, 1));
    const jan1Day = jan1.getUTCDay();
    const daysToThursday = jan1Day <= 4 ? (4 - jan1Day) : (11 - jan1Day);
    const firstThursday = new Date(Date.UTC(currentYear, 0, 1 + daysToThursday));
    const firstMonday = new Date(firstThursday);
    firstMonday.setUTCDate(firstThursday.getUTCDate() - 3);
    const daysSinceFirstMonday = Math.floor((now - firstMonday) / (24 * 60 * 60 * 1000));
    const currentWeek = Math.max(1, Math.floor(daysSinceFirstMonday / 7) + 1);

    const [yearStr, weekStr] = weekId.split('-');
    const targetYear = parseInt(yearStr);
    const targetWeek = parseInt(weekStr);

    // Convert to absolute week numbers for comparison
    const currentAbsolute = currentYear * 52 + currentWeek;
    const targetAbsolute = targetYear * 52 + targetWeek;

    return targetAbsolute >= currentAbsolute && targetAbsolute <= currentAbsolute + 4;
}

// ─── createProposal ─────────────────────────────────────────────────────────

exports.createProposal = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { proposerTeamId, opponentTeamId, weekId, minFilter } = data;

        // Validate inputs
        if (!proposerTeamId || typeof proposerTeamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'proposerTeamId is required');
        }
        if (!opponentTeamId || typeof opponentTeamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'opponentTeamId is required');
        }
        if (proposerTeamId === opponentTeamId) {
            throw new functions.https.HttpsError('invalid-argument', 'Cannot propose a match against your own team');
        }
        if (!weekId || !isValidWeekId(weekId)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid week format. Use YYYY-WW');
        }
        if (!isValidWeekRange(weekId)) {
            throw new functions.https.HttpsError('invalid-argument', 'Week must be current or up to 4 weeks in the future');
        }
        if (!minFilter || typeof minFilter !== 'object') {
            throw new functions.https.HttpsError('invalid-argument', 'minFilter is required');
        }
        const yourTeam = parseInt(minFilter.yourTeam);
        const opponent = parseInt(minFilter.opponent);
        if (isNaN(yourTeam) || yourTeam < 1 || yourTeam > 4) {
            throw new functions.https.HttpsError('invalid-argument', 'minFilter.yourTeam must be 1-4');
        }
        if (isNaN(opponent) || opponent < 1 || opponent > 4) {
            throw new functions.https.HttpsError('invalid-argument', 'minFilter.opponent must be 1-4');
        }

        // Read team docs
        const [proposerDoc, opponentDoc] = await Promise.all([
            db.collection('teams').doc(proposerTeamId).get(),
            db.collection('teams').doc(opponentTeamId).get()
        ]);

        if (!proposerDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Proposer team not found');
        }
        if (!opponentDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Opponent team not found');
        }

        const proposerTeam = proposerDoc.data();
        const opponentTeam = opponentDoc.data();

        if (opponentTeam.status !== 'active') {
            throw new functions.https.HttpsError('failed-precondition', 'Opponent team is not active');
        }

        // Authorization: verify user is a member of the proposing team AND is leader/scheduler
        const isMember = proposerTeam.playerRoster?.some(p => p.userId === userId);
        if (!isMember) {
            throw new functions.https.HttpsError('permission-denied', 'You must be a member of the proposing team');
        }
        if (!isAuthorized(proposerTeam, userId)) {
            throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can create proposals');
        }

        // Check for duplicate proposal (bidirectional: A→B or B→A for same week)
        const [proposerAsProposer, proposerAsOpponent] = await Promise.all([
            db.collection('matchProposals')
                .where('proposerTeamId', '==', proposerTeamId)
                .where('opponentTeamId', '==', opponentTeamId)
                .where('weekId', '==', weekId)
                .where('status', '==', 'active')
                .limit(1)
                .get(),
            db.collection('matchProposals')
                .where('proposerTeamId', '==', opponentTeamId)
                .where('opponentTeamId', '==', proposerTeamId)
                .where('weekId', '==', weekId)
                .where('status', '==', 'active')
                .limit(1)
                .get()
        ]);

        if (!proposerAsProposer.empty || !proposerAsOpponent.empty) {
            throw new functions.https.HttpsError('already-exists', 'An active proposal already exists between these teams for this week');
        }

        // Build involved team members for security rules (Option A from spec)
        const involvedTeamMembers = [
            ...proposerTeam.playerRoster.map(p => p.userId),
            ...opponentTeam.playerRoster.map(p => p.userId)
        ];

        // Create proposal
        const now = new Date();
        const proposalRef = db.collection('matchProposals').doc();
        const proposalData = {
            proposerTeamId,
            opponentTeamId,
            weekId,
            minFilter: { yourTeam, opponent },
            proposerConfirmedSlots: {},
            opponentConfirmedSlots: {},
            confirmedSlotId: null,
            scheduledMatchId: null,
            status: 'active',
            cancelledBy: null,
            proposerTeamName: proposerTeam.teamName,
            proposerTeamTag: proposerTeam.teamTag,
            opponentTeamName: opponentTeam.teamName,
            opponentTeamTag: opponentTeam.teamTag,
            involvedTeamMembers,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            expiresAt: computeExpiresAt(weekId)
        };

        const eventId = generateEventId(proposerTeam.teamName, 'proposal_created');

        await db.runTransaction(async (transaction) => {
            transaction.set(proposalRef, proposalData);

            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId: proposerTeamId,
                teamName: proposerTeam.teamName,
                type: 'PROPOSAL_CREATED',
                category: 'SCHEDULING',
                timestamp: now,
                userId,
                player: {
                    displayName: proposerTeam.playerRoster.find(p => p.userId === userId)?.displayName || 'Unknown',
                    initials: proposerTeam.playerRoster.find(p => p.userId === userId)?.initials || 'UN'
                },
                details: {
                    proposalId: proposalRef.id,
                    proposerTeamId,
                    opponentTeamId,
                    opponentTeamName: opponentTeam.teamName,
                    weekId,
                    minFilter: { yourTeam, opponent },
                    createdBy: userId
                }
            });
        });

        console.log('✅ Proposal created:', proposalRef.id);
        return { success: true, proposalId: proposalRef.id };

    } catch (error) {
        console.error('❌ Error creating proposal:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to create proposal: ' + error.message);
    }
});

// ─── confirmSlot ────────────────────────────────────────────────────────────

exports.confirmSlot = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { proposalId, slotId, gameType } = data;

        if (!proposalId || typeof proposalId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'proposalId is required');
        }
        if (!slotId || !isValidSlotId(slotId)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid slotId format');
        }
        // Game type is required - user must explicitly choose official or practice
        const validGameTypes = ['official', 'practice'];
        if (!gameType || !validGameTypes.includes(gameType)) {
            throw new functions.https.HttpsError('invalid-argument', 'gameType must be "official" or "practice"');
        }

        const result = await db.runTransaction(async (transaction) => {
            // READ PHASE
            const proposalRef = db.collection('matchProposals').doc(proposalId);
            const proposalDoc = await transaction.get(proposalRef);

            if (!proposalDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Proposal not found');
            }

            const proposal = proposalDoc.data();

            if (proposal.status !== 'active') {
                throw new functions.https.HttpsError('failed-precondition', 'Proposal is no longer active');
            }

            // Read both team docs for live authorization
            const proposerTeamRef = db.collection('teams').doc(proposal.proposerTeamId);
            const opponentTeamRef = db.collection('teams').doc(proposal.opponentTeamId);
            const [proposerTeamDoc, opponentTeamDoc] = await Promise.all([
                transaction.get(proposerTeamRef),
                transaction.get(opponentTeamRef)
            ]);

            const proposerTeam = proposerTeamDoc.data();
            const opponentTeam = opponentTeamDoc.data();

            // Determine which side the user is on
            const isProposerSide = isAuthorized(proposerTeam, userId);
            const isOpponentSide = isAuthorized(opponentTeam, userId);

            if (!isProposerSide && !isOpponentSide) {
                throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can confirm slots');
            }

            const side = isProposerSide ? 'proposer' : 'opponent';

            // Check if slot is blocked by existing scheduled match.
            // These are non-transactional queries (Firestore transactions only support
            // single-doc reads). The race window is negligible (~50ms) and acceptable.
            const blockedQuery1 = await db.collection('scheduledMatches')
                .where('blockedTeams', 'array-contains', proposal.proposerTeamId)
                .where('weekId', '==', proposal.weekId)
                .where('slotId', '==', slotId)
                .where('status', '==', 'upcoming')
                .limit(1)
                .get();

            const blockedQuery2 = await db.collection('scheduledMatches')
                .where('blockedTeams', 'array-contains', proposal.opponentTeamId)
                .where('weekId', '==', proposal.weekId)
                .where('slotId', '==', slotId)
                .where('status', '==', 'upcoming')
                .limit(1)
                .get();

            if (!blockedQuery1.empty || !blockedQuery2.empty) {
                throw new functions.https.HttpsError('failed-precondition', 'This slot is already blocked by a scheduled match');
            }

            // Read ALL availability docs upfront (transaction requires reads before writes)
            const proposerAvailDocId = `${proposal.proposerTeamId}_${proposal.weekId}`;
            const opponentAvailDocId = `${proposal.opponentTeamId}_${proposal.weekId}`;
            const [proposerAvailDoc, opponentAvailDoc] = await Promise.all([
                transaction.get(db.collection('availability').doc(proposerAvailDocId)),
                transaction.get(db.collection('availability').doc(opponentAvailDocId))
            ]);
            const proposerAvail = proposerAvailDoc.exists ? proposerAvailDoc.data() : { slots: {} };
            const opponentAvail = opponentAvailDoc.exists ? opponentAvailDoc.data() : { slots: {} };

            const myAvail = side === 'proposer' ? proposerAvail : opponentAvail;
            const countAtConfirm = (myAvail.slots?.[slotId] || []).length;

            // WRITE PHASE
            const confirmField = side === 'proposer' ? 'proposerConfirmedSlots' : 'opponentConfirmedSlots';
            const now = new Date();

            transaction.update(proposalRef, {
                [`${confirmField}.${slotId}`]: { userId, countAtConfirm, gameType },
                updatedAt: now
            });

            // Check if both sides confirmed same slot
            const otherField = side === 'proposer' ? 'opponentConfirmedSlots' : 'proposerConfirmedSlots';
            const otherConfirmedSlots = proposal[otherField] || {};
            const matched = !!otherConfirmedSlots[slotId];

            let scheduledMatchId = null;

            if (matched) {
                // Both sides confirmed the same slot — create ScheduledMatch
                const matchRef = db.collection('scheduledMatches').doc();
                scheduledMatchId = matchRef.id;

                // Availability already read above (proposerAvail, opponentAvail)
                const confirmedByA = side === 'proposer' ? userId : otherConfirmedSlots[slotId].userId;
                const confirmedByB = side === 'opponent' ? userId : otherConfirmedSlots[slotId].userId;

                transaction.set(matchRef, {
                    teamAId: proposal.proposerTeamId,
                    teamAName: proposal.proposerTeamName,
                    teamATag: proposal.proposerTeamTag,
                    teamBId: proposal.opponentTeamId,
                    teamBName: proposal.opponentTeamName,
                    teamBTag: proposal.opponentTeamTag,
                    weekId: proposal.weekId,
                    slotId,
                    scheduledDate: computeScheduledDate(proposal.weekId, slotId),
                    blockedSlot: slotId,
                    blockedTeams: [proposal.proposerTeamId, proposal.opponentTeamId],
                    teamARoster: proposerAvail.slots?.[slotId] || [],
                    teamBRoster: opponentAvail.slots?.[slotId] || [],
                    proposalId,
                    status: 'upcoming',
                    confirmedAt: now,
                    confirmedByA,
                    confirmedByB,
                    createdAt: now,
                    // Game type: use current confirmer's choice (they are the "last" one)
                    gameType,
                    gameTypeSetBy: userId
                });

                // Update proposal to confirmed
                transaction.update(proposalRef, {
                    status: 'confirmed',
                    confirmedSlotId: slotId,
                    scheduledMatchId,
                    updatedAt: now
                });

                // Log MATCH_SCHEDULED event
                const matchEventId = generateEventId(proposal.proposerTeamName, 'match_scheduled');
                transaction.set(db.collection('eventLog').doc(matchEventId), {
                    eventId: matchEventId,
                    teamId: proposal.proposerTeamId,
                    teamName: proposal.proposerTeamName,
                    type: 'MATCH_SCHEDULED',
                    category: 'SCHEDULING',
                    timestamp: now,
                    userId,
                    details: {
                        proposalId,
                        matchId: scheduledMatchId,
                        slotId,
                        weekId: proposal.weekId,
                        teams: {
                            a: { id: proposal.proposerTeamId, name: proposal.proposerTeamName },
                            b: { id: proposal.opponentTeamId, name: proposal.opponentTeamName }
                        }
                    }
                });
            }

            // Log SLOT_CONFIRMED event
            const confirmEventId = generateEventId(
                side === 'proposer' ? proposal.proposerTeamName : proposal.opponentTeamName,
                'slot_confirmed'
            );
            transaction.set(db.collection('eventLog').doc(confirmEventId), {
                eventId: confirmEventId,
                teamId: side === 'proposer' ? proposal.proposerTeamId : proposal.opponentTeamId,
                teamName: side === 'proposer' ? proposal.proposerTeamName : proposal.opponentTeamName,
                type: 'SLOT_CONFIRMED',
                category: 'SCHEDULING',
                timestamp: now,
                userId,
                details: {
                    proposalId,
                    slotId,
                    side,
                    countAtConfirm,
                    confirmedBy: userId
                }
            });

            if (matched) {
                return {
                    matched,
                    scheduledMatchId,
                    matchDetails: {
                        proposerTeamTag: proposal.proposerTeamTag,
                        proposerTeamName: proposal.proposerTeamName,
                        opponentTeamTag: proposal.opponentTeamTag,
                        opponentTeamName: proposal.opponentTeamName,
                        slotId,
                        weekId: proposal.weekId,
                        scheduledDate: computeScheduledDate(proposal.weekId, slotId),
                        opponentTeamId: side === 'proposer' ? proposal.opponentTeamId : proposal.proposerTeamId,
                        opponentLeaderId: side === 'proposer'
                            ? opponentTeam.leaderId
                            : proposerTeam.leaderId
                    }
                };
            }
            return { matched, scheduledMatchId };
        });

        console.log('✅ Slot confirmed:', { proposalId, slotId, matched: result.matched });
        return { success: true, matched: result.matched, scheduledMatchId: result.scheduledMatchId, matchDetails: result.matchDetails || null };

    } catch (error) {
        console.error('❌ Error confirming slot:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to confirm slot: ' + error.message);
    }
});

// ─── withdrawConfirmation ───────────────────────────────────────────────────

exports.withdrawConfirmation = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { proposalId, slotId } = data;

        if (!proposalId || typeof proposalId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'proposalId is required');
        }
        if (!slotId || !isValidSlotId(slotId)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid slotId format');
        }

        await db.runTransaction(async (transaction) => {
            // READ PHASE
            const proposalRef = db.collection('matchProposals').doc(proposalId);
            const proposalDoc = await transaction.get(proposalRef);

            if (!proposalDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Proposal not found');
            }

            const proposal = proposalDoc.data();

            if (proposal.status !== 'active') {
                throw new functions.https.HttpsError('failed-precondition', 'Can only withdraw from active proposals');
            }

            // Live authorization check
            const [proposerTeamDoc, opponentTeamDoc] = await Promise.all([
                transaction.get(db.collection('teams').doc(proposal.proposerTeamId)),
                transaction.get(db.collection('teams').doc(proposal.opponentTeamId))
            ]);

            const proposerTeam = proposerTeamDoc.data();
            const opponentTeam = opponentTeamDoc.data();

            const isProposerSide = isAuthorized(proposerTeam, userId);
            const isOpponentSide = isAuthorized(opponentTeam, userId);

            if (!isProposerSide && !isOpponentSide) {
                throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can withdraw confirmations');
            }

            const side = isProposerSide ? 'proposer' : 'opponent';
            const confirmField = side === 'proposer' ? 'proposerConfirmedSlots' : 'opponentConfirmedSlots';
            const confirmedSlots = proposal[confirmField] || {};

            if (!confirmedSlots[slotId]) {
                throw new functions.https.HttpsError('failed-precondition', 'This slot has not been confirmed by your side');
            }

            // WRITE PHASE — use FieldValue.delete() to remove the nested key
            transaction.update(proposalRef, {
                [`${confirmField}.${slotId}`]: FieldValue.delete(),
                updatedAt: new Date()
            });
        });

        console.log('✅ Confirmation withdrawn:', { proposalId, slotId });
        return { success: true };

    } catch (error) {
        console.error('❌ Error withdrawing confirmation:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to withdraw confirmation: ' + error.message);
    }
});

// ─── cancelProposal ─────────────────────────────────────────────────────────

exports.cancelProposal = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { proposalId } = data;

        if (!proposalId || typeof proposalId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'proposalId is required');
        }

        await db.runTransaction(async (transaction) => {
            // READ PHASE
            const proposalRef = db.collection('matchProposals').doc(proposalId);
            const proposalDoc = await transaction.get(proposalRef);

            if (!proposalDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Proposal not found');
            }

            const proposal = proposalDoc.data();

            if (proposal.status !== 'active') {
                throw new functions.https.HttpsError('failed-precondition', 'Only active proposals can be cancelled');
            }

            // Live authorization check — either side can cancel
            const [proposerTeamDoc, opponentTeamDoc] = await Promise.all([
                transaction.get(db.collection('teams').doc(proposal.proposerTeamId)),
                transaction.get(db.collection('teams').doc(proposal.opponentTeamId))
            ]);

            const proposerTeam = proposerTeamDoc.data();
            const opponentTeam = opponentTeamDoc.data();

            if (!isAuthorized(proposerTeam, userId) && !isAuthorized(opponentTeam, userId)) {
                throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can cancel proposals');
            }

            // WRITE PHASE
            const now = new Date();

            transaction.update(proposalRef, {
                status: 'cancelled',
                cancelledBy: userId,
                updatedAt: now
            });

            const eventId = generateEventId(proposal.proposerTeamName, 'proposal_cancelled');
            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId: proposal.proposerTeamId,
                teamName: proposal.proposerTeamName,
                type: 'PROPOSAL_CANCELLED',
                category: 'SCHEDULING',
                timestamp: now,
                userId,
                details: {
                    proposalId,
                    cancelledBy: userId,
                    proposerTeamId: proposal.proposerTeamId,
                    opponentTeamId: proposal.opponentTeamId,
                    weekId: proposal.weekId
                }
            });
        });

        console.log('✅ Proposal cancelled:', proposalId);
        return { success: true };

    } catch (error) {
        console.error('❌ Error cancelling proposal:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to cancel proposal: ' + error.message);
    }
});

// ─── cancelScheduledMatch ────────────────────────────────────────────────────

exports.cancelScheduledMatch = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { matchId } = data;

        if (!matchId || typeof matchId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'matchId is required');
        }

        await db.runTransaction(async (transaction) => {
            // READ PHASE
            const matchRef = db.collection('scheduledMatches').doc(matchId);
            const matchDoc = await transaction.get(matchRef);

            if (!matchDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Match not found');
            }

            const matchData = matchDoc.data();

            if (matchData.status === 'cancelled') {
                throw new functions.https.HttpsError('failed-precondition', 'Match already cancelled');
            }
            if (matchData.status !== 'upcoming') {
                throw new functions.https.HttpsError('failed-precondition', 'Only upcoming matches can be cancelled');
            }

            // Live authorization check — read both team docs
            const [teamADoc, teamBDoc] = await Promise.all([
                transaction.get(db.collection('teams').doc(matchData.teamAId)),
                transaction.get(db.collection('teams').doc(matchData.teamBId))
            ]);

            const teamAData = teamADoc.data();
            const teamBData = teamBDoc.data();

            if (!isAuthorized(teamAData, userId) && !isAuthorized(teamBData, userId)) {
                throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can cancel matches');
            }

            // Read parent proposal
            const proposalRef = db.collection('matchProposals').doc(matchData.proposalId);
            const proposalDoc = await transaction.get(proposalRef);

            // WRITE PHASE
            const now = new Date();

            // 1. Cancel the scheduled match
            transaction.update(matchRef, {
                status: 'cancelled',
                cancelledBy: userId,
                cancelledAt: now
            });

            // 2. Revert proposal to active (if it still exists)
            if (proposalDoc.exists) {
                const cancelledSlotId = matchData.slotId;

                // Build update: revert status, clear confirmedSlotId/scheduledMatchId,
                // and delete the confirmed slot entries from both sides
                const proposalUpdate = {
                    status: 'active',
                    confirmedSlotId: null,
                    scheduledMatchId: null,
                    updatedAt: now
                };

                // Clear the specific slot from both confirmedSlots maps
                if (cancelledSlotId) {
                    proposalUpdate[`proposerConfirmedSlots.${cancelledSlotId}`] = FieldValue.delete();
                    proposalUpdate[`opponentConfirmedSlots.${cancelledSlotId}`] = FieldValue.delete();
                }

                transaction.update(proposalRef, proposalUpdate);
            }

            // 3. Write event log
            const eventId = generateEventId(matchData.teamAName, 'match_cancelled');
            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId: matchData.teamAId,
                teamName: matchData.teamAName,
                type: 'MATCH_CANCELLED',
                category: 'SCHEDULING',
                timestamp: now,
                userId,
                details: {
                    matchId,
                    proposalId: matchData.proposalId,
                    teamAId: matchData.teamAId,
                    teamAName: matchData.teamAName,
                    teamBId: matchData.teamBId,
                    teamBName: matchData.teamBName,
                    slotId: matchData.slotId,
                    weekId: matchData.weekId,
                    cancelledBy: userId
                }
            });
        });

        console.log('✅ Scheduled match cancelled:', matchId);
        return { success: true };

    } catch (error) {
        console.error('❌ Error cancelling scheduled match:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to cancel scheduled match: ' + error.message);
    }
});

// ─── toggleScheduler ────────────────────────────────────────────────────────

exports.toggleScheduler = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { teamId, targetUserId, enabled } = data;

        if (!teamId || typeof teamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
        }
        if (!targetUserId || typeof targetUserId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'targetUserId is required');
        }
        if (typeof enabled !== 'boolean') {
            throw new functions.https.HttpsError('invalid-argument', 'enabled must be a boolean');
        }

        // Cannot toggle scheduler for yourself if you're the leader (you're always implicitly a scheduler)
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Team not found');
        }

        const team = teamDoc.data();

        // Only leader can toggle schedulers
        if (team.leaderId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Only team leaders can manage schedulers');
        }

        // Target must be on roster
        const targetPlayer = team.playerRoster.find(p => p.userId === targetUserId);
        if (!targetPlayer) {
            throw new functions.https.HttpsError('not-found', 'Player not found on team roster');
        }

        // Leader is always an implicit scheduler — don't add/remove them
        if (targetUserId === team.leaderId) {
            throw new functions.https.HttpsError('invalid-argument', 'Leader is always a scheduler');
        }

        // Update schedulers array
        if (enabled) {
            await db.collection('teams').doc(teamId).update({
                schedulers: FieldValue.arrayUnion(targetUserId),
                lastActivityAt: FieldValue.serverTimestamp()
            });
        } else {
            await db.collection('teams').doc(teamId).update({
                schedulers: FieldValue.arrayRemove(targetUserId),
                lastActivityAt: FieldValue.serverTimestamp()
            });
        }

        console.log('✅ Scheduler toggled:', { teamId, targetUserId, enabled });
        return { success: true };

    } catch (error) {
        console.error('❌ Error toggling scheduler:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to toggle scheduler: ' + error.message);
    }
});
