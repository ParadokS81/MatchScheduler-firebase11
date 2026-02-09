# Slice 16.0b — Live Server Status

## 1. Slice Definition

- **Slice ID:** 16.0b
- **Name:** Live Server Status
- **Depends on:** 16.0a (Find Standin)
- **User Story:** As a team leader looking for a standin, I can see which available players are currently on a QuakeWorld server (playing, spectating, or watching QTV), so I know who's at their PC right now and can join their server to ask them directly.
- **Success Criteria:** Players in the standin search results show a quake icon if they're detected on an active server. Hovering shows server name, status (playing/spectating/QTV), and a copy button for the server ip:port. Name matching uses fuzzy search (fuse.js) to handle QW character encoding differences.

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- QWHub API v2: Live server data from hubapi.quakeworld.nu/v2/servers/mvdsv
- Players Panel: Quake icon overlay + tooltip enhancement

DEPENDENT SECTIONS:
- QWHubService: New method for fetching active server data
- StandinFinderService: Provides the filtered player list to match against
- Find Standin (16.0a): Must be implemented first — this layers on top

IGNORED SECTIONS:
- Supabase match data: Not relevant (this is live server data, not match history)
- Player identity resolution: Full alias system (qw-stats research) is overkill — simple fuse.js matching is sufficient
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- PlayersPanel (EXTENDED from 16.0a)
  - Firebase listeners: none
  - Cache interactions: reads LiveServerService cache for online status
  - UI responsibilities:
    - Small quake icon next to players detected on active servers
    - Icon color/style varies by status: playing (bright), spectating (dim), QTV (dim)
    - Enhanced hover tooltip: server name, status, ip:port with copy button
  - User actions: Hover quake icon for server details, click copy for ip:port

FRONTEND SERVICES:
- LiveServerService (NEW):
  - fetchActiveServers() → GET hubapi.quakeworld.nu/v2/servers/mvdsv
  - getActivePlayerMap() → returns Map<normalizedName, { status, server, address, mode, team }>
    Collects from: players[], spectator_names[], qtv_stream.spectator_names[]
  - matchPlayerToServer(displayName) → fuzzy match displayName against active player map using fuse.js
  - Cache: 30-second TTL (servers change fast), in-memory
  - Deduplication: single in-flight request (same pattern as QWHubService)

- QWHubService (EXTENDED):
  - qwToAscii() already exists — used for name normalization
  - Add: getActiveServers() method (or put in LiveServerService directly)

BACKEND REQUIREMENTS:
- No backend changes
- External API only: hubapi.quakeworld.nu (no auth, public, no rate limits documented)

NEW DEPENDENCY:
- fuse.js (fuzzy search library)
  - Zero dependencies, ~6KB gzipped
  - Load via CDN: https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.mjs
  - Or npm install fuse.js (if using bundler)
  - Recommended by vikpe (QWHub maintainer)

INTEGRATION POINTS:
- LiveServerService → hubapi: Fetch active servers (external API)
- LiveServerService → QWHubService: qwToAscii() for name normalization
- LiveServerService → fuse.js: Fuzzy match normalized server names against our player names
- PlayersPanel → LiveServerService: Check online status for each player in results
- StandinFinderService → LiveServerService: Trigger server fetch when standin search activates
```

---

## 4. Integration Code Examples

### 4a. LiveServerService — New Module

```javascript
// public/js/services/LiveServerService.js
const LiveServerService = (function() {
    const API_URL = 'https://hubapi.quakeworld.nu/v2/servers/mvdsv';
    const CACHE_TTL = 30000; // 30 seconds

    let _cache = null;
    let _cacheTime = 0;
    let _inflight = null;
    let _fuseInstance = null;
    let _activePlayerMap = null; // Map<normalizedName, serverInfo>

    async function fetchActiveServers() {
        const now = Date.now();
        if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;
        if (_inflight) return _inflight;

        _inflight = fetch(API_URL)
            .then(res => res.json())
            .then(servers => {
                _cache = servers;
                _cacheTime = Date.now();
                _activePlayerMap = null; // invalidate derived data
                _inflight = null;
                return servers;
            })
            .catch(err => {
                console.error('Failed to fetch active servers:', err);
                _inflight = null;
                return _cache || []; // return stale cache or empty
            });

        return _inflight;
    }

    function _buildActivePlayerMap(servers) {
        if (_activePlayerMap) return _activePlayerMap;

        const map = new Map();
        for (const server of servers) {
            const serverInfo = {
                title: server.title,
                address: server.address,
                mode: server.mode
            };

            // Players (full objects)
            for (const player of (server.players || [])) {
                if (player.is_bot) continue;
                const name = QWHubService.qwToAscii(player.name).trim().toLowerCase();
                if (name && name !== 'unnamed') {
                    map.set(name, {
                        ...serverInfo,
                        status: 'playing',
                        team: player.team ? QWHubService.qwToAscii(player.team).trim() : null,
                        frags: player.frags,
                        ping: player.ping
                    });
                }
            }

            // Spectators (name strings)
            for (const specName of (server.spectator_names || [])) {
                const name = QWHubService.qwToAscii(specName).trim().toLowerCase();
                if (name && name !== 'unnamed') {
                    map.set(name, { ...serverInfo, status: 'spectating' });
                }
            }

            // QTV viewers (name strings)
            for (const qtvName of (server.qtv_stream?.spectator_names || [])) {
                const name = QWHubService.qwToAscii(qtvName).trim().toLowerCase();
                if (name && name !== 'unnamed') {
                    map.set(name, { ...serverInfo, status: 'watching_qtv' });
                }
            }
        }

        _activePlayerMap = map;
        return map;
    }

    async function matchPlayerToServer(displayName) {
        const servers = await fetchActiveServers();
        const map = _buildActivePlayerMap(servers);

        // 1. Try exact match first (fast path)
        const normalized = displayName.trim().toLowerCase();
        if (map.has(normalized)) return map.get(normalized);

        // 2. Fuzzy match with fuse.js
        if (!_fuseInstance || _fuseInstance._mapSize !== map.size) {
            const entries = Array.from(map.entries()).map(([name, info]) => ({ name, ...info }));
            _fuseInstance = new Fuse(entries, {
                keys: ['name'],
                threshold: 0.3,     // strict-ish — 0.0 = exact, 1.0 = match anything
                includeScore: true
            });
            _fuseInstance._mapSize = map.size;
        }

        const results = _fuseInstance.search(normalized);
        if (results.length > 0 && results[0].score < 0.3) {
            return results[0].item;
        }

        return null; // not found
    }

    // Batch match: check multiple players at once (efficient for standin list)
    async function matchPlayers(displayNames) {
        const servers = await fetchActiveServers();
        const map = _buildActivePlayerMap(servers);
        const results = new Map();

        // Build fuse index once
        const entries = Array.from(map.entries()).map(([name, info]) => ({ name, ...info }));
        const fuse = new Fuse(entries, {
            keys: ['name'],
            threshold: 0.3,
            includeScore: true
        });

        for (const displayName of displayNames) {
            const normalized = displayName.trim().toLowerCase();

            // Exact match first
            if (map.has(normalized)) {
                results.set(displayName, map.get(normalized));
                continue;
            }

            // Fuzzy match
            const matches = fuse.search(normalized);
            if (matches.length > 0 && matches[0].score < 0.3) {
                results.set(displayName, matches[0].item);
            }
        }

        return results; // Map<displayName, serverInfo | undefined>
    }

    function invalidateCache() {
        _cache = null;
        _cacheTime = 0;
        _activePlayerMap = null;
    }

    return { fetchActiveServers, matchPlayerToServer, matchPlayers, invalidateCache };
})();
```

### 4b. PlayersPanel — Quake Icon Integration

```javascript
// In PlayersPanel._renderFilteredPlayers() — extend player row rendering

async function _renderFilteredPlayers(availableMap, divisionFilter) {
    // ... existing rendering from 16.0a ...

    // After rendering player rows, check online status
    const displayNames = Array.from(availableMap.values()).map(p => p.displayName);
    const onlineMap = await LiveServerService.matchPlayers(displayNames);

    // Add quake icon to matched players
    for (const [displayName, serverInfo] of onlineMap) {
        if (!serverInfo) continue;
        const playerRow = _findPlayerRowByName(displayName);
        if (!playerRow) continue;

        const icon = document.createElement('span');
        icon.className = `online-indicator online-${serverInfo.status}`;
        icon.title = `${serverInfo.status === 'playing' ? 'Playing' : serverInfo.status === 'spectating' ? 'Spectating' : 'Watching QTV'} on ${serverInfo.title}`;
        icon.dataset.address = serverInfo.address;
        icon.dataset.serverTitle = serverInfo.title;
        icon.dataset.status = serverInfo.status;
        playerRow.appendChild(icon);
    }
}
```

### 4c. Player Tooltip — Server Details + Copy IP

```javascript
// Enhanced tooltip when hovering a player with quake icon

function _showStandinTooltip(userId, playerData, serverInfo, event) {
    const slots = playerData.availableSlots.map(s => _formatSlotForDisplay(s));

    let serverHtml = '';
    if (serverInfo) {
        const statusLabel = {
            'playing': 'Playing',
            'spectating': 'Spectating',
            'watching_qtv': 'Watching QTV'
        }[serverInfo.status];

        serverHtml = `
            <div class="tooltip-divider"></div>
            <div class="tooltip-server">
                <span class="tooltip-server-status tooltip-${serverInfo.status}">${statusLabel}</span>
                <span class="tooltip-server-name">${escapeHtml(serverInfo.title)}</span>
                ${serverInfo.mode ? `<span class="tooltip-server-mode">${serverInfo.mode}</span>` : ''}
            </div>
            <div class="tooltip-server-address">
                <code>${escapeHtml(serverInfo.address)}</code>
                <button class="tooltip-copy-btn" data-copy="${escapeHtml(serverInfo.address)}" title="Copy server address">
                    📋
                </button>
            </div>
        `;
    }

    const html = `
        <div class="standin-tooltip">
            <div class="tooltip-name">${escapeHtml(playerData.displayName)}</div>
            <div class="tooltip-team">${escapeHtml(playerData.teamTag)} · ${escapeHtml(playerData.teamName)}</div>
            <div class="tooltip-slots">
                ${slots.map(s => `<span class="tooltip-slot-chip">${s}</span>`).join('')}
            </div>
            ${serverHtml}
        </div>
    `;

    // Attach copy handler
    tooltip.querySelector('.tooltip-copy-btn')?.addEventListener('click', (e) => {
        navigator.clipboard.writeText(e.target.dataset.copy);
        e.target.textContent = '✓';
        setTimeout(() => e.target.textContent = '📋', 1500);
    });
}
```

### 4d. CSS — Online Indicator + Tooltip Styling

```css
/* In src/css/input.css */

/* Quake icon for online players */
.online-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    margin-left: 0.25rem;
    background-image: url('/assets/quake-icon.svg'); /* small quake logo */
    background-size: contain;
    background-repeat: no-repeat;
    cursor: pointer;
    flex-shrink: 0;
}

/* Playing = bright, Spectating/QTV = dimmed */
.online-indicator.online-playing {
    opacity: 1;
}
.online-indicator.online-spectating,
.online-indicator.online-watching_qtv {
    opacity: 0.5;
}

/* Tooltip server section */
.tooltip-server {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
}
.tooltip-server-status {
    font-weight: 600;
}
.tooltip-server-status.tooltip-playing { color: var(--success); }
.tooltip-server-status.tooltip-spectating { color: var(--muted-foreground); }
.tooltip-server-status.tooltip-watching_qtv { color: var(--muted-foreground); }

.tooltip-server-address {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.25rem;
}
.tooltip-server-address code {
    font-size: 0.7rem;
    color: var(--muted-foreground);
    background: var(--muted);
    padding: 0.125rem 0.25rem;
    border-radius: 0.125rem;
}
.tooltip-copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.125rem;
    opacity: 0.7;
}
.tooltip-copy-btn:hover {
    opacity: 1;
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Check cached online status: If server data already fetched within 30s, instant lookup
- Fuzzy match batch: fuse.js matching ~300 names against ~50-100 server names is sub-millisecond

COLD PATHS (<2s):
- First server fetch: ~200-500ms (single HTTP GET, small JSON response)
- Combined with Find Standin: Server fetch runs in parallel with availability loading

BACKEND PERFORMANCE:
- No backend (external API only)
- hubapi.quakeworld.nu: No documented rate limits, response is typically <100KB
- 30s cache TTL prevents excessive requests
```

---

## 6. Data Flow Diagram

```
STANDIN SEARCH WITH LIVE STATUS:
Find Standin activated (from 16.0a)
→ AvailabilityService.loadAllTeamAvailability() + LiveServerService.fetchActiveServers()
  (both in parallel)
→ Availability loaded → Render filtered players
→ Server data loaded → LiveServerService.matchPlayers(displayNames)
  → For each player: qwToAscii() server names → fuse.js match against displayName
  → Returns Map<displayName, serverInfo>
→ Add quake icon to matched player rows
→ Done (both data sources merged in UI)

TOOLTIP ON QUAKE ICON:
Hover player with quake icon → _showStandinTooltip()
→ Show: available slots + server name + status + ip:port [copy]

COPY SERVER ADDRESS:
Click 📋 button in tooltip → navigator.clipboard.writeText(address)
→ Button changes to ✓ for 1.5s → User can /connect in QW client

CACHE REFRESH:
After 30s, next matchPlayers() call triggers fresh fetchActiveServers()
→ Updated online status on next render cycle
→ No auto-refresh — only refreshes when user interacts (re-runs Find Standin)
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] Quake icon appears next to players detected on active servers
- [ ] Icon is bright for playing, dimmed for spectating/QTV
- [ ] No icon for players not on any server
- [ ] Hover tooltip shows server name, status, mode
- [ ] Copy button copies ip:port to clipboard
- [ ] Copy button shows ✓ feedback after click

NAME MATCHING TESTS:
- [ ] Exact match: "ParadokS" on server matches "ParadokS" in our system
- [ ] Case insensitive: "paradoks" matches "ParadokS"
- [ ] QW encoding: qwToAscii("• ParadokS") matches "ParadokS"
- [ ] Fuzzy: "paradok" matches "ParadokS" (threshold 0.3)
- [ ] No false positive: "para" does NOT match "ParadokS" (too different)
- [ ] Spectator name matching works (plain strings, not objects)
- [ ] QTV spectator matching works
- [ ] Bot players (is_bot: true) excluded
- [ ] "unnamed" spectators excluded

CACHE TESTS:
- [ ] First fetch hits the API
- [ ] Second fetch within 30s returns cached data
- [ ] After 30s, fresh fetch triggered
- [ ] API failure returns stale cache gracefully
- [ ] No duplicate in-flight requests

INTEGRATION TESTS:
- [ ] Server fetch runs in parallel with availability loading (not sequential)
- [ ] Online status renders after server data arrives (even if availability was faster)
- [ ] Clearing standin filter also clears online indicators
- [ ] Running Find Standin again refreshes server status if cache expired

EDGE CASES:
- [ ] No active servers (empty API response) → no icons, no errors
- [ ] API unreachable → graceful degradation, standin search still works without icons
- [ ] Player on multiple servers (shouldn't happen but handle) → show first match
- [ ] Very long server name → truncate in tooltip
```

---

## 8. Common Integration Pitfalls

- [ ] **fuse.js loading**: Must load fuse.js before LiveServerService is used. If using CDN, ensure it's loaded on-demand (dynamic import) not blocking initial page load.
- [ ] **qwToAscii availability**: The function exists on QWHubService. Make sure it's accessible (public method, not private).
- [ ] **Name normalization consistency**: Both our player names and server names must go through the same normalization pipeline (trim, lowercase) before matching.
- [ ] **Threshold tuning**: fuse.js threshold 0.3 is a starting point. May need adjustment after real-world testing. Too low = misses valid matches, too high = false positives.
- [ ] **Clipboard API**: `navigator.clipboard.writeText()` requires HTTPS or localhost. Works in dev, works in production. May fail in some older browsers — add try/catch.
- [ ] **No auto-refresh**: The 30s cache does NOT poll. Server status is a snapshot when Find Standin is triggered. This is fine — if user needs fresh data, they run Find Standin again.
- [ ] **Quake icon asset**: Need a small quake logo SVG/PNG. Can use a simple unicode alternative (⚡ or similar) as placeholder until proper asset is available.

---

## 9. Implementation Notes

### Gotchas
- **Parallel loading**: When Find Standin fires, kick off both `loadAllTeamAvailability()` and `fetchActiveServers()` simultaneously with `Promise.all()`. Render availability results first (they're more important), then overlay online status when server data arrives.
- **fuse.js index rebuild**: The Fuse index is built from server data which changes every 30s. The `_mapSize` check in the code ensures the index is rebuilt only when data actually changes.
- **Display name mismatches**: Some players use different names on servers vs MatchScheduler. This is a known limitation. The alias resolution research in `qw-stats/` suggests community-curated alias lists as a future solution, but fuse.js handles the common cases (encoding differences, minor spelling variants).

### Future Expansion
```
// FUTURE: When full alias resolution is implemented (qw-stats research Phase 2),
// replace fuse.js matching with lookup against confirmed alias pairs:
//   matchPlayerToServer(userId) → check alias DB for all known names → match against server
//
// FUTURE: Auto-refresh toggle — poll every 30s while standin search is active
//   Adds complexity (managing interval, cleanup) — skip for MVP
//
// FUTURE: "Invite to game" deep link — if QW client supports connect:// URLs
```

### Dependencies
- **16.0a (Find Standin)**: Must be implemented first — this slice extends the filtered Players panel
- **fuse.js**: New external dependency (~6KB gzipped, zero sub-dependencies)
- **QWHubService.qwToAscii()**: Must be a public method (verify it's exported)
- **Quake icon asset**: Small SVG for the online indicator
- **No backend changes, no Firestore changes, no security rule changes**
