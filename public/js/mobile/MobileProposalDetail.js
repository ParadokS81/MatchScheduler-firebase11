// MobileProposalDetail.js - Proposal detail view for MobileBottomSheet
// Shows viable slots, confirm/withdraw, game type toggle, discord, cancel

const MobileProposalDetail = (function() {
    'use strict';

    let _proposalId = null;
    let _availUnsubs = []; // availability listener cleanup refs
    let _initialLoadDone = false; // guard for auto-withdraw
    let _autoWithdrawInFlight = new Set(); // prevent duplicate withdrawals

    /**
     * Open a proposal in the bottom sheet.
     * @param {string} proposalId
     */
    async function open(proposalId) {
        _proposalId = proposalId;
        _initialLoadDone = false;
        _autoWithdrawInFlight.clear();
        const proposal = ProposalService.getProposal(proposalId);
        if (!proposal) {
            ToastService.showError('Proposal not found');
            return;
        }

        // Ensure both teams' availability is loaded for viable slot computation
        await Promise.all([
            AvailabilityService.loadWeekAvailability(proposal.proposerTeamId, proposal.weekId),
            AvailabilityService.loadWeekAvailability(proposal.opponentTeamId, proposal.weekId)
        ]);

        // Render initial content
        const html = _renderProposal(proposal);
        MobileBottomSheet.open(html, _cleanup);

        // Attach event delegation
        const content = MobileBottomSheet.getContentElement();
        if (content) {
            content.addEventListener('click', _handleAction);
        }

        // Subscribe to availability changes for live slot updates
        _subscribeAvailability(proposal);
        _initialLoadDone = true;
    }

    function _cleanup() {
        _availUnsubs.forEach(fn => fn());
        _availUnsubs = [];
        _proposalId = null;
        _initialLoadDone = false;
        _autoWithdrawInFlight.clear();
    }

    function _subscribeAvailability(proposal) {
        // Re-render when either team's availability changes
        const callback = () => _refresh();

        AvailabilityService.subscribe(proposal.proposerTeamId, proposal.weekId, callback);
        _availUnsubs.push(() =>
            AvailabilityService.unsubscribe(proposal.proposerTeamId, proposal.weekId, callback));

        AvailabilityService.subscribe(proposal.opponentTeamId, proposal.weekId, callback);
        _availUnsubs.push(() =>
            AvailabilityService.unsubscribe(proposal.opponentTeamId, proposal.weekId, callback));
    }

    function _refresh() {
        if (!_proposalId) return;
        const proposal = ProposalService.getProposal(_proposalId);
        if (!proposal) return;

        // Layer 3: Auto-withdraw stale requests when availability drops
        if (_initialLoadDone) {
            _checkAutoWithdraw(proposal);
        }

        MobileBottomSheet.updateContent(_renderProposal(proposal));

        // Re-attach event delegation after content update
        const content = MobileBottomSheet.getContentElement();
        if (content) {
            content.removeEventListener('click', _handleAction);
            content.addEventListener('click', _handleAction);
        }
    }

    // ─── Auto-withdraw (Layer 3) ────────────────────────────────────

    function _checkAutoWithdraw(proposal) {
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const isOpponentSide = _isUserOnSide(proposal, 'opponent');
        if (!isProposerSide && !isOpponentSide) return;

        const myConfirmed = isProposerSide
            ? (proposal.proposerConfirmedSlots || {})
            : (proposal.opponentConfirmedSlots || {});

        const gameType = proposal.gameType || 'official';
        const standinSettings = gameType === 'practice'
            ? { proposerStandin: !!proposal.proposerStandin, opponentStandin: !!proposal.opponentStandin }
            : undefined;

        // Compute with the hardcoded 4/3 filter
        const viableSlots = ProposalService.computeViableSlots(
            proposal.proposerTeamId, proposal.opponentTeamId,
            proposal.weekId, { yourTeam: 4, opponent: 3 }, standinSettings
        );
        const viableMap = new Map(viableSlots.map(s => [s.slotId, s]));

        for (const slotId of Object.keys(myConfirmed)) {
            if (!myConfirmed[slotId]) continue;
            if (_autoWithdrawInFlight.has(slotId)) continue;

            let shouldWithdraw = false;

            if (!viableMap.has(slotId)) {
                // Slot no longer viable at all (proposer < 4 or opponent < 3)
                shouldWithdraw = true;
            } else {
                // Slot viable but MY count dropped below 4
                const slot = viableMap.get(slotId);
                const myCount = isProposerSide ? slot.proposerCount : slot.opponentCount;
                if (myCount < 4) shouldWithdraw = true;
            }

            if (shouldWithdraw) {
                _autoWithdrawInFlight.add(slotId);
                ProposalService.withdrawConfirmation(_proposalId, slotId)
                    .then(() => {
                        _autoWithdrawInFlight.delete(slotId);
                        _refresh();
                    })
                    .catch(err => {
                        console.error('Auto-withdraw failed:', slotId, err);
                        _autoWithdrawInFlight.delete(slotId);
                    });
            }
        }
    }

    // ─── Render ──────────────────────────────────────────────────────

    function _renderProposal(proposal) {
        const user = AuthService.getCurrentUser();
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const isOpponentSide = _isUserOnSide(proposal, 'opponent');
        const canAct = isProposerSide || isOpponentSide;

        // Teams
        const proposerTeam = TeamService.getTeamFromCache(proposal.proposerTeamId);
        const opponentTeam = TeamService.getTeamFromCache(proposal.opponentTeamId);
        const proposerName = proposal.proposerTeamName || proposerTeam?.teamName || '?';
        const opponentName = proposal.opponentTeamName || opponentTeam?.teamName || '?';
        const proposerLogo = proposerTeam?.activeLogo?.urls?.small || '';
        const opponentLogo = opponentTeam?.activeLogo?.urls?.small || '';

        // Game type
        const gameType = proposal.gameType || 'official';
        const isOfficial = gameType === 'official';
        const weekNum = proposal.weekId?.split('-')[1] || '?';

        // Standin (practice only)
        const myStandin = isProposerSide ? proposal.proposerStandin : proposal.opponentStandin;

        // Viable slots — hardcoded 4/3 filter
        const standinSettings = gameType === 'practice'
            ? { proposerStandin: !!proposal.proposerStandin, opponentStandin: !!proposal.opponentStandin }
            : undefined;
        const viableSlots = ProposalService.computeViableSlots(
            proposal.proposerTeamId, proposal.opponentTeamId,
            proposal.weekId, { yourTeam: 4, opponent: 3 }, standinSettings
        );

        // My/their confirmations
        const myConfirmed = isProposerSide
            ? (proposal.proposerConfirmedSlots || {})
            : (proposal.opponentConfirmedSlots || {});
        const theirConfirmed = isProposerSide
            ? (proposal.opponentConfirmedSlots || {})
            : (proposal.proposerConfirmedSlots || {});

        // Discord: show only if user is on one side (not both)
        const showDiscord = canAct && !(isProposerSide && isOpponentSide);

        // Week date range
        const weekDateRange = _getWeekDateRange(proposal.weekId);

        // Monday of week for slot date computation
        const monday = _getMondayFromWeekId(proposal.weekId);

        const proposerTag = proposal.proposerTeamTag || proposerTeam?.teamTag || '';
        const opponentTag = proposal.opponentTeamTag || opponentTeam?.teamTag || '';

        let html = `<div class="mobile-proposal-detail">`;

        // ─── Header: names row + logo/roster columns ───
        const rosterData = _getRosterData(
            proposal, proposerTeam, opponentTeam,
            viableSlots, myConfirmed, theirConfirmed,
            isProposerSide
        );

        // Names row: [Name A]  vs  [Name B]
        html += `<div class="mpd-names-row">`;
        html += `<span class="mpd-name-left">${_escapeHtml(proposerName)}</span>`;
        html += `<span class="mpd-names-vs">vs</span>`;
        html += `<span class="mpd-name-right">${_escapeHtml(opponentName)}</span>`;
        html += `</div>`;

        // Rosters: [Logo + players]  [Logo + players]
        html += `<div class="mpd-rosters-row">`;
        html += `<div class="mpd-roster-side">`;
        html += _renderLogoBadge(proposerLogo, proposerTag);
        html += `<div class="mpd-roster-inner">`;
        rosterData.proposerNames.forEach(name => {
            html += `<span class="mpd-roster-player">${_escapeHtml(name)}</span>`;
        });
        html += `</div></div>`;
        html += `<div class="mpd-roster-side">`;
        html += _renderLogoBadge(opponentLogo, opponentTag);
        html += `<div class="mpd-roster-inner">`;
        rosterData.opponentNames.forEach(name => {
            html += `<span class="mpd-roster-player">${_escapeHtml(name)}</span>`;
        });
        html += `</div></div>`;
        html += `</div>`;

        // ─── Viable slots ───
        if (viableSlots.length === 0) {
            html += `<div class="mpd-empty">No viable slots found</div>`;
        } else {
            html += `<div class="mpd-slots-list">`;

            // Header row: each column independently aligned
            html += `<div class="mpd-slot-header">
                <span class="mpd-slot-hdr-date">W${weekNum} \u00B7 ${weekDateRange}</span>
                <span></span>
                <span></span>
                <span class="mpd-slot-hdr-avail">Availability</span>
                <span class="mpd-slot-hdr-action">Action</span>
            </div>`;

            viableSlots.forEach(slot => {
                const slotDate = _formatSlotWithDate(slot.slotId, monday);

                const iConfirmed = !!myConfirmed[slot.slotId];
                const theyConfirmed = !!theirConfirmed[slot.slotId];
                const bothConfirmed = iConfirmed && theyConfirmed;

                // Determine my count (for action logic)
                const myCount = isProposerSide ? slot.proposerCount : slot.opponentCount;
                const canActSlot = canAct && myCount >= 4;

                // Count display: "4on4" or "4on3" with orange highlight on 3s
                const pCount = slot.proposerCount;
                const oCount = slot.opponentCount;
                const pClass = pCount < 4 ? ' mpd-count-short' : '';
                const oClass = oCount < 4 ? ' mpd-count-short' : '';
                const countHtml = `<span class="mpd-count-num${pClass}">${pCount}</span><span class="mpd-count-on">on</span><span class="mpd-count-num${oClass}">${oCount}</span>`;

                // Button logic
                let actionBtn = '';
                if (canAct) {
                    if (bothConfirmed) {
                        actionBtn = `<span class="mpd-slot-matched-label">Matched</span>`;
                    } else if (iConfirmed) {
                        actionBtn = `<button class="mpd-slot-btn mpd-btn-withdraw" data-action="withdraw" data-slot="${slot.slotId}">Withdraw</button>`;
                    } else if (canActSlot && theyConfirmed) {
                        // They requested, I have 4 → Confirm
                        actionBtn = `<button class="mpd-slot-btn mpd-btn-confirm" data-action="confirm" data-slot="${slot.slotId}">Confirm</button>`;
                    } else if (canActSlot) {
                        // Nobody requested or I can act → Request
                        actionBtn = `<button class="mpd-slot-btn mpd-btn-request" data-action="confirm" data-slot="${slot.slotId}">Request</button>`;
                    } else {
                        // My count < 4 → disabled
                        actionBtn = `<button class="mpd-slot-btn mpd-btn-disabled" disabled>Request</button>`;
                    }
                }

                // Row classes
                let rowClass = 'mpd-slot-row';
                if (bothConfirmed) rowClass += ' mpd-slot-matched';
                if (myCount < 4) rowClass += ' mpd-slot-short';

                // Expanded roster content (hidden by default)
                const pRosterNames = _resolvePlayerNames(new Set(slot.proposerRoster || []), proposerTeam);
                const oRosterNames = _resolvePlayerNames(new Set(slot.opponentRoster || []), opponentTeam);

                html += `<div class="mpd-slot-item">`;
                html += `<div class="${rowClass}" data-slot-toggle="${slot.slotId}">
                    <span class="mpd-slot-day">${slotDate.dayShort}</span>
                    <span class="mpd-slot-date">${slotDate.dateStr}</span>
                    <span class="mpd-slot-time">${slotDate.time}</span>
                    <span class="mpd-slot-count">${countHtml}</span>
                    <span class="mpd-slot-action">${actionBtn}</span>
                </div>`;

                // Expandable roster detail
                html += `<div class="mpd-slot-detail hidden" id="mpd-detail-${slot.slotId}">`;
                html += `<div class="mpd-detail-side">`;
                pRosterNames.forEach(n => { html += `<span class="mpd-detail-player">${_escapeHtml(n)}</span>`; });
                html += `</div>`;
                html += `<div class="mpd-detail-side">`;
                oRosterNames.forEach(n => { html += `<span class="mpd-detail-player">${_escapeHtml(n)}</span>`; });
                html += `</div>`;
                html += `</div>`;

                html += `</div>`; // .mpd-slot-item
            });
            html += `</div>`;
        }

        // ─── Bottom bar: game type + contact + cancel ───
        if (canAct) {
            html += `<div class="mpd-bottom-bar">`;
            html += `<div class="mpd-game-type-row">`;
            html += `<button class="mpd-type-btn ${isOfficial ? 'mpd-type-active-official' : ''}"
                             data-action="set-game-type" data-type="official">Official</button>`;
            html += `<button class="mpd-type-btn ${!isOfficial ? 'mpd-type-active-practice' : ''}"
                             data-action="set-game-type" data-type="practice">Practice</button>`;
            if (!isOfficial) {
                html += `<button class="mpd-standin-btn ${myStandin ? 'mpd-standin-active' : ''}"
                                 data-action="toggle-standin">SI${myStandin ? ' \u2713' : ''}</button>`;
            }
            if (showDiscord) {
                html += `<button class="mpd-type-btn mpd-btn-contact" data-action="discord"><svg class="mpd-discord-icon" viewBox="0 -28.5 256 256" xmlns="http://www.w3.org/2000/svg"><path d="M216.856 16.597A208.502 208.502 0 00164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 00-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193a161.094 161.094 0 0013.882-22.584 136.426 136.426 0 01-21.846-10.632 108.636 108.636 0 005.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 005.355 4.237 136.07 136.07 0 01-21.886 10.653c4.006 8.02 8.638 15.67 13.862 22.584 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36zM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18z" fill="currentColor"/></svg> Contact</button>`;
            }
            html += `</div>`;
            html += `<button class="mpd-action-btn mpd-btn-cancel" data-action="cancel-proposal">Cancel Proposal</button>`;
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }

    // ─── Actions ─────────────────────────────────────────────────────

    async function _handleAction(e) {
        // Row expand/collapse — clicking the row but NOT a button
        const toggleRow = e.target.closest('[data-slot-toggle]');
        if (toggleRow && !e.target.closest('[data-action]')) {
            const slotId = toggleRow.dataset.slotToggle;
            const detail = document.getElementById(`mpd-detail-${slotId}`);
            if (detail) detail.classList.toggle('hidden');
            return;
        }

        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const proposal = ProposalService.getProposal(_proposalId);
        if (!proposal) return;

        switch (action) {
            case 'confirm':
                await _handleConfirm(proposal, btn.dataset.slot, btn);
                break;
            case 'withdraw':
                await _handleWithdraw(proposal, btn.dataset.slot, btn);
                break;
            case 'set-game-type':
                await _handleSetGameType(proposal, btn.dataset.type);
                break;
            case 'toggle-standin':
                await _handleToggleStandin(proposal);
                break;
            case 'discord':
                _handleDiscord(proposal);
                break;
            case 'cancel-proposal':
                await _handleCancel(proposal, btn);
                break;
        }
    }

    async function _handleConfirm(proposal, slotId, btn) {
        const gameType = proposal.gameType || 'official';
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const theirConfirmed = isProposerSide
            ? (proposal.opponentConfirmedSlots || {})
            : (proposal.proposerConfirmedSlots || {});
        const isConfirming = !!theirConfirmed[slotId]; // they already requested

        btn.disabled = true;
        btn.textContent = '...';

        try {
            const result = await ProposalService.confirmSlot(_proposalId, slotId, gameType);
            if (result.success) {
                if (result.matched) {
                    ToastService.showSuccess('Match confirmed!');
                    MobileBottomSheet.close();
                } else {
                    ToastService.showSuccess(isConfirming ? 'Confirmed' : 'Requested');
                    _refresh();
                }
            } else {
                ToastService.showError(result.error || 'Failed');
                btn.disabled = false;
                btn.textContent = isConfirming ? 'Confirm' : 'Request';
            }
        } catch (err) {
            console.error('Confirm failed:', err);
            ToastService.showError('Failed to confirm slot');
            btn.disabled = false;
            btn.textContent = isConfirming ? 'Confirm' : 'Request';
        }
    }

    async function _handleWithdraw(proposal, slotId, btn) {
        btn.disabled = true;
        btn.textContent = '...';

        try {
            const result = await ProposalService.withdrawConfirmation(_proposalId, slotId);
            if (result.success) {
                ToastService.showSuccess('Withdrawn');
                _refresh();
            } else {
                ToastService.showError(result.error || 'Failed to withdraw');
            }
        } catch (err) {
            console.error('Withdraw failed:', err);
            ToastService.showError('Failed to withdraw');
        }
    }

    async function _handleSetGameType(proposal, type) {
        try {
            await ProposalService.updateProposalSettings({ proposalId: _proposalId, gameType: type });
            _refresh();
        } catch (err) {
            console.error('Set game type failed:', err);
            ToastService.showError('Failed to update game type');
        }
    }

    async function _handleToggleStandin(proposal) {
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const currentValue = isProposerSide ? proposal.proposerStandin : proposal.opponentStandin;

        try {
            await ProposalService.updateProposalSettings({ proposalId: _proposalId, standin: !currentValue });
            _refresh();
        } catch (err) {
            console.error('Toggle standin failed:', err);
            ToastService.showError('Failed to update standin');
        }
    }

    function _handleDiscord(proposal) {
        const isProposerSide = _isUserOnSide(proposal, 'proposer');
        const opponentTeamId = isProposerSide ? proposal.opponentTeamId : proposal.proposerTeamId;
        const opponentTeam = TeamService.getTeamFromCache(opponentTeamId);

        // Compute viable slots for message
        const standinSettings = proposal.gameType === 'practice'
            ? { proposerStandin: !!proposal.proposerStandin, opponentStandin: !!proposal.opponentStandin }
            : undefined;
        const viableSlots = ProposalService.computeViableSlots(
            proposal.proposerTeamId, proposal.opponentTeamId,
            proposal.weekId, { yourTeam: 4, opponent: 3 }, standinSettings
        );

        // Build message
        const myTag = isProposerSide ? proposal.proposerTeamTag : proposal.opponentTeamTag;
        const theirTag = isProposerSide ? proposal.opponentTeamTag : proposal.proposerTeamTag;
        const weekNum = proposal.weekId?.split('-')[1] || '?';
        const sorted = [...viableSlots].sort((a, b) =>
            (b.proposerCount + b.opponentCount) - (a.proposerCount + a.opponentCount));
        const top3 = sorted.slice(0, 3);

        const monday = _getMondayFromWeekId(proposal.weekId);
        let msg = `Hey! ${myTag} vs ${theirTag} (W${weekNum})\n`;
        if (top3.length > 0) {
            msg += 'Best slots:\n';
            top3.forEach(s => {
                const sd = _formatSlotWithDate(s.slotId, monday);
                msg += `  ${sd.dayShort} ${sd.dateStr} ${sd.time} (${s.proposerCount}on${s.opponentCount})\n`;
            });
            if (sorted.length > 3) msg += `  +${sorted.length - 3} more\n`;
        }
        msg += `https://scheduler.quake.world/#/matches/${_proposalId}`;

        // Copy to clipboard
        navigator.clipboard.writeText(msg).then(() => {
            ToastService.showSuccess('Message copied to clipboard');
        }).catch(() => {
            // Fallback
            prompt('Copy this message:', msg);
        });
    }

    async function _handleCancel(proposal, btn) {
        if (!confirm('Cancel this proposal?')) return;

        btn.disabled = true;
        btn.textContent = 'Cancelling...';

        try {
            const result = await ProposalService.cancelProposal(_proposalId);
            if (result.success) {
                ToastService.showSuccess('Proposal cancelled');
                MobileBottomSheet.close();
            } else {
                ToastService.showError(result.error || 'Failed to cancel');
                btn.disabled = false;
                btn.textContent = 'Cancel Proposal';
            }
        } catch (err) {
            console.error('Cancel failed:', err);
            ToastService.showError('Failed to cancel proposal');
            btn.disabled = false;
            btn.textContent = 'Cancel Proposal';
        }
    }

    // ─── Roster Overview ────────────────────────────────────────────

    function _getRosterData(proposal, proposerTeam, opponentTeam, viableSlots, myConfirmed, theirConfirmed, isProposerSide) {
        const proposerConfirmed = isProposerSide ? myConfirmed : theirConfirmed;
        const opponentConfirmed = isProposerSide ? theirConfirmed : myConfirmed;

        const proposerPlayerIds = _aggregatePlayerIds(viableSlots, 'proposerRoster', proposerConfirmed);
        const opponentPlayerIds = _aggregatePlayerIds(viableSlots, 'opponentRoster', opponentConfirmed);

        return {
            proposerNames: _resolvePlayerNames(proposerPlayerIds, proposerTeam),
            opponentNames: _resolvePlayerNames(opponentPlayerIds, opponentTeam)
        };
    }

    function _aggregatePlayerIds(viableSlots, rosterKey, confirmedSlots) {
        const hasConfirms = Object.keys(confirmedSlots).length > 0;
        const ids = new Set();

        for (const slot of viableSlots) {
            // If this side has confirms, only include players from confirmed slots
            if (hasConfirms && !confirmedSlots[slot.slotId]) continue;
            const players = slot[rosterKey] || [];
            players.forEach(id => ids.add(id));
        }

        return ids;
    }

    function _resolvePlayerNames(playerIds, team) {
        const roster = team?.playerRoster || [];
        const names = [];

        for (const id of playerIds) {
            const player = roster.find(p => p.userId === id);
            names.push(player?.displayName || player?.initials || '?');
        }

        return names.sort((a, b) => a.localeCompare(b));
    }

    function _renderLogoBadge(logoUrl, tag) {
        if (logoUrl) {
            return `<img class="mpd-roster-logo" src="${logoUrl}" alt="">`;
        }
        return `<div class="mpd-roster-logo mpd-logo-fallback">${_escapeHtml(tag || '?')}</div>`;
    }

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    function _isUserOnSide(proposal, side) {
        const teamId = side === 'proposer' ? proposal.proposerTeamId : proposal.opponentTeamId;
        const userId = AuthService.getCurrentUser()?.uid;
        if (!userId) return false;
        return TeamService.isScheduler(teamId, userId);
    }

    /**
     * Format a slot with short day name, date ordinal, and time.
     * e.g. { dayShort: 'Mon', dateStr: '16th', time: '22:30' }
     */
    function _formatSlotWithDate(utcSlotId, monday) {
        if (!utcSlotId) return { dayShort: '', dateStr: '', time: '' };

        const DAY_OFFSETS = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
        const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

        // Get the local day/time via TimezoneService if available
        let dayKey, timeStr;
        if (typeof TimezoneService !== 'undefined') {
            const f = TimezoneService.formatSlotForDisplay(utcSlotId, monday);
            const dayNameToKey = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri', Saturday: 'sat', Sunday: 'sun' };
            dayKey = dayNameToKey[f.dayLabel] || utcSlotId.split('_')[0];
            timeStr = f.timeLabel || '';
        } else {
            const [d, t] = utcSlotId.split('_');
            dayKey = d;
            timeStr = t ? t.substring(0, 2) + ':' + t.substring(2) : '';
        }

        const dayShort = DAY_SHORT[dayKey] || dayKey;
        let dateStr = '';

        if (monday) {
            const offset = DAY_OFFSETS[dayKey] ?? 0;
            const slotDate = new Date(monday);
            slotDate.setUTCDate(monday.getUTCDate() + offset);
            const dayNum = slotDate.getUTCDate();
            dateStr = `${dayNum}${_ordinal(dayNum)}`;
        }

        return { dayShort, dateStr, time: timeStr };
    }

    function _ordinal(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    }

    function _getMondayFromWeekId(weekId) {
        if (!weekId) return null;
        const weekNum = parseInt(weekId.split('-')[1]);
        if (isNaN(weekNum)) return null;
        return DateUtils.getMondayOfWeek(weekNum);
    }

    function _getWeekDateRange(weekId) {
        const monday = _getMondayFromWeekId(weekId);
        if (!monday) return '';
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const startMonth = MONTHS[monday.getUTCMonth()];
        const endMonth = MONTHS[sunday.getUTCMonth()];
        const startDay = monday.getUTCDate();
        const endDay = sunday.getUTCDate();

        if (startMonth === endMonth) {
            return `${startMonth} ${startDay}\u2013${endDay}`;
        }
        return `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}`;
    }

    return { open };
})();
