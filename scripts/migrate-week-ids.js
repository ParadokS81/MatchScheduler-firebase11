#!/usr/bin/env node
/**
 * migrate-week-ids.js - One-time migration from custom week numbering to ISO 8601
 *
 * For 2026: Our old "Week N" = ISO "Week N+1" (because Jan 1 is Thursday,
 * old algorithm skipped the partial first week).
 *
 * This script:
 *   1. Reads all documents in availability, matchProposals, scheduledMatches
 *   2. For each document with a 2026 weekId, computes the corrected ISO weekId
 *   3. For availability: creates new document with corrected ID, deletes old one
 *   4. For proposals/matches: updates the weekId field in place
 *   5. DRY RUN by default — pass --execute to actually write
 *
 * Usage:
 *   node scripts/migrate-week-ids.js                    # Dry run (shows what would change)
 *   node scripts/migrate-week-ids.js --execute          # Actually migrate production
 */

'use strict';

const admin = require('firebase-admin');
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');

// Connect to production
const serviceAccount = require('../service-account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// For 2026, the offset is exactly +1 (old week N → ISO week N+1)
// This is because Jan 1 2026 is Thursday: old algo starts Week 1 on Jan 5,
// ISO starts Week 1 on Dec 29 2025 (containing Jan 1 Thursday).
const YEAR = 2026;
const OFFSET = 1;

function migrateWeekId(oldWeekId) {
    const [yearStr, weekStr] = oldWeekId.split('-');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);

    if (year !== YEAR) return null; // Only migrate 2026 data

    const newWeek = week + OFFSET;
    // Handle overflow (shouldn't happen in practice since max old week ~51 → ISO 52)
    if (newWeek > 53) return null;

    return `${year}-${String(newWeek).padStart(2, '0')}`;
}

async function migrateAvailability() {
    console.log('\n📋 AVAILABILITY COLLECTION');
    console.log('='.repeat(60));

    const snapshot = await db.collection('availability').get();
    let migrated = 0, skipped = 0;

    // Build migration list first, then sort by week DESCENDING.
    // This prevents overwrite conflicts: if team has week 06 and 07,
    // we must migrate 07→08 first, then 06→07 (otherwise 07 gets clobbered).
    const migrations = [];
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const oldWeekId = data.weekId;
        if (!oldWeekId) { skipped++; continue; }

        const newWeekId = migrateWeekId(oldWeekId);
        if (!newWeekId) { skipped++; continue; }

        const teamId = data.teamId || doc.id.split('_').slice(0, -1).join('_');
        const newDocId = `${teamId}_${newWeekId}`;
        migrations.push({ doc, data, oldWeekId, newWeekId, teamId, newDocId });
    }

    // Sort descending by old week number so higher weeks migrate first
    migrations.sort((a, b) => {
        const weekA = parseInt(a.oldWeekId.split('-')[1]);
        const weekB = parseInt(b.oldWeekId.split('-')[1]);
        return weekB - weekA;
    });

    for (const m of migrations) {
        console.log(`  ${m.doc.id} → ${m.newDocId} (week ${m.oldWeekId} → ${m.newWeekId})`);

        if (!DRY_RUN) {
            // Create new document with updated weekId
            const newData = { ...m.data, weekId: m.newWeekId };
            await db.collection('availability').doc(m.newDocId).set(newData);
            // Delete old document
            await db.collection('availability').doc(m.doc.id).delete();
        }
        migrated++;
    }

    console.log(`  Total: ${snapshot.size} | Migrated: ${migrated} | Skipped: ${skipped}`);
}

async function migrateCollection(collectionName, fieldName = 'weekId') {
    console.log(`\n📋 ${collectionName.toUpperCase()} COLLECTION`);
    console.log('='.repeat(60));

    const snapshot = await db.collection(collectionName).get();
    let migrated = 0, skipped = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const oldWeekId = data[fieldName];
        if (!oldWeekId) { skipped++; continue; }

        const newWeekId = migrateWeekId(oldWeekId);
        if (!newWeekId) { skipped++; continue; }

        console.log(`  ${doc.id}: ${fieldName} ${oldWeekId} → ${newWeekId}`);

        if (!DRY_RUN) {
            await db.collection(collectionName).doc(doc.id).update({
                [fieldName]: newWeekId
            });
        }
        migrated++;
    }

    console.log(`  Total: ${snapshot.size} | Migrated: ${migrated} | Skipped: ${skipped}`);
}

async function migrateEventLog() {
    console.log('\n📋 EVENTLOG COLLECTION (details.weekId)');
    console.log('='.repeat(60));

    const snapshot = await db.collection('eventLog').get();
    let migrated = 0, skipped = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const oldWeekId = data.details?.weekId;
        if (!oldWeekId) { skipped++; continue; }

        const newWeekId = migrateWeekId(oldWeekId);
        if (!newWeekId) { skipped++; continue; }

        console.log(`  ${doc.id}: details.weekId ${oldWeekId} → ${newWeekId}`);

        if (!DRY_RUN) {
            await db.collection('eventLog').doc(doc.id).update({
                'details.weekId': newWeekId
            });
        }
        migrated++;
    }

    console.log(`  Total: ${snapshot.size} | Migrated: ${migrated} | Skipped: ${skipped}`);
}

async function main() {
    console.log('='.repeat(60));
    console.log(DRY_RUN
        ? '🔍 DRY RUN — no changes will be written'
        : '⚡ EXECUTE MODE — writing changes to production!'
    );
    console.log(`Migration: 2026 week IDs +${OFFSET} (custom → ISO 8601)`);
    console.log('='.repeat(60));

    await migrateAvailability();
    await migrateCollection('matchProposals');
    await migrateCollection('scheduledMatches');
    await migrateEventLog();

    console.log('\n' + '='.repeat(60));
    if (DRY_RUN) {
        console.log('✅ Dry run complete. Run with --execute to apply changes.');
    } else {
        console.log('✅ Migration complete!');
    }
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
