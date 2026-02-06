// TemplatesModal.js - Modal for managing availability templates
const TemplatesModal = (function() {
    'use strict';

    let _modal = null;
    let _onLoadTemplate = null;
    let _onClearAll = null;
    let _getSelectedCells = null;
    let _escHandler = null;

    function init(options = {}) {
        _onLoadTemplate = options.onLoadTemplate;
        _onClearAll = options.onClearAll;
        _getSelectedCells = options.getSelectedCells;

        // Listen for template updates
        window.addEventListener('templates-updated', _render);
    }

    function show() {
        _createModal();
        _render();

        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.classList.remove('hidden');
        }
        _modal.classList.remove('hidden');
        document.body.classList.add('modal-open');

        // ESC key handler
        _escHandler = (e) => {
            if (e.key === 'Escape') hide();
        };
        document.addEventListener('keydown', _escHandler);
    }

    function hide() {
        if (_modal) {
            _modal.classList.add('hidden');
        }

        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.classList.add('hidden');
        }
        document.body.classList.remove('modal-open');

        // Remove ESC handler
        if (_escHandler) {
            document.removeEventListener('keydown', _escHandler);
            _escHandler = null;
        }
    }

    function _createModal() {
        if (_modal) return;

        _modal = document.createElement('div');
        _modal.id = 'templates-modal';
        _modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm';
        _modal.innerHTML = `
            <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
                <div class="p-4 border-b border-border flex items-center justify-between">
                    <h2 class="text-lg font-semibold">Availability Templates</h2>
                    <button class="modal-close text-muted-foreground hover:text-foreground text-xl leading-none" aria-label="Close">&times;</button>
                </div>
                <div class="templates-modal-body p-4">
                    <!-- Content rendered by _render() -->
                </div>
            </div>
        `;

        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.appendChild(_modal);
        } else {
            document.body.appendChild(_modal);
        }

        // Close handlers
        _modal.querySelector('.modal-close')?.addEventListener('click', hide);
        _modal.addEventListener('click', (e) => {
            if (e.target === _modal) hide();
        });
    }

    function _render() {
        const body = _modal?.querySelector('.templates-modal-body');
        if (!body) return;

        const templates = typeof TemplateService !== 'undefined'
            ? TemplateService.getTemplates()
            : [];
        const canSaveMore = typeof TemplateService !== 'undefined'
            ? TemplateService.canSaveMore()
            : false;
        const hasSelection = _getSelectedCells ? _getSelectedCells().length > 0 : false;

        const templatesHtml = templates.length > 0
            ? templates.map(t => _renderTemplateRow(t)).join('')
            : '<p class="text-sm text-muted-foreground text-center py-4">No templates saved yet</p>';

        const saveButtonHtml = canSaveMore
            ? `<button id="templates-save-btn"
                       class="w-full px-3 py-2 text-sm rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                       ${!hasSelection ? 'disabled' : ''}>
                   + Save Current Selection as Template
               </button>`
            : '<p class="text-xs text-muted-foreground text-center">Maximum 3 templates reached</p>';

        body.innerHTML = `
            <div class="space-y-3">
                <div class="space-y-2">
                    ${templatesHtml}
                </div>

                <div class="pt-2">
                    ${saveButtonHtml}
                </div>

                <div class="border-t border-border pt-3">
                    <button id="templates-clear-all-btn"
                            class="w-full px-3 py-2 text-sm rounded bg-destructive/10 text-destructive hover:bg-destructive/20">
                        Clear All Availability
                    </button>
                </div>
            </div>
        `;

        _attachEventListeners();
    }

    function _renderTemplateRow(template) {
        return `
            <div class="template-row group flex items-center gap-2 p-2 rounded bg-muted/50 hover:bg-muted"
                 data-template-id="${template.id}">
                <span class="template-name flex-1 text-sm font-medium truncate">${_escapeHtml(template.name)}</span>
                <div class="flex items-center gap-1">
                    <button class="template-load-w1 px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20"
                            title="Load to Week 1">W1</button>
                    <button class="template-load-w2 px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20"
                            title="Load to Week 2">W2</button>
                    <button class="template-rename p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                            title="Rename">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                    </button>
                    <button class="template-delete p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                            title="Delete">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    function _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function _attachEventListeners() {
        const body = _modal?.querySelector('.templates-modal-body');
        if (!body) return;

        // Save button
        const saveBtn = body.querySelector('#templates-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', _handleSaveTemplate);
        }

        // Clear all button
        const clearAllBtn = body.querySelector('#templates-clear-all-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', _handleClearAll);
        }

        // Template row actions
        const templateRows = body.querySelectorAll('.template-row');
        templateRows.forEach(row => {
            const templateId = row.dataset.templateId;

            row.querySelector('.template-load-w1')?.addEventListener('click', () => {
                _handleLoadTemplate(templateId, 0);
            });

            row.querySelector('.template-load-w2')?.addEventListener('click', () => {
                _handleLoadTemplate(templateId, 1);
            });

            row.querySelector('.template-rename')?.addEventListener('click', () => {
                _handleRenameTemplate(templateId, row);
            });

            row.querySelector('.template-delete')?.addEventListener('click', () => {
                _handleDeleteTemplate(templateId);
            });
        });
    }

    function _handleSaveTemplate() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        // Extract just the slot IDs (templates store slots, not week info)
        const slots = selectedCells.map(cell => cell.slotId || cell);

        _showNameModal(null, async (name) => {
            try {
                await TemplateService.saveTemplate(name, slots);
                if (typeof ToastService !== 'undefined') {
                    ToastService.show('Template saved', 'success');
                }
            } catch (error) {
                console.error('Failed to save template:', error);
                if (typeof ToastService !== 'undefined') {
                    ToastService.show('Failed to save template', 'error');
                }
            }
        });
    }

    function _handleLoadTemplate(templateId, weekIndex) {
        const template = typeof TemplateService !== 'undefined'
            ? TemplateService.getTemplates().find(t => t.id === templateId)
            : null;

        if (template && _onLoadTemplate) {
            _onLoadTemplate(template.slots, weekIndex);
            hide();
        }
    }

    function _handleRenameTemplate(templateId, row) {
        const nameEl = row.querySelector('.template-name');
        const currentName = nameEl?.textContent || '';

        _showNameModal(currentName, async (newName) => {
            if (newName === currentName) return;

            try {
                await TemplateService.renameTemplate(templateId, newName);
                if (typeof ToastService !== 'undefined') {
                    ToastService.show('Template renamed', 'success');
                }
            } catch (error) {
                console.error('Failed to rename template:', error);
                if (typeof ToastService !== 'undefined') {
                    ToastService.show('Failed to rename template', 'error');
                }
            }
        });
    }

    async function _handleDeleteTemplate(templateId) {
        if (!confirm('Delete this template?')) return;

        try {
            await TemplateService.deleteTemplate(templateId);
            if (typeof ToastService !== 'undefined') {
                ToastService.show('Template deleted', 'success');
            }
        } catch (error) {
            console.error('Failed to delete template:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.show('Failed to delete template', 'error');
            }
        }
    }

    function _handleClearAll() {
        if (!confirm('Clear all your availability for both weeks?')) return;

        if (_onClearAll) {
            _onClearAll();
            hide();
        }
    }

    function _showNameModal(existingName, callback) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-[60] flex items-center justify-center p-4 backdrop-blur-sm';
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
                           maxlength="${typeof TemplateService !== 'undefined' ? TemplateService.MAX_NAME_LENGTH : 20}"
                           value="${_escapeHtml(existingName || '')}">
                </div>
                <div class="flex justify-end gap-2 p-4 border-t border-border">
                    <button id="template-cancel-btn" class="btn-secondary px-4 py-2 rounded text-sm">Cancel</button>
                    <button id="template-save-btn" class="btn-primary px-4 py-2 rounded text-sm">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector('#template-name-input');
        const saveBtn = modal.querySelector('#template-save-btn');
        const cancelBtn = modal.querySelector('#template-cancel-btn');

        // Focus input
        setTimeout(() => input?.focus(), 0);

        const closeModal = () => {
            modal.remove();
        };

        const handleSave = () => {
            const name = input?.value.trim();
            if (name) {
                closeModal();
                callback(name);
            }
        };

        saveBtn?.addEventListener('click', handleSave);
        cancelBtn?.addEventListener('click', closeModal);
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') closeModal();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    function cleanup() {
        window.removeEventListener('templates-updated', _render);
        if (_escHandler) {
            document.removeEventListener('keydown', _escHandler);
            _escHandler = null;
        }
        if (_modal) {
            _modal.remove();
            _modal = null;
        }
    }

    return { init, show, hide, cleanup };
})();
