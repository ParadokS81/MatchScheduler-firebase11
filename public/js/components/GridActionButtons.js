// GridActionButtons.js - Floating Add Me / Remove Me buttons
// Following CLAUDE.md architecture: Revealing Module Pattern

const GridActionButtons = (function() {
    'use strict';

    let _container = null;
    let _getSelectedCells = null; // Callback to get selected cells from grids
    let _clearSelections = null;  // Callback to clear selections after action
    let _onSyncStart = null;      // Callback when sync starts (for shimmer)
    let _onSyncEnd = null;        // Callback when sync ends

    function _render() {
        if (!_container) return;

        _container.innerHTML = `
            <div class="grid-action-buttons flex gap-2 p-2 bg-card border border-border rounded-lg shadow-md">
                <button id="add-me-btn"
                        class="btn-primary px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled>
                    Add Me
                </button>
                <button id="remove-me-btn"
                        class="btn-secondary px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled>
                    Remove Me
                </button>
            </div>
        `;

        _attachListeners();
    }

    function _attachListeners() {
        const addBtn = document.getElementById('add-me-btn');
        const removeBtn = document.getElementById('remove-me-btn');

        addBtn?.addEventListener('click', _handleAddMe);
        removeBtn?.addEventListener('click', _handleRemoveMe);
    }

    async function _handleAddMe() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        const addBtn = document.getElementById('add-me-btn');
        const removeBtn = document.getElementById('remove-me-btn');

        // Disable both buttons during operation
        addBtn.disabled = true;
        removeBtn.disabled = true;
        addBtn.textContent = 'Adding...';

        // Notify sync start (triggers shimmer on cells)
        if (_onSyncStart) _onSyncStart(selectedCells);

        try {
            // Group cells by week
            const cellsByWeek = _groupCellsByWeek(selectedCells);

            // Get current team (from app state)
            const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
            if (!teamId) throw new Error('No team selected');

            // Process each week
            for (const [weekId, slotIds] of Object.entries(cellsByWeek)) {
                const result = await AvailabilityService.addMeToSlots(teamId, weekId, slotIds);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            // Clear selections on success
            if (_clearSelections) _clearSelections();

            ToastService.showSuccess('Added to selected slots!');

        } catch (error) {
            console.error('Add me failed:', error);
            ToastService.showError(error.message || 'Failed to add availability');
        } finally {
            addBtn.textContent = 'Add Me';
            if (_onSyncEnd) _onSyncEnd();
            _updateButtonStates();
        }
    }

    async function _handleRemoveMe() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        const addBtn = document.getElementById('add-me-btn');
        const removeBtn = document.getElementById('remove-me-btn');

        // Disable both buttons during operation
        addBtn.disabled = true;
        removeBtn.disabled = true;
        removeBtn.textContent = 'Removing...';

        if (_onSyncStart) _onSyncStart(selectedCells);

        try {
            const cellsByWeek = _groupCellsByWeek(selectedCells);
            const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
            if (!teamId) throw new Error('No team selected');

            for (const [weekId, slotIds] of Object.entries(cellsByWeek)) {
                const result = await AvailabilityService.removeMeFromSlots(teamId, weekId, slotIds);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            if (_clearSelections) _clearSelections();

            ToastService.showSuccess('Removed from selected slots!');

        } catch (error) {
            console.error('Remove me failed:', error);
            ToastService.showError(error.message || 'Failed to remove availability');
        } finally {
            removeBtn.textContent = 'Remove Me';
            if (_onSyncEnd) _onSyncEnd();
            _updateButtonStates();
        }
    }

    /**
     * Group cells by their week ID
     * @param {Array} cells - Array of { weekId, slotId } objects
     * @returns {Object} Grouped cells by weekId
     */
    function _groupCellsByWeek(cells) {
        const grouped = {};
        cells.forEach(cell => {
            if (!grouped[cell.weekId]) {
                grouped[cell.weekId] = [];
            }
            grouped[cell.weekId].push(cell.slotId);
        });
        return grouped;
    }

    /**
     * Update button enabled/disabled states based on selection
     */
    function _updateButtonStates() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        const hasSelection = selectedCells.length > 0;

        const addBtn = document.getElementById('add-me-btn');
        const removeBtn = document.getElementById('remove-me-btn');

        if (addBtn) addBtn.disabled = !hasSelection;
        if (removeBtn) removeBtn.disabled = !hasSelection;
    }

    /**
     * Initialize the component
     * @param {string} containerId - The ID of the container element
     * @param {Object} options - Configuration options
     * @param {Function} options.getSelectedCells - Returns array of { weekId, slotId }
     * @param {Function} options.clearSelections - Clears all grid selections
     * @param {Function} options.onSyncStart - Called when sync starts with cell list
     * @param {Function} options.onSyncEnd - Called when sync completes
     */
    function init(containerId, options = {}) {
        _container = document.getElementById(containerId);
        if (!_container) {
            console.error(`GridActionButtons: Container #${containerId} not found`);
            return;
        }

        _getSelectedCells = options.getSelectedCells;
        _clearSelections = options.clearSelections;
        _onSyncStart = options.onSyncStart;
        _onSyncEnd = options.onSyncEnd;

        _render();
        console.log('🎯 GridActionButtons initialized');
    }

    /**
     * Called when selection changes in any grid
     */
    function onSelectionChange() {
        _updateButtonStates();
    }

    /**
     * Cleanup the component
     */
    function cleanup() {
        if (_container) _container.innerHTML = '';
        _container = null;
        _getSelectedCells = null;
        _clearSelections = null;
        _onSyncStart = null;
        _onSyncEnd = null;
    }

    return {
        init,
        onSelectionChange,
        cleanup
    };
})();
