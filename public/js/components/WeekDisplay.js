// WeekDisplay.js - Factory pattern for independent week display instances
// Container for availability grid with week header
// Enhanced for Slice 2.5: Team display integration with player badges

const WeekDisplay = (function() {
    'use strict';

    /**
     * Get formatted week label with date range
     * @param {number} weekNumber - ISO week number
     * @returns {string} Formatted label like "Week 5: Jan 27 - Feb 2"
     */
    function getWeekLabel(weekNumber) {
        const now = new Date();
        const year = now.getUTCFullYear();

        // Find first Monday of the year (UTC)
        const jan1 = new Date(Date.UTC(year, 0, 1));
        const dayOfWeek = jan1.getUTCDay();
        const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);

        const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));

        // Calculate Monday of the requested week
        const monday = new Date(firstMonday);
        monday.setUTCDate(firstMonday.getUTCDate() + (weekNumber - 1) * 7);

        // Calculate Sunday
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const formatDate = (date) => `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;

        // Spaced out format: "2026    Week 6    Feb 9 - Feb 15"
        return `${year} \u00A0\u00A0 Week ${weekNumber} \u00A0\u00A0 ${formatDate(monday)} - ${formatDate(sunday)}`;
    }

    /**
     * Get the Monday date of a given week number
     * @param {number} weekNumber - ISO week number
     * @returns {Date} Monday of that week
     */
    function getMondayOfWeek(weekNumber) {
        const now = new Date();
        const year = now.getUTCFullYear();

        const jan1 = new Date(Date.UTC(year, 0, 1));
        const dayOfWeek = jan1.getUTCDay();
        const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
        const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));

        const monday = new Date(firstMonday);
        monday.setUTCDate(firstMonday.getUTCDate() + (weekNumber - 1) * 7);
        return monday;
    }

    /**
     * Creates a new WeekDisplay instance
     * @param {string} panelId - The ID of the panel element
     * @param {number} weekNumber - The week number to display
     * @param {Object} options - Optional configuration
     * @param {boolean} options.showNavigation - Whether to show navigation arrows (default: true)
     * @returns {Object} WeekDisplay instance with public methods
     */
    function create(panelId, weekNumber, options = {}) {
        let _panel = null;
        let _weekNumber = weekNumber;
        let _weekLabel = getWeekLabel(weekNumber);
        let _grid = null;
        let _showNavigation = options.showNavigation !== false; // Default true
        let _showTimezoneSelector = options.showTimezoneSelector === true; // Default false

        function _render() {
            if (!_panel) return;

            // Generate unique grid container ID
            const gridContainerId = `availability-grid-week-${_weekNumber}`;

            // Navigation arrows (only show if navigation enabled)
            const navHtml = _showNavigation ? `
                <button class="nav-btn week-nav-prev" data-dir="prev" title="Previous week" ${!WeekNavigation.canNavigatePrev() ? 'disabled' : ''}>
                    <span>&#9664;</span>
                </button>
            ` : '';

            const navNextHtml = _showNavigation ? `
                <button class="nav-btn week-nav-next" data-dir="next" title="Next week" ${!WeekNavigation.canNavigateNext() ? 'disabled' : ''}>
                    <span>&#9654;</span>
                </button>
            ` : '';

            // Timezone selector (only on displays that opt in)
            const tzSelectorHtml = _showTimezoneSelector ? _buildTzSelector() : '';

            _panel.innerHTML = `
                <div class="week-display">
                    <div class="week-header-nav">
                        ${navHtml}
                        <h3 class="week-header">${_weekLabel}</h3>
                        ${navNextHtml}
                        ${tzSelectorHtml}
                    </div>
                    <div id="${gridContainerId}" class="week-grid-container"></div>
                </div>
            `;

            // Attach navigation handlers
            if (_showNavigation) {
                _attachNavHandlers();
            }
            if (_showTimezoneSelector) {
                _attachTzHandlers();
            }
        }

        function _buildTzSelector() {
            if (typeof TimezoneService === 'undefined') return '';

            const abbr = TimezoneService.getTimezoneAbbreviation();
            const options = TimezoneService.getTimezoneOptions();
            const currentTz = TimezoneService.getUserTimezone();

            let dropdownItems = '';
            for (const group of options) {
                dropdownItems += `<div class="tz-dropdown-region">${group.region}</div>`;
                for (const tz of group.timezones) {
                    const activeClass = tz.id === currentTz ? ' active' : '';
                    dropdownItems += `<div class="tz-dropdown-item${activeClass}" data-tz-id="${tz.id}">${tz.label}</div>`;
                }
            }

            return `
                <div class="tz-selector">
                    <button class="tz-selector-btn" type="button" title="Change timezone">
                        <span class="tz-abbr">${abbr}</span>
                        <span class="tz-chevron">&#9660;</span>
                    </button>
                    <div class="tz-dropdown">
                        ${dropdownItems}
                    </div>
                </div>
            `;
        }

        function _attachTzHandlers() {
            const selectorBtn = _panel?.querySelector('.tz-selector-btn');
            const dropdown = _panel?.querySelector('.tz-dropdown');
            if (!selectorBtn || !dropdown) return;

            // Toggle dropdown
            selectorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = dropdown.classList.toggle('open');
                selectorBtn.classList.toggle('open', isOpen);
            });

            // Handle timezone selection
            dropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.tz-dropdown-item');
                if (!item) return;

                const tzId = item.dataset.tzId;
                if (!tzId) return;

                _selectTimezone(tzId);
                dropdown.classList.remove('open');
                selectorBtn.classList.remove('open');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', _handleOutsideClick);

            // Listen for external timezone changes (e.g., loaded from user profile)
            window.addEventListener('timezone-changed', _handleExternalTzChange);
        }

        function _handleExternalTzChange() {
            if (typeof TimezoneService === 'undefined') return;
            const abbrEl = _panel?.querySelector('.tz-abbr');
            if (abbrEl) {
                abbrEl.textContent = TimezoneService.getTimezoneAbbreviation();
            }
            // Update active state in dropdown
            const currentTz = TimezoneService.getUserTimezone();
            const items = _panel?.querySelectorAll('.tz-dropdown-item');
            if (items) {
                items.forEach(item => {
                    item.classList.toggle('active', item.dataset.tzId === currentTz);
                });
            }
        }

        function _handleOutsideClick(e) {
            const selector = _panel?.querySelector('.tz-selector');
            if (selector && !selector.contains(e.target)) {
                const dropdown = _panel?.querySelector('.tz-dropdown');
                const btn = _panel?.querySelector('.tz-selector-btn');
                if (dropdown) dropdown.classList.remove('open');
                if (btn) btn.classList.remove('open');
            }
        }

        async function _selectTimezone(tzId) {
            if (typeof TimezoneService === 'undefined') return;

            // Update service
            TimezoneService.setUserTimezone(tzId);

            // Update button label
            const abbrEl = _panel?.querySelector('.tz-abbr');
            if (abbrEl) {
                abbrEl.textContent = TimezoneService.getTimezoneAbbreviation();
            }

            // Update active state in dropdown
            const items = _panel?.querySelectorAll('.tz-dropdown-item');
            if (items) {
                items.forEach(item => {
                    item.classList.toggle('active', item.dataset.tzId === tzId);
                });
            }

            // Persist to Firestore (non-blocking)
            _persistTimezone(tzId);

            // Dispatch event so grids re-render
            window.dispatchEvent(new CustomEvent('timezone-changed', { detail: { timezone: tzId } }));
        }

        async function _persistTimezone(tzId) {
            try {
                if (typeof AuthService !== 'undefined') {
                    await AuthService.updateProfile({ timezone: tzId });
                }
            } catch (error) {
                console.error('Failed to save timezone preference:', error);
            }
        }

        function _attachNavHandlers() {
            const prevBtn = _panel?.querySelector('.week-nav-prev');
            const nextBtn = _panel?.querySelector('.week-nav-next');

            if (prevBtn) {
                prevBtn.addEventListener('click', () => WeekNavigation.navigatePrev());
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', () => WeekNavigation.navigateNext());
            }
        }

        function _updateNavButtons() {
            const prevBtn = _panel?.querySelector('.week-nav-prev');
            const nextBtn = _panel?.querySelector('.week-nav-next');

            if (prevBtn) {
                prevBtn.disabled = !WeekNavigation.canNavigatePrev();
            }
            if (nextBtn) {
                nextBtn.disabled = !WeekNavigation.canNavigateNext();
            }
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

        /**
         * Update the displayed week number (called when navigation changes)
         * @param {number} newWeekNumber - New week number to display
         */
        function setWeekNumber(newWeekNumber) {
            if (_weekNumber === newWeekNumber) return;

            _weekNumber = newWeekNumber;
            _weekLabel = getWeekLabel(newWeekNumber);

            // Update header label
            const headerEl = _panel?.querySelector('.week-header');
            if (headerEl) {
                headerEl.textContent = _weekLabel;
            }

            // Update navigation button states
            _updateNavButtons();

            // Reinitialize grid with new week
            if (_grid) {
                _grid.cleanup();
            }
            const gridContainerId = `availability-grid-week-${_weekNumber}`;
            const gridContainer = _panel?.querySelector('.week-grid-container');
            if (gridContainer) {
                gridContainer.id = gridContainerId;
            }
            _grid = AvailabilityGrid.create(gridContainerId, _weekNumber);
            _grid.init();
        }

        /**
         * Rebuild the grid with current week (e.g., after timezone change)
         */
        function rebuildGrid() {
            if (_grid) {
                _grid.cleanup();
            }
            const gridContainerId = `availability-grid-week-${_weekNumber}`;
            const gridContainer = _panel?.querySelector('.week-grid-container');
            if (gridContainer) {
                gridContainer.id = gridContainerId;
            }
            _grid = AvailabilityGrid.create(gridContainerId, _weekNumber);
            _grid.init();
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
            const year = now.getUTCFullYear();
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
         * Select a specific cell by UTC slot ID (for template loading)
         * @param {string} utcSlotId - The UTC slot ID to select (e.g., "mon_1700")
         */
        function selectCell(utcSlotId) {
            if (_grid) {
                _grid.selectCell(utcSlotId);
            }
        }

        // ========================================
        // Slice 2.5: Team View Display Functions
        // ========================================

        /**
         * Update the grid with team availability display (player badges)
         * @param {Object} availabilityData - The availability document data
         * @param {Array} playerRoster - Team's playerRoster array
         * @param {string} currentUserId - Current user's ID
         */
        function updateTeamDisplay(availabilityData, playerRoster, currentUserId) {
            if (_grid) {
                _grid.updateTeamDisplay(availabilityData, playerRoster, currentUserId);
            }
        }

        /**
         * Register callback for overflow badge clicks
         * @param {Function} callback - Called with (cellId, weekId) when overflow is clicked
         */
        function onOverflowClick(callback) {
            if (_grid) {
                _grid.onOverflowClick(callback);
            }
        }

        /**
         * Refresh the display (e.g., when display mode changes)
         */
        function refreshDisplay() {
            if (_grid) {
                _grid.refreshDisplay();
            }
        }

        // ========================================
        // Slice 3.4: Comparison Mode Functions
        // ========================================

        /**
         * Enter comparison mode
         */
        function enterComparisonMode() {
            if (_grid) {
                _grid.enterComparisonMode();
            }
        }

        /**
         * Exit comparison mode
         */
        function exitComparisonMode() {
            if (_grid) {
                _grid.exitComparisonMode();
            }
        }

        /**
         * Update comparison highlights
         */
        function updateComparisonHighlights() {
            if (_grid) {
                _grid.updateComparisonHighlights();
            }
        }

        function cleanup() {
            document.removeEventListener('click', _handleOutsideClick);
            window.removeEventListener('timezone-changed', _handleExternalTzChange);
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
            setWeekNumber,
            rebuildGrid,
            getWeekId,
            getSelectedCellsWithWeekId,
            clearSelection,
            setSyncingCells,
            clearSyncingCells,
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
