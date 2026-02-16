// AvailabilityGrid.js - Factory pattern for independent grid instances
// Vanilla JS with Revealing Module Pattern
// Enhanced for Slice 2.5: Player badges, tooltip hover, overflow handling
// Enhanced for Slice 5.0.1: 4 display modes (initials, coloredInitials, coloredDots, avatars)
// Enhanced for Slice 7.0b: UTC timezone conversion layer via TimezoneService

const AvailabilityGrid = (function() {
    'use strict';

    // Slice 12.0a: Dynamic time slots from TimezoneService (respects hidden slots)
    function _getTimeSlots() {
        return typeof TimezoneService !== 'undefined'
            ? TimezoneService.getVisibleTimeSlots()
            : ['1800', '1830', '1900', '1930', '2000', '2030', '2100', '2130', '2200', '2230', '2300'];
    }

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Threshold to distinguish click from drag (in pixels)
    const DRAG_THRESHOLD = 5;

    // Slice 14.0b: Scroll threshold — add scrollable class when slots exceed base count
    const SCROLL_THRESHOLD = 11;

    /**
     * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
     */
    function getOrdinalSuffix(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    }

    /**
     * Get day labels with dates (e.g., "Mon 9th", "Tue 10th")
     */
    function getDayLabelsWithDates(weekNumber) {
        const monday = DateUtils.getMondayOfWeek(weekNumber);
        return DAYS.map((_, idx) => {
            const date = new Date(monday);
            date.setUTCDate(monday.getUTCDate() + idx);
            const dayNum = date.getUTCDate();
            return `${DAY_LABELS[idx]} ${dayNum}${getOrdinalSuffix(dayNum)}`;
        });
    }

    // Player badge display constants
    const CHAR_BUDGET = 15;        // 4×3-char initials + 3 gaps = 15 units max
    const MAX_DOTS = 6;            // Dots are tiny, 6 fit easily
    const MAX_AVATARS = 5;         // Avatars: 5 fit
    const TOOLTIP_THRESHOLD = 5;   // Show tooltip when 5+ players

    /**
     * Determine how many badges fit based on display mode and actual initials lengths.
     * Uses a character budget for initials modes (12 chars + 3 gaps = 15 units).
     * Returns the max that can be shown WITHOUT an overflow indicator.
     */
    function _getMaxBadges(displayMode, allPlayers) {
        if (displayMode === 'coloredDots') return MAX_DOTS;
        if (displayMode === 'avatars') return MAX_AVATARS;

        // Initials modes: calculate how many fit within the character budget
        // Each badge costs its initials length + 1 gap (except the first has no leading gap)
        let budget = CHAR_BUDGET;
        let count = 0;
        for (const p of allPlayers) {
            const len = (p.initials || '??').length;
            const cost = count === 0 ? len : len + 1; // +1 for gap between badges
            if (budget < cost) break;
            budget -= cost;
            count++;
        }
        // Floor: always fit at least 4 (4on4 scheduler). Cap: 6 max to avoid visual clutter.
        return Math.min(Math.max(count, 4), 6);
    }

    function formatTime(slot) {
        return `${slot.slice(0, 2)}:${slot.slice(2)}`;
    }

    /**
     * Creates a new AvailabilityGrid instance
     * @param {string} containerId - The ID of the container element
     * @param {number} weekId - The week number for this grid
     * @returns {Object} Grid instance with public methods
     */
    function create(containerId, weekId) {
        let _container = null;
        let _weekId = weekId;
        let _selectedCells = new Set(); // Stores LOCAL cell IDs for display
        let _clickHandler = null;

        // UTC timezone mapping (Slice 7.0b)
        let _gridToUtcMap = null; // Map<localCellId, utcSlotId>
        let _utcToGridMap = null; // Map<utcSlotId, localCellId>

        // Advanced selection state
        let _isDragging = false;
        let _dragStartCell = null;
        let _dragStartPos = { x: 0, y: 0 };
        let _dragDistance = 0;
        let _lastClickedCell = null; // For shift+click
        let _lastValidDragCell = null; // Last valid cell during drag (within this grid)
        let _documentPointerUpHandler = null;

        // Selection change callback
        let _onSelectionChangeCallback = null;

        // Past-slot tracking: set of local cell IDs that are in the past
        let _pastCells = new Set();

        // Team view state (Slice 2.5)
        let _playerRoster = null;
        let _currentUserId = null;
        let _availabilitySlots = null;      // Local-keyed (for tooltip lookup)
        let _availabilitySlotsUtc = null;   // UTC-keyed (for refreshDisplay)
        let _unavailabilitySlots = null;    // Local-keyed unavailable players (Slice 15.0)
        let _unavailabilitySlotsUtc = null; // UTC-keyed unavailable players (Slice 15.0)
        let _onOverflowClickCallback = null;

        // Comparison mode state (Slice 3.4)
        let _comparisonMode = false;

        /**
         * Build UTC conversion maps for the current week.
         * Call on init/render and when week changes.
         */
        function _buildUtcMaps() {
            if (typeof TimezoneService !== 'undefined') {
                const refDate = DateUtils.getMondayOfWeek(_weekId);
                _gridToUtcMap = TimezoneService.buildGridToUtcMap(refDate);
                _utcToGridMap = TimezoneService.buildUtcToGridMap(refDate);
            } else {
                // No TimezoneService: identity mapping (local = UTC)
                _gridToUtcMap = new Map();
                _utcToGridMap = new Map();
                for (const day of DAYS) {
                    for (const time of _getTimeSlots()) {
                        const id = `${day}_${time}`;
                        _gridToUtcMap.set(id, id);
                        _utcToGridMap.set(id, id);
                    }
                }
            }
        }

        /**
         * Build the set of past cell IDs for the current week.
         * A cell is past if its DISPLAYED local datetime is before now.
         *
         * The grid shows CET-based day columns with local display times.
         * We check "column day + displayed local time" against the current
         * local time so that earlier rows always go past before later ones,
         * regardless of how CET maps to the user's timezone.
         */
        function _buildPastCells() {
            _pastCells.clear();

            const monday = DateUtils.getMondayOfWeek(_weekId);
            const now = Date.now();

            // Get the user's UTC offset so we can convert local display time → UTC
            const userOffsetMin = typeof TimezoneService !== 'undefined'
                ? TimezoneService.getOffsetMinutes(monday)
                : 60;

            const timeSlots = _getTimeSlots();

            for (let d = 0; d < DAYS.length; d++) {
                for (const time of timeSlots) {
                    // Get the LOCAL display time the user sees for this row
                    const localDisplay = typeof TimezoneService !== 'undefined'
                        ? TimezoneService.baseToLocalDisplay(time, monday)
                        : `${time.slice(0, 2)}:${time.slice(2)}`;

                    const localHour = parseInt(localDisplay.split(':')[0]);
                    const localMin = parseInt(localDisplay.split(':')[1]);
                    const localTotalMin = localHour * 60 + localMin;

                    // Convert "displayed day d + local time" to UTC for comparison
                    const utcTotalMin = localTotalMin - userOffsetMin;
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

        /**
         * Check if a cell is in the past.
         * @param {string} cellId - Local cell ID (e.g., 'mon_1900')
         * @returns {boolean}
         */
        function _isPastCell(cellId) {
            return _pastCells.has(cellId);
        }

        /**
         * Convert a local cell ID to its UTC slot ID for Firestore.
         */
        function _localToUtc(localCellId) {
            return _gridToUtcMap?.get(localCellId) || localCellId;
        }

        /**
         * Convert a UTC slot ID to its local cell ID for grid display.
         */
        function _utcToLocal(utcSlotId) {
            return _utcToGridMap?.get(utcSlotId) || null;
        }

        /**
         * Get the bounding rectangle of selected cells in viewport coordinates
         * @param {Array<string>} selectedCells - Array of cell IDs
         * @returns {Object|null} Bounds { top, left, right, bottom } or null if empty
         */
        function _getSelectionBounds(selectedCells) {
            if (selectedCells.length === 0) return null;

            let minTop = Infinity, minLeft = Infinity;
            let maxBottom = 0, maxRight = 0;

            selectedCells.forEach(cellId => {
                const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
                if (cell) {
                    const rect = cell.getBoundingClientRect();
                    minTop = Math.min(minTop, rect.top);
                    minLeft = Math.min(minLeft, rect.left);
                    maxBottom = Math.max(maxBottom, rect.bottom);
                    maxRight = Math.max(maxRight, rect.right);
                }
            });

            // Return null if no valid cells found
            if (minTop === Infinity) return null;

            return { top: minTop, left: minLeft, right: maxRight, bottom: maxBottom };
        }

        /**
         * Notify listeners of selection change
         */
        function _notifySelectionChange() {
            if (_onSelectionChangeCallback) {
                _onSelectionChangeCallback();
            }

            // Dispatch custom event for floating action button (Slice 5.0b)
            const selectedArray = Array.from(_selectedCells);
            const bounds = _getSelectionBounds(selectedArray);

            document.dispatchEvent(new CustomEvent('grid-selection-change', {
                detail: {
                    gridId: _weekId,
                    selectedCells: selectedArray.map(localId => ({ weekId: getWeekId(), slotId: _localToUtc(localId) })),
                    bounds: bounds
                }
            }));
        }

        /**
         * Handle cell click with notification
         */
        function _handleCellClickWithNotify(cellId) {
            if (_isPastCell(cellId)) return;

            const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
            if (!cell) return;

            if (_selectedCells.has(cellId)) {
                _selectedCells.delete(cellId);
                cell.classList.remove('selected');
            } else {
                _selectedCells.add(cellId);
                cell.classList.add('selected');
            }

            _notifySelectionChange();
        }

        /**
         * Get all cells within a rectangular selection
         */
        function _getCellsInRectangle(startId, endId) {
            const [startDay, startTime] = startId.split('_');
            const [endDay, endTime] = endId.split('_');

            const startDayIdx = DAYS.indexOf(startDay);
            const endDayIdx = DAYS.indexOf(endDay);
            const timeSlots = _getTimeSlots();
            const startTimeIdx = timeSlots.indexOf(startTime);
            const endTimeIdx = timeSlots.indexOf(endTime);

            // Get min/max for proper rectangle
            const minDay = Math.min(startDayIdx, endDayIdx);
            const maxDay = Math.max(startDayIdx, endDayIdx);
            const minTime = Math.min(startTimeIdx, endTimeIdx);
            const maxTime = Math.max(startTimeIdx, endTimeIdx);

            const cells = [];
            for (let d = minDay; d <= maxDay; d++) {
                for (let t = minTime; t <= maxTime; t++) {
                    cells.push(`${DAYS[d]}_${timeSlots[t]}`);
                }
            }
            return cells;
        }

        /**
         * Apply rectangular selection with toggle behavior
         */
        function _applyRectangularSelection(startId, endId) {
            const cellsInRect = _getCellsInRectangle(startId, endId)
                .filter(id => !_isPastCell(id));

            if (cellsInRect.length === 0) return;

            // Toggle behavior: if all are selected, deselect all; else select all
            const allSelected = cellsInRect.every(id => _selectedCells.has(id));

            cellsInRect.forEach(cellId => {
                const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
                if (!cell) return;

                if (allSelected) {
                    _selectedCells.delete(cellId);
                    cell.classList.remove('selected');
                } else {
                    _selectedCells.add(cellId);
                    cell.classList.add('selected');
                }
            });

            _notifySelectionChange();
        }

        /**
         * Update drag preview highlighting
         */
        function _updateDragPreview(startId, endId) {
            _clearDragPreview();

            const cellsInRect = _getCellsInRectangle(startId, endId);
            cellsInRect.forEach(cellId => {
                if (_isPastCell(cellId)) return;
                const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
                if (cell) cell.classList.add('drag-preview');
            });
        }

        /**
         * Clear drag preview from all cells
         */
        function _clearDragPreview() {
            const previewCells = _container?.querySelectorAll('.drag-preview');
            previewCells?.forEach(cell => cell.classList.remove('drag-preview'));
        }

        /**
         * Handle pointer down for drag selection.
         * Commits to drag immediately for all pointer types.
         * On mobile, CSS touch-action:none on the grid prevents browser
         * scroll, so no disambiguation needed.
         */
        function _handlePointerDown(e) {
            // Ignore secondary pointers (multi-touch)
            if (!e.isPrimary) return;

            // Don't start drag if clicking on overflow badge
            if (e.target.closest('.player-badge.overflow')) {
                return;
            }

            const cell = e.target.closest('.grid-cell');
            if (!cell || !cell.dataset.cellId) return;

            // Don't start drag on past cells
            if (_isPastCell(cell.dataset.cellId)) return;

            _isDragging = true;
            _dragStartCell = cell.dataset.cellId;
            _dragStartPos = { x: e.clientX, y: e.clientY };
            _dragDistance = 0;

            // Add dragging class to prevent text selection
            const gridContainer = _container?.querySelector('.availability-grid-container');
            if (gridContainer) gridContainer.classList.add('dragging');

            // Start preview
            _updateDragPreview(_dragStartCell, _dragStartCell);

            // Prevent text selection and browser scroll
            e.preventDefault();
        }

        /**
         * Handle pointer move for drag selection.
         * Always uses elementFromPoint for reliable cross-cell detection
         * on both mouse and touch.
         */
        function _handlePointerMove(e) {
            if (!_isDragging || !_dragStartCell) return;

            const dx = Math.abs(e.clientX - _dragStartPos.x);
            const dy = Math.abs(e.clientY - _dragStartPos.y);

            // Track drag distance
            _dragDistance = Math.max(_dragDistance, dx, dy);

            // Use elementFromPoint for reliable cell detection on touch
            // (e.target may not update on touch devices without pointer capture)
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const cell = el?.closest('.grid-cell');

            if (!cell || !cell.dataset.cellId) return;

            // Verify the cell belongs to this grid instance
            if (!_container?.contains(cell)) return;

            _lastValidDragCell = cell.dataset.cellId;
            _updateDragPreview(_dragStartCell, cell.dataset.cellId);

            e.preventDefault();
        }

        /**
         * Handle pointer up for drag selection (replaces mouseup)
         */
        function _handlePointerUp(e) {
            if (!_isDragging) return;

            // Remove dragging class
            const gridContainer = _container?.querySelector('.availability-grid-container');
            if (gridContainer) gridContainer.classList.remove('dragging');

            // If barely moved, treat as click (handled by click event)
            if (_dragDistance < DRAG_THRESHOLD) {
                _clearDragPreview();
                _isDragging = false;
                _dragStartCell = null;
                _lastValidDragCell = null;
                return;
            }

            // Use last valid drag cell (stays within this grid) or fall back to start
            const endCell = _lastValidDragCell || _dragStartCell;

            // Apply selection to all cells in rectangle
            _applyRectangularSelection(_dragStartCell, endCell);
            _clearDragPreview();

            _isDragging = false;
            _dragStartCell = null;
            _lastValidDragCell = null;
        }

        /**
         * Handle shift+click for range selection
         */
        function _handleShiftClick(cellId) {
            if (!_lastClickedCell) {
                // No previous cell, treat as normal click
                _handleCellClickWithNotify(cellId);
                _lastClickedCell = cellId;
                return;
            }

            // Select rectangle between last clicked and current
            _applyRectangularSelection(_lastClickedCell, cellId);
            _lastClickedCell = cellId;
        }

        /**
         * Handle day header click (toggle entire column)
         */
        function _handleDayHeaderClick(day) {
            const columnCells = _getTimeSlots().map(time => `${day}_${time}`)
                .filter(id => !_isPastCell(id));

            if (columnCells.length === 0) return;

            // Toggle: if all selected, deselect; else select all
            const allSelected = columnCells.every(id => _selectedCells.has(id));

            columnCells.forEach(cellId => {
                const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
                if (!cell) return;

                if (allSelected) {
                    _selectedCells.delete(cellId);
                    cell.classList.remove('selected');
                } else {
                    _selectedCells.add(cellId);
                    cell.classList.add('selected');
                }
            });

            _notifySelectionChange();
        }

        /**
         * Handle time header click (toggle entire row)
         */
        function _handleTimeHeaderClick(time) {
            const rowCells = DAYS.map(day => `${day}_${time}`)
                .filter(id => !_isPastCell(id));

            if (rowCells.length === 0) return;

            // Toggle: if all selected, deselect; else select all
            const allSelected = rowCells.every(id => _selectedCells.has(id));

            rowCells.forEach(cellId => {
                const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
                if (!cell) return;

                if (allSelected) {
                    _selectedCells.delete(cellId);
                    cell.classList.remove('selected');
                } else {
                    _selectedCells.add(cellId);
                    cell.classList.add('selected');
                }
            });

            _notifySelectionChange();
        }

        /**
         * Select all cells in this grid
         */
        function selectAll() {
            DAYS.forEach(day => {
                _getTimeSlots().forEach(time => {
                    const cellId = `${day}_${time}`;
                    if (_isPastCell(cellId)) return;
                    _selectedCells.add(cellId);
                    const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
                    if (cell) cell.classList.add('selected');
                });
            });
            _notifySelectionChange();
        }

        /**
         * Clear all selections in this grid
         */
        function clearAll() {
            clearSelection();
            _notifySelectionChange();
        }

        function _render() {
            if (!_container) return;

            // Build UTC conversion maps and past-cell tracking for this week
            _buildUtcMaps();
            _buildPastCells();

            // Get day labels with dates for this week
            const dayLabelsWithDates = getDayLabelsWithDates(_weekId);

            // Reference date for timezone conversion
            const refDate = DateUtils.getMondayOfWeek(_weekId);

            // Slice 14.0b: Determine if grid needs scrolling
            const timeSlots = _getTimeSlots();
            const isMobile = window.matchMedia('(max-width: 1024px)').matches;
            const isScrollable = !isMobile && timeSlots.length > SCROLL_THRESHOLD;

            // Build the grid HTML - compact for 1080p
            // Cell IDs use CET base times; data-utc-slot carries the UTC Firestore key
            _container.innerHTML = `
                <div class="availability-grid-container">
                    <!-- Day Headers Row -->
                    <div class="grid-header">
                        <div class="time-label-spacer"></div>
                        ${DAYS.map((day, idx) => {
                            const allPast = timeSlots.every(time => _isPastCell(`${day}_${time}`));
                            const pastDayClass = allPast ? ' past-day' : '';
                            return `<div class="day-header clickable${pastDayClass}" data-day="${day}">${dayLabelsWithDates[idx]}</div>`;
                        }).join('')}
                    </div>

                    <!-- Time Rows -->
                    <div class="grid-body${isScrollable ? ' scrollable' : ''}">
                        ${timeSlots.map(time => {
                            // Convert CET base time to user's local time for display
                            const displayTime = typeof TimezoneService !== 'undefined'
                                ? TimezoneService.baseToLocalDisplay(time, refDate)
                                : formatTime(time);
                            return `
                            <div class="grid-row">
                                <div class="time-label clickable" data-time="${time}">${displayTime}</div>
                                ${DAYS.map(day => {
                                    const cellId = `${day}_${time}`;
                                    const utcSlotId = _localToUtc(cellId);
                                    const pastClass = _isPastCell(cellId) ? ' past-slot' : '';
                                    return `<div class="grid-cell${pastClass}" data-cell-id="${cellId}" data-utc-slot="${utcSlotId}"></div>`;
                                }).join('')}
                            </div>
                        `;}).join('')}
                    </div>
                </div>
            `;

            _attachEventListeners();

            // Slice 14.0b: Auto-scroll to EU evening window when grid is scrollable
            if (isScrollable) {
                _scrollToDefaultPosition();
            }
        }

        /**
         * Slice 14.0b: Scroll grid body so EU evening window (19:30 CET) is near the top
         */
        function _scrollToDefaultPosition() {
            const gridBody = _container?.querySelector('.grid-body');
            if (!gridBody) return;

            // Target: 1930 CET — first "real action" slot for most EU users
            const targetRow = gridBody.querySelector('.time-label[data-time="1930"]');
            if (targetRow) {
                const row = targetRow.closest('.grid-row');
                if (row) {
                    gridBody.scrollTop = row.offsetTop - gridBody.offsetTop;
                }
            }
        }

        /**
         * Handle overflow badge click
         */
        function _handleOverflowClick(e) {
            const overflowBadge = e.target.closest('.player-badge.overflow');
            if (!overflowBadge) return;

            e.stopPropagation(); // Don't trigger cell selection

            const cell = overflowBadge.closest('.grid-cell');
            const cellId = cell?.dataset.cellId;

            if (cellId && _onOverflowClickCallback) {
                // Pass UTC slot ID to callback for Firestore lookup
                _onOverflowClickCallback(_localToUtc(cellId), _weekId);
            }
        }

        /**
         * Handle cell hover for tooltip (cells with 4+ players)
         */
        function _handleCellMouseEnter(e) {
            // Don't show player tooltip in comparison mode - match tooltip handles it
            if (_comparisonMode) return;

            const cell = e.target.closest('.grid-cell');
            if (!cell || !cell.classList.contains('has-overflow')) return;

            const cellId = cell.dataset.cellId;
            const playerIds = _availabilitySlots?.[cellId] || [];
            const unavailableIds = _unavailabilitySlots?.[cellId] || [];
            const totalCount = playerIds.length + unavailableIds.length;

            if (totalCount >= TOOLTIP_THRESHOLD && _playerRoster && typeof PlayerTooltip !== 'undefined') {
                const availablePlayers = PlayerDisplayService.getPlayersDisplay(
                    playerIds,
                    _playerRoster,
                    _currentUserId
                );
                const unavailablePlayers = PlayerDisplayService.getPlayersDisplay(
                    unavailableIds,
                    _playerRoster,
                    _currentUserId
                );
                PlayerTooltip.show(cell, availablePlayers, _currentUserId, unavailablePlayers);
            }
        }

        /**
         * Handle cell mouse leave for tooltip
         */
        function _handleCellMouseLeave(e) {
            const cell = e.target.closest('.grid-cell');
            if (!cell || !cell.classList.contains('has-overflow')) return;

            if (typeof PlayerTooltip !== 'undefined') {
                PlayerTooltip.hide();
            }
        }

        /**
         * Attach all event listeners for the grid
         */
        function _attachEventListeners() {
            // Click handler for cells, day headers, time headers, and overflow badges
            _clickHandler = (e) => {
                // Check for overflow badge click first
                if (e.target.closest('.player-badge.overflow')) {
                    _handleOverflowClick(e);
                    return;
                }

                // Cell click (with shift detection)
                const cell = e.target.closest('.grid-cell');
                if (cell && cell.dataset.cellId) {
                    // Slice 3.5: Check if clicking a match cell in comparison mode
                    if (_comparisonMode &&
                        (cell.classList.contains('comparison-match-full') ||
                         cell.classList.contains('comparison-match-partial'))) {
                        // Open comparison modal instead of selecting
                        e.stopPropagation();
                        const utcSlotId = _localToUtc(cell.dataset.cellId);
                        const weekId = getWeekId();
                        if (typeof ComparisonModal !== 'undefined') {
                            ComparisonModal.show(weekId, utcSlotId);
                        }
                        return;
                    }

                    if (e.shiftKey && _lastClickedCell) {
                        _handleShiftClick(cell.dataset.cellId);
                    } else {
                        // Only handle as click if not a drag
                        if (_dragDistance < DRAG_THRESHOLD) {
                            _handleCellClickWithNotify(cell.dataset.cellId);
                            _lastClickedCell = cell.dataset.cellId;
                        }
                    }
                    return;
                }

                // Day header click
                const dayHeader = e.target.closest('.day-header');
                if (dayHeader && dayHeader.dataset.day) {
                    _handleDayHeaderClick(dayHeader.dataset.day);
                    return;
                }

                // Time header click
                const timeLabel = e.target.closest('.time-label');
                if (timeLabel && timeLabel.dataset.time) {
                    _handleTimeHeaderClick(timeLabel.dataset.time);
                    return;
                }
            };
            _container.addEventListener('click', _clickHandler);

            // Drag selection events (pointer events: mouse + touch + pen)
            _container.addEventListener('pointerdown', _handlePointerDown, { passive: false });
            _container.addEventListener('pointermove', _handlePointerMove, { passive: false });

            // Pointer up on document (in case drag ends outside grid)
            _documentPointerUpHandler = _handlePointerUp;
            document.addEventListener('pointerup', _documentPointerUpHandler);

            // Hover events for tooltip (pointerenter/pointerleave for mouse+touch compat)
            _container.addEventListener('pointerenter', _handleCellMouseEnter, true);
            _container.addEventListener('pointerleave', _handleCellMouseLeave, true);

            // Hover events for comparison match tooltip (Slice 3.4)
            _container.addEventListener('pointerenter', _handleMatchCellMouseEnter, true);
            _container.addEventListener('pointerleave', _handleMatchCellMouseLeave, true);

            // Hover events for header highlight (Slice 5.0.1)
            _container.addEventListener('pointerover', _handleCellHoverHighlight);
            _container.addEventListener('pointerout', _handleCellHoverUnhighlight);
        }

        /**
         * Highlight day/time headers when hovering a cell (Slice 5.0.1)
         */
        function _handleCellHoverHighlight(e) {
            if (!_container) return;
            const cell = e.target.closest('.grid-cell');
            if (!cell || !cell.dataset.cellId) return;

            const [day, time] = cell.dataset.cellId.split('_');

            // Highlight corresponding day header
            const dayHeader = _container.querySelector(`.day-header[data-day="${day}"]`);
            if (dayHeader) dayHeader.classList.add('highlight');

            // Highlight corresponding time label
            const timeLabel = _container.querySelector(`.time-label[data-time="${time}"]`);
            if (timeLabel) timeLabel.classList.add('highlight');
        }

        /**
         * Remove header highlights when leaving a cell (Slice 5.0.1)
         */
        function _handleCellHoverUnhighlight(e) {
            if (!_container) return;
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            // Remove all highlights
            _container.querySelectorAll('.day-header.highlight, .time-label.highlight').forEach(el => {
                el.classList.remove('highlight');
            });
        }

        function init() {
            _container = document.getElementById(containerId);
            if (!_container) {
                console.error(`AvailabilityGrid: Container #${containerId} not found`);
                return null;
            }
            _selectedCells.clear();
            _buildUtcMaps();
            _render();
            return instance;
        }

        function getSelectedCells() {
            // Return UTC slot IDs for Firestore storage
            return Array.from(_selectedCells).map(localId => _localToUtc(localId));
        }

        function clearSelection() {
            _selectedCells.forEach(id => {
                const cell = _container?.querySelector(`[data-cell-id="${id}"]`);
                if (cell) cell.classList.remove('selected');
            });
            _selectedCells.clear();
        }

        function cleanup() {
            // Remove container event listeners
            if (_container) {
                if (_clickHandler) {
                    _container.removeEventListener('click', _clickHandler);
                }
                _container.removeEventListener('pointerdown', _handlePointerDown);
                _container.removeEventListener('pointermove', _handlePointerMove);
                _container.removeEventListener('pointerenter', _handleCellMouseEnter, true);
                _container.removeEventListener('pointerleave', _handleCellMouseLeave, true);
                _container.removeEventListener('pointerenter', _handleMatchCellMouseEnter, true);
                _container.removeEventListener('pointerleave', _handleMatchCellMouseLeave, true);
                _container.removeEventListener('pointerover', _handleCellHoverHighlight);
                _container.removeEventListener('pointerout', _handleCellHoverUnhighlight);
            }

            // Remove document-level listener for drag
            if (_documentPointerUpHandler) {
                document.removeEventListener('pointerup', _documentPointerUpHandler);
                _documentPointerUpHandler = null;
            }

            // Clear drag preview if active
            _clearDragPreview();

            // Hide tooltip if visible
            if (typeof PlayerTooltip !== 'undefined') {
                PlayerTooltip.hideImmediate();
            }

            // Hide and cleanup match tooltip (Slice 3.4)
            _hideMatchTooltipImmediate();
            if (_matchTooltip) {
                _matchTooltip.remove();
                _matchTooltip = null;
            }

            // Reset state
            _selectedCells.clear();
            _pastCells.clear();
            _isDragging = false;
            _dragStartCell = null;
            _lastClickedCell = null;
            _lastValidDragCell = null;
            _playerRoster = null;
            _currentUserId = null;
            _availabilitySlots = null;
            _availabilitySlotsUtc = null;
            _onOverflowClickCallback = null;
            _comparisonMode = false;

            if (_container) _container.innerHTML = '';
            _container = null;
        }

        function getWeekId() {
            // Return full ISO week format (YYYY-WW) for compatibility with ComparisonEngine
            const year = DateUtils.getISOWeekYear(new Date());
            return `${year}-${String(_weekId).padStart(2, '0')}`;
        }

        /**
         * Set syncing state on specific cells (adds shimmer animation)
         * @param {Array<string>} cellIds - Array of cell IDs to mark as syncing
         */
        function setSyncingCells(cellIds) {
            cellIds.forEach(cellId => {
                const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
                if (cell) {
                    cell.classList.add('syncing');
                }
            });
        }

        /**
         * Clear syncing state from all cells
         */
        function clearSyncingCells() {
            const syncingCells = _container?.querySelectorAll('.syncing');
            syncingCells?.forEach(cell => cell.classList.remove('syncing'));
        }

        /**
         * Update cell visual state based on availability data
         * @param {Object} availabilityData - Availability data with slots
         * @param {string} currentUserId - Current user's ID
         */
        function updateAvailabilityDisplay(availabilityData, currentUserId) {
            if (!_container || !availabilityData) return;

            // Clear all availability states first
            const allCells = _container.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                cell.classList.remove('user-available');
            });

            // Helper to mark a UTC slot as available for the user
            function _markUtcSlotAvailable(utcSlotId, userIds) {
                if (!Array.isArray(userIds) || !userIds.includes(currentUserId)) return;
                const localCellId = _utcToLocal(utcSlotId);
                if (!localCellId) return; // Slot outside display range
                const cell = _container.querySelector(`[data-cell-id="${localCellId}"]`);
                if (cell) cell.classList.add('user-available');
            }

            // Handle both nested slots object AND flat "slots.xxx" keys from Firestore
            Object.entries(availabilityData).forEach(([key, userIds]) => {
                // Check for nested slots object
                if (key === 'slots' && typeof userIds === 'object' && !Array.isArray(userIds)) {
                    Object.entries(userIds).forEach(([utcSlotId, nestedUserIds]) => {
                        _markUtcSlotAvailable(utcSlotId, nestedUserIds);
                    });
                    return;
                }

                // Check for flat "slots.xxx" keys
                if (key.startsWith('slots.')) {
                    const utcSlotId = key.replace('slots.', '');
                    _markUtcSlotAvailable(utcSlotId, userIds);
                }
            });
        }

        /**
         * Register a callback for selection changes
         * @param {Function} callback - Called when selection changes
         */
        function onSelectionChange(callback) {
            _onSelectionChangeCallback = callback;
        }

        /**
         * Select a specific cell by UTC slot ID (for template loading).
         * Templates store UTC slot IDs; this maps to the local grid position.
         * @param {string} utcSlotId - The UTC slot ID to select (e.g., "mon_1700")
         */
        function selectCell(utcSlotId) {
            const localCellId = _utcToLocal(utcSlotId);
            if (!localCellId) return; // Slot outside display range
            if (_isPastCell(localCellId)) return;
            const cell = _container?.querySelector(`[data-cell-id="${localCellId}"]`);
            if (cell && !_selectedCells.has(localCellId)) {
                _selectedCells.add(localCellId);
                cell.classList.add('selected');
            }
        }

        // ========================================
        // Slice 2.5: Team View Display Functions
        // ========================================

        /**
         * Escape HTML to prevent XSS
         */
        function _escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        /**
         * Render player badges inside a cell
         * Slice 5.0.1: Supports 4 display modes (initials, coloredInitials, coloredDots, avatars)
         * @param {HTMLElement} cell - The grid cell element
         * @param {Array<string>} playerIds - User IDs of available players
         * @param {Array} playerRoster - Team's playerRoster array
         * @param {string} currentUserId - Current user's ID
         * @param {string} displayMode - 'initials', 'coloredInitials', 'coloredDots', or 'avatars'
         */
        function _renderPlayerBadges(cell, playerIds, playerRoster, currentUserId, displayMode, unavailableIds) {
            const hasAvailable = playerIds && playerIds.length > 0;
            const hasUnavailable = unavailableIds && unavailableIds.length > 0;

            if (!hasAvailable && !hasUnavailable) {
                cell.innerHTML = '';
                cell.classList.remove('has-players', 'has-overflow', 'ready-for-match');
                return;
            }

            cell.classList.add('has-players');

            const players = hasAvailable ? PlayerDisplayService.getPlayersDisplay(playerIds, playerRoster, currentUserId) : [];
            const unavailPlayers = hasUnavailable ? PlayerDisplayService.getPlayersDisplay(unavailableIds, playerRoster, currentUserId) : [];

            // Available players get priority for visible badge slots
            const totalVisible = players.length + unavailPlayers.length;
            const allOrdered = [...players, ...unavailPlayers];
            const maxDirect = _getMaxBadges(displayMode, allOrdered);

            // Overflow logic (two hard rules, in priority order):
            //   Rule 1: ALWAYS show at least 4 badges (4on4 scheduler, non-negotiable)
            //   Rule 2: Never show "+1" — IF there's room to squeeze the extra player in
            // When rule 2 conflicts with rule 1 (can't squeeze, can't drop below 4), "+1" is OK.
            let needsOverflow = false;
            let badgeSlots = totalVisible;

            if (totalVisible > maxDirect) {
                // Check if the +1 player is compact enough to squeeze in
                const extraPlayer = allOrdered[maxDirect];
                const isCompact = displayMode === 'coloredDots' ||
                    (extraPlayer && (extraPlayer.initials || '??').length <= 1);

                if (totalVisible === maxDirect + 1 && isCompact) {
                    // Squeeze the 1 extra in directly — cheaper than showing a "+1" badge
                    badgeSlots = totalVisible;
                } else {
                    // Overflow: use maxDirect-1 for badges, but never fewer than 4
                    needsOverflow = true;
                    badgeSlots = Math.max(maxDirect - 1, 4);
                }
            }

            // Calculate how many of each to show
            let visibleAvail, visibleUnavail, overflowCount;
            if (needsOverflow) {
                // Prioritize available badges
                visibleAvail = players.slice(0, badgeSlots);
                const remainingSlots = badgeSlots - visibleAvail.length;
                visibleUnavail = unavailPlayers.slice(0, Math.max(0, remainingSlots));
                overflowCount = totalVisible - badgeSlots;
            } else {
                visibleAvail = players;
                visibleUnavail = unavailPlayers;
                overflowCount = 0;
            }

            // Mark cell for tooltip behavior if 5+ total players
            if (totalVisible >= TOOLTIP_THRESHOLD) {
                cell.classList.add('has-overflow');
                cell.dataset.playerCount = totalVisible;
            } else {
                cell.classList.remove('has-overflow');
                delete cell.dataset.playerCount;
            }

            // Mark cell as ready for match if 4+ AVAILABLE players (not unavailable!)
            if (players.length >= 4) {
                cell.classList.add('ready-for-match');
            } else {
                cell.classList.remove('ready-for-match');
            }

            // Helper: render a single player badge HTML
            function renderBadgeHtml(player, extraClass) {
                const isCurrentUserClass = player.isCurrentUser ? 'current-user' : '';
                const classes = [isCurrentUserClass, extraClass].filter(Boolean).join(' ');
                const escapedName = _escapeHtml(player.displayName);
                const escapedInitials = _escapeHtml(player.initials);

                const playerColor = typeof PlayerColorService !== 'undefined'
                    ? PlayerColorService.getPlayerColor(player.userId)
                    : null;
                const colorOrDefault = typeof PlayerColorService !== 'undefined'
                    ? PlayerColorService.getPlayerColorOrDefault(player.userId)
                    : '#6B7280';

                switch (displayMode) {
                    case 'avatars':
                        if (player.photoURL) {
                            return `<div class="player-badge avatar ${classes}" data-player-name="${escapedName}">
                                <img src="${player.photoURL}" alt="${escapedInitials}" />
                            </div>`;
                        }
                        return `<div class="player-badge initials ${classes}" data-player-name="${escapedName}">
                            ${escapedInitials}
                        </div>`;

                    case 'coloredDots':
                        return `<span class="player-badge colored-dot ${classes}"
                              style="background-color: ${colorOrDefault}"
                              data-player-name="${escapedName}"
                              title="${escapedName}">
                        </span>`;

                    case 'coloredInitials': {
                        return `<div class="player-badge initials colored ${classes}"
                             style="color: ${colorOrDefault}"
                             data-player-name="${escapedName}">
                            ${escapedInitials}
                        </div>`;
                    }

                    case 'initials':
                    default:
                        return `<div class="player-badge initials ${classes}" data-player-name="${escapedName}">
                            ${escapedInitials}
                        </div>`;
                }
            }

            let badgesHtml = '<div class="player-badges">';

            // Render available player badges
            visibleAvail.forEach(player => {
                badgesHtml += renderBadgeHtml(player, '');
            });

            // Render unavailable player badges (Slice 15.0)
            if (visibleUnavail.length > 0) {
                visibleUnavail.forEach(player => {
                    badgesHtml += renderBadgeHtml(player, 'unavailable');
                });
            }

            if (needsOverflow) {
                badgesHtml += `
                    <span class="player-badge overflow" data-overflow-count="${overflowCount}">
                        +
                    </span>
                `;
            }

            badgesHtml += '</div>';
            cell.innerHTML = badgesHtml;
        }

        /**
         * Update all cells with player availability data (team view mode)
         * @param {Object} availabilityData - The availability document data
         * @param {Array} playerRoster - Team's playerRoster array
         * @param {string} currentUserId - Current user's ID
         */
        function updateTeamDisplay(availabilityData, playerRoster, currentUserId) {
            if (!_container || !availabilityData) return;

            // Store data for tooltip access
            _playerRoster = playerRoster;
            _currentUserId = currentUserId;

            // Extract UTC slots from availability data (handle both flat and nested structures)
            let utcSlots = {};
            if (availabilityData.slots && typeof availabilityData.slots === 'object') {
                utcSlots = availabilityData.slots;
            } else {
                // Handle flat "slots.xxx" keys
                Object.entries(availabilityData).forEach(([key, value]) => {
                    if (key.startsWith('slots.')) {
                        const slotId = key.replace('slots.', '');
                        utcSlots[slotId] = value;
                    }
                });
            }

            // Extract unavailable data (Slice 15.0)
            let utcUnavailable = {};
            if (availabilityData.unavailable && typeof availabilityData.unavailable === 'object') {
                utcUnavailable = availabilityData.unavailable;
            }

            // Store original UTC slots for refreshDisplay
            _availabilitySlotsUtc = utcSlots;
            _unavailabilitySlotsUtc = utcUnavailable;

            // Build local-keyed slots for tooltip access (map UTC → local)
            const localSlots = {};
            for (const [utcSlotId, playerIds] of Object.entries(utcSlots)) {
                const localCellId = _utcToLocal(utcSlotId);
                if (localCellId) {
                    localSlots[localCellId] = playerIds;
                }
            }
            _availabilitySlots = localSlots;

            // Build local-keyed unavailable slots (Slice 15.0)
            const localUnavailable = {};
            for (const [utcSlotId, playerIds] of Object.entries(utcUnavailable)) {
                const localCellId = _utcToLocal(utcSlotId);
                if (localCellId) {
                    localUnavailable[localCellId] = playerIds;
                }
            }
            _unavailabilitySlots = localUnavailable;

            const displayMode = typeof PlayerDisplayService !== 'undefined'
                ? PlayerDisplayService.getDisplayMode()
                : 'initials';

            // Process each cell using local-mapped data
            const allCells = _container.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                const cellId = cell.dataset.cellId;
                const playerIds = localSlots[cellId] || [];
                const unavailableIds = localUnavailable[cellId] || [];

                _renderPlayerBadges(cell, playerIds, playerRoster, currentUserId, displayMode, unavailableIds);

                // Re-apply scheduled match label if this cell has one
                // (_renderPlayerBadges overwrites innerHTML, so the label gets wiped)
                _reapplyScheduledMatchLabel(cell);

                // Update user-available state (keep existing border indicator)
                if (playerIds.includes(currentUserId)) {
                    cell.classList.add('user-available');
                } else {
                    cell.classList.remove('user-available');
                }
            });

            // Hide stale tooltip if grid re-rendered
            if (typeof PlayerTooltip !== 'undefined' && PlayerTooltip.isVisible()) {
                PlayerTooltip.hideImmediate();
            }
        }

        /**
         * Register callback for overflow badge clicks
         * @param {Function} callback - Called with (cellId, weekId) when overflow is clicked
         */
        function onOverflowClick(callback) {
            _onOverflowClickCallback = callback;
        }

        /**
         * Refresh the display (e.g., when display mode changes)
         */
        function refreshDisplay() {
            if (_availabilitySlotsUtc && _playerRoster && _currentUserId) {
                updateTeamDisplay(
                    { slots: _availabilitySlotsUtc, unavailable: _unavailabilitySlotsUtc || {} },
                    _playerRoster,
                    _currentUserId
                );
            }
        }

        // ========================================
        // Slice 3.4: Comparison Mode Functions
        // ========================================

        /**
         * Enter comparison mode - adds visual styling to container
         */
        function enterComparisonMode() {
            _comparisonMode = true;
            const gridContainer = _container?.querySelector('.availability-grid-container');
            if (gridContainer) {
                gridContainer.classList.add('comparison-mode');
            }
        }

        /**
         * Exit comparison mode - removes all comparison styling
         */
        function exitComparisonMode() {
            _comparisonMode = false;
            const gridContainer = _container?.querySelector('.availability-grid-container');
            if (gridContainer) {
                gridContainer.classList.remove('comparison-mode');
            }
            // Clear all match highlights
            clearComparisonHighlights();
        }

        /**
         * Update cells with comparison match highlights
         * Called when comparison results change
         */
        function updateComparisonHighlights() {
            if (!_container || typeof ComparisonEngine === 'undefined') return;

            // Use formatted week ID (YYYY-WW) for ComparisonEngine lookup
            const weekIdFormatted = getWeekId();

            const allCells = _container.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                const cellId = cell.dataset.cellId;
                if (!cellId) return;

                // Remove existing comparison classes
                cell.classList.remove('comparison-match-full', 'comparison-match-partial');

                // Remove existing match count badge
                const existingBadge = cell.querySelector('.match-count-badge');
                if (existingBadge) existingBadge.remove();

                // Get match info from ComparisonEngine using UTC slot ID
                const utcSlotId = _localToUtc(cellId);
                const matchInfo = ComparisonEngine.getSlotMatchInfo(weekIdFormatted, utcSlotId);

                if (matchInfo.hasMatch) {
                    // Add appropriate class based on match type
                    if (matchInfo.isFullMatch) {
                        cell.classList.add('comparison-match-full');
                    } else {
                        cell.classList.add('comparison-match-partial');
                    }

                    // Add match count badge if multiple opponents match
                    if (matchInfo.matches.length > 1) {
                        const badge = document.createElement('span');
                        badge.className = 'match-count-badge';
                        badge.textContent = matchInfo.matches.length;
                        cell.appendChild(badge);
                    }
                }
            });
        }

        /**
         * Clear all comparison highlights from cells
         */
        function clearComparisonHighlights() {
            if (!_container) return;

            const allCells = _container.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                cell.classList.remove('comparison-match-full', 'comparison-match-partial');

                // Remove match count badge
                const badge = cell.querySelector('.match-count-badge');
                if (badge) badge.remove();
            });
        }

        /**
         * Check if comparison mode is active
         * @returns {boolean}
         */
        function isComparisonMode() {
            return _comparisonMode;
        }

        // ========================================
        // Scheduled Match Highlights
        // ========================================

        let _scheduledMatchMap = new Map(); // UTC slotId → match object

        /**
         * Re-apply the scheduled match label to a cell after innerHTML was overwritten.
         * Called by updateTeamDisplay after _renderPlayerBadges wipes the cell content.
         */
        function _reapplyScheduledMatchLabel(cell) {
            const cellId = cell.dataset.cellId;
            if (!cellId) return;

            const utcSlotId = _localToUtc(cellId);
            const match = _scheduledMatchMap.get(utcSlotId);
            if (!match) return;

            // Ensure class is present
            cell.classList.add('has-scheduled-match');

            // Remove any existing label (shouldn't be one, but be safe)
            const existing = cell.querySelector('.scheduled-match-label');
            if (existing) existing.remove();

            // Re-create the label
            const label = document.createElement('div');
            label.className = 'scheduled-match-label';

            const teamA = typeof TeamService !== 'undefined' ? TeamService.getTeamFromCache(match.teamAId) : null;
            const teamB = typeof TeamService !== 'undefined' ? TeamService.getTeamFromCache(match.teamBId) : null;
            const logoA = teamA?.activeLogo?.urls?.small || '';
            const logoB = teamB?.activeLogo?.urls?.small || '';
            const tagA = _escapeHtml(match.teamATag || '');
            const tagB = _escapeHtml(match.teamBTag || '');

            label.innerHTML = `${logoA ? `<img src="${logoA}" class="sml-logo" alt="${tagA}">` : `<span class="sml-tag">${tagA}</span>`}<span class="sml-vs">vs</span>${logoB ? `<img src="${logoB}" class="sml-logo" alt="${tagB}">` : `<span class="sml-tag">${tagB}</span>`}`;
            cell.appendChild(label);
        }

        /**
         * Update cells with scheduled match highlights.
         * Shows team logos inside cells that have a scheduled match.
         * @param {Array} matches - Array of scheduled match objects for current week
         */
        function updateScheduledMatchHighlights(matches) {
            if (!_container) return;

            // Build lookup: UTC slotId → match
            _scheduledMatchMap.clear();
            for (const match of matches) {
                if (match.slotId) {
                    _scheduledMatchMap.set(match.slotId, match);
                }
            }

            const allCells = _container.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                const cellId = cell.dataset.cellId;
                if (!cellId) return;

                // Remove existing scheduled match indicator
                cell.classList.remove('has-scheduled-match');
                const existing = cell.querySelector('.scheduled-match-label');
                if (existing) existing.remove();

                // Check if this cell has a scheduled match (convert to UTC)
                const utcSlotId = _localToUtc(cellId);
                const match = _scheduledMatchMap.get(utcSlotId);

                if (match) {
                    cell.classList.add('has-scheduled-match');

                    // Add logo vs logo overlay inside the cell
                    const label = document.createElement('div');
                    label.className = 'scheduled-match-label';

                    const teamA = typeof TeamService !== 'undefined' ? TeamService.getTeamFromCache(match.teamAId) : null;
                    const teamB = typeof TeamService !== 'undefined' ? TeamService.getTeamFromCache(match.teamBId) : null;
                    const logoA = teamA?.activeLogo?.urls?.small || '';
                    const logoB = teamB?.activeLogo?.urls?.small || '';
                    const tagA = _escapeHtml(match.teamATag || '');
                    const tagB = _escapeHtml(match.teamBTag || '');

                    label.innerHTML = `${logoA ? `<img src="${logoA}" class="sml-logo" alt="${tagA}">` : `<span class="sml-tag">${tagA}</span>`}<span class="sml-vs">vs</span>${logoB ? `<img src="${logoB}" class="sml-logo" alt="${tagB}">` : `<span class="sml-tag">${tagB}</span>`}`;
                    cell.appendChild(label);
                }
            });
        }

        /**
         * Clear all scheduled match highlights
         */
        function clearScheduledMatchHighlights() {
            _scheduledMatchMap.clear();
            if (!_container) return;

            const allCells = _container.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                cell.classList.remove('has-scheduled-match');
                const label = cell.querySelector('.scheduled-match-label');
                if (label) label.remove();
            });
        }

        /**
         * Show tooltip for a scheduled match cell (roster vs roster)
         */
        async function _showScheduledMatchTooltip(cell, match) {
            if (typeof TeamService === 'undefined' || typeof AvailabilityService === 'undefined') return;

            const teamA = TeamService.getTeamFromCache(match.teamAId);
            const teamB = TeamService.getTeamFromCache(match.teamBId);
            if (!teamA || !teamB) return;

            const rosterA = teamA.playerRoster || [];
            const rosterB = teamB.playerRoster || [];

            // Load availability
            let availA = { slots: {} };
            let availB = { slots: {} };
            try {
                [availA, availB] = await Promise.all([
                    AvailabilityService.loadWeekAvailability(match.teamAId, match.weekId),
                    AvailabilityService.loadWeekAvailability(match.teamBId, match.weekId)
                ]);
            } catch (err) {
                console.warn('Failed to load availability for scheduled match tooltip:', err);
            }

            const availableIdsA = availA.slots?.[match.slotId] || [];
            const availableIdsB = availB.slots?.[match.slotId] || [];

            const teamAAvailable = rosterA.filter(p => availableIdsA.includes(p.userId));
            const teamAUnavailable = rosterA.filter(p => !availableIdsA.includes(p.userId));
            const teamBAvailable = rosterB.filter(p => availableIdsB.includes(p.userId));
            const teamBUnavailable = rosterB.filter(p => !availableIdsB.includes(p.userId));

            const renderPlayers = (available, unavailable, isUserTeam) => {
                const availHtml = available.map(p => {
                    const isYou = isUserTeam && p.userId === _currentUserId;
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

            // Determine which team is the user's
            const userTeamIds = [];
            try {
                const userDoc = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js')
                    .then(({ doc, getDoc }) => getDoc(doc(window.firebase.db, 'users', _currentUserId)));
                if (userDoc.exists()) {
                    userTeamIds.push(...Object.keys(userDoc.data().teams || {}));
                }
            } catch (err) { /* ignore */ }

            const isUserTeamA = userTeamIds.includes(match.teamAId);
            const isUserTeamB = userTeamIds.includes(match.teamBId);

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

            _createMatchTooltip();
            _matchTooltipCell = cell;

            if (_matchTooltipHideTimeout) {
                clearTimeout(_matchTooltipHideTimeout);
                _matchTooltipHideTimeout = null;
            }

            _matchTooltip.innerHTML = html;

            // Position tooltip near cell
            const cellRect = cell.getBoundingClientRect();
            _matchTooltip.style.visibility = 'hidden';
            _matchTooltip.style.display = 'block';
            const tooltipRect = _matchTooltip.getBoundingClientRect();

            let left = cellRect.right + 8;
            let top = cellRect.top;

            if (left + tooltipRect.width > window.innerWidth - 8) {
                left = cellRect.left - tooltipRect.width - 8;
            }
            if (top + tooltipRect.height > window.innerHeight - 8) {
                top = window.innerHeight - tooltipRect.height - 8;
            }
            if (top < 8) top = 8;

            _matchTooltip.style.left = `${left}px`;
            _matchTooltip.style.top = `${top}px`;
            _matchTooltip.style.visibility = 'visible';
        }

        // ========================================
        // Slice 3.4: Match Tooltip Functions
        // ========================================

        let _matchTooltip = null;
        let _matchTooltipHideTimeout = null;
        let _matchTooltipCell = null; // Track which cell tooltip is showing for

        /**
         * Create match tooltip element if not exists
         */
        function _createMatchTooltip() {
            if (_matchTooltip) return;

            _matchTooltip = document.createElement('div');
            _matchTooltip.className = 'match-tooltip';
            _matchTooltip.style.display = 'none';
            document.body.appendChild(_matchTooltip);

            // Keep tooltip visible when hovering over it
            _matchTooltip.addEventListener('pointerenter', () => {
                if (_matchTooltipHideTimeout) {
                    clearTimeout(_matchTooltipHideTimeout);
                    _matchTooltipHideTimeout = null;
                }
            });

            _matchTooltip.addEventListener('pointerleave', () => {
                _hideMatchTooltip();
            });
        }

        /**
         * Show match tooltip for a cell
         */
        function _showMatchTooltip(cell, weekId, slotId) {
            if (typeof ComparisonEngine === 'undefined') return;

            const matches = ComparisonEngine.getSlotMatches(weekId, slotId);
            if (matches.length === 0) return;

            // Get user team info for side-by-side display
            const userTeamInfo = ComparisonEngine.getUserTeamInfo(weekId, slotId);

            _createMatchTooltip();

            // Track which cell we're showing tooltip for
            _matchTooltipCell = cell;

            if (_matchTooltipHideTimeout) {
                clearTimeout(_matchTooltipHideTimeout);
                _matchTooltipHideTimeout = null;
            }

            // Build user team column HTML
            let userTeamHtml = '';
            if (userTeamInfo) {
                const userAvailableHtml = userTeamInfo.availablePlayers.map(p => {
                    const isCurrentUser = p.userId === _currentUserId;
                    return `<div class="player-row player-available">
                        <span class="player-status-dot available"></span>
                        <span class="player-name">${_escapeHtml(p.displayName || p.initials || '?')}${isCurrentUser ? ' (You)' : ''}</span>
                    </div>`;
                }).join('');

                const userUnavailableHtml = userTeamInfo.unavailablePlayers.map(p =>
                    `<div class="player-row player-unavailable">
                        <span class="player-status-dot unavailable"></span>
                        <span class="player-name">${_escapeHtml(p.displayName || p.initials || '?')}</span>
                    </div>`
                ).join('');

                userTeamHtml = `
                    <div class="match-column user-team-column">
                        <div class="match-team-header">
                            <span class="match-team-name">${_escapeHtml(userTeamInfo.teamName)}</span>
                            <span class="match-player-count">${userTeamInfo.availablePlayers.length}/${userTeamInfo.availablePlayers.length + userTeamInfo.unavailablePlayers.length}</span>
                        </div>
                        <div class="match-roster-list">
                            ${userAvailableHtml}
                            ${userUnavailableHtml}
                        </div>
                    </div>
                `;
            }

            // Build opponents column HTML
            const opponentsHtml = matches.map((match, index) => {
                let rosterHtml;

                if (match.hideRosterNames) {
                    // Privacy: show counts instead of names
                    rosterHtml = `
                        <div class="player-row player-available">
                            <span class="player-status-dot available"></span>
                            <span class="player-name">${match.availablePlayers.length} available</span>
                        </div>
                        ${match.unavailablePlayers.length > 0 ? `
                            <div class="player-row player-unavailable">
                                <span class="player-status-dot unavailable"></span>
                                <span class="player-name">${match.unavailablePlayers.length} unavailable</span>
                            </div>
                        ` : ''}
                    `;
                } else {
                    const availableHtml = match.availablePlayers.map(p =>
                        `<div class="player-row player-available">
                            <span class="player-status-dot available"></span>
                            <span class="player-name">${_escapeHtml(p.displayName || p.initials || '?')}</span>
                        </div>`
                    ).join('');

                    const unavailableHtml = match.unavailablePlayers.map(p =>
                        `<div class="player-row player-unavailable">
                            <span class="player-status-dot unavailable"></span>
                            <span class="player-name">${_escapeHtml(p.displayName || p.initials || '?')}</span>
                        </div>`
                    ).join('');

                    rosterHtml = availableHtml + unavailableHtml;
                }

                return `
                    <div class="match-team-section">
                        <div class="match-team-header">
                            <span class="match-team-name">${_escapeHtml(match.teamName)}</span>
                            <span class="match-player-count">${match.availablePlayers.length}/${match.availablePlayers.length + match.unavailablePlayers.length}</span>
                        </div>
                        <div class="match-roster-list">
                            ${rosterHtml}
                        </div>
                    </div>
                    ${index < matches.length - 1 ? '<hr class="match-divider">' : ''}
                `;
            }).join('');

            // Combine into side-by-side layout
            const tooltipHtml = `
                <div class="match-tooltip-grid">
                    ${userTeamHtml}
                    <div class="match-column opponents-column">
                        ${opponentsHtml}
                    </div>
                </div>
            `;

            _matchTooltip.innerHTML = tooltipHtml;

            // Position tooltip near cell
            const cellRect = cell.getBoundingClientRect();

            // Make visible but off-screen to measure
            _matchTooltip.style.visibility = 'hidden';
            _matchTooltip.style.display = 'block';
            const tooltipRect = _matchTooltip.getBoundingClientRect();

            // Position to the right of the cell by default
            let left = cellRect.right + 8;
            let top = cellRect.top;

            // If tooltip would go off right edge, show on left
            if (left + tooltipRect.width > window.innerWidth - 8) {
                left = cellRect.left - tooltipRect.width - 8;
            }

            // If tooltip would go off bottom, adjust up
            if (top + tooltipRect.height > window.innerHeight - 8) {
                top = window.innerHeight - tooltipRect.height - 8;
            }

            // Ensure tooltip doesn't go off top
            if (top < 8) {
                top = 8;
            }

            _matchTooltip.style.left = `${left}px`;
            _matchTooltip.style.top = `${top}px`;
            _matchTooltip.style.visibility = 'visible';
        }

        /**
         * Hide match tooltip with delay
         */
        function _hideMatchTooltip() {
            _matchTooltipHideTimeout = setTimeout(() => {
                if (_matchTooltip) {
                    _matchTooltip.style.display = 'none';
                }
                _matchTooltipCell = null;
            }, 300);
        }

        /**
         * Immediately hide match tooltip
         */
        function _hideMatchTooltipImmediate() {
            if (_matchTooltipHideTimeout) {
                clearTimeout(_matchTooltipHideTimeout);
                _matchTooltipHideTimeout = null;
            }
            if (_matchTooltip) {
                _matchTooltip.style.display = 'none';
            }
            _matchTooltipCell = null;
        }

        /**
         * Handle mouse enter on match cells for tooltip
         */
        function _handleMatchCellMouseEnter(e) {
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            // Scheduled match tooltip (works regardless of comparison mode)
            if (cell.classList.contains('has-scheduled-match')) {
                const cellId = cell.dataset.cellId;
                if (cellId) {
                    const utcSlotId = _localToUtc(cellId);
                    const match = _scheduledMatchMap.get(utcSlotId);
                    if (match) {
                        if (_matchTooltipCell === cell) {
                            if (_matchTooltipHideTimeout) {
                                clearTimeout(_matchTooltipHideTimeout);
                                _matchTooltipHideTimeout = null;
                            }
                            return;
                        }
                        _showScheduledMatchTooltip(cell, match);
                        return;
                    }
                }
            }

            // Comparison mode tooltip
            if (!_comparisonMode) return;

            if (!cell.classList.contains('comparison-match-full') &&
                !cell.classList.contains('comparison-match-partial')) {
                return;
            }

            // If already showing tooltip for this cell, just cancel any pending hide
            if (_matchTooltipCell === cell) {
                if (_matchTooltipHideTimeout) {
                    clearTimeout(_matchTooltipHideTimeout);
                    _matchTooltipHideTimeout = null;
                }
                return;
            }

            const cellId = cell.dataset.cellId;
            if (cellId) {
                _showMatchTooltip(cell, getWeekId(), _localToUtc(cellId));
            }
        }

        /**
         * Handle mouse leave on match cells
         */
        function _handleMatchCellMouseLeave(e) {

            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            // Only hide if this is the cell we're showing tooltip for
            // and we're actually leaving the cell (not just moving to a child)
            if (cell === _matchTooltipCell) {
                // Check if relatedTarget (where mouse is going) is still inside the cell
                const relatedTarget = e.relatedTarget;
                if (relatedTarget && cell.contains(relatedTarget)) {
                    // Still inside the cell, don't hide
                    return;
                }
                // If mouse is heading to the tooltip itself, don't hide
                if (_matchTooltip && relatedTarget && (_matchTooltip === relatedTarget || _matchTooltip.contains(relatedTarget))) {
                    return;
                }
                _hideMatchTooltip();
            }
        }

        const instance = {
            init,
            getSelectedCells,
            clearSelection,
            cleanup,
            getWeekId,
            setSyncingCells,
            clearSyncingCells,
            updateAvailabilityDisplay,
            onSelectionChange,
            selectAll,
            clearAll,
            selectCell,
            // Slice 2.5: Team view functions
            updateTeamDisplay,
            onOverflowClick,
            refreshDisplay,
            // Slice 3.4: Comparison mode functions
            enterComparisonMode,
            exitComparisonMode,
            updateComparisonHighlights,
            clearComparisonHighlights,
            isComparisonMode,
            // Scheduled match highlights
            updateScheduledMatchHighlights,
            clearScheduledMatchHighlights
        };

        return instance;
    }

    // Public factory method
    return {
        create
    };
})();
