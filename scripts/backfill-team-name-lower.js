// Backfill teamNameLower field for existing teams
// Run with: node scripts/backfill-team-name-lower.js

const admin = require('firebase-admin');

// Initialize Firebase Admin with production credentials
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'matchscheduler-dev'
});

const db = admin.firestore();

async function backfillTeamNameLower() {
    console.log('Starting backfill of teamNameLower field...\n');

    const teamsSnapshot = await db.collection('teams').get();

    if (teamsSnapshot.empty) {
        console.log('No teams found.');
        return;
    }

    console.log(`Found ${teamsSnapshot.size} teams to process.\n`);

    const batch = db.batch();
    let updateCount = 0;

    for (const doc of teamsSnapshot.docs) {
        const team = doc.data();
        const teamName = team.teamName;

        if (!team.teamNameLower && teamName) {
            const teamNameLower = teamName.toLowerCase();
            batch.update(doc.ref, { teamNameLower });
            console.log(`  [UPDATE] ${teamName} -> teamNameLower: "${teamNameLower}"`);
            updateCount++;
        } else if (team.teamNameLower) {
            console.log(`  [SKIP] ${teamName} - already has teamNameLower`);
        } else {
            console.log(`  [SKIP] ${doc.id} - no teamName field`);
        }
    }

    if (updateCount > 0) {
        await batch.commit();
        console.log(`\n✅ Updated ${updateCount} teams with teamNameLower field.`);
    } else {
        console.log('\n✅ No updates needed - all teams already have teamNameLower.');
    }

    process.exit(0);
}

backfillTeamNameLower().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
