/**
 * Add fake players and availability to existing COM team
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

// Initialize Firebase Admin with service account
const serviceAccount = require(path.join(__dirname, '..', 'service-account.json'));

const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: 'matchscheduler-dev'
});

const db = getFirestore(app);

// Fake players to add to COM team
const FAKE_PLAYERS = [
    { userId: 'fake-com-001', displayName: 'Alex Storm', initials: 'AS' },
    { userId: 'fake-com-002', displayName: 'Bella Knight', initials: 'BK' },
    { userId: 'fake-com-003', displayName: 'Carlos Vega', initials: 'CV' },
    { userId: 'fake-com-004', displayName: 'Diana Cross', initials: 'DC' },
    { userId: 'fake-com-005', displayName: 'Erik Blade', initials: 'EB' },
];

const TIME_SLOTS = [
    '1800', '1830', '1900', '1930', '2000',
    '2030', '2100', '2130', '2200', '2230', '2300'
];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function generatePlayerAvailability(playerIndex) {
    const availability = [];
    const archetype = playerIndex % 4;

    switch (archetype) {
        case 0: // Weekday evening
            DAYS.slice(0, 4).forEach(day => {
                ['1900', '1930', '2000', '2030', '2100'].forEach(time => {
                    if (Math.random() > 0.3) availability.push(`${day}_${time}`);
                });
            });
            break;
        case 1: // Weekend warrior
            DAYS.slice(4).forEach(day => {
                TIME_SLOTS.forEach(time => {
                    if (Math.random() > 0.25) availability.push(`${day}_${time}`);
                });
            });
            break;
        case 2: // Late night
            DAYS.forEach(day => {
                ['2100', '2130', '2200', '2230', '2300'].forEach(time => {
                    if (Math.random() > 0.35) availability.push(`${day}_${time}`);
                });
            });
            break;
        case 3: // Flexible
            DAYS.forEach(day => {
                TIME_SLOTS.forEach(time => {
                    if (Math.random() > 0.6) availability.push(`${day}_${time}`);
                });
            });
            break;
    }
    return availability;
}

async function main() {
    console.log('🔍 Finding COM team...\n');

    // Find the COM team
    const teamsSnapshot = await db.collection('teams')
        .where('teamTag', '==', 'COM')
        .get();

    if (teamsSnapshot.empty) {
        console.log('❌ COM team not found!');
        process.exit(1);
    }

    const teamDoc = teamsSnapshot.docs[0];
    const teamId = teamDoc.id;
    const teamData = teamDoc.data();

    console.log(`✓ Found team: ${teamData.teamName} (${teamId})`);
    console.log(`  Current roster: ${teamData.playerRoster?.length || 0} players`);

    // Get existing roster
    const existingRoster = teamData.playerRoster || [];
    const existingUserIds = existingRoster.map(p => p.userId);

    // Add fake players to roster
    const newRoster = [...existingRoster];
    FAKE_PLAYERS.forEach((fake, i) => {
        if (!existingUserIds.includes(fake.userId)) {
            newRoster.push({
                userId: fake.userId,
                displayName: fake.displayName,
                initials: fake.initials,
                joinedAt: new Date(Date.now() - (10 + i) * 24 * 60 * 60 * 1000),
                role: 'member'
            });
        }
    });

    console.log(`\n📝 Updating roster to ${newRoster.length} players...`);

    // Update team document
    await db.collection('teams').doc(teamId).update({
        playerRoster: newRoster,
        lastActivityAt: Timestamp.now()
    });

    console.log('✓ Roster updated');

    // Create user documents for fake players
    console.log('\n👤 Creating user documents...');
    const batch1 = db.batch();
    FAKE_PLAYERS.forEach(fake => {
        const userRef = db.collection('users').doc(fake.userId);
        batch1.set(userRef, {
            displayName: fake.displayName,
            initials: fake.initials,
            email: `${fake.displayName.toLowerCase().replace(' ', '.')}@fake.test`,
            photoURL: null,
            discordTag: null,
            teams: { [teamId]: true },
            createdAt: Timestamp.now(),
            lastUpdatedAt: Timestamp.now()
        }, { merge: true });
    });
    await batch1.commit();
    console.log('✓ User documents created');

    // Generate availability for weeks 4 and 5 (2026-04 and 2026-05)
    const weeks = ['2026-04', '2026-05'];

    console.log('\n📅 Creating availability for weeks 4 and 5...');

    for (const weekId of weeks) {
        const docId = `${teamId}_${weekId}`;

        // Get existing availability
        const existingAvail = await db.collection('availability').doc(docId).get();
        const existingSlots = existingAvail.exists ? (existingAvail.data().slots || {}) : {};

        // Add fake player availability
        FAKE_PLAYERS.forEach((fake, i) => {
            const playerSlots = generatePlayerAvailability(i);
            playerSlots.forEach(slotId => {
                if (!existingSlots[slotId]) {
                    existingSlots[slotId] = [];
                }
                if (!existingSlots[slotId].includes(fake.userId)) {
                    existingSlots[slotId].push(fake.userId);
                }
            });
        });

        // Save availability
        await db.collection('availability').doc(docId).set({
            teamId: teamId,
            weekId: weekId,
            slots: existingSlots,
            lastUpdated: Timestamp.now()
        }, { merge: true });

        const slotCount = Object.keys(existingSlots).length;
        console.log(`✓ ${weekId}: ${slotCount} slots with availability`);
    }

    console.log('\n✅ Done! Refresh the app to see player badges in the grid.');
    console.log('\nNew team members added:');
    FAKE_PLAYERS.forEach(p => console.log(`  - ${p.initials}: ${p.displayName}`));
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
    });
