const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const db = getFirestore();

/**
 * Auto-generate 3-letter initials from a display name.
 * - Name <= 3 chars: full name uppercased (e.g., "bps" -> "BPS")
 * - Name > 3 chars: first 3 alphanumeric chars uppercased (e.g., "razor" -> "RAZ")
 * - Fallback: "USR" if name is empty/null
 */
function generateInitials(name) {
    if (!name || typeof name !== 'string') return 'USR';
    const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return clean.length === 0 ? 'USR' : clean.substring(0, 3);
}

/**
 * Cloud Function: googleSignIn
 * Called after Google OAuth sign-in to ensure user document exists.
 * Creates user doc with auto-generated initials for new users, updates lastLogin for existing.
 */
exports.googleSignIn = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { uid } = context.auth;

    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            // Existing user - update lastLogin and return profile
            await userRef.update({ lastLogin: FieldValue.serverTimestamp() });
            console.log(`✅ Existing user signed in: ${uid}`);
            return {
                success: true,
                isNewUser: false,
                profile: userDoc.data()
            };
        }

        // New user - create doc with auto-generated initials from Google display name
        const userRecord = await getAuth().getUser(uid);
        const newProfile = {
            email: userRecord.email || null,
            displayName: userRecord.displayName || null,
            initials: generateInitials(userRecord.displayName),
            photoURL: userRecord.photoURL || null,
            authProvider: 'google',
            teams: {},
            favoriteTeams: [],
            createdAt: FieldValue.serverTimestamp(),
            lastLogin: FieldValue.serverTimestamp()
        };

        await userRef.set(newProfile);
        console.log(`✅ New Google user created: ${uid} (${userRecord.email})`);

        // Log user creation event
        await _logUserCreationEvent(uid, userRecord.email, 'google');

        return {
            success: true,
            isNewUser: true,
            profile: newProfile
        };

    } catch (error) {
        console.error('❌ Error in googleSignIn:', error);
        throw new functions.https.HttpsError('internal', 'Failed to process sign-in');
    }
});

/**
 * Cloud Function: createProfile
 * @deprecated Use updateProfile instead. This function now redirects to updateProfile logic.
 * Kept for backwards compatibility during transition.
 */
exports.createProfile = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to create profile');
    }

    const { uid } = context.auth;

    // Get user info from Auth to get email
    const userRecord = await getAuth().getUser(uid);
    const email = userRecord.email;
    const { displayName, initials, discordUsername, discordUserId, authProvider } = data;
    
    // Validate input
    if (!displayName || !initials) {
        throw new functions.https.HttpsError('invalid-argument', 'Display name and initials are required');
    }

    // Validate display name
    if (displayName.length < 2 || displayName.length > 30) {
        throw new functions.https.HttpsError('invalid-argument', 'Display name must be 2-30 characters');
    }

    // Validate initials
    if (!/^[A-Z]{1,3}$/.test(initials)) {
        throw new functions.https.HttpsError('invalid-argument', 'Initials must be 1-3 uppercase letters');
    }

    // Validate Discord data if provided
    if (discordUsername || discordUserId) {
        if (!discordUsername || !discordUserId) {
            throw new functions.https.HttpsError('invalid-argument', 'Both Discord username and user ID must be provided together');
        }

        if (discordUsername.length > 50) {
            throw new functions.https.HttpsError('invalid-argument', 'Discord username is too long');
        }

        if (!/^[0-9]+$/.test(discordUserId) || discordUserId.length < 17 || discordUserId.length > 19) {
            throw new functions.https.HttpsError('invalid-argument', 'Discord user ID must be 17-19 digits');
        }
    }
    
    try {
        // Create user profile document
        const userProfile = {
            displayName: displayName.trim(),
            initials: initials.toUpperCase(),
            email: email,
            photoURL: userRecord.photoURL || null,
            teams: {}, // Empty teams map initially
            createdAt: FieldValue.serverTimestamp(),
            lastLogin: FieldValue.serverTimestamp()
        };
        
        // Add Discord data if provided
        if (discordUsername && discordUserId) {
            userProfile.discordUsername = discordUsername.trim();
            userProfile.discordUserId = discordUserId.trim();
        }

        // Track auth provider (discord or google)
        if (authProvider && (authProvider === 'discord' || authProvider === 'google')) {
            userProfile.authProvider = authProvider;
        }
        
        // Save to Firestore
        await db.collection('users').doc(uid).set(userProfile);
        
        // Log profile creation event
        await _logProfileCreationEvent(uid, displayName, initials, authProvider || 'google');
        
        console.log(`✅ Profile created for user: ${email}`);
        
        return {
            success: true,
            profile: {
                displayName: userProfile.displayName,
                initials: userProfile.initials,
                email: userProfile.email,
                photoURL: userProfile.photoURL
            }
        };
        
    } catch (error) {
        console.error('❌ Error creating profile:', error);
        
        // Handle specific errors
        if (error.code === 'auth/user-not-found') {
            throw new functions.https.HttpsError('not-found', 'User not found');
        }

        throw new functions.https.HttpsError('internal', 'Failed to create profile');
    }
});

/**
 * Cloud Function: updateProfile
 * Updates user profile information
 */
exports.updateProfile = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to update profile');
    }

    const { uid } = context.auth;
    const { displayName, initials, discordUsername, discordUserId, avatarSource, photoURL, timezone, hiddenTimeSlots, extraTimeSlots } = data;

    // Validate input - at least one field must be provided
    const hasAnyField = displayName || initials ||
        discordUsername !== undefined || discordUserId !== undefined ||
        avatarSource !== undefined || photoURL !== undefined ||
        timezone !== undefined || hiddenTimeSlots !== undefined ||
        extraTimeSlots !== undefined;

    if (!hasAnyField) {
        throw new functions.https.HttpsError('invalid-argument', 'At least one field must be provided');
    }

    const updates = {};
    
    // Validate and add display name
    if (displayName) {
        if (displayName.length < 2 || displayName.length > 30) {
            throw new functions.https.HttpsError('invalid-argument', 'Display name must be 2-30 characters');
        }
        updates.displayName = displayName.trim();
    }

    // Validate and add initials
    if (initials) {
        if (!/^[A-Z]{1,3}$/.test(initials)) {
            throw new functions.https.HttpsError('invalid-argument', 'Initials must be 1-3 uppercase letters');
        }
        updates.initials = initials.toUpperCase();
    }

    // Handle Discord data
    if (discordUsername !== undefined || discordUserId !== undefined) {
        // If either is being updated, validate both
        if (discordUsername === '' && discordUserId === '') {
            // Clear Discord data (including avatar hash and linked timestamp)
            updates.discordUsername = FieldValue.delete();
            updates.discordUserId = FieldValue.delete();
            updates.discordAvatarHash = FieldValue.delete();
            updates.discordLinkedAt = FieldValue.delete();
        } else if (discordUsername && discordUserId) {
            // Update Discord data
            if (discordUsername.length > 50) {
                throw new functions.https.HttpsError('invalid-argument', 'Discord username is too long');
            }
            if (!/^[0-9]+$/.test(discordUserId) || discordUserId.length < 17 || discordUserId.length > 19) {
                throw new functions.https.HttpsError('invalid-argument', 'Discord user ID must be 17-19 digits');
            }
            updates.discordUsername = discordUsername.trim();
            updates.discordUserId = discordUserId.trim();
        } else {
            throw new functions.https.HttpsError('invalid-argument', 'Both Discord username and user ID must be provided together');
        }
    }

    // Handle avatar source preference
    if (avatarSource !== undefined) {
        const validSources = ['custom', 'discord', 'google', 'initials', 'default'];
        if (!validSources.includes(avatarSource)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid avatar source');
        }
        updates.avatarSource = avatarSource;
    }

    // Handle photoURL update
    if (photoURL !== undefined) {
        updates.photoURL = photoURL || null;
    }

    // Handle timezone update (Slice 7.0c)
    if (timezone !== undefined) {
        if (typeof timezone !== 'string' || timezone.length < 3 || timezone.length > 50) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid timezone format');
        }
        updates.timezone = timezone;
    }

    // Handle hiddenTimeSlots update (Slice 12.0c)
    if (hiddenTimeSlots !== undefined) {
        if (!Array.isArray(hiddenTimeSlots)) {
            throw new functions.https.HttpsError('invalid-argument', 'hiddenTimeSlots must be an array');
        }
        const validSlots = ['1800', '1830', '1900', '1930', '2000', '2030', '2100', '2130', '2200', '2230', '2300'];
        for (const slot of hiddenTimeSlots) {
            if (!validSlots.includes(slot)) {
                throw new functions.https.HttpsError('invalid-argument', `Invalid time slot: ${slot}`);
            }
        }
        if (hiddenTimeSlots.length > 7) {
            throw new functions.https.HttpsError('invalid-argument', 'At least 4 time slots must remain visible');
        }
        updates.hiddenTimeSlots = hiddenTimeSlots;
    }

    // Handle extraTimeSlots update (Slice 14.0a)
    if (extraTimeSlots !== undefined) {
        if (!Array.isArray(extraTimeSlots)) {
            throw new functions.https.HttpsError('invalid-argument', 'extraTimeSlots must be an array');
        }
        const validPattern = /^([01]\d|2[0-3])(00|30)$/;
        for (const slot of extraTimeSlots) {
            if (!validPattern.test(slot)) {
                throw new functions.https.HttpsError('invalid-argument', `Invalid extra time slot: ${slot}`);
            }
        }
        if (extraTimeSlots.length > 37) {
            throw new functions.https.HttpsError('invalid-argument', 'Too many extra time slots');
        }
        updates.extraTimeSlots = extraTimeSlots;
    }

    try {
        // Update profile and propagate changes to team rosters if needed
        await db.runTransaction(async (transaction) => {
            // STEP 1: ALL READS FIRST
            // Get user's current profile to find their teams
            const userRef = db.collection('users').doc(uid);
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                // User doc should exist (created during sign-in), but handle edge case
                throw new Error('User not found. Please sign out and sign in again.');
            }
            
            const userData = userDoc.data();
            const userTeams = userData.teams || {};
            
            // Read all team documents if we need to update rosters
            // photoURL needs to propagate to denormalized roster data
            const teamDocs = {};
            if (updates.initials || updates.displayName || updates.photoURL !== undefined) {
                for (const teamId of Object.keys(userTeams)) {
                    const teamRef = db.collection('teams').doc(teamId);
                    const teamDoc = await transaction.get(teamRef);
                    if (teamDoc.exists) {
                        teamDocs[teamId] = { ref: teamRef, data: teamDoc.data() };
                    }
                }
            }
            
            // STEP 2: ALL WRITES SECOND
            // Update user profile
            transaction.update(userRef, {
                ...updates,
                lastLogin: FieldValue.serverTimestamp()
            });
            
            // Update team rosters if needed (displayName, initials, or photoURL)
            if (updates.initials || updates.displayName || updates.photoURL !== undefined) {
                for (const [teamId, teamInfo] of Object.entries(teamDocs)) {
                    const playerRoster = teamInfo.data.playerRoster || [];

                    // Find and update this user's entry in the roster
                    const updatedRoster = playerRoster.map(player => {
                        if (player.userId === uid) {
                            return {
                                ...player,
                                ...(updates.displayName && { displayName: updates.displayName }),
                                ...(updates.initials && { initials: updates.initials }),
                                ...(updates.photoURL !== undefined && { photoURL: updates.photoURL })
                            };
                        }
                        return player;
                    });

                    // Update team document with new roster
                    transaction.update(teamInfo.ref, {
                        playerRoster: updatedRoster,
                        lastActivityAt: FieldValue.serverTimestamp()
                    });
                }

                console.log(`✅ Updated profile and ${Object.keys(teamDocs).length} team rosters for user: ${uid}`);
            }
        });
        
        console.log(`✅ Profile updated for user: ${uid}`);
        
        return {
            success: true,
            updates
        };
        
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        console.error('Error details:', error.message);
        console.error('Error code:', error.code);
        
        if (error.code === 'not-found') {
            throw new functions.https.HttpsError('not-found', 'User profile not found');
        }

        throw new functions.https.HttpsError('internal', `Failed to update profile: ${error.message}`);
    }
});

/**
 * Cloud Function: getProfile
 * Retrieves user profile information
 */
exports.getProfile = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to get profile');
    }

    const { uid } = context.auth;
    
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found');
        }
        
        const userData = userDoc.data();
        
        return {
            success: true,
            profile: {
                displayName: userData.displayName,
                initials: userData.initials,
                email: userData.email,
                photoURL: userData.photoURL,
                teams: userData.teams || {}
            }
        };
        
    } catch (error) {
        console.error('❌ Error getting profile:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Failed to get profile');
    }
});

/**
 * Cloud Function: deleteAccount
 * Permanently deletes user's account from both Firestore and Firebase Auth.
 * Also removes user from any team rosters they were on.
 */
exports.deleteAccount = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to delete account');
    }

    const { uid } = context.auth;

    try {
        // Get user profile to find their teams
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            const userData = userDoc.data();
            const userTeams = userData.teams || {};

            // Remove user from all team rosters
            const batch = db.batch();

            for (const teamId of Object.keys(userTeams)) {
                const teamRef = db.collection('teams').doc(teamId);
                const teamDoc = await teamRef.get();

                if (teamDoc.exists) {
                    const teamData = teamDoc.data();
                    const playerRoster = teamData.playerRoster || [];

                    // Check if user is the leader
                    if (teamData.leaderId === uid) {
                        // If user is leader and there are other members, we need to handle this
                        // For now, just remove them - team becomes leaderless
                        // In a production app, you might want to transfer leadership first
                        console.log(`⚠️ User ${uid} is leader of team ${teamId} - removing anyway`);
                    }

                    // Remove user from roster
                    const updatedRoster = playerRoster.filter(p => p.userId !== uid);

                    batch.update(teamRef, {
                        playerRoster: updatedRoster,
                        lastActivityAt: FieldValue.serverTimestamp()
                    });

                    console.log(`📋 Removed user ${uid} from team ${teamId} roster`);
                }
            }

            // Delete user document
            batch.delete(userRef);

            // Commit all Firestore changes
            await batch.commit();
            console.log(`✅ Deleted user document and removed from ${Object.keys(userTeams).length} teams`);
        }

        // Log account deletion event
        await _logAccountDeletionEvent(uid);

        // Delete from Firebase Auth
        await getAuth().deleteUser(uid);
        console.log(`✅ Deleted user from Firebase Auth: ${uid}`);

        return {
            success: true,
            message: 'Account deleted successfully'
        };

    } catch (error) {
        console.error('❌ Error deleting account:', error);
        throw new functions.https.HttpsError('internal', 'Failed to delete account: ' + error.message);
    }
});

/**
 * Helper function to log account deletion event
 * @param {string} userId - The user's UID
 */
async function _logAccountDeletionEvent(userId) {
    try {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const eventId = `${dateStr}-${timeStr}-account-deleted_${randomSuffix}`;

        await db.collection('eventLog').doc(eventId).set({
            eventId,
            type: 'ACCOUNT_DELETED',
            category: 'USER_LIFECYCLE',
            timestamp: FieldValue.serverTimestamp(),
            userId,
            details: {
                reason: 'user_requested'
            }
        });
    } catch (error) {
        console.error('❌ Error logging account deletion event:', error);
        // Don't throw - event logging shouldn't fail the main operation
    }
}

/**
 * Helper function to log user creation event (when user doc is first created)
 * @param {string} userId - The user's UID
 * @param {string} email - User's email
 * @param {string} authMethod - Authentication method (discord or google)
 */
async function _logUserCreationEvent(userId, email, authMethod) {
    try {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const eventId = `${dateStr}-${timeStr}-user-created_${randomSuffix}`;

        await db.collection('eventLog').doc(eventId).set({
            eventId,
            type: 'USER_CREATED',
            category: 'USER_LIFECYCLE',
            timestamp: FieldValue.serverTimestamp(),
            userId,
            details: {
                email: email || 'not provided',
                method: authMethod === 'discord' ? 'discord_oauth' : 'google_oauth'
            }
        });
    } catch (error) {
        console.error('❌ Error logging user creation event:', error);
        // Don't throw - event logging shouldn't fail the main operation
    }
}

/**
 * Helper function to log profile creation event
 * Following PRD v2 event logging system
 * @param {string} userId - The user's UID
 * @param {string} displayName - User's display name
 * @param {string} initials - User's initials
 * @param {string} authMethod - Authentication method (discord or google)
 */
async function _logProfileCreationEvent(userId, displayName, initials, authMethod = 'google') {
    try {
        // PRD format: YYYYMMDD-HHMM-eventtype_XXXX (no team name for user events)
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
        const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
        const eventId = `${dateStr}-${timeStr}-profile-created_${randomSuffix}`;

        const eventData = {
            eventId,
            type: 'PROFILE_CREATED',
            category: 'USER_LIFECYCLE',
            timestamp: FieldValue.serverTimestamp(),
            userId,
            details: {
                displayName,
                initials,
                method: authMethod === 'discord' ? 'discord_oauth' : 'google_oauth'
            }
        };

        await db.collection('eventLog').doc(eventId).set(eventData);

    } catch (error) {
        console.error('❌ Error logging profile creation event:', error);
        // Don't throw - event logging shouldn't fail the main operation
    }
}