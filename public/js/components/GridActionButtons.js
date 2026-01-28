// GridActionButtons.js - Floating Add Me / Remove Me buttons with Template support
// Following CLAUDE.md architecture: Revealing Module Pattern
// Enhanced for Slice 2.5: Display mode toggle (Initials/Avatars)

const GridActionButtons = (function() {
    'use strict';

    let _container = null;
    let _getSelectedCells = null; // Callback to get selected cells from grids
    let _clearSelections = null;  // Callback to clear selections after action
    let _onSyncStart = null;      // Callback when sync starts (for shimmer)
    let _onSyncEnd = null;        // Callback when sync ends
    let _clearAllCallback = null;  // Callback to clear all cells
    let _loadTemplateCallback = null; // Callback to load template to a week
    let _onDisplayModeChangeCallback = null; // Callback when display mode changes

    function _render() {
        if (!_container) return;

        const templates = typeof TemplateService !== 'undefined' ? TemplateService.getTemplates() : [];
        const canSaveMore = typeof TemplateService !== 'undefined' ? TemplateService.canSaveMore() : false;
        const hasSelection = _getSelectedCells ? _getSelectedCells().length > 0 : false;

        // Get current display mode
        const currentMode = typeof PlayerDisplayService !== 'undefined'
            ? PlayerDisplayService.getDisplayMode()
            : 'initials';
        const isInitials = currentMode === 'initials';

        // Slice 5.0b: Condensed 2-row layout with floating action button replacing Add/Remove
        _container.innerHTML = `
            <div class="grid-tools-compact flex flex-col gap-2 p-2 bg-card border border-border rounded-lg">
                <!-- Row 1: Display toggle + Clear All -->
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-muted-foreground">View:</span>
                        <div class="flex gap-0.5">
                            <button id="display-mode-initials"
                                    class="px-1.5 py-0.5 text-xs rounded ${isInitials ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}"
                                    title="Show initials">ABC</button>
                            <button id="display-mode-avatars"
                                    class="px-1.5 py-0.5 text-xs rounded ${!isInitials ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}"
                                    title="Show avatars">
                                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <button id="clear-all-btn"
                            class="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent">
                        Clear All
                    </button>
                </div>

                <!-- Row 2: Template dropdown + Load/Save -->
                <div class="flex items-center gap-2">
                    <select id="template-select" class="flex-1 px-2 py-1 text-xs bg-input border border-border rounded max-w-[8rem]">
                        <option value="">Load template...</option>
                        ${templates.map(t => `
                            <option value="${t.id}">${_escapeHtml(t.name)}</option>
                        `).join('')}
                    </select>
                    <button id="load-template-w1-btn"
                            class="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent disabled:opacity-50"
                            title="Load to Week 1" disabled>W1</button>
                    <button id="load-template-w2-btn"
                            class="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent disabled:opacity-50"
                            title="Load to Week 2" disabled>W2</button>
                    <button id="save-template-btn"
                            class="px-2 py-0.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            ${!hasSelection || !canSaveMore ? 'disabled' : ''}>
                        Save
                    </button>
                    ${templates.length > 0 ? `
                        <button id="template-menu-btn"
                                class="text-muted-foreground hover:text-foreground p-0.5"
                                title="Manage templates">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>

                <!-- Upcoming Matches Placeholder -->
                <div class="border-t border-border pt-2 mt-1">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-medium text-muted-foreground">Upcoming Matches</span>
                    </div>
                    <p class="text-xs text-muted-foreground italic">No scheduled matches</p>
                </div>
            </div>
        `;

        _attachListeners();
    }

    /**
     * Escape HTML to prevent XSS
     */
    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function _attachListeners() {
        // Slice 5.0b: Condensed layout - no Add/Remove/SelectAll buttons in panel
        const clearAllBtn = document.getElementById('clear-all-btn');
        const saveTemplateBtn = document.getElementById('save-template-btn');

        clearAllBtn?.addEventListener('click', _handleClearAll);
        saveTemplateBtn?.addEventListener('click', _handleSaveTemplate);

        // Display mode toggle (Slice 2.5)
        const initialsBtn = document.getElementById('display-mode-initials');
        const avatarsBtn = document.getElementById('display-mode-avatars');
        initialsBtn?.addEventListener('click', () => _setDisplayMode('initials'));
        avatarsBtn?.addEventListener('click', () => _setDisplayMode('avatars'));

        // Template dropdown and W1/W2 buttons (Slice 5.0b)
        const templateSelect = document.getElementById('template-select');
        const loadW1Btn = document.getElementById('load-template-w1-btn');
        const loadW2Btn = document.getElementById('load-template-w2-btn');
        const templateMenuBtn = document.getElementById('template-menu-btn');

        templateSelect?.addEventListener('change', () => {
            const hasTemplate = templateSelect.value !== '';
            if (loadW1Btn) loadW1Btn.disabled = !hasTemplate;
            if (loadW2Btn) loadW2Btn.disabled = !hasTemplate;
        });

        loadW1Btn?.addEventListener('click', () => _handleLoadTemplateFromSelect(0));
        loadW2Btn?.addEventListener('click', () => _handleLoadTemplateFromSelect(1));

        templateMenuBtn?.addEventListener('click', _handleTemplateMenuDropdown);
    }

    /**
     * Handle loading template from dropdown select
     * @param {number} weekIndex - 0 for Week 1, 1 for Week 2
     */
    function _handleLoadTemplateFromSelect(weekIndex) {
        const templateSelect = document.getElementById('template-select');
        const templateId = templateSelect?.value;
        if (!templateId) {
            ToastService.showError('Please select a template first');
            return;
        }

        const template = TemplateService.getTemplate(templateId);
        if (!template) {
            ToastService.showError('Template not found');
            return;
        }

        // Call the load callback with template slots and target week
        if (_loadTemplateCallback) {
            _loadTemplateCallback(template.slots, weekIndex);
            ToastService.showSuccess(`Loaded "${template.name}" to Week ${weekIndex + 1}`);
        }

        // Reset dropdown after loading
        if (templateSelect) {
            templateSelect.value = '';
            const loadW1Btn = document.getElementById('load-template-w1-btn');
            const loadW2Btn = document.getElementById('load-template-w2-btn');
            if (loadW1Btn) loadW1Btn.disabled = true;
            if (loadW2Btn) loadW2Btn.disabled = true;
        }
    }

    /**
     * Show template management menu (rename/delete options)
     */
    function _handleTemplateMenuDropdown(e) {
        const templates = typeof TemplateService !== 'undefined' ? TemplateService.getTemplates() : [];
        if (templates.length === 0) return;

        // Remove any existing context menu
        document.querySelector('.template-context-menu')?.remove();

        const rect = e.currentTarget.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'template-context-menu fixed bg-card border border-border rounded shadow-lg py-1 z-50';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left - 100}px`;

        // Build menu items for each template
        menu.innerHTML = templates.map(t => `
            <div class="template-menu-item px-3 py-1.5 text-xs hover:bg-accent cursor-default" data-template-id="${t.id}">
                <div class="flex items-center justify-between gap-3">
                    <span class="font-medium truncate max-w-[8rem]">${_escapeHtml(t.name)}</span>
                    <div class="flex gap-1">
                        <button class="template-rename-btn text-muted-foreground hover:text-foreground p-0.5" title="Rename">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="template-delete-btn text-muted-foreground hover:text-destructive p-0.5" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        document.body.appendChild(menu);

        // Ensure menu stays on screen
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - menuRect.width - 8}px`;
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = `${rect.top - menuRect.height - 4}px`;
        }

        // Handle rename/delete clicks
        menu.querySelectorAll('.template-rename-btn').forEach(btn => {
            btn.addEventListener('click', async (clickEvent) => {
                clickEvent.stopPropagation();
                const templateId = btn.closest('.template-menu-item').dataset.templateId;
                const template = TemplateService.getTemplate(templateId);
                if (!template) return;
                menu.remove();

                _showTemplateNameModal(async (newName) => {
                    if (!newName) return;
                    const result = await TemplateService.renameTemplate(templateId, newName);
                    if (result.success) {
                        ToastService.showSuccess('Template renamed');
                    } else {
                        ToastService.showError(result.error || 'Failed to rename');
                    }
                }, template.name);
            });
        });

        menu.querySelectorAll('.template-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (clickEvent) => {
                clickEvent.stopPropagation();
                const templateId = btn.closest('.template-menu-item').dataset.templateId;
                const template = TemplateService.getTemplate(templateId);
                if (!template) return;
                menu.remove();

                if (confirm(`Delete template "${template.name}"?`)) {
                    const result = await TemplateService.deleteTemplate(templateId);
                    if (result.success) {
                        ToastService.showSuccess('Template deleted');
                    } else {
                        ToastService.showError(result.error || 'Failed to delete');
                    }
                }
            });
        });

        // Close on click outside
        const closeMenu = (clickEvent) => {
            if (!menu.contains(clickEvent.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    /**
     * Set display mode and notify listeners
     * @param {'initials' | 'avatars'} mode
     */
    function _setDisplayMode(mode) {
        if (typeof PlayerDisplayService !== 'undefined') {
            PlayerDisplayService.setDisplayMode(mode);
        }
        _render(); // Re-render to update toggle state

        // Notify parent to refresh grid display
        if (_onDisplayModeChangeCallback) {
            _onDisplayModeChangeCallback(mode);
        }
    }

    function _handleClearAll() {
        if (_clearAllCallback) {
            _clearAllCallback();
        }
    }

    async function _handleSaveTemplate() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) {
            ToastService.showError('Select at least one slot to save as template');
            return;
        }

        // Get unique slot IDs (template stores pattern, not week-specific)
        const slots = selectedCells.map(cell => cell.slotId);
        const uniqueSlots = [...new Set(slots)];

        // Show name input modal
        _showTemplateNameModal(async (name) => {
            if (!name) return;

            const saveBtn = document.getElementById('save-template-btn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
            }

            const result = await TemplateService.saveTemplate(name, uniqueSlots);

            if (result.success) {
                ToastService.showSuccess(`Template "${name}" saved!`);
                // Re-render will happen via templates-updated event
            } else {
                ToastService.showError(result.error || 'Failed to save template');
                // Re-enable button on error
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Template';
                }
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

        const cleanup = () => {
            modal.remove();
        };

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

        // Enter to save, Escape to cancel
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

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                cleanup();
                callback(null);
            }
        });
    }

    async function _handleAddMe() {
        // Pre-validation: check team selection before anything else
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            ToastService.showError('Please select a team first');
            return;
        }

        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        // Notify sync start (triggers shimmer on cells)
        if (_onSyncStart) _onSyncStart(selectedCells);

        try {
            // Group cells by week
            const cellsByWeek = _groupCellsByWeek(selectedCells);

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
            if (_onSyncEnd) _onSyncEnd();
            _updateButtonStates();
        }
    }

    async function _handleRemoveMe() {
        // Pre-validation: check team selection before anything else
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            ToastService.showError('Please select a team first');
            return;
        }

        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        // Notify sync start (triggers shimmer on cells)
        if (_onSyncStart) _onSyncStart(selectedCells);

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

            ToastService.showSuccess('Removed from selected slots!');

        } catch (error) {
            console.error('Remove me failed:', error);
            ToastService.showError(error.message || 'Failed to remove availability');
        } finally {
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
     * Slice 5.0b: Only save template button remains in panel
     */
    function _updateButtonStates() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        const hasSelection = selectedCells.length > 0;

        // Update save template button
        const saveTemplateBtn = document.getElementById('save-template-btn');
        if (saveTemplateBtn) {
            const canSaveMore = typeof TemplateService !== 'undefined' ? TemplateService.canSaveMore() : false;
            saveTemplateBtn.disabled = !hasSelection || !canSaveMore;
        }
    }

    /**
     * Initialize the component
     * @param {string} containerId - The ID of the container element
     * @param {Object} options - Configuration options
     * @param {Function} options.getSelectedCells - Returns array of { weekId, slotId }
     * @param {Function} options.clearSelections - Clears all grid selections
     * @param {Function} options.onSyncStart - Called when sync starts with cell list
     * @param {Function} options.onSyncEnd - Called when sync completes
     * @param {Function} options.clearAll - Clears all cells in both grids
     * @param {Function} options.loadTemplate - Loads template to specified week
     * @param {Function} options.onDisplayModeChange - Called when display mode changes (Slice 2.5)
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
        _clearAllCallback = options.clearAll;
        _loadTemplateCallback = options.loadTemplate;
        _onDisplayModeChangeCallback = options.onDisplayModeChange;

        // Listen for template updates to re-render
        window.addEventListener('templates-updated', _render);

        // Listen for display mode changes from elsewhere (e.g., keyboard shortcut)
        window.addEventListener('display-mode-changed', _render);

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
        window.removeEventListener('templates-updated', _render);
        window.removeEventListener('display-mode-changed', _render);
        if (_container) _container.innerHTML = '';
        _container = null;
        _getSelectedCells = null;
        _clearSelections = null;
        _onSyncStart = null;
        _onSyncEnd = null;
        _clearAllCallback = null;
        _loadTemplateCallback = null;
        _onDisplayModeChangeCallback = null;
    }

    return {
        init,
        onSelectionChange,
        cleanup,
        // Slice 5.0b: Expose methods for SelectionActionButton
        addMe: _handleAddMe,
        removeMe: _handleRemoveMe,
        clearAll: _handleClearAll
    };
})();
