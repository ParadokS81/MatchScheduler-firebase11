# Phase 3: Privacy Rules & Replay Auth — Multi-Clan Voice Replay

## Context

Phase 2 (quad bot) landed. New recordings now have:
- `teamId` populated (from botRegistration lookup)
- `visibility: 'public' | 'private'` field (defaults to 'private' for registered teams)
- `tracks[]` with `discordUserId`, `discordUsername`, `playerName`, `resolved` flag
- Storage path: `voice-recordings/{teamId}/{demoSha256}/{discordUserId}.ogg`

The replay page (`replay.html`) currently works with NO auth — Firestore rules are `allow read: if true`. This phase adds privacy enforcement so private recordings are only accessible to team members.

Read `docs/multi-clan/CONTRACT.md` for the full schema reference.

---

## Deliverables

### 1. Firestore Rules — voiceRecordings Privacy

**Current rule (PoC):**
```
match /voiceRecordings/{demoSha256} {
  allow read: if true;
  allow write: if false;
}
```

**New rule (multi-clan):**
```
match /voiceRecordings/{demoSha256} {
  // Public recordings: anyone can read (no auth needed)
  // Private recordings: must be a team member
  // Legacy recordings (no visibility field or empty teamId): treat as public
  allow read: if
    resource.data.visibility == 'public'
    || resource.data.teamId == ''
    || (request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.teams[resource.data.teamId] == true);
  allow write: if false;
}
```

**Why `resource.data.teamId == ''`:** Existing PoC recordings have `teamId: ''` and no `visibility` field. Without this clause, they'd become unreadable since nobody's `teams['']` would be `true`. This keeps backward compat — old recordings stay publicly readable.

**How team membership works:** Each user's Firestore doc has a `teams` map: `{ "team-id-here": true }`. The rule checks if the authenticated user has a `true` entry for the recording's `teamId`. This is the same pattern used elsewhere in the app (e.g., team-scoped availability data).

### 2. Storage Rules — New Path Format

**Current rule:**
```
match /voice-recordings/{demoSha256}/{fileName} {
  allow read: if true;
  allow write: if false;
}
```

This only matches the old 2-level path. Phase 2's new path has 3 levels: `voice-recordings/{teamId}/{demoSha256}/{fileName}`.

**Add a second rule for the new path format (keep the old one for backward compat):**
```
// New multi-clan format (Phase 2+)
match /voice-recordings/{teamId}/{demoSha256}/{fileName} {
  allow read: if true;
  allow write: if false;
}

// Legacy PoC format (existing recordings)
match /voice-recordings/{demoSha256}/{fileName} {
  allow read: if true;
  allow write: if false;
}
```

Storage stays publicly readable by URL — privacy is enforced at the Firestore discovery layer. You can only learn the Storage paths by reading the `voiceRecordings` Firestore document.

### 3. Add Firebase Auth to replay.html

The replay page needs Firebase Auth so users can authenticate to access private recordings. Follow the same pattern as `index.html`.

**What to add to replay.html:**
- Import Firebase Auth module alongside existing Firestore + Storage
- Initialize Auth: `const auth = getAuth(app);`
- Add `auth` to the `window.firebase` global
- Connect to Auth emulator in dev mode (same pattern as existing emulator checks)

**What to add/import:**
- `AuthService.js` — Needed for `waitForAuthReady()`, sign-in flows, `onAuthStateChange()`
- A lightweight login prompt in the replay UI (see UX flow below)

**No need to import the full UserProfile/ProfileModal system.** The replay page just needs:
1. To know if the user is logged in
2. To show a "Sign in" option if they need to access a private recording
3. Sign-in via Discord or Google (same providers as main app)

### 4. Replay Page UX Flow

```
User visits replay.html?demo={sha256}

  ├─ VoiceReplayService.loadFromFirestore(sha256)
  │
  ├─ CASE 1: Recording exists, visibility == 'public' (or legacy)
  │  → Works exactly like today. No auth needed.
  │  → Load tracks, play audio, all good.
  │
  ├─ CASE 2: Recording exists, visibility == 'private', user NOT logged in
  │  → Firestore getDoc() throws permission-denied error
  │  → Show message: "This recording is private. Sign in to access your team's recordings."
  │  → Show Discord + Google sign-in buttons
  │  → After sign-in: retry loadFromFirestore()
  │    ├─ If user is team member → loads successfully
  │    └─ If user is NOT team member → show "You don't have access to this recording"
  │
  ├─ CASE 3: Recording exists, visibility == 'private', user IS logged in + team member
  │  → Works normally. Firestore rules allow the read.
  │
  ├─ CASE 4: Recording exists, visibility == 'private', user logged in but NOT team member
  │  → Firestore getDoc() throws permission-denied error
  │  → Show: "You don't have access to this recording. It belongs to a different team."
  │
  └─ CASE 5: No recording found (doc doesn't exist)
      → Current behavior: show drop zone for manual file upload
      → No change needed
```

**Key UX detail:** The demo player iframe should still render even for private recordings the user can't access — they can still watch the demo, they just can't hear the voice audio. The Hub iframe loads from `d.quake.world` which has nothing to do with our auth.

**The drop zone (manual file upload) should always be available** as a fallback, even for private recordings the user can't access via Firestore. Users might have the audio files locally.

### 5. Update SCHEMA.md

The schema doc needs to reflect Phase 2 changes plus the botRegistrations collection from Phase 1a.

**voiceRecordings — add new fields to the schema:**
- `visibility: 'public' | 'private'` — Resolved at upload from team's defaultVisibility setting
- `tracks[].discordUserId: string` — Stable file identifier (Discord user ID)
- `tracks[].discordUsername: string` — Discord display name at recording time
- `tracks[].resolved: boolean` — true if playerName was confirmed via roster/knownPlayers

**voiceRecordings — update storage path documentation:**
- Old: `voice-recordings/{demoSha256}/{playerName}.ogg`
- New: `voice-recordings/{teamId}/{demoSha256}/{discordUserId}.ogg`

**voiceRecordings — update security rules summary:**
- Was: `allow read: if true`
- Now: Public recordings readable by anyone, private recordings require team membership

**botRegistrations — add new collection:**
Document the full `BotRegistrationDocument` interface from the contract. Add it to the Collections Overview table. This was created in Phase 1a but never documented in SCHEMA.md.

**teams — note new optional field:**
- `voiceSettings?: { defaultVisibility: 'public' | 'private' }` — read by quad bot at upload time, UI comes in Phase 4

### 6. Update VoiceReplayService.loadFromFirestore() — Handle Auth Errors

The service currently assumes the Firestore read always succeeds (if the doc exists). With the new rules, reads can fail with `permission-denied`.

**Update loadFromFirestore() to:**
1. Catch Firestore permission errors
2. Return a structured result indicating why the load failed:
   - `{ status: 'loaded', recording }` — success
   - `{ status: 'not_found' }` — no recording for this demo
   - `{ status: 'auth_required' }` — private recording, user not logged in
   - `{ status: 'access_denied' }` — private recording, user logged in but not a team member
3. VoiceReplayPlayer uses this status to decide which UI to show

**Note:** The Firestore SDK returns the same `permission-denied` error regardless of whether the user is unauthenticated or authenticated-but-unauthorized. You can disambiguate by checking `window.firebase.auth.currentUser`:
- If `currentUser == null` → user not logged in → `auth_required`
- If `currentUser != null` → user logged in but not a team member → `access_denied`

---

## What NOT to Build Yet

- **Phase 4 (voiceSettings toggle)** — Don't add the UI for changing defaultVisibility. Teams will use the default ('private') until Phase 4.
- **Phase 5 (recordings list/discovery)** — Don't add a recordings browser or team recording list.
- **Per-recording visibility override** — Phase 5. The `visibility` field exists on each recording, but there's no UI to change it yet.
- **Player name display improvements** — The service already reads `track.playerName` which Phase 2 resolves correctly. No need to change how track names are displayed in the player UI.

---

## Backward Compatibility

- **Existing PoC recordings** (`teamId: ''`, no `visibility` field): Remain publicly readable via the `teamId == ''` rule clause.
- **Old storage paths** (`voice-recordings/{sha256}/{playerName}.ogg`): Both old and new storage rules coexist.
- **VoiceReplayService.loadFromFirestore()**: Already reads `track.storagePath` from the Firestore document, so it automatically handles both old and new path formats. No path construction logic to change.
- **Manual file upload (drag & drop)**: Unaffected. Only Firestore auto-loading is gated by privacy rules.

---

## Files Likely Touched

| File | Change |
|------|--------|
| `firestore.rules` | voiceRecordings visibility-based read rule |
| `storage.rules` | Add 3-level path match for new storage format |
| `public/replay.html` | Add Firebase Auth import + initialization |
| `public/js/services/VoiceReplayService.js` | Handle permission-denied errors in loadFromFirestore() |
| `public/js/components/VoiceReplayPlayer.js` | Auth error states: login prompt, access denied message |
| `context/SCHEMA.md` | Document new fields, botRegistrations collection, updated rules |
