# Firestore Schema Reference

This document defines the authoritative data structures for all Firestore collections in MatchScheduler.

---

## Collections Overview

| Collection | Document ID Format | Purpose |
|------------|-------------------|---------|
| `users` | `{userId}` (Firebase Auth UID) | User profiles and team memberships |
| `users/{userId}/templates` | Auto-generated | User's availability templates (max 3) |
| `teams` | Auto-generated | Team information and rosters |
| `availability` | `{teamId}_{weekId}` | Weekly availability per team |
| `eventLog` | Custom format | Audit trail for team operations |

---

## `/users/{userId}`

User profile and team membership tracking.

```typescript
interface UserDocument {
  // Core profile
  displayName: string;        // 3-20 chars, user's display name
  initials: string;           // 2-4 chars, uppercase, unique per team
  email: string;              // From Google Auth
  photoURL: string | null;    // From Google Auth or custom

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

  // Metadata
  createdAt: Timestamp;
  lastUpdatedAt: Timestamp;
}
```

**Key Points:**
- `teams` is an object/map, NOT an array
- Check team membership: `userProfile.teams[teamId] === true`
- Max 2 teams per user enforced at write time

---

## `/users/{userId}/templates/{templateId}`

User's saved availability templates (subcollection).

```typescript
interface TemplateDocument {
  name: string;           // 1-20 chars, user-defined template name
  slots: string[];        // Array of slot IDs: ["mon_1800", "tue_1930", ...]
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Example Document:**
```json
{
  "name": "Weekday Evenings",
  "slots": ["mon_1900", "mon_1930", "tue_1900", "tue_1930", "wed_1900", "wed_1930"],
  "createdAt": "<Timestamp>",
  "updatedAt": "<Timestamp>"
}
```

**Key Points:**
- Subcollection under user document (automatic user isolation)
- Maximum 3 templates per user (enforced by Cloud Function)
- Slots use same format as availability: `{day}_{time}`
- Templates store patterns only (day/time), not week-specific data
- Used for quick loading of recurring availability patterns

---

## `/teams/{teamId}`

Team information with embedded roster.

```typescript
interface TeamDocument {
  // Identity
  teamName: string;           // 3-30 chars
  teamTag: string;            // 2-4 chars, uppercase

  // Leadership
  leaderId: string;           // userId of team leader

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

  // Metadata
  createdAt: Timestamp;
  lastActivityAt: Timestamp;
}

interface PlayerEntry {
  userId: string;             // Reference to /users/{userId}
  displayName: string;        // Denormalized from user profile
  initials: string;           // Denormalized from user profile
  joinedAt: Date;             // When they joined the team
  role: 'leader' | 'member';
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

**Slot ID Format:** `{day}_{time}`
- Day: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`
- Time: `1800`, `1830`, `1900`, `1930`, `2000`, `2030`, `2100`, `2130`, `2200`, `2230`, `2300`
- Examples: `mon_1800`, `fri_2100`, `sun_1930`

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
  | 'PLAYER_MOVEMENT';        // Join, leave

type EventType =
  | 'TEAM_CREATED'
  | 'TEAM_ARCHIVED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'SETTINGS_UPDATED'
  | 'JOIN_CODE_REGENERATED';
```

**Event ID Format:** `{date}-{time}-{teamName}-{type}_{randomId}`
- Example: `20260123-1430-commando-player_joined_A1B2`

**Key Points:**
- NOT used for availability changes (too frequent, low audit value)
- Used for team lifecycle and membership changes
- `timestamp` uses regular `Date` for consistency

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
// Add user to slot
await availRef.set({
  [`slots.${slotId}`]: FieldValue.arrayUnion(userId)
}, { merge: true });

// Remove user from slot
await availRef.set({
  [`slots.${slotId}`]: FieldValue.arrayRemove(userId)
}, { merge: true });
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
| `users/{userId}/templates` | Own templates only | Own templates via Cloud Functions |
| `teams` | Authenticated users | Cloud Functions only |
| `availability` | Authenticated users | Cloud Functions only |
| `eventLog` | Authenticated users | Cloud Functions only |

---

## Version History

- **2026-01-23**: Initial schema documentation
- Includes: users, teams, availability, eventLog collections
- **2026-01-23**: Added templates subcollection under users (Slice 2.4)
