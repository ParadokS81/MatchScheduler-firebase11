// week-utils.js - Single source of truth for week calculations (backend)
// Mirrors: public/js/utils/DateUtils.js (frontend canonical)
//
// Algorithm: ISO 8601 — Week 1 contains the first Thursday of the year.
// All functions use UTC. Week IDs use format "YYYY-WW".

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
 * Compute Monday 00:00 UTC of a given ISO week.
 * @param {number} year - ISO week-year
 * @param {number} weekNumber - ISO week number (1-53)
 * @returns {Date} UTC Monday 00:00 of that week
 */
function getMondayOfWeek(year, weekNumber) {
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
 * Get the current ISO week number based on UTC now.
 * @returns {number} Current ISO week number (1-53)
 */
function getCurrentWeekNumber() {
    const now = new Date();
    return getISOWeekNumber(now);
}

/**
 * Get the ISO week number for any date.
 * @param {Date} date
 * @returns {number} ISO week number (1-53)
 */
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Set to nearest Thursday: current date + 4 - day number (Mon=1, Sun=7)
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    // Get first day of that year
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks between yearStart and nearest Thursday
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

/**
 * Parse a weekId string into year and week number.
 * @param {string} weekId - e.g. "2026-07"
 * @returns {{ year: number, weekNumber: number }}
 */
function parseWeekId(weekId) {
    const [yearStr, weekStr] = weekId.split('-');
    return { year: parseInt(yearStr), weekNumber: parseInt(weekStr) };
}

/**
 * Check if a weekId is current or up to N weeks in the future.
 * @param {string} weekId
 * @param {number} [maxWeeksAhead=4]
 * @returns {boolean}
 */
function isValidWeekRange(weekId, maxWeeksAhead = 4) {
    const now = new Date();
    const currentYear = getISOWeekYear(now);
    const currentWeek = getCurrentWeekNumber();

    const { year: targetYear, weekNumber: targetWeek } = parseWeekId(weekId);

    // Use actual weeks-in-year to compute absolute week positions
    function toAbsolute(y, w) {
        let total = 0;
        for (let yr = 2020; yr < y; yr++) total += getISOWeeksInYear(yr);
        return total + w;
    }
    const currentAbsolute = toAbsolute(currentYear, currentWeek);
    const targetAbsolute = toAbsolute(targetYear, targetWeek);

    return targetAbsolute >= currentAbsolute && targetAbsolute <= currentAbsolute + maxWeeksAhead;
}

/**
 * Compute expiresAt: Sunday 23:59:59 UTC of the given week.
 * @param {string} weekId
 * @returns {Date}
 */
function computeExpiresAt(weekId) {
    const { year, weekNumber } = parseWeekId(weekId);
    const monday = getMondayOfWeek(year, weekNumber);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);
    return sunday;
}

/**
 * Compute ISO date string from weekId + slotId.
 * E.g., weekId "2026-05", slotId "wed_2000" → "2026-02-04"
 * @param {string} weekId
 * @param {string} slotId
 * @returns {string} ISO date "YYYY-MM-DD"
 */
function computeScheduledDate(weekId, slotId) {
    const dayMap = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
    const { year, weekNumber } = parseWeekId(weekId);
    const monday = getMondayOfWeek(year, weekNumber);
    const dayOffset = dayMap[slotId.split('_')[0]];
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + dayOffset);
    return date.toISOString().slice(0, 10);
}

module.exports = {
    getMondayOfWeek,
    getCurrentWeekNumber,
    getISOWeekNumber,
    getISOWeekYear,
    getISOWeeksInYear,
    parseWeekId,
    isValidWeekRange,
    computeExpiresAt,
    computeScheduledDate
};
