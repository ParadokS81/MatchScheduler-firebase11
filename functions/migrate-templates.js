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
