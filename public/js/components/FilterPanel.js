// FilterPanel - UI component for comparison filter controls
// Slice 3.3: Comparison Filters
// Renders in top-right panel with minimum player dropdowns

const FilterPanel = (function() {
    'use strict';

    // Private variables
    let _container = null;
    let _initialized = false;

    /**
     * Initialize FilterPanel in the top-right panel
     * @param {string} containerId - ID of the container element (default: 'panel-top-right')
     */
    function init(containerId = 'panel-top-right') {
        if (_initialized) return;

        _container = document.getElementById(containerId);
        if (!_container) {
            console.error('FilterPanel: Container not found:', containerId);
            return;
        }

        // Ensure FilterService is initialized
        if (typeof FilterService !== 'undefined') {
            FilterService.init();
        }

        _render();
        _setupEventListeners();
        _initialized = true;

        console.log('🎚️ FilterPanel initialized');
    }

    /**
     * Render the filter panel UI
     * Compact single row: Minimum Players [x] vs [x]
     */
    function _render() {
        if (!_container) return;

        const yourTeamMin = FilterService.getYourTeamMinimum();
        const opponentMin = FilterService.getOpponentMinimum();

        _container.innerHTML = `
            <div class="panel-content p-3 h-full flex items-center justify-center">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground whitespace-nowrap">Minimum Players</span>
                    <select id="your-team-min"
                            class="bg-muted text-foreground text-sm rounded px-2 py-1
                                   border border-border focus:border-primary focus:outline-none
                                   cursor-pointer"
                            title="Your team minimum players">
                        ${_renderNumberOptions(yourTeamMin)}
                    </select>
                    <span class="text-xs text-muted-foreground">vs</span>
                    <select id="opponent-min"
                            class="bg-muted text-foreground text-sm rounded px-2 py-1
                                   border border-border focus:border-primary focus:outline-none
                                   cursor-pointer"
                            title="Opponent minimum players">
                        ${_renderNumberOptions(opponentMin)}
                    </select>
                </div>
            </div>
        `;

        _attachHandlers();
    }

    /**
     * Generate option elements for dropdown (numbers only)
     * @param {number} selectedValue - Currently selected value
     * @returns {string} HTML string of option elements
     */
    function _renderNumberOptions(selectedValue) {
        return [1, 2, 3, 4].map(n =>
            `<option value="${n}" ${n === selectedValue ? 'selected' : ''}>${n}</option>`
        ).join('');
    }

    /**
     * Attach change handlers to dropdown elements
     */
    function _attachHandlers() {
        const yourTeamSelect = document.getElementById('your-team-min');
        const opponentSelect = document.getElementById('opponent-min');

        if (yourTeamSelect) {
            yourTeamSelect.addEventListener('change', (e) => {
                FilterService.setYourTeamMinimum(e.target.value);
            });
        }

        if (opponentSelect) {
            opponentSelect.addEventListener('change', (e) => {
                FilterService.setOpponentMinimum(e.target.value);
            });
        }
    }

    /**
     * Set up global event listeners
     */
    function _setupEventListeners() {
        // Listen for external filter changes (e.g., reset from elsewhere)
        window.addEventListener('filter-changed', _handleFilterChanged);
    }

    /**
     * Handle filter-changed events - sync dropdowns with service state
     */
    function _handleFilterChanged() {
        const yourTeamSelect = document.getElementById('your-team-min');
        const opponentSelect = document.getElementById('opponent-min');

        if (yourTeamSelect) {
            yourTeamSelect.value = FilterService.getYourTeamMinimum();
        }
        if (opponentSelect) {
            opponentSelect.value = FilterService.getOpponentMinimum();
        }
    }

    /**
     * Cleanup event listeners
     */
    function cleanup() {
        window.removeEventListener('filter-changed', _handleFilterChanged);
        _container = null;
        _initialized = false;
    }

    // Public API
    return {
        init,
        cleanup
    };
})();
