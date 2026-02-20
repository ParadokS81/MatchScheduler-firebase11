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
    let _gameTypeFilter = null; // null = show all, 'official' or 'practice' = filter

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
                // Apply game type filter
                const filteredMatches = _gameTypeFilter
                    ? yourMatches.filter(m => (m.gameType || 'official') === _gameTypeFilter)
                    : yourMatches;

                _yourMatchesContainer.innerHTML = `
                    <div class="your-matches-section">
                        <div class="flex items-center justify-between mb-2 px-1">
                            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Matches</h3>
                            <div class="flex gap-1">
                                ${_renderFilterButton('official', 'OFFI')}
                                ${_renderFilterButton('practice', 'PRAC')}
                            </div>
                        </div>
                        <div class="space-y-1.5">
                            ${filteredMatches.length > 0
                                ? filteredMatches.map(_renderMatchCard).join('')
                                : '<div class="text-xs text-muted-foreground text-center py-2 italic">No matches of this type</div>'
                            }
                        </div>
                    </div>
                `;

                // Attach filter button click handlers
                _yourMatchesContainer.querySelectorAll('[data-filter-type]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const type = btn.dataset.filterType;
                        _gameTypeFilter = _gameTypeFilter === type ? null : type;
                        _render();
                    });
                });
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

    function _renderFilterButton(type, label) {
        const isActive = _gameTypeFilter === type;
        const isOfficial = type === 'official';

        // Active: filled background. Inactive: just colored text (shows both types by default)
        const classes = isActive
            ? (isOfficial
                ? 'bg-green-500/20 text-green-400 border-green-500/50'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/50')
            : (isOfficial
                ? 'text-green-400/70 border-transparent'
                : 'text-amber-400/70 border-transparent');

        return `<button data-filter-type="${type}"
            class="text-[0.6rem] font-semibold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${classes}"
            title="${isActive ? 'Show all' : 'Show only ' + label}">${label}</button>`;
    }

    function _renderMatchCard(match) {
        // Format slot — full day name + time
        let dayFull = '';
        let timeOnly = '';
        if (typeof TimezoneService !== 'undefined' && TimezoneService.formatSlotForDisplay) {
            const formatted = TimezoneService.formatSlotForDisplay(match.slotId);
            dayFull = formatted.dayLabel || '';
            timeOnly = formatted.timeLabel || '';
        }

        // Format day with ordinal (e.g., "12th") or "Today"
        let dayOrdinal = '';
        if (match.scheduledDate) {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (match.scheduledDate === todayStr) {
                dayOrdinal = 'Today';
                dayFull = '';
            } else {
                const d = new Date(match.scheduledDate + 'T00:00:00');
                const dayNum = d.getDate();
                dayOrdinal = dayNum + _getOrdinalSuffix(dayNum);
            }
        }

        // Get team data from cache
        const teamA = typeof TeamService !== 'undefined' ? TeamService.getTeamFromCache(match.teamAId) : null;
        const teamB = typeof TeamService !== 'undefined' ? TeamService.getTeamFromCache(match.teamBId) : null;
        const logoA = teamA?.activeLogo?.urls?.small || '';
        const logoB = teamB?.activeLogo?.urls?.small || '';
        const tagA = teamA?.teamTag || match.teamAName || '?';
        const tagB = teamB?.teamTag || match.teamBName || '?';

        // Game type label with color coding
        const gameType = match.gameType || 'official';
        const gameTypeLabel = gameType === 'practice' ? 'PRAC' : 'OFFI';
        const gameTypeColor = gameType === 'practice' ? 'text-amber-400/80' : 'text-green-400/80';

        // Date line: "Thursday 12th. 22:00" or "Today 22:00"
        const dateLine = dayOrdinal === 'Today'
            ? `Today ${timeOnly}`.trim()
            : `${dayFull} ${dayOrdinal}. ${timeOnly}`.trim();

        // Logo HTML or invisible spacer for alignment
        const logoAHtml = logoA
            ? `<img src="${logoA}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">`
            : '<span class="w-5 h-5 shrink-0 inline-block"></span>';
        const logoBHtml = logoB
            ? `<img src="${logoB}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">`
            : '<span class="w-5 h-5 shrink-0 inline-block"></span>';

        return `
            <div class="match-card-compact py-2 px-2 cursor-pointer rounded border border-border/50 bg-muted/15 hover:bg-muted/40 transition-colors"
                 data-match-id="${match.id}" data-team-a="${match.teamAId}" data-team-b="${match.teamBId}"
                 data-week-id="${match.weekId || ''}" data-slot-id="${match.slotId || ''}">
                <div class="flex items-center justify-center gap-0">
                    ${logoAHtml}
                    <span class="text-sm font-semibold inline-block w-[4ch] text-right truncate">${_escapeHtml(tagA)}</span>
                    <span class="text-muted-foreground/40 mx-3">·</span>
                    <span class="text-sm font-semibold inline-block w-[4ch] text-left truncate">${_escapeHtml(tagB)}</span>
                    ${logoBHtml}
                </div>
                <div class="flex items-center justify-center gap-1 mt-0.5">
                    <span class="text-[0.625rem] ${gameTypeColor} font-medium uppercase tracking-wide">${gameTypeLabel}</span>
                    <span class="text-[0.625rem] text-muted-foreground">·</span>
                    <span class="text-xs text-muted-foreground">${dateLine}</span>
                </div>
            </div>
        `;
    }

    function _getOrdinalSuffix(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
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

        // Put user's team first in H2H perspective
        const userIsB = _userTeamIds.includes(teamBId) && !_userTeamIds.includes(teamAId);
        const h2hFirst = userIsB ? teamBId : teamAId;
        const h2hSecond = userIsB ? teamAId : teamBId;
        window.location.hash = `/teams/${h2hFirst}/h2h/${h2hSecond}`;
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
            <div class="match-tooltip-footer">
                <a href="#/teams/${isUserTeamB && !isUserTeamA ? teamBId : teamAId}/h2h/${isUserTeamB && !isUserTeamA ? teamAId : teamBId}" class="match-tooltip-h2h-link">View Head-to-Head</a>
            </div>
        `;

        if (!_rosterTooltip) {
            _rosterTooltip = document.createElement('div');
            _rosterTooltip.className = 'match-tooltip';
            document.body.appendChild(_rosterTooltip);

            // Keep tooltip visible when hovering over it (so links are clickable)
            _rosterTooltip.addEventListener('mouseenter', () => {
                if (_rosterTooltipHideTimeout) {
                    clearTimeout(_rosterTooltipHideTimeout);
                    _rosterTooltipHideTimeout = null;
                }
            });
            _rosterTooltip.addEventListener('mouseleave', () => {
                _rosterTooltipHideTimeout = setTimeout(() => {
                    if (_rosterTooltip) _rosterTooltip.style.display = 'none';
                }, 150);
            });
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
