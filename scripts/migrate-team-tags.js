#!/usr/bin/env node
/**
 * migrate-team-tags.js — Slice 5.3: Team Tag Collection
 *
 * Populates the new teamTags[] array from the existing teamTag field.
 * Safe to run multiple times (idempotent — skips teams that already have teamTags).
 *
 * Usage:
 *   node scripts/migrate-team-tags.js          # Dry run (preview)
 *   node scripts/migrate-team-tags.js --apply  # Apply changes
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const DRY_RUN = !process.argv.includes('--apply');

async function migrate() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Team Tags Migration — ${DRY_RUN ? 'DRY RUN' : 'APPLYING'}`);
    console.log(`${'='.repeat(60)}\n`);

    const teamsSnapshot = await db.collection('teams').get();
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of teamsSnapshot.docs) {
        const data = doc.data();
        const teamId = doc.id;
        const teamName = data.teamName || '(unnamed)';
        const teamTag = data.teamTag;

        // Skip if already has teamTags
        if (data.teamTags && Array.isArray(data.teamTags) && data.teamTags.length > 0) {
            console.log(`  SKIP  ${teamName} [${teamTag}] — already has teamTags (${data.teamTags.length} tags)`);
            skipped++;
            continue;
        }

        if (!teamTag) {
            console.log(`  SKIP  ${teamName} — no teamTag set`);
            skipped++;
            continue;
        }

        const teamTags = [{ tag: teamTag, isPrimary: true }];

        if (DRY_RUN) {
            console.log(`  WOULD ${teamName} [${teamTag}] → teamTags: [{ tag: "${teamTag}", isPrimary: true }]`);
        } else {
            try {
                await db.collection('teams').doc(teamId).update({ teamTags });
                console.log(`  OK    ${teamName} [${teamTag}] → teamTags created`);
            } catch (err) {
                console.error(`  ERROR ${teamName}: ${err.message}`);
                errors++;
                continue;
            }
        }
        migrated++;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${DRY_RUN ? 'Would migrate' : 'Migrated'}: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
    if (DRY_RUN) {
        console.log(`  Run with --apply to execute changes`);
    }
    console.log(`${'='.repeat(60)}\n`);
}

migrate()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
