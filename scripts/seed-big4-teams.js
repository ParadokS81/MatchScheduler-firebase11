/**
 * Seed Big4 Tournament Teams
 *
 * This script seeds Firestore with teams from thebig4.se tournament.
 * Teams are created as "unclaimed" - first person to join with the code becomes leader.
 *
 * Usage:
 *   node scripts/seed-big4-teams.js [options]
 *
 * Options:
 *   --dry-run      Preview what would be created without writing to Firestore
 *   --with-logos   Download and upload team logos to Firebase Storage
 *   --dev          DEV MODE: Include full rosters as placeholder players (for testing)
 *   --production   PRODUCTION MODE: Teams only, empty rosters (for launch)
 *   --clear        Clear existing Big4 teams before seeding (use with caution!)
 *
 * Examples:
 *   node scripts/seed-big4-teams.js --dry-run --dev          # Preview dev seed
 *   node scripts/seed-big4-teams.js --dev --with-logos       # Full dev seed with logos
 *   node scripts/seed-big4-teams.js --production             # Production launch seed
 *   node scripts/seed-big4-teams.js --clear --production     # Clear and reseed for launch
 */

const admin = require('firebase-admin');
const https = require('https');
const http = require('http');
const path = require('path');

// Initialize Firebase Admin with service account
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'matchscheduler-dev.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Big4 Teams Data (from thebig4.se/api/teams)
const BIG4_TEAMS = [
    { id: 6, team: "Polonez", captain: "Macler", players: ["Macler", "Thunder", "Tom", "Plate", "Er", "Iron", "Emaks"] },
    { id: 7, team: "The Axemen", captain: "TheChosenOne", players: ["TheChosenOne", "TiMMi", "Baresi", "PreMorteM", "Macisum", "tr0ll"] },
    { id: 8, team: "Boomstickers", captain: "Ake Vader", players: ["Ake Vader", "Kylarn", "Kreator", "Le1no", "Bill"] },
    { id: 9, team: "the Suicide Quad", captain: "conan", players: ["conan", "djevulsk", "elguapo", "nas", "peppe", "phrenic", "mutilator"] },
    { id: 10, team: "Fraggers United", captain: "Hooraytio", players: ["Hooraytio", "Anza", "Kippo", "Rusti", "Rghst", "Slaughter"] },
    { id: 11, team: "Black book", captain: "sae", players: ["sae", "Milton", "Wimpeeh", "Javve", "Nigve", "Creature", "Diki"] },
    { id: 12, team: "Ving", captain: "Mille", players: ["Mille", "Sailorman", "Edvin", "Mythic"] },
    { id: 13, team: "Hell Xpress", captain: "Splash", players: ["Splash", "Shaka", "Ok98", "Realpit", "Xerial"] },
    { id: 14, team: "Slackers", captain: "ParadokS", players: ["ParadokS", "Zero", "Grisling", "Razor"] },
    { id: 15, team: "night Wolves", captain: "veggie", players: ["veggie", "Coinz", "Toes", "R1zla", "Stm", "Nightfall"] },
    { id: 17, team: "Tribe of Tjernobyl", captain: "Oddjob", players: ["Oddjob", "Slime", "LethalWiz", "Fix", "Sassa"] },
    { id: 18, team: "Good Old Friends", captain: "jOn", players: ["jOn", "Ekz", "Tumult", "Bass"] },
    { id: 20, team: "Bear Beer Balalaika", captain: "gLAd", players: ["gLAd", "gor", "Zepp", "max_power", "SS", "Ass", "rusty-q"] },
    { id: 21, team: "Deathbound", captain: "fluartity", players: ["fluartity", "Pamppu", "mj23", "Doomie", "kwon", "Arnelius"] },
    { id: 22, team: "Koff", captain: "Gamer", players: ["Gamer", "Eh", "Nasander", "Pkk", "Scenic", "Wallu"] },
    { id: 23, team: "Gubbgrottan", captain: "mazer", players: ["mazer", "niw", "xero", "himmu", "gnoffa", "locktar"] },
    { id: 48, team: "Snowflakes", captain: "Link", players: ["Link", "Alice", "Zalon", "Dape", "Duce"] },
    { id: 49, team: "Death Dealers", captain: "Plast", players: ["Plast", "Hammer", "Raket", "Coj", "Riki", "Szturm"] },
    { id: 50, team: "Falling in Reverse", captain: "tiba", players: ["tiba", "mihawk", "matuzah", "hemp", "gflip", "guns"] },
    { id: 51, team: "Red Alert", captain: "sCorp", players: ["sCorp", "Doberman", "Dzha", "devil", "witka", "nlk", "Nekoranger"] },
    { id: 52, team: "oSaMs sm/osams", captain: "blaps", players: ["blaps", "apa", "whyz", "clox", "marksuzu", "steppa", "gorbatjevtarzan", "lakso"] },
    { id: 53, team: "Aim For Kill", captain: "Mushi", players: ["Mushi", "Rotker", "Gawlo", "Darff", "Spliffy"] },
    { id: 54, team: "Death Dealers Shadows", captain: "spokz", players: ["spokz", "myca", "pitbull", "frame", "flamer"] },
    { id: 55, team: "Warriors of Death", captain: "Cao", players: ["Cao", "Canino", "Sinistro", "Coveiro", "Char", "Natan"] }
];

// Captain Discord IDs - collected from the community
// Format: { captainName: { username: "discordUsername", userId: "123456789012345678" } }
const CAPTAIN_DISCORD = {
    "Macler": { username: "macler", userId: "323570475647238144" },
    "TheChosenOne": { username: "thechosenone", userId: "106846389354438656" },
    "Ake Vader": { username: "ake vader", userId: "166872187788066816" },
    "conan": { username: "conan", userId: "536953724665462795" },
    "Hooraytio": { username: "hooraytio", userId: "255234034609815554" },
    "sae": { username: "sae", userId: "508739823557804052" },
    "Mille": { username: "mille", userId: "801726266431635466" },
    "Splash": { username: "splash", userId: "196229216373571593" },
    "ParadokS": { username: "paradoks", userId: "140268554816716800" },
    "veggie": { username: "veggie", userId: "1127113677749887057" },
    "Oddjob": { username: "oddjob", userId: "835415147040079913" },
    "jOn": { username: "jon", userId: "808346233256017973" },
    "gLAd": { username: "glad", userId: "311446450871599104" },
    "fluartity": { username: "fluarity", userId: "239390377583312898" },
    "Gamer": { username: "gamer", userId: "211433738846863360" },
    "mazer": { username: "mazer", userId: "131498556870754304" },
    "Link": { username: "link", userId: "522396945612931106" },
    "Plast": { username: "plast", userId: "404952198934560769" },
    "tiba": { username: "tiba", userId: "149722360688279554" },
    // Missing Discord IDs - add when available:
    // "sCorp": { username: "scorp", userId: "" },
    // "blaps": { username: "blaps", userId: "" },
    "Mushi": { username: "mushi", userId: "86086427581878272" },
    "spokz": { username: "spokz", userId: "622520960930807878" },
    // "Cao": { username: "cao", userId: "" },
};

// Generate a team tag from team name
// Uses real QW in-game tags (same as hub.quakeworld.nu) for established teams
function generateTeamTag(teamName) {
    const specialTags = {
        'Polonez': 'pol',
        'The Axemen': 'oeks',
        'Boomstickers': 'boom',
        'the Suicide Quad': 'tSQ',
        'Fraggers United': '-fu-',
        'Black book': 'Book',
        'Ving': 'ving',
        'Hell Xpress': '[hx]',
        'Slackers': ']SR[',
        'night Wolves': 'nW',
        'Tribe of Tjernobyl': 'tot',
        'Good Old Friends': 'GoF!',
        'Bear Beer Balalaika': '3b',
        'Deathbound': 'db',
        'Koff': 'koff',
        'Gubbgrottan': 'gg',
        'Snowflakes': 'snow',
        'Death Dealers': 'd2',
        'Falling in Reverse': 'FIR',
        'Red Alert': 'RA',
        'oSaMs sm/osams': 'osam',
        'Aim For Kill': 'afk',
        'Death Dealers Shadows': 'd2,f',
        'Warriors of Death': 'wod'
    };

    return specialTags[teamName] || teamName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Generate initials from player name
function generateInitials(playerName) {
    const clean = playerName.replace(/[^a-zA-Z0-9]/g, '');
    return clean.substring(0, 3).toUpperCase() || 'PLR';
}

// Generate a unique 6-character join code
function generateJoinCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Convert team name to logo filename
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
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

// Upload logo to Firebase Storage and return URLs
async function uploadLogo(teamId, teamName, imageBuffer) {
    const timestamp = Date.now();
    const basePath = `team-logos/${teamId}`;
    const originalPath = `${basePath}/original_${timestamp}.png`;
    const file = bucket.file(originalPath);

    await file.save(imageBuffer, {
        metadata: {
            contentType: 'image/png',
            metadata: {
                teamId,
                teamName,
                uploadedAt: new Date().toISOString(),
                source: 'big4-seed'
            }
        }
    });

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${originalPath}`;

    return {
        original: publicUrl,
        large: publicUrl,
        medium: publicUrl,
        small: publicUrl
    };
}

// Check if join code is unique
async function isJoinCodeUnique(code) {
    const existing = await db.collection('teams').where('joinCode', '==', code).get();
    return existing.empty;
}

// Generate unique join code
async function generateUniqueJoinCode() {
    let code;
    let attempts = 0;

    do {
        code = generateJoinCode();
        attempts++;
        if (attempts > 20) {
            throw new Error('Failed to generate unique join code after 20 attempts');
        }
    } while (!(await isJoinCodeUnique(code)));

    return code;
}

// Clear existing Big4 seeded teams
async function clearBig4Teams(dryRun = false) {
    console.log('\n🗑️  Clearing existing Big4 teams...');

    const big4Teams = await db.collection('teams')
        .where('source', '==', 'big4-seed')
        .get();

    if (big4Teams.empty) {
        console.log('   No Big4 teams found to clear.');
        return 0;
    }

    console.log(`   Found ${big4Teams.size} Big4 teams to delete.`);

    if (dryRun) {
        big4Teams.docs.forEach(doc => {
            const data = doc.data();
            console.log(`   Would delete: ${data.teamName} (${doc.id})`);
        });
        return big4Teams.size;
    }

    // Delete in batches
    const batch = db.batch();
    big4Teams.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`   ✅ Deleted ${big4Teams.size} teams.`);
    return big4Teams.size;
}

// Helper to generate DiceBear avatar URL (deterministic based on seed)
function getAvatarUrl(seed) {
    return `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(seed)}&size=128`;
}

// Build placeholder roster for dev mode
function buildDevRoster(players, captainName) {
    const now = new Date();
    return players.map((playerName, index) => ({
        // Use deterministic fake user IDs for dev
        userId: `dev-big4-${playerName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        displayName: playerName,
        initials: generateInitials(playerName),
        photoURL: getAvatarUrl(playerName.toLowerCase().replace(/\s+/g, '-')),
        joinedAt: now,
        role: playerName === captainName ? 'leader' : 'member'
    }));
}

// Main seeding function
async function seedBig4Teams(options = {}) {
    const { dryRun = false, withLogos = false, devMode = false, clear = false } = options;

    console.log('🏆 Big4 Tournament Team Seeder');
    console.log('================================');
    console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
    console.log(`Seed Type: ${devMode ? 'DEV (with placeholder rosters)' : 'PRODUCTION (empty rosters)'}`);
    console.log(`Logos: ${withLogos ? 'Will download and upload' : 'Skipped'}`);
    console.log(`Clear first: ${clear ? 'Yes' : 'No'}`);
    console.log(`Teams to seed: ${BIG4_TEAMS.length}`);
    console.log('');

    // Clear existing teams if requested
    if (clear) {
        await clearBig4Teams(dryRun);
    }

    const results = {
        created: [],
        skipped: [],
        failed: []
    };

    for (const big4Team of BIG4_TEAMS) {
        const teamTag = generateTeamTag(big4Team.team);
        console.log(`\n📋 Processing: ${big4Team.team} [${teamTag}]`);

        try {
            // Check if team already exists by name
            const existing = await db.collection('teams')
                .where('teamName', '==', big4Team.team)
                .get();

            if (!existing.empty) {
                console.log(`   ⏭️  Skipped: Team "${big4Team.team}" already exists`);
                results.skipped.push({ team: big4Team.team, reason: 'already exists' });
                continue;
            }

            // Generate unique join code
            const joinCode = await generateUniqueJoinCode();
            console.log(`   🔑 Join code: ${joinCode}`);

            // Pre-generate team ID for logo upload
            const teamRef = db.collection('teams').doc();
            const teamId = teamRef.id;

            // Handle logo if requested
            let activeLogo = null;
            if (withLogos) {
                const logoFilename = getLogoFilename(big4Team.team);
                const logoUrl = `https://www.thebig4.se/teams/${logoFilename}`;
                console.log(`   🖼️  Fetching logo: ${logoUrl}`);

                try {
                    const imageBuffer = await downloadImage(logoUrl);
                    console.log(`   📦 Downloaded: ${imageBuffer.length} bytes`);

                    if (!dryRun) {
                        const urls = await uploadLogo(teamId, big4Team.team, imageBuffer);
                        activeLogo = {
                            uploadedAt: new Date(),
                            urls
                        };
                        console.log(`   ✅ Logo uploaded`);
                    }
                } catch (logoErr) {
                    console.log(`   ⚠️  Logo failed: ${logoErr.message}`);
                }
            }

            // Build team document
            const now = new Date();
            const captainDiscordInfo = CAPTAIN_DISCORD[big4Team.captain];

            // Build roster based on mode
            let playerRoster = [];
            let leaderId = 'UNCLAIMED';
            let leaderDiscord = null;

            if (devMode) {
                // DEV MODE: Create placeholder roster with fake user IDs
                playerRoster = buildDevRoster(big4Team.players, big4Team.captain);
                leaderId = `dev-big4-${big4Team.captain.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

                if (captainDiscordInfo) {
                    leaderDiscord = {
                        username: captainDiscordInfo.username,
                        userId: captainDiscordInfo.userId
                    };
                }
                console.log(`   👥 Dev roster: ${playerRoster.length} placeholder players`);
            } else {
                // PRODUCTION MODE: Empty roster, unclaimed
                playerRoster = [];
                leaderId = 'UNCLAIMED';
            }

            const teamData = {
                teamName: big4Team.team,
                teamTag: teamTag,
                leaderId: leaderId,
                divisions: ['1'],
                maxPlayers: 10,
                joinCode: joinCode,
                status: 'active',
                playerRoster: playerRoster,
                lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: 'big4-seed',
                big4Data: {
                    big4Id: big4Team.id,
                    captain: big4Team.captain,
                    originalRoster: big4Team.players,
                    seededAt: now.toISOString()
                }
            };

            // Add captain Discord info (reference data from Big4)
            if (captainDiscordInfo) {
                teamData.captainDiscord = {
                    username: captainDiscordInfo.username,
                    userId: captainDiscordInfo.userId
                };
                console.log(`   📱 Captain Discord: @${captainDiscordInfo.username}`);
            }

            // Add leaderDiscord (live contact data) if in dev mode with Discord info
            if (leaderDiscord) {
                teamData.leaderDiscord = leaderDiscord;
            }

            if (activeLogo) {
                teamData.activeLogo = activeLogo;
            }

            if (dryRun) {
                console.log(`   📝 Would create team with ID: ${teamId}`);
                console.log(`      Leader: ${leaderId}`);
                console.log(`      Roster size: ${playerRoster.length}`);
            } else {
                await teamRef.set(teamData);
                console.log(`   ✅ Created: ${teamId}`);

                // Log event
                const eventId = `${now.toISOString().slice(0, 10).replace(/-/g, '')}-${
                    now.toTimeString().slice(0, 5).replace(':', '')
                }-${big4Team.team.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}-seeded_${
                    Math.random().toString(36).substr(2, 4).toUpperCase()
                }`;

                await db.collection('eventLog').doc(eventId).set({
                    eventId,
                    teamId: teamId,
                    teamName: big4Team.team,
                    type: 'TEAM_SEEDED',
                    category: 'TEAM_LIFECYCLE',
                    timestamp: now,
                    details: {
                        source: 'big4-seed',
                        big4Id: big4Team.id,
                        captain: big4Team.captain,
                        joinCode: joinCode,
                        mode: devMode ? 'dev' : 'production'
                    }
                });
            }

            results.created.push({
                team: big4Team.team,
                tag: teamTag,
                joinCode: joinCode,
                captain: big4Team.captain,
                hasDiscord: !!captainDiscordInfo
            });

        } catch (err) {
            console.log(`   ❌ Failed: ${err.message}`);
            results.failed.push({ team: big4Team.team, error: err.message });
        }
    }

    // Summary
    console.log('\n================================');
    console.log('📊 SUMMARY');
    console.log('================================');
    console.log(`✅ Created: ${results.created.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);

    // Count Discord coverage
    const withDiscord = results.created.filter(t => t.hasDiscord).length;
    console.log(`📱 Discord coverage: ${withDiscord}/${results.created.length} captains`);

    if (results.created.length > 0) {
        console.log('\n📋 Join Codes for Created Teams:');
        console.log('--------------------------------');
        results.created.forEach(t => {
            const discordIcon = t.hasDiscord ? '📱' : '  ';
            console.log(`${discordIcon} ${t.team.padEnd(25)} [${t.tag.padEnd(4)}] → ${t.joinCode}  (Captain: ${t.captain})`);
        });
    }

    if (results.failed.length > 0) {
        console.log('\n❌ Failed Teams:');
        results.failed.forEach(t => {
            console.log(`  ${t.team}: ${t.error}`);
        });
    }

    // Show missing Discord IDs
    const missingDiscord = BIG4_TEAMS.filter(t => !CAPTAIN_DISCORD[t.captain]);
    if (missingDiscord.length > 0) {
        console.log('\n⚠️  Missing Discord IDs for captains:');
        missingDiscord.forEach(t => {
            console.log(`  - ${t.captain} (${t.team})`);
        });
    }

    return results;
}

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const withLogos = args.includes('--with-logos');
const devMode = args.includes('--dev');
const productionMode = args.includes('--production');
const clear = args.includes('--clear');

// Validate mode
if (devMode && productionMode) {
    console.error('❌ Cannot use both --dev and --production flags');
    process.exit(1);
}

if (!devMode && !productionMode) {
    console.error('❌ Please specify --dev or --production mode');
    console.error('   --dev: Include placeholder rosters for testing');
    console.error('   --production: Empty rosters, teams unclaimed');
    process.exit(1);
}

// Run
seedBig4Teams({ dryRun, withLogos, devMode, clear })
    .then(() => {
        console.log('\n✅ Seeding complete!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Seeding failed:', err);
        process.exit(1);
    });
