#!/usr/bin/env node
/**
 * One-time fix: Update 2-char initials to 3-char in user docs AND team rosters.
 *
 * The seed generated 2-char initials but Firestore rules require exactly 3.
 * This blocks ANY client-side update (including player colors, profile edits, etc).
 *
 * Usage:
 *   node scripts/fix-initials.js              # local emulator
 *   node scripts/fix-initials.js --production  # production
 */

const args = process.argv.slice(2);
const IS_PRODUCTION = args.includes('--production');

let db;

function initFirebase() {
    const admin = require('firebase-admin');
    if (IS_PRODUCTION) {
        const serviceAccount = require('../service-account.json');
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        const host = args.find(a => !a.startsWith('--')) || '127.0.0.1';
        process.env.FIRESTORE_EMULATOR_HOST = `${host}:8080`;
        admin.initializeApp({ projectId: 'matchscheduler-qw' });
    }
    db = admin.firestore();
}

function fixInitials(name, currentInitials) {
    // If already 3 chars, keep as-is
    if (currentInitials && currentInitials.length === 3) return currentInitials;
    // Generate 3-char from name
    const clean = (name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    return clean.substring(0, 3).padEnd(3, 'X');
}

async function main() {
    initFirebase();
    const env = IS_PRODUCTION ? 'PRODUCTION' : 'LOCAL';
    console.log(`\n🔧 Fix initials to 3-char (${env})\n`);

    // 1. Fix user docs
    const usersSnap = await db.collection('users').get();
    const batch = db.batch();
    const userFixes = {}; // userId → newInitials (for roster updates)
    let userCount = 0;

    usersSnap.forEach(doc => {
        const d = doc.data();
        if (d.initials && d.initials.length === 3) return; // Already good

        const newInitials = fixInitials(d.displayName, d.initials);
        batch.update(doc.ref, { initials: newInitials });
        userFixes[doc.id] = newInitials;
        userCount++;
        console.log(`  User ${d.displayName}: "${d.initials || '?'}" → "${newInitials}"`);
    });

    // 2. Fix team rosters
    const teamsSnap = await db.collection('teams').get();
    let rosterCount = 0;

    teamsSnap.forEach(teamDoc => {
        const t = teamDoc.data();
        const roster = t.playerRoster || [];
        let changed = false;

        const updatedRoster = roster.map(player => {
            const fix = userFixes[player.userId];
            if (fix) {
                changed = true;
                rosterCount++;
                return { ...player, initials: fix };
            }
            // Also fix roster entries not in userFixes but with wrong length
            if (player.initials && player.initials.length !== 3) {
                const newInit = fixInitials(player.displayName, player.initials);
                changed = true;
                rosterCount++;
                return { ...player, initials: newInit };
            }
            return player;
        });

        if (changed) {
            batch.update(teamDoc.ref, { playerRoster: updatedRoster });
        }
    });

    if (userCount > 0 || rosterCount > 0) {
        await batch.commit();
        console.log(`\n✅ Fixed ${userCount} user docs and ${rosterCount} roster entries`);
    } else {
        console.log('\n✅ All initials already 3 characters — nothing to fix');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
