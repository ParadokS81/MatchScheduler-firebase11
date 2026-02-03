#!/usr/bin/env node
/**
 * One-time fix: Sync user photoURLs to team roster entries.
 *
 * The seed script set DiceBear robot avatars in team rosters.
 * When users sign in with Discord, their user doc gets the real
 * Discord avatar, but the team roster wasn't updated.
 *
 * This script reads each user's current photoURL and patches
 * every team roster entry to match.
 *
 * Usage:
 *   node scripts/fix-roster-avatars.js              # local emulator
 *   node scripts/fix-roster-avatars.js --production  # production
 */

const args = process.argv.slice(2);
const IS_PRODUCTION = args.includes('--production');

let db;

function initFirebase() {
    if (IS_PRODUCTION) {
        const serviceAccount = require('../service-account.json');
        const admin = require('firebase-admin');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        db = admin.firestore();
    } else {
        const admin = require('firebase-admin');
        const host = args.find(a => !a.startsWith('--')) || '127.0.0.1';
        process.env.FIRESTORE_EMULATOR_HOST = `${host}:8080`;
        admin.initializeApp({ projectId: 'matchscheduler-qw' });
        db = admin.firestore();
    }
}

async function main() {
    initFirebase();
    const env = IS_PRODUCTION ? 'PRODUCTION' : 'LOCAL';
    console.log(`\n🔧 Fix roster avatars (${env})\n`);

    // 1. Build a map of userId → current photoURL from user docs
    const usersSnap = await db.collection('users').get();
    const userPhotos = {};
    usersSnap.forEach(doc => {
        const data = doc.data();
        userPhotos[doc.id] = data.photoURL || null;
    });
    console.log(`Found ${Object.keys(userPhotos).length} users`);

    // 2. Walk every team and fix stale roster photoURLs
    const teamsSnap = await db.collection('teams').get();
    let teamsUpdated = 0;
    let playersFixed = 0;

    const batch = db.batch();

    teamsSnap.forEach(teamDoc => {
        const teamData = teamDoc.data();
        const roster = teamData.playerRoster || [];
        let changed = false;

        const updatedRoster = roster.map(player => {
            const currentPhoto = userPhotos[player.userId];
            // If user doc has a different photoURL than the roster entry, fix it
            if (currentPhoto !== undefined && player.photoURL !== currentPhoto) {
                console.log(`  ${teamData.teamName} → ${player.displayName}: "${(player.photoURL || '').substring(0, 40)}..." → "${(currentPhoto || '').substring(0, 40)}..."`);
                changed = true;
                playersFixed++;
                return { ...player, photoURL: currentPhoto };
            }
            return player;
        });

        if (changed) {
            batch.update(teamDoc.ref, { playerRoster: updatedRoster });
            teamsUpdated++;
        }
    });

    if (teamsUpdated > 0) {
        await batch.commit();
        console.log(`\n✅ Fixed ${playersFixed} roster entries across ${teamsUpdated} teams`);
    } else {
        console.log('\n✅ All roster avatars already in sync — nothing to fix');
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
