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
