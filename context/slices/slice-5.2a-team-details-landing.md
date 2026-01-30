# Slice 5.2a: Team Details Landing Page

## Slice Definition
- **Slice ID:** 5.2a
- **Name:** Team Details Landing Page with Tabbed Navigation
- **Depends on:** Slice 5.1b (Team Detail View + Match History)
- **User Story:** As a user browsing teams, I can see a rich details page with large logo, roster, and auto-generated map stats so I can quickly assess a team's identity and recent activity
- **Success Criteria:**
  - Team detail view has tabbed sub-navigation: [Details] [Match History] [Head to Head]
  - Details tab is the default landing page when selecting a team
  - Large team logo (~120px) on the left, team name + division to the right
  - Roster list below team name, leaders marked
  - Map activity summary shows matches played per map with W/L breakdown (last 6 months)
  - H2H button navigates to Head to Head tab with current team pre-selected
  - Empty/loading/error states handled for map stats
  - No scrolling required for typical team (4-8 players)

## Problem Statement

The current team detail view (Slice 5.1b) shows a compact info bar and immediately dives into match history. There's no "landing page" that gives you a sense of the team at a glance — their identity (large logo), full roster, and activity summary. The info bar is too compact to convey team identity, and match history is the only content.

Users browsing teams want to quickly answer: "Who is this team? How active are they? What maps do they play?" before diving into individual match results.

## Solution

Introduce a **tabbed sub-navigation** within the team detail area. The Details tab becomes the default landing page with a redesigned layout:

1. **Large logo** (~120px) on the left — establishes team identity
2. **Team name** in large text to the right of logo, division badge below
3. **Roster list** below the name, hugging the logo — leader first, then alphabetical
4. **Map activity summary** below a subtle divider — auto-generated from QWHub data
5. **H2H button** in the stats area to jump to the Head to Head tab

The existing match history moves to its own tab (Slice 5.2b). The tabbed structure provides room for future tabs without cramping the layout.

---

## Visual Design

### Tabbed Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Content area changes based on active tab                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Details Tab (Default Landing)

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  Death Dealers                                    │
│  │          │  Division 1                                       │
│  │   LOGO   │                                                   │
│  │  ~120px  │  plast (L)      Flamer                            │
│  │          │  hammer         riki                              │
│  │          │                                                   │
│  └──────────┘                                                   │
│                                                                 │
│  ── Last 6 months: 20 matches ──────────────── [Compare H2H →] │
│                                                                 │
│  dm2      ████████████  12  (8W 4L)                             │
│  dm3      █████          5  (3W 2L)                             │
│  schloss  ███            3  (3W 0L)                             │
│  e1m2     ██             2  (1W 1L)                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Details Tab — No QWHub Tag

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  Death Dealers                                    │
│  │          │  Division 1                                       │
│  │   LOGO   │                                                   │
│  │  ~120px  │  plast (L)      Flamer                            │
│  │          │  hammer         riki                              │
│  │          │                                                   │
│  └──────────┘                                                   │
│                                                                 │
│  ── Activity ───────────────────────────────────────────────── │
│                                                                 │
│  Match history not available                                    │
│  Team leader can configure QW Hub tag in Team Settings          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Details Tab — Loading State

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  Death Dealers                                    │
│  │          │  Division 1                                       │
│  │   LOGO   │                                                   │
│  │  ~120px  │  plast (L)      Flamer                            │
│  │          │  hammer         riki                              │
│  │          │                                                   │
│  └──────────┘                                                   │
│                                                                 │
│  ── Activity ───────────────────────────────── Loading...  ─── │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Changes

### Key Design Decisions

1. **Tabbed navigation within TeamsBrowserPanel** — Not a new component. The existing `_renderTeamsView()` gains a tab bar and delegates to tab-specific render functions. This keeps the Firebase listener, team selection, and event handling in one place.

2. **New QWHubService method: `getTeamMapStats()`** — Fetches up to 50 matches from the last 6 months and aggregates by map. Uses the same Supabase endpoint with a date filter. Separate cache key from `getRecentMatches()`.

3. **Two-column roster layout** — When roster has 5+ players, split into two columns to avoid excessive vertical height. 4 or fewer stays single column.

4. **Tab state persists per session** — When switching between teams, we return to the Details tab (fresh context). But switching away from Teams view and back preserves the last active tab.

### Component Changes: TeamsBrowserPanel

**New private state:**
```javascript
let _activeTab = 'details'; // 'details' | 'history' | 'h2h'
```

**Modified methods:**
- `_renderTeamsView()` — Now renders tab bar + delegates to active tab
- `_renderTeamInfoBar()` — Removed (replaced by Details tab layout)
- `_renderMatchHistory()` — Moved to Slice 5.2b (Match History tab)

**New methods:**
- `_renderTabBar()` — Renders [Details] [Match History] [Head to Head] tabs
- `_renderDetailsTab(team)` — Large logo + roster + map stats
- `_renderMapStats(teamTag)` — Map activity summary with bars
- `_loadMapStats(teamTag)` — Async fetch + render of map stats section
- `switchTab(tabName)` — Public method for programmatic tab switching (used by H2H button)

**Tab switching behavior:**
- Clicking a tab updates `_activeTab` and re-renders content area only (not tab bar)
- Selecting a new team resets `_activeTab` to `'details'`
- H2H button calls `switchTab('h2h')` which will be handled by Slice 5.2d

### Service Changes: QWHubService

**New method: `getTeamMapStats(teamTag, months = 6)`**

```javascript
/**
 * Fetch match data for map activity summary.
 * Returns aggregated stats: { totalMatches, maps: [{ map, total, wins, losses }] }
 * Fetches up to 50 4on4 matches within the date range.
 */
async function getTeamMapStats(teamTag, months = 6) {
    if (!teamTag) return null;

    const apiTag = teamTag.toLowerCase();
    const cacheKey = `mapstats_${apiTag}_${months}`;

    // Check cache
    const cached = _matchCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return cached.data;
    }

    // Calculate date range
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD

    const encodedTag = encodeURIComponent(`{${apiTag}}`);
    const url = `${API_BASE}` +
        `?select=id,timestamp,map,teams` +
        `&mode=eq.4on4` +
        `&team_names=cs.${encodedTag}` +
        `&timestamp=gte.${sinceStr}` +
        `&order=timestamp.desc` +
        `&limit=50`;

    const response = await fetch(url, {
        headers: { 'apikey': API_KEY }
    });

    if (!response.ok) {
        throw new Error(`QW Hub API error: ${response.status}`);
    }

    const rawData = await response.json();

    // Aggregate by map
    const mapAgg = {};
    rawData.forEach(match => {
        const map = match.map;
        if (!mapAgg[map]) {
            mapAgg[map] = { map, total: 0, wins: 0, losses: 0, draws: 0 };
        }
        mapAgg[map].total++;

        const ourTeam = match.teams.find(t => t.name.toLowerCase() === apiTag);
        const opponent = match.teams.find(t => t.name.toLowerCase() !== apiTag);
        if (ourTeam && opponent) {
            if (ourTeam.frags > opponent.frags) mapAgg[map].wins++;
            else if (ourTeam.frags < opponent.frags) mapAgg[map].losses++;
            else mapAgg[map].draws++;
        }
    });

    // Sort by total matches descending
    const maps = Object.values(mapAgg).sort((a, b) => b.total - a.total);

    const result = {
        totalMatches: rawData.length,
        months,
        maps
    };

    _matchCache.set(cacheKey, {
        data: result,
        fetchedAt: Date.now()
    });

    return result;
}
```

**Supabase query note:** We use `select=id,timestamp,map,teams` (no players/demo data) since we only need map and team frags for aggregation. This is a lighter query than `getRecentMatches()`.

### Event Contracts

**Existing (unchanged):**
```javascript
// Browse Teams → TeamsBrowserPanel
window.dispatchEvent(new CustomEvent('team-browser-detail-select', {
    detail: { teamId }
}));
```

**New:**
```javascript
// TeamsBrowserPanel internal tab switch (no cross-component event needed)
// H2H button triggers: switchTab('h2h')
// This is a method call, not an event — same component
```

---

## CSS Additions

Add to `src/css/input.css`:

```css
/* ============================================
   Slice 5.2a: Team Detail Tabs + Details Landing
   ============================================ */

/* Tab bar */
.team-detail-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    padding: 0 1rem;
    flex-shrink: 0;
}

.team-detail-tab {
    padding: 0.5rem 1rem;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
}

.team-detail-tab:hover {
    color: var(--foreground);
}

.team-detail-tab.active {
    color: var(--foreground);
    border-bottom-color: var(--primary);
}

.team-detail-tab-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem;
}

/* Details landing layout */
.team-details-landing {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
}

.team-details-header {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
}

.team-details-logo {
    width: 7.5rem;   /* ~120px */
    height: 7.5rem;
    flex-shrink: 0;
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--muted);
}

.team-details-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.team-details-logo-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--muted-foreground);
    background: var(--muted);
    border-radius: 0.5rem;
}

.team-details-info {
    flex: 1;
    min-width: 0;
}

.team-details-name {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--foreground);
    line-height: 1.2;
    margin-bottom: 0.125rem;
}

.team-details-division {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    margin-bottom: 0.75rem;
}

/* Roster grid — 1 column for <=4, 2 columns for 5+ */
.team-details-roster {
    display: grid;
    gap: 0.125rem 1.5rem;
    grid-template-columns: 1fr;
}

.team-details-roster.two-col {
    grid-template-columns: 1fr 1fr;
}

.team-details-roster-item {
    font-size: 0.8125rem;
    color: var(--foreground);
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.team-details-roster-item .leader-badge {
    font-size: 0.6875rem;
    color: var(--primary);
}

/* Map stats section */
.team-details-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.25rem;
}

.team-details-divider-line {
    flex: 1;
    height: 1px;
    background: var(--border);
}

.team-details-divider-label {
    font-size: 0.6875rem;
    color: var(--muted-foreground);
    white-space: nowrap;
}

.team-details-h2h-btn {
    font-size: 0.6875rem;
    color: var(--primary);
    cursor: pointer;
    white-space: nowrap;
    background: none;
    border: none;
    padding: 0;
    transition: opacity 0.15s;
}

.team-details-h2h-btn:hover {
    opacity: 0.8;
}

.map-stats-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.map-stat-row {
    display: grid;
    grid-template-columns: 4rem 1fr 2rem 5.5rem;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
}

.map-stat-name {
    color: var(--muted-foreground);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
}

.map-stat-bar {
    height: 0.5rem;
    border-radius: 0.25rem;
    background: var(--muted);
    overflow: hidden;
    position: relative;
}

.map-stat-bar-fill {
    height: 100%;
    border-radius: 0.25rem;
    background: var(--primary);
    transition: width 0.3s ease;
}

.map-stat-count {
    color: var(--foreground);
    font-weight: 600;
    text-align: right;
}

.map-stat-record {
    color: var(--muted-foreground);
    font-size: 0.6875rem;
}

.map-stat-record .win { color: rgb(34, 197, 94); }
.map-stat-record .loss { color: rgb(239, 68, 68); }
```

---

## Implementation Details

### Tab Bar Rendering

```javascript
function _renderTabBar() {
    const tabs = [
        { id: 'details', label: 'Details' },
        { id: 'history', label: 'Match History' },
        { id: 'h2h', label: 'Head to Head' }
    ];

    return `
        <div class="team-detail-tabs">
            ${tabs.map(tab => `
                <button class="team-detail-tab ${_activeTab === tab.id ? 'active' : ''}"
                        data-tab="${tab.id}">
                    ${tab.label}
                </button>
            `).join('')}
        </div>
    `;
}
```

### Details Tab Rendering

```javascript
function _renderDetailsTab(team) {
    const logoUrl = team.activeLogo?.urls?.large || team.activeLogo?.urls?.medium;
    const divisions = _normalizeDivisions(team.divisions)
        .map(d => `Division ${d.replace('D', '')}`)
        .join(', ') || 'No division';

    const roster = team.playerRoster || [];
    const sortedRoster = [...roster].sort((a, b) => {
        if (a.role === 'leader') return -1;
        if (b.role === 'leader') return 1;
        return (a.displayName || '').localeCompare(b.displayName || '');
    });

    const rosterCols = sortedRoster.length >= 5 ? 'two-col' : '';

    const rosterHtml = sortedRoster.map(player => `
        <div class="team-details-roster-item">
            <span>${_escapeHtml(player.displayName || 'Unknown')}</span>
            ${player.role === 'leader' ? '<span class="leader-badge">(L)</span>' : ''}
        </div>
    `).join('');

    const hasTag = !!team.teamTag;

    return `
        <div class="team-details-landing">
            <!-- Header: Logo + Name + Roster -->
            <div class="team-details-header">
                <div class="team-details-logo">
                    ${logoUrl
                        ? `<img src="${logoUrl}" alt="${_escapeHtml(team.teamName)}">`
                        : `<div class="team-details-logo-placeholder">${_escapeHtml(team.teamTag || '??')}</div>`
                    }
                </div>
                <div class="team-details-info">
                    <div class="team-details-name">${_escapeHtml(team.teamName || 'Unknown Team')}</div>
                    <div class="team-details-division">${divisions}</div>
                    <div class="team-details-roster ${rosterCols}">
                        ${rosterHtml}
                    </div>
                </div>
            </div>

            <!-- Map Stats Section -->
            <div class="team-details-divider">
                <span class="team-details-divider-label" id="map-stats-label">Activity</span>
                <div class="team-details-divider-line"></div>
                ${hasTag ? `
                    <button class="team-details-h2h-btn"
                            onclick="TeamsBrowserPanel.switchTab('h2h')">
                        Compare H2H &rarr;
                    </button>
                ` : ''}
            </div>

            <div id="map-stats-content" data-team-tag="${team.teamTag || ''}">
                ${hasTag
                    ? '<div class="text-xs text-muted-foreground">Loading activity...</div>'
                    : `<div class="text-xs text-muted-foreground">
                        <p>Match history not available</p>
                        <p class="mt-1">Team leader can configure QW Hub tag in Team Settings</p>
                       </div>`
                }
            </div>
        </div>
    `;
}
```

### Map Stats Rendering

```javascript
async function _loadMapStats(teamTag) {
    const container = document.getElementById('map-stats-content');
    const label = document.getElementById('map-stats-label');
    if (!container || container.dataset.teamTag !== teamTag) return;

    try {
        const stats = await QWHubService.getTeamMapStats(teamTag, 6);

        // Guard against stale render
        if (!container || container.dataset.teamTag !== teamTag) return;

        if (!stats || stats.totalMatches === 0) {
            container.innerHTML = '<p class="text-xs text-muted-foreground">No matches found in the last 6 months</p>';
            return;
        }

        // Update divider label with total
        if (label) {
            label.textContent = `Last 6 months: ${stats.totalMatches} matches`;
        }

        // Find max for bar scaling
        const maxCount = stats.maps[0]?.total || 1;

        container.innerHTML = `
            <div class="map-stats-list">
                ${stats.maps.map(m => `
                    <div class="map-stat-row">
                        <span class="map-stat-name">${m.map}</span>
                        <div class="map-stat-bar">
                            <div class="map-stat-bar-fill" style="width: ${Math.round((m.total / maxCount) * 100)}%"></div>
                        </div>
                        <span class="map-stat-count">${m.total}</span>
                        <span class="map-stat-record">(<span class="win">${m.wins}W</span> <span class="loss">${m.losses}L</span>${m.draws > 0 ? ` ${m.draws}D` : ''})</span>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Failed to load map stats:', error);
        if (container?.dataset.teamTag !== teamTag) return;

        container.innerHTML = `
            <div class="text-xs text-muted-foreground">
                <p>Couldn't load activity data</p>
                <button class="text-xs mt-1 text-primary hover:underline cursor-pointer"
                        onclick="TeamsBrowserPanel.retryMapStats('${_escapeHtml(teamTag)}')">
                    Retry
                </button>
            </div>
        `;
    }
}
```

### Modified _renderTeamsView

```javascript
function _renderTeamsView() {
    if (!_selectedTeamId) {
        return `
            <div class="team-detail-empty">
                <p class="text-muted-foreground text-sm">
                    Select a team from Browse Teams to view details
                </p>
            </div>
        `;
    }

    const team = _allTeams.find(t => t.id === _selectedTeamId);
    if (!team) {
        return `
            <div class="team-detail-empty">
                <p class="text-muted-foreground text-sm">Team not found</p>
            </div>
        `;
    }

    // Render tab bar + active tab content
    let tabContent = '';
    switch (_activeTab) {
        case 'details':
            tabContent = _renderDetailsTab(team);
            break;
        case 'history':
            tabContent = '<div class="text-sm text-muted-foreground p-4">Match History (Slice 5.2b)</div>';
            break;
        case 'h2h':
            tabContent = '<div class="text-sm text-muted-foreground p-4">Head to Head (Slice 5.2d)</div>';
            break;
    }

    return `
        <div class="team-detail-full flex flex-col h-full">
            ${_renderTabBar()}
            <div class="team-detail-tab-content">
                ${tabContent}
            </div>
        </div>
    `;
}
```

### Modified _handleBrowseTeamSelect

```javascript
function _handleBrowseTeamSelect(event) {
    const { teamId } = event.detail;
    if (!teamId) return;

    // Reset to Details tab when selecting a new team
    _activeTab = 'details';

    // ... rest of existing logic unchanged
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Tab switching: Pure DOM swap, no async operations
- Roster rendering: From cached team data
- Team selection (cached team): Instant render from TeamService cache

COLD PATHS (<2s):
- Map stats load: New Supabase query (~500-1000ms, then 5-min cache)
- First team selection: Cache miss on TeamService (rare, service pre-loads)

BACKEND PERFORMANCE:
- getTeamMapStats query: Lightweight (no players/demo fields), limited to 50 rows
- Uses existing Supabase API and cache TTL patterns
- No new Firebase queries or Cloud Functions
```

---

## Data Flow

```
User clicks team in Browse Teams
    → team-browser-detail-select event
    → _handleBrowseTeamSelect()
        → _activeTab = 'details' (reset)
        → _selectedTeamId = teamId
        → _render()
            → _renderTeamsView()
                → _renderTabBar() (Details active)
                → _renderDetailsTab(team)
                    → Logo + Name + Roster from cached team data (instant)
                    → Map stats placeholder "Loading..."
        → _loadMapStats(teamTag) (async)
            → QWHubService.getTeamMapStats(teamTag, 6)
                → Cache hit? Return instantly
                → Cache miss? Supabase query (50 matches, 6 months)
                    → Client-side aggregation by map
                    → Cache result (5-min TTL)
            → Render map bars into #map-stats-content
            → Guard: check data-team-tag matches (stale render protection)

User clicks tab
    → _activeTab = tabId
    → Re-render content area only
    → If Details: render + load map stats
    → If History: delegate to Slice 5.2b
    → If H2H: delegate to Slice 5.2d
```

---

## Test Scenarios

- [ ] Selecting a team shows Details tab by default with large logo, name, division, roster
- [ ] Teams with 4 or fewer players show single-column roster
- [ ] Teams with 5+ players show two-column roster
- [ ] Teams with teamTag show map stats after loading
- [ ] Teams without teamTag show "not available" message (no loading spinner)
- [ ] Map stats shows correct W/L counts per map
- [ ] Map bars are proportional (most-played map = full width)
- [ ] Selecting a different team resets to Details tab
- [ ] Tab switching preserves selected team
- [ ] Switching to Players view and back preserves active tab
- [ ] H2H button switches to H2H tab
- [ ] Loading state shows while map stats are fetching
- [ ] Error state shows retry button on API failure
- [ ] Race condition: switching teams during map stats fetch doesn't render stale data
- [ ] Teams without logo show tag text in placeholder box
- [ ] Leader badge "(L)" appears next to leader names

## Common Integration Pitfalls

- [ ] Don't forget to add `_activeTab` state variable and reset it on team selection
- [ ] The `getTeamMapStats` query must use `select=id,timestamp,map,teams` (not players) for lighter payload
- [ ] Map stats cache key must be different from match list cache key (`mapstats_` prefix)
- [ ] Tab click listeners must be re-attached after content re-render
- [ ] Expose `switchTab` in the public API for the H2H button to work
- [ ] Expose `retryMapStats` in the public API for error retry button

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/js/components/TeamsBrowserPanel.js` | Modify | Add tabs, Details tab renderer, map stats loader |
| `public/js/services/QWHubService.js` | Modify | Add `getTeamMapStats()` method |
| `src/css/input.css` | Modify | Add tab bar + details landing + map stats styles |

## Quality Checklist

- [ ] Tab bar renders all three tabs with correct active state
- [ ] Details tab renders without scrolling for typical 4-8 player teams
- [ ] Map stats aggregation handles draws (rare but possible)
- [ ] Supabase query includes `&limit=50` (never unbounded)
- [ ] Cache TTL follows existing pattern (5 minutes)
- [ ] No new Firebase listeners needed (all data from QWHub)
- [ ] CSS uses rem units (except borders)
- [ ] Logo gracefully degrades (placeholder) when no image available
