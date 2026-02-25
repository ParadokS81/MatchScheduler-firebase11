// TeamBrowserState.js - Selection and filter state for team browser
// Lightweight state helper following Revealing Module Pattern

const TeamBrowserState = (function() {
    'use strict';

    const STORAGE_KEY = 'matchscheduler_browser_filters';

    // Selection state
    let _selectedTeams = new Set();

    // Filter state — restored from localStorage below
    let _searchQuery = '';
    let _divisionFilters = new Set(); // Empty = all, or contains 'D1', 'D2', 'D3'
    let _favoritesFilterActive = false;

    // Restore persisted filters on load
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved) {
            if (Array.isArray(saved.divisions)) {
                _divisionFilters = new Set(saved.divisions.filter(d => ['D1', 'D2', 'D3'].includes(d)));
            }
            if (typeof saved.favorites === 'boolean') {
                _favoritesFilterActive = saved.favorites;
            }
        }
    } catch { /* localStorage unavailable or corrupt */ }

    // Callbacks for state changes
    let _onSelectionChange = null;
    let _onFilterChange = null;

    // Dispatch selection change event for cross-component communication
    function _dispatchSelectionChange() {
        window.dispatchEvent(new CustomEvent('team-selection-changed', {
            detail: { selectedTeams: Array.from(_selectedTeams) }
        }));
    }

    // Persist division + favorites filters to localStorage
    function _saveFilters() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                divisions: Array.from(_divisionFilters),
                favorites: _favoritesFilterActive
            }));
        } catch { /* localStorage unavailable */ }
    }

    // Dispatch filter change event for cross-component communication (Slice A4)
    function _dispatchFilterChange() {
        _saveFilters();
        if (_onFilterChange) {
            _onFilterChange({ search: _searchQuery, divisions: _divisionFilters });
        }
        window.dispatchEvent(new CustomEvent('team-browser-filter-changed'));
    }

    // ========================================
    // Selection Methods
    // ========================================

    function getSelectedTeams() {
        return new Set(_selectedTeams);
    }

    function isTeamSelected(teamId) {
        return _selectedTeams.has(teamId);
    }

    function toggleTeamSelection(teamId) {
        if (_selectedTeams.has(teamId)) {
            _selectedTeams.delete(teamId);
        } else {
            _selectedTeams.add(teamId);
        }

        if (_onSelectionChange) {
            _onSelectionChange(_selectedTeams);
        }
        _dispatchSelectionChange();

        console.log('📋 Team selection:', Array.from(_selectedTeams));
        return isTeamSelected(teamId);
    }

    function selectTeam(teamId) {
        if (!_selectedTeams.has(teamId)) {
            _selectedTeams.add(teamId);
            if (_onSelectionChange) {
                _onSelectionChange(_selectedTeams);
            }
            _dispatchSelectionChange();
            console.log('📋 Team selected:', teamId);
        }
    }

    function deselectTeam(teamId) {
        if (_selectedTeams.has(teamId)) {
            _selectedTeams.delete(teamId);
            if (_onSelectionChange) {
                _onSelectionChange(_selectedTeams);
            }
            _dispatchSelectionChange();
        }
    }

    function clearSelection() {
        _selectedTeams.clear();
        if (_onSelectionChange) {
            _onSelectionChange(_selectedTeams);
        }
        _dispatchSelectionChange();
    }

    /**
     * Select multiple teams at once (for Select All)
     * @param {string[]} teamIds - Array of team IDs to select
     */
    function selectTeams(teamIds) {
        teamIds.forEach(id => _selectedTeams.add(id));
        if (_onSelectionChange) {
            _onSelectionChange(_selectedTeams);
        }
        _dispatchSelectionChange();
    }

    /**
     * Check if all given teams are selected
     * @param {string[]} teamIds - Array of team IDs to check
     * @returns {boolean} True if all teams are selected
     */
    function areAllSelected(teamIds) {
        if (teamIds.length === 0) return false;
        return teamIds.every(id => _selectedTeams.has(id));
    }

    /**
     * Deselect multiple teams at once
     * @param {string[]} teamIds - Array of team IDs to deselect
     */
    function deselectTeams(teamIds) {
        teamIds.forEach(id => _selectedTeams.delete(id));
        if (_onSelectionChange) {
            _onSelectionChange(_selectedTeams);
        }
        _dispatchSelectionChange();
    }

    function getSelectionCount() {
        return _selectedTeams.size;
    }

    // ========================================
    // Filter Methods
    // ========================================

    function getSearchQuery() {
        return _searchQuery;
    }

    function setSearchQuery(query) {
        _searchQuery = (query || '').toLowerCase().trim();
        _dispatchFilterChange();
    }

    function getDivisionFilters() {
        return new Set(_divisionFilters);
    }

    function isDivisionActive(division) {
        return _divisionFilters.has(division);
    }

    function toggleDivisionFilter(division) {
        if (_divisionFilters.has(division)) {
            _divisionFilters.delete(division);
        } else {
            _divisionFilters.add(division);
        }
        _dispatchFilterChange();
        console.log('🏷️ Division filters:', Array.from(_divisionFilters));
    }

    function clearDivisionFilters() {
        _divisionFilters.clear();
        _dispatchFilterChange();
    }

    function toggleFavoritesFilter() {
        _favoritesFilterActive = !_favoritesFilterActive;
        _dispatchFilterChange();
    }

    function isFavoritesFilterActive() {
        return _favoritesFilterActive;
    }

    // ========================================
    // Event Handlers
    // ========================================

    function onSelectionChange(callback) {
        _onSelectionChange = callback;
    }

    function onFilterChange(callback) {
        _onFilterChange = callback;
    }

    // ========================================
    // Lifecycle
    // ========================================

    function reset() {
        _selectedTeams.clear();
        _searchQuery = '';
        _divisionFilters.clear();
        _favoritesFilterActive = false;
        _onSelectionChange = null;
        _onFilterChange = null;
        // Note: intentionally NOT clearing localStorage — filters should persist across resets
    }

    // Public API
    return {
        // Selection
        getSelectedTeams,
        isTeamSelected,
        toggleTeamSelection,
        selectTeam,
        deselectTeam,
        clearSelection,
        selectTeams,
        areAllSelected,
        deselectTeams,
        getSelectionCount,

        // Filters
        getSearchQuery,
        setSearchQuery,
        getDivisionFilters,
        isDivisionActive,
        toggleDivisionFilter,
        clearDivisionFilters,
        toggleFavoritesFilter,
        isFavoritesFilterActive,

        // Events
        onSelectionChange,
        onFilterChange,

        // Lifecycle
        reset
    };
})();
