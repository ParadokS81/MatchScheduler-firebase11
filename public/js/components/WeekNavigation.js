// WeekNavigation.js - Anchor week state manager for bi-weekly navigation
// Singleton pattern - manages which weeks are displayed across all grids
// Slice 5.0a: Converted from panel renderer to state manager

const WeekNavigation = (function() {
    'use strict';

    let _anchorWeek = null; // The "first" week being displayed (top grid)
    let _callbacks = [];    // Listeners for week changes

    /**
     * Get current ISO week number
     * @returns {number} Current week number (1-52)
     */
    function _calculateCurrentWeekNumber() {
        const now = new Date();
        const year = now.getUTCFullYear();

        // Must match DateUtils.getMondayOfWeek definition:
        // Week 1 = first full week starting Monday after Jan 1
        const jan1 = new Date(Date.UTC(year, 0, 1));
        const dayOfWeek = jan1.getUTCDay();
        const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
        const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));

        // Calculate days since first Monday
        const daysSinceFirstMonday = Math.floor((now - firstMonday) / (24 * 60 * 60 * 1000));

        // Week number is 1 + floor(days / 7)
        return Math.max(1, Math.floor(daysSinceFirstMonday / 7) + 1);
    }

    /**
     * Initialize anchor week to current week (no panel needed anymore)
     */
    function init() {
        if (_anchorWeek === null) {
            _anchorWeek = _calculateCurrentWeekNumber();
        }
        console.log('📅 WeekNavigation initialized, anchor week:', _anchorWeek);
    }

    /**
     * Get current anchor week number (the week shown in top grid)
     * @returns {number} Anchor week number
     */
    function getCurrentWeekNumber() {
        if (_anchorWeek === null) {
            _anchorWeek = _calculateCurrentWeekNumber();
        }
        return _anchorWeek;
    }

    /**
     * Get the second week number (anchor + 1, shown in bottom grid)
     * @returns {number} Second week number
     */
    function getSecondWeekNumber() {
        return getCurrentWeekNumber() + 1;
    }

    /**
     * Navigate to previous week pair
     */
    function navigatePrev() {
        if (_anchorWeek > 1) {
            _anchorWeek--;
            _notifyListeners();
            console.log('📅 Navigated to week:', _anchorWeek);
        }
    }

    /**
     * Navigate to next week pair
     */
    function navigateNext() {
        if (_anchorWeek < 52) {
            _anchorWeek++;
            _notifyListeners();
            console.log('📅 Navigated to week:', _anchorWeek);
        }
    }

    /**
     * Navigate directly to a specific week number
     * @param {number} weekNumber - Target week (1-52)
     */
    function setWeekNumber(weekNumber) {
        if (weekNumber < 1 || weekNumber > 52) return;
        if (_anchorWeek === weekNumber) return;
        _anchorWeek = weekNumber;
        _notifyListeners();
        console.log('📅 Navigated directly to week:', _anchorWeek);
    }

    /**
     * Navigate by direction string
     * @param {string} direction - 'prev' or 'next'
     */
    function navigate(direction) {
        if (direction === 'prev') {
            navigatePrev();
        } else if (direction === 'next') {
            navigateNext();
        }
    }

    /**
     * Register callback for week changes
     * @param {Function} callback - Called with (anchorWeek, secondWeek) when navigation changes
     * @returns {Function} Unsubscribe function
     */
    function onWeekChange(callback) {
        _callbacks.push(callback);
        return () => {
            _callbacks = _callbacks.filter(cb => cb !== callback);
        };
    }

    /**
     * Notify all listeners of week change
     */
    function _notifyListeners() {
        const anchorWeek = getCurrentWeekNumber();
        const secondWeek = getSecondWeekNumber();
        _callbacks.forEach(cb => cb(anchorWeek, secondWeek));

        // Also dispatch a global event for components that prefer events
        window.dispatchEvent(new CustomEvent('week-navigation-changed', {
            detail: { anchorWeek, secondWeek }
        }));
    }

    /**
     * Check if we can navigate prev
     * @returns {boolean}
     */
    function canNavigatePrev() {
        return _anchorWeek > 1;
    }

    /**
     * Check if we can navigate next
     * @returns {boolean}
     */
    function canNavigateNext() {
        return _anchorWeek < 52;
    }

    function cleanup() {
        _callbacks = [];
    }

    return {
        init,
        getCurrentWeekNumber,
        getSecondWeekNumber,
        setWeekNumber,
        navigate,
        navigatePrev,
        navigateNext,
        onWeekChange,
        canNavigatePrev,
        canNavigateNext,
        cleanup
    };
})();
