/**
 * Find user UID from Firestore
 * Usage: node scripts/find-user-uid.js
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'service-account.json'));

const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: 'matchscheduler-dev'
});

const db = getFirestore(app);

async function main() {
    console.log('🔍 Looking for user documents...\n');

    // Get all users
    const usersSnapshot = await db.collection('users').get();

    console.log(`Found ${usersSnapshot.size} users:\n`);

    usersSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`UID: ${doc.id}`);
        console.log(`  Email: ${data.email}`);
        console.log(`  DisplayName: ${data.displayName}`);
        console.log(`  Initials: ${data.initials}`);
        console.log('');
    });

    // Also check the COM team roster
    console.log('\n--- COM Team Roster ---\n');
    const teamsSnapshot = await db.collection('teams')
        .where('teamTag', '==', 'COM')
        .get();

    if (!teamsSnapshot.empty) {
        const team = teamsSnapshot.docs[0].data();
        console.log(`Team: ${team.teamName}`);
        console.log(`Leader UID: ${team.leaderId}`);
        console.log('\nRoster:');
        team.playerRoster?.forEach(p => {
            console.log(`  - ${p.displayName} (${p.initials}): ${p.userId}`);
        });
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
