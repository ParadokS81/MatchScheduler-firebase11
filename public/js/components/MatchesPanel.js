// MatchesPanel.js - Matches tab content with proposal cards
// Slice 8.3: Proposals by week (left) | Scheduled matches (right) with Discord contact
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
    let _selectedGameTypes = {}; // proposalId → 'official' | 'practice' | null
    let _rosterTooltip = null;
    let _rosterTooltipAnchor = null; // DOM element that triggered the tooltip

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
        _container.addEventListener('pointerenter', _handleMatchRowEnter, true);
        _container.addEventListener('pointerleave', _handleMatchRowLeave, true);

        // Dismiss tooltip on click, scroll, or leaving the container entirely
        document.addEventListener('click', _hideRosterTooltip, true);
        _container.addEventListener('scroll', _hideRosterTooltip, true);
        _container.addEventListener('mouseleave', _hideRosterTooltip);

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
     * Get the current week as an object with weekId, weekNumber, dateRange.
     */
    function _getCurrentWeek() {
        const currentWeek = DateUtils.getCurrentWeekNumber();
        const year = DateUtils.getISOWeekYear(new Date());
        const weekId = `${year}-${String(currentWeek).padStart(2, '0')}`;
        const dateRange = _getWeekDateRange(currentWeek, year);
        return { weekId, weekNumber: currentWeek, dateRange };
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
     * Render 2-column layout: PROPOSALS BY WEEK (left ~60%) | SCHEDULED MATCHES (right ~40%) + archived
     */
    async function _renderAll() {
        if (!_container) return;

        // Hide tooltip before re-render (DOM elements are about to be destroyed)
        _hideRosterTooltip();

        const proposals = ProposalService.getProposalsFromCache();

        // Pre-load availability for all active proposals so slot counts work
        await _ensureAvailabilityLoaded(proposals);

        const now = new Date();
        const currentWeek = _getCurrentWeek();

        // ─── Categorize proposals ───────────────────────────────
        const currentWeekProposals = [];
        const futureWeekGroups = {};   // weekId → proposals[]
        const pastWeekGroups = {};     // weekId → proposals[]
        const archived = [];

        for (const p of proposals) {
            if (p.status === 'active') {
                if (p.expiresAt && p.expiresAt.toDate && p.expiresAt.toDate() < now) {
                    archived.push(p);
                } else if (p.weekId === currentWeek.weekId) {
                    currentWeekProposals.push(p);
                } else if (p.weekId > currentWeek.weekId) {
                    if (!futureWeekGroups[p.weekId]) futureWeekGroups[p.weekId] = [];
                    futureWeekGroups[p.weekId].push(p);
                } else {
                    // Past week — still active proposal but week has passed
                    if (!pastWeekGroups[p.weekId]) pastWeekGroups[p.weekId] = [];
                    pastWeekGroups[p.weekId].push(p);
                }
            } else if (p.status === 'confirmed') {
                // Confirmed proposals are no longer shown as cards — their matches appear in right column
            } else {
                archived.push(p);
            }
        }

        const futureWeekIds = Object.keys(futureWeekGroups).sort();
        const pastWeekIds = Object.keys(pastWeekGroups).sort().reverse(); // Most recent past first

        // ─── Scheduled matches (right column) ───────────────────
        const scheduledMatches = ScheduledMatchService.getUpcomingMatchesForTeams(_userTeamIds);
        scheduledMatches.sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

        // ─── Build left column: proposals grouped by week ───────
        let leftColumnHtml = '';

        // Current week group
        leftColumnHtml += `
            <div class="week-group">
                <div class="week-group-header current">
                    This Week · W${String(currentWeek.weekNumber).padStart(2, '0')} · ${currentWeek.dateRange}
                </div>
                <div class="space-y-2">
                    ${currentWeekProposals.length > 0
                        ? currentWeekProposals.map(p => _renderProposalCard(p, 'active')).join('')
                        : '<p class="text-xs text-muted-foreground/50 italic">No proposals this week</p>'}
                </div>
            </div>
        `;

        // Future week groups
        for (const weekId of futureWeekIds) {
            const [yearStr, weekStr] = weekId.split('-');
            const weekNum = parseInt(weekStr);
            const year = parseInt(yearStr);
            const dateRange = _getWeekDateRange(weekNum, year);
            leftColumnHtml += `
                <div class="week-group">
                    <div class="week-group-header">
                        W${String(weekNum).padStart(2, '0')} · ${dateRange}
                    </div>
                    <div class="space-y-2">
                        ${futureWeekGroups[weekId].map(p => _renderProposalCard(p, 'active')).join('')}
                    </div>
                </div>
            `;
        }

        // Past week groups (dimmed)
        for (const weekId of pastWeekIds) {
            const [yearStr, weekStr] = weekId.split('-');
            const weekNum = parseInt(weekStr);
            const year = parseInt(yearStr);
            const dateRange = _getWeekDateRange(weekNum, year);
            leftColumnHtml += `
                <div class="week-group">
                    <div class="week-group-header past">
                        W${String(weekNum).padStart(2, '0')} · ${dateRange}
                    </div>
                    <div class="space-y-2">
                        ${pastWeekGroups[weekId].map(p => _renderProposalCard(p, 'active')).join('')}
                    </div>
                </div>
            `;
        }

        // ─── Assemble layout ────────────────────────────────────
        _container.innerHTML = `
            <div class="matches-panel h-full flex flex-col">
                <div class="flex-1 flex gap-4 p-3 overflow-hidden min-h-0">
                    <!-- LEFT: ALL PROPOSALS BY WEEK -->
                    <div class="flex-[3] min-w-0 flex flex-col overflow-y-auto space-y-4">
                        ${leftColumnHtml}
                    </div>

                    <!-- RIGHT: SCHEDULED MATCHES ONLY -->
                    <div class="flex-[2] min-w-0 flex flex-col border-l border-border pl-4">
                        <div class="flex items-center justify-between mb-2">
                            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Scheduled Matches
                            </h3>
                            ${_canQuickAdd() ? `
                                <button data-action="quick-add-match"
                                        class="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded hover:bg-muted/50"
                                        title="Quick add a pre-arranged match">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                        <div class="flex-1 overflow-y-auto space-y-1">
                            ${scheduledMatches.map(m => _renderUpcomingMatchCompact(m)).join('')}
                        </div>
                    </div>
                </div>

                ${archived.length > 0 ? _renderArchivedSection(archived) : ''}
            </div>
        `;

        // Signal render complete (used by expandProposal for deferred scroll)
        window.dispatchEvent(new CustomEvent('matches-panel-rendered'));
    }

    // Discord SVG icon (reused in card and handlers)
    const DISCORD_ICON_SVG = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`;

    /**
     * Get proposal status text and color for the card status line
     */
    function _getProposalStatus(proposal, isProposerSide) {
        const now = new Date();
        const wk = proposal.weekId;
        const mySlots = Object.keys(
            (isProposerSide ? proposal.proposerConfirmedSlots : proposal.opponentConfirmedSlots) || {}
        );
        const theirSlots = Object.keys(
            (isProposerSide ? proposal.opponentConfirmedSlots : proposal.proposerConfirmedSlots) || {}
        );
        // Only count future confirmed slots (past ones are no longer actionable)
        const myConfirmedCount = mySlots.filter(s => !_isSlotPast(wk, s, now)).length;
        const theirConfirmedCount = theirSlots.filter(s => !_isSlotPast(wk, s, now)).length;

        if (myConfirmedCount > 0 && theirConfirmedCount > 0) {
            return { text: `You confirmed ${myConfirmedCount}, they confirmed ${theirConfirmedCount}`, cls: 'text-green-400' };
        }
        if (theirConfirmedCount > 0) {
            return { text: `They confirmed ${theirConfirmedCount} slot${theirConfirmedCount !== 1 ? 's' : ''}`, cls: 'text-blue-400' };
        }
        if (myConfirmedCount > 0) {
            return { text: `You confirmed ${myConfirmedCount} slot${myConfirmedCount !== 1 ? 's' : ''}`, cls: 'text-primary' };
        }
        return { text: 'Waiting for confirmations', cls: 'text-muted-foreground' };
    }

    /**
     * Render a single proposal card (collapsed: 2-row with logos + status, or expanded)
     */
    function _renderProposalCard(proposal, type) {
        const isExpanded = _expandedProposalId === proposal.id;
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const isOpponentSide = _isUserOnSide(proposal, 'opponent');
        const canAct = isProposerSide || isOpponentSide;
        // Don't show Discord button if user is on both sides (would message themselves)
        const showDiscord = canAct && !(isProposerSide && isOpponentSide) && type === 'active';

        // Team logos from cache
        const proposerTeam = TeamService.getTeamFromCache(proposal.proposerTeamId);
        const opponentTeam = TeamService.getTeamFromCache(proposal.opponentTeamId);
        const proposerLogo = proposerTeam?.activeLogo?.urls?.small || '';
        const opponentLogo = opponentTeam?.activeLogo?.urls?.small || '';

        // Compute viable slot count for badge (with standin math for practice)
        let slotCount = 0;
        if (type === 'active') {
            const standinSettings = proposal.gameType === 'practice'
                ? { proposerStandin: !!proposal.proposerStandin, opponentStandin: !!proposal.opponentStandin }
                : undefined;
            const slots = ProposalService.computeViableSlots(
                proposal.proposerTeamId,
                proposal.opponentTeamId,
                proposal.weekId,
                proposal.minFilter,
                standinSettings
            );
            const now = new Date();
            slotCount = slots.filter(s => !_isSlotPast(proposal.weekId, s.slotId, now)).length;
        }

        // Status line for row 2
        const status = type === 'active' ? _getProposalStatus(proposal, isProposerSide) : { text: '', cls: '' };
        const weekNum = proposal.weekId?.split('-')[1] || '?';

        // Card-level game type toggle state — pre-populate from proposal doc if not set locally
        if (!_selectedGameTypes[proposal.id] && proposal.gameType) {
            _selectedGameTypes[proposal.id] = proposal.gameType;
        }
        const selectedType = _selectedGameTypes[proposal.id] || null;
        // Detect opponent's confirmed game type as a hint
        const theirConfirmedSlots = isProposerSide
            ? (proposal.opponentConfirmedSlots || {})
            : (proposal.proposerConfirmedSlots || {});
        let hintType = null;
        for (const slotData of Object.values(theirConfirmedSlots)) {
            if (slotData.gameType) { hintType = slotData.gameType; break; }
        }

        const expandedContent = isExpanded && type === 'active'
            ? _renderExpandedProposal(proposal)
            : '';

        const cardClass = type === 'archived' ? 'opacity-50' : '';

        return `
            <div class="proposal-card rounded-lg border border-border bg-card ${cardClass}"
                 data-proposal-id="${proposal.id}">
                <!-- Row 1: Logos + Teams + Slot Count + Discord + Expand -->
                <div class="proposal-card-header flex items-center gap-2 p-2.5 cursor-pointer"
                     data-action="toggle-expand" data-proposal-id="${proposal.id}">
                    ${proposerLogo ? `<img src="${proposerLogo}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">` : ''}
                    <span class="text-sm font-medium truncate min-w-0">${_escapeHtml(proposal.proposerTeamName)} vs ${_escapeHtml(proposal.opponentTeamName)}</span>
                    ${opponentLogo ? `<img src="${opponentLogo}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">` : ''}
                    <div class="flex items-center gap-1.5 shrink-0 ml-auto">
                        ${type === 'active' ? `<span class="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">${slotCount}</span>` : ''}
                        ${showDiscord ? `
                            <button class="p-1 rounded hover:bg-[#5865F2]/20 text-muted-foreground hover:text-[#5865F2] transition-colors"
                                    data-action="discord-contact" data-proposal-id="${proposal.id}"
                                    title="Contact opponent on Discord">
                                ${DISCORD_ICON_SVG}
                            </button>
                        ` : ''}
                        ${type === 'active' ? `<span class="text-muted-foreground text-xs">${isExpanded ? '▲' : '▼'}</span>` : ''}
                    </div>
                </div>
                <!-- Row 2: Min filter + Week + Game Type + Status -->
                <div class="flex items-center gap-1.5 px-2.5 pb-2 text-xs">
                    <span class="text-muted-foreground">Min ${proposal.minFilter?.yourTeam || 1}v${proposal.minFilter?.opponent || 1}</span>
                    <span class="text-muted-foreground/50">·</span>
                    <span class="text-muted-foreground">W${weekNum}</span>
                    ${canAct && type === 'active' ? (() => {
                        const myStandin = isProposerSide ? proposal.proposerStandin : proposal.opponentStandin;
                        const theirStandin = isProposerSide ? proposal.opponentStandin : proposal.proposerStandin;
                        const gameTypeIsSet = selectedType || proposal.gameType;
                        const isPrac = gameTypeIsSet === 'practice';
                        return `
                        <span class="text-muted-foreground/50">·</span>
                        <button class="game-type-btn px-1.5 py-0.5 rounded border transition-colors
                                ${selectedType === 'official' ? 'border-green-500 text-green-400 bg-green-500/10' : hintType === 'official' ? 'border-green-500/50 text-green-400/60' : 'border-border text-muted-foreground'}
                                hover:text-green-400 hover:border-green-500/50"
                                data-action="card-game-type" data-proposal-id="${proposal.id}" data-type="official">
                            Official
                        </button>
                        <button class="game-type-btn px-1.5 py-0.5 rounded border transition-colors
                                ${selectedType === 'practice' ? 'border-amber-500 text-amber-400 bg-amber-500/10' : hintType === 'practice' ? 'border-amber-500/50 text-amber-400/60' : 'border-border text-muted-foreground'}
                                hover:text-amber-400 hover:border-amber-500/50"
                                data-action="card-game-type" data-proposal-id="${proposal.id}" data-type="practice">
                            Practice
                        </button>
                        ${isPrac ? `
                            <button class="px-1.5 py-0.5 rounded border text-xs transition-colors
                                    ${myStandin ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-border text-muted-foreground hover:text-cyan-400 hover:border-cyan-500/50'}"
                                    data-action="toggle-standin" data-proposal-id="${proposal.id}"
                                    title="Toggle standin (+1) for your team">
                                SI${myStandin ? ' ✓' : ''}
                            </button>
                            ${theirStandin ? '<span class="text-cyan-400/60 text-xs" title="Opponent has standin enabled">+SI</span>' : ''}
                        ` : ''}`;
                    })() : ''}
                    ${status.text ? `
                        <span class="text-muted-foreground/50">·</span>
                        <span class="${status.cls}">${status.text}</span>
                    ` : ''}
                </div>
                ${expandedContent}
            </div>
        `;
    }

    /**
     * Render expanded proposal with live slots
     */
    function _renderExpandedProposal(proposal) {
        const standinSettings = proposal.gameType === 'practice'
            ? { proposerStandin: !!proposal.proposerStandin, opponentStandin: !!proposal.opponentStandin }
            : undefined;
        const viableSlots = ProposalService.computeViableSlots(
            proposal.proposerTeamId,
            proposal.opponentTeamId,
            proposal.weekId,
            proposal.minFilter,
            standinSettings
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

        // Card-level game type selection for Confirm buttons
        const cardGameType = _selectedGameTypes[proposal.id] || null;
        const hasGameType = !!cardGameType;
        const gameTypeLabel = cardGameType === 'practice' ? 'Practice' : 'Official';

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

            // Build status text with game type labels
            const myTypeLabel = iConfirmed && myConfirm.gameType
                ? (myConfirm.gameType === 'practice' ? 'PRAC' : 'OFFI') : '';
            const theirTypeLabel = theyConfirmed && theirConfirm.gameType
                ? (theirConfirm.gameType === 'practice' ? 'PRAC' : 'OFFI') : '';

            let statusIcon = '';
            if (bothConfirmed) {
                statusIcon = `✓✓ ${myTypeLabel}`;
            } else if (theyConfirmed) {
                statusIcon = `✓ them${theirTypeLabel ? ` (${theirTypeLabel})` : ''}`;
            } else if (iConfirmed) {
                statusIcon = '✓ you';
            }

            let rowClasses = 'slot-row py-1.5 px-2 rounded text-sm';
            if (bothConfirmed) rowClasses += ' bg-green-500/10 border border-green-500/30';
            else if (droppedWarning) rowClasses += ' bg-amber-500/10 border border-amber-500/30';

            return `
                <div class="${rowClasses}"
                     data-slot-id="${slot.slotId}"
                     data-team-a="${proposal.proposerTeamId}" data-team-b="${proposal.opponentTeamId}"
                     data-week-id="${proposal.weekId}">
                    <span class="slot-col-day font-medium">${display.dayLabel}</span>
                    <span class="slot-col-time font-medium">${display.timeLabel}</span>
                    <span class="slot-col-count text-xs text-muted-foreground cursor-help">${slot.proposerStandin ? slot.proposerCount + '<span class="text-cyan-400">+1</span>' : slot.proposerCount}v${slot.opponentStandin ? slot.opponentCount + '<span class="text-cyan-400">+1</span>' : slot.opponentCount}</span>
                    <span class="slot-col-status text-xs">
                        ${droppedWarning ? '<span class="text-amber-400" title="Player count dropped since confirmed">⚠</span>' : ''}
                        ${statusIcon ? `<span class="${bothConfirmed ? 'text-green-400' : 'text-muted-foreground'}">${statusIcon}</span>` : ''}
                    </span>
                    <div class="slot-col-actions flex items-center gap-1 justify-end">
                        ${canAct ? `
                            ${iConfirmed ? `
                                ${myTypeLabel ? `<span class="text-xs text-muted-foreground">${myTypeLabel}</span>` : ''}
                                <button class="proposal-withdraw-btn text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                                        data-action="withdraw" data-proposal-id="${_expandedProposalId}" data-slot="${slot.slotId}">
                                    Withdraw
                                </button>
                            ` : `
                                <button class="proposal-confirm-btn text-xs px-2 py-0.5 rounded border transition-colors
                                        ${hasGameType
                                            ? 'bg-primary text-primary-foreground hover:bg-primary/80 border-primary'
                                            : 'border-border text-muted-foreground/40 cursor-not-allowed'}"
                                        data-action="confirm" data-proposal-id="${_expandedProposalId}" data-slot="${slot.slotId}"
                                        ${hasGameType ? '' : 'disabled'}
                                        title="${hasGameType ? `Confirm as ${gameTypeLabel}` : 'Select OFF or PRAC above'}">
                                    Confirm
                                </button>
                            `}
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // "Load Grid View" and "Cancel" buttons
        const opponentTeamId = isProposerSide ? proposal.opponentTeamId : proposal.proposerTeamId;

        return `
            <div class="proposal-expanded border-t border-border p-2.5">
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
            : '<span class="text-xs text-green-400/80 font-medium">OFFI</span>';

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
     * Handle card-level game type toggle — persists to proposal doc via backend
     */
    async function _handleCardGameType(target) {
        const proposalId = target.dataset.proposalId;
        const gameType = target.dataset.type; // 'official' or 'practice'
        if (!proposalId) return;

        // Toggle: clicking the already-selected type deselects it
        const newType = _selectedGameTypes[proposalId] === gameType ? null : gameType;

        // Optimistic update
        if (newType) {
            _selectedGameTypes[proposalId] = newType;
        } else {
            delete _selectedGameTypes[proposalId];
        }
        _renderAll();

        // Persist to backend (only if setting, not unsetting)
        if (newType) {
            try {
                await ProposalService.updateProposalSettings({ proposalId, gameType: newType });
            } catch (err) {
                console.error('Failed to update game type:', err);
            }
        }
    }

    /**
     * Handle standin toggle — persists to proposal doc via backend
     */
    async function _handleStandinToggle(target) {
        const proposalId = target.dataset.proposalId;
        if (!proposalId) return;

        const proposal = ProposalService.getProposal(proposalId);
        if (!proposal) return;

        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const currentValue = isProposerSide ? proposal.proposerStandin : proposal.opponentStandin;
        const newValue = !currentValue;

        // Optimistic UI update via re-render (listener will confirm)
        try {
            await ProposalService.updateProposalSettings({ proposalId, standin: newValue });
        } catch (err) {
            console.error('Failed to toggle standin:', err);
            ToastService.showError('Failed to update standin');
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
            case 'discord-contact':
                e.stopPropagation();
                await _handleDiscordContact(proposalId);
                return; // Don't let toggle-expand fire
            case 'card-game-type':
                _handleCardGameType(target);
                return;
            case 'toggle-standin':
                _handleStandinToggle(target);
                return;
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
            case 'quick-add-match':
                _handleQuickAddMatch();
                break;
        }
    }

    /**
     * Check if current user can quick-add matches (is leader/scheduler on any team).
     */
    function _canQuickAdd() {
        const userId = AuthService.getCurrentUser()?.uid;
        if (!userId) return false;
        return _userTeamIds.some(tid => TeamService.isScheduler(tid, userId));
    }

    /**
     * Open the Quick Add Match modal with user's scheduler team IDs.
     */
    function _handleQuickAddMatch() {
        const userId = AuthService.getCurrentUser()?.uid;
        if (!userId) return;
        const schedulerTeamIds = _userTeamIds.filter(tid => TeamService.isScheduler(tid, userId));
        if (schedulerTeamIds.length === 0) return;
        QuickAddMatchModal.show(schedulerTeamIds);
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

        // Subscribe to real-time updates (store callbacks for targeted unsubscribe)
        const proposerCb = () => {
            if (_expandedProposalId === proposal.id) {
                _renderAll();
            }
        };
        await AvailabilityService.subscribe(proposal.proposerTeamId, weekId, proposerCb);
        _availabilityUnsubs.push({ teamId: proposal.proposerTeamId, weekId, callback: proposerCb });

        const opponentCb = () => {
            if (_expandedProposalId === proposal.id) {
                _renderAll();
            }
        };
        await AvailabilityService.subscribe(proposal.opponentTeamId, weekId, opponentCb);
        _availabilityUnsubs.push({ teamId: proposal.opponentTeamId, weekId, callback: opponentCb });
    }

    /**
     * Collapse the currently expanded card and unsubscribe availability listeners
     */
    function _collapseCard() {
        _expandedProposalId = null;

        // Unsubscribe specific callbacks (preserves app.js subscriptions)
        for (const { teamId, weekId, callback } of _availabilityUnsubs) {
            AvailabilityService.unsubscribe(teamId, weekId, callback);
        }
        _availabilityUnsubs = [];
    }

    /**
     * Confirm a slot
     */
    async function _handleConfirmSlot(proposalId, slotId, btn) {
        // Get game type from card-level toggle
        const gameType = _selectedGameTypes[proposalId];

        if (!gameType) {
            ToastService.showError('Select OFF or PRAC first');
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
        const match = ScheduledMatchService.getMatch(matchId);
        if (!match) {
            ToastService.showError('Match not found');
            return;
        }

        CancelMatchModal.show(match, async (confirmedMatchId) => {
            try {
                const result = await ProposalService.cancelScheduledMatch(confirmedMatchId);
                if (result.success) {
                    const isQuickAdd = match.origin === 'quick_add' || !match.proposalId;
                    ToastService.showSuccess(isQuickAdd
                        ? 'Match cancelled.'
                        : 'Match cancelled. Proposal is active again.');
                } else {
                    ToastService.showError(result.error || 'Failed to cancel scheduled match');
                }
            } catch (error) {
                console.error('Cancel match failed:', error);
                ToastService.showError('Network error — please try again');
            }
        });
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

            // 2. Select the opponent team in the browser
            if (typeof TeamBrowserState !== 'undefined') {
                TeamBrowserState.clearSelection();
                TeamBrowserState.selectTeam(opponentTeamId);
            }

            // 4. Set min-vs-min filters
            // Comparison activates implicitly from team selection in step 3 (Slice 17.0)
            const filters = {
                yourTeam: parseInt(minYour) || 1,
                opponent: parseInt(minOpp) || 1
            };
            window.dispatchEvent(new CustomEvent('filter-changed', { detail: filters }));
        } catch (error) {
            console.error('❌ Load Grid View failed:', error);
        }
    }

    // ─── Discord Contact ─────────────────────────────────────────────

    /**
     * Generate a Discord message for a proposal with top 3 viable timeslots
     */
    function _generateProposalContactMessage(proposal, viableSlots) {
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const myTag = isProposerSide ? proposal.proposerTeamTag : proposal.opponentTeamTag;
        const theirTag = isProposerSide ? proposal.opponentTeamTag : proposal.proposerTeamTag;
        const weekNum = proposal.weekId?.split('-')[1] || '?';

        // Sort by total players descending
        const sorted = [...viableSlots].sort((a, b) => {
            return (b.proposerCount + b.opponentCount) - (a.proposerCount + a.opponentCount);
        });

        const top3 = sorted.slice(0, 3);
        const remaining = sorted.length - 3;

        const deepLink = proposal.id
            ? `https://scheduler.quake.world/#/matches/${proposal.id}`
            : 'https://scheduler.quake.world';

        if (top3.length === 0) {
            return [
                `Hey! We proposed a match: ${myTag} vs ${theirTag} (W${weekNum})`,
                '',
                'No viable slots yet \u2014 check availability!',
                '',
                deepLink
            ].join('\n');
        }

        const lines = [
            `Hey! We proposed a match: ${myTag} vs ${theirTag} (W${weekNum})`,
            '',
            'Best times for both teams:'
        ];

        for (const slot of top3) {
            const display = TimezoneService.formatSlotForDisplay(slot.slotId);
            const shortDay = (display.dayLabel || '').slice(0, 3);
            const pCount = slot.proposerStandin ? `${slot.proposerCount}+1` : `${slot.proposerCount}`;
            const oCount = slot.opponentStandin ? `${slot.opponentCount}+1` : `${slot.opponentCount}`;
            lines.push(`\u25B8 ${shortDay} ${display.timeLabel} (${pCount}v${oCount})`);
        }

        if (remaining > 0) {
            lines.push('');
            lines.push(`+${remaining} more time${remaining !== 1 ? 's' : ''} available`);
        }

        lines.push('');
        lines.push(`Check proposal: ${deepLink}`);

        return lines.join('\n');
    }

    /**
     * Handle Discord contact button click on a proposal card
     */
    async function _handleDiscordContact(proposalId) {
        const proposal = ProposalService.getProposal(proposalId);
        if (!proposal) return;

        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const opponentTeamId = isProposerSide ? proposal.opponentTeamId : proposal.proposerTeamId;
        const opponentTeam = TeamService.getTeamFromCache(opponentTeamId);

        // Compute viable slots for message (filtered for past, with standin)
        const standinSettings = proposal.gameType === 'practice'
            ? { proposerStandin: !!proposal.proposerStandin, opponentStandin: !!proposal.opponentStandin }
            : undefined;
        const viableSlots = ProposalService.computeViableSlots(
            proposal.proposerTeamId,
            proposal.opponentTeamId,
            proposal.weekId,
            proposal.minFilter,
            standinSettings
        );
        const now = new Date();
        const activeSlots = viableSlots.filter(s => !_isSlotPast(proposal.weekId, s.slotId, now));

        // Generate message
        const message = _generateProposalContactMessage(proposal, activeSlots);

        // Copy to clipboard
        try {
            await navigator.clipboard.writeText(message);
            ToastService.showSuccess('Message copied! Paste in Discord');
        } catch (err) {
            console.warn('Clipboard copy failed:', err);
            ToastService.showInfo('Opening Discord\u2026 (clipboard copy failed)');
        }

        // Try to open Discord DM with opponent leader
        const leaderId = opponentTeam?.leaderId;
        if (leaderId) {
            try {
                const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
                const userDoc = await getDoc(doc(window.firebase.db, 'users', leaderId));
                if (userDoc.exists()) {
                    const discordUserId = userDoc.data().discordUserId;
                    if (discordUserId) {
                        setTimeout(() => {
                            window.open(`discord://discord.com/users/${discordUserId}`, '_blank');
                        }, 100);
                        return;
                    }
                }
            } catch (err) {
                console.warn('Could not fetch opponent leader Discord info:', err);
            }
        }
        // If no Discord ID, clipboard copy is still done — no extra action needed
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
        // Hide tooltip and bail when hovering over action buttons (right side of slot row)
        if (e.target.closest('.slot-col-actions')) {
            _hideRosterTooltip();
            return;
        }

        // Trigger on scheduled match rows OR any part of a slot row in expanded proposals
        const row = e.target.closest('.upcoming-match-row') || e.target.closest('.slot-row');
        if (!row) return;

        // Position tooltip at the count badge if present, otherwise at the row
        const slotCount = row.querySelector('.slot-col-count');
        _rosterTooltipAnchor = row;
        _showRosterTooltip(row, slotCount || row);
    }

    function _handleMatchRowLeave(e) {
        if (!_rosterTooltipAnchor) return;

        const row = e.target.closest('.upcoming-match-row') || e.target.closest('.slot-row');
        if (!row || row !== _rosterTooltipAnchor) return;

        // Don't hide if pointer moved to a child within the row
        if (e.relatedTarget && _rosterTooltipAnchor.contains(e.relatedTarget)) return;

        _hideRosterTooltip();
    }

    function _hideRosterTooltip() {
        if (_rosterTooltip) _rosterTooltip.style.display = 'none';
        _rosterTooltipAnchor = null;
    }

    async function _showRosterTooltip(row, positionEl) {
        const anchorEl = positionEl || row;
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
                    <span class="player-name">${_escapeHtml(p.displayName || p.initials || '?')}</span>
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
                <a href="#/teams/${teamAId}/h2h/${teamBId}" class="match-tooltip-h2h-link">View Head-to-Head</a>
            </div>
        `;

        // Create or reuse tooltip element (peek-only — no hover interaction needed)
        if (!_rosterTooltip) {
            _rosterTooltip = document.createElement('div');
            _rosterTooltip.className = 'match-tooltip';
            _rosterTooltip.style.pointerEvents = 'none'; // Pass-through — don't intercept clicks/hovers
            document.body.appendChild(_rosterTooltip);
        }

        _rosterTooltip.innerHTML = html;

        // Position tooltip to the RIGHT of the anchor element (so it doesn't cover the slot list)
        const rowRect = anchorEl.getBoundingClientRect();
        _rosterTooltip.style.visibility = 'hidden';
        _rosterTooltip.style.display = 'block';
        const ttRect = _rosterTooltip.getBoundingClientRect();

        let left = rowRect.right + 8;
        let top = rowRect.top;

        // If tooltip would go off right edge, show to the left instead
        if (left + ttRect.width > window.innerWidth - 8) {
            left = rowRect.left - ttRect.width - 8;
        }
        // If tooltip would go off bottom, shift up
        if (top + ttRect.height > window.innerHeight - 8) {
            top = window.innerHeight - ttRect.height - 8;
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
            _container.removeEventListener('pointerenter', _handleMatchRowEnter, true);
            _container.removeEventListener('pointerleave', _handleMatchRowLeave, true);
            _container.removeEventListener('scroll', _hideRosterTooltip, true);
            _container.removeEventListener('mouseleave', _hideRosterTooltip);
        }
        document.removeEventListener('click', _hideRosterTooltip, true);

        // Remove roster tooltip
        _rosterTooltipAnchor = null;
        if (_rosterTooltip) {
            _rosterTooltip.remove();
            _rosterTooltip = null;
        }

        _container = null;
        _userTeamIds = [];
        _expandedProposalId = null;
        _archivedExpanded = false;
        _selectedGameTypes = {};
        _initialized = false;

        console.log('🧹 MatchesPanel cleaned up');
    }

    // ─── Public API ────────────────────────────────────────────────────

    /**
     * Expand a specific proposal by ID (used by Router for deep links).
     * If proposal not yet loaded, defers to next render cycle.
     */
    function expandProposal(proposalId) {
        if (!proposalId) return;

        _expandedProposalId = proposalId;
        _renderAll();

        // Scroll to the card after render
        requestAnimationFrame(() => {
            const card = _container?.querySelector(`[data-proposal-id="${proposalId}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // Proposal may not be loaded yet — retry after listener fires
                const retryHandler = () => {
                    requestAnimationFrame(() => {
                        const retryCard = _container?.querySelector(`[data-proposal-id="${proposalId}"]`);
                        if (retryCard) {
                            retryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    });
                    window.removeEventListener('matches-panel-rendered', retryHandler);
                };
                window.addEventListener('matches-panel-rendered', retryHandler, { once: true });
            }
        });
    }

    return {
        init,
        cleanup,
        expandProposal
    };
})();
