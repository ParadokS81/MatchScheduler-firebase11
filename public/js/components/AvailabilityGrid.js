// AvailabilityGrid.js - Factory pattern for independent grid instances
// Vanilla JS with Revealing Module Pattern
// Enhanced for Slice 2.5: Player badges, tooltip hover, overflow handling
// Enhanced for Slice 5.0.1: 4 display modes (initials, coloredInitials, coloredDots, avatars)
// Enhanced for Slice 7.0b: UTC timezone conversion layer via TimezoneService

const AvailabilityGrid = (function() {
    'use strict';

    // Display time slots from TimezoneService (local times shown to user)
    const TIME_SLOTS = typeof TimezoneService !== 'undefined'
        ? TimezoneService.DISPLAY_TIME_SLOTS
        : ['1800', '1830', '1900', '1930', '2000', '2030', '2100', '2130', '2200', '2230', '2300'];

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Threshold to distinguish click from drag (in pixels)
    const DRAG_THRESHOLD = 5;

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
    const MAX_VISIBLE_BADGES = 3;  // Show 3 badges + overflow indicator
    const TOOLTIP_THRESHOLD = 4;   // Show tooltip when 4+ players

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
        let _documentMouseUpHandler = null;

        // Selection change callback
        let _onSelectionChangeCallback = null;

        // Team view state (Slice 2.5)
        let _playerRoster = null;
        let _currentUserId = null;
        let _availabilitySlots = null;      // Local-keyed (for tooltip lookup)
        let _availabilitySlotsUtc = null;   // UTC-keyed (for refreshDisplay)
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
                    for (const time of TIME_SLOTS) {
                        const id = `${day}_${time}`;
                        _gridToUtcMap.set(id, id);
                        _utcToGridMap.set(id, id);
                    }
                }
            }
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
            const startTimeIdx = TIME_SLOTS.indexOf(startTime);
            const endTimeIdx = TIME_SLOTS.indexOf(endTime);

            // Get min/max for proper rectangle
            const minDay = Math.min(startDayIdx, endDayIdx);
            const maxDay = Math.max(startDayIdx, endDayIdx);
            const minTime = Math.min(startTimeIdx, endTimeIdx);
            const maxTime = Math.max(startTimeIdx, endTimeIdx);

            const cells = [];
            for (let d = minDay; d <= maxDay; d++) {
                for (let t = minTime; t <= maxTime; t++) {
                    cells.push(`${DAYS[d]}_${TIME_SLOTS[t]}`);
                }
            }
            return cells;
        }

        /**
         * Apply rectangular selection with toggle behavior
         */
        function _applyRectangularSelection(startId, endId) {
            const cellsInRect = _getCellsInRectangle(startId, endId);

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
         * Handle mouse down for drag selection
         */
        function _handleMouseDown(e) {
            // Don't start drag if clicking on overflow badge
            if (e.target.closest('.player-badge.overflow')) {
                return;
            }

            const cell = e.target.closest('.grid-cell');
            if (!cell || !cell.dataset.cellId) return;

            _isDragging = true;
            _dragStartCell = cell.dataset.cellId;
            _dragStartPos = { x: e.clientX, y: e.clientY };
            _dragDistance = 0;

            // Add dragging class to prevent text selection
            const gridContainer = _container?.querySelector('.availability-grid-container');
            if (gridContainer) gridContainer.classList.add('dragging');

            // Start preview
            _updateDragPreview(_dragStartCell, _dragStartCell);

            // Prevent text selection during drag
            e.preventDefault();
        }

        /**
         * Handle mouse move for drag selection
         */
        function _handleMouseMove(e) {
            if (!_isDragging || !_dragStartCell) return;

            // Track drag distance
            _dragDistance = Math.max(
                _dragDistance,
                Math.abs(e.clientX - _dragStartPos.x),
                Math.abs(e.clientY - _dragStartPos.y)
            );

            // Only accept cells within THIS grid container
            const cell = e.target.closest('.grid-cell');
            if (!cell || !cell.dataset.cellId) return;

            // Verify the cell belongs to this grid instance
            if (!_container?.contains(cell)) return;

            _lastValidDragCell = cell.dataset.cellId;
            _updateDragPreview(_dragStartCell, cell.dataset.cellId);
        }

        /**
         * Handle mouse up for drag selection
         */
        function _handleMouseUp(e) {
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
            const columnCells = TIME_SLOTS.map(time => `${day}_${time}`);

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
            const rowCells = DAYS.map(day => `${day}_${time}`);

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
                TIME_SLOTS.forEach(time => {
                    const cellId = `${day}_${time}`;
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

            // Build UTC conversion maps for this week
            _buildUtcMaps();

            // Get day labels with dates for this week
            const dayLabelsWithDates = getDayLabelsWithDates(_weekId);

            // Build the grid HTML - compact for 1080p
            // Cell IDs are local display positions; data-utc-slot carries the UTC Firestore key
            _container.innerHTML = `
                <div class="availability-grid-container">
                    <!-- Day Headers Row -->
                    <div class="grid-header">
                        <div class="time-label-spacer"></div>
                        ${DAYS.map((day, idx) => `
                            <div class="day-header clickable" data-day="${day}">${dayLabelsWithDates[idx]}</div>
                        `).join('')}
                    </div>

                    <!-- Time Rows -->
                    <div class="grid-body">
                        ${TIME_SLOTS.map(time => `
                            <div class="grid-row">
                                <div class="time-label clickable" data-time="${time}">${formatTime(time)}</div>
                                ${DAYS.map(day => {
                                    const localCellId = `${day}_${time}`;
                                    const utcSlotId = _localToUtc(localCellId);
                                    return `<div class="grid-cell" data-cell-id="${localCellId}" data-utc-slot="${utcSlotId}"></div>`;
                                }).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            _attachEventListeners();
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

            if (playerIds.length >= TOOLTIP_THRESHOLD && _playerRoster && typeof PlayerTooltip !== 'undefined') {
                const players = PlayerDisplayService.getPlayersDisplay(
                    playerIds,
                    _playerRoster,
                    _currentUserId
                );
                PlayerTooltip.show(cell, players, _currentUserId);
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

            // Drag selection events
            _container.addEventListener('mousedown', _handleMouseDown);
            _container.addEventListener('mousemove', _handleMouseMove);

            // Mouse up on document (in case drag ends outside grid)
            _documentMouseUpHandler = _handleMouseUp;
            document.addEventListener('mouseup', _documentMouseUpHandler);

            // Hover events for tooltip (using event capturing for mouseenter/mouseleave)
            _container.addEventListener('mouseenter', _handleCellMouseEnter, true);
            _container.addEventListener('mouseleave', _handleCellMouseLeave, true);

            // Hover events for comparison match tooltip (Slice 3.4)
            _container.addEventListener('mouseenter', _handleMatchCellMouseEnter, true);
            _container.addEventListener('mouseleave', _handleMatchCellMouseLeave, true);

            // Hover events for header highlight (Slice 5.0.1)
            _container.addEventListener('mouseover', _handleCellHoverHighlight);
            _container.addEventListener('mouseout', _handleCellHoverUnhighlight);
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
                _container.removeEventListener('mouseover', _handleCellHoverHighlight);
                _container.removeEventListener('mouseout', _handleCellHoverUnhighlight);
            }

            // Remove document-level listener for drag
            if (_documentMouseUpHandler) {
                document.removeEventListener('mouseup', _documentMouseUpHandler);
                _documentMouseUpHandler = null;
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
            const now = new Date();
            const year = now.getUTCFullYear();
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
        function _renderPlayerBadges(cell, playerIds, playerRoster, currentUserId, displayMode) {
            if (!playerIds || playerIds.length === 0) {
                cell.innerHTML = '';
                cell.classList.remove('has-players', 'has-overflow');
                return;
            }

            cell.classList.add('has-players');

            const players = PlayerDisplayService.getPlayersDisplay(playerIds, playerRoster, currentUserId);
            const hasOverflow = players.length > MAX_VISIBLE_BADGES;
            const visiblePlayers = hasOverflow ? players.slice(0, MAX_VISIBLE_BADGES) : players;
            const overflowCount = players.length - MAX_VISIBLE_BADGES;

            // Mark cell for tooltip behavior if 4+ players
            if (players.length >= TOOLTIP_THRESHOLD) {
                cell.classList.add('has-overflow');
                cell.dataset.playerCount = players.length;
            } else {
                cell.classList.remove('has-overflow');
                delete cell.dataset.playerCount;
            }

            let badgesHtml = '<div class="player-badges">';

            visiblePlayers.forEach(player => {
                const isCurrentUserClass = player.isCurrentUser ? 'current-user' : '';
                const escapedName = _escapeHtml(player.displayName);
                const escapedInitials = _escapeHtml(player.initials);

                // Get player color (Slice 5.0.1)
                const playerColor = typeof PlayerColorService !== 'undefined'
                    ? PlayerColorService.getPlayerColor(player.userId)
                    : null;
                const colorOrDefault = typeof PlayerColorService !== 'undefined'
                    ? PlayerColorService.getPlayerColorOrDefault(player.userId)
                    : '#6B7280';

                switch (displayMode) {
                    case 'avatars':
                        // Avatar mode: show avatar image (CSS handles sizing to 32px)
                        if (player.photoURL) {
                            badgesHtml += `
                                <div class="player-badge avatar ${isCurrentUserClass}" data-player-name="${escapedName}">
                                    <img src="${player.photoURL}" alt="${escapedInitials}" />
                                </div>
                            `;
                        } else {
                            // No avatar, fallback to initials
                            badgesHtml += `
                                <div class="player-badge initials ${isCurrentUserClass}" data-player-name="${escapedName}">
                                    ${escapedInitials}
                                </div>
                            `;
                        }
                        break;

                    case 'coloredDots':
                        // Colored dots mode: show small colored circles
                        badgesHtml += `
                            <span class="player-badge colored-dot ${isCurrentUserClass}"
                                  style="background-color: ${colorOrDefault}"
                                  data-player-name="${escapedName}"
                                  title="${escapedName}">
                            </span>
                        `;
                        break;

                    case 'coloredInitials':
                        // Colored initials mode: initials with assigned color
                        const colorStyle = playerColor ? `color: ${playerColor}` : '';
                        badgesHtml += `
                            <div class="player-badge initials colored ${isCurrentUserClass}"
                                 style="${colorStyle}"
                                 data-player-name="${escapedName}">
                                ${escapedInitials}
                            </div>
                        `;
                        break;

                    case 'initials':
                    default:
                        // Plain initials mode (default)
                        badgesHtml += `
                            <div class="player-badge initials ${isCurrentUserClass}" data-player-name="${escapedName}">
                                ${escapedInitials}
                            </div>
                        `;
                        break;
                }
            });

            if (hasOverflow) {
                badgesHtml += `
                    <button class="player-badge overflow" data-overflow-count="${overflowCount}">
                        +${overflowCount}
                    </button>
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

            // Store original UTC slots for refreshDisplay
            _availabilitySlotsUtc = utcSlots;

            // Build local-keyed slots for tooltip access (map UTC → local)
            const localSlots = {};
            for (const [utcSlotId, playerIds] of Object.entries(utcSlots)) {
                const localCellId = _utcToLocal(utcSlotId);
                if (localCellId) {
                    localSlots[localCellId] = playerIds;
                }
            }
            _availabilitySlots = localSlots;

            const displayMode = typeof PlayerDisplayService !== 'undefined'
                ? PlayerDisplayService.getDisplayMode()
                : 'initials';

            // Process each cell using local-mapped data
            const allCells = _container.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                const cellId = cell.dataset.cellId;
                const playerIds = localSlots[cellId] || [];

                _renderPlayerBadges(cell, playerIds, playerRoster, currentUserId, displayMode);

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
                    { slots: _availabilitySlotsUtc },
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
            _matchTooltip.addEventListener('mouseenter', () => {
                if (_matchTooltipHideTimeout) {
                    clearTimeout(_matchTooltipHideTimeout);
                    _matchTooltipHideTimeout = null;
                }
            });

            _matchTooltip.addEventListener('mouseleave', () => {
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
                            <span class="match-team-tag">[${_escapeHtml(userTeamInfo.teamTag)}]</span>
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

                return `
                    <div class="match-team-section">
                        <div class="match-team-header">
                            <span class="match-team-tag">[${_escapeHtml(match.teamTag)}]</span>
                            <span class="match-team-name">${_escapeHtml(match.teamName)}</span>
                            <span class="match-player-count">${match.availablePlayers.length}/${match.availablePlayers.length + match.unavailablePlayers.length}</span>
                        </div>
                        <div class="match-roster-list">
                            ${availableHtml}
                            ${unavailableHtml}
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
            }, 150);
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
            if (!_comparisonMode) return;

            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            // Only show tooltip for match cells
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
            if (!_comparisonMode) return;

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
            isComparisonMode
        };

        return instance;
    }

    // Public factory method
    return {
        create
    };
})();
