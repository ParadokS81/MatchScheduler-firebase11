#!/usr/bin/env node
/**
 * Remove deprecated notification channel settings from botRegistrations.
 *
 * Quad bot no longer uses a separate notification channel — all events
 * now appear as a "last 3 events" message in the #schedule channel.
 * This script strips the `notifications` field from every botRegistrations doc
 * and the `notificationChannelId` / `notificationsEnabled` top-level fields
 * that older registrations may have.
 *
 * DRY RUN by default. Pass --execute to actually write.
 *
 * Usage:
 *   node scripts/cleanup-notification-channel.js            # dry run
 *   node scripts/cleanup-notification-channel.js --execute  # live run
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const EXECUTE = process.argv.includes('--execute');
const FieldValue = admin.firestore.FieldValue;

let changeCount = 0;

function log(msg) {
    console.log(`${EXECUTE ? '' : '[DRY RUN] '}${msg}`);
}

async function main() {
    console.log(EXECUTE
        ? '🔥 EXECUTE MODE — writing to production!\n'
        : '🔍 DRY RUN MODE — pass --execute to apply changes\n'
    );

    // 1. Clean up botRegistrations
    console.log('=== botRegistrations ===');
    const botRegs = await db.collection('botRegistrations').get();
    console.log(`Found ${botRegs.size} botRegistration docs\n`);

    for (const doc of botRegs.docs) {
        const data = doc.data();
        const updates = {};
        const fieldsToRemove = [];

        if (data.notifications !== undefined) {
            updates.notifications = FieldValue.delete();
            fieldsToRemove.push(`notifications: ${JSON.stringify(data.notifications)}`);
        }
        if (data.notificationChannelId !== undefined) {
            updates.notificationChannelId = FieldValue.delete();
            fieldsToRemove.push(`notificationChannelId: ${data.notificationChannelId}`);
        }
        if (data.notificationsEnabled !== undefined) {
            updates.notificationsEnabled = FieldValue.delete();
            fieldsToRemove.push(`notificationsEnabled: ${data.notificationsEnabled}`);
        }

        if (fieldsToRemove.length > 0) {
            log(`${doc.id} — removing: ${fieldsToRemove.join(', ')}`);
            if (EXECUTE) {
                await doc.ref.update(updates);
            }
            changeCount++;
        } else {
            console.log(`  ${doc.id} — clean (no notification fields)`);
        }
    }

    // 2. Clean up existing notifications docs — remove channelId and notificationsEnabled from delivery
    console.log('\n=== notifications ===');
    const notifs = await db.collection('notifications').get();
    console.log(`Found ${notifs.size} notification docs\n`);

    for (const doc of notifs.docs) {
        const data = doc.data();
        const updates = {};
        const fieldsToRemove = [];

        // Check delivery.opponent
        if (data.delivery?.opponent?.channelId !== undefined) {
            updates['delivery.opponent.channelId'] = FieldValue.delete();
            fieldsToRemove.push('delivery.opponent.channelId');
        }
        if (data.delivery?.opponent?.notificationsEnabled !== undefined) {
            updates['delivery.opponent.notificationsEnabled'] = FieldValue.delete();
            fieldsToRemove.push('delivery.opponent.notificationsEnabled');
        }

        // Check delivery.proposer
        if (data.delivery?.proposer?.channelId !== undefined) {
            updates['delivery.proposer.channelId'] = FieldValue.delete();
            fieldsToRemove.push('delivery.proposer.channelId');
        }
        if (data.delivery?.proposer?.notificationsEnabled !== undefined) {
            updates['delivery.proposer.notificationsEnabled'] = FieldValue.delete();
            fieldsToRemove.push('delivery.proposer.notificationsEnabled');
        }

        // Check flat delivery (slot_confirmed / match_sealed use flat delivery object)
        if (data.delivery?.channelId !== undefined) {
            updates['delivery.channelId'] = FieldValue.delete();
            fieldsToRemove.push('delivery.channelId');
        }
        if (data.delivery?.notificationsEnabled !== undefined) {
            updates['delivery.notificationsEnabled'] = FieldValue.delete();
            fieldsToRemove.push('delivery.notificationsEnabled');
        }

        if (fieldsToRemove.length > 0) {
            log(`${doc.id} (${data.type || 'unknown'}) — removing: ${fieldsToRemove.join(', ')}`);
            if (EXECUTE) {
                await doc.ref.update(updates);
            }
            changeCount++;
        }
    }

    console.log(`\n✅ Complete. ${changeCount} docs ${EXECUTE ? 'updated' : 'would be updated'}.`);
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
