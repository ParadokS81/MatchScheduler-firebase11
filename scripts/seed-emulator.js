/**
 * Seed Firestore EMULATOR with test data for local development
 * Usage: node scripts/seed-emulator.js [host]
 *
 * Prerequisites: Firebase emulators must be running (npm run dev)
 */

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// Get emulator host from command line or default to localhost
const EMULATOR_HOST = process.argv[2] || '127.0.0.1';

// Initialize Firebase Admin pointing to emulators
process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_HOST}:8080`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${EMULATOR_HOST}:9099`;

const app = initializeApp({
    projectId: 'matchscheduler-dev'
});

const db = getFirestore(app);
const auth = getAuth(app);
console.log(`🔗 Connected to Firestore EMULATOR on ${EMULATOR_HOST}:8080`);
console.log(`🔗 Connected to Auth EMULATOR on ${EMULATOR_HOST}:9099\n`);

// ============================================
// FIXED UIDs - Same values used in AuthService.js
// This ensures browser auth matches seeded data
// ============================================
const DEV_USER_UID = 'dev-user-001';
const DEV_USER_EMAIL = 'dev@matchscheduler.test';
const DEV_USER_PASSWORD = 'devmode123';
const DEV_USER_DISPLAY_NAME = 'ParadokS';
const DEV_USER_INITIALS = 'PDX';

// Helper to generate DiceBear avatar URL (deterministic based on seed)
// Using "bottts" style for robot avatars - fun for gaming context
function getAvatarUrl(seed) {
    return `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(seed)}&size=128`;
}

// Fake teammates for DEV SQUAD (your team)
// All use same password for easy dev switching
const DEV_SQUAD_PLAYERS = [
    { userId: 'fake-user-001', displayName: 'Alex Storm', initials: 'AS', email: 'alex@fake.test', photoURL: getAvatarUrl('alex-storm') },
    { userId: 'fake-user-002', displayName: 'Bella Knight', initials: 'BK', email: 'bella@fake.test', photoURL: getAvatarUrl('bella-knight') },
    { userId: 'fake-user-003', displayName: 'Carlos Vega', initials: 'CV', email: 'carlos@fake.test', photoURL: getAvatarUrl('carlos-vega') },
    { userId: 'fake-user-004', displayName: 'Diana Cross', initials: 'DC', email: 'diana@fake.test', photoURL: getAvatarUrl('diana-cross') },
    { userId: 'fake-user-005', displayName: 'Erik Blade', initials: 'EB', email: 'erik@fake.test', photoURL: getAvatarUrl('erik-blade') },
];

// ============================================
// ADDITIONAL TEAMS FOR TESTING TEAM BROWSER
// Each team has unique players (not on dev squad)
// ============================================

const ADDITIONAL_TEAMS = [
    {
        id: 'team-phoenix-001',
        teamName: 'Phoenix Rising',
        teamTag: 'PHX',
        divisions: ['D1', 'D2'],
        players: [
            { userId: 'phx-user-001', displayName: 'Marcus Chen', initials: 'MC', email: 'marcus@fake.test', role: 'leader', photoURL: getAvatarUrl('marcus-chen') },
            { userId: 'phx-user-002', displayName: 'Sarah Walsh', initials: 'SW', email: 'sarah@fake.test', role: 'member', photoURL: getAvatarUrl('sarah-walsh') },
            { userId: 'phx-user-003', displayName: 'Tyler Brooks', initials: 'TB', email: 'tyler@fake.test', role: 'member', photoURL: getAvatarUrl('tyler-brooks') },
            { userId: 'phx-user-004', displayName: 'Nina Patel', initials: 'NP', email: 'nina@fake.test', role: 'member', photoURL: getAvatarUrl('nina-patel') },
            { userId: 'phx-user-005', displayName: 'Jake Morrison', initials: 'JM', email: 'jake@fake.test', role: 'member', photoURL: getAvatarUrl('jake-morrison') },
        ],
        // Availability pattern: Strong weekday evenings (Mon-Thu 19:00-21:00)
        // Good overlap with Dev Squad for 3-4 player matches
        availabilityPattern: 'weekday_prime'
    },
    {
        id: 'team-shadow-001',
        teamName: 'Shadow Wolves',
        teamTag: 'SHW',
        divisions: ['D2'],
        players: [
            { userId: 'shw-user-001', displayName: 'Ryan Cooper', initials: 'RC', email: 'ryan@fake.test', role: 'leader', photoURL: getAvatarUrl('ryan-cooper') },
            { userId: 'shw-user-002', displayName: 'Emma Liu', initials: 'EL', email: 'emma@fake.test', role: 'member', photoURL: getAvatarUrl('emma-liu') },
            { userId: 'shw-user-003', displayName: 'Derek Hall', initials: 'DH', email: 'derek@fake.test', role: 'member', photoURL: getAvatarUrl('derek-hall') },
            { userId: 'shw-user-004', displayName: 'Zoe Martinez', initials: 'ZM', email: 'zoe@fake.test', role: 'member', photoURL: getAvatarUrl('zoe-martinez') },
        ],
        // Availability pattern: Late night focus (21:00-23:00 all week)
        // Some overlap with Dev Squad late night players
        availabilityPattern: 'late_night'
    },
    {
        id: 'team-nova-001',
        teamName: 'Nova Esports',
        teamTag: 'NOVA',
        divisions: ['D1', 'D3'],
        players: [
            { userId: 'nova-user-001', displayName: 'Olivia Kim', initials: 'OK', email: 'olivia@fake.test', role: 'leader', photoURL: getAvatarUrl('olivia-kim') },
            { userId: 'nova-user-002', displayName: 'Liam Foster', initials: 'LF', email: 'liam@fake.test', role: 'member', photoURL: getAvatarUrl('liam-foster') },
            { userId: 'nova-user-003', displayName: 'Ava Thompson', initials: 'AT', email: 'ava@fake.test', role: 'member', photoURL: getAvatarUrl('ava-thompson') },
            { userId: 'nova-user-004', displayName: 'Noah Garcia', initials: 'NG', email: 'noah@fake.test', role: 'member', photoURL: getAvatarUrl('noah-garcia') },
            { userId: 'nova-user-005', displayName: 'Mia Robinson', initials: 'MR', email: 'mia@fake.test', role: 'member', photoURL: getAvatarUrl('mia-robinson') },
            { userId: 'nova-user-006', displayName: 'Ethan Wright', initials: 'EW', email: 'ethan@fake.test', role: 'member', photoURL: getAvatarUrl('ethan-wright') },
        ],
        // Availability pattern: Weekend warriors + some weekday flexibility
        // Good for weekend match testing
        availabilityPattern: 'weekend_flex'
    },
];

// Collect all players from additional teams for Auth setup
const ALL_ADDITIONAL_PLAYERS = ADDITIONAL_TEAMS.flatMap(team => team.players);

// UTC time slots for CET test users (CET = UTC+1 in winter)
// CET 18:00 = UTC 17:00, CET 23:00 = UTC 22:00
const TIME_SLOTS = ['1700', '1730', '1800', '1830', '1900', '1930', '2000', '2030', '2100', '2130', '2200'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function getCurrentWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 604800000;
    return Math.ceil((diff + start.getDay() * 86400000) / oneWeek);
}

function getWeekId(weekNumber) {
    const year = new Date().getFullYear();
    return `${year}-${String(weekNumber).padStart(2, '0')}`;
}

function generateRandomAvailability(playerIndex) {
    const patterns = [
        // Weekday evenings (CET 19-21 = UTC 18-20)
        () => DAYS.slice(0, 5).flatMap(day => ['1800', '1830', '1900', '1930'].map(t => `${day}_${t}`)),
        // Weekend warrior
        () => DAYS.slice(5).flatMap(day => TIME_SLOTS.map(t => `${day}_${t}`)),
        // Late night (CET 21-23 = UTC 20-22)
        () => DAYS.flatMap(day => ['2000', '2030', '2100', '2130', '2200'].map(t => `${day}_${t}`)),
        // Flexible
        () => DAYS.flatMap(day => TIME_SLOTS.filter(() => Math.random() > 0.6).map(t => `${day}_${t}`)),
    ];

    const pattern = patterns[playerIndex % patterns.length]();
    return pattern.filter(() => Math.random() > 0.3);
}

/**
 * Generate availability based on team pattern
 * Creates strategic overlap scenarios for match testing
 */
function generateTeamAvailability(pattern, playerIndex) {
    let baseSlots = [];

    switch (pattern) {
        case 'weekday_prime':
            // Strong Mon-Thu CET 19:00-21:00 = UTC 18:00-20:00
            // This creates good 3-4 player overlap with Dev Squad
            ['mon', 'tue', 'wed', 'thu'].forEach(day => {
                ['1800', '1830', '1900', '1930', '2000'].forEach(time => {
                    if (Math.random() > 0.25) baseSlots.push(`${day}_${time}`);
                });
            });
            // Add some Friday availability (CET 19-20 = UTC 18-19)
            if (playerIndex % 2 === 0) {
                ['1800', '1830', '1900'].forEach(time => {
                    if (Math.random() > 0.4) baseSlots.push(`fri_${time}`);
                });
            }
            break;

        case 'late_night':
            // CET 21:00-23:00 = UTC 20:00-22:00 all week
            DAYS.forEach(day => {
                ['2000', '2030', '2100', '2130', '2200'].forEach(time => {
                    if (Math.random() > 0.3) baseSlots.push(`${day}_${time}`);
                });
            });
            break;

        case 'weekend_flex':
            // Heavy weekend + scattered weekday
            // Weekend: high availability
            ['sat', 'sun'].forEach(day => {
                TIME_SLOTS.forEach(time => {
                    if (Math.random() > 0.2) baseSlots.push(`${day}_${time}`);
                });
            });
            // Weekday: lighter, varied by player (UTC = CET - 1h)
            const weekdaySlots = playerIndex % 3 === 0
                ? ['1700', '1730', '1800']
                : playerIndex % 3 === 1
                    ? ['1900', '1930', '2000']
                    : ['2000', '2030', '2100'];
            ['mon', 'wed', 'fri'].forEach(day => {
                weekdaySlots.forEach(time => {
                    if (Math.random() > 0.4) baseSlots.push(`${day}_${time}`);
                });
            });
            break;

        default:
            return generateRandomAvailability(playerIndex);
    }

    return baseSlots;
}

/**
 * Create dev user with FIXED UID in Auth emulator
 * Handles case where user exists with wrong UID (from previous runs)
 */
async function setupDevUser() {
    try {
        // Check if user with correct UID exists
        const existingUser = await auth.getUser(DEV_USER_UID);
        console.log('✓ Dev user already exists with correct UID:', DEV_USER_UID);
        return {
            userId: DEV_USER_UID,
            displayName: DEV_USER_DISPLAY_NAME,
            initials: DEV_USER_INITIALS,
            email: DEV_USER_EMAIL
        };
    } catch (error) {
        if (error.code !== 'auth/user-not-found') {
            throw error;
        }
    }

    // User with correct UID doesn't exist - check if email is taken by wrong UID
    try {
        const userByEmail = await auth.getUserByEmail(DEV_USER_EMAIL);
        if (userByEmail.uid !== DEV_USER_UID) {
            console.log('⚠️  Found user with email but wrong UID:', userByEmail.uid);
            console.log('   Deleting to recreate with correct UID...');
            await auth.deleteUser(userByEmail.uid);
        }
    } catch (emailError) {
        // Email not found - that's fine, we'll create new user
        if (emailError.code !== 'auth/user-not-found') {
            throw emailError;
        }
    }

    // Create user with specific UID
    await auth.createUser({
        uid: DEV_USER_UID,
        email: DEV_USER_EMAIL,
        password: DEV_USER_PASSWORD,
        displayName: DEV_USER_DISPLAY_NAME
    });
    console.log('✓ Created dev user with fixed UID:', DEV_USER_UID);

    return {
        userId: DEV_USER_UID,
        displayName: DEV_USER_DISPLAY_NAME,
        initials: DEV_USER_INITIALS,
        email: DEV_USER_EMAIL
    };
}

/**
 * Create Auth emulator user for a fake player
 * Uses same password as dev user for easy switching
 */
async function setupFakeUser(player) {
    try {
        await auth.getUser(player.userId);
        console.log(`✓ Auth user exists: ${player.displayName}`);
        return;
    } catch (error) {
        if (error.code !== 'auth/user-not-found') {
            throw error;
        }
    }

    // Check if email is taken by wrong UID
    try {
        const userByEmail = await auth.getUserByEmail(player.email);
        if (userByEmail.uid !== player.userId) {
            await auth.deleteUser(userByEmail.uid);
        }
    } catch (emailError) {
        if (emailError.code !== 'auth/user-not-found') {
            throw emailError;
        }
    }

    await auth.createUser({
        uid: player.userId,
        email: player.email,
        password: DEV_USER_PASSWORD, // Same password for all dev users
        displayName: player.displayName
    });
    console.log(`✓ Created Auth user: ${player.displayName}`);
}

async function clearCollection(collectionName) {
    const snapshot = await db.collection(collectionName).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`  🗑️ Cleared ${snapshot.size} docs from ${collectionName}`);
}

async function seedEmulator() {
    console.log('🌱 Seeding Firestore and Auth emulators...\n');

    // Clear proposal/match data from previous runs
    console.log('🧹 Cleaning up previous proposal data...');
    await clearCollection('matchProposals');
    await clearCollection('scheduledMatches');
    console.log('');

    // Setup dev user with fixed UID
    const devUser = await setupDevUser();

    // Setup Auth users for Dev Squad players
    console.log('\n📋 Setting up Dev Squad player Auth accounts...');
    for (const player of DEV_SQUAD_PLAYERS) {
        await setupFakeUser(player);
    }

    // Setup Auth users for all additional team players
    console.log('\n📋 Setting up additional team player Auth accounts...');
    for (const player of ALL_ADDITIONAL_PLAYERS) {
        await setupFakeUser(player);
    }
    console.log('');

    const currentWeek = getCurrentWeekNumber();
    const week1Id = getWeekId(currentWeek);
    const week2Id = getWeekId(currentWeek + 1);

    const week3Id = getWeekId(currentWeek + 2);
    const week4Id = getWeekId(currentWeek + 3);
    const weekIds = [week1Id, week2Id, week3Id, week4Id];

    console.log(`📅 Creating data for weeks: ${weekIds.join(', ')}\n`);

    const devTeamId = 'team-dev-001';
    const batch = db.batch();

    // ============================================
    // DEV SQUAD (Your team)
    // ============================================
    const devUserPhotoURL = getAvatarUrl('paradoks-dev');
    const devRoster = [
        { ...devUser, photoURL: devUserPhotoURL, joinedAt: new Date(), role: 'leader' },
        ...DEV_SQUAD_PLAYERS.map((p, i) => ({
            userId: p.userId,
            displayName: p.displayName,
            initials: p.initials,
            photoURL: p.photoURL || null,
            joinedAt: new Date(Date.now() - (i + 1) * 86400000),
            role: 'member'
        }))
    ];

    batch.set(db.collection('teams').doc(devTeamId), {
        teamName: 'Dev Squad',
        teamNameLower: 'dev squad',
        teamTag: 'DEV',
        leaderId: devUser.userId,
        schedulers: [],
        divisions: ['D1'],
        maxPlayers: 10,
        joinCode: 'DEV123',
        status: 'active',
        playerRoster: devRoster,
        createdAt: Timestamp.now(),
        lastActivityAt: Timestamp.now()
    });
    console.log('✓ Team: Dev Squad (6 players)');

    // Create user document for dev user
    batch.set(db.collection('users').doc(devUser.userId), {
        displayName: devUser.displayName,
        initials: devUser.initials,
        email: devUser.email,
        userId: devUser.userId,
        photoURL: devUserPhotoURL,
        avatarSource: 'initials',
        discordTag: null,
        timezone: 'Europe/Stockholm',
        teams: { [devTeamId]: true },
        createdAt: Timestamp.now(),
        lastUpdatedAt: Timestamp.now()
    });
    console.log(`✓ User: ${devUser.displayName} (${devUser.userId})`);

    // Create user documents for Dev Squad players
    DEV_SQUAD_PLAYERS.forEach(player => {
        batch.set(db.collection('users').doc(player.userId), {
            displayName: player.displayName,
            initials: player.initials,
            email: player.email,
            userId: player.userId,
            photoURL: player.photoURL || null,
            avatarSource: 'initials',
            discordTag: null,
            timezone: 'Europe/Stockholm',
            teams: { [devTeamId]: true },
            createdAt: Timestamp.now(),
            lastUpdatedAt: Timestamp.now()
        });
        console.log(`  ✓ User: ${player.displayName}`);
    });

    // Dev Squad availability
    const devPlayers = [devUser, ...DEV_SQUAD_PLAYERS.map(p => ({ userId: p.userId }))];
    weekIds.forEach(weekId => {
        const slots = {};
        devPlayers.forEach((player, i) => {
            const playerSlots = generateRandomAvailability(i);
            playerSlots.forEach(slotId => {
                if (!slots[slotId]) slots[slotId] = [];
                slots[slotId].push(player.userId);
            });
        });

        batch.set(db.collection('availability').doc(`${devTeamId}_${weekId}`), {
            teamId: devTeamId,
            weekId,
            slots,
            lastUpdated: Timestamp.now()
        });
        console.log(`  ✓ Availability ${weekId}: ${Object.keys(slots).length} slots`);
    });

    // ============================================
    // ADDITIONAL TEAMS (for Team Browser testing)
    // ============================================
    console.log('\n📋 Creating additional teams...');

    for (const team of ADDITIONAL_TEAMS) {
        const leader = team.players.find(p => p.role === 'leader');

        // Create team roster
        const roster = team.players.map((p, i) => ({
            userId: p.userId,
            displayName: p.displayName,
            initials: p.initials,
            photoURL: p.photoURL || null,
            joinedAt: new Date(Date.now() - (i + 5) * 86400000),
            role: p.role
        }));

        // Create team document
        batch.set(db.collection('teams').doc(team.id), {
            teamName: team.teamName,
            teamNameLower: team.teamName.toLowerCase(),
            teamTag: team.teamTag,
            leaderId: leader.userId,
            schedulers: [],
            divisions: team.divisions,
            maxPlayers: 10,
            joinCode: team.teamTag.toUpperCase() + '123',
            status: 'active',
            playerRoster: roster,
            createdAt: Timestamp.now(),
            lastActivityAt: Timestamp.now()
        });
        console.log(`✓ Team: ${team.teamName} [${team.teamTag}] (${team.players.length} players)`);

        // Create user documents for team players
        team.players.forEach(player => {
            batch.set(db.collection('users').doc(player.userId), {
                displayName: player.displayName,
                initials: player.initials,
                email: player.email,
                userId: player.userId,
                photoURL: player.photoURL || null,
                avatarSource: 'initials',
                discordTag: null,
                timezone: 'Europe/Stockholm',
                teams: { [team.id]: true },
                createdAt: Timestamp.now(),
                lastUpdatedAt: Timestamp.now()
            });
        });

        // Create availability for this team
        weekIds.forEach(weekId => {
            const slots = {};
            team.players.forEach((player, i) => {
                const playerSlots = generateTeamAvailability(team.availabilityPattern, i);
                playerSlots.forEach(slotId => {
                    if (!slots[slotId]) slots[slotId] = [];
                    slots[slotId].push(player.userId);
                });
            });

            batch.set(db.collection('availability').doc(`${team.id}_${weekId}`), {
                teamId: team.id,
                weekId,
                slots,
                lastUpdated: Timestamp.now()
            });
        });
        console.log(`  ✓ Availability created for weeks ${weekIds.join(', ')}`);
    }

    await batch.commit();

    // ============================================
    // Summary
    // ============================================
    const totalPlayers = 1 + DEV_SQUAD_PLAYERS.length + ALL_ADDITIONAL_PLAYERS.length;
    const totalTeams = 1 + ADDITIONAL_TEAMS.length;

    console.log('\n✅ Emulator seeded successfully!');
    console.log('\n📋 Summary:');
    console.log(`  - ${totalTeams} teams total:`);
    console.log('    • Dev Squad (D1) - 6 players - YOUR TEAM');
    ADDITIONAL_TEAMS.forEach(t => {
        console.log(`    • ${t.teamName} (${t.divisions.join('/')}) - ${t.players.length} players`);
    });
    console.log(`  - ${totalPlayers} users total`);
    console.log('  - 4 weeks of availability per team');
    console.log('\n🎯 Availability Patterns:');
    console.log('  • Phoenix Rising: Weekday prime time (19:00-21:00 Mon-Thu)');
    console.log('  • Shadow Wolves: Late night (21:00-23:00 all week)');
    console.log('  • Nova Esports: Weekend warriors + weekday flex');
    console.log(`\n🔑 Dev user UID: ${DEV_USER_UID} (FIXED)`);
    console.log('\n🎮 Refresh the browser to see changes');
}

seedEmulator()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
    });
