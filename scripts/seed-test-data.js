/**
 * Seed Test Data Script for MatchScheduler
 *
 * Creates 4 teams with 4-6 players each, plus realistic availability data.
 * Includes the two real test accounts in one team each.
 *
 * Usage: node scripts/seed-test-data.js
 *
 * Requirements:
 * - Firebase emulator must be running
 * - Run from project root directory
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

// Initialize Firebase Admin with service account (PRODUCTION Firestore)
const serviceAccount = require(path.join(__dirname, '..', 'service-account.json'));

const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: 'matchscheduler-dev'
});

const db = getFirestore(app);
console.log('🔥 Connected to PRODUCTION Firestore');

// ============================================
// TEST DATA CONFIGURATION
// ============================================

// Real test accounts (will be added to teams)
const REAL_ACCOUNTS = {
    david: {
        userId: 'david-larsen-uid',  // Placeholder - replace with actual UID after first login
        email: 'david.larsen.1981@gmail.com',
        displayName: 'David',
        initials: 'DL',
        discordTag: 'davidl#1234'
    },
    testAccount: {
        userId: 'matchscheduler81-uid',  // Placeholder - replace with actual UID after first login
        email: 'matchscheduler81@gmail.com',
        displayName: 'TestPlayer',
        initials: 'TP',
        discordTag: 'testplayer#5678'
    }
};

// Fake players for testing (will be created as user documents)
const FAKE_PLAYERS = [
    { userId: 'fake-user-001', displayName: 'Alex Storm', initials: 'AS', discordTag: 'alexstorm#1111' },
    { userId: 'fake-user-002', displayName: 'Bella Knight', initials: 'BK', discordTag: 'bellaknight#2222' },
    { userId: 'fake-user-003', displayName: 'Carlos Vega', initials: 'CV', discordTag: 'carlosvega#3333' },
    { userId: 'fake-user-004', displayName: 'Diana Cross', initials: 'DC', discordTag: 'dianacross#4444' },
    { userId: 'fake-user-005', displayName: 'Erik Blade', initials: 'EB', discordTag: 'erikblade#5555' },
    { userId: 'fake-user-006', displayName: 'Fiona Grey', initials: 'FG', discordTag: 'fionagrey#6666' },
    { userId: 'fake-user-007', displayName: 'Gabe Hunter', initials: 'GH', discordTag: 'gabehunter#7777' },
    { userId: 'fake-user-008', displayName: 'Holly Swift', initials: 'HS', discordTag: 'hollyswift#8888' },
    { userId: 'fake-user-009', displayName: 'Ivan Frost', initials: 'IF', discordTag: 'ivanfrost#9999' },
    { userId: 'fake-user-010', displayName: 'Jade Moon', initials: 'JM', discordTag: 'jademoon#1010' },
    { userId: 'fake-user-011', displayName: 'Kyle Phoenix', initials: 'KP', discordTag: 'kylephoenix#1111' },
    { userId: 'fake-user-012', displayName: 'Luna Star', initials: 'LS', discordTag: 'lunastar#1212' },
    { userId: 'fake-user-013', displayName: 'Max Thunder', initials: 'MT', discordTag: 'maxthunder#1313' },
    { userId: 'fake-user-014', displayName: 'Nina Wave', initials: 'NW', discordTag: 'ninawave#1414' },
    { userId: 'fake-user-015', displayName: 'Oscar Blaze', initials: 'OB', discordTag: 'oscarblaze#1515' },
    { userId: 'fake-user-016', displayName: 'Petra Stone', initials: 'PS', discordTag: 'petrastone#1616' },
];

// Team configurations
const TEAMS = [
    {
        teamId: 'team-alpha-001',
        teamName: 'Alpha Wolves',
        teamTag: 'AWF',
        divisions: ['D1', 'D2'],
        maxPlayers: 10,
        joinCode: 'ALPHA1',
        // David is leader, plus 4 fake players
        leaderKey: 'david',
        fakePlayers: [0, 1, 2, 3]  // Indexes into FAKE_PLAYERS
    },
    {
        teamId: 'team-beta-002',
        teamName: 'Beta Squadron',
        teamTag: 'BSQ',
        divisions: ['D2'],
        maxPlayers: 8,
        joinCode: 'BETA22',
        // Test account is leader, plus 5 fake players
        leaderKey: 'testAccount',
        fakePlayers: [4, 5, 6, 7, 8]
    },
    {
        teamId: 'team-gamma-003',
        teamName: 'Gamma Raiders',
        teamTag: 'GRD',
        divisions: ['D1'],
        maxPlayers: 10,
        joinCode: 'GAMMA3',
        // Fake player is leader, David is member, plus 3 more fakes
        leaderFakeIndex: 9,
        realAccountKey: 'david',
        fakePlayers: [10, 11, 12]
    },
    {
        teamId: 'team-delta-004',
        teamName: 'Delta Force',
        teamTag: 'DLT',
        divisions: ['D1', 'D2', 'D3'],
        maxPlayers: 12,
        joinCode: 'DELTA4',
        // All fake players (6 of them)
        leaderFakeIndex: 13,
        fakePlayers: [14, 15, 0, 1, 2]  // Note: some players on multiple teams
    }
];

// Time slots available in the grid
const TIME_SLOTS = [
    '1800', '1830', '1900', '1930', '2000',
    '2030', '2100', '2130', '2200', '2230', '2300'
];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function getCurrentWeekId() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${now.getFullYear()}-${String(weekNumber).padStart(2, '0')}`;
}

function getNextWeekId() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7) + 1;
    return `${now.getFullYear()}-${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Generate realistic availability pattern for a player
 * Different players have different typical availability
 */
function generatePlayerAvailability(playerIndex, allSlots) {
    const availability = [];

    // Different player archetypes
    const archetype = playerIndex % 4;

    switch (archetype) {
        case 0: // Weekday evening player (Mon-Thu 19:00-22:00)
            DAYS.slice(0, 4).forEach(day => {
                ['1900', '1930', '2000', '2030', '2100', '2130'].forEach(time => {
                    if (Math.random() > 0.3) {
                        availability.push(`${day}_${time}`);
                    }
                });
            });
            break;

        case 1: // Weekend warrior (Fri-Sun, all evening)
            DAYS.slice(4).forEach(day => {
                TIME_SLOTS.forEach(time => {
                    if (Math.random() > 0.25) {
                        availability.push(`${day}_${time}`);
                    }
                });
            });
            break;

        case 2: // Late night player (all days, 21:00-23:00)
            DAYS.forEach(day => {
                ['2100', '2130', '2200', '2230', '2300'].forEach(time => {
                    if (Math.random() > 0.35) {
                        availability.push(`${day}_${time}`);
                    }
                });
            });
            break;

        case 3: // Flexible player (random spread)
            DAYS.forEach(day => {
                TIME_SLOTS.forEach(time => {
                    if (Math.random() > 0.6) {
                        availability.push(`${day}_${time}`);
                    }
                });
            });
            break;
    }

    return availability;
}

// ============================================
// MAIN SEEDING FUNCTIONS (using batch writes for speed)
// ============================================

// We'll collect all writes and do them in batches
let allWrites = [];

function queueUserDocument(player, teamIds) {
    const teams = {};
    teamIds.forEach(teamId => {
        teams[teamId] = true;
    });

    allWrites.push({
        ref: db.collection('users').doc(player.userId),
        data: {
            displayName: player.displayName,
            initials: player.initials,
            email: player.email || `${player.displayName.toLowerCase().replace(' ', '.')}@fake.test`,
            photoURL: null,
            discordTag: player.discordTag,
            teams: teams,
            createdAt: Timestamp.now(),
            lastUpdatedAt: Timestamp.now()
        }
    });

    console.log(`  ✓ Queued user: ${player.displayName}`);
}

function queueTeamDocument(teamConfig, roster) {
    allWrites.push({
        ref: db.collection('teams').doc(teamConfig.teamId),
        data: {
            teamName: teamConfig.teamName,
            teamTag: teamConfig.teamTag,
            leaderId: roster[0].userId,
            divisions: teamConfig.divisions,
            maxPlayers: teamConfig.maxPlayers,
            joinCode: teamConfig.joinCode,
            status: 'active',
            playerRoster: roster,
            createdAt: Timestamp.now(),
            lastActivityAt: Timestamp.now()
        }
    });

    console.log(`  ✓ Queued team: ${teamConfig.teamName} with ${roster.length} players`);
}

function queueAvailabilityDocument(teamId, weekId, playerAvailability) {
    const docId = `${teamId}_${weekId}`;
    const slots = {};

    Object.entries(playerAvailability).forEach(([odUserId, userSlots]) => {
        userSlots.forEach(slotId => {
            if (!slots[slotId]) {
                slots[slotId] = [];
            }
            slots[slotId].push(odUserId);
        });
    });

    allWrites.push({
        ref: db.collection('availability').doc(docId),
        data: {
            teamId: teamId,
            weekId: weekId,
            slots: slots,
            lastUpdated: Timestamp.now()
        }
    });

    const slotCount = Object.keys(slots).length;
    console.log(`  ✓ Queued availability: ${docId} with ${slotCount} slots`);
}

async function commitAllWrites() {
    console.log(`\n📤 Committing ${allWrites.length} documents in batches...`);

    // Firestore batches can have max 500 operations
    const BATCH_SIZE = 400;

    for (let i = 0; i < allWrites.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = allWrites.slice(i, i + BATCH_SIZE);

        chunk.forEach(write => {
            batch.set(write.ref, write.data);
        });

        await batch.commit();
        console.log(`  ✓ Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`);
    }
}

async function seedDatabase() {
    console.log('\n🌱 Starting MatchScheduler Test Data Seeding...\n');

    const currentWeek = getCurrentWeekId();
    const nextWeek = getNextWeekId();
    console.log(`📅 Seeding for weeks: ${currentWeek} and ${nextWeek}\n`);

    // Track which users belong to which teams
    const userTeams = {};

    // Process each team
    for (const teamConfig of TEAMS) {
        console.log(`\n📦 Setting up team: ${teamConfig.teamName}`);

        const roster = [];
        const playerAvailabilityWeek1 = {};
        const playerAvailabilityWeek2 = {};

        // Determine leader
        let leader;
        if (teamConfig.leaderKey) {
            leader = REAL_ACCOUNTS[teamConfig.leaderKey];
        } else {
            leader = FAKE_PLAYERS[teamConfig.leaderFakeIndex];
        }

        // Add leader to roster
        roster.push({
            userId: leader.userId,
            displayName: leader.displayName,
            initials: leader.initials,
            joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            role: 'leader'
        });

        // Track team membership
        if (!userTeams[leader.userId]) userTeams[leader.userId] = [];
        userTeams[leader.userId].push(teamConfig.teamId);

        // Generate leader availability
        const leaderAvail1 = generatePlayerAvailability(0, null);
        const leaderAvail2 = generatePlayerAvailability(0, null);
        playerAvailabilityWeek1[leader.userId] = leaderAvail1;
        playerAvailabilityWeek2[leader.userId] = leaderAvail2;

        // Add real account member if specified
        if (teamConfig.realAccountKey) {
            const realAccount = REAL_ACCOUNTS[teamConfig.realAccountKey];
            roster.push({
                userId: realAccount.userId,
                displayName: realAccount.displayName,
                initials: realAccount.initials,
                joinedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
                role: 'member'
            });

            if (!userTeams[realAccount.userId]) userTeams[realAccount.userId] = [];
            userTeams[realAccount.userId].push(teamConfig.teamId);

            const realAvail1 = generatePlayerAvailability(1, null);
            const realAvail2 = generatePlayerAvailability(1, null);
            playerAvailabilityWeek1[realAccount.userId] = realAvail1;
            playerAvailabilityWeek2[realAccount.userId] = realAvail2;
        }

        // Add fake players
        teamConfig.fakePlayers.forEach((fakeIndex, i) => {
            const fake = FAKE_PLAYERS[fakeIndex];
            roster.push({
                userId: fake.userId,
                displayName: fake.displayName,
                initials: fake.initials,
                joinedAt: new Date(Date.now() - (20 - i) * 24 * 60 * 60 * 1000),
                role: 'member'
            });

            if (!userTeams[fake.userId]) userTeams[fake.userId] = [];
            userTeams[fake.userId].push(teamConfig.teamId);

            const fakeAvail1 = generatePlayerAvailability(i + 2, null);
            const fakeAvail2 = generatePlayerAvailability(i + 2, null);
            playerAvailabilityWeek1[fake.userId] = fakeAvail1;
            playerAvailabilityWeek2[fake.userId] = fakeAvail2;
        });

        // Queue team document
        queueTeamDocument(teamConfig, roster);

        // Queue availability documents for both weeks
        queueAvailabilityDocument(teamConfig.teamId, currentWeek, playerAvailabilityWeek1);
        queueAvailabilityDocument(teamConfig.teamId, nextWeek, playerAvailabilityWeek2);
    }

    // Queue user documents
    console.log('\n👤 Queueing user documents...');

    // Real accounts
    for (const key of Object.keys(REAL_ACCOUNTS)) {
        const account = REAL_ACCOUNTS[key];
        if (userTeams[account.userId]) {
            queueUserDocument(account, userTeams[account.userId]);
        }
    }

    // Fake players
    for (const fake of FAKE_PLAYERS) {
        if (userTeams[fake.userId]) {
            queueUserDocument(fake, userTeams[fake.userId]);
        }
    }

    // Commit all writes in batches
    await commitAllWrites();

    console.log('\n✅ Seeding complete!\n');
    console.log('Summary:');
    console.log(`  - ${TEAMS.length} teams created`);
    console.log(`  - ${Object.keys(userTeams).length} users created`);
    console.log(`  - ${TEAMS.length * 2} availability documents created`);
    console.log('\n📋 Team Join Codes:');
    TEAMS.forEach(t => {
        console.log(`  - ${t.teamName}: ${t.joinCode}`);
    });
    console.log('\n⚠️  Note: Real account UIDs are placeholders.');
    console.log('   After logging in with real accounts, update the UIDs in this script');
    console.log('   and re-run to link them properly.\n');
}

// Run the seeding
seedDatabase()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    });
