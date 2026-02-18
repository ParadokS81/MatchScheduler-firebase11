# Voice Replay — Synced Voice Comms with Demo Playback

## Vision

Watch any QuakeWorld match on the Hub and hear the team's voice comms perfectly synced to the action. Quad calls, RL timing, the panic when control is lost — all in sync with the demo playback.

Nothing like this exists in any Quake community. Or arguably any competitive FPS community.

## What We Have Today

Our pipeline (Quad bot → processing module) already produces:

1. **Per-player OGG/Opus audio** — one file per speaker per map (~5 MB each, ~1 MB/min)
2. **Session metadata** — recording timestamps, track info, Discord user mapping
3. **Match pairing** — audio slices automatically matched to QW Hub games via API
4. **ktxstats** — per-player stats fetched and bundled with each match

The audio is clean, sliced to map boundaries, and aligned with known Hub game IDs. The hard part is done.

## How It Works

The QW Hub demo player uses FTE (ForeThought Engine) compiled to WebAssembly. It runs as a real Quake client in the browser — not a video, but actual demo playback at high fidelity and frame rate. Demos are streamed from CloudFront CDN to the local client.

### The Sync Mechanism

The demo player is the **master clock**. Our audio follows it.

```
Hub Game Player (iframe)                    Our Wrapper Page
┌──────────────────────┐                   ┌──────────────────────┐
│                      │                   │                      │
│  FTE Engine          │   postMessage     │  Audio Player        │
│  plays demo          │ ──────────────►   │  <audio> per speaker │
│                      │  { time, playing }│                      │
│  getDemoElapsedTime()│                   │  audio.currentTime = │
│  polls every 100ms   │                   │    event.time + off  │
│                      │                   │                      │
└──────────────────────┘                   └──────────────────────┘
```

- Demo plays → audio plays
- Demo pauses → audio pauses
- Slider dragged to 8:32 → audio jumps to 8:32
- Slow-mo → audio slows down

### Time Alignment

Demo timeline includes a countdown (~10s) before match start. Our recording starts at a different wall-clock time. The offset calculation:

```
audio.currentTime = demo_elapsed - countdown_duration + recording_offset
```

Where `recording_offset` = difference between demo match start and our recording's match start timestamp. All values available from our pipeline metadata + Hub demo info.

### What vikpe Built (delivered 2026-02-12)

Embeddable player at `https://hub.quakeworld.nu/demo-player/?demo_sha256={hash}&width=x&height=y`

postMessage events broadcast to parent window:

```js
// Time heartbeat — every 100ms
{ key: "current_time", value: fte.getDemoElapsedTime() }

// On seek (timeline drag, keyboard shortcut)
{ key: "seek", value: seekTimeInSeconds }

// On speed change (pause/play/slow-mo)
{ key: "set_speed", value: percentSpeed }  // 0=paused, 100=normal, 200=2x

// On POV track change
{ key: "track", value: playerId }
```

Implementation in the Hub demo-player app:
```js
function postMessage(key, value) {
  window.parent.postMessage({ key, value }, "*");
}

useFteEvent("track", (e) => postMessage("track", e.detail.value));
useFteEvent("demo_setspeed", (e) => postMessage("set_speed", parseInt(e.detail.value)));
useFteEvent("demo_jump", (e) => postMessage("seek", parseInt(e.detail.value)));
useInterval(() => {
  if (!fte) return;
  postMessage("current_time", fte.getDemoElapsedTime());
}, 100);
```

No new routes, no storage, no dependencies, no architectural changes.

## Distribution Tiers

Three ways users can get voice audio into the player, from simplest to most integrated:

### Tier 1 — Drag & Drop (zero infrastructure)

User has audio files (from their own Docker instance or shared by teammates).
They open a match on the replay page, drag a zip of OGG files into the browser.
Audio plays synced with the demo. Nothing leaves the browser.

**Use case**: Privacy-first teams who want full control. Also the simplest PoC to build.

### Tier 2 — Self-Hosted Docker (privacy, seamless UX)

Team runs their own Quad Docker instance. Bot records, pipeline slices and matches.
The Docker exposes a lightweight API that serves audio files.

The replay page connects to THEIR Docker's API for audio — our server never touches the audio.
Our site only knows which matches have audio available (metadata), not the content.

```
Replay Page ──► Team's Docker API ──► Audio files
     │
     └──► Hub API ──► Demo + metadata
```

**Use case**: Teams who want seamless playback but don't trust centralized audio storage.
Privacy by architecture — audio stays on their server.

### Tier 3 — Hosted Service (easiest for users)

Our bot joins their channel, records, processes, serves audio via our API.
Teams get an API key. Privacy toggle: private (team-only) or public.

**Use case**: Teams who just want it to work. No Docker, no self-hosting.
We handle everything.

### All Three Tiers Share

- Same postMessage sync mechanism
- Same audio player UI
- Same time offset calculation
- Same OGG/Opus format

The only difference is where `<audio src="...">` points to.

## Audio Serving — Technical Options

### Tier 1: Local Files

```js
// User drops files, we create object URLs
const audioUrl = URL.createObjectURL(droppedFile);
audioElement.src = audioUrl;
```

### Tier 2: Self-Hosted API

```
GET https://{team-docker-host}:{port}/api/audio/{game_id}/{track_number}
→ Returns OGG file

GET https://{team-docker-host}:{port}/api/audio/{game_id}/manifest
→ Returns { tracks: [{ player, file, offset }], game_id, hub_match_id }
```

Team configures their Docker's public URL in the replay page settings (stored in localStorage).

### Tier 3: Hosted API

```
GET https://api.quake.world/audio/{game_id}/{track_number}
Authorization: Bearer {api_key}
→ Returns OGG file

GET https://api.quake.world/audio/{game_id}/manifest
→ Returns same manifest format as Tier 2
```

## Audio Manifest Format

Regardless of source, audio is described by a manifest:

```json
{
  "schema_version": 1,
  "hub_game_id": "abc123",
  "demo_sha256": "def456...",
  "recording_offset_ms": -2340,
  "tracks": [
    {
      "track_number": 1,
      "player_name": "ParadokS",
      "discord_username": "paradoks",
      "qw_name": "ParadokS",
      "file": "1-paradoks.ogg",
      "duration_seconds": 1200
    }
  ]
}
```

The `recording_offset_ms` is the key alignment value: how many milliseconds the audio leads (+) or lags (-) the demo start.

## User Experience

### PoC (Tier 1 only)

1. Open replay page with a Hub game URL
2. Demo loads in iframe, starts playing
3. Click "Add Voice" → file picker or drag-drop zone
4. Select OGG files (or a zip)
5. Audio tracks appear as toggleable speaker lanes below the player
6. Volume mixer: game audio vs each speaker
7. Everything synced to the demo timeline

### Future (Tier 2/3)

1. Open a match on MatchScheduler
2. If voice recordings exist, a speaker icon appears
3. Click it → audio tracks load automatically
4. Same playback experience, zero manual steps

## PoC Scope

**vikpe has already delivered the embeddable player + postMessage. Building directly on MatchScheduler.**

### What we build (on MatchScheduler — scheduler.quake.world):

- [ ] "Watch with Voice" button on match results (Match History, H2H, Form tabs)
- [ ] Embedded Hub demo player iframe (real, not mocked)
- [ ] Drop zone for OGG files or zip of match directory
- [ ] Sync audio to demo via postMessage (`current_time`, `seek`, `set_speed`)
- [ ] Per-speaker volume controls + master volume
- [ ] Offset fine-tune slider (-10s to +10s)
- [ ] Test with ]sr[ vs Book recordings from 2026-02-11/12

### Resolved Questions (as of 2026-02-12)

- [x] **Game ID format**: SHA256 of demo file (`demo_sha256`). Used in iframe URL and manifest.
- [x] **Demo countdown duration**: Variable per demo. Available in DemoInfo JSON at `https://d.quake.world/{sha[0:3]}/{sha}.mvd.info.json` as `countdown_duration`.
- [x] **Embeddable player**: Live at `https://hub.quakeworld.nu/demo-player/?demo_sha256={hash}&width=x&height=y`
- [x] **postMessage origin**: `https://hub.quakeworld.nu` — validate in event handler.
- [x] **Browser autoplay policies**: "Watch with Voice" click is user gesture. Audio `.play()` after file drop (second gesture).

### Open Product Questions

- [ ] **Privacy model**: For Tier 3, how granular? Per-match? Per-session? Per-team?
- [ ] **Retention**: How long do we store audio in Tier 3? Storage costs for OGG are low but not zero.
- [ ] **Multi-team**: If both teams recorded, can you hear both sides? (Yes technically, but UX question)
- [ ] **Spectator mode**: Could spectators hear comms during live QTV? (Future, requires streaming, much harder)

## Competitive Landscape

- **No existing solution** in any Quake community
- **CS2/Valorant**: Pro matches have caster audio but no team comms synced to demos
- **Overwatch League**: Had "listen-in" segments but not user-controllable
- **Craig bot**: Records voice but no demo sync — just raw audio files on Google Drive

This would be a genuine first in competitive FPS voice analysis.

## Phases

### Phase 1 — PoC on MatchScheduler (now)
- Voice replay integrated into match results on scheduler.quake.world
- Drag-and-drop OGG/zip loading
- Real iframe sync via vikpe's postMessage API
- Proves end-to-end concept works

### Phase 2 — Audio Serving (Tier 2)
- Quad Docker exposes HTTP API to serve audio by game ID
- MatchScheduler auto-loads audio when available (no manual file drop)
- Privacy by architecture — audio stays on team's server

### Phase 3 — Hub Integration
- vikpe integrates voice replay directly into Hub game pages (Hub v2)
- Audio available on hub.quakeworld.nu match pages
- Public/private toggle for teams who want to share

### Phase 4 — Community Adoption
- Multiple teams recording and reviewing
- Public voice replay for notable matches
- Voice comms as part of the match record alongside demos and stats
