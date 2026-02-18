// AdminStatsService - Compute & cache weekly engagement metrics for admin sidebar
// Slice A2: Admin Sidebar Stats

const AdminStatsService = (function() {
    'use strict';

    let _statsCache = new Map(); // weekId → { activeUsers, activeTeams, proposalCount, scheduledCount }

    /**
     * Get stats for a week. Tries weeklyStats collection first (fast path),
     * falls back to live Firestore queries.
     */
    async function getWeekStats(weekId) {
        if (_statsCache.has(weekId)) return _statsCache.get(weekId);

        try {
            // Try weeklyStats collection first (fast path for past weeks, populated by A5)
            const stored = await _loadStoredStats(weekId);
            if (stored) {
                _statsCache.set(weekId, stored);
                return stored;
            }

            // Compute from live data
            const computed = await _computeLiveStats(weekId);
            _statsCache.set(weekId, computed);
            return computed;
        } catch (error) {
            console.error('Failed to load stats for week', weekId, error);
            return { activeUsers: 0, activeTeams: 0, proposalCount: 0, scheduledCount: 0, error: true };
        }
    }

    async function _loadStoredStats(weekId) {
        const { doc, getDoc } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );
        const docRef = doc(window.firebase.db, 'weeklyStats', weekId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return null;
        const data = snap.data();
        return {
            activeUsers: data.activeUsers,
            activeTeams: data.activeTeams,
            proposalCount: data.proposalCount,
            scheduledCount: data.scheduledCount
        };
    }

    async function _computeLiveStats(weekId) {
        const { collection, query, where, getDocs } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );
        const db = window.firebase.db;

        // 1. Active users: unique userIds across all availability docs for this week
        const availSnap = await getDocs(
            query(collection(db, 'availability'), where('weekId', '==', weekId))
        );
        const uniqueUsers = new Set();
        const activeTeamIds = new Set();
        availSnap.forEach(doc => {
            const data = doc.data();
            const slots = data.slots || {};
            let hasUsers = false;
            for (const userIds of Object.values(slots)) {
                userIds.forEach(uid => { uniqueUsers.add(uid); hasUsers = true; });
            }
            if (hasUsers) activeTeamIds.add(data.teamId);
        });

        // 2. Proposals: count all proposals for this week
        const proposalSnap = await getDocs(
            query(collection(db, 'matchProposals'), where('weekId', '==', weekId))
        );

        // 3. Scheduled matches: count all matches for this week
        const matchSnap = await getDocs(
            query(collection(db, 'scheduledMatches'), where('weekId', '==', weekId))
        );

        return {
            activeUsers: uniqueUsers.size,
            activeTeams: activeTeamIds.size,
            proposalCount: proposalSnap.size,
            scheduledCount: matchSnap.size
        };
    }

    function _getCurrentWeekId() {
        const now = new Date();
        const weekNum = DateUtils.getCurrentWeekNumber();
        const year = DateUtils.getISOWeekYear(now);
        return `${year}-${String(weekNum).padStart(2, '0')}`;
    }

    function _getPreviousWeekId() {
        const now = new Date();
        const prevDate = new Date(now);
        prevDate.setDate(prevDate.getDate() - 7);
        const weekNum = DateUtils.getISOWeekNumber(prevDate);
        const year = DateUtils.getISOWeekYear(prevDate);
        return `${year}-${String(weekNum).padStart(2, '0')}`;
    }

    function clearCache() {
        _statsCache.clear();
    }

    return { getWeekStats, clearCache, _getCurrentWeekId, _getPreviousWeekId };
})();
