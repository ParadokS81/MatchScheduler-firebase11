# Slice 19.0a: Discord Settings Panel Expansion

**Dependencies:** Slice A3 (Discord panel foundation), Bot Registration system
**Parent Design:** `context/DISCORD-BRIDGE-DESIGN.md`
**User Story:** As a team leader, I want to see my bot's player mapping, configure notification delivery, and set up auto-recording preferences — all from the Discord tab in Edit Team Modal.
**Success Criteria:**
- [ ] Player mapping section shows current `knownPlayers` (Discord name → QW name) in a readable list
- [ ] Notification settings section with on/off toggle and channel selector
- [ ] Auto-recording settings section with on/off toggle, min-player threshold, and mode selector
- [ ] All settings persisted to `botRegistrations/{teamId}` document via Cloud Function
- [ ] Settings only visible when bot status is `'active'` (not pending/disconnected)
- [ ] Quad bot can read these settings from `botRegistrations` to configure its behavior

---

## Problem Statement

The Discord tab currently shows only: connection status, guild name, recording visibility toggle, and disconnect button. There's no way to see which players the bot recognizes, no way to configure notifications, and no way to set up auto-recording. Team leaders must ask the bot admin to configure these things manually.

---

## Solution

Expand the Discord tab with three new sections below the existing Voice Bot connection area. All sections are only visible when the bot is connected (`status: 'active'`). Settings are stored as new fields on the existing `botRegistrations/{teamId}` document — no new collections needed.

---

## UI Layout (Discord Tab — Active State)

```
┌─────────────────────────────────────────────────┐
│ Voice Bot                          Connected ●   │
│ ┌─────────────────────────────────────────────┐ │
│ │ Slackers                                    │ │
│ │ Discord server                              │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ Recording visibility                      [===●] │
│ New recordings visible to team members only      │
│                                                  │
│ [Disconnect]                                     │
├──────────────────────────────────────────────────┤
│ Player Mapping                                   │
│                                                  │
│ Players the bot recognizes in voice:             │
│ ┌──────────────────────────────────────────────┐│
│ │ ParadokS (Discord) → ParadokS (QW)          ││
│ │ razor_sr (Discord) → razor (QW)             ││
│ │ zero123 (Discord) → zero (QW)               ││
│ │ grisling (Discord) → grisling (QW)          ││
│ └──────────────────────────────────────────────┘│
│ ⓘ Run /register in Discord to refresh mapping   │
├──────────────────────────────────────────────────┤
│ Notifications                                    │
│                                                  │
│ Challenge notifications                   [●===] │
│ Get notified when opponents challenge you        │
│                                                  │
│ Post in channel:                                 │
│ ┌──────────────────────────────────────────────┐│
│ │ # qw-scheduling                          ▼  ││
│ └──────────────────────────────────────────────┘│
│ ⓘ Bot must have access to the selected channel   │
├──────────────────────────────────────────────────┤
│ Auto-Recording                                   │
│                                                  │
│ Auto-record when players join voice       [●===] │
│                                                  │
│ Start recording when:                            │
│ ( ● ) 3+ team members in voice                  │
│ (   ) 4+ team members in voice                  │
│                                                  │
│ Record for:                                      │
│ [All sessions ▼]                                │
│ Options: All sessions / Officials only /         │
│          Practice only                           │
└──────────────────────────────────────────────────┘
```

---

## Firestore Schema Changes

### Modified: `/botRegistrations/{teamId}`

Add three new fields to the existing document:

```typescript
interface BotRegistrationDocument {
  // ... existing fields unchanged ...

  // NEW: Notification settings (written by MatchScheduler, read by quad)
  notifications?: {
    enabled: boolean;               // Default: true on first save
    channelId: string | null;       // Discord channel ID — null = DM leader fallback
    channelName: string | null;     // Denormalized for display (e.g., "qw-scheduling")
  };

  // NEW: Auto-recording settings (written by MatchScheduler, read by quad)
  autoRecord?: {
    enabled: boolean;               // Default: false
    minPlayers: 3 | 4;             // Default: 3
    mode: 'all' | 'official' | 'practice';  // Default: 'all'
  };
}
```

**Why on botRegistrations?** The quad bot already reads this document. Adding fields here means zero new queries for the bot — it just reads more fields from the same doc it already watches.

**Default behavior:** If `notifications` field is absent, the bot treats it as `{ enabled: true, channelId: null }` — notifications on, DM fallback. This means existing registrations work without migration.

---

## Cloud Function Changes

### Modified: `manageBotRegistration` (in `functions/bot-registration.js`)

Add a new action: `'updateSettings'`

```javascript
// New action handler
async function _handleUpdateSettings(data, context, teamDoc) {
    const { teamId, notifications, autoRecord } = data;

    // Validate caller is leader or scheduler (same check as connect/disconnect)
    // Validate field shapes
    // Update botRegistrations/{teamId} with provided fields (merge)

    // Only update fields that were provided
    const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (notifications !== undefined) updateData.notifications = notifications;
    if (autoRecord !== undefined) updateData.autoRecord = autoRecord;

    await admin.firestore().doc(`botRegistrations/${teamId}`).update(updateData);
    return { success: true };
}
```

---

## Channel Selection

### How channel discovery works

The bot needs to tell the scheduler which channels are available. Two approaches:

**Option A (recommended): Bot writes available channels to botRegistrations on activation**
- When quad bot activates (status → 'active'), it reads the guild's text channels
- Writes `availableChannels: [{ id, name }]` to the registration doc
- The Discord tab reads this list and shows a dropdown
- Bot refreshes this list periodically or on channel changes

**Option B: Manual channel ID entry**
- User types/pastes a channel ID or name
- Simpler but worse UX

**Go with Option A.** The quad bot already writes to `botRegistrations` on activation — it just needs to include the channel list. Add to schema:

```typescript
// Written by quad bot, read by MatchScheduler UI
availableChannels?: Array<{
  id: string;          // Discord channel ID
  name: string;        // Channel name (e.g., "qw-scheduling")
}>;
```

---

## Frontend Implementation

### TeamManagementModal.js changes

**New render functions** (add below `_renderVoiceBotSection`):

1. `_renderPlayerMappingSection()` — reads `_botRegistration.knownPlayers`, renders list
2. `_renderNotificationSettingsSection()` — toggle + channel dropdown
3. `_renderAutoRecordSection()` — toggle + radio buttons + mode dropdown

**State management:**
- All new sections read from `_botRegistration` (already loaded and live-updated)
- Settings changes call `BotRegistrationService.updateSettings(teamId, { notifications | autoRecord })`
- Optimistic UI updates with error recovery (same pattern as visibility toggle)

**New service function:**

```javascript
// BotRegistrationService.js
async updateSettings(teamId, settings) {
    return callCloudFunction('manageBotRegistration', {
        action: 'updateSettings',
        teamId,
        ...settings
    });
}
```

### Rerender strategy

When settings change:
- Optimistically update `_botRegistration` in memory
- Update UI immediately (toggle state, dropdown selection)
- Call Cloud Function in background
- On error: revert `_botRegistration` and re-render

When bot registration listener fires (e.g., quad writes `availableChannels`):
- Full re-render of all Discord sections (existing pattern via `_rerenderVoiceBotSection`)

---

## What This Slice Does NOT Include

- Actually sending notifications (that's slice 19.0c + quad scheduler module)
- Actually implementing auto-recording in the bot (that's Phase 2)
- Per-event-type notification granularity (future — start with single on/off)
- Editing player mappings from the UI (read-only display — edits happen via `/register` in Discord)

This slice builds the **configuration surface**. The bot reads these settings later when notification and auto-recording features are implemented.

---

## Testing Checklist

1. Open Edit Team Modal → Discord tab with a connected bot
2. Verify player mapping section shows current knownPlayers
3. Toggle notifications on/off → verify persisted to Firestore
4. Select a notification channel from dropdown → verify persisted
5. Toggle auto-record on/off → verify persisted
6. Change min-player threshold → verify persisted
7. Change recording mode → verify persisted
8. Close and reopen modal → verify all settings preserved
9. Verify settings are NOT visible when bot is in pending state
10. Verify settings are NOT visible when bot is disconnected
