// GridActionButtons.js - Grid operations service (add/remove availability, templates, timeslots)
// Slice 13.0b: Refactored from drawer-based component to service-only module
// Following CLAUDE.md architecture: Revealing Module Pattern

const GridActionButtons = (function() {
    'use strict';

    // Service state
    let _initialized = false;
    let _getSelectedCells = null;
    let _clearSelections = null;
    let _onSyncStart = null;
    let _onSyncEnd = null;
    let _clearAllCallback = null;

    // ---------------------------------------------------------------
    // Utility functions
    // ---------------------------------------------------------------

    /**
     * Escape HTML to prevent XSS
     */
    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Group cells by their week ID
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

    // ---------------------------------------------------------------
    // Core operations (used by SelectionActionButton)
    // ---------------------------------------------------------------

    function _handleClearAll() {
        if (_clearAllCallback) {
            _clearAllCallback();
        }
    }

    async function _handleAddMe() {
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            ToastService.showError('Please select a team first');
            return;
        }

        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        if (_onSyncStart) _onSyncStart(selectedCells);

        try {
            const cellsByWeek = _groupCellsByWeek(selectedCells);

            for (const [weekId, slotIds] of Object.entries(cellsByWeek)) {
                const result = await AvailabilityService.addMeToSlots(teamId, weekId, slotIds);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            if (_clearSelections) _clearSelections();

        } catch (error) {
            console.error('Add me failed:', error);
            ToastService.showError(error.message || 'Failed to add availability');
        } finally {
            if (_onSyncEnd) _onSyncEnd();
        }
    }

    async function _handleRemoveMe() {
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            ToastService.showError('Please select a team first');
            return;
        }

        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        if (_onSyncStart) _onSyncStart(selectedCells);

        try {
            const cellsByWeek = _groupCellsByWeek(selectedCells);

            for (const [weekId, slotIds] of Object.entries(cellsByWeek)) {
                const result = await AvailabilityService.removeMeFromSlots(teamId, weekId, slotIds);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            if (_clearSelections) _clearSelections();

        } catch (error) {
            console.error('Remove me failed:', error);
            ToastService.showError(error.message || 'Failed to remove availability');
        } finally {
            if (_onSyncEnd) _onSyncEnd();
        }
    }

    // ---------------------------------------------------------------
    // Template operations
    // ---------------------------------------------------------------

    async function _handleSaveTemplate() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) {
            ToastService.showError('Select at least one slot to save as template');
            return;
        }

        const slots = selectedCells.map(cell => cell.slotId);
        const uniqueSlots = [...new Set(slots)];

        _showTemplateNameModal(async (name) => {
            if (!name) return;

            const result = await TemplateService.saveTemplate(name, uniqueSlots);

            if (result.success) {
                ToastService.showSuccess(`Template "${name}" saved!`);
            } else {
                ToastService.showError(result.error || 'Failed to save template');
            }
        });
    }

    function _showTemplateNameModal(callback, existingName = '') {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm">
                <div class="p-4 border-b border-border">
                    <h3 class="text-lg font-semibold">${existingName ? 'Rename Template' : 'Save Template'}</h3>
                </div>
                <div class="p-4">
                    <label class="block text-sm font-medium mb-2">Template Name</label>
                    <input type="text"
                           id="template-name-input"
                           class="w-full px-3 py-2 bg-input border border-border rounded text-sm"
                           placeholder="e.g., Weekday Evenings"
                           maxlength="${TemplateService.MAX_NAME_LENGTH}"
                           value="${_escapeHtml(existingName)}">
                    <p class="text-xs text-muted-foreground mt-1">Max ${TemplateService.MAX_NAME_LENGTH} characters</p>
                </div>
                <div class="flex justify-end gap-2 p-4 border-t border-border">
                    <button id="template-cancel-btn" class="btn-secondary px-4 py-2 rounded text-sm">Cancel</button>
                    <button id="template-save-btn" class="btn-primary px-4 py-2 rounded text-sm">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = document.getElementById('template-name-input');
        const saveBtn = document.getElementById('template-save-btn');
        const cancelBtn = document.getElementById('template-cancel-btn');

        input.focus();
        input.select();

        const cleanup = () => modal.remove();

        saveBtn.addEventListener('click', () => {
            const name = input.value.trim();
            if (name) {
                cleanup();
                callback(name);
            }
        });

        cancelBtn.addEventListener('click', () => {
            cleanup();
            callback(null);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                e.preventDefault();
                cleanup();
                callback(input.value.trim());
            } else if (e.key === 'Escape') {
                cleanup();
                callback(null);
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                cleanup();
                callback(null);
            }
        });
    }

    // ---------------------------------------------------------------
    // Timeslot Editor Modal
    // ---------------------------------------------------------------

    const GAME_FREQUENCY = {
        '1800': { count: 17, pct: 0.1 },
        '1830': { count: 18, pct: 0.2 },
        '1900': { count: 65, pct: 0.6 },
        '1930': { count: 242, pct: 2.1 },
        '2000': { count: 632, pct: 5.5 },
        '2030': { count: 1386, pct: 12.1 },
        '2100': { count: 1912, pct: 16.7 },
        '2130': { count: 2297, pct: 20.1 },
        '2200': { count: 2029, pct: 17.7 },
        '2230': { count: 1629, pct: 14.2 },
        '2300': { count: 1207, pct: 10.6 }
    };

    function _showTimeslotsModal() {
        const allSlots = TimezoneService.DISPLAY_TIME_SLOTS;
        const hiddenSlots = new Set(TimezoneService.getHiddenTimeSlots());

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm';

        const visibleCount = allSlots.length - hiddenSlots.size;

        modal.innerHTML = `
            <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm">
                <div class="flex items-center justify-between p-4 border-b border-border">
                    <h3 class="text-lg font-semibold">Edit Timeslots</h3>
                    <span class="text-sm text-muted-foreground"><span id="timeslots-visible-count">${visibleCount}</span>/${allSlots.length} vis.</span>
                </div>
                <div class="p-4">
                    <p class="text-xs text-muted-foreground mb-3">Toggle timeslots to free up space. Minimum 4 must remain visible.</p>
                    <div class="space-y-0.5" id="timeslot-toggles">
                        ${allSlots.map(slot => {
                            const freq = GAME_FREQUENCY[slot] || { pct: 0 };
                            const isChecked = !hiddenSlots.has(slot);
                            const timeLabel = slot.slice(0, 2) + ':' + slot.slice(2);
                            const barWidth = Math.max(0.5, (freq.pct / 20.1) * 95);
                            return `
                                <label class="flex items-center gap-3 py-1.5 cursor-pointer">
                                    <input type="checkbox" class="sr-only slot-checkbox" data-slot="${slot}" ${isChecked ? 'checked' : ''}>
                                    <div class="slot-toggle"><div class="slot-toggle-knob"></div></div>
                                    <span class="text-sm font-mono w-12">${timeLabel}</span>
                                    <div class="flex-1 flex items-center gap-2">
                                        <div class="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
                                            <div class="h-full bg-primary/50 rounded-sm" style="width: ${barWidth}%"></div>
                                        </div>
                                        <span class="text-xs text-muted-foreground w-10 text-right">${freq.pct}%</span>
                                    </div>
                                </label>
                            `;
                        }).join('')}
                    </div>
                    <p class="text-xs text-muted-foreground mt-3">EU 4on4 game frequency (15k games)<br>Peak hours: 21:00-22:30</p>
                </div>
                <div class="flex justify-end gap-2 p-4 border-t border-border">
                    <button id="timeslots-cancel-btn" class="btn-secondary px-4 py-2 rounded text-sm">Cancel</button>
                    <button id="timeslots-save-btn" class="btn-primary px-4 py-2 rounded text-sm">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const countEl = modal.querySelector('#timeslots-visible-count');
        const checkboxes = modal.querySelectorAll('.slot-checkbox');

        function updateToggleStates() {
            const checked = modal.querySelectorAll('.slot-checkbox:checked');
            const checkedCount = checked.length;
            countEl.textContent = checkedCount;

            checkboxes.forEach(cb => {
                if (cb.checked && checkedCount <= 4) {
                    cb.disabled = true;
                    cb.parentElement.classList.add('opacity-50');
                    cb.parentElement.style.cursor = 'not-allowed';
                } else {
                    cb.disabled = false;
                    cb.parentElement.classList.remove('opacity-50');
                    cb.parentElement.style.cursor = 'pointer';
                }
            });
        }

        checkboxes.forEach(cb => {
            cb.addEventListener('change', updateToggleStates);
        });

        updateToggleStates();

        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            }
        };

        const closeModal = () => {
            document.removeEventListener('keydown', handleKeydown);
            modal.remove();
        };

        modal.querySelector('#timeslots-save-btn').addEventListener('click', async () => {
            const saveBtn = modal.querySelector('#timeslots-save-btn');
            const unchecked = [];
            checkboxes.forEach(cb => {
                if (!cb.checked) unchecked.push(cb.dataset.slot);
            });

            const applied = TimezoneService.setHiddenTimeSlots(unchecked);
            if (applied) {
                window.dispatchEvent(new CustomEvent('timeslots-changed', {
                    detail: { hiddenTimeSlots: unchecked }
                }));

                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                try {
                    await _persistHiddenTimeslots(unchecked);
                } catch (error) {
                    // Error already handled in _persistHiddenTimeslots
                }
            } else {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError('Minimum 4 timeslots must remain visible');
                }
            }
            closeModal();
        });

        modal.querySelector('#timeslots-cancel-btn').addEventListener('click', closeModal);
        document.addEventListener('keydown', handleKeydown);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    async function _persistHiddenTimeslots(hiddenSlots) {
        try {
            if (typeof AuthService !== 'undefined') {
                await AuthService.updateProfile({ hiddenTimeSlots: hiddenSlots });
            }
        } catch (error) {
            console.error('Failed to save timeslot preferences:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Failed to save timeslot preferences');
            }
        }
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    /**
     * Initialize the service
     */
    function init(options = {}) {
        if (_initialized) {
            window.removeEventListener('open-timeslots-modal', _showTimeslotsModal);
        }

        _getSelectedCells = options.getSelectedCells;
        _clearSelections = options.clearSelections;
        _onSyncStart = options.onSyncStart;
        _onSyncEnd = options.onSyncEnd;
        _clearAllCallback = options.clearAll;

        window.addEventListener('open-timeslots-modal', _showTimeslotsModal);

        _initialized = true;
        console.log('GridActionButtons service initialized');
    }

    /**
     * Called when selection changes (no-op in service mode)
     */
    function onSelectionChange() {
        // No UI to update in service mode
    }

    /**
     * Cleanup the service
     */
    function cleanup() {
        window.removeEventListener('open-timeslots-modal', _showTimeslotsModal);
        _initialized = false;
        _getSelectedCells = null;
        _clearSelections = null;
        _onSyncStart = null;
        _onSyncEnd = null;
        _clearAllCallback = null;
    }

    return {
        init,
        onSelectionChange,
        cleanup,
        // Operations for SelectionActionButton
        addMe: _handleAddMe,
        removeMe: _handleRemoveMe,
        clearAll: _handleClearAll,
        saveTemplate: _handleSaveTemplate
    };
})();
