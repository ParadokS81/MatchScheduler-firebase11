// SidebarProposals.js - Compact proposal previews in the left sidebar
// Follows Cache + Listener pattern: Component owns Firebase listeners, services manage cache
// Click navigates to #/matches/{proposalId} for full detail via deep linking

const SidebarProposals = (function() {
    'use strict';

    let _container = null;
    let _unsubscribers = [];
    let _userTeamIds = [];
    let _initialized = false;

    // ─── Initialization ──────────────────────────────────────────────

    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) return;

        // Event delegation for clicks — attach once, survives re-renders
        _container.addEventListener('click', _handleClick);

        const currentUser = AuthService.getCurrentUser();
        if (!currentUser) {
            // Wait for auth — re-init once user resolves
            const unsub = AuthService.onAuthStateChange((user) => {
                if (user && !_initialized) {
                    unsub();
                    _initWithUser(user);
                }
            });
            return;
        }

        await _initWithUser(currentUser);
    }

    async function _initWithUser(user) {
        _userTeamIds = await _getUserTeamIds(user.uid);
        if (_userTeamIds.length === 0) {
            if (_container) _container.innerHTML = '';
            return;
        }

        await _setupProposalListeners();
        _initialized = true;
    }

    async function _getUserTeamIds(userId) {
        try {
            const { doc, getDoc } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
            );
            const userDoc = await getDoc(doc(window.firebase.db, 'users', userId));
            if (!userDoc.exists()) return [];
            return Object.keys(userDoc.data().teams || {});
        } catch (error) {
            console.error('SidebarProposals: Failed to get user teams:', error);
            return [];
        }
    }

    // ─── Firestore Listeners ─────────────────────────────────────────

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
                _render();
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
                _render();
            }));
        }
    }

    // ─── Rendering ───────────────────────────────────────────────────

    function _render() {
        if (!_container) return;

        const proposals = ProposalService.getProposalsFromCache()
            .filter(p => p.status === 'active');

        if (proposals.length === 0) {
            _container.innerHTML = '';
            return;
        }

        // Sort by weekId (earliest first)
        proposals.sort((a, b) => (a.weekId || '').localeCompare(b.weekId || ''));

        const cardsHtml = proposals.map(p => _renderProposalPreview(p)).join('');

        _container.innerHTML = `
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 text-center">
                Proposals
            </h3>
            <div class="space-y-0.5">
                ${cardsHtml}
            </div>
        `;
    }

    function _renderProposalPreview(proposal) {
        // Determine which team is "opponent" from user's perspective
        const isProposer = _userTeamIds.includes(proposal.proposerTeamId);
        const opponentTeamId = isProposer ? proposal.opponentTeamId : proposal.proposerTeamId;
        const opponentTeam = TeamService.getTeamFromCache(opponentTeamId);
        const opponentLogo = opponentTeam?.activeLogo?.urls?.small || '';
        const opponentName = isProposer
            ? (proposal.opponentTeamName || proposal.opponentTeamTag)
            : (proposal.proposerTeamName || proposal.proposerTeamTag);
        const opponentTag = isProposer
            ? (proposal.opponentTeamTag || proposal.opponentTeamName)
            : (proposal.proposerTeamTag || proposal.proposerTeamName);

        // Game type badge — full words
        const gameType = proposal.gameType;
        const gameTypeBadge = gameType === 'official'
            ? '<span class="text-[0.625rem] font-semibold text-green-400 shrink-0">Official</span>'
            : gameType === 'practice'
                ? '<span class="text-[0.625rem] font-semibold text-muted-foreground shrink-0">Practice</span>'
                : '';

        // Week label: "This Week", "Next Week", or "Week XX"
        const weekNum = parseInt(proposal.weekId?.split('-')[1] || '0', 10);
        const currentWeek = typeof WeekNavigation !== 'undefined'
            ? WeekNavigation.getCurrentWeekNumber()
            : 0;
        let weekLabel;
        if (weekNum === currentWeek) {
            weekLabel = 'This Week';
        } else if (weekNum === currentWeek + 1) {
            weekLabel = 'Next Week';
        } else {
            weekLabel = `Week ${weekNum}`;
        }

        const logoHtml = opponentLogo
            ? `<img src="${opponentLogo}" class="w-4 h-4 rounded-sm object-cover shrink-0" alt="">`
            : `<span class="w-4 h-4 rounded-sm bg-muted flex items-center justify-center text-[0.5rem] font-bold text-muted-foreground shrink-0">${_escapeHtml((opponentTag || '?').slice(0, 2))}</span>`;

        return `
            <div class="sidebar-proposal-card flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                 data-action="open-proposal" data-proposal-id="${proposal.id}"
                 title="vs ${_escapeHtml(opponentName)} · ${weekLabel}">
                ${logoHtml}
                <span class="text-xs font-medium truncate min-w-0">${_escapeHtml(opponentName)}</span>
                ${gameTypeBadge}
                <span class="text-[0.625rem] text-muted-foreground shrink-0 ml-auto">${weekLabel}</span>
            </div>
        `;
    }

    function _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Event Handling ──────────────────────────────────────────────

    function _handleClick(e) {
        const target = e.target.closest('[data-action="open-proposal"]');
        if (!target) return;

        const proposalId = target.dataset.proposalId;
        if (!proposalId) return;

        // Navigate to matches tab and expand this proposal via deep linking
        window.location.hash = `/matches/${proposalId}`;
    }

    // ─── Reinit (team membership changes) ────────────────────────────

    function reinit() {
        cleanup();
        const containerId = _container?.id;
        if (containerId) {
            const user = AuthService.getCurrentUser();
            if (user) {
                _container = document.getElementById(containerId);
                _initWithUser(user);
            }
        }
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    function cleanup() {
        _unsubscribers.forEach(unsub => unsub());
        _unsubscribers = [];
        if (_container) {
            _container.removeEventListener('click', _handleClick);
            _container.innerHTML = '';
        }
        _userTeamIds = [];
        _initialized = false;
    }

    return { init, reinit, cleanup };
})();
