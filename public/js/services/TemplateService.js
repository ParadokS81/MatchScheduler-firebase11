// TemplateService.js - Single template data management
// Following CLAUDE.md architecture: Cache + Listeners pattern

const TemplateService = (function() {
    'use strict';

    let _initialized = false;
    let _db = null;
    let _functions = null;
    let _template = null;  // Single template object or null
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
     * Load user's template from Firestore.
     * Sets up real-time listener on the user doc's template field.
     * @returns {Promise<Object|null>} Template object or null
     */
    async function loadTemplate() {
        const userId = window.firebase.auth.currentUser?.uid;
        if (!userId) {
            console.warn('TemplateService: No user logged in');
            return null;
        }

        const { doc, onSnapshot } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        if (_unsubscribe) {
            _unsubscribe();
        }

        const userRef = doc(_db, 'users', userId);

        return new Promise((resolve) => {
            _unsubscribe = onSnapshot(userRef, (snapshot) => {
                const data = snapshot.data();
                _template = data?.template || null;

                console.log(`📋 Template: ${_template ? _template.slots.length + ' slots' : 'none'}`);

                window.dispatchEvent(new CustomEvent('template-updated', {
                    detail: { template: _template }
                }));

                resolve(_template);
            }, (error) => {
                console.error('Template listener error:', error);
                resolve(null);
            });
        });
    }

    /**
     * Save (or overwrite) the user's template.
     * @param {string[]} slots - Array of UTC slot IDs
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function saveTemplate(slots) {
        if (!_initialized) await init();

        if (!Array.isArray(slots) || slots.length === 0) {
            return { success: false, error: 'Select at least one slot before saving' };
        }

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const saveFn = httpsCallable(_functions, 'saveTemplate');
            const result = await saveFn({ slots });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to save template');
            }

            return { success: true };
        } catch (error) {
            console.error('Failed to save template:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Clear the user's template.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function clearTemplate() {
        if (!_initialized) await init();

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const clearFn = httpsCallable(_functions, 'clearTemplate');
            const result = await clearFn({});

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to clear template');
            }

            return { success: true };
        } catch (error) {
            console.error('Failed to clear template:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get the current template from cache.
     * @returns {Object|null} { slots: string[], recurring: boolean, ... } or null
     */
    function getTemplate() {
        return _template;
    }

    /**
     * Check if user has a saved template.
     * @returns {boolean}
     */
    function hasTemplate() {
        return _template !== null && _template.slots && _template.slots.length > 0;
    }

    /**
     * Check if recurring is enabled.
     * @returns {boolean}
     */
    function isRecurring() {
        return _template?.recurring || false;
    }

    /**
     * Toggle recurring auto-apply for the template.
     * @param {boolean} recurring - true to enable, false to disable
     * @returns {Promise<{success: boolean, applied?: number, error?: string}>}
     */
    async function setRecurring(recurring) {
        if (!_initialized) await init();

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const setRecurringFn = httpsCallable(_functions, 'setRecurring');
            const result = await setRecurringFn({ recurring });

            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to update recurring');
            }

            return { success: true, applied: result.data.applied };
        } catch (error) {
            console.error('Failed to set recurring:', error);
            return { success: false, error: error.message };
        }
    }

    function cleanup() {
        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }
        _template = null;
        console.log('🧹 TemplateService cleaned up');
    }

    return {
        init,
        loadTemplate,
        saveTemplate,
        clearTemplate,
        setRecurring,
        getTemplate,
        hasTemplate,
        isRecurring,
        cleanup,
    };
})();

document.addEventListener('DOMContentLoaded', TemplateService.init);
