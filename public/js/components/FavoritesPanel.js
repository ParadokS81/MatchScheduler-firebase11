// FavoritesPanel.js - Displays starred teams for quick comparison
// Follows Cache + Listener pattern per CLAUDE.md
// Enhanced for Slice 3.4: Compare Now and Exit Comparison functionality

const FavoritesPanel = (function() {
    'use strict';

    let _container = null;
    let _unsubscribeTeams = null;
    let _isComparing = false;

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========================================
    // Helpers
    // ========================================

    // Normalize divisions - handle both "D1" strings and legacy numeric values
    function _normalizeDivisions(divisions) {
        if (!Array.isArray(divisions)) return '';
        return divisions.map(d => {
            if (typeof d === 'number') return `D${d}`;
            if (typeof d === 'string' && /^\d+$/.test(d)) return `D${d}`;
            return d;
        }).join(', ');
    }

    // ========================================
    // Team Roster Tooltip
    // ========================================

    let _teamTooltip = null;
    let _tooltipHideTimeout = null;

    function _createTeamTooltip() {
        if (_teamTooltip) return;

        _teamTooltip = document.createElement('div');
        _teamTooltip.id = 'favorites-roster-tooltip';
        _teamTooltip.className = 'player-tooltip';
        _teamTooltip.style.display = 'none';
        document.body.appendChild(_teamTooltip);

        // Keep tooltip visible when hovering over it
        _teamTooltip.addEventListener('mouseenter', () => {
            if (_tooltipHideTimeout) {
                clearTimeout(_tooltipHideTimeout);
                _tooltipHideTimeout = null;
            }
        });

        _teamTooltip.addEventListener('mouseleave', () => {
            _hideTeamTooltip();
        });
    }

    function _showTeamTooltip(card, team) {
        _createTeamTooltip();

        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }

        const roster = team.playerRoster || [];

        // Sort: leader first, then alphabetically
        const sortedRoster = [...roster].sort((a, b) => {
            if (a.role === 'leader') return -1;
            if (b.role === 'leader') return 1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        // Build roster HTML
        const rosterHtml = sortedRoster.map(player => {
            const leaderBadge = player.role === 'leader' ? ' <span class="tooltip-you">(Leader)</span>' : '';
            const leaderClass = player.role === 'leader' ? 'tooltip-current' : '';
            return `
                <div class="tooltip-player ${leaderClass}">
                    <span class="tooltip-initials">${_escapeHtml(player.initials || '??')}</span>
                    <span class="tooltip-name">${_escapeHtml(player.displayName || 'Unknown')}${leaderBadge}</span>
                </div>
            `;
        }).join('');

        _teamTooltip.innerHTML = `
            <div class="tooltip-header">${_escapeHtml(team.teamName)} - ${roster.length} players</div>
            <div class="tooltip-list">
                ${rosterHtml}
            </div>
        `;

        // Position tooltip near card (to the left since favorites panel is on the right)
        const cardRect = card.getBoundingClientRect();

        // Make tooltip visible (but off-screen) to measure it
        _teamTooltip.style.visibility = 'hidden';
        _teamTooltip.style.display = 'block';
        const tooltipRect = _teamTooltip.getBoundingClientRect();

        // Show to the left of the card
        let left = cardRect.left - tooltipRect.width - 8;
        let top = cardRect.top;

        // If tooltip would go off left edge, show on right
        if (left < 8) {
            left = cardRect.right + 8;
        }

        // If tooltip would go off bottom, adjust up
        if (top + tooltipRect.height > window.innerHeight) {
            top = window.innerHeight - tooltipRect.height - 8;
        }

        // Ensure tooltip doesn't go off top
        if (top < 8) {
            top = 8;
        }

        _teamTooltip.style.left = `${left}px`;
        _teamTooltip.style.top = `${top}px`;
        _teamTooltip.style.visibility = 'visible';
    }

    function _hideTeamTooltip() {
        _tooltipHideTimeout = setTimeout(() => {
            if (_teamTooltip) {
                _teamTooltip.style.display = 'none';
            }
        }, 150);
    }

    // ========================================
    // Initialization
    // ========================================

    async function init() {
        _container = document.getElementById('panel-top-right');
        if (!_container) {
            console.error('FavoritesPanel: Container not found');
            return;
        }

        _render();
        _setupEventListeners();
        await _setupTeamListener();

        console.log('⭐ FavoritesPanel initialized');
    }

    // ========================================
    // Rendering
    // ========================================

    function _render() {
        if (!_container) return;

        const favorites = FavoritesService.getFavorites();
        const selectedTeams = TeamBrowserState.getSelectedTeams();

        // Check comparison state (auto-mode toggle)
        const comparison = typeof ComparisonEngine !== 'undefined'
            ? ComparisonEngine.getComparisonState()
            : { active: false, autoMode: false };
        _isComparing = comparison.autoMode;

        // Build toggle button for comparison mode
        const toggleOn = _isComparing;
        const opponentCount = selectedTeams.size;
        const statusText = toggleOn
            ? (opponentCount > 0 ? `ON (${opponentCount})` : 'ON')
            : 'OFF';
        const actionButton = `
            <button id="compare-toggle-btn"
                    class="w-full py-2 px-4 rounded-lg font-medium transition-colors
                           ${toggleOn
                               ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                               : 'bg-muted text-foreground hover:bg-muted/80 border border-border'}"
                    title="${toggleOn ? 'Click to disable live comparison' : 'Click to enable live comparison'}">
                Compare: ${statusText}
            </button>`;

        _container.innerHTML = `
            <div class="p-4 h-full flex flex-col">
                <div class="flex items-center justify-end gap-2 mb-2">
                    <button id="favorites-select-all"
                            class="px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80
                                   text-muted-foreground transition-colors"
                            ${favorites.length === 0 ? 'disabled' : ''}>
                        Select All
                    </button>
                    <button id="favorites-deselect-all"
                            class="px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80
                                   text-muted-foreground transition-colors"
                            ${selectedTeams.size === 0 ? 'disabled' : ''}>
                        Deselect All
                    </button>
                </div>

                <div id="favorites-list" class="flex-1 overflow-y-auto space-y-2">
                    ${_renderFavoritesList(favorites, selectedTeams)}
                </div>

                <div class="mt-3 pt-2">
                    ${actionButton}
                </div>
            </div>
        `;

        _attachButtonHandlers();
    }

    function _renderFavoritesList(favorites, selectedTeams) {
        if (favorites.length === 0) {
            return `
                <div class="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <svg class="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                    </svg>
                    <p class="text-sm">No favorites yet</p>
                    <p class="text-xs mt-1">Star teams in the browser below</p>
                </div>
            `;
        }

        return favorites.map(teamId => {
            const team = TeamService.getTeamFromCache(teamId);
            if (!team) return '';

            const isSelected = selectedTeams.has(teamId);
            const playerCount = Array.isArray(team.playerRoster) ? team.playerRoster.length : 0;

            // Check for small logo
            const smallLogoUrl = team.activeLogo?.urls?.small;
            const badgeContent = smallLogoUrl
                ? `<img src="${smallLogoUrl}" alt="${team.teamTag}" class="w-8 h-8 rounded object-cover">`
                : `<span class="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">${team.teamTag || '??'}</span>`;

            return `
                <div class="favorite-team-card p-3 rounded-lg cursor-pointer transition-all
                            ${isSelected
                                ? 'bg-primary/20 border-2 border-primary'
                                : 'bg-card border border-border hover:border-primary/50'}"
                     data-team-id="${teamId}">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            ${badgeContent}
                            <span class="text-foreground font-medium">${team.teamName || 'Unknown'}</span>
                        </div>
                        <button class="unfavorite-btn p-1 rounded hover:bg-destructive/20
                                       text-yellow-500 hover:text-destructive transition-colors"
                                data-team-id="${teamId}"
                                title="Remove from favorites">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>${playerCount} players</span>
                        ${team.divisions?.length ? `<span>${_normalizeDivisions(team.divisions)}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function _attachButtonHandlers() {
        // Select All
        document.getElementById('favorites-select-all')?.addEventListener('click', () => {
            const favorites = FavoritesService.getFavorites();
            favorites.forEach(teamId => TeamBrowserState.selectTeam(teamId));
        });

        // Deselect All
        document.getElementById('favorites-deselect-all')?.addEventListener('click', () => {
            const favorites = FavoritesService.getFavorites();
            favorites.forEach(teamId => TeamBrowserState.deselectTeam(teamId));
        });

        // Compare Toggle - Slice 8.1b: reactive comparison mode
        document.getElementById('compare-toggle-btn')?.addEventListener('click', () => {
            if (typeof ComparisonEngine === 'undefined') return;

            const isAutoMode = ComparisonEngine.isAutoMode();

            if (isAutoMode) {
                // Toggle OFF
                ComparisonEngine.endComparison();
                if (typeof ToastService !== 'undefined') {
                    ToastService.showInfo('Comparison mode off');
                }
            } else {
                // Toggle ON — need user team from grid
                const userTeamId = typeof MatchSchedulerApp !== 'undefined'
                    ? MatchSchedulerApp.getSelectedTeam()?.id
                    : null;

                if (!userTeamId) {
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showError('No team selected in grid');
                    }
                    return;
                }

                ComparisonEngine.enableAutoMode(userTeamId);

                if (typeof ToastService !== 'undefined') {
                    const userTeam = TeamService.getTeamFromCache(userTeamId);
                    ToastService.showSuccess(
                        `Compare mode on for [${userTeam?.teamTag || '??'}]`
                    );
                }
            }
        });

        // Team card clicks (selection toggle) and hover (tooltip)
        document.querySelectorAll('.favorite-team-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't toggle selection if clicking unfavorite button
                if (e.target.closest('.unfavorite-btn')) return;

                const teamId = card.dataset.teamId;
                TeamBrowserState.toggleTeamSelection(teamId);
            });

            // Hover handlers for player roster tooltip (desktop only)
            if (typeof MobileLayout === 'undefined' || !MobileLayout.isMobile()) {
                card.addEventListener('mouseenter', () => {
                    const teamId = card.dataset.teamId;
                    const team = TeamService.getTeamFromCache(teamId);
                    if (team && team.playerRoster?.length > 0) {
                        _showTeamTooltip(card, team);
                    }
                });

                card.addEventListener('mouseleave', () => {
                    _hideTeamTooltip();
                });
            }
        });

        // Unfavorite buttons
        document.querySelectorAll('.unfavorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const teamId = btn.dataset.teamId;
                FavoritesService.removeFavorite(teamId);
            });
        });
    }

    // ========================================
    // Event Listeners
    // ========================================

    function _setupEventListeners() {
        // Listen for favorites changes
        window.addEventListener('favorites-updated', _render);

        // Listen for selection changes (from TeamBrowserState)
        window.addEventListener('team-selection-changed', _render);

        // Listen for comparison events
        window.addEventListener('comparison-started', _render);
        window.addEventListener('comparison-ended', _render);
        window.addEventListener('comparison-mode-changed', _render);
    }

    async function _setupTeamListener() {
        // Listen for team data changes to update displayed info
        const { collection, onSnapshot } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );
        const db = window.firebase.db;

        _unsubscribeTeams = onSnapshot(
            collection(db, 'teams'),
            (snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        const teamId = change.doc.id;
                        if (FavoritesService.isFavorite(teamId)) {
                            // Update cache and re-render
                            TeamService.updateCachedTeam(teamId, { id: teamId, ...change.doc.data() });
                            _render();
                        }
                    }
                });
            }
        );
    }

    // ========================================
    // Cleanup
    // ========================================

    function cleanup() {
        window.removeEventListener('favorites-updated', _render);
        window.removeEventListener('team-selection-changed', _render);
        window.removeEventListener('comparison-started', _render);
        window.removeEventListener('comparison-ended', _render);
        window.removeEventListener('comparison-mode-changed', _render);
        if (_unsubscribeTeams) {
            _unsubscribeTeams();
            _unsubscribeTeams = null;
        }
        // Cleanup tooltip
        if (_tooltipHideTimeout) {
            clearTimeout(_tooltipHideTimeout);
            _tooltipHideTimeout = null;
        }
        if (_teamTooltip) {
            _teamTooltip.remove();
            _teamTooltip = null;
        }
        if (_container) {
            _container.innerHTML = '';
        }
    }

    // Public API
    return {
        init,
        cleanup
    };
})();
