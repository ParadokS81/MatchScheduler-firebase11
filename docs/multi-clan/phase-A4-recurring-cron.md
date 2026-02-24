# Phase A4: Recurring Auto-Apply

## Context

Users with stable weekly schedules want their availability automatically filled each week without manual action. Phase A1 added the `template.recurring` and `template.lastAppliedWeekId` fields. This phase implements the backend logic: a `setRecurring` Cloud Function for immediate apply on toggle-on, and a weekly scheduled function for ongoing auto-fill.

Read `AVAILABILITY-ENHANCEMENT-CONTRACT.md` at the orchestrator level for the full contract.

**Prerequisite**: Phase A1 (schema migration) must be deployed.

---

## What Changes

1. **New Cloud Function `setRecurring`**: Toggles recurring and immediately applies template if turning on
2. **New scheduled Cloud Function `applyRecurringTemplates`**: Runs weekly, applies templates to new weeks
3. **Update `functions/index.js`** to export the new functions
4. **Update frontend `TemplateService.js`** with `setRecurring()` method

---

## Files to Create/Modify

### 1. `functions/recurring.js` — New file

```javascript
// /functions/recurring.js - Recurring template auto-apply
const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

/**
 * Toggle recurring on/off for the user's template.
 * When toggling ON: immediately apply template to current + next week.
 * Expects: { recurring: boolean }
 */
const setRecurring = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const { recurring } = data;
    if (typeof recurring !== 'boolean') {
        throw new functions.https.HttpsError('invalid-argument', 'recurring must be a boolean');
    }

    const db = getFirestore();
    const userId = context.auth.uid;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const template = userDoc.data().template;
    if (!template || !template.slots || template.slots.length === 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Save a template first');
    }

    if (recurring) {
        // Apply to current + next week for all user's teams
        const teams = userDoc.data().teams || {};
        const teamIds = Object.keys(teams);
        const currentWeekId = getCurrentWeekId();
        const nextWeekId = getNextWeekId();

        let applied = 0;
        for (const teamId of teamIds) {
            applied += await applyTemplateToWeek(db, userId, template.slots, teamId, currentWeekId);
            applied += await applyTemplateToWeek(db, userId, template.slots, teamId, nextWeekId);
        }

        await userRef.update({
            'template.recurring': true,
            'template.lastAppliedWeekId': nextWeekId,
            'template.updatedAt': FieldValue.serverTimestamp(),
        });

        console.log(`Recurring ON for ${userId}: applied ${applied} slots across ${teamIds.length} teams`);
        return { success: true, applied };

    } else {
        await userRef.update({
            'template.recurring': false,
            'template.updatedAt': FieldValue.serverTimestamp(),
        });

        console.log(`Recurring OFF for ${userId}`);
        return { success: true };
    }
});

/**
 * Weekly cron: apply recurring templates to the new "next week".
 * Runs every Monday at 04:00 UTC (05:00 CET).
 */
const applyRecurringTemplates = functions
    .region('europe-west3')
    .pubsub.schedule('every monday 04:00')
    .timeZone('UTC')
    .onRun(async () => {
    const db = getFirestore();
    const newNextWeekId = getNextWeekId();

    // Find all users with recurring templates
    const usersSnap = await db.collection('users')
        .where('template.recurring', '==', true)
        .get();

    console.log(`Recurring cron: ${usersSnap.size} users with recurring templates`);

    let totalApplied = 0;
    let usersProcessed = 0;

    for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const data = userDoc.data();
        const template = data.template;

        if (!template || !template.slots || template.slots.length === 0) continue;

        // Skip if already applied to this week
        if (template.lastAppliedWeekId >= newNextWeekId) {
            continue;
        }

        const teams = data.teams || {};
        const teamIds = Object.keys(teams);
        let userApplied = 0;

        for (const teamId of teamIds) {
            userApplied += await applyTemplateToWeek(db, userId, template.slots, teamId, newNextWeekId);
        }

        // Update lastAppliedWeekId
        await userDoc.ref.update({
            'template.lastAppliedWeekId': newNextWeekId,
            'template.updatedAt': FieldValue.serverTimestamp(),
        });

        totalApplied += userApplied;
        usersProcessed++;
    }

    console.log(`Recurring cron complete: ${usersProcessed} users, ${totalApplied} slots applied`);
    return null;
});

// ── Helpers ──

/**
 * Apply a template's slots to a specific team's week.
 * Only adds user to slots where they aren't already present.
 * Returns the number of slots applied.
 */
async function applyTemplateToWeek(db, userId, templateSlots, teamId, weekId) {
    const docId = `${teamId}_${weekId}`;
    const docRef = db.collection('availability').doc(docId);
    const doc = await docRef.get();

    // Check if user already has ANY slots in this week — if so, skip entirely
    // (they've already edited it manually, don't overwrite)
    if (doc.exists) {
        const slots = doc.data().slots || {};
        for (const [slotId, users] of Object.entries(slots)) {
            if (Array.isArray(users) && users.includes(userId)) {
                // User already has availability this week — skip
                return 0;
            }
        }
    }

    // Apply template slots
    const updateData = {
        teamId,
        weekId,
        lastUpdated: FieldValue.serverTimestamp(),
    };

    for (const slotId of templateSlots) {
        updateData[`slots.${slotId}`] = FieldValue.arrayUnion(userId);
        updateData[`unavailable.${slotId}`] = FieldValue.arrayRemove(userId);
    }

    if (doc.exists) {
        await docRef.update(updateData);
    } else {
        await docRef.set({ ...updateData, slots: {}, unavailable: {} });
        // Re-apply with update for the FieldValue operations
        delete updateData.teamId;
        delete updateData.weekId;
        await docRef.update(updateData);
    }

    return templateSlots.length;
}

/** Get current ISO week ID */
function getCurrentWeekId() {
    return getIsoWeekId(new Date());
}

/** Get next ISO week ID */
function getNextWeekId() {
    return getIsoWeekId(new Date(Date.now() + 7 * 86400000));
}

function getIsoWeekId(now) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

module.exports = { setRecurring, applyRecurringTemplates };
```

### 2. `functions/index.js` — Add exports

Add after the existing template exports:

```javascript
const { setRecurring, applyRecurringTemplates } = require('./recurring');

// ... in exports section:
exports.setRecurring = setRecurring;
exports.applyRecurringTemplates = applyRecurringTemplates;
```

### 3. `public/js/services/TemplateService.js` — Add setRecurring method

Add to the service module:

```javascript
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
```

Add `setRecurring` to the returned public API object.

### 4. Update `TemplatesModal.js` — Wire up recurring toggle

If Phase A2 already added a recurring toggle placeholder, wire it to `TemplateService.setRecurring()`. If not, add the toggle now:

```javascript
// In the template-exists section of _render():
const isRecurring = TemplateService.isRecurring();
// Add toggle HTML:
`<div class="flex items-center justify-between">
    <span class="text-sm">Auto-fill weekly</span>
    <button id="templates-recurring-toggle"
            class="px-3 py-1 text-xs rounded ${isRecurring ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">
        ${isRecurring ? 'ON' : 'OFF'}
    </button>
</div>`

// Handler:
async function _handleToggleRecurring() {
    const current = TemplateService.isRecurring();
    const result = await TemplateService.setRecurring(!current);
    if (result.success && !current) {
        ToastService.show(`Recurring ON — applied to current + next week`, 'success');
    } else if (result.success) {
        ToastService.show('Recurring OFF', 'success');
    } else {
        ToastService.show(result.error || 'Failed', 'error');
    }
}
```

---

## Firestore Index Requirement

The query `where('template.recurring', '==', true)` in the cron function queries a nested field. Firestore may need a **composite index** for this. If the deploy fails with an index error, create it:

- Collection: `users`
- Field: `template.recurring` (Ascending)
- No other fields needed (it's a simple equality filter)

Firebase usually auto-generates a link to create the index when the query first fails.

---

## Verification

1. Save a template, toggle recurring ON → verify current + next week get filled
2. Verify `template.recurring: true` and `template.lastAppliedWeekId` set in Firestore
3. Manually edit availability in a filled week → verify edits persist
4. Toggle recurring OFF → verify existing availability stays, `recurring: false` in Firestore
5. Toggle recurring ON again → verify it doesn't overwrite weeks that already have slots
6. Test the cron locally: call `applyRecurringTemplates` directly with Firebase shell or a test script
7. Deploy and verify the Cloud Scheduler job appears in the Firebase Console → Cloud Scheduler section
