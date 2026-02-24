# Discord Bridge & Challenge Lifecycle v2 — Design Document

**Status:** Draft — conceptual design, pre-implementation
**Date:** 2026-02-19
**Scope:** MatchScheduler + quad bot (cross-project)

---

## Problem Statement

The challenge lifecycle has friction at both ends:

1. **Entry:** Proposals are created as empty "open contracts" — no timeslots attached. The proposer must separately confirm slots later. There's no minimum viability gate, so weak proposals (1v1, 2v2) can be created and forgotten.

2. **Delivery:** Opponent notification is entirely manual — copy a clipboard message, open Discord DM, paste. If the opponent leader doesn't check Discord or misses the DM, the proposal sits there unseen.

3. **Adoption:** Teams like The Axemen use internal scheduling tools but don't keep the scheduler updated. There's no feedback loop — no nudge when a challenge arrives, no visibility into proposals from within Discord where players actually live.

The quad bot already bridges MatchScheduler ↔ Discord for standin requests and voice recording. Extending this bridge to challenge notifications is the natural next step.

---

## Design Principles

- **The scheduler supplements, it doesn't replace.** Players have scheduled matches via DMs for 25 years. The tool makes it smoother, not different.
- **Proposals should be credible.** If a proposal exists, it should have a real chance of becoming a match. The 4v3 gate ensures this.
- **Meet players where they are.** Discord is home. The bot brings scheduler events into Discord, not the other way around.
- **Personal involvement stays.** The bot notification doesn't replace the DM — it ensures the opponent *knows*, and gives them a shortcut to respond.
- **Living documents.** Proposals show all viable slots, not just the ones originally selected. Availability changes are reflected in real-time.

---

## Feature Areas

### 1. Challenge Lifecycle v2 (MatchScheduler)

**Current flow:**
```
Compare → Propose (empty) → Copy message → Paste in Discord DM
→ Separately confirm timeslots later → Hope they confirm back
```

**New flow (atomic):**
```
Compare (need 4v3+ to propose) → Select game type → Select 1+ timeslots → Propose
→ Bot notifies opponent automatically → Proposal shows all viable slots
→ Mutual confirmation on any slot → Match sealed
```

**Key changes:**
- **4v3 minimum gate:** The "Propose" button is disabled unless at least one 4v3+ overlap exists. 3v3 browsing in comparison mode is fine for scanning, but you can't create a proposal without sufficient overlap. Applies to both official and practice matches (standin button gives +1, so you really only need 3 of your own).
- **Atomic proposal:** Game type selection + timeslot selection + proposal creation = one action. The proposer selects 1+ preferred timeslots which become pre-confirmed on the proposer's side. No separate confirmation step needed for those initial slots.
- **Full viable set visible:** The proposal still shows ALL 4v3+ viable slots for the week, not just the ones the proposer selected. The opponent can confirm a proposer-selected slot, or suggest a different viable one. This keeps the "living document" nature intact.
- **Auto-notification on propose:** Creating the proposal triggers the bot notification. No manual copy/paste step. The "Contact on Discord" button can remain as a supplementary option, but the primary delivery is automated.

### 2. Bot Notification System (quad bot — new module)

A new `scheduler` module in quad that listens for scheduler events via Firestore and delivers Discord notifications.

**Notification delivery cascade:**
```
Team has bot registered + notifications enabled?
  → Post in their configured notification channel

Team has bot but notifications disabled?
  → Nothing (they opted out)

Team has NO bot registered?
  → DM the opponent team leader directly (if Discord linked)
```

**Challenge notification content:**
```
┌─────────────────────────────────────────────┐
│  ⚔️  New Challenge                          │
│                                              │
│  ]SR[ Slackers challenged oeks The Axemen   │
│  Week 08 · Official                          │
│                                              │
│  Proposed times:                             │
│  ▸ Sun 22:30 (4v4)                          │
│  ▸ Sun 23:00 (4v4)                          │
│                                              │
│  [View Proposal]  [DM ParadokS]             │
└─────────────────────────────────────────────┘
```

- **View Proposal** → link to scheduler: `https://scheduler.quake.world/#/matches/{proposalId}`
- **DM ParadokS** → Discord DM deep link to challenger's leader

**Also posts in challenger's own team channel** — so your team knows a challenge went out.

**Future notification types (not in v1, but the infrastructure supports them):**
- Slot confirmed by opponent ("They confirmed Wed 20:00 — confirm to seal it")
- Match sealed ("Match confirmed: You vs Them, Wed 20:00")
- Match cancelled
- Team member availability reminders (separate feature)

### 3. Bot Configuration UI (MatchScheduler — Edit Team Modal → Discord tab)

Expand the existing Discord tab to include:

**Current state:**
- Voice Bot connection status
- Recording visibility toggle
- Disconnect button

**Expanded:**
- **Player mapping display** — show current `knownPlayers` mapping (discordUser → QW name), read-only for now
- **Notification settings:**
  - Notifications on/off toggle
  - Channel selector (which channel in their Discord to post in)
- **Auto-recording settings:**
  - Auto-record on/off toggle
  - Minimum players to trigger (3 or 4)
  - Record for: officials only / practice too / all sessions

### 4. Auto-Recording (quad bot — enhancement to recording module)

```
3+ known players detected in voice channel
  → Bot auto-joins and starts recording
  → Posts in configured channel: "Recording started"

All known players leave (or below threshold)
  → Bot stops recording and leaves
  → Processing pipeline triggers as normal
```

Configuration stored in Firestore via the bot settings UI, read by the bot via `botRegistrations` document.

---

## Firestore Schema Changes

### New/modified collections:

**`botRegistrations/{docId}`** — extend with notification + auto-record config:
```javascript
{
  // ... existing fields (teamId, guildId, knownPlayers, status, etc.)

  // NEW: Notification settings
  notifications: {
    enabled: true,
    channelId: '1234567890',        // Discord channel ID for bot messages
    channelName: 'qw-scheduling',   // Display name (denormalized for UI)
  },

  // NEW: Auto-recording settings
  autoRecord: {
    enabled: false,
    minPlayers: 3,                  // 3 or 4
    mode: 'all',                    // 'official' | 'practice' | 'all'
  },
}
```

**`matchProposals/{proposalId}`** — modify creation flow:
```javascript
{
  // ... existing fields

  // CHANGED: proposerConfirmedSlots populated at creation time (not empty)
  proposerConfirmedSlots: {
    'sun_2130': { userId: '...', countAtConfirm: 4, gameType: 'official' },
    'sun_2200': { userId: '...', countAtConfirm: 4, gameType: 'official' },
  },

  // NEW: Track notification delivery
  notificationSent: {
    opponentChannel: true,          // Posted in their Discord channel
    opponentDM: false,              // Or sent as leader DM
    proposerChannel: true,          // Posted in own team channel
    sentAt: Timestamp,
  },
}
```

**No new collections needed** — we extend existing documents and use the existing Firestore-as-a-bus pattern from the standin module.

---

## Implementation Phases

### Phase 1: Foundation — Bot Config UI + Challenge Lifecycle v2

**MatchScheduler side:**
- Expand Edit Team Modal → Discord tab with player mapping display, notification settings, auto-record settings
- Store config in `botRegistrations` document
- Modify `createProposal` Cloud Function to accept pre-confirmed slots
- Add 4v3 minimum gate to ComparisonModal (disable Propose if no 4v3+ slot)
- Update ComparisonModal flow: game type → timeslot selection → propose (atomic)
- Write `notificationSent` field on proposal for bot to detect

**Quad bot side:**
- New `scheduler` module (follows standin module pattern)
- Listener on `matchProposals` for new proposals
- Send Discord embed to opponent's configured channel (or DM fallback)
- Also post in proposer's team channel

### Phase 2: Auto-Recording

**Quad bot side:**
- Enhance recording module to monitor voice channel membership
- Cross-reference with `knownPlayers` from `botRegistrations`
- Auto-join when threshold met, auto-leave when players leave
- Respect `autoRecord` config from Firestore

### Phase 3: Expanded Notifications (future)

- Slot confirmation notifications
- Match sealed notifications
- Match cancellation notifications
- Availability reminder nudges (separate feature, team-internal)

---

## Architecture — How It Fits

```
MatchScheduler (Web App)
  │
  │ createProposal() Cloud Function
  │   → Creates proposal WITH confirmed slots
  │   → Writes notificationSent.pending = true
  │
  ▼
Firestore: matchProposals/{id}
  │
  │ onSnapshot listener (quad scheduler module)
  │
  ▼
Quad Bot — Scheduler Module
  │
  ├─ Reads botRegistrations for opponent team
  │   → Has bot? → Post in configured channel
  │   → No bot? → DM leader (via users/{leaderId}.discordUserId)
  │
  ├─ Reads botRegistrations for proposer team
  │   → Post in their channel too
  │
  └─ Updates matchProposals/{id}.notificationSent
     → Marks delivery status
```

This follows the exact same Firestore-as-a-bus pattern used by the standin module. No new infrastructure needed.

---

## Open Questions

1. **Channel discovery:** How does the bot know which channels exist in the guild? Should the config UI show a dropdown of channels (requires bot API call to list them), or should teams type/paste a channel ID?
2. **Rate limiting:** Should there be any cooldown on challenge notifications to prevent spam?
3. **Notification granularity:** Start with all-or-nothing toggle, or per-event-type toggles from day one?
4. **DM fallback format:** Should the leader DM look different from the channel post? (e.g., more personal tone vs. broadcast style)
5. **Auto-record voice channel scope:** Should the bot monitor ALL voice channels in the guild, or only the one the team typically uses? (configurable?)
