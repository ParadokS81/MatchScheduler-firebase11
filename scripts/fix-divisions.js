#!/usr/bin/env node
/**
 * One-time fix: Normalize team divisions from ['1','2','3'] to ['D1','D2','D3'].
 *
 * Bug: OnboardingModal used value="1" instead of value="D1" for division checkboxes,
 * so teams created via onboarding got divisions stored as ['1','2','3'].
 * The updateTeamSettings backend expects ['D1','D2','D3'], causing "Invalid division: 1".
 *
 * Usage:
 *   node scripts/fix-divisions.js              # local emulator
 *   node scripts/fix-divisions.js --production  # production
 */

const args = process.argv.slice(2);
const IS_PRODUCTION = args.includes('--production');

let db;

function initFirebase() {
    const admin = require('firebase-admin');
    if (IS_PRODUCTION) {
        const serviceAccount = require('../service-account.json');
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        const host = args.find(a => !a.startsWith('--')) || '127.0.0.1';
        process.env.FIRESTORE_EMULATOR_HOST = `${host}:8080`;
        admin.initializeApp({ projectId: 'matchscheduler-qw' });
    }
    db = admin.firestore();
}

function normalizeDivisions(divisions) {
    if (!Array.isArray(divisions)) return null;

    const mapping = { '1': 'D1', '2': 'D2', '3': 'D3' };
    let needsFix = false;

    const normalized = divisions.map(d => {
        if (mapping[d]) {
            needsFix = true;
            return mapping[d];
        }
        return d;
    });

    return needsFix ? normalized : null;
}

async function main() {
    initFirebase();

    console.log(`Running against ${IS_PRODUCTION ? 'PRODUCTION' : 'emulator'}...`);

    const teamsSnap = await db.collection('teams').get();
    let fixed = 0;
    let skipped = 0;

    for (const doc of teamsSnap.docs) {
        const data = doc.data();
        const normalized = normalizeDivisions(data.divisions);

        if (normalized) {
            console.log(`  FIX: ${data.teamName} (${doc.id}): [${data.divisions}] -> [${normalized}]`);
            await db.collection('teams').doc(doc.id).update({ divisions: normalized });
            fixed++;
        } else {
            skipped++;
        }
    }

    console.log(`\nDone. Fixed: ${fixed}, Already correct: ${skipped}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
