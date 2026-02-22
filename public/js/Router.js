/**
 * Router.js - Hash-based routing for MatchScheduler SPA
 *
 * Translates between URL hash and application navigation state.
 * Enables browser back/forward and deep-linking without page reloads.
 *
 * URL structure:
 *   #/matches, #/teams, #/teams/{id}, #/teams/{id}/history,
 *   #/teams/{id}/h2h, #/teams/{id}/h2h/{opponentId},
 *   #/players, #/players/by-team, #/matches, #/matches/{proposalId},
 *   #/tournament
 */
const Router = (function() {
    'use strict';

    let _isRestoring = false;   // Guard against push-during-restore loops
    let _initialized = false;
    let _currentHash = '';      // Track to avoid redundant pushes

    // Valid top-level tabs
    const VALID_TABS = new Set(['matches', 'teams', 'players', 'tournament']);
    const VALID_SUB_TABS = new Set(['details', 'history', 'h2h']);

    // ========================================
    // Initialization
    // ========================================

    function init() {
        if (_initialized) return;

        // Listen for browser back/forward
        window.addEventListener('popstate', _handlePopState);

        // Listen for navigation events from existing components
        window.addEventListener('bottom-tab-changed', _handleTabChanged);
        window.addEventListener('team-browser-detail-select', _handleTeamSelect);

        _initialized = true;

        // Set initial hash or restore from existing hash
        const hash = location.hash;
        if (!hash || hash === '#' || hash === '#/') {
            _currentHash = '#/matches';
            history.replaceState(null, '', '#/matches');
        } else {
            _currentHash = hash;
            _restoreFromHash(hash);
        }
    }

    // ========================================
    // Hash → App State (restore on popstate / init)
    // ========================================

    function _handlePopState() {
        _currentHash = location.hash;
        _restoreFromHash(location.hash);
    }

    function _restoreFromHash(hash) {
        const route = _parseHash(hash);
        _isRestoring = true;

        try {
            const currentTab = typeof BottomPanelController !== 'undefined'
                ? BottomPanelController.getActiveTab()
                : 'matches';

            // Switch top-level tab if needed
            if (route.tab !== currentTab) {
                if (typeof BottomPanelController !== 'undefined') {
                    BottomPanelController.switchTab(route.tab, { force: true });
                }
            }

            // Deep state: team selection + sub-tab
            if (route.tab === 'teams') {
                if (typeof TeamsBrowserPanel !== 'undefined') {
                    if (route.teamId) {
                        TeamsBrowserPanel.selectTeam(route.teamId);
                        // Apply history params before switching tab so they're set when history loads
                        if (route.params?.map) {
                            TeamsBrowserPanel.filterByMap(route.params.map);
                        }
                        if (route.params?.period) {
                            TeamsBrowserPanel.setHistoryPeriod(parseInt(route.params.period, 10));
                        }
                        if (route.subTab && route.subTab !== 'details') {
                            TeamsBrowserPanel.switchTab(route.subTab);
                        }
                        if (route.opponentId) {
                            TeamsBrowserPanel.selectOpponent(route.opponentId);
                        }
                    } else {
                        // Back to overview — deselect any selected team
                        TeamsBrowserPanel.deselectTeam();
                    }
                }
            }

            // Deep state: match proposal expansion
            if (route.tab === 'matches' && route.proposalId) {
                // Defer expansion — MatchesPanel loads proposals async via listener
                setTimeout(() => {
                    if (typeof MatchesPanel !== 'undefined' && MatchesPanel.expandProposal) {
                        MatchesPanel.expandProposal(route.proposalId);
                    }
                }, 500);
            }

            // Players sort mode
            if (route.tab === 'players' && route.sortMode === 'teams') {
                if (typeof TeamsBrowserPanel !== 'undefined') {
                    TeamsBrowserPanel.setPlayersSortMode('teams');
                }
            }
        } finally {
            _isRestoring = false;
        }
    }

    function _parseHash(hash) {
        const raw = (hash || '').replace(/^#\/?/, '');
        // Split off query string: "teams/abc/history?map=dm3" → path + params
        const [pathPart, queryPart] = raw.split('?');
        const segments = pathPart.split('/').filter(Boolean);
        const params = queryPart ? Object.fromEntries(new URLSearchParams(queryPart)) : {};

        if (segments.length === 0) return { tab: 'matches' };

        const tab = VALID_TABS.has(segments[0]) ? segments[0] : 'matches';

        if (tab === 'teams' && segments.length >= 2) {
            const subTab = VALID_SUB_TABS.has(segments[2]) ? segments[2] : 'details';
            const opponentId = (subTab === 'h2h' && segments[3]) ? segments[3] : null;
            return { tab: 'teams', teamId: segments[1], subTab, opponentId, params };
        }

        if (tab === 'matches' && segments.length >= 2) {
            return { tab: 'matches', proposalId: segments[1] };
        }

        if (tab === 'players' && segments[1] === 'by-team') {
            return { tab: 'players', sortMode: 'teams' };
        }

        return { tab };
    }

    // ========================================
    // App State → Hash (push on navigation)
    // ========================================

    function _handleTabChanged(event) {
        if (_isRestoring) return;
        const tab = event.detail?.tab;
        if (!tab) return;
        // Don't downgrade if a more specific hash under this tab was already pushed
        // (e.g. #/teams/abc was just pushed by _handleTeamSelect, don't overwrite with #/teams)
        if (_currentHash.startsWith(`#/${tab}/`)) return;
        _pushHash(`#/${tab}`);
    }

    function _handleTeamSelect(event) {
        if (_isRestoring) return;
        const teamId = event.detail?.teamId;
        if (teamId) _pushHash(`#/teams/${teamId}`);
    }

    /**
     * Called by TeamsBrowserPanel.switchTab() for sub-tab changes.
     * Accepts optional query params object, e.g. { map: 'dm3' }.
     */
    function pushTeamSubTab(teamId, subTab, params) {
        if (_isRestoring) return;
        const suffix = (subTab && subTab !== 'details') ? `/${subTab}` : '';
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        _pushHash(`#/teams/${teamId}${suffix}${qs}`);
    }

    /**
     * Called by TeamsBrowserPanel when H2H opponent is selected/changed.
     */
    function pushH2HOpponent(teamId, opponentId) {
        if (_isRestoring) return;
        const suffix = opponentId ? `/${opponentId}` : '';
        _pushHash(`#/teams/${teamId}/h2h${suffix}`);
    }

    /**
     * Called by TeamsBrowserPanel sort-mode toggle.
     */
    function pushPlayerSort(sortMode) {
        if (_isRestoring) return;
        const suffix = sortMode === 'teams' ? '/by-team' : '';
        _pushHash(`#/players${suffix}`);
    }

    /**
     * Called when a proposal is expanded in MatchesPanel.
     */
    function pushProposal(proposalId) {
        if (_isRestoring) return;
        if (proposalId) {
            _pushHash(`#/matches/${proposalId}`);
        } else {
            _pushHash('#/matches');
        }
    }

    function _pushHash(hash) {
        if (hash === _currentHash) return;
        _currentHash = hash;
        history.pushState(null, '', hash);
    }

    // ========================================
    // Cleanup
    // ========================================

    function cleanup() {
        window.removeEventListener('popstate', _handlePopState);
        window.removeEventListener('bottom-tab-changed', _handleTabChanged);
        window.removeEventListener('team-browser-detail-select', _handleTeamSelect);
        _initialized = false;
    }

    return {
        init,
        cleanup,
        pushTeamSubTab,
        pushH2HOpponent,
        pushPlayerSort,
        pushProposal
    };
})();
