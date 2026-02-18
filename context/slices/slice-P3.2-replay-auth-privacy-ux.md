# Slice P3.2: Replay Page Auth + Privacy UX

## Slice Definition

- **Slice ID:** P3.2
- **Name:** Firebase Auth on Replay Page + Privacy Error States
- **Depends on:** Slice P3.1 (security rules must be deployed first)
- **User Story:** As a team member, I can sign in on the replay page to access my team's private voice recordings, and I see clear feedback when a recording is private or access is denied.
- **Success Criteria:**
  - Replay page has Firebase Auth initialized (same pattern as index.html)
  - Public recordings load without auth (no regression from current behavior)
  - Private recordings show "Sign in" prompt if user not authenticated
  - After sign-in, private recordings auto-retry and load if user is a team member
  - Non-members see "access denied" message after sign-in
  - Demo iframe always renders (even without voice access) — users can still watch the demo
  - Drop zone (manual file upload) always available as fallback

---

## PRD Mapping

**PRIMARY SECTIONS:**
- Phase 3 Deliverable 3: Add Firebase Auth to replay.html
- Phase 3 Deliverable 4: Replay Page UX Flow
- Phase 3 Deliverable 6: Update VoiceReplayService.loadFromFirestore() — Handle Auth Errors

**DEPENDENT SECTIONS:**
- Phase 3 Deliverable 1: Firestore rules (must be deployed — see P3.1)
- Existing AuthService.js: Provides sign-in flows, auth state management

**IGNORED SECTIONS:**
- Phase 4: voiceSettings toggle UI
- Phase 5: Recordings list/discovery
- Per-recording visibility override

---

## Full Stack Architecture

### FRONTEND COMPONENTS

#### VoiceReplayPlayer.js (Modified)

- **Firebase listeners:** None (uses AuthService callbacks)
- **Cache interactions:** None
- **UI responsibilities:**
  - Render auth error states (sign-in prompt, access denied)
  - Show sign-in buttons (Discord + Google) when auth_required
  - Retry loadFromFirestore after successful sign-in
  - Always render demo iframe regardless of voice access
  - Always show drop zone as fallback for manual file upload
- **User actions:**
  - Click "Sign in with Discord" or "Sign in with Google"
  - After sign-in: automatic retry of voice recording load

**New UI states to add:**

```
CASE 1: Public recording (or legacy) → existing behavior, no change
CASE 2: Private, not logged in → auth_required state
  - Demo iframe renders (watch demo without voice)
  - Message: "This recording is private. Sign in to access your team's recordings."
  - Discord + Google sign-in buttons
  - Drop zone available below

CASE 3: Private, logged in, team member → loaded state (existing behavior)
CASE 4: Private, logged in, NOT team member → access_denied state
  - Demo iframe renders
  - Message: "You don't have access to this recording. It belongs to a different team."
  - Drop zone available below

CASE 5: No recording found → existing behavior (drop zone)
```

### FRONTEND SERVICES

#### VoiceReplayService.js (Modified)

**Updated method: `loadFromFirestore(demoSha256)`**

Current return: `{ tracks, source, trackCount, teamTag } | null`

New return: Structured result object:
```javascript
{ status: 'loaded', tracks, source, trackCount, teamTag }   // Success
{ status: 'not_found' }                                      // No recording exists
{ status: 'auth_required' }                                  // Private, user not logged in
{ status: 'access_denied' }                                  // Private, user not a team member
```

**Disambiguation logic:** Firestore returns the same `permission-denied` error code regardless of auth state. Differentiate by checking `window.firebase.auth.currentUser`:
- `currentUser == null` → `auth_required`
- `currentUser != null` → `access_denied`

#### AuthService.js (Imported, not modified)

Used as-is from the main app. Methods needed:
- `waitForAuthReady()` — Wait for initial auth state
- `signInWithGoogle()` — Google OAuth popup
- `signInWithDiscord()` — Discord OAuth popup
- `onAuthStateChange(callback)` — Subscribe to auth changes
- `getCurrentUser()` — Get current user
- `isDevMode()` — Check if dev mode (for emulator auto-login)

### BACKEND REQUIREMENTS

**None.** No new Cloud Functions needed. Auth is handled client-side via Firebase Auth SDK. Security rules from P3.1 enforce access.

### INTEGRATION POINTS

**Auth flow on replay page:**
```
User visits replay.html?demo={sha256}
  → Firebase Auth initializes
  → AuthService.waitForAuthReady() resolves
  → VoiceReplayService.loadFromFirestore(sha256)
    ├── Success → render player with tracks
    ├── not_found → render drop zone
    ├── auth_required → render sign-in prompt + drop zone
    │     └── User signs in → retry loadFromFirestore()
    │           ├── Success → render player
    │           └── access_denied → render denied message + drop zone
    └── access_denied → render denied message + drop zone
```

**Important:** The demo player iframe loads independently from `hub.quakeworld.nu`. It has nothing to do with our auth. Always render it.

---

## Integration Code Examples

### 1. replay.html — Add Firebase Auth

```html
<!-- Firebase v11 SDK (Firestore + Storage + Auth) -->
<script type="module">
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
    import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
    import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
    import { getStorage, connectStorageEmulator } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js';

    const firebaseConfig = {
        apiKey: "AIzaSyAElazBT8eT13fT0wCO5K7z3-5D1z42ZBM",
        authDomain: "matchscheduler-dev.firebaseapp.com",
        projectId: "matchscheduler-dev",
        storageBucket: "matchscheduler-dev.firebasestorage.app",
        messagingSenderId: "340309534131",
        appId: "1:340309534131:web:77155fb67f95ec2816d7c6"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const storage = getStorage(app);

    const isLocalDev = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('172.') ||
        window.location.hostname.startsWith('192.168.') ||
        window.location.hostname.startsWith('100.');

    if (isLocalDev) {
        const emulatorHost = window.location.hostname;
        try { connectFirestoreEmulator(db, emulatorHost, 8080); } catch (e) { /* already connected */ }
        try { connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true }); } catch (e) { /* already connected */ }
        try { connectStorageEmulator(storage, emulatorHost, 9199); } catch (e) { /* already connected */ }
    }

    window.firebase = { app, db, auth, storage, isLocalDev };

    window.APP_CONFIG = {
        DISCORD_CLIENT_ID: '1465332663152808031',
        DEV_MODE: isLocalDev
    };
</script>
```

**Script imports to add (before VoiceReplayService):**
```html
<!-- Auth service (needed for sign-in flows on private recordings) -->
<script src="js/services/AuthService.js"></script>
```

### 2. VoiceReplayService.loadFromFirestore() — Handle Permission Errors

```javascript
async function loadFromFirestore(demoSha256) {
    if (!window.firebase || !window.firebase.db) {
        console.warn('VoiceReplayService: Firebase not initialized, skipping auto-load');
        return { status: 'not_found' };
    }

    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
    const docRef = doc(window.firebase.db, 'voiceRecordings', demoSha256);

    let snap;
    try {
        snap = await getDoc(docRef);
    } catch (err) {
        // Firestore permission-denied error
        if (err.code === 'permission-denied') {
            const currentUser = window.firebase.auth?.currentUser;
            if (!currentUser) {
                console.log('VoiceReplayService: Private recording, auth required');
                return { status: 'auth_required' };
            } else {
                console.log('VoiceReplayService: Private recording, access denied for', currentUser.uid);
                return { status: 'access_denied' };
            }
        }
        // Other errors (network, etc.) — rethrow
        throw err;
    }

    if (!snap.exists()) {
        console.log('VoiceReplayService: No voice recording found for', demoSha256);
        return { status: 'not_found' };
    }

    const recording = snap.data();
    console.log(`VoiceReplayService: Found ${recording.trackCount} tracks (source: ${recording.source})`);

    if (recording.source !== 'firebase_storage') {
        console.log('VoiceReplayService: Source is', recording.source, '— not handled yet');
        return { status: 'not_found' };
    }

    const { ref, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js');

    const results = [];
    const errors = [];

    for (const trackInfo of recording.tracks) {
        try {
            const storageRef = ref(window.firebase.storage, trackInfo.storagePath);
            const url = await getDownloadURL(storageRef);
            const response = await fetch(url);
            const blob = await response.blob();
            const track = await _createTrack(trackInfo.fileName, blob);
            results.push({ name: track.name, index: _tracks.length - 1, duration: track.audio.duration });
        } catch (err) {
            console.warn(`VoiceReplayService: Failed to load track ${trackInfo.playerName}:`, err);
            errors.push({ name: trackInfo.playerName, error: err.message });
        }
    }

    _syncTracksToDemo();

    return {
        status: 'loaded',
        tracks: results,
        errors,
        source: recording.source,
        trackCount: recording.trackCount,
        teamTag: recording.teamTag
    };
}
```

### 3. VoiceReplayPlayer.init() — Handle Auth States

```javascript
async function init(container, demoSha256, matchTitle) {
    _container = container;
    _demoSha256 = demoSha256;
    _matchTitle = matchTitle || '';
    _tracksLoaded = false;

    // Show loading state
    _container.innerHTML = `
        <div class="vr-loading">
            <p class="text-muted-foreground">Loading demo info\u2026</p>
        </div>
    `;

    // Init service (fetches DemoInfo, sets up postMessage listener)
    const { countdownDuration, demoInfo } = await VoiceReplayService.init(demoSha256, _onStateChange);

    if (!_matchTitle && demoInfo) {
        _matchTitle = _buildTitleFromDemoInfo(demoInfo);
    }

    // Wait for auth to be ready before trying Firestore
    if (typeof AuthService !== 'undefined') {
        await AuthService.waitForAuthReady();
    }

    // Try auto-loading voice recordings
    _container.innerHTML = `
        <div class="vr-loading">
            <p class="text-muted-foreground">Checking for voice recordings\u2026</p>
        </div>
    `;

    const result = await VoiceReplayService.loadFromFirestore(demoSha256);

    switch (result.status) {
        case 'loaded':
            _tracksLoaded = true;
            _render();
            break;

        case 'not_found':
            _render(); // Shows drop zone
            break;

        case 'auth_required':
            _renderAuthRequired();
            break;

        case 'access_denied':
            _renderAccessDenied();
            break;
    }
}
```

### 4. VoiceReplayPlayer — Auth UI States

```javascript
function _renderAuthRequired() {
    const iframeUrl = _buildIframeUrl(_demoSha256);

    _container.innerHTML = `
        <div class="vr-player">
            ${_renderHeader()}
            <div class="vr-iframe-wrap">
                <iframe class="vr-iframe" src="${iframeUrl}"
                    allow="autoplay; fullscreen" allowfullscreen></iframe>
            </div>
            <div class="vr-controls" id="vr-controls">
                <div class="vr-auth-prompt">
                    <p class="vr-auth-message">This recording is private. Sign in to access your team's recordings.</p>
                    <div class="vr-auth-buttons">
                        <button class="vr-auth-btn vr-auth-discord" onclick="VoiceReplayPlayer.signInDiscord()">
                            Sign in with Discord
                        </button>
                        <button class="vr-auth-btn vr-auth-google" onclick="VoiceReplayPlayer.signInGoogle()">
                            Sign in with Google
                        </button>
                    </div>
                </div>
                ${_renderDropZone()}
            </div>
        </div>
    `;

    _attachDropEvents();
}

function _renderAccessDenied() {
    const iframeUrl = _buildIframeUrl(_demoSha256);

    _container.innerHTML = `
        <div class="vr-player">
            ${_renderHeader()}
            <div class="vr-iframe-wrap">
                <iframe class="vr-iframe" src="${iframeUrl}"
                    allow="autoplay; fullscreen" allowfullscreen></iframe>
            </div>
            <div class="vr-controls" id="vr-controls">
                <div class="vr-auth-prompt">
                    <p class="vr-auth-message vr-auth-denied">You don't have access to this recording. It belongs to a different team.</p>
                </div>
                ${_renderDropZone()}
            </div>
        </div>
    `;

    _attachDropEvents();
}

async function signInDiscord() {
    try {
        await AuthService.signInWithDiscord();
        _retryLoad();
    } catch (err) {
        console.error('VoiceReplayPlayer: Discord sign-in failed', err);
    }
}

async function signInGoogle() {
    try {
        await AuthService.signInWithGoogle();
        _retryLoad();
    } catch (err) {
        console.error('VoiceReplayPlayer: Google sign-in failed', err);
    }
}

async function _retryLoad() {
    const result = await VoiceReplayService.loadFromFirestore(_demoSha256);

    if (result.status === 'loaded') {
        _tracksLoaded = true;
        _render();
    } else if (result.status === 'access_denied') {
        _renderAccessDenied();
    }
}
```

### 5. CSS for Auth States (in `src/css/input.css`)

```css
/* Voice Replay Auth States */
.vr-auth-prompt {
    text-align: center;
    padding: 1.5rem 1rem;
}

.vr-auth-message {
    color: var(--muted-foreground);
    margin-bottom: 1rem;
    font-size: 0.875rem;
    line-height: 1.5;
}

.vr-auth-denied {
    color: var(--destructive);
}

.vr-auth-buttons {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
}

.vr-auth-btn {
    padding: 0.5rem 1.25rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--foreground);
    transition: background 0.15s;
}

.vr-auth-btn:hover {
    background: var(--accent);
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- None — replay page is a cold-start page (navigated to from match history or direct link)

COLD PATHS (<2s):
- Auth initialization: AuthService.waitForAuthReady() — resolves quickly if already authenticated
- loadFromFirestore: Firestore getDoc + permission check — same as before, plus auth overhead
- Sign-in flow: OAuth popup — user-driven, inherently async
- Retry after sign-in: Second loadFromFirestore call — acceptable cold path

BACKEND PERFORMANCE:
- No Cloud Function calls
- No new indexes
- Firestore get() in security rule: 1 extra read (negligible)
```

---

## Data Flow Diagram

```
User visits replay.html?demo={sha256}
    │
    ▼
Firebase Init (app, db, auth, storage)
    │
    ▼
AuthService.waitForAuthReady()
    │
    ├── User already logged in (cookie/session)
    │   └── currentUser available
    │
    └── Not logged in
        └── currentUser = null
    │
    ▼
VoiceReplayService.loadFromFirestore(sha256)
    │
    ├── Firestore allows read
    │   ├── Doc exists → { status: 'loaded', ... }
    │   │   └── Render iframe + audio controls + overlay
    │   └── Doc missing → { status: 'not_found' }
    │       └── Render iframe + drop zone
    │
    └── Firestore denies read (permission-denied)
        ├── currentUser == null → { status: 'auth_required' }
        │   └── Render iframe + sign-in buttons + drop zone
        │       │
        │       ▼ (user clicks sign-in)
        │   AuthService.signInWithDiscord/Google()
        │       │
        │       ▼
        │   _retryLoad() → loadFromFirestore() again
        │       ├── loaded → render controls
        │       └── access_denied → render denied message
        │
        └── currentUser != null → { status: 'access_denied' }
            └── Render iframe + denied message + drop zone
```

---

## Test Scenarios

### FRONTEND TESTS — VoiceReplayService
- [ ] `loadFromFirestore` returns `{ status: 'loaded', ... }` for public recording
- [ ] `loadFromFirestore` returns `{ status: 'not_found' }` when doc doesn't exist
- [ ] `loadFromFirestore` returns `{ status: 'auth_required' }` on permission-denied when not logged in
- [ ] `loadFromFirestore` returns `{ status: 'access_denied' }` on permission-denied when logged in
- [ ] `loadFromFirestore` rethrows non-permission errors (network errors)
- [ ] Existing `loadFiles` and `loadZip` work unchanged (no regression)

### FRONTEND TESTS — VoiceReplayPlayer
- [ ] Public recording: renders iframe + audio controls (no auth prompt)
- [ ] Not found: renders iframe + drop zone (existing behavior)
- [ ] Auth required: renders iframe + sign-in buttons + drop zone
- [ ] Access denied: renders iframe + denied message + drop zone
- [ ] Sign-in with Discord triggers AuthService.signInWithDiscord()
- [ ] Sign-in with Google triggers AuthService.signInWithGoogle()
- [ ] After successful sign-in + retry → loaded: renders audio controls
- [ ] After successful sign-in + retry → access_denied: shows denied message
- [ ] Drop zone works in all states (manual file upload always available)
- [ ] Demo iframe always renders (even in auth_required/access_denied states)

### FRONTEND TESTS — replay.html
- [ ] Firebase Auth module imported and initialized
- [ ] Auth emulator connected in dev mode
- [ ] `window.firebase.auth` is available
- [ ] `window.APP_CONFIG` has DISCORD_CLIENT_ID
- [ ] AuthService.js loaded before VoiceReplayService.js

### INTEGRATION TESTS
- [ ] Public recording + no auth → plays audio (end-to-end)
- [ ] Private recording + no auth → shows sign-in prompt
- [ ] Private recording + sign in as team member → plays audio
- [ ] Private recording + sign in as non-member → shows access denied
- [ ] Legacy recording (teamId: '') + no auth → plays audio
- [ ] Dev mode: auto-login works on replay page

### END-TO-END TESTS
- [ ] Navigate to replay.html?demo={public_sha256} → voice audio plays
- [ ] Navigate to replay.html?demo={private_sha256} while not logged in → sign-in prompt
- [ ] Sign in via Discord → recording loads automatically
- [ ] Navigate to replay.html?demo={nonexistent} → drop zone appears
- [ ] Drop files onto drop zone while in auth_required state → files load and play

---

## Common Integration Pitfalls

- [ ] **AuthService.init() must be called** — AuthService auto-initializes on DOMContentLoaded, but `waitForAuthReady()` must be awaited before calling `loadFromFirestore()`. Without this, the auth state may not be resolved yet.
- [ ] **Don't forget to add `auth` to `window.firebase`** — The replay page currently only has `{ app, db, storage, isLocalDev }`. Must add `auth`.
- [ ] **Don't forget `window.APP_CONFIG`** — AuthService reads `DISCORD_CLIENT_ID` from this for Discord OAuth. Without it, Discord sign-in silently fails.
- [ ] **Error code check is `err.code === 'permission-denied'`** — Firestore SDK uses this exact string, not `PERMISSION_DENIED` or other variants.
- [ ] **Don't wrap loadFromFirestore in try/catch in VoiceReplayPlayer** — The service now returns structured results instead of throwing. The player should use `result.status` switch, not catch blocks. Only rethrow unexpected errors.
- [ ] **Add `signInDiscord` and `signInGoogle` to the public return object** — They're called from inline `onclick` handlers, so must be on `VoiceReplayPlayer.*`.
- [ ] **AuthService auto-login in dev mode** — AuthService uses `_devModeAutoSignIn()` which signs in as dev-user-001 (ParadokS). Make sure this test user has `teams` populated in emulator data for private recording tests.
- [ ] **Drop zone must work in ALL states** — Even auth_required and access_denied. Users might have the audio files locally.

---

## Implementation Notes

**Script load order in replay.html:**
1. Firebase module `<script type="module">` (sets up `window.firebase` with `auth`)
2. AuthService.js (reads `window.firebase`, auto-inits on DOMContentLoaded)
3. VoiceReplayService.js (calls `window.firebase.auth.currentUser` for disambiguation)
4. VoiceReplayPlayer.js (calls `AuthService.waitForAuthReady()` before loading)
5. Inline `<script>` that calls `VoiceReplayPlayer.init()`

**Auth emulator detail:** The emulator host for Auth uses `http://` prefix (not just hostname:port like Firestore). Pattern: `connectAuthEmulator(auth, 'http://${emulatorHost}:9099', { disableWarnings: true })`.

**No UserProfile/ProfileModal needed:** The replay page only needs auth for reading Firestore. No profile display, no avatar, no team management. Just sign-in capability.

**Backward compatibility:** The `loadFromFirestore` return type changes from `object | null` to `{ status, ...data }`. The VoiceReplayPlayer.init() must be updated to use the new return format. Since VoiceReplayPlayer is the only consumer, this is safe.

---

## Files Touched

| File | Change |
|------|--------|
| `public/replay.html` | Add Auth import, `auth` to window.firebase, `APP_CONFIG`, AuthService.js script tag |
| `public/js/services/VoiceReplayService.js` | Update `loadFromFirestore()` to return structured result, catch permission-denied errors |
| `public/js/components/VoiceReplayPlayer.js` | Add auth error states (auth_required, access_denied), sign-in buttons, retry logic. Add `signInDiscord`, `signInGoogle` to public API |
| `src/css/input.css` | Add `.vr-auth-prompt`, `.vr-auth-message`, `.vr-auth-denied`, `.vr-auth-buttons`, `.vr-auth-btn` styles |
