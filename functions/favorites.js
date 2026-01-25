const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * Cloud Function: updateFavorites
 * Add or remove a team from user's favoriteTeams array
 * Uses arrayUnion/arrayRemove for atomic updates
 */
exports.updateFavorites = onCall(async (request) => {
    const { auth, data } = request;

    // Verify user is authenticated
    if (!auth) {
        throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    const { uid } = auth;
    const { teamId, action } = data;

    // Validate input
    if (!teamId || typeof teamId !== 'string') {
        throw new HttpsError('invalid-argument', 'Invalid teamId');
    }

    if (!['add', 'remove'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Action must be "add" or "remove"');
    }

    const userRef = db.collection('users').doc(uid);

    try {
        if (action === 'add') {
            // Verify team exists before adding
            const teamDoc = await db.collection('teams').doc(teamId).get();
            if (!teamDoc.exists) {
                throw new HttpsError('not-found', 'Team not found');
            }

            // Add to favorites using arrayUnion (atomic, no duplicates)
            await userRef.update({
                favoriteTeams: FieldValue.arrayUnion(teamId)
            });

            console.log(`⭐ User ${uid} added team ${teamId} to favorites`);
        } else {
            // Remove from favorites using arrayRemove (atomic)
            await userRef.update({
                favoriteTeams: FieldValue.arrayRemove(teamId)
            });

            console.log(`⭐ User ${uid} removed team ${teamId} from favorites`);
        }

        // Return updated list
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        return {
            success: true,
            favoriteTeams: userData?.favoriteTeams || []
        };

    } catch (error) {
        console.error('❌ Error updating favorites:', error);

        if (error instanceof HttpsError) {
            throw error;
        }

        // Handle case where user document doesn't exist
        if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
            throw new HttpsError('not-found', 'User profile not found');
        }

        throw new HttpsError('internal', 'Failed to update favorites');
    }
});
