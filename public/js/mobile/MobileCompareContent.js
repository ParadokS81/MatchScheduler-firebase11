// MobileCompareContent.js - Team browser + filter controls for Compare tab
// Manages team selection UI that drives ComparisonEngine via TeamBrowserState

const MobileCompareContent = (function() {
    'use strict';

    let _containerId;
    let _allTeams = [];
    let _eventCleanups = [];
    let _searchTimer;

    // ── Lifecycle ──────────────────────────────────────────────────

    function init(containerId) {
        _containerId = containerId;
        _allTeams = (typeof TeamService !== 'undefined') ? TeamService.getAllTeams() : [];
        _render();
        _setupListeners();
    }

    function cleanup() {
        clearTimeout(_searchTimer);
        _eventCleanups.forEach(fn => fn());
        _eventCleanups = [];
    }

    // ── Render ─────────────────────────────────────────────────────

    function _render() {
        const container = document.getElementById(_containerId);
        if (!container) return;

        const user = (typeof AuthService !== 'undefined') ? AuthService.getCurrentUser() : null;
        if (!user) {
            container.innerHTML = '<div class="mobile-empty-state">Sign in to compare teams</div>';
            return;
        }

        const teamId = MobileApp.getSelectedTeamId();
        if (!teamId) {
            container.innerHTML = '<div class="mobile-empty-state">Join a team to compare</div>';
            return;
        }

        const yourMin = (typeof FilterService !== 'undefined') ? FilterService.getYourTeamMinimum() : 3;
        const oppMin = (typeof FilterService !== 'undefined') ? FilterService.getOpponentMinimum() : 3;

        let html = '<div class="mcc-container">';

        // ── Filter row 1: Search + Min filter ──────────────────────
        html += `
            <div class="mcc-filter-row">
                <input type="search"
                       id="mcc-search"
                       placeholder="Search teams..."
                       inputmode="search"
                       autocomplete="off"
                       autocorrect="off"
                       autocapitalize="off"
                       spellcheck="false"
                       class="mcc-search-input"
                       value="${_escapeHtml(TeamBrowserState.getSearchQuery())}"
                />
                <div class="mcc-min-filter">
                    <button class="mcc-min-btn ${yourMin === 3 ? 'active' : ''}"
                            data-action="min-filter" data-value="3">3v3</button>
                    <button class="mcc-min-btn ${yourMin === 4 ? 'active' : ''}"
                            data-action="min-filter" data-value="4">4v4</button>
                </div>
            </div>
        `;

        // ── Filter row 2: Division pills + Fav / All / Clear ──────
        html += `
            <div class="mcc-filter-row">
                <div class="mcc-pills">
                    <button class="mcc-pill ${TeamBrowserState.isDivisionActive('D1') ? 'active' : ''}"
                            data-action="div-filter" data-division="D1">D1</button>
                    <button class="mcc-pill ${TeamBrowserState.isDivisionActive('D2') ? 'active' : ''}"
                            data-action="div-filter" data-division="D2">D2</button>
                    <button class="mcc-pill ${TeamBrowserState.isDivisionActive('D3') ? 'active' : ''}"
                            data-action="div-filter" data-division="D3">D3</button>
                    <span class="mcc-pill-sep"></span>
                    <button class="mcc-pill ${TeamBrowserState.isFavoritesFilterActive() ? 'active' : ''}"
                            data-action="fav-filter">&#9733;</button>
                    <button class="mcc-pill" data-action="select-all">All</button>
                    <button class="mcc-pill" data-action="clear">Clear</button>
                </div>
            </div>
        `;

        // ── Team list ─────────────────────────────────────────────
        html += '<div class="mcc-team-list" id="mcc-team-list">';
        html += _renderTeamList();
        html += '</div>';

        html += '</div>';
        container.innerHTML = html;

        _attachDomListeners();
    }

    function _renderTeamList() {
        const myTeamId = MobileApp.getSelectedTeamId();
        const filtered = _getFilteredTeams(myTeamId);

        if (filtered.length === 0) {
            return '<div class="mobile-empty-state">No teams match filters</div>';
        }

        return filtered.map(team => {
            const isSelected = TeamBrowserState.isTeamSelected(team.id);
            const isFav = (typeof FavoritesService !== 'undefined') && FavoritesService.isFavorite(team.id);
            const logoUrl = team.activeLogo?.urls?.small;
            const playerCount = team.playerRoster?.length || 0;
            const divs = _normalizeDivisions(team.divisions);

            const badgeHtml = logoUrl
                ? `<img class="mcc-team-badge-img" src="${logoUrl}" alt="">`
                : `<span class="mcc-team-badge-text">${_escapeHtml(team.teamTag || '??')}</span>`;

            const meta = [divs[0], `${playerCount}p`].filter(Boolean).join(' \u00B7 ');

            return `
                <div class="mcc-team-card ${isSelected ? 'mcc-team-selected' : ''}"
                     data-team-id="${team.id}" data-action="toggle-team">
                    <div class="mcc-team-badge">${badgeHtml}</div>
                    <span class="mcc-team-name">${_escapeHtml(team.teamName || 'Unknown')}</span>
                    <span class="mcc-team-meta">${meta}</span>
                    <button class="mcc-star-btn ${isFav ? 'mcc-star-active' : ''}"
                            data-team-id="${team.id}" data-action="toggle-fav">
                        &#9733;
                    </button>
                </div>
            `;
        }).join('');
    }

    // ── Filtering Logic ───────────────────────────────────────────

    function _getFilteredTeams(excludeTeamId) {
        const searchQuery = TeamBrowserState.getSearchQuery();
        const divisionFilters = TeamBrowserState.getDivisionFilters();
        const favoritesOnly = TeamBrowserState.isFavoritesFilterActive();
        const favoriteIds = favoritesOnly
            ? new Set((typeof FavoritesService !== 'undefined') ? FavoritesService.getFavorites() : [])
            : null;

        const filtered = _allTeams.filter(team => {
            if (team.id === excludeTeamId) return false;
            if (favoriteIds && !favoriteIds.has(team.id)) return false;

            if (divisionFilters.size > 0) {
                const teamDivs = _normalizeDivisions(team.divisions);
                if (!teamDivs.some(d => divisionFilters.has(d))) return false;
            }

            if (searchQuery) {
                const name = (team.teamName || '').toLowerCase();
                const tag = (team.teamTag || '').toLowerCase();
                // Also search player names
                const playerNames = (team.playerRoster || [])
                    .map(p => (p.displayName || '').toLowerCase()).join(' ');
                if (!name.includes(searchQuery) && !tag.includes(searchQuery) && !playerNames.includes(searchQuery)) return false;
            }

            return true;
        });

        return filtered.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || ''));
    }

    function _normalizeDivisions(divisions) {
        return (divisions || []).map(d => {
            if (typeof d === 'number') return `D${d}`;
            if (typeof d === 'string' && /^\d+$/.test(d)) return `D${d}`;
            return d;
        });
    }

    // ── DOM Event Handlers ────────────────────────────────────────

    function _attachDomListeners() {
        const container = document.getElementById(_containerId);
        if (!container) return;

        // Delegated click handler
        container.addEventListener('click', _handleClick);

        // Search input (debounced)
        const searchInput = document.getElementById('mcc-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(_searchTimer);
                _searchTimer = setTimeout(() => {
                    TeamBrowserState.setSearchQuery(e.target.value);
                }, 200);
            });
        }
    }

    function _handleClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        switch (action) {
            case 'toggle-team': {
                const teamId = target.dataset.teamId;
                if (teamId) TeamBrowserState.toggleTeamSelection(teamId);
                break;
            }
            case 'toggle-fav': {
                e.stopPropagation();
                const teamId = target.dataset.teamId;
                if (teamId && typeof FavoritesService !== 'undefined') {
                    FavoritesService.toggleFavorite(teamId);
                }
                break;
            }
            case 'div-filter': {
                const div = target.dataset.division;
                if (div) TeamBrowserState.toggleDivisionFilter(div);
                break;
            }
            case 'fav-filter': {
                TeamBrowserState.toggleFavoritesFilter();
                break;
            }
            case 'select-all': {
                const myTeamId = MobileApp.getSelectedTeamId();
                const visibleIds = _getFilteredTeams(myTeamId).map(t => t.id);
                TeamBrowserState.selectTeams(visibleIds);
                break;
            }
            case 'clear': {
                TeamBrowserState.clearSelection();
                TeamBrowserState.clearDivisionFilters();
                const searchInput = document.getElementById('mcc-search');
                if (searchInput) {
                    searchInput.value = '';
                    TeamBrowserState.setSearchQuery('');
                }
                if (TeamBrowserState.isFavoritesFilterActive()) {
                    TeamBrowserState.toggleFavoritesFilter();
                }
                break;
            }
            case 'min-filter': {
                const val = parseInt(target.dataset.value);
                if (typeof FilterService !== 'undefined') {
                    FilterService.setYourTeamMinimum(val);
                    FilterService.setOpponentMinimum(val);
                }
                break;
            }
        }
    }

    // ── Cross-component Event Listeners ───────────────────────────

    function _setupListeners() {
        // Re-render team list on selection change
        const onSelectionChange = () => _refreshTeamList();
        window.addEventListener('team-selection-changed', onSelectionChange);
        _eventCleanups.push(() => window.removeEventListener('team-selection-changed', onSelectionChange));

        // Re-render on filter change (search, division, favorites)
        const onFilterChange = () => _refreshTeamList();
        window.addEventListener('team-browser-filter-changed', onFilterChange);
        _eventCleanups.push(() => window.removeEventListener('team-browser-filter-changed', onFilterChange));

        // Favorites updated
        const onFavUpdate = () => _refreshTeamList();
        window.addEventListener('favorites-updated', onFavUpdate);
        _eventCleanups.push(() => window.removeEventListener('favorites-updated', onFavUpdate));

        // Min filter changed — re-render filter buttons
        const onMinFilter = () => _refreshFilterButtons();
        window.addEventListener('filter-changed', onMinFilter);
        _eventCleanups.push(() => window.removeEventListener('filter-changed', onMinFilter));
    }

    function _refreshTeamList() {
        const listEl = document.getElementById('mcc-team-list');
        if (listEl) {
            listEl.innerHTML = _renderTeamList();
        }

        // Update filter pill active states
        _refreshFilterPills();
    }

    function _refreshFilterPills() {
        const container = document.getElementById(_containerId);
        if (!container) return;

        container.querySelectorAll('[data-action="div-filter"]').forEach(btn => {
            btn.classList.toggle('active', TeamBrowserState.isDivisionActive(btn.dataset.division));
        });
        container.querySelectorAll('[data-action="fav-filter"]').forEach(btn => {
            btn.classList.toggle('active', TeamBrowserState.isFavoritesFilterActive());
        });
    }

    function _refreshFilterButtons() {
        const container = document.getElementById(_containerId);
        if (!container) return;

        const yourMin = (typeof FilterService !== 'undefined') ? FilterService.getYourTeamMinimum() : 3;
        container.querySelectorAll('[data-action="min-filter"]').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.value) === yourMin);
        });
    }

    // ── Helpers ───────────────────────────────────────────────────

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return { init, cleanup };
})();
