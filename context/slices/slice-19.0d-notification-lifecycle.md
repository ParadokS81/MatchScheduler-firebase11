# Slice 19.0d — Notification Lifecycle (slot_confirmed + match_sealed)

**Status:** Spec
**Depends on:** 19.0c (challenge_proposed notification)
**Touches:** `functions/match-proposals.js`

---

## Goal

Complete the notification loop. Currently only `challenge_proposed` writes a notification doc.
Add `slot_confirmed` and `match_sealed` notification types so the quad bot can notify teams
at every meaningful stage of the scheduling flow.

Also: add team logo URLs to ALL notification documents (including the existing `challenge_proposed`)
so the bot can render richer Discord embeds.

---

## Changes — `confirmSlot` function only

All changes are inside `exports.confirmSlot` in `functions/match-proposals.js`.
No other files need to change.

### 1. Look up delivery targets (before the transaction)

Same pattern as `createProposal` — fetch bot registrations and leader Discord IDs.
Add this block BEFORE the `db.runTransaction(...)` call:

```javascript
// Pre-resolve notification delivery targets (outside transaction)
const [proposerBotReg, opponentBotReg] = await Promise.all([
    db.collection('botRegistrations').doc(proposal.proposerTeamId).get(),  // ← but we don't have proposal yet...
    db.collection('botRegistrations').doc(proposal.opponentTeamId).get()
]);
```

**Problem:** We don't have the proposal data until inside the transaction. Two options:
- **Option A:** Read the proposal doc once outside the transaction just for teamIds, then again inside for the actual transaction. Simple but one extra read.
- **Option B:** Move the bot registration lookups inside the transaction return, after we know the team IDs. Then write notification docs after the transaction.

**Go with Option B** — do the notification write AFTER the transaction succeeds (non-transactional).
This is fine because:
- Notification delivery is best-effort anyway
- If the transaction succeeds but notification write fails, the match is still correctly scheduled
- Avoids complicating the transaction with extra reads

### 2. After the transaction — write notification docs

After `const result = await db.runTransaction(...)`, add notification writes:

```javascript
// ── Notification writes (after transaction success) ──
// We need: both team docs, both bot registrations, confirmer's Discord info, other side's leader Discord info

const proposal = (await db.collection('matchProposals').doc(proposalId).get()).data();
const confirmingSide = result.side;  // Need to return this from transaction

// Fetch delivery targets in parallel
const [proposerBotReg, opponentBotReg] = await Promise.all([
    db.collection('botRegistrations').doc(proposal.proposerTeamId).get(),
    db.collection('botRegistrations').doc(proposal.opponentTeamId).get()
]);
const proposerBot = proposerBotReg.exists ? proposerBotReg.data() : null;
const opponentBot = opponentBotReg.exists ? opponentBotReg.data() : null;

// Fetch team docs for logos
const [proposerTeamDoc, opponentTeamDoc] = await Promise.all([
    db.collection('teams').doc(proposal.proposerTeamId).get(),
    db.collection('teams').doc(proposal.opponentTeamId).get()
]);
const proposerTeam = proposerTeamDoc.data();
const opponentTeam = opponentTeamDoc.data();

// Fetch confirmer's and other side leader's Discord IDs
const confirmingTeam = confirmingSide === 'proposer' ? proposerTeam : opponentTeam;
const otherTeam = confirmingSide === 'proposer' ? opponentTeam : proposerTeam;

let confirmerDiscordId = null;
let confirmerDisplayName = null;
const confirmerDoc = await db.collection('users').doc(userId).get();
if (confirmerDoc.exists) {
    const d = confirmerDoc.data();
    confirmerDiscordId = d.discordUserId || null;
    confirmerDisplayName = d.displayName
        || confirmingTeam.playerRoster?.find(p => p.userId === userId)?.displayName
        || null;
}

let otherLeaderDiscordId = null;
let otherLeaderDisplayName = null;
if (otherTeam.leaderId) {
    const leaderDoc = await db.collection('users').doc(otherTeam.leaderId).get();
    if (leaderDoc.exists) {
        const d = leaderDoc.data();
        otherLeaderDiscordId = d.discordUserId || null;
        otherLeaderDisplayName = d.displayName || null;
    }
}

// Logo URLs (small size for Discord embed icons)
const proposerLogoUrl = proposerTeam.activeLogo?.urls?.small || null;
const opponentLogoUrl = opponentTeam.activeLogo?.urls?.small || null;
```

### 3. Write `slot_confirmed` notification (always)

Sent to the OTHER side — "Team X confirmed Sun 22:30 CET".

```javascript
const slotNotifRef = db.collection('notifications').doc();

// Determine which side receives the notification (the OTHER side)
const recipientBot = confirmingSide === 'proposer' ? opponentBot : proposerBot;
const recipientTeam = confirmingSide === 'proposer' ? opponentTeam : proposerTeam;
const confirmingTeamName = confirmingSide === 'proposer' ? proposal.proposerTeamName : proposal.opponentTeamName;
const confirmingTeamTag = confirmingSide === 'proposer' ? proposal.proposerTeamTag : proposal.opponentTeamTag;
const recipientTeamName = confirmingSide === 'proposer' ? proposal.opponentTeamName : proposal.proposerTeamName;
const recipientTeamTag = confirmingSide === 'proposer' ? proposal.opponentTeamTag : proposal.proposerTeamTag;

await slotNotifRef.set({
    type: 'slot_confirmed',
    status: 'pending',
    proposalId,
    slotId,
    gameType,
    weekId: proposal.weekId,
    // Who confirmed
    confirmedByTeamId: confirmingSide === 'proposer' ? proposal.proposerTeamId : proposal.opponentTeamId,
    confirmedByTeamName: confirmingTeamName,
    confirmedByTeamTag: confirmingTeamTag,
    confirmedByUserId: userId,
    confirmedByDisplayName: confirmerDisplayName,
    confirmedByDiscordId: confirmerDiscordId,
    // Who receives this notification (the other side)
    recipientTeamId: confirmingSide === 'proposer' ? proposal.opponentTeamId : proposal.proposerTeamId,
    recipientTeamName,
    recipientTeamTag,
    // Delivery target for the recipient
    delivery: {
        botRegistered: recipientBot?.status === 'active',
        notificationsEnabled: recipientBot?.notificationsEnabled ?? false,
        channelId: recipientBot?.notificationChannelId ?? null,
        guildId: recipientBot?.guildId ?? null,
        leaderDiscordId: otherLeaderDiscordId,
        leaderDisplayName: otherLeaderDisplayName
    },
    // Logos
    proposerLogoUrl,
    opponentLogoUrl,
    // Links
    proposalUrl: `https://scheduler.quake.world/#/matches/${proposalId}`,
    createdAt: new Date(),
    deliveredAt: null
});
```

### 4. Write `match_sealed` notification (only when matched)

Sent to BOTH sides — "Match scheduled: X vs Y — Sun 22:30 CET".

```javascript
if (result.matched) {
    const now = new Date();

    // Notification to proposer side
    const matchNotifProposer = db.collection('notifications').doc();
    await matchNotifProposer.set({
        type: 'match_sealed',
        status: 'pending',
        proposalId,
        scheduledMatchId: result.scheduledMatchId,
        slotId,
        gameType,
        weekId: proposal.weekId,
        // Match info
        proposerTeamId: proposal.proposerTeamId,
        proposerTeamName: proposal.proposerTeamName,
        proposerTeamTag: proposal.proposerTeamTag,
        opponentTeamId: proposal.opponentTeamId,
        opponentTeamName: proposal.opponentTeamName,
        opponentTeamTag: proposal.opponentTeamTag,
        // This notification goes to proposer
        recipientTeamId: proposal.proposerTeamId,
        recipientTeamName: proposal.proposerTeamName,
        recipientTeamTag: proposal.proposerTeamTag,
        delivery: {
            botRegistered: proposerBot?.status === 'active',
            notificationsEnabled: proposerBot?.notificationsEnabled ?? false,
            channelId: proposerBot?.notificationChannelId ?? null,
            guildId: proposerBot?.guildId ?? null,
            // No DM fallback for match_sealed — both teams already engaged
        },
        proposerLogoUrl,
        opponentLogoUrl,
        proposalUrl: `https://scheduler.quake.world/#/matches/${proposalId}`,
        createdAt: now,
        deliveredAt: null
    });

    // Notification to opponent side
    const matchNotifOpponent = db.collection('notifications').doc();
    await matchNotifOpponent.set({
        type: 'match_sealed',
        status: 'pending',
        proposalId,
        scheduledMatchId: result.scheduledMatchId,
        slotId,
        gameType,
        weekId: proposal.weekId,
        proposerTeamId: proposal.proposerTeamId,
        proposerTeamName: proposal.proposerTeamName,
        proposerTeamTag: proposal.proposerTeamTag,
        opponentTeamId: proposal.opponentTeamId,
        opponentTeamName: proposal.opponentTeamName,
        opponentTeamTag: proposal.opponentTeamTag,
        // This notification goes to opponent
        recipientTeamId: proposal.opponentTeamId,
        recipientTeamName: proposal.opponentTeamName,
        recipientTeamTag: proposal.opponentTeamTag,
        delivery: {
            botRegistered: opponentBot?.status === 'active',
            notificationsEnabled: opponentBot?.notificationsEnabled ?? false,
            channelId: opponentBot?.notificationChannelId ?? null,
            guildId: opponentBot?.guildId ?? null,
        },
        proposerLogoUrl,
        opponentLogoUrl,
        proposalUrl: `https://scheduler.quake.world/#/matches/${proposalId}`,
        createdAt: now,
        deliveredAt: null
    });
}
```

### 5. Return `side` from the transaction

The transaction currently returns `{ matched, scheduledMatchId, matchDetails }`.
Add `side` to the return so we know which side confirmed (needed for notification targeting):

```javascript
// Inside the transaction, at the end:
return { matched, scheduledMatchId, side, matchDetails: ... };
```

### 6. Add logo URLs to existing `challenge_proposed` (in `createProposal`)

While we're at it, add logo URLs to the existing notification in `createProposal`:

```javascript
// In the notificationData object, add:
proposerLogoUrl: proposerTeam.activeLogo?.urls?.small || null,
opponentLogoUrl: opponentTeam.activeLogo?.urls?.small || null,
```

---

## Transaction vs post-transaction

- The `slot_confirmed` and `match_sealed` notification writes happen AFTER the transaction
- This is intentional — notifications are best-effort delivery signals
- If the Cloud Function crashes between transaction and notification write, the match/confirmation still happened correctly. The user just won't get a Discord notification (they'll see it on the website)
- This keeps the transaction lean — only match state mutations

---

## No other file changes

- No frontend changes needed
- No security rules changes (notifications already has `allow read, write: if false` — Admin SDK only)
- No schema changes (new notification types follow the same collection)

---

## Verification

1. Confirm a slot on one side → `notifications/` doc appears with `type: 'slot_confirmed'`
2. Confirm same slot on other side → TWO `notifications/` docs appear with `type: 'match_sealed'`
3. All notification docs include `proposerLogoUrl` and `opponentLogoUrl`
4. New proposals also include logo URLs in their notification doc
5. Bot picks up all three types and delivers embeds
