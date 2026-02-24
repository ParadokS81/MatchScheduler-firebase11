// big4-sync.js - One-way sync of scheduled games from TheBig4.se API
// Creates scheduledMatches for Big4 games that don't exist in MatchScheduler.
// Rule: If Big4 has a game and we don't → create it. Otherwise don't touch.

const functions = require('firebase-functions');
const { getFirestore } = require('firebase-admin/firestore');
const https = require('https');
const { getISOWeekYear, getISOWeekNumber } = require('./week-utils');

const db = getFirestore();

const BIG4_API_URL = 'https://www.thebig4.se/api/public/scheduled-games/';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fetch scheduled games from Big4 API.
 * Returns { timezone, count, games: [...] }
 */
function fetchBig4Games() {
    const apiKey = process.env.BIG4_API_KEY;
    if (!apiKey) {
        throw new Error('BIG4_API_KEY not set in environment');
    }

    return new Promise((resolve, reject) => {
        const url = new URL(BIG4_API_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            headers: { 'X-API-Key': apiKey }
        };
        https.get(options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Big4 API returned ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Big4 API returned invalid JSON'));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Convert Big4 CET time to UTC Date.
 * Big4 API returns scheduled_date as ISO string and scheduled_time as "HH:MM:SS".
 * CET = UTC+1 (Big4 season is Feb-Apr, all winter time).
 */
function big4ToUtcDate(scheduledDate, scheduledTime) {
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const date = new Date(scheduledDate);
    date.setUTCHours(hours - 1, minutes, 0, 0); // CET → UTC = subtract 1 hour
    return date;
}

/**
 * Compute UTC slotId from a Date object.
 * E.g. Date for Tuesday 20:00 UTC → "tue_2000"
 */
function computeSlotId(date) {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const day = days[date.getUTCDay()];
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day}_${hours}${mins}`;
}

/**
 * Generate an eventLog document ID.
 * Format: YYYYMMDD-HHMM-teamname-eventtype_XXXX
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
 * Build a lookup map of teamName (lowercase) → team document data.
 * Returns Map<string, { id, teamName, teamTag, ... }>
 */
async function buildTeamLookup() {
    const snapshot = await db.collection('teams').get();
    const lookup = new Map();
    snapshot.forEach(doc => {
        const data = doc.data();
        lookup.set(data.teamName.toLowerCase(), { id: doc.id, ...data });
    });
    return lookup;
}

/**
 * Get all existing big4FixtureIds from scheduledMatches.
 * Returns Set<number> for O(1) dedup checks.
 */
async function getExistingFixtureIds() {
    const snapshot = await db.collection('scheduledMatches')
        .where('origin', '==', 'big4_import')
        .get();

    const ids = new Set();
    snapshot.forEach(doc => {
        const fixtureId = doc.data().big4FixtureId;
        if (fixtureId != null) ids.add(fixtureId);
    });
    return ids;
}

/**
 * Check if two teams already have a scheduled match on the same day.
 * Checks all origins (proposal, quick_add, big4_import).
 */
async function teamsHaveMatchOnDate(teamAId, teamBId, scheduledDate) {
    // Query matches where teamA is involved on this date
    const snapshot = await db.collection('scheduledMatches')
        .where('scheduledDate', '==', scheduledDate)
        .where('status', '==', 'upcoming')
        .get();

    return snapshot.docs.some(doc => {
        const d = doc.data();
        const teamsMatch = (
            (d.teamAId === teamAId && d.teamBId === teamBId) ||
            (d.teamAId === teamBId && d.teamBId === teamAId)
        );
        return teamsMatch;
    });
}

// ─── Core Sync Logic ────────────────────────────────────────────────────────

/**
 * Sync Big4 scheduled games into MatchScheduler.
 * Returns a summary of actions taken.
 */
async function syncBig4Games() {
    const summary = {
        fetched: 0,
        created: 0,
        skippedExisting: 0,
        skippedMatched: 0,
        skippedUnknownTeam: 0,
        skippedPast: 0,
        warnings: []
    };
    const created = [];

    // 1. Fetch from Big4
    console.log('📡 Fetching Big4 scheduled games...');
    const big4Data = await fetchBig4Games();
    summary.fetched = big4Data.count || big4Data.games.length;
    console.log(`   Got ${summary.fetched} games`);

    // 2. Load our team lookup + existing fixture IDs
    const [teamLookup, existingFixtureIds] = await Promise.all([
        buildTeamLookup(),
        getExistingFixtureIds()
    ]);
    console.log(`   Team lookup: ${teamLookup.size} teams, ${existingFixtureIds.size} existing imports`);

    // 3. Process each game
    const now = new Date();

    for (const game of big4Data.games) {
        const { fixture_id, division, scheduled_date, scheduled_time, team1, team2 } = game;
        const label = `[${fixture_id}] ${team1} vs ${team2}`;

        // 3a. Already imported?
        if (existingFixtureIds.has(fixture_id)) {
            summary.skippedExisting++;
            console.log(`   ⏭️  ${label} — already imported`);
            continue;
        }

        // 3b. Resolve teams
        const teamA = teamLookup.get(team1.toLowerCase());
        const teamB = teamLookup.get(team2.toLowerCase());

        if (!teamA || !teamB) {
            summary.skippedUnknownTeam++;
            const missing = !teamA ? team1 : team2;
            const warning = `${label} — team "${missing}" not found in our DB`;
            summary.warnings.push(warning);
            console.log(`   ⚠️  ${warning}`);
            continue;
        }

        // 3c. Convert CET → UTC and compute schedule fields
        const utcDate = big4ToUtcDate(scheduled_date, scheduled_time);

        // Skip if in the past
        if (utcDate <= now) {
            summary.skippedPast++;
            console.log(`   ⏭️  ${label} — in the past`);
            continue;
        }

        const slotId = computeSlotId(utcDate);
        const weekYear = getISOWeekYear(utcDate);
        const weekNum = getISOWeekNumber(utcDate);
        const weekId = `${weekYear}-${String(weekNum).padStart(2, '0')}`;
        const scheduledDate = utcDate.toISOString().split('T')[0];

        // 3d. Check if these teams already have a match on this day (any origin)
        const alreadyMatched = await teamsHaveMatchOnDate(teamA.id, teamB.id, scheduledDate);
        if (alreadyMatched) {
            summary.skippedMatched++;
            console.log(`   ⏭️  ${label} — teams already matched on ${scheduledDate}`);
            continue;
        }

        // 3e. Create scheduledMatch
        const matchRef = db.collection('scheduledMatches').doc();

        await matchRef.set({
            teamAId: teamA.id,
            teamAName: teamA.teamName,
            teamATag: teamA.teamTag,
            teamBId: teamB.id,
            teamBName: teamB.teamName,
            teamBTag: teamB.teamTag,
            weekId,
            slotId,
            scheduledDate,
            blockedSlot: slotId,
            blockedTeams: [teamA.id, teamB.id],
            teamARoster: [],
            teamBRoster: [],
            proposalId: null,
            origin: 'big4_import',
            addedBy: null,
            status: 'upcoming',
            gameType: 'official',
            gameTypeSetBy: null,
            big4FixtureId: fixture_id,
            big4Division: division,
            confirmedAt: now,
            confirmedByA: null,
            confirmedByB: null,
            createdAt: now
        });

        // 3f. Event log (one entry per team involved)
        const eventIdA = generateEventId(teamA.teamName, 'match_big4_imported');
        await db.collection('eventLog').doc(eventIdA).set({
            eventId: eventIdA,
            teamId: teamA.id,
            teamName: teamA.teamName,
            type: 'MATCH_BIG4_IMPORTED',
            category: 'SCHEDULING',
            timestamp: now,
            userId: null,
            details: {
                matchId: matchRef.id,
                big4FixtureId: fixture_id,
                big4Division: division,
                slotId,
                weekId,
                gameType: 'official',
                origin: 'big4_import',
                teams: {
                    a: { id: teamA.id, name: teamA.teamName },
                    b: { id: teamB.id, name: teamB.teamName }
                }
            }
        });

        summary.created++;
        created.push({
            matchId: matchRef.id,
            teamA: teamA.teamTag,
            teamB: teamB.teamTag,
            date: scheduledDate,
            time: scheduled_time,
            division,
            fixtureId: fixture_id
        });
        console.log(`   ✅ ${label} → ${matchRef.id} (${scheduledDate} ${slotId})`);
    }

    return { summary, created };
}

// ─── Cloud Function: Admin-triggered sync ───────────────────────────────────

// ─── Cloud Function: Admin-triggered sync (onCall) ──────────────────────────

exports.syncBig4Matches = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
        try {
            if (!context.auth) {
                throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
            }

            console.log(`🔄 Big4 sync triggered by ${context.auth.uid}`);

            const { summary, created } = await syncBig4Games();

            console.log('📊 Sync summary:', JSON.stringify(summary));

            return {
                success: true,
                summary,
                created
            };

        } catch (error) {
            console.error('❌ Big4 sync error:', error);
            if (error instanceof functions.https.HttpsError) throw error;
            throw new functions.https.HttpsError('internal', `Sync failed: ${error.message}`);
        }
    });

// ─── Cloud Function: Scheduled sync (every 15 min = 4 req/hour) ────────────

exports.scheduledBig4Sync = functions
    .region('europe-west3')
    .pubsub.schedule('3,18,33,48 * * * *')   // :03, :18, :33, :48 — 4x/hour
    .timeZone('UTC')
    .onRun(async () => {
        console.log(`⏰ Scheduled Big4 sync at ${new Date().toISOString()}`);

        try {
            const { summary, created } = await syncBig4Games();

            if (summary.created > 0) {
                console.log(`🆕 Imported ${summary.created} new match(es):`,
                    created.map(c => `${c.teamA} vs ${c.teamB} (${c.date})`).join(', '));
            } else {
                console.log(`✅ All synced (${summary.fetched} checked, 0 new)`);
            }

            return null;
        } catch (error) {
            console.error('❌ Scheduled Big4 sync failed:', error.message);
            return null;
        }
    });
