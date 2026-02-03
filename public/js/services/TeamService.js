// TeamService - Firebase v11 Team Operations
// Following PRD v2 Architecture with Revealing Module Pattern

const TeamService = (function() {
    'use strict';
    
    // Private variables
    let _initialized = false;
    let _db = null;
    let _auth = null;
    let _functions = null;
    // Removed _teamListeners - components manage their own listeners per architecture
    let _initRetryCount = 0;
    let _allTeamsCache = new Map(); // Cache for all team data
    let _cacheTimestamp = null;
    let _cacheInitialized = false;
    
    // Initialize TeamService
    function init() {
        if (_initialized) return;
        
        // Wait for Firebase to be ready with retry limit
        if (typeof window.firebase === 'undefined') {
            if (_initRetryCount < 50) { // Max 5 seconds (50 * 100ms)
                _initRetryCount++;
                setTimeout(init, 100);
                return;
            } else {
                console.error('❌ Firebase failed to load after 5 seconds');
                return;
            }
        }
        
        // Reset retry counter on success
        _initRetryCount = 0;
        
        _db = window.firebase.db;
        _auth = window.firebase.auth;
        _functions = window.firebase.functions;
        
        _initialized = true;
        
        // Initialize cache on startup (per PRD 5.3 - pre-load everything)
        _initializeCache();
        
        console.log('🏆 TeamService initialized');
    }
    
    // Initialize cache with all team data (PRD 5.3 strategy)
    async function _initializeCache() {
        try {
            console.log('📦 Initializing team cache...');
            
            const { collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            
            // Load all teams (security rules filter out archived ones)
            const teamsQuery = collection(_db, 'teams');
            
            const teamsSnapshot = await getDocs(teamsQuery);
            
            teamsSnapshot.forEach(doc => {
                const teamData = { id: doc.id, ...doc.data() };
                _allTeamsCache.set(doc.id, teamData);
            });
            
            _cacheTimestamp = Date.now();
            _cacheInitialized = true;
            
            console.log(`✅ Team cache initialized: ${_allTeamsCache.size} teams loaded (~${Math.round(_allTeamsCache.size * 0.7)}KB)`);
            
        } catch (error) {
            console.error('❌ Error initializing team cache:', error);
            _cacheInitialized = false;
            // Don't throw error - cache initialization failure shouldn't break the app
        }
    }
    
    // Create new team
    async function createTeam(teamData) {
        if (!_auth.currentUser) {
            throw new Error('No authenticated user');
        }
        
        try {
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            
            const createTeamFunction = httpsCallable(_functions, 'createTeam');
            const result = await createTeamFunction(teamData);
            
            console.log('✅ Team created successfully:', result.data.team.teamName);
            
            // Update cache with new team
            if (_cacheInitialized) {
                _allTeamsCache.set(result.data.team.id, result.data.team);
            }
            
            // Show success toast
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess(`Team "${result.data.team.teamName}" created successfully!`);
            }
            
            return result.data.team;
            
        } catch (error) {
            console.error('❌ Error creating team:', error);
            throw new Error(error.message || 'Failed to create team');
        }
    }
    
    // Join team with code
    async function joinTeam(joinCode) {
        if (!_auth.currentUser) {
            throw new Error('No authenticated user');
        }
        
        try {
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            
            const joinTeamFunction = httpsCallable(_functions, 'joinTeam');
            const result = await joinTeamFunction({ joinCode });
            
            console.log('✅ Joined team successfully:', result.data.team.teamName);
            
            // Update cache with updated team
            if (_cacheInitialized) {
                _allTeamsCache.set(result.data.team.id, result.data.team);
            }
            
            // Show success toast
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess(`Successfully joined ${result.data.team.teamName}!`);
            }
            
            return result.data.team;
            
        } catch (error) {
            console.error('❌ Error joining team:', error);
            throw new Error(error.message || 'Failed to join team');
        }
    }
    
    // Get team by ID (cache-first)
    async function getTeam(teamId, forceRefresh = false) {
        try {
            // Check cache first (hot path) unless force refresh requested
            if (!forceRefresh && _cacheInitialized && _allTeamsCache.has(teamId)) {
                console.log('📦 Team loaded from cache:', teamId);
                return _allTeamsCache.get(teamId);
            }

            // Fetch from Firebase
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

            const teamDoc = await getDoc(doc(_db, 'teams', teamId));

            if (!teamDoc.exists()) {
                throw new Error('Team not found');
            }

            const teamData = { id: teamDoc.id, ...teamDoc.data() };

            // Update cache
            _allTeamsCache.set(teamId, teamData);

            return teamData;

        } catch (error) {
            console.error('❌ Error getting team:', error);
            throw new Error(error.message || 'Failed to get team data');
        }
    }
    
    // Get user's teams (cache-optimized)
    async function getUserTeams(userId) {
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            
            const userDoc = await getDoc(doc(_db, 'users', userId));
            
            if (!userDoc.exists()) {
                return [];
            }
            
            const userData = userDoc.data();
            const teamIds = Object.keys(userData.teams || {});
            
            // Get all team data (will use cache if available)
            const teams = [];
            for (const teamId of teamIds) {
                try {
                    const team = await getTeam(teamId);
                    teams.push(team);
                } catch (error) {
                    console.warn(`⚠️ Could not load team ${teamId}:`, error);
                }
            }
            
            return teams;
            
        } catch (error) {
            console.error('❌ Error getting user teams:', error);
            throw new Error(error.message || 'Failed to get user teams');
        }
    }
    
    // Note: Real-time listeners removed per architecture - components manage their own Firebase subscriptions
    // TeamService focuses on caching, one-time operations, and data validation
    
    // Update cache when components receive real-time updates
    function updateCachedTeam(teamId, teamData) {
        if (_cacheInitialized && teamData) {
            const existingData = _allTeamsCache.get(teamId);
            
            // Only update if data actually changed
            if (!existingData || JSON.stringify(existingData) !== JSON.stringify(teamData)) {
                _allTeamsCache.set(teamId, teamData);
                console.log('🔄 Cache updated for team:', teamData.teamName);
            }
        } else if (_cacheInitialized && !teamData) {
            // Team was deleted
            _allTeamsCache.delete(teamId);
            console.log('🗑️ Removed deleted team from cache:', teamId);
        }
    }
    
    // Get all teams from cache (for TeamBrowser)
    function getAllTeams() {
        if (!_cacheInitialized) {
            console.warn('⚠️ TeamService cache not initialized yet');
            return [];
        }
        return Array.from(_allTeamsCache.values());
    }

    // Get single team from cache only (synchronous, for FavoritesPanel)
    function getTeamFromCache(teamId) {
        if (!_cacheInitialized || !teamId) {
            return null;
        }
        return _allTeamsCache.get(teamId) || null;
    }

    // Check if cache is ready
    function isCacheReady() {
        return _cacheInitialized;
    }

    // Cleanup cache
    function cleanup() {
        // Clear cache
        _allTeamsCache.clear();
        _cacheInitialized = false;
        _cacheTimestamp = null;
        console.log('🧹 TeamService cache cleared');
    }
    
    // Generate join code (client-side helper for display)
    function generateJoinCode() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }
    
    // Validate team name
    function validateTeamName(teamName) {
        if (!teamName || typeof teamName !== 'string') {
            return 'Team name is required';
        }
        
        const trimmed = teamName.trim();
        if (trimmed.length < 3) {
            return 'Team name must be at least 3 characters';
        }
        
        if (trimmed.length > 30) {
            return 'Team name must be less than 30 characters';
        }
        
        // Check for special characters that might cause issues
        if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
            return 'Team name can only contain letters, numbers, spaces, hyphens, and underscores';
        }
        
        return null;
    }
    
    // Validate team tag (matches QW in-game tag, case-sensitive)
    function validateTeamTag(teamTag) {
        if (!teamTag || typeof teamTag !== 'string') {
            return 'Team tag is required';
        }

        const trimmed = teamTag.trim();
        if (trimmed.length < 1) {
            return 'Team tag is required';
        }

        if (trimmed.length > 4) {
            return 'Team tag must be 4 characters or less';
        }

        // Allow letters, numbers, and QW-style special characters: [ ] ( ) { } - _ . , !
        if (!/^[a-zA-Z0-9\[\]\(\)\{\}\-_.,!]+$/.test(trimmed)) {
            return 'Team tag can only contain letters, numbers, and common QW characters';
        }

        return null;
    }
    
    // Validate join code
    function validateJoinCode(joinCode) {
        if (!joinCode || typeof joinCode !== 'string') {
            return 'Join code is required';
        }
        
        const trimmed = joinCode.trim().toUpperCase();
        if (trimmed.length !== 6) {
            return 'Join code must be exactly 6 characters';
        }
        
        if (!/^[A-Z0-9]{6}$/.test(trimmed)) {
            return 'Join code must contain only uppercase letters and numbers';
        }
        
        return null;
    }
    
    // Update team tag (direct Firestore write, leader auth via security rules)
    async function updateTeamTag(teamId, teamTag) {
        const { doc, updateDoc, Timestamp } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        await updateDoc(doc(_db, 'teams', teamId), {
            teamTag: teamTag,
            lastActivityAt: Timestamp.now()
        });

        // Update cache
        if (_cacheInitialized && _allTeamsCache.has(teamId)) {
            const cached = _allTeamsCache.get(teamId);
            cached.teamTag = teamTag;
            cached.lastActivityAt = new Date();
        }
    }

    // Check if a user is a scheduler (or leader) for a team
    function isScheduler(teamId, userId) {
        const team = getTeamFromCache(teamId);
        if (!team) return false;
        return team.leaderId === userId || (team.schedulers || []).includes(userId);
    }

    // Generic Cloud Function caller
    async function callFunction(functionName, data) {
        if (!_initialized || !_functions) {
            throw new Error('TeamService not initialized');
        }
        
        try {
            const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
            const cloudFunction = httpsCallable(_functions, functionName);
            const result = await cloudFunction(data);
            
            return result.data;
        } catch (error) {
            console.error(`Error calling ${functionName}:`, error);
            
            // Extract user-friendly error message
            if (error.code === 'unauthenticated') {
                return { success: false, error: 'Please sign in to continue' };
            } else if (error.code === 'permission-denied') {
                return { success: false, error: 'You do not have permission for this action' };
            } else if (error.message) {
                return { success: false, error: error.message };
            } else {
                return { success: false, error: 'An unexpected error occurred' };
            }
        }
    }
    
    // Public API
    return {
        init,
        createTeam,
        joinTeam,
        getTeam,
        getTeamFromCache,
        getUserTeams,
        getAllTeams,
        isCacheReady,
        // Removed subscribe/unsubscribe - components handle their own listeners
        updateCachedTeam,
        updateTeamTag,
        cleanup,
        generateJoinCode,
        validateTeamName,
        validateTeamTag,
        validateJoinCode,
        callFunction,
        isScheduler
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', TeamService.init);