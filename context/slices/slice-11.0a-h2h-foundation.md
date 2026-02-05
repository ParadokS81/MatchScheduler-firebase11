# Slice 11.0a: H2H Foundation — Service, Team Selector & Direct Matchup Tab

## Slice Definition
- **Slice ID:** 11.0a
- **Name:** H2H Foundation — QWStatsService, Team Selector & Direct Matchup
- **Depends on:** Slice 5.2b (Match History Split-Panel — tab infrastructure, hover/click patterns)
- **User Story:** As a user, I can select two teams and see their direct head-to-head matchup history with scoreboard previews, so I can assess how teams have performed against each other before scheduling a match
- **Success Criteria:**
  - H2H tab replaces "coming soon" placeholder with working content
  - Team A auto-filled from currently viewed team
  - Team B selectable via dropdown (all MatchScheduler teams with teamTag)
  - Sub-tabs (H2H | Form | Maps) appear right-aligned on the tab bar row when H2H tab is active
  - H2H sub-tab shows split-panel: results left (~40%), roster/activity right (~60%)
  - Hover result → right panel shows scoreboard (reuses Match History hover pattern)
  - Click result → right panel shows full stats (reuses Match History click pattern)
  - Default right panel shows roster activity for both teams
  - Period selector (1M | 3M | 6M) with 3M default
  - Map filter dropdown (derived from results, H2H sub-tab only)
  - QWStatsService handles all API calls with caching
  - Form and Maps sub-tabs show placeholder content (implemented in 11.0b/11.0c)

## Problem Statement

The H2H tab is currently a placeholder. Users need to compare two teams' competitive history before scheduling matches. The QW Stats API has 18k+ games over 4 years — far richer data than the QWHub Supabase API used by Match History.

This slice establishes the foundation: a new service for the QW Stats API, the team selector UI, the sub-tab system, and the first functional sub-tab (H2H direct matchups).

## Solution

Build on the existing tab infrastructure and reuse the split-panel hover/click pattern from Match History (5.2b). The key additions are:

1. **QWStatsService** — New service for the QW Stats API (`qw-api.poker-affiliate.org`)
2. **Team selector** — Team A (current team) + Team B (dropdown)
3. **Inline sub-tabs** — Right-aligned on the same row as main tabs (avoids 3-layer menu stacking)
4. **H2H direct matchup** — Split-panel with results list + roster/scoreboard

---

## Visual Design

### Tab Bar — H2H Active (clustered group with accent background)

When "Head to Head" is clicked, it expands into a visually grouped cluster with an accent
background wrapping all three sub-sections. This avoids 3-layer menu stacking and makes it
clear that H2H, Form, and Maps are sub-sections of the same feature.

```
┌─────────────────────────────────────────────────────────────────┐
│  Details   Match History   ┌─ accent bg ──────────────────────┐ │
│                            │ Head to Head   Form   Maps       │ │
│                            └──────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  [Team A logo] Team A Name   VS   [Team B ▼ dropdown]           │
│                              1M  [3M]  6M     [All Maps ▼]     │
├────────────────────────┬────────────────────────────────────────┤
│ Results list           │ Roster / Activity                       │
│                        │                                        │
└────────────────────────┴────────────────────────────────────────┘
```

### H2H Sub-Tab — Default (roster/activity)

```
┌────────────────────────┬────────────────────────────────────────┐
│                        │  TEAM A ROSTER        TEAM B ROSTER     │
│  Jan 15  dm2  W        │  ─────────────        ─────────────     │
│  230 - 198             │  player1  32g 68%     playerA  28g 61%  │
│                        │  player2  30g 60%     playerB  25g 56%  │
│  Jan 10  dm3  L        │  player3  28g 64%     playerC  22g 52%  │
│  156 - 210             │  player4  18g 55%     playerD  20g 50%  │
│                        │                                        │
│  Dec 28  e1m2  W       │  Last played: Jan 15                   │
│  280 - 245             │  Record: 5W 3L (62%)                   │
│                        │                                        │
│  (no more results)     │                                        │
│                        │                                        │
└────────────────────────┴────────────────────────────────────────┘
```

### H2H Sub-Tab — Hover Preview

```
┌────────────────────────┬────────────────────────────────────────┐
│                        │  ┌────────────────────────────────┐    │
│  Jan 15  dm2  W        │  │       SCOREBOARD               │    │
│  230 - 198             │  │     (dm2 mapshot bg)            │    │
│──────────────────────  │  │                                │    │
│  Jan 10  dm3  L    ◄   │  │  book 156   vs   oeks 210     │    │
│  156 - 210             │  │  player rows...                │    │
│──────────────────────  │  │                                │    │
│  Dec 28  e1m2  W       │  └────────────────────────────────┘    │
│  280 - 245             │                                        │
│                        │                                        │
└────────────────────────┴────────────────────────────────────────┘
```

### H2H Sub-Tab — No Team B Selected

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                Select an opponent to compare                    │
│                        [Team B ▼]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### H2H Sub-Tab — No Matchups Found

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│        No direct matchups found between Book and oeks           │
│              Try extending the period, or check Form tab        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### H2H Sub-Tab — No Team Tag

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Head to head not available                                     │
│  Team leader can configure QW Hub tag in Team Settings          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Changes

### New Service: QWStatsService

**File:** `public/js/services/QWStatsService.js`

This service wraps all QW Stats API calls with caching. It's separate from QWHubService because:
- Different API (PostgreSQL-backed vs Supabase)
- Different data shapes
- Different cache strategies (QW Stats data updates weekly, not real-time)

```javascript
const QWStatsService = (function() {
    const API_BASE = 'https://qw-api.poker-affiliate.org';
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const _cache = new Map();

    function _cacheKey(...parts) {
        return parts.filter(Boolean).join('_');
    }

    function _getCached(key) {
        const entry = _cache.get(key);
        if (entry && Date.now() - entry.time < CACHE_TTL) {
            return entry.data;
        }
        return null;
    }

    function _setCache(key, data) {
        _cache.set(key, { data, time: Date.now() });
    }

    /**
     * Direct matchup results between two teams.
     * @param {string} teamA - Team tag (will be lowercased)
     * @param {string} teamB - Team tag (will be lowercased)
     * @param {object} opts - { map, months, limit }
     * @returns {Promise<{ teamA, teamB, games: Array, total: number }>}
     */
    async function getH2H(teamA, teamB, opts = {}) {
        const a = teamA.toLowerCase();
        const b = teamB.toLowerCase();
        const months = opts.months || 3;
        const limit = opts.limit || 10;
        const map = opts.map || '';

        const key = _cacheKey('h2h', ...[a, b].sort(), map, months, limit);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ teamA: a, teamB: b, months, limit });
        if (map) params.set('map', map);

        const res = await fetch(`${API_BASE}/api/h2h?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /**
     * Recent results for one team against everyone.
     * @param {string} team - Team tag (will be lowercased)
     * @param {object} opts - { map, months, limit }
     * @returns {Promise<{ team, games: Array, total: number }>}
     */
    async function getForm(team, opts = {}) {
        const t = team.toLowerCase();
        const months = opts.months || 3;
        const limit = opts.limit || 10;
        const map = opts.map || '';

        const key = _cacheKey('form', t, map, months, limit);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ team: t, months, limit });
        if (map) params.set('map', map);

        const res = await fetch(`${API_BASE}/api/form?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /**
     * Map strength analysis for one or two teams.
     * @param {string} team - Team tag (will be lowercased)
     * @param {object} opts - { vsTeam, months }
     * @returns {Promise<{ team, maps: Array, totalGames: number }>}
     */
    async function getMaps(team, opts = {}) {
        const t = team.toLowerCase();
        const months = opts.months || 6;
        const vsTeam = opts.vsTeam ? opts.vsTeam.toLowerCase() : '';

        const key = _cacheKey('maps', t, vsTeam, months);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ team: t, months });
        if (vsTeam) params.set('vsTeam', vsTeam);

        const res = await fetch(`${API_BASE}/api/maps?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /**
     * Roster activity and participation for a team.
     * @param {string} team - Team tag (will be lowercased)
     * @param {object} opts - { months }
     * @returns {Promise<{ team, players: Array, totalPlayers: number }>}
     */
    async function getRoster(team, opts = {}) {
        const t = team.toLowerCase();
        const months = opts.months || 3;

        const key = _cacheKey('roster', t, months);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ team: t, months });

        const res = await fetch(`${API_BASE}/api/roster?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /** Clear all cached data */
    function clearCache() {
        _cache.clear();
    }

    return {
        getH2H,
        getForm,
        getMaps,
        getRoster,
        clearCache
    };
})();
```

### Component Changes: TeamsBrowserPanel

**New private state:**
```javascript
// Slice 11.0a: H2H state
let _h2hOpponentId = null;        // Selected Team B id (from MatchScheduler teams)
let _h2hSubTab = 'h2h';           // Active sub-tab: 'h2h' | 'form' | 'maps'
let _h2hPeriod = 3;               // Period in months: 1, 3, or 6
let _h2hMapFilter = '';            // '' = all maps (H2H sub-tab only)
let _h2hResults = null;            // API response from /api/h2h
let _h2hRosterA = null;            // API response from /api/roster for Team A
let _h2hRosterB = null;            // API response from /api/roster for Team B
let _h2hLoading = false;           // Loading state for H2H data fetch
let _h2hHoveredId = null;          // Hovered result row (for scoreboard preview)
let _h2hSelectedId = null;         // Clicked/sticky result row
let _h2hSelectedStats = null;      // ktxstats for selected result
let _h2hStatsLoading = false;      // Loading ktxstats
let _h2hDataById = new Map();      // Result objects by ID for hover/click lookup
```

**New methods:**

- `_renderH2HTab(team)` — Main H2H tab renderer with team selector header
- `_renderH2HSubTabs()` — Returns sub-tab HTML for right-alignment in tab bar
- `_renderTeamSelector(team)` — Team A (fixed) + Team B (dropdown) + period + map filter
- `_renderH2HSubTabContent()` — Dispatches to h2h/form/maps renderers
- `_renderH2HDirectTab()` — Split-panel for direct matchups
- `_renderH2HResultList(games)` — Left panel: result rows
- `_renderH2HRosterPanel()` — Right panel default: roster/activity for both teams
- `_renderH2HSummaryBar(results)` — Record summary (e.g., "5W 3L — 62%")
- `_loadH2HData()` — Fetches H2H results + rosters, populates state
- `_resetH2HState()` — Clears all H2H state (called on team switch)

**Reused methods from Match History (5.2b):**

- `_renderScoreboard(match)` — Scoreboard with mapshot background (hover preview)
- `_renderStatsView(match, ktxstats)` — Unified stats-on-map view (click selection)
- `_renderStatsTable(ktxstats, match)` — Per-player stats table with tabs

**Modified methods:**

- `_renderTabBar()` — When `_activeTab === 'h2h'`, append sub-tabs right-aligned
- `switchTab(tabName)` — Reset H2H state when switching away from H2H
- `_renderTeamsView()` — Route `case 'h2h'` to `_renderH2HTab(team)`
- `_renderCurrentView()` — When H2H tab active + team selected, trigger lazy-load

**New public methods (for onclick handlers):**

- `selectOpponent(teamId)` — Team B dropdown change handler
- `switchH2HSubTab(subTab)` — Sub-tab click handler
- `changeH2HPeriod(months)` — Period button click handler
- `filterH2HByMap(map)` — Map filter change handler
- `previewH2HResult(resultId)` — Hover handler (reuses hover pattern)
- `clearH2HPreview()` — Mouse leave handler
- `selectH2HResult(resultId)` — Click handler (reuses click pattern)

---

## Implementation Details

### Tab Bar with Clustered H2H Group

When H2H is active, the "Head to Head" tab expands into a cluster of 3 items (Head to Head,
Form, Maps) with an accent background grouping them visually. This replaces the separate
sub-tab row and eliminates 3-layer menu stacking.

```javascript
function _renderTabBar() {
    const isH2H = _activeTab === 'h2h';

    const h2hSubTabs = [
        { id: 'h2h', label: 'Head to Head' },
        { id: 'form', label: 'Form' },
        { id: 'maps', label: 'Maps' }
    ];

    return `
        <div class="team-detail-tabs">
            <button class="team-detail-tab ${_activeTab === 'details' ? 'active' : ''}"
                    data-tab="details">
                Details
            </button>
            <button class="team-detail-tab ${_activeTab === 'history' ? 'active' : ''}"
                    data-tab="history">
                Match History
            </button>
            ${isH2H ? `
                <div class="h2h-tab-cluster">
                    ${h2hSubTabs.map(st => `
                        <button class="h2h-cluster-tab ${_h2hSubTab === st.id ? 'active' : ''}"
                                onclick="TeamsBrowserPanel.switchH2HSubTab('${st.id}')">
                            ${st.label}
                        </button>
                    `).join('')}
                </div>
            ` : `
                <button class="team-detail-tab" data-tab="h2h">
                    Head to Head
                </button>
            `}
        </div>
    `;
}
```

### Team Selector Header

```javascript
function _renderTeamSelector(teamA) {
    const allTeams = _allTeams
        .filter(t => t.id !== teamA.id && t.teamTag)
        .sort((a, b) => a.teamName.localeCompare(b.teamName));

    const teamB = _h2hOpponentId
        ? _allTeams.find(t => t.id === _h2hOpponentId)
        : null;

    const periods = [1, 3, 6];

    return `
        <div class="h2h-header">
            <div class="h2h-teams-row">
                <div class="h2h-team h2h-team-a">
                    ${teamA.activeLogo?.urls?.small
                        ? `<img src="${teamA.activeLogo.urls.small}" class="h2h-team-logo" alt="">`
                        : ''}
                    <span class="h2h-team-name">${_escapeHtml(teamA.teamName)}</span>
                </div>
                <span class="h2h-vs">VS</span>
                <div class="h2h-team h2h-team-b">
                    <select class="h2h-opponent-select" onchange="TeamsBrowserPanel.selectOpponent(this.value)">
                        <option value="">Select opponent...</option>
                        ${allTeams.map(t => `
                            <option value="${t.id}" ${t.id === _h2hOpponentId ? 'selected' : ''}>
                                ${_escapeHtml(t.teamName)} (${_escapeHtml(t.teamTag)})
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
            <div class="h2h-controls-row">
                <div class="h2h-period-buttons">
                    ${periods.map(m => `
                        <button class="h2h-period-btn ${_h2hPeriod === m ? 'active' : ''}"
                                onclick="TeamsBrowserPanel.changeH2HPeriod(${m})">
                            ${m}M
                        </button>
                    `).join('')}
                </div>
                ${_h2hSubTab === 'h2h' ? `
                    <select class="mh-filter-select" onchange="TeamsBrowserPanel.filterH2HByMap(this.value)">
                        <option value="">All Maps</option>
                        ${_getH2HMapOptions().map(map => `
                            <option value="${map}" ${_h2hMapFilter === map ? 'selected' : ''}>
                                ${map}
                            </option>
                        `).join('')}
                    </select>
                ` : ''}
            </div>
        </div>
    `;
}
```

### H2H Direct Tab (Split Panel)

```javascript
function _renderH2HDirectTab() {
    if (!_h2hOpponentId) {
        return `
            <div class="h2h-empty-state">
                <p class="text-sm text-muted-foreground">Select an opponent to compare</p>
            </div>
        `;
    }

    if (_h2hLoading) {
        return `
            <div class="h2h-split">
                <div class="mh-list-panel">
                    <div class="h2h-skeleton">Loading results...</div>
                </div>
                <div class="mh-preview-panel">
                    <div class="h2h-skeleton">Loading roster...</div>
                </div>
            </div>
        `;
    }

    const games = _getFilteredH2HResults();

    if (!_h2hResults || games.length === 0) {
        const teamA = _allTeams.find(t => t.id === _selectedTeamId);
        const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
        return `
            <div class="h2h-empty-state">
                <p class="text-sm text-muted-foreground">
                    No direct matchups found between ${_escapeHtml(teamA?.teamName || '?')}
                    and ${_escapeHtml(teamB?.teamName || '?')}
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                    Try extending the period, or check the Form tab
                </p>
            </div>
        `;
    }

    return `
        <div class="h2h-split">
            <div class="mh-list-panel">
                ${_renderH2HSummaryBar(games)}
                <div class="mh-match-list" id="h2h-result-list">
                    ${_renderH2HResultList(games)}
                </div>
            </div>
            <div class="mh-preview-panel" id="h2h-preview-panel">
                ${_h2hSelectedId
                    ? _renderH2HPreviewPanel(_h2hSelectedId)
                    : _h2hHoveredId
                        ? _renderH2HPreviewPanel(_h2hHoveredId)
                        : _renderH2HRosterPanel()
                }
            </div>
        </div>
    `;
}
```

### Roster / Activity Panel (Right Panel Default)

```javascript
function _renderH2HRosterPanel() {
    const hasRosterA = _h2hRosterA && _h2hRosterA.players?.length > 0;
    const hasRosterB = _h2hRosterB && _h2hRosterB.players?.length > 0;

    if (!hasRosterA && !hasRosterB) {
        return `
            <div class="mh-preview-empty">
                <p class="text-xs text-muted-foreground">Hover a result to preview scoreboard</p>
            </div>
        `;
    }

    return `
        <div class="h2h-roster-panel">
            <div class="h2h-roster-columns">
                ${hasRosterA ? _renderRosterColumn(_h2hRosterA, 'Team A') : ''}
                ${hasRosterB ? _renderRosterColumn(_h2hRosterB, 'Team B') : ''}
            </div>
        </div>
    `;
}

function _renderRosterColumn(rosterData, label) {
    const teamA = _allTeams.find(t => t.id === _selectedTeamId);
    const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
    const teamName = label === 'Team A'
        ? (teamA?.teamTag || rosterData.team)
        : (teamB?.teamTag || rosterData.team);

    return `
        <div class="h2h-roster-col">
            <div class="h2h-roster-header">${_escapeHtml(teamName)}</div>
            <div class="h2h-roster-list">
                ${rosterData.players.slice(0, 8).map((p, i) => `
                    <div class="h2h-roster-row ${i < 4 ? 'h2h-roster-core' : ''}">
                        <span class="h2h-roster-name">${_escapeHtml(p.player)}</span>
                        <span class="h2h-roster-stat">${p.games}g</span>
                        <span class="h2h-roster-stat">${Math.round(p.winRate)}%</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}
```

### H2H Summary Bar

```javascript
function _renderH2HSummaryBar(games) {
    const wins = games.filter(g => g.result === 'W').length;
    const losses = games.filter(g => g.result === 'L').length;
    const draws = games.filter(g => g.result === 'D').length;
    const total = games.length;
    const winRate = total > 0 ? Math.round(wins / total * 100) : 0;

    return `
        <div class="h2h-summary-bar">
            <span class="h2h-record">
                <span class="mh-result-win">${wins}W</span>
                ${draws > 0 ? `<span class="mh-result-draw">${draws}D</span>` : ''}
                <span class="mh-result-loss">${losses}L</span>
            </span>
            <span class="text-xs text-muted-foreground">${winRate}% from Team A perspective</span>
        </div>
    `;
}
```

### Data Loading

```javascript
async function _loadH2HData() {
    const teamA = _allTeams.find(t => t.id === _selectedTeamId);
    const teamB = _allTeams.find(t => t.id === _h2hOpponentId);

    if (!teamA?.teamTag || !teamB?.teamTag) return;

    _h2hLoading = true;
    _h2hResults = null;
    _h2hRosterA = null;
    _h2hRosterB = null;
    _h2hHoveredId = null;
    _h2hSelectedId = null;
    _h2hSelectedStats = null;
    _h2hDataById.clear();
    _renderCurrentView();

    try {
        // Fetch H2H results + both rosters in parallel
        const [h2hData, rosterA, rosterB] = await Promise.all([
            QWStatsService.getH2H(teamA.teamTag, teamB.teamTag, {
                months: _h2hPeriod,
                limit: 10
            }),
            QWStatsService.getRoster(teamA.teamTag, { months: _h2hPeriod }),
            QWStatsService.getRoster(teamB.teamTag, { months: _h2hPeriod })
        ]);

        // Guard: still viewing same teams?
        if (_selectedTeamId !== teamA.id || _h2hOpponentId !== teamB.id) return;

        _h2hResults = h2hData;
        _h2hRosterA = rosterA;
        _h2hRosterB = rosterB;

        // Populate lookup map for hover/click
        if (h2hData.games) {
            h2hData.games.forEach(g => {
                _h2hDataById.set(String(g.id), g);
            });
        }
    } catch (error) {
        console.error('Failed to load H2H data:', error);
        _h2hResults = { error: true };
    } finally {
        _h2hLoading = false;
        _renderCurrentView();
    }
}
```

### Hover / Click Handlers (Reuse Pattern from 5.2b)

```javascript
function previewH2HResult(resultId) {
    if (_h2hSelectedId) return; // Don't override sticky
    _h2hHoveredId = String(resultId);
    const panel = document.getElementById('h2h-preview-panel');
    if (panel) {
        panel.innerHTML = _renderH2HPreviewPanel(resultId);
    }
}

function clearH2HPreview() {
    _h2hHoveredId = null;
    if (!_h2hSelectedId) {
        const panel = document.getElementById('h2h-preview-panel');
        if (panel) {
            panel.innerHTML = _renderH2HRosterPanel();
        }
    }
}

async function selectH2HResult(resultId) {
    const id = String(resultId);

    // Toggle off
    if (_h2hSelectedId === id) {
        _h2hSelectedId = null;
        _h2hSelectedStats = null;
        const panel = document.getElementById('h2h-preview-panel');
        if (panel) panel.innerHTML = _renderH2HRosterPanel();
        _updateH2HHighlights();
        return;
    }

    _h2hSelectedId = id;
    _h2hSelectedStats = null;
    _h2hStatsLoading = true;
    _updateH2HHighlights();

    // Render scoreboard immediately from API data
    const panel = document.getElementById('h2h-preview-panel');
    if (panel) panel.innerHTML = _renderH2HPreviewPanel(id);

    // Fetch ktxstats for detailed stats (cold path)
    const game = _h2hDataById.get(id);
    if (game?.demoSha256) {
        try {
            const demoHash = game.demoSha256;
            const stats = await QWHubService.getGameStats(demoHash);
            if (_h2hSelectedId === id) { // Guard
                _h2hSelectedStats = stats;
                _h2hStatsLoading = false;
                if (panel) panel.innerHTML = _renderH2HPreviewPanel(id);
            }
        } catch (error) {
            console.error('Failed to load game stats:', error);
            _h2hStatsLoading = false;
            if (_h2hSelectedId === id && panel) {
                panel.innerHTML = _renderH2HPreviewPanel(id);
            }
        }
    } else {
        _h2hStatsLoading = false;
    }
}
```

### Preview Panel Renderer

```javascript
function _renderH2HPreviewPanel(resultId) {
    const game = _h2hDataById.get(String(resultId));
    if (!game) return '';

    // Transform QW Stats API game to match the format expected by
    // existing _renderScoreboard / _renderStatsView methods.
    // The QW Stats API returns: { id, playedAt, map, teamAFrags, teamBFrags, result, demoSha256 }
    // Match History uses: { id, map, ourScore, opponentScore, ourTag, opponentTag, result, demoHash, teams, players }
    //
    // For H2H, we only have basic game data from the API (no players array).
    // Scoreboard preview requires fetching ktxstats.
    // So: on hover, show a simplified scoreboard (scores only, no player rows).
    // On click, fetch ktxstats and show full stats view.

    const isSticky = _h2hSelectedId === String(resultId);

    if (isSticky && _h2hSelectedStats) {
        // Full stats view (reuse Match History pattern)
        return _renderStatsView(_transformH2HGameForScoreboard(game), _h2hSelectedStats);
    }

    if (isSticky && _h2hStatsLoading) {
        return `
            ${_renderH2HSimpleScoreboard(game)}
            <div class="mh-stats-bar text-xs text-muted-foreground p-2">Loading detailed stats...</div>
        `;
    }

    // Hover or sticky without stats yet — show simple scoreboard
    return _renderH2HSimpleScoreboard(game);
}

function _renderH2HSimpleScoreboard(game) {
    const mapImg = `https://a.quake.world/mapshots/webp/lg/${game.map}.webp`;
    const dateStr = new Date(game.playedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const resultClass = game.result === 'W' ? 'mh-result-win'
                      : game.result === 'L' ? 'mh-result-loss'
                      : 'mh-result-draw';

    const teamA = _h2hResults?.teamA || '';
    const teamB = _h2hResults?.teamB || '';

    return `
        <div class="h2h-scoreboard" style="background-image: url('${mapImg}')">
            <div class="h2h-scoreboard-overlay">
                <div class="h2h-scoreboard-date">${dateStr} — ${game.map}</div>
                <div class="h2h-scoreboard-score">
                    <span class="h2h-scoreboard-tag">${_escapeHtml(teamA)}</span>
                    <span class="h2h-scoreboard-frags ${resultClass}">${game.teamAFrags}</span>
                    <span class="h2h-scoreboard-separator">-</span>
                    <span class="h2h-scoreboard-frags">${game.teamBFrags}</span>
                    <span class="h2h-scoreboard-tag">${_escapeHtml(teamB)}</span>
                </div>
            </div>
        </div>
    `;
}
```

### Reset on Team Switch

```javascript
function _resetH2HState() {
    _h2hOpponentId = null;
    _h2hSubTab = 'h2h';
    _h2hPeriod = 3;
    _h2hMapFilter = '';
    _h2hResults = null;
    _h2hRosterA = null;
    _h2hRosterB = null;
    _h2hLoading = false;
    _h2hHoveredId = null;
    _h2hSelectedId = null;
    _h2hSelectedStats = null;
    _h2hStatsLoading = false;
    _h2hDataById.clear();
}
```

---

## CSS Additions

Add to `src/css/input.css`:

```css
/* ============================================
   Slice 11.0a: H2H Foundation
   ============================================ */

/* H2H clustered tab group — accent background wrapping Head to Head + Form + Maps */
.h2h-tab-cluster {
    display: flex;
    gap: 0;
    background: hsl(var(--primary-hsl) / 0.08);
    border-radius: 0.375rem;
    padding: 0.125rem;
    margin-left: auto; /* push cluster to fill remaining space naturally */
}

.h2h-cluster-tab {
    font-size: 0.75rem;
    padding: 0.25rem 0.625rem;
    border-radius: 0.25rem;
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
}

.h2h-cluster-tab:hover {
    color: var(--foreground);
    background: hsl(var(--primary-hsl) / 0.12);
}

.h2h-cluster-tab.active {
    color: var(--foreground);
    background: hsl(var(--primary-hsl) / 0.2);
    font-weight: 600;
}

/* Team selector header */
.h2h-header {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.h2h-teams-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    justify-content: center;
}

.h2h-team {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.h2h-team-logo {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: contain;
}

.h2h-team-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--foreground);
}

.h2h-vs {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--muted-foreground);
    letter-spacing: 0.05em;
}

.h2h-opponent-select {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    color: var(--foreground);
    cursor: pointer;
    max-width: 12rem;
}

.h2h-controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.375rem;
}

/* Period buttons (segmented) */
.h2h-period-buttons {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    overflow: hidden;
}

.h2h-period-btn {
    font-size: 0.625rem;
    padding: 0.125rem 0.5rem;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
}

.h2h-period-btn:last-child {
    border-right: none;
}

.h2h-period-btn:hover {
    background: var(--muted);
    color: var(--foreground);
}

.h2h-period-btn.active {
    background: hsl(var(--primary-hsl) / 0.2);
    color: var(--primary);
    font-weight: 600;
}

/* H2H split panel (reuses mh-list-panel / mh-preview-panel) */
.h2h-split {
    display: flex;
    height: 100%;
    gap: 0;
}

/* Summary bar */
.h2h-summary-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.h2h-record {
    display: flex;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
}

/* Roster panel */
.h2h-roster-panel {
    padding: 0.5rem;
    overflow-y: auto;
}

.h2h-roster-columns {
    display: flex;
    gap: 0.75rem;
}

.h2h-roster-col {
    flex: 1;
    min-width: 0;
}

.h2h-roster-header {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--foreground);
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0.25rem;
}

.h2h-roster-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0;
    font-size: 0.6875rem;
}

.h2h-roster-core {
    color: var(--foreground);
}

.h2h-roster-row:not(.h2h-roster-core) {
    color: var(--muted-foreground);
}

.h2h-roster-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.h2h-roster-stat {
    font-size: 0.625rem;
    flex-shrink: 0;
}

/* Simple scoreboard (H2H hover preview without player rows) */
.h2h-scoreboard {
    background-size: cover;
    background-position: center;
    position: relative;
    min-height: 8rem;
    display: flex;
    align-items: center;
    justify-content: center;
}

.h2h-scoreboard-overlay {
    background: rgba(0, 0, 0, 0.7);
    padding: 1rem 1.5rem;
    border-radius: 0.375rem;
    text-align: center;
}

.h2h-scoreboard-date {
    font-size: 0.6875rem;
    color: var(--muted-foreground);
    margin-bottom: 0.375rem;
}

.h2h-scoreboard-score {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.125rem;
    font-weight: 700;
}

.h2h-scoreboard-tag {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    font-weight: 600;
}

.h2h-scoreboard-frags {
    color: var(--foreground);
}

.h2h-scoreboard-separator {
    color: var(--muted-foreground);
}

/* Empty / loading states */
.h2h-empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
}

.h2h-skeleton {
    padding: 1rem;
    color: var(--muted-foreground);
    font-size: 0.75rem;
}

/* Remove padding when split panel inside tab content */
.team-detail-tab-content:has(.h2h-split) {
    padding: 0;
}
```

---

## Integration Points

### Loading QWStatsService

Add `<script src="/js/services/QWStatsService.js"></script>` in `public/index.html`, after QWHubService and before TeamsBrowserPanel.

### Scoreboard Reuse

The H2H hover/click preview needs to render scoreboards. Two approaches:

1. **Simple scoreboard** (hover, no player data): `_renderH2HSimpleScoreboard()` — shows team names, frags, map, date. This is new and H2H-specific since the QW Stats API `/api/h2h` endpoint only returns aggregate scores, not per-player data.

2. **Full stats view** (click, with ktxstats): Reuse `_renderStatsView()` and `_renderStatsTable()` from Match History. Requires transforming the H2H game object to match the format expected by these functions.

### Transform Function

```javascript
function _transformH2HGameForScoreboard(game) {
    // Transform QW Stats API game → Match History format for scoreboard reuse
    return {
        id: game.id,
        map: game.map,
        date: new Date(game.playedAt),
        ourTag: _h2hResults?.teamA || '',
        opponentTag: _h2hResults?.teamB || '',
        ourScore: game.teamAFrags,
        opponentScore: game.teamBFrags,
        result: game.result,
        demoHash: game.demoSha256
    };
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Sub-tab switching: Client-side state change + re-render
- Period button click: State change (triggers cold path fetch)
- Map filter change: Client-side filter on cached results
- Hover preview: Scoreboard rendered from cached API data (no API call)

COLD PATHS (<2s):
- Team B selection: Triggers _loadH2HData() — 3 parallel API calls (~500-1000ms)
- Period change: Re-fetches H2H + rosters with new period
- ktxstats fetch on click: ~300-500ms, cached indefinitely
- First H2H tab load: Lazy-loaded on tab click

BACKEND PERFORMANCE:
- QW Stats API: PostgreSQL queries with indexes, <200ms per call
- Parallel fetch: h2h + rosterA + rosterB = wall-clock time of slowest
- ktxstats: CDN-hosted, no rate limits, cached indefinitely
```

---

## Data Flow

```
User clicks "Head to Head" tab
    → _activeTab = 'h2h'
    → _renderTabBar() includes sub-tabs right-aligned
    → _renderH2HTab(team)
        → No Team B selected → shows "Select an opponent" state

User selects Team B from dropdown
    → selectOpponent(teamId)
    → _h2hOpponentId = teamId
    → _loadH2HData()
        → QWStatsService.getH2H(teamA.tag, teamB.tag, { months: 3 })
        → QWStatsService.getRoster(teamA.tag, { months: 3 })
        → QWStatsService.getRoster(teamB.tag, { months: 3 })
        → All three fetched in parallel
    → Guard: still same teams?
    → Populate _h2hResults, _h2hRosterA, _h2hRosterB, _h2hDataById
    → _renderCurrentView()
        → Split panel: result list left, roster/activity right

User hovers a result row
    → previewH2HResult(resultId)
        → _h2hHoveredId = resultId
        → _renderH2HSimpleScoreboard(game) into right panel

User clicks a result row
    → selectH2HResult(resultId)
        → _h2hSelectedId = resultId
        → Render simple scoreboard immediately
        → Fetch ktxstats async (demoSha256)
        → Guard: still same selection?
        → _renderStatsView() with full player data

User changes period (1M → 6M)
    → changeH2HPeriod(6)
        → _h2hPeriod = 6
        → _loadH2HData() (re-fetches with new period)

User changes map filter
    → filterH2HByMap('dm2')
        → _h2hMapFilter = 'dm2'
        → Client-side filter on _h2hResults.games
        → Re-render result list (left panel only)
```

---

## Test Scenarios

- [ ] H2H tab replaces "coming soon" with team selector
- [ ] Sub-tabs (H2H | Form | Maps) appear right-aligned when H2H tab is active
- [ ] Sub-tabs disappear when switching to Details or Match History tabs
- [ ] Team A shows current team name + logo
- [ ] Team B dropdown lists only teams with teamTag
- [ ] Selecting Team B triggers data fetch (3 parallel API calls)
- [ ] Loading state shows while fetching
- [ ] H2H results display in left panel with date, map, score, result
- [ ] Summary bar shows record (e.g., "5W 3L — 62%")
- [ ] Right panel shows roster/activity by default (both teams side by side)
- [ ] Core 4-5 players highlighted in roster
- [ ] Hovering a result shows simple scoreboard with mapshot in right panel
- [ ] Mouse leave returns to roster panel (when no selection)
- [ ] Clicking a result sticks scoreboard, fetches ktxstats
- [ ] Full stats view shows after ktxstats loads (reuses Match History stats)
- [ ] Clicking same result again un-sticks (returns to roster)
- [ ] Period buttons (1M | 3M | 6M) work, 3M is default
- [ ] Changing period re-fetches data
- [ ] Map filter dropdown appears only on H2H sub-tab
- [ ] Map filter options derived from results
- [ ] "No matchups found" message when no results
- [ ] "Select an opponent" shown when no Team B
- [ ] "Not available" shown when team has no teamTag
- [ ] Switching teams resets all H2H state
- [ ] Race condition: switching teams during fetch doesn't render stale data
- [ ] Race condition: clicking different result during ktxstats fetch shows correct stats
- [ ] Form and Maps sub-tabs show placeholder content

## Common Integration Pitfalls

- [ ] Team tags must be lowercased before API calls (`teamTag.toLowerCase()`)
- [ ] QW Stats API returns `demoSha256`, not `demoHash` — field name difference from QWHub
- [ ] H2H results use `teamAFrags`/`teamBFrags`, not `ourScore`/`opponentScore` — transform needed for scoreboard reuse
- [ ] Hover must NOT override sticky selection — check `_h2hSelectedId` first
- [ ] Three parallel fetches need a guard: verify teams haven't changed when responses arrive
- [ ] ktxstats player team names are QW-encoded — use `QWHubService.qwToAscii()` for comparison
- [ ] Expose all handler methods (selectOpponent, switchH2HSubTab, etc.) in the public return object
- [ ] Tab bar CSS change affects all tabs — test Details and Match History still look correct
- [ ] QWStatsService script must load before TeamsBrowserPanel in index.html

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/js/services/QWStatsService.js` | **Create** | New service for QW Stats API |
| `public/js/components/TeamsBrowserPanel.js` | Modify | H2H tab content, sub-tabs, team selector, handlers |
| `src/css/input.css` | Modify | H2H styles (sub-tabs, header, roster, scoreboard, states) |
| `public/index.html` | Modify | Add QWStatsService script tag |

## Quality Checklist

- [ ] QWStatsService uses revealing module pattern (matches project style)
- [ ] All API calls cache results with 5-min TTL
- [ ] Cache key includes sorted team pair (so teamA=book&teamB=oeks === teamA=oeks&teamB=book)
- [ ] Tab bar layout uses flexbox space-between (main tabs left, sub-tabs right)
- [ ] Split panel fills available height
- [ ] CSS uses rem units throughout (except borders)
- [ ] No Firebase listeners needed (QW Stats data is read-only, not real-time)
- [ ] All public methods exposed for onclick handlers in HTML
- [ ] Loading/empty/error states all handled
- [ ] State fully reset when switching teams
