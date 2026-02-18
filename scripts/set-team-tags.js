#!/usr/bin/env node
/**
 * set-team-tags.js — One-off: Set teamTag + teamTags[] for teams that are missing them,
 * based on cross-referencing rosters against QWStats match data.
 *
 * Usage:
 *   node scripts/set-team-tags.js          # Dry run
 *   node scripts/set-team-tags.js --apply  # Apply changes
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const DRY_RUN = !process.argv.includes('--apply');

// Teams to update: { teamName -> { primary, historical[] } }
const UPDATES = {
    'Boomstickers':           { primary: 'boom', historical: [] },
    'Death Dealers Shadows':  { primary: 'd2s',  historical: [] },
    'One RetroRocket':        { primary: "'tro",  historical: [] },
    'oSaMs sm/osams':         { primary: 'sm',    historical: [] },
    'Polonez':                { primary: 'pol',   historical: ['polz'] },
    'Retrorockets Green':     { primary: "'tro",  historical: [] },
    'Retrorockets Yellow':    { primary: "'tro",  historical: [] },
    'Snowflakes':             { primary: 'snow',  historical: [] },
    'Zero Day':               { primary: 'zd',    historical: [] },
    'Good Old Friends':       { primary: 'gof!',  historical: ['gof'] },
};

async function run() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Set Team Tags — ${DRY_RUN ? 'DRY RUN' : 'APPLYING'}`);
    console.log(`${'='.repeat(60)}\n`);

    const teamsSnapshot = await db.collection('teams').get();

    // Build name -> doc map
    const teamsByName = new Map();
    teamsSnapshot.forEach(doc => {
        teamsByName.set(doc.data().teamName, { id: doc.id, data: doc.data() });
    });

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const [teamName, tags] of Object.entries(UPDATES)) {
        const team = teamsByName.get(teamName);
        if (!team) {
            console.log(`  MISS  "${teamName}" — not found in Firestore`);
            notFound++;
            continue;
        }

        // Build teamTags array
        const teamTags = [
            { tag: tags.primary, isPrimary: true },
            ...tags.historical.map(t => ({ tag: t, isPrimary: false }))
        ];

        const updateData = {
            teamTag: tags.primary,
            teamTags
        };

        if (DRY_RUN) {
            const tagList = teamTags.map(t => `${t.tag}${t.isPrimary ? ' (primary)' : ''}`).join(', ');
            console.log(`  WOULD ${teamName} → teamTag: "${tags.primary}", teamTags: [${tagList}]`);
        } else {
            try {
                await db.collection('teams').doc(team.id).update(updateData);
                const tagList = teamTags.map(t => `${t.tag}${t.isPrimary ? ' (primary)' : ''}`).join(', ');
                console.log(`  OK    ${teamName} → teamTag: "${tags.primary}", teamTags: [${tagList}]`);
            } catch (err) {
                console.error(`  ERROR ${teamName}: ${err.message}`);
                skipped++;
                continue;
            }
        }
        updated++;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}: ${updated} | Skipped: ${skipped} | Not found: ${notFound}`);
    if (DRY_RUN) console.log(`  Run with --apply to execute changes`);
    console.log(`${'='.repeat(60)}\n`);
}

run()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Failed:', err);
        process.exit(1);
    });
