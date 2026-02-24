# Phase A1: Single Template Schema Migration

## Context

The availability template system currently stores templates in a Firestore subcollection `users/{userId}/templates/{templateId}`, supporting up to 3 named templates per user. Usage data shows only 2 real users have meaningful templates (out of ~300 users). We're simplifying to **one template per user** stored as a flat field on the user document.

This phase migrates the schema, rewrites the Cloud Functions, updates the frontend service, and runs a one-time migration script.

Read `AVAILABILITY-ENHANCEMENT-CONTRACT.md` at the orchestrator level for the full contract.

---

## What Changes

1. **New schema**: `users/{userId}.template` field replaces the subcollection
2. **Cloud Functions**: Replace `saveTemplate`, `deleteTemplate`, `renameTemplate` with simplified `saveTemplate`, `clearTemplate`
3. **Frontend service**: Rewrite `TemplateService.js` for single-template model
4. **Migration script**: Convert existing 6 templates (5 users) to new format, delete subcollection docs
5. **Firestore rules**: Remove any subcollection-specific rules (if they exist)

---

## New Schema

```typescript
// Field on users/{userId} document
template?: {
    slots: string[];              // UTC slot IDs: ["mon_1900", "tue_2000", ...]
    recurring: boolean;           // Auto-apply to new weeks (Phase A4 will use this)
    lastAppliedWeekId: string;    // ISO week last auto-applied to (e.g., "2026-10")
    updatedAt: Timestamp;
}
```

The field is absent/undefined if the user has never saved a template.

---

## Files to Modify

### 1. `functions/templates.js` — Rewrite

Replace the entire file. The three functions (`saveTemplate`, `deleteTemplate`, `renameTemplate`) become two (`saveTemplate`, `clearTemplate`):

```javascript
// /functions/templates.js - Single template management
const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const MAX_SLOTS = 63; // 7 days × 9 slots = 63 theoretical max

// Valid slot pattern: day_time format in UTC
const VALID_SLOT_PATTERN = /^(mon|tue|wed|thu|fri|sat|sun)_(0[0-9]|1[0-9]|2[0-3])(00|30)$/;

/**
 * Save (or overwrite) the user's single template.
 * Expects: { slots: string[] }
 */
const saveTemplate = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const { slots } = data;

    if (!Array.isArray(slots) || slots.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'At least one slot is required');
    }

    if (slots.length > MAX_SLOTS) {
        throw new functions.https.HttpsError('invalid-argument', `Maximum ${MAX_SLOTS} slots allowed`);
    }

    for (const slot of slots) {
        if (typeof slot !== 'string' || !VALID_SLOT_PATTERN.test(slot)) {
            throw new functions.https.HttpsError('invalid-argument', `Invalid slot format: ${slot}`);
        }
    }

    const uniqueSlots = [...new Set(slots)];
    const db = getFirestore();
    const userId = context.auth.uid;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
    }

    // Preserve existing recurring/lastAppliedWeekId if they exist
    const existing = userDoc.data().template || {};

    await userRef.update({
        template: {
            slots: uniqueSlots,
            recurring: existing.recurring || false,
            lastAppliedWeekId: existing.lastAppliedWeekId || '',
            updatedAt: FieldValue.serverTimestamp(),
        },
    });

    console.log(`Template saved for user ${userId}: ${uniqueSlots.length} slots`);
    return { success: true, slotCount: uniqueSlots.length };
});

/**
 * Clear the user's template entirely.
 */
const clearTemplate = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const db = getFirestore();
    const userId = context.auth.uid;

    await db.collection('users').doc(userId).update({
        template: FieldValue.delete(),
    });

    console.log(`Template cleared for user ${userId}`);
    return { success: true };
});

module.exports = { saveTemplate, clearTemplate };
```

### 2. `functions/index.js` — Update exports (lines 14, 51-53)

Replace the old template imports and exports:

**Line 14** — change:
```javascript
const { saveTemplate, deleteTemplate, renameTemplate } = require('./templates');
```
to:
```javascript
const { saveTemplate, clearTemplate } = require('./templates');
```

**Lines 51-53** — change:
```javascript
exports.saveTemplate = saveTemplate;
exports.deleteTemplate = deleteTemplate;
exports.renameTemplate = renameTemplate;
```
to:
```javascript
exports.saveTemplate = saveTemplate;
exports.clearTemplate = clearTemplate;
```

### 3. `public/js/services/TemplateService.js` — Rewrite

Replace the entire file. The new service listens to the user document (not a subcollection) and manages a single template:

```javascript
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
        getTemplate,
        hasTemplate,
        isRecurring,
        cleanup,
    };
})();

document.addEventListener('DOMContentLoaded', TemplateService.init);
```

### 4. Migration Script

Create a temporary file `functions/migrate-templates.js` (run once, then delete):

```javascript
/**
 * One-time migration: subcollection templates → flat field on user doc.
 * Run with: node migrate-templates.js
 * Requires: service-account.json in parent directory
 */
const admin = require('firebase-admin');
const sa = require('../service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function migrate() {
    const snap = await db.collectionGroup('templates').get();
    console.log(`Found ${snap.size} template docs to migrate`);

    // Group by user, pick best template per user
    const byUser = {};
    snap.forEach(doc => {
        const userId = doc.ref.parent.parent.id;
        if (!byUser[userId]) byUser[userId] = [];
        byUser[userId].push({ ref: doc.ref, ...doc.data() });
    });

    for (const [userId, templates] of Object.entries(byUser)) {
        // Pick template with most slots (tiebreak: most recently updated)
        templates.sort((a, b) => {
            const slotsA = (a.slots || []).length;
            const slotsB = (b.slots || []).length;
            if (slotsB !== slotsA) return slotsB - slotsA;
            const timeA = a.updatedAt?.toMillis?.() || 0;
            const timeB = b.updatedAt?.toMillis?.() || 0;
            return timeB - timeA;
        });

        const best = templates[0];
        if (!best.slots || best.slots.length === 0) {
            console.log(`  ${userId}: skipping (no slots)`);
        } else {
            // Write flat field
            await db.collection('users').doc(userId).update({
                template: {
                    slots: best.slots,
                    recurring: false,
                    lastAppliedWeekId: '',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
            });
            console.log(`  ${userId}: migrated "${best.name}" (${best.slots.length} slots)`);
        }

        // Delete all subcollection docs
        for (const t of templates) {
            await t.ref.delete();
            console.log(`  ${userId}: deleted subcollection doc ${t.ref.id}`);
        }
    }

    console.log('Migration complete');
}

migrate().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
```

### 5. Update callers of the old TemplateService API

The following files call `TemplateService` methods that are changing. Search for all usages and update:

- **`TemplatesModal.js`** — calls `getTemplates()`, `canSaveMore()`, `saveTemplate(name, slots)`, `deleteTemplate(id)`, `renameTemplate(id, name)`. Phase A2 will rewrite this file completely. For now, you can leave it broken (it won't work with the new service anyway) or stub it minimally.

- **`MobileBottomBar.js`** — similar template calls. Same situation — Phase A2 will rewrite.

- **`GridActionButtons.js`** — calls `TemplateService` for save flow. Phase A2 will handle.

**Recommendation**: In this phase, just update `TemplateService.js` and `functions/templates.js` + `functions/index.js`. Leave the UI components for Phase A2. The template modal will be non-functional between A1 and A2, which is fine since barely anyone uses it. The event name changes from `'templates-updated'` to `'template-updated'` — this will cause the old modal to silently stop updating, which is acceptable.

### 6. `context/SCHEMA.md` — Document the new field

Add the `template` field to the `users/{userId}` document section in the schema doc. Note that the subcollection is deprecated and removed.

---

## Verification

1. Deploy Cloud Functions: `npm run deploy:functions` from MatchScheduler root
2. Run migration script: `cd functions && node migrate-templates.js`
3. Verify in Firebase Console:
   - `users/` docs for razor, Mushi, ParadokS should have `template` field
   - `users/{id}/templates/` subcollections should be empty
4. Test `saveTemplate` Cloud Function: call with `{ slots: ["mon_1900"] }` from browser console
5. Test `clearTemplate` Cloud Function: call from browser console
6. Verify `TemplateService.loadTemplate()` returns the template object
