/**
 * StandinFinderService - Lightweight coordinator for Find Standin feature
 *
 * No Firebase, no listeners — just state management and event dispatch.
 * Coordinates between grid selection → AvailabilityService → PlayersPanel.
 */
const StandinFinderService = (function() {
    let _active = false;
    let _capturedSlots = [];   // UTC slot IDs e.g. ['thu_1900', 'thu_1930']
    let _weekId = null;        // e.g. '2026-06'
    let _defaultDivision = null; // e.g. 'D1'

    function activate(weekId, slotIds, division) {
        _active = true;
        _capturedSlots = [...slotIds];
        _weekId = weekId;
        _defaultDivision = division;
        window.dispatchEvent(new CustomEvent('standin-search-started', {
            detail: { weekId, slotIds: _capturedSlots, division }
        }));
    }

    function deactivate() {
        _active = false;
        _capturedSlots = [];
        _weekId = null;
        _defaultDivision = null;
        window.dispatchEvent(new CustomEvent('standin-search-cleared'));
    }

    function isActive() { return _active; }
    function getCapturedSlots() { return [..._capturedSlots]; }
    function getWeekId() { return _weekId; }
    function getDefaultDivision() { return _defaultDivision; }

    return { activate, deactivate, isActive, getCapturedSlots, getWeekId, getDefaultDivision };
})();
