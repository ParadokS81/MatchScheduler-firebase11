// AvailabilityGrid.js - Factory pattern for independent grid instances
// Vanilla JS with Revealing Module Pattern
// Enhanced for Slice 2.5: Player badges, tooltip hover, overflow handling

const AvailabilityGrid = (function() {
    'use strict';

    const TIME_SLOTS = [
        '1800', '1830', '1900', '1930', '2000',
        '2030', '2100', '2130', '2200', '2230', '2300'
    ];

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Threshold to distinguish click from drag (in pixels)
    const DRAG_THRESHOLD = 5;

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
        let _selectedCells = new Set();
        let _clickHandler = null;

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
        let _availabilitySlots = null;
        let _onOverflowClickCallback = null;

        /**
         * Notify listeners of selection change
         */
        function _notifySelectionChange() {
            if (_onSelectionChangeCallback) {
                _onSelectionChangeCallback();
            }
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

            // Build the grid HTML - compact for 1080p
            // Added data attributes for clickable headers
            _container.innerHTML = `
                <div class="availability-grid-container">
                    <!-- Day Headers Row -->
                    <div class="grid-header">
                        <div class="time-label-spacer"></div>
                        ${DAYS.map((day, idx) => `
                            <div class="day-header clickable" data-day="${day}">${DAY_LABELS[idx]}</div>
                        `).join('')}
                    </div>

                    <!-- Time Rows -->
                    <div class="grid-body">
                        ${TIME_SLOTS.map(time => `
                            <div class="grid-row">
                                <div class="time-label clickable" data-time="${time}">${formatTime(time)}</div>
                                ${DAYS.map(day => `
                                    <div class="grid-cell" data-cell-id="${day}_${time}"></div>
                                `).join('')}
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
                _onOverflowClickCallback(cellId, _weekId);
            }
        }

        /**
         * Handle cell hover for tooltip (cells with 4+ players)
         */
        function _handleCellMouseEnter(e) {
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
        }

        function init() {
            _container = document.getElementById(containerId);
            if (!_container) {
                console.error(`AvailabilityGrid: Container #${containerId} not found`);
                return null;
            }
            _selectedCells.clear();
            _render();
            return instance;
        }

        function getSelectedCells() {
            return Array.from(_selectedCells);
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
            if (_container && _clickHandler) {
                _container.removeEventListener('click', _clickHandler);
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

            // Reset state
            _selectedCells.clear();
            _isDragging = false;
            _dragStartCell = null;
            _lastClickedCell = null;
            _lastValidDragCell = null;
            _playerRoster = null;
            _currentUserId = null;
            _availabilitySlots = null;
            _onOverflowClickCallback = null;

            if (_container) _container.innerHTML = '';
            _container = null;
        }

        function getWeekId() {
            return _weekId;
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

            // Handle both nested slots object AND flat "slots.xxx" keys from Firestore
            // Firestore returns flat keys like "slots.sat_2100" when using dot notation in set()
            Object.entries(availabilityData).forEach(([key, userIds]) => {
                let slotId = null;

                // Check for nested slots object
                if (key === 'slots' && typeof userIds === 'object' && !Array.isArray(userIds)) {
                    // Nested structure: { slots: { sat_2100: [...] } }
                    Object.entries(userIds).forEach(([nestedSlotId, nestedUserIds]) => {
                        if (Array.isArray(nestedUserIds) && nestedUserIds.includes(currentUserId)) {
                            const cell = _container.querySelector(`[data-cell-id="${nestedSlotId}"]`);
                            if (cell) {
                                cell.classList.add('user-available');
                            }
                        }
                    });
                    return;
                }

                // Check for flat "slots.xxx" keys
                if (key.startsWith('slots.')) {
                    slotId = key.replace('slots.', '');
                }

                if (slotId && Array.isArray(userIds) && userIds.includes(currentUserId)) {
                    const cell = _container.querySelector(`[data-cell-id="${slotId}"]`);
                    if (cell) {
                        cell.classList.add('user-available');
                    }
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
         * Select a specific cell by ID (for template loading)
         * @param {string} cellId - The cell ID to select (e.g., "mon_1800")
         */
        function selectCell(cellId) {
            const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
            if (cell && !_selectedCells.has(cellId)) {
                _selectedCells.add(cellId);
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
         * @param {HTMLElement} cell - The grid cell element
         * @param {Array<string>} playerIds - User IDs of available players
         * @param {Array} playerRoster - Team's playerRoster array
         * @param {string} currentUserId - Current user's ID
         * @param {string} displayMode - 'initials' or 'avatars'
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

                if (displayMode === 'avatars' && player.photoURL) {
                    badgesHtml += `
                        <div class="player-badge avatar ${isCurrentUserClass}" data-player-name="${escapedName}">
                            <img src="${player.photoURL}" alt="${escapedInitials}" />
                        </div>
                    `;
                } else {
                    badgesHtml += `
                        <div class="player-badge initials ${isCurrentUserClass}" data-player-name="${escapedName}">
                            ${escapedInitials}
                        </div>
                    `;
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

            // Extract slots from availability data (handle both flat and nested structures)
            let slots = {};
            if (availabilityData.slots && typeof availabilityData.slots === 'object') {
                slots = availabilityData.slots;
            } else {
                // Handle flat "slots.xxx" keys
                Object.entries(availabilityData).forEach(([key, value]) => {
                    if (key.startsWith('slots.')) {
                        const slotId = key.replace('slots.', '');
                        slots[slotId] = value;
                    }
                });
            }

            _availabilitySlots = slots;

            const displayMode = typeof PlayerDisplayService !== 'undefined'
                ? PlayerDisplayService.getDisplayMode()
                : 'initials';

            // Process each cell
            const allCells = _container.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                const cellId = cell.dataset.cellId;
                const playerIds = slots[cellId] || [];

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
            if (_availabilitySlots && _playerRoster && _currentUserId) {
                updateTeamDisplay(
                    { slots: _availabilitySlots },
                    _playerRoster,
                    _currentUserId
                );
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
            refreshDisplay
        };

        return instance;
    }

    // Public factory method
    return {
        create
    };
})();
