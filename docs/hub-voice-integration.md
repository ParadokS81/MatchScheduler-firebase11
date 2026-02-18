# Voice Track Integration for Hub Demo Player

## What we need

When embedding the hub demo-player as an iframe, we want to pass voice recording audio tracks so the player can render volume controls and sync playback natively. This allows voice controls to work in fullscreen (currently impossible since our overlay lives outside the iframe).

## Proposed API: postMessage

After the iframe loads, the parent sends voice track data:

```js
iframe.contentWindow.postMessage({
    type: 'voice-tracks',
    tracks: [
        { name: 'zero', url: 'https://firebasestorage.googleapis.com/v0/b/matchscheduler-dev.firebasestorage.app/o/voice-recordings%2F...' },
        { name: 'razor', url: '...' },
        { name: 'ParadokS', url: '...' },
        { name: 'TheChosenOne', url: '...' }
    ],
    offset: 1.0  // seconds to offset audio vs demo (positive = audio starts later)
}, 'https://hub.quakeworld.nu');
```

## What the player would do

1. Listen for `message` event with `type: 'voice-tracks'`
2. Create an `Audio` element per track (`new Audio(url)`)
3. Render a floating control panel (only when `tracks.length > 0`):
   - Master volume slider
   - Per-track volume slider + mute toggle + player name label
   - Sync offset slider (±5s range)
4. Sync audio playback position with demo timeline:
   - `audio.currentTime = demoCurrentTime + offset`
   - Play/pause audio when demo plays/pauses
5. Controls follow the same show/hide behavior as existing controls (visible on hover, hidden on idle)

## Audio files

- Format: OGG/Opus, mono, 48kHz
- Duration: full match length (~20 min)
- Hosted on Firebase Storage (public download URLs, no auth needed)
- CORS: Firebase Storage serves with appropriate headers for `<audio>` elements

## Alternative: URL parameter

If postMessage feels heavy, a URL parameter approach could work too:

```
https://hub.quakeworld.nu/demo-player/?demo_sha256=abc123&voice=https://scheduler.quake.world/api/voice-manifest/abc123
```

The manifest URL would return JSON:
```json
{
    "tracks": [
        { "name": "zero", "url": "https://firebasestorage.googleapis.com/..." },
        { "name": "razor", "url": "..." }
    ],
    "offset": 1.0
}
```

## Current workaround

We overlay controls outside the iframe using absolute positioning + z-index. This works in windowed mode but controls disappear in fullscreen (browser security: only the fullscreen element and its children are visible). We fullscreen the wrapper div instead, but this breaks the hub's native fullscreen button.
