// GridActionButtons.js - Floating Add Me / Remove Me buttons with Template support
// Following CLAUDE.md architecture: Revealing Module Pattern
// Enhanced for Slice 2.5: Display mode toggle (Initials/Avatars)
// Enhanced for Slice 5.0.1: 4-mode display toggle (initials, coloredInitials, coloredDots, avatars)

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

        // Display mode buttons are now inline in the TeamInfo drawer header.
        // This component only renders templates section.
        _container.innerHTML = `
            <div class="grid-tools-content-inner py-2">
                <!-- Templates section -->
                <div class="space-y-1.5">
                    ${templates.map(t => `
                        <div class="template-row group flex items-center gap-1.5 py-0.5 rounded hover:bg-muted/50" data-template-id="${t.id}">
                            <span class="template-name flex-1 text-sm text-foreground truncate cursor-default">${_escapeHtml(t.name)}</span>
                            <input type="text" class="template-name-input hidden flex-1 px-1 py-0.5 text-sm bg-input border border-primary rounded"
                                   value="${_escapeHtml(t.name)}" maxlength="${TemplateService.MAX_NAME_LENGTH}">
                            <button class="template-edit opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5 transition-opacity"
                                    title="Rename">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="template-delete opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 transition-opacity"
                                    title="Delete">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                            <button class="template-load-w1 px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent"
                                    title="Load to Week 1">W1</button>
                            <button class="template-load-w2 px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent"
                                    title="Load to Week 2">W2</button>
                        </div>
                    `).join('')}

                    <!-- Save Template + Clear All row -->
                    <div class="flex items-center justify-between pt-1 gap-2">
                        ${canSaveMore ? `
                            <button id="save-template-btn"
                                    class="flex-1 px-2 py-1 text-xs rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
                                    ${!hasSelection ? 'disabled' : ''}>
                                + Save Template
                            </button>
                        ` : '<div class="flex-1"></div>'}
                        <button id="clear-all-btn"
                                class="px-2 py-1 text-xs rounded bg-muted text-muted-foreground hover:bg-accent">
                            Clear All
                        </button>
                    </div>
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
        // Clear All and Save Template buttons
        const clearAllBtn = document.getElementById('clear-all-btn');
        const saveTemplateBtn = document.getElementById('save-template-btn');

        clearAllBtn?.addEventListener('click', _handleClearAll);
        saveTemplateBtn?.addEventListener('click', _handleSaveTemplate);

        // Display mode toggle (Slice 5.0.1: 4 modes)
        document.querySelectorAll('.display-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode) _setDisplayMode(mode);
            });
        });

        // Template row listeners (Slice 5.1 - per-row buttons)
        document.querySelectorAll('.template-row').forEach(row => {
            const templateId = row.dataset.templateId;

            // W1/W2 load buttons
            row.querySelector('.template-load-w1')?.addEventListener('click', () => {
                _handleLoadTemplate(templateId, 0);
            });
            row.querySelector('.template-load-w2')?.addEventListener('click', () => {
                _handleLoadTemplate(templateId, 1);
            });

            // Edit button - start inline editing
            row.querySelector('.template-edit')?.addEventListener('click', () => {
                _startInlineEdit(row);
            });

            // Delete button
            row.querySelector('.template-delete')?.addEventListener('click', () => {
                _handleDeleteTemplate(templateId);
            });

            // Inline edit input handlers
            const input = row.querySelector('.template-name-input');
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    _finishInlineEdit(row, templateId, true);
                } else if (e.key === 'Escape') {
                    _finishInlineEdit(row, templateId, false);
                }
            });
            input?.addEventListener('blur', () => {
                _finishInlineEdit(row, templateId, true);
            });
        });
    }

    /**
     * Handle loading a template to a week
     * @param {string} templateId - The template ID
     * @param {number} weekIndex - 0 for Week 1, 1 for Week 2
     */
    function _handleLoadTemplate(templateId, weekIndex) {
        const template = TemplateService.getTemplate(templateId);
        if (!template) {
            ToastService.showError('Template not found');
            return;
        }

        if (_loadTemplateCallback) {
            _loadTemplateCallback(template.slots, weekIndex);
            ToastService.showSuccess(`Loaded "${template.name}" to Week ${weekIndex + 1}`);
        }
    }

    /**
     * Start inline editing of template name
     */
    function _startInlineEdit(row) {
        const nameSpan = row.querySelector('.template-name');
        const input = row.querySelector('.template-name-input');
        if (!nameSpan || !input) return;

        nameSpan.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
        input.select();
    }

    /**
     * Finish inline editing of template name
     */
    async function _finishInlineEdit(row, templateId, save) {
        const nameSpan = row.querySelector('.template-name');
        const input = row.querySelector('.template-name-input');
        if (!nameSpan || !input) return;

        // Already hidden means edit already finished
        if (input.classList.contains('hidden')) return;

        const newName = input.value.trim();
        const template = TemplateService.getTemplate(templateId);

        if (save && newName && template && newName !== template.name) {
            const result = await TemplateService.renameTemplate(templateId, newName);
            if (result.success) {
                nameSpan.textContent = newName;
                ToastService.showSuccess('Template renamed');
            } else {
                ToastService.showError(result.error || 'Failed to rename');
                input.value = template.name; // Reset to original
            }
        } else if (template) {
            input.value = template.name; // Reset to original
        }

        nameSpan.classList.remove('hidden');
        input.classList.add('hidden');
    }

    /**
     * Handle deleting a template
     */
    async function _handleDeleteTemplate(templateId) {
        const template = TemplateService.getTemplate(templateId);
        if (!template) return;

        if (confirm(`Delete template "${template.name}"?`)) {
            const result = await TemplateService.deleteTemplate(templateId);
            if (result.success) {
                ToastService.showSuccess('Template deleted');
                // Re-render will happen via templates-updated event
            } else {
                ToastService.showError(result.error || 'Failed to delete');
            }
        }
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
        const newContainer = document.getElementById(containerId);
        if (!newContainer) {
            console.error(`GridActionButtons: Container #${containerId} not found`);
            return;
        }

        // Slice 6.0b: Handle re-initialization (e.g., when TeamInfo re-renders drawer)
        // Remove old event listeners if already initialized
        if (_container) {
            window.removeEventListener('templates-updated', _render);
            window.removeEventListener('display-mode-changed', _render);
        }

        _container = newContainer;
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
        clearAll: _handleClearAll,
        saveTemplate: _handleSaveTemplate
    };
})();
