// Availability Cloud Functions
// Following PRD v2 Architecture with Firebase v11

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

/**
 * Update user availability - add or remove from time slots
 *
 * @param {Object} request.data - Function parameters
 * @param {string} request.data.teamId - Team ID
 * @param {string} request.data.weekId - Week ID in ISO format (YYYY-WW)
 * @param {string} request.data.action - "add" or "remove"
 * @param {Array<string>} request.data.slotIds - Array of slot IDs (e.g., ['mon_1800', 'tue_1900'])
 * @returns {Object} { success: boolean } or throws HttpsError
 */
const updateAvailability = onCall({ region: 'europe-west10' }, async (request) => {
    const db = getFirestore();

    // Validate authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const userId = request.auth.uid;
    const { teamId, weekId, action, slotIds } = request.data;

    // Validate inputs
    if (!teamId || typeof teamId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid team ID');
    }

    if (!weekId || typeof weekId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid week ID');
    }

    if (!['add', 'remove'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Action must be "add" or "remove"');
    }

    if (!Array.isArray(slotIds) || slotIds.length === 0) {
        throw new HttpsError('invalid-argument', 'Must provide at least one slot');
    }

    // Validate slot ID format (day_time in UTC, e.g., "mon_1800", "tue_0200")
    // Any hour 00-23 valid since different timezones map to different UTC hours
    const validSlotPattern = /^(mon|tue|wed|thu|fri|sat|sun)_(0[0-9]|1[0-9]|2[0-3])(00|30)$/;
    for (const slotId of slotIds) {
        if (!validSlotPattern.test(slotId)) {
            throw new HttpsError('invalid-argument', `Invalid slot format: ${slotId}`);
        }
    }

    // Validate week ID format (ISO week: "2026-05")
    const weekPattern = /^\d{4}-\d{2}$/;
    if (!weekPattern.test(weekId)) {
        throw new HttpsError('invalid-argument', 'Invalid week format. Use YYYY-WW');
    }

    // Verify user is member of team
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
        throw new HttpsError('not-found', 'Team not found');
    }

    const teamData = teamDoc.data();
    const playerRoster = teamData.playerRoster || [];

    // Check if user is in the playerRoster array
    const isMember = playerRoster.some(player => player.userId === userId);
    if (!isMember) {
        throw new HttpsError('permission-denied', 'You are not a member of this team');
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
            updateData[`slots.${slotId}`] = FieldValue.arrayUnion(userId);
        } else {
            updateData[`slots.${slotId}`] = FieldValue.arrayRemove(userId);
        }
    });

    // Use update() which correctly interprets dot notation as nested paths
    await availRef.update(updateData);

    console.log(`Availability ${action}: ${userId} ${action === 'add' ? 'added to' : 'removed from'} ${slotIds.length} slots in ${docId}`);

    return { success: true };
});

module.exports = { updateAvailability };
