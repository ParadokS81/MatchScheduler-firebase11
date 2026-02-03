// BottomPanelController.js - Tab switching for bottom panel content
// Slice 5.0a: Controls what content shows in panel-bottom-center based on active tab
// Revealing Module Pattern

const BottomPanelController = (function() {
    'use strict';

    let _activeTab = 'calendar';
    let _weekDisplay2Ref = null;
    let _bottomPanel = null;
    let _initialized = false;
    let _placeholderContent = null;

    /**
     * Initialize the controller
     * @param {Object} weekDisplay2 - Reference to the second WeekDisplay instance
     */
    function init(weekDisplay2) {
        if (_initialized) return;

        _weekDisplay2Ref = weekDisplay2;
        _bottomPanel = document.getElementById('panel-bottom-center');

        if (!_bottomPanel) {
            console.error('BottomPanelController: panel-bottom-center not found');
            return;
        }

        // Wire up tab buttons
        document.querySelectorAll('.divider-tab').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        _initialized = true;
        console.log('🎛️ BottomPanelController initialized');
    }

    /**
     * Switch to a different tab
     * @param {string} tabId - Tab identifier ('calendar', 'teams', 'tournament')
     * @param {Object} [options] - Options
     * @param {boolean} [options.force] - Force switch even if already on this tab (used by Router)
     */
    function switchTab(tabId, options) {
        if (_activeTab === tabId && !(options && options.force)) {
            // If already on teams/players tab, go back to overview (deselect team)
            if (tabId === 'teams' || tabId === 'players') {
                TeamsBrowserPanel.deselectTeam();
            }
            return;
        }

        console.log('🎛️ Switching to tab:', tabId);

        // Update active states on buttons
        document.querySelectorAll('.divider-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Cleanup previous tab's component
        if (_activeTab === 'teams' || _activeTab === 'players') {
            TeamsBrowserPanel.cleanup();
        } else if (_activeTab === 'matches') {
            MatchesPanel.cleanup();
        }

        // Handle content switching
        switch(tabId) {
            case 'calendar':
                _showCalendarContent();
                break;
            case 'teams':
                _showTeamsBrowser('teams');
                break;
            case 'players':
                _showTeamsBrowser('players');
                break;
            case 'tournament':
                _showPlaceholder('tournament', 'Tournament Hub', 'Tournament brackets and standings - coming soon');
                break;
            case 'matches':
                _showMatchesPanel();
                break;
        }

        _activeTab = tabId;

        // Emit event for other components to react
        window.dispatchEvent(new CustomEvent('bottom-tab-changed', {
            detail: { tab: tabId }
        }));
    }

    /**
     * Show the calendar (Week 2 grid) content
     */
    function _showCalendarContent() {
        if (!_bottomPanel || !_weekDisplay2Ref) return;

        // Clear any placeholder
        if (_placeholderContent) {
            _placeholderContent.remove();
            _placeholderContent = null;
        }

        // Re-initialize the week display
        _weekDisplay2Ref.init();
    }

    /**
     * Show the Teams Browser content
     * @param {string} view - 'teams' or 'players'
     */
    function _showTeamsBrowser(view) {
        if (!_bottomPanel) return;

        // Clear panel content
        _bottomPanel.innerHTML = '';

        // Clear any placeholder ref
        _placeholderContent = null;

        // Create container for TeamsBrowserPanel
        const container = document.createElement('div');
        container.id = 'teams-browser-panel';
        container.className = 'h-full';
        _bottomPanel.appendChild(container);

        // Initialize the browser with the requested view
        TeamsBrowserPanel.init('teams-browser-panel', view);
    }

    /**
     * Show the Matches panel content
     */
    function _showMatchesPanel() {
        if (!_bottomPanel) return;

        // Clear panel content
        _bottomPanel.innerHTML = '';
        _placeholderContent = null;

        // Create container for MatchesPanel
        const container = document.createElement('div');
        container.id = 'matches-panel';
        container.className = 'h-full';
        _bottomPanel.appendChild(container);

        // Initialize MatchesPanel
        MatchesPanel.init('matches-panel');
    }

    /**
     * Show placeholder content for a tab
     * @param {string} tabId - Tab identifier
     * @param {string} title - Placeholder title
     * @param {string} message - Placeholder message
     */
    function _showPlaceholder(tabId, title, message) {
        if (!_bottomPanel) return;

        // Clear panel content
        _bottomPanel.innerHTML = '';

        // Create placeholder
        _placeholderContent = document.createElement('div');
        _placeholderContent.className = 'panel-content flex flex-col items-center justify-center h-full';
        _placeholderContent.innerHTML = `
            <div class="text-center text-muted-foreground">
                <div class="text-4xl mb-4">
                    ${tabId === 'teams' ? '👥' : '🏆'}
                </div>
                <h3 class="text-lg font-semibold text-foreground mb-2">${title}</h3>
                <p class="text-sm">${message}</p>
            </div>
        `;

        _bottomPanel.appendChild(_placeholderContent);
    }

    /**
     * Get the currently active tab
     * @returns {string} Active tab ID
     */
    function getActiveTab() {
        return _activeTab;
    }

    /**
     * Check if Calendar tab is active
     * @returns {boolean}
     */
    function isCalendarActive() {
        return _activeTab === 'calendar';
    }

    /**
     * Cleanup
     */
    function cleanup() {
        if (_activeTab === 'teams' || _activeTab === 'players') {
            TeamsBrowserPanel.cleanup();
        } else if (_activeTab === 'matches') {
            MatchesPanel.cleanup();
        }
        _weekDisplay2Ref = null;
        _bottomPanel = null;
        _placeholderContent = null;
        _initialized = false;
    }

    return {
        init,
        switchTab,
        getActiveTab,
        isCalendarActive,
        cleanup
    };
})();
