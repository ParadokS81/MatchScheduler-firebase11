# Slice 2.4: Templates & Grid Tools

## 1. Slice Definition
- **Slice ID:** 2.4
- **Name:** Templates & Grid Tools
- **User Story:** As a team member, I can save my typical availability pattern as a template and quickly load it to any week so that I don't have to manually recreate my schedule every week
- **Success Criteria:** User can save current selection as a named template (max 3), load a template to either visible week, see templates persist across sessions via Firestore, and manage (rename/delete) their templates

## 2. PRD Mapping
```
PRIMARY SECTIONS:
- 4.1.4 Grid Tools Panel: Template System
  - [Save template]: Saves current selection pattern from one week
  - Load template to week: [Week 24] [Week 25]: Side-by-side buttons
  - Templates store selection patterns only (day/time combinations)
  - Workflow: Load template -> Adjust selections -> [Add me]

DEPENDENT SECTIONS:
- 5.2 Cold Paths: Template operations can show brief loading
- 4.1.5 Performance Requirements: Template operations can show brief loading

IGNORED SECTIONS (for this slice):
- 4.1.4 Display Toggle (Initials/Avatars): Deferred to slice 2.5 (nothing to toggle yet)
- 4.1.2 Player Display: Not yet implemented
```

## 3. Full Stack Architecture
```
FRONTEND COMPONENTS:
- GridActionButtons (ENHANCED)
  - Firebase listeners: none
  - Cache interactions: Reads from TemplateService cache
  - UI responsibilities:
    - EXISTING: Add Me / Remove Me / Select All / Clear All buttons
    - NEW: Save Template button (opens naming modal)
    - NEW: Template selector dropdown with load buttons per week
    - NEW: Template management (rename/delete via dropdown menu)
  - User actions:
    - Click "Save Template" -> Modal for template name -> Save to Firestore
    - Click template dropdown -> Select template -> Show load buttons
    - Click "Load to Week X" -> Apply template pattern to that week's grid

- TemplateModal (NEW)
  - Firebase listeners: none
  - Cache interactions: none
  - UI responsibilities:
    - Simple modal with template name input
    - Validation (name required, max 20 chars)
    - Save/Cancel buttons with loading state
  - User actions:
    - Enter template name
    - Click Save -> Triggers backend save

FRONTEND SERVICES:
- TemplateService (NEW)
  - Cache: Map<string, Template> keyed by template ID
  - Methods:
    - init() -> Initialize service, load user's templates
    - loadUserTemplates(userId) -> Load from Firestore
    - saveTemplate(name, slots) -> Save new template
    - loadTemplate(templateId) -> Get template from cache
    - deleteTemplate(templateId) -> Delete template
    - renameTemplate(templateId, newName) -> Update template name
    - getTemplates() -> Get all cached templates
    - updateCache(templates) -> Update local cache
    - cleanup() -> Clear cache

BACKEND REQUIREMENTS:
⚠️ CLOUD FUNCTIONS TO IMPLEMENT IN /functions/templates.js:

- Cloud Functions:
  - saveTemplate({ name, slots }):
    - File: /functions/templates.js
    - Purpose: Save a new availability template for the user
    - Validation:
      - User must be authenticated
      - Name must be 1-20 characters
      - Slots must be valid format (array of day_time strings)
      - User cannot exceed 3 templates
    - Operations:
      - Create template document in /users/{userId}/templates
      - Set createdAt and updatedAt timestamps
    - Returns: { success: true, templateId: string } or { success: false, error: "message" }

  - deleteTemplate({ templateId }):
    - File: /functions/templates.js
    - Purpose: Delete a user's template
    - Validation:
      - User must be authenticated
      - Template must belong to user
    - Operations:
      - Delete template document
    - Returns: { success: true } or { success: false, error: "message" }

  - renameTemplate({ templateId, name }):
    - File: /functions/templates.js
    - Purpose: Rename a user's template
    - Validation:
      - User must be authenticated
      - Template must belong to user
      - Name must be 1-20 characters
    - Operations:
      - Update template name and updatedAt
    - Returns: { success: true } or { success: false, error: "message" }

- Function Exports Required:
  // In /functions/index.js add:
  const { saveTemplate, deleteTemplate, renameTemplate } = require('./templates');
  exports.saveTemplate = saveTemplate;
  exports.deleteTemplate = deleteTemplate;
  exports.renameTemplate = renameTemplate;

- Firestore Operations:
  - Collection: /users/{userId}/templates/{templateId}
  - Document structure:
    {
      name: string,          // Template display name (1-20 chars)
      slots: string[],       // Array of slot IDs: ["mon_1800", "mon_1830", ...]
      createdAt: Timestamp,
      updatedAt: Timestamp
    }
  - Operations:
    - Create: addDoc with template data
    - Delete: deleteDoc
    - Update: updateDoc for rename

- Security Rules:
  match /users/{userId}/templates/{templateId} {
    // User can only read/write their own templates
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }

- Authentication/Authorization:
  - Cloud Functions validate user owns the template
  - Subcollection under user document ensures data isolation

- Event Logging:
  - NOT REQUIRED for template operations (low audit value, personal data)

INTEGRATION POINTS:
- Frontend -> Backend: TemplateService.saveTemplate() -> saveTemplate Cloud Function
- Frontend -> Backend: TemplateService.deleteTemplate() -> deleteTemplate Cloud Function
- Frontend -> Backend: TemplateService.renameTemplate() -> renameTemplate Cloud Function
- Direct read: TemplateService loads templates from /users/{userId}/templates on init
- Grid integration: Load template -> Apply slots to AvailabilityGrid selection
```

## 4. Integration Code Examples

### TemplateService (NEW)
```javascript
// TemplateService.js - Template data management
const TemplateService = (function() {
    'use strict';

    const MAX_TEMPLATES = 3;
    const MAX_NAME_LENGTH = 20;

    let _initialized = false;
    let _db = null;
    let _functions = null;
    let _cache = new Map(); // Key: templateId, Value: template data
    let _unsubscribe = null;

    async function init() {
        if (_initialized) return;

        if (typeof window.firebase === 'undefined') {
            setTimeout(init, 100);
            return;
        }

        _db = window.firebase.db;
        _functions = window.firebase.functions;
        _initialized = true;
        console.log('📋 TemplateService initialized');
    }

    /**
     * Load user's templates from Firestore
     * Sets up real-time listener for updates
     */
    async function loadUserTemplates() {
        const userId = window.firebase.auth.currentUser?.uid;
        if (!userId) {
            console.warn('TemplateService: No user logged in');
            return [];
        }

        const { collection, query, onSnapshot, orderBy } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        // Clean up existing listener
        if (_unsubscribe) {
            _unsubscribe();
        }

        const templatesRef = collection(_db, 'users', userId, 'templates');
        const q = query(templatesRef, orderBy('createdAt', 'desc'));

        return new Promise((resolve) => {
            _unsubscribe = onSnapshot(q, (snapshot) => {
                _cache.clear();
                const templates = [];

                snapshot.forEach(doc => {
                    const data = { id: doc.id, ...doc.data() };
                    _cache.set(doc.id, data);
                    templates.push(data);
                });

                console.log(`📋 Loaded ${templates.length} templates`);
                resolve(templates);
            }, (error) => {
                console.error('Template listener error:', error);
                resolve([]);
            });
        });
    }

    /**
     * Save a new template
     * @param {string} name - Template name (1-20 chars)
     * @param {string[]} slots - Array of slot IDs
     */
    async function saveTemplate(name, slots) {
        if (!_initialized) await init();

        // Validate name
        if (!name || name.length === 0 || name.length > MAX_NAME_LENGTH) {
            return { success: false, error: `Name must be 1-${MAX_NAME_LENGTH} characters` };
        }

        // Check template limit
        if (_cache.size >= MAX_TEMPLATES) {
            return { success: false, error: `Maximum ${MAX_TEMPLATES} templates allowed. Delete one first.` };
        }

        // Validate slots
        if (!Array.isArray(slots) || slots.length === 0) {
            return { success: false, error: 'Select at least one slot before saving' };
        }

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const saveFn = httpsCallable(_functions, 'saveTemplate');

            const result = await saveFn({ name: name.trim(), slots });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to save template');
            }

            return { success: true, templateId: result.data.templateId };

        } catch (error) {
            console.error('Failed to save template:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete a template
     * @param {string} templateId - Template ID to delete
     */
    async function deleteTemplate(templateId) {
        if (!_initialized) await init();

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const deleteFn = httpsCallable(_functions, 'deleteTemplate');

            const result = await deleteFn({ templateId });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to delete template');
            }

            return { success: true };

        } catch (error) {
            console.error('Failed to delete template:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Rename a template
     * @param {string} templateId - Template ID to rename
     * @param {string} newName - New template name
     */
    async function renameTemplate(templateId, newName) {
        if (!_initialized) await init();

        // Validate name
        if (!newName || newName.length === 0 || newName.length > MAX_NAME_LENGTH) {
            return { success: false, error: `Name must be 1-${MAX_NAME_LENGTH} characters` };
        }

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const renameFn = httpsCallable(_functions, 'renameTemplate');

            const result = await renameFn({ templateId, name: newName.trim() });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to rename template');
            }

            return { success: true };

        } catch (error) {
            console.error('Failed to rename template:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get a template from cache
     * @param {string} templateId - Template ID
     */
    function getTemplate(templateId) {
        return _cache.get(templateId);
    }

    /**
     * Get all templates from cache
     */
    function getTemplates() {
        return Array.from(_cache.values());
    }

    /**
     * Check if user can save more templates
     */
    function canSaveMore() {
        return _cache.size < MAX_TEMPLATES;
    }

    /**
     * Cleanup - remove listeners and clear cache
     */
    function cleanup() {
        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }
        _cache.clear();
        console.log('🧹 TemplateService cleaned up');
    }

    return {
        init,
        loadUserTemplates,
        saveTemplate,
        deleteTemplate,
        renameTemplate,
        getTemplate,
        getTemplates,
        canSaveMore,
        cleanup,
        MAX_TEMPLATES,
        MAX_NAME_LENGTH
    };
})();

document.addEventListener('DOMContentLoaded', TemplateService.init);
```

### Cloud Function - templates.js
```javascript
// /functions/templates.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const MAX_TEMPLATES = 3;
const MAX_NAME_LENGTH = 20;

/**
 * Save a new availability template
 */
const saveTemplate = onCall(async (request) => {
    const db = getFirestore();

    // Validate authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const userId = request.auth.uid;
    const { name, slots } = request.data;

    // Validate name
    if (!name || typeof name !== 'string') {
        throw new HttpsError('invalid-argument', 'Template name is required');
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH) {
        throw new HttpsError('invalid-argument', `Name must be 1-${MAX_NAME_LENGTH} characters`);
    }

    // Validate slots
    if (!Array.isArray(slots) || slots.length === 0) {
        throw new HttpsError('invalid-argument', 'At least one slot is required');
    }

    // Validate slot format
    const validSlotPattern = /^(mon|tue|wed|thu|fri|sat|sun)_(18|19|20|21|22|23)(00|30)$/;
    for (const slot of slots) {
        if (!validSlotPattern.test(slot)) {
            throw new HttpsError('invalid-argument', `Invalid slot format: ${slot}`);
        }
    }

    // Check template count
    const templatesRef = db.collection('users').doc(userId).collection('templates');
    const existingTemplates = await templatesRef.count().get();

    if (existingTemplates.data().count >= MAX_TEMPLATES) {
        throw new HttpsError(
            'resource-exhausted',
            `Maximum ${MAX_TEMPLATES} templates allowed. Delete one first.`
        );
    }

    // Create template
    const templateData = {
        name: trimmedName,
        slots: slots,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    };

    const docRef = await templatesRef.add(templateData);

    console.log(`Template created: ${docRef.id} for user ${userId}`);

    return { success: true, templateId: docRef.id };
});

/**
 * Delete a user's template
 */
const deleteTemplate = onCall(async (request) => {
    const db = getFirestore();

    // Validate authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const userId = request.auth.uid;
    const { templateId } = request.data;

    if (!templateId || typeof templateId !== 'string') {
        throw new HttpsError('invalid-argument', 'Template ID is required');
    }

    // Verify template exists and belongs to user
    const templateRef = db.collection('users').doc(userId).collection('templates').doc(templateId);
    const templateDoc = await templateRef.get();

    if (!templateDoc.exists) {
        throw new HttpsError('not-found', 'Template not found');
    }

    // Delete template
    await templateRef.delete();

    console.log(`Template deleted: ${templateId} for user ${userId}`);

    return { success: true };
});

/**
 * Rename a user's template
 */
const renameTemplate = onCall(async (request) => {
    const db = getFirestore();

    // Validate authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const userId = request.auth.uid;
    const { templateId, name } = request.data;

    if (!templateId || typeof templateId !== 'string') {
        throw new HttpsError('invalid-argument', 'Template ID is required');
    }

    // Validate name
    if (!name || typeof name !== 'string') {
        throw new HttpsError('invalid-argument', 'Template name is required');
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH) {
        throw new HttpsError('invalid-argument', `Name must be 1-${MAX_NAME_LENGTH} characters`);
    }

    // Verify template exists and belongs to user
    const templateRef = db.collection('users').doc(userId).collection('templates').doc(templateId);
    const templateDoc = await templateRef.get();

    if (!templateDoc.exists) {
        throw new HttpsError('not-found', 'Template not found');
    }

    // Update template
    await templateRef.update({
        name: trimmedName,
        updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`Template renamed: ${templateId} to "${trimmedName}" for user ${userId}`);

    return { success: true };
});

module.exports = { saveTemplate, deleteTemplate, renameTemplate };
```

### Enhanced GridActionButtons with Templates
```javascript
// Addition to GridActionButtons.js - Template UI section

function _render() {
    if (!_container) return;

    const templates = TemplateService.getTemplates();
    const canSaveMore = TemplateService.canSaveMore();
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
                                <span class="flex-1 text-sm truncate" title="${template.name}">${template.name}</span>
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

function _attachListeners() {
    // ... existing listeners ...

    // Save template button
    document.getElementById('save-template-btn')?.addEventListener('click', _handleSaveTemplate);

    // Load template buttons
    document.querySelectorAll('.load-template-btn').forEach(btn => {
        btn.addEventListener('click', _handleLoadTemplate);
    });

    // Template menu buttons
    document.querySelectorAll('.template-menu-btn').forEach(btn => {
        btn.addEventListener('click', _handleTemplateMenu);
    });
}

async function _handleSaveTemplate() {
    const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
    if (selectedCells.length === 0) {
        ToastService.showError('Select at least one slot to save as template');
        return;
    }

    // Get slots from first week only (template is a weekly pattern)
    // We take slots from whichever week has selections
    const slots = selectedCells.map(cell => cell.slotId);
    const uniqueSlots = [...new Set(slots)]; // Remove duplicates

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
            _render(); // Re-render to show new template
        } else {
            ToastService.showError(result.error || 'Failed to save template');
        }

        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Template';
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

function _showTemplateNameModal(callback) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm">
            <div class="p-4 border-b border-border">
                <h3 class="text-lg font-semibold">Save Template</h3>
            </div>
            <div class="p-4">
                <label class="block text-sm font-medium mb-2">Template Name</label>
                <input type="text"
                       id="template-name-input"
                       class="w-full px-3 py-2 bg-input border border-border rounded text-sm"
                       placeholder="e.g., Weekday Evenings"
                       maxlength="${TemplateService.MAX_NAME_LENGTH}">
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
    menu.className = 'template-context-menu absolute bg-card border border-border rounded shadow-lg py-1 z-50';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
    menu.innerHTML = `
        <button class="block w-full px-4 py-2 text-sm text-left hover:bg-accent" data-action="rename">
            Rename
        </button>
        <button class="block w-full px-4 py-2 text-sm text-left hover:bg-accent text-destructive" data-action="delete">
            Delete
        </button>
    `;

    document.body.appendChild(menu);

    const handleAction = async (e) => {
        const action = e.target.dataset.action;
        menu.remove();

        if (action === 'rename') {
            _showTemplateNameModal(async (newName) => {
                if (!newName) return;
                const result = await TemplateService.renameTemplate(templateId, newName);
                if (result.success) {
                    ToastService.showSuccess('Template renamed');
                    _render();
                } else {
                    ToastService.showError(result.error || 'Failed to rename');
                }
            });
        } else if (action === 'delete') {
            if (confirm(`Delete template "${templateName}"?`)) {
                const result = await TemplateService.deleteTemplate(templateId);
                if (result.success) {
                    ToastService.showSuccess('Template deleted');
                    _render();
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

// Updated init signature
function init(containerId, options = {}) {
    _container = document.getElementById(containerId);
    _getSelectedCells = options.getSelectedCells;
    _clearSelections = options.clearSelections;
    _onSyncStart = options.onSyncStart;
    _onSyncEnd = options.onSyncEnd;
    _selectAllCallback = options.selectAll;
    _clearAllCallback = options.clearAll;
    _loadTemplateCallback = options.loadTemplate;  // NEW

    _render();
}
```

### WeekDisplay Integration
```javascript
// In WeekDisplay.js - coordinate template loading

/**
 * Load template slots to a specific grid
 * @param {string[]} slots - Array of slot IDs from template
 * @param {number} weekIndex - 0 for first week, 1 for second week
 */
function _handleLoadTemplate(slots, weekIndex) {
    const grid = _gridInstances[weekIndex];
    if (!grid) {
        console.error('Grid not found for week index:', weekIndex);
        return;
    }

    // Clear current selection in that grid
    grid.clearSelection();

    // Select the template slots
    slots.forEach(slotId => {
        // The grid's internal method to select a specific cell
        grid.selectCell(slotId);
    });

    // Notify selection change
    GridActionButtons.onSelectionChange();
}

// Pass to GridActionButtons init
GridActionButtons.init('grid-tools-container', {
    getSelectedCells: _getSelectedCellsFromBothGrids,
    clearSelections: _clearSelectionsFromBothGrids,
    selectAll: _handleSelectAll,
    clearAll: _handleClearAll,
    onSyncStart: _handleSyncStart,
    onSyncEnd: _handleSyncEnd,
    loadTemplate: _handleLoadTemplate  // NEW
});
```

### AvailabilityGrid Enhancement
```javascript
// Add to AvailabilityGrid.js

/**
 * Select a specific cell by ID (for template loading)
 * @param {string} cellId - The cell ID to select (e.g., "mon_1800")
 */
function selectCell(cellId) {
    const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
    if (cell && !_selectedCells.has(cellId)) {
        _selectedCells.add(cellId);
        cell.classList.add('selected');
    }
}

// Add to instance return object
const instance = {
    // ... existing methods ...
    selectCell  // NEW
};
```

### Security Rules Update
```javascript
// Add to firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ... existing rules ...

    // User templates subcollection
    match /users/{userId}/templates/{templateId} {
      // Users can only access their own templates
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 5. Performance Classification
```
HOT PATHS (<50ms):
- Load template to grid: Pure DOM selection - instant
- Template list rendering: From cached data - instant
- Context menu display: Pure DOM - instant

COLD PATHS (<2s):
- Initial template load: Firebase query (cached after first load)
- Save template: Cloud Function call + Firestore write
- Delete template: Cloud Function call + Firestore delete
- Rename template: Cloud Function call + Firestore update

BACKEND PERFORMANCE:
- Cloud Functions: Simple CRUD operations - fast
- Firestore queries: Small collection (<3 docs) - instant
- Real-time listener: Lightweight, triggers UI update on changes
```

## 6. Data Flow Diagram
```
SAVE TEMPLATE FLOW:
User selects slots -> Clicks "Save Template" -> Modal for name input
                                                        |
                                                        v
                                        TemplateService.saveTemplate()
                                                        |
         +----------------------------------------------+
         |                                              |
         v                                              v
[FRONTEND VALIDATION]                          [CLOUD FUNCTION]
- Name 1-20 chars                              saveTemplate()
- Has selections                               - Validate auth
- <3 templates                                 - Validate inputs
         |                                     - Check count
         |                                     - Create document
         v                                              |
    Show loading                                        v
         |                                     Firestore write
         |                                              |
         +<-------- onSnapshot listener <--------------+
         |
         v
    Update cache -> Re-render UI -> Show success toast


LOAD TEMPLATE FLOW:
User clicks "W1" or "W2" button on template
                    |
                    v
        _handleLoadTemplate(templateId, weekIndex)
                    |
                    v
        TemplateService.getTemplate(templateId) [from cache]
                    |
                    v
        WeekDisplay._handleLoadTemplate(slots, weekIndex)
                    |
                    v
        Grid[weekIndex].clearSelection()
                    |
                    v
        For each slot: grid.selectCell(slotId)
                    |
                    v
        GridActionButtons.onSelectionChange()
                    |
                    v
        User sees template pattern selected -> Can adjust -> Click "Add Me"


DELETE TEMPLATE FLOW:
User clicks menu -> "Delete" -> Confirm
                                    |
                                    v
                    TemplateService.deleteTemplate(templateId)
                                    |
                                    v
                            Cloud Function -> Firestore delete
                                    |
                                    v
                            onSnapshot fires -> Cache updated -> UI re-renders
```

## 7. Test Scenarios
```
FRONTEND TESTS:
- [ ] Save Template button disabled when no cells selected
- [ ] Save Template button disabled when 3 templates exist
- [ ] Template name modal appears on Save click
- [ ] Modal validates name (required, max 20 chars)
- [ ] Cancel/Escape closes modal without saving
- [ ] Enter submits modal
- [ ] Templates display in list with names
- [ ] W1/W2 load buttons visible for each template
- [ ] Context menu shows Rename/Delete options
- [ ] Context menu closes on outside click
- [ ] Delete confirmation dialog appears

BACKEND TESTS:
- [ ] saveTemplate rejects unauthenticated requests
- [ ] saveTemplate rejects empty name
- [ ] saveTemplate rejects name > 20 chars
- [ ] saveTemplate rejects empty slots array
- [ ] saveTemplate rejects invalid slot format
- [ ] saveTemplate rejects when user has 3 templates
- [ ] saveTemplate creates document in correct subcollection
- [ ] deleteTemplate rejects non-owner
- [ ] deleteTemplate removes document
- [ ] renameTemplate rejects invalid name
- [ ] renameTemplate updates document

INTEGRATION TESTS (CRITICAL):
- [ ] Save template -> List updates immediately via listener
- [ ] Delete template -> List updates immediately
- [ ] Rename template -> List updates with new name
- [ ] Load template to Week 1 -> Correct cells selected in grid 1
- [ ] Load template to Week 2 -> Correct cells selected in grid 2
- [ ] Load template -> Add Me -> Availability saved to Firebase
- [ ] New user sees empty template list
- [ ] User with 3 templates sees "Max 3" message

END-TO-END TESTS:
- [ ] Complete workflow: Select slots -> Save template -> Refresh page -> Template still exists
- [ ] Complete workflow: Load template -> Adjust selection -> Add Me -> Availability correct
- [ ] Templates persist across browser sessions
- [ ] Templates are user-specific (other users can't see them)
- [ ] Security: Direct Firestore access to other user's templates denied
```

## 8. Common Integration Pitfalls
- [ ] Template listener not cleaned up on logout (memory leak)
- [ ] Save button not re-enabled after failed save
- [ ] Context menu positioned off-screen on edge cases
- [ ] Template slots from both weeks merged (should only use slot IDs, not week)
- [ ] selectCell method not exposed on grid instance
- [ ] onSnapshot listener set up multiple times on re-init
- [ ] Modal not removed from DOM on backdrop click
- [ ] Enter key triggers both modal save and underlying button
- [ ] Template count check race condition (check before and after)
- [ ] Firestore rules not updated to allow templates subcollection

## 9. Implementation Notes

### File Structure
```
public/js/
├── services/
│   └── TemplateService.js     (NEW)
├── components/
│   ├── AvailabilityGrid.js    (ENHANCE - add selectCell method)
│   ├── GridActionButtons.js   (ENHANCE - add template UI)
│   └── WeekDisplay.js         (ENHANCE - add loadTemplate callback)

functions/
├── templates.js               (NEW)
└── index.js                   (ADD exports)

firestore.rules                (UPDATE - add templates subcollection rule)
```

### Template Data Model
```typescript
interface Template {
  id: string;           // Firestore document ID
  name: string;         // User-defined name (1-20 chars)
  slots: string[];      // Array of slot IDs: ["mon_1800", "tue_1900", ...]
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Slot ID Format (same as availability)
- Format: `{day}_{time}` where day is lowercase 3-letter and time is 24hr HHMM
- Examples: `mon_1800`, `tue_1930`, `sun_2300`
- Templates store only the slot pattern, not week-specific data

### Week Button Labels
- "W1" and "W2" are compact labels that work for any week numbers
- Tooltips provide full context: "Load to Week 1"
- Alternative considered: Show actual week numbers (e.g., "Wk 24", "Wk 25")
  - Rejected: Week numbers change, button labels would need re-rendering

### Template Loading Behavior
- Loading a template REPLACES current selection in that week
- User can then adjust the selection before clicking "Add Me"
- Does NOT automatically add availability (matches PRD: "Load template -> Adjust -> [Add me]")

### Dependencies
- Requires AuthService for current user ID
- Requires ToastService for user feedback
- Requires existing AvailabilityService for Add Me flow

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Templates store only slot IDs, not week-specific data
- **Rationale**: Templates are patterns (e.g., "Weekday evenings") that can apply to any week
- **Alternative**: Could store full cell references with week, but adds complexity

- **[ASSUMPTION]**: Loading a template replaces current selection (not additive)
- **Rationale**: Matches typical template behavior, allows clean start from saved pattern
- **Alternative**: Could merge with existing selection, but may confuse users

- **[ASSUMPTION]**: 3 template limit is enforced on both frontend and backend
- **Rationale**: Defense in depth - backend is source of truth
- **Alternative**: Frontend-only enforcement would be vulnerable to manipulation

- **[ASSUMPTION]**: Templates are user-scoped, not team-scoped
- **Rationale**: Personal availability patterns vary by individual
- **Alternative**: Team templates could exist but adds complexity and unclear use case

---

## Quality Checklist

Before considering this slice spec complete:
- [x] Frontend AND backend requirements specified
- [x] All PRD requirements mapped (4.1.4 Template System)
- [x] Architecture follows established patterns (Cache + Listeners + Revealing Module)
- [x] Hot paths clearly identified (template loading is instant)
- [x] Test scenarios cover full stack
- [x] No anti-patterns present
- [x] Data flow complete (UI -> Firebase -> Listener -> UI)
- [x] Integration examples show actual code
- [x] Error handling specified (validation, loading states)
- [x] Loading states defined (save button text change)
- [x] Event logging checked (not required for templates)
- [x] API contracts fully specified
- [x] Security rules documented

---

*Slice created: 2026-01-23*
*Based on PRD 4.1.4 Grid Tools Panel - Template System*
*Clarifications obtained: Firestore storage, 3 template limit, Display Toggle deferred*
