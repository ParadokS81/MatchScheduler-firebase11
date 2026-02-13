// DateUtils.js - Canonical week calculation for the entire app
// Slice 8.1a: Extracted from 5 duplicate implementations
//
// Algorithm: ISO 8601 — Week 1 contains the first Thursday of the year.
// Mirrors: functions/week-utils.js (backend canonical)

const DateUtils = (function() {
    'use strict';

    /**
     * Get the number of ISO weeks in a given year.
     * A year has 53 weeks if Jan 1 is Thursday, or Dec 31 is Thursday.
     * @param {number} year
     * @returns {number} 52 or 53
     */
    function getISOWeeksInYear(year) {
        const jan1Day = new Date(Date.UTC(year, 0, 1)).getUTCDay();
        const dec31Day = new Date(Date.UTC(year, 11, 31)).getUTCDay();
        return (jan1Day === 4 || dec31Day === 4) ? 53 : 52;
    }

    /**
     * Get the UTC Monday 00:00 of a given ISO week.
     * This is the single source of truth for week-start calculations.
     *
     * ISO 8601: Week 1 contains the first Thursday of the year.
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

        // Jan 4 is always in ISO week 1
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const jan4Day = jan4.getUTCDay() || 7; // Convert Sunday=0 to 7
        // Monday of ISO week 1
        const week1Monday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
        const monday = new Date(week1Monday);
        monday.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);
        return monday;
    }

    /**
     * Get the actual current ISO week number (not the navigated/anchor week).
     * @returns {number} Current ISO week number (1-53)
     */
    function getCurrentWeekNumber() {
        return getISOWeekNumber(new Date());
    }

    /**
     * Get the ISO week number for any date.
     * @param {Date} date
     * @returns {number} ISO week number (1-53)
     */
    function getISOWeekNumber(date) {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    }

    /**
     * Get the ISO week-year for a date (may differ from calendar year at boundaries).
     * @param {Date} date
     * @returns {number} ISO week-year
     */
    function getISOWeekYear(date) {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        return d.getUTCFullYear();
    }

    return { getMondayOfWeek, getCurrentWeekNumber, getISOWeekNumber, getISOWeekYear, getISOWeeksInYear };
})();
