// set-admin-claims.js — Set admin custom claims on Firebase Auth users
// Usage: node scripts/set-admin-claims.js
//
// NOTE: After running this script, affected users must sign out and back in
// (or wait up to 1 hour for token refresh) to see the admin tab.

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const ADMIN_UIDS = [
    'dev-user-001',          // Dev: ParadokS
    'qw-sr-paradoks',        // Prod: ParadokS (Discord auth)
];

async function main() {
    for (const uid of ADMIN_UIDS) {
        try {
            await admin.auth().setCustomUserClaims(uid, { admin: true });
            const user = await admin.auth().getUser(uid);
            console.log(`✅ Set admin claim for ${uid} (${user.displayName || 'unknown'})`);
        } catch (err) {
            console.warn(`⚠️  Skipped ${uid}: ${err.message}`);
        }
    }
    console.log('\nDone. Users must sign out and back in to pick up the new claims.');
    process.exit(0);
}
main();
