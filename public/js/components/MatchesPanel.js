// MatchesPanel.js - Matches tab content with proposal cards
// Slice 8.2b: Column layout (3 week columns + upcoming matches column)
// Follows Cache + Listener pattern: Component owns Firebase listeners, services manage cache

const MatchesPanel = (function() {
    'use strict';

    let _container = null;
    let _unsubscribers = [];
    let _availabilityUnsubs = []; // Availability listeners for expanded cards
    let _expandedProposalId = null;
    let _userTeamIds = [];
    let _initialized = false;
    let _archivedExpanded = false;
    let _rosterTooltip = null;
    let _rosterTooltipHideTimeout = null;

    // ─── Initialization ────────────────────────────────────────────────

    /**
     * Initialize the Matches panel
     * @param {string} containerId - DOM container ID
     */
    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) return;

        let currentUser = AuthService.getCurrentUser();

        // Auth may not have resolved yet on direct navigation — wait for it
        if (!currentUser) {
            currentUser = await new Promise((resolve) => {
                const unsub = AuthService.onAuthStateChange((user) => {
                    if (user) {
                        unsub();
                        resolve(user);
                    }
                });
                // Timeout: if no user after 5s, they're genuinely unauthenticated
                setTimeout(() => { unsub(); resolve(null); }, 5000);
            });
        }

        if (!currentUser) {
            _renderUnauthenticated();
            return;
        }

        // Get user's team IDs from Firestore user doc
        _userTeamIds = await _getUserTeamIds(currentUser.uid);
        if (_userTeamIds.length === 0) {
            _renderNoTeams();
            return;
        }

        // Render initial loading state
        _container.innerHTML = '<div class="flex items-center justify-center h-full text-muted-foreground text-sm">Loading proposals...</div>';

        // Attach event listeners ONCE (event delegation handles dynamic content)
        _container.addEventListener('click', _handleClick);
        _container.addEventListener('change', _handleGameTypeChange);
        _container.addEventListener('pointerenter', _handleMatchRowEnter, true);
        _container.addEventListener('pointerleave', _handleMatchRowLeave, true);

        // Set up Firestore listeners for proposals involving user's teams
        await _setupProposalListeners();

        // Set up listener for scheduled matches (for blocked slots + upcoming section)
        await _setupScheduledMatchListeners();

        _initialized = true;
        console.log('📋 MatchesPanel initialized');
    }

    /**
     * Get user's team IDs from their user profile doc
     */
    async function _getUserTeamIds(userId) {
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', userId));
            if (!userDoc.exists()) return [];
            return Object.keys(userDoc.data().teams || {});
        } catch (error) {
            console.error('MatchesPanel: Failed to get user teams:', error);
            return [];
        }
    }

    // ─── Firestore Listeners ───────────────────────────────────────────

    /**
     * Set up listeners for proposals where user's teams are involved.
     * Firestore doesn't support OR on different fields, so we use two queries per team.
     */
    async function _setupProposalListeners() {
        const { collection, query, where, onSnapshot } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        for (const teamId of _userTeamIds) {
            // Proposals where this team is the proposer
            const proposerQuery = query(
                collection(window.firebase.db, 'matchProposals'),
                where('proposerTeamId', '==', teamId)
            );

            _unsubscribers.push(onSnapshot(proposerQuery, (snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'removed') {
                        ProposalService.removeFromCache(change.doc.id);
                    } else {
                        ProposalService.updateCache(change.doc.id, change.doc.data());
                    }
                });
                _renderAll();
            }));

            // Proposals where this team is the opponent
            const opponentQuery = query(
                collection(window.firebase.db, 'matchProposals'),
                where('opponentTeamId', '==', teamId)
            );

            _unsubscribers.push(onSnapshot(opponentQuery, (snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'removed') {
                        ProposalService.removeFromCache(change.doc.id);
                    } else {
                        ProposalService.updateCache(change.doc.id, change.doc.data());
                    }
                });
                _renderAll();
            }));
        }
    }

    /**
     * Set up listener for scheduled matches (all upcoming, for community feed + blocked slots)
     */
    async function _setupScheduledMatchListeners() {
        const { collection, query, where, onSnapshot } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        const matchesQuery = query(
            collection(window.firebase.db, 'scheduledMatches'),
            where('status', '==', 'upcoming')
        );

        _unsubscribers.push(onSnapshot(matchesQuery, (snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'removed') {
                    ScheduledMatchService.removeFromCache(change.doc.id);
                } else {
                    ScheduledMatchService.updateCache(change.doc.id, change.doc.data());
                }
            });
            // Re-render: blocked slots affect slot counts on collapsed cards too
            _renderAll();
        }));
    }

    // ─── Week Helpers ───────────────────────────────────────────────────

    /**
     * Get three consecutive weeks starting from current week.
     * Returns objects with weekId, weekNumber, and dateRange for column headers.
     */
    function _getThreeWeeks() {
        const currentWeek = WeekNavigation.getCurrentWeekNumber();
        const year = new Date().getUTCFullYear();
        return [0, 1, 2].map(offset => {
            const weekNumber = currentWeek + offset;
            const weekId = `${year}-${String(weekNumber).padStart(2, '0')}`;
            const dateRange = _getWeekDateRange(weekNumber, year);
            return { weekId, weekNumber, dateRange };
        });
    }

    /**
     * Get a human-readable date range for a week (e.g., "Feb 9-15")
     */
    function _getWeekDateRange(weekNumber, year) {
        const monday = DateUtils.getMondayOfWeek(weekNumber, year);
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        const monMonth = monday.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        const sunMonth = sunday.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        const monDay = monday.getUTCDate();
        const sunDay = sunday.getUTCDate();

        if (monMonth === sunMonth) {
            return `${monMonth} ${monDay}-${sunDay}`;
        }
        return `${monMonth} ${monDay}-${sunMonth} ${sunDay}`;
    }

    // ─── Rendering ─────────────────────────────────────────────────────

    /**
     * Ensure availability is cached for all teams in active proposals.
     * Called before rendering so computeViableSlots has data to work with.
     */
    async function _ensureAvailabilityLoaded(proposals) {
        const toLoad = [];
        const seen = new Set();
        for (const p of proposals) {
            if (p.status !== 'active') continue;
            const pairs = [
                [p.proposerTeamId, p.weekId],
                [p.opponentTeamId, p.weekId]
            ];
            for (const [teamId, weekId] of pairs) {
                const key = `${teamId}|${weekId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    toLoad.push(AvailabilityService.loadWeekAvailability(teamId, weekId));
                }
            }
        }
        await Promise.all(toLoad);
    }

    /**
     * Render the column layout: 3 week columns + upcoming matches column + archived section
     */
    async function _renderAll() {
        if (!_container) return;

        const proposals = ProposalService.getProposalsFromCache();

        // Pre-load availability for all active proposals so slot counts work
        await _ensureAvailabilityLoaded(proposals);

        const now = new Date();
        const weeks = _getThreeWeeks();

        // Categorize proposals
        const active = [];
        const archived = [];

        for (const p of proposals) {
            if (p.status === 'active') {
                if (p.expiresAt && p.expiresAt.toDate && p.expiresAt.toDate() < now) {
                    archived.push(p);
                } else {
                    active.push(p);
                }
            } else if (p.status === 'confirmed') {
                // Confirmed proposals are no longer shown as cards — their matches appear in upcoming column
            } else {
                archived.push(p);
            }
        }

        // Group active proposals by weekId into columns
        const byWeek = {};
        weeks.forEach(w => byWeek[w.weekId] = []);
        for (const p of active) {
            if (byWeek[p.weekId]) {
                byWeek[p.weekId].push(p);
            }
            // Proposals for weeks outside the 3-column range are not shown
        }

        // Get upcoming scheduled matches for user's teams
        const scheduledMatches = ScheduledMatchService.getUpcomingMatchesForTeams(_userTeamIds);
        scheduledMatches.sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

        _container.innerHTML = `
            <div class="matches-panel h-full flex flex-col">
                <div class="flex-1 flex gap-3 p-3 overflow-hidden min-h-0">
                    ${weeks.map(w => `
                        <div class="flex-1 min-w-0 flex flex-col">
                            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                W${String(w.weekNumber).padStart(2, '0')} · ${w.dateRange}
                            </h3>
                            <div class="flex-1 overflow-y-auto space-y-2">
                                ${byWeek[w.weekId].length > 0
                                    ? byWeek[w.weekId].map(p => _renderProposalCard(p, 'active')).join('')
                                    : '<p class="text-xs text-muted-foreground/50 italic">No proposals</p>'}
                            </div>
                        </div>
                    `).join('')}

                    <div class="w-72 shrink-0 flex flex-col border-l border-border pl-3">
                        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Upcoming Matches
                        </h3>
                        <div class="flex-1 overflow-y-auto">
                            ${scheduledMatches.length > 0
                                ? scheduledMatches.map(m => _renderUpcomingMatchCompact(m)).join('')
                                : '<p class="text-xs text-muted-foreground/50 italic">No scheduled matches</p>'}
                        </div>
                    </div>
                </div>

                ${archived.length > 0 ? _renderArchivedSection(archived) : ''}
            </div>
        `;
    }

    /**
     * Render a single proposal card (collapsed or expanded)
     */
    function _renderProposalCard(proposal, type) {
        const isExpanded = _expandedProposalId === proposal.id;
        const currentUser = AuthService.getCurrentUser();
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const isOpponentSide = _isUserOnSide(proposal, 'opponent');

        // Always show both teams so it's clear who's playing whom
        const displayName = `${proposal.proposerTeamName} vs ${proposal.opponentTeamName}`;

        // Compute viable slot count for badge
        let slotCount = 0;
        if (type === 'active') {
            const slots = ProposalService.computeViableSlots(
                proposal.proposerTeamId,
                proposal.opponentTeamId,
                proposal.weekId,
                proposal.minFilter
            );
            // Filter past slots
            const now = new Date();
            slotCount = slots.filter(s => !_isSlotPast(proposal.weekId, s.slotId, now)).length;
        }

        // Status badge for confirmed
        let statusBadge = '';
        if (type === 'upcoming' && proposal.confirmedSlotId) {
            const display = TimezoneService.formatSlotForDisplay(proposal.confirmedSlotId);
            statusBadge = `<span class="text-xs text-green-400">${display.fullLabel}</span>`;
        }

        const expandedContent = isExpanded && type === 'active'
            ? _renderExpandedProposal(proposal)
            : '';

        const cardClass = type === 'archived' ? 'opacity-50' : '';
        const statusClass = type === 'upcoming' ? 'border-green-500/30' : 'border-border';

        return `
            <div class="proposal-card rounded-lg border ${statusClass} bg-card ${cardClass}"
                 data-proposal-id="${proposal.id}">
                <div class="proposal-card-header flex items-center justify-between p-2.5 cursor-pointer"
                     data-action="toggle-expand" data-proposal-id="${proposal.id}">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-medium truncate">${displayName}</span>
                        ${statusBadge}
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        ${type === 'active' ? `
                            <span class="text-xs text-muted-foreground">${slotCount} slot${slotCount !== 1 ? 's' : ''}</span>
                        ` : ''}
                        <span class="text-xs text-muted-foreground">W${proposal.weekId?.split('-')[1] || '?'}</span>
                        ${type === 'active' ? `
                            <span class="text-muted-foreground text-xs">${isExpanded ? '▲' : '▼'}</span>
                        ` : ''}
                    </div>
                </div>
                ${expandedContent}
            </div>
        `;
    }

    /**
     * Render expanded proposal with live slots
     */
    function _renderExpandedProposal(proposal) {
        const viableSlots = ProposalService.computeViableSlots(
            proposal.proposerTeamId,
            proposal.opponentTeamId,
            proposal.weekId,
            proposal.minFilter
        );

        const now = new Date();
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const isOpponentSide = _isUserOnSide(proposal, 'opponent');
        const canAct = isProposerSide || isOpponentSide;

        const myConfirmedSlots = isProposerSide
            ? (proposal.proposerConfirmedSlots || {})
            : (proposal.opponentConfirmedSlots || {});
        const theirConfirmedSlots = isProposerSide
            ? (proposal.opponentConfirmedSlots || {})
            : (proposal.proposerConfirmedSlots || {});

        // Filter out past slots from display
        const visibleSlots = viableSlots.filter(slot => !_isSlotPast(proposal.weekId, slot.slotId, now));

        const slotsHtml = visibleSlots.map(slot => {
            const myConfirm = myConfirmedSlots[slot.slotId];
            const theirConfirm = theirConfirmedSlots[slot.slotId];
            const iConfirmed = !!myConfirm;
            const theyConfirmed = !!theirConfirm;
            const bothConfirmed = iConfirmed && theyConfirmed;

            // Warning: availability dropped below countAtConfirm
            const myCount = isProposerSide ? slot.proposerCount : slot.opponentCount;
            const droppedWarning = iConfirmed && myConfirm.countAtConfirm && myCount < myConfirm.countAtConfirm;

            const display = TimezoneService.formatSlotForDisplay(slot.slotId);
            const statusIcon = bothConfirmed ? '✓✓' : (theyConfirmed ? '✓ them' : (iConfirmed ? '✓ you' : ''));

            let slotClasses = 'flex items-center justify-between py-1.5 px-2 rounded text-sm';
            if (bothConfirmed) slotClasses += ' bg-green-500/10 border border-green-500/30';
            else if (droppedWarning) slotClasses += ' bg-amber-500/10 border border-amber-500/30';

            return `
                <div class="${slotClasses}" data-slot-id="${slot.slotId}">
                    <div class="flex items-center gap-2 min-w-0">
                        <span>${display.dayLabel.slice(0, 3)} ${display.timeLabel}</span>
                        <span class="text-xs text-muted-foreground">${slot.proposerCount} vs ${slot.opponentCount}</span>
                        ${droppedWarning ? '<span class="text-xs text-amber-400" title="Player dropped since confirmed">⚠</span>' : ''}
                        ${statusIcon ? `<span class="text-xs ${bothConfirmed ? 'text-green-400' : 'text-muted-foreground'}">${statusIcon}</span>` : ''}
                    </div>
                    ${canAct ? `
                        ${iConfirmed ? `
                            <button class="proposal-withdraw-btn text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                                    data-action="withdraw" data-proposal-id="${_expandedProposalId}" data-slot="${slot.slotId}">
                                Withdraw
                            </button>
                        ` : `
                            <div class="flex items-center gap-1">
                                <select class="game-type-select text-xs bg-muted border border-border rounded px-1.5 py-0.5 text-foreground"
                                        data-slot="${slot.slotId}">
                                    <option value="" selected disabled>Type...</option>
                                    <option value="official">Official</option>
                                    <option value="practice">Practice</option>
                                </select>
                                <button class="proposal-confirm-btn text-xs px-2 py-0.5 rounded bg-primary/50 text-primary-foreground cursor-not-allowed"
                                        data-action="confirm" data-proposal-id="${_expandedProposalId}" data-slot="${slot.slotId}"
                                        disabled>
                                    Confirm
                                </button>
                            </div>
                        `}
                    ` : ''}
                </div>
            `;
        }).join('');

        // "Load Grid View" and "Cancel" buttons
        const opponentTeamId = isProposerSide ? proposal.opponentTeamId : proposal.proposerTeamId;

        return `
            <div class="proposal-expanded border-t border-border p-2.5">
                <div class="text-xs text-muted-foreground mb-2">
                    Min ${proposal.minFilter?.yourTeam || 1}v${proposal.minFilter?.opponent || 1}
                </div>
                <div class="space-y-1">
                    ${slotsHtml || '<p class="text-xs text-muted-foreground italic">No viable slots this week</p>'}
                </div>
                <div class="flex gap-2 mt-3">
                    <button class="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                            data-action="load-grid" data-team="${opponentTeamId}"
                            data-week="${proposal.weekId}"
                            data-min-your="${proposal.minFilter?.yourTeam || 1}"
                            data-min-opp="${proposal.minFilter?.opponent || 1}">
                        Load Grid View
                    </button>
                    ${canAct ? `
                        <button class="text-xs px-2 py-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                data-action="cancel-proposal" data-proposal-id="${proposal.id}">
                            Cancel
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render a single upcoming match in compact format (no card border)
     */
    function _renderUpcomingMatchCompact(match) {
        const teamA = TeamService.getTeamFromCache(match.teamAId);
        const teamB = TeamService.getTeamFromCache(match.teamBId);
        const logoA = teamA?.activeLogo?.urls?.small || '';
        const logoB = teamB?.activeLogo?.urls?.small || '';
        // Format slot display — extract day abbreviation + time separately
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

        // Division from either team
        const div = teamA?.divisions?.[0] || teamB?.divisions?.[0] || '';

        // Game type badge
        const gameType = match.gameType || 'official';
        const gameTypeBadge = gameType === 'practice'
            ? '<span class="text-xs text-amber-400/80 font-medium">PRAC</span>'
            : '<span class="text-xs text-green-400/80 font-medium">OFF</span>';

        const canCancel = _canUserCancelMatch(match);

        return `
            <div class="upcoming-match-row py-2 group"
                 data-team-a="${match.teamAId}" data-team-b="${match.teamBId}"
                 data-week-id="${match.weekId || ''}" data-slot-id="${match.slotId || ''}">
                <div class="flex items-center min-w-0 gap-1">
                    ${logoA ? `<img src="${logoA}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">` : ''}
                    <span class="text-sm font-medium truncate shrink min-w-0">${_escapeHtml(match.teamAName)}</span>
                    <span class="text-xs text-muted-foreground shrink-0 px-1">vs</span>
                    <span class="text-sm font-medium truncate shrink min-w-0 text-right">${_escapeHtml(match.teamBName)}</span>
                    ${logoB ? `<img src="${logoB}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">` : ''}
                </div>
                <div class="flex items-center justify-center gap-2">
                    ${gameTypeBadge}
                    <span class="text-xs text-muted-foreground">${dateDisplay} ${dayAbbr} ${timeOnly}${div ? ` (${div})` : ''}</span>
                    ${canCancel ? `
                        <button class="text-xs text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                data-action="cancel-match" data-match-id="${match.id}">
                            Cancel
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Check if current user can cancel a scheduled match
     */
    function _canUserCancelMatch(match) {
        const userId = AuthService.getCurrentUser()?.uid;
        if (!userId) return false;
        return TeamService.isScheduler(match.teamAId, userId) ||
               TeamService.isScheduler(match.teamBId, userId);
    }

    /**
     * Render the archived section (collapsed by default)
     */
    function _renderArchivedSection(archived) {
        const cardsHtml = _archivedExpanded
            ? archived.map(p => _renderProposalCard(p, 'archived')).join('')
            : '';

        return `
            <div class="border-t border-border px-3 py-2">
                <button class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                        data-action="toggle-archived">
                    <span>${_archivedExpanded ? '▼' : '▶'}</span>
                    <span>Archived (${archived.length})</span>
                </button>
                ${_archivedExpanded ? `
                    <div class="mt-2 space-y-2">
                        ${cardsHtml}
                    </div>
                ` : ''}
            </div>
        `;
    }

    function _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Render empty states
     */
    function _renderUnauthenticated() {
        if (!_container) return;
        _container.innerHTML = `
            <div class="flex items-center justify-center h-full text-muted-foreground text-sm">
                Sign in to view match proposals
            </div>
        `;
    }

    function _renderNoTeams() {
        if (!_container) return;
        _container.innerHTML = `
            <div class="flex items-center justify-center h-full text-muted-foreground text-sm">
                Join a team to create and view match proposals
            </div>
        `;
    }

    // ─── Event Handlers ────────────────────────────────────────────────

    /**
     * Handle game type dropdown change - enable/disable Confirm button
     */
    function _handleGameTypeChange(e) {
        const select = e.target.closest('.game-type-select');
        if (!select) return;

        const slotId = select.dataset.slot;
        const row = select.closest('[data-slot-id]');
        if (!row) return;

        const confirmBtn = row.querySelector('.proposal-confirm-btn');
        if (!confirmBtn) return;

        if (select.value) {
            // Valid selection - enable button
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('bg-primary/50', 'cursor-not-allowed');
            confirmBtn.classList.add('bg-primary', 'hover:bg-primary/80');
        } else {
            // No selection - disable button
            confirmBtn.disabled = true;
            confirmBtn.classList.add('bg-primary/50', 'cursor-not-allowed');
            confirmBtn.classList.remove('bg-primary', 'hover:bg-primary/80');
        }
    }

    /**
     * Central click handler using event delegation
     */
    async function _handleClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const proposalId = target.dataset.proposalId;
        const slotId = target.dataset.slot;

        switch (action) {
            case 'toggle-expand':
                await _handleToggleExpand(proposalId);
                break;
            case 'confirm':
                await _handleConfirmSlot(proposalId, slotId, target);
                break;
            case 'withdraw':
                await _handleWithdrawSlot(proposalId, slotId, target);
                break;
            case 'cancel-proposal':
                await _handleCancelProposal(proposalId, target);
                break;
            case 'load-grid':
                _handleLoadGridView(target.dataset.team, target.dataset.week, target.dataset.minYour, target.dataset.minOpp);
                break;
            case 'cancel-match':
                await _handleCancelMatch(target.dataset.matchId, target);
                break;
            case 'toggle-archived':
                _archivedExpanded = !_archivedExpanded;
                _renderAll();
                break;
        }
    }

    /**
     * Toggle expand/collapse of a proposal card.
     * On expand: subscribe to availability for both teams.
     * On collapse: unsubscribe.
     */
    async function _handleToggleExpand(proposalId) {
        if (_expandedProposalId === proposalId) {
            // Collapse
            _collapseCard();
            _renderAll();
            return;
        }

        // Collapse previous if any
        _collapseCard();

        // Expand new card
        _expandedProposalId = proposalId;
        const proposal = ProposalService.getProposal(proposalId);

        if (proposal && proposal.status === 'active') {
            // Subscribe to availability for both teams (live slot updates)
            await _subscribeToAvailability(proposal);
        }

        _renderAll();
    }

    /**
     * Subscribe to availability for both teams in a proposal
     */
    async function _subscribeToAvailability(proposal) {
        const weekId = proposal.weekId;

        // Ensure availability data is loaded for both teams
        await Promise.all([
            AvailabilityService.loadWeekAvailability(proposal.proposerTeamId, weekId),
            AvailabilityService.loadWeekAvailability(proposal.opponentTeamId, weekId)
        ]);

        // Subscribe to real-time updates
        await AvailabilityService.subscribe(proposal.proposerTeamId, weekId, () => {
            if (_expandedProposalId === proposal.id) {
                _renderAll();
            }
        });
        _availabilityUnsubs.push({ teamId: proposal.proposerTeamId, weekId });

        await AvailabilityService.subscribe(proposal.opponentTeamId, weekId, () => {
            if (_expandedProposalId === proposal.id) {
                _renderAll();
            }
        });
        _availabilityUnsubs.push({ teamId: proposal.opponentTeamId, weekId });
    }

    /**
     * Collapse the currently expanded card and unsubscribe availability listeners
     */
    function _collapseCard() {
        _expandedProposalId = null;

        // Unsubscribe from availability listeners
        for (const { teamId, weekId } of _availabilityUnsubs) {
            AvailabilityService.unsubscribe(teamId, weekId);
        }
        _availabilityUnsubs = [];
    }

    /**
     * Confirm a slot
     */
    async function _handleConfirmSlot(proposalId, slotId, btn) {
        // Get game type from sibling select
        const row = btn.closest('[data-slot-id]');
        const gameTypeSelect = row?.querySelector('.game-type-select');
        const gameType = gameTypeSelect?.value;

        if (!gameType) {
            ToastService.showError('Please select Official or Practice');
            return;
        }

        btn.disabled = true;
        btn.textContent = '...';

        try {
            const result = await ProposalService.confirmSlot(proposalId, slotId, gameType);

            if (result.success) {
                if (result.matched && result.matchDetails) {
                    // Show the sealed notification modal with Discord message template
                    _showMatchSealedModal(result.matchDetails);
                } else if (result.matched) {
                    ToastService.showSuccess('Match scheduled! Both teams confirmed.');
                } else {
                    ToastService.showSuccess('Slot confirmed — waiting for opponent');
                }
                // UI updates via listener automatically
            } else {
                ToastService.showError(result.error || 'Failed to confirm');
                btn.disabled = false;
                btn.textContent = 'Confirm';
            }
        } catch (error) {
            console.error('Confirm slot error:', error);
            ToastService.showError('Network error — please try again');
            btn.disabled = false;
            btn.textContent = 'Confirm';
        }
    }

    /**
     * Show the match sealed modal with opponent Discord info
     */
    async function _showMatchSealedModal(matchDetails) {
        let opponentDiscordId = null;

        // Try to fetch opponent leader's Discord ID for the DM button
        if (matchDetails.opponentLeaderId) {
            try {
                const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
                const userDoc = await getDoc(doc(window.firebase.db, 'users', matchDetails.opponentLeaderId));
                if (userDoc.exists()) {
                    opponentDiscordId = userDoc.data().discordUserId || null;
                }
            } catch (err) {
                console.warn('Could not fetch opponent Discord info:', err);
            }
        }

        MatchSealedModal.show(matchDetails, opponentDiscordId);
    }

    /**
     * Withdraw a confirmation
     */
    async function _handleWithdrawSlot(proposalId, slotId, btn) {
        btn.disabled = true;
        btn.textContent = '...';

        try {
            const result = await ProposalService.withdrawConfirmation(proposalId, slotId);

            if (result.success) {
                ToastService.showSuccess('Confirmation withdrawn');
            } else {
                ToastService.showError(result.error || 'Failed to withdraw');
                btn.disabled = false;
                btn.textContent = 'Withdraw';
            }
        } catch (error) {
            console.error('Withdraw error:', error);
            ToastService.showError('Network error — please try again');
            btn.disabled = false;
            btn.textContent = 'Withdraw';
        }
    }

    /**
     * Cancel a proposal
     */
    async function _handleCancelProposal(proposalId, btn) {
        btn.disabled = true;
        btn.textContent = 'Cancelling...';

        try {
            const result = await ProposalService.cancelProposal(proposalId);

            if (result.success) {
                ToastService.showSuccess('Proposal cancelled');
                if (_expandedProposalId === proposalId) {
                    _collapseCard();
                }
            } else {
                ToastService.showError(result.error || 'Failed to cancel');
                btn.disabled = false;
                btn.textContent = 'Cancel';
            }
        } catch (error) {
            console.error('Cancel proposal error:', error);
            ToastService.showError('Network error — please try again');
            btn.disabled = false;
            btn.textContent = 'Cancel';
        }
    }

    /**
     * Cancel a scheduled match (revert proposal to active)
     */
    async function _handleCancelMatch(matchId, btn) {
        const confirmed = confirm('Cancel this scheduled match? The proposal will revert to active so you can pick a different slot.');
        if (!confirmed) return;

        btn.disabled = true;
        btn.textContent = 'Cancelling...';

        try {
            const result = await ProposalService.cancelScheduledMatch(matchId);
            if (result.success) {
                ToastService.showSuccess('Match cancelled. Proposal is active again.');
                // UI updates via listeners — match disappears from upcoming, proposal reappears in active
            } else {
                ToastService.showError(result.error || 'Failed to cancel match');
            }
        } catch (error) {
            console.error('Cancel match failed:', error);
            ToastService.showError('Network error — please try again');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Cancel';
            }
        }
    }

    /**
     * Load Grid View shortcut — switch to calendar tab with comparison set up
     * Navigates to the proposal's week, selects opponent, sets filters, activates comparison.
     */
    function _handleLoadGridView(opponentTeamId, weekId, minYour, minOpp) {
        if (!opponentTeamId || !weekId) {
            console.error('Load Grid View: missing opponentTeamId or weekId');
            return;
        }

        console.log('📅 Load Grid View:', { opponentTeamId, weekId, minYour, minOpp });

        try {
            // 1. Navigate to the proposal's week (must happen before comparison calculates)
            const weekNumber = parseInt(weekId.split('-')[1]);
            WeekNavigation.setWeekNumber(weekNumber);

            // 2. Switch to calendar tab
            BottomPanelController.switchTab('calendar');

            // 3. Select the opponent team in the browser
            if (typeof TeamBrowserState !== 'undefined') {
                TeamBrowserState.clearSelection();
                TeamBrowserState.selectTeam(opponentTeamId);
            }

            // 4. Set min-vs-min filters
            const filters = {
                yourTeam: parseInt(minYour) || 1,
                opponent: parseInt(minOpp) || 1
            };
            window.dispatchEvent(new CustomEvent('filter-changed', { detail: filters }));

            // 5. Enable reactive comparison mode (auto-mode from 8.1b)
            // Team selection (step 3) and filter dispatch (step 4) will trigger recalculation
            if (_userTeamIds.length > 0) {
                ComparisonEngine.enableAutoMode(_userTeamIds[0]);
            } else {
                console.warn('Load Grid View: no user teams available for comparison');
            }
        } catch (error) {
            console.error('❌ Load Grid View failed:', error);
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    /**
     * Check if current user can act as leader/scheduler for a side of the proposal
     */
    function _isUserOnSide(proposal, side) {
        const teamId = side === 'proposer' ? proposal.proposerTeamId : proposal.opponentTeamId;
        const userId = AuthService.getCurrentUser()?.uid;
        if (!userId) return false;
        return TeamService.isScheduler(teamId, userId);
    }

    /**
     * Check if a UTC slot is in the past for a given week
     */
    function _isSlotPast(weekId, slotId, now) {
        // Parse weekId (YYYY-WW) and slotId (ddd_HHMM)
        const [yearStr, weekStr] = weekId.split('-');
        const year = parseInt(yearStr);
        const week = parseInt(weekStr);

        const dayMap = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
        const [day, time] = slotId.split('_');
        const dayOffset = dayMap[day] || 0;
        const hour = parseInt(time.slice(0, 2));
        const minute = parseInt(time.slice(2));

        const monday = DateUtils.getMondayOfWeek(week, year);
        const slotDate = new Date(monday);
        slotDate.setUTCDate(monday.getUTCDate() + dayOffset);
        slotDate.setUTCHours(hour, minute, 0, 0);

        return slotDate < now;
    }

    // ─── Roster Tooltip ────────────────────────────────────────────────

    function _handleMatchRowEnter(e) {
        const row = e.target.closest('.upcoming-match-row');
        if (!row) return;
        if (_rosterTooltipHideTimeout) {
            clearTimeout(_rosterTooltipHideTimeout);
            _rosterTooltipHideTimeout = null;
        }
        _showRosterTooltip(row);
    }

    function _handleMatchRowLeave(e) {
        const row = e.target.closest('.upcoming-match-row');
        if (!row) return;
        _rosterTooltipHideTimeout = setTimeout(() => {
            if (_rosterTooltip) _rosterTooltip.style.display = 'none';
        }, 150);
    }

    async function _showRosterTooltip(row) {
        const teamAId = row.dataset.teamA;
        const teamBId = row.dataset.teamB;
        const weekId = row.dataset.weekId;
        const slotId = row.dataset.slotId;
        if (!teamAId || !teamBId || !weekId || !slotId) return;

        // Get roster from TeamService cache
        const teamA = TeamService.getTeamFromCache(teamAId);
        const teamB = TeamService.getTeamFromCache(teamBId);
        if (!teamA || !teamB) return;

        const rosterA = teamA.playerRoster || [];
        const rosterB = teamB.playerRoster || [];

        // Load availability for both teams
        let availA = { slots: {} };
        let availB = { slots: {} };
        try {
            [availA, availB] = await Promise.all([
                AvailabilityService.loadWeekAvailability(teamAId, weekId),
                AvailabilityService.loadWeekAvailability(teamBId, weekId)
            ]);
        } catch (err) {
            console.warn('Failed to load availability for tooltip:', err);
        }

        const availableIdsA = availA.slots?.[slotId] || [];
        const availableIdsB = availB.slots?.[slotId] || [];

        // Split rosters into available/unavailable
        const teamAAvailable = rosterA.filter(p => availableIdsA.includes(p.userId));
        const teamAUnavailable = rosterA.filter(p => !availableIdsA.includes(p.userId));
        const teamBAvailable = rosterB.filter(p => availableIdsB.includes(p.userId));
        const teamBUnavailable = rosterB.filter(p => !availableIdsB.includes(p.userId));

        // Build tooltip HTML using existing CSS classes
        const currentUserId = AuthService.getCurrentUser()?.uid;

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

        // Create or reuse tooltip element
        if (!_rosterTooltip) {
            _rosterTooltip = document.createElement('div');
            _rosterTooltip.className = 'match-tooltip';
            document.body.appendChild(_rosterTooltip);
        }

        _rosterTooltip.innerHTML = html;

        // Position tooltip near the row
        const rowRect = row.getBoundingClientRect();
        _rosterTooltip.style.visibility = 'hidden';
        _rosterTooltip.style.display = 'block';
        const ttRect = _rosterTooltip.getBoundingClientRect();

        let left = rowRect.left;
        let top = rowRect.bottom + 4;

        // If tooltip would go off bottom, show above
        if (top + ttRect.height > window.innerHeight - 8) {
            top = rowRect.top - ttRect.height - 4;
        }
        // If tooltip would go off right edge, shift left
        if (left + ttRect.width > window.innerWidth - 8) {
            left = window.innerWidth - ttRect.width - 8;
        }
        if (left < 8) left = 8;
        if (top < 8) top = 8;

        _rosterTooltip.style.left = `${left}px`;
        _rosterTooltip.style.top = `${top}px`;
        _rosterTooltip.style.visibility = 'visible';
    }

    // ─── Cleanup ───────────────────────────────────────────────────────

    /**
     * Cleanup all listeners and state
     */
    function cleanup() {
        // Unsubscribe all proposal/match listeners
        _unsubscribers.forEach(unsub => unsub());
        _unsubscribers = [];

        // Collapse expanded card (unsubscribes availability)
        _collapseCard();

        // Remove event listeners
        if (_container) {
            _container.removeEventListener('click', _handleClick);
            _container.removeEventListener('change', _handleGameTypeChange);
            _container.removeEventListener('pointerenter', _handleMatchRowEnter, true);
            _container.removeEventListener('pointerleave', _handleMatchRowLeave, true);
        }

        // Remove roster tooltip
        if (_rosterTooltip) {
            _rosterTooltip.remove();
            _rosterTooltip = null;
        }
        if (_rosterTooltipHideTimeout) {
            clearTimeout(_rosterTooltipHideTimeout);
            _rosterTooltipHideTimeout = null;
        }

        _container = null;
        _userTeamIds = [];
        _expandedProposalId = null;
        _archivedExpanded = false;
        _initialized = false;

        console.log('🧹 MatchesPanel cleaned up');
    }

    // ─── Public API ────────────────────────────────────────────────────

    return {
        init,
        cleanup
    };
})();
