# Voice Replay — Tier 3: Firebase Storage Auto-Loading

## Status: Ready to Build (2026-02-13)

CORS test confirmed Google Drive API works for audio streaming.
This spec covers Tier 3 (Firebase Storage) — the fastest path to auto-loading.
Tier 2 (Google Drive) adds privacy layer on top of the same pipeline later.

---

## What Exists Today (PoC — Tier 1)

- `public/replay.html` — standalone page with Hub demo player iframe
- `public/js/components/VoiceReplayPlayer.js` — UI: drop zone, volume sliders, mute toggles, sync offset
- `public/js/services/VoiceReplayService.js` — sync engine: postMessage with Hub iframe, drift correction, per-track audio
- Audio loaded via **drag-and-drop only** (OGG files or zip archives)
- No backend, no Firestore, no auto-loading
- Deployed at `scheduler.quake.world/replay.html?demo={sha256}`

### VoiceReplayService Key API

```javascript
VoiceReplayService.init(demoSha256, onStateChange)  // Setup, returns countdown duration
VoiceReplayService.loadFiles(fileList)               // Create Audio elements from files
VoiceReplayService.loadZip(zipFile)                  // Extract from zip archive
VoiceReplayService.getTracks()                       // [{ name, audio, volume, muted }]
VoiceReplayService.cleanup()                         // Revoke URLs, remove listeners
```

Sync formula: `audioTime = demoElapsedTime + manualOffset`
Drift threshold: 300ms (re-seeks only if drift exceeds this)

---

## What We're Building

**Goal:** When a user opens the replay page for a demo that has voice recordings,
audio loads automatically from Firebase Storage. No drag-and-drop needed.

**Scope:** Our own Quad bot only. Teams using our bot trust the platform.
Privacy-conscious teams get Tier 2 (Google Drive) later.

---

## Architecture

```
Quad Docker (outbound only)
  └── Firebase Admin SDK (already initialized for standin module)
      ├── Upload OGG files to Storage: voice-recordings/{demoSha256}/{playerName}.ogg
      └── Write manifest to Firestore: /voiceRecordings/{demoSha256}

MatchScheduler (browser)
  ├── Firestore listener on /voiceRecordings → show speaker icons on matches
  ├── replay.html → check Firestore for manifest → auto-fetch audio from Storage
  └── Fallback: drag-and-drop still works if no auto-loaded recordings
```

---

## Firestore Schema

### `/voiceRecordings/{demoSha256}`

```javascript
{
  demoSha256: "abc123...",                    // matches demo ID used by Hub
  teamTag: "slackers",                        // ASCII team tag (lowercase)
  teamId: "team-abc",                         // Firestore team ID (if known)
  source: "firebase_storage",                 // "firebase_storage" | "google_drive" (future)
  tracks: [
    {
      playerName: "paradoks",                 // extracted from filename
      fileName: "paradoks.ogg",              // original filename
      storagePath: "voice-recordings/abc123.../paradoks.ogg",
      size: 1945357,                         // bytes
      duration: null                         // optional, filled if known
    }
  ],
  mapName: "dm3",                            // optional, from demo metadata
  recordedAt: Timestamp,                     // when the match happened
  uploadedAt: Timestamp,                     // when Quad uploaded
  uploadedBy: "quad-bot",                    // identifies the uploader
  trackCount: 4                              // convenience for UI (show "4 tracks")
}
```

**Key design decisions:**
- Document ID = `demoSha256` (natural key, matches Hub URLs)
- `source` field enables Tier 2 later without schema changes
- `storagePath` stored per track so frontend can build download URLs
- No security rules needed for this collection (public read, admin write via Admin SDK)

---

## Firebase Storage Structure

```
voice-recordings/
  └── {demoSha256}/
      ├── paradoks.ogg
      ├── zero.ogg
      ├── xantom.ogg
      └── bps.ogg
```

**Storage rules** — public read, no client uploads:

```javascript
match /voice-recordings/{allPaths=**} {
  allow read: if true;       // Anyone can download (discovery is via Firestore)
  allow write: if false;     // Only Admin SDK can write
}
```

Public read is fine because:
- Discovery requires knowing the demoSha256 (not guessable)
- This is Tier 3 — teams that trust the platform
- Tier 2 (Google Drive) handles privacy-conscious teams

---

## Implementation Steps

### Step 1: Firestore Schema + Storage Rules

- Add `/voiceRecordings` collection (no Cloud Function needed — Quad writes via Admin SDK)
- Add Storage rules for `voice-recordings/` path
- Add seed data: create a test `/voiceRecordings/{testDemoSha256}` document

### Step 2: Upload Test Recording to Storage

- Manually upload test OGG files to `voice-recordings/{testDemoSha256}/` in Storage emulator
- Or write a quick seed script that copies local OGG files to Storage
- Verify files are accessible via Storage download URL

### Step 3: VoiceReplayService — Add Auto-Loading

Extend the service with a new method:

```javascript
// NEW: Auto-load from Firebase Storage
async loadFromFirestore(demoSha256) {
    const { doc, getDoc } = await import('firebase/firestore');
    const docRef = doc(window.firebase.db, 'voiceRecordings', demoSha256);
    const snap = await getDoc(docRef);

    if (!snap.exists()) return null; // No recording available

    const recording = snap.data();
    const { ref, getDownloadURL } = await import('firebase/storage');

    const tracks = [];
    for (const track of recording.tracks) {
        const storageRef = ref(window.firebase.storage, track.storagePath);
        const url = await getDownloadURL(storageRef);
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const audio = new Audio(blobUrl);
        tracks.push({
            name: track.playerName,
            audio: audio,
            volume: 1.0,
            muted: false,
            blobUrl: blobUrl
        });
    }

    return tracks; // Same format as loadFiles() produces
}
```

### Step 4: VoiceReplayPlayer — Auto-Load on Page Open

Modify `replay.html` / VoiceReplayPlayer to:

1. On init, check Firestore for recording manifest
2. If found → auto-load tracks, hide drop zone, show controls
3. If not found → show drop zone as today (Tier 1 fallback)
4. Show loading state while fetching ("Loading voice recordings...")

```
Page opens → init(demoSha256)
  ├── Check Firestore for /voiceRecordings/{demoSha256}
  │   ├── Found → fetch audio from Storage → show controls
  │   └── Not found → show drop zone (drag-and-drop fallback)
  └── Either way, Hub iframe loads the demo
```

### Step 5: Speaker Icons on Match History

- In UpcomingMatchesPanel (or wherever matches are displayed):
- Listen to `/voiceRecordings` collection for demos associated with displayed matches
- Show a speaker/headphone icon on matches that have recordings
- Icon links to `replay.html?demo={demoSha256}`

### Step 6: Docker Upload (Quad Side — Separate Repo)

This is Quad Docker code, not MatchScheduler code. Documenting the interface:

```javascript
// Quad already has: const admin = require('firebase-admin');
const bucket = admin.storage().bucket();
const db = admin.firestore();

// After processing a recording:
async function uploadVoiceRecording(demoSha256, teamTag, audioFiles) {
    const tracks = [];

    for (const file of audioFiles) {
        const storagePath = `voice-recordings/${demoSha256}/${file.playerName}.ogg`;
        await bucket.upload(file.localPath, { destination: storagePath });
        tracks.push({
            playerName: file.playerName,
            fileName: `${file.playerName}.ogg`,
            storagePath,
            size: file.size
        });
    }

    await db.collection('voiceRecordings').doc(demoSha256).set({
        demoSha256,
        teamTag,
        source: 'firebase_storage',
        tracks,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        uploadedBy: 'quad-bot',
        trackCount: tracks.length
    });
}
```

---

## Testing Strategy

### With Emulator (Steps 1-5)

1. Seed a test document in Firestore emulator: `/voiceRecordings/{testDemoSha256}`
2. Upload test OGG files to Storage emulator
3. Open `replay.html?demo={testDemoSha256}` — should auto-load
4. Open `replay.html?demo={unknownDemo}` — should show drop zone fallback
5. Verify speaker icons appear on seeded matches

### With Real Quad (Step 6)

- Deploy Quad changes
- Run a test match
- Verify recording appears in Firestore + Storage
- Open replay page — audio auto-loads

---

## What This Enables for Tier 2 (Google Drive) Later

The `source` field in the Firestore document tells the frontend which fetch path to use:

```javascript
if (recording.source === 'firebase_storage') {
    // Fetch from Storage download URLs (Tier 3)
    tracks = await loadFromFirebaseStorage(recording.tracks);
} else if (recording.source === 'google_drive') {
    // Fetch from Drive API with Google OAuth (Tier 2)
    tracks = await loadFromGoogleDrive(recording.driveFolderId);
}
```

Everything else (UI, sync, player, discovery) stays identical.

---

## Files to Create/Modify

| File | Action | What |
|------|--------|------|
| `firestore.rules` | Modify | Add read rules for `/voiceRecordings` |
| `storage.rules` | Modify | Add read rules for `voice-recordings/` |
| `public/js/services/VoiceReplayService.js` | Modify | Add `loadFromFirestore()` method |
| `public/js/components/VoiceReplayPlayer.js` | Modify | Auto-load on init, loading states |
| `public/replay.html` | Modify | Add Firebase imports if not present |
| `scripts/seed.js` | Modify | Add test voiceRecording + upload test OGGs |
| `context/SCHEMA.md` | Modify | Document voiceRecordings collection |

**No new Cloud Functions needed.** Quad writes directly via Admin SDK.
**No new auth flows needed.** Firebase Storage public read + Firestore public read.

---

## Estimated Effort

- Steps 1-2 (schema + test data): ~30 min
- Steps 3-4 (auto-loading in service + player): ~2-3 hours
- Step 5 (speaker icons): ~1 hour
- Step 6 (Quad side): separate effort, not blocking frontend

Total MatchScheduler side: **half a day**
