// WeekDisplay.js - Factory pattern for independent week display instances
// Container for availability grid with week header

const WeekDisplay = (function() {
    'use strict';

    /**
     * Get formatted week label with date range
     * @param {number} weekNumber - ISO week number
     * @returns {string} Formatted label like "Week 5: Jan 27 - Feb 2"
     */
    function getWeekLabel(weekNumber) {
        const now = new Date();
        const year = now.getFullYear();

        // Find first Monday of the year
        const jan1 = new Date(year, 0, 1);
        const dayOfWeek = jan1.getDay();
        // Days to add to get to first Monday (0 = Sunday, 1 = Monday, etc.)
        const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);

        const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);

        // Calculate Monday of the requested week
        const monday = new Date(firstMonday);
        monday.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);

        // Calculate Sunday
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const formatDate = (date) => `${months[date.getMonth()]} ${date.getDate()}`;

        return `Week ${weekNumber}: ${formatDate(monday)} - ${formatDate(sunday)}`;
    }

    /**
     * Creates a new WeekDisplay instance
     * @param {string} panelId - The ID of the panel element
     * @param {number} weekNumber - The week number to display
     * @returns {Object} WeekDisplay instance with public methods
     */
    function create(panelId, weekNumber) {
        let _panel = null;
        let _weekNumber = weekNumber;
        let _weekLabel = getWeekLabel(weekNumber);
        let _grid = null;

        function _render() {
            if (!_panel) return;

            // Generate unique grid container ID
            const gridContainerId = `availability-grid-week-${_weekNumber}`;

            _panel.innerHTML = `
                <div class="week-display">
                    <h3 class="week-header">${_weekLabel}</h3>
                    <div id="${gridContainerId}" class="week-grid-container"></div>
                </div>
            `;
        }

        function init() {
            _panel = document.getElementById(panelId);
            if (!_panel) {
                console.error(`WeekDisplay: Panel #${panelId} not found`);
                return null;
            }

            _render();

            // Initialize the grid inside
            const gridContainerId = `availability-grid-week-${_weekNumber}`;
            _grid = AvailabilityGrid.create(gridContainerId, _weekNumber);
            _grid.init();

            return instance;
        }

        function getGrid() {
            return _grid;
        }

        function getWeekNumber() {
            return _weekNumber;
        }

        /**
         * Get the week ID in ISO format (YYYY-WW)
         * @returns {string} Week ID like "2026-05"
         */
        function getWeekId() {
            const now = new Date();
            const year = now.getFullYear();
            return `${year}-${String(_weekNumber).padStart(2, '0')}`;
        }

        /**
         * Get selected cells with week context
         * @returns {Array<{weekId: string, slotId: string}>} Selected cells with week ID
         */
        function getSelectedCellsWithWeekId() {
            if (!_grid) return [];

            const weekId = getWeekId();
            return _grid.getSelectedCells().map(slotId => ({
                weekId,
                slotId
            }));
        }

        /**
         * Clear grid selection
         */
        function clearSelection() {
            if (_grid) {
                _grid.clearSelection();
            }
        }

        /**
         * Set syncing state on cells
         * @param {Array<string>} slotIds - Slot IDs to mark as syncing
         */
        function setSyncingCells(slotIds) {
            if (_grid) {
                _grid.setSyncingCells(slotIds);
            }
        }

        /**
         * Clear syncing state from all cells
         */
        function clearSyncingCells() {
            if (_grid) {
                _grid.clearSyncingCells();
            }
        }

        /**
         * Register callback for selection changes
         * @param {Function} callback - Called when selection changes
         */
        function onSelectionChange(callback) {
            if (_grid) {
                _grid.onSelectionChange(callback);
            }
        }

        /**
         * Select all cells in this week's grid
         */
        function selectAll() {
            if (_grid) {
                _grid.selectAll();
            }
        }

        /**
         * Clear all selections in this week's grid
         */
        function clearAll() {
            if (_grid) {
                _grid.clearAll();
            }
        }

        /**
         * Select a specific cell by ID (for template loading)
         * @param {string} cellId - The cell ID to select (e.g., "mon_1800")
         */
        function selectCell(cellId) {
            if (_grid) {
                _grid.selectCell(cellId);
            }
        }

        function cleanup() {
            if (_grid) {
                _grid.cleanup();
                _grid = null;
            }
            if (_panel) _panel.innerHTML = '';
            _panel = null;
        }

        const instance = {
            init,
            getGrid,
            getWeekNumber,
            getWeekId,
            getSelectedCellsWithWeekId,
            clearSelection,
            setSyncingCells,
            clearSyncingCells,
            onSelectionChange,
            selectAll,
            clearAll,
            selectCell,
            cleanup
        };

        return instance;
    }

    // Public factory method
    return {
        create,
        getWeekLabel // Export for use by WeekNavigation
    };
})();
