// MobileHomeContent.js - Context panel for mobile layout
// Slice M1.0: Shows proposals/matches by default, switches to actions on cell selection

const MobileHomeContent = (function() {
    'use strict';

    let _containerId;
    let _currentState = 'default'; // 'default' | 'selection' | 'match-detail'
    let _typeFilter = null; // null | 'official' | 'practice'

    function init(containerId) {
        _containerId = containerId;
        showDefault();
    }

    function showDefault() {
        _currentState = 'default';
        const container = document.getElementById(_containerId);
        if (!container) return;

        const teamId = MobileApp.getSelectedTeamId();
        const user = AuthService.getCurrentUser();

        // Collect all section rows — rendered inside ONE shared grid
        let rows = '';
        let hasContent = false;

        // Proposals for this team
        const proposals = ProposalService.getProposalsFromCache()
            .filter(p => p.status === 'active' &&
                (p.proposerTeamId === teamId || p.opponentTeamId === teamId));

        if (proposals.length > 0) {
            const filtered = _typeFilter
                ? proposals.filter(p => (p.gameType || 'official') === _typeFilter)
                : proposals;

            const offActive = _typeFilter === 'official' ? ' filter-active' : '';
            const pracActive = _typeFilter === 'practice' ? ' filter-active' : '';

            rows += `<div class="mobile-grid-section-header mobile-section-header-row">
                <h3 class="mobile-section-header">Proposals</h3>
                <div class="mobile-filter-group">
                    <button class="mobile-filter-btn filter-official${offActive}"
                            onclick="MobileHomeContent.toggleFilter('official')">Official</button>
                    <button class="mobile-filter-btn filter-practice${pracActive}"
                            onclick="MobileHomeContent.toggleFilter('practice')">Practice</button>
                </div>
            </div>`;
            filtered.forEach(p => {
                rows += _renderProposalRow(p, teamId);
            });
            hasContent = true;
        }

        // Scheduled matches for user's teams
        if (teamId) {
            const matches = ScheduledMatchService.getMatchesFromCache()
                .filter(m => m.status === 'upcoming' &&
                    (m.teamAId === teamId || m.teamBId === teamId));
            const filteredMatches = _typeFilter
                ? matches.filter(m => (m.gameType || 'official') === _typeFilter)
                : matches;

            if (filteredMatches.length > 0) {
                rows += '<h3 class="mobile-grid-section-header mobile-section-header">Your Matches</h3>';
                filteredMatches.forEach(m => {
                    rows += _renderMatchRow(m);
                });
                hasContent = true;
            }
        }

        // Upcoming community matches (other teams)
        const allMatches = ScheduledMatchService.getMatchesFromCache()
            .filter(m => m.status === 'upcoming' &&
                m.teamAId !== teamId && m.teamBId !== teamId);
        const filteredUpcoming = _typeFilter
            ? allMatches.filter(m => (m.gameType || 'official') === _typeFilter)
            : allMatches;

        if (filteredUpcoming.length > 0) {
            rows += '<h3 class="mobile-grid-section-header mobile-section-header">Upcoming</h3>';
            filteredUpcoming.slice(0, 5).forEach(m => {
                rows += _renderMatchRow(m);
            });
            hasContent = true;
        }

        if (hasContent) {
            container.innerHTML = `<div class="mobile-match-table">${rows}</div>`;
        } else if (!user) {
            container.innerHTML = '<div class="mobile-empty-state">Sign in to manage your availability</div>';
        } else if (!teamId) {
            container.innerHTML = '<div class="mobile-empty-state">Join a team to get started</div>';
        } else {
            container.innerHTML = '<div class="mobile-empty-state">No proposals or matches this week</div>';
        }
    }

    function showSelectionActions(selectedCells, weekId) {
        _currentState = 'selection';
        const container = document.getElementById(_containerId);
        if (!container) return;

        const user = AuthService.getCurrentUser();
        if (!user) {
            container.innerHTML = `
                <div class="mobile-selection-actions">
                    <div class="mobile-empty-state">Sign in to mark availability</div>
                    <button class="mobile-action-btn mobile-action-clear"
                            onclick="MobileCalendarGrid.clearSelection()">
                        Clear Selection
                    </button>
                </div>
            `;
            return;
        }

        const slotLabels = selectedCells.map(cellId => {
            const [day, time] = cellId.split('_');
            const dayLabel = day.charAt(0).toUpperCase() + day.slice(1, 3);
            const displayTime = typeof TimezoneService !== 'undefined'
                ? TimezoneService.baseToLocalDisplay(time)
                : time.substring(0, 2) + ':' + time.substring(2);
            return `${dayLabel} ${displayTime}`;
        });

        // Check if user is scheduler (leader) for "Others" section
        const teamId = MobileApp.getSelectedTeamId();
        const isScheduler = teamId && TeamService.isScheduler(teamId, user.uid);

        let html = `
            <div class="mobile-selection-actions">
                <div class="mobile-selection-header">
                    <span class="mobile-selection-count">\u2713 ${selectedCells.length} slot${selectedCells.length > 1 ? 's' : ''}</span>
                    <span class="mobile-selection-slots">${slotLabels.join(' \u00B7 ')}</span>
                </div>

                <div class="mobile-action-row">
                    <button class="mobile-action-btn mobile-action-available"
                            onclick="MobileHomeContent.commitAction('add')">
                        + Me
                    </button>
                    <button class="mobile-action-btn mobile-action-unavailable"
                            onclick="MobileHomeContent.commitAction('remove')">
                        \u2212 Me
                    </button>
                    <button class="mobile-action-btn mobile-action-away"
                            onclick="MobileHomeContent.commitAction('markUnavailable')">
                        Away
                    </button>
                    <button class="mobile-action-btn mobile-action-clear"
                            onclick="MobileCalendarGrid.clearSelection()">
                        Clear
                    </button>
                </div>

                <div class="mobile-secondary-actions">
                    <button class="mobile-link-btn" onclick="MobileHomeContent.handleSaveTemplate()">
                        Save template
                    </button>
                </div>`;

        // Others section for schedulers
        if (isScheduler) {
            const team = MobileApp.getSelectedTeam();
            const roster = team?.playerRoster || [];
            const otherPlayers = roster.filter(p => p.userId !== user.uid);

            if (otherPlayers.length > 0) {
                html += `<div class="mobile-others-section">
                    <h3 class="mobile-section-header">Others</h3>`;
                otherPlayers.forEach(p => {
                    const name = p.displayName || p.initials || '?';
                    const color = typeof PlayerColorService !== 'undefined'
                        ? PlayerColorService.getPlayerColorOrDefault(p.userId) : '';
                    const style = color ? ` style="color:${color}"` : '';
                    html += `<div class="mobile-roster-row">
                        <span class="mobile-roster-name"${style}>${name}</span>
                        <div class="mobile-roster-actions">
                            <button class="mobile-icon-btn mobile-icon-add"
                                    onclick="MobileHomeContent.commitOtherAction('${p.userId}','add')">+</button>
                            <button class="mobile-icon-btn mobile-icon-remove"
                                    onclick="MobileHomeContent.commitOtherAction('${p.userId}','remove')">\u2212</button>
                            <button class="mobile-icon-btn mobile-icon-away"
                                    onclick="MobileHomeContent.commitOtherAction('${p.userId}','markUnavailable')">\u2298</button>
                        </div>
                    </div>`;
                });
                html += `</div>`;
            }
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    async function commitAction(action) {
        const teamId = MobileApp.getSelectedTeamId();
        if (!teamId) return;
        const user = AuthService.getCurrentUser();
        if (!user) return;
        const utcSlots = MobileCalendarGrid.getSelectedUtcSlots();
        if (utcSlots.length === 0) return;
        const weekId = _getWeekId();

        _setButtonsLoading(true);
        try {
            let result;
            if (action === 'add') {
                result = await AvailabilityService.addMeToSlots(teamId, weekId, utcSlots);
            } else if (action === 'markUnavailable') {
                result = await AvailabilityService.markUnavailable(teamId, weekId, utcSlots);
            } else {
                result = await AvailabilityService.removeMeFromSlots(teamId, weekId, utcSlots);
            }

            if (result.success) {
                MobileCalendarGrid.clearSelection();
                const msgs = { add: 'Marked available!', remove: 'Removed', markUnavailable: 'Marked away' };
                ToastService.showSuccess(msgs[action] || 'Updated');
            } else {
                ToastService.showError(result.error || 'Failed to update.');
            }
        } catch (error) {
            console.error('commitAction failed:', error);
            ToastService.showError('Failed to update. Try again.');
        } finally {
            _setButtonsLoading(false);
        }
    }

    async function commitOtherAction(targetUserId, action) {
        const teamId = MobileApp.getSelectedTeamId();
        if (!teamId) return;
        const utcSlots = MobileCalendarGrid.getSelectedUtcSlots();
        if (utcSlots.length === 0) return;
        const weekId = _getWeekId();

        // Find the clicked row's buttons and show loading
        const row = document.querySelector(`[onclick*="${targetUserId}"][onclick*="${action}"]`);
        if (row) row.disabled = true;

        try {
            let result;
            if (action === 'add') {
                result = await AvailabilityService.addPlayerToSlots(teamId, weekId, utcSlots, targetUserId);
            } else if (action === 'markUnavailable') {
                result = await AvailabilityService.markPlayerUnavailable(teamId, weekId, utcSlots, targetUserId);
            } else {
                result = await AvailabilityService.removePlayerFromSlots(teamId, weekId, utcSlots, targetUserId);
            }

            if (result.success) {
                ToastService.showSuccess('Updated');
            } else {
                ToastService.showError(result.error || 'Failed to update.');
            }
        } catch (error) {
            console.error('commitOtherAction failed:', error);
            ToastService.showError('Failed to update.');
        } finally {
            if (row) row.disabled = false;
        }
    }

    function handleSaveTemplate() {
        const name = prompt('Template name:');
        if (!name || !name.trim()) return;

        const utcSlots = MobileCalendarGrid.getSelectedUtcSlots();
        if (utcSlots.length === 0) return;

        // Strip week-specific parts — keep just day_time slot IDs
        if (typeof TemplateService !== 'undefined') {
            TemplateService.saveTemplate(name.trim(), utcSlots)
                .then(() => ToastService.showSuccess('Template saved'))
                .catch(() => ToastService.showError('Failed to save template'));
        }
    }

    function _setButtonsLoading(loading) {
        const buttons = document.querySelectorAll('.mobile-action-btn');
        buttons.forEach(btn => {
            btn.disabled = loading;
            if (loading) btn.classList.add('loading');
            else btn.classList.remove('loading');
        });
    }

    function _getWeekId() {
        const weekNum = WeekNavigation.getCurrentWeekNumber();
        const year = DateUtils.getISOWeekYear(DateUtils.getMondayOfWeek(weekNum));
        return `${year}-${String(weekNum).padStart(2, '0')}`;
    }

    function showMatchDetail(match) {
        _currentState = 'match-detail';
        const container = document.getElementById(_containerId);
        if (!container) return;

        const teamA = TeamService.getTeamFromCache(match.teamAId);
        const teamB = TeamService.getTeamFromCache(match.teamBId);

        const slotDisplay = match.blockedSlot
            ? _formatSlot(match.blockedSlot)
            : '';

        container.innerHTML = `
            <div class="mobile-match-detail">
                <div class="mobile-match-teams">
                    <span class="mobile-match-team">${teamA?.teamName || teamA?.name || 'Unknown'}</span>
                    <span class="mobile-match-vs">vs</span>
                    <span class="mobile-match-team">${teamB?.teamName || teamB?.name || 'Unknown'}</span>
                </div>
                <div class="mobile-match-info">
                    ${match.gameType || 'OFFI'} \u00B7 ${slotDisplay}
                </div>
                <button class="mobile-action-btn mobile-action-clear"
                        onclick="MobileHomeContent.showDefault()">
                    Back to overview
                </button>
            </div>
        `;
    }

    function _renderProposalRow(proposal, myTeamId) {
        const proposerTeam = TeamService.getTeamFromCache(proposal.proposerTeamId);
        const opponentTeam = TeamService.getTeamFromCache(proposal.opponentTeamId);
        const proposerName = proposerTeam?.teamName || proposal.proposerTeamName || '?';
        const opponentName = opponentTeam?.teamName || proposal.opponentTeamName || '?';
        const isProposer = proposal.proposerTeamId === myTeamId;
        const dir = isProposer ? 'Sent' : 'Recv';
        const typeCls = _typeClass(proposal.gameType);

        // Compute viable slot count live
        let slotCount = 0;
        try {
            const standin = proposal.gameType === 'practice'
                ? { proposerStandin: !!proposal.proposerStandin, opponentStandin: !!proposal.opponentStandin }
                : undefined;
            slotCount = ProposalService.computeViableSlots(
                proposal.proposerTeamId, proposal.opponentTeamId,
                proposal.weekId, proposal.minFilter, standin
            ).length;
        } catch (_) {}

        // Proposer always listed first (like home team in soccer)
        // 5-column layout: [name] [vs] [name] [direction] [viable count or empty]
        const countLabel = slotCount > 0 ? String(slotCount) : '\u2014';
        return `<div class="mobile-trow mobile-trow-tap" onclick="MobileProposalDetail.open('${proposal.id}')">
            <span class="mobile-tcell mobile-col-name">${proposerName}</span>
            <span class="mobile-tcell mobile-col-vs ${typeCls}">vs</span>
            <span class="mobile-tcell mobile-col-name">${opponentName}</span>
            <span class="mobile-tcell mobile-col-meta">${dir}</span>
            <span class="mobile-tcell mobile-col-meta">${countLabel}</span>
        </div>`;
    }

    function _renderMatchRow(match) {
        const teamA = TeamService.getTeamFromCache(match.teamAId);
        const teamB = TeamService.getTeamFromCache(match.teamBId);
        const { day, time } = _parseSlotParts(match.blockedSlot);
        const nameA = teamA?.teamName || teamA?.name || '?';
        const nameB = teamB?.teamName || teamB?.name || '?';
        const typeCls = _typeClass(match.gameType);
        const typeLabel = _typeLabel(match.gameType);

        return `<div class="mobile-trow">
            <span class="mobile-tcell mobile-col-name">${nameA}</span>
            <span class="mobile-tcell mobile-col-vs ${typeCls}">vs</span>
            <span class="mobile-tcell mobile-col-name">${nameB}</span>
            <span class="mobile-tcell mobile-col-meta">${day}</span>
            <span class="mobile-tcell mobile-col-meta">${time}</span>
        </div>`;
    }

    function _typeClass(gameType) {
        if (gameType === 'practice') return 'type-practice';
        return 'type-official';
    }

    function _typeLabel(gameType) {
        if (gameType === 'practice') return 'PRAC';
        return 'OFFI';
    }

    function _parseSlotParts(utcSlotId) {
        if (!utcSlotId) return { day: '', time: '' };
        if (typeof TimezoneService !== 'undefined') {
            const f = TimezoneService.formatSlotForDisplay(utcSlotId);
            const abbr = f.dayLabel ? f.dayLabel.substring(0, 3) : '';
            return { day: abbr, time: f.timeLabel || '' };
        }
        const SHORT_DAYS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
        const [d, t] = utcSlotId.split('_');
        return { day: SHORT_DAYS[d] || d, time: t ? t.substring(0, 2) + ':' + t.substring(2) : '' };
    }

    function toggleFilter(type) {
        _typeFilter = (_typeFilter === type) ? null : type;
        showDefault();
    }

    function refresh() {
        if (_currentState === 'default') showDefault();
    }

    return { init, showDefault, showSelectionActions, showMatchDetail, commitAction, commitOtherAction, handleSaveTemplate, toggleFilter, refresh };
})();
