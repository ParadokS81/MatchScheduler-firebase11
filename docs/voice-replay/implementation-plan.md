# Voice Replay PoC — Implementation Plan

## Context

vikpe has shipped the embeddable Hub demo player with postMessage sync API (live as of 2026-02-12). We have per-player OGG/Opus audio files from Quad's pipeline, automatically matched to Hub games by `demo_sha256`. The goal: a standalone voice replay page on MatchScheduler where users can watch a demo with synced team voice comms.

**Tier 1 only** — drag-and-drop audio files, no server infrastructure needed. The postMessage API is already live, no mocking required.

## What Quad Produces (Per Match)

The pipeline outputs per-player, per-map audio with full metadata:

```
processed/{segment_dir}/
├── metadata.json          # demoSha256, players, timing, ktxstats
└── audio/
    ├── ParadokS.ogg       # Per-player sliced audio (~1 MB/min)
    ├── zero.ogg
    ├── Razor.ogg
    └── grisling.ogg
```

Key fields in `metadata.json`:
- `demoSha256` — links to exact Hub demo
- `map` — map name
- `startTime` / `endTime` — seconds into recording session
- `players[].name` — display name (QW name, not Discord username)
- `players[].audioFile` — path to OGG file
- `players[].duration` — actual extracted duration in seconds
- `matchData.teams` — team names and scores from Hub
- `ktxstats` — full per-player stats from d.quake.world

**Audio format**: OGG container, Opus codec, 48kHz stereo. Native Discord format — no transcoding in the pipeline (ffmpeg uses `-c copy` stream slicing). ~1 MB per player per minute.

**No Quad changes needed.** Pipeline output is ready for Tier 1.

## Architecture: Standalone Popout Page

The replay experience lives on a **standalone page** (`replay.html`), launched from MatchScheduler via a button. This gives the demo player full browser viewport and keeps MatchScheduler state untouched.

```
MatchScheduler (main tab)                  Replay Page (new tab/popout)
┌────────────────────────────┐            ┌──────────────────────────────┐
│ Teams → Match History      │            │ Hub Demo Player (iframe)     │
│                            │  click     │ Full width, ~70vh            │
│ [🎧 Watch with Voice] ────────────►    │                              │
│                            │            ├──────────────────────────────┤
│ (state preserved)          │            │ Drop zone / Audio controls   │
└────────────────────────────┘            └──────────────────────────────┘
```

**Why popout, not panel replacement:**
- Demo player gets the viewport space it deserves
- MatchScheduler grid and state untouched
- Standalone page is shareable via URL (`replay.html?demo={sha256}`)
- Natural foundation for future match browser, Tier 2/3 audio sources
- Clean proof of concept for pitching to vikpe / Hub integration

## File Drop: Three Input Modes

The drop zone accepts three input types, all converging to the same result (array of named audio tracks):

### 1. Single OGG file
User drops one `.ogg` file. One track plays, synced to demo. Use case: hear just the IGL, or test with a single recording.

### 2. Multiple OGG files
User drops several `.ogg` files at once. Each becomes a track with individual volume control.

**Player name extraction from filename:**
- `paradoks.ogg` → "paradoks"
- `1-paradoks.ogg` → "paradoks" (strip track number prefix)
- `ParadokS.ogg` → "ParadokS" (preserve case)

### 3. Zip of match directory
User drops a `.zip` containing `metadata.json` + `audio/*.ogg` (Quad's output format). Frontend extracts OGGs, reads metadata for richer player info. Future: zip could identify which demo to load via `demoSha256`.

**Zip reading**: [JSZip](https://stuk.github.io/jszip/) loaded from CDN. Lightweight, no dependencies.

### File Validation
- **Accept filter**: `.ogg`, `.opus`, `.webm`, `.zip` extensions on `<input>` and drop handler
- **Audio validation**: Create `<audio>` element, listen for `canplay` vs `error`. If browser can't play it, show "Couldn't load {filename}" and skip. No codec sniffing needed.
- **Zip validation**: Look for `.ogg`/`.opus` files inside. `metadata.json` is a bonus, not required. Ignore everything else.
- **No over-engineering**: The audience is QW players dropping files from Quad's pipeline, not adversarial users.

## Sync Mechanism

The Hub demo player is the **master clock**. Audio follows it via postMessage.

### postMessage Events (from Hub iframe → replay page)

```js
{ key: "current_time", value: 123.456 }   // Every 100ms — demo elapsed seconds
{ key: "seek", value: 512 }               // User dragged timeline
{ key: "set_speed", value: 100 }           // 0=paused, 100=normal, 200=2x
{ key: "track", value: playerId }          // POV changed
```

### Time Alignment Formula

```
audioTime = demoElapsedTime - countdownDuration + manualOffset
```

- `demoElapsedTime` — from `current_time` postMessage (includes countdown)
- `countdownDuration` — from DemoInfo JSON (typically 10-13s, varies per demo)
- `manualOffset` — user fine-tune slider, range -10s to +10s, default 0

If `audioTime < 0` (still in countdown), audio stays paused.

### DemoInfo Source

```
https://d.quake.world/{sha[0:3]}/{sha}.mvd.info.json
```

Returns `countdown_duration`, `demo_duration`, `match_duration`, map, teams, players. Immutable data — cache indefinitely. Fetched directly in VoiceReplayService (no dependency on QWHubService from main app).

### Drift Correction

The 100ms polling interval means time values jitter slightly. Strategy:
- On each `current_time`: calculate expected `audioTime`, compare with `audio.currentTime`
- **Only re-seek if drift > 300ms** — avoids constant micro-seeks that cause audio glitches
- On `seek` event: always hard-seek immediately (user explicitly jumped)
- On `set_speed` event: update `audio.playbackRate` immediately

### Speed Handling

`set_speed` value maps to audio control:
- **0 (paused)**: call `audio.pause()` — note: `playbackRate = 0` is invalid in HTML5 Audio
- **100 (normal)**: call `audio.play()`, set `audio.playbackRate = 1.0`
- **200 (2x)**: call `audio.play()`, set `audio.playbackRate = 2.0`
- General: `audio.playbackRate = value / 100`, but branch on 0 for pause

### Base Offset for Bare OGG Drops

When dropping individual OGG files (no `metadata.json`), there's no `recording_offset_ms` available. The formula assumes audio starts at match start (t=0 after countdown), which is correct — Quad slices audio to match boundaries. The manual offset slider handles any remaining alignment.

With a zip containing `metadata.json`, a future enhancement could read timing data for more precise auto-alignment. Not needed for PoC.

## Files

| File | Action | Purpose |
|------|--------|---------|
| `public/replay.html` | **NEW** | Standalone replay page (HTML + scripts + CSS) |
| `public/js/services/VoiceReplayService.js` | **NEW** | Audio sync engine, postMessage handler, file loading |
| `public/js/components/VoiceReplayPlayer.js` | **NEW** | Replay UI: iframe, drop zone, volume controls, offset slider |
| `public/js/components/TeamsBrowserPanel.js` | MODIFY | Add "Watch with Voice" button → opens replay.html |
| `src/css/input.css` | MODIFY | Styles for replay page with `vr-` prefix |

**Not modified:** `QWHubService.js`, `index.html` — replay page is self-contained, fetches DemoInfo directly.

## Implementation Steps

### Step 1: VoiceReplayService.js (NEW)

Revealing Module Pattern. Pure logic, no DOM manipulation. Manages audio sync and file loading.

**Core state:**
```js
let _tracks = [];           // [{ name, audio, objectUrl }]
let _masterVolume = 0.8;
let _manualOffset = 0;      // seconds, from user slider
let _countdownDuration = 10; // from DemoInfo, default fallback
let _isPlaying = false;
let _currentSpeed = 1.0;
let _messageHandler = null;  // stored for cleanup
```

**postMessage listener:**
- Validate `event.origin === 'https://hub.quakeworld.nu'`
- Dev mode: log all events to console regardless of origin, for debugging
- Handle `current_time`: calculate audioTime, check drift, seek if needed
- Handle `seek`: hard-seek all tracks immediately
- Handle `set_speed`: pause if 0, else set playbackRate and play

**File loading (`loadFiles(fileList)`):**
1. Filter to audio extensions (`.ogg`, `.opus`, `.webm`)
2. For each file: create `<audio>` element, set `src` to `URL.createObjectURL(file)`
3. Wait for `canplay` event (or `error` → skip with warning)
4. Extract player name from filename (strip extension, strip leading `{n}-` prefix)
5. Add to `_tracks` array
6. Return array of `{ name, index, duration }` for UI to render

**Zip loading (`loadZip(file)`):**
1. Read file with `JSZip.loadAsync(file)`
2. Find all `.ogg`/`.opus` files in zip (may be in root or `audio/` subdirectory)
3. Optionally read `metadata.json` for player names and timing
4. Create `<audio>` elements from extracted blobs via `URL.createObjectURL()`
5. Return same format as `loadFiles()`

**Public API:**
```js
init(countdownDuration)          // Set countdown, attach postMessage listener
cleanup()                        // Revoke URLs, remove listener, clear tracks
loadFiles(fileList) → Promise    // Load individual audio files
loadZip(file) → Promise          // Load zip archive
setTrackVolume(index, vol)       // 0.0 - 1.0, applied as vol * masterVolume
setMasterVolume(vol)             // 0.0 - 1.0, reapplies to all tracks
setManualOffset(seconds)         // -10 to +10
getTracks()                      // Returns [{ name, index, duration }]
getState()                       // Returns { isPlaying, currentSpeed, trackCount }
```

### Step 2: VoiceReplayPlayer.js (NEW)

Revealing Module Pattern. UI component that renders the replay interface into `replay.html`.

**`init(container, demoSha256, matchTitle)`:**
1. Fetch DemoInfo: `https://d.quake.world/{sha[0:3]}/{sha}.mvd.info.json`
   - Extract `countdown_duration` (fallback: 10s if fetch fails)
2. Init `VoiceReplayService.init(countdownDuration)`
3. Render layout into container

**Page layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Header: match title (from URL params or DemoInfo)      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Hub Demo Player iframe                                 │
│  src="https://hub.quakeworld.nu/demo-player/            │
│       ?demo_sha256={hash}"                              │
│  width: 100%, flex-grow to fill available height        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  DROP ZONE (before files loaded):                       │
│  ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐  │
│  ╎  Drop OGG files or zip here                      ╎  │
│  ╎  or [Browse files]                                ╎  │
│  └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘  │
│                                                         │
│  CONTROLS (after files loaded):                         │
│  Master Volume  ━━━━━━●━━━━━━  80%                      │
│  Offset         ━━━━━━●━━━━━━  +0.0s                    │
│  ── Tracks ─────────────────────────────────────────    │
│  ParadokS  ━━━━━━●━━━━━━ 100%                           │
│  Razor     ━━━━━━●━━━━━━ 100%                           │
│  zero      ━━━━━━●━━━━━━ 100%                           │
│  grisling  ━━━━━━●━━━━━━ 100%                           │
└─────────────────────────────────────────────────────────┘
```

**Drop zone behavior:**
- `<input type="file" multiple accept=".ogg,.opus,.webm,.zip">`
- Drag-over: dashed border highlight (CSS class toggle)
- On drop / file select:
  - Detect `.zip` → `VoiceReplayService.loadZip(file)`
  - Else → `VoiceReplayService.loadFiles(fileList)`
- After loading: hide drop zone, show track controls
- Show "Couldn't load {filename}" for any failed files (non-blocking)

**Controls (native `<input type="range">` sliders):**
- Master volume: 0-100, default 80, calls `VoiceReplayService.setMasterVolume(val/100)`
- Offset: -10.0 to +10.0, step 0.1, default 0, calls `VoiceReplayService.setManualOffset(val)`
- Per-track volume: 0-100, default 100, calls `VoiceReplayService.setTrackVolume(index, val/100)`

**Inline event handlers** (same pattern as existing TeamsBrowserPanel):
```html
<input type="range" oninput="VoiceReplayPlayer.setMasterVolume(this.value)">
```

### Step 3: replay.html (NEW)

Standalone HTML page in `public/`. Shares MatchScheduler's design system via `css/main.css`.

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Voice Replay — QuakeWorld Match Scheduler</title>
    <link href="css/main.css?v=20260212" rel="stylesheet">
</head>
<body class="bg-background text-foreground min-h-screen flex flex-col">

    <div id="replay-root" class="flex flex-col flex-1">
        <!-- VoiceReplayPlayer renders here -->
    </div>

    <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
    <script src="js/services/VoiceReplayService.js?v=20260212"></script>
    <script src="js/components/VoiceReplayPlayer.js?v=20260212"></script>
    <script>
        // Read URL params
        const params = new URLSearchParams(window.location.search);
        const demoSha256 = params.get('demo');
        const title = params.get('title') || '';

        if (demoSha256) {
            VoiceReplayPlayer.init(
                document.getElementById('replay-root'),
                demoSha256,
                decodeURIComponent(title)
            );
        } else {
            document.getElementById('replay-root').innerHTML =
                '<p class="text-muted-foreground p-8">No demo specified. Add ?demo={sha256} to the URL.</p>';
        }
    </script>
</body>
</html>
```

**URL parameters:**
- `demo` (required) — demo SHA256 hash, used for iframe URL and DemoInfo fetch
- `title` (optional) — match description shown in header (e.g., "]sr[ 265-195 Book on e1m2")

**Design system:** Uses `css/main.css` (compiled Tailwind + custom properties). Dark mode by default (`class="dark"` on html). All existing Tailwind utilities and CSS variables (`--primary`, `--border`, `--muted-foreground`, etc.) are available.

**Note:** Tailwind content config (`tailwind.config.js`) already scans `public/**/*.{html,js}`, so `replay.html` is automatically included in the build.

### Step 4: TeamsBrowserPanel.js — Launch Button

Minimal change. Add a button that opens the replay page.

**4a. Add button to `_renderStatsView()`** (inside `.mh-actions` div, after existing "View on QW Hub" link):
```html
${match.demoHash ? `
    <button class="mh-action-link" onclick="TeamsBrowserPanel.openVoiceReplay('${match.id}')">
        &#127911; Watch with Voice
    </button>
` : ''}
```

Only shown when `match.demoHash` exists. Appears in Match History, H2H, and Form tabs since they all use `_renderStatsView()`.

**4b. Add `openVoiceReplay(matchId)` function:**
```js
function openVoiceReplay(matchId) {
    const match = _matchDataById.get(String(matchId));
    if (!match || !match.demoHash) return;

    const title = `${match.ourTag} ${match.ourScore}-${match.opponentScore} ${match.opponentTag} on ${match.map}`;
    const url = `replay.html?demo=${match.demoHash}&title=${encodeURIComponent(title)}`;
    window.open(url, '_blank');
}
```

**4c. Export** `openVoiceReplay` in the return object.

### Step 5: CSS — `src/css/input.css`

Add `vr-` prefixed styles for the replay page. Use existing CSS variables.

**Classes needed:**
- `.vr-header` — match title bar, subtle background
- `.vr-iframe-wrap` — flex-grow container for iframe
- `.vr-iframe` — 100% width/height, no border
- `.vr-dropzone` — dashed border, centered content, drag-over highlight state
- `.vr-dropzone-active` — highlight on drag-over (border color change)
- `.vr-controls` — compact panel below iframe
- `.vr-track-row` — name + slider + percentage per speaker
- `.vr-slider` — styled range input matching site theme

**Principles:**
- rem units throughout (except 1px borders)
- Use `var(--primary)`, `var(--border)`, `var(--muted-foreground)`, etc.
- Keep controls compact — maximize iframe viewport space
- Drag-over highlight should be obvious (border color → primary)

Rebuild after editing: Tailwind watcher handles this, or run `npm run css:build`.

## Key Design Decisions

1. **Standalone popout page** — gives demo player full viewport, preserves MatchScheduler state, shareable URL, natural foundation for future features
2. **Self-contained** — replay.html doesn't depend on MatchScheduler's JS modules (no QWHubService import). Fetches DemoInfo directly. Only shares CSS.
3. **Offset: auto-calculated + manual fine-tune** — `audioTime = demoTime - countdownDuration + manualOffset`, slider range -10s to +10s
4. **DemoInfo fetched from CDN** — `countdown_duration` per demo, cached indefinitely (immutable data), fallback to 10s if fetch fails
5. **Autoplay policy**: "Watch with Voice" click is the user gesture that opens the tab. File drop is a second user gesture that triggers `audio.play()`. Both satisfy browser autoplay requirements.
6. **postMessage is already live** — vikpe deployed it on hub.quakeworld.nu, real sync from day one
7. **No Quad changes** — pipeline output has everything needed for Tier 1
8. **OGG/Opus format** — native Discord codec, zero transcoding, ~1 MB/min, supported in all modern browsers (Chrome, Firefox, Edge, Safari 15+)
9. **playbackRate = 0 is invalid** — speed handler branches: 0 → `audio.pause()`, non-zero → `audio.play()` + set `playbackRate`
10. **Origin validation** — verify `event.origin === 'https://hub.quakeworld.nu'` on postMessage. In dev: log events to console for debugging.

## Verification

1. Rebuild CSS (`npm run css:build` or Tailwind watcher)
2. Open `replay.html?demo={known_sha256}` directly — iframe should load Hub demo player
3. Verify postMessage events in console (DemoInfo loads, `current_time` events flow)
4. Drop single OGG → one track appears, audio syncs to demo
5. Drop multiple OGGs → multiple tracks with individual volume controls
6. Drop zip with audio/*.ogg → same result, player names from filenames
7. Demo plays → audio plays. Demo pauses → audio pauses.
8. Drag timeline → audio jumps to correct position
9. Change speed (slow-mo, 2x) → audio playback rate follows
10. Adjust offset slider → audio shifts, drift corrects
11. Test in MatchScheduler: Teams → Match History → click match → "Watch with Voice" opens replay.html in new tab with correct demo hash

## Test Data

Use recordings from 2026-02-11/12 ]sr[ vs Book matches:
- Available in Quad's `recordings/` → `processed/` directories
- Known `demoSha256` values in segment `metadata.json`
- 4 players: ParadokS, zero, Razor, grisling
- Maps: e1m2, dm3, dm2 (typical 4on4 rotation)

## Future (Out of Scope for PoC)

- **Match browser sidebar** — browse matches with filtering, replaces URL param entry
- **Player mode** — full grid takeover with expanded player + stats panels
- **Tier 2 auto-load** — replay.html fetches audio from team's Docker API via URL param
- **Tier 3 hosted** — audio served from our API, zero user interaction needed
- **Hub native integration** — vikpe integrates directly into hub.quakeworld.nu
