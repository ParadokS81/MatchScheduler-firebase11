// expire-proposals.js - Scheduled cleanup of expired proposals
// Runs every Monday at 00:15 UTC to expire proposals from the previous week.
// Proposals have expiresAt set to Sunday 23:59:59 UTC of their week.

const functions = require('firebase-functions');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * Scheduled function: runs every Monday at 00:15 UTC.
 * Finds all active proposals where expiresAt < now and sets status to 'expired'.
 */
exports.expireProposals = functions
    .region('europe-west3')
    .pubsub.schedule('15 0 * * 1')   // Every Monday at 00:15 UTC
    .timeZone('UTC')
    .onRun(async () => {
        const now = new Date();
        console.log(`⏰ Running proposal expiration at ${now.toISOString()}`);

        const snapshot = await db.collection('matchProposals')
            .where('status', '==', 'active')
            .where('expiresAt', '<', now)
            .get();

        if (snapshot.empty) {
            console.log('✅ No expired proposals found');
            return null;
        }

        console.log(`Found ${snapshot.size} expired proposal(s) to update`);

        // Batch update (max 500 per batch, well within our scale)
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.update(doc.ref, {
                status: 'expired',
                updatedAt: now
            });
        });

        await batch.commit();
        console.log(`✅ Expired ${snapshot.size} proposal(s)`);
        return null;
    });
