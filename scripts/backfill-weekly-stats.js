/**
 * Backfill weekly stats for all past weeks that have availability data.
 *
 * Usage: node scripts/backfill-weekly-stats.js
 *
 * Reads from: availability, matchProposals, scheduledMatches
 * Writes to: weeklyStats/{weekId}
 */
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Note: We duplicate the logic here since functions/ code isn't directly importable
// outside the functions environment. Keep in sync with compute-weekly-stats.js.

async function computeStatsForWeek(weekId) {
    const uniqueUsers = new Set();
    const teamBreakdown = {};

    // 1. Availability
    const availSnap = await db.collection('availability')
        .where('weekId', '==', weekId)
        .get();

    for (const doc of availSnap.docs) {
        const data = doc.data();
        const teamId = data.teamId;
        const usersInTeam = new Set();

        for (const userIds of Object.values(data.slots || {})) {
            if (Array.isArray(userIds)) {
                userIds.forEach(uid => {
                    uniqueUsers.add(uid);
                    usersInTeam.add(uid);
                });
            }
        }

        if (usersInTeam.size > 0) {
            if (!teamBreakdown[teamId]) {
                teamBreakdown[teamId] = { users: 0, proposals: 0, matches: 0 };
            }
            teamBreakdown[teamId].users = usersInTeam.size;
        }
    }

    // 2. Proposals
    const proposalSnap = await db.collection('matchProposals')
        .where('weekId', '==', weekId)
        .get();

    for (const doc of proposalSnap.docs) {
        const teamId = doc.data().proposerTeamId;
        if (teamId) {
            if (!teamBreakdown[teamId]) {
                teamBreakdown[teamId] = { users: 0, proposals: 0, matches: 0 };
            }
            teamBreakdown[teamId].proposals++;
        }
    }

    // 3. Scheduled matches
    const matchSnap = await db.collection('scheduledMatches')
        .where('weekId', '==', weekId)
        .get();

    for (const doc of matchSnap.docs) {
        const data = doc.data();
        for (const teamId of [data.teamAId, data.teamBId]) {
            if (teamId) {
                if (!teamBreakdown[teamId]) {
                    teamBreakdown[teamId] = { users: 0, proposals: 0, matches: 0 };
                }
                teamBreakdown[teamId].matches++;
            }
        }
    }

    return {
        activeUsers: uniqueUsers.size,
        activeTeams: Object.keys(teamBreakdown).filter(t => teamBreakdown[t].users > 0).length,
        proposalCount: proposalSnap.size,
        scheduledCount: matchSnap.size,
        teamBreakdown
    };
}

async function main() {
    console.log('Discovering weeks with data...');

    // Find all distinct weekIds from availability collection
    const availSnap = await db.collection('availability').get();
    const weekIds = new Set();
    availSnap.forEach(doc => {
        const weekId = doc.data().weekId;
        if (weekId) weekIds.add(weekId);
    });

    const sorted = [...weekIds].sort();
    console.log(`Found ${sorted.length} weeks: ${sorted[0]} to ${sorted[sorted.length - 1]}`);

    for (const weekId of sorted) {
        const stats = await computeStatsForWeek(weekId);

        await db.collection('weeklyStats').doc(weekId).set({
            weekId,
            ...stats,
            computedAt: admin.firestore.Timestamp.now()
        });

        console.log(`${weekId}: ${stats.activeUsers} users, ${stats.proposalCount} proposals, ${stats.scheduledCount} matches`);
    }

    console.log(`\nBackfill complete: ${sorted.length} weeks processed`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
