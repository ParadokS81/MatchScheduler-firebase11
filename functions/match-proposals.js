// Match Proposal Cloud Functions
// Slice 8.0a: Schema + Cloud Functions + Scheduler Delegation

const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMondayOfWeek, isValidWeekRange, computeExpiresAt, computeScheduledDate, getISOWeekYear, getISOWeekNumber } = require('./week-utils');

const db = getFirestore();

// ─── Slot Helpers ───────────────────────────────────────────────────────────

/**
 * Compute the next 30-min slot after a given slotId.
 * e.g. "thu_2230" → "thu_2300", "thu_2330" → "fri_0000"
 * Returns null if it would wrap past Sunday.
 */
function nextSlot(slotId) {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const [day, time] = slotId.split('_');
    let h = parseInt(time.slice(0, 2));
    let m = parseInt(time.slice(2));
    let dayIdx = days.indexOf(day);

    m += 30;
    if (m >= 60) { m = 0; h++; }
    if (h >= 24) { h = 0; dayIdx++; }
    if (dayIdx >= days.length) return null;

    return `${days[dayIdx]}_${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
}

/**
 * Compute the previous 30-min slot before a given slotId.
 * e.g. "thu_2300" → "thu_2230", "fri_0000" → "thu_2330"
 * Returns null if it would wrap before Monday.
 */
function prevSlot(slotId) {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const [day, time] = slotId.split('_');
    let h = parseInt(time.slice(0, 2));
    let m = parseInt(time.slice(2));
    let dayIdx = days.indexOf(day);

    m -= 30;
    if (m < 0) { m = 30; h--; }
    if (h < 0) { h = 23; dayIdx--; }
    if (dayIdx < 0) return null;

    return `${days[dayIdx]}_${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
}

/**
 * Get all blocked slots for a team in a week (match slot + 1-slot buffer before and after).
 */
async function getBlockedSlotsForTeam(teamId, weekId, excludeMatchId = null) {
    const snapshot = await db.collection('scheduledMatches')
        .where('blockedTeams', 'array-contains', teamId)
        .where('weekId', '==', weekId)
        .where('status', '==', 'upcoming')
        .get();

    const blocked = new Set();
    snapshot.forEach(doc => {
        if (excludeMatchId && doc.id === excludeMatchId) return;
        const slot = doc.data().blockedSlot;
        blocked.add(slot);
        const before = prevSlot(slot);
        if (before) blocked.add(before);
        const after = nextSlot(slot);
        if (after) blocked.add(after);
    });
    return blocked;
}

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

// Week utilities (getMondayOfWeek, isValidWeekRange, computeExpiresAt, computeScheduledDate)
// imported from ./week-utils.js — single source of truth for backend week math.

// ─── createProposal ─────────────────────────────────────────────────────────

exports.createProposal = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { proposerTeamId, opponentTeamId, weekId, minFilter, gameType, proposerStandin,
                confirmedSlots } = data;

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
        if (isNaN(yourTeam) || yourTeam < 3 || yourTeam > 4) {
            throw new functions.https.HttpsError('invalid-argument', 'minFilter.yourTeam must be 3-4');
        }
        if (isNaN(opponent) || opponent < 3 || opponent > 4) {
            throw new functions.https.HttpsError('invalid-argument', 'minFilter.opponent must be 3-4');
        }
        // Validate game type
        const validGameTypes = ['official', 'practice'];
        if (!gameType || !validGameTypes.includes(gameType)) {
            throw new functions.https.HttpsError('invalid-argument', 'gameType must be "official" or "practice"');
        }
        // Standin only valid for practice
        const standinValue = gameType === 'practice' && proposerStandin === true;

        // Validate confirmedSlots (required — new clients must provide at least 1)
        const slotsArray = Array.isArray(confirmedSlots) ? confirmedSlots : [];
        if (slotsArray.length === 0) {
            throw new functions.https.HttpsError('invalid-argument',
                'At least one confirmed slot is required');
        }
        if (slotsArray.length > 14) {
            throw new functions.https.HttpsError('invalid-argument', 'Too many confirmed slots');
        }
        for (const slotId of slotsArray) {
            if (!isValidSlotId(slotId)) {
                throw new functions.https.HttpsError('invalid-argument',
                    `Invalid slot ID: ${slotId}`);
            }
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

        // Read proposer availability to get countAtConfirm for each pre-confirmed slot
        const proposerAvailDocId = `${proposerTeamId}_${weekId}`;
        const proposerAvailDoc = await db.collection('availability').doc(proposerAvailDocId).get();
        const proposerAvail = proposerAvailDoc.exists ? proposerAvailDoc.data() : { slots: {} };

        // Read opponent availability for notification slot counts
        const opponentAvailDocId = `${opponentTeamId}_${weekId}`;
        const opponentAvailDoc = await db.collection('availability').doc(opponentAvailDocId).get();
        const opponentAvail = opponentAvailDoc.exists ? opponentAvailDoc.data() : { slots: {} };

        const proposerConfirmedSlots = {};
        for (const slotId of slotsArray) {
            const countAtConfirm = (proposerAvail.slots?.[slotId] || []).length;
            proposerConfirmedSlots[slotId] = {
                userId,
                countAtConfirm,
                gameType
            };
        }

        // Pre-resolve notification delivery targets (outside transaction — delivery info can be slightly stale)
        const [opponentBotReg, proposerBotReg] = await Promise.all([
            db.collection('botRegistrations').doc(opponentTeamId).get(),
            db.collection('botRegistrations').doc(proposerTeamId).get()
        ]);
        const opponentBot = opponentBotReg.exists ? opponentBotReg.data() : null;
        const proposerBot = proposerBotReg.exists ? proposerBotReg.data() : null;

        // Resolve opponent leader's Discord ID for DM fallback
        let opponentLeaderDiscordId = null;
        let opponentLeaderDisplayName = null;
        if (opponentTeam.leaderId) {
            const leaderDoc = await db.collection('users').doc(opponentTeam.leaderId).get();
            if (leaderDoc.exists) {
                const leaderData = leaderDoc.data();
                opponentLeaderDiscordId = leaderData.discordUserId || null;
                opponentLeaderDisplayName = leaderData.displayName || null;
            }
        }

        // Resolve proposer's Discord ID (for "DM them" button in opponent's embed)
        let proposerLeaderDiscordId = null;
        let proposerLeaderDisplayName = null;
        const proposerUserDoc = await db.collection('users').doc(userId).get();
        if (proposerUserDoc.exists) {
            const proposerUserData = proposerUserDoc.data();
            proposerLeaderDiscordId = proposerUserData.discordUserId || null;
            proposerLeaderDisplayName = proposerUserData.displayName
                || proposerTeam.playerRoster?.find(p => p.userId === userId)?.displayName
                || null;
        }

        // Build confirmed slots with counts for notification
        // Include standin in counts so Discord embed shows effective strength (e.g., 4v4 not 3v3)
        const confirmedSlotsWithCounts = slotsArray.map(slotId => {
            const rawProposer = (proposerAvail.slots?.[slotId] || []).length;
            const rawOpponent = (opponentAvail.slots?.[slotId] || []).length;
            return {
                slotId,
                proposerCount: Math.min(4, rawProposer + (standinValue ? 1 : 0)),
                opponentCount: rawOpponent
            };
        });

        // Create proposal
        const now = new Date();
        const proposalRef = db.collection('matchProposals').doc();
        const proposalData = {
            proposerTeamId,
            opponentTeamId,
            weekId,
            minFilter: { yourTeam, opponent },
            gameType,
            proposerStandin: standinValue,
            opponentStandin: false,
            proposerConfirmedSlots,
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
        const notificationRef = db.collection('notifications').doc();
        const notificationData = {
            type: 'challenge_proposed',
            status: 'pending',
            proposalId: proposalRef.id,
            createdBy: userId,
            proposerTeamId,
            proposerTeamName: proposerTeam.teamName,
            proposerTeamTag: proposerTeam.teamTag,
            opponentTeamId,
            opponentTeamName: opponentTeam.teamName,
            opponentTeamTag: opponentTeam.teamTag,
            weekId,
            gameType,
            confirmedSlots: confirmedSlotsWithCounts,
            delivery: {
                opponent: {
                    botRegistered: opponentBot?.status === 'active',
                    guildId: opponentBot?.guildId ?? null,
                    leaderDiscordId: opponentLeaderDiscordId,
                    leaderDisplayName: opponentLeaderDisplayName
                },
                proposer: {
                    botRegistered: proposerBot?.status === 'active',
                    guildId: proposerBot?.guildId ?? null
                }
            },
            proposalUrl: `https://scheduler.quake.world/#/matches/${proposalRef.id}`,
            proposerLeaderDiscordId,
            proposerLeaderDisplayName,
            proposerLogoUrl: proposerTeam.activeLogo?.urls?.small || null,
            opponentLogoUrl: opponentTeam.activeLogo?.urls?.small || null,
            createdAt: now,
            deliveredAt: null
        };

        await db.runTransaction(async (transaction) => {
            transaction.set(proposalRef, proposalData);
            transaction.set(notificationRef, notificationData);

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
                    gameType,
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

            // Check if slot is blocked by existing scheduled match (including 1-slot buffer).
            // Non-transactional queries — race window is negligible (~50ms) and acceptable.
            const [proposerBlocked, opponentBlocked] = await Promise.all([
                getBlockedSlotsForTeam(proposal.proposerTeamId, proposal.weekId),
                getBlockedSlotsForTeam(proposal.opponentTeamId, proposal.weekId)
            ]);

            if (proposerBlocked.has(slotId) || opponentBlocked.has(slotId)) {
                throw new functions.https.HttpsError('failed-precondition', 'This slot is blocked by a scheduled match (or its buffer)');
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
                    side,
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
            return { matched, scheduledMatchId, side };
        });

        // ── Notification writes (post-transaction, best-effort) ──
        try {
            // Re-read the proposal to get current state + team IDs
            const proposalDoc = await db.collection('matchProposals').doc(proposalId).get();
            if (!proposalDoc.exists) {
                console.error('⚠️ Proposal doc missing after transaction — skipping notifications');
                return;
            }
            const proposal = proposalDoc.data();
            const confirmingSide = result.side;

            // Fetch delivery targets and team docs in parallel
            const [proposerBotReg, opponentBotReg, proposerTeamDoc, opponentTeamDoc] = await Promise.all([
                db.collection('botRegistrations').doc(proposal.proposerTeamId).get(),
                db.collection('botRegistrations').doc(proposal.opponentTeamId).get(),
                db.collection('teams').doc(proposal.proposerTeamId).get(),
                db.collection('teams').doc(proposal.opponentTeamId).get()
            ]);
            const proposerBot = proposerBotReg.exists ? proposerBotReg.data() : null;
            const opponentBot = opponentBotReg.exists ? opponentBotReg.data() : null;
            const proposerTeam = proposerTeamDoc.data();
            const opponentTeam = opponentTeamDoc.data();
            if (!proposerTeam || !opponentTeam) {
                console.error('⚠️ Team doc missing after transaction — skipping notifications');
                return;
            }

            // Resolve confirmer and other side leader Discord info
            const confirmingTeam = confirmingSide === 'proposer' ? proposerTeam : opponentTeam;
            const otherTeam = confirmingSide === 'proposer' ? opponentTeam : proposerTeam;

            let confirmerDiscordId = null;
            let confirmerDisplayName = null;
            const confirmerDoc = await db.collection('users').doc(userId).get();
            if (confirmerDoc.exists) {
                const d = confirmerDoc.data();
                confirmerDiscordId = d.discordUserId || null;
                confirmerDisplayName = d.displayName
                    || confirmingTeam.playerRoster?.find(p => p.userId === userId)?.displayName
                    || null;
            }

            let otherLeaderDiscordId = null;
            let otherLeaderDisplayName = null;
            if (otherTeam.leaderId) {
                const leaderDoc = await db.collection('users').doc(otherTeam.leaderId).get();
                if (leaderDoc.exists) {
                    const d = leaderDoc.data();
                    otherLeaderDiscordId = d.discordUserId || null;
                    otherLeaderDisplayName = d.displayName || null;
                }
            }

            // Logo URLs (small size for Discord embed icons)
            const proposerLogoUrl = proposerTeam.activeLogo?.urls?.small || null;
            const opponentLogoUrl = opponentTeam.activeLogo?.urls?.small || null;

            // Determine naming for slot_confirmed notification
            const recipientBot = confirmingSide === 'proposer' ? opponentBot : proposerBot;
            const confirmingTeamName = confirmingSide === 'proposer' ? proposal.proposerTeamName : proposal.opponentTeamName;
            const confirmingTeamTag = confirmingSide === 'proposer' ? proposal.proposerTeamTag : proposal.opponentTeamTag;
            const recipientTeamName = confirmingSide === 'proposer' ? proposal.opponentTeamName : proposal.proposerTeamName;
            const recipientTeamTag = confirmingSide === 'proposer' ? proposal.opponentTeamTag : proposal.proposerTeamTag;

            // Write slot_confirmed notification (always — sent to OTHER side)
            const slotNotifRef = db.collection('notifications').doc();
            await slotNotifRef.set({
                type: 'slot_confirmed',
                status: 'pending',
                proposalId,
                slotId,
                gameType,
                weekId: proposal.weekId,
                confirmedByTeamId: confirmingSide === 'proposer' ? proposal.proposerTeamId : proposal.opponentTeamId,
                confirmedByTeamName: confirmingTeamName,
                confirmedByTeamTag: confirmingTeamTag,
                confirmedByUserId: userId,
                confirmedByDisplayName: confirmerDisplayName,
                confirmedByDiscordId: confirmerDiscordId,
                recipientTeamId: confirmingSide === 'proposer' ? proposal.opponentTeamId : proposal.proposerTeamId,
                recipientTeamName,
                recipientTeamTag,
                delivery: {
                    botRegistered: recipientBot?.status === 'active',
                    guildId: recipientBot?.guildId ?? null,
                    leaderDiscordId: otherLeaderDiscordId,
                    leaderDisplayName: otherLeaderDisplayName
                },
                proposerLogoUrl,
                opponentLogoUrl,
                proposalUrl: `https://scheduler.quake.world/#/matches/${proposalId}`,
                createdAt: new Date(),
                deliveredAt: null
            });

            // Write match_sealed notifications (only when both sides matched — sent to BOTH sides)
            if (result.matched) {
                const now = new Date();

                const matchNotifProposer = db.collection('notifications').doc();
                await matchNotifProposer.set({
                    type: 'match_sealed',
                    status: 'pending',
                    proposalId,
                    scheduledMatchId: result.scheduledMatchId,
                    slotId,
                    gameType,
                    weekId: proposal.weekId,
                    proposerTeamId: proposal.proposerTeamId,
                    proposerTeamName: proposal.proposerTeamName,
                    proposerTeamTag: proposal.proposerTeamTag,
                    opponentTeamId: proposal.opponentTeamId,
                    opponentTeamName: proposal.opponentTeamName,
                    opponentTeamTag: proposal.opponentTeamTag,
                    recipientTeamId: proposal.proposerTeamId,
                    recipientTeamName: proposal.proposerTeamName,
                    recipientTeamTag: proposal.proposerTeamTag,
                    delivery: {
                        botRegistered: proposerBot?.status === 'active',
                        guildId: proposerBot?.guildId ?? null
                    },
                    proposerLogoUrl,
                    opponentLogoUrl,
                    proposalUrl: `https://scheduler.quake.world/#/matches/${proposalId}`,
                    createdAt: now,
                    deliveredAt: null
                });

                const matchNotifOpponent = db.collection('notifications').doc();
                await matchNotifOpponent.set({
                    type: 'match_sealed',
                    status: 'pending',
                    proposalId,
                    scheduledMatchId: result.scheduledMatchId,
                    slotId,
                    gameType,
                    weekId: proposal.weekId,
                    proposerTeamId: proposal.proposerTeamId,
                    proposerTeamName: proposal.proposerTeamName,
                    proposerTeamTag: proposal.proposerTeamTag,
                    opponentTeamId: proposal.opponentTeamId,
                    opponentTeamName: proposal.opponentTeamName,
                    opponentTeamTag: proposal.opponentTeamTag,
                    recipientTeamId: proposal.opponentTeamId,
                    recipientTeamName: proposal.opponentTeamName,
                    recipientTeamTag: proposal.opponentTeamTag,
                    delivery: {
                        botRegistered: opponentBot?.status === 'active',
                        guildId: opponentBot?.guildId ?? null
                    },
                    proposerLogoUrl,
                    opponentLogoUrl,
                    proposalUrl: `https://scheduler.quake.world/#/matches/${proposalId}`,
                    createdAt: now,
                    deliveredAt: null
                });
            }
        } catch (notifError) {
            // Notification failure must not fail the overall request — match is already scheduled
            console.error('⚠️ Notification write failed (non-fatal):', notifError);
        }

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

        let cancelledProposalData = null;
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

            // Capture for post-transaction notification (can't access proposal outside transaction scope)
            cancelledProposalData = {
                proposerTeamId: proposal.proposerTeamId,
                opponentTeamId: proposal.opponentTeamId,
            };

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

        // Notify connected bots to delete the original announcement messages
        if (cancelledProposalData) {
            await db.collection('notifications').add({
                type: 'proposal_cancelled',
                status: 'pending',
                proposalId,
                proposerTeamId: cancelledProposalData.proposerTeamId,
                opponentTeamId: cancelledProposalData.opponentTeamId,
                cancelledBy: userId,
                createdAt: new Date(),
                deliveredAt: null,
            });
        }

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

            // Read parent proposal (skip for quick-add matches which have no proposal)
            let proposalRef = null;
            let proposalDoc = null;
            if (matchData.proposalId) {
                proposalRef = db.collection('matchProposals').doc(matchData.proposalId);
                proposalDoc = await transaction.get(proposalRef);
            }

            // WRITE PHASE
            const now = new Date();

            // 1. Cancel the scheduled match
            transaction.update(matchRef, {
                status: 'cancelled',
                cancelledBy: userId,
                cancelledAt: now
            });

            // 2. Revert proposal to active (if it still exists — not applicable for quick-add)
            if (proposalDoc && proposalDoc.exists) {
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

// ─── updateProposalSettings ──────────────────────────────────────────────────

exports.updateProposalSettings = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { proposalId, gameType, standin } = data;

        if (!proposalId || typeof proposalId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'proposalId is required');
        }

        // Read proposal
        const proposalRef = db.collection('matchProposals').doc(proposalId);
        const proposalDoc = await proposalRef.get();

        if (!proposalDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Proposal not found');
        }

        const proposal = proposalDoc.data();

        if (proposal.status !== 'active') {
            throw new functions.https.HttpsError('failed-precondition', 'Proposal is no longer active');
        }

        // Read team docs for authorization
        const [proposerTeamDoc, opponentTeamDoc] = await Promise.all([
            db.collection('teams').doc(proposal.proposerTeamId).get(),
            db.collection('teams').doc(proposal.opponentTeamId).get()
        ]);

        const proposerTeam = proposerTeamDoc.data();
        const opponentTeam = opponentTeamDoc.data();

        const isProposerSide = isAuthorized(proposerTeam, userId);
        const isOpponentSide = isAuthorized(opponentTeam, userId);

        if (!isProposerSide && !isOpponentSide) {
            throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can update proposal settings');
        }

        const updates = { updatedAt: new Date() };

        // Update game type if provided
        if (gameType !== undefined) {
            const validGameTypes = ['official', 'practice'];
            if (!validGameTypes.includes(gameType)) {
                throw new functions.https.HttpsError('invalid-argument', 'gameType must be "official" or "practice"');
            }
            updates.gameType = gameType;
            // Switching to official resets both standin flags
            if (gameType === 'official') {
                updates.proposerStandin = false;
                updates.opponentStandin = false;
            }

            // Cascade gameType to all confirmed slots
            const proposerSlots = proposal.proposerConfirmedSlots || {};
            for (const slotId of Object.keys(proposerSlots)) {
                updates[`proposerConfirmedSlots.${slotId}.gameType`] = gameType;
            }
            const opponentSlots = proposal.opponentConfirmedSlots || {};
            for (const slotId of Object.keys(opponentSlots)) {
                updates[`opponentConfirmedSlots.${slotId}.gameType`] = gameType;
            }
        }

        // Update standin if provided (only for practice)
        if (standin !== undefined) {
            const effectiveGameType = gameType || proposal.gameType;
            if (effectiveGameType !== 'practice') {
                throw new functions.https.HttpsError('invalid-argument', 'Standin is only available for practice matches');
            }
            const standinField = isProposerSide ? 'proposerStandin' : 'opponentStandin';
            updates[standinField] = !!standin;
        }

        await proposalRef.update(updates);

        // Cascade gameType to linked scheduledMatch if proposal is confirmed
        if (gameType !== undefined && proposal.scheduledMatchId) {
            await db.collection('scheduledMatches').doc(proposal.scheduledMatchId).update({
                gameType,
                gameTypeSetBy: userId,
                updatedAt: new Date()
            });
        }

        console.log('✅ Proposal settings updated:', proposalId, updates);
        return { success: true };

    } catch (error) {
        console.error('❌ Error updating proposal settings:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to update proposal settings: ' + error.message);
    }
});

// ─── quickAddMatch ──────────────────────────────────────────────────────────

/**
 * Derive slotId (e.g., "sun_2030") from a Date object in UTC.
 */
function computeSlotId(date) {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const day = days[date.getUTCDay()];
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day}_${hours}${mins}`;
}

exports.quickAddMatch = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { teamId, opponentTeamId, dateTime, gameType } = data;

        // ── Validation ──
        if (!teamId || typeof teamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
        }
        if (!opponentTeamId || typeof opponentTeamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'opponentTeamId is required');
        }
        if (teamId === opponentTeamId) {
            throw new functions.https.HttpsError('invalid-argument', 'Cannot add a match against your own team');
        }
        if (!dateTime || isNaN(new Date(dateTime).getTime())) {
            throw new functions.https.HttpsError('invalid-argument', 'dateTime must be a valid ISO 8601 string');
        }
        if (new Date(dateTime) <= new Date()) {
            throw new functions.https.HttpsError('invalid-argument', 'Match must be in the future');
        }
        if (!['official', 'practice'].includes(gameType)) {
            throw new functions.https.HttpsError('invalid-argument', 'gameType must be "official" or "practice"');
        }

        // ── Read teams ──
        const [teamDoc, opponentDoc] = await Promise.all([
            db.collection('teams').doc(teamId).get(),
            db.collection('teams').doc(opponentTeamId).get()
        ]);
        if (!teamDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Team not found');
        }
        if (!opponentDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Opponent team not found');
        }

        const team = teamDoc.data();
        const opponent = opponentDoc.data();

        if (opponent.status !== 'active') {
            throw new functions.https.HttpsError('failed-precondition', 'Opponent team is not active');
        }

        // ── Authorization ──
        const isMember = team.playerRoster?.some(p => p.userId === userId);
        if (!isMember) {
            throw new functions.https.HttpsError('permission-denied', 'You must be on this team');
        }
        if (!isAuthorized(team, userId)) {
            throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can add matches');
        }

        // ── Derive schedule fields from dateTime ──
        const matchDate = new Date(dateTime);
        const weekYear = getISOWeekYear(matchDate);
        const weekNum = getISOWeekNumber(matchDate);
        const weekId = `${weekYear}-${String(weekNum).padStart(2, '0')}`;
        const slotId = computeSlotId(matchDate);
        const scheduledDate = matchDate.toISOString().split('T')[0];

        // ── Check for blocked slots ──
        const [teamBlocked, opponentBlocked] = await Promise.all([
            getBlockedSlotsForTeam(teamId, weekId),
            getBlockedSlotsForTeam(opponentTeamId, weekId)
        ]);
        if (teamBlocked.has(slotId)) {
            throw new functions.https.HttpsError('failed-precondition', 'Your team already has a match in this slot');
        }
        if (opponentBlocked.has(slotId)) {
            throw new functions.https.HttpsError('failed-precondition', 'Opponent already has a match in this slot');
        }

        // ── Create scheduled match ──
        const now = new Date();
        const matchRef = db.collection('scheduledMatches').doc();

        await matchRef.set({
            teamAId: teamId,
            teamAName: team.teamName,
            teamATag: team.teamTag,
            teamBId: opponentTeamId,
            teamBName: opponent.teamName,
            teamBTag: opponent.teamTag,
            weekId,
            slotId,
            scheduledDate,
            blockedSlot: slotId,
            blockedTeams: [teamId, opponentTeamId],
            teamARoster: [],
            teamBRoster: [],
            proposalId: null,
            origin: 'quick_add',
            addedBy: userId,
            status: 'upcoming',
            gameType,
            gameTypeSetBy: userId,
            confirmedAt: now,
            confirmedByA: userId,
            confirmedByB: null,
            createdAt: now
        });

        // ── Event log ──
        const player = team.playerRoster?.find(p => p.userId === userId);
        const eventId = generateEventId(team.teamName, 'match_quick_added');
        await db.collection('eventLog').doc(eventId).set({
            eventId,
            teamId,
            teamName: team.teamName,
            type: 'MATCH_QUICK_ADDED',
            category: 'SCHEDULING',
            timestamp: now,
            userId,
            player: {
                displayName: player?.displayName || 'Unknown',
                initials: player?.initials || '??'
            },
            details: {
                matchId: matchRef.id,
                slotId,
                weekId,
                gameType,
                origin: 'quick_add',
                teams: {
                    a: { id: teamId, name: team.teamName },
                    b: { id: opponentTeamId, name: opponent.teamName }
                }
            }
        });

        console.log('✅ Quick-add match created:', matchRef.id, team.teamName, 'vs', opponent.teamName);
        return { success: true, matchId: matchRef.id };

    } catch (error) {
        console.error('❌ Error in quickAddMatch:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to add match');
    }
});

// ─── rescheduleMatch ───────────────────────────────────────────────────────

/**
 * Reschedule a scheduled match to a new time slot.
 * Good-faith operation — no opponent confirmation required.
 * Updates match in-place, unblocks old slot, blocks new slot.
 */
exports.rescheduleMatch = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { matchId, dateTime } = data;

        if (!matchId || typeof matchId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'matchId is required');
        }
        if (!dateTime || typeof dateTime !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'dateTime is required');
        }

        const parsedDate = new Date(dateTime);
        if (isNaN(parsedDate.getTime())) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid dateTime');
        }
        if (parsedDate <= new Date()) {
            throw new functions.https.HttpsError('invalid-argument', 'New time must be in the future');
        }

        // Derive new slot info (same pattern as quickAddMatch)
        const newSlotId = computeSlotId(parsedDate);
        const newWeekYear = getISOWeekYear(parsedDate);
        const newWeekNum = getISOWeekNumber(parsedDate);
        const newWeekId = `${newWeekYear}-${String(newWeekNum).padStart(2, '0')}`;
        const newScheduledDate = parsedDate.toISOString().split('T')[0];

        let txResult = {};

        await db.runTransaction(async (transaction) => {
            // READ PHASE
            const matchRef = db.collection('scheduledMatches').doc(matchId);
            const matchDoc = await transaction.get(matchRef);

            if (!matchDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Match not found');
            }
            const matchData = matchDoc.data();

            if (matchData.status !== 'upcoming') {
                throw new functions.https.HttpsError('failed-precondition', 'Only upcoming matches can be rescheduled');
            }

            // Authorization — either team's leader/scheduler
            const [teamADoc, teamBDoc] = await Promise.all([
                transaction.get(db.collection('teams').doc(matchData.teamAId)),
                transaction.get(db.collection('teams').doc(matchData.teamBId))
            ]);

            const teamAData = teamADoc.data();
            const teamBData = teamBDoc.data();

            if (!isAuthorized(teamAData, userId) && !isAuthorized(teamBData, userId)) {
                throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can reschedule matches');
            }

            // Read parent proposal if exists
            let proposalRef = null;
            let proposalDoc = null;
            if (matchData.proposalId) {
                proposalRef = db.collection('matchProposals').doc(matchData.proposalId);
                proposalDoc = await transaction.get(proposalRef);
            }

            // Check blocked slots — exclude THIS match from the check
            const [teamABlocked, teamBBlocked] = await Promise.all([
                getBlockedSlotsForTeam(matchData.teamAId, newWeekId, matchId),
                getBlockedSlotsForTeam(matchData.teamBId, newWeekId, matchId)
            ]);

            if (teamABlocked.has(newSlotId) || teamBBlocked.has(newSlotId)) {
                throw new functions.https.HttpsError('failed-precondition',
                    'This slot is blocked by another match for one of the teams');
            }

            // WRITE PHASE
            const now = new Date();
            const previousSlotId = matchData.slotId;
            const previousWeekId = matchData.weekId;

            // 1. Update the match in-place
            transaction.update(matchRef, {
                slotId: newSlotId,
                weekId: newWeekId,
                scheduledDate: newScheduledDate,
                blockedSlot: newSlotId,
                rescheduledAt: now,
                rescheduledBy: userId,
                previousSlotId
            });

            // 2. Update parent proposal if exists
            if (proposalDoc && proposalDoc.exists) {
                transaction.update(proposalRef, {
                    confirmedSlotId: newSlotId,
                    updatedAt: now
                });
            }

            // 3. Event log
            const eventId = generateEventId(matchData.teamAName, 'match_rescheduled');
            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId: matchData.teamAId,
                teamName: matchData.teamAName,
                type: 'MATCH_RESCHEDULED',
                category: 'SCHEDULING',
                timestamp: now,
                userId,
                details: {
                    matchId,
                    proposalId: matchData.proposalId || null,
                    teamAId: matchData.teamAId,
                    teamAName: matchData.teamAName,
                    teamBId: matchData.teamBId,
                    teamBName: matchData.teamBName,
                    previousSlotId,
                    newSlotId,
                    previousWeekId,
                    newWeekId
                }
            });

            txResult = { previousSlotId, previousWeekId, matchData };
        });

        // Post-transaction: Discord notifications (best-effort)
        try {
            const matchData = txResult.matchData;
            const now = new Date();

            // Fetch bot registrations + team docs for delivery info
            const [teamABotReg, teamBBotReg, teamADoc, teamBDoc, userDoc] = await Promise.all([
                db.collection('botRegistrations').doc(matchData.teamAId).get(),
                db.collection('botRegistrations').doc(matchData.teamBId).get(),
                db.collection('teams').doc(matchData.teamAId).get(),
                db.collection('teams').doc(matchData.teamBId).get(),
                db.collection('users').doc(userId).get()
            ]);

            const teamABot = teamABotReg.exists ? teamABotReg.data() : null;
            const teamBBot = teamBBotReg.exists ? teamBBotReg.data() : null;
            const teamA = teamADoc.exists ? teamADoc.data() : null;
            const teamB = teamBDoc.exists ? teamBDoc.data() : null;
            const userData = userDoc.exists ? userDoc.data() : null;

            const teamALogoUrl = teamA?.activeLogo?.urls?.small || null;
            const teamBLogoUrl = teamB?.activeLogo?.urls?.small || null;

            const baseNotif = {
                type: 'match_rescheduled',
                status: 'pending',
                scheduledMatchId: matchId,
                previousSlotId: txResult.previousSlotId,
                newSlotId,
                weekId: newWeekId,
                gameType: matchData.gameType || 'official',
                proposerTeamId: matchData.teamAId,
                proposerTeamName: matchData.teamAName,
                proposerTeamTag: matchData.teamATag,
                opponentTeamId: matchData.teamBId,
                opponentTeamName: matchData.teamBName,
                opponentTeamTag: matchData.teamBTag,
                rescheduledByUserId: userId,
                rescheduledByDisplayName: userData?.displayName || null,
                proposerLogoUrl: teamALogoUrl,
                opponentLogoUrl: teamBLogoUrl,
                createdAt: now,
                deliveredAt: null
            };

            // Notification to team A
            await db.collection('notifications').doc().set({
                ...baseNotif,
                recipientTeamId: matchData.teamAId,
                recipientTeamName: matchData.teamAName,
                recipientTeamTag: matchData.teamATag,
                delivery: {
                    botRegistered: teamABot?.status === 'active',
                    guildId: teamABot?.guildId ?? null
                }
            });

            // Notification to team B
            await db.collection('notifications').doc().set({
                ...baseNotif,
                recipientTeamId: matchData.teamBId,
                recipientTeamName: matchData.teamBName,
                recipientTeamTag: matchData.teamBTag,
                delivery: {
                    botRegistered: teamBBot?.status === 'active',
                    guildId: teamBBot?.guildId ?? null
                }
            });
        } catch (notifError) {
            console.error('⚠️ Reschedule notification write failed (non-fatal):', notifError);
        }

        console.log('✅ Match rescheduled:', matchId, txResult.previousSlotId, '→', newSlotId);
        return { success: true, newSlotId, newScheduledDate };

    } catch (error) {
        console.error('❌ Error rescheduling match:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to reschedule match: ' + error.message);
    }
});
