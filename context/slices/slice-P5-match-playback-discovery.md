# Phase 5: Match Playback & Recording Discovery — 5-Slice Breakdown

**Source:** `docs/multi-clan/phase-5-discovery-and-playback.md`
**Dependencies:** Phase 3 (voiceRecordings schema + rules), Phase 4 (defaultVisibility toggle)

---

## Slice P5.1: Team Settings Modal — Tab Restructure

**User Story:** As a team leader, I see a tabbed Team Settings modal so that Voice Bot settings and Recordings are organized separately from core team settings.

**Success Criteria:**
- [ ] Modal shows 3 tabs for leaders: Team Settings, Discord, Recordings
- [ ] Non-leaders see Team Settings content only (no tab bar)
- [ ] Voice Bot section appears under Discord tab (moved from main body)
- [ ] Recording Visibility default toggle stays with Voice Bot in Discord tab
- [ ] Tab state resets to "Team Settings" on each modal open
- [ ] Voice Bot async loading preserved — loads on first Discord tab switch (lazy init)
- [ ] Recordings tab content is a placeholder (implemented in P5.5)

### PRD Mapping

```
PRIMARY SECTIONS:
- Workstream 1: Tab system, layout, lazy init

DEPENDENT SECTIONS:
- Phase 3/4: Voice Bot section, visibility toggle (already exist — just moving)

IGNORED SECTIONS:
- Workstream 2 (Match History) — separate slices
- Workstream 3 (Recordings list) — P5.5
```

### Full Stack Architecture

```
FRONTEND COMPONENTS:
- TeamManagementModal (MODIFY)
  - Firebase listeners: No changes — existing _botRegUnsubscribe preserved
  - Cache interactions: No changes
  - UI responsibilities:
    - Tab bar (leaders only): Team Settings | Discord | Recordings
    - Tab switching: show/hide tab-content divs, update active tab class
    - Lazy init: Voice Bot loads on first Discord tab click, Recordings on first Recordings click
  - User actions: Tab clicks switch content panels

FRONTEND SERVICES:
- None — purely a UI restructure

BACKEND REQUIREMENTS:
- None — no new Cloud Functions or schema changes

INTEGRATION POINTS:
- Voice Bot section: _initVoiceBotSection() must be called on first Discord tab switch, NOT on modal open
- BotRegistrationService listener: cleanup in close() unchanged — still calls _botRegUnsubscribe()
- Recordings tab: Renders placeholder "Coming soon" — wired up in P5.5
```

### Implementation Details

**Tab structure in `_renderModal()` (replaces sequential layout):**

```javascript
// Only show tabs for leaders
const tabBar = _isLeader ? `
    <div class="flex border-b border-border mb-4">
        <button class="tab-btn active" data-tab="settings">Team Settings</button>
        <button class="tab-btn" data-tab="discord">Discord</button>
        <button class="tab-btn" data-tab="recordings">Recordings</button>
    </div>
` : '';

// Tab content panels
const settingsTab = `
    <div id="tab-content-settings">
        ${_renderLogoAndDetailsSection()}
        ${_isLeader ? _renderSchedulerSection() : ''}
        ${_isLeader ? _renderPrivacySection() : ''}
        <hr class="border-border">
        ${_isLeader ? _renderLeaderActions() : ''}
        ${_renderLeaveTeamSection()}
    </div>
`;

const discordTab = _isLeader ? `
    <div id="tab-content-discord" class="hidden">
        ${_renderVoiceBotSection()}
    </div>
` : '';

const recordingsTab = _isLeader ? `
    <div id="tab-content-recordings" class="hidden">
        <p class="text-sm text-muted-foreground">Recordings management coming soon.</p>
    </div>
` : '';
```

**Tab switching handler:**

```javascript
function _handleTabSwitch(tabName) {
    // Hide all tab contents
    document.querySelectorAll('[id^="tab-content-"]').forEach(el => el.classList.add('hidden'));
    // Show target
    document.getElementById(`tab-content-${tabName}`).classList.remove('hidden');
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Lazy init: Voice Bot on first Discord tab switch
    if (tabName === 'discord' && !_voiceBotInitialized) {
        _voiceBotInitialized = true;
        _initVoiceBotSection();
    }
    // Lazy init: Recordings on first switch (P5.5 will wire this up)
    if (tabName === 'recordings' && !_recordingsInitialized) {
        _recordingsInitialized = true;
        // P5.5: _initRecordingsTab();
    }
}
```

**Key changes to existing flow:**
- `_renderModal()`: Move Voice Bot section into Discord tab content div
- `_attachListeners()`: Add tab click handlers; REMOVE immediate `_initVoiceBotSection()` call
- `close()`: Reset `_voiceBotInitialized = false` and `_recordingsInitialized = false`
- Add private vars: `let _voiceBotInitialized = false; let _recordingsInitialized = false;`

### Performance Classification

```
HOT PATHS (<50ms):
- Tab switching: Pure DOM show/hide — instant
- Modal open: Same as today — renders Team Settings tab first

COLD PATHS (<2s):
- First Discord tab switch: Loads Voice Bot status via BotRegistrationService (existing cold path, unchanged)
- First Recordings tab switch: Placeholder for now (P5.5 adds Firestore query)
```

### CSS Changes (src/css/input.css)

```css
/* Tab button styles */
.tab-btn {
    @apply px-3 py-2 text-xs font-medium text-muted-foreground border-b-2 border-transparent
           hover:text-foreground transition-colors cursor-pointer;
}
.tab-btn.active {
    @apply text-foreground border-primary;
}
```

### Test Scenarios

```
FRONTEND TESTS:
- [ ] Leader sees 3 tabs (Team Settings, Discord, Recordings)
- [ ] Non-leader sees Team Settings content only, no tab bar
- [ ] Clicking Discord tab shows Voice Bot section, hides Team Settings
- [ ] Clicking Team Settings returns to default view
- [ ] Tab bar highlights active tab
- [ ] Modal always opens on Team Settings tab
- [ ] Voice Bot section lazy-loads on first Discord tab click (not on modal open)
- [ ] Close + reopen modal: tabs reset, Voice Bot re-inits on Discord tab click

INTEGRATION TESTS:
- [ ] Voice Bot real-time listener still works after moving to Discord tab
- [ ] Closing modal still cleans up _botRegUnsubscribe
- [ ] Privacy toggles still work in Team Settings tab
- [ ] All existing modal functionality preserved (tag chips, scheduler, etc.)
```

### Files to Modify

| File | Change |
|------|--------|
| `public/js/components/TeamManagementModal.js` | Tab bar, content panels, lazy init, tab switch handler |
| `src/css/input.css` | `.tab-btn` and `.tab-btn.active` styles |

---

## Slice P5.2: Voice Recording Discovery Query

**User Story:** As a user viewing a team's Match History, the system fetches which matches have voice recordings so that audio indicators can be shown.

**Success Criteria:**
- [ ] When Match History loads for a team, a single Firestore query fetches that team's voice recordings
- [ ] A `Set<demoSha256>` is built from the query results
- [ ] The set is cached alongside match history data (no re-querying on re-renders)
- [ ] The set respects Firestore visibility rules (public recordings always; private only for team members)
- [ ] The set is passed to the match row renderer (consumed by P5.3)

### PRD Mapping

```
PRIMARY SECTIONS:
- Workstream 2D: Voice Recording Discovery query

DEPENDENT SECTIONS:
- Phase 3 Firestore rules: voiceRecordings read access (already deployed)
- SCHEMA.md: voiceRecordings collection structure

IGNORED SECTIONS:
- Workstream 2A-C (table changes) — P5.3
- Workstream 2E-F (inline player) — P5.4
- Workstream 3 (recordings list) — P5.5
```

### Full Stack Architecture

```
FRONTEND COMPONENTS:
- TeamsBrowserPanel (MODIFY)
  - Adds _voiceAvailable: Set<string> to module state
  - Fetches voice recordings when Match History tab activates for a team
  - Passes _voiceAvailable to match row rendering

FRONTEND SERVICES:
- VoiceReplayService (MODIFY — or new helper in TeamsBrowserPanel)
  - Add: getTeamVoiceRecordingSHAs(teamId) → Set<string>
  - One-shot query (NOT a listener — match history is already a snapshot view)

BACKEND REQUIREMENTS:
- None — uses existing voiceRecordings collection + existing Firestore rules
- Query: voiceRecordings.where('teamId', '==', teamId)

INTEGRATION POINTS:
- Firestore read: voiceRecordings where teamId matches
- Rules: Public recordings visible to all; private only to team members (already enforced by existing rules)
- Cache: Store Set alongside _historyMatches — invalidate when team changes
```

### Integration Code

```javascript
// In TeamsBrowserPanel — add to module state:
let _voiceAvailable = new Set(); // SHA256s that have voice recordings

// Fetch when Match History tab loads (alongside match history fetch):
async function _fetchVoiceRecordings(teamId) {
    try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const q = query(
            collection(window.firebase.db, 'voiceRecordings'),
            where('teamId', '==', teamId)
        );
        const snapshot = await getDocs(q);
        _voiceAvailable = new Set(snapshot.docs.map(doc => doc.id)); // doc.id = demoSha256
    } catch (err) {
        console.warn('Failed to fetch voice recordings:', err);
        _voiceAvailable = new Set(); // Graceful fallback — no voice icons shown
    }
}

// Call in the existing match history load flow:
// In _loadMatchHistory(teamId):
await Promise.all([
    _fetchMatchesFromQWHub(teamId),     // existing
    _fetchVoiceRecordings(teamId)        // NEW
]);

// Usage in row rendering (consumed by P5.3):
const hasVoice = match.demoHash && _voiceAvailable.has(match.demoHash);
```

### Performance Classification

```
HOT PATHS (<50ms):
- Checking _voiceAvailable.has(demoHash): O(1) Set lookup per row — instant

COLD PATHS (<2s):
- Initial Firestore query: Typically 10-50 docs per team (one per map per session)
- Runs in parallel with match history fetch — no added latency
- Firestore rules evaluation adds ~50ms overhead for private recording checks

BACKEND PERFORMANCE:
- No indexes needed: teamId is the only filter field (auto-indexed by Firestore)
- Docs are small (~500 bytes each — no audio data, just metadata)
```

### Data Flow

```
Match History tab loads → _loadMatchHistory(teamId)
  ├── _fetchMatchesFromQWHub(teamId)     ← existing (QW Hub Supabase)
  └── _fetchVoiceRecordings(teamId)      ← NEW (Firestore)
       → getDocs(voiceRecordings where teamId == X)
       → Build Set<demoSha256>
       → Store as _voiceAvailable
       → Used during row rendering: _voiceAvailable.has(match.demoHash)
```

### Test Scenarios

```
FRONTEND TESTS:
- [ ] _voiceAvailable populated after Match History loads
- [ ] Set contains correct demoSha256 values from Firestore docs
- [ ] Set cleared/repopulated when switching to a different team
- [ ] Graceful fallback: Firestore query failure → empty Set (no voice icons, no crash)

INTEGRATION TESTS:
- [ ] Team with 0 voice recordings → empty Set
- [ ] Team with 5 recordings → Set has 5 entries
- [ ] Private recordings visible when logged in as team member
- [ ] Private recordings NOT visible when logged in as non-member
- [ ] Public recordings visible to everyone
- [ ] No additional Firestore reads on re-renders (Set is cached)

PERFORMANCE:
- [ ] Voice query runs in parallel with match history — doesn't block table render
```

### Files to Modify

| File | Change |
|------|--------|
| `public/js/components/TeamsBrowserPanel.js` | Add `_voiceAvailable` state, `_fetchVoiceRecordings()`, call in match history load |

---

## Slice P5.3: Match History Table — Score Colors, Icons, Voice Indicator

**Dependencies:** Slice P5.2 (voice discovery Set)

**User Story:** As a user, I see color-coded scores (green/red for win/loss) and play/headphone icons on each match row so that I can quickly identify wins and matches with voice recordings.

**Success Criteria:**
- [ ] w/l column replaced with action icon column
- [ ] Play icon (▶) on every row — launches demo in new tab (existing behavior, different trigger)
- [ ] Headphone icon (🎧) only when `_voiceAvailable.has(demoHash)` is true
- [ ] Our score green + opponent red on win; reversed on loss; neutral on draw
- [ ] Grid template adjusted for icon column width
- [ ] Icons clickable — play opens QW Hub demo player, headphone opens replay with voice (both reused existing patterns until P5.4 adds inline)

### PRD Mapping

```
PRIMARY SECTIONS:
- Workstream 2A: Remove w/l column → action icons
- Workstream 2B: Color-code scores for win/loss

DEPENDENT SECTIONS:
- Slice P5.2: _voiceAvailable Set for headphone icon visibility
- Workstream 2C: Filter dropdown optimization (optional, can skip)

IGNORED SECTIONS:
- Workstream 2D: Discovery query — done in P5.2
- Workstream 2E-F: Inline player — done in P5.4
```

### Full Stack Architecture

```
FRONTEND COMPONENTS:
- TeamsBrowserPanel (MODIFY)
  - Match list header: Replace "w/l" with icon column header (empty or ▶ icon)
  - Match rows: Replace result text with 1-2 clickable icons
  - Score cells: Add color classes based on win/loss/draw
  - Grid template: Adjust last column width

FRONTEND SERVICES:
- None — purely frontend rendering changes

BACKEND REQUIREMENTS:
- None

INTEGRATION POINTS:
- Reads _voiceAvailable (Set) from P5.2 to determine headphone icon visibility
- Play icon click: Opens QW Hub demo player in new tab (existing URL pattern)
- Headphone icon click: Opens /replay.html with voice (existing openVoiceReplay pattern)
```

### Implementation Details

**Grid template change:**

```css
/* Current: 3.25rem 1rem 4rem 2.75rem 2rem 2rem 3rem 1.5rem */
/*          date   gap  map  us      #    #    vs   w/l       */

/* New:     3.25rem 1rem 4rem 2.75rem 2rem 2rem 3rem 2.5rem   */
/*          date   gap  map  us      #    #    vs   icons     */
```

**Header change:**

```javascript
// Replace:
<span class="mh-th mh-th-result">w/l</span>

// With:
<span class="mh-th mh-th-actions"></span>
```

**Row rendering — score colors:**

```javascript
const isWin = m.scoreUs > m.scoreThem;
const isLoss = m.scoreUs < m.scoreThem;
const isDraw = m.scoreUs === m.scoreThem;

const usScoreClass = isWin ? 'text-green-500' : isLoss ? 'text-red-500' : 'text-muted-foreground';
const themScoreClass = isLoss ? 'text-green-500' : isWin ? 'text-red-500' : 'text-muted-foreground';

// In the score cells:
`<span class="mh-td mh-td-score ${usScoreClass} font-medium">${m.scoreUs}</span>`
`<span class="mh-td mh-td-score ${themScoreClass} font-medium">${m.scoreThem}</span>`
```

**Row rendering — action icons:**

```javascript
const hasVoice = m.demoHash && _voiceAvailable.has(m.demoHash);

const iconsHtml = `
    <span class="mh-td mh-td-actions flex items-center gap-1">
        ${m.demoHash ? `
            <button class="mh-icon-btn" onclick="event.stopPropagation(); TeamsBrowserPanel.openDemoPlayer('${m.demoHash}')"
                    title="Watch demo">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </button>
        ` : ''}
        ${hasVoice ? `
            <button class="mh-icon-btn mh-icon-voice" onclick="event.stopPropagation(); TeamsBrowserPanel.openVoiceReplay('${m.id}')"
                    title="Watch with voice">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                </svg>
            </button>
        ` : ''}
    </span>
`;
```

**New public method:**

```javascript
// Opens demo player on QW Hub (no voice)
function openDemoPlayer(demoHash) {
    window.open(`https://hub.quakeworld.nu/demo-player/?demo_sha256=${demoHash}`, '_blank');
}
```

### CSS Changes (src/css/input.css)

```css
.mh-icon-btn {
    @apply p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer;
}
.mh-icon-voice {
    @apply text-amber-500/70 hover:text-amber-400;
}
```

### Performance Classification

```
HOT PATHS (<50ms):
- Score color calculation: Trivial comparison per row — instant
- Voice icon visibility: Set.has() — O(1) per row
- Icon rendering: Part of existing render loop — no extra DOM ops

COLD PATHS:
- None — this is all rendering-time work
```

### Test Scenarios

```
FRONTEND TESTS:
- [ ] w/l column gone from header and rows
- [ ] Win: our score green, opponent red
- [ ] Loss: our score red, opponent green
- [ ] Draw: both scores neutral/muted
- [ ] Play icon visible on all rows with demoHash
- [ ] Play icon NOT shown on rows without demoHash (rare edge case)
- [ ] Headphone icon visible only when _voiceAvailable.has(demoHash) is true
- [ ] Headphone icon hidden when no voice recording exists
- [ ] Play icon click opens QW Hub demo player in new tab
- [ ] Headphone icon click opens /replay.html with voice in new tab
- [ ] Both icon clicks use event.stopPropagation() — don't trigger row click
- [ ] Grid alignment looks correct with new column widths

INTEGRATION TESTS:
- [ ] Voice discovery (P5.2) feeds correct data to icon rendering
- [ ] Team with 0 recordings: no headphone icons anywhere
- [ ] Team with some recordings: headphone icons on matching rows only
```

### Files to Modify

| File | Change |
|------|--------|
| `public/js/components/TeamsBrowserPanel.js` | Replace w/l column, add score colors, add icon rendering, add `openDemoPlayer()` |
| `src/css/input.css` | `.mh-icon-btn`, `.mh-icon-voice` styles, grid template adjustment |

---

## Slice P5.4: Inline WebQTV Player in Match History

**Dependencies:** Slice P5.3 (play/headphone icons), existing VoiceReplayPlayer + VoiceReplayService

**User Story:** As a user, I can watch a demo replay with optional voice overlay directly in the Match History right panel, without leaving the page.

**Success Criteria:**
- [ ] Clicking play icon on a match row loads WebQTV iframe in the right panel
- [ ] Clicking headphone icon loads WebQTV iframe + auto-loads voice tracks from Firestore
- [ ] Player mounts inside `.mh-preview-panel` using VoiceReplayPlayer
- [ ] Player can be dismissed (back to stats view) via a close/back control
- [ ] VoiceReplayPlayer works in any container (not just replay.html root)
- [ ] Message listener + audio cleaned up when player is dismissed or team changes
- [ ] Existing stats view includes a prominent play button (promoted from text link)

### PRD Mapping

```
PRIMARY SECTIONS:
- Workstream 2E: Inline WebQTV Player
- Workstream 2F: Play Button in Stats View

DEPENDENT SECTIONS:
- Existing VoiceReplayPlayer.js: init(container, demoSha256, title) pattern
- Existing VoiceReplayService.js: postMessage sync, Firestore auto-load
- P5.2: _voiceAvailable Set (determines if voice auto-loads)
- P5.3: Play/headphone icon click handlers

IGNORED SECTIONS:
- Workstream 1 (modal tabs) — P5.1
- Workstream 3 (recordings tab) — P5.5
```

### Full Stack Architecture

```
FRONTEND COMPONENTS:
- TeamsBrowserPanel (MODIFY)
  - New right panel state: 'player' (alongside existing 'default', 'hover', 'click/sticky')
  - Click play icon → mount VoiceReplayPlayer in right panel
  - Click headphone icon → mount VoiceReplayPlayer with autoLoadVoice flag
  - Close player → destroy VoiceReplayPlayer, return to stats view
  - Stats view: Replace "Watch with Voice" text link with prominent play button

- VoiceReplayPlayer (MODIFY)
  - init() must work with ANY container (not just replay.html root)
  - Add: destroy() must clean up ALL state (postMessage listener, audio elements, object URLs)
  - Ensure CSS positioning works in right panel context (relative wrapper)

- VoiceReplayService (MODIFY)
  - Ensure destroy()/cleanup() removes window message listener
  - Handle multiple init/destroy cycles (player mounted, dismissed, mounted again)

FRONTEND SERVICES:
- VoiceReplayService: No new methods — existing loadFromFirestore() handles voice auto-load

BACKEND REQUIREMENTS:
- None

INTEGRATION POINTS:
- VoiceReplayPlayer.init(container, demoSha256, matchTitle) — existing API
- VoiceReplayPlayer.destroy() — must exist and be thorough
- VoiceReplayService.destroy() — must remove postMessage listener
- postMessage from hub.quakeworld.nu iframe → VoiceReplayService → audio sync
- Auth context: Already initialized in main app — no separate auth init needed
```

### Implementation Details

**Right panel state management:**

```javascript
// New module state
let _playerActive = false;
let _playerMatchId = null;

// Mount player in right panel
function playMatch(matchId, autoVoice = false) {
    const match = _matchDataById.get(String(matchId));
    if (!match || !match.demoHash) return;

    _playerActive = true;
    _playerMatchId = matchId;
    _selectedMatchId = matchId; // Keep row highlighted

    const panel = document.querySelector('.mh-preview-panel');
    const title = `${match.ourTag} vs ${match.opponentTag} — ${match.map}`;

    // Render player container with close button
    panel.innerHTML = `
        <div class="mh-player-wrapper">
            <div class="flex items-center justify-between px-2 py-1">
                <span class="text-xs text-muted-foreground">${title}</span>
                <button class="mh-player-close text-muted-foreground hover:text-foreground text-xs"
                        onclick="TeamsBrowserPanel.closePlayer()">✕ Close</button>
            </div>
            <div id="mh-player-mount" class="relative flex-1 min-h-0"></div>
        </div>
    `;

    const mountPoint = document.getElementById('mh-player-mount');
    VoiceReplayPlayer.init(mountPoint, match.demoHash, title);
    // If autoVoice, the init() already auto-loads from Firestore — no extra action needed
    // VoiceReplayPlayer.init() calls VoiceReplayService.loadFromFirestore() which checks availability
}

function closePlayer() {
    if (!_playerActive) return;
    VoiceReplayPlayer.destroy();
    _playerActive = false;
    _playerMatchId = null;
    // Re-render the stats view for the selected match
    _renderPreviewPanel(_selectedMatchId);
}
```

**Update icon click handlers (from P5.3):**

```javascript
// Change from opening new tab to inline player:

// Play icon — demo only
function openDemoPlayer(demoHash) {
    // Find match by demoHash
    const match = [..._matchDataById.values()].find(m => m.demoHash === demoHash);
    if (match) playMatch(match.id, false);
}

// Headphone icon — demo + voice
function openVoiceReplay(matchId) {
    playMatch(matchId, true);
}
```

**Stats view — promoted play button:**

```javascript
// In _renderStatsView(), replace the "Watch with Voice" text link:
const hasVoice = match.demoHash && _voiceAvailable.has(match.demoHash);

// Replace existing action link:
${match.demoHash ? `
    <button class="mh-play-btn" onclick="TeamsBrowserPanel.playMatch('${match.id}', ${hasVoice})">
        <svg class="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
        </svg>
        Watch${hasVoice ? ' with Voice' : ''}
        ${hasVoice ? '<span class="mh-voice-badge">🎧</span>' : ''}
    </button>
` : ''}
```

**VoiceReplayPlayer.destroy() — must be thorough:**

```javascript
function destroy() {
    // 1. Clean up VoiceReplayService (removes postMessage listener)
    VoiceReplayService.destroy();

    // 2. Revoke any object URLs for audio tracks
    // (prevent memory leaks from createObjectURL)

    // 3. Remove all audio elements

    // 4. Clear container
    if (_container) _container.innerHTML = '';

    // 5. Reset state
    _container = null;
    _demoSha256 = null;
    _tracksLoaded = false;
}
```

**VoiceReplayService.destroy() — must clean up listener:**

```javascript
function destroy() {
    // Remove postMessage listener
    if (_messageHandler) {
        window.removeEventListener('message', _messageHandler);
        _messageHandler = null;
    }

    // Stop all audio playback
    _tracks.forEach(t => {
        t.audio.pause();
        if (t.objectUrl) URL.revokeObjectURL(t.objectUrl);
    });
    _tracks = [];

    // Reset state
    _initialized = false;
}
```

### CSS Changes (src/css/input.css)

```css
.mh-player-wrapper {
    @apply flex flex-col h-full;
}

.mh-player-close {
    @apply cursor-pointer hover:text-foreground transition-colors;
}

.mh-play-btn {
    @apply inline-flex items-center px-3 py-1.5 rounded text-sm font-medium
           bg-primary/20 text-primary hover:bg-primary/30 transition-colors cursor-pointer;
}

.mh-voice-badge {
    @apply ml-1 text-amber-400;
}

/* Ensure VoiceReplayPlayer overlay works in right panel */
#mh-player-mount .vr-iframe-wrap {
    position: relative;
    width: 100%;
    height: 100%;
}
```

### Performance Classification

```
HOT PATHS (<50ms):
- Close player → destroy + re-render stats: DOM swap — instant
- Icon clicks → mount player: Container render is instant

COLD PATHS (<2s):
- VoiceReplayPlayer.init(): Loads iframe from hub.quakeworld.nu (~1-2s)
- VoiceReplayService.loadFromFirestore(): Fetches recording manifest + Storage URLs (~500ms)
- Both show loading states within VoiceReplayPlayer (existing pattern)

BACKEND PERFORMANCE:
- No new server calls — reuses existing VoiceReplayService Firestore reads
```

### Data Flow

```
Click play icon on row
  → TeamsBrowserPanel.playMatch(matchId, autoVoice=false)
  → Replace right panel with player container
  → VoiceReplayPlayer.init(mountPoint, demoHash, title)
    → VoiceReplayService.init(demoHash, callback)
      → Fetch DemoInfo from QW Hub
      → Set up postMessage listener for iframe sync
    → VoiceReplayService.loadFromFirestore(demoHash)
      → Read voiceRecordings/{demoHash}
      → If found: fetch Storage URLs, create <audio> elements, auto-play synced
      → If not found: show drop zone
  → iframe loads hub.quakeworld.nu/demo-player/?demo_sha256={hash}
  → postMessage events → VoiceReplayService → audio sync

Click close
  → VoiceReplayPlayer.destroy()
    → VoiceReplayService.destroy() (removes listener, stops audio)
    → Clear container
  → Re-render stats view for selected match
```

### Test Scenarios

```
FRONTEND TESTS:
- [ ] Play icon click replaces right panel with WebQTV player
- [ ] Headphone icon click replaces right panel with player + voice auto-loading
- [ ] Close button returns to stats view
- [ ] Player iframe loads hub.quakeworld.nu demo player URL
- [ ] Match row stays highlighted while player is active
- [ ] Stats view shows promoted play button (not text link)
- [ ] Stats view play button shows "Watch with Voice" + badge when voice available
- [ ] Stats view play button shows "Watch" without badge when no voice

INTEGRATION TESTS:
- [ ] postMessage sync works (audio tracks follow demo timeline)
- [ ] Voice auto-load: recordings fetched from Firestore and played
- [ ] Auth required: VoiceReplayPlayer shows sign-in prompt for private recordings
- [ ] Access denied: VoiceReplayPlayer shows "team members only" for private recordings
- [ ] Cleanup: Switching teams while player is open → destroy + clean mount
- [ ] Cleanup: Multiple open/close cycles don't leak message listeners or audio elements
- [ ] VoiceReplayPlayer CSS (overlay, iframe) works correctly in right panel container

END-TO-END:
- [ ] Click headphone icon → player loads → audio syncs to demo → user controls volume → close → stats view returns
```

### Files to Modify

| File | Change |
|------|--------|
| `public/js/components/TeamsBrowserPanel.js` | `playMatch()`, `closePlayer()`, right panel player state, stats view play button promotion |
| `public/js/components/VoiceReplayPlayer.js` | Verify `destroy()` is thorough, ensure init works in any container |
| `public/js/services/VoiceReplayService.js` | Verify `destroy()` removes message listener, handle multiple init/destroy cycles |
| `src/css/input.css` | `.mh-player-wrapper`, `.mh-play-btn`, `.mh-voice-badge`, player mount styles |

### Common Pitfalls

- [ ] VoiceReplayService message listener not removed on destroy → messages from iframe go to dead handler
- [ ] Object URLs from createObjectURL not revoked on destroy → memory leak
- [ ] Multiple init/destroy cycles cause duplicate message listeners
- [ ] iframe postMessage origin check: must whitelist `https://hub.quakeworld.nu`
- [ ] Right panel height: player needs to fill available height (flexbox needed)
- [ ] Firebase Auth already initialized in main app — VoiceReplayPlayer must NOT re-init auth

---

## Slice P5.5: Recordings Tab — List, Visibility Toggle, Cloud Function

**Dependencies:** Slice P5.1 (modal tabs — Recordings tab placeholder)

**User Story:** As a team leader, I can see all my team's voice recordings in the Recordings tab and toggle each recording's visibility between public and private.

**Success Criteria:**
- [ ] Recordings tab shows scrollable list of team's voice recordings
- [ ] Each row: date, map, track count, visibility toggle (public/private)
- [ ] Toggle updates recording's visibility via new Cloud Function
- [ ] Optimistic UI update (toggle flips immediately, reverts on error)
- [ ] List enriched with opponent + scores when match history is cached
- [ ] Cloud Function validates caller is team leader before updating
- [ ] Footer shows default visibility note with link to Discord tab

### PRD Mapping

```
PRIMARY SECTIONS:
- Workstream 3: Per-Recording Visibility Management (full section)

DEPENDENT SECTIONS:
- Phase 3 schema: voiceRecordings collection structure (teamId, visibility, tracks, mapName, recordedAt)
- Phase 4: defaultVisibility toggle (shown in Discord tab — reference only)
- P5.1: Recordings tab placeholder (lazy init hook)

IGNORED SECTIONS:
- Workstream 1 (tab restructure) — already done in P5.1
- Workstream 2 (match history) — P5.2-P5.4
```

### Full Stack Architecture

```
FRONTEND COMPONENTS:
- TeamManagementModal (MODIFY)
  - Wire up _initRecordingsTab() on first Recordings tab switch (lazy load)
  - Render recording list into #tab-content-recordings
  - Handle visibility toggle clicks
  - Show loading state while fetching recordings

FRONTEND SERVICES:
- VoiceReplayService (MODIFY — or TeamManagementModal handles directly)
  - Add: updateRecordingVisibility(demoSha256, visibility) → calls Cloud Function

BACKEND REQUIREMENTS:
⚠️ NEW CLOUD FUNCTION:
- Cloud Functions:
  - updateRecordingVisibility({ demoSha256, visibility }):
    - File: /functions/team-operations.js
    - Purpose: Update a voice recording's visibility (public/private)
    - Validation:
      - User authenticated
      - demoSha256 is a non-empty string
      - visibility is 'public' or 'private'
      - voiceRecordings/{demoSha256} exists
      - User is leader of the team that owns the recording (teamId)
    - Operations:
      - Read voiceRecordings/{demoSha256} → get teamId
      - Read teams/{teamId} → verify caller is leaderId
      - Update voiceRecordings/{demoSha256}.visibility
    - Returns: { success: true } or { success: false, error: string }

- Function Exports Required:
  // In /functions/index.js add:
  const { updateRecordingVisibility } = require('./team-operations');
  exports.updateRecordingVisibility = updateRecordingVisibility;

- Firestore Operations:
  - voiceRecordings/{demoSha256}: UPDATE (visibility field only)
  - No security rules change needed — Cloud Function uses Admin SDK

- Authentication/Authorization:
  - Must be authenticated
  - Must be leader of the team that owns the recording
  - NOT a scheduler permission — visibility is a leader-only setting

- Event Logging:
  - Not required — visibility toggles are low-criticality admin actions
```

### Integration Code

**Cloud Function:**

```javascript
// In functions/team-operations.js:
exports.updateRecordingVisibility = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
        }

        const { demoSha256, visibility } = data;

        // Validate inputs
        if (!demoSha256 || typeof demoSha256 !== 'string')
            throw new functions.https.HttpsError('invalid-argument', 'demoSha256 required');
        if (!['public', 'private'].includes(visibility))
            throw new functions.https.HttpsError('invalid-argument', 'visibility must be public or private');

        // Read the recording
        const recDoc = await db.collection('voiceRecordings').doc(demoSha256).get();
        if (!recDoc.exists)
            throw new functions.https.HttpsError('not-found', 'Recording not found');

        const recording = recDoc.data();
        const teamId = recording.teamId;

        if (!teamId)
            throw new functions.https.HttpsError('failed-precondition', 'Recording has no team association');

        // Verify caller is team leader
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists)
            throw new functions.https.HttpsError('not-found', 'Team not found');

        if (teamDoc.data().leaderId !== context.auth.uid)
            throw new functions.https.HttpsError('permission-denied', 'Only team leaders can change recording visibility');

        // Update visibility
        await db.collection('voiceRecordings').doc(demoSha256).update({ visibility });

        return { success: true };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('updateRecordingVisibility error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to update visibility');
    }
});
```

**Recordings tab init:**

```javascript
// In TeamManagementModal, wired up from P5.1's lazy init:
async function _initRecordingsTab() {
    const container = document.getElementById('tab-content-recordings');
    container.innerHTML = '<p class="text-sm text-muted-foreground">Loading recordings...</p>';

    try {
        const { collection, query, where, orderBy, getDocs } = await import('firebase/firestore');
        const q = query(
            collection(window.firebase.db, 'voiceRecordings'),
            where('teamId', '==', _teamId),
            orderBy('recordedAt', 'desc')
        );
        const snapshot = await getDocs(q);
        _recordings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        _renderRecordingsList();
    } catch (err) {
        console.error('Failed to load recordings:', err);
        container.innerHTML = '<p class="text-sm text-red-400">Failed to load recordings.</p>';
    }
}
```

**Recordings list rendering:**

```javascript
function _renderRecordingsList() {
    const container = document.getElementById('tab-content-recordings');

    if (_recordings.length === 0) {
        container.innerHTML = `
            <p class="text-sm text-muted-foreground py-4">
                No voice recordings yet. Connect a Voice Bot in the Discord tab to start recording.
            </p>`;
        return;
    }

    const rows = _recordings.map(rec => {
        const date = rec.recordedAt?.toDate?.() || new Date(rec.recordedAt);
        const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
        const isPublic = rec.visibility === 'public';

        return `
            <div class="flex items-center justify-between py-2 border-b border-border/50">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="text-xs text-muted-foreground w-12 shrink-0">${dateStr}</span>
                    <span class="text-sm font-mono">${rec.mapName || '—'}</span>
                    <span class="text-xs text-muted-foreground">${rec.trackCount || rec.tracks?.length || 0} tracks</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="text-xs ${isPublic ? 'text-green-400' : 'text-muted-foreground'}">
                        ${isPublic ? '🔓' : '🔒'}
                    </span>
                    <button class="rec-visibility-toggle relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                                   ${isPublic ? 'bg-green-600' : 'bg-muted'}"
                            data-sha="${rec.id}" data-visibility="${rec.visibility}">
                        <span class="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform
                                     ${isPublic ? 'translate-x-4' : 'translate-x-0.5'}"></span>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="space-y-0">
            <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recordings</span>
                <span class="text-xs text-muted-foreground">${_recordings.length} matches</span>
            </div>
            <div class="max-h-64 overflow-y-auto">
                ${rows}
            </div>
            <p class="text-xs text-muted-foreground mt-3">
                Default: ${_teamData?.voiceSettings?.defaultVisibility === 'public' ? 'Public' : 'Private'}
                (change in Discord tab)
            </p>
        </div>
    `;

    // Attach toggle handlers
    container.querySelectorAll('.rec-visibility-toggle').forEach(btn => {
        btn.addEventListener('click', () => _handleRecordingVisibilityToggle(btn));
    });
}
```

**Optimistic visibility toggle:**

```javascript
async function _handleRecordingVisibilityToggle(btn) {
    const demoSha256 = btn.dataset.sha;
    const currentVisibility = btn.dataset.visibility;
    const newVisibility = currentVisibility === 'public' ? 'private' : 'public';

    // Optimistic UI update
    btn.dataset.visibility = newVisibility;
    const isPublic = newVisibility === 'public';
    btn.className = `rec-visibility-toggle relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                     ${isPublic ? 'bg-green-600' : 'bg-muted'}`;
    btn.querySelector('span').className = `inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform
                                           ${isPublic ? 'translate-x-4' : 'translate-x-0.5'}`;

    // Update lock icon
    const lockIcon = btn.parentElement.querySelector('span:first-child');
    lockIcon.textContent = isPublic ? '🔓' : '🔒';
    lockIcon.className = `text-xs ${isPublic ? 'text-green-400' : 'text-muted-foreground'}`;

    // Also update cache
    const rec = _recordings.find(r => r.id === demoSha256);
    if (rec) rec.visibility = newVisibility;

    try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions(window.firebase.app, 'europe-west3');
        const fn = httpsCallable(functions, 'updateRecordingVisibility');
        const result = await fn({ demoSha256, visibility: newVisibility });

        if (!result.data.success) {
            throw new Error(result.data.error || 'Failed');
        }
    } catch (err) {
        console.error('Visibility toggle failed:', err);
        // Revert optimistic update
        if (rec) rec.visibility = currentVisibility;
        _renderRecordingsList();
        ToastService.show('Failed to update visibility', 'error');
    }
}
```

### Performance Classification

```
HOT PATHS (<50ms):
- Toggle flip: Optimistic UI — instant visual feedback

COLD PATHS (<2s):
- Initial recordings fetch: Firestore query — show "Loading recordings..." text
- Visibility Cloud Function: ~200-500ms — optimistic UI covers latency

BACKEND PERFORMANCE:
- Cloud Function: 2 reads (recording + team) + 1 write — minimal
- Firestore index: teamId + recordedAt (desc) — may need composite index
  → Create via: voiceRecordings → teamId ASC, recordedAt DESC
- Typical result size: 10-50 docs per team — small payload
```

### Data Flow

```
Open Recordings tab (first time)
  → _initRecordingsTab()
  → getDocs(voiceRecordings where teamId == X, orderBy recordedAt desc)
  → Store as _recordings array
  → _renderRecordingsList()
  → User sees recording list with visibility toggles

Toggle visibility
  → _handleRecordingVisibilityToggle(btn)
  → Optimistic UI: toggle flips immediately
  → httpsCallable('updateRecordingVisibility')({ demoSha256, visibility })
  → Cloud Function: Validates leader → Updates voiceRecordings/{sha}.visibility
  → Success: optimistic state is correct, done
  → Error: revert toggle, show error toast
```

### Test Scenarios

```
FRONTEND TESTS:
- [ ] Recordings tab shows "Loading recordings..." then list
- [ ] Empty state: "No voice recordings yet" message
- [ ] Each row shows date, map, track count, visibility toggle
- [ ] Toggle flips immediately on click (optimistic)
- [ ] Lock icon updates with toggle (🔓↔🔒)
- [ ] Default visibility note shown at bottom
- [ ] List scrollable when many recordings

BACKEND TESTS:
- [ ] Cloud Function rejects unauthenticated requests
- [ ] Cloud Function rejects non-leader callers
- [ ] Cloud Function rejects invalid visibility values
- [ ] Cloud Function rejects non-existent recording SHA
- [ ] Cloud Function updates visibility field successfully
- [ ] Cloud Function returns { success: true } on success

INTEGRATION TESTS:
- [ ] Toggle → Cloud Function → Firestore update → no re-fetch needed (optimistic was correct)
- [ ] Toggle error → UI reverts to previous state + error toast
- [ ] Recording made private → non-team-members can no longer read it (Firestore rules)
- [ ] Recording made public → everyone can read it
- [ ] Close modal → reopen → Recordings tab re-fetches (lazy init resets)

END-TO-END:
- [ ] Leader opens Recordings tab → sees list → toggles recording to private → confirms it's hidden from outsiders
```

### Firestore Index Required

```
Collection: voiceRecordings
Fields: teamId ASC, recordedAt DESC
```

This composite index must be created. Firestore will show a console link with the error if it's missing — click to auto-create.

### Files to Create/Modify

| File | Change |
|------|--------|
| `public/js/components/TeamManagementModal.js` | `_initRecordingsTab()`, `_renderRecordingsList()`, `_handleRecordingVisibilityToggle()`, wire to P5.1 lazy init |
| `functions/team-operations.js` | Add `updateRecordingVisibility` Cloud Function |
| `functions/index.js` | Export `updateRecordingVisibility` |

---

## Implementation Order

```
P5.1  Modal Tabs          (standalone — no dependencies)
P5.2  Voice Discovery     (standalone — feeds P5.3)
P5.3  Table Optimization  (depends on P5.2 for voice icon data)
P5.4  Inline Player       (depends on P5.3 for icon click handlers)
P5.5  Recordings Tab      (depends on P5.1 for tab placeholder)
```

**Parallelizable:** P5.1 and P5.2 can be built simultaneously. P5.5 can start once P5.1 is done, independent of P5.2-P5.4.

```
Timeline:
        P5.1 ─────────┐
                       └──── P5.5
        P5.2 ──── P5.3 ──── P5.4
```

---

## Files Summary (All Slices)

| File | Slices | Changes |
|------|--------|---------|
| `TeamManagementModal.js` | P5.1, P5.5 | Tab system, lazy init, recordings tab |
| `TeamsBrowserPanel.js` | P5.2, P5.3, P5.4 | Voice discovery, score colors, icons, inline player |
| `VoiceReplayPlayer.js` | P5.4 | Verify/add destroy(), ensure container-agnostic init |
| `VoiceReplayService.js` | P5.4 | Verify/add destroy(), clean message listener |
| `team-operations.js` | P5.5 | New `updateRecordingVisibility` Cloud Function |
| `functions/index.js` | P5.5 | Export new function |
| `src/css/input.css` | P5.1, P5.3, P5.4 | Tab styles, icon styles, player styles |
