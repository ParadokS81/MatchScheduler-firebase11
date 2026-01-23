// TemplateService.js - Template data management
// Following CLAUDE.md architecture: Cache + Listeners pattern

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
     * @returns {Promise<Array>} Array of templates
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

                // Dispatch event for UI updates
                window.dispatchEvent(new CustomEvent('templates-updated', {
                    detail: { templates }
                }));

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
     * @returns {Promise<{success: boolean, templateId?: string, error?: string}>}
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
     * @returns {Promise<{success: boolean, error?: string}>}
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
     * @returns {Promise<{success: boolean, error?: string}>}
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
     * @returns {Object|undefined} Template data or undefined
     */
    function getTemplate(templateId) {
        return _cache.get(templateId);
    }

    /**
     * Get all templates from cache
     * @returns {Array} Array of template objects
     */
    function getTemplates() {
        return Array.from(_cache.values());
    }

    /**
     * Check if user can save more templates
     * @returns {boolean}
     */
    function canSaveMore() {
        return _cache.size < MAX_TEMPLATES;
    }

    /**
     * Get current template count
     * @returns {number}
     */
    function getTemplateCount() {
        return _cache.size;
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
        getTemplateCount,
        cleanup,
        MAX_TEMPLATES,
        MAX_NAME_LENGTH
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', TemplateService.init);
