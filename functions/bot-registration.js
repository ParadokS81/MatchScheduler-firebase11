// Bot Registration Cloud Functions (Phase 1a)
// Manages voice bot registration lifecycle: connect (pending) and disconnect

const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * manageBotRegistration - Create or delete a bot registration for a team
 *
 * Connect: Creates a pending botRegistrations/{teamId} document
 * Disconnect: Deletes the botRegistrations/{teamId} document
 */
exports.manageBotRegistration = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        // 1. Authentication check
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { action, teamId } = data;

        // 2. Validate input
        if (!teamId || typeof teamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
        }
        if (!action || !['connect', 'disconnect'].includes(action)) {
            throw new functions.https.HttpsError('invalid-argument', 'action must be "connect" or "disconnect"');
        }

        // 3. Verify team exists and caller is leader or scheduler
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Team not found');
        }

        const team = teamDoc.data();
        const isLeader = team.leaderId === userId;
        const isScheduler = (team.schedulers || []).includes(userId);
        if (!isLeader && !isScheduler) {
            throw new functions.https.HttpsError('permission-denied', 'Only team leaders and schedulers can manage bot registration');
        }

        if (action === 'connect') {
            return await _handleConnect(userId, teamId, team);
        } else {
            return await _handleDisconnect(teamId);
        }

    } catch (error) {
        console.error('❌ manageBotRegistration error:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to manage bot registration: ' + error.message);
    }
});

/**
 * Handle connect action - create pending registration
 */
async function _handleConnect(userId, teamId, team) {
    // Check caller has Discord linked
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
    }

    const user = userDoc.data();
    if (!user.discordUserId) {
        throw new functions.https.HttpsError('failed-precondition',
            'Discord not linked. Link your Discord in profile settings first.');
    }

    // Check no active registration already exists
    const existingReg = await db.collection('botRegistrations').doc(teamId).get();
    if (existingReg.exists) {
        throw new functions.https.HttpsError('already-exists',
            'Bot is already registered or pending for this team');
    }

    // Collect Discord IDs from leader + all schedulers
    const authorizedUserIds = new Set([team.leaderId, ...(team.schedulers || [])]);
    const userDocPromises = [...authorizedUserIds].map(uid =>
        db.collection('users').doc(uid).get()
    );
    const userDocs = await Promise.all(userDocPromises);
    const authorizedDiscordUserIds = userDocs
        .filter(doc => doc.exists && doc.data().discordUserId)
        .map(doc => doc.data().discordUserId);

    // Create pending registration
    const registration = {
        teamId: teamId,
        teamTag: team.teamTag,
        teamName: team.teamName,
        authorizedDiscordUserId: user.discordUserId, // Backward compat: caller's Discord ID
        authorizedDiscordUserIds: authorizedDiscordUserIds, // All leader + scheduler Discord IDs
        registeredBy: userId,
        guildId: null,
        guildName: null,
        status: 'pending',
        knownPlayers: {},
        createdAt: FieldValue.serverTimestamp(),
        activatedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection('botRegistrations').doc(teamId).set(registration);

    console.log('✅ Bot registration created (pending):', { teamId, teamName: team.teamName, authorizedDiscordUserIds });

    return {
        success: true,
        registration: {
            ...registration,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }
    };
}

/**
 * Handle disconnect action - set status to 'disconnecting' so quad can leave the guild first
 */
async function _handleDisconnect(teamId) {
    const regDoc = await db.collection('botRegistrations').doc(teamId).get();
    if (!regDoc.exists) {
        // Already disconnected - idempotent success
        return { success: true };
    }

    // Don't delete — set status so quad can pick it up, leave the guild, then delete
    await regDoc.ref.update({
        status: 'disconnecting',
        disconnectRequestedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    console.log('✅ Bot disconnect requested:', { teamId });

    return { success: true };
}
