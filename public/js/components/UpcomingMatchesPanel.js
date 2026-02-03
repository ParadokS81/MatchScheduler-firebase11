// UpcomingMatchesPanel.js - Bottom-left panel showing upcoming scheduled matches
// Shows "Your Matches" (user's teams) and "Community Matches" (all others)
// Follows Cache + Listener pattern: Component owns Firebase listener, ScheduledMatchService manages cache

const UpcomingMatchesPanel = (function() {
    'use strict';

    let _container = null;
    let _containerId = null;
    let _unsubscribe = null;
    let _unsubscribeAuth = null;
    let _userTeamIds = [];
    let _initialized = false;

    // ─── Initialization ────────────────────────────────────────────────

    async function init(containerId) {
        _containerId = containerId;
        _container = document.getElementById(containerId);
        if (!_container) return;

        // Listen for auth state changes so panel updates when dev mode sign-in completes
        _unsubscribeAuth = AuthService.onAuthStateChange((user) => {
            if (user && !_initialized) {
                _initWithUser(user);
            } else if (!user) {
                _teardownListener();
                _initialized = false;
                _userTeamIds = [];
                _renderEmpty('Sign in to see upcoming matches');
            }
        });
    }

    async function _initWithUser(user) {
        if (!_container) return;

        // Get user's team IDs
        _userTeamIds = await _getUserTeamIds(user.uid);

        // Render loading state
        _container.innerHTML = '<div class="flex items-center justify-center h-full text-muted-foreground text-xs">Loading matches...</div>';

        // Set up Firestore listener for all upcoming scheduled matches
        await _setupListener();

        _initialized = true;
        console.log('📅 UpcomingMatchesPanel initialized');
    }

    async function _getUserTeamIds(userId) {
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', userId));
            if (!userDoc.exists()) return [];
            return Object.keys(userDoc.data().teams || {});
        } catch (error) {
            console.error('UpcomingMatchesPanel: Failed to get user teams:', error);
            return [];
        }
    }

    // ─── Firestore Listener ─────────────────────────────────────────────

    async function _setupListener() {
        const { collection, query, where, onSnapshot } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        const matchesQuery = query(
            collection(window.firebase.db, 'scheduledMatches'),
            where('status', '==', 'upcoming')
        );

        _unsubscribe = onSnapshot(matchesQuery, (snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'removed') {
                    ScheduledMatchService.removeFromCache(change.doc.id);
                } else {
                    ScheduledMatchService.updateCache(change.doc.id, change.doc.data());
                }
            });
            _render();
        });
    }

    // ─── Rendering ──────────────────────────────────────────────────────

    function _render() {
        if (!_container) return;

        const allMatches = ScheduledMatchService.getMatchesFromCache()
            .filter(m => m.status === 'upcoming');

        // Split into user's matches and community matches
        const yourMatches = [];
        const communityMatches = [];

        for (const match of allMatches) {
            if (_userTeamIds.includes(match.teamAId) || _userTeamIds.includes(match.teamBId)) {
                yourMatches.push(match);
            } else {
                communityMatches.push(match);
            }
        }

        // Sort by scheduled date
        const sortByDate = (a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
        yourMatches.sort(sortByDate);
        communityMatches.sort(sortByDate);

        if (allMatches.length === 0) {
            _renderEmpty('No upcoming matches scheduled');
            return;
        }

        _container.innerHTML = `
            <div class="upcoming-matches-panel h-full overflow-y-auto p-3 space-y-3">
                ${yourMatches.length > 0 ? _renderSection('Your Matches', yourMatches) : ''}
                ${communityMatches.length > 0 ? _renderSection('Community Matches', communityMatches) : ''}
                ${yourMatches.length === 0 && _userTeamIds.length > 0 ? '<p class="text-xs text-muted-foreground italic">No matches scheduled for your teams yet</p>' : ''}
            </div>
        `;
    }

    function _renderSection(title, matches) {
        return `
            <div>
                <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">${title}</h3>
                <div class="space-y-1.5">
                    ${matches.map(_renderMatchCard).join('')}
                </div>
            </div>
        `;
    }

    function _renderMatchCard(match) {
        // Format the slot for display
        let timeDisplay = match.slotId || '';
        if (typeof TimezoneService !== 'undefined' && TimezoneService.formatSlotForDisplay) {
            const formatted = TimezoneService.formatSlotForDisplay(match.slotId);
            timeDisplay = formatted.fullLabel || formatted.dayLabel + ' ' + formatted.timeLabel;
        }

        // Format date
        let dateDisplay = '';
        if (match.scheduledDate) {
            const d = new Date(match.scheduledDate + 'T00:00:00');
            dateDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        const isYourMatch = _userTeamIds.includes(match.teamAId) || _userTeamIds.includes(match.teamBId);

        return `
            <div class="match-card rounded border border-border bg-card/50 p-2 ${isYourMatch ? 'border-l-2 border-l-green-500/50' : ''}">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5 min-w-0 text-xs">
                        <span class="font-medium text-foreground truncate">${_escapeHtml(match.teamATag || match.teamAName)}</span>
                        <span class="text-muted-foreground">vs</span>
                        <span class="font-medium text-foreground truncate">${_escapeHtml(match.teamBTag || match.teamBName)}</span>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-xs text-muted-foreground">${dateDisplay}</div>
                    </div>
                </div>
                <div class="text-xs text-muted-foreground mt-0.5">${timeDisplay}</div>
            </div>
        `;
    }

    function _renderEmpty(message) {
        if (!_container) return;
        _container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center p-3">
                <p class="text-xs text-muted-foreground italic">${message}</p>
            </div>
        `;
    }

    function _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Cleanup ────────────────────────────────────────────────────────

    function _teardownListener() {
        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }
    }

    function cleanup() {
        _teardownListener();
        if (_unsubscribeAuth) {
            _unsubscribeAuth();
            _unsubscribeAuth = null;
        }
        _userTeamIds = [];
        _initialized = false;
        _container = null;
        _containerId = null;
    }

    // ─── Public API ─────────────────────────────────────────────────────

    return {
        init,
        cleanup
    };
})();
