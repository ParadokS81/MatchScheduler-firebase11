# Phase 1a: Connect Voice Bot — Team Settings UI + Pending Registration

## Context

We're building multi-clan voice replay. The registration flow starts here in MatchScheduler — a team leader initiates the connection from their team settings page, then completes it in Discord by running `/register` on the bot (Phase 1b, separate project).

This phase adds:
1. A "Voice Bot" section to the team settings UI
2. A Cloud Function to create/delete pending bot registrations
3. A Firestore listener so the UI updates live when the bot completes registration

## Prerequisites

The leader must have their Discord linked on MatchScheduler (via Discord OAuth). The `discordUserId` field on their user profile is required — it becomes the authorization token that the bot checks.

## What to Build

### 1. Cloud Function: `manageBotRegistration`

A callable Cloud Function that handles connect and disconnect.

**Connect action:**
```javascript
// Input
{ action: 'connect', teamId: string }

// Validation:
// - Caller is authenticated
// - Caller is the leaderId of the team
// - Caller has discordUserId set on their user profile (not null)
// - No active registration already exists for this team

// Creates botRegistrations/{teamId}:
{
  teamId: teamId,
  teamTag: team.teamTag,
  teamName: team.teamName,
  authorizedDiscordUserId: callerUser.discordUserId,
  registeredBy: context.auth.uid,
  guildId: null,
  guildName: null,
  status: 'pending',
  knownPlayers: {},
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  activatedAt: null,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
}
```

**Disconnect action:**
```javascript
// Input
{ action: 'disconnect', teamId: string }

// Validation:
// - Caller is authenticated
// - Caller is the leaderId of the team

// Deletes botRegistrations/{teamId}
```

**Error cases:**
- "Discord not linked" → leader needs to link Discord first in profile settings
- "Already connected" → show current connection, offer disconnect
- "Not a team leader" → only leaders can manage bot registration

### 2. Firestore Security Rules

Add to `firestore.rules`:

```
match /botRegistrations/{teamId} {
  // Leaders can read their own team's registration (for UI status display)
  allow read: if request.auth != null
    && get(/databases/$(database)/documents/teams/$(teamId)).data.leaderId == request.auth.uid;

  // All writes via Cloud Function or Admin SDK (bot)
  allow write: if false;
}
```

### 3. Team Settings UI — "Voice Bot" Section

Add a section to the team settings area (visible only to the team leader). This section has three states:

**State: Not Connected** (no `botRegistrations/{teamId}` document exists)
```
┌─────────────────────────────────────┐
│ Voice Bot                           │
│                                     │
│ Connect a Discord voice bot to      │
│ automatically record and upload     │
│ match audio for your team.          │
│                                     │
│ [Connect Voice Bot]                 │
└─────────────────────────────────────┘
```

**State: Pending** (`status: 'pending'`, `guildId: null`)
```
┌─────────────────────────────────────┐
│ Voice Bot                      ⏳   │
│                                     │
│ Complete setup in Discord:          │
│ 1. Add the bot to your server       │
│    [Invite Bot →]                   │
│ 2. Run /register in any channel     │
│                                     │
│ [Cancel]                            │
└─────────────────────────────────────┘
```

**State: Connected** (`status: 'active'`, `guildId` populated)
```
┌─────────────────────────────────────┐
│ Voice Bot                      ✓    │
│                                     │
│ Connected to: Slackers              │
│ (Discord server)                    │
│                                     │
│ [Disconnect]                        │
└─────────────────────────────────────┘
```

### 4. Bot Invite Link

The invite link is a standard Discord OAuth2 URL:
```
https://discord.com/oauth2/authorize?client_id={BOT_CLIENT_ID}&permissions={PERMISSIONS}&scope=bot+applications.commands
```

**Bot Client ID**: This needs to be a configured constant. For now, the bot's client ID is `1470520759842640024`. Store this as a constant in the service or config — not hardcoded in the UI template.

**Permissions needed** (for voice recording + slash commands):
- Connect (to voice channels)
- Speak (required by discord.js voice)
- Use Slash Commands
- Send Messages (for DM confirmations)

The exact permissions integer can be calculated from Discord's permissions calculator. The Phase 1b (quad) prompt will confirm the exact value needed.

### 5. Service: BotRegistrationService

A frontend service to manage the bot registration state:

```javascript
// Call Cloud Function to create pending registration
async function connectBot(teamId) { ... }

// Call Cloud Function to delete registration
async function disconnectBot(teamId) { ... }

// Get current registration status (one-time read)
async function getRegistration(teamId) { ... }

// Real-time listener for registration status changes
// (so UI auto-updates when bot completes /register)
function onRegistrationChange(teamId, callback) { ... }
```

The listener is important — when the bot completes `/register` in Discord, the Firestore document updates from `pending` to `active` with guildName populated. The MatchScheduler UI should reflect this change in real-time without the leader needing to refresh.

## Firestore Schema for Reference

### `/botRegistrations/{teamId}` (new — this phase creates it)
```typescript
{
  teamId: string;                     // = document ID
  teamTag: string;
  teamName: string;
  authorizedDiscordUserId: string;    // Leader's Discord user ID
  registeredBy: string;               // Leader's Firebase UID
  guildId: string | null;             // null while pending
  guildName: string | null;
  status: 'pending' | 'active';
  knownPlayers: {};                   // Empty at creation
  createdAt: Timestamp;
  activatedAt: Timestamp | null;
  updatedAt: Timestamp;
}
```

### `/users/{userId}` (existing — read only)
```typescript
{
  discordUserId: string | null;       // Must not be null for connect to work
  discordUsername: string | null;
  teams: { [teamId: string]: true };
}
```

### `/teams/{teamId}` (existing — read only)
```typescript
{
  teamName: string;
  teamTag: string;
  leaderId: string;                   // Must match caller for authorization
}
```

## What NOT to Touch

- Do NOT modify the voiceRecordings collection or replay page (Phase 3)
- Do NOT add voiceSettings to teams yet (Phase 4)
- Do NOT modify any quad bot code (Phase 1b)
- Do NOT modify existing Cloud Functions or team operations

## Testing

1. As a team leader with Discord linked → "Connect Voice Bot" button should appear
2. Click connect → should create `botRegistrations/{teamId}` in Firestore with status: 'pending'
3. UI should show pending state with invite link and instructions
4. Manually update the Firestore doc to `status: 'active'` with a guildName → UI should auto-update to "Connected" state
5. Click disconnect → document should be deleted, UI returns to "Not connected"
6. As a non-leader → Voice Bot section should not appear
7. As a leader without Discord linked → should show "Link your Discord first" message on connect attempt
