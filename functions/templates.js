// /functions/templates.js - Template management Cloud Functions
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const MAX_TEMPLATES = 3;
const MAX_NAME_LENGTH = 20;

// Valid slot pattern: day_time format (e.g., "mon_1800", "tue_1930")
const VALID_SLOT_PATTERN = /^(mon|tue|wed|thu|fri|sat|sun)_(18|19|20|21|22|23)(00|30)$/;

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
    for (const slot of slots) {
        if (typeof slot !== 'string' || !VALID_SLOT_PATTERN.test(slot)) {
            throw new HttpsError('invalid-argument', `Invalid slot format: ${slot}`);
        }
    }

    // Remove duplicates
    const uniqueSlots = [...new Set(slots)];

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
        slots: uniqueSlots,
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

    // Verify template exists and belongs to user (subcollection ensures ownership)
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

    // Verify template exists and belongs to user (subcollection ensures ownership)
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
