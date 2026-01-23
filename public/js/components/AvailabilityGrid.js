// AvailabilityGrid.js - Factory pattern for independent grid instances
// Vanilla JS with Revealing Module Pattern

const AvailabilityGrid = (function() {
    'use strict';

    const TIME_SLOTS = [
        '1800', '1830', '1900', '1930', '2000',
        '2030', '2100', '2130', '2200', '2230', '2300'
    ];

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

        function _handleCellClick(cellId) {
            const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
            if (!cell) return;

            if (_selectedCells.has(cellId)) {
                _selectedCells.delete(cellId);
                cell.classList.remove('selected');
            } else {
                _selectedCells.add(cellId);
                cell.classList.add('selected');
            }
        }

        function _render() {
            if (!_container) return;

            // Build the grid HTML - compact for 1080p
            _container.innerHTML = `
                <div class="availability-grid-container">
                    <!-- Day Headers Row -->
                    <div class="grid-header">
                        <div class="time-label-spacer"></div>
                        ${DAY_LABELS.map(day => `
                            <div class="day-header">${day}</div>
                        `).join('')}
                    </div>

                    <!-- Time Rows -->
                    <div class="grid-body">
                        ${TIME_SLOTS.map(time => `
                            <div class="grid-row">
                                <div class="time-label">${formatTime(time)}</div>
                                ${DAYS.map(day => `
                                    <div class="grid-cell" data-cell-id="${day}_${time}"></div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            // Event delegation for better performance
            _clickHandler = (e) => {
                const cell = e.target.closest('.grid-cell');
                if (cell && cell.dataset.cellId) {
                    _handleCellClickWithNotify(cell.dataset.cellId);
                }
            };
            _container.addEventListener('click', _clickHandler);
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
            if (_container && _clickHandler) {
                _container.removeEventListener('click', _clickHandler);
            }
            _selectedCells.clear();
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

        // Internal: Call the selection change callback if registered
        let _onSelectionChangeCallback = null;

        // Update the click handler to notify on selection changes
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

            // Notify listeners of selection change
            if (_onSelectionChangeCallback) {
                _onSelectionChangeCallback();
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
            onSelectionChange
        };

        return instance;
    }

    // Public factory method
    return {
        create
    };
})();
