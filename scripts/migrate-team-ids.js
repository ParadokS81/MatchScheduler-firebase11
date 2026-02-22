#!/usr/bin/env node
/**
 * One-time migration: rename 3 teams with random Firestore auto-IDs
 * to readable IDs matching the team-{tag}-{nnn} convention.
 *
 * Dry-run by default. Pass --execute to actually write changes.
 *
 * Usage:
 *   node scripts/migrate-team-ids.js            # dry run
 *   node scripts/migrate-team-ids.js --execute  # live run
 */

const admin = require('firebase-admin');
const sa = require('../service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const DRY_RUN = !process.argv.includes('--execute');

// Teams to rename: oldId → newId
const RENAMES = {
    'UY6ZoaEUEow6E2LE2bSS': 'team-f0m-001',     // Fragomatic (F0M)
    'iqonaHSejK2S97wUYjs5': 'team-qaa-001',       // Quality Assure Ants (QAA)
    'vSrw3VhHvXL3Ubk0yJoi': 'team-clan-001',      // RetroRockets (CLAN)
};

let changeCount = 0;

function log(msg) {
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${msg}`);
}

async function migrateTeamDoc(oldId, newId) {
    log(`\n=== Migrating ${oldId} → ${newId} ===`);

    // 1. Copy team document
    const oldDoc = await db.collection('teams').doc(oldId).get();
    if (!oldDoc.exists) {
        console.error(`  ERROR: Team ${oldId} does not exist!`);
        return false;
    }
    const teamData = oldDoc.data();
    log(`  Team: ${teamData.teamName} (${teamData.teamTag})`);

    // Check new ID doesn't already exist
    const newDoc = await db.collection('teams').doc(newId).get();
    if (newDoc.exists) {
        console.error(`  ERROR: Target ${newId} already exists!`);
        return false;
    }

    if (!DRY_RUN) {
        await db.collection('teams').doc(newId).set(teamData);
    }
    log(`  1. Created teams/${newId}`);
    changeCount++;

    // 2. Copy subcollections (logos)
    const subcollections = await db.collection('teams').doc(oldId).listCollections();
    for (const subcol of subcollections) {
        const subDocs = await subcol.get();
        for (const subDoc of subDocs.docs) {
            if (!DRY_RUN) {
                await db.collection('teams').doc(newId).collection(subcol.id).doc(subDoc.id).set(subDoc.data());
            }
            log(`  2. Copied subcollection teams/${newId}/${subcol.id}/${subDoc.id}`);
            changeCount++;
        }
    }

    // 3. Update users.teams map (remove old key, add new key)
    const usersWithTeam = await db.collection('users').where(`teams.${oldId}`, '==', true).get();
    for (const userDoc of usersWithTeam.docs) {
        if (!DRY_RUN) {
            await userDoc.ref.update({
                [`teams.${oldId}`]: admin.firestore.FieldValue.delete(),
                [`teams.${newId}`]: true,
            });
        }
        log(`  3. Updated users/${userDoc.id} teams map`);
        changeCount++;
    }

    // 4. Update users.favoriteTeams arrays
    const usersWithFav = await db.collection('users').where('favoriteTeams', 'array-contains', oldId).get();
    for (const userDoc of usersWithFav.docs) {
        if (!DRY_RUN) {
            await userDoc.ref.update({
                favoriteTeams: admin.firestore.FieldValue.arrayRemove(oldId),
            });
            await userDoc.ref.update({
                favoriteTeams: admin.firestore.FieldValue.arrayUnion(newId),
            });
        }
        log(`  4. Updated users/${userDoc.id} favoriteTeams`);
        changeCount++;
    }

    // 5. Migrate availability docs ({oldId}_{weekId} → {newId}_{weekId})
    const availDocs = await db.collection('availability').where('teamId', '==', oldId).get();
    for (const availDoc of availDocs.docs) {
        const availData = availDoc.data();
        const weekId = availData.weekId || availDoc.id.split('_').slice(1).join('_');
        const newAvailId = `${newId}_${weekId}`;

        if (!DRY_RUN) {
            await db.collection('availability').doc(newAvailId).set({
                ...availData,
                teamId: newId,
            });
            await availDoc.ref.delete();
        }
        log(`  5. Migrated availability/${availDoc.id} → ${newAvailId}`);
        changeCount++;
    }

    // 6. Update matchProposals (proposerTeamId / opponentTeamId)
    const proposalsAsProposer = await db.collection('matchProposals').where('proposerTeamId', '==', oldId).get();
    for (const doc of proposalsAsProposer.docs) {
        if (!DRY_RUN) {
            await doc.ref.update({ proposerTeamId: newId });
        }
        log(`  6a. Updated matchProposals/${doc.id} proposerTeamId`);
        changeCount++;
    }

    const proposalsAsOpponent = await db.collection('matchProposals').where('opponentTeamId', '==', oldId).get();
    for (const doc of proposalsAsOpponent.docs) {
        if (!DRY_RUN) {
            await doc.ref.update({ opponentTeamId: newId });
        }
        log(`  6b. Updated matchProposals/${doc.id} opponentTeamId`);
        changeCount++;
    }

    // 7. Update scheduledMatches (teamAId / teamBId / blockedTeams)
    const matchesAsA = await db.collection('scheduledMatches').where('teamAId', '==', oldId).get();
    for (const doc of matchesAsA.docs) {
        const updates = { teamAId: newId };
        const data = doc.data();
        if (data.blockedTeams?.includes(oldId)) {
            updates.blockedTeams = data.blockedTeams.map(t => t === oldId ? newId : t);
        }
        if (!DRY_RUN) {
            await doc.ref.update(updates);
        }
        log(`  7a. Updated scheduledMatches/${doc.id} teamAId`);
        changeCount++;
    }

    const matchesAsB = await db.collection('scheduledMatches').where('teamBId', '==', oldId).get();
    for (const doc of matchesAsB.docs) {
        const updates = { teamBId: newId };
        const data = doc.data();
        if (data.blockedTeams?.includes(oldId)) {
            updates.blockedTeams = data.blockedTeams.map(t => t === oldId ? newId : t);
        }
        if (!DRY_RUN) {
            await doc.ref.update(updates);
        }
        log(`  7b. Updated scheduledMatches/${doc.id} teamBId`);
        changeCount++;
    }

    // 8. Migrate botRegistrations/{oldId} → botRegistrations/{newId}
    const botDoc = await db.collection('botRegistrations').doc(oldId).get();
    if (botDoc.exists) {
        if (!DRY_RUN) {
            await db.collection('botRegistrations').doc(newId).set({
                ...botDoc.data(),
                teamId: newId,
            });
            await botDoc.ref.delete();
        }
        log(`  8. Migrated botRegistrations/${oldId} → ${newId}`);
        changeCount++;
    } else {
        log(`  8. No botRegistrations for this team (skip)`);
    }

    // 9. Update eventLog entries
    const events = await db.collection('eventLog').where('teamId', '==', oldId).get();
    for (const doc of events.docs) {
        if (!DRY_RUN) {
            await doc.ref.update({ teamId: newId });
        }
        log(`  9. Updated eventLog/${doc.id}`);
        changeCount++;
    }

    // 10. Update voiceRecordings
    const recordings = await db.collection('voiceRecordings').where('teamId', '==', oldId).get();
    for (const doc of recordings.docs) {
        if (!DRY_RUN) {
            await doc.ref.update({ teamId: newId });
        }
        log(`  10. Updated voiceRecordings/${doc.id}`);
        changeCount++;
    }

    // 11. Update recordingSessions
    const sessions = await db.collection('recordingSessions').where('teamId', '==', oldId).get();
    for (const doc of sessions.docs) {
        if (!DRY_RUN) {
            await doc.ref.update({ teamId: newId });
        }
        log(`  11. Updated recordingSessions/${doc.id}`);
        changeCount++;
    }

    // 12. Update notifications
    const notifAsProposer = await db.collection('notifications').where('proposerTeamId', '==', oldId).get();
    for (const doc of notifAsProposer.docs) {
        if (!DRY_RUN) { await doc.ref.update({ proposerTeamId: newId }); }
        log(`  12a. Updated notifications/${doc.id} proposerTeamId`);
        changeCount++;
    }
    const notifAsOpponent = await db.collection('notifications').where('opponentTeamId', '==', oldId).get();
    for (const doc of notifAsOpponent.docs) {
        if (!DRY_RUN) { await doc.ref.update({ opponentTeamId: newId }); }
        log(`  12b. Updated notifications/${doc.id} opponentTeamId`);
        changeCount++;
    }

    // 13. Update deletionRequests
    const deletions = await db.collection('deletionRequests').where('teamId', '==', oldId).get();
    for (const doc of deletions.docs) {
        if (!DRY_RUN) { await doc.ref.update({ teamId: newId }); }
        log(`  13. Updated deletionRequests/${doc.id}`);
        changeCount++;
    }

    // 14. Delete old team document (LAST — after everything else succeeds)
    if (!DRY_RUN) {
        // Delete old subcollections first
        for (const subcol of subcollections) {
            const subDocs = await subcol.get();
            for (const subDoc of subDocs.docs) {
                await subDoc.ref.delete();
            }
        }
        await db.collection('teams').doc(oldId).delete();
    }
    log(`  14. Deleted old teams/${oldId}`);
    changeCount++;

    return true;
}

async function main() {
    console.log(DRY_RUN
        ? '🔍 DRY RUN — no changes will be written. Pass --execute to apply.\n'
        : '🔥 LIVE RUN — writing changes to production Firestore!\n'
    );

    for (const [oldId, newId] of Object.entries(RENAMES)) {
        const ok = await migrateTeamDoc(oldId, newId);
        if (!ok) {
            console.error(`\n❌ Migration failed for ${oldId}. Stopping.`);
            process.exit(1);
        }
    }

    console.log(`\n✅ Migration complete. ${changeCount} changes ${DRY_RUN ? 'would be' : 'were'} applied.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
