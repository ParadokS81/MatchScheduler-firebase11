# Slice A3: Admin Discord Panel

## Slice Definition

| Field | Value |
|-------|-------|
| **ID** | A3 |
| **Name** | Admin Discord Panel |
| **Depends on** | A1 (admin foundation — tab, placeholder, event system) |
| **Blocks** | None |

**User Story:** As the app admin, I want the bottom panel in admin mode to show which teams have connected the Discord bot, which teams are currently recording, and recent recording activity, so I can monitor bot adoption and usage.

**Success Criteria:**
1. Admin bottom panel replaces the A1 placeholder with real content
2. "Discord & Bot" sub-tab shows a table of all bot registrations with status
3. Live recording sessions show as cards with team, channel, participants, and live duration
4. Stale sessions (heartbeat >2min) show a warning indicator
5. "Recording History" section shows per-team recording counts
6. All data updates in real-time via Firestore listeners

---

## Architecture

### Files Changed

| File | Action | What |
|------|--------|------|
| `public/js/services/RecordingSessionService.js` | **New** | Listen to recordingSessions, track live/completed sessions |
| `public/js/services/BotRegistrationService.js` | Modify | Add `loadAllRegistrations()` method |
| `public/js/components/AdminPanel.js` | **New** | Bottom panel content — replaces A1 placeholder |
| `public/js/components/BottomPanelController.js` | Modify | Replace `_showAdminPlaceholder()` with `AdminPanel.init()` |
| `public/index.html` | Modify | Load new JS files |
| `src/css/input.css` | Modify | Admin panel styles |

---

## Implementation Details

### 1. `public/js/services/RecordingSessionService.js` (New)

Listens to `recordingSessions` collection for admin. Cache + listener pattern.

```javascript
const RecordingSessionService = (function() {
    'use strict';

    let _activeSessions = new Map();  // sessionDocId → session data
    let _unsubscribe = null;
    let _callbacks = [];

    /**
     * Subscribe to live recording sessions.
     * Queries where status == 'recording' with real-time listener.
     */
    async function subscribeToActiveSessions(callback) {
        _callbacks.push(callback);

        // Already listening — just fire callback with current data
        if (_unsubscribe) {
            callback(getActiveSessions());
            return;
        }

        const { collection, query, where, onSnapshot } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        const q = query(
            collection(window.firebase.db, 'recordingSessions'),
            where('status', '==', 'recording')
        );

        _unsubscribe = onSnapshot(q, (snapshot) => {
            _activeSessions.clear();
            snapshot.forEach(doc => {
                _activeSessions.set(doc.id, { id: doc.id, ...doc.data() });
            });
            _notifyCallbacks();
        });
    }

    /**
     * Get active sessions from cache, filtering stale ones.
     * A session is stale if lastHeartbeat > 2 minutes ago.
     */
    function getActiveSessions() {
        const now = Date.now();
        const STALE_THRESHOLD = 2 * 60 * 1000; // 2 minutes
        const sessions = [];

        for (const session of _activeSessions.values()) {
            const heartbeat = session.lastHeartbeat?.toDate?.() || session.startedAt?.toDate?.();
            const isStale = heartbeat && (now - heartbeat.getTime()) > STALE_THRESHOLD;
            sessions.push({ ...session, isStale });
        }

        return sessions;
    }

    /**
     * Get recording history for a specific team (completed sessions).
     * One-time query, not real-time.
     */
    async function getTeamHistory(teamId, limit = 20) {
        const { collection, query, where, orderBy, limit: fbLimit, getDocs } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        const q = query(
            collection(window.firebase.db, 'recordingSessions'),
            where('teamId', '==', teamId),
            orderBy('startedAt', 'desc'),
            fbLimit(limit)
        );

        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /**
     * Get recording counts per team (completed + interrupted).
     * Groups all non-recording sessions by teamId.
     */
    async function getRecordingCountsByTeam() {
        const { collection, query, where, getDocs } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        // Query completed sessions
        const completedQ = query(
            collection(window.firebase.db, 'recordingSessions'),
            where('status', '==', 'completed')
        );
        const snap = await getDocs(completedQ);

        const counts = {};
        snap.forEach(doc => {
            const teamId = doc.data().teamId;
            if (teamId) {
                counts[teamId] = (counts[teamId] || 0) + 1;
            }
        });
        return counts;
    }

    function _notifyCallbacks() {
        const sessions = getActiveSessions();
        _callbacks.forEach(cb => cb(sessions));
    }

    function unsubscribe() {
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
        _callbacks = [];
        _activeSessions.clear();
    }

    return {
        subscribeToActiveSessions,
        getActiveSessions,
        getTeamHistory,
        getRecordingCountsByTeam,
        unsubscribe
    };
})();
```

### 2. `BotRegistrationService.js` — Add `loadAllRegistrations()`

Add new method to existing service:

```javascript
/**
 * Load ALL bot registrations (admin only).
 * Returns array of all registration docs.
 */
async function loadAllRegistrations() {
    const { collection, getDocs } = await import(
        'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
    );

    const snapshot = await getDocs(
        collection(window.firebase.db, 'botRegistrations')
    );

    const registrations = [];
    snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        _cache.set(doc.id, data);  // Update cache
        registrations.push(data);
    });
    return registrations;
}
```

Add `loadAllRegistrations` to the service's `return { ... }` object (the existing return statement at the end of the IIFE).

### 3. `public/js/components/AdminPanel.js` (New)

Bottom panel content with Discord overview.

```javascript
const AdminPanel = (function() {
    'use strict';

    let _container = null;
    let _durationInterval = null;  // Timer for updating live duration counters

    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) return;

        _container.innerHTML = _renderShell();
        _container.addEventListener('click', _handleClick);

        // Load data in parallel
        await Promise.all([
            _loadBotRegistrations(),
            _loadRecordingSessions(),
            _loadRecordingCounts()
        ]);

        // Update live durations every second
        _durationInterval = setInterval(_updateDurations, 1000);
    }

    function _renderShell() {
        return `
            <div class="h-full flex flex-col overflow-hidden">
                <div class="admin-panel-content flex-1 overflow-auto p-4">
                    <!-- Live Recording Sessions -->
                    <div class="mb-6">
                        <h3 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                            Live Recording Sessions
                        </h3>
                        <div id="admin-live-sessions" class="space-y-2">
                            <div class="text-sm text-muted-foreground">Loading...</div>
                        </div>
                    </div>

                    <!-- Bot Connections -->
                    <div class="mb-6">
                        <h3 class="text-sm font-semibold text-foreground mb-3">
                            Bot Connections
                        </h3>
                        <div id="admin-bot-table">
                            <div class="text-sm text-muted-foreground">Loading...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ... data loading and rendering methods below
```

**Live sessions rendering:**
```javascript
function _renderLiveSessions(sessions) {
    const el = document.getElementById('admin-live-sessions');
    if (!el) return;

    if (sessions.length === 0) {
        el.innerHTML = '<div class="text-sm text-muted-foreground">No active recordings</div>';
        return;
    }

    el.innerHTML = sessions.map(s => {
        const teamName = TeamService.getTeamFromCache(s.teamId)?.teamName || s.guildName || 'Unknown';
        const teamTag = TeamService.getTeamFromCache(s.teamId)?.teamTag || '';
        const startTime = s.startedAt?.toDate?.() || new Date();
        const staleClass = s.isStale ? 'admin-session-stale' : '';

        return `
            <div class="admin-session-card ${staleClass}" data-session-id="${s.id}" data-start="${startTime.getTime()}">
                <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold text-foreground">${teamTag || teamName}</span>
                        <span class="text-xs text-muted-foreground">#${s.channelName}</span>
                    </div>
                    <span class="admin-session-duration text-xs font-mono text-muted-foreground"
                          data-start="${startTime.getTime()}">
                        ${_formatDuration(Date.now() - startTime.getTime())}
                    </span>
                </div>
                <div class="flex items-center gap-1 flex-wrap">
                    ${s.participants.map(p => `
                        <span class="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">${p}</span>
                    `).join('')}
                </div>
                ${s.isStale ? '<div class="text-xs text-amber-400 mt-1">Heartbeat stale — may be disconnected</div>' : ''}
            </div>
        `;
    }).join('');
}
```

**Bot registrations table:**
```javascript
function _renderBotTable(registrations, recordingCounts) {
    const el = document.getElementById('admin-bot-table');
    if (!el) return;

    if (registrations.length === 0) {
        el.innerHTML = '<div class="text-sm text-muted-foreground">No teams have connected the bot yet</div>';
        return;
    }

    // Sort: active first, then by team name
    registrations.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return (a.teamName || '').localeCompare(b.teamName || '');
    });

    el.innerHTML = `
        <div class="admin-bot-grid text-xs">
            <div class="admin-bot-header">Team</div>
            <div class="admin-bot-header">Discord Server</div>
            <div class="admin-bot-header">Status</div>
            <div class="admin-bot-header text-right">Recordings</div>
            ${registrations.map(r => {
                const count = recordingCounts[r.id] || 0;
                const statusClass = r.status === 'active' ? 'text-green-400' : 'text-amber-400';
                const knownCount = Object.keys(r.knownPlayers || {}).length;
                return `
                    <div class="py-1.5">${r.teamName || r.teamTag}</div>
                    <div class="py-1.5 text-muted-foreground">${r.guildName || '—'}</div>
                    <div class="py-1.5 ${statusClass}">${r.status}${knownCount ? ` (${knownCount} players)` : ''}</div>
                    <div class="py-1.5 text-right">${count}</div>
                `;
            }).join('')}
        </div>
    `;
}
```

**Duration utilities:**
```javascript
function _formatDuration(ms) {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
}

function _updateDurations() {
    const now = Date.now();
    document.querySelectorAll('.admin-session-duration[data-start]').forEach(el => {
        const start = parseInt(el.dataset.start);
        if (start) el.textContent = _formatDuration(now - start);
    });
}
```

**Cleanup:**
```javascript
function cleanup() {
    if (_durationInterval) { clearInterval(_durationInterval); _durationInterval = null; }
    RecordingSessionService.unsubscribe();
    if (_container) { _container.removeEventListener('click', _handleClick); }
    _container = null;
}
```

### 4. `BottomPanelController.js` — Replace Placeholder

Replace the `_showAdminPlaceholder()` from A1 with:

```javascript
function _showAdminPanel() {
    if (!_bottomPanel) return;
    _bottomPanel.innerHTML = '';
    _placeholderContent = null;

    const container = document.createElement('div');
    container.id = 'admin-panel';
    container.className = 'h-full';
    _bottomPanel.appendChild(container);

    AdminPanel.init('admin-panel');
}
```

Update cleanup block:
```javascript
} else if (_activeTab === 'admin') {
    AdminPanel.cleanup();
}
```

### 5. CSS Additions (`src/css/input.css`)

```css
/* Admin session cards */
.admin-session-card {
    background: oklch(from var(--muted) l c h / 0.5);
    border: 1px solid oklch(from var(--border) l c h);
    border-radius: 0.375rem;
    padding: 0.625rem 0.75rem;
}

.admin-session-stale {
    border-color: oklch(from var(--warning) l c h / 0.5);
}

/* Admin bot grid */
.admin-bot-grid {
    display: grid;
    grid-template-columns: 1fr 1fr auto auto;
    gap: 0 1rem;
    align-items: center;
}

.admin-bot-header {
    font-weight: 600;
    color: oklch(from var(--muted-foreground) l c h);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid oklch(from var(--border) l c h);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
```

---

## Data Flow

```
AdminPanel.init()
  ├─ BotRegistrationService.loadAllRegistrations()
  │   → getDocs(collection(db, 'botRegistrations'))
  │   → Render bot connections table
  │
  ├─ RecordingSessionService.subscribeToActiveSessions(callback)
  │   → onSnapshot(where status == 'recording')
  │   → Render live session cards (auto-updates on changes)
  │   → Duration counter updates every 1s via setInterval
  │
  └─ RecordingSessionService.getRecordingCountsByTeam()
      → getDocs(where status == 'completed')
      → Group by teamId → display counts in bot table

Quad bot starts recording:
  → Creates recordingSessions doc (status: 'recording')
  → Firestore triggers onSnapshot
  → New card appears in AdminPanel

Quad bot stops recording:
  → Updates doc (status: 'completed')
  → onSnapshot fires → session card disappears from live list
```

---

## Performance Classification

- **Bot table load:** Cold path. One-time query on admin panel init. ~40 teams max.
- **Live sessions:** Real-time listener. Only queries `status == 'recording'` (typically 0-3 docs).
- **Recording counts:** Cold path. One-time aggregation query.
- **Duration updates:** 1s setInterval, DOM-only (no Firestore reads).

---

## Test Scenarios

1. **No bot connections** → shows "No teams have connected the bot yet"
2. **Active bots** → shows table with team name, guild, status, recording count
3. **Live recording** → card appears with team, channel, participants, live timer
4. **Recording stops** → card disappears automatically
5. **Stale session** → amber warning "Heartbeat stale" after 2 minutes
6. **Switch away from admin tab** → cleanup stops interval and unsubscribes listeners
7. **Switch back to admin tab** → re-subscribes and shows fresh data

---

## Common Pitfalls

- **Architecture deviation note.** RecordingSessionService uses a callback pattern (`subscribeToActiveSessions(callback)`) which is technically a warehouse pattern. This is a pragmatic choice for admin-only code with exactly one consumer (AdminPanel). If a second consumer ever needs live sessions, refactor to component-owned listeners.
- **Don't forget to unsubscribe** `RecordingSessionService` on cleanup. Leaving the listener active when not on admin tab wastes reads.
- **Duration interval must be cleared** on cleanup or it will reference removed DOM elements.
- **`toDate()` check** — Firestore timestamps need `.toDate()` but might be plain JS dates in emulator. Guard with `s.startedAt?.toDate?.() || s.startedAt`.
- **Bot registrations aren't gated by admin rules** — they're under team leader/scheduler rules. `loadAllRegistrations()` uses the wildcard admin read rule (line 476 of firestore.rules).
