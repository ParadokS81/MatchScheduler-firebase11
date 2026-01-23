// WeekNavigation.js - Shows current bi-weekly block navigation
// Singleton pattern - only one navigation needed

const WeekNavigation = (function() {
    'use strict';

    let _panel = null;

    /**
     * Get current ISO week number
     * @returns {number} Current week number (1-52)
     */
    function _getCurrentWeekNumber() {
        const now = new Date();
        const year = now.getFullYear();

        // Find first Thursday of the year (ISO week 1 contains first Thursday)
        const jan1 = new Date(year, 0, 1);
        const jan1Day = jan1.getDay();

        // Days to Thursday (4)
        const daysToThursday = jan1Day <= 4 ? (4 - jan1Day) : (11 - jan1Day);
        const firstThursday = new Date(year, 0, 1 + daysToThursday);

        // First Monday is 3 days before first Thursday
        const firstMonday = new Date(firstThursday);
        firstMonday.setDate(firstThursday.getDate() - 3);

        // Calculate days since first Monday
        const daysSinceFirstMonday = Math.floor((now - firstMonday) / (24 * 60 * 60 * 1000));

        // Week number is 1 + floor(days / 7)
        return Math.max(1, Math.floor(daysSinceFirstMonday / 7) + 1);
    }

    function _render() {
        if (!_panel) return;

        const currentWeek = _getCurrentWeekNumber();
        const week1 = currentWeek;
        const week2 = currentWeek + 1;

        _panel.innerHTML = `
            <div class="week-navigation">
                <div class="week-nav-content">
                    <!-- Prev button placeholder (disabled for now) -->
                    <button class="week-nav-btn" disabled title="Coming soon">
                        <span class="nav-arrow">&#9664;</span>
                    </button>

                    <div class="week-nav-info">
                        <span class="week-nav-title">Weeks ${week1} - ${week2}</span>
                        <span class="week-nav-subtitle">(Current + Next)</span>
                    </div>

                    <!-- Next button placeholder (disabled for now) -->
                    <button class="week-nav-btn" disabled title="Coming soon">
                        <span class="nav-arrow">&#9654;</span>
                    </button>
                </div>
            </div>
        `;
    }

    function init(panelId) {
        _panel = document.getElementById(panelId);
        if (!_panel) {
            console.error(`WeekNavigation: Panel #${panelId} not found`);
            return;
        }
        _render();
    }

    function getCurrentWeekNumber() {
        return _getCurrentWeekNumber();
    }

    function cleanup() {
        if (_panel) _panel.innerHTML = '';
        _panel = null;
    }

    return {
        init,
        getCurrentWeekNumber,
        cleanup
    };
})();
