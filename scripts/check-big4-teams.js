#!/usr/bin/env node
/**
 * Check activity level of Big4 teams in MatchScheduler.
 * Focus on teams that scheduled on Big4 but not with us.
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

async function main() {
    // 1. Get all unique team names from Big4
    const big4 = await fetchBig4();
    const big4Teams = new Set();
    for (const g of big4.games) {
        big4Teams.add(g.team1);
        big4Teams.add(g.team2);
    }
    console.log(`\nBig4 API has ${big4Teams.size} unique teams in scheduled games\n`);

    // 2. Get all our teams
    const teamSnap = await db.collection('teams').get();
    const teamsByName = {};
    teamSnap.forEach(doc => {
        const d = doc.data();
        teamsByName[d.teamName.toLowerCase()] = { id: doc.id, ...d };
    });

    // 3. Check which Big4 teams are NOT in our system at all
    console.log('--- BIG4 TEAMS NOT IN OUR SYSTEM ---');
    const missingTeams = [];
    for (const name of big4Teams) {
        if (!teamsByName[name.toLowerCase()]) {
            missingTeams.push(name);
            console.log(`  ✗ "${name}" - NOT FOUND`);
        }
    }
    if (missingTeams.length === 0) console.log('  (all Big4 teams exist in our system)');

    // 4. Get all availability docs (to check who's actually using the grid)
    const availSnap = await db.collection('availability').get();
    const availByTeam = {};
    availSnap.forEach(doc => {
        const d = doc.data();
        const teamId = d.teamId;
        if (!availByTeam[teamId]) availByTeam[teamId] = [];
        // Count how many slots have players
        const slotCount = d.slots ? Object.keys(d.slots).length : 0;
        const totalPlayers = d.slots
            ? Object.values(d.slots).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
            : 0;
        availByTeam[teamId].push({ weekId: d.weekId, slotCount, totalPlayers });
    });

    // 5. Get all scheduled matches to see who's been active
    const matchSnap = await db.collection('scheduledMatches').get();
    const matchesByTeam = {};
    matchSnap.forEach(doc => {
        const d = doc.data();
        if (!matchesByTeam[d.teamAId]) matchesByTeam[d.teamAId] = [];
        if (!matchesByTeam[d.teamBId]) matchesByTeam[d.teamBId] = [];
        matchesByTeam[d.teamAId].push({ id: doc.id, vs: d.teamBTag, status: d.status, date: d.scheduledDate });
        matchesByTeam[d.teamBId].push({ id: doc.id, vs: d.teamATag, status: d.status, date: d.scheduledDate });
    });

    // 6. Detail report for ALL Big4 teams
    console.log('\n--- ALL BIG4 TEAMS: ACTIVITY IN MATCHSCHEDULER ---\n');

    // Sort by division for readability
    const allTeamNames = [...big4Teams].sort();

    for (const name of allTeamNames) {
        const team = teamsByName[name.toLowerCase()];
        if (!team) {
            console.log(`✗ ${name} — NOT IN OUR SYSTEM`);
            console.log();
            continue;
        }

        const roster = team.playerRoster || [];
        const realMembers = roster.filter(p => !p.userId.startsWith('seed-'));
        const seededMembers = roster.filter(p => p.userId.startsWith('seed-'));
        const avail = availByTeam[team.id] || [];
        const matches = matchesByTeam[team.id] || [];
        const div = team.divisions ? team.divisions.join(', ') : '?';

        // Determine activity level
        let activity = '';
        if (realMembers.length === 0 && avail.length === 0 && matches.length === 0) {
            activity = '🔴 DORMANT (seed only, no real activity)';
        } else if (realMembers.length > 0 && avail.length === 0 && matches.length === 0) {
            activity = '🟡 SIGNED UP (members joined but no grid/matches)';
        } else if (avail.length > 0 && matches.length === 0) {
            activity = '🟡 USING GRID (availability set, no matches yet)';
        } else if (matches.length > 0) {
            activity = '🟢 ACTIVE (has scheduled matches)';
        }

        console.log(`${team.teamTag.padEnd(6)} ${name} [${div}] — ${activity}`);
        console.log(`       Roster: ${roster.length} total (${realMembers.length} real, ${seededMembers.length} seeded)`);
        if (realMembers.length > 0) {
            console.log(`       Real members: ${realMembers.map(p => p.displayName).join(', ')}`);
        }
        console.log(`       Availability: ${avail.length} weeks with data`);
        if (avail.length > 0) {
            for (const a of avail.slice(-3)) {
                console.log(`         week ${a.weekId}: ${a.slotCount} slots, ${a.totalPlayers} player-entries`);
            }
        }
        console.log(`       Matches: ${matches.length} total (${matches.filter(m=>m.status==='upcoming').length} upcoming)`);
        console.log();
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
