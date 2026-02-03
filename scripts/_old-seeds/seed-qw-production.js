/**
 * Seed PRODUCTION Firestore with REAL QuakeWorld team data
 *
 * Usage: node scripts/seed-qw-production.js
 *
 * Prerequisites:
 * - service-account.json must exist in project root
 * - Must be authenticated with Firebase
 */

const sharp = require('sharp');

// Load service account
const serviceAccount = require('../service-account.json');

const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'matchscheduler-dev.firebasestorage.app'
});

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();
const bucket = storage.bucket();
const { Timestamp } = admin.firestore;

console.log(`🔗 Connected to PRODUCTION Firestore`);
console.log(`🔗 Project: ${serviceAccount.project_id}\n`);

// ============================================
// REAL USER UID - ParadokS (Discord/Google Auth)
// ============================================
const PARADOKS_UID = '4xZGTIVAmghdDLv1cXJdUTN8Pyz1';

// ============================================
// Captain Discord IDs - collected from the community
// ============================================
const CAPTAIN_DISCORD = {
    "Macler": { username: "macler", discordId: "323570475647238144" },
    "TheChosenOne": { username: "thechosenone", discordId: "106846389354438656" },
    "Ake Vader": { username: "ake vader", discordId: "166872187788066816" },
    "conan": { username: "conan", discordId: "536953724665462795" },
    "Hooraytio": { username: "hooraytio", discordId: "255234034609815554" },
    "sae": { username: "sae", discordId: "508739823557804052" },
    "Mille": { username: "mille", discordId: "801726266431635466" },
    "Splash": { username: "splash", discordId: "196229216373571593" },
    "ParadokS": { username: "paradoks", discordId: "140268554816716800" },
    "veggie": { username: "veggie", discordId: "1127113677749887057" },
    "Oddjob": { username: "oddjob", discordId: "835415147040079913" },
    "jOn": { username: "jon", discordId: "808346233256017973" },
    "gLAd": { username: "glad", discordId: "311446450871599104" },
    "fluartity": { username: "fluarity", discordId: "239390377583312898" },
    "Gamer": { username: "gamer", discordId: "211433738846863360" },
    "mazer": { username: "mazer", discordId: "131498556870754304" },
    "Link": { username: "link", discordId: "522396945612931106" },
    "Plast": { username: "plast", discordId: "404952198934560769" },
    "tiba": { username: "tiba", discordId: "149722360688279554" },
    "Mushi": { username: "mushi", discordId: "86086427581878272" },
    "spokz": { username: "spokz", discordId: "622520960930807878" },
    "bps": { username: "bps", discordId: "146027619576578058" },
};

// ============================================
// REAL QUAKEWORLD TEAMS FROM quakeworld.nu
// Data source: https://www.quakeworld.nu/wiki/User:Bps/TeamCard
// ============================================

const QW_TEAMS = [
    // Division 1
    {
        id: 'team-sd-001',
        teamName: 'Suddendeath',
        teamTag: '-s-',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/2/23/Logo_clan_suddendeath.png',
        players: [
            { name: 'bps', role: 'leader' },
            { name: 'carapace', role: 'member' },
            { name: 'XantoM', role: 'member' },
            { name: 'lacsap', role: 'member' },
            { name: 'andeh', role: 'member' },
        ]
    },
    {
        id: 'team-wm-001',
        teamName: 'Wingmen',
        teamTag: 'ving',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/7/7f/Logo_clan_wingmen.png',
        players: [
            { name: 'Peppe', role: 'leader' },
            { name: 'LethalWiz', role: 'member' },
            { name: 'ganon', role: 'member' },
            { name: 'rst', role: 'member' },
            { name: 'rio', role: 'member' },
        ]
    },
    {
        id: 'team-3b-001',
        teamName: 'Bear Beer Balalaika',
        teamTag: '3b',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/8/84/Logo_clan_3b.png',
        players: [
            { name: 'gLAd', role: 'leader' },
            { name: 'ass', role: 'member' },
            { name: 'max power', role: 'member' },
            { name: 'SS', role: 'member' },
            { name: 'rusty-q', role: 'member' },
            { name: 'Bulat', role: 'member' },
        ]
    },
    {
        id: 'team-sr-001',
        teamName: 'Slackers',
        teamTag: ']SR[',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/0/0f/Logo_clan_slackers.png',
        realLeaderUid: PARADOKS_UID,  // Use real Auth UID for ParadokS
        players: [
            { name: 'ParadokS', role: 'leader', isRealUser: true },
            { name: 'zero', role: 'member' },
            { name: 'grisling', role: 'member' },
            { name: 'phrenic', role: 'member' },
            { name: 'macler', role: 'member' },
        ]
    },
    {
        id: 'team-exo-001',
        teamName: 'Exodus',
        teamTag: 'exo',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/6/6b/Logo_clan_exodus.png',
        players: [
            { name: 'Javve', role: 'leader' },
            { name: 'fix', role: 'member' },
            { name: 'xterm', role: 'member' },
            { name: 'Xerial', role: 'member' },
        ]
    },
    {
        id: 'team-hx-001',
        teamName: 'Hell Xpress',
        teamTag: '[hx]',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/1/19/Logo_clan_hx.png',
        players: [
            { name: 'ok98', role: 'leader' },
            { name: 'splash', role: 'member' },
            { name: 'shaka', role: 'member' },
            { name: 'mm', role: 'member' },
        ]
    },
    {
        id: 'team-gg-001',
        teamName: 'Gubb Grottan',
        teamTag: 'gg',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/8/81/Logo_clan_gubbgrottan.png',
        players: [
            { name: 'niw', role: 'leader' },
            { name: 'xero', role: 'member' },
            { name: 'mazer', role: 'member' },
            { name: 'Mille', role: 'member' },
        ]
    },
    {
        id: 'team-axe-001',
        teamName: 'The Axemen',
        teamTag: 'oeks',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/a/ae/Axemen_logo.png',
        players: [
            { name: 'Timmi', role: 'leader' },
            { name: 'Macisum', role: 'member' },
            { name: 'tr0ll', role: 'member' },
            { name: 'PreMortem', role: 'member' },
        ]
    },
    {
        id: 'team-tsq-001',
        teamName: 'The Suicide Quad',
        teamTag: 'tSQ',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/5/53/Logo_clan_tsq.png',
        players: [
            { name: 'conan', role: 'leader' },
            { name: 'djevulsk', role: 'member' },
            { name: 'nas', role: 'member' },
            { name: 'Elguapo', role: 'member' },
            { name: 'Mutilator', role: 'member' },
        ]
    },
    {
        id: 'team-bb-001',
        teamName: 'Black Book',
        teamTag: 'Book',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/5/5b/Logo_clan_bb.png',
        players: [
            { name: 'Milton', role: 'leader' },
            { name: 'Diki', role: 'member' },
            { name: 'creature', role: 'member' },
        ]
    },
    {
        id: 'team-koff-001',
        teamName: 'KOFF',
        teamTag: 'koff',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/3/30/Clan_logo_koff.png',
        players: [
            { name: 'gamer', role: 'leader' },
            { name: 'scenic', role: 'member' },
            { name: 'eh', role: 'member' },
            { name: 'pkk', role: 'member' },
            { name: 'nasander', role: 'member' },
            { name: 'wallu', role: 'member' },
        ]
    },
    {
        id: 'team-tot-001',
        teamName: 'Tribe of Tjernobyl',
        teamTag: 'tot',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/8/87/Logo_clan_tot.png',
        players: [
            { name: 'slime', role: 'leader' },
            { name: 'oddjob', role: 'member' },
        ]
    },
    {
        id: 'team-d2-001',
        teamName: 'Death Dealers',
        teamTag: 'd2',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/4/4b/Logo_clan_d2.png',
        players: [
            { name: 'plast', role: 'leader' },
            { name: 'hammer', role: 'member' },
            { name: 'riki', role: 'member' },
            { name: 'Flamer', role: 'member' },
        ]
    },
    {
        id: 'team-dc-001',
        teamName: 'Demolition Crew',
        teamTag: 'dc',
        divisions: ['D1'],
        logoUrl: 'https://www.quakeworld.nu/w/images/2/25/Logo_clan_dc.webp',
        players: [
            { name: 'shamoth', role: 'leader' },
            { name: 'er', role: 'member' },
            { name: 'goniec', role: 'member' },
            { name: 'kat', role: 'member' },
        ]
    },
    // Division 2
    {
        id: 'team-fu-001',
        teamName: 'Fraggers United',
        teamTag: '-fu-',
        divisions: ['D2'],
        logoUrl: 'https://www.quakeworld.nu/w/images/6/6e/Logo_clan_fraggersunited.png',
        players: [
            { name: 'hooraytio', role: 'leader' },
            { name: 'kip', role: 'member' },
            { name: 'rusti', role: 'member' },
            { name: 'rghst', role: 'member' },
        ]
    },
    {
        id: 'team-dds-001',
        teamName: 'Death Dealers Shadows',
        teamTag: 'd2,f',
        divisions: ['D2'],
        logoUrl: 'https://www.quakeworld.nu/w/images/4/4b/Logo_clan_d2.png',
        players: [
            { name: 'Szturm', role: 'leader' },
            { name: 'frame', role: 'member' },
            { name: 'myca', role: 'member' },
            { name: 'pitbull', role: 'member' },
            { name: 'tumult', role: 'member' },
        ]
    },
    {
        id: 'team-rrs-001',
        teamName: 'RetroRockets Sensors',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.quakeworld.nu/w/images/c/ce/Logo_clan_retrorockets.png',
        players: [
            { name: 'Himmu', role: 'leader' },
            { name: 'ocoini', role: 'member' },
            { name: 'tuhmapoika', role: 'member' },
            { name: 'robin', role: 'member' },
            { name: 'neophyte', role: 'member' },
        ]
    },
    {
        id: 'team-rrc-001',
        teamName: 'RetroRockets Cooling',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.quakeworld.nu/w/images/c/ce/Logo_clan_retrorockets.png',
        players: [
            { name: 'HangTime', role: 'leader' },
            { name: 'paniagua', role: 'member' },
            { name: 'viag', role: 'member' },
            { name: 'gore', role: 'member' },
            { name: 'dobezz', role: 'member' },
            { name: 'Anni', role: 'member' },
        ]
    },
    {
        id: 'team-spkt-001',
        teamName: 'SPKT',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.quakeworld.nu/w/images/e/ed/Logo_clan_spkt.png',
        players: [
            { name: 'Link', role: 'leader' },
            { name: 'darko', role: 'member' },
            { name: 'Floc', role: 'member' },
            { name: 'cor', role: 'member' },
            { name: 'ekz', role: 'member' },
        ]
    },
    {
        id: 'team-dc2-001',
        teamName: 'Demolition Crew 2',
        teamTag: 'dc2',
        divisions: ['D2'],
        logoUrl: 'https://www.quakeworld.nu/w/images/2/25/Logo_clan_dc.webp',
        players: [
            { name: 'gawlo', role: 'leader' },
            { name: 'pooll', role: 'member' },
            { name: 'rotker', role: 'member' },
            { name: 'ponczek', role: 'member' },
            { name: 'goorol', role: 'member' },
        ]
    },
    // Division 3
    {
        id: 'team-db-001',
        teamName: 'Deathbound',
        teamTag: 'db',
        divisions: ['D3'],
        logoUrl: 'https://www.quakeworld.nu/w/images/d/d4/Logo_clan_deathbound.png',
        players: [
            { name: 'Duce', role: 'leader' },
            { name: 'spokz', role: 'member' },
            { name: 'mj23', role: 'member' },
            { name: 'kwon', role: 'member' },
            { name: 'doomie', role: 'member' },
            { name: 'fluartity', role: 'member' },
        ]
    },
    {
        id: 'team-rro-001',
        teamName: 'RetroRockets Oxidizers',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.quakeworld.nu/w/images/c/ce/Logo_clan_retrorockets.png',
        players: [
            { name: 'biggz', role: 'leader' },
            { name: 'naleksi', role: 'member' },
            { name: 'stm', role: 'member' },
            { name: 'alice', role: 'member' },
            { name: 'abraxas', role: 'member' },
        ]
    },
    {
        id: 'team-rrg-001',
        teamName: 'RetroRockets Gyroscopes',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.quakeworld.nu/w/images/c/ce/Logo_clan_retrorockets.png',
        players: [
            { name: 'Evil', role: 'leader' },
            { name: 'pixols', role: 'member' },
            { name: 'dape', role: 'member' },
            { name: 'pharmistice', role: 'member' },
        ]
    },
    {
        id: 'team-rra-001',
        teamName: 'RetroRockets Avionics',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.quakeworld.nu/w/images/c/ce/Logo_clan_retrorockets.png',
        players: [
            { name: 'crippan', role: 'leader' },
            { name: 'sickness', role: 'member' },
            { name: 'eppe', role: 'member' },
            { name: 'bvr', role: 'member' },
        ]
    },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

const TIME_SLOTS = ['1800', '1830', '1900', '1930', '2000', '2030', '2100', '2130', '2200', '2230', '2300'];
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

function generateInitials(name) {
    const parts = name.split(/[\s-]+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function generateUserId(teamTag, playerName) {
    const safeName = playerName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeTag = (teamTag || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `qw-${safeTag}-${safeName}`;
}

function generateEmail(playerName) {
    const safeName = playerName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${safeName}@qw.test`;
}

function generateJoinCode(teamTag) {
    const base = (teamTag || 'XXX').toUpperCase().padEnd(3, 'X');
    return base + Math.random().toString(36).substring(2, 5).toUpperCase();
}

function getAvatarUrl(seed) {
    return `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(seed)}&size=128`;
}

function generateRandomAvailability(playerIndex, teamIndex) {
    const patterns = [
        () => DAYS.slice(0, 5).flatMap(day => ['1900', '1930', '2000', '2030', '2100'].map(t => `${day}_${t}`)),
        () => DAYS.slice(5).flatMap(day => TIME_SLOTS.map(t => `${day}_${t}`)),
        () => DAYS.flatMap(day => ['2100', '2130', '2200', '2230', '2300'].map(t => `${day}_${t}`)),
        () => DAYS.flatMap(day => TIME_SLOTS.filter(() => Math.random() > 0.5).map(t => `${day}_${t}`)),
        () => DAYS.flatMap(day => ['1800', '1830', '1900', '1930', '2000'].map(t => `${day}_${t}`)),
    ];

    const patternIndex = (playerIndex + teamIndex) % patterns.length;
    const pattern = patterns[patternIndex]();
    return pattern.filter(() => Math.random() > 0.35);
}

async function downloadImage(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`  ⚠️  Failed to download ${url}: ${error.message}`);
        return null;
    }
}

async function processAndUploadLogo(teamId, imageBuffer) {
    const logoId = `logo-${Date.now()}`;
    const sizes = [
        { name: 'large', width: 400 },
        { name: 'medium', width: 150 },
        { name: 'small', width: 48 }
    ];

    const urls = {};

    for (const size of sizes) {
        try {
            const resizedBuffer = await sharp(imageBuffer)
                .resize(size.width, size.width, { fit: 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            const filePath = `team-logos/${teamId}/${logoId}/${size.name}_${logoId}.png`;
            const file = bucket.file(filePath);

            await file.save(resizedBuffer, {
                contentType: 'image/png',
                metadata: {
                    cacheControl: 'public, max-age=31536000',
                }
            });

            // Make file public
            await file.makePublic();

            // Construct public URL
            urls[size.name] = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        } catch (error) {
            console.error(`  ⚠️  Failed to process ${size.name} for ${teamId}: ${error.message}`);
        }
    }

    return { logoId, urls };
}

// Note: We don't create Auth users for seed data - they're just Firestore docs
// Real users will authenticate via Discord OAuth

// ============================================
// DATABASE CLEARING FUNCTION
// ============================================

async function clearDatabase() {
    console.log('\n🧹 Clearing database...\n');

    // Delete all teams
    const teams = await db.collection('teams').get();
    for (const doc of teams.docs) {
        await doc.ref.delete();
    }
    console.log(`  Deleted ${teams.size} teams`);

    // Delete all availability
    const avail = await db.collection('availability').get();
    for (const doc of avail.docs) {
        await doc.ref.delete();
    }
    console.log(`  Deleted ${avail.size} availability docs`);

    // Delete seed users (keep real users)
    const users = await db.collection('users').get();
    let deletedUsers = 0;
    for (const doc of users.docs) {
        // Keep real users (those without seed- prefix)
        if (doc.id.startsWith('seed-') || doc.id.startsWith('fake-') || doc.id.startsWith('qw-') || doc.id.startsWith('dev-')) {
            await doc.ref.delete();
            deletedUsers++;
        }
    }
    console.log(`  Deleted ${deletedUsers} seed users (kept real users)`);

    // Clear teams map from real users
    const realUsers = users.docs.filter(doc =>
        !doc.id.startsWith('seed-') &&
        !doc.id.startsWith('fake-') &&
        !doc.id.startsWith('qw-') &&
        !doc.id.startsWith('dev-')
    );
    for (const doc of realUsers) {
        await doc.ref.update({ teams: {} });
    }
    console.log(`  Cleared teams from ${realUsers.length} real user profiles`);
}

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedQWTeams() {
    console.log('='.repeat(60));
    console.log('🎮 MatchScheduler Production Reseed - QW Teams');
    console.log('='.repeat(60));
    console.log('⚠️  WARNING: This will CLEAR and reseed PRODUCTION data!\n');

    // Wait 3 seconds to give user a chance to cancel
    console.log('Starting in 3 seconds... (Ctrl+C to cancel)\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    await clearDatabase();

    const currentWeek = getCurrentWeekNumber();
    const week1Id = getWeekId(currentWeek);
    const week2Id = getWeekId(currentWeek + 1);
    const week3Id = getWeekId(currentWeek + 2);
    const week4Id = getWeekId(currentWeek + 3);
    const weekIds = [week1Id, week2Id, week3Id, week4Id];

    console.log(`📅 Creating data for weeks: ${weekIds.join(', ')}\n`);

    let totalPlayers = 0;
    let logosProcessed = 0;

    for (let teamIndex = 0; teamIndex < QW_TEAMS.length; teamIndex++) {
        const team = QW_TEAMS[teamIndex];
        const batch = db.batch();

        console.log(`\n📋 Processing ${team.teamName} [${team.teamTag}]...`);

        let activeLogo = null;
        if (team.logoUrl) {
            console.log(`  📥 Downloading logo...`);
            const imageBuffer = await downloadImage(team.logoUrl);
            if (imageBuffer) {
                console.log(`  🔄 Processing into 3 sizes...`);
                const logoResult = await processAndUploadLogo(team.id, imageBuffer);
                if (Object.keys(logoResult.urls).length === 3) {
                    activeLogo = {
                        logoId: logoResult.logoId,
                        urls: logoResult.urls
                    };
                    logosProcessed++;
                    console.log(`  ✓ Logo uploaded successfully`);
                }
            }
        }

        const roster = [];
        let leaderId = null;

        for (const player of team.players) {
            let userId;
            const displayName = player.name;
            const initials = generateInitials(player.name);
            const photoURL = getAvatarUrl(displayName.toLowerCase().replace(/\s+/g, '-'));
            const isLeader = player.role === 'leader';

            // Use real UID for real users, generate seed ID for others
            if (team.realLeaderUid && player.isRealUser && isLeader) {
                userId = team.realLeaderUid;
            } else {
                userId = generateUserId(team.teamTag, player.name);
            }

            roster.push({
                userId,
                displayName,
                initials,
                photoURL,
                joinedAt: new Date(Date.now() - Math.random() * 30 * 86400000),
                role: player.role
            });

            if (isLeader) {
                leaderId = userId;
            }

            // Create/update user document
            if (player.isRealUser && team.realLeaderUid) {
                // Update real user's teams map (don't overwrite their profile)
                const userRef = db.collection('users').doc(userId);
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    await userRef.update({
                        teams: { [team.id]: true },
                        lastUpdatedAt: Timestamp.now()
                    });
                } else {
                    // Real user doesn't have a profile yet, create minimal one
                    batch.set(userRef, {
                        displayName,
                        initials,
                        userId,
                        photoURL,
                        avatarSource: 'initials',
                        teams: { [team.id]: true },
                        createdAt: Timestamp.now(),
                        lastUpdatedAt: Timestamp.now()
                    });
                }
            } else {
                // Create seed user document
                const email = generateEmail(player.name);
                batch.set(db.collection('users').doc(userId), {
                    displayName,
                    initials,
                    email,
                    userId,
                    photoURL,
                    avatarSource: 'initials',
                    discordTag: null,
                    teams: { [team.id]: true },
                    createdAt: Timestamp.now(),
                    lastUpdatedAt: Timestamp.now()
                });
            }

            totalPlayers++;
        }

        const teamDoc = {
            teamName: team.teamName,
            teamNameLower: team.teamName.toLowerCase(),
            teamTag: team.teamTag,
            leaderId: leaderId,
            divisions: team.divisions,
            maxPlayers: 10,
            joinCode: generateJoinCode(team.teamTag),
            status: 'active',
            playerRoster: roster,
            createdAt: Timestamp.now(),
            lastActivityAt: Timestamp.now()
        };

        if (activeLogo) {
            teamDoc.activeLogo = activeLogo;
        }

        // Add captain Discord contact info if available
        const leaderPlayer = team.players.find(p => p.role === 'leader');
        if (leaderPlayer && CAPTAIN_DISCORD[leaderPlayer.name]) {
            teamDoc.leaderDiscord = {
                username: CAPTAIN_DISCORD[leaderPlayer.name].username,
                discordId: CAPTAIN_DISCORD[leaderPlayer.name].discordId
            };
        }

        batch.set(db.collection('teams').doc(team.id), teamDoc);

        for (const weekId of weekIds) {
            const slots = {};
            roster.forEach((player, playerIndex) => {
                const playerSlots = generateRandomAvailability(playerIndex, teamIndex);
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
        }

        await batch.commit();
        console.log(`  ✓ Team created with ${roster.length} players`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Reseed complete!');
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`  - ${QW_TEAMS.length} teams created`);
    console.log(`  - ${totalPlayers} players/users created`);
    console.log(`  - ${logosProcessed} logos processed and uploaded`);
    console.log(`  - ${weekIds.length} weeks of availability per team`);

    console.log(`\n🏆 Divisions:`);
    const d1Teams = QW_TEAMS.filter(t => t.divisions.includes('D1'));
    const d2Teams = QW_TEAMS.filter(t => t.divisions.includes('D2'));
    const d3Teams = QW_TEAMS.filter(t => t.divisions.includes('D3'));
    console.log(`  - D1: ${d1Teams.length} teams`);
    console.log(`  - D2: ${d2Teams.length} teams`);
    console.log(`  - D3: ${d3Teams.length} teams`);

    console.log(`\n🌐 Production URL: https://quakeworld-match-scheduler.web.app`);
    console.log(`\n🔄 Refresh the browser to see changes!`);
}

async function main() {
    await seedQWTeams();
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
