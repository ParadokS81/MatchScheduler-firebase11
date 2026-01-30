# Slice 5.2d: Head-to-Head Tab

## Slice Definition
- **Slice ID:** 5.2d
- **Name:** Head-to-Head Compare Tab
- **Depends on:** Slice 5.2a (Tab infrastructure), Slice 5.2b (Match History — reuses scoreboard/stats patterns)
- **Supersedes:** Slice 5.1c (Head-to-Head Compare View — same concept, updated to tabbed layout)
- **User Story:** As a user, I can compare two teams' head-to-head record with win/loss stats, per-map breakdown, and match list, so I can prepare for upcoming matches and evaluate matchups
- **Success Criteria:**
  - H2H tab shows within team detail tabbed navigation
  - Current team is pre-selected when arriving from Details tab "Compare H2H" button
  - Opponent selector: dropdown or search of teams with QWHub tags
  - Win/loss record displayed prominently
  - Per-map breakdown with win percentage bars
  - Match list showing all H2H games (chronological)
  - Clicking a match previews its scoreboard (reuses 5.2b pattern)
  - "Full Stats" opens stats popout (reuses 5.2c)
  - Both teams must have QWHub tags configured for H2H to work
  - Loading, empty, and error states handled

## Problem Statement

When scheduling a match, teams want to answer: "How do we historically perform against this opponent? Which maps favor us?" Currently this requires manually searching QWHub, filtering by both team names, and mentally tallying results across pages.

Slice 5.1c originally designed this as a full-page replacement for the team detail view with a "back" button. With the tabbed structure from 5.2a, it fits naturally as a third tab — no navigation disruption, and users can flip between Details, Match History, and H2H without losing context.

## Solution

The **Head to Head** tab in the team detail tabbed navigation. Flow:

1. User is browsing a team's Details tab
2. Clicks "Compare H2H" button → switches to H2H tab with this team pre-selected as Team A
3. H2H tab shows a team selector for the opponent (Team B)
4. Once opponent is selected → fetch H2H matches from Supabase and render:
   - Overall record: `3W - 2L (60%)`
   - Per-map breakdown with win bars
   - Full match list with click-to-preview scoreboard

Alternatively, user can navigate directly to H2H tab and select both teams.

---

## Visual Design

### H2H Tab — Initial State (Team A pre-selected)

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐                    ┌──────────────────────────┐  │
│   │   LOGO   │         vs        │  Select opponent...   ▼  │  │
│   │ ]sr[     │                    └──────────────────────────┘  │
│   │ D1       │                                                  │
│   └──────────┘                    Select a team to compare      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### H2H Tab — Both Teams Selected, Results Loaded

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────┐              vs              ┌──────┐               │
│   │ LOGO │   ]sr[                  pol  │ LOGO │               │
│   │      │   D1                    D2   │      │               │
│   └──────┘                              └──────┘               │
│                                                                 │
│                    ┌─────────────┐                              │
│                    │  5W - 3L    │                              │
│                    │  (63% win)  │                              │
│                    └─────────────┘                              │
│                                                                 │
│  ── Map Breakdown ────────────────────────────────────────────  │
│                                                                 │
│  dm2      ████████░░░░  3   (2W 1L)                             │
│  e1m2     ██████░░░░░░  3   (2W 1L)                             │
│  dm3      ████████████  1   (1W 0L)                             │
│  schloss  ░░░░░░░░░░░░  1   (0W 1L)                             │
│                                                                 │
│  ── All Matches ──────────────────────────────────────────────  │
│                                                                 │
│  Nov 25  e1m2   ]sr[ 220 - 201 pol   W   [👁]                  │
│  Nov 25  e1m2   ]sr[ 212 - 286 pol   L   [👁]                  │
│  Nov 25  dm3    ]sr[ 136 - 270 pol   L   [👁]                  │
│  Oct 30  dm2    ]sr[ 198 - 165 pol   W   [👁]                  │
│  ...                                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### H2H Tab — No Matches Found

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────┐              vs              ┌──────┐               │
│   │ LOGO │   ]sr[                  book │ LOGO │               │
│   └──────┘                              └──────┘               │
│                                                                 │
│                No matches found between                         │
│                ]sr[ and book                                    │
│                                                                 │
│                (Data covers last 6 months)                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### H2H Tab — Team Missing Tag

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Head-to-head comparison requires both teams to have           │
│   a QW Hub tag configured.                                      │
│                                                                 │
│   Current team: ]sr[ (tag configured)                           │
│   Opponent: Select a team with a QW Hub tag                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Changes

### Key Design Decisions

1. **Opponent selector = searchable dropdown** — Lists all teams with QWHub tags from the TeamService cache. Type-ahead search. No external API call for the selector — it reads from already-loaded team data.

2. **Supabase H2H query** — Uses the `cs.{teamA,teamB}` PostgREST array containment filter to find matches where both teams played. Fetches up to 20 results from last 6 months.

3. **Reuses match list and scoreboard patterns** — H2H match list reuses the styling from 5.2b. Click-to-preview scoreboard works the same way. Full Stats opens the same MatchStatsModal from 5.2c.

4. **Pre-selection flow** — When `switchTab('h2h')` is called from the Details tab, the current team is set as Team A. The H2H tab renders with Team A locked and the opponent selector focused.

5. **Separate H2H cache** — Keyed by sorted team pair (alphabetical) so `]sr[ vs pol` and `pol vs ]sr[` share the same cache entry.

### New QWHubService Method

```javascript
/**
 * Fetch head-to-head matches between two teams.
 * Returns array of transformed match objects.
 * Cache keyed by sorted team pair (5-min TTL).
 */
async function getH2HMatches(teamTagA, teamTagB, limit = 20) {
    if (!teamTagA || !teamTagB) return [];

    const tagA = teamTagA.toLowerCase();
    const tagB = teamTagB.toLowerCase();

    // Sort for consistent cache key
    const sortedPair = [tagA, tagB].sort().join('_vs_');
    const cacheKey = `h2h_${sortedPair}`;

    const cached = _matchCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return cached.data;
    }

    // Date range: last 6 months
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const sinceStr = since.toISOString().split('T')[0];

    // cs.{teamA,teamB} = "array contains ALL of these"
    const encodedTags = encodeURIComponent(`{${tagA},${tagB}}`);
    const url = `${API_BASE}` +
        `?select=id,timestamp,mode,map,teams,players,demo_sha256` +
        `&mode=eq.4on4` +
        `&team_names=cs.${encodedTags}` +
        `&timestamp=gte.${sinceStr}` +
        `&order=timestamp.desc` +
        `&limit=${limit}`;

    const response = await fetch(url, {
        headers: { 'apikey': API_KEY }
    });

    if (!response.ok) {
        throw new Error(`QW Hub API error: ${response.status}`);
    }

    const rawData = await response.json();
    const matches = rawData.map(match => _transformMatch(match, tagA));

    _matchCache.set(cacheKey, {
        data: matches,
        fetchedAt: Date.now()
    });

    return matches;
}
```

### Component Changes: TeamsBrowserPanel

**New private state:**
```javascript
let _h2hTeamA = null;       // { id, teamName, teamTag, logoUrl, division } — pre-selected from Details
let _h2hTeamB = null;       // Same shape — opponent selected by user
let _h2hMatches = [];       // Fetched H2H match data
let _h2hLoading = false;    // Loading state
let _h2hError = null;       // Error message
let _h2hSelectedMatchId = null;  // Clicked match for preview
```

**New methods:**
- `_renderH2HTab(team)` — Main H2H tab renderer
- `_renderH2HTeamCard(teamData, side)` — Team logo + name + division card
- `_renderOpponentSelector()` — Searchable dropdown of teams with tags
- `_renderH2HResults()` — Record + map breakdown + match list
- `_renderH2HMapBreakdown(matches, ourTag)` — Per-map win bars
- `_renderH2HMatchList(matches)` — Chronological match list with preview support
- `_loadH2HData()` — Fetches matches + computes aggregates
- `selectOpponent(teamId)` — Public method for opponent selection
- `_handleH2HMatchClick(matchId)` — Click-to-preview in H2H context

**Modified switchTab:**
```javascript
function switchTab(tabName) {
    _activeTab = tabName;

    // Pre-select current team for H2H
    if (tabName === 'h2h' && _selectedTeamId) {
        const team = _allTeams.find(t => t.id === _selectedTeamId);
        if (team) {
            _h2hTeamA = {
                id: team.id,
                teamName: team.teamName,
                teamTag: team.teamTag,
                logoUrl: team.activeLogo?.urls?.medium || team.activeLogo?.urls?.small,
                division: _normalizeDivisions(team.divisions)?.[0] || ''
            };
        }
        // Reset opponent when switching to H2H
        _h2hTeamB = null;
        _h2hMatches = [];
        _h2hError = null;
    }

    _renderCurrentView();
}
```

---

## Implementation Details

### H2H Tab Renderer

```javascript
function _renderH2HTab(team) {
    if (!team.teamTag) {
        return `
            <div class="h2h-no-tag">
                <p class="text-sm text-muted-foreground">
                    Head-to-head comparison requires a QW Hub tag.
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                    Team leader can configure it in Team Settings.
                </p>
            </div>
        `;
    }

    return `
        <div class="h2h-container">
            <!-- Team Cards -->
            <div class="h2h-header">
                ${_renderH2HTeamCard(_h2hTeamA, 'left')}
                <span class="h2h-vs">vs</span>
                ${_h2hTeamB
                    ? _renderH2HTeamCard(_h2hTeamB, 'right')
                    : _renderOpponentSelector()
                }
            </div>

            <!-- Results -->
            <div class="h2h-results" id="h2h-results">
                ${_h2hTeamB ? _renderH2HResults() : `
                    <p class="text-xs text-muted-foreground text-center mt-4">
                        Select an opponent to compare
                    </p>
                `}
            </div>
        </div>
    `;
}
```

### Opponent Selector

```javascript
function _renderOpponentSelector() {
    // Get all teams with QWHub tags (excluding current team)
    const teamsWithTags = _allTeams.filter(t =>
        t.teamTag && t.id !== _selectedTeamId
    ).sort((a, b) => (a.teamName || '').localeCompare(b.teamName || ''));

    return `
        <div class="h2h-opponent-selector">
            <div class="h2h-opponent-search-wrapper">
                <input type="text"
                       id="h2h-opponent-search"
                       placeholder="Select opponent..."
                       class="h2h-opponent-input"
                       autocomplete="off" />
            </div>
            <div class="h2h-opponent-dropdown" id="h2h-opponent-dropdown" style="display:none;">
                ${teamsWithTags.map(t => `
                    <div class="h2h-opponent-option" data-team-id="${t.id}">
                        ${t.activeLogo?.urls?.small
                            ? `<img src="${t.activeLogo.urls.small}" class="h2h-option-logo">`
                            : `<span class="h2h-option-logo-placeholder">${_escapeHtml(t.teamTag || '??')}</span>`
                        }
                        <span class="h2h-option-name">${_escapeHtml(t.teamName)}</span>
                        <span class="h2h-option-tag">${_escapeHtml(t.teamTag)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}
```

### H2H Results Rendering

```javascript
function _renderH2HResults() {
    if (_h2hLoading) {
        return '<div class="text-xs text-muted-foreground text-center mt-4">Loading head-to-head data...</div>';
    }

    if (_h2hError) {
        return `
            <div class="text-xs text-muted-foreground text-center mt-4">
                <p>${_escapeHtml(_h2hError)}</p>
                <button class="text-xs mt-1 text-primary hover:underline cursor-pointer"
                        onclick="TeamsBrowserPanel.retryH2H()">Retry</button>
            </div>
        `;
    }

    if (_h2hMatches.length === 0) {
        return `
            <div class="h2h-no-matches text-center mt-4">
                <p class="text-sm text-muted-foreground">
                    No matches found between ${_escapeHtml(_h2hTeamA?.teamTag || '?')} and ${_escapeHtml(_h2hTeamB?.teamTag || '?')}
                </p>
                <p class="text-xs text-muted-foreground mt-1">(Data covers last 6 months)</p>
            </div>
        `;
    }

    // Calculate overall record
    const wins = _h2hMatches.filter(m => m.result === 'W').length;
    const losses = _h2hMatches.filter(m => m.result === 'L').length;
    const draws = _h2hMatches.filter(m => m.result === 'D').length;
    const total = _h2hMatches.length;
    const winPct = total > 0 ? Math.round(100 * wins / total) : 0;

    // Per-map breakdown
    const mapBreakdown = {};
    _h2hMatches.forEach(m => {
        if (!mapBreakdown[m.map]) mapBreakdown[m.map] = { total: 0, wins: 0, losses: 0, draws: 0 };
        mapBreakdown[m.map].total++;
        if (m.result === 'W') mapBreakdown[m.map].wins++;
        else if (m.result === 'L') mapBreakdown[m.map].losses++;
        else mapBreakdown[m.map].draws++;
    });

    const maps = Object.entries(mapBreakdown)
        .sort(([,a], [,b]) => b.total - a.total);
    const maxMapCount = maps[0]?.[1]?.total || 1;

    return `
        <!-- Overall Record -->
        <div class="h2h-record">
            <div class="h2h-record-badge">
                <span class="h2h-record-score">${wins}W - ${losses}L${draws > 0 ? ` - ${draws}D` : ''}</span>
                <span class="h2h-record-pct">(${winPct}% win)</span>
            </div>
        </div>

        <!-- Map Breakdown -->
        <div class="h2h-section">
            <div class="team-details-divider">
                <span class="team-details-divider-label">Map Breakdown</span>
                <div class="team-details-divider-line"></div>
            </div>

            <div class="map-stats-list">
                ${maps.map(([map, stats]) => `
                    <div class="map-stat-row">
                        <span class="map-stat-name">${map}</span>
                        <div class="map-stat-bar">
                            <div class="map-stat-bar-fill" style="width: ${Math.round((stats.total / maxMapCount) * 100)}%"></div>
                        </div>
                        <span class="map-stat-count">${stats.total}</span>
                        <span class="map-stat-record">(<span class="win">${stats.wins}W</span> <span class="loss">${stats.losses}L</span>)</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Match List -->
        <div class="h2h-section">
            <div class="team-details-divider">
                <span class="team-details-divider-label">All Matches (${total})</span>
                <div class="team-details-divider-line"></div>
            </div>

            <div class="h2h-match-list">
                ${_h2hMatches.map(m => {
                    const dateStr = m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const resultClass = m.result === 'W' ? 'mh-result-win' : m.result === 'L' ? 'mh-result-loss' : 'mh-result-draw';

                    return `
                        <div class="h2h-match-row" data-match-id="${m.id}">
                            <span class="mh-match-date">${dateStr}</span>
                            <span class="mh-match-map">${m.map}</span>
                            <span class="mh-match-score">
                                <span class="mh-match-tag">${_escapeHtml(m.ourTag)}</span>
                                <span class="mh-match-frags">${m.ourScore} - ${m.opponentScore}</span>
                                <span class="mh-match-tag">${_escapeHtml(m.opponentTag)}</span>
                            </span>
                            <span class="mh-match-result ${resultClass}">${m.result}</span>
                            <button class="h2h-match-view-btn"
                                    onclick="TeamsBrowserPanel.openFullStats('${m.id}')"
                                    title="View full stats">
                                &#x1f441;
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}
```

### H2H Data Loader

```javascript
async function _loadH2HData() {
    if (!_h2hTeamA?.teamTag || !_h2hTeamB?.teamTag) return;

    _h2hLoading = true;
    _h2hError = null;
    _h2hMatches = [];
    _updateH2HResults();

    try {
        const matches = await QWHubService.getH2HMatches(
            _h2hTeamA.teamTag,
            _h2hTeamB.teamTag,
            20
        );

        // Cache match data for scoreboard/stats access
        matches.forEach(m => _matchDataById.set(String(m.id), m));

        _h2hMatches = matches;
        _h2hLoading = false;
        _updateH2HResults();
    } catch (error) {
        console.error('Failed to load H2H data:', error);
        _h2hLoading = false;
        _h2hError = "Couldn't load head-to-head data";
        _updateH2HResults();
    }
}

function _updateH2HResults() {
    const container = document.getElementById('h2h-results');
    if (container) {
        container.innerHTML = _renderH2HResults();
    }
}
```

### Opponent Selection

```javascript
function selectOpponent(teamId) {
    const team = _allTeams.find(t => t.id === teamId);
    if (!team) return;

    _h2hTeamB = {
        id: team.id,
        teamName: team.teamName,
        teamTag: team.teamTag,
        logoUrl: team.activeLogo?.urls?.medium || team.activeLogo?.urls?.small,
        division: _normalizeDivisions(team.divisions)?.[0] || ''
    };

    // Re-render the entire H2H tab (replaces selector with team card)
    _renderCurrentView();

    // Load H2H data
    _loadH2HData();
}
```

---

## CSS Additions

Add to `src/css/input.css`:

```css
/* ============================================
   Slice 5.2d: Head-to-Head Tab
   ============================================ */

.h2h-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
}

/* Team Cards Header */
.h2h-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    padding: 0.75rem 0;
    flex-shrink: 0;
}

.h2h-team-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 5rem;
}

.h2h-team-logo {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--muted);
}

.h2h-team-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.h2h-team-logo-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--muted-foreground);
}

.h2h-team-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--foreground);
    text-align: center;
}

.h2h-team-div {
    font-size: 0.6875rem;
    color: var(--muted-foreground);
}

.h2h-vs {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--muted-foreground);
}

/* Opponent Selector */
.h2h-opponent-selector {
    position: relative;
    min-width: 10rem;
}

.h2h-opponent-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    color: var(--foreground);
}

.h2h-opponent-input:focus {
    outline: none;
    border-color: var(--primary);
    ring: 1px solid var(--primary);
}

.h2h-opponent-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 12rem;
    overflow-y: auto;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 50;
    margin-top: 0.25rem;
}

.h2h-opponent-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    cursor: pointer;
    transition: background 0.1s;
}

.h2h-opponent-option:hover {
    background: var(--muted);
}

.h2h-option-logo {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.25rem;
    object-fit: cover;
    flex-shrink: 0;
}

.h2h-option-logo-placeholder {
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.5rem;
    font-weight: 700;
    color: var(--muted-foreground);
    background: var(--muted);
    border-radius: 0.25rem;
    flex-shrink: 0;
}

.h2h-option-name {
    font-size: 0.75rem;
    color: var(--foreground);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.h2h-option-tag {
    font-size: 0.625rem;
    color: var(--muted-foreground);
    flex-shrink: 0;
}

/* Overall Record Badge */
.h2h-record {
    display: flex;
    justify-content: center;
    padding: 0.5rem 0;
}

.h2h-record-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 1.25rem;
    background: var(--muted);
    border-radius: 0.5rem;
    border: 1px solid var(--border);
}

.h2h-record-score {
    font-size: 1rem;
    font-weight: 700;
    color: var(--foreground);
}

.h2h-record-pct {
    font-size: 0.75rem;
    color: var(--muted-foreground);
}

/* Sections */
.h2h-section {
    margin-top: 0.75rem;
}

/* H2H Match List reuses .mh-match-* styles from 5.2b */
.h2h-match-list {
    display: flex;
    flex-direction: column;
}

.h2h-match-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--border);
    gap: 0.5rem;
    font-size: 0.75rem;
}

.h2h-match-row:hover {
    background: var(--muted);
}

.h2h-match-view-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
    opacity: 0.5;
    transition: opacity 0.15s;
    padding: 0 0.25rem;
}

.h2h-match-view-btn:hover {
    opacity: 1;
}

.h2h-no-tag,
.h2h-no-matches {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
}

/* Change opponent button */
.h2h-change-opponent {
    font-size: 0.625rem;
    color: var(--primary);
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    margin-top: 0.125rem;
}

.h2h-change-opponent:hover {
    opacity: 0.8;
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Tab switch to H2H: Pure DOM render (Team A pre-selected from cache)
- Opponent dropdown: Teams list from TeamService cache
- Dropdown search filter: Client-side string matching

COLD PATHS (<2s):
- H2H data fetch: New Supabase query for cs.{teamA,teamB} (~500-1000ms, 5-min cache)
- Opening stats popout: ktxstats may need fetching (~300-500ms, cached indefinitely)

BACKEND PERFORMANCE:
- Single Supabase query per team pair (up to 20 matches)
- Cache keyed by sorted team pair — reversing teams hits same cache
- No new Firebase queries or Cloud Functions
```

---

## Data Flow

```
User clicks "Compare H2H" on Details tab
    → switchTab('h2h')
        → _h2hTeamA = current team (from cache)
        → _h2hTeamB = null
        → Render H2H tab with Team A card + opponent selector

User types in opponent search
    → Filter dropdown options (client-side)
    → Show matching teams

User selects opponent
    → selectOpponent(teamId)
        → _h2hTeamB = selected team data
        → Re-render (shows both team cards)
        → _loadH2HData()
            → QWHubService.getH2HMatches(tagA, tagB, 20)
                → Cache hit? Instant
                → Cache miss? Supabase cs.{tagA,tagB} query
            → _h2hMatches = results
            → Cache match data in _matchDataById
            → Render: record badge + map breakdown + match list

User clicks eye icon on match
    → openFullStats(matchId)
        → Get match from _matchDataById
        → Fetch ktxstats if needed
        → Open MatchStatsModal (Slice 5.2c)
```

---

## Test Scenarios

- [ ] H2H tab pre-selects Team A when navigated from Details "Compare H2H" button
- [ ] Team without QWHub tag shows "requires tag" message
- [ ] Opponent selector lists only teams with QWHub tags
- [ ] Opponent search filters dropdown as user types
- [ ] Selecting opponent triggers H2H data fetch
- [ ] Overall record shows correct W/L/D counts and win percentage
- [ ] Per-map breakdown shows correct stats with proportional bars
- [ ] Match list shows all H2H games in chronological order
- [ ] Eye icon opens MatchStatsModal with correct match data
- [ ] Loading state shows while fetching H2H data
- [ ] Error state shows retry button on API failure
- [ ] "No matches found" shows when teams haven't played each other
- [ ] Switching teams resets H2H state (opponent cleared)
- [ ] Cache: reversing team order hits same cached result
- [ ] Opponent dropdown closes when clicking outside
- [ ] Can change opponent after initial selection (re-triggers fetch)

## Common Integration Pitfalls

- [ ] Opponent selector must exclude the currently browsed team from the list
- [ ] H2H Supabase query uses `cs.{tagA,tagB}` which requires BOTH team names — URL encoding must handle special chars (brackets, exclamation marks)
- [ ] Cache key must sort team tags alphabetically so `a_vs_b` and `b_vs_a` share cache
- [ ] The `_transformMatch` in QWHubService uses `ourTeamTag` — for H2H, ensure Team A is passed as "our" team
- [ ] Expose `selectOpponent`, `retryH2H` in public API for onclick handlers
- [ ] Dropdown z-index must be above other elements in the tab content
- [ ] Reset H2H state (`_h2hTeamB`, `_h2hMatches`, etc.) when selecting a different team in Browse Teams

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/js/components/TeamsBrowserPanel.js` | Modify | Add H2H tab renderer, opponent selector, results display |
| `public/js/services/QWHubService.js` | Modify | Add `getH2HMatches()` method |
| `src/css/input.css` | Modify | Add H2H tab styles |

## Quality Checklist

- [ ] H2H record handles all cases: all wins, all losses, draws, single match
- [ ] Map breakdown reuses `.map-stat-*` styles from Slice 5.2a (no duplication)
- [ ] Match list reuses `.mh-match-*` styles from Slice 5.2b where possible
- [ ] Opponent dropdown doesn't overflow the panel boundary
- [ ] Supabase query includes `&limit=20` (never unbounded)
- [ ] Cache TTL follows existing pattern (5 minutes, keyed by sorted pair)
- [ ] CSS uses rem units (except borders/shadows)
- [ ] Win/loss/draw colors match existing conventions (green/red/muted)
