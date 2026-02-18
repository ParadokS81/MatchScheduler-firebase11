# Phase 5: Match Playback & Recording Discovery — Multi-Clan Voice Replay

## Context

Phases 1–4 built the full pipeline: bot registration, multi-clan uploads with name resolution, Firestore privacy rules, and a team-level default visibility toggle. The existing `replay.html` PoC proves the WebQTV iframe + voice overlay sync works.

Phase 5 makes all of this usable within the main MatchScheduler app — no more navigating to a separate replay page. It has three independent workstreams:

1. **Team Settings modal restructure** — tabs for Settings / Discord / Recordings
2. **Match History table enhancement** — voice indicators, inline playback, table optimization
3. **Per-recording visibility management** — in the new Recordings tab

Read `docs/multi-clan/CONTRACT.md` for the schema reference.

---

## Workstream 1: Team Settings Modal Tabs

### Current State

The TeamManagementModal (`TeamManagementModal.js`, ~1,528 lines) stacks all sections vertically: logo/details, scheduler permissions, privacy toggles, Voice Bot, leader actions, leave team. There are no tabs.

### What to Build

Convert the modal body into a tabbed layout with three tabs:

**Tab 1: "Team Settings"** (default)
- Logo & details (tag, max players, divisions, join code)
- Scheduling Permissions (collapsible)
- Privacy toggles (hide roster names, hide from comparison)
- Leader Actions (remove player, transfer leadership)
- Leave Team

**Tab 2: "Discord"**
- Voice Bot section (connect/pending/active states) — moved from current position
- Recording Visibility default toggle (Phase 4) — stays with Voice Bot
- Future: announcement channel settings, match notification settings

**Tab 3: "Recordings"**
- List of team's voice recordings with per-recording visibility toggles
- See Workstream 3 for details

### Tab UI Pattern

Use a simple horizontal tab bar at the top of the modal body, below the header:

```html
<div class="flex border-b border-border mb-4">
    <button class="tab-btn active" data-tab="settings">Team Settings</button>
    <button class="tab-btn" data-tab="discord">Discord</button>
    <button class="tab-btn" data-tab="recordings">Recordings</button>
</div>
<div id="tab-content-settings">...</div>
<div id="tab-content-discord" class="hidden">...</div>
<div id="tab-content-recordings" class="hidden">...</div>
```

Tabs should be visible to **leaders only** (non-leaders only see the Team Settings tab content without tab UI, since Discord and Recordings are leader features).

### Implementation Notes

- The Voice Bot section is **async-loaded** with a real-time Firestore listener. When moving it to the Discord tab, preserve the `_initVoiceBotSection()` pattern — load on first tab switch, not on modal open (lazy init).
- The Recordings tab should also lazy-load its data on first tab switch.
- Tab state does NOT need to persist across modal open/close — always open to "Team Settings".

---

## Workstream 2: Match History Table Enhancement

### Current State

The Match History table in `TeamsBrowserPanel.js` (lines 865-911) renders a grid with columns:

```
date | spacer | map | us | score | score | vs | w/l
```

Grid template: `3.25rem 1rem 4rem 2.75rem 2rem 2rem 3rem 1.5rem`

Currently, "Watch with Voice" is a text link in the sticky stats panel (right side), visible only after clicking a match row. It opens `replay.html` in a new tab.

### Changes

#### A. Remove w/l Column → Action Icons

Replace the `w/l` text column with two small icons side by side:

- **Play icon** — always visible, launches the WebQTV player inline in the right panel
- **Headphone/mic icon** — visible only when a voice recording exists for this match. Clicking it launches the player WITH voice tracks auto-loaded.

If no voice recording exists, only the play icon shows. Both icons fit in the ~1.5rem freed column (or slightly wider if needed — adjust grid template).

#### B. Color-Code Scores for Win/Loss

Since the w/l column is gone, the two score columns carry the win/loss signal:

- **Win:** Our score in green (`text-green-500` or equivalent), opponent score in red
- **Loss:** Our score in red, opponent score in green
- **Draw:** Both in muted/neutral color

This replaces the explicit W/L/D text while conveying the same information.

#### C. Filter Dropdown Optimization (Optional)

Consider these space-saving tweaks to make room if the icon column needs more width:

- "All Opponents" → "All Teams" (shorter label, use team tags which are 1-4 chars)
- Map names are already short (dm2, e1m2, schloss) — no change needed

#### D. Voice Recording Discovery

When the Match History tab loads for a team, fetch that team's voice recordings to know which matches have audio:

```javascript
// Query voiceRecordings where teamId matches
const recordings = await firebase.firestore()
    .collection('voiceRecordings')
    .where('teamId', '==', teamId)
    .get();

// Build a Set of demo SHA256s that have recordings
const voiceAvailable = new Set(recordings.docs.map(doc => doc.id));
```

Then when rendering each match row, check `voiceAvailable.has(match.demoHash)` to show/hide the headphone icon.

**Performance Note:** This is a single Firestore query per team, returning typically 10-50 docs (one per map per session). Cache the result alongside the match history data. The query respects visibility rules — public recordings are always returned, private recordings only for team members (per Phase 3 Firestore rules).

#### E. Inline WebQTV Player

When the user clicks the play icon (or headphone icon) on a match row:

1. The right panel (`.mh-preview-panel`) switches from the stats view to a player view
2. Embed the WebQTV iframe: `https://hub.quakeworld.nu/demo-player/?demo_sha256={demoHash}`
3. If clicked via the headphone icon (voice available), also auto-load voice tracks from Firestore

**Reuse existing components:**
- The iframe embedding pattern from `replay.html` / `VoiceReplayPlayer.js`
- The voice overlay from `VoiceReplayPlayer.js` (positioned absolute over the iframe, z-index)
- The postMessage sync from `VoiceReplayService.js`

**Implementation approach:** Extract the player initialization logic from `VoiceReplayPlayer.init()` so it can target any container (not just the replay.html root). The player component already renders an iframe + overlay + drop zone — it just needs to be mountable in the right panel.

**Right panel states:**
- **Default:** Summary panel (activity chart + breakdowns) — current behavior
- **Hover:** Scoreboard preview — current behavior
- **Click:** Sticky stats view — current behavior (but now also shows a prominent play button)
- **Play:** WebQTV player with optional voice overlay — new state

The user can get back to stats by clicking the match row again (toggle behavior) or clicking a "back to stats" control.

#### F. Play Button in Stats View

The existing "Watch with Voice" link in the stats view (line 934-937) should be promoted:

- Replace text link with a more visible play button
- If voice is available, show headphone badge on the button
- Clicking this button transitions the right panel from stats view to player view (same as clicking the play icon on the row)

### Interaction Summary

```
Match row: [date] [map] [us] [score] [score] [vs] [▶] [🎧]
                                        ↑green/red        ↑only if voice

Hover row    → scoreboard preview (right panel)
Click row    → sticky stats (right panel) with prominent play button
Click ▶      → WebQTV player (right panel), demo only
Click 🎧     → WebQTV player (right panel), demo + voice auto-loaded
Stats panel  → also has play button → same player view
```

---

## Workstream 3: Per-Recording Visibility Management

### Location

New "Recordings" tab in the Team Settings modal (see Workstream 1). Leader-only.

### What to Build

A scrollable list of the team's voice recordings, each with a visibility toggle:

```
┌─────────────────────────────────────────────────────┐
│  Recordings                              10 matches │
│─────────────────────────────────────────────────────│
│                                                     │
│  Feb 14  dm2        |sr[ 211–180 pol     🔒 ──○    │
│  Feb 14  phantombase|sr[ 189–180 pol     🔓 ○──    │
│  Feb 13  e1m2       |sr[ 249–252 pol     🔒 ──○    │
│  Feb 13  dm2        |sr[ 284–131 pol     🔓 ○──    │
│  Feb 13  schloss    |sr[ 294–192 pol     🔓 ○──    │
│  Feb 12  e1m2       |sr[ 337–142 0151    🔓 ○──    │
│  ...                                                │
│                                                     │
│  Default: Private (change in Discord tab)           │
└─────────────────────────────────────────────────────┘
```

**Each row shows:**
- Date
- Map name
- Teams + scores (match context)
- Lock icon + toggle (public/private)

**Toggle behavior:**
- Toggle ON (right/green) = `public` — anyone can find this recording
- Toggle OFF (left/gray) = `private` — team members only
- Default state: whatever was set at upload time (from `voiceSettings.defaultVisibility`)
- Follows the existing privacy toggle pattern (optimistic update + revert on error)

### Write Path

Per-recording visibility changes update the `voiceRecordings/{demoSha256}` document:

```javascript
await firebase.firestore()
    .collection('voiceRecordings')
    .doc(demoSha256)
    .update({ visibility: newVisibility });
```

**But wait** — the current Firestore rules say `allow write: if false` for voiceRecordings (only Admin SDK can write). To allow leader-initiated visibility changes from the client, we need one of:

**Option A: Cloud Function** (recommended, matches existing patterns)
```javascript
// New Cloud Function: updateRecordingVisibility
// Input: { demoSha256, visibility: 'public' | 'private' }
// Auth: Verify caller is leader of the team that owns the recording
// Action: Update voiceRecordings/{demoSha256}.visibility via Admin SDK
```

**Option B: Firestore rules update**
Allow team leaders to update only the `visibility` field on voiceRecordings docs where they're the team leader. This is possible but complex in rules.

**Recommendation:** Option A (Cloud Function). It's consistent with how the bot registration and team settings work. Add a new callable function `updateRecordingVisibility` that validates the caller is the team leader before updating.

### Data Loading

When the Recordings tab opens:

```javascript
const recordings = await firebase.firestore()
    .collection('voiceRecordings')
    .where('teamId', '==', teamId)
    .orderBy('recordedAt', 'desc')
    .get();
```

This returns all recordings the current user can see (per Firestore rules — team members see both public and private). Display in reverse chronological order.

**Enrichment:** Each recording has `demoSha256` but not necessarily match context (opponent, scores). To show opponent + scores in the list, either:
- Cross-reference with the QW Hub match history (already cached in `QWHubService`)
- Or just show what's in the Firestore doc (teamTag, mapName, recordedAt, trackCount)

The Firestore doc already has `mapName`, `teamTag`, `recordedAt`, and `tracks[]`. For opponent + scores, the recording doc doesn't currently store this. Options:
1. **Enrich from cached match history** — if `QWHubService` has the match cached, look up by demoSha256
2. **Add opponent info to the recording doc** — would require a quad pipeline change (not in scope)
3. **Show minimal info** — date, map, track count, visibility. Good enough for an admin list.

**Recommendation:** Option 1 if match history is loaded, option 3 as fallback. The recording doc has enough for a usable list even without opponent info.

---

## Files Likely Touched

| File | Change |
|------|--------|
| `public/js/components/TeamManagementModal.js` | Tab system, move Voice Bot to Discord tab, add Recordings tab |
| `public/js/components/TeamsBrowserPanel.js` | Table grid changes, colored scores, play/voice icons, inline player, voice discovery query |
| `public/js/components/VoiceReplayPlayer.js` | Extract init logic to be mountable in any container (not just replay.html) |
| `public/js/services/VoiceReplayService.js` | Minor: ensure clean init/destroy cycle for remounting |
| `public/js/services/QWHubService.js` | Possibly add helper to look up match by demoHash |
| `functions/index.js` (or team-operations.js) | New Cloud Function: `updateRecordingVisibility` |
| `firestore.rules` | No changes needed if using Cloud Function for visibility updates |
| `src/css/input.css` | Table grid adjustments, tab styles, recording list styles, player-in-panel styles |

---

## What NOT to Build

- **New standalone page** — everything lives in the existing Match History tab and Team Settings modal
- **Changes to quad bot** — no pipeline changes needed
- **Changes to replay.html** — the standalone replay page stays as-is (it's still useful for shared links)
- **Retroactive visibility batch updates** — changing default visibility doesn't update existing recordings
- **Match chat/comments** — just playback and visibility management
- **Audio waveform visualization** — the existing overlay controls are sufficient

---

## Important: Reusing VoiceReplayPlayer

The inline player in the Match History right panel should reuse `VoiceReplayPlayer` and `VoiceReplayService`, not duplicate them. The key change is making `VoiceReplayPlayer.init(container, demoSha256, title)` work when called with a container inside TeamsBrowserPanel instead of only inside replay.html.

Things to check:
- `VoiceReplayService.init()` registers a `window.addEventListener('message', ...)` listener. Make sure it cleans up properly when the player is destroyed (user navigates away from the match).
- The overlay CSS (`.vr-overlay`) uses absolute positioning relative to `.vr-iframe-wrap`. This should work in any container as long as the wrapper has `position: relative`.
- Firebase Auth is already initialized in the main app — no need for the auth setup that replay.html does.

---

## Suggested Slicing

This is a large feature brief. Suggested implementation order:

1. **Modal tabs** — restructure TeamManagementModal into tabbed layout, move Voice Bot to Discord tab
2. **Voice discovery query** — fetch voiceRecordings for team, build SHA256 set, wire to match rows
3. **Table optimization** — remove w/l column, color scores, add play + voice icons
4. **Inline player** — mount VoiceReplayPlayer in the right panel, handle lifecycle
5. **Recordings tab** — list recordings, per-recording visibility toggle, Cloud Function

But let the QPLAN workflow decide the optimal slicing.
