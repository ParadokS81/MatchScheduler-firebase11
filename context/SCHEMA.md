# Firestore Schema Reference

This document defines the authoritative data structures for all Firestore collections in MatchScheduler.

---

## Collections Overview

| Collection | Document ID Format | Purpose |
|------------|-------------------|---------|
| `users` | `{userId}` (Firebase Auth UID) | User profiles, team memberships, and single availability template |
| `teams` | Auto-generated | Team information and rosters |
| `availability` | `{teamId}_{weekId}` | Weekly availability per team |
| `eventLog` | Custom format | Audit trail for team operations |
| `matchProposals` | Auto-generated | Match proposals between teams |
| `scheduledMatches` | Auto-generated | Confirmed scheduled matches |
| `voiceRecordings` | `{demoSha256}` | Voice recording manifests for replay auto-load |
| `botRegistrations` | `{teamId}` | Voice bot connection status per team |
| `notifications` | Auto-generated | Challenge/match notification delivery to Discord |
| `deletionRequests` | Auto-generated | Cross-system recording deletion coordination |
| `weeklyStats` | `{weekId}` (YYYY-WW) | Weekly platform activity stats (admin-only) |
| `recordingSessions` | Auto-generated | Voice recording session tracking (admin-only) |

---

## `/users/{userId}`

User profile and team membership tracking.

```typescript
interface UserDocument {
  // Core profile
  displayName: string;        // 3-20 chars, user's display name
  initials: string;           // 2-4 chars, uppercase, unique per team
  email: string;              // From Google Auth
  photoURL: string | null;    // Computed URL for grid display, based on avatarSource

  // Avatar customization (Slice 4.3.3)
  // Simplified: single photoURL (128px max), CSS handles display sizing
  avatarSource: 'custom' | 'discord' | 'google' | 'initials';  // User's preferred avatar source (no 'default' - use initials as fallback)
  discordAvatarHash: string | null;  // Discord avatar hash for CDN URL construction

  // Discord integration (Slice 4.3/4.4)
  // Can be populated via: Discord OAuth linking, or manual entry (legacy)
  discordUsername: string | null;   // Display name: "username" (new format) or "user#1234" (legacy)
  discordUserId: string | null;     // Numeric ID: "123456789012345678" - required for DM deep links
  discordLinkedAt: Timestamp | null; // When Discord was linked via OAuth (null if manual entry)

  // DEPRECATED: Use discordUsername instead
  discordTag: string | null;  // e.g., "username#1234" or "username" - kept for backwards compatibility

  // Team memberships (max 2 teams)
  teams: {
    [teamId: string]: true    // Map of team IDs user belongs to
  };

  // Favorites (for comparison workflow)
  favoriteTeams: string[];    // Array of teamIds the user has starred

  // Player color assignments (Slice 5.0.1)
  // Per-user preference for how other players appear in the grid
  playerColors: {
    [targetUserId: string]: string  // Hex color, e.g., "#FF6B6B"
  } | null;

  // Timezone preference (Slice 7.0)
  timezone: string | null;     // IANA timezone, e.g., "Europe/Stockholm"
                               // Default: null (auto-detected from browser)
                               // Used for: grid display conversion, slot UTC mapping

  // Timeslot visibility preference (Slice 12.0c)
  hiddenTimeSlots: string[] | null;  // Array of HHMM time slots to hide, e.g., ["1800", "1830"]
                                     // Default: null (all 11 slots visible)
                                     // Max 7 hidden (min 4 must remain visible)
                                     // Valid values: 1800, 1830, 1900, 1930, 2000, 2030, 2100, 2130, 2200, 2230, 2300

  // Extra timeslots outside base range (Slice 14.0a)
  extraTimeSlots: string[] | null;   // CET HHMM strings outside base 1800-2300 range
                                     // Default: null (no extra slots)
                                     // Example: ['1200', '1230', '1300', '1330']
                                     // Max: 37 entries (48 total - 11 base)
                                     // Validated by updateProfile Cloud Function

  // Availability template (Phase A1 — single template per user)
  template?: {
    slots: string[];              // UTC slot IDs: ["mon_1900", "tue_2000", ...]
    recurring: boolean;           // Auto-apply to new weeks (Phase A4 will use this)
    lastAppliedWeekId: string;    // ISO week last auto-applied to (e.g., "2026-10")
    updatedAt: Timestamp;
  };
  // Absent/undefined if the user has never saved a template.

  // Phantom user support (Discord Roster Management)
  isPhantom?: boolean;           // true = created by team leader, never logged in
  phantomCreatedBy?: string;     // Firebase UID of the leader who created this phantom

  // Metadata
  createdAt: Timestamp;
  lastUpdatedAt: Timestamp;
}
```

**Key Points:**
- `teams` is an object/map, NOT an array
- Check team membership: `userProfile.teams[teamId] === true`
- Max 2 teams per user enforced at write time
- Phantom users have a real Firebase Auth UID but `isPhantom: true`. When the real person logs in via Discord OAuth, the phantom is claimed in place (same UID, no migration)

---

## `/teams/{teamId}`

Team information with embedded roster.

```typescript
interface TeamDocument {
  // Identity
  teamName: string;           // 3-30 chars
  teamTag: string;            // 1-4 chars, case-sensitive, matches QW in-game tag (PRIMARY tag)
                               // Used for QW Hub API lookups (hub.quakeworld.nu)
                               // Special chars allowed: []()-_.,!
                               // Always kept in sync with the isPrimary tag from teamTags[]

  // Tag collection for stats aggregation (Slice 5.3)
  teamTags?: TeamTagEntry[];   // All tags this team has played under
                               // One must be isPrimary: true (synced to teamTag)
                               // Used by QWHub + QWStats to aggregate match history

  // Leadership
  leaderId: string;           // userId of team leader
  schedulers: string[];       // userIds who can propose/confirm matches (leader is always implicit)

  // Privacy (Slice 9.0b)
  hideRosterNames: boolean;   // Default: false. When true, comparison views show "X available" instead of player names
  hideFromComparison: boolean; // Default: false. When true, team is invisible in comparison mode

  // Configuration
  divisions: string[];        // e.g., ["D1", "D2"]
  maxPlayers: number;         // Max roster size
  joinCode: string;           // 6-char alphanumeric, unique
  status: 'active' | 'archived';

  // Roster (embedded array)
  playerRoster: PlayerEntry[];

  // Logo (optional, set when team uploads a logo)
  activeLogo?: {
    logoId: string;           // References /teams/{teamId}/logos/{logoId}
    urls: {
      large: string;          // 400px - for large displays
      medium: string;         // 150px - for drawer, cards
      small: string;          // 48px - for badges, comparison view
    };
  };

  // Voice recording settings (Phase 2 — read by Quad bot at upload time)
  voiceSettings?: {
    defaultVisibility: 'public' | 'private';  // Applied to new recordings at upload
  };

  // Metadata
  createdAt: Timestamp;
  lastActivityAt: Timestamp;
}

interface PlayerEntry {
  userId: string;             // Reference to /users/{userId}
  displayName: string;        // Denormalized from user profile
  initials: string;           // Denormalized from user profile
  photoURL: string | null;    // Denormalized for avatar display (128px, CSS handles sizing)
  joinedAt: Date;             // When they joined the team
  role: 'leader' | 'member';

  // Phantom support (Discord Roster Management)
  isPhantom?: boolean;        // true for leader-created phantoms (never logged in)
  discordUserId?: string;     // Discord UID for cross-reference with guildMembers
}

interface TeamTagEntry {
  tag: string;                // 1-4 chars, QW in-game tag (case-sensitive)
  isPrimary: boolean;         // Exactly one must be true; synced to teamTag field
}
```

---

## `/teams/{teamId}/logos/{logoId}`

Team logo versions (subcollection). Stores history of uploaded logos.

```typescript
interface LogoDocument {
  status: 'active' | 'archived';  // Only one logo is 'active' at a time
  uploadedBy: string;             // userId who uploaded
  uploadedAt: Timestamp;
  urls: {
    large: string;                // 400px signed URL
    medium: string;               // 150px signed URL
    small: string;                // 48px signed URL
  };
}
```

**Key Points:**
- Subcollection under team document
- Only one logo has `status: 'active'` at any time
- Previous logos are set to `status: 'archived'` when a new logo is uploaded
- URLs are Firebase Storage signed URLs with long expiration
- Cloud Function `processLogoUpload` manages this collection

**Key Points:**
- `playerRoster` is an ARRAY, not an object
- Check if user is on team: `playerRoster.some(p => p.userId === userId)`
- Find player: `playerRoster.find(p => p.userId === userId)`
- Roster data is denormalized - must update when user profile changes
- `joinedAt` uses regular `Date` (not `Timestamp`) for array compatibility

---

## `/availability/{teamId}_{weekId}`

Weekly availability grid for a team.

```typescript
interface AvailabilityDocument {
  // Identity
  teamId: string;             // Reference to /teams/{teamId}
  weekId: string;             // ISO week format: "YYYY-WW" (e.g., "2026-04")

  // Availability data
  slots: {
    [slotId: string]: string[] // Array of userIds available for this slot
  };

  // Metadata
  lastUpdated: Timestamp;
}
```

**Slot ID Format:** `{day}_{time}` (UTC)
- Day: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`
- Time: Any half-hour in UTC (`0000`-`2330`). Display range varies by user timezone.
- Examples: `mon_1700` (UTC, displays as 18:00 CET), `tue_0200` (UTC, displays as 21:00 EST)
- All slot IDs represent UTC times. TimezoneService converts for display.

**Week ID Format:** `YYYY-WW`
- ISO week number with leading zero
- Examples: `2026-04`, `2026-12`, `2026-52`

**Example Document:**
```json
{
  "teamId": "abc123",
  "weekId": "2026-04",
  "slots": {
    "mon_1800": ["user1", "user2", "user3"],
    "mon_1830": ["user1"],
    "tue_2000": ["user2", "user3"],
    "fri_2100": ["user1", "user2"]
  },
  "lastUpdated": "<Timestamp>"
}
```

**Key Points:**
- Document ID is composite: `{teamId}_{weekId}`
- Empty slots are NOT stored (sparse storage)
- Use `arrayUnion`/`arrayRemove` for atomic updates
- Check if user available: `slots[slotId]?.includes(userId)`

---

## `/eventLog/{eventId}`

Audit trail for important operations.

```typescript
interface EventLogDocument {
  eventId: string;            // Matches document ID
  teamId: string;
  teamName: string;

  // Event classification
  type: EventType;
  category: EventCategory;

  // Timing
  timestamp: Date;

  // Event-specific data
  userId?: string;            // User who triggered event
  player?: {
    displayName: string;
    initials: string;
  };
  details?: Record<string, any>;
}

type EventCategory =
  | 'TEAM_LIFECYCLE'          // Team created, archived
  | 'TEAM_SETTINGS'           // Settings changed
  | 'PLAYER_MOVEMENT'         // Join, leave
  | 'SCHEDULING';             // Match proposals and scheduling

type EventType =
  | 'TEAM_CREATED'
  | 'TEAM_ARCHIVED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'SETTINGS_UPDATED'
  | 'TEAM_TAGS_UPDATED'
  | 'JOIN_CODE_REGENERATED'
  | 'PROPOSAL_CREATED'
  | 'SLOT_CONFIRMED'
  | 'MATCH_SCHEDULED'
  | 'PROPOSAL_CANCELLED'
  | 'MATCH_QUICK_ADDED'            // Slice 18.0: Match added via quick-add (no proposal)
  | 'MATCH_BIG4_IMPORTED';          // Big4 Sync: Match imported from TheBig4.se API
```

**Event ID Format:** `{date}-{time}-{teamName}-{type}_{randomId}`
- Example: `20260123-1430-commando-player_joined_A1B2`

**Key Points:**
- NOT used for availability changes (too frequent, low audit value)
- Used for team lifecycle and membership changes
- `timestamp` uses regular `Date` for consistency

---

## `/matchProposals/{proposalId}`

Match proposal between two teams for a specific week. Slots are computed live from availability data — only confirmations are stored.

```typescript
interface MatchProposalDocument {
  // Identity
  proposerTeamId: string;          // Team that created the proposal
  opponentTeamId: string;          // Team being proposed to
  weekId: string;                  // ISO week: "2026-05"

  // Filter used to compute viable slots
  minFilter: {
    yourTeam: number;              // 3-4
    opponent: number;              // 3-4
  };

  // Game type + standin settings
  gameType: 'official' | 'practice';  // Set at creation, changeable by either leader
  proposerStandin: boolean;        // +1 virtual player for proposer (practice only)
  opponentStandin: boolean;        // +1 virtual player for opponent (practice only)

  // Confirmations — which slots each side has confirmed
  // Key = UTC slotId (e.g., "mon_2000"), Value = { userId, countAtConfirm, gameType }
  proposerConfirmedSlots: {
    [slotId: string]: {
      userId: string;              // Who confirmed
      countAtConfirm: number;      // Players available when confirmed
      gameType: 'official' | 'practice';  // Game type selected by confirmer
    };
  };
  opponentConfirmedSlots: {
    [slotId: string]: {
      userId: string;
      countAtConfirm: number;
      gameType: 'official' | 'practice';
    };
  };

  // Result — set when both confirm same slot
  confirmedSlotId: string | null;
  scheduledMatchId: string | null;

  // Status
  status: 'active' | 'confirmed' | 'cancelled' | 'expired';
  cancelledBy: string | null;      // userId who cancelled

  // Denormalized display data
  proposerTeamName: string;
  proposerTeamTag: string;
  opponentTeamName: string;
  opponentTeamTag: string;

  // Security: denormalized member list for read rules
  involvedTeamMembers: string[];   // All userIds from both rosters at creation

  // Metadata
  createdBy: string;               // userId who created
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;                 // Sunday 23:59 UTC of the proposal week
}
```

**Key Points:**
- Slots are NOT stored — computed live from availability data
- `countAtConfirm` enables UI warnings when availability drops
- `involvedTeamMembers` enables Firestore security rules without extra reads
- Authorization uses **live** team.leaderId + team.schedulers (not snapshot)
- Document ID: auto-generated

---

## `/scheduledMatches/{matchId}`

Confirmed match created when both sides confirm the same slot.

```typescript
interface ScheduledMatchDocument {
  // Teams
  teamAId: string;
  teamAName: string;
  teamATag: string;
  teamBId: string;
  teamBName: string;
  teamBTag: string;

  // Schedule
  weekId: string;                  // "2026-05"
  slotId: string;                  // UTC slot: "mon_2000"
  scheduledDate: string;           // ISO date: "2026-02-02"

  // Blocked slot for double-booking prevention
  blockedSlot: string;             // Same as slotId
  blockedTeams: string[];          // [teamAId, teamBId]

  // Roster snapshot at confirmation time
  teamARoster: string[];           // userIds available at confirmation
  teamBRoster: string[];           // userIds available at confirmation

  // Origin (Slice 18.0: Quick Add Match, Big4 Sync)
  origin: 'proposal' | 'quick_add' | 'big4_import';  // How the match was created (missing = 'proposal' for legacy docs)
  proposalId: string | null;         // Reference back to matchProposal (null for quick_add/big4_import)
  addedBy: string | null;            // userId who quick-added (null for proposal/big4_import)

  // Big4 integration (only present when origin === 'big4_import')
  big4FixtureId?: number;            // Fixture ID from Big4 API — primary dedup key
  big4Division?: string;             // "Division 1", "Division 2", "Division 3"

  // Status
  status: 'upcoming' | 'completed' | 'cancelled';

  // Game type (official vs practice)
  gameType: 'official' | 'practice';  // Set by confirmer, required
  gameTypeSetBy: string;              // userId who set the game type (last confirmer)

  // Metadata
  confirmedAt: Date;
  confirmedByA: string;            // userId from team A who confirmed
  confirmedByB: string | null;     // userId from team B who confirmed (null for quick_add)
  createdAt: Date;
}
```

**Key Points:**
- `blockedTeams` array-contains enables querying blocked slots per team
- `scheduledDate` computed from weekId + slotId for display
- Roster snapshots preserve who was available at confirmation time (empty `[]` for quick_add)
- `gameType` is required - user must explicitly choose 'official' or 'practice' when confirming
- `origin` field: `'proposal'` for matches created via proposal workflow, `'quick_add'` for direct adds, `'big4_import'` for games synced from TheBig4.se API. Legacy docs without this field are treated as `'proposal'`
- `big4FixtureId`: Only set on imported matches. Used for idempotent re-sync (skip if fixture already imported)
- All matches are publicly readable (community feed + public API for QWHub)
- Document ID: auto-generated

---

## `/voiceRecordings/{demoSha256}`

Voice recording manifest for auto-loading audio on the replay page. Written by Quad bot via Admin SDK after the fast pipeline splits audio per map.

```typescript
interface VoiceRecordingDocument {
  demoSha256: string;                              // Matches demo ID from QW Hub (document ID)
  teamTag: string;                                 // ASCII team tag (lowercase), e.g., "sr"
  teamId: string;                                  // Firestore team ID, e.g., "team-sr-001"
  visibility: 'public' | 'private';                // Resolved at upload from team's defaultVisibility
  source: 'firebase_storage' | 'google_drive';     // Which fetch path to use

  tracks: VoiceTrack[];                            // Per-player audio files

  mapName: string;                                 // Map name from demo, e.g., "dm3"
  recordedAt: Timestamp;                           // When the match was played
  uploadedAt: Timestamp;                           // When Quad uploaded the files
  uploadedBy: string;                              // "quad-bot"
  trackCount: number;                              // Convenience for UI (show "4 tracks")

  // Recording Management fields (written by quad at upload time)
  sessionId: string;                               // Recording session ULID (groups maps from same Discord session)
  opponentTag: string;                             // Opponent team name from Hub API, lowercase (e.g., "pol")
  teamFrags: number;                               // Our team's total frags for this map
  opponentFrags: number;                           // Opponent's total frags for this map
  gameId: number;                                  // QW Hub game ID for stats/demo cross-reference
  mapOrder: number;                                // 0-based index within session (for chronological sorting)
}

interface VoiceTrack {
  discordUserId: string;                 // Stable file identifier (Discord user ID)
  discordUsername: string;               // Discord display name at recording time
  playerName: string;                    // QW name (resolved or fallback)
  resolved: boolean;                     // true if playerName was confirmed via roster/knownPlayers
  fileName: string;                      // "{discordUserId}.ogg"
  storagePath: string;                   // "voice-recordings/{teamId}/{sha256}/{discordUserId}.ogg"
  size: number;                          // File size in bytes
  duration: number | null;               // Audio duration in seconds (if known)
}
```

**Key Points:**
- Document ID = `demoSha256` (natural key, matches Hub demo URLs)
- `visibility` controls Firestore read access; `private` requires team membership
- `source` field enables Tier 2 (Google Drive) later without schema changes
- `storagePath` per track lets frontend build download URLs
- Legacy recordings (no `visibility` field or `teamId: ''`) treated as public
- New storage path: `voice-recordings/{teamId}/{demoSha256}/{discordUserId}.ogg`
- Legacy storage path: `voice-recordings/{demoSha256}/{playerName}.ogg` (still supported)
- Admin-only write (Quad bot uses Admin SDK)

---

## `/botRegistrations/{teamId}`

Voice bot connection status per team. Created when a team leader initiates bot registration, activated when the Quad bot completes setup in their Discord server. This is the **primary bridge between MatchScheduler and quad** — both sides read and write to this document.

```typescript
interface BotRegistrationDocument {
  // Team identity (set by MatchScheduler at creation)
  teamId: string;                     // = document ID
  teamTag: string;
  teamName: string;

  // Authorization
  authorizedDiscordUserIds: string[]; // Discord IDs of leader + schedulers who can run /register
  registeredBy: string;               // Firebase UID of the leader

  // Discord server info (set by quad on /register completion)
  guildId: string | null;             // null while pending, populated on completion
  guildName: string | null;

  // Status
  status: 'pending' | 'active' | 'disconnecting';

  // Player mapping — Discord UID → QW name for voice track resolution
  // Updated by: quad on /register, addPhantomMember CF, recording pipeline
  knownPlayers: {
    [discordUserId: string]: string;  // Discord user ID → QW display name
  };

  // Guild member cache — full Discord server member list (Discord Roster Management)
  // Updated by: quad on /register, guildMemberAdd/Remove events, bot startup refresh
  guildMembers: {
    [discordUserId: string]: {
      username: string;               // Discord username (unique handle)
      displayName: string;            // Server nick or global display name
      avatarUrl: string | null;       // Discord CDN URL (128px)
      isBot: boolean;                 // true for bot accounts (filtered from UI)
    };
  };

  // Discord channels the bot can post to (set by quad on /register + channel discovery)
  availableChannels: Array<{
    id: string;                       // Discord channel ID
    name: string;                     // Channel name
    canPost: boolean;                 // Bot has send message permission
  }>;

  // DEPRECATED: Notification channel settings removed.
  // Quad bot now posts events as "last 3 events" in #schedule channel instead.
  // Existing docs may still have this field from before cleanup.
  // notifications?: { enabled: boolean; channelId: string | null; channelName: string | null; };

  // Schedule channel — where the availability canvas is posted
  scheduleChannel: {
    channelId: string | null;         // Discord channel for weekly schedule grid
  };

  // Auto-recording settings (managed via MatchScheduler Recordings tab)
  autoRecord?: {
    enabled: boolean;                 // Default: false
    minPlayers: 3 | 4;               // Min players in voice to trigger recording
    mode: 'all' | 'official' | 'practice';  // Which match types to auto-record
  };

  // Disconnect tracking
  disconnectRequestedAt?: Timestamp;  // Set when leader clicks Disconnect

  // Timestamps
  createdAt: Timestamp;
  activatedAt: Timestamp | null;
  updatedAt: Timestamp;
}
```

**Key Points:**
- Document ID = `teamId` (one registration per team)
- `status: 'pending'` until Quad bot activates in the Discord server
- `knownPlayers` maps Discord user IDs to QW names for voice track resolution
- `guildMembers` is the cached Discord server member list — used by "Manage Players" UI
- `availableChannels` populated by quad, consumed by MatchScheduler channel dropdowns
- Read: team leader + schedulers (via Firestore rules `get()` on team doc)
- Write: Admin SDK only (Cloud Function + Quad bot)

---

## `/notifications/{notificationId}`

Challenge and match notification delivery to Discord. Created by MatchScheduler Cloud Functions, processed by quad bot.

```typescript
interface NotificationDocument {
  // Notification type
  type: 'challenge_proposed';        // Extensible for future notification types

  // Source
  proposalId: string;                // Reference to matchProposals/{proposalId}
  createdBy: string;                 // Firebase UID of the proposer
  proposerTeamId: string;
  opponentTeamId: string;

  // Denormalized display data
  proposerTeamName: string;
  proposerTeamTag: string;
  opponentTeamName: string;
  opponentTeamTag: string;
  proposalUrl: string;               // Deep link to the proposal in MatchScheduler

  // Delivery targets
  delivery: {
    opponent: {
      botRegistered: boolean;         // Whether opponent team has active bot registration
      guildId: string | null;
    };
    proposer: {
      botRegistered: boolean;         // Whether proposer team has active bot registration
      guildId: string | null;
    };
  };

  // Status tracking
  status: 'pending' | 'delivered' | 'failed';
  deliveryResult?: {                 // Set by quad after delivery attempt
    opponent: { success: boolean; error?: string };
    proposer: { success: boolean; error?: string };
  };

  // Timestamps
  createdAt: Timestamp;
  deliveredAt: Timestamp | null;
}
```

**Key Points:**
- Created by `createProposal` Cloud Function
- Quad bot listens for `status == 'pending'`, delivers to Discord channels, updates status
- Read: involved team members. Write: Cloud Function (create) + Admin SDK (quad delivery update)

---

## `/deletionRequests/{requestId}`

Coordinates recording deletion across Firebase and quad server local storage. Created by MatchScheduler Cloud Function, processed by quad bot.

```typescript
interface DeletionRequestDocument {
  demoSha256: string;                // Which recording to delete
  teamId: string;                    // Team that owns the recording
  sessionId: string;                 // Session ULID (for quad local path lookup)
  mapName: string;                   // For logging/audit

  requestedBy: string;               // Firebase UID of the team leader
  requestedAt: Timestamp;

  // Quad fills these in after processing
  status: 'pending' | 'completed' | 'failed';
  completedAt: Timestamp | null;
  error: string | null;              // If status == 'failed', why
}
```

**Lifecycle:**
1. `deleteRecording` Cloud Function deletes Firebase Storage files + Firestore doc, creates this doc with `status: 'pending'`
2. Quad bot Firestore listener picks up pending requests
3. Quad deletes local processed files: `recordings/{sessionId}/processed/{segmentDir}/`
4. Quad updates doc: `status: 'completed'`, `completedAt: now`
5. If local files already gone, still marks `completed`

**Key Points:**
- Read: team members (filtered by teamId in rules). Write: Cloud Function (create) + Admin SDK (quad status update)

---

## `/weeklyStats/{weekId}`

Weekly platform activity statistics, computed by a scheduled Cloud Function. Admin-only read access.

```typescript
interface WeeklyStatsDocument {
  weekId: string;               // "2026-08" (YYYY-WW, same format as availability docs)
  activeUsers: number;          // Unique users who marked ≥1 availability slot
  activeTeams: number;          // Teams with ≥1 user with availability
  proposalCount: number;        // Total proposals created this week (any status)
  scheduledCount: number;       // Total confirmed matches this week
  teamBreakdown: {              // Per-team activity breakdown
    [teamId: string]: {
      users: number;
      proposals: number;
      matches: number;
    };
  };
  computedAt: Timestamp;
}
```

**Key Points:**
- Document ID = `weekId` (e.g., `"2026-08"`)
- Written by: Scheduled Cloud Function (slice A5)
- Read by: AdminStatsService (slice A2), AdminPanel (slice A3)
- Client writes always denied — Admin SDK only

---

## `/recordingSessions/{auto-id}`

Voice recording session tracking. Written by Quad bot via Admin SDK when a voice recording starts/ends.

```typescript
interface RecordingSessionDocument {
  sessionId: string;            // Quad's internal UUID
  teamId: string | null;        // From botRegistrations lookup. null if unregistered
  guildId: string;              // Discord guild ID
  guildName: string;            // Discord guild name
  channelId: string;            // Discord voice channel ID
  channelName: string;          // Discord voice channel name
  participants: string[];       // Current discord display names (non-bot, live snapshot)
  startedAt: Timestamp;         // When recording began
  status: 'recording' | 'completed' | 'interrupted';
  lastHeartbeat: Timestamp;     // Updated every 60s during recording
  endedAt: Timestamp | null;    // When recording ended (null while recording)
  duration: number | null;      // Total seconds (null while recording)
  participantCount: number | null; // Peak participants (null while recording)
}
```

**Key Points:**
- Auto-generated document ID
- Status lifecycle: `recording` → `completed` (normal) or `recording` → `interrupted` (crash recovery)
- `lastHeartbeat` updated every 60s during active recording
- Documents are never deleted
- Written by: Quad bot via Admin SDK
- Read by: RecordingSessionService (slice A3)
- Composite index: `teamId ASC, startedAt DESC`

---

## Common Patterns

### Check if user is on a team
```javascript
// From team document
const team = teamDoc.data();
const isMember = team.playerRoster.some(p => p.userId === userId);

// From user document
const user = userDoc.data();
const isMember = user.teams?.[teamId] === true;
```

### Get user's role on team
```javascript
const team = teamDoc.data();
const player = team.playerRoster.find(p => p.userId === userId);
const isLeader = player?.role === 'leader';
// OR simply:
const isLeader = team.leaderId === userId;
```

### Update availability atomically
```javascript
// IMPORTANT: Use update() for nested field paths, NOT set({ merge: true })
// set({ merge: true }) with dot-notation keys creates literal top-level fields
// like "slots.mon_1800" instead of nested slots.mon_1800

// Add user to slot
await availRef.update({
  [`slots.${slotId}`]: FieldValue.arrayUnion(userId),
  lastUpdated: FieldValue.serverTimestamp()
});

// Remove user from slot
await availRef.update({
  [`slots.${slotId}`]: FieldValue.arrayRemove(userId),
  lastUpdated: FieldValue.serverTimestamp()
});

// If document might not exist, create it first:
const doc = await availRef.get();
if (!doc.exists) {
  await availRef.set({ teamId, weekId, slots: {}, lastUpdated: FieldValue.serverTimestamp() });
}
await availRef.update({ [`slots.${slotId}`]: FieldValue.arrayUnion(userId) });
```

### Get availability document ID
```javascript
const docId = `${teamId}_${weekId}`;
// Example: "abc123_2026-04"
```

---

## Security Rules Summary

| Collection | Read | Write |
|------------|------|-------|
| `users` | Own document only | Own document via Cloud Functions |
| `teams` | Authenticated users | Cloud Functions only |
| `availability` | Authenticated users | Cloud Functions only |
| `eventLog` | Authenticated users | Cloud Functions only |
| `matchProposals` | Involved team members only | Cloud Functions only |
| `scheduledMatches` | Authenticated users | Cloud Functions only |
| `voiceRecordings` | Public if `visibility == 'public'` or legacy; private require team membership | Admin SDK only (Quad bot) |
| `botRegistrations` | Team leader + schedulers | Admin SDK only (Cloud Function + Quad bot) |
| `notifications` | Involved team members | Cloud Function (create) + Admin SDK (quad delivery) |
| `deletionRequests` | Team members (by teamId) | Cloud Function (create) + Admin SDK (quad status) |
| `weeklyStats` | Admin only (custom claim) | Admin SDK only (Cloud Function) |
| `recordingSessions` | Admin only (custom claim) | Admin SDK only (Quad bot) |

---

## Version History

- **2026-01-23**: Initial schema documentation
- Includes: users, teams, availability, eventLog collections
- **2026-01-23**: Added templates subcollection under users (Slice 2.4)
- **2026-01-26**: Added avatar customization fields (avatarSource, discordAvatarHash) - Slice 4.3.3
- **2026-01-28**: Added playerColors map - Slice 5.0.1
- **2026-01-29**: Simplified avatar system - removed avatarUrls multi-size, using single photoURL (128px) with CSS sizing
- **2026-01-31**: Added timezone field to user document, slot IDs now UTC-based (Slice 7.0a)
- **2026-01-31**: Added matchProposals, scheduledMatches collections + schedulers field on teams (Slice 8.0a)
- **2026-02-05**: Added hiddenTimeSlots field to user document (Slice 12.0c)
- **2026-02-08**: Added extraTimeSlots field to user document (Slice 14.0a)
- **2026-02-08**: Added gameType, proposerStandin, opponentStandin to matchProposals; min filter range changed to 3-4
- **2026-02-14**: Added voiceRecordings collection for replay auto-load (Voice Replay Tier 3)
- **2026-02-14**: Added origin, addedBy fields to scheduledMatches; MATCH_QUICK_ADDED event type (Slice 18.0)
- **2026-02-14**: Voice replay Phase 2 — visibility + track identity fields on voiceRecordings, botRegistrations collection, teams.voiceSettings (Slice P3.1)
- **2026-02-16**: Added weeklyStats and recordingSessions admin-only collections (Slice A1)
- **2026-02-23**: Added big4_import origin, big4FixtureId, big4Division fields to scheduledMatches; MATCH_BIG4_IMPORTED event type (Big4 Sync)
- **2026-02-22**: Added Recording Management fields to voiceRecordings: sessionId, opponentTag, teamFrags, opponentFrags, gameId, mapOrder (Phase R1)
- **2026-02-22**: Added notifications and deletionRequests collections (Phase R3-R5)
- **2026-02-22**: Expanded botRegistrations with guildMembers, notifications, scheduleChannel, autoRecord, availableChannels fields
- **2026-02-22**: Added phantom user support: isPhantom + phantomCreatedBy on users, isPhantom + discordUserId on PlayerEntry (Discord Roster Management)
- **2026-02-24**: Phase A1 — removed users/{userId}/templates subcollection; replaced with single `template` flat field on user document. Cloud Functions: saveTemplate (overwrite) + clearTemplate (delete). Old functions deleteTemplate + renameTemplate removed.
