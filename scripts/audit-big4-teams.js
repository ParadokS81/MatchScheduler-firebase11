#!/usr/bin/env node
/**
 * Audit all Big4 teams against MatchScheduler database.
 * Compares the full 30-team roster from Big4 website against our teams collection.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// All 30 teams from Big4 screenshot (Feb 23, 2026)
const big4Teams = {
    'Division 1': [
        'Slackers', 'Polonez', 'Hell Xpress', 'Suddendeath',
        'Black book', 'Gubbgrottan', 'the Suicide Quad', 'Koff',
        'The Axemen', 'Bear Beer Balalaika', 'Ving', 'Tribe of Tjernobyl'
    ],
    'Division 2': [
        'Fraggers United', 'Death Dealers', 'Rebel Souls', 'Good Old Friends',
        'Pineapple Express', 'Aim For Kill', 'RetroRockets Green',
        'Death Dealers Shadows', 'RetroRockets Yellow', 'Falling in Reverse'
    ],
    'Division 3': [
        'Deathbound', 'Snowflakes', 'oSaMs sm/osams', 'Boomstickers',
        'Zero Day', 'Red Alert', 'Seleção Nordeste Brasil', 'One RetroRocket'
    ]
};

async function main() {
    const teamSnap = await db.collection('teams').get();
    const ourTeams = [];
    teamSnap.forEach(doc => {
        const d = doc.data();
        ourTeams.push({ id: doc.id, name: d.teamName, tag: d.teamTag, divisions: d.divisions || [], status: d.status });
    });

    console.log(`\nOur DB has ${ourTeams.length} teams total\n`);

    // Build lookup by lowercase name
    const ourByName = {};
    for (const t of ourTeams) {
        ourByName[t.name.toLowerCase()] = t;
    }

    // Check each Big4 team
    console.log('=== MATCHING BIG4 TEAMS TO OUR DATABASE ===\n');

    const missing = [];
    const nameMismatch = [];
    const divisionMismatch = [];

    for (const [div, teams] of Object.entries(big4Teams)) {
        console.log(`--- ${div} ---`);
        for (const big4Name of teams) {
            const key = big4Name.toLowerCase();
            let match = ourByName[key];

            // Try fuzzy matches if exact fails
            if (!match) {
                // Try without "sm/osams" suffix
                for (const ourTeam of ourTeams) {
                    const ourLower = ourTeam.name.toLowerCase();
                    // Check if one contains the other
                    if (ourLower.includes(key) || key.includes(ourLower)) {
                        match = ourTeam;
                        nameMismatch.push({ big4: big4Name, ours: ourTeam.name });
                        break;
                    }
                    // Check first word match for compound names
                    if (key.split(' ')[0] === ourLower.split(' ')[0] && key.split(' ')[0].length > 3) {
                        match = ourTeam;
                        nameMismatch.push({ big4: big4Name, ours: ourTeam.name });
                        break;
                    }
                }
            }

            if (match) {
                const ourDiv = match.divisions.join(', ');
                const divMatch = match.divisions.some(d => div.includes(d.replace('D', 'Division '))) ||
                    (div === 'Division 1' && match.divisions.includes('D1')) ||
                    (div === 'Division 2' && match.divisions.includes('D2')) ||
                    (div === 'Division 3' && match.divisions.includes('D3'));

                const nameExact = match.name === big4Name;
                const nameNote = nameExact ? '' : ` ⚠️  NAME DIFF: ours="${match.name}"`;
                const divNote = divMatch ? '' : ` ⚠️  DIV DIFF: ours=[${ourDiv}], big4=${div}`;

                if (!divMatch) divisionMismatch.push({ big4Name, big4Div: div, ourDiv, ourName: match.name });

                console.log(`  ✓ ${big4Name.padEnd(28)} → [${match.tag}] (id: ${match.id})${nameNote}${divNote}`);
            } else {
                missing.push({ name: big4Name, division: div });
                console.log(`  ✗ ${big4Name.padEnd(28)} → NOT FOUND`);
            }
        }
        console.log();
    }

    // Check reverse: teams in our DB not in Big4
    console.log('=== TEAMS IN OUR DB BUT NOT IN BIG4 ===\n');
    const allBig4Names = Object.values(big4Teams).flat().map(n => n.toLowerCase());
    for (const t of ourTeams) {
        const inBig4 = allBig4Names.some(b4 =>
            b4 === t.name.toLowerCase() ||
            b4.includes(t.name.toLowerCase()) ||
            t.name.toLowerCase().includes(b4)
        );
        if (!inBig4) {
            console.log(`  ? ${t.tag.padEnd(6)} ${t.name} [${t.divisions.join(', ')}] (status: ${t.status || 'active'})`);
        }
    }

    // Summary
    console.log('\n=== SUMMARY ===\n');
    if (missing.length) {
        console.log('MISSING FROM OUR DB (need to seed):');
        for (const m of missing) console.log(`  → ${m.name} (${m.division})`);
    }
    if (nameMismatch.length) {
        console.log('\nNAME MISMATCHES (may need updating):');
        for (const m of nameMismatch) console.log(`  → Big4: "${m.big4}" vs Ours: "${m.ours}"`);
    }
    if (divisionMismatch.length) {
        console.log('\nDIVISION MISMATCHES (may need updating):');
        for (const m of divisionMismatch) console.log(`  → ${m.ourName}: Big4=${m.big4Div}, Ours=[${m.ourDiv}]`);
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
