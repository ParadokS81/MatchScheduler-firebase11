// TimezoneService.js - UTC timezone conversion for availability grid
// Slice 7.0a: Central timezone utility
// All slot IDs in Firestore are UTC. This service converts between user's local time and UTC.

const TimezoneService = (function() {
    'use strict';

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    // Default display range: 18:00 - 23:00 local time (11 slots, 30-min intervals)
    const DISPLAY_START_HOUR = 18;
    const DISPLAY_END_HOUR = 23;
    const DISPLAY_TIME_SLOTS = [
        '1800', '1830', '1900', '1930', '2000',
        '2030', '2100', '2130', '2200', '2230', '2300'
    ];

    // Slice 13.0d: Default hidden timeslots (18:00, 18:30, 19:00 have <1% combined usage)
    const DEFAULT_HIDDEN_TIMESLOTS = ['1800', '1830', '1900'];

    let _userTimezone = null;   // IANA string, e.g., "Europe/Stockholm"
    let _initialized = false;
    let _hiddenTimeSlots = new Set(DEFAULT_HIDDEN_TIMESLOTS); // Slice 12.0a + 13.0d: default hidden

    // ---------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------

    /**
     * Initialize with a user's IANA timezone.
     * Call with stored preference, or omit to auto-detect from browser.
     * @param {string} [timezone] - IANA timezone string
     */
    function init(timezone) {
        _userTimezone = timezone || detectTimezone();
        _initialized = true;
        console.log(`🕐 TimezoneService initialized: ${_userTimezone} (UTC offset: ${getOffsetHours()}h)`);
    }

    /**
     * Auto-detect timezone from browser.
     * @returns {string} IANA timezone string
     */
    function detectTimezone() {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    /**
     * Get the current user timezone.
     * @returns {string} IANA timezone string
     */
    function getUserTimezone() {
        return _userTimezone || detectTimezone();
    }

    /**
     * Update the user's timezone (e.g., from selector UI).
     * @param {string} timezone - IANA timezone string
     */
    function setUserTimezone(timezone) {
        _userTimezone = timezone;
        console.log(`🕐 Timezone changed: ${timezone} (UTC offset: ${getOffsetHours()}h)`);
    }

    // ---------------------------------------------------------------
    // Offset calculation
    // ---------------------------------------------------------------

    /**
     * Get UTC offset in minutes for the user's timezone on a specific date.
     * Uses Intl API so DST is handled automatically.
     *
     * @param {Date} [date] - The date to check offset for (DST varies by date)
     * @returns {number} Offset in minutes (positive = east of UTC, e.g., CET = +60)
     */
    function getOffsetMinutes(date = new Date()) {
        const tz = _userTimezone || detectTimezone();

        // Parse the same instant in UTC and in the target timezone
        // Using toLocaleString to get calendar representations, then compare
        const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
        const localStr = date.toLocaleString('en-US', { timeZone: tz });

        return (new Date(localStr) - new Date(utcStr)) / 60000;
    }

    /**
     * Get UTC offset in whole hours (convenience).
     * Note: Some timezones have 30/45-min offsets (e.g., India +5:30).
     * This rounds to nearest hour - use getOffsetMinutes() for precision.
     *
     * @param {Date} [date] - The date to check offset for
     * @returns {number} Offset in hours (e.g., 1 for CET, -5 for EST)
     */
    function getOffsetHours(date = new Date()) {
        return Math.round(getOffsetMinutes(date) / 60);
    }

    /**
     * Extract date parts using Intl.DateTimeFormat for a specific timezone.
     * @private
     */
    function _getDateParts(date, timeZone) {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false
        });

        const parts = {};
        formatter.formatToParts(date).forEach(({ type, value }) => {
            if (type === 'year') parts.year = parseInt(value);
            if (type === 'month') parts.month = parseInt(value);
            if (type === 'day') parts.day = parseInt(value);
            if (type === 'hour') parts.hour = parseInt(value) % 24; // hour12:false can return 24 for midnight
            if (type === 'minute') parts.minute = parseInt(value);
        });
        return parts;
    }

    // ---------------------------------------------------------------
    // Slot conversion: local display ↔ UTC storage
    // ---------------------------------------------------------------

    /**
     * Convert a local display slot to a UTC slot ID for Firestore storage.
     * Handles day wrapping (e.g., EST mon 23:00 local → tue 04:00 UTC).
     *
     * @param {string} localDay - Day in user's local time ('mon', 'tue', ...)
     * @param {string} localTime - Time in user's local time ('2100', '1830', ...)
     * @param {Date} [refDate] - Reference date for DST-correct offset calculation
     * @returns {{ day: string, time: string, slotId: string }}
     */
    function localToUtcSlot(localDay, localTime, refDate) {
        const offsetMin = getOffsetMinutes(refDate || new Date());

        const localHour = parseInt(localTime.slice(0, 2));
        const localMin = parseInt(localTime.slice(2));
        const localTotalMin = localHour * 60 + localMin;

        // Subtract offset to get UTC (local = UTC + offset, so UTC = local - offset)
        let utcTotalMin = localTotalMin - offsetMin;
        let dayShift = 0;

        // Handle day wrapping
        if (utcTotalMin < 0) {
            utcTotalMin += 1440; // 24 * 60
            dayShift = -1;
        } else if (utcTotalMin >= 1440) {
            utcTotalMin -= 1440;
            dayShift = 1;
        }

        const utcHour = Math.floor(utcTotalMin / 60);
        const utcMin = utcTotalMin % 60;
        const utcTime = String(utcHour).padStart(2, '0') + String(utcMin).padStart(2, '0');

        // Shift day if needed
        const dayIdx = DAYS.indexOf(localDay);
        const utcDayIdx = ((dayIdx + dayShift) % 7 + 7) % 7; // Handle negative wrap
        const utcDay = DAYS[utcDayIdx];

        return {
            day: utcDay,
            time: utcTime,
            slotId: `${utcDay}_${utcTime}`
        };
    }

    /**
     * Convert a UTC slot ID to local display time.
     * Inverse of localToUtcSlot.
     *
     * @param {string} utcDay - Day in UTC ('mon', 'tue', ...)
     * @param {string} utcTime - Time in UTC ('2000', '1730', ...)
     * @param {Date} [refDate] - Reference date for DST-correct offset calculation
     * @returns {{ day: string, time: string, displayTime: string }}
     */
    function utcToLocalSlot(utcDay, utcTime, refDate) {
        const offsetMin = getOffsetMinutes(refDate || new Date());

        const utcHour = parseInt(utcTime.slice(0, 2));
        const utcMin = parseInt(utcTime.slice(2));
        const utcTotalMin = utcHour * 60 + utcMin;

        // Add offset to get local (local = UTC + offset)
        let localTotalMin = utcTotalMin + offsetMin;
        let dayShift = 0;

        if (localTotalMin < 0) {
            localTotalMin += 1440;
            dayShift = -1;
        } else if (localTotalMin >= 1440) {
            localTotalMin -= 1440;
            dayShift = 1;
        }

        const localHour = Math.floor(localTotalMin / 60);
        const localMin = localTotalMin % 60;
        const localTime = String(localHour).padStart(2, '0') + String(localMin).padStart(2, '0');

        const dayIdx = DAYS.indexOf(utcDay);
        const localDayIdx = ((dayIdx + dayShift) % 7 + 7) % 7;
        const localDay = DAYS[localDayIdx];

        return {
            day: localDay,
            time: localTime,
            displayTime: `${String(localHour).padStart(2, '0')}:${String(localMin).padStart(2, '0')}`
        };
    }

    // ---------------------------------------------------------------
    // Timeslot filtering (Slice 12.0a)
    // ---------------------------------------------------------------

    /**
     * Get the currently visible time slots (all minus hidden).
     * @returns {string[]} Array of visible local time strings
     */
    function getVisibleTimeSlots() {
        if (_hiddenTimeSlots.size === 0) return DISPLAY_TIME_SLOTS;
        return DISPLAY_TIME_SLOTS.filter(s => !_hiddenTimeSlots.has(s));
    }

    /**
     * Set which time slots are hidden. Minimum 4 slots must remain visible.
     * @param {string[]} hiddenSlots - Array of time slot strings to hide
     * @returns {boolean} true if applied, false if rejected (too few would remain)
     */
    function setHiddenTimeSlots(hiddenSlots) {
        const newHidden = new Set(
            hiddenSlots.filter(s => DISPLAY_TIME_SLOTS.includes(s))
        );
        if (DISPLAY_TIME_SLOTS.length - newHidden.size < 4) {
            console.warn('Cannot hide — minimum 4 slots must remain visible');
            return false;
        }
        _hiddenTimeSlots = newHidden;
        return true;
    }

    /**
     * Get the currently hidden time slots.
     * @returns {string[]} Array of hidden time slot strings
     */
    function getHiddenTimeSlots() {
        return Array.from(_hiddenTimeSlots);
    }

    /**
     * Get the default hidden time slots (for new users).
     * @returns {string[]} Array of default hidden time slot strings
     */
    function getDefaultHiddenTimeSlots() {
        return DEFAULT_HIDDEN_TIMESLOTS;
    }

    // ---------------------------------------------------------------
    // Grid helpers
    // ---------------------------------------------------------------

    /**
     * Get the display time labels for the grid (local times).
     * These are what the user sees in the time column.
     * @returns {string[]} Array of local time strings, e.g., ['1800', '1830', ...]
     */
    function getDisplayTimeSlots() {
        return DISPLAY_TIME_SLOTS;
    }

    /**
     * Get the UTC slot IDs that correspond to the display grid for a specific day.
     * Accounts for timezone offset and day wrapping.
     *
     * @param {string} localDay - The local day ('mon', 'tue', ...)
     * @param {Date} [refDate] - Reference date for DST offset
     * @returns {Array<{ localTime: string, utcSlotId: string, utcDay: string, utcTime: string }>}
     */
    function getUtcSlotsForDay(localDay, refDate) {
        return DISPLAY_TIME_SLOTS.map(localTime => {
            const utc = localToUtcSlot(localDay, localTime, refDate);
            return {
                localTime,
                utcSlotId: utc.slotId,
                utcDay: utc.day,
                utcTime: utc.time
            };
        });
    }

    /**
     * Build a full mapping of grid positions to UTC slot IDs for one week.
     * Used when rendering the grid: map each (row, col) to a Firestore slot ID.
     *
     * @param {Date} [refDate] - Reference date for DST offset
     * @returns {Map<string, string>} Map from local cellId (e.g., "mon_1800") to UTC slotId (e.g., "mon_1700")
     */
    function buildGridToUtcMap(refDate) {
        const map = new Map();
        for (const day of DAYS) {
            for (const time of getVisibleTimeSlots()) {
                const localCellId = `${day}_${time}`;
                const utc = localToUtcSlot(day, time, refDate);
                map.set(localCellId, utc.slotId);
            }
        }
        return map;
    }

    /**
     * Build the reverse mapping: UTC slot IDs to grid positions.
     * Used when loading availability data: map Firestore slot IDs to grid cells.
     *
     * @param {Date} [refDate] - Reference date for DST offset
     * @returns {Map<string, string>} Map from UTC slotId (e.g., "mon_1700") to local cellId (e.g., "mon_1800")
     */
    function buildUtcToGridMap(refDate) {
        const map = new Map();
        for (const day of DAYS) {
            for (const time of getVisibleTimeSlots()) {
                const utc = localToUtcSlot(day, time, refDate);
                const localCellId = `${day}_${time}`;
                map.set(utc.slotId, localCellId);
            }
        }
        return map;
    }

    /**
     * Format a UTC slot ID for display in the user's timezone.
     * @param {string} utcSlotId - e.g., "mon_2000"
     * @param {Date} [refDate] - Reference date for DST offset
     * @returns {{ dayLabel: string, timeLabel: string, fullLabel: string }}
     */
    function formatSlotForDisplay(utcSlotId, refDate) {
        const [utcDay, utcTime] = utcSlotId.split('_');
        const local = utcToLocalSlot(utcDay, utcTime, refDate);

        const dayNames = {
            mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
            thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
        };

        return {
            dayLabel: dayNames[local.day] || local.day,
            timeLabel: local.displayTime,
            fullLabel: `${dayNames[local.day]} at ${local.displayTime}`
        };
    }

    // ---------------------------------------------------------------
    // Timezone abbreviation
    // ---------------------------------------------------------------

    /**
     * Get the short timezone abbreviation (e.g., "CET", "EST", "GMT").
     * @param {Date} [date] - Reference date (affects DST: CET vs CEST)
     * @returns {string}
     */
    function getTimezoneAbbreviation(date = new Date()) {
        const tz = _userTimezone || detectTimezone();
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                timeZoneName: 'short'
            });
            const parts = formatter.formatToParts(date);
            const tzPart = parts.find(p => p.type === 'timeZoneName');
            return tzPart ? tzPart.value : tz;
        } catch {
            return tz;
        }
    }

    /**
     * Get a human-readable timezone label.
     * @returns {string} e.g., "CET (UTC+1)" or "EST (UTC-5)"
     */
    function getTimezoneLabel(date = new Date()) {
        const abbr = getTimezoneAbbreviation(date);
        const offset = getOffsetHours(date);
        const sign = offset >= 0 ? '+' : '';
        return `${abbr} (UTC${sign}${offset})`;
    }

    // ---------------------------------------------------------------
    // Timezone picker data
    // ---------------------------------------------------------------

    /**
     * Get grouped timezone options for the selector UI.
     * @returns {Array<{ region: string, timezones: Array<{ id: string, label: string }> }>}
     */
    function getTimezoneOptions() {
        return [
            {
                region: 'Europe',
                timezones: [
                    { id: 'Europe/London', label: 'London (GMT/BST)' },
                    { id: 'Europe/Stockholm', label: 'Stockholm (CET/CEST)' },
                    { id: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
                    { id: 'Europe/Paris', label: 'Paris (CET/CEST)' },
                    { id: 'Europe/Helsinki', label: 'Helsinki (EET/EEST)' },
                    { id: 'Europe/Moscow', label: 'Moscow (MSK)' },
                    { id: 'Europe/Athens', label: 'Athens (EET/EEST)' }
                ]
            },
            {
                region: 'North America',
                timezones: [
                    { id: 'America/New_York', label: 'New York (EST/EDT)' },
                    { id: 'America/Chicago', label: 'Chicago (CST/CDT)' },
                    { id: 'America/Denver', label: 'Denver (MST/MDT)' },
                    { id: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' }
                ]
            },
            {
                region: 'Other',
                timezones: [
                    { id: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
                    { id: 'Asia/Tokyo', label: 'Tokyo (JST)' },
                    { id: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' }
                ]
            }
        ];
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    return {
        init,
        detectTimezone,
        getUserTimezone,
        setUserTimezone,
        getOffsetMinutes,
        getOffsetHours,
        localToUtcSlot,
        utcToLocalSlot,
        getDisplayTimeSlots,
        getUtcSlotsForDay,
        buildGridToUtcMap,
        buildUtcToGridMap,
        formatSlotForDisplay,
        getTimezoneAbbreviation,
        getTimezoneLabel,
        getTimezoneOptions,
        // Slice 12.0a: Timeslot filtering
        getVisibleTimeSlots,
        setHiddenTimeSlots,
        getHiddenTimeSlots,
        getDefaultHiddenTimeSlots, // Slice 13.0d
        // Constants exposed for external use
        DAYS,
        DISPLAY_TIME_SLOTS
    };
})();
