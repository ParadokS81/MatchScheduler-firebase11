// Clean up orphaned team references from user profiles
// Also shows duplicate teams for manual cleanup
// Run with: node scripts/cleanup-user-teams.js

const admin = require('firebase-admin');

// Initialize Firebase Admin with production credentials
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'matchscheduler-dev'
});

const db = admin.firestore();

async function cleanupOrphanedTeams() {
    console.log('=== Checking for orphaned team references ===\n');

    // Get all users with teams
    const usersSnapshot = await db.collection('users').get();
    const teamsSnapshot = await db.collection('teams').get();

    // Build set of valid team IDs
    const validTeamIds = new Set();
    teamsSnapshot.docs.forEach(doc => validTeamIds.add(doc.id));

    console.log(`Found ${validTeamIds.size} valid teams.\n`);

    // Check each user
    for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userTeams = userData.teams || {};
        const teamIds = Object.keys(userTeams);

        if (teamIds.length === 0) continue;

        const orphanedTeamIds = teamIds.filter(id => !validTeamIds.has(id));

        if (orphanedTeamIds.length > 0) {
            console.log(`User: ${userData.displayName || userDoc.id}`);
            console.log(`  Email: ${userData.email}`);
            console.log(`  Orphaned teams: ${orphanedTeamIds.join(', ')}`);

            // Remove orphaned references
            const updates = {};
            orphanedTeamIds.forEach(id => {
                updates[`teams.${id}`] = admin.firestore.FieldValue.delete();
            });

            await userDoc.ref.update(updates);
            console.log(`  ✅ Removed ${orphanedTeamIds.length} orphaned team reference(s)\n`);
        }
    }

    console.log('\n=== Checking for duplicate team names ===\n');

    // Group teams by lowercase name
    const teamsByName = {};
    teamsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const nameLower = (data.teamName || '').toLowerCase();
        if (!teamsByName[nameLower]) {
            teamsByName[nameLower] = [];
        }
        teamsByName[nameLower].push({ id: doc.id, ...data });
    });

    // Find duplicates
    let hasDuplicates = false;
    for (const [name, teams] of Object.entries(teamsByName)) {
        if (teams.length > 1) {
            hasDuplicates = true;
            console.log(`Duplicate: "${teams[0].teamName}" (${teams.length} teams)`);
            teams.forEach((team, i) => {
                const rosterCount = (team.playerRoster || []).length;
                const createdAt = team.createdAt?.toDate?.() || 'unknown';
                console.log(`  ${i + 1}. ID: ${team.id}`);
                console.log(`     Players: ${rosterCount}`);
                console.log(`     Leader: ${team.leaderId}`);
                console.log(`     Created: ${createdAt}`);
            });
            console.log('');
        }
    }

    if (!hasDuplicates) {
        console.log('No duplicate team names found.');
    }

    process.exit(0);
}

cleanupOrphanedTeams().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
