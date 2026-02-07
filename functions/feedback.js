const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * Submit user feedback (bug report, feature request, or other)
 * Creates a document in the /feedback collection
 */
exports.submitFeedback = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
        // Auth check
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Must be signed in to submit feedback');
        }

        const { uid } = context.auth;
        const { category, message, screenshotUrl, currentUrl, browserInfo } = data;

        // Validate category
        const validCategories = ['bug', 'feature', 'other'];
        if (!category || !validCategories.includes(category)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid category');
        }

        // Validate message
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            throw new functions.https.HttpsError('invalid-argument', 'Message is required');
        }
        if (message.length > 2000) {
            throw new functions.https.HttpsError('invalid-argument', 'Message too long (max 2000 characters)');
        }

        // Validate screenshotUrl if provided
        if (screenshotUrl != null && (typeof screenshotUrl !== 'string' || screenshotUrl.length === 0)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid screenshot URL');
        }

        // Fetch displayName server-side
        let displayName = 'Unknown';
        try {
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists) {
                displayName = userDoc.data().displayName || 'Unknown';
            }
        } catch (e) {
            console.warn('Could not fetch user displayName:', e.message);
        }

        // Create feedback document
        try {
            const feedbackData = {
                userId: uid,
                displayName,
                category,
                message: message.trim(),
                screenshotUrl: screenshotUrl || null,
                status: 'new',
                browserInfo: browserInfo || null,
                currentUrl: currentUrl || null,
                createdAt: FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('feedback').add(feedbackData);
            console.log(`Feedback submitted by ${uid} (${displayName}): ${docRef.id} [${category}]`);

            return { success: true, feedbackId: docRef.id };
        } catch (error) {
            console.error('Error submitting feedback:', error);
            throw new functions.https.HttpsError('internal', 'Failed to submit feedback');
        }
    });
