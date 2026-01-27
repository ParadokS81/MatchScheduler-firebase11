const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * Get Discord credentials from environment variables or .runtimeconfig.json
 * Environment variables take precedence for v2 functions
 */
function getDiscordCredentials() {
    // Try environment variables first (v2 functions)
    let clientId = process.env.DISCORD_CLIENT_ID;
    let clientSecret = process.env.DISCORD_CLIENT_SECRET;

    // Fallback to .runtimeconfig.json format (for local emulator with legacy config)
    if (!clientId || !clientSecret) {
        try {
            const functions = require('firebase-functions');
            clientId = clientId || functions.config()?.discord?.client_id;
            clientSecret = clientSecret || functions.config()?.discord?.client_secret;
        } catch (e) {
            // functions.config() not available in v2, ignore
        }
    }

    return { clientId, clientSecret };
}

const db = getFirestore();

/**
 * Helper: Generate initials from username
 * Takes first 2-3 characters and uppercases
 */
function generateInitials(username) {
    // Remove special characters, take first word if multiple
    const clean = username.replace(/[^a-zA-Z0-9]/g, '');
    // Take first 3 characters, uppercase
    return clean.substring(0, 3).toUpperCase() || 'USR';
}

/**
 * Helper: Construct Discord avatar URL
 */
function getDiscordAvatarUrl(userId, avatarHash) {
    if (avatarHash) {
        // Animated avatars start with a_
        const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=128`;
    }
    // Default Discord avatar based on user ID
    const defaultIndex = (BigInt(userId) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}

/**
 * Cloud Function: discordOAuthExchange
 * Exchanges Discord OAuth code for user data and creates/returns Firebase custom token
 */
exports.discordOAuthExchange = onCall({
    // Declare secrets this function needs access to
    secrets: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET']
}, async (request) => {
    const { code, redirectUri, forceNew = false, linkOnly = false } = request.data;
    const callerUid = request.auth?.uid;  // For linkOnly operations

    // Validate inputs
    if (!code || typeof code !== 'string') {
        console.error('Invalid code provided');
        return { success: false, error: 'Invalid authorization code' };
    }

    if (!redirectUri || typeof redirectUri !== 'string') {
        console.error('Invalid redirectUri provided');
        return { success: false, error: 'Invalid redirect URI' };
    }

    // Get Discord credentials
    const { clientId, clientSecret } = getDiscordCredentials();

    if (!clientId || !clientSecret) {
        console.error('Discord credentials not configured');
        return { success: false, error: 'Discord authentication not configured' };
    }

    try {
        // 1. Exchange code for access token
        console.log('Exchanging code for Discord access token...');

        const tokenResponse = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri
            })
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Discord token exchange failed:', tokenResponse.status, errorText);
            return { success: false, error: 'Invalid or expired authorization code' };
        }

        const tokenData = await tokenResponse.json();
        console.log('Got Discord access token');

        // 2. Fetch Discord user profile
        console.log('Fetching Discord user profile...');
        const userResponse = await fetch(`${DISCORD_API_BASE}/users/@me`, {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('Discord user fetch failed:', errorText);
            return { success: false, error: 'Failed to get Discord profile' };
        }

        const discordUser = await userResponse.json();
        console.log(`Got Discord user: ${discordUser.username} (${discordUser.id}), email: ${discordUser.email || 'not provided'}`);

        // 3. Handle linkOnly operation (Google user linking their Discord)
        if (linkOnly) {
            if (!callerUid) {
                console.error('linkOnly requested but no authenticated user');
                return { success: false, error: 'Must be authenticated to link Discord account' };
            }

            console.log(`Linking Discord to existing user: ${callerUid}`);
            const usersRef = db.collection('users');

            // Check if this Discord ID is already linked to another account
            const existingDiscordQuery = await usersRef
                .where('discordUserId', '==', discordUser.id)
                .limit(1)
                .get();

            if (!existingDiscordQuery.empty && existingDiscordQuery.docs[0].id !== callerUid) {
                console.error('Discord account already linked to another user');
                return { success: false, error: 'This Discord account is already linked to another user' };
            }

            // Update the user's document with Discord data
            await usersRef.doc(callerUid).update({
                discordUsername: discordUser.username,
                discordUserId: discordUser.id,
                discordAvatarHash: discordUser.avatar,
                photoURL: getDiscordAvatarUrl(discordUser.id, discordUser.avatar),
                discordLinkedAt: FieldValue.serverTimestamp(),
                lastUpdatedAt: FieldValue.serverTimestamp()
            });

            // Also update any teams where this user is leader
            const teamsRef = db.collection('teams');
            const leaderTeamsQuery = await teamsRef
                .where('leaderId', '==', callerUid)
                .get();

            if (!leaderTeamsQuery.empty) {
                const batch = db.batch();
                leaderTeamsQuery.docs.forEach(teamDoc => {
                    batch.update(teamDoc.ref, {
                        leaderDiscord: {
                            username: discordUser.username,
                            userId: discordUser.id
                        }
                    });
                });
                await batch.commit();
                console.log(`Updated leaderDiscord on ${leaderTeamsQuery.size} team(s)`);
            }

            console.log('Discord account linked successfully');
            return {
                success: true,
                user: {
                    discordUsername: discordUser.username,
                    discordUserId: discordUser.id,
                    discordAvatarHash: discordUser.avatar,
                    photoURL: getDiscordAvatarUrl(discordUser.id, discordUser.avatar)
                }
            };
        }

        // 4. Check if user exists with this Discord ID (sign-in flow)
        const usersRef = db.collection('users');
        const existingUserQuery = await usersRef
            .where('discordUserId', '==', discordUser.id)
            .limit(1)
            .get();

        let uid;
        let isNewUser = false;

        if (!existingUserQuery.empty) {
            // Existing user - get their Firebase UID
            uid = existingUserQuery.docs[0].id;
            console.log(`Found existing user: ${uid}`);

            // Update Discord data and avatar (in case username/avatar changed)
            await usersRef.doc(uid).update({
                discordUsername: discordUser.username,
                discordAvatarHash: discordUser.avatar,
                photoURL: getDiscordAvatarUrl(discordUser.id, discordUser.avatar),
                lastUpdatedAt: FieldValue.serverTimestamp(),
                lastLogin: FieldValue.serverTimestamp()
            });
        } else {
            // 5. Check for email match (account unification) - unless forceNew is set
            if (!forceNew && discordUser.email) {
                const emailMatchQuery = await usersRef
                    .where('email', '==', discordUser.email)
                    .limit(1)
                    .get();

                if (!emailMatchQuery.empty) {
                    // Found existing account with same email - prompt user to link
                    console.log(`Found existing account with email: ${discordUser.email}`);
                    return {
                        success: false,
                        requiresLinking: true,
                        existingEmail: discordUser.email,
                        discordUser: {
                            username: discordUser.username,
                            id: discordUser.id,
                            avatar: discordUser.avatar
                        }
                    };
                }
            }

            // 6. New user - create Firebase Auth user
            console.log('Creating new Firebase Auth user...');
            const userRecord = await getAuth().createUser({
                displayName: discordUser.username
                // No email - Discord users may not share email with 'identify' scope
            });

            uid = userRecord.uid;
            isNewUser = true;
            console.log(`Created new user: ${uid}`);

            // Create user document
            await usersRef.doc(uid).set({
                // Display info (can be edited later)
                displayName: discordUser.username,
                initials: generateInitials(discordUser.username),
                email: discordUser.email || null,
                photoURL: getDiscordAvatarUrl(discordUser.id, discordUser.avatar),

                // Discord data
                discordUsername: discordUser.username,
                discordUserId: discordUser.id,
                discordAvatarHash: discordUser.avatar,
                discordLinkedAt: FieldValue.serverTimestamp(),

                // Auth tracking
                authProvider: 'discord',

                // Initialize empty
                teams: {},
                favoriteTeams: [],

                // Timestamps
                createdAt: FieldValue.serverTimestamp(),
                lastUpdatedAt: FieldValue.serverTimestamp(),
                lastLogin: FieldValue.serverTimestamp()
            });

            // Log profile creation event
            await _logProfileCreationEvent(uid, discordUser.username, 'discord');
        }

        // 4. Generate Firebase custom token
        console.log('Generating custom token...');
        const customToken = await getAuth().createCustomToken(uid);

        return {
            success: true,
            customToken: customToken,
            isNewUser: isNewUser,
            user: {
                discordUsername: discordUser.username,
                discordUserId: discordUser.id,
                discordAvatarHash: discordUser.avatar
            }
        };

    } catch (error) {
        console.error('Discord OAuth error:', error);
        return { success: false, error: 'Authentication failed' };
    }
});

/**
 * Helper: Log profile creation event to audit trail
 */
async function _logProfileCreationEvent(uid, displayName, authMethod) {
    try {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toISOString().slice(11, 16).replace(':', '');
        const randomSuffix = Math.random().toString(36).substring(2, 6);

        const eventId = `${dateStr}-${timeStr}-discord-signup_${randomSuffix}`;

        await db.collection('eventLog').doc(eventId).set({
            type: 'discord-signup',
            userId: uid,
            displayName: displayName,
            authMethod: authMethod,
            timestamp: FieldValue.serverTimestamp()
        });

        console.log(`Logged event: ${eventId}`);
    } catch (error) {
        // Don't fail the main operation if logging fails
        console.error('Failed to log event:', error);
    }
}
