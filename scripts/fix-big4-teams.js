#!/usr/bin/env node
/**
 * Fix Big4 team issues in production Firestore:
 * 1. Rename "Warriors of Death" → "Seleção Nordeste Brasil" + set tag •sn•
 * 2. Fix RetroRockets capitalization (Green + Yellow)
 * 3. Archive Fragomatic
 *
 * DRY RUN by default. Pass --execute to actually write.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const EXECUTE = process.argv.includes('--execute');

async function main() {
    if (!EXECUTE) {
        console.log('\n⚠️  DRY RUN MODE - pass --execute to write changes\n');
    } else {
        console.log('\n🔥 EXECUTE MODE - writing to production!\n');
    }

    const teamSnap = await db.collection('teams').get();
    const teams = {};
    teamSnap.forEach(doc => {
        teams[doc.id] = { id: doc.id, ref: doc.ref, ...doc.data() };
    });

    const byId = (id) => teams[id];

    // 1. Rename Warriors of Death → Seleção Nordeste Brasil + set tag
    console.log('--- 1. RENAME: Warriors of Death → Seleção Nordeste Brasil ---');
    const wod = byId('team-wod-001');
    if (wod) {
        console.log(`  Current: "${wod.teamName}" | tag: ${wod.teamTag} | div: ${wod.divisions}`);
        console.log(`  Roster: ${(wod.playerRoster || []).map(p => p.displayName).join(', ')}`);
        console.log(`  → New name: "Seleção Nordeste Brasil"`);
        console.log(`  → New tag: "•sn•" (U+2022 bullet chars)`);
        if (EXECUTE) {
            await wod.ref.update({
                teamName: 'Seleção Nordeste Brasil',
                teamTag: '\u2022sn\u2022',
            });
            console.log('  ✅ DONE');
        }
    } else {
        console.log('  ✗ team-wod-001 not found');
    }

    // 2. Fix RetroRockets capitalization
    console.log('\n--- 2. FIX CAPITALIZATION: Retrorockets → RetroRockets ---');
    const rrg = byId('team-rrg-001');
    const rry = byId('team-rry-001');

    if (rrg) {
        console.log(`  Green: "${rrg.teamName}" → "RetroRockets Green"`);
        if (EXECUTE) {
            await rrg.ref.update({ teamName: 'RetroRockets Green' });
            console.log('  ✅ DONE');
        }
    }

    if (rry) {
        console.log(`  Yellow: "${rry.teamName}" → "RetroRockets Yellow"`);
        if (EXECUTE) {
            await rry.ref.update({ teamName: 'RetroRockets Yellow' });
            console.log('  ✅ DONE');
        }
    }

    // 3. Archive Fragomatic only
    console.log('\n--- 3. ARCHIVE: Fragomatic ---');
    const f0m = byId('team-f0m-001');
    if (f0m) {
        console.log(`  "${f0m.teamName}" [${f0m.teamTag}] status: ${f0m.status || 'active'} → archived`);
        if (EXECUTE) {
            await f0m.ref.update({ status: 'archived' });
            console.log('  ✅ DONE');
        }
    }

    console.log('\n--- SUMMARY ---');
    if (EXECUTE) {
        console.log('✅ All changes written to production');
    } else {
        console.log('⚠️  Dry run complete. Run with --execute to apply.');
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
