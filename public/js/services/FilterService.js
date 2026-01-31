// FilterService - Manages comparison filter state for minimum player requirements
// Slice 3.3: Comparison Filters
// Following PRD v2 Architecture with Revealing Module Pattern

const FilterService = (function() {
    'use strict';

    // Private state - filter values are session-specific (not persisted)
    let _yourTeamMinimum = 1;
    let _opponentMinimum = 1;

    /**
     * Dispatch filter-changed event to notify listening components
     */
    function _dispatchChange() {
        window.dispatchEvent(new CustomEvent('filter-changed', {
            detail: {
                yourTeam: _yourTeamMinimum,
                opponent: _opponentMinimum
            }
        }));
    }

    /**
     * Initialize FilterService with default values (1, 1)
     * Called on app start - values reset each session
     */
    function init() {
        _yourTeamMinimum = 1;
        _opponentMinimum = 1;
        // Don't dispatch on init - components will read initial values
        console.log('🎚️ FilterService initialized with defaults (1, 1)');

        // Sync internal state when external code dispatches filter-changed directly
        // (e.g., MatchesPanel "Load Grid View" sets filters without going through setters)
        window.addEventListener('filter-changed', (e) => {
            if (!e.detail) return;
            if (e.detail.yourTeam !== undefined) {
                _yourTeamMinimum = Math.max(1, Math.min(4, parseInt(e.detail.yourTeam) || 1));
            }
            if (e.detail.opponent !== undefined) {
                _opponentMinimum = Math.max(1, Math.min(4, parseInt(e.detail.opponent) || 1));
            }
        });
    }

    /**
     * Get current "Your team minimum" value
     * @returns {number} Value between 1-4
     */
    function getYourTeamMinimum() {
        return _yourTeamMinimum;
    }

    /**
     * Set "Your team minimum" value
     * @param {number|string} value - Value to set (clamped to 1-4)
     */
    function setYourTeamMinimum(value) {
        const n = Math.max(1, Math.min(4, parseInt(value) || 1));
        if (n !== _yourTeamMinimum) {
            _yourTeamMinimum = n;
            _dispatchChange();
        }
    }

    /**
     * Get current "Opponent minimum" value
     * @returns {number} Value between 1-4
     */
    function getOpponentMinimum() {
        return _opponentMinimum;
    }

    /**
     * Set "Opponent minimum" value
     * @param {number|string} value - Value to set (clamped to 1-4)
     */
    function setOpponentMinimum(value) {
        const n = Math.max(1, Math.min(4, parseInt(value) || 1));
        if (n !== _opponentMinimum) {
            _opponentMinimum = n;
            _dispatchChange();
        }
    }

    /**
     * Get both filter values as an object
     * @returns {{yourTeam: number, opponent: number}}
     */
    function getFilters() {
        return {
            yourTeam: _yourTeamMinimum,
            opponent: _opponentMinimum
        };
    }

    /**
     * Reset both filters to default values (1, 1)
     * Dispatches filter-changed event
     */
    function reset() {
        _yourTeamMinimum = 1;
        _opponentMinimum = 1;
        _dispatchChange();
    }

    // Public API
    return {
        init,
        getYourTeamMinimum,
        setYourTeamMinimum,
        getOpponentMinimum,
        setOpponentMinimum,
        getFilters,
        reset
    };
})();
