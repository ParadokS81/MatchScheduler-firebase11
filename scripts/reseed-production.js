/**
 * Clean and Reseed Production Firestore with Big4 Tournament team data
 *
 * This script:
 * 1. Clears all teams, availability, and fake users (preserves real user accounts)
 * 2. Creates all 24 Big4 teams with proper structure and Discord contact info
 * 3. Downloads and processes team logos from thebig4.se
 * 4. Sets up ParadokS as leader of Slackers
 *
 * Usage:
 *   node scripts/reseed-production.js              # Without logos (fast)
 *   node scripts/reseed-production.js --with-logos # With logos (slower)
 */

const admin = require('firebase-admin');
const https = require('https');
const http = require('http');
const serviceAccount = require('../service-account.json');

// Check for --with-logos flag
const WITH_LOGOS = process.argv.includes('--with-logos');

// Only require sharp if we're processing logos
let sharp = null;
if (WITH_LOGOS) {
    try {
        sharp = require('sharp');
    } catch (err) {
        console.error('❌ sharp module not found. Install it with: npm install sharp');
        process.exit(1);
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'matchscheduler-dev',
    storageBucket: 'matchscheduler-dev.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();
const { Timestamp, FieldValue } = admin.firestore;

// Your actual Firebase UID (from Discord auth)
const PARADOKS_UID = '4xZGTIVAmghdDLv1cXJdUTN8Pyz1';

// Captain Discord IDs - collected from the community
const CAPTAIN_DISCORD = {
    "Macler": { username: "macler", odiscorId: "323570475647238144" },
    "TheChosenOne": { username: "thechosenone", odiscorId: "106846389354438656" },
    "Ake Vader": { username: "ake vader", odiscorId: "166872187788066816" },
    "conan": { username: "conan", odiscorId: "536953724665462795" },
    "Hooraytio": { username: "hooraytio", odiscorId: "255234034609815554" },
    "sae": { username: "sae", odiscorId: "508739823557804052" },
    "Mille": { username: "mille", odiscorId: "801726266431635466" },
    "Splash": { username: "splash", odiscorId: "196229216373571593" },
    "ParadokS": { username: "paradoks", odiscorId: "140268554816716800" },
    "veggie": { username: "veggie", odiscorId: "1127113677749887057" },
    "Oddjob": { username: "oddjob", odiscorId: "835415147040079913" },
    "jOn": { username: "jon", odiscorId: "808346233256017973" },
    "gLAd": { username: "glad", odiscorId: "311446450871599104" },
    "fluartity": { username: "fluarity", odiscorId: "239390377583312898" },
    "Gamer": { username: "gamer", odiscorId: "211433738846863360" },
    "mazer": { username: "mazer", odiscorId: "131498556870754304" },
    "Link": { username: "link", odiscorId: "522396945612931106" },
    "Plast": { username: "plast", odiscorId: "404952198934560769" },
    "tiba": { username: "tiba", odiscorId: "149722360688279554" },
    "Mushi": { username: "mushi", odiscorId: "86086427581878272" },
    "spokz": { username: "spokz", odiscorId: "622520960930807878" },
};

// All 24 Big4 Tournament Teams (from thebig4.se)
const BIG4_TEAMS = [
    {
        teamName: 'Polonez',
        teamTag: 'POL',
        captain: 'Macler',
        players: ['Macler', 'Thunder', 'Tom', 'Plate', 'Er', 'Iron', 'Emaks']
    },
    {
        teamName: 'The Axemen',
        teamTag: 'AXE',
        captain: 'TheChosenOne',
        players: ['TheChosenOne', 'TiMMi', 'Baresi', 'PreMorteM', 'Macisum', 'tr0ll']
    },
    {
        teamName: 'Boomstickers',
        teamTag: 'BOOM',
        captain: 'Ake Vader',
        players: ['Ake Vader', 'Kylarn', 'Kreator', 'Le1no', 'Bill']
    },
    {
        teamName: 'the Suicide Quad',
        teamTag: 'TSQ',
        captain: 'conan',
        players: ['conan', 'djevulsk', 'elguapo', 'nas', 'peppe', 'phrenic', 'mutilator']
    },
    {
        teamName: 'Fraggers United',
        teamTag: 'FU',
        captain: 'Hooraytio',
        players: ['Hooraytio', 'Anza', 'Kippo', 'Rusti', 'Rghst', 'Slaughter']
    },
    {
        teamName: 'Black book',
        teamTag: 'BB',
        captain: 'sae',
        players: ['sae', 'Milton', 'Wimpeeh', 'Javve', 'Nigve', 'Creature', 'Diki']
    },
    {
        teamName: 'Ving',
        teamTag: 'VING',
        captain: 'Mille',
        players: ['Mille', 'Sailorman', 'Edvin', 'Mythic']
    },
    {
        teamName: 'Hell Xpress',
        teamTag: 'HX',
        captain: 'Splash',
        players: ['Splash', 'Shaka', 'Ok98', 'Realpit', 'Xerial']
    },
    {
        teamName: 'Slackers',
        teamTag: 'SLK',
        captain: 'ParadokS',
        players: ['ParadokS', 'Zero', 'Grisling', 'Razor'],
        realLeaderUid: PARADOKS_UID
    },
    {
        teamName: 'night Wolves',
        teamTag: 'NW',
        captain: 'veggie',
        players: ['veggie', 'Coinz', 'Toes', 'R1zla', 'Stm', 'Nightfall']
    },
    {
        teamName: 'Tribe of Tjernobyl',
        teamTag: 'TOT',
        captain: 'Oddjob',
        players: ['Oddjob', 'Slime', 'LethalWiz', 'Fix', 'Sassa']
    },
    {
        teamName: 'Good Old Friends',
        teamTag: 'GOF',
        captain: 'jOn',
        players: ['jOn', 'Ekz', 'Tumult', 'Bass']
    },
    {
        teamName: 'Bear Beer Balalaika',
        teamTag: 'BBB',
        captain: 'gLAd',
        players: ['gLAd', 'gor', 'Zepp', 'max_power', 'SS', 'Ass', 'rusty-q']
    },
    {
        teamName: 'Deathbound',
        teamTag: 'DB',
        captain: 'fluartity',
        players: ['fluartity', 'Pamppu', 'mj23', 'Doomie', 'kwon', 'Arnelius']
    },
    {
        teamName: 'Koff',
        teamTag: 'KOFF',
        captain: 'Gamer',
        players: ['Gamer', 'Eh', 'Nasander', 'Pkk', 'Scenic', 'Wallu']
    },
    {
        teamName: 'Gubbgrottan',
        teamTag: 'GG',
        captain: 'mazer',
        players: ['mazer', 'niw', 'xero', 'himmu', 'gnoffa', 'locktar']
    },
    {
        teamName: 'Snowflakes',
        teamTag: 'SF',
        captain: 'Link',
        players: ['Link', 'Alice', 'Zalon', 'Dape', 'Duce']
    },
    {
        teamName: 'Death Dealers',
        teamTag: 'DD',
        captain: 'Plast',
        players: ['Plast', 'Hammer', 'Raket', 'Coj', 'Riki', 'Szturm']
    },
    {
        teamName: 'Falling in Reverse',
        teamTag: 'FIR',
        captain: 'tiba',
        players: ['tiba', 'mihawk', 'matuzah', 'hemp', 'gflip', 'guns']
    },
    {
        teamName: 'Red Alert',
        teamTag: 'RA',
        captain: 'sCorp',
        players: ['sCorp', 'Doberman', 'Dzha', 'devil', 'witka', 'nlk', 'Nekoranger']
    },
    {
        teamName: 'oSaMs sm/osams',
        teamTag: 'OSAM',
        captain: 'blaps',
        players: ['blaps', 'apa', 'whyz', 'clox', 'marksuzu', 'steppa', 'gorbatjevtarzan', 'lakso']
    },
    {
        teamName: 'Aim For Kill',
        teamTag: 'AFK',
        captain: 'Mushi',
        players: ['Mushi', 'Rotker', 'Gawlo', 'Darff', 'Spliffy']
    },
    {
        teamName: 'Death Dealers Shadows',
        teamTag: 'DDS',
        captain: 'spokz',
        players: ['spokz', 'myca', 'pitbull', 'frame', 'flamer']
    },
    {
        teamName: 'Warriors of Death',
        teamTag: 'WOD',
        captain: 'Cao',
        players: ['Cao', 'Canino', 'Sinistro', 'Coveiro', 'Char', 'Natan']
    }
];

const TIME_SLOTS = ['1800', '1830', '1900', '1930', '2000', '2030', '2100', '2130', '2200', '2230', '2300'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function generateJoinCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateInitials(name) {
    const clean = name.replace(/[^a-zA-Z0-9]/g, '');
    return clean.substring(0, 3).toUpperCase() || 'PLR';
}

function generateUserId(teamTag, playerName) {
    const safeName = playerName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `seed-${teamTag.toLowerCase()}-${safeName}`;
}

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

function generateRandomAvailability(playerIndex, teamIndex) {
    const patterns = [
        // Weekday evenings - most common for EU players
        () => DAYS.slice(0, 5).flatMap(day => ['1900', '1930', '2000', '2030', '2100'].map(t => `${day}_${t}`)),
        // Weekend warrior
        () => DAYS.slice(5).flatMap(day => TIME_SLOTS.map(t => `${day}_${t}`)),
        // Late night
        () => DAYS.flatMap(day => ['2100', '2130', '2200', '2230', '2300'].map(t => `${day}_${t}`)),
        // Mixed flexible
        () => DAYS.flatMap(day => TIME_SLOTS.filter(() => Math.random() > 0.5).map(t => `${day}_${t}`)),
        // Early evening
        () => DAYS.flatMap(day => ['1800', '1830', '1900', '1930', '2000'].map(t => `${day}_${t}`)),
    ];
    const patternIndex = (playerIndex + teamIndex) % patterns.length;
    return patterns[patternIndex]().filter(() => Math.random() > 0.35);
}

// Helper to generate DiceBear avatar URL (deterministic based on seed)
function getAvatarUrl(seed) {
    return `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(seed)}&size=128`;
}

// Convert team name to logo filename (thebig4.se format)
function getLogoFilename(teamName) {
    return teamName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        + '.png';
}

// Download image from URL
function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadImage(response.headers.location).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

// Process logo into 3 sizes and upload to Storage
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
            // Resize image using sharp
            const resizedBuffer = await sharp(imageBuffer)
                .resize(size.width, size.width, {
                    fit: 'cover',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer();

            // Upload to Storage
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
            console.error(`    ⚠️  Failed to process ${size.name}: ${error.message}`);
        }
    }

    return { logoId, urls };
}

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
        if (doc.id.startsWith('seed-') || doc.id.startsWith('fake-') || doc.id.startsWith('qw-') || doc.id.startsWith('dev-big4-')) {
            await doc.ref.delete();
            deletedUsers++;
        }
    }
    console.log(`  Deleted ${deletedUsers} seed users (kept real users)`);

    // Clear teams map from real users
    for (const doc of users.docs) {
        if (!doc.id.startsWith('seed-') && !doc.id.startsWith('fake-') && !doc.id.startsWith('qw-') && !doc.id.startsWith('dev-big4-')) {
            await doc.ref.update({ teams: {} });
        }
    }
    console.log(`  Cleared teams from real user profiles`);
}

async function seedTeams() {
    console.log('\n🌱 Seeding teams...\n');

    const currentWeek = getCurrentWeekNumber();
    const weekIds = [
        getWeekId(currentWeek),
        getWeekId(currentWeek + 1),
        getWeekId(currentWeek + 2),
        getWeekId(currentWeek + 3)
    ];

    let slackersTeamId = null;
    let teamsWithDiscord = 0;
    let teamsWithLogos = 0;

    for (let teamIndex = 0; teamIndex < BIG4_TEAMS.length; teamIndex++) {
        const team = BIG4_TEAMS[teamIndex];
        const batch = db.batch();

        // Generate team ID
        const teamRef = db.collection('teams').doc();
        const teamId = teamRef.id;

        if (team.teamName === 'Slackers') {
            slackersTeamId = teamId;
        }

        // Build roster
        const roster = [];
        let leaderId = null;

        for (const playerName of team.players) {
            let userId;
            const isLeader = playerName === team.captain;
            const initials = generateInitials(playerName);

            // Generate avatar URL based on player name
            const photoURL = getAvatarUrl(playerName.toLowerCase().replace(/\s+/g, '-'));

            if (team.realLeaderUid && isLeader) {
                // Real user (ParadokS)
                userId = team.realLeaderUid;
            } else {
                // Seed user
                userId = generateUserId(team.teamTag, playerName);

                // Create seed user doc
                batch.set(db.collection('users').doc(userId), {
                    displayName: playerName,
                    initials: initials,
                    email: `${playerName.toLowerCase().replace(/[^a-z0-9]/g, '')}@seed.test`,
                    userId: userId,
                    photoURL: photoURL,
                    avatarSource: 'initials',
                    teams: { [teamId]: true },
                    createdAt: Timestamp.now(),
                    lastUpdatedAt: Timestamp.now()
                });
            }

            roster.push({
                userId,
                displayName: playerName,
                initials: initials,
                photoURL: photoURL,
                joinedAt: new Date(),
                role: isLeader ? 'leader' : 'member'
            });

            if (isLeader) {
                leaderId = userId;
            }
        }

        // Get captain Discord info if available
        const captainDiscord = CAPTAIN_DISCORD[team.captain];

        // Create team doc
        const teamDoc = {
            teamName: team.teamName,
            teamNameLower: team.teamName.toLowerCase(),
            teamTag: team.teamTag,
            leaderId: leaderId,
            divisions: ['1'], // Big4 is a single division tournament
            maxPlayers: 10,
            joinCode: generateJoinCode(),
            status: 'active',
            playerRoster: roster,
            createdAt: Timestamp.now(),
            lastActivityAt: Timestamp.now()
        };

        // Add captain Discord contact info if available
        if (captainDiscord) {
            teamDoc.leaderDiscord = {
                username: captainDiscord.username,
                odiscorId: captainDiscord.odiscorId
            };
            teamsWithDiscord++;
        }

        // Download and process logo if --with-logos flag is set
        if (WITH_LOGOS) {
            const logoFilename = getLogoFilename(team.teamName);
            const logoUrl = `https://www.thebig4.se/teams/${logoFilename}`;

            try {
                const imageBuffer = await downloadImage(logoUrl);
                const logoResult = await processAndUploadLogo(teamId, imageBuffer);

                if (Object.keys(logoResult.urls).length === 3) {
                    teamDoc.activeLogo = {
                        logoId: logoResult.logoId,
                        urls: logoResult.urls
                    };
                    teamsWithLogos++;
                }
            } catch (logoErr) {
                // Logo download failed, continue without logo
                console.log(`    ⚠️  Logo failed for ${team.teamName}: ${logoErr.message}`);
            }
        }

        batch.set(teamRef, teamDoc);

        // Create availability for each week
        for (const weekId of weekIds) {
            const slots = {};
            roster.forEach((player, playerIndex) => {
                const playerSlots = generateRandomAvailability(playerIndex, teamIndex);
                playerSlots.forEach(slotId => {
                    if (!slots[slotId]) slots[slotId] = [];
                    slots[slotId].push(player.userId);
                });
            });

            batch.set(db.collection('availability').doc(`${teamId}_${weekId}`), {
                teamId: teamId,
                weekId: weekId,
                slots: slots,
                lastUpdated: Timestamp.now()
            });
        }

        await batch.commit();

        // Build status icons
        const discordIcon = captainDiscord ? '📱' : '  ';
        const logoIcon = teamDoc.activeLogo ? '🖼️' : '  ';
        console.log(`  ${discordIcon}${logoIcon} ✓ ${team.teamName} [${team.teamTag}] - ${roster.length} players (captain: ${team.captain})`);
    }

    // Update ParadokS user profile with Slackers team and avatar
    if (slackersTeamId) {
        const paradoksPhotoURL = getAvatarUrl('paradoks');
        await db.collection('users').doc(PARADOKS_UID).update({
            teams: { [slackersTeamId]: true },
            photoURL: paradoksPhotoURL,
            avatarSource: 'initials'
        });
        console.log(`\n  ✓ Updated ParadokS profile with Slackers team ID: ${slackersTeamId}`);
    }

    return { slackersTeamId, teamsWithDiscord, teamsWithLogos };
}

async function main() {
    console.log('='.repeat(60));
    console.log('🎮 MatchScheduler Production Reseed - Big4 Tournament');
    console.log('='.repeat(60));
    console.log(`   Logos: ${WITH_LOGOS ? 'ENABLED (will download from thebig4.se)' : 'DISABLED (use --with-logos to enable)'}`);

    await clearDatabase();
    const { slackersTeamId, teamsWithDiscord, teamsWithLogos } = await seedTeams();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Reseed complete!');
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`  - ${BIG4_TEAMS.length} teams created`);
    console.log(`  - ${teamsWithDiscord}/${BIG4_TEAMS.length} teams have captain Discord contact`);
    if (WITH_LOGOS) {
        console.log(`  - ${teamsWithLogos}/${BIG4_TEAMS.length} teams have logos`);
    }
    console.log(`  - ParadokS is leader of Slackers (ID: ${slackersTeamId})`);
    console.log(`  - 4 weeks of availability per team`);
    console.log(`\n🔄 Refresh the browser to see changes!`);

    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
