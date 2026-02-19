# Slice 19.0c: Notification Trigger on Proposal Creation

**Dependencies:** Slice 19.0b (Challenge Lifecycle v2), 19.0a (Discord Settings)
**Parent Design:** `context/DISCORD-BRIDGE-DESIGN.md`
**User Story:** As a team leader, when I create a proposal, I want the system to automatically queue a notification for the opponent so they reliably learn about the challenge without me having to manually copy/paste a Discord message.
**Success Criteria:**
- [ ] When a proposal is created, a notification document is written to a new `notifications/` collection
- [ ] Notification contains all context needed for the bot to deliver: teams, timeslots, proposal link, delivery target info
- [ ] The quad bot can pick up the notification via a Firestore listener and deliver it
- [ ] Step 3 of ComparisonModal reflects that notification was sent (or will be sent)
- [ ] Notifications also created for proposer's own team channel (so your team knows)
- [ ] Fallback info included for teams without bot (opponent leader's Discord ID for DM)

---

## Problem Statement

After 19.0b, proposals are created with substance (pre-confirmed slots). But the opponent still only finds out via manual Discord DM. The "Contact on Discord" step (copy → paste → hope they see it) is unreliable and adds friction.

We need a Firestore-based notification queue that the quad bot can consume. This slice creates the **write side** — the MatchScheduler writes notification documents. The **read side** (quad bot delivering to Discord) is a separate quad task.

---

## Solution

### Architecture

```
createProposal Cloud Function
  │
  ├── Creates matchProposals/{id} (existing)
  │
  └── Creates notifications/{id} (NEW)
        │
        └── Quad bot listens → delivers to Discord
```

The `notifications/` collection is a **one-way queue**: MatchScheduler writes, quad bot reads and processes. This follows the same Firestore-as-a-bus pattern used by `standin_requests/`.

---

## Firestore Schema

### New collection: `/notifications/{notificationId}`

```typescript
interface NotificationDocument {
  // Identity
  type: 'challenge_proposed';           // Extensible for future types
  status: 'pending' | 'delivered' | 'failed';

  // Source
  proposalId: string;                   // Reference to matchProposals/{id}
  createdBy: string;                    // Firebase UID of the proposer

  // Teams
  proposerTeamId: string;
  proposerTeamName: string;
  proposerTeamTag: string;
  opponentTeamId: string;
  opponentTeamName: string;
  opponentTeamTag: string;

  // Challenge context
  weekId: string;
  gameType: 'official' | 'practice';
  confirmedSlots: Array<{
    slotId: string;                     // e.g., "sun_2130"
    proposerCount: number;              // Player count at confirm time
    opponentCount: number;
  }>;

  // Delivery targets (pre-resolved by Cloud Function)
  delivery: {
    // Opponent team delivery
    opponent: {
      botRegistered: boolean;           // Does opponent have a bot?
      notificationsEnabled: boolean;    // Are notifications turned on?
      channelId: string | null;         // Discord channel ID (if bot + notifications on)
      guildId: string | null;           // Discord guild ID
      leaderDiscordId: string | null;   // Fallback: DM the leader
      leaderDisplayName: string | null; // For DM personalization
    };
    // Proposer team delivery (notify your own team too)
    proposer: {
      botRegistered: boolean;
      notificationsEnabled: boolean;
      channelId: string | null;
      guildId: string | null;
    };
  };

  // Deep link
  proposalUrl: string;                  // https://scheduler.quake.world/#/matches/{proposalId}

  // Proposer info (for "DM ParadokS" button in embed)
  proposerLeaderDiscordId: string | null;
  proposerLeaderDisplayName: string | null;

  // Timestamps
  createdAt: Timestamp;
  deliveredAt: Timestamp | null;        // Set by quad bot on delivery

  // Delivery result (written by quad bot)
  deliveryResult?: {
    opponentChannelSent: boolean;
    opponentDmSent: boolean;
    proposerChannelSent: boolean;
    error?: string;
  };
}
```

**Why a separate collection (not a field on `matchProposals`)?**
- Clean separation of concerns — proposals are about scheduling, notifications are about delivery
- Quad bot only needs to listen to one collection for all notification types
- Future notification types (slot confirmed, match sealed, match cancelled) use the same collection
- Doesn't bloat the proposal document with delivery metadata
- Quad bot can mark delivery status without needing write access to proposals

---

## Cloud Function Changes

### Modified: `createProposal` (in `functions/match-proposals.js`)

After creating the proposal document (inside the transaction), also create a notification document:

```javascript
// After proposalData is built and ready to write...

// Pre-resolve delivery targets
const [opponentBotReg, proposerBotReg] = await Promise.all([
    db.collection('botRegistrations').doc(opponentTeamId).get(),
    db.collection('botRegistrations').doc(proposerTeamId).get()
]);

const opponentBot = opponentBotReg.exists ? opponentBotReg.data() : null;
const proposerBot = proposerBotReg.exists ? proposerBotReg.data() : null;

// Resolve opponent leader's Discord ID for DM fallback
let opponentLeaderDiscordId = null;
let opponentLeaderDisplayName = null;
if (opponentTeam.leaderId) {
    const leaderDoc = await db.collection('users').doc(opponentTeam.leaderId).get();
    if (leaderDoc.exists) {
        const leaderData = leaderDoc.data();
        opponentLeaderDiscordId = leaderData.discordUserId || null;
        opponentLeaderDisplayName = leaderData.displayName || null;
    }
}

// Resolve proposer leader's Discord ID (for "DM them" button in opponent's embed)
let proposerLeaderDiscordId = null;
let proposerLeaderDisplayName = null;
const proposerUser = proposerTeam.playerRoster?.find(p => p.userId === userId);
const proposerUserDoc = await db.collection('users').doc(userId).get();
if (proposerUserDoc.exists) {
    proposerLeaderDiscordId = proposerUserDoc.data().discordUserId || null;
    proposerLeaderDisplayName = proposerUserDoc.data().displayName || proposerUser?.displayName || null;
}

// Build confirmed slots with counts
const confirmedSlotsWithCounts = confirmedSlots.map(slotId => ({
    slotId,
    proposerCount: (proposerAvail.slots?.[slotId] || []).length,
    opponentCount: (opponentAvail.slots?.[slotId] || []).length
}));

// Create notification document
const notificationRef = db.collection('notifications').doc();
const notificationData = {
    type: 'challenge_proposed',
    status: 'pending',
    proposalId: proposalRef.id,
    createdBy: userId,
    proposerTeamId,
    proposerTeamName: proposerTeam.teamName,
    proposerTeamTag: proposerTeam.teamTag,
    opponentTeamId,
    opponentTeamName: opponentTeam.teamName,
    opponentTeamTag: opponentTeam.teamTag,
    weekId,
    gameType,
    confirmedSlots: confirmedSlotsWithCounts,
    delivery: {
        opponent: {
            botRegistered: opponentBot?.status === 'active',
            notificationsEnabled: opponentBot?.notifications?.enabled !== false,
            channelId: opponentBot?.notifications?.channelId || null,
            guildId: opponentBot?.guildId || null,
            leaderDiscordId: opponentLeaderDiscordId,
            leaderDisplayName: opponentLeaderDisplayName,
        },
        proposer: {
            botRegistered: proposerBot?.status === 'active',
            notificationsEnabled: proposerBot?.notifications?.enabled !== false,
            channelId: proposerBot?.notifications?.channelId || null,
            guildId: proposerBot?.guildId || null,
        }
    },
    proposalUrl: `https://scheduler.quake.world/#/matches/${proposalRef.id}`,
    proposerLeaderDiscordId,
    proposerLeaderDisplayName,
    createdAt: now,
    deliveredAt: null,
};

// Add to the existing transaction
await db.runTransaction(async (transaction) => {
    transaction.set(proposalRef, proposalData);
    transaction.set(notificationRef, notificationData);  // NEW
    transaction.set(db.collection('eventLog').doc(eventId), { /* existing event */ });
});
```

**Note:** The `botRegistrations` and `users` reads happen OUTSIDE the transaction (they're not part of the atomic proposal creation — if delivery info is slightly stale, the bot can handle it). Only the notification document write is inside the transaction to ensure it's created atomically with the proposal.

Actually, correction: Firestore transactions require all reads before writes. The botRegistration and user reads should happen before `db.runTransaction()`, and only the writes go inside. This is already the pattern — just adding one more `transaction.set()` call.

---

## Frontend Changes

### ComparisonModal.js — Step 3 update

After proposal creation succeeds, Step 3 now shows:

```
Step 3: Sent ✓
Proposal created with 2 timeslots.
Opponent will be notified.

[DM their leader]  [Copy Message]   ← optional, secondary
[Done]
```

The "Opponent will be notified" text replaces the current "Contact Leader" as the primary action. The Discord DM buttons remain as secondary options for teams that prefer the personal touch.

**If opponent has no bot and no Discord linked:**
```
Step 3: Created ✓
Proposal created with 2 timeslots.
Share the link with your opponent:

[Copy Link]
[Done]
```

### MobileCompareDetail.js — Post-proposal

After successful proposal creation, the toast message changes from "Proposal created!" to "Proposal sent! Opponent will be notified." Then closes sheet and opens MobileProposalDetail as before.

---

## Firestore Security Rules

### New rules for `/notifications/{notificationId}`

```javascript
match /notifications/{notificationId} {
    // Team members of involved teams can read (for UI status display)
    allow read: if request.auth != null &&
        resource.data.delivery != null &&
        (request.auth.uid in getTeamMembers(resource.data.proposerTeamId) ||
         request.auth.uid in getTeamMembers(resource.data.opponentTeamId));

    // Only Cloud Functions (Admin SDK) can write
    // Quad bot uses Admin SDK, so also bypasses rules
    allow write: if false;
}
```

Actually, for v1 simplicity: notifications don't need to be readable by the frontend at all. The frontend doesn't display notification status. So:

```javascript
match /notifications/{notificationId} {
    allow read, write: if false;  // Admin SDK only (Cloud Functions + Quad bot)
}
```

---

## What This Slice Does NOT Include

- Quad bot reading and delivering notifications (that's quad-side work)
- Notification status display in MatchScheduler UI (future — showing "delivered" badge)
- Other notification types (slot confirmed, match sealed, etc.) — just the `challenge_proposed` type
- Retry logic for failed deliveries (the bot handles this)
- Notification preferences beyond on/off (granularity is future)

---

## Testing Checklist

1. Create a proposal via the new 19.0b flow → verify `notifications/` document created in Firestore
2. Check notification document has correct teams, timeslots, delivery targets
3. Verify opponent's bot registration info is correctly resolved (or null if no bot)
4. Verify proposer's bot registration info is correctly resolved
5. Verify opponent leader's Discord ID is resolved for DM fallback
6. Verify proposer leader's Discord ID is included (for "DM them" button in embed)
7. Create proposal for team WITHOUT bot → delivery.opponent.botRegistered = false
8. Create proposal for team WITH bot but notifications off → delivery.opponent.notificationsEnabled = false
9. Step 3 in ComparisonModal shows "Opponent will be notified" text
10. Firestore rules: verify frontend cannot read/write notifications (Admin SDK only)
