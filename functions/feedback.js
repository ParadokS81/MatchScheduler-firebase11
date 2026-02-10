const functions = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

// Admin UIDs allowed to view feedback counts
// Add production UIDs here alongside dev UIDs
const ADMIN_UIDS = [
    'dev-user-001',                    // Dev: ParadokS
    'qw-sr-paradoks',                   // Prod: ParadokS (Discord auth)
];

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
        const { category, message, screenshotUrl, screenshotUrls, currentUrl, browserInfo } = data;

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

        // Normalize screenshots: accept both legacy single URL and new array
        let urls = [];
        if (Array.isArray(screenshotUrls)) {
            urls = screenshotUrls.filter(u => typeof u === 'string' && u.length > 0).slice(0, 3);
        } else if (typeof screenshotUrl === 'string' && screenshotUrl.length > 0) {
            urls = [screenshotUrl];
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
                screenshotUrl: urls[0] || null,    // Backward compat for read-feedback.js
                screenshotUrls: urls,               // Full array
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

/**
 * Get count of new (unreviewed) feedback items
 * Restricted to admin users only
 */
exports.getFeedbackCount = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
        }

        const isAdmin = ADMIN_UIDS.includes(context.auth.uid) ||
                         context.auth.token.admin === true;

        if (!isAdmin) {
            console.warn('getFeedbackCount denied for UID:', context.auth.uid);
            throw new functions.https.HttpsError('permission-denied', 'Not authorized');
        }

        try {
            const snapshot = await db.collection('feedback')
                .where('status', '==', 'new')
                .get();

            return { count: snapshot.size };
        } catch (error) {
            console.error('Error getting feedback count:', error);
            throw new functions.https.HttpsError('internal', 'Failed to get feedback count');
        }
    });
