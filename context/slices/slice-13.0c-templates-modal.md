# Slice 13.0c: Templates Modal

**Dependencies:** Slice 13.0b (grid header tools)
**User Story:** As a user, I want to manage my availability templates in a modal so I can save, load, rename, and delete templates without cluttering the grid header.

---

## Context: Layout Restructure (Slice 13.0)

Templates were previously in a drawer inside TeamInfo. Slice 13.0b added a "Templates" button to the grid header. This slice creates the modal that opens when clicking that button.

The modal provides full template management (save, load, rename, delete, clear all) without taking up persistent UI space.

---

## Scope

Convert the inline templates drawer into a modal dialog:
- List saved templates with actions
- Save new template from current selection
- Load template to Week 1 or Week 2
- Rename and delete templates
- Clear all availability

---

## Modal Design

```
┌─────────────────────────────────────────────────┐
│  Availability Templates                    [X]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Weeknights                        W1 W2 │   │
│  │ ─────────────────────────────────────── │   │
│  │                              [✏️] [🗑️] │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Weekend Prime Time                W1 W2 │   │
│  │ ─────────────────────────────────────── │   │
│  │                              [✏️] [🗑️] │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│  │ + Save Current Selection as Template     │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  [Clear All Availability]                       │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Changes

### 1. TemplatesModal.js — New modal component

**File:** `public/js/components/TemplatesModal.js` (NEW)

```javascript
// TemplatesModal.js - Modal for managing availability templates
const TemplatesModal = (function() {
    'use strict';

    let _modal = null;
    let _onLoadTemplate = null;
    let _onClearAll = null;
    let _getSelectedCells = null;

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
        _modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
    }

    function hide() {
        if (_modal) {
            _modal.classList.add('hidden');
            document.body.classList.remove('modal-open');
        }
    }

    function _createModal() {
        if (_modal) return;

        _modal = document.createElement('div');
        _modal.id = 'templates-modal';
        _modal.className = 'modal-overlay hidden';
        _modal.innerHTML = `
            <div class="modal-container max-w-md">
                <div class="modal-header">
                    <h2 class="modal-title">Availability Templates</h2>
                    <button class="modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body templates-modal-body">
                    <!-- Content rendered by _render() -->
                </div>
            </div>
        `;

        document.getElementById('modal-container')?.appendChild(_modal) ||
            document.body.appendChild(_modal);

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
                <span class="template-name flex-1 text-sm font-medium truncate">${template.name}</span>
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

    async function _handleSaveTemplate() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        // Prompt for name
        const name = prompt('Template name:', `Template ${Date.now()}`);
        if (!name) return;

        try {
            if (typeof TemplateService !== 'undefined') {
                await TemplateService.saveTemplate(name, selectedCells);
                if (typeof ToastService !== 'undefined') {
                    ToastService.show('Template saved', 'success');
                }
            }
        } catch (error) {
            console.error('Failed to save template:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.show('Failed to save template', 'error');
            }
        }
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

    async function _handleRenameTemplate(templateId, row) {
        const nameEl = row.querySelector('.template-name');
        const currentName = nameEl?.textContent || '';

        const newName = prompt('New template name:', currentName);
        if (!newName || newName === currentName) return;

        try {
            if (typeof TemplateService !== 'undefined') {
                await TemplateService.renameTemplate(templateId, newName);
            }
        } catch (error) {
            console.error('Failed to rename template:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.show('Failed to rename template', 'error');
            }
        }
    }

    async function _handleDeleteTemplate(templateId) {
        if (!confirm('Delete this template?')) return;

        try {
            if (typeof TemplateService !== 'undefined') {
                await TemplateService.deleteTemplate(templateId);
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

    function cleanup() {
        window.removeEventListener('templates-updated', _render);
        if (_modal) {
            _modal.remove();
            _modal = null;
        }
    }

    return { init, show, hide, cleanup };
})();
```

---

### 2. app.js — Initialize TemplatesModal

**File:** `public/js/app.js`

```javascript
// Initialize TemplatesModal with callbacks
TemplatesModal.init({
    getSelectedCells: () => _getSelectedCellsFromAllGrids(),
    onLoadTemplate: (slots, weekIndex) => _handleLoadTemplate(slots, weekIndex),
    onClearAll: () => _handleClearAll()
});
```

---

### 3. Script Loading

**File:** `public/index.html`

```html
<script src="js/components/TemplatesModal.js"></script>
```

---

### 4. CSS — Modal styling

**File:** `src/css/input.css`

```css
/* Templates Modal specific styles */
.templates-modal-body {
    max-height: 60vh;
    overflow-y: auto;
}

.template-row {
    transition: background-color 150ms ease;
}

.template-row .template-rename,
.template-row .template-delete {
    transition: opacity 150ms ease;
}
```

---

## Verification

1. Clicking "Templates" in grid header opens modal
2. Templates list shows all saved templates (up to 3)
3. W1/W2 buttons load template to correct week
4. Rename button prompts for new name
5. Delete button confirms then removes template
6. Save button saves current selection (disabled if no selection)
7. Clear All button confirms then clears all availability
8. Clicking outside modal or X closes it
9. ESC key closes modal

---

## Test Scenarios

- [ ] Modal opens from grid header Templates button
- [ ] Empty state shows "No templates saved yet"
- [ ] Save creates template with prompted name
- [ ] Template appears in list after save
- [ ] W1 loads to Week 1 and closes modal
- [ ] W2 loads to Week 2 and closes modal
- [ ] Rename updates template name
- [ ] Delete removes template after confirm
- [ ] Save disabled when no cells selected
- [ ] Max 3 templates enforced
- [ ] Clear All confirms then removes availability
- [ ] Modal closes on backdrop click
- [ ] Modal closes on X click
- [ ] Modal closes on ESC key
