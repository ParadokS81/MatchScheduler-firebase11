// UpcomingMatchesPanel.js - Left sidebar showing upcoming scheduled matches
// Slice 13.0f: Split rendering - "Your Matches" and "Upcoming" in separate containers
// Follows Cache + Listener pattern: Component owns Firebase listener, ScheduledMatchService manages cache

const UpcomingMatchesPanel = (function() {
    'use strict';

    let _yourMatchesContainer = null;
    let _upcomingContainer = null;
    let _unsubscribe = null;
    let _unsubscribeAuth = null;
    let _userTeamIds = [];
    let _initialized = false;
    let _rosterTooltip = null;
    let _rosterTooltipHideTimeout = null;

    // ─── Initialization ────────────────────────────────────────────────

    async function init(yourMatchesContainerId, upcomingContainerId) {
        _yourMatchesContainer = document.getElementById(yourMatchesContainerId);
        _upcomingContainer = document.getElementById(upcomingContainerId);

        if (!_yourMatchesContainer && !_upcomingContainer) {
            console.warn('UpcomingMatchesPanel: No containers found');
            return;
        }

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
        // Get user's team IDs
        _userTeamIds = await _getUserTeamIds(user.uid);

        // Render loading state
        if (_yourMatchesContainer) {
            _yourMatchesContainer.innerHTML = '';
        }
        if (_upcomingContainer) {
            _upcomingContainer.innerHTML = '<div class="flex items-center justify-center py-4 text-muted-foreground text-xs">Loading matches...</div>';
        }

        // Set up Firestore listener for all upcoming scheduled matches
        await _setupListener();

        _initialized = true;
        console.log('📅 UpcomingMatchesPanel initialized (split containers)');
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

        // Render "Your Matches" section
        if (_yourMatchesContainer) {
            if (yourMatches.length > 0) {
                _yourMatchesContainer.innerHTML = `
                    <div class="your-matches-section">
                        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">Your Matches</h3>
                        <div class="space-y-1.5">
                            ${yourMatches.map(_renderMatchCard).join('')}
                        </div>
                    </div>
                `;
            } else if (_userTeamIds.length > 0) {
                _yourMatchesContainer.innerHTML = `
                    <p class="text-xs text-muted-foreground italic text-center py-2">No matches scheduled for your teams</p>
                `;
            } else {
                _yourMatchesContainer.innerHTML = '';
            }
        }

        // Render "Upcoming" section (community matches)
        if (_upcomingContainer) {
            if (communityMatches.length > 0) {
                _upcomingContainer.innerHTML = `
                    <div class="upcoming-matches-section h-full overflow-y-auto">
                        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center sticky top-0 bg-card py-1">Upcoming</h3>
                        <div class="space-y-1.5">
                            ${communityMatches.map(_renderMatchCard).join('')}
                        </div>
                    </div>
                `;
            } else if (allMatches.length === 0) {
                _upcomingContainer.innerHTML = `
                    <div class="h-full flex flex-col items-center justify-center py-4">
                        <p class="text-xs text-muted-foreground italic">No upcoming matches scheduled</p>
                    </div>
                `;
            } else {
                _upcomingContainer.innerHTML = '';
            }
        }

        // Attach event listeners to each match card
        const allCards = document.querySelectorAll('.match-card-compact');
        allCards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                if (_rosterTooltipHideTimeout) {
                    clearTimeout(_rosterTooltipHideTimeout);
                    _rosterTooltipHideTimeout = null;
                }
                _showRosterTooltip(card);
            });
            card.addEventListener('mouseleave', () => {
                _rosterTooltipHideTimeout = setTimeout(() => {
                    if (_rosterTooltip) _rosterTooltip.style.display = 'none';
                }, 150);
            });
            card.addEventListener('click', () => _handleMatchCardClick(card));
        });
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
            <div class="match-card-compact py-1.5 cursor-pointer rounded hover:bg-muted/50 transition-colors"
                 data-match-id="${match.id}" data-team-a="${match.teamAId}" data-team-b="${match.teamBId}"
                 data-week-id="${match.weekId || ''}" data-slot-id="${match.slotId || ''}">
                <div class="flex items-center justify-center gap-2">
                    ${logoA ? `<img src="${logoA}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">` : ''}
                    <span class="text-sm font-semibold">${_escapeHtml(tagA)}</span>
                    <span class="text-xs text-muted-foreground">vs</span>
                    <span class="text-sm font-semibold">${_escapeHtml(tagB)}</span>
                    ${logoB ? `<img src="${logoB}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">` : ''}
                </div>
                <div class="flex items-center justify-center">
                    <span class="text-xs text-muted-foreground">${dateDisplay} ${dayAbbr} ${timeOnly}${div ? ` (${div})` : ''}</span>
                </div>
            </div>
        `;
    }

    function _renderEmpty(message) {
        if (_yourMatchesContainer) {
            _yourMatchesContainer.innerHTML = '';
        }
        if (_upcomingContainer) {
            _upcomingContainer.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center py-4">
                    <p class="text-xs text-muted-foreground italic">${message}</p>
                </div>
            `;
        }
    }

    function _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Match Card Click → Navigate to H2H ─────────────────────────────

    function _handleMatchCardClick(card) {
        const teamAId = card.dataset.teamA;
        const teamBId = card.dataset.teamB;
        if (!teamAId || !teamBId) return;

        // Navigate to H2H page
        window.location.hash = `/teams/${teamAId}/h2h/${teamBId}`;
    }

    // ─── Roster Tooltip ────────────────────────────────────────────────

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
        _yourMatchesContainer = null;
        _upcomingContainer = null;
    }

    // ─── Public API ─────────────────────────────────────────────────────

    return {
        init,
        cleanup
    };
})();
