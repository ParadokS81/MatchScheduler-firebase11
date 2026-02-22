// BottomPanelController.js - Tab switching for bottom panel content
// Slice 5.0a: Controls what content shows in panel-bottom-center based on active tab
// Revealing Module Pattern

const BottomPanelController = (function() {
    'use strict';

    let _activeTab = 'matches';
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
     * @param {string} tabId - Tab identifier ('matches', 'teams', 'tournament')
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

        // Slice A1: Track admin mode transitions (read OLD value before overwrite)
        const wasAdmin = _activeTab === 'admin';
        const isAdmin = tabId === 'admin';

        // Cleanup previous tab's component
        if (_activeTab === 'teams' || _activeTab === 'players') {
            TeamsBrowserPanel.cleanup();
        } else if (_activeTab === 'matches') {
            MatchesPanel.cleanup();
        } else if (_activeTab === 'admin') {
            AdminPanel.cleanup();
        }

        // Handle content switching
        switch(tabId) {
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
            case 'admin':
                _showAdminPanel();
                break;
        }

        _activeTab = tabId;

        // Emit event for other components to react
        window.dispatchEvent(new CustomEvent('bottom-tab-changed', {
            detail: { tab: tabId }
        }));

        // Slice A1: Dispatch admin-mode-changed only on transitions
        if (wasAdmin !== isAdmin) {
            window.dispatchEvent(new CustomEvent('admin-mode-changed', {
                detail: { active: isAdmin }
            }));
        }
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
     * Slice A3: Show admin panel with Discord bot overview
     */
    function _showAdminPanel() {
        if (!_bottomPanel) return;
        _bottomPanel.innerHTML = '';
        _placeholderContent = null;

        const container = document.createElement('div');
        container.id = 'admin-panel';
        container.className = 'h-full';
        _bottomPanel.appendChild(container);

        AdminPanel.init('admin-panel');
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
                    ${tabId === 'teams' ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>'}
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
     * Cleanup
     */
    function cleanup() {
        if (_activeTab === 'teams' || _activeTab === 'players') {
            TeamsBrowserPanel.cleanup();
        } else if (_activeTab === 'matches') {
            MatchesPanel.cleanup();
        } else if (_activeTab === 'admin') {
            AdminPanel.cleanup();
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
        cleanup
    };
})();
