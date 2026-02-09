// Availability Cloud Functions
// Following PRD v2 Architecture with Firebase v11

const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

/**
 * Update user availability - add or remove from time slots
 *
 * @param {Object} data - Function parameters
 * @param {string} data.teamId - Team ID
 * @param {string} data.weekId - Week ID in ISO format (YYYY-WW)
 * @param {string} data.action - "add" or "remove"
 * @param {Array<string>} data.slotIds - Array of slot IDs (e.g., ['mon_1800', 'tue_1900'])
 * @returns {Object} { success: boolean } or throws HttpsError
 */
const updateAvailability = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    const db = getFirestore();

    // Validate authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const userId = context.auth.uid;
    const { teamId, weekId, action, slotIds, targetUserId } = data;

    // Validate inputs
    if (!teamId || typeof teamId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid team ID');
    }

    if (!weekId || typeof weekId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid week ID');
    }

    if (!['add', 'remove', 'markUnavailable', 'removeUnavailable'].includes(action)) {
        throw new functions.https.HttpsError('invalid-argument', 'Action must be "add", "remove", "markUnavailable", or "removeUnavailable"');
    }

    if (!Array.isArray(slotIds) || slotIds.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide at least one slot');
    }

    // Validate slot ID format (day_time in UTC, e.g., "mon_1800", "tue_0200")
    // Any hour 00-23 valid since different timezones map to different UTC hours
    const validSlotPattern = /^(mon|tue|wed|thu|fri|sat|sun)_(0[0-9]|1[0-9]|2[0-3])(00|30)$/;
    for (const slotId of slotIds) {
        if (!validSlotPattern.test(slotId)) {
            throw new functions.https.HttpsError('invalid-argument', `Invalid slot format: ${slotId}`);
        }
    }

    // Validate week ID format (ISO week: "2026-05")
    const weekPattern = /^\d{4}-\d{2}$/;
    if (!weekPattern.test(weekId)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid week format. Use YYYY-WW');
    }

    // Validate optional targetUserId
    if (targetUserId !== undefined && (typeof targetUserId !== 'string' || !targetUserId)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid target user ID');
    }

    const effectiveUserId = targetUserId || userId;

    // Verify user is member of team
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Team not found');
    }

    const teamData = teamDoc.data();
    const playerRoster = teamData.playerRoster || [];

    // Caller must be a team member
    const isMember = playerRoster.some(player => player.userId === userId);
    if (!isMember) {
        throw new functions.https.HttpsError('permission-denied', 'You are not a member of this team');
    }

    // If acting on behalf of another user, caller must be leader/scheduler
    if (targetUserId && targetUserId !== userId) {
        const isLeader = teamData.leaderId === userId;
        const isScheduler = (teamData.schedulers || []).includes(userId);
        if (!isLeader && !isScheduler) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Only leaders and schedulers can add availability for other players'
            );
        }
        // Target must also be a team member
        const targetIsMember = playerRoster.some(player => player.userId === targetUserId);
        if (!targetIsMember) {
            throw new functions.https.HttpsError('invalid-argument', 'Target player is not a member of this team');
        }
    }

    // Build update object for atomic operations
    const docId = `${teamId}_${weekId}`;
    const availRef = db.collection('availability').doc(docId);

    // Check if document exists
    const existingDoc = await availRef.get();

    if (!existingDoc.exists) {
        // Create document with proper structure first
        await availRef.set({
            teamId,
            weekId,
            slots: {},
            unavailable: {},
            lastUpdated: FieldValue.serverTimestamp()
        });
    }

    // Build slot updates using FieldPath for proper nested field handling
    const updateData = {
        lastUpdated: FieldValue.serverTimestamp()
    };

    // Use arrayUnion/arrayRemove for atomic slot updates
    // Note: update() properly handles dot notation as field paths
    slotIds.forEach(slotId => {
        if (action === 'add') {
            updateData[`slots.${slotId}`] = FieldValue.arrayUnion(effectiveUserId);
            // Mutual exclusion: adding availability removes unavailability
            updateData[`unavailable.${slotId}`] = FieldValue.arrayRemove(effectiveUserId);
        } else if (action === 'remove') {
            updateData[`slots.${slotId}`] = FieldValue.arrayRemove(effectiveUserId);
        } else if (action === 'markUnavailable') {
            updateData[`unavailable.${slotId}`] = FieldValue.arrayUnion(effectiveUserId);
            // Mutual exclusion: marking unavailable removes availability
            updateData[`slots.${slotId}`] = FieldValue.arrayRemove(effectiveUserId);
        } else if (action === 'removeUnavailable') {
            updateData[`unavailable.${slotId}`] = FieldValue.arrayRemove(effectiveUserId);
        }
    });

    // Use update() which correctly interprets dot notation as nested paths
    await availRef.update(updateData);

    const proxyInfo = targetUserId && targetUserId !== userId ? ` (by ${userId})` : '';
    const actionLabels = { add: 'added to', remove: 'removed from', markUnavailable: 'marked unavailable in', removeUnavailable: 'unmarked unavailable in' };
    console.log(`Availability ${action}: ${effectiveUserId} ${actionLabels[action]} ${slotIds.length} slots in ${docId}${proxyInfo}`);

    return { success: true };
});

module.exports = { updateAvailability };
