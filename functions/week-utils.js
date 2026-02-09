// week-utils.js - Single source of truth for week calculations (backend)
// Mirrors: public/js/utils/DateUtils.js (frontend canonical)
//
// Algorithm: Week 1 = first full week starting Monday after Jan 1.
// All functions use UTC. Week IDs use format "YYYY-WW".

'use strict';

/**
 * Compute Monday 00:00 UTC of a given week.
 * @param {number} year
 * @param {number} weekNumber
 * @returns {Date} UTC Monday 00:00 of that week
 */
function getMondayOfWeek(year, weekNumber) {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const dayOfWeek = jan1.getUTCDay();
    const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));
    const monday = new Date(firstMonday);
    monday.setUTCDate(firstMonday.getUTCDate() + (weekNumber - 1) * 7);
    return monday;
}

/**
 * Get the current week number based on UTC now.
 * @returns {number} Current week number (1-52)
 */
function getCurrentWeekNumber() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const dayOfWeek = jan1.getUTCDay();
    const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));
    const daysSinceFirstMonday = Math.floor((now - firstMonday) / (24 * 60 * 60 * 1000));
    return Math.max(1, Math.floor(daysSinceFirstMonday / 7) + 1);
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
    const currentYear = now.getUTCFullYear();
    const currentWeek = getCurrentWeekNumber();

    const { year: targetYear, weekNumber: targetWeek } = parseWeekId(weekId);

    const currentAbsolute = currentYear * 52 + currentWeek;
    const targetAbsolute = targetYear * 52 + targetWeek;

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
    parseWeekId,
    isValidWeekRange,
    computeExpiresAt,
    computeScheduledDate
};
