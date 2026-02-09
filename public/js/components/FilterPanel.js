// FilterPanel - UI component for comparison filter controls
// Slice 3.3: Comparison Filters
// Slice 13.0e: Unified right panel - Compare toggle + min filters in one row

const FilterPanel = (function() {
    'use strict';

    // Private variables
    let _container = null;
    let _initialized = false;
    let _dropdownOpen = null; // 'your' | 'opponent' | null

    /**
     * Initialize FilterPanel in the compare-controls container
     * @param {string} containerId - ID of the container element (default: 'compare-controls')
     */
    function init(containerId = 'compare-controls') {
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
     * Render the min-filter controls: [X] vs [X]
     * Slice 17.0b: Compare toggle removed — comparison activates implicitly from team selection
     */
    function _render() {
        if (!_container) return;

        const yourTeamMin = FilterService.getYourTeamMinimum();
        const opponentMin = FilterService.getOpponentMinimum();

        _container.innerHTML = `
            <div class="min-filter-group">
                <div class="min-filter-wrapper relative">
                    <button id="your-team-min-btn"
                            class="min-filter-btn"
                            data-filter="your"
                            title="Your team minimum players">
                        ${yourTeamMin}
                    </button>
                    <div id="your-team-dropdown" class="min-filter-dropdown hidden">
                        ${_renderDropdownOptions(yourTeamMin, 'your')}
                    </div>
                </div>
                <span class="min-filter-label">vs</span>
                <div class="min-filter-wrapper relative">
                    <button id="opponent-min-btn"
                            class="min-filter-btn"
                            data-filter="opponent"
                            title="Opponent minimum players">
                        ${opponentMin}
                    </button>
                    <div id="opponent-dropdown" class="min-filter-dropdown hidden">
                        ${_renderDropdownOptions(opponentMin, 'opponent')}
                    </div>
                </div>
            </div>
        `;

        _attachHandlers();
    }

    /**
     * Generate dropdown options for min filter
     */
    function _renderDropdownOptions(selectedValue, type) {
        return [3, 4].map(n =>
            `<button class="min-dropdown-option ${n === selectedValue ? 'active' : ''}"
                     data-value="${n}" data-type="${type}">${n}</button>`
        ).join('');
    }

    /**
     * Attach event handlers
     */
    function _attachHandlers() {
        // Min filter buttons
        const yourBtn = document.getElementById('your-team-min-btn');
        const oppBtn = document.getElementById('opponent-min-btn');

        yourBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleDropdown('your');
        });
        oppBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleDropdown('opponent');
        });

        // Dropdown option clicks
        _container.querySelectorAll('.min-dropdown-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = parseInt(e.target.dataset.value);
                const type = e.target.dataset.type;

                if (type === 'your') {
                    FilterService.setYourTeamMinimum(value);
                    document.getElementById('your-team-min-btn').textContent = value;
                } else {
                    FilterService.setOpponentMinimum(value);
                    document.getElementById('opponent-min-btn').textContent = value;
                }
                _closeDropdowns();
            });
        });

        // Close dropdowns on outside click
        document.addEventListener('click', _closeDropdowns);
    }

    /**
     * Toggle min filter dropdown
     */
    function _toggleDropdown(type) {
        const dropdownId = type === 'your' ? 'your-team-dropdown' : 'opponent-dropdown';
        const dropdown = document.getElementById(dropdownId);

        if (_dropdownOpen === type) {
            _closeDropdowns();
        } else {
            _closeDropdowns();
            dropdown?.classList.remove('hidden');
            _dropdownOpen = type;
        }
    }

    /**
     * Close all dropdowns
     */
    function _closeDropdowns() {
        document.getElementById('your-team-dropdown')?.classList.add('hidden');
        document.getElementById('opponent-dropdown')?.classList.add('hidden');
        _dropdownOpen = null;
    }

    /**
     * Set up global event listeners
     */
    function _setupEventListeners() {
        window.addEventListener('filter-changed', _handleFilterChanged);
    }

    /**
     * Handle filter-changed events
     */
    function _handleFilterChanged() {
        const yourBtn = document.getElementById('your-team-min-btn');
        const oppBtn = document.getElementById('opponent-min-btn');

        if (yourBtn) yourBtn.textContent = FilterService.getYourTeamMinimum();
        if (oppBtn) oppBtn.textContent = FilterService.getOpponentMinimum();
    }

    /**
     * Cleanup event listeners
     */
    function cleanup() {
        window.removeEventListener('filter-changed', _handleFilterChanged);
        document.removeEventListener('click', _closeDropdowns);
        _container = null;
        _initialized = false;
    }

    // Public API
    return {
        init,
        cleanup
    };
})();
