# Slice 5.2b: Match History Split-Panel

## Slice Definition
- **Slice ID:** 5.2b
- **Name:** Match History Split-Panel with Hover Preview
- **Depends on:** Slice 5.2a (Team Details Landing Page — tab infrastructure)
- **User Story:** As a user, I can browse a team's match history with filters and preview scoreboards by hovering or clicking matches, so I can quickly assess individual match results without leaving the page
- **Success Criteria:**
  - Match History tab shows left/right split layout
  - Left panel: filterable match list (map filter, chronological default)
  - Right panel: scoreboard preview with mapshot background
  - Hover a match = preview scoreboard (lightweight, instant from cached data)
  - Click a match = sticky selection + key team stats bar below scoreboard
  - Clicked match shows "View on QW Hub" link (game ID URL)
  - "Full Stats" button opens stats popout (Slice 5.2c placeholder)
  - Fetches up to 20 matches (increased from current 5)
  - Filter dropdowns derived from fetched data (no extra API calls)

## Problem Statement

The current match history (Slice 5.1b) is a simple vertical list with expandable scoreboards inline. This works for a quick glance at 5 matches, but doesn't scale well for deeper browsing:

- No filtering — can't isolate matches on a specific map
- Inline scoreboards push content down, making it hard to scan
- No way to quickly compare multiple matches visually
- Key stats (efficiency, RL accuracy) require navigating to QWHub

The redesigned Match History tab needs to let users browse matches efficiently while keeping scoreboards visible without disrupting the list flow.

## Solution

A **split-panel layout** within the Match History tab:

- **Left panel (~40% width):** Scrollable match list with filter bar at top
- **Right panel (~60% width):** Scoreboard preview area (fixed, doesn't scroll with list)

Interaction model:
1. **Hover** a match row = preview its scoreboard in the right panel (instant, uses already-fetched Supabase teams/players data)
2. **Click** a match row = sticky selection — scoreboard stays, key team stats bar appears below, action links shown
3. Click another match = replaces the sticky selection

This keeps the list scannable while giving a rich preview without layout shifts.

---

## Visual Design

### Match History Tab — Default (no selection)

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│  [All Maps ▼]                                                   │
│ ┌────────────────────────┬──────────────────────────────────────┐
│ │                        │                                      │
│ │ Nov 25  e1m2  vs pol   │                                      │
│ │         212 - 286    L │        Hover a match to              │
│ │                        │        preview scoreboard            │
│ │ Nov 25  e1m2  vs pol   │                                      │
│ │         220 - 201    W │                                      │
│ │                        │                                      │
│ │ Nov 25  dm3   vs pol   │                                      │
│ │         136 - 270    L │                                      │
│ │                        │                                      │
│ │ Nov 22  dm4  vs book   │                                      │
│ │         198 - 165    W │                                      │
│ │                        │                                      │
│ │ Nov 20  dm2  vs tsq    │                                      │
│ │         245 - 220    W │                                      │
│ │                        │                                      │
│ └────────────────────────┴──────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Match History Tab — Hover Preview

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│  [All Maps ▼]                                                   │
│ ┌────────────────────────┬──────────────────────────────────────┐
│ │                        │  ┌────────────────────────────────┐  │
│ │ Nov 25  e1m2  vs pol   │  │       SCOREBOARD               │  │
│ │         212 - 286    L │  │     (e1m2 mapshot bg)          │  │
│ │─────────────────────── │  │                                │  │
│ │ Nov 25  e1m2  vs pol ◄ │  │  ]sr[ 220   vs   pol 201      │  │
│ │         220 - 201    W │  │  player rows...                │  │
│ │─────────────────────── │  │                                │  │
│ │ Nov 25  dm3   vs pol   │  └────────────────────────────────┘  │
│ │         136 - 270    L │                                      │
│ │                        │                                      │
│ │ Nov 22  dm4  vs book   │                                      │
│ │         198 - 165    W │                                      │
│ │                        │                                      │
│ └────────────────────────┴──────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Match History Tab — Clicked (Sticky + Stats)

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│  [All Maps ▼]                                                   │
│ ┌────────────────────────┬──────────────────────────────────────┐
│ │                        │  ┌────────────────────────────────┐  │
│ │ Nov 25  e1m2  vs pol   │  │       SCOREBOARD               │  │
│ │         212 - 286    L │  │     (e1m2 mapshot bg)          │  │
│ │─────────────────────── │  │                                │  │
│ │ Nov 25  e1m2  vs pol ● │  │  ]sr[ 220   vs   pol 201      │  │
│ │         220 - 201    W │  │  player rows...                │  │
│ │─────────────────────── │  │                                │  │
│ │ Nov 25  dm3   vs pol   │  └────────────────────────────────┘  │
│ │         136 - 270    L │                                      │
│ │                        │  Eff: 73%  RL#: 26  Dmg: 40685      │
│ │ Nov 22  dm4  vs book   │                                      │
│ │         198 - 165    W │  [View on QW Hub →]  [Full Stats ⧉] │
│ │                        │                                      │
│ └────────────────────────┴──────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Match History — No Tag

```
┌─────────────────────────────────────────────────────────────────┐
│  [Details]   [Match History]   [Head to Head]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Match history not available                                    │
│  Team leader can configure QW Hub tag in Team Settings          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Changes

### Key Design Decisions

1. **Hover = instant preview from Supabase data** — The scoreboard uses teams/players arrays already fetched in the match list response. No additional API call on hover. This makes previewing feel instant.

2. **Click = sticky + fetch ktxstats for team stats bar** — Only on click do we call `getGameStats(demoHash)` to get the detailed ktxstats data. This is a cold-path call (~500ms, cached indefinitely). We show a small loading indicator for the stats bar only.

3. **Increased fetch limit to 20** — Details tab covers activity summary. Match History tab needs more matches for meaningful filtering. 20 is a good balance between data richness and API load.

4. **Filters derived from data** — The map dropdown is populated from the unique maps in the fetched matches. No extra API calls. If all 20 matches are dm2, only dm2 appears in the filter.

5. **Reuse existing scoreboard renderer** — `_renderScoreboard(match)` from Slice 5.1b is reused as-is. It renders into the right panel instead of inline.

### Component Changes: TeamsBrowserPanel

**New private state:**
```javascript
let _historyMatches = [];        // Full fetched match list (up to 20)
let _historyMapFilter = '';       // '' = all maps
let _hoveredMatchId = null;       // Currently hovered match (preview)
let _selectedMatchId = null;      // Clicked/sticky match
let _selectedMatchStats = null;   // ktxstats for selected match (null until loaded)
let _statsLoading = false;        // Loading indicator for ktxstats fetch
```

**New methods:**
- `_renderHistoryTab(team)` — Split-panel layout
- `_renderMatchList(matches)` — Left panel with match rows
- `_renderMatchFilters()` — Map dropdown derived from `_historyMatches`
- `_renderPreviewPanel()` — Right panel: scoreboard + stats bar + links
- `_renderTeamStatsBar(stats, match)` — Key aggregated stats from ktxstats
- `_handleMatchHover(matchId)` — Updates preview (instant)
- `_handleMatchClick(matchId)` — Sticks selection + fetches ktxstats
- `_handleMapFilterChange(map)` — Filters match list
- `_loadHistoryMatches(teamTag)` — Fetches 20 matches, populates filters

**Modified methods:**
- `_renderCurrentView()` — When history tab active + team has tag, call `_loadHistoryMatches`

### Service Changes: QWHubService

**Modified method: `getRecentMatches(teamTag, limit)`**

The existing method already supports a `limit` parameter. We just call it with `limit=20` from the history tab. No service changes needed unless we want a separate cache entry for the larger dataset.

**Recommendation:** Keep using `getRecentMatches` but with `limit=20`. The 5-min cache will serve both the details tab (map stats from `getTeamMapStats`) and the history tab (match list from `getRecentMatches` with higher limit). If the details tab already cached 5 matches, the history tab fetch will replace the cache with 20.

Alternatively, add a note that `getRecentMatches` should always cache the largest fetched limit. For simplicity, we'll just call `getRecentMatches(tag, 20)` and the existing cache logic works fine — it caches whatever was last fetched.

---

## Implementation Details

### History Tab Renderer

```javascript
function _renderHistoryTab(team) {
    const hasTag = !!team.teamTag;

    if (!hasTag) {
        return `
            <div class="text-sm text-muted-foreground">
                <p>Match history not available</p>
                <p class="text-xs mt-1">Team leader can configure QW Hub tag in Team Settings</p>
            </div>
        `;
    }

    return `
        <div class="match-history-split">
            <!-- Left: Match List -->
            <div class="mh-list-panel">
                ${_renderMatchFilters()}
                <div class="mh-match-list" id="mh-match-list">
                    <div class="text-xs text-muted-foreground">Loading matches...</div>
                </div>
            </div>

            <!-- Right: Preview Panel -->
            <div class="mh-preview-panel" id="mh-preview-panel">
                <div class="mh-preview-empty">
                    <p class="text-xs text-muted-foreground">Hover a match to preview scoreboard</p>
                </div>
            </div>
        </div>
    `;
}
```

### Match List Rendering

```javascript
function _renderMatchList(matches) {
    if (matches.length === 0) {
        return '<p class="text-xs text-muted-foreground p-2">No matches found</p>';
    }

    return matches.map(m => {
        const dateStr = m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const resultClass = m.result === 'W' ? 'mh-result-win'
                          : m.result === 'L' ? 'mh-result-loss'
                          : 'mh-result-draw';
        const isSelected = m.id === _selectedMatchId;
        const isHovered = m.id === _hoveredMatchId;

        return `
            <div class="mh-match-row ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}"
                 data-match-id="${m.id}"
                 onmouseenter="TeamsBrowserPanel.previewMatch('${m.id}')"
                 onmouseleave="TeamsBrowserPanel.clearPreview()"
                 onclick="TeamsBrowserPanel.selectMatch('${m.id}')">
                <div class="mh-match-meta">
                    <span class="mh-match-date">${dateStr}</span>
                    <span class="mh-match-map">${m.map}</span>
                </div>
                <div class="mh-match-score">
                    <span class="mh-match-tag">${_escapeHtml(m.ourTag)}</span>
                    <span class="mh-match-frags">${m.ourScore} - ${m.opponentScore}</span>
                    <span class="mh-match-tag">${_escapeHtml(m.opponentTag)}</span>
                </div>
                <span class="mh-match-result ${resultClass}">${m.result}</span>
            </div>
        `;
    }).join('');
}
```

### Preview Panel Rendering

```javascript
function _renderPreviewPanel(matchId) {
    const match = _matchDataById.get(String(matchId));
    if (!match) return '';

    const isSticky = matchId === _selectedMatchId;

    let statsHtml = '';
    if (isSticky) {
        if (_statsLoading) {
            statsHtml = '<div class="mh-stats-bar text-xs text-muted-foreground">Loading stats...</div>';
        } else if (_selectedMatchStats) {
            statsHtml = _renderTeamStatsBar(_selectedMatchStats, match);
        }

        const hubUrl = `https://hub.quakeworld.nu/games/?gameId=${match.id}`;
        statsHtml += `
            <div class="mh-actions">
                <a href="${hubUrl}" target="_blank" class="mh-action-link">
                    View on QW Hub &rarr;
                </a>
                <button class="mh-action-link" onclick="TeamsBrowserPanel.openFullStats('${match.id}')">
                    Full Stats &#x29C9;
                </button>
            </div>
        `;
    }

    return `
        ${_renderScoreboard(match)}
        ${statsHtml}
    `;
}
```

### Team Stats Bar (Trimmed Key Stats)

```javascript
function _renderTeamStatsBar(ktxstats, match) {
    if (!ktxstats || !ktxstats.players) return '';

    // Find the "our" team tag from the match
    const ourTagLower = match.ourTag.toLowerCase();

    // Aggregate stats for our team
    const ourPlayers = ktxstats.players.filter(p =>
        QWHubService.qwToAscii(p.team).toLowerCase() === ourTagLower
    );

    if (ourPlayers.length === 0) return '';

    const totalKills = ourPlayers.reduce((sum, p) => sum + (p.stats?.kills || 0), 0);
    const totalDeaths = ourPlayers.reduce((sum, p) => sum + (p.stats?.deaths || 0), 0);
    const eff = totalDeaths + totalKills > 0
        ? Math.round(100 * totalKills / (totalKills + totalDeaths))
        : 0;

    const totalDmgGiven = ourPlayers.reduce((sum, p) => sum + (p.dmg?.given || 0), 0);

    const totalRLHits = ourPlayers.reduce((sum, p) => sum + (p.weapons?.rl?.acc?.hits || 0), 0);

    // LG% — average across players who used LG
    const lgPlayers = ourPlayers.filter(p => p.weapons?.lg?.acc?.attacks > 0);
    const lgPct = lgPlayers.length > 0
        ? Math.round(lgPlayers.reduce((sum, p) => {
            const lg = p.weapons.lg.acc;
            return sum + (lg.hits / lg.attacks * 100);
        }, 0) / lgPlayers.length)
        : null;

    return `
        <div class="mh-stats-bar">
            <span class="mh-stat">
                <span class="mh-stat-label">Eff</span>
                <span class="mh-stat-value">${eff}%</span>
            </span>
            <span class="mh-stat">
                <span class="mh-stat-label">RL#</span>
                <span class="mh-stat-value">${totalRLHits}</span>
            </span>
            <span class="mh-stat">
                <span class="mh-stat-label">Dmg</span>
                <span class="mh-stat-value">${(totalDmgGiven / 1000).toFixed(1)}k</span>
            </span>
            ${lgPct !== null ? `
                <span class="mh-stat">
                    <span class="mh-stat-label">LG</span>
                    <span class="mh-stat-value">${lgPct}%</span>
                </span>
            ` : ''}
        </div>
    `;
}
```

### Hover / Click Handlers

```javascript
function previewMatch(matchId) {
    // Don't override sticky selection on hover
    if (_selectedMatchId) return;

    _hoveredMatchId = matchId;
    const panel = document.getElementById('mh-preview-panel');
    if (panel) {
        panel.innerHTML = _renderPreviewPanel(matchId);
    }
}

function clearPreview() {
    _hoveredMatchId = null;
    // If no sticky selection, clear preview
    if (!_selectedMatchId) {
        const panel = document.getElementById('mh-preview-panel');
        if (panel) {
            panel.innerHTML = `
                <div class="mh-preview-empty">
                    <p class="text-xs text-muted-foreground">Hover a match to preview scoreboard</p>
                </div>
            `;
        }
    }
}

async function selectMatch(matchId) {
    // Toggle off if clicking same match
    if (_selectedMatchId === String(matchId)) {
        _selectedMatchId = null;
        _selectedMatchStats = null;
        clearPreview();
        _updateMatchListHighlights();
        return;
    }

    _selectedMatchId = String(matchId);
    _selectedMatchStats = null;
    _statsLoading = true;
    _updateMatchListHighlights();

    // Render scoreboard immediately (from Supabase data)
    const panel = document.getElementById('mh-preview-panel');
    if (panel) {
        panel.innerHTML = _renderPreviewPanel(matchId);
    }

    // Fetch ktxstats for detailed team stats (cold path)
    const match = _matchDataById.get(String(matchId));
    if (match?.demoHash) {
        try {
            const stats = await QWHubService.getGameStats(match.demoHash);
            // Guard: still the same selected match?
            if (_selectedMatchId === String(matchId)) {
                _selectedMatchStats = stats;
                _statsLoading = false;
                if (panel) {
                    panel.innerHTML = _renderPreviewPanel(matchId);
                }
            }
        } catch (error) {
            console.error('Failed to load game stats:', error);
            _statsLoading = false;
            if (_selectedMatchId === String(matchId) && panel) {
                panel.innerHTML = _renderPreviewPanel(matchId);
            }
        }
    } else {
        _statsLoading = false;
    }
}

function _updateMatchListHighlights() {
    const rows = document.querySelectorAll('.mh-match-row');
    rows.forEach(row => {
        row.classList.toggle('selected', row.dataset.matchId === _selectedMatchId);
    });
}
```

---

## CSS Additions

Add to `src/css/input.css`:

```css
/* ============================================
   Slice 5.2b: Match History Split-Panel
   ============================================ */

.match-history-split {
    display: flex;
    height: 100%;
    gap: 0;
}

/* Left panel: match list */
.mh-list-panel {
    width: 40%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    min-width: 0;
}

/* Filter bar */
.mh-filters {
    padding: 0.5rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.mh-filter-select {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    color: var(--foreground);
    cursor: pointer;
}

/* Match list */
.mh-match-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
}

.mh-match-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    transition: background-color 0.1s;
    gap: 0.5rem;
}

.mh-match-row:hover,
.mh-match-row.hovered {
    background: var(--muted);
}

.mh-match-row.selected {
    background: hsl(var(--primary-hsl) / 0.15);
    border-left: 2px solid var(--primary);
}

.mh-match-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.mh-match-date {
    font-size: 0.6875rem;
    color: var(--muted-foreground);
}

.mh-match-map {
    font-size: 0.75rem;
    color: var(--foreground);
    font-weight: 600;
}

.mh-match-score {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
}

.mh-match-tag {
    color: var(--muted-foreground);
    font-size: 0.6875rem;
    max-width: 2.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mh-match-frags {
    color: var(--foreground);
    font-weight: 600;
    white-space: nowrap;
}

.mh-match-result {
    font-size: 0.75rem;
    font-weight: 700;
    flex-shrink: 0;
    width: 1rem;
    text-align: center;
}

.mh-result-win { color: rgb(34, 197, 94); }
.mh-result-loss { color: rgb(239, 68, 68); }
.mh-result-draw { color: var(--muted-foreground); }

/* Right panel: preview */
.mh-preview-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-y: auto;
}

.mh-preview-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Scoreboard in preview reuses existing .match-scoreboard styles */

/* Stats bar */
.mh-stats-bar {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}

.mh-stat {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.mh-stat-label {
    font-size: 0.625rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
}

.mh-stat-value {
    font-size: 0.75rem;
    color: var(--foreground);
    font-weight: 600;
}

/* Action links */
.mh-actions {
    display: flex;
    gap: 1rem;
    padding: 0.375rem 0.75rem;
    flex-shrink: 0;
}

.mh-action-link {
    font-size: 0.6875rem;
    color: var(--primary);
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    text-decoration: none;
    transition: opacity 0.15s;
}

.mh-action-link:hover {
    opacity: 0.8;
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Hover preview: Scoreboard rendered from already-fetched Supabase data (no API call)
- Filter change: Client-side filter on _historyMatches array + DOM update
- Match list scroll: Native browser scrolling

COLD PATHS (<2s):
- Initial match list load: getRecentMatches(tag, 20) — ~500-1000ms, 5-min cache
- ktxstats fetch on click: getGameStats(demoHash) — ~300-500ms, cached indefinitely
- First click stats: Shows "Loading stats..." then renders when ready

BACKEND PERFORMANCE:
- No new Supabase queries (reuses getRecentMatches with higher limit)
- ktxstats is CDN-hosted, no rate limits
```

---

## Data Flow

```
User switches to Match History tab
    → _activeTab = 'history'
    → _renderHistoryTab(team)
        → Split layout rendered with loading placeholder
    → _loadHistoryMatches(teamTag)
        → QWHubService.getRecentMatches(teamTag, 20)
            → Cache hit? Instant
            → Cache miss? Supabase fetch
        → _historyMatches = matches
        → Populate _matchDataById map
        → Derive unique maps for filter dropdown
        → Render match list in left panel

User hovers a match row
    → previewMatch(matchId)
        → _hoveredMatchId = matchId
        → _renderPreviewPanel(matchId) into right panel
            → _renderScoreboard(match) — instant from Supabase data

User moves mouse away
    → clearPreview()
        → If no sticky selection: show "hover to preview" placeholder
        → If sticky selection exists: do nothing (keep showing selected)

User clicks a match row
    → selectMatch(matchId)
        → _selectedMatchId = matchId
        → Render scoreboard immediately
        → Fetch ktxstats async → _selectedMatchStats
        → Re-render preview with stats bar + action links
        → Guard: verify selected match hasn't changed during fetch

User changes map filter
    → _handleMapFilterChange(map)
        → _historyMapFilter = map
        → Filter _historyMatches by map
        → Re-render match list (left panel only)
        → Clear selection if filtered match is no longer visible
```

---

## Test Scenarios

- [ ] Match History tab shows split-panel layout when team has tag
- [ ] Match list shows up to 20 matches with correct date/map/score/result
- [ ] Hovering a match shows scoreboard in right panel instantly
- [ ] Moving mouse away from match clears preview (when no selection)
- [ ] Clicking a match sticks the scoreboard in preview
- [ ] Clicking same match again un-sticks it (toggle off)
- [ ] Sticky selection persists while hovering other matches
- [ ] Key stats bar shows Eff%, RL#, Dmg after ktxstats loads
- [ ] "Loading stats..." shows while ktxstats is fetching
- [ ] "View on QW Hub" link opens correct game ID URL in new tab
- [ ] "Full Stats" button exists (placeholder for Slice 5.2c)
- [ ] Map filter dropdown lists only maps present in fetched matches
- [ ] Filtering by map updates match list, preserving selection if match is still visible
- [ ] Filtering by map clears selection if selected match is no longer in filtered list
- [ ] Teams without teamTag show "not available" message
- [ ] Race condition: switching teams during fetch doesn't render stale data
- [ ] Race condition: clicking different match during ktxstats fetch shows correct stats
- [ ] LG% stat only shows if any player used lightning gun
- [ ] Empty match list shows appropriate message ("No matches found")

## Common Integration Pitfalls

- [ ] Hover preview must NOT override sticky selection — check `_selectedMatchId` in `previewMatch()`
- [ ] ktxstats player team names are QW-encoded — must use `qwToAscii()` for comparison
- [ ] `_matchDataById` must be populated before hover/click handlers work — ensure matches are cached during list render
- [ ] Map filter select must re-derive options when match list is refreshed (new team selected)
- [ ] Expose `previewMatch`, `clearPreview`, `selectMatch`, `openFullStats` in public API for onclick handlers
- [ ] Scoreboard rendering reuses existing `_renderScoreboard()` — don't duplicate
- [ ] Reset `_selectedMatchId`, `_hoveredMatchId`, `_selectedMatchStats` when switching teams

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/js/components/TeamsBrowserPanel.js` | Modify | Add history tab renderer, split-panel, hover/click handlers |
| `src/css/input.css` | Modify | Add split-panel, match list, preview panel styles |

No service changes needed — uses existing `getRecentMatches()` and `getGameStats()`.

## Quality Checklist

- [ ] Split-panel layout fills available height without scrollbar on outer container
- [ ] Left panel scrolls independently from right panel
- [ ] Scoreboard in right panel uses same rendering as existing inline scoreboards
- [ ] Match row highlights (hover vs selected) are visually distinct
- [ ] ktxstats fetch is guarded against race conditions (team switch, rapid clicks)
- [ ] Filter dropdown resets to "All Maps" when switching teams
- [ ] CSS uses rem units throughout (except borders)
- [ ] All public methods exposed for onclick handlers in HTML
