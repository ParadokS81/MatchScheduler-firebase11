// Team Operations Cloud Functions
// Following PRD v2 Architecture with Firebase v11

const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const db = getFirestore();

// Generate secure join code
function generateJoinCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Validate team data
function validateTeamData(teamData) {
    const errors = [];
    
    // Team name validation
    if (!teamData.teamName || typeof teamData.teamName !== 'string') {
        errors.push('Team name is required');
    } else {
        const trimmed = teamData.teamName.trim();
        if (trimmed.length < 3) {
            errors.push('Team name must be at least 3 characters');
        }
        if (trimmed.length > 30) {
            errors.push('Team name must be less than 30 characters');
        }
        if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
            errors.push('Team name can only contain letters, numbers, spaces, hyphens, and underscores');
        }
    }
    
    // Team tag validation (case-sensitive, matches QW in-game tag)
    if (!teamData.teamTag || typeof teamData.teamTag !== 'string') {
        errors.push('Team tag is required');
    } else {
        const trimmed = teamData.teamTag.trim();
        if (trimmed.length < 1) {
            errors.push('Team tag is required');
        }
        if (trimmed.length > 4) {
            errors.push('Team tag must be 4 characters or less');
        }
        // Allow letters, numbers, and QW-style special characters: [ ] ( ) { } - _ . , !
        if (!/^[a-zA-Z0-9\[\]\(\)\{\}\-_.,!]+$/.test(trimmed)) {
            errors.push('Team tag can only contain letters, numbers, and common QW characters');
        }
    }
    
    // Divisions validation
    if (!teamData.divisions || !Array.isArray(teamData.divisions)) {
        errors.push('At least one division must be selected');
    } else {
        if (teamData.divisions.length === 0) {
            errors.push('At least one division must be selected');
        }
        const validDivisions = ['1', '2', '3'];
        for (const division of teamData.divisions) {
            if (!validDivisions.includes(division)) {
                errors.push('Invalid division selected');
                break;
            }
        }
    }
    
    // Max players validation
    if (!teamData.maxPlayers || typeof teamData.maxPlayers !== 'number') {
        errors.push('Max players must be specified');
    } else {
        if (teamData.maxPlayers < 4 || teamData.maxPlayers > 20) {
            errors.push('Max players must be between 4 and 20');
        }
    }
    
    return errors;
}

// Create team function
exports.createTeam = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        // Check authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to create a team');
        }

        const userId = context.auth.uid;
        const teamData = data;
        
        console.log('Creating team for user:', userId);
        console.log('Team data:', teamData);
        
        // Validate team data
        const validationErrors = validateTeamData(teamData);
        if (validationErrors.length > 0) {
            throw new functions.https.HttpsError('invalid-argument', validationErrors.join(', '));
        }
        
        // Get user profile to include in team roster
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found. Please create your profile first.');
        }
        
        const userProfile = userDoc.data();

        // Check if user already has 2 teams (max limit)
        const userTeams = userProfile.teams || {};
        if (Object.keys(userTeams).length >= 2) {
            throw new functions.https.HttpsError('failed-precondition', 'You can only be on a maximum of 2 teams');
        }

        // Check if team name already exists (case-insensitive)
        const normalizedName = teamData.teamName.trim().toLowerCase();
        const existingTeamByName = await db.collection('teams')
            .where('teamNameLower', '==', normalizedName)
            .limit(1)
            .get();

        if (!existingTeamByName.empty) {
            throw new functions.https.HttpsError('already-exists', `A team named "${teamData.teamName.trim()}" already exists. Please choose a different name.`);
        }

        // Generate unique join code
        let joinCode;
        let isUnique = false;
        let attempts = 0;
        
        while (!isUnique && attempts < 10) {
            joinCode = generateJoinCode();
            
            // Check if join code is unique
            const existingTeam = await db.collection('teams').where('joinCode', '==', joinCode).get();
            if (existingTeam.empty) {
                isUnique = true;
            }
            attempts++;
        }
        
        if (!isUnique) {
            throw new functions.https.HttpsError('internal', 'Failed to generate unique join code. Please try again.');
        }
        
        // Create team document
        const teamRef = db.collection('teams').doc();
        const teamId = teamRef.id;
        
        const now = FieldValue.serverTimestamp();
        const nowDate = new Date(); // Use regular Date for array fields
        
        const team = {
            teamName: teamData.teamName.trim(),
            teamNameLower: teamData.teamName.trim().toLowerCase(), // For case-insensitive uniqueness
            teamTag: teamData.teamTag.trim(),
            leaderId: userId,
            divisions: teamData.divisions,
            maxPlayers: teamData.maxPlayers,
            joinCode: joinCode,
            status: 'active',
            playerRoster: [{
                userId: userId,
                displayName: userProfile.displayName,
                initials: userProfile.initials,
                photoURL: userProfile.photoURL || null,
                joinedAt: nowDate,
                role: 'leader'
            }],
            lastActivityAt: now,
            createdAt: now
        };

        // If leader has Discord linked, store on team for contact feature
        if (userProfile.discordUserId) {
            team.leaderDiscord = {
                username: userProfile.discordUsername,
                userId: userProfile.discordUserId
            };
        }
        
        // Use transaction to ensure consistency
        await db.runTransaction(async (transaction) => {
            // Create team
            transaction.set(teamRef, team);
            
            // Update user's teams
            transaction.update(db.collection('users').doc(userId), {
                [`teams.${teamId}`]: true
            });
            
            // Log team creation event
            const eventId = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${
                new Date().toTimeString().slice(0, 5).replace(':', '')
            }-${teamData.teamName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}-team_created_${
                Math.random().toString(36).substr(2, 4).toUpperCase()
            }`;
            
            // Team lifecycle event
            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId,
                teamName: team.teamName,
                type: 'TEAM_CREATED',
                category: 'TEAM_LIFECYCLE',
                timestamp: nowDate,
                details: {
                    divisions: team.divisions,
                    maxPlayers: team.maxPlayers,
                    creator: {
                        displayName: userProfile.displayName,
                        initials: userProfile.initials
                    }
                }
            });
            
            // Player movement event
            const joinEventId = eventId.replace('team_created', 'joined');
            transaction.set(db.collection('eventLog').doc(joinEventId), {
                eventId: joinEventId,
                teamId,
                teamName: team.teamName,
                type: 'JOINED',
                category: 'PLAYER_MOVEMENT',
                timestamp: nowDate,
                userId,
                player: {
                    displayName: userProfile.displayName,
                    initials: userProfile.initials
                },
                details: {
                    role: 'leader',
                    isFounder: true,
                    joinMethod: 'created'
                }
            });
        });
        
        console.log('✅ Team created successfully:', team.teamName);
        
        return {
            success: true,
            team: {
                id: teamId,
                ...team,
                // Convert server timestamp to ISO string for client
                createdAt: new Date().toISOString(),
                lastActivityAt: new Date().toISOString()
            }
        };
        
    } catch (error) {
        console.error('❌ Error creating team:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Failed to create team: ' + error.message);
    }
});

// Join team function
exports.joinTeam = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    console.log('🚀 joinTeam function called');
    console.log('Request auth:', context.auth ? 'authenticated' : 'not authenticated');
    console.log('Request data:', data);

    try {
        // Check authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to join a team');
        }

        const userId = context.auth.uid;
        const { joinCode } = data;
        
        console.log('User joining team:', userId, 'with code:', joinCode);
        
        // Validate join code
        if (!joinCode || typeof joinCode !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'Join code is required');
        }

        const trimmedCode = joinCode.trim().toUpperCase();
        if (trimmedCode.length !== 6) {
            throw new functions.https.HttpsError('invalid-argument', 'Join code must be exactly 6 characters');
        }

        if (!/^[A-Z0-9]{6}$/.test(trimmedCode)) {
            throw new functions.https.HttpsError('invalid-argument', 'Join code must contain only uppercase letters and numbers');
        }
        
        // Get user profile
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found. Please create your profile first.');
        }

        const userProfile = userDoc.data();

        // Check if user already has 2 teams (max limit)
        const userTeams = userProfile.teams || {};
        if (Object.keys(userTeams).length >= 2) {
            throw new functions.https.HttpsError('failed-precondition', 'You can only be on a maximum of 2 teams');
        }

        // Find team by join code
        const teamQuery = await db.collection('teams').where('joinCode', '==', trimmedCode).get();

        if (teamQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Invalid join code. Please check the code and try again.');
        }

        const teamDoc = teamQuery.docs[0];
        const team = teamDoc.data();
        const teamId = teamDoc.id;

        // Check if team is active
        if (team.status !== 'active') {
            throw new functions.https.HttpsError('failed-precondition', 'This team is not currently accepting new members');
        }

        // Check if user is already on this team
        if (userTeams[teamId]) {
            throw new functions.https.HttpsError('already-exists', 'You are already a member of this team');
        }

        // Check if team is full
        if (team.playerRoster.length >= team.maxPlayers) {
            throw new functions.https.HttpsError('failed-precondition', `Team is full (${team.playerRoster.length}/${team.maxPlayers} players)`);
        }

        // Check if initials are unique on this team (only if roster is not empty)
        if (team.playerRoster.length > 0) {
            const existingInitials = team.playerRoster.map(player => player.initials);
            if (existingInitials.includes(userProfile.initials)) {
                throw new functions.https.HttpsError('failed-precondition',
                    `Initials "${userProfile.initials}" are already taken on this team. Please update your profile with different initials.`);
            }
        }

        // Determine if this user should become leader
        // Team is "unclaimed" if: empty roster OR leaderId is null/placeholder
        const isUnclaimedTeam = team.playerRoster.length === 0 ||
                                !team.leaderId ||
                                team.leaderId === 'UNCLAIMED';

        // Add player to team
        const now = FieldValue.serverTimestamp();
        const nowDate = new Date(); // Use regular Date for array fields
        const newPlayer = {
            userId: userId,
            displayName: userProfile.displayName,
            initials: userProfile.initials,
            photoURL: userProfile.photoURL || null,
            joinedAt: nowDate,
            role: isUnclaimedTeam ? 'leader' : 'member'
        };
        
        // Use transaction to ensure consistency
        await db.runTransaction(async (transaction) => {
            // Build team update object
            const teamUpdate = {
                playerRoster: FieldValue.arrayUnion(newPlayer),
                lastActivityAt: now
            };

            // If claiming unclaimed team, also set leaderId and Discord info
            if (isUnclaimedTeam) {
                teamUpdate.leaderId = userId;

                // Copy leader's Discord info to team if available
                if (userProfile.discordUserId) {
                    teamUpdate.leaderDiscord = {
                        username: userProfile.discordUsername,
                        userId: userProfile.discordUserId
                    };
                }
            }

            // Add player to team roster (and optionally set leader)
            transaction.update(db.collection('teams').doc(teamId), teamUpdate);

            // Update user's teams
            transaction.update(db.collection('users').doc(userId), {
                [`teams.${teamId}`]: true
            });

            // Log join event
            const eventId = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${
                new Date().toTimeString().slice(0, 5).replace(':', '')
            }-${team.teamName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}-joined_${
                Math.random().toString(36).substr(2, 4).toUpperCase()
            }`;

            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId,
                teamName: team.teamName,
                type: isUnclaimedTeam ? 'CLAIMED_LEADERSHIP' : 'JOINED',
                category: 'PLAYER_MOVEMENT',
                timestamp: nowDate,
                userId,
                player: {
                    displayName: userProfile.displayName,
                    initials: userProfile.initials
                },
                details: {
                    role: isUnclaimedTeam ? 'leader' : 'member',
                    isFounder: false,
                    joinMethod: 'joinCode',
                    claimedLeadership: isUnclaimedTeam
                }
            });
        });
        
        console.log(`✅ User ${isUnclaimedTeam ? 'claimed leadership of' : 'joined'} team successfully:`, team.teamName);

        return {
            success: true,
            team: {
                id: teamId,
                ...team,
                leaderId: isUnclaimedTeam ? userId : team.leaderId,
                playerRoster: [...team.playerRoster, newPlayer]
            },
            claimedLeadership: isUnclaimedTeam
        };
        
    } catch (error) {
        console.error('❌ Error joining team:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Failed to join team: ' + error.message);
    }
});

// Regenerate join code function
exports.regenerateJoinCode = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        // Check authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { teamId } = data;
        
        // Validate input
        if (!teamId || typeof teamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
        }

        // Get team and verify user is leader
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Team not found');
        }

        const team = teamDoc.data();
        if (team.leaderId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Only team leaders can regenerate join codes');
        }
        
        // Generate new join code
        const generateJoinCode = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let result = '';
            for (let i = 0; i < 6; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        };
        
        let newJoinCode;
        let attempts = 0;
        
        // Ensure unique join code
        do {
            newJoinCode = generateJoinCode();
            const existingTeam = await db.collection('teams')
                .where('joinCode', '==', newJoinCode)
                .limit(1)
                .get();
            
            if (existingTeam.empty) {
                break;
            }
            
            attempts++;
            if (attempts > 10) {
                throw new functions.https.HttpsError('internal', 'Failed to generate unique join code');
            }
        } while (true);
        
        // Update team document
        await db.collection('teams').doc(teamId).update({
            joinCode: newJoinCode,
            lastActivityAt: FieldValue.serverTimestamp()
        });
        
        // Log event - PRD format: YYYYMMDD-HHMM-teamname-eventtype_XXXX
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
        const teamNameClean = team.teamName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
        const eventId = `${dateStr}-${timeStr}-${teamNameClean}-joincode_regenerated_${randomSuffix}`;
        
        await db.collection('eventLog').doc(eventId).set({
            eventId,
            teamId,
            teamName: team.teamName,
            type: 'JOIN_CODE_REGENERATED',
            category: 'TEAM_MANAGEMENT',
            timestamp: FieldValue.serverTimestamp(),
            userId,
            player: {
                displayName: team.playerRoster.find(p => p.userId === userId)?.displayName || 'Unknown',
                initials: team.playerRoster.find(p => p.userId === userId)?.initials || 'UN'
            },
            details: {
                oldJoinCode: team.joinCode,
                newJoinCode
            }
        });
        
        console.log('✅ Join code regenerated successfully:', teamId);
        
        return {
            success: true,
            data: {
                joinCode: newJoinCode
            }
        };
        
    } catch (error) {
        console.error('❌ Error regenerating join code:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Failed to regenerate join code: ' + error.message);
    }
});

// Leave team function
exports.leaveTeam = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        // Check authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { teamId } = data;
        
        // Validate input
        if (!teamId || typeof teamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
        }

        // Get team and user documents
        const [teamDoc, userDoc] = await Promise.all([
            db.collection('teams').doc(teamId).get(),
            db.collection('users').doc(userId).get()
        ]);
        
        if (!teamDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Team not found');
        }

        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User not found');
        }

        const team = teamDoc.data();
        const user = userDoc.data();

        // Check if user is on team
        const playerIndex = team.playerRoster.findIndex(p => p.userId === userId);
        if (playerIndex === -1) {
            throw new functions.https.HttpsError('permission-denied', 'User is not on this team');
        }

        const player = team.playerRoster[playerIndex];
        const isLeader = team.leaderId === userId;
        const isLastMember = team.playerRoster.length === 1;

        // Leaders can only leave if they're the last member
        if (isLeader && !isLastMember) {
            throw new functions.https.HttpsError('permission-denied', 'Leaders cannot leave their team unless they are the last member');
        }
        
        // Execute in transaction
        await db.runTransaction(async (transaction) => {
            // Remove player from team roster
            const updatedRoster = team.playerRoster.filter(p => p.userId !== userId);
            
            // Update user's teams
            const userTeams = { ...user.teams };
            delete userTeams[teamId];
            
            if (isLastMember) {
                // Archive team if last member
                transaction.update(db.collection('teams').doc(teamId), {
                    status: 'archived',
                    playerRoster: updatedRoster,
                    lastActivityAt: FieldValue.serverTimestamp()
                });
                
                // Log team archived event - PRD format: YYYYMMDD-HHMM-teamname-eventtype_XXXX
                const now = new Date();
                const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
                const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
                const teamNameClean = team.teamName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
                const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
                const archiveEventId = `${dateStr}-${timeStr}-${teamNameClean}-team_archived_${randomSuffix}`;
                
                transaction.set(db.collection('eventLog').doc(archiveEventId), {
                    eventId: archiveEventId,
                    teamId,
                    teamName: team.teamName,
                    type: 'TEAM_ARCHIVED',
                    category: 'TEAM_MANAGEMENT',
                    timestamp: FieldValue.serverTimestamp(),
                    userId,
                    player: {
                        displayName: player.displayName,
                        initials: player.initials
                    },
                    details: {
                        reason: 'last_member_left',
                        finalRosterSize: 0
                    }
                });
            } else {
                // Just remove player from team
                transaction.update(db.collection('teams').doc(teamId), {
                    playerRoster: updatedRoster,
                    lastActivityAt: FieldValue.serverTimestamp()
                });
            }
            
            // Update user document
            transaction.update(db.collection('users').doc(userId), {
                teams: userTeams,
                lastActivityAt: FieldValue.serverTimestamp()
            });
            
            // Log leave event - PRD format: YYYYMMDD-HHMM-teamname-eventtype_XXXX
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
            const teamNameClean = team.teamName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
            const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
            const leaveEventId = `${dateStr}-${timeStr}-${teamNameClean}-left_${randomSuffix}`;
            
            console.log('📝 Creating leave event:', leaveEventId);
            
            transaction.set(db.collection('eventLog').doc(leaveEventId), {
                eventId: leaveEventId,
                teamId,
                teamName: team.teamName,
                type: 'LEFT',
                category: 'PLAYER_MOVEMENT',
                timestamp: FieldValue.serverTimestamp(),
                userId,
                player: {
                    displayName: player.displayName,
                    initials: player.initials
                },
                details: {
                    wasLeader: isLeader,
                    wasLastMember: isLastMember,
                    remainingRosterSize: updatedRoster.length
                }
            });
            
            console.log('📝 Leave event transaction set, will commit with transaction');
        });
        
        console.log('✅ Player left team successfully:', { teamId, userId, isLastMember });
        
        return {
            success: true,
            data: {
                leftTeam: true,
                teamArchived: isLastMember
            }
        };
        
    } catch (error) {
        console.error('❌ Error leaving team:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Failed to leave team: ' + error.message);
    }
});

// Kick player function - removes a player from the team
exports.kickPlayer = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { teamId, playerToKickId } = data;
    const callerId = context.auth.uid;

    if (!teamId || !playerToKickId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }

    if (callerId === playerToKickId) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot remove yourself. Use "Leave Team" instead.');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const teamRef = db.collection('teams').doc(teamId);
            const userRef = db.collection('users').doc(playerToKickId);

            // ALL READS FIRST (Firestore transaction requirement)
            const teamDoc = await transaction.get(teamRef);
            const userDoc = await transaction.get(userRef);

            if (!teamDoc.exists) {
                throw new Error('Team not found');
            }

            const team = teamDoc.data();

            // Verify caller is leader
            if (team.leaderId !== callerId) {
                throw new Error('Only team leaders can remove players');
            }

            // Find player to kick
            const playerToKick = team.playerRoster.find(p => p.userId === playerToKickId);
            if (!playerToKick) {
                throw new Error('Player not found on team roster');
            }

            // ALL WRITES AFTER READS
            // Remove from roster
            const updatedRoster = team.playerRoster.filter(p => p.userId !== playerToKickId);
            transaction.update(teamRef, { playerRoster: updatedRoster });

            // Update kicked player's user document
            if (userDoc.exists) {
                const userData = userDoc.data();
                const updatedTeams = { ...userData.teams };
                delete updatedTeams[teamId];
                transaction.update(userRef, { teams: updatedTeams });
            }

            // Create event log
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '').slice(0, 4);
            const teamNameClean = team.teamName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
            const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            const eventId = `${dateStr}-${timeStr}-${teamNameClean}-kicked_${randomSuffix}`;

            const caller = team.playerRoster.find(p => p.userId === callerId);

            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId,
                teamName: team.teamName,
                type: 'KICKED',
                category: 'PLAYER_MOVEMENT',
                timestamp: FieldValue.serverTimestamp(),
                userId: playerToKickId,
                player: {
                    displayName: playerToKick.displayName,
                    initials: playerToKick.initials
                },
                details: {
                    kickedBy: callerId,
                    kickedByName: caller?.displayName || 'Unknown'
                }
            });
        });

        // After transaction: clean up availability (outside transaction for query)
        const availabilitySnap = await db.collection('availability')
            .where('teamId', '==', teamId)
            .get();

        const batch = db.batch();
        availabilitySnap.docs.forEach(doc => {
            const data = doc.data();
            const slots = data.slots || {};
            let hasChanges = false;

            Object.keys(slots).forEach(slotKey => {
                if (Array.isArray(slots[slotKey]) && slots[slotKey].includes(playerToKickId)) {
                    slots[slotKey] = slots[slotKey].filter(uid => uid !== playerToKickId);
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                batch.update(doc.ref, { slots });
            }
        });

        await batch.commit();

        console.log('✅ Player kicked successfully:', { teamId, playerToKickId });
        return { success: true };
    } catch (error) {
        console.error('❌ kickPlayer error:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to kick player: ' + error.message);
    }
});

// Transfer leadership function
exports.transferLeadership = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { teamId, newLeaderId } = data;
    const callerId = context.auth.uid;

    if (!teamId || !newLeaderId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }

    if (callerId === newLeaderId) {
        throw new functions.https.HttpsError('invalid-argument', 'You are already the leader');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const teamRef = db.collection('teams').doc(teamId);
            const teamDoc = await transaction.get(teamRef);

            if (!teamDoc.exists) {
                throw new Error('Team not found');
            }

            const team = teamDoc.data();

            // Verify caller is current leader
            if (team.leaderId !== callerId) {
                throw new Error('Only the current leader can transfer leadership');
            }

            // Verify new leader is on roster
            const newLeader = team.playerRoster.find(p => p.userId === newLeaderId);
            if (!newLeader) {
                throw new Error('Selected player is not on the team');
            }

            // Update roster roles
            const updatedRoster = team.playerRoster.map(p => {
                if (p.userId === callerId) {
                    return { ...p, role: 'member' };
                }
                if (p.userId === newLeaderId) {
                    return { ...p, role: 'leader' };
                }
                return p;
            });

            // Get new leader's user profile to update leaderDiscord
            const newLeaderUserDoc = await transaction.get(db.collection('users').doc(newLeaderId));
            const newLeaderProfile = newLeaderUserDoc.exists ? newLeaderUserDoc.data() : null;

            // Build team update
            const teamUpdate = {
                leaderId: newLeaderId,
                playerRoster: updatedRoster
            };

            // Update leaderDiscord with new leader's info (or clear if not linked)
            if (newLeaderProfile?.discordUserId) {
                teamUpdate.leaderDiscord = {
                    username: newLeaderProfile.discordUsername,
                    userId: newLeaderProfile.discordUserId
                };
            } else {
                teamUpdate.leaderDiscord = FieldValue.delete();
            }

            // Update team
            transaction.update(teamRef, teamUpdate);

            // Create event log
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '').slice(0, 4);
            const teamNameClean = team.teamName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
            const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            const eventId = `${dateStr}-${timeStr}-${teamNameClean}-transferred_leadership_${randomSuffix}`;

            const oldLeader = team.playerRoster.find(p => p.userId === callerId);

            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId,
                teamName: team.teamName,
                type: 'TRANSFERRED_LEADERSHIP',
                category: 'PLAYER_MOVEMENT',
                timestamp: FieldValue.serverTimestamp(),
                userId: newLeaderId,
                player: {
                    displayName: newLeader.displayName,
                    initials: newLeader.initials
                },
                details: {
                    fromUserId: callerId,
                    fromUserName: oldLeader?.displayName || 'Unknown'
                }
            });
        });

        console.log('✅ Leadership transferred successfully:', { teamId, newLeaderId });
        return { success: true };
    } catch (error) {
        console.error('❌ transferLeadership error:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to transfer leadership: ' + error.message);
    }
});

// Update team settings function
exports.updateTeamSettings = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        // Check authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { teamId, maxPlayers, hideRosterNames, hideFromComparison } = data;

        // Validate input
        if (!teamId || typeof teamId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
        }

        // At least one setting must be provided
        const hasMaxPlayers = maxPlayers !== undefined;
        const hasHideRosterNames = hideRosterNames !== undefined;
        const hasHideFromComparison = hideFromComparison !== undefined;

        if (!hasMaxPlayers && !hasHideRosterNames && !hasHideFromComparison) {
            throw new functions.https.HttpsError('invalid-argument', 'At least one setting must be provided');
        }

        if (hasMaxPlayers && (typeof maxPlayers !== 'number' || maxPlayers < 4 || maxPlayers > 20)) {
            throw new functions.https.HttpsError('invalid-argument', 'maxPlayers must be between 4 and 20');
        }
        if (hasHideRosterNames && typeof hideRosterNames !== 'boolean') {
            throw new functions.https.HttpsError('invalid-argument', 'hideRosterNames must be a boolean');
        }
        if (hasHideFromComparison && typeof hideFromComparison !== 'boolean') {
            throw new functions.https.HttpsError('invalid-argument', 'hideFromComparison must be a boolean');
        }

        // Get team document
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Team not found');
        }

        const team = teamDoc.data();

        // Check if user is team leader
        if (team.leaderId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Only team leaders can update team settings');
        }

        // Validate maxPlayers is not less than current roster size
        if (hasMaxPlayers && maxPlayers < team.playerRoster.length) {
            throw new functions.https.HttpsError('invalid-argument', `Max players cannot be less than current roster size (${team.playerRoster.length})`);
        }

        // Build update object dynamically
        const updateData = { lastActivityAt: FieldValue.serverTimestamp() };
        if (hasMaxPlayers) updateData.maxPlayers = maxPlayers;
        if (hasHideRosterNames) updateData.hideRosterNames = hideRosterNames;
        if (hasHideFromComparison) updateData.hideFromComparison = hideFromComparison;

        await db.collection('teams').doc(teamId).update(updateData);

        // Log event
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
        const teamNameClean = team.teamName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
        const eventId = `${dateStr}-${timeStr}-${teamNameClean}-settings_updated_${randomSuffix}`;

        const details = {};
        if (hasMaxPlayers) {
            details.oldMaxPlayers = team.maxPlayers;
            details.newMaxPlayers = maxPlayers;
        }
        if (hasHideRosterNames) {
            details.oldHideRosterNames = team.hideRosterNames || false;
            details.newHideRosterNames = hideRosterNames;
        }
        if (hasHideFromComparison) {
            details.oldHideFromComparison = team.hideFromComparison || false;
            details.newHideFromComparison = hideFromComparison;
        }

        await db.collection('eventLog').doc(eventId).set({
            eventId,
            teamId,
            teamName: team.teamName,
            type: 'TEAM_SETTINGS_UPDATED',
            category: 'TEAM_MANAGEMENT',
            timestamp: FieldValue.serverTimestamp(),
            userId,
            player: {
                displayName: team.playerRoster.find(p => p.userId === userId)?.displayName || 'Unknown',
                initials: team.playerRoster.find(p => p.userId === userId)?.initials || 'UN'
            },
            details
        });

        console.log('✅ Team settings updated successfully:', teamId);

        return {
            success: true,
            data: updateData
        };
        
    } catch (error) {
        console.error('❌ Error updating team settings:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Failed to update team settings: ' + error.message);
    }
});