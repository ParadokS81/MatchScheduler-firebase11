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
