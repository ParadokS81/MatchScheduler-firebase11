// DateUtils.js - Canonical week calculation for the entire app
// Slice 8.1a: Extracted from 5 duplicate implementations

const DateUtils = (function() {
    'use strict';

    /**
     * Get the UTC Monday 00:00 of a given week.
     * This is the single source of truth for week-start calculations.
     *
     * Week 1 = first full week starting Monday after Jan 1.
     *
     * @param {number|string} weekInput - Week number (5) or weekId string ("2026-05")
     * @param {number} [year] - Required if weekInput is a number
     * @returns {Date} UTC Monday 00:00 of that week
     */
    function getMondayOfWeek(weekInput, year) {
        let weekNumber;
        if (typeof weekInput === 'string') {
            const parts = weekInput.split('-');
            year = parseInt(parts[0]);
            weekNumber = parseInt(parts[1]);
        } else {
            weekNumber = weekInput;
            if (!year) year = new Date().getUTCFullYear();
        }

        const jan1 = new Date(Date.UTC(year, 0, 1));
        const dayOfWeek = jan1.getUTCDay();
        const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
        const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));
        const monday = new Date(firstMonday);
        monday.setUTCDate(firstMonday.getUTCDate() + (weekNumber - 1) * 7);
        return monday;
    }

    return { getMondayOfWeek };
})();
