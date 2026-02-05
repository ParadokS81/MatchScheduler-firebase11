# Slice 11.0c: H2H Maps Tab — Map Strength Analysis

## Slice Definition
- **Slice ID:** 11.0c
- **Name:** H2H Maps Tab — Map Strength Analysis with Alternating Layout
- **Depends on:** Slice 11.0a (H2H Foundation — service, team selector, sub-tabs)
- **User Story:** As a user, I can see a visual comparison of both teams' strength on each competitive map, so I can identify which maps favor my team and make informed map picks
- **Success Criteria:**
  - Maps sub-tab shows alternating rows: [mapshot | stats] then [stats | mapshot]
  - Each row shows: map image, win rate, games played, avg frag diff for both teams
  - Rows sorted by combined activity (most played maps first)
  - Short text annotations: "Team A dominates", "Even", "Team B avoids", etc.
  - Mapshots loaded from `a.quake.world/mapshots/webp/lg/{map}.webp`
  - Informational only — no hover/click interactions
  - Uses `QWStatsService.getMaps()` for each team (with optional `vsTeam` filter)
  - Period selector applies (uses `months` param from 11.0a)
  - Loading/empty states handled

## Problem Statement

When scheduling a match, teams need to agree on maps. The Maps tab provides at-a-glance visual intelligence: which maps each team is strong on, which they avoid, and where matchups would be competitive. This is the most "visual" of the three sub-tabs — the alternating mapshot layout makes it easy to scan quickly.

---

## Visual Design

### Maps Tab — Alternating Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌────────────────────┬────────────────────────────────────────┐ │
│  │                    │  dm2                                    │ │
│  │   [dm2 mapshot]    │  book:  9-5  (64%)  +12.3 avg diff     │ │
│  │                    │  oeks:  6-4  (60%)  +8.1 avg diff      │ │
│  │                    │  "Both teams strong"                    │ │
│  ├────────────────────┼────────────────────────────────────────┤ │
│  │  dm3                │                                        │ │
│  │  book:  6-6  (50%) │   [dm3 mapshot]                        │ │
│  │  oeks:  3-7  (30%) │                                        │ │
│  │  "book favors"      │                                        │ │
│  ├────────────────────┼────────────────────────────────────────┤ │
│  │                    │  e1m2                                   │ │
│  │   [e1m2 mapshot]   │  book:  7-3  (70%)  +15.2 avg diff    │ │
│  │                    │  oeks:  2-8  (20%)  -11.4 avg diff     │ │
│  │                    │  "book dominates"                       │ │
│  ├────────────────────┼────────────────────────────────────────┤ │
│  │  schloss            │                                        │ │
│  │  book:  2-3  (40%) │   [schloss mapshot]                    │ │
│  │  oeks:  5-2  (71%) │                                        │ │
│  │  "oeks dominates"   │                                        │ │
│  └────────────────────┴────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Maps Tab — No Data

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│              No map data available for this matchup             │
│              Try extending the period to 6 months               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Changes

### Component Changes: TeamsBrowserPanel

**New private state:**
```javascript
// Slice 11.0c: Maps tab state
let _mapsDataA = null;             // QWStatsService.getMaps() for Team A
let _mapsDataB = null;             // QWStatsService.getMaps() for Team B
let _mapsLoading = false;          // Loading state
```

**New methods:**

- `_renderMapsTab()` — Alternating layout renderer
- `_renderMapRow(mapData, index)` — Single alternating row
- `_getMapAnnotation(statsA, statsB)` — Generate text annotation
- `_mergeMapsData(mapsA, mapsB)` — Merge both teams' map data, sorted by combined games
- `_loadMapsData()` — Fetches map stats for both teams
- `_resetMapsState()` — Clears maps state

**Modified methods:**

- `_renderH2HSubTabContent()` — Route `case 'maps'` to `_renderMapsTab()`
- `switchH2HSubTab(subTab)` — When switching to 'maps', trigger `_loadMapsData()` if not loaded
- `_resetH2HState()` — Also call `_resetMapsState()`

### No New Services

Uses `QWStatsService.getMaps()` from Slice 11.0a.

---

## Implementation Details

### Maps Tab Renderer

```javascript
function _renderMapsTab() {
    if (!_h2hOpponentId) {
        return `
            <div class="h2h-empty-state">
                <p class="text-sm text-muted-foreground">Select an opponent to compare map strength</p>
            </div>
        `;
    }

    if (_mapsLoading) {
        return `
            <div class="maps-loading">
                <div class="h2h-skeleton">Loading map analysis...</div>
            </div>
        `;
    }

    const mergedMaps = _mergeMapsData(_mapsDataA, _mapsDataB);

    if (mergedMaps.length === 0) {
        return `
            <div class="h2h-empty-state">
                <p class="text-sm text-muted-foreground">No map data available for this matchup</p>
                <p class="text-xs text-muted-foreground mt-1">Try extending the period to 6 months</p>
            </div>
        `;
    }

    return `
        <div class="maps-grid">
            ${mergedMaps.map((mapData, i) => _renderMapRow(mapData, i)).join('')}
        </div>
    `;
}
```

### Alternating Map Row

```javascript
function _renderMapRow(mapData, index) {
    const isEven = index % 2 === 0;
    const mapshotUrl = `https://a.quake.world/mapshots/webp/lg/${mapData.map}.webp`;
    const teamA = _allTeams.find(t => t.id === _selectedTeamId);
    const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
    const tagA = teamA?.teamTag || '?';
    const tagB = teamB?.teamTag || '?';

    const annotation = _getMapAnnotation(mapData.statsA, mapData.statsB, tagA, tagB);

    const statsHtml = `
        <div class="maps-stats-side">
            <div class="maps-map-name">${mapData.map}</div>
            ${mapData.statsA ? `
                <div class="maps-team-stat">
                    <span class="maps-tag">${_escapeHtml(tagA)}</span>
                    <span class="maps-record">${mapData.statsA.wins}-${mapData.statsA.losses}</span>
                    <span class="maps-winrate">(${Math.round(mapData.statsA.winRate)}%)</span>
                    <span class="maps-fragdiff ${mapData.statsA.avgFragDiff >= 0 ? 'positive' : 'negative'}">
                        ${mapData.statsA.avgFragDiff >= 0 ? '+' : ''}${mapData.statsA.avgFragDiff.toFixed(1)}
                    </span>
                </div>
            ` : `
                <div class="maps-team-stat maps-no-data">
                    <span class="maps-tag">${_escapeHtml(tagA)}</span>
                    <span class="text-xs text-muted-foreground">No games</span>
                </div>
            `}
            ${mapData.statsB ? `
                <div class="maps-team-stat">
                    <span class="maps-tag">${_escapeHtml(tagB)}</span>
                    <span class="maps-record">${mapData.statsB.wins}-${mapData.statsB.losses}</span>
                    <span class="maps-winrate">(${Math.round(mapData.statsB.winRate)}%)</span>
                    <span class="maps-fragdiff ${mapData.statsB.avgFragDiff >= 0 ? 'positive' : 'negative'}">
                        ${mapData.statsB.avgFragDiff >= 0 ? '+' : ''}${mapData.statsB.avgFragDiff.toFixed(1)}
                    </span>
                </div>
            ` : `
                <div class="maps-team-stat maps-no-data">
                    <span class="maps-tag">${_escapeHtml(tagB)}</span>
                    <span class="text-xs text-muted-foreground">No games</span>
                </div>
            `}
            ${annotation ? `<div class="maps-annotation">${annotation}</div>` : ''}
        </div>
    `;

    const mapshotHtml = `
        <div class="maps-mapshot-side">
            <img src="${mapshotUrl}" alt="${mapData.map}" class="maps-mapshot-img"
                 onerror="this.style.display='none'">
        </div>
    `;

    // Alternate: even rows = [mapshot | stats], odd rows = [stats | mapshot]
    return `
        <div class="maps-row ${isEven ? 'maps-row-even' : 'maps-row-odd'}">
            ${isEven ? mapshotHtml + statsHtml : statsHtml + mapshotHtml}
        </div>
    `;
}
```

### Annotation Logic

```javascript
function _getMapAnnotation(statsA, statsB, tagA, tagB) {
    if (!statsA && !statsB) return '';

    // Only one team has data
    if (!statsA) return `${tagB} plays, ${tagA} doesn't`;
    if (!statsB) return `${tagA} plays, ${tagB} doesn't`;

    const wrA = statsA.winRate;
    const wrB = statsB.winRate;
    const diff = wrA - wrB;

    // Both strong (>60%)
    if (wrA >= 60 && wrB >= 60) return 'Both teams strong';

    // One dominates (>30% gap)
    if (diff >= 30) return `${tagA} dominates`;
    if (diff <= -30) return `${tagB} dominates`;

    // One favors (15-30% gap)
    if (diff >= 15) return `${tagA} favors`;
    if (diff <= -15) return `${tagB} favors`;

    // Both weak (<40%)
    if (wrA < 40 && wrB < 40) return 'Neither team favors';

    // Close
    return 'Even';
}
```

### Merge Maps Data

```javascript
function _mergeMapsData(mapsA, mapsB) {
    const mapIndex = {};

    // Add Team A maps
    if (mapsA?.maps) {
        mapsA.maps.forEach(m => {
            mapIndex[m.map] = {
                map: m.map,
                statsA: m,
                statsB: null,
                totalGames: m.games
            };
        });
    }

    // Merge Team B maps
    if (mapsB?.maps) {
        mapsB.maps.forEach(m => {
            if (mapIndex[m.map]) {
                mapIndex[m.map].statsB = m;
                mapIndex[m.map].totalGames += m.games;
            } else {
                mapIndex[m.map] = {
                    map: m.map,
                    statsA: null,
                    statsB: m,
                    totalGames: m.games
                };
            }
        });
    }

    // Sort by combined activity (most played first)
    return Object.values(mapIndex)
        .sort((a, b) => b.totalGames - a.totalGames);
}
```

### Data Loading

```javascript
async function _loadMapsData() {
    const teamA = _allTeams.find(t => t.id === _selectedTeamId);
    const teamB = _allTeams.find(t => t.id === _h2hOpponentId);

    if (!teamA?.teamTag || !teamB?.teamTag) return;

    _mapsLoading = true;
    _mapsDataA = null;
    _mapsDataB = null;

    // Re-render to show loading state
    const container = document.getElementById('h2h-subtab-content');
    if (container) container.innerHTML = _renderMapsTab();

    try {
        // Fetch map stats for both teams in parallel
        // Each team's overall map stats (not filtered to vs opponent)
        // This gives a broader picture of map strength
        const [mapsA, mapsB] = await Promise.all([
            QWStatsService.getMaps(teamA.teamTag, { months: _h2hPeriod }),
            QWStatsService.getMaps(teamB.teamTag, { months: _h2hPeriod })
        ]);

        // Guard
        if (_selectedTeamId !== teamA.id || _h2hOpponentId !== teamB.id) return;

        _mapsDataA = mapsA;
        _mapsDataB = mapsB;
    } catch (error) {
        console.error('Failed to load maps data:', error);
    } finally {
        _mapsLoading = false;
        if (container) container.innerHTML = _renderMapsTab();
    }
}
```

### Reset

```javascript
function _resetMapsState() {
    _mapsDataA = null;
    _mapsDataB = null;
    _mapsLoading = false;
}
```

---

## CSS Additions

Add to `src/css/input.css`:

```css
/* ============================================
   Slice 11.0c: Maps Tab — Alternating Layout
   ============================================ */

.maps-grid {
    overflow-y: auto;
    height: 100%;
}

.maps-row {
    display: flex;
    border-bottom: 1px solid var(--border);
    min-height: 5.5rem;
}

/* Mapshot side */
.maps-mapshot-side {
    width: 45%;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
    background: var(--muted);
}

.maps-mapshot-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0.8;
    transition: opacity 0.2s;
}

.maps-row:hover .maps-mapshot-img {
    opacity: 1;
}

/* Stats side */
.maps-stats-side {
    flex: 1;
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
    min-width: 0;
}

.maps-map-name {
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--foreground);
    margin-bottom: 0.125rem;
}

.maps-team-stat {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.6875rem;
}

.maps-tag {
    font-weight: 600;
    color: var(--foreground);
    min-width: 2.5rem;
}

.maps-record {
    color: var(--foreground);
    font-weight: 600;
}

.maps-winrate {
    color: var(--muted-foreground);
}

.maps-fragdiff {
    font-size: 0.625rem;
    font-weight: 600;
}

.maps-fragdiff.positive {
    color: rgb(34, 197, 94);
}

.maps-fragdiff.negative {
    color: rgb(239, 68, 68);
}

.maps-no-data {
    opacity: 0.5;
}

.maps-annotation {
    font-size: 0.625rem;
    color: var(--muted-foreground);
    font-style: italic;
    margin-top: 0.125rem;
}

/* Even rows: mapshot left, stats right */
.maps-row-even {
    flex-direction: row;
}

/* Odd rows: stats left, mapshot right */
.maps-row-odd {
    flex-direction: row;
}

/* Border between sides */
.maps-row-even .maps-mapshot-side {
    border-right: 1px solid var(--border);
}

.maps-row-odd .maps-mapshot-side {
    border-left: 1px solid var(--border);
}

/* Remove padding for maps grid */
.team-detail-tab-content:has(.maps-grid) {
    padding: 0;
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Maps tab is static (no hover/click interactions)
- Row rendering is pure HTML template (no API calls after initial load)

COLD PATHS (<2s):
- Initial maps load: 2 parallel getMaps() calls (~500-1000ms wall clock)
- Period change: Re-fetches both teams' map data
- Mapshot images: CDN-hosted, fast load, graceful fallback on error

BACKEND PERFORMANCE:
- QW Stats API getMaps: aggregation query on indexed columns
- Parallel fetch: wall-clock time of slowest call
- Image loading: a.quake.world CDN, aggressive browser caching
```

---

## Data Flow

```
User switches to Maps sub-tab
    → switchH2HSubTab('maps')
    → _h2hSubTab = 'maps'
    → _loadMapsData() (if not already loaded)
        → QWStatsService.getMaps(teamA.tag, { months: _h2hPeriod })
        → QWStatsService.getMaps(teamB.tag, { months: _h2hPeriod })
        → Both fetched in parallel
    → _mergeMapsData(mapsA, mapsB)
        → Combine maps from both teams
        → Sort by combined game count
    → Render alternating rows with mapshots and stats

User changes period
    → changeH2HPeriod(months)
    → Re-fetches maps data with new period
    → Re-renders alternating layout

User changes opponent
    → selectOpponent(teamId)
    → _resetMapsState()
    → If currently on maps tab, reload data
```

---

## Test Scenarios

- [ ] Maps tab shows alternating layout: [mapshot | stats] then [stats | mapshot]
- [ ] Maps sorted by combined activity (most played first)
- [ ] Each row shows: map name, win-loss record, win rate %, avg frag diff
- [ ] Frag diff colored green (positive) and red (negative)
- [ ] Mapshots load from a.quake.world CDN
- [ ] Mapshot image error handled gracefully (hides broken image)
- [ ] Annotations correct: "dominates" (>30% gap), "favors" (15-30%), "Even" (<15%), "Both strong" (both >60%)
- [ ] Maps with data for only one team show "No games" for the other
- [ ] Empty state when no map data available
- [ ] Loading state shown while fetching
- [ ] Period change re-fetches and re-renders
- [ ] Team/opponent switch resets and reloads
- [ ] No hover/click interactions (informational only)
- [ ] Scrollable when many maps
- [ ] Standard competitive maps appear (dm2, dm3, e1m2, schloss, phantombase)

## Common Integration Pitfalls

- [ ] QWStatsService.getMaps() returns `{ maps: [{ map, games, wins, losses, winRate, avgFragDiff }] }` — field names differ from H2H response
- [ ] Must merge both teams' map arrays since they may have different maps
- [ ] Maps tab uses overall map stats (not filtered to h2h only) for broader picture — this is intentional
- [ ] Mapshot URLs use lowercase map names (already lowercase from API)
- [ ] `onerror` handler on mapshot images must be inline (no external handler needed)
- [ ] Alternating layout direction determined by index (even/odd), not map name
- [ ] Period change must also invalidate maps data (not just H2H and form)

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/js/components/TeamsBrowserPanel.js` | Modify | Maps tab renderer, merge logic, annotation logic |
| `src/css/input.css` | Modify | Maps alternating layout, mapshot, stats styles |

No new files needed — builds on 11.0a foundation.

## Quality Checklist

- [ ] Alternating layout visually balanced (mapshot ~45%, stats ~55%)
- [ ] Mapshots fit container without distortion (object-fit: cover)
- [ ] Annotations accurately reflect win rate gaps
- [ ] Maps without data for one team handled gracefully
- [ ] Scrolling works when content exceeds panel height
- [ ] CSS uses rem units throughout (except borders)
- [ ] No interactive handlers needed (simplest of the three sub-tabs)
- [ ] State reset clean when switching teams/opponents
