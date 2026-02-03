#!/usr/bin/env node
/**
 * One-time diagnostic: inspect production Firestore data
 * to understand UID mismatches between seeded users and Discord sign-ins.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
const auth = admin.auth();

async function main() {
    console.log('\n========== PRODUCTION DATA INSPECTION ==========\n');

    // 1. List all users in Firestore
    const usersSnap = await db.collection('users').get();
    console.log(`--- FIRESTORE USER DOCS (${usersSnap.size}) ---`);
    const userDocs = {};
    usersSnap.forEach(doc => {
        const d = doc.data();
        userDocs[doc.id] = d;
        console.log(`  ${doc.id}`);
        console.log(`    displayName: ${d.displayName}`);
        console.log(`    discordUserId: ${d.discordUserId || '(none)'}`);
        console.log(`    discordUsername: ${d.discordUsername || '(none)'}`);
        console.log(`    authProvider: ${d.authProvider || '(none)'}`);
        console.log(`    photoURL: ${(d.photoURL || '').substring(0, 60)}...`);
        console.log(`    teams: ${JSON.stringify(d.teams || {})}`);
        console.log('');
    });

    // 2. List all Firebase Auth users
    console.log('--- FIREBASE AUTH USERS ---');
    const authList = await auth.listUsers(100);
    authList.users.forEach(u => {
        console.log(`  ${u.uid} | ${u.displayName || '(no name)'} | ${u.email || '(no email)'}`);
    });
    console.log('');

    // 3. Check team rosters
    const teamsSnap = await db.collection('teams').get();
    console.log(`--- TEAM ROSTERS (${teamsSnap.size} teams) ---`);
    teamsSnap.forEach(doc => {
        const t = doc.data();
        console.log(`\n  Team: ${t.teamName} (${doc.id})`);
        console.log(`  Leader ID: ${t.leaderId}`);
        const roster = t.playerRoster || [];
        roster.forEach(p => {
            const matchesUserDoc = userDocs[p.userId] ? '✅' : '❌ NO USER DOC';
            console.log(`    ${p.displayName} | userId: ${p.userId} | ${matchesUserDoc} | photo: ${(p.photoURL || '').substring(0, 50)}`);
        });
    });

    console.log('\n\n--- MISMATCH ANALYSIS ---');
    // Find roster userIds that don't have a matching user doc
    teamsSnap.forEach(doc => {
        const t = doc.data();
        const roster = t.playerRoster || [];
        roster.forEach(p => {
            if (!userDocs[p.userId]) {
                console.log(`  ❌ ORPHAN: ${p.displayName} in ${t.teamName} has roster userId "${p.userId}" but no user doc exists`);
            }
        });
    });

    // Find user docs with discordUserId that might be duplicates
    const byDiscord = {};
    for (const [docId, d] of Object.entries(userDocs)) {
        if (d.discordUserId) {
            if (!byDiscord[d.discordUserId]) byDiscord[d.discordUserId] = [];
            byDiscord[d.discordUserId].push({ docId, displayName: d.displayName });
        }
    }
    for (const [discordId, entries] of Object.entries(byDiscord)) {
        if (entries.length > 1) {
            console.log(`  ⚠️ DUPLICATE discordUserId ${discordId}:`);
            entries.forEach(e => console.log(`    - ${e.docId} (${e.displayName})`));
        }
    }

    console.log('\n========== DONE ==========\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
