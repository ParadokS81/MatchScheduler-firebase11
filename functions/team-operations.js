// Team Operations Cloud Functions
// Following PRD v2 Architecture with Firebase v11

const { onCall, HttpsError } = require('firebase-functions/v2/https');
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
    
    // Team tag validation
    if (!teamData.teamTag || typeof teamData.teamTag !== 'string') {
        errors.push('Team tag is required');
    } else {
        const trimmed = teamData.teamTag.trim().toUpperCase();
        if (trimmed.length < 2) {
            errors.push('Team tag must be at least 2 characters');
        }
        if (trimmed.length > 4) {
            errors.push('Team tag must be 4 characters or less');
        }
        if (!/^[A-Z0-9]+$/.test(trimmed)) {
            errors.push('Team tag can only contain uppercase letters and numbers');
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
exports.createTeam = onCall(async (request) => {
    try {
        // Check authentication
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated to create a team');
        }
        
        const userId = request.auth.uid;
        const teamData = request.data;
        
        console.log('Creating team for user:', userId);
        console.log('Team data:', teamData);
        
        // Validate team data
        const validationErrors = validateTeamData(teamData);
        if (validationErrors.length > 0) {
            throw new HttpsError('invalid-argument', validationErrors.join(', '));
        }
        
        // Get user profile to include in team roster
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User profile not found. Please create your profile first.');
        }
        
        const userProfile = userDoc.data();
        
        // Check if user already has 2 teams (max limit)
        const userTeams = userProfile.teams || {};
        if (Object.keys(userTeams).length >= 2) {
            throw new HttpsError('failed-precondition', 'You can only be on a maximum of 2 teams');
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
            throw new HttpsError('internal', 'Failed to generate unique join code. Please try again.');
        }
        
        // Create team document
        const teamRef = db.collection('teams').doc();
        const teamId = teamRef.id;
        
        const now = FieldValue.serverTimestamp();
        const nowDate = new Date(); // Use regular Date for array fields
        
        const team = {
            teamName: teamData.teamName.trim(),
            teamTag: teamData.teamTag.trim().toUpperCase(),
            leaderId: userId,
            divisions: teamData.divisions,
            maxPlayers: teamData.maxPlayers,
            joinCode: joinCode,
            status: 'active',
            playerRoster: [{
                userId: userId,
                displayName: userProfile.displayName,
                initials: userProfile.initials,
                joinedAt: nowDate,
                role: 'leader'
            }],
            lastActivityAt: now,
            createdAt: now
        };
        
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
        
        if (error instanceof HttpsError) {
            throw error;
        }
        
        throw new HttpsError('internal', 'Failed to create team: ' + error.message);
    }
});

// Join team function
exports.joinTeam = onCall(async (request) => {
    try {
        // Check authentication
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated to join a team');
        }
        
        const userId = request.auth.uid;
        const { joinCode } = request.data;
        
        console.log('User joining team:', userId, 'with code:', joinCode);
        
        // Validate join code
        if (!joinCode || typeof joinCode !== 'string') {
            throw new HttpsError('invalid-argument', 'Join code is required');
        }
        
        const trimmedCode = joinCode.trim().toUpperCase();
        if (trimmedCode.length !== 6) {
            throw new HttpsError('invalid-argument', 'Join code must be exactly 6 characters');
        }
        
        if (!/^[A-Z0-9]{6}$/.test(trimmedCode)) {
            throw new HttpsError('invalid-argument', 'Join code must contain only uppercase letters and numbers');
        }
        
        // Get user profile
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User profile not found. Please create your profile first.');
        }
        
        const userProfile = userDoc.data();
        
        // Check if user already has 2 teams (max limit)
        const userTeams = userProfile.teams || {};
        if (Object.keys(userTeams).length >= 2) {
            throw new HttpsError('failed-precondition', 'You can only be on a maximum of 2 teams');
        }
        
        // Find team by join code
        const teamQuery = await db.collection('teams').where('joinCode', '==', trimmedCode).get();
        
        if (teamQuery.empty) {
            throw new HttpsError('not-found', 'Invalid join code. Please check the code and try again.');
        }
        
        const teamDoc = teamQuery.docs[0];
        const team = teamDoc.data();
        const teamId = teamDoc.id;
        
        // Check if team is active
        if (team.status !== 'active') {
            throw new HttpsError('failed-precondition', 'This team is not currently accepting new members');
        }
        
        // Check if user is already on this team
        if (userTeams[teamId]) {
            throw new HttpsError('already-exists', 'You are already a member of this team');
        }
        
        // Check if team is full
        if (team.playerRoster.length >= team.maxPlayers) {
            throw new HttpsError('failed-precondition', `Team is full (${team.playerRoster.length}/${team.maxPlayers} players)`);
        }
        
        // Check if initials are unique on this team
        const existingInitials = team.playerRoster.map(player => player.initials);
        if (existingInitials.includes(userProfile.initials)) {
            throw new HttpsError('failed-precondition', 
                `Initials "${userProfile.initials}" are already taken on this team. Please update your profile with different initials.`);
        }
        
        // Add player to team
        const now = FieldValue.serverTimestamp();
        const nowDate = new Date(); // Use regular Date for array fields
        const newPlayer = {
            userId: userId,
            displayName: userProfile.displayName,
            initials: userProfile.initials,
            joinedAt: nowDate,
            role: 'member'
        };
        
        // Use transaction to ensure consistency
        await db.runTransaction(async (transaction) => {
            // Add player to team roster
            transaction.update(db.collection('teams').doc(teamId), {
                playerRoster: FieldValue.arrayUnion(newPlayer),
                lastActivityAt: now
            });
            
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
                type: 'JOINED',
                category: 'PLAYER_MOVEMENT',
                timestamp: nowDate,
                userId,
                player: {
                    displayName: userProfile.displayName,
                    initials: userProfile.initials
                },
                details: {
                    role: 'member',
                    isFounder: false,
                    joinMethod: 'joinCode'
                }
            });
        });
        
        console.log('✅ User joined team successfully:', team.teamName);
        
        return {
            success: true,
            team: {
                id: teamId,
                ...team,
                playerRoster: [...team.playerRoster, newPlayer]
            }
        };
        
    } catch (error) {
        console.error('❌ Error joining team:', error);
        
        if (error instanceof HttpsError) {
            throw error;
        }
        
        throw new HttpsError('internal', 'Failed to join team: ' + error.message);
    }
});