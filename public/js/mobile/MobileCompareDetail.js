// MobileCompareDetail.js - Comparison slot detail in MobileBottomSheet
// Shows matched opponents at a slot with inline-expandable cards
// Each card expands to show VS roster + single-row proposal flow
// After proposal: closes sheet → opens MobileProposalDetail for slot confirmation

const MobileCompareDetail = (function() {
    'use strict';

    let _weekId = null;
    let _slotId = null;

    // Per-opponent state, keyed by index
    let _expandedCards = new Set();
    let _gameTypes = {};   // index → 'official' | 'practice' | null
    let _standins = {};    // index → boolean

    // ── Open ──────────────────────────────────────────────────────

    function open(weekId, slotId) {
        _weekId = weekId;
        _slotId = slotId;
        _expandedCards = new Set();
        _gameTypes = {};
        _standins = {};

        const userTeamInfo = ComparisonEngine.getUserTeamInfo(weekId, slotId);
        const matches = ComparisonEngine.getSlotMatches(weekId, slotId);

        if (!userTeamInfo || !matches || matches.length === 0) {
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('No opponent data for this slot');
            }
            return;
        }

        // Single opponent → auto-expand with Official pre-selected
        if (matches.length === 1) {
            _expandedCards.add(0);
            _gameTypes[0] = 'official';
        }

        const html = _renderAll(userTeamInfo, matches);
        MobileBottomSheet.open(html, _cleanup);
        _attachSheetListeners();
    }

    function _cleanup() {
        _weekId = null;
        _slotId = null;
    }

    function _attachSheetListeners() {
        const content = MobileBottomSheet.getContentElement();
        if (content) {
            content.removeEventListener('click', _handleAction);
            content.addEventListener('click', _handleAction);
        }
    }

    // ── Render: Full view ─────────────────────────────────────────

    function _renderAll(userTeamInfo, matches) {
        const slotDisplay = _formatSlot(_slotId);

        let html = '<div class="mcd-container">';
        html += `<div class="mcd-header">${slotDisplay.day} at ${slotDisplay.time}</div>`;
        if (matches.length > 1) {
            html += `<div class="mcd-sub">${matches.length} opponents available</div>`;
        }

        matches.forEach((match, index) => {
            const isExpanded = _expandedCards.has(index);
            html += _renderOpponentCard(userTeamInfo, match, index, isExpanded);
        });

        html += '</div>';
        return html;
    }

    // ── Render: Opponent Card (collapsed or expanded) ─────────────

    function _renderOpponentCard(userTeamInfo, match, index, isExpanded) {
        const availCount = match.availablePlayers?.length || 0;
        const userCount = userTeamInfo.availablePlayers?.length || 0;
        const isFullMatch = availCount >= 4 && userCount >= 4;

        let html = `<div class="mcd-opp-card-wrap ${isExpanded ? 'mcd-expanded' : ''}">`;

        if (isExpanded) {
            // Expanded header: [UserLogo]  NvN  [OppLogo] + collapse arrow
            html += `
                <div class="mcd-opp-card mcd-opp-card-expanded" data-action="toggle-expand" data-index="${index}">
                    <div class="mcd-opp-badge">${_renderLogoBadge(userTeamInfo.teamId, userTeamInfo.teamTag)}</div>
                    <span class="mcd-opp-indicator ${isFullMatch ? 'mcd-full' : 'mcd-partial'}">
                        ${userCount}v${availCount}
                    </span>
                    <div class="mcd-opp-badge">${_renderLogoBadge(match.teamId, match.teamTag)}</div>
                    <span class="mcd-expand-arrow">\u25B2</span>
                </div>
            `;
            html += _renderExpandedContent(userTeamInfo, match, index);
        } else {
            // Collapsed header: [OppLogo] Name  tag  NvN  arrow
            const tagHtml = match.teamTag
                ? `<span class="mcd-opp-tag-inline">${_escapeHtml(match.teamTag)}</span>`
                : '';

            html += `
                <div class="mcd-opp-card" data-action="toggle-expand" data-index="${index}">
                    <div class="mcd-opp-badge">${_renderLogoBadge(match.teamId, match.teamTag)}</div>
                    <span class="mcd-opp-name">${_escapeHtml(match.teamName || 'Unknown')}</span>
                    ${tagHtml}
                    <span class="mcd-opp-indicator ${isFullMatch ? 'mcd-full' : 'mcd-partial'}">
                        ${userCount}v${availCount}
                    </span>
                    <span class="mcd-expand-arrow">\u25BC</span>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    function _renderLogoBadge(teamId, teamTag) {
        const logoUrl = _getTeamLogo(teamId);
        return logoUrl
            ? `<img class="mcd-opp-logo" src="${logoUrl}" alt="">`
            : `<span class="mcd-opp-tag">${_escapeHtml(teamTag || '?')}</span>`;
    }

    // ── Render: Expanded Content (VS roster + proposal) ───────────

    function _renderExpandedContent(userTeamInfo, match, index) {
        const userId = (typeof AuthService !== 'undefined') ? AuthService.getCurrentUser()?.uid : null;
        const canSchedule = userId && (typeof TeamService !== 'undefined')
            ? TeamService.isScheduler(userTeamInfo.teamId, userId)
            : false;

        let html = '<div class="mcd-expand-body">';

        // VS roster layout
        html += '<div class="mcd-vs-layout">';
        html += _renderRosterColumn(userTeamInfo, true);
        html += '<div class="mcd-vs-divider">VS</div>';
        html += _renderRosterColumn(match, false);
        html += '</div>';

        // Single-row proposal flow (only for schedulers)
        if (canSchedule) {
            html += _renderProposalRow(index);
        }

        html += '</div>';
        return html;
    }

    // Roster column — team name as header, then player list
    function _renderRosterColumn(teamInfo, isUserTeam) {
        let rosterHtml = '';
        if (teamInfo.hideRosterNames && !isUserTeam) {
            const count = teamInfo.availablePlayers?.length || 0;
            rosterHtml = `<div class="mcd-roster-anon">${count} available</div>`;
        } else {
            (teamInfo.availablePlayers || []).forEach(p => {
                const name = p.displayName || p.initials || '?';
                rosterHtml += `<div class="mcd-player mcd-player-avail">${_escapeHtml(name)}</div>`;
            });
            (teamInfo.unavailablePlayers || []).forEach(p => {
                const name = p.displayName || p.initials || '?';
                rosterHtml += `<div class="mcd-player mcd-player-unavail">${_escapeHtml(name)}</div>`;
            });
        }

        return `
            <div class="mcd-team-side">
                <div class="mcd-roster-label">${_escapeHtml(teamInfo.teamName || teamInfo.teamTag || '')}</div>
                <div class="mcd-roster">${rosterHtml}</div>
            </div>
        `;
    }

    // ── Render: Single-row Proposal ───────────────────────────────
    // [Official] [Practice] [SI?] [Propose →]

    function _renderProposalRow(index) {
        const gameType = _gameTypes[index] || null;
        const withStandin = _standins[index] || false;

        let html = '<div class="mcd-proposal-row">';

        html += `<button class="mcd-type-btn ${gameType === 'official' ? 'mcd-type-official-active' : ''}"
                         data-action="set-game-type" data-index="${index}" data-type="official">Official</button>`;
        html += `<button class="mcd-type-btn ${gameType === 'practice' ? 'mcd-type-practice-active' : ''}"
                         data-action="set-game-type" data-index="${index}" data-type="practice">Practice</button>`;

        if (gameType === 'practice') {
            html += `<button class="mcd-standin-btn ${withStandin ? 'mcd-standin-active' : ''}"
                             data-action="toggle-standin" data-index="${index}">SI${withStandin ? ' \u2713' : ''}</button>`;
        }

        html += `<button class="mcd-propose-btn ${gameType ? '' : 'mcd-disabled'}"
                         data-action="propose-match" data-index="${index}"
                         ${gameType ? '' : 'disabled'}>Propose \u2192</button>`;

        html += '</div>';
        return html;
    }

    // ── Action Handler ──────────────────────────────────────────

    async function _handleAction(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const index = target.dataset.index !== undefined ? parseInt(target.dataset.index) : null;
        const userTeamInfo = ComparisonEngine.getUserTeamInfo(_weekId, _slotId);
        const matches = ComparisonEngine.getSlotMatches(_weekId, _slotId);

        if (!userTeamInfo || !matches) return;

        switch (action) {
            case 'toggle-expand': {
                if (index === null) break;
                if (_expandedCards.has(index)) {
                    _expandedCards.delete(index);
                } else {
                    _expandedCards.add(index);
                    // Default to 'official' so Propose is immediately enabled
                    if (!_gameTypes[index]) _gameTypes[index] = 'official';
                }
                _reRender();
                break;
            }

            case 'set-game-type': {
                if (index === null) break;
                _gameTypes[index] = target.dataset.type;
                _standins[index] = false;
                _reRender();
                break;
            }

            case 'toggle-standin': {
                if (index === null) break;
                _standins[index] = !_standins[index];
                _reRender();
                break;
            }

            case 'propose-match': {
                if (index === null || !_gameTypes[index]) return;
                target.disabled = true;
                target.textContent = 'Creating...';

                try {
                    const selectedMatch = matches[index];
                    const gameType = _gameTypes[index];
                    const withStandin = _standins[index] || false;
                    const filters = (typeof FilterService !== 'undefined')
                        ? FilterService.getFilters()
                        : { yourTeam: 3, opponent: 3 };

                    const result = await ProposalService.createProposal({
                        proposerTeamId: userTeamInfo.teamId,
                        opponentTeamId: selectedMatch.teamId,
                        weekId: _weekId,
                        minFilter: filters,
                        gameType: gameType,
                        proposerStandin: gameType === 'practice' && withStandin
                    });

                    if (result.success) {
                        if (typeof ToastService !== 'undefined') {
                            ToastService.showSuccess('Proposal created!');
                        }
                        // Close compare sheet, open proposal detail for slot confirmation
                        MobileBottomSheet.close();
                        if (typeof MobileProposalDetail !== 'undefined') {
                            // Small delay to let close animation finish
                            setTimeout(() => {
                                MobileProposalDetail.open(result.proposalId);
                            }, 300);
                        }
                    } else {
                        if (typeof ToastService !== 'undefined') {
                            ToastService.showError(result.error || 'Failed to create proposal');
                        }
                        target.disabled = false;
                        target.textContent = 'Propose \u2192';
                    }
                } catch (err) {
                    console.error('MobileCompareDetail: propose failed:', err);
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showError('Network error - try again');
                    }
                    target.disabled = false;
                    target.textContent = 'Propose \u2192';
                }
                break;
            }
        }
    }

    function _reRender() {
        const userTeamInfo = ComparisonEngine.getUserTeamInfo(_weekId, _slotId);
        const matches = ComparisonEngine.getSlotMatches(_weekId, _slotId);
        if (!userTeamInfo || !matches) return;

        const html = _renderAll(userTeamInfo, matches);
        MobileBottomSheet.updateContent(html);
        _attachSheetListeners();
    }

    // ── Helpers ──────────────────────────────────────────────────

    function _formatSlot(utcSlotId, refDate) {
        if (typeof TimezoneService !== 'undefined') {
            const display = TimezoneService.formatSlotForDisplay(utcSlotId, refDate);
            const shortDays = {
                Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
                Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun'
            };
            return {
                day: shortDays[display.dayLabel] || display.dayLabel || '',
                time: display.timeLabel || ''
            };
        }
        const SHORT_DAYS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
        const [d, t] = utcSlotId.split('_');
        return { day: SHORT_DAYS[d] || d, time: t ? t.substring(0, 2) + ':' + t.substring(2) : '' };
    }

    function _getTeamLogo(teamId) {
        if (typeof TeamService === 'undefined') return null;
        const team = TeamService.getTeamFromCache(teamId);
        return team?.activeLogo?.urls?.small || null;
    }

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    return { open };
})();
