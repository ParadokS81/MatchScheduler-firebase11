# Slice 5.1c: Head-to-Head Compare View

## Slice Definition
- **Slice ID:** 5.1c
- **Name:** Head-to-Head Compare View
- **User Story:** As a user, I can compare my team's match history against a specific opponent to see our head-to-head record and prepare for upcoming matches
- **Success Criteria:**
  - "Compare H2H" button appears in team detail panel
  - H2H view shows win/loss record between two teams
  - Match list filtered to only games where both teams played
  - Per-map breakdown shows which maps favor which team
  - Links to watch demos on QW Hub
  - Works for any two teams with qwHubTag configured

## Problem Statement

When scheduling a match against an opponent, teams want to know:
- What's our historical record against them?
- Which maps do we do well on vs them?
- How recent are our matches?

This helps with:
- Map veto strategy
- Understanding opponent strength
- Building team morale (or setting expectations)

## Solution

Add a "Compare H2H" button to the team detail panel that opens a head-to-head comparison view showing all matches between the user's team and the selected opponent.

---

## Visual Design

### Entry Point - Team Detail Panel

```
┌─────────────────────────────────────────────────────────────────┐
│      ┌───────────┐                                              │
│      │   [-s-]   │    -s- Clan                                  │
│      └───────────┘    Division 1 • 6 players                    │
│                                                                 │
│      [Compare H2H]  ← NEW BUTTON                                │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Roster: ...                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  Recent Matches: ...                                            │
└─────────────────────────────────────────────────────────────────┘
```

### H2H Compare View (Replaces Team Detail)

```
┌─────────────────────────────────────────────────────────────────┐
│  [← Back to Teams]                                              │
│                                                                 │
│  ┌─────────┐              vs              ┌─────────┐          │
│  │  [SLK]  │                              │  [-s-]  │          │
│  │ Slackers│                              │ -s- Clan│          │
│  └─────────┘                              └─────────┘          │
│                                                                 │
│                    ┌─────────────────┐                         │
│                    │    3W - 2L      │                         │
│                    │   (60% win)     │                         │
│                    └─────────────────┘                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Map Breakdown                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  dm2       ████░░░░  1-1   (50%)                               │
│  dm3       ████████  1-0   (100%)                              │
│  schloss   ████░░░░  1-1   (50%)                               │
│  e1m2      ░░░░░░░░  0-0   (—)                                 │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Match History                           [View on QW Hub →]    │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Jan 27   schloss   ]sr[  240 - 220  -s-               W       │
│  Jan 27   dm2       ]sr[  147 - 263  -s-               L       │
│  Jan 27   dm3       ]sr[  298 - 118  -s-               W       │
│  Jan 08   dm2       ]sr[  225 - 184  -s-               W       │
│  Jan 08   e1m2      ]sr[  164 - 299  -s-               L       │
│                                                                 │
│  Showing all 5 matches                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### States

**Loading:**
```
Comparing ]sr[ vs -s-...
⏳ Fetching match history
```

**No Matches Found:**
```
]sr[ vs -s-

No head-to-head matches found

These teams haven't played each other in 4on4 recently.
```

**Missing Hub Tag (User's Team):**
```
⚠️ Your team needs a QW Hub tag configured to compare match history.
   Go to Team Settings to set it up.
```

**Missing Hub Tag (Opponent):**
```
⚠️ This team doesn't have a QW Hub tag configured.
   Match history comparison not available.
```

---

## QWHubService Enhancement

```javascript
// Add to QWHubService

/**
 * Get head-to-head matches between two teams
 * @param {string} team1Tag - First team's QW Hub tag
 * @param {string} team2Tag - Second team's QW Hub tag
 * @param {number} limit - Max matches (default 20)
 * @returns {Promise<H2HResult>}
 */
async function getHeadToHead(team1Tag, team2Tag, limit = 20) {
    if (!team1Tag || !team2Tag) {
        return { matches: [], record: null, mapBreakdown: {} };
    }

    // Cache key combines both teams (sorted for consistency)
    const cacheKey = [team1Tag, team2Tag].sort().join('_vs_');
    const cached = _h2hCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return cached.data;
    }

    try {
        // API query with both teams (cs.{team1,team2} means contains ALL)
        const url = `${API_BASE}` +
            `?select=id,timestamp,map,teams,demo_sha256` +
            `&mode=eq.4on4` +
            `&team_names=cs.${_encodeTeamNames(team1Tag, team2Tag)}` +
            `&order=timestamp.desc` +
            `&limit=${limit}`;

        const response = await fetch(url, {
            headers: { 'apikey': API_KEY }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const rawData = await response.json();
        const result = _processH2HData(rawData, team1Tag, team2Tag);

        // Cache
        _h2hCache.set(cacheKey, {
            data: result,
            fetchedAt: Date.now()
        });

        return result;
    } catch (error) {
        console.error('QWHubService: H2H fetch failed', error);
        throw error;
    }
}

/**
 * Process raw API data into H2H result
 */
function _processH2HData(rawMatches, team1Tag, team2Tag) {
    const matches = [];
    let wins = 0, losses = 0, draws = 0;
    const mapStats = {};  // map -> { wins, losses }

    for (const match of rawMatches) {
        const team1 = match.teams.find(t =>
            t.name.toLowerCase() === team1Tag.toLowerCase()
        );
        const team2 = match.teams.find(t =>
            t.name.toLowerCase() === team2Tag.toLowerCase()
        );

        if (!team1 || !team2) continue;  // Both teams must be present

        const won = team1.frags > team2.frags;
        const lost = team1.frags < team2.frags;
        const result = won ? 'W' : lost ? 'L' : 'D';

        if (won) wins++;
        else if (lost) losses++;
        else draws++;

        // Track per-map stats
        const map = match.map;
        if (!mapStats[map]) {
            mapStats[map] = { wins: 0, losses: 0, draws: 0 };
        }
        if (won) mapStats[map].wins++;
        else if (lost) mapStats[map].losses++;
        else mapStats[map].draws++;

        matches.push({
            id: match.id,
            date: new Date(match.timestamp),
            map: map,
            team1Tag: team1.name,
            team1Score: team1.frags,
            team2Tag: team2.name,
            team2Score: team2.frags,
            result: result,
            demoHash: match.demo_sha256
        });
    }

    return {
        matches,
        record: {
            wins,
            losses,
            draws,
            total: wins + losses + draws,
            winRate: wins + losses > 0
                ? Math.round((wins / (wins + losses)) * 100)
                : null
        },
        mapBreakdown: mapStats
    };
}

/**
 * Get URL for H2H view on QW Hub
 */
function getH2HUrl(team1Tag, team2Tag) {
    return `https://hub.quakeworld.nu/games/?mode=4on4&team=${encodeURIComponent(team1Tag)}&team=${encodeURIComponent(team2Tag)}`;
}

// Add separate cache for H2H
const _h2hCache = new Map();
```

---

## Component Changes

### TeamsBrowserPanel - H2H Button and View

```javascript
// State
let _h2hMode = false;
let _h2hOpponent = null;

// In _renderTeamDetail(team)
function _renderTeamDetail(team) {
    if (_h2hMode && _h2hOpponent) {
        return _renderH2HView(_h2hOpponent);
    }

    // ... existing detail render ...

    // Add H2H button after header
    const canCompare = team.qwHubTag && _getCurrentUserTeamTag();

    return `
        <div class="team-detail">
            ${_renderTeamHeader(team)}

            ${canCompare ? `
                <button class="btn-secondary btn-sm w-full mt-2"
                        onclick="TeamsBrowserPanel.startH2H('${team.id}')">
                    Compare H2H vs ${team.teamTag}
                </button>
            ` : ''}

            ${_renderTeamRoster(team)}
            ${_renderMatchHistory(team)}
        </div>
    `;
}

function _getCurrentUserTeamTag() {
    const currentTeam = MatchSchedulerApp?.getSelectedTeam?.();
    return currentTeam?.qwHubTag || null;
}

// H2H View
function _renderH2HView(opponent) {
    const userTeam = MatchSchedulerApp.getSelectedTeam();

    return `
        <div class="h2h-view">
            <button class="btn-link text-sm mb-4" onclick="TeamsBrowserPanel.exitH2H()">
                ← Back to Teams
            </button>

            <div class="h2h-header">
                <div class="h2h-team">
                    ${_renderTeamBadge(userTeam)}
                    <span class="team-name">${userTeam.teamName}</span>
                </div>
                <span class="h2h-vs">vs</span>
                <div class="h2h-team">
                    ${_renderTeamBadge(opponent)}
                    <span class="team-name">${opponent.teamName}</span>
                </div>
            </div>

            <div id="h2h-content"
                 data-team1="${userTeam.qwHubTag}"
                 data-team2="${opponent.qwHubTag}">
                <div class="loading-spinner">Comparing...</div>
            </div>
        </div>
    `;
}

async function _loadH2HData(team1Tag, team2Tag) {
    const container = document.getElementById('h2h-content');
    if (!container) return;

    try {
        const result = await QWHubService.getHeadToHead(team1Tag, team2Tag);

        if (result.matches.length === 0) {
            container.innerHTML = `
                <div class="h2h-empty">
                    <p class="text-lg font-semibold">No head-to-head matches found</p>
                    <p class="text-muted-foreground text-sm mt-2">
                        These teams haven't played each other in 4on4 recently.
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            ${_renderH2HRecord(result.record)}
            ${_renderMapBreakdown(result.mapBreakdown)}
            ${_renderH2HMatchList(result.matches, team1Tag, team2Tag)}
        `;
    } catch (error) {
        container.innerHTML = `
            <div class="h2h-error">
                <p>⚠️ Couldn't load comparison</p>
                <button class="btn-link" onclick="TeamsBrowserPanel.retryH2H()">Retry</button>
            </div>
        `;
    }
}

function _renderH2HRecord(record) {
    return `
        <div class="h2h-record">
            <div class="record-box">
                <span class="record-value">${record.wins}W - ${record.losses}L</span>
                ${record.winRate !== null
                    ? `<span class="record-rate">(${record.winRate}% win)</span>`
                    : ''
                }
            </div>
        </div>
    `;
}

function _renderMapBreakdown(mapStats) {
    const maps = Object.entries(mapStats).sort((a, b) => {
        // Sort by total games played, then by name
        const totalA = a[1].wins + a[1].losses;
        const totalB = b[1].wins + b[1].losses;
        return totalB - totalA || a[0].localeCompare(b[0]);
    });

    if (maps.length === 0) return '';

    return `
        <div class="map-breakdown">
            <h4 class="section-title">Map Breakdown</h4>
            <div class="map-list">
                ${maps.map(([map, stats]) => {
                    const total = stats.wins + stats.losses;
                    const winPct = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
                    return `
                        <div class="map-row">
                            <span class="map-name">${map}</span>
                            <div class="map-bar">
                                <div class="map-bar-fill" style="width: ${winPct}%"></div>
                            </div>
                            <span class="map-record">${stats.wins}-${stats.losses}</span>
                            <span class="map-pct">${total > 0 ? `${winPct}%` : '—'}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function _renderH2HMatchList(matches, team1Tag, team2Tag) {
    return `
        <div class="h2h-matches">
            <div class="section-header">
                <h4 class="section-title">Match History</h4>
                <a href="${QWHubService.getH2HUrl(team1Tag, team2Tag)}"
                   target="_blank" class="link-muted text-xs">
                    View on QW Hub →
                </a>
            </div>
            <div class="match-list">
                ${matches.map(m => _renderH2HMatchRow(m)).join('')}
            </div>
            <p class="text-xs text-muted-foreground mt-2">
                Showing all ${matches.length} matches
            </p>
        </div>
    `;
}

// Public methods
function startH2H(opponentTeamId) {
    const opponent = _allTeams.find(t => t.id === opponentTeamId);
    if (!opponent) return;

    _h2hMode = true;
    _h2hOpponent = opponent;
    _renderDetailPanel();

    // Load data
    const userTag = _getCurrentUserTeamTag();
    if (userTag && opponent.qwHubTag) {
        _loadH2HData(userTag, opponent.qwHubTag);
    }
}

function exitH2H() {
    _h2hMode = false;
    _h2hOpponent = null;
    _renderDetailPanel();
}
```

---

## CSS Additions

```css
/* H2H View */
.h2h-view {
    padding: 1rem;
}

.h2h-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
}

.h2h-team {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
}

.h2h-vs {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--muted-foreground);
}

.h2h-record {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
}

.record-box {
    background: var(--muted);
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    text-align: center;
}

.record-value {
    font-size: 1.5rem;
    font-weight: 700;
}

.record-rate {
    display: block;
    font-size: 0.875rem;
    color: var(--muted-foreground);
}

/* Map Breakdown */
.map-breakdown {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
}

.map-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
}

.map-row {
    display: grid;
    grid-template-columns: 4rem 1fr 2.5rem 2.5rem;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.75rem;
}

.map-name {
    font-family: monospace;
}

.map-bar {
    height: 0.5rem;
    background: var(--muted);
    border-radius: 0.25rem;
    overflow: hidden;
}

.map-bar-fill {
    height: 100%;
    background: var(--primary);
    transition: width 300ms ease;
}

.map-record {
    text-align: right;
    font-family: monospace;
}

.map-pct {
    text-align: right;
    color: var(--muted-foreground);
}

/* H2H Match List */
.h2h-matches {
    margin-top: 1rem;
}

.h2h-empty {
    text-align: center;
    padding: 2rem;
}
```

---

## Data Flow

```
User viewing team detail
    ↓
Clicks "Compare H2H" button
    ↓
startH2H(opponentTeamId) called
    ↓
Set _h2hMode = true, store opponent
    ↓
Re-render detail panel → shows H2H view
    ↓
Get user's team qwHubTag + opponent qwHubTag
    ↓
QWHubService.getHeadToHead(tag1, tag2)
    ↓
API query with both teams in cs.{team1,team2}
    ↓
Process results → record, mapBreakdown, matches
    ↓
Render H2H components
    ↓
User clicks "Back to Teams"
    ↓
exitH2H() → _h2hMode = false
    ↓
Re-render normal team detail
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Toggle H2H mode: State change + DOM swap
- Cached H2H data: In-memory lookup
- Back button: Instant state reset

COLD PATHS (<2s):
- First H2H fetch: ~500-1000ms (API call)
- Processing results: <50ms (in-browser)
```

---

## Test Scenarios

### Entry
- [ ] "Compare H2H" button appears when both teams have qwHubTag
- [ ] Button hidden when user's team has no qwHubTag
- [ ] Button hidden when opponent has no qwHubTag
- [ ] Clicking button switches to H2H view

### H2H View
- [ ] Shows both team badges and names
- [ ] Record shows wins-losses and win percentage
- [ ] Map breakdown shows all played maps
- [ ] Map bars reflect win percentage
- [ ] Match list shows all H2H games
- [ ] "View on QW Hub" opens filtered page
- [ ] Back button returns to team detail

### Edge Cases
- [ ] No H2H matches found shows appropriate message
- [ ] API error shows retry option
- [ ] Very long match history renders correctly
- [ ] Special characters in team tags work
- [ ] Same team selected (shouldn't happen but handle gracefully)

### Integration
- [ ] Switching teams in list exits H2H mode
- [ ] Search/filter doesn't break H2H state
- [ ] Tab switching preserves or resets state appropriately

---

## File Changes Summary

```
MODIFIED FILES:
public/js/services/QWHubService.js
  - Add getHeadToHead() method
  - Add getH2HUrl() helper
  - Add _processH2HData() internal
  - Add _h2hCache for H2H-specific caching

public/js/components/TeamsBrowserPanel.js
  - Add _h2hMode, _h2hOpponent state
  - Add "Compare H2H" button to team detail
  - Add _renderH2HView()
  - Add _renderH2HRecord(), _renderMapBreakdown()
  - Add startH2H(), exitH2H() public methods
  - Add _loadH2HData() async loader

src/css/input.css
  - Add h2h-view styles
  - Add h2h-header, h2h-record styles
  - Add map-breakdown styles
```

---

## Dependencies

- Slice 5.1: TeamsBrowserPanel with team detail panel
- Slice 5.1a: qwHubTag field on teams (both teams need it)
- Slice 5.1b: QWHubService foundation
- User must have a team with qwHubTag configured

---

## Future Enhancements (Out of Scope)

- Player-level stats in H2H matches
- Filter H2H by date range
- Export H2H report
- Compare against multiple teams at once
- Integration with Tournament tab (auto-compare against bracket opponents)

---

*Slice created: 2026-01-29*
*Depends on: Slice 5.1, 5.1a, 5.1b*
*Completes: QW Hub integration feature set*
