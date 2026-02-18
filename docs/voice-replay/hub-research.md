# Hub Codebase Research — Demo Player Internals

Research conducted 2026-02-11 from https://github.com/quakeworldnu/hub.quakeworld.nu

## Tech Stack

- React 18.3.1 + TypeScript 5.7.2
- Vite 6.0.3 build tooling
- Redux Toolkit 2.5.0 for state management
- Tailwind CSS 3.4.16
- Radix UI for slider, dialog, switch components
- Biome for linting/formatting (not ESLint)
- Supabase for backend data
- Sentry for error tracking

## FTE Engine Integration

### Loading

- FTE compiled to WebAssembly, loaded from CDN: `fte/versions/004/ftewebgl.js`
- Emscripten pattern: script exposes `window.Module` (engine) and `window.FTEC` (command interface)
- `useFteLoader` hook dynamically loads the script
- `FTEC.cbufadd(command + "\n")` sends console commands to the engine

### Initialization

```typescript
window.Module = {
  canvas: document.getElementById("fteCanvas"),
  manifest: manifestUrl,
  arguments: ["-manifest", manifestUrl],
  files: assets,  // demo, maps, textures, sounds, models from CloudFront
  setStatus: (value) => { /* loading progress */ }
};
```

### Engine Ready Detection

- Polls `window.Module.getClientState` every 100ms
- Once available, creates `FteController` singleton

## FteController — The Key Class

Located at `fte/fteController.ts`. Wraps the engine with a clean TypeScript API.

### Time & Playback

| Method | Description |
|--------|-------------|
| `getDemoElapsedTime()` | Current playback position (seconds, float). Includes countdown. |
| `getDemoDuration()` | Total demo length in seconds |
| `demoJump(seconds)` | Seek to absolute time. Clamps to [0, duration+1.1]. Skips <1s jumps. |
| `setSpeed(percent)` | 0 = paused, 100 = normal, 200 = 2x |
| `togglePlay()` | Pause/resume |

### Commands (via cbufadd)

| Command | Effect |
|---------|--------|
| `demo_jump <seconds>` | Seek to time |
| `demo_setspeed <percent>` | Set playback speed |
| `track <userid>` | Follow specific player POV |
| `cl_autotrack stats\|user` | Auto-follow fragger or manual |
| `volume <0-1>` | Audio volume |

### Events

FteController dispatches custom events on `window`:
- `fte.volume` — volume changed
- `fteplayer.mouse.idle` / `fteplayer.mouse.active` — UI show/hide

### Internal State

- `_demoSpeed` — current speed (0 = paused)
- `_volume` — current volume level
- Volume clamped to max 0.2 (game sounds are loud)

## Demo Serving

### CloudFront CDN

```
Base URL: ${VITE_DEMOS_CLOUDFRONT_URL}
Demo: /${sha256.substring(0,3)}/${sha256}.mvd.gz
Info: /${sha256.substring(0,3)}/${sha256}.mvd.info.json
```

### DemoInfo Schema

```typescript
{
  sha256: string;
  filename: string;
  timestamp: string;
  mode: string;            // "4on4", "ctf", etc.
  map: string;
  teams: Team[];
  players: Player[];
  demo_duration: number;       // Total seconds (includes countdown)
  countdown_duration: number;  // Pre-match countdown
  match_duration: number;      // Actual gameplay time
  server: Server;
}
```

`countdown_duration` is key for our offset calculation.

## TimeSlider Component

Located at `player/controls/TimeSlider.tsx`.

- Uses Radix UI Slider (`@radix-ui/react-slider`)
- Polls `fte.getDemoElapsedTime()` every 100ms via `useUpdateInterval()`
- Range: 0 to `fte.getDemoDuration()`
- Seek: throttled to 200ms, calls `fte.demoJump()`
- Hover tooltip shows formatted time
- Visual: violet gradient track, white thumb

### Keyboard Shortcuts

- Arrow Left/Right: ±1 second
- Shift + Arrow: ±10 seconds
- Space: track next player
- Ctrl: toggle play/pause
- Tab: scoreboard

## Component Hierarchy

```
DemoPlayer.tsx (root)
├── FteDemoPlayer.tsx (main player)
│   ├── FtePlayerCanvas.tsx (canvas + event capture)
│   │   └── <canvas id="fteCanvas" />
│   ├── ResponsivePlayerInfo.tsx (HUD overlay)
│   ├── ResponsiveTopBanner.tsx (participants + clock)
│   └── FteDemoPlayerControls.tsx (control bar)
│       ├── TimeSlider.tsx (progress bar)
│       ├── Volume.tsx (volume controls)
│       ├── PlayToggle.tsx
│       ├── SeekToStartButton / SeekToEndButton
│       ├── AutotrackToggle.tsx
│       ├── SlowmotionToggle.tsx
│       ├── ConsoleToggle.tsx
│       └── FullscreenToggle.tsx
└── DemoPlayerFooter.tsx (metadata + scoreboard + stats)
```

## Asset System

Located at `fte/assets.ts`.

- `getDemoPlayerAssets()` — loads demo file, map BSP, config, textures, models, sounds
- Assets fetched from CloudFront CDN
- Demo mapped as `"qw/match.mvd.gz": demoUrl`
- Map BSP: `"id1/maps/${mapName}.bsp"`
- 400+ texture/model/sound files pre-loaded

## Current Audio

- ALL audio is internal to FTE engine (game sounds, ambient)
- No Web Audio API usage
- No external audio sources
- Volume controlled only via engine console commands
- No mechanism to inject or overlay custom audio

## Backend API

- Hub API: `https://hubapi.quakeworld.nu/v2/`
- Separate repo: [vikpe/qw-hub-api](https://github.com/vikpe/qw-hub-api) (Go)
- Demo metadata served alongside CloudFront demo files

## vikpe's Coding Style

From biome.json and codebase patterns:
- Automatic import sorting
- Pragmatic linting (rules disabled where they conflict with patterns)
- Clean component separation
- Hooks-based architecture (no class components)
- TypeScript throughout
- No over-engineering — minimal abstractions

## Key Observations for Integration

1. **FteController is the integration point** — it already has all the time/playback APIs we need
2. **postMessage is the right approach** — the controller can broadcast time without any UI changes
3. **No iframe player route exists yet** — vikpe said he'd create one
4. **Countdown duration is in DemoInfo** — critical for our offset calculation
5. **All audio is engine-internal** — voice overlay would be entirely separate from FTE audio
6. **The polling pattern (100ms) already exists** — TimeSlider does this, so postMessage at the same rate is natural
