#!/usr/bin/env node
/**
 * Test Big4 sync logic against production Firestore.
 *
 * Usage:
 *   node scripts/test-big4-sync.js              # Dry run (read-only)
 *   node scripts/test-big4-sync.js --execute    # Actually create matches
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');
const https = require('https');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Load .env for BIG4_API_KEY
const fs = require('fs');
const envPath = require('path').join(__dirname, '../functions/.env');
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
for (const line of envLines) {
    const match = line.match(/^([^#=]+)=(.+)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
}

const EXECUTE = process.argv.includes('--execute');

// ─── Copy of sync helpers (same as big4-sync.js) ───────────────────────────

const BIG4_API_URL = 'https://www.thebig4.se/api/public/scheduled-games/';

function fetchBig4Games() {
    const apiKey = process.env.BIG4_API_KEY;
    if (!apiKey) throw new Error('BIG4_API_KEY not set');
    return new Promise((resolve, reject) => {
        const url = new URL(BIG4_API_URL);
        https.get({ hostname: url.hostname, path: url.pathname, headers: { 'X-API-Key': apiKey } }, (res) => {
            if (res.statusCode !== 200) { reject(new Error(`Big4 API returned ${res.statusCode}`)); return; }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}

function big4ToUtcDate(scheduledDate, scheduledTime) {
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const date = new Date(scheduledDate);
    date.setUTCHours(hours - 1, minutes, 0, 0);
    return date;
}

function computeSlotId(date) {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return `${days[date.getUTCDay()]}_${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function getISOWeekYear(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    return d.getUTCFullYear();
}

function generateEventId(teamName, eventType) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const teamNameClean = teamName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${dateStr}-${timeStr}-${teamNameClean}-${eventType}_${randomSuffix}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log(EXECUTE
        ? '\n🔥 EXECUTE MODE — will create matches in production!\n'
        : '\n⚠️  DRY RUN — no changes will be made. Pass --execute to write.\n');

    // 1. Fetch Big4
    console.log('📡 Fetching Big4 scheduled games...');
    const big4Data = await fetchBig4Games();
    console.log(`   Got ${big4Data.games.length} games\n`);

    // 2. Load teams + existing imports
    const teamSnap = await db.collection('teams').get();
    const teamLookup = new Map();
    teamSnap.forEach(doc => {
        const d = doc.data();
        teamLookup.set(d.teamName.toLowerCase(), { id: doc.id, ...d });
    });

    const importSnap = await db.collection('scheduledMatches')
        .where('origin', '==', 'big4_import')
        .get();
    const existingFixtureIds = new Set();
    importSnap.forEach(doc => {
        const fid = doc.data().big4FixtureId;
        if (fid != null) existingFixtureIds.add(fid);
    });
    console.log(`   ${teamLookup.size} teams, ${existingFixtureIds.size} existing imports\n`);

    // 3. Load all upcoming matches for same-day dedup
    const upcomingSnap = await db.collection('scheduledMatches')
        .where('status', '==', 'upcoming')
        .get();
    const upcomingMatches = [];
    upcomingSnap.forEach(doc => upcomingMatches.push({ id: doc.id, ...doc.data() }));

    // 4. Process each game
    const now = new Date();
    const summary = { fetched: big4Data.games.length, created: 0, skippedExisting: 0, skippedMatched: 0, skippedUnknownTeam: 0, skippedPast: 0 };
    const warnings = [];
    const toCreate = [];

    for (const game of big4Data.games) {
        const { fixture_id, division, scheduled_date, scheduled_time, team1, team2 } = game;
        const label = `[${fixture_id}] ${team1} vs ${team2}`;

        if (existingFixtureIds.has(fixture_id)) {
            summary.skippedExisting++;
            console.log(`   ⏭️  ${label} — already imported`);
            continue;
        }

        const teamA = teamLookup.get(team1.toLowerCase());
        const teamB = teamLookup.get(team2.toLowerCase());
        if (!teamA || !teamB) {
            summary.skippedUnknownTeam++;
            console.log(`   ⚠️  ${label} — team "${!teamA ? team1 : team2}" not found`);
            continue;
        }

        const utcDate = big4ToUtcDate(scheduled_date, scheduled_time);
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

        // Same-day dedup
        const alreadyMatched = upcomingMatches.some(m => {
            const teamsMatch = (m.teamAId === teamA.id && m.teamBId === teamB.id) ||
                               (m.teamAId === teamB.id && m.teamBId === teamA.id);
            return teamsMatch && m.scheduledDate === scheduledDate;
        });

        if (alreadyMatched) {
            summary.skippedMatched++;
            console.log(`   ⏭️  ${label} — already matched on ${scheduledDate}`);
            continue;
        }

        toCreate.push({ game, teamA, teamB, slotId, weekId, scheduledDate, division });
        console.log(`   ✅ ${label} → WILL CREATE (${scheduledDate} ${slotId})`);
    }

    // 5. Create matches
    console.log(`\n--- SUMMARY ---`);
    console.log(`   Fetched: ${summary.fetched}`);
    console.log(`   To create: ${toCreate.length}`);
    console.log(`   Skipped (already imported): ${summary.skippedExisting}`);
    console.log(`   Skipped (already matched): ${summary.skippedMatched}`);
    console.log(`   Skipped (unknown team): ${summary.skippedUnknownTeam}`);
    console.log(`   Skipped (past): ${summary.skippedPast}`);

    if (toCreate.length === 0) {
        console.log('\n✅ Nothing to create — all synced!');
        process.exit(0);
    }

    if (!EXECUTE) {
        console.log(`\n⚠️  Would create ${toCreate.length} matches. Run with --execute to apply.`);
        process.exit(0);
    }

    console.log(`\n🔥 Creating ${toCreate.length} matches...`);
    for (const { game, teamA, teamB, slotId, weekId, scheduledDate, division } of toCreate) {
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
            big4FixtureId: game.fixture_id,
            big4Division: division,
            confirmedAt: now,
            confirmedByA: null,
            confirmedByB: null,
            createdAt: now
        });

        // Event log
        const eventId = generateEventId(teamA.teamName, 'match_big4_imported');
        await db.collection('eventLog').doc(eventId).set({
            eventId,
            teamId: teamA.id,
            teamName: teamA.teamName,
            type: 'MATCH_BIG4_IMPORTED',
            category: 'SCHEDULING',
            timestamp: now,
            userId: null,
            details: {
                matchId: matchRef.id,
                big4FixtureId: game.fixture_id,
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

        console.log(`   ✅ Created ${matchRef.id}: ${teamA.teamTag} vs ${teamB.teamTag} (${scheduledDate} ${slotId})`);
    }

    console.log(`\n✅ Done! Created ${toCreate.length} matches.`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
