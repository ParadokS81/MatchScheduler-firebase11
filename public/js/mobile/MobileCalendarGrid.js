// MobileCalendarGrid.js - Mobile-optimized calendar grid
// Slice M1.0: Horizontal scroll-snap, 4 days visible, tap selection
// Uses same TimezoneService maps and AvailabilityService as desktop

const MobileCalendarGrid = (function() {
    'use strict';

    let _containerId;
    let _weekNumber; // raw week number (not weekId string)
    let _selectedCells = new Set(); // local cell IDs
    let _unsubscribeAvail = null;
    let _gridToUtcMap = null; // Map<localCellId, utcSlotId>
    let _utcToGridMap = null; // Map<utcSlotId, localCellId>
    let _availabilityData = null; // raw availability doc from service
    let _comparisonMode = false;
    let _eventCleanups = [];

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let _pastCells = new Set();

    async function init(containerId) {
        _containerId = containerId;
        _weekNumber = WeekNavigation.getCurrentWeekNumber();
        _buildUtcMaps();
        _render();
        _setupEventListeners();
        await _loadData();
    }

    function _setupEventListeners() {
        // Display mode changed → re-render cell contents
        const onDisplayModeChanged = () => refreshCells();
        window.addEventListener('display-mode-changed', onDisplayModeChanged);
        _eventCleanups.push(() => window.removeEventListener('display-mode-changed', onDisplayModeChanged));

        // Timeslots changed → rebuild entire grid (rows changed)
        const onTimeslotsChanged = () => reload();
        window.addEventListener('timeslots-changed', onTimeslotsChanged);
        _eventCleanups.push(() => window.removeEventListener('timeslots-changed', onTimeslotsChanged));
    }

    function _getWeekId() {
        const year = DateUtils.getISOWeekYear(DateUtils.getMondayOfWeek(_weekNumber));
        return `${year}-${String(_weekNumber).padStart(2, '0')}`;
    }

    function _buildUtcMaps() {
        if (typeof TimezoneService !== 'undefined') {
            const refDate = DateUtils.getMondayOfWeek(_weekNumber);
            _gridToUtcMap = TimezoneService.buildGridToUtcMap(refDate);
            _utcToGridMap = TimezoneService.buildUtcToGridMap(refDate);
        } else {
            _gridToUtcMap = new Map();
            _utcToGridMap = new Map();
        }
    }

    function _getTimeSlots() {
        return typeof TimezoneService !== 'undefined'
            ? TimezoneService.getVisibleTimeSlots()
            : ['1930', '2000', '2030', '2100', '2130', '2200', '2230', '2300'];
    }

    // ─── Past-slot tracking ──────────────────────────────────────────

    function _buildPastCells() {
        _pastCells.clear();
        const monday = DateUtils.getMondayOfWeek(_weekNumber);
        const now = Date.now();
        const userOffsetMin = typeof TimezoneService !== 'undefined'
            ? TimezoneService.getOffsetMinutes(monday)
            : 60;
        const timeSlots = _getTimeSlots();

        for (let d = 0; d < DAYS.length; d++) {
            for (const time of timeSlots) {
                const localDisplay = typeof TimezoneService !== 'undefined'
                    ? TimezoneService.baseToLocalDisplay(time, monday)
                    : `${time.slice(0, 2)}:${time.slice(2)}`;
                const localHour = parseInt(localDisplay.split(':')[0]);
                const localMin = parseInt(localDisplay.split(':')[1]);
                const utcTotalMin = (localHour * 60 + localMin) - userOffsetMin;
                const cellDate = new Date(monday.getTime());
                cellDate.setUTCDate(monday.getUTCDate() + d);
                cellDate.setUTCHours(0, 0, 0, 0);
                cellDate.setUTCMinutes(utcTotalMin);
                if (cellDate.getTime() < now) {
                    _pastCells.add(`${DAYS[d]}_${time}`);
                }
            }
        }
    }

    function _isPastCell(cellId) {
        return _pastCells.has(cellId);
    }

    /**
     * Returns indices of days to render.
     * Current week: starts from today (no past days before today).
     * Other weeks: shows all 7 days.
     * Always shows at least 4 columns.
     */
    function _getVisibleDayIndices() {
        const todayIdx = _getTodayDayIndex();

        if (todayIdx >= 0) {
            // Current week: start from today, go through Sunday
            const indices = [];
            for (let d = todayIdx; d < DAYS.length; d++) {
                indices.push(d);
            }
            // If less than 4 remaining days (e.g. Fri-Sun = 3), pad with earlier days
            for (let d = todayIdx - 1; d >= 0 && indices.length < 4; d--) {
                indices.unshift(d);
            }
            return indices;
        }

        // Past/future weeks: show all days
        return DAYS.map((_, i) => i);
    }

    // ─── Render ──────────────────────────────────────────────────────

    function _render() {
        const container = document.getElementById(_containerId);
        if (!container) return;

        _buildPastCells();

        const timeSlots = _getTimeSlots();
        const monday = DateUtils.getMondayOfWeek(_weekNumber);
        const todayIdx = _getTodayDayIndex();
        const visibleDays = _getVisibleDayIndices();

        let html = '<div class="mobile-grid-wrapper">';

        // Fixed time label column
        html += '<div class="mobile-grid-time-col">';
        html += '<div class="mobile-grid-time-header"></div>';
        timeSlots.forEach(time => {
            const displayTime = typeof TimezoneService !== 'undefined'
                ? TimezoneService.baseToLocalDisplay(time)
                : time.substring(0, 2) + ':' + time.substring(2);
            html += `<div class="mobile-grid-time-label" data-time="${time}">${displayTime}</div>`;
        });
        html += '</div>';

        // Scrollable day columns — only visible (non-past) days
        html += '<div class="mobile-grid-scroll">';
        visibleDays.forEach(i => {
            const day = DAYS[i];
            const date = new Date(monday);
            date.setUTCDate(monday.getUTCDate() + i);
            const dayNum = date.getUTCDate();
            const todayClass = (i === todayIdx) ? ' mobile-day-today' : '';

            html += `<div class="mobile-grid-day" data-day="${day}">`;
            html += `<div class="mobile-grid-day-header${todayClass}" data-day="${day}">${DAY_LABELS[i]} <span class="mobile-grid-day-date">${dayNum}</span></div>`;

            timeSlots.forEach(time => {
                const cellId = `${day}_${time}`;
                const pastClass = _isPastCell(cellId) ? ' mobile-cell-past' : '';
                html += `<div class="mobile-grid-cell${pastClass}" data-cell="${cellId}"></div>`;
            });

            html += '</div>';
        });
        html += '</div></div>';

        container.innerHTML = html;

        // Event delegation on the wrapper
        const wrapper = container.querySelector('.mobile-grid-wrapper');
        if (wrapper) {
            wrapper.addEventListener('click', _handleGridTap);
        }

        // Auto-scroll to today — defer until DOM layout is complete
        // so scroll-snap doesn't override our position
        requestAnimationFrame(() => {
            requestAnimationFrame(() => _scrollToToday());
        });
    }

    // ─── Today Detection & Scroll ────────────────────────────────────

    /**
     * Returns 0=Mon ... 6=Sun for today if viewing the current week.
     * Returns -1 if this is not the current calendar week.
     */
    function _getTodayDayIndex() {
        const currentWeek = DateUtils.getCurrentWeekNumber();
        if (_weekNumber !== currentWeek) return -1;
        const jsDay = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat
        return jsDay === 0 ? 6 : jsDay - 1;
    }

    function _scrollToToday() {
        const container = document.getElementById(_containerId);
        if (!container) return;
        const scrollEl = container.querySelector('.mobile-grid-scroll');
        if (!scrollEl) return;
        // Today is always the first column (position 0) for current week,
        // so just ensure we're at the start
        scrollEl.scrollLeft = 0;
    }

    // ─── Tap Handlers ────────────────────────────────────────────────

    function _handleGridTap(e) {
        // 1. Day header tap → column select/deselect
        const dayHeader = e.target.closest('.mobile-grid-day-header');
        if (dayHeader) {
            _handleDayHeaderTap(dayHeader);
            return;
        }

        // 2. Time label tap → row select/deselect
        const timeLabel = e.target.closest('.mobile-grid-time-label');
        if (timeLabel) {
            _handleTimeLabelTap(timeLabel);
            return;
        }

        // 3. Cell tap → single-cell toggle
        const cell = e.target.closest('.mobile-grid-cell');
        if (!cell) return;

        const cellId = cell.dataset.cell;
        if (!cellId) return;

        // Block interaction on past cells and buffer cells
        if (_isPastCell(cellId)) return;
        if (cell.classList.contains('mobile-cell-buffer')) return;

        const user = AuthService.getCurrentUser();
        if (!user) {
            document.dispatchEvent(new CustomEvent('mobile-selection-changed', {
                detail: { selectedCells: [], weekId: _getWeekId(), requiresAuth: true }
            }));
            return;
        }

        // Check for scheduled match
        const utcSlot = _gridToUtcMap.get(cellId);
        if (utcSlot) {
            const match = _getMatchAtSlot(utcSlot);
            if (match) {
                document.dispatchEvent(new CustomEvent('mobile-match-tapped', {
                    detail: { match, cellId }
                }));
                return;
            }
        }

        // Comparison mode: highlighted cells open detail, others are no-op
        if (_comparisonMode) {
            if (utcSlot && typeof ComparisonEngine !== 'undefined') {
                const matchInfo = ComparisonEngine.getSlotMatchInfo(_getWeekId(), utcSlot);
                if (matchInfo.hasMatch) {
                    document.dispatchEvent(new CustomEvent('mobile-compare-slot-tapped', {
                        detail: { weekId: _getWeekId(), slotId: utcSlot, cellId }
                    }));
                }
            }
            return; // No cell selection in comparison mode
        }

        // Toggle selection
        if (_selectedCells.has(cellId)) {
            _selectedCells.delete(cellId);
            cell.classList.remove('mobile-cell-selected');
        } else {
            _selectedCells.add(cellId);
            cell.classList.add('mobile-cell-selected');
        }

        _notifySelectionChanged();
    }

    function _handleDayHeaderTap(headerEl) {
        const user = AuthService.getCurrentUser();
        if (!user) return;

        const day = headerEl.dataset.day;
        if (!day) return;

        const timeSlots = _getTimeSlots();
        const cellIds = timeSlots.map(time => `${day}_${time}`);

        // Toggle: if all selected, deselect all; otherwise select all
        const bufferSlots = _getBufferSlots();
        const selectableCellIds = cellIds.filter(id => {
            if (_isPastCell(id)) return false;
            const utcSlot = _gridToUtcMap.get(id);
            if (utcSlot && _getMatchAtSlot(utcSlot)) return false;
            if (utcSlot && bufferSlots.has(utcSlot)) return false;
            return true;
        });
        const allSelected = selectableCellIds.every(id => _selectedCells.has(id));

        const container = document.getElementById(_containerId);
        selectableCellIds.forEach(cellId => {
            if (allSelected) {
                _selectedCells.delete(cellId);
            } else {
                _selectedCells.add(cellId);
            }
            const cell = container?.querySelector(`[data-cell="${cellId}"]`);
            if (cell) {
                cell.classList.toggle('mobile-cell-selected', !allSelected);
            }
        });

        headerEl.classList.toggle('mobile-col-selected', !allSelected);
        _notifySelectionChanged();
    }

    function _handleTimeLabelTap(labelEl) {
        const user = AuthService.getCurrentUser();
        if (!user) return;

        const time = labelEl.dataset.time;
        if (!time) return;

        const cellIds = DAYS.map(day => `${day}_${time}`);

        const bufferSlots = _getBufferSlots();
        const selectableCellIds = cellIds.filter(id => {
            if (_isPastCell(id)) return false;
            const utcSlot = _gridToUtcMap.get(id);
            if (utcSlot && _getMatchAtSlot(utcSlot)) return false;
            if (utcSlot && bufferSlots.has(utcSlot)) return false;
            return true;
        });
        const allSelected = selectableCellIds.every(id => _selectedCells.has(id));

        const container = document.getElementById(_containerId);
        selectableCellIds.forEach(cellId => {
            if (allSelected) {
                _selectedCells.delete(cellId);
            } else {
                _selectedCells.add(cellId);
            }
            const cell = container?.querySelector(`[data-cell="${cellId}"]`);
            if (cell) {
                cell.classList.toggle('mobile-cell-selected', !allSelected);
            }
        });

        labelEl.classList.toggle('mobile-row-selected', !allSelected);
        _notifySelectionChanged();
    }

    function _notifySelectionChanged() {
        document.dispatchEvent(new CustomEvent('mobile-selection-changed', {
            detail: {
                selectedCells: Array.from(_selectedCells),
                weekId: _getWeekId()
            }
        }));
    }

    // ─── Match Detection ─────────────────────────────────────────────

    function _getMatchAtSlot(utcSlotId) {
        const teamId = MobileApp.getSelectedTeamId();
        if (!teamId) return null;

        const weekId = _getWeekId();
        const matches = ScheduledMatchService.getMatchesFromCache();

        return matches.find(m =>
            m.weekId === weekId &&
            m.blockedSlot === utcSlotId &&
            m.status === 'upcoming' &&
            (m.teamAId === teamId || m.teamBId === teamId)
        ) || null;
    }

    /**
     * Returns Set of UTC slot IDs that are buffer zones (30 min before/after scheduled matches).
     * Mirrors desktop _adjacentSlots logic from AvailabilityGrid.js.
     */
    function _getBufferSlots() {
        const teamId = MobileApp.getSelectedTeamId();
        if (!teamId) return new Set();

        const weekId = _getWeekId();
        const matches = ScheduledMatchService.getMatchesFromCache();
        const teamMatches = matches.filter(m =>
            m.weekId === weekId &&
            m.status === 'upcoming' &&
            (m.teamAId === teamId || m.teamBId === teamId)
        );

        const matchSlots = new Set(teamMatches.map(m => m.blockedSlot));
        const bufferSlots = new Set();
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

        for (const slotId of matchSlots) {
            const [day, time] = slotId.split('_');
            const h = parseInt(time.slice(0, 2));
            const m = parseInt(time.slice(2));
            const di = days.indexOf(day);

            // Previous slot (-30 min)
            let pm = m - 30, ph = h, pdi = di;
            if (pm < 0) { pm = 30; ph--; }
            if (ph < 0) { ph = 23; pdi--; }
            if (pdi >= 0) {
                const prev = `${days[pdi]}_${String(ph).padStart(2,'0')}${String(pm).padStart(2,'0')}`;
                if (!matchSlots.has(prev)) bufferSlots.add(prev);
            }

            // Next slot (+30 min)
            let nm = m + 30, nh = h, ndi = di;
            if (nm >= 60) { nm = 0; nh++; }
            if (nh >= 24) { nh = 0; ndi++; }
            if (ndi < days.length) {
                const next = `${days[ndi]}_${String(nh).padStart(2,'0')}${String(nm).padStart(2,'0')}`;
                if (!matchSlots.has(next)) bufferSlots.add(next);
            }
        }

        return bufferSlots;
    }

    // ─── Data Loading ────────────────────────────────────────────────

    async function _loadData() {
        const teamId = MobileApp.getSelectedTeamId();
        if (!teamId) {
            _showNoTeamState();
            return;
        }

        const weekId = _getWeekId();

        const cached = AvailabilityService.getCachedData(teamId, weekId);
        if (cached) {
            _updateGrid(cached);
        }

        if (_unsubscribeAvail) {
            const prevTeamId = _availabilityData?.teamId || teamId;
            const prevWeekId = _availabilityData?.weekId || weekId;
            AvailabilityService.unsubscribe(prevTeamId, prevWeekId, _unsubscribeAvail);
        }

        const callback = (data) => { _updateGrid(data); };
        _unsubscribeAvail = callback;

        await AvailabilityService.loadWeekAvailability(teamId, weekId);
        AvailabilityService.subscribe(teamId, weekId, callback);
    }

    function _showNoTeamState() {
        const container = document.getElementById(_containerId);
        if (!container) return;
        container.innerHTML = '<div class="mobile-empty-state"><p>Join a team to see availability</p></div>';
    }

    // ─── Grid Update ─────────────────────────────────────────────────

    function _updateGrid(data) {
        _availabilityData = data;
        const utcSlots = data?.slots || {};
        const container = document.getElementById(_containerId);
        if (!container) return;

        const cells = container.querySelectorAll('.mobile-grid-cell');
        const team = MobileApp.getSelectedTeam();
        const roster = team?.playerRoster || [];
        const bufferSlots = _getBufferSlots();

        cells.forEach(cell => {
            const cellId = cell.dataset.cell;
            const utcSlotId = _gridToUtcMap.get(cellId);
            const players = utcSlotId ? (utcSlots[utcSlotId] || []) : [];
            const pastClass = _isPastCell(cellId) ? ' mobile-cell-past' : '';

            const match = utcSlotId ? _getMatchAtSlot(utcSlotId) : null;
            const isBuffer = utcSlotId && bufferSlots.has(utcSlotId);

            if (match) {
                cell.innerHTML = _renderMatchCellContent(match);
                cell.className = 'mobile-grid-cell mobile-cell-match' + pastClass;
            } else if (isBuffer) {
                cell.innerHTML = _renderCellContent(players, roster);
                cell.className = 'mobile-grid-cell mobile-cell-buffer' + pastClass;
            } else {
                cell.innerHTML = _renderCellContent(players, roster);
                cell.className = 'mobile-grid-cell' + pastClass +
                    (_selectedCells.has(cellId) ? ' mobile-cell-selected' : '') +
                    (players.length > 0 ? ' mobile-cell-has-players' : '');
            }
        });

        // Re-apply comparison highlights if active
        if (_comparisonMode) {
            updateComparisonHighlights();
        }
    }

    function _renderCellContent(playerIds, roster) {
        if (playerIds.length === 0) return '';

        const mode = typeof PlayerDisplayService !== 'undefined'
            ? PlayerDisplayService.getDisplayMode()
            : 'initials';

        const MAX_SHOWN = mode === 'coloredDots' ? 6 : 5;
        const showOverflow = playerIds.length > MAX_SHOWN;
        const visibleCount = showOverflow ? MAX_SHOWN - 1 : Math.min(playerIds.length, MAX_SHOWN);

        let items = '';
        for (let i = 0; i < visibleCount; i++) {
            const uid = playerIds[i];
            const player = roster.find(p => p.userId === uid);
            items += _renderPlayerBadge(uid, player, mode);
        }
        if (showOverflow) {
            items += `<span class="mobile-cell-overflow">+${playerIds.length - visibleCount}</span>`;
        }

        return `<div class="mobile-cell-grid">${items}</div>`;
    }

    function _renderPlayerBadge(userId, player, mode) {
        const color = _getPlayerColor(userId);

        switch (mode) {
            case 'coloredDots': {
                const bg = color || '#6B7280';
                return `<span class="mobile-cell-dot" style="background:${bg}"></span>`;
            }
            case 'avatars': {
                const photoURL = player?.photoURL;
                if (photoURL) {
                    return `<img class="mobile-cell-avatar" src="${photoURL}" alt="">`;
                }
                // Fall through to colored initials
            }
            // falls through
            case 'coloredInitials': {
                const initial = _getPlayerInitial(player);
                const style = color ? ` style="color:${color}"` : '';
                return `<span class="mobile-cell-initial"${style}>${initial}</span>`;
            }
            case 'initials':
            default: {
                const initial = _getPlayerInitial(player);
                return `<span class="mobile-cell-initial">${initial}</span>`;
            }
        }
    }

    function _renderMatchCellContent(match) {
        const myTeamId = MobileApp.getSelectedTeamId();
        const enemyTeamId = match.teamAId === myTeamId ? match.teamBId : match.teamAId;
        const enemyTeam = TeamService.getTeamFromCache(enemyTeamId);
        const logoUrl = enemyTeam?.activeLogo?.urls?.small;

        if (logoUrl) {
            return `<img class="mobile-cell-match-logo" src="${logoUrl}" alt="">`;
        }
        const tag = enemyTeam?.teamTag || enemyTeam?.name || '?';
        return `<span class="mobile-cell-match-tag">${tag}</span>`;
    }

    function _getPlayerInitial(player) {
        if (!player) return '?';
        const initials = player.initials || player.displayName || '?';
        return initials[0].toUpperCase();
    }

    function _getPlayerColor(userId) {
        if (typeof PlayerColorService !== 'undefined') {
            return PlayerColorService.getPlayerColorOrDefault(userId);
        }
        return null;
    }

    // ─── Selection ───────────────────────────────────────────────────

    function getSelectedUtcSlots() {
        return Array.from(_selectedCells)
            .map(cellId => _gridToUtcMap.get(cellId))
            .filter(Boolean);
    }

    function clearSelection() {
        const container = document.getElementById(_containerId);

        _selectedCells.forEach(cellId => {
            const cell = container?.querySelector(`[data-cell="${cellId}"]`);
            if (cell) cell.classList.remove('mobile-cell-selected');
        });
        _selectedCells.clear();

        // Clear header/label highlights
        if (container) {
            container.querySelectorAll('.mobile-col-selected').forEach(el =>
                el.classList.remove('mobile-col-selected'));
            container.querySelectorAll('.mobile-row-selected').forEach(el =>
                el.classList.remove('mobile-row-selected'));
        }

        document.dispatchEvent(new CustomEvent('mobile-selection-changed', {
            detail: { selectedCells: [], weekId: _getWeekId() }
        }));
    }

    // ─── Navigation ──────────────────────────────────────────────────

    function loadWeek(weekNumber) {
        _weekNumber = weekNumber;
        _selectedCells.clear();
        _buildUtcMaps();
        _render(); // _render calls _scrollToToday internally
        _loadData();
    }

    function refreshCells() {
        if (_availabilityData) _updateGrid(_availabilityData);
    }

    function reload() {
        loadWeek(_weekNumber);
    }

    function cleanup() {
        if (_unsubscribeAvail) {
            const teamId = MobileApp.getSelectedTeamId();
            const weekId = _getWeekId();
            if (teamId) {
                AvailabilityService.unsubscribe(teamId, weekId, _unsubscribeAvail);
            }
        }
        _eventCleanups.forEach(fn => fn());
        _eventCleanups = [];
    }

    // ─── Comparison Mode ─────────────────────────────────────────────

    function enterComparisonMode() {
        _comparisonMode = true;
        clearSelection();
        updateComparisonHighlights();
    }

    function exitComparisonMode() {
        _comparisonMode = false;
        clearComparisonHighlights();
    }

    function updateComparisonHighlights() {
        if (!_comparisonMode || typeof ComparisonEngine === 'undefined') return;

        const container = document.getElementById(_containerId);
        if (!container) return;

        const weekId = _getWeekId();
        const cells = container.querySelectorAll('.mobile-grid-cell');

        cells.forEach(cell => {
            const cellId = cell.dataset.cell;
            if (!cellId) return;

            // Remove existing comparison classes
            cell.classList.remove('mobile-cell-compare-full', 'mobile-cell-compare-partial');
            const oldBadge = cell.querySelector('.mobile-compare-badge');
            if (oldBadge) oldBadge.remove();

            // Skip match cells
            if (cell.classList.contains('mobile-cell-match')) return;

            const utcSlot = _gridToUtcMap.get(cellId);
            if (!utcSlot) return;

            const matchInfo = ComparisonEngine.getSlotMatchInfo(weekId, utcSlot);
            if (matchInfo.hasMatch) {
                cell.classList.add(matchInfo.isFullMatch
                    ? 'mobile-cell-compare-full'
                    : 'mobile-cell-compare-partial');

                // Badge for multiple opponents
                if (matchInfo.matches.length > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'mobile-compare-badge';
                    badge.textContent = matchInfo.matches.length;
                    cell.appendChild(badge);
                }
            }
        });
    }

    function clearComparisonHighlights() {
        const container = document.getElementById(_containerId);
        if (!container) return;

        container.querySelectorAll('.mobile-grid-cell').forEach(cell => {
            cell.classList.remove('mobile-cell-compare-full', 'mobile-cell-compare-partial');
            const badge = cell.querySelector('.mobile-compare-badge');
            if (badge) badge.remove();
        });
    }

    function isComparisonMode() {
        return _comparisonMode;
    }

    return {
        init, loadWeek, reload, refreshCells, clearSelection, getSelectedUtcSlots,
        scrollToToday: _scrollToToday, cleanup,
        enterComparisonMode, exitComparisonMode, updateComparisonHighlights,
        clearComparisonHighlights, isComparisonMode
    };
})();
