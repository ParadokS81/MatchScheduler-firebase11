const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const db = getFirestore();

/**
 * Cloud Function: createProfile
 * Creates a user profile in Firestore after authentication
 * Following PRD v2 gaming community patterns
 */
exports.createProfile = onCall(async (request) => {
    const { auth, data } = request;
    
    // Verify user is authenticated
    if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to create profile');
    }
    
    const { uid } = auth;
    
    // Get user info from Auth to get email
    const userRecord = await getAuth().getUser(uid);
    const email = userRecord.email;
    const { displayName, initials, discordUsername, discordUserId } = data;
    
    // Validate input
    if (!displayName || !initials) {
        throw new HttpsError('invalid-argument', 'Display name and initials are required');
    }
    
    // Validate display name
    if (displayName.length < 2 || displayName.length > 30) {
        throw new HttpsError('invalid-argument', 'Display name must be 2-30 characters');
    }
    
    // Validate initials
    if (!/^[A-Z]{3}$/.test(initials)) {
        throw new HttpsError('invalid-argument', 'Initials must be exactly 3 uppercase letters');
    }
    
    // Validate Discord data if provided
    if (discordUsername || discordUserId) {
        if (!discordUsername || !discordUserId) {
            throw new HttpsError('invalid-argument', 'Both Discord username and user ID must be provided together');
        }
        
        if (discordUsername.length > 50) {
            throw new HttpsError('invalid-argument', 'Discord username is too long');
        }
        
        if (!/^[0-9]+$/.test(discordUserId) || discordUserId.length < 17 || discordUserId.length > 19) {
            throw new HttpsError('invalid-argument', 'Discord user ID must be 17-19 digits');
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
        
        // Save to Firestore
        await db.collection('users').doc(uid).set(userProfile);
        
        // Log profile creation event
        await _logProfileCreationEvent(uid, displayName, initials);
        
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
            throw new HttpsError('not-found', 'User not found');
        }
        
        throw new HttpsError('internal', 'Failed to create profile');
    }
});

/**
 * Cloud Function: updateProfile
 * Updates user profile information
 */
exports.updateProfile = onCall(async (request) => {
    const { auth, data } = request;
    
    // Verify user is authenticated
    if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to update profile');
    }
    
    const { uid } = auth;
    const { displayName, initials, discordUsername, discordUserId } = data;
    
    // Validate input
    if (!displayName && !initials && discordUsername === undefined && discordUserId === undefined) {
        throw new HttpsError('invalid-argument', 'At least one field must be provided');
    }
    
    const updates = {};
    
    // Validate and add display name
    if (displayName) {
        if (displayName.length < 2 || displayName.length > 30) {
            throw new HttpsError('invalid-argument', 'Display name must be 2-30 characters');
        }
        updates.displayName = displayName.trim();
    }
    
    // Validate and add initials
    if (initials) {
        if (!/^[A-Z]{3}$/.test(initials)) {
            throw new HttpsError('invalid-argument', 'Initials must be exactly 3 uppercase letters');
        }
        updates.initials = initials.toUpperCase();
    }
    
    // Handle Discord data
    if (discordUsername !== undefined || discordUserId !== undefined) {
        // If either is being updated, validate both
        if (discordUsername === '' && discordUserId === '') {
            // Clear Discord data
            updates.discordUsername = FieldValue.delete();
            updates.discordUserId = FieldValue.delete();
        } else if (discordUsername && discordUserId) {
            // Update Discord data
            if (discordUsername.length > 50) {
                throw new HttpsError('invalid-argument', 'Discord username is too long');
            }
            if (!/^[0-9]+$/.test(discordUserId) || discordUserId.length < 17 || discordUserId.length > 19) {
                throw new HttpsError('invalid-argument', 'Discord user ID must be 17-19 digits');
            }
            updates.discordUsername = discordUsername.trim();
            updates.discordUserId = discordUserId.trim();
        } else {
            throw new HttpsError('invalid-argument', 'Both Discord username and user ID must be provided together');
        }
    }
    
    try {
        // Update profile
        await db.collection('users').doc(uid).update({
            ...updates,
            lastLogin: FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Profile updated for user: ${uid}`);
        
        return {
            success: true,
            updates
        };
        
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        
        if (error.code === 'not-found') {
            throw new HttpsError('not-found', 'User profile not found');
        }
        
        throw new HttpsError('internal', 'Failed to update profile');
    }
});

/**
 * Cloud Function: getProfile
 * Retrieves user profile information
 */
exports.getProfile = onCall(async (request) => {
    const { auth } = request;
    
    // Verify user is authenticated
    if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to get profile');
    }
    
    const { uid } = auth;
    
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User profile not found');
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
        
        if (error instanceof HttpsError) {
            throw error;
        }
        
        throw new HttpsError('internal', 'Failed to get profile');
    }
});

/**
 * Helper function to log profile creation event
 * Following PRD v2 event logging system
 */
async function _logProfileCreationEvent(userId, displayName, initials) {
    try {
        const eventId = `${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${
            new Date().toTimeString().split(' ')[0].replace(/:/g, '')
        }-profile-created-${Math.random().toString(36).substr(2, 4)}`;
        
        const eventData = {
            eventId,
            type: 'PROFILE_CREATED',
            category: 'USER_LIFECYCLE',
            timestamp: FieldValue.serverTimestamp(),
            userId,
            details: {
                displayName,
                initials,
                method: 'google_oauth'
            }
        };
        
        await db.collection('eventLog').doc(eventId).set(eventData);
        
    } catch (error) {
        console.error('❌ Error logging profile creation event:', error);
        // Don't throw - event logging shouldn't fail the main operation
    }
}