// GridActionButtons.js - Floating Add Me / Remove Me buttons with Template support
// Following CLAUDE.md architecture: Revealing Module Pattern

const GridActionButtons = (function() {
    'use strict';

    let _container = null;
    let _getSelectedCells = null; // Callback to get selected cells from grids
    let _clearSelections = null;  // Callback to clear selections after action
    let _onSyncStart = null;      // Callback when sync starts (for shimmer)
    let _onSyncEnd = null;        // Callback when sync ends
    let _selectAllCallback = null; // Callback to select all cells
    let _clearAllCallback = null;  // Callback to clear all cells
    let _loadTemplateCallback = null; // Callback to load template to a week

    function _render() {
        if (!_container) return;

        const templates = typeof TemplateService !== 'undefined' ? TemplateService.getTemplates() : [];
        const canSaveMore = typeof TemplateService !== 'undefined' ? TemplateService.canSaveMore() : false;
        const hasSelection = _getSelectedCells ? _getSelectedCells().length > 0 : false;

        _container.innerHTML = `
            <div class="grid-action-buttons flex flex-col gap-3 p-3 bg-card border border-border rounded-lg shadow-md">
                <!-- Action Buttons Row -->
                <div class="flex flex-wrap gap-2">
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
                    <div class="border-l border-border mx-1"></div>
                    <button id="select-all-btn"
                            class="btn-secondary px-3 py-2 rounded text-sm font-medium">
                        Select All
                    </button>
                    <button id="clear-all-btn"
                            class="btn-secondary px-3 py-2 rounded text-sm font-medium">
                        Clear All
                    </button>
                </div>

                <!-- Template Section -->
                <div class="border-t border-border pt-3">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-muted-foreground">Templates</span>
                        <button id="save-template-btn"
                                class="btn-secondary px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                ${!hasSelection || !canSaveMore ? 'disabled' : ''}>
                            ${canSaveMore ? 'Save Template' : 'Max 3 Templates'}
                        </button>
                    </div>

                    ${templates.length > 0 ? `
                        <div class="space-y-2">
                            ${templates.map(template => `
                                <div class="template-item flex items-center gap-2 p-2 bg-muted rounded" data-template-id="${template.id}">
                                    <span class="flex-1 text-sm truncate" title="${_escapeHtml(template.name)}">${_escapeHtml(template.name)}</span>
                                    <button class="load-template-btn btn-primary px-2 py-1 rounded text-xs"
                                            data-template-id="${template.id}"
                                            data-week="1"
                                            title="Load to Week 1">
                                        W1
                                    </button>
                                    <button class="load-template-btn btn-primary px-2 py-1 rounded text-xs"
                                            data-template-id="${template.id}"
                                            data-week="2"
                                            title="Load to Week 2">
                                        W2
                                    </button>
                                    <button class="template-menu-btn text-muted-foreground hover:text-foreground p-1"
                                            data-template-id="${template.id}"
                                            title="Template options">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                                        </svg>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <p class="text-xs text-muted-foreground italic">
                            No templates saved. Select slots and click "Save Template".
                        </p>
                    `}
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
        const addBtn = document.getElementById('add-me-btn');
        const removeBtn = document.getElementById('remove-me-btn');
        const selectAllBtn = document.getElementById('select-all-btn');
        const clearAllBtn = document.getElementById('clear-all-btn');
        const saveTemplateBtn = document.getElementById('save-template-btn');

        addBtn?.addEventListener('click', _handleAddMe);
        removeBtn?.addEventListener('click', _handleRemoveMe);
        selectAllBtn?.addEventListener('click', _handleSelectAll);
        clearAllBtn?.addEventListener('click', _handleClearAll);
        saveTemplateBtn?.addEventListener('click', _handleSaveTemplate);

        // Load template buttons
        document.querySelectorAll('.load-template-btn').forEach(btn => {
            btn.addEventListener('click', _handleLoadTemplate);
        });

        // Template menu buttons
        document.querySelectorAll('.template-menu-btn').forEach(btn => {
            btn.addEventListener('click', _handleTemplateMenu);
        });
    }

    function _handleSelectAll() {
        if (_selectAllCallback) {
            _selectAllCallback();
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

    function _handleLoadTemplate(e) {
        const templateId = e.target.dataset.templateId;
        const weekIndex = parseInt(e.target.dataset.week, 10) - 1; // 0-indexed

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
    }

    function _handleTemplateMenu(e) {
        const templateId = e.currentTarget.dataset.templateId;
        const template = TemplateService.getTemplate(templateId);
        if (!template) return;

        // Show context menu with Rename/Delete options
        _showTemplateContextMenu(e.currentTarget, templateId, template.name);
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

    function _showTemplateContextMenu(anchor, templateId, templateName) {
        // Remove any existing context menu
        document.querySelector('.template-context-menu')?.remove();

        const rect = anchor.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'template-context-menu fixed bg-card border border-border rounded shadow-lg py-1 z-50';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left - 60}px`; // Offset left to not overlap button
        menu.innerHTML = `
            <button class="block w-full px-4 py-2 text-sm text-left hover:bg-accent" data-action="rename">
                Rename
            </button>
            <button class="block w-full px-4 py-2 text-sm text-left hover:bg-accent text-destructive" data-action="delete">
                Delete
            </button>
        `;

        document.body.appendChild(menu);

        // Ensure menu stays on screen
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - menuRect.width - 8}px`;
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = `${rect.top - menuRect.height - 4}px`;
        }

        const handleAction = async (e) => {
            const action = e.target.dataset.action;
            if (!action) return;

            menu.remove();

            if (action === 'rename') {
                _showTemplateNameModal(async (newName) => {
                    if (!newName) return;
                    const result = await TemplateService.renameTemplate(templateId, newName);
                    if (result.success) {
                        ToastService.showSuccess('Template renamed');
                        // Re-render will happen via templates-updated event
                    } else {
                        ToastService.showError(result.error || 'Failed to rename');
                    }
                }, templateName);
            } else if (action === 'delete') {
                if (confirm(`Delete template "${templateName}"?`)) {
                    const result = await TemplateService.deleteTemplate(templateId);
                    if (result.success) {
                        ToastService.showSuccess('Template deleted');
                        // Re-render will happen via templates-updated event
                    } else {
                        ToastService.showError(result.error || 'Failed to delete');
                    }
                }
            }
        };

        menu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', handleAction);
        });

        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
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
        // Pre-validation: check team selection before anything else
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            ToastService.showError('Please select a team first');
            return;
        }

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
        const saveTemplateBtn = document.getElementById('save-template-btn');

        if (addBtn) addBtn.disabled = !hasSelection;
        if (removeBtn) removeBtn.disabled = !hasSelection;

        // Update save template button
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
     * @param {Function} options.selectAll - Selects all cells in both grids
     * @param {Function} options.clearAll - Clears all cells in both grids
     * @param {Function} options.loadTemplate - Loads template to specified week
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
        _selectAllCallback = options.selectAll;
        _clearAllCallback = options.clearAll;
        _loadTemplateCallback = options.loadTemplate;

        // Listen for template updates to re-render
        window.addEventListener('templates-updated', _render);

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
        if (_container) _container.innerHTML = '';
        _container = null;
        _getSelectedCells = null;
        _clearSelections = null;
        _onSyncStart = null;
        _onSyncEnd = null;
        _selectAllCallback = null;
        _clearAllCallback = null;
        _loadTemplateCallback = null;
    }

    return {
        init,
        onSelectionChange,
        cleanup
    };
})();
