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

    async function _handleAddOther(targetUserId) {
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
                const result = await AvailabilityService.addPlayerToSlots(
                    teamId, weekId, slotIds, targetUserId
                );
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            // Don't clear selections — leader may want to add same slots for more members

        } catch (error) {
            console.error('Add other failed:', error);
            ToastService.showError(error.message || 'Failed to add availability for player');
        } finally {
            if (_onSyncEnd) _onSyncEnd();
        }
    }

    async function _handleRemoveOther(targetUserId) {
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
                const result = await AvailabilityService.removePlayerFromSlots(
                    teamId, weekId, slotIds, targetUserId
                );
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            // Don't clear selections — leader may want to remove same slots for more members

        } catch (error) {
            console.error('Remove other failed:', error);
            ToastService.showError(error.message || 'Failed to remove availability for player');
        } finally {
            if (_onSyncEnd) _onSyncEnd();
        }
    }

    // ---------------------------------------------------------------
    // Unavailability operations (Slice 15.0)
    // ---------------------------------------------------------------

    async function _handleMarkMeUnavailable() {
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
                const result = await AvailabilityService.markUnavailable(teamId, weekId, slotIds);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            if (_clearSelections) _clearSelections();

        } catch (error) {
            console.error('Mark unavailable failed:', error);
            ToastService.showError(error.message || 'Failed to mark unavailable');
        } finally {
            if (_onSyncEnd) _onSyncEnd();
        }
    }

    async function _handleUnmarkMeUnavailable() {
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
                const result = await AvailabilityService.removeUnavailable(teamId, weekId, slotIds);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            if (_clearSelections) _clearSelections();

        } catch (error) {
            console.error('Unmark unavailable failed:', error);
            ToastService.showError(error.message || 'Failed to remove unavailable');
        } finally {
            if (_onSyncEnd) _onSyncEnd();
        }
    }

    async function _handleMarkOtherUnavailable(targetUserId) {
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
                const result = await AvailabilityService.markPlayerUnavailable(
                    teamId, weekId, slotIds, targetUserId
                );
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            // Don't clear selections — leader may want to mark same slots for more members

        } catch (error) {
            console.error('Mark other unavailable failed:', error);
            ToastService.showError(error.message || 'Failed to mark player unavailable');
        } finally {
            if (_onSyncEnd) _onSyncEnd();
        }
    }

    async function _handleUnmarkOtherUnavailable(targetUserId) {
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
                const result = await AvailabilityService.removePlayerUnavailable(
                    teamId, weekId, slotIds, targetUserId
                );
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            // Don't clear selections — leader may want to unmark same slots for more members

        } catch (error) {
            console.error('Unmark other unavailable failed:', error);
            ToastService.showError(error.message || 'Failed to remove player unavailable');
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
    // Extra Timeslot Helpers (Slice 14.0c)
    // ---------------------------------------------------------------

    // Get next half-hour slot (e.g., '1230' → '1300', '2330' → '0000')
    function _nextHalfHour(slot) {
        let mins = parseInt(slot.slice(0, 2)) * 60 + parseInt(slot.slice(2));
        mins += 30;
        if (mins >= 1440) mins -= 1440;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return String(h).padStart(2, '0') + String(m).padStart(2, '0');
    }

    // Group individual HHMM slots into contiguous ranges
    // e.g., ['1200','1230','1300'] → [{ from: '1200', to: '1300' }]
    function _groupSlotsIntoRanges(slots) {
        if (!slots || slots.length === 0) return [];

        const sorted = [...slots].sort((a, b) => parseInt(a) - parseInt(b));
        const ranges = [];
        let rangeStart = sorted[0];
        let prev = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            const expected = _nextHalfHour(prev);
            if (sorted[i] === expected) {
                prev = sorted[i];
            } else {
                ranges.push({ from: rangeStart, to: prev });
                rangeStart = sorted[i];
                prev = sorted[i];
            }
        }
        ranges.push({ from: rangeStart, to: prev });
        return ranges;
    }

    // Expand a from/to range into individual HHMM slots
    // e.g., ('1200', '1330') → ['1200', '1230', '1300', '1330']
    function _expandRange(from, to) {
        const slots = [];
        let current = from;
        for (let i = 0; i < 48; i++) {
            slots.push(current);
            if (current === to) break;
            current = _nextHalfHour(current);
        }
        return slots;
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

    // Format CET time from HHMM string (e.g., '1200' → '12:00')
    function _formatCet(slot) {
        return slot.slice(0, 2) + ':' + slot.slice(2);
    }

    // Pending extra slots for the modal session (null = unchanged, array = modified)
    let _pendingExtraSlots = null;

    function _buildExtraTimeslotsSection() {
        const currentExtras = _pendingExtraSlots !== null
            ? _pendingExtraSlots
            : TimezoneService.getExtraTimeSlots();
        const refDate = new Date();

        // Build dropdown options — all 48 half-hour slots minus base range
        const baseSet = new Set(TimezoneService.DISPLAY_TIME_SLOTS);
        const allSlots = TimezoneService.getAllHalfHourSlots();
        const availableSlots = allSlots.filter(s => !baseSet.has(s));

        const optionsHtml = availableSlots.map(slot => {
            const localDisplay = TimezoneService.baseToLocalDisplay(slot, refDate);
            const cetDisplay = _formatCet(slot);
            return `<option value="${slot}">${localDisplay} (${cetDisplay} CET)</option>`;
        }).join('');

        const rangesHtml = _buildRangesListHtml(currentExtras);

        return `
            <div class="mt-3 border-t border-border pt-3">
                <button id="extra-timeslots-toggle" class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full text-left">
                    <span class="extra-toggle-arrow">\u25B8</span>
                    <span>Add extra timeslots</span>
                </button>
                <div id="extra-timeslots-panel" class="hidden mt-2">
                    <p class="text-xs text-muted-foreground mb-2">
                        Add slots outside the standard evening window.<br>
                        Only you see these — other players are not affected.
                    </p>
                    <div class="flex items-center gap-2 mb-2">
                        <label class="text-xs text-muted-foreground">From</label>
                        <select id="extra-from" class="bg-input border border-border rounded text-sm px-2 py-1 flex-1">
                            ${optionsHtml}
                        </select>
                        <label class="text-xs text-muted-foreground">To</label>
                        <select id="extra-to" class="bg-input border border-border rounded text-sm px-2 py-1 flex-1">
                            ${optionsHtml}
                        </select>
                        <button id="extra-add-btn" class="btn-primary px-2 py-1 rounded text-xs">Add</button>
                    </div>
                    <div id="extra-ranges-list" class="mb-1">
                        ${rangesHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function _buildRangesListHtml(extras) {
        const ranges = _groupSlotsIntoRanges(extras);
        const refDate = new Date();

        if (ranges.length === 0) {
            return '<p class="text-xs text-muted-foreground">None added</p>';
        }

        return ranges.map(range => {
            const fromLocal = TimezoneService.baseToLocalDisplay(range.from, refDate);
            const toLocal = TimezoneService.baseToLocalDisplay(range.to, refDate);
            const fromCet = _formatCet(range.from);
            const toCet = _formatCet(range.to);
            return `
                <div class="flex items-center justify-between py-1">
                    <span class="text-sm">${fromLocal} – ${toLocal} <span class="text-muted-foreground text-xs">(${fromCet}–${toCet} CET)</span></span>
                    <button class="extra-range-remove text-muted-foreground hover:text-destructive text-xs px-1"
                            data-from="${range.from}" data-to="${range.to}">&times;</button>
                </div>
            `;
        }).join('');
    }

    function _refreshExtraRangesList(modal) {
        const listEl = modal.querySelector('#extra-ranges-list');
        if (!listEl) return;
        const extras = _pendingExtraSlots !== null
            ? _pendingExtraSlots
            : TimezoneService.getExtraTimeSlots();
        listEl.innerHTML = _buildRangesListHtml(extras);
    }

    function _showTimeslotsModal() {
        // Reset pending extras — null means "unchanged from current state"
        _pendingExtraSlots = null;

        const allSlots = TimezoneService.DISPLAY_TIME_SLOTS;
        const hiddenSlots = new Set(TimezoneService.getHiddenTimeSlots());
        const currentExtras = TimezoneService.getExtraTimeSlots();

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm';

        const visibleCount = allSlots.length - hiddenSlots.size + currentExtras.length;

        modal.innerHTML = `
            <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
                    <h3 class="text-lg font-semibold">Edit Timeslots</h3>
                    <span class="text-sm text-muted-foreground"><span id="timeslots-visible-count">${visibleCount}</span> visible</span>
                </div>
                <div class="p-4 overflow-y-auto flex-1 min-h-0">
                    <p class="text-xs text-muted-foreground mb-3">Toggle timeslots to free up space. Minimum 4 must remain visible.</p>
                    <div class="space-y-0.5" id="timeslot-toggles">
                        ${allSlots.map(slot => {
                            const freq = GAME_FREQUENCY[slot] || { pct: 0 };
                            const isChecked = !hiddenSlots.has(slot);
                            const timeLabel = typeof TimezoneService !== 'undefined' && TimezoneService.baseToLocalDisplay
                                ? TimezoneService.baseToLocalDisplay(slot)
                                : slot.slice(0, 2) + ':' + slot.slice(2);
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
                    ${_buildExtraTimeslotsSection()}
                </div>
                <div class="flex justify-end gap-2 p-4 border-t border-border flex-shrink-0">
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
            const extraCount = _pendingExtraSlots !== null
                ? _pendingExtraSlots.length
                : TimezoneService.getExtraTimeSlots().length;
            countEl.textContent = checkedCount + extraCount;

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

        // Extra timeslots: toggle expand/collapse
        modal.querySelector('#extra-timeslots-toggle')?.addEventListener('click', () => {
            const panel = modal.querySelector('#extra-timeslots-panel');
            const arrow = modal.querySelector('.extra-toggle-arrow');
            if (panel) {
                panel.classList.toggle('hidden');
                if (arrow) arrow.textContent = panel.classList.contains('hidden') ? '\u25B8' : '\u25BE';
            }
        });

        // Extra timeslots: add range
        modal.querySelector('#extra-add-btn')?.addEventListener('click', () => {
            const from = modal.querySelector('#extra-from').value;
            const to = modal.querySelector('#extra-to').value;

            if (parseInt(from) > parseInt(to)) {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError('"From" time must be before "To" time');
                }
                return;
            }

            const newSlots = _expandRange(from, to);
            const currentExtras = _pendingExtraSlots !== null
                ? _pendingExtraSlots
                : TimezoneService.getExtraTimeSlots();
            _pendingExtraSlots = [...new Set([...currentExtras, ...newSlots])];
            _refreshExtraRangesList(modal);
            updateToggleStates();
        });

        // Extra timeslots: remove range (delegated)
        modal.querySelector('#extra-ranges-list')?.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.extra-range-remove');
            if (!removeBtn) return;

            const from = removeBtn.dataset.from;
            const to = removeBtn.dataset.to;
            const rangeSlots = new Set(_expandRange(from, to));
            const currentExtras = _pendingExtraSlots !== null
                ? _pendingExtraSlots
                : TimezoneService.getExtraTimeSlots();
            _pendingExtraSlots = currentExtras.filter(s => !rangeSlots.has(s));
            _refreshExtraRangesList(modal);
            updateToggleStates();
        });

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
            if (!applied) {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError('Minimum 4 timeslots must remain visible');
                }
                return;
            }

            // Apply extra slots (if modified in this session)
            const extraSlots = _pendingExtraSlots !== null
                ? _pendingExtraSlots
                : TimezoneService.getExtraTimeSlots();
            TimezoneService.setExtraTimeSlots(extraSlots);

            // Dispatch change event for grid rebuild
            window.dispatchEvent(new CustomEvent('timeslots-changed', {
                detail: { hiddenTimeSlots: unchecked, extraTimeSlots: extraSlots }
            }));

            // Persist to Firestore
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            try {
                await _persistTimeslotPreferences(unchecked, extraSlots);
            } catch (error) {
                // Error handled inside persist function
            }
            closeModal();
        });

        modal.querySelector('#timeslots-cancel-btn').addEventListener('click', closeModal);
        document.addEventListener('keydown', handleKeydown);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    async function _persistTimeslotPreferences(hiddenSlots, extraSlots) {
        try {
            if (typeof AuthService !== 'undefined') {
                await AuthService.updateProfile({
                    hiddenTimeSlots: hiddenSlots,
                    extraTimeSlots: extraSlots
                });
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
        addOther: _handleAddOther,
        removeMe: _handleRemoveMe,
        removeOther: _handleRemoveOther,
        // Unavailability operations (Slice 15.0)
        markMeUnavailable: _handleMarkMeUnavailable,
        unmarkMeUnavailable: _handleUnmarkMeUnavailable,
        markOtherUnavailable: _handleMarkOtherUnavailable,
        unmarkOtherUnavailable: _handleUnmarkOtherUnavailable,
        clearAll: _handleClearAll,
        saveTemplate: _handleSaveTemplate
    };
})();
