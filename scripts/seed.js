#!/usr/bin/env node
/**
 * Unified Seed Script for MatchScheduler
 *
 * Usage:
 *   npm run seed              # Local emulator, full (with logos from scripts/seed-data/logos/)
 *   npm run seed:quick        # Local emulator, skip logo processing
 *   npm run seed:prod         # Production, full (with logos)
 *   npm run seed:prod:quick   # Production, skip logo processing
 *
 * What it does:
 *   1. Connects to emulator or production (based on --production flag)
 *   2. Clears ALL data (Firestore collections + Auth users)
 *   3. Seeds teams, users, availability, logos
 *
 * Flags:
 *   --production   Connect to production (requires service-account.json)
 *   --quick        Skip logo processing (much faster)
 *   --leaders-only Seed only team leaders (no rosters, no availability)
 *   [host]         Custom emulator host (default: 127.0.0.1), ignored with --production
 */

const { QW_TEAMS, CAPTAIN_DISCORD } = require('./seed-data/teams');
const CONFIG = require('./seed-data/config');

// ============================================
// Parse flags
// ============================================
const args = process.argv.slice(2);
const IS_PRODUCTION = args.includes('--production');
const SKIP_LOGOS = args.includes('--quick');
const LEADERS_ONLY = args.includes('--leaders-only');
const EMULATOR_HOST = args.find(a => !a.startsWith('--')) || '127.0.0.1';

// ============================================
// Firebase initialization
// ============================================
let db, auth, bucket, Timestamp, sharp;

function initFirebase() {
    if (IS_PRODUCTION) {
        const serviceAccount = require('../service-account.json');
        const admin = require('firebase-admin');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: CONFIG.STORAGE_BUCKET,
        });
        db = admin.firestore();
        auth = admin.auth();
        bucket = admin.storage().bucket();
        Timestamp = admin.firestore.Timestamp;
        console.log(`🔗 Connected to PRODUCTION`);
        console.log(`   Project: ${serviceAccount.project_id}\n`);
    } else {
        process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_HOST}:${CONFIG.EMULATOR_PORTS.firestore}`;
        process.env.FIREBASE_AUTH_EMULATOR_HOST = `${EMULATOR_HOST}:${CONFIG.EMULATOR_PORTS.auth}`;
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${EMULATOR_HOST}:${CONFIG.EMULATOR_PORTS.storage}`;

        const { initializeApp } = require('firebase-admin/app');
        const { getFirestore, Timestamp: FsTimestamp } = require('firebase-admin/firestore');
        const { getAuth } = require('firebase-admin/auth');
        const { getStorage } = require('firebase-admin/storage');

        const app = initializeApp({
            projectId: CONFIG.PROJECT_ID,
            storageBucket: CONFIG.STORAGE_BUCKET,
        });
        db = getFirestore(app);
        auth = getAuth(app);
        bucket = getStorage(app).bucket();
        Timestamp = FsTimestamp;

        console.log(`🔗 Connected to EMULATOR on ${EMULATOR_HOST}`);
        console.log(`   Firestore: :${CONFIG.EMULATOR_PORTS.firestore}  Auth: :${CONFIG.EMULATOR_PORTS.auth}  Storage: :${CONFIG.EMULATOR_PORTS.storage}\n`);
    }

    // Only load sharp if we need logos
    if (!SKIP_LOGOS) {
        try {
            sharp = require('sharp');
        } catch (err) {
            console.warn('⚠️  sharp not installed - skipping logo processing (run: npm install sharp)');
        }
    }
}

// ============================================
// Cleanup
// ============================================

/**
 * Delete all documents in a Firestore collection.
 * Uses batched deletes (max 500 per batch).
 */
async function clearCollection(name) {
    const snapshot = await db.collection(name).get();
    if (snapshot.empty) {
        console.log(`   ${name}: empty`);
        return 0;
    }

    // Batch delete in chunks of 500
    const chunks = [];
    for (let i = 0; i < snapshot.docs.length; i += 500) {
        chunks.push(snapshot.docs.slice(i, i + 500));
    }
    for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    console.log(`   ${name}: ${snapshot.size} deleted`);
    return snapshot.size;
}

/**
 * Delete all Firebase Auth users.
 * Uses listUsers pagination (1000 at a time).
 */
async function clearAuthUsers() {
    let totalDeleted = 0;
    let pageToken;

    do {
        const listResult = await auth.listUsers(1000, pageToken);
        if (listResult.users.length > 0) {
            const uids = listResult.users.map(u => u.uid);
            await auth.deleteUsers(uids);
            totalDeleted += uids.length;
        }
        pageToken = listResult.pageToken;
    } while (pageToken);

    console.log(`   Auth users: ${totalDeleted} deleted`);
    return totalDeleted;
}

/**
 * Clean everything before seeding.
 */
async function cleanAll() {
    console.log('🧹 Cleaning database...\n');

    for (const collection of CONFIG.COLLECTIONS) {
        await clearCollection(collection);
    }
    // Also clear any subcollections we know about
    // (templates are under users, logos under teams - deleted with parents)

    await clearAuthUsers();
    console.log('');
}

// ============================================
// Helpers
// ============================================

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
    // 1-3 uppercase letters from the name
    const clean = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
    return clean.substring(0, 3) || 'XX';
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
    const base = (teamTag || 'XXX').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(3, 'X');
    return base.slice(0, 3) + Math.random().toString(36).substring(2, 5).toUpperCase();
}

function getAvatarUrl(seed) {
    return `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(seed)}&size=128`;
}

function generateRandomAvailability(playerIndex, teamIndex) {
    const patterns = [
        // Weekday evenings - most common for EU players
        () => CONFIG.DAYS.slice(0, 5).flatMap(day =>
            ['1900', '1930', '2000', '2030', '2100'].map(t => `${day}_${t}`)
        ),
        // Weekend warrior
        () => CONFIG.DAYS.slice(5).flatMap(day =>
            CONFIG.TIME_SLOTS.map(t => `${day}_${t}`)
        ),
        // Late night
        () => CONFIG.DAYS.flatMap(day =>
            ['2100', '2130', '2200', '2230', '2300'].map(t => `${day}_${t}`)
        ),
        // Mixed flexible
        () => CONFIG.DAYS.flatMap(day =>
            CONFIG.TIME_SLOTS.filter(() => Math.random() > 0.5).map(t => `${day}_${t}`)
        ),
        // Early evening
        () => CONFIG.DAYS.flatMap(day =>
            ['1800', '1830', '1900', '1930', '2000'].map(t => `${day}_${t}`)
        ),
    ];

    const patternIndex = (playerIndex + teamIndex) % patterns.length;
    const pattern = patterns[patternIndex]();
    return pattern.filter(() => Math.random() > 0.35);
}

// ============================================
// Logo processing
// ============================================

async function loadLogoImage(url) {
    const fs = require('fs');
    const path = require('path');
    const filename = url.split('/').pop();
    const localPath = path.join(__dirname, 'seed-data', 'logos', filename);

    // Try local file first
    if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath);
    }

    // Fallback: download from remote
    console.warn(`   ⚠️  Local logo not found (${filename}), downloading...`);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // Cache locally for next time
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, buffer);
        return buffer;
    } catch (error) {
        console.error(`   ⚠️  Logo download failed: ${error.message}`);
        return null;
    }
}

async function processAndUploadLogo(teamId, imageBuffer) {
    if (!sharp) return null;

    const logoId = `logo-${Date.now()}`;
    const sizes = [
        { name: 'large', width: 400 },
        { name: 'medium', width: 150 },
        { name: 'small', width: 48 },
    ];

    const urls = {};

    for (const size of sizes) {
        try {
            const resizedBuffer = await sharp(imageBuffer)
                .resize(size.width, size.width, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .png()
                .toBuffer();

            const filePath = `team-logos/${teamId}/${logoId}/${size.name}_${logoId}.png`;
            const file = bucket.file(filePath);

            await file.save(resizedBuffer, {
                contentType: 'image/png',
                metadata: { cacheControl: 'public, max-age=31536000' },
            });

            if (IS_PRODUCTION) {
                await file.makePublic();
                urls[size.name] = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
            } else {
                const encodedPath = encodeURIComponent(filePath);
                urls[size.name] = `http://${EMULATOR_HOST}:${CONFIG.EMULATOR_PORTS.storage}/v0/b/${CONFIG.STORAGE_BUCKET}/o/${encodedPath}?alt=media`;
            }
        } catch (error) {
            console.error(`   ⚠️  Logo ${size.name} failed: ${error.message}`);
        }
    }

    return Object.keys(urls).length === 3 ? { logoId, urls } : null;
}

// ============================================
// Auth user creation (local emulator only)
// ============================================

async function createAuthUser(userId, email, displayName) {
    try {
        await auth.getUser(userId);
        return; // Already exists
    } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
    }

    // Clean up email conflicts
    try {
        const existing = await auth.getUserByEmail(email);
        if (existing.uid !== userId) {
            await auth.deleteUser(existing.uid);
        }
    } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
    }

    await auth.createUser({
        uid: userId,
        email,
        password: CONFIG.DEV_USER.password,
        displayName,
    });
}

// ============================================
// Main seed logic
// ============================================

async function seed() {
    const env = IS_PRODUCTION ? 'PRODUCTION' : 'LOCAL';
    const logoMode = SKIP_LOGOS ? 'skip logos' : 'with logos';
    const rosterMode = LEADERS_ONLY ? ', leaders only' : '';

    console.log('='.repeat(55));
    console.log(`🎮 MatchScheduler Seed — ${env} (${logoMode}${rosterMode})`);
    console.log('='.repeat(55) + '\n');

    if (IS_PRODUCTION) {
        console.log('⚠️  This will CLEAR and reseed PRODUCTION data!');
        console.log('    Starting in 3 seconds... (Ctrl+C to cancel)\n');
        await new Promise(r => setTimeout(r, 3000));
    }

    // 1. Clean everything
    await cleanAll();

    // 2. Generate week IDs
    const currentWeek = getCurrentWeekNumber();
    const weekIds = [0, 1, 2, 3].map(i => getWeekId(currentWeek + i));
    console.log(`📅 Weeks: ${weekIds.join(', ')}\n`);

    // 3. Seed each team
    let totalPlayers = 0;
    let logosProcessed = 0;

    for (let teamIndex = 0; teamIndex < QW_TEAMS.length; teamIndex++) {
        const team = QW_TEAMS[teamIndex];
        const batch = db.batch();

        // ── Logo ──
        let activeLogo = null;
        if (!SKIP_LOGOS && team.logoUrl && sharp) {
            const imageBuffer = await loadLogoImage(team.logoUrl);
            if (imageBuffer) {
                activeLogo = await processAndUploadLogo(team.id, imageBuffer);
                if (activeLogo) logosProcessed++;
            }
        }

        // ── Roster + Users ──
        const roster = [];
        let leaderId = null;

        const playersToSeed = LEADERS_ONLY
            ? team.players.filter(p => p.role === 'leader')
            : team.players;

        for (const player of playersToSeed) {
            let userId, email, displayName;

            if (player.isDevUser && !IS_PRODUCTION) {
                // Local: use fixed dev user UID for auto-sign-in
                userId = CONFIG.DEV_USER.uid;
                email = CONFIG.DEV_USER.email;
                displayName = player.name;
            } else {
                userId = generateUserId(team.teamTag, player.name);
                email = generateEmail(player.name);
                displayName = player.name;
            }

            const initials = generateInitials(player.name);
            const photoURL = getAvatarUrl(displayName.toLowerCase().replace(/\s+/g, '-'));

            // Auth user (local emulator only)
            if (!IS_PRODUCTION) {
                await createAuthUser(userId, email, displayName);
            }

            roster.push({
                userId,
                displayName,
                initials,
                photoURL,
                joinedAt: new Date(Date.now() - Math.random() * 30 * 86400000),
                role: player.role,
            });

            if (player.role === 'leader') {
                leaderId = userId;
            }

            // ── User document ──
            // Look up Discord info for this player
            const discord = CAPTAIN_DISCORD[player.name];

            const userDoc = {
                displayName,
                initials,
                email,
                userId,
                photoURL,
                avatarSource: 'initials',
                discordTag: discord ? discord.username : null,
                discordUsername: discord ? discord.username : null,
                discordUserId: discord ? discord.discordId : null,
                teams: { [team.id]: true },
                createdAt: Timestamp.now(),
                lastUpdatedAt: Timestamp.now(),
            };

            batch.set(db.collection('users').doc(userId), userDoc);
            totalPlayers++;
        }

        // ── Team document ──
        const leaderPlayer = team.players.find(p => p.role === 'leader');
        const leaderDiscord = leaderPlayer ? CAPTAIN_DISCORD[leaderPlayer.name] : null;

        const teamDoc = {
            teamName: team.teamName,
            teamNameLower: team.teamName.toLowerCase(),
            teamTag: team.teamTag,
            leaderId,
            schedulers: [],
            divisions: team.divisions,
            maxPlayers: 10,
            joinCode: generateJoinCode(team.teamTag),
            status: 'active',
            playerRoster: roster,
            createdAt: Timestamp.now(),
            lastActivityAt: Timestamp.now(),
        };

        if (activeLogo) {
            teamDoc.activeLogo = activeLogo;
        }

        // Leader Discord info on team doc (for contact feature)
        if (leaderDiscord) {
            teamDoc.leaderDiscord = {
                username: leaderDiscord.username,
                userId: leaderDiscord.discordId,
            };
        }

        batch.set(db.collection('teams').doc(team.id), teamDoc);

        // ── Availability (skip in leaders-only mode) ──
        if (LEADERS_ONLY) {
            // No availability data — leaders will fill it in after inviting players
        }
        for (const weekId of LEADERS_ONLY ? [] : weekIds) {
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
                lastUpdated: Timestamp.now(),
            });
        }

        await batch.commit();

        // Status line
        const logoIcon = activeLogo ? '🖼️' : '  ';
        const discordIcon = leaderDiscord ? '📱' : '  ';
        const tag = team.teamTag ? `[${team.teamTag}]` : '';
        console.log(`  ${logoIcon}${discordIcon} ✓ ${team.teamName} ${tag} — ${roster.length} players (${team.divisions.join('/')})`);
    }

    // ============================================
    // Summary
    // ============================================
    const d1 = QW_TEAMS.filter(t => t.divisions.includes('D1')).length;
    const d2 = QW_TEAMS.filter(t => t.divisions.includes('D2')).length;
    const d3 = QW_TEAMS.filter(t => t.divisions.includes('D3')).length;
    const withDiscord = QW_TEAMS.filter(t => {
        const leader = t.players.find(p => p.role === 'leader');
        return leader && CAPTAIN_DISCORD[leader.name];
    }).length;

    console.log('\n' + '='.repeat(55));
    console.log('✅ Seed complete!');
    console.log('='.repeat(55));
    console.log(`\n📊 Summary:`);
    console.log(`   ${QW_TEAMS.length} teams (D1: ${d1}, D2: ${d2}, D3: ${d3})`);
    console.log(`   ${totalPlayers} players`);
    console.log(`   ${withDiscord} leaders with Discord IDs`);
    console.log(`   ${logosProcessed} logos processed`);
    console.log(`   ${LEADERS_ONLY ? 0 : weekIds.length} weeks of availability${LEADERS_ONLY ? ' (leaders-only mode)' : ''}`);

    if (!IS_PRODUCTION) {
        console.log(`\n🔑 Dev login: ${CONFIG.DEV_USER.email} / ${CONFIG.DEV_USER.password}`);
        console.log(`   Team: Slackers [${QW_TEAMS.find(t => t.id === 'team-sr-001')?.teamTag}]`);
    }

    console.log(`\n🔄 Refresh browser to see changes!`);
}

// ============================================
// Run
// ============================================
initFirebase();
seed()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('\n❌ Seed failed:', err);
        process.exit(1);
    });
