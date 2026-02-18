# Slice P3.1: Voice Replay Security Rules + Schema Update

## Slice Definition

- **Slice ID:** P3.1
- **Name:** Voice Replay Privacy Rules & Schema Documentation
- **User Story:** As a team leader, I want my team's voice recordings to be private by default so that only team members can discover and listen to our match comms.
- **Success Criteria:**
  - Private voice recordings are only readable by authenticated team members
  - Public recordings remain accessible without auth (no regression)
  - Legacy PoC recordings (teamId: '', no visibility field) remain publicly readable
  - New 3-level storage path (`voice-recordings/{teamId}/{sha256}/{discordUserId}.ogg`) is accessible
  - Old 2-level storage path (`voice-recordings/{sha256}/{playerName}.ogg`) still works
  - SCHEMA.md documents all Phase 2 fields + botRegistrations collection

---

## PRD Mapping

**PRIMARY SECTIONS:**
- Phase 3 Deliverable 1: Firestore Rules — voiceRecordings Privacy
- Phase 3 Deliverable 2: Storage Rules — New Path Format
- Phase 3 Deliverable 5: Update SCHEMA.md

**DEPENDENT SECTIONS:**
- CONTRACT.md: Full schema reference for voiceRecordings, botRegistrations
- Phase 2: Defines the new fields (teamId, visibility, tracks[].discordUserId, etc.)

**IGNORED SECTIONS:**
- Deliverables 3, 4, 6: Auth on replay page, UX flow, service error handling → Slice P3.2

---

## Full Stack Architecture

### FRONTEND COMPONENTS

**None.** This slice is entirely backend rules + documentation.

### FRONTEND SERVICES

**None.**

### BACKEND REQUIREMENTS

#### Firestore Security Rules (`firestore.rules`)

**Current rule (PoC):**
```
match /voiceRecordings/{demoSha256} {
  allow read: if true;
  allow write: if false;
}
```

**New rule:**
```
match /voiceRecordings/{demoSha256} {
  // Public recordings: anyone can read (no auth needed)
  // Private recordings: must be authenticated team member
  // Legacy recordings (no visibility field or empty teamId): treat as public
  allow read: if
    resource.data.visibility == 'public'
    || resource.data.teamId == ''
    || !('visibility' in resource.data)
    || (request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.teams[resource.data.teamId] == true);
  allow write: if false;
}
```

**Rule logic explained:**
1. `visibility == 'public'` — Explicitly public recordings readable by anyone
2. `teamId == ''` — Legacy PoC recordings with empty teamId stay public
3. `!('visibility' in resource.data)` — Legacy docs without visibility field stay public (belt + suspenders with #2)
4. Auth check — Private recordings require: (a) user is authenticated, (b) user's `teams` map has `true` for the recording's `teamId`

**Why `get()` on users doc:** The `users/{uid}.teams` map is the canonical source of team membership. Same pattern used in `isTeamMember()` function already in the rules file (line 196-201).

#### Storage Rules (`storage.rules`)

**Current rule (2-level path only):**
```
match /voice-recordings/{demoSha256}/{fileName} {
  allow read: if true;
  allow write: if false;
}
```

**Add new 3-level path rule (keep old for backward compat):**
```
// New multi-clan format (Phase 2+): voice-recordings/{teamId}/{demoSha256}/{discordUserId}.ogg
match /voice-recordings/{teamId}/{demoSha256}/{fileName} {
  allow read: if true;
  allow write: if false;
}

// Legacy PoC format: voice-recordings/{demoSha256}/{playerName}.ogg
match /voice-recordings/{demoSha256}/{fileName} {
  allow read: if true;
  allow write: if false;
}
```

**Why storage stays public:** Privacy is enforced at the Firestore discovery layer. You can only learn the Storage paths by reading the `voiceRecordings` Firestore document. If you can't read the Firestore doc, you can't construct the download URL.

#### SCHEMA.md Updates

**voiceRecordings — add new fields to interface:**
- `visibility: 'public' | 'private'` — Resolved at upload from team's defaultVisibility
- `tracks[].discordUserId: string` — Stable file identifier (Discord user ID)
- `tracks[].discordUsername: string` — Discord display name at recording time
- `tracks[].resolved: boolean` — true if playerName was confirmed via roster/knownPlayers

**voiceRecordings — update storage path doc:**
- Old: `voice-recordings/{demoSha256}/{playerName}.ogg`
- New: `voice-recordings/{teamId}/{demoSha256}/{discordUserId}.ogg`

**voiceRecordings — update security rules summary:**
- Was: Public read by anyone
- Now: Public recordings readable by anyone; private recordings require team membership

**botRegistrations — add new collection to Collections Overview + full interface:**
- Document the `BotRegistrationDocument` interface from CONTRACT.md
- Add to Collections Overview table

**teams — note new optional field:**
- `voiceSettings?: { defaultVisibility: 'public' | 'private' }` — read by quad bot at upload time

### INTEGRATION POINTS

**None for this slice.** Rules are applied server-side by Firebase. No frontend changes needed. The frontend impact of these rules (permission-denied errors) is handled in Slice P3.2.

---

## Integration Code Examples

### Firestore Rules — Complete voiceRecordings Block

```
// Voice recordings manifest — written by Quad bot via Admin SDK
// Privacy: public recordings readable by anyone, private require team membership
// Legacy: recordings with empty teamId or missing visibility stay public
match /voiceRecordings/{demoSha256} {
  allow read: if
    resource.data.visibility == 'public'
    || resource.data.teamId == ''
    || !('visibility' in resource.data)
    || (request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.teams[resource.data.teamId] == true);
  allow write: if false; // Only Admin SDK (Quad bot) can write
}
```

### Storage Rules — Both Path Formats

```
// Voice recordings — uploaded by Quad bot via Admin SDK
// Public read: discovery requires knowing demoSha256 (not guessable)
// Privacy is enforced at Firestore discovery layer, not storage

// New multi-clan format (Phase 2+)
match /voice-recordings/{teamId}/{demoSha256}/{fileName} {
  allow read: if true;
  allow write: if false; // Only Admin SDK (Quad bot) can write
}

// Legacy PoC format (existing recordings)
match /voice-recordings/{demoSha256}/{fileName} {
  allow read: if true;
  allow write: if false; // Only Admin SDK (Quad bot) can write
}
```

### SCHEMA.md — Updated voiceRecordings Interface

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
}

interface VoiceTrack {
  discordUserId: string;       // Stable file identifier (Discord user ID)
  discordUsername: string;     // Discord display name at recording time
  playerName: string;          // QW name (resolved or fallback)
  resolved: boolean;           // true if playerName was confirmed via roster/knownPlayers
  fileName: string;            // "{discordUserId}.ogg"
  storagePath: string;         // "voice-recordings/{teamId}/{sha256}/{discordUserId}.ogg"
  size: number;                // File size in bytes
  duration: number | null;     // Audio duration in seconds (if known)
}
```

### SCHEMA.md — New botRegistrations Collection

```typescript
interface BotRegistrationDocument {
  teamId: string;                     // = document ID
  teamTag: string;
  teamName: string;
  authorizedDiscordUserId: string;    // Leader's Discord ID — only this user can run /register
  registeredBy: string;               // Firebase UID of the leader
  guildId: string | null;             // null while pending, populated on completion
  guildName: string | null;
  status: 'pending' | 'active';
  knownPlayers: {
    [discordUserId: string]: string;  // Discord user ID → QW display name
  };
  createdAt: Timestamp;
  activatedAt: Timestamp | null;
  updatedAt: Timestamp;
}
```

---

## Performance Classification

**No performance impact.** This slice only changes declarative rules and documentation. Firestore security rules are evaluated server-side with negligible latency. The `get()` call in the voiceRecordings rule adds one document read per evaluation, but this is standard practice and cached within the rule evaluation context.

```
BACKEND PERFORMANCE:
- get() on user doc: 1 extra read per voiceRecordings access (standard, cached per request)
- No Cloud Function cold starts involved
- No new indexes needed
```

---

## Data Flow Diagram

```
Private Recording Access:
  Client (replay page) → Firestore getDoc(voiceRecordings/{sha256})
    → Security Rule evaluates:
       ├── visibility == 'public' ? → ALLOW (no auth needed)
       ├── teamId == '' ? → ALLOW (legacy PoC)
       ├── !('visibility' in data) ? → ALLOW (legacy PoC)
       └── auth.uid → get(users/{uid}).teams[teamId] == true ?
            ├── YES → ALLOW (team member)
            └── NO → DENY (permission-denied error → handled in P3.2)

Storage Access:
  Client → Firebase Storage getDownloadURL(voice-recordings/...)
    → Storage Rule: allow read: if true
    → URL returned (privacy enforced at Firestore layer, not storage)
```

---

## Test Scenarios

### FIRESTORE RULES TESTS
- [ ] Public recording (visibility: 'public'): unauthenticated user CAN read
- [ ] Public recording: authenticated user CAN read
- [ ] Private recording (visibility: 'private'): unauthenticated user CANNOT read
- [ ] Private recording: authenticated team member CAN read
- [ ] Private recording: authenticated non-member CANNOT read
- [ ] Legacy recording (teamId: '', no visibility): unauthenticated user CAN read
- [ ] Legacy recording (teamId: ''): authenticated user CAN read
- [ ] All recordings: no client can write (write: if false)
- [ ] User with `teams: { "team-sr": true }` can read recording with `teamId: "team-sr"`
- [ ] User with `teams: { "team-xyz": true }` CANNOT read recording with `teamId: "team-sr"`

### STORAGE RULES TESTS
- [ ] Old path `voice-recordings/{sha256}/{file}`: read allowed
- [ ] New path `voice-recordings/{teamId}/{sha256}/{file}`: read allowed
- [ ] Both paths: write denied

### SCHEMA.MD VERIFICATION
- [ ] voiceRecordings interface includes visibility, tracks[].discordUserId, tracks[].discordUsername, tracks[].resolved
- [ ] voiceRecordings storage path updated to show new format
- [ ] voiceRecordings security rules summary updated
- [ ] botRegistrations collection added to Collections Overview table
- [ ] botRegistrations full interface documented
- [ ] teams.voiceSettings optional field documented

---

## Common Integration Pitfalls

- [ ] **Don't forget `!('visibility' in resource.data)` clause** — Without it, old recordings that have no `visibility` field AND have `teamId: ''` would depend solely on the `teamId == ''` clause. The explicit missing-field check is belt-and-suspenders safety.
- [ ] **Don't remove the old storage rule** — Old recordings use the 2-level path. Both rules must coexist.
- [ ] **Don't change botRegistrations rules** — They already exist in `firestore.rules` (line 429-436). This slice only updates the voiceRecordings rules.
- [ ] **Test with emulator auth** — The rules use `request.auth` and `get()`. Make sure the emulator has test users with `teams` map populated.

---

## Implementation Notes

**Order of operations:**
1. Update `firestore.rules` — change voiceRecordings read rule
2. Update `storage.rules` — add 3-level path match
3. Update `context/SCHEMA.md` — document all Phase 2 changes + botRegistrations

**Deploy consideration:** These rules can be deployed independently of the frontend changes (P3.2). Deploy rules first, then the frontend can gracefully handle the permission-denied errors.

**Existing rule pattern:** The `get()` + `teams` map pattern is already used in `isTeamMember()` on line 196-201 of `firestore.rules`. The voiceRecordings rule follows the same approach.

---

## Files Touched

| File | Change |
|------|--------|
| `firestore.rules` | Update voiceRecordings read rule (replace `allow read: if true` with visibility-based rule) |
| `storage.rules` | Add 3-level path match for `voice-recordings/{teamId}/{demoSha256}/{fileName}` |
| `context/SCHEMA.md` | Add visibility + Phase 2 track fields, botRegistrations collection, teams.voiceSettings, updated security summary |
