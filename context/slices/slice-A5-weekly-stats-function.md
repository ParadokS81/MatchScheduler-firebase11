# Slice A5: Weekly Stats Function

## Slice Definition

| Field | Value |
|-------|-------|
| **ID** | A5 |
| **Name** | Weekly Stats Scheduled Function + Backfill |
| **Depends on** | A1 (Firestore rules for `weeklyStats` collection) |
| **Enriches** | A2 (previous week comparison uses stored stats), A3 (team activity tab uses teamBreakdown) |

**User Story:** As the app admin, I want weekly engagement stats to be automatically computed and stored every Monday so that historical comparison works reliably, and I can track team activity trends over time to identify inactive teams.

**Success Criteria:**
1. Scheduled Cloud Function runs every Monday at 00:05 UTC
2. Computes stats for the previous week and writes to `weeklyStats/{weekId}`
3. Stats include: activeUsers, activeTeams, proposalCount, scheduledCount, teamBreakdown
4. teamBreakdown has per-team counts for identifying inactive teams
5. Backfill script populates historical stats for all past weeks with data
6. Function is idempotent — re-running for the same week overwrites with fresh data
7. A2's AdminStatsService reads stored stats instead of computing from scratch

---

## Architecture

### Files Changed

| File | Action | What |
|------|--------|------|
| `functions/compute-weekly-stats.js` | **New** | Scheduled Cloud Function |
| `scripts/backfill-weekly-stats.js` | **New** | One-time backfill script for historical data |
| `functions/index.js` | Modify | Export new function |

---

## Implementation Details

### 1. `functions/compute-weekly-stats.js` (New)

```javascript
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
```

### 2. `functions/index.js` — Export

Add after line 73:
```javascript
// Admin functions
const { computeWeeklyStats } = require('./compute-weekly-stats');
exports.computeWeeklyStats = computeWeeklyStats;
```

### 3. `scripts/backfill-weekly-stats.js` (New)

One-time script to populate historical stats. Uses Admin SDK directly.

```javascript
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

// Import shared computation logic
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
```

---

## Data Flow

```
Every Monday 00:05 UTC:
  Cloud Scheduler → Pub/Sub → computeWeeklyStats function
    → Query availability for previous weekId
    → Query matchProposals for previous weekId
    → Query scheduledMatches for previous weekId
    → Compute: activeUsers, activeTeams, proposalCount, scheduledCount, teamBreakdown
    → Write to weeklyStats/{weekId}
    → AdminStatsService (A2) reads this on next admin panel load

One-time backfill:
  node scripts/backfill-weekly-stats.js
    → Discover all weekIds from availability collection
    → For each weekId, compute and write stats
    → Historical data available immediately
```

---

## Deployment

```bash
# 1. Deploy the scheduled function
firebase deploy --only functions:computeWeeklyStats

# 2. Verify Cloud Scheduler job was created
# Check Firebase Console → Functions → computeWeeklyStats
# Should show schedule: "5 0 * * 1" (UTC)

# 3. Run backfill for historical data
node scripts/backfill-weekly-stats.js

# 4. (Optional) Manually trigger for testing
# In Firebase Console → Functions → computeWeeklyStats → "Run Now"
# Or via gcloud:
gcloud scheduler jobs run firebase-schedule-computeWeeklyStats-europe-west3 --location=europe-west3
```

---

## Performance Classification

- **Scheduled function:** Runs once per week. Queries 3 collections. ~40 availability docs, ~20 proposals, ~15 matches per week. Total execution <5s.
- **Backfill script:** One-time. Queries N weeks × 3 collections. For 20 weeks of data: ~60 queries. Runs in <30s.

---

## Test Scenarios

1. **Scheduled function runs** → `weeklyStats/{prevWeekId}` doc appears in Firestore console
2. **Stats accuracy** → manually count availability docs for a week, compare with stored `activeUsers`
3. **teamBreakdown** → verify per-team counts match reality
4. **Idempotent** → run function twice for same week → same result, no duplicates
5. **Backfill** → run script → verify docs exist for all past weeks
6. **A2 integration** → with stored stats, AdminStatsDisplay shows instant previous week comparison (no live computation needed)
7. **Empty week** → week with no availability → stats are all 0, doc still created

---

## Common Pitfalls

- **Week ID calculation edge cases.** ISO week at year boundaries (e.g., Dec 31 might be week 1 of next year). The `getISOWeekId()` function handles this by using the Thursday-based ISO rule.
- **Function runs Monday 00:05 UTC.** It computes for the PREVIOUS week. Going back 1 day (to Sunday) ensures we're in the right week even with timezone edge cases.
- **Duplicated computation logic.** The backfill script duplicates `computeStatsForWeek` from the Cloud Function because `functions/` code can't be directly imported in scripts (different Node.js context, no functions runtime). Keep them in sync if logic changes.
- **Pub/Sub schedule syntax.** v1 `pubsub.schedule()` uses cron syntax. `'5 0 * * 1'` = minute 5, hour 0, any day-of-month, any month, Monday.
- **First deploy creates Cloud Scheduler job.** The Firebase CLI creates the Cloud Scheduler job automatically. No manual setup needed. But verify in the console that it appears with the correct schedule.

---

## Implementation Notes

- This is the first scheduled function in the project. All existing 25 functions are v1 onCall. The `pubsub.schedule` pattern is also v1 — it deploys as a regular Cloud Function triggered by Pub/Sub, with Cloud Scheduler configured automatically.
- The backfill script should be run AFTER deploying Firestore rules (A1) since it writes to `weeklyStats` via Admin SDK (bypasses rules, but good to have rules in place).
- After backfill, A2's `AdminStatsService._loadStoredStats()` will find docs and skip the expensive live computation for past weeks.
