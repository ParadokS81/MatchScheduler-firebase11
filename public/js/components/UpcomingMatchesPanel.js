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
    let _rosterTooltip = null;
    let _rosterTooltipHideTimeout = null;

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

        // Hover listeners for roster tooltip
        _container.addEventListener('pointerenter', _handleMatchCardEnter, true);
        _container.addEventListener('pointerleave', _handleMatchCardLeave, true);

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
                <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">${title}</h3>
                <div class="space-y-1.5">
                    ${matches.map(_renderMatchCard).join('')}
                </div>
            </div>
        `;
    }

    function _renderMatchCard(match) {
        // Format slot — extract day abbreviation + time separately
        let dayAbbr = '';
        let timeOnly = '';
        if (typeof TimezoneService !== 'undefined' && TimezoneService.formatSlotForDisplay) {
            const formatted = TimezoneService.formatSlotForDisplay(match.slotId);
            dayAbbr = (formatted.dayLabel || '').slice(0, 3);
            timeOnly = formatted.timeLabel || '';
        }

        // Format date
        let dateDisplay = '';
        if (match.scheduledDate) {
            const d = new Date(match.scheduledDate + 'T00:00:00');
            dateDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        // Get team data from cache
        const teamA = typeof TeamService !== 'undefined' ? TeamService.getTeamFromCache(match.teamAId) : null;
        const teamB = typeof TeamService !== 'undefined' ? TeamService.getTeamFromCache(match.teamBId) : null;
        const logoA = teamA?.activeLogo?.urls?.small || '';
        const logoB = teamB?.activeLogo?.urls?.small || '';
        const tagA = teamA?.teamTag || match.teamAName || '?';
        const tagB = teamB?.teamTag || match.teamBName || '?';

        // Division from either team
        const div = teamA?.divisions?.[0] || teamB?.divisions?.[0] || '';

        return `
            <div class="match-card-compact py-2"
                 data-match-id="${match.id}" data-team-a="${match.teamAId}" data-team-b="${match.teamBId}"
                 data-week-id="${match.weekId || ''}" data-slot-id="${match.slotId || ''}">
                <div class="flex items-center justify-center gap-2.5">
                    ${logoA ? `<img src="${logoA}" class="w-7 h-7 rounded-sm object-cover shrink-0" alt="">` : ''}
                    <span class="text-base font-semibold">${_escapeHtml(tagA)}</span>
                    <span class="text-xs text-muted-foreground">vs</span>
                    <span class="text-base font-semibold">${_escapeHtml(tagB)}</span>
                    ${logoB ? `<img src="${logoB}" class="w-7 h-7 rounded-sm object-cover shrink-0" alt="">` : ''}
                </div>
                <div class="flex items-center justify-center">
                    <span class="text-xs text-muted-foreground">${dateDisplay} ${dayAbbr} ${timeOnly}${div ? ` (${div})` : ''}</span>
                </div>
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

    // ─── Roster Tooltip ────────────────────────────────────────────────

    function _handleMatchCardEnter(e) {
        const card = e.target.closest('.match-card-compact');
        if (!card) return;
        if (_rosterTooltipHideTimeout) {
            clearTimeout(_rosterTooltipHideTimeout);
            _rosterTooltipHideTimeout = null;
        }
        _showRosterTooltip(card);
    }

    function _handleMatchCardLeave(e) {
        const card = e.target.closest('.match-card-compact');
        if (!card) return;
        _rosterTooltipHideTimeout = setTimeout(() => {
            if (_rosterTooltip) _rosterTooltip.style.display = 'none';
        }, 150);
    }

    async function _showRosterTooltip(card) {
        const teamAId = card.dataset.teamA;
        const teamBId = card.dataset.teamB;
        const weekId = card.dataset.weekId;
        const slotId = card.dataset.slotId;
        if (!teamAId || !teamBId || !weekId || !slotId) return;

        if (typeof TeamService === 'undefined' || typeof AvailabilityService === 'undefined') return;

        const teamA = TeamService.getTeamFromCache(teamAId);
        const teamB = TeamService.getTeamFromCache(teamBId);
        if (!teamA || !teamB) return;

        const rosterA = teamA.playerRoster || [];
        const rosterB = teamB.playerRoster || [];

        let availA = { slots: {} };
        let availB = { slots: {} };
        try {
            [availA, availB] = await Promise.all([
                AvailabilityService.loadWeekAvailability(teamAId, weekId),
                AvailabilityService.loadWeekAvailability(teamBId, weekId)
            ]);
        } catch (err) {
            console.warn('UpcomingMatchesPanel: Failed to load availability for tooltip:', err);
        }

        const availableIdsA = availA.slots?.[slotId] || [];
        const availableIdsB = availB.slots?.[slotId] || [];

        const teamAAvailable = rosterA.filter(p => availableIdsA.includes(p.userId));
        const teamAUnavailable = rosterA.filter(p => !availableIdsA.includes(p.userId));
        const teamBAvailable = rosterB.filter(p => availableIdsB.includes(p.userId));
        const teamBUnavailable = rosterB.filter(p => !availableIdsB.includes(p.userId));

        const currentUserId = typeof AuthService !== 'undefined' ? AuthService.getCurrentUser()?.uid : null;

        const renderPlayers = (available, unavailable, isUserTeam) => {
            const availHtml = available.map(p => {
                const isYou = isUserTeam && p.userId === currentUserId;
                return `<div class="player-row player-available">
                    <span class="player-status-dot available"></span>
                    <span class="player-name">${_escapeHtml(p.displayName || p.initials || '?')}${isYou ? ' (You)' : ''}</span>
                </div>`;
            }).join('');
            const unavailHtml = unavailable.map(p =>
                `<div class="player-row player-unavailable">
                    <span class="player-status-dot unavailable"></span>
                    <span class="player-name">${_escapeHtml(p.displayName || p.initials || '?')}</span>
                </div>`
            ).join('');
            return availHtml + unavailHtml;
        };

        const isUserTeamA = _userTeamIds.includes(teamAId);
        const isUserTeamB = _userTeamIds.includes(teamBId);

        const html = `
            <div class="match-tooltip-grid">
                <div class="match-column user-team-column">
                    <div class="match-team-header">
                        <span class="match-team-name">${_escapeHtml(teamA.teamName || teamA.teamTag || '')}</span>
                        <span class="match-player-count">${teamAAvailable.length}/${rosterA.length}</span>
                    </div>
                    <div class="match-roster-list">
                        ${renderPlayers(teamAAvailable, teamAUnavailable, isUserTeamA)}
                    </div>
                </div>
                <div class="match-column opponents-column">
                    <div class="match-team-header">
                        <span class="match-team-name">${_escapeHtml(teamB.teamName || teamB.teamTag || '')}</span>
                        <span class="match-player-count">${teamBAvailable.length}/${rosterB.length}</span>
                    </div>
                    <div class="match-roster-list">
                        ${renderPlayers(teamBAvailable, teamBUnavailable, isUserTeamB)}
                    </div>
                </div>
            </div>
        `;

        if (!_rosterTooltip) {
            _rosterTooltip = document.createElement('div');
            _rosterTooltip.className = 'match-tooltip';
            document.body.appendChild(_rosterTooltip);
        }

        _rosterTooltip.innerHTML = html;

        const cardRect = card.getBoundingClientRect();
        _rosterTooltip.style.visibility = 'hidden';
        _rosterTooltip.style.display = 'block';
        const ttRect = _rosterTooltip.getBoundingClientRect();

        // Position to the right of the card
        let left = cardRect.right + 8;
        let top = cardRect.top;

        if (left + ttRect.width > window.innerWidth - 8) {
            left = cardRect.left - ttRect.width - 8;
        }
        if (top + ttRect.height > window.innerHeight - 8) {
            top = window.innerHeight - ttRect.height - 8;
        }
        if (top < 8) top = 8;
        if (left < 8) left = 8;

        _rosterTooltip.style.left = `${left}px`;
        _rosterTooltip.style.top = `${top}px`;
        _rosterTooltip.style.visibility = 'visible';
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
        if (_container) {
            _container.removeEventListener('pointerenter', _handleMatchCardEnter, true);
            _container.removeEventListener('pointerleave', _handleMatchCardLeave, true);
        }
        if (_rosterTooltip) {
            _rosterTooltip.remove();
            _rosterTooltip = null;
        }
        if (_rosterTooltipHideTimeout) {
            clearTimeout(_rosterTooltipHideTimeout);
            _rosterTooltipHideTimeout = null;
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
