#!/usr/bin/env node
/**
 * Compare Big4 scheduled games with MatchScheduler production data.
 * Fetches from both Big4 API and production Firestore, then cross-references.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');
const https = require('https');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const BIG4_API = 'https://www.thebig4.se/api/public/scheduled-games/';
const BIG4_KEY = 'd3fdf8413ee35edd484f58d56baf1d7ca7503c609ebdc0f0dddb044fe84fe4c1';

function fetchBig4() {
    return new Promise((resolve, reject) => {
        const url = new URL(BIG4_API);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            headers: { 'X-API-Key': BIG4_KEY }
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

// Convert CET time to UTC slotId format (e.g. "21:00:00" on "2026-02-24" -> "tue_2000")
function big4ToSlotId(scheduledDate, scheduledTime) {
    const date = new Date(scheduledDate);
    const [hours, minutes] = scheduledTime.split(':').map(Number);

    // CET = UTC+1 (CEST = UTC+2, but Feb is CET)
    let utcHours = hours - 1;
    let dayOffset = 0;
    if (utcHours < 0) { utcHours += 24; dayOffset = -1; }

    // Get day of week from the date + potential offset
    const adjustedDate = new Date(date);
    adjustedDate.setDate(adjustedDate.getDate() + dayOffset);
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayName = days[adjustedDate.getUTCDay()];

    const timeStr = String(utcHours).padStart(2, '0') + String(minutes).padStart(2, '0');
    return `${dayName}_${timeStr}`;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth()+1}`;
}

async function main() {
    console.log('\n========== BIG4 vs MATCHSCHEDULER COMPARISON ==========\n');

    // 1. Fetch Big4 games
    console.log('Fetching Big4 scheduled games...');
    const big4 = await fetchBig4();
    console.log(`  Got ${big4.count} games (timezone: ${big4.timezone})\n`);

    // 2. Fetch our scheduled matches from production
    console.log('Fetching MatchScheduler production scheduledMatches...');
    const matchSnap = await db.collection('scheduledMatches')
        .where('status', '==', 'upcoming')
        .get();
    console.log(`  Got ${matchSnap.size} upcoming matches\n`);

    const ourMatches = [];
    matchSnap.forEach(doc => {
        const d = doc.data();
        ourMatches.push({ id: doc.id, ...d });
    });

    // 3. Also fetch team name mapping
    const teamSnap = await db.collection('teams').get();
    const teamsByName = {};
    const teamsById = {};
    teamSnap.forEach(doc => {
        const d = doc.data();
        teamsById[doc.id] = d;
        // Index by lowercase name for fuzzy matching
        teamsByName[d.teamName.toLowerCase()] = { id: doc.id, ...d };
    });

    // 4. Print our matches
    console.log('--- MATCHSCHEDULER UPCOMING MATCHES ---');
    ourMatches.sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
    for (const m of ourMatches) {
        const tagA = m.teamATag || '???';
        const tagB = m.teamBTag || '???';
        console.log(`  ${tagA} vs ${tagB}  |  ${m.scheduledDate} ${m.slotId}  |  ${m.gameType}  |  week ${m.weekId}`);
    }

    // 5. Print Big4 games with match status
    console.log('\n--- BIG4 SCHEDULED GAMES ---');
    for (const g of big4.games) {
        const slotId = big4ToSlotId(g.scheduled_date, g.scheduled_time);
        const dateStr = formatDate(g.scheduled_date);

        // Try to find matching team IDs
        const t1 = teamsByName[g.team1.toLowerCase()];
        const t2 = teamsByName[g.team2.toLowerCase()];
        const t1Tag = t1 ? t1.teamTag : '???';
        const t2Tag = t2 ? t2.teamTag : '???';
        const t1Id = t1 ? t1.id : null;
        const t2Id = t2 ? t2.id : null;

        // Check if we have this match
        let matchStatus = 'NOT IN SCHEDULER';
        if (t1Id && t2Id) {
            const found = ourMatches.find(m => {
                const teamsMatch = (
                    (m.teamAId === t1Id && m.teamBId === t2Id) ||
                    (m.teamAId === t2Id && m.teamBId === t1Id)
                );
                return teamsMatch;
            });
            if (found) {
                // Check if time matches too
                const timeMatch = found.slotId === slotId;
                matchStatus = timeMatch
                    ? `SYNCED (${found.id})`
                    : `TEAMS MATCH but different time: ours=${found.slotId} big4=${slotId} (${found.id})`;
            }
        }

        const inUs = t1Id ? '✓' : '✗';
        const inUs2 = t2Id ? '✓' : '✗';

        console.log(`  [${g.division}] ${g.team1} ${inUs} vs ${g.team2} ${inUs2}`);
        console.log(`    ${dateStr} ${g.scheduled_time} CET  (slotId: ${slotId})`);
        console.log(`    → ${matchStatus}`);
        console.log();
    }

    // 6. Summary
    console.log('--- SUMMARY ---');
    console.log(`Big4 games: ${big4.count}`);
    console.log(`MatchScheduler upcoming: ${ourMatches.length}`);

    // Count matches by status
    let synced = 0, timeMismatch = 0, notInScheduler = 0, unknownTeam = 0;
    for (const g of big4.games) {
        const t1 = teamsByName[g.team1.toLowerCase()];
        const t2 = teamsByName[g.team2.toLowerCase()];
        if (!t1 || !t2) { unknownTeam++; continue; }

        const slotId = big4ToSlotId(g.scheduled_date, g.scheduled_time);
        const found = ourMatches.find(m => {
            const teamsMatch = (
                (m.teamAId === t1.id && m.teamBId === t2.id) ||
                (m.teamAId === t2.id && m.teamBId === t1.id)
            );
            return teamsMatch;
        });

        if (!found) notInScheduler++;
        else if (found.slotId === slotId) synced++;
        else timeMismatch++;
    }

    console.log(`  Synced (same teams + time): ${synced}`);
    console.log(`  Time mismatch (same teams, different time): ${timeMismatch}`);
    console.log(`  Not in MatchScheduler: ${notInScheduler}`);
    console.log(`  Unknown teams (not in our DB): ${unknownTeam}`);

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
