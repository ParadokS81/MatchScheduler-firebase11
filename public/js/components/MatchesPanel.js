// MatchesPanel.js - Matches tab content with proposal cards
// Slice 8.0b: Three-section layout (Active Proposals / Upcoming / Archived)
// Follows Cache + Listener pattern: Component owns Firebase listeners, services manage cache

const MatchesPanel = (function() {
    'use strict';

    let _container = null;
    let _unsubscribers = [];
    let _availabilityUnsubs = []; // Availability listeners for expanded cards
    let _expandedProposalId = null;
    let _userTeamIds = [];
    let _initialized = false;

    // ─── Initialization ────────────────────────────────────────────────

    /**
     * Initialize the Matches panel
     * @param {string} containerId - DOM container ID
     */
    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) return;

        const currentUser = AuthService.getCurrentUser();
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

        // Attach event listener ONCE (event delegation handles dynamic content)
        _container.addEventListener('click', _handleClick);

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
     * Render all sections
     */
    async function _renderAll() {
        if (!_container) return;

        const proposals = ProposalService.getProposalsFromCache();

        // Pre-load availability for all active proposals so slot counts work
        await _ensureAvailabilityLoaded(proposals);

        const now = new Date();

        // Categorize proposals
        const active = [];
        const upcoming = [];
        const archived = [];

        for (const p of proposals) {
            if (p.status === 'active') {
                // Check if expired (all slots past)
                if (p.expiresAt && p.expiresAt.toDate && p.expiresAt.toDate() < now) {
                    archived.push(p);
                } else {
                    active.push(p);
                }
            } else if (p.status === 'confirmed') {
                upcoming.push(p);
            } else {
                // cancelled, expired
                archived.push(p);
            }
        }

        _container.innerHTML = `
            <div class="matches-panel h-full overflow-y-auto p-3 space-y-4">
                ${_renderSection('Active Proposals', active, 'active')}
                ${_renderSection('Upcoming Matches', upcoming, 'upcoming')}
                ${archived.length > 0 ? _renderSection('Archived', archived, 'archived') : ''}
            </div>
        `;
    }

    /**
     * Render a section with its proposals
     */
    function _renderSection(title, proposals, type) {
        if (proposals.length === 0 && type !== 'active') {
            return '';
        }

        const cardsHtml = proposals.length > 0
            ? proposals.map(p => _renderProposalCard(p, type)).join('')
            : `<p class="text-xs text-muted-foreground italic px-2">No ${type} proposals</p>`;

        return `
            <div class="matches-section">
                <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">${title}</h3>
                <div class="space-y-2">
                    ${cardsHtml}
                </div>
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
                            <button class="proposal-confirm-btn text-xs px-2 py-0.5 rounded bg-primary hover:bg-primary/80 text-primary-foreground"
                                    data-action="confirm" data-proposal-id="${_expandedProposalId}" data-slot="${slot.slotId}">
                                Confirm
                            </button>
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
        btn.disabled = true;
        btn.textContent = '...';

        try {
            const result = await ProposalService.confirmSlot(proposalId, slotId);

            if (result.success) {
                if (result.matched) {
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

        // Remove click listener
        if (_container) {
            _container.removeEventListener('click', _handleClick);
        }

        _container = null;
        _userTeamIds = [];
        _expandedProposalId = null;
        _initialized = false;

        console.log('🧹 MatchesPanel cleaned up');
    }

    // ─── Public API ────────────────────────────────────────────────────

    return {
        init,
        cleanup
    };
})();
