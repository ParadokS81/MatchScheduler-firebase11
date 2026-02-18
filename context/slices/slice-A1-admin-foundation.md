# Slice A1: Admin Foundation

## Slice Definition

| Field | Value |
|-------|-------|
| **ID** | A1 |
| **Name** | Admin Foundation |
| **Depends on** | None (first admin slice) |
| **Blocks** | A2 (sidebar stats), A3 (discord panel), A4 (aggregated grid), A5 (weekly stats function) |

**User Story:** As the app admin, I want to see an Admin tab in the divider bar so I can switch into admin mode, which will be the entry point for all admin features in subsequent slices.

**Success Criteria:**
1. Admin tab button appears in divider bar only for users with `admin: true` custom claim
2. Non-admin users never see the admin tab
3. Clicking Admin tab dispatches `admin-mode-changed` event with `{ active: true }`
4. Clicking any other tab dispatches `admin-mode-changed` event with `{ active: false }`
5. Bottom panel shows placeholder content when Admin tab is active
6. Firestore rules allow admin read for `weeklyStats` and `recordingSessions` collections
7. Composite index deployed for `recordingSessions` (teamId ASC + startedAt DESC)
8. `set-admin-claims.js` script works for both dev and prod UIDs
9. `context/SCHEMA.md` documents the two new collections

---

## Architecture

### Files Changed

| File | Action | What |
|------|--------|------|
| `scripts/set-admin-claims.js` | **New** | One-time script to set admin custom claims |
| `public/index.html` | Modify | Add admin tab button (hidden by default), no new script tags yet |
| `public/js/app.js` | Modify | Check admin claims after auth, expose `window._isAdmin`, show admin tab |
| `public/js/components/BottomPanelController.js` | Modify | Add `'admin'` case in `switchTab()`, dispatch `admin-mode-changed` event |
| `firestore.rules` | Modify | Add explicit rules for `weeklyStats` and `recordingSessions` before wildcard |
| `firestore.indexes.json` | Modify | Add composite index for `recordingSessions` |
| `context/SCHEMA.md` | Modify | Document `weeklyStats` and `recordingSessions` schemas |

---

## Implementation Details

### 1. `scripts/set-admin-claims.js` (New)

Node.js script using Firebase Admin SDK to set custom claims:

```javascript
// Usage: node scripts/set-admin-claims.js
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const ADMIN_UIDS = [
    'dev-user-001',          // Dev: ParadokS
    'qw-sr-paradoks',        // Prod: ParadokS (Discord auth)
];

async function main() {
    for (const uid of ADMIN_UIDS) {
        try {
            await admin.auth().setCustomUserClaims(uid, { admin: true });
            const user = await admin.auth().getUser(uid);
            console.log(`Set admin claim for ${uid} (${user.displayName || 'unknown'})`);
        } catch (err) {
            console.warn(`Skipped ${uid}: ${err.message}`);
        }
    }
    process.exit(0);
}
main();
```

Same UIDs as `functions/feedback.js` lines 8-11. Script is idempotent — safe to re-run.

### 2. `public/index.html` — Admin Tab Button

Add inside the `.divider-tabs` div (after line 243, the tournament button):

```html
<button class="divider-tab hidden" data-tab="admin" id="admin-tab-btn">
    <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
    </svg> Admin
</button>
```

Uses Lucide "settings" icon (consistent with existing tab icons). Hidden by default via `hidden` class. The `id="admin-tab-btn"` allows targeted show/hide from app.js.

### 3. `public/js/app.js` — Admin Claims Check

Add after auth ready (after line 39), before `_initializeComponents()`:

```javascript
// Check for admin claims
await _checkAdminClaims();
```

New private function:

```javascript
async function _checkAdminClaims() {
    const user = window.firebase?.auth?.currentUser;
    if (!user) {
        window._isAdmin = false;
        return;
    }
    try {
        const tokenResult = await user.getIdTokenResult();
        window._isAdmin = tokenResult.claims.admin === true;
    } catch (err) {
        console.warn('Admin claims check failed:', err);
        window._isAdmin = false;
    }

    if (window._isAdmin) {
        const adminTab = document.getElementById('admin-tab-btn');
        if (adminTab) adminTab.classList.remove('hidden');
        console.log('🔑 Admin mode available');
    }
}
```

Also add to `_setupEventListeners()` — listen for auth changes to re-check:

```javascript
window.addEventListener('auth-state-changed', async (e) => {
    await _checkAdminClaims();
});
```

### 4. `public/js/components/BottomPanelController.js` — Admin Tab Case

**Cleanup block** (after line 63):
```javascript
} else if (_activeTab === 'admin') {
    // Future: AdminPanel.cleanup() — for now, placeholder has no cleanup
}
```

**Switch case** (after line 83):
```javascript
case 'admin':
    _showAdminPlaceholder();
    break;
```

**New helper function:**
```javascript
function _showAdminPlaceholder() {
    if (!_bottomPanel) return;
    _bottomPanel.innerHTML = '';
    _placeholderContent = null;

    const container = document.createElement('div');
    container.id = 'admin-panel';
    container.className = 'h-full flex items-center justify-center';
    container.innerHTML = `
        <div class="text-center text-muted-foreground">
            <svg class="w-12 h-12 mx-auto mb-3 opacity-50" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
            <h3 class="text-lg font-semibold text-foreground mb-2">Admin Panel</h3>
            <p class="text-sm">Discord overview, stats, and team activity — coming in slice A2-A3</p>
        </div>
    `;
    _bottomPanel.appendChild(container);
}
```

**Event dispatch** — modify `switchTab()` to dispatch `admin-mode-changed`. This logic must go BEFORE `_activeTab = tabId` (line 86) so `wasAdmin` reads the OLD value:

```javascript
// Insert BEFORE _activeTab = tabId (line 86):
const wasAdmin = _activeTab === 'admin';
const isAdmin = tabId === 'admin';

// ... existing: _activeTab = tabId; (line 86)
// ... existing: dispatch bottom-tab-changed (line 89-91)

// Insert AFTER the existing event dispatch:
if (wasAdmin !== isAdmin) {
    window.dispatchEvent(new CustomEvent('admin-mode-changed', {
        detail: { active: isAdmin }
    }));
}
```

Concrete insertion order in switchTab():
1. Read `wasAdmin` and `isAdmin` (before line 86)
2. Set `_activeTab = tabId` (existing line 86)
3. Dispatch `bottom-tab-changed` (existing lines 89-91)
4. Dispatch `admin-mode-changed` if state changed (new, after line 91)

### 5. `firestore.rules` — New Collection Rules

Add before the wildcard catch-all (before line 473):

```javascript
// ===== Admin Collections =====

// Weekly stats — written by scheduled Cloud Function, read by admin
match /weeklyStats/{weekId} {
    allow read: if request.auth != null && request.auth.token.admin == true;
    allow write: if false; // Cloud Functions use Admin SDK
}

// Recording sessions — written by quad bot via Admin SDK, read by admin
match /recordingSessions/{sessionId} {
    allow read: if request.auth != null && request.auth.token.admin == true;
    allow write: if false; // Quad bot uses Admin SDK
}
```

### 6. `firestore.indexes.json` — Composite Index

Add to the `indexes` array:

```json
{
    "collectionGroup": "recordingSessions",
    "queryScope": "COLLECTION",
    "fields": [
        { "fieldPath": "teamId", "order": "ASCENDING" },
        { "fieldPath": "startedAt", "order": "DESCENDING" }
    ]
}
```

### 7. `context/SCHEMA.md` — Document New Collections

Add sections for both new collections:

**weeklyStats/{weekId}:**
```
weeklyStats/{weekId}
  weekId: string               // "2026-08" (YYYY-WW, same format as availability docs)
  activeUsers: number           // Unique users who marked ≥1 availability slot
  activeTeams: number           // Teams with ≥1 user with availability
  proposalCount: number         // Total proposals created this week (any status)
  scheduledCount: number        // Total confirmed matches this week
  teamBreakdown: {              // Per-team activity breakdown
    [teamId]: {
      users: number,
      proposals: number,
      matches: number
    }
  }
  computedAt: Timestamp

Written by: Scheduled Cloud Function (slice A5)
Read by: AdminStatsService (slice A2), AdminPanel (slice A3)
```

**recordingSessions/{auto-id}:**
```
recordingSessions/{auto-id}
  sessionId: string             // Quad's internal UUID
  teamId: string | null         // From botRegistrations lookup. null if unregistered
  guildId: string               // Discord guild ID
  guildName: string             // Discord guild name
  channelId: string             // Discord voice channel ID
  channelName: string           // Discord voice channel name
  participants: string[]        // Current discord display names (non-bot, live snapshot)
  startedAt: Timestamp          // When recording began
  status: string                // 'recording' | 'completed' | 'interrupted'
  lastHeartbeat: Timestamp      // Updated every 60s during recording
  endedAt: Timestamp | null     // When recording ended (null while recording)
  duration: number | null       // Total seconds (null while recording)
  participantCount: number | null // Peak participants (null while recording)

Written by: Quad bot via Admin SDK
Read by: RecordingSessionService (slice A3)
Status lifecycle: recording → completed (normal) or recording → interrupted (crash recovery)
Documents are never deleted.
```

---

## Data Flow

```
Admin auth check:
  Page load → AuthService.waitForAuthReady()
           → user.getIdTokenResult()
           → claims.admin === true?
           → Show/hide admin tab button

Admin tab activation:
  Click "Admin" tab
    → BottomPanelController.switchTab('admin')
    → Show admin placeholder in bottom panel
    → Dispatch 'admin-mode-changed' { active: true }
    → (Future: TeamInfo, AvailabilityGrid react to event)

Admin tab deactivation:
  Click any other tab
    → BottomPanelController.switchTab(otherTab)
    → Dispatch 'admin-mode-changed' { active: false }
    → Normal view restored
```

---

## Performance Classification

All admin paths are **cold paths** (admin-only, infrequent):
- Admin claims check: one-time on page load (~50ms)
- Tab switching: instant (no data loading in this slice)

---

## Test Scenarios

### Manual Tests

1. **Admin tab visibility**
   - Sign in as ParadokS → admin tab appears
   - Sign in as regular user → admin tab not visible
   - Sign out → admin tab disappears

2. **Tab switching**
   - Click Admin tab → bottom panel shows placeholder, tab gets `active` class
   - Click Matches tab → placeholder replaced, admin tab loses `active` class
   - Click Admin tab again → placeholder returns

3. **Event dispatch**
   - Open browser console, run: `window.addEventListener('admin-mode-changed', e => console.log('Admin mode:', e.detail))`
   - Click Admin tab → console shows `{ active: true }`
   - Click Teams tab → console shows `{ active: false }`

4. **Firestore rules**
   - As admin: can read `weeklyStats` and `recordingSessions` docs
   - As non-admin: read denied
   - Write from client: always denied (both admin and non-admin)

5. **Claims script**
   - Run `node scripts/set-admin-claims.js`
   - Verify output shows both UIDs processed
   - Sign in, verify admin tab appears

---

## Common Pitfalls

- **Custom claims are cached in the ID token.** After running `set-admin-claims.js`, the user must sign out and back in (or wait up to 1 hour for token refresh) to see the admin tab. Add a note about this in the script output.
- **The `admin-mode-changed` event must fire on TRANSITIONS only.** Don't dispatch when switching between two non-admin tabs (e.g., Matches → Teams). Check `wasAdmin !== isAdmin` before dispatching.
- **The admin tab button must be in the DOM at init time** for BottomPanelController's `querySelectorAll('.divider-tab')` to pick it up. Adding it dynamically after init won't work without re-wiring listeners.
- **`_activeTab` assignment timing.** The event dispatch must read the OLD `_activeTab` before it's overwritten. Place the dispatch logic before `_activeTab = tabId`.

---

## Implementation Notes

- This slice is pure frontend + rules. No Cloud Functions needed yet.
- The `_showAdminPlaceholder()` function will be replaced by `AdminPanel.init()` in slice A3.
- The `admin-mode-changed` event is the coordination mechanism for slices A2 (sidebar) and A4 (grid).
- No Router integration needed for admin tab — it's not a URL-navigable state.
- The `window._isAdmin` flag is intentionally simple. No service wrapper needed for a single boolean checked by 2-3 components.
