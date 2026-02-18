const functions = require('firebase-functions');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

/**
 * Scheduled function that computes engagement stats for the previous week.
 * Runs every Monday at 00:05 UTC.
 *
 * Writes to: weeklyStats/{weekId}
 * Reads from: availability, matchProposals, scheduledMatches
 */
exports.computeWeeklyStats = functions
    .region('europe-west3')
    .pubsub.schedule('5 0 * * 1')
    .timeZone('UTC')
    .onRun(async (context) => {
        const db = getFirestore();

        // Compute for previous week (the one that just ended)
        const prevWeekId = getPreviousWeekId();
        console.log(`Computing stats for week ${prevWeekId}`);

        const stats = await computeStatsForWeek(db, prevWeekId);

        await db.collection('weeklyStats').doc(prevWeekId).set({
            weekId: prevWeekId,
            ...stats,
            computedAt: Timestamp.now()
        });

        console.log(`Stats for ${prevWeekId}: ${stats.activeUsers} users, ` +
            `${stats.activeTeams} teams, ${stats.proposalCount} proposals, ` +
            `${stats.scheduledCount} matches`);

        return null;
    });

/**
 * Core computation logic — shared between scheduled function and backfill script.
 */
async function computeStatsForWeek(db, weekId) {
    // 1. Availability: count unique users and active teams
    const availSnap = await db.collection('availability')
        .where('weekId', '==', weekId)
        .get();

    const uniqueUsers = new Set();
    const teamBreakdown = {};

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

    // 2. Proposals: count per week, attribute to proposer team
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

    // 3. Scheduled matches: count per week, attribute to both teams
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

// --- Week ID utilities ---

function getPreviousWeekId() {
    const now = new Date();
    // Go back 1 day to be safely in the previous week (we run Monday 00:05)
    const target = new Date(now);
    target.setUTCDate(target.getUTCDate() - 1); // Sunday of previous week
    return getISOWeekId(target);
}

function getISOWeekId(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Set to nearest Thursday
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

// Export for use by backfill script
exports.computeStatsForWeek = computeStatsForWeek;
exports.getISOWeekId = getISOWeekId;
