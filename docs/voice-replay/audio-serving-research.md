# Voice Replay — Audio Serving & Distribution Research

## Status: Round 1 Complete (2026-02-12)

Research session exploring how to get audio from Quad Docker to the user's browser
automatically, replacing the manual drag-and-drop PoC workflow.

---

## What We Built (PoC — Working Today)

- Standalone `replay.html` page with Hub demo player iframe
- postMessage sync engine (VoiceReplayService.js) — time alignment, drift correction, pause detection
- Overlay controls — per-track volume, mute toggles, sync offset slider
- Drag-and-drop loading of OGG files or zip archives
- Bot track auto-detection and muting (Craig, RECORDING, quake.world patterns)
- Default +1.0s offset compensates for browser audio decode latency
- Deployed at `scheduler.quake.world/replay.html?demo={sha256}`

## Core Design Constraints

1. **Quad Docker is outbound-only** — behind NAT, no public IP, no port forwarding. Just like Discord bots — connects out, never accepts incoming connections.

2. **Privacy is a real concern** — some teams don't want platform admins listening to their comms. Not military secrets, but clan privacy matters in competitive gaming.

3. **Trust model** — Firestore admin access means any data stored in our database is readable by the admin. Security rules protect users from each other, not from the admin.

4. **OGG/Opus files are tiny** — ~2 MB per player per map (15 min). A full 4-player match = ~8 MB per map. Already optimally compressed, no further compression possible.

5. **HTML5 Audio supports streaming** — Range requests, progressive download, instant seek on buffered content. No special streaming server needed.

---

## Leading Option: Google Drive + Announcement API

### Why Google Drive

- Docker only needs outbound HTTPS to upload (fits constraint #1)
- Files live in the team leader's personal Google account (addresses constraint #2)
- Google enforces access control, not us — admin can't bypass (addresses constraint #3)
- MatchScheduler users already have Google accounts (Firebase Auth supports Google)
- Google Drive API is free, 15 GB storage per account, generous rate limits
- Supports HTTP Range requests for streaming

### Architecture

```
Quad Docker (outbound only, behind NAT)
  ├── Discord Gateway ←── voice recording (existing)
  ├── QW Hub API ←── match pairing (existing)
  ├── Google Drive API ←── upload processed audio (NEW)
  └── MatchScheduler Cloud Function ←── announce recording (NEW)

Google Drive (team leader's account)
  └── QW Voice Recordings/
      └── {demoSha256}/
          ├── paradoks.ogg
          ├── zero.ogg
          └── ...
  └── index.json ←── updated after each upload, lists all recordings

MatchScheduler
  ├── Firestore /voiceAnnouncements/{demoSha256} ←── real-time discovery
  ├── Google OAuth in browser ←── access Drive files
  └── VoiceReplayService ←── loads audio from Drive URLs
```

### Setup Flow (One-Time Per Team)

1. Team leader runs `/voice setup-drive` in Discord
2. OAuth popup — leader grants Quad access to create/manage files in a Drive folder
3. Quad creates "QW Voice Recordings" folder in leader's Drive
4. Leader shares the folder with teammates' Google accounts (via `/voice share-with-team` or manually)
5. Done. All future recordings auto-upload.

### Per-Match Flow (Automatic)

1. Quad records match → pipeline processes → per-map audio files ready
2. Quad uploads OGG files to Drive folder under `{demoSha256}/` subfolder
3. Quad updates `index.json` in the Drive folder root (cumulative playlist)
4. Quad POSTs to MatchScheduler Cloud Function: `announceRecording({ demoSha256, teamTag, trackCount, source: "google_drive" })`
5. Cloud Function writes to Firestore `/voiceAnnouncements/{demoSha256}`

### Playback Flow (User Experience)

1. User browses match history on MatchScheduler (logged in with Discord as usual)
2. Firestore listener on `/voiceAnnouncements` shows speaker icons on matches with audio
3. User has connected Google OAuth once (persistent token) — "Connect Google" button if not
4. User clicks "Watch with Voice" → opens replay page
5. VoiceReplayService checks Drive for `{demoSha256}/` folder (using Google OAuth token)
6. Finds audio files → creates Audio elements → syncs with Hub iframe
7. Audio streams automatically. No drag-and-drop needed.

### Discovery Mechanism

- **Real-time notification**: Quad → Cloud Function → Firestore announcement → browser listener
- **Announcement is metadata only**: `{ demoSha256, teamTag, trackCount, source }` — no file IDs, no URLs, no audio data
- **Access verification is implicit**: Drive API returns 403 if user isn't on the share list → no icon shown
- **Fallback**: index.json in Drive folder can be queried on page load (2 API calls per session)

### Privacy Model

- Audio files live in leader's Google Drive — leader owns and controls them
- Folder shared with specific Google accounts (teammates only)
- Even if admin reads announcement metadata from Firestore, they can't access the files without being on the Google Drive share list
- Leader can revoke access for any individual at any time
- Leader can delete entire folder to remove all recordings
- Google's sharing permissions are the enforcement layer — battle-tested, not our code

### Google Drive OAuth Scopes

- **Docker (upload)**: `drive.file` — can only access files the app created. Cannot read other Drive files.
- **Browser (playback)**: `drive.readonly` — can read files shared with the user. Cannot modify anything.

### Open Questions for Round 2

- ~~Google Drive API: exact CORS behavior when browser fetches audio files — does `drive.readonly` scope + shared folder work for cross-origin Audio() elements?~~ **CONFIRMED WORKING (2026-02-13)** — `fetch()` with Bearer token to `googleapis.com/drive/v3/files/{id}?alt=media` returns `audio/ogg` with CORS headers. Create blob URL → `new Audio(blobUrl)` plays instantly. 1.9 MB file in 927ms. No issues.
- ~~OAuth token refresh: how long do Google OAuth tokens last in browser localStorage? Silent refresh needed?~~ **ANSWERED** — Access tokens expire in 3599s (~1 hour). Google Identity Services library handles silent refresh. Docker bot uses refresh tokens (last forever).
- Rate limits in practice: 300 queries/min per project — need to confirm this is per GCP project, not per user
- What if leader loses access to their Google account? Recordings gone. Backup strategy?
- Can Quad use a Google Service Account instead of user OAuth for upload? Would simplify Docker setup but changes ownership model.

### GCP Project Setup Required (one-time)

- Enable **Google Drive API** in APIs & Services
- Add redirect URIs to OAuth Client (per deployment: localhost for dev, production domain for prod)
- OAuth consent screen must be configured (already done via Firebase)

---

## Alternative A: Firebase Cloud Storage (Central Hosting)

### When to Use

For teams that trust the platform, or for the central quake.world bot where admin access isn't a concern.

### Architecture

```
Quad Docker
  └── Firebase Admin SDK (already has it for standin module)
      └── Upload to Cloud Storage: audio/{demoSha256}/{player}.ogg
      └── Write to Firestore: /voiceRecordings/{demoSha256} with download URLs

MatchScheduler
  └── Check Firestore for manifest → fetch audio from Cloud Storage URLs
```

### Pros

- Zero new accounts or services needed (Quad already has Firebase credentials)
- Firebase Storage already configured (logo upload pattern exists)
- Simplest possible implementation — maybe 1-2 days of work
- Works immediately for our own Quad instance

### Cons

- Admin has full access to Cloud Storage bucket — privacy concern for other teams
- Only works for Quad instances that have our Firebase service account
- Can't distribute credentials to self-hosted instances without security risk

### Verdict

Good as Tier 3 "convenience" option for teams that don't care about admin access.
Should implement first since it's easiest and proves the auto-loading flow works.

---

## Alternative B: Direct Docker Serving via Tunnel

### Concept

Add Express HTTP server to Quad Docker. Expose via Cloudflare Tunnel or similar.
Browser connects directly to Docker for audio streaming.

### Architecture

```
Quad Docker
  ├── Express server on localhost:3001
  │   ├── GET /api/recordings/{demoSha256} → manifest
  │   └── GET /api/audio/{demoSha256}/{file}.ogg → stream file
  └── Cloudflare Tunnel → https://slackers-voice.cfargotunnel.com

MatchScheduler
  └── Team settings store Docker URL → browser fetches directly
```

### Pros

- Audio never leaves the team's server — maximum privacy
- No third-party storage (Google, Firebase)
- Simple token-based auth (permanent, stored in localStorage)
- Docker already has all the files

### Cons

- **Docker must accept incoming connections** — requires tunnel/port forwarding (violates constraint #1)
- Docker must be running when someone wants to replay (offline = no audio)
- Tunnel setup is extra infrastructure (Cloudflare account, DNS, keepalive)
- Each team needs their own tunnel endpoint
- Browser CORS configuration needed

### Verdict

Interesting for power users but adds significant operational complexity.
The "outbound-only" constraint is a deal-breaker for most teams.
Could revisit if a zero-config tunnel solution emerges.

---

## Alternative C: S3-Compatible Storage (Cloudflare R2)

### Concept

Quad uploads to R2 bucket instead of Google Drive. Zero egress fees.
Browser fetches via public URLs.

### Pros

- 10 GB free storage, zero bandwidth costs
- S3-compatible API — well-tooled ecosystem
- No Google account needed

### Cons

- Requires Cloudflare account setup (friction)
- Access control is bucket-level, not per-user — similar trust issue as Firebase Storage
- No native browser auth integration (need presigned URLs or public access)
- Another service to manage

### Verdict

Technically sound but doesn't solve the privacy problem better than Google Drive,
and adds more setup friction. Not worth pursuing unless Google Drive has a showstopper.

---

## Tier Summary

| Tier | Source | Privacy | Setup | Auto-Load | Status |
|------|--------|---------|-------|-----------|--------|
| **1. Drag & Drop** | Local files | Total | Zero | No | Working today |
| **2. Google Drive** | Leader's Drive | Team-controlled | `/voice setup-drive` + share | Yes | Leading option |
| **3. Firebase Storage** | Central bucket | Admin has access | Zero for our bot | Yes | Easy first implementation |

**Recommended build order:**
1. **Tier 3 first** — proves the auto-loading flow, minimal work, our own Quad only
2. **Tier 2 next** — Google Drive integration, unlocks self-hosted privacy model
3. **Tier 1 always available** — drag-and-drop as universal fallback

---

## Key Technical Decisions Made

1. **Docker is outbound-only** — no tunnels, no port forwarding, just push to storage
2. **Google Drive as private storage** — team leader owns data, Google enforces access
3. **Announcement API** — lightweight Cloud Function for real-time discovery, metadata only
4. **index.json as playlist** — cumulative file in Drive root, maps demoSha256 → file metadata
5. **Dual auth in browser** — Discord for MatchScheduler, Google OAuth for Drive (additive, not replacing)
6. **OGG/Opus as-is** — already optimally compressed, no transcoding needed
7. **HTML5 Audio streaming** — Range requests handle seeking, no special server needed

## What Needs Research in Round 2

- Google Drive API deep-dive: CORS for audio streaming, token refresh, Service Account vs User OAuth
- Quad-side implementation: Google Drive upload module, index.json management, announce POST
- MatchScheduler-side: Google OAuth integration alongside existing Discord auth
- The `announceRecording` Cloud Function: validation, rate limiting, spam prevention
- Offline bundle format: zip with MVD + audio for xantom's drag-and-drop demo player feature
- Retention policy: how long to keep recordings? Leader's Drive quota management
