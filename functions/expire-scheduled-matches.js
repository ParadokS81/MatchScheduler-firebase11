// expire-scheduled-matches.js - Scheduled cleanup of past scheduled matches
// Runs every 30 min (at :01 and :31) to mark past matches as 'completed'.
// Scheduled matches don't have an expiresAt field, so we compute past-ness
// from scheduledDate + slotId (same logic as client-side _isMatchPast).

const functions = require('firebase-functions');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * Check if a scheduled match's time has passed.
 * Match is considered past 30 minutes after slot start (one timeslot).
 * Mirrors: public/js/services/ScheduledMatchService.js _isMatchPast()
 */
function isMatchPast(match) {
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

/**
 * Scheduled function: runs every 30 min at :01 and :31.
 * Timeslots are on :00 and :30 boundaries, so running 1 min after
 * ensures we catch matches right after each timeslot boundary.
 * A 20:00 match expires at 20:30 and gets archived at 20:31.
 */
exports.expireScheduledMatches = functions
    .region('europe-west3')
    .pubsub.schedule('1,31 * * * *')   // Every 30 min at :01 and :31
    .timeZone('UTC')
    .onRun(async () => {
        const now = new Date();
        console.log(`⏰ Running scheduled match expiration at ${now.toISOString()}`);

        const snapshot = await db.collection('scheduledMatches')
            .where('status', '==', 'upcoming')
            .get();

        if (snapshot.empty) {
            console.log('✅ No upcoming matches to check');
            return null;
        }

        // Filter to only past matches
        const pastDocs = snapshot.docs.filter(doc => isMatchPast(doc.data()));

        if (pastDocs.length === 0) {
            console.log(`✅ Checked ${snapshot.size} upcoming match(es), none past`);
            return null;
        }

        console.log(`Found ${pastDocs.length} past match(es) out of ${snapshot.size} upcoming`);

        // Batch update (max 500 per batch, well within our scale)
        const batch = db.batch();
        pastDocs.forEach(doc => {
            batch.update(doc.ref, {
                status: 'completed',
                completedAt: now
            });
        });

        await batch.commit();
        console.log(`✅ Marked ${pastDocs.length} match(es) as completed`);
        return null;
    });
