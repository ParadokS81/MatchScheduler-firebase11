# Slice 5.2c: Match Stats Popout Modal

## Slice Definition
- **Slice ID:** 5.2c
- **Name:** Match Stats Popout Modal (Trimmed ktxstats View)
- **Depends on:** Slice 5.2b (Match History Split-Panel — "Full Stats" button)
- **User Story:** As a user, I can open a detailed stats view for any match in a popout modal, allowing me to compare stats across multiple matches side by side, so I can do crude performance analysis without leaving the app
- **Success Criteria:**
  - "Full Stats" button in Match History preview opens a popout modal
  - Modal shows a trimmed stats table with the most relevant columns
  - Both teams' players displayed, grouped by team, sorted by frags
  - Direct link to QW Hub game page for full stats + demo streaming
  - Multiple modals can be open simultaneously (crude H2H comparison)
  - Modal is draggable so users can position them for side-by-side comparison
  - Modal closes on X button or Escape key

## Problem Statement

The QWHub stats table has ~25 columns, which is far too dense to display inline in our grid-constrained layout. But users want to examine match stats to assess player and team performance — especially when comparing across matches (e.g., "how did our team do vs pol on dm2 last week vs this week?").

The Match History tab (Slice 5.2b) shows a trimmed stats bar (Eff%, RL#, Dmg), but users want to drill deeper into individual player stats without navigating to an external site.

## Solution

A **popout modal** triggered by the "Full Stats" button in the Match History preview panel. Key design decisions:

1. **Trimmed columns** — Show only the most meaningful stats for quick analysis, not the full ktxstats dump
2. **Multiple instances** — Allow opening several stat modals at once, enabling side-by-side comparison
3. **Draggable** — Users can reposition modals to arrange them for comparison
4. **QW Hub link** — For those who want the complete view + demo streaming

### Trimmed Column Selection

From the full ktxstats table, we keep these columns:

| Column | Why | Source |
|--------|-----|--------|
| **Frags** | Primary score metric | `stats.frags` |
| **Name** | Player identity | `name` (with QW color rendering) |
| **Eff%** | Universal skill indicator | `kills / (kills + deaths)` |
| **Kills** | Actual kills (not frags) | `stats.kills` |
| **Deaths** | Survival metric | `stats.deaths` |
| **RL#** | Rocket direct hits — key mechanical skill | `weapons.rl.acc.hits` |
| **LG%** | Lightning accuracy — top-tier skill indicator | `weapons.lg.acc.hits / attacks` |
| **SG%** | Shotgun accuracy — bread-and-butter weapon | `weapons.sg.acc.hits / attacks` |
| **Dmg Given** | Total damage output | `dmg.given` |
| **Dmg Taken** | Survivability | `dmg.taken` |
| **RA** | Red armor pickups — map control indicator | `items.ra.took` |
| **YA** | Yellow armor pickups | `items.ya.took` |

**Dropped columns:** Bores (suicides), TKs, EWEP, To Die, MH, GA, Q/P/R, speed, RL(t/k/d), LG(t/k/d). These are useful for deep analysis but not for quick scanning.

---

## Visual Design

### Stats Modal Layout

```
┌─── Match Stats: ]sr[ vs pol — dm2 (Nov 25) ───── [QW Hub →] [✕] ─┐
│                                                                     │
│  Frags  Name          Eff%  Kills Deaths RL#  LG%  SG%  Dmg   RA YA│
│  ───────────────────────────────────────────────────────────────────│
│  322    ]sr[           73%   331   121   26   43%  —    40685  24 42│
│  103    pol            25%   112   340   22   42%  —    24344  27 13│
│  ═══════════════════════════════════════════════════════════════════│
│  135    · razor        90%   138    16    7   50%  —    14227   4 17│
│   83    · ParadokS     74%    89    31    4   40%  —    11174   4 13│
│   58    · grisling     59%    58    41    0   51%  —     8094   5  9│
│   46    · zero         58%    46    33    0   32%  —     7190  11  3│
│  ───────────────────────────────────────────────────────────────────│
│   31    ThundeR        29%    32    80    1   43%  —     6965   6  5│
│   28    plate          27%    31    84    2   36%  —     6120   5  4│
│   27    tom            31%    30    67    2   40%  —     5456   8  2│
│   17    er             15%    19   109    2   48%  —     5803   8  2│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Multiple Modals (Side by Side)

```
┌─── Match Stats: ]sr[ vs pol — dm2 ──┐  ┌─── Match Stats: ]sr[ vs book — dm4 ──┐
│                                      │  │                                       │
│  Frags  Name     Eff%  ...           │  │  Frags  Name     Eff%  ...            │
│  322    ]sr[      73%  ...           │  │  198    ]sr[      62%  ...            │
│  103    pol       25%  ...           │  │  165    book      48%  ...            │
│  ...                                 │  │  ...                                  │
│                                      │  │                                       │
└──────────────────────────────────────┘  └───────────────────────────────────────┘
```

---

## Architecture Changes

### Key Design Decisions

1. **Independent modal component** — Not part of TeamsBrowserPanel. Modals exist in the global DOM (`document.body`) so they can float above the grid layout. Managed by a simple `MatchStatsModal` module.

2. **Multiple instances via unique IDs** — Each modal gets a unique ID (using matchId). Opening the same match again focuses the existing modal instead of creating a duplicate.

3. **Draggable via mouse events** — Simple drag implementation on the title bar. No library needed.

4. **Data already cached** — By the time the user clicks "Full Stats", the ktxstats data is already fetched and cached (from the click-to-sticky interaction in 5.2b). The modal reads from cache — instant open.

5. **z-index stacking** — Each new modal gets a higher z-index. Clicking a background modal brings it to front.

### New Component: MatchStatsModal

```javascript
const MatchStatsModal = (function() {
    'use strict';

    let _openModals = new Map(); // matchId -> modal DOM element
    let _topZIndex = 1000;

    function open(matchId) { ... }
    function close(matchId) { ... }
    function closeAll() { ... }
    function _render(matchId, ktxstats, matchMeta) { ... }
    function _renderStatsTable(ktxstats, ourTeamTag) { ... }
    function _makeDraggable(modal, handle) { ... }
    function _bringToFront(modal) { ... }

    return { open, close, closeAll };
})();
```

### Component Interaction

```
TeamsBrowserPanel (Match History tab)
    → User clicks "Full Stats" button
    → TeamsBrowserPanel.openFullStats(matchId)
        → Gets match data from _matchDataById
        → Gets ktxstats from QWHubService cache (already fetched on click)
        → Calls MatchStatsModal.open(matchId, ktxstats, matchMeta)

MatchStatsModal
    → Creates draggable modal in document.body
    → Renders trimmed stats table
    → Handles close (X button, Escape key)
    → Handles z-index stacking for multiple modals
```

---

## Implementation Details

### Modal Open

```javascript
function open(matchId, ktxstats, matchMeta) {
    // If already open, bring to front
    if (_openModals.has(matchId)) {
        _bringToFront(_openModals.get(matchId));
        return;
    }

    if (!ktxstats || !ktxstats.players) {
        console.warn('MatchStatsModal: No ktxstats data for match', matchId);
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'match-stats-modal';
    modal.id = `match-stats-modal-${matchId}`;
    modal.style.zIndex = ++_topZIndex;

    // Position: stagger each new modal slightly
    const offset = _openModals.size * 1.5;
    modal.style.top = `${5 + offset}rem`;
    modal.style.left = `${10 + offset}rem`;

    modal.innerHTML = _render(matchId, ktxstats, matchMeta);
    document.body.appendChild(modal);
    _openModals.set(matchId, modal);

    // Draggable title bar
    const handle = modal.querySelector('.msm-header');
    _makeDraggable(modal, handle);

    // Click to bring to front
    modal.addEventListener('mousedown', () => _bringToFront(modal));

    // Close button
    modal.querySelector('.msm-close').addEventListener('click', () => close(matchId));

    // Escape key (only closes topmost)
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            close(matchId);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}
```

### Stats Table Rendering

```javascript
function _renderStatsTable(ktxstats, ourTeamTag) {
    const players = ktxstats.players.filter(p => p.ping > 0); // Filter out spectators/bogus
    const ourTagLower = ourTeamTag.toLowerCase();

    // Group by team
    const teams = {};
    players.forEach(p => {
        const teamKey = QWHubService.qwToAscii(p.team).toLowerCase();
        if (!teams[teamKey]) teams[teamKey] = [];
        teams[teamKey].push(p);
    });

    // Sort each team's players by frags desc
    Object.values(teams).forEach(arr => arr.sort((a, b) => b.stats.frags - a.stats.frags));

    // Team order: our team first, then opponent
    const teamKeys = Object.keys(teams).sort((a, b) => {
        if (a === ourTagLower) return -1;
        if (b === ourTagLower) return 1;
        return 0;
    });

    // Aggregate team stats
    function aggTeam(players) {
        const kills = players.reduce((s, p) => s + (p.stats?.kills || 0), 0);
        const deaths = players.reduce((s, p) => s + (p.stats?.deaths || 0), 0);
        const frags = players.reduce((s, p) => s + (p.stats?.frags || 0), 0);
        const dmgGiven = players.reduce((s, p) => s + (p.dmg?.given || 0), 0);
        const dmgTaken = players.reduce((s, p) => s + (p.dmg?.taken || 0), 0);
        const rlHits = players.reduce((s, p) => s + (p.weapons?.rl?.acc?.hits || 0), 0);
        const ra = players.reduce((s, p) => s + (p.items?.ra?.took || 0), 0);
        const ya = players.reduce((s, p) => s + (p.items?.ya?.took || 0), 0);

        const lgPlayers = players.filter(p => p.weapons?.lg?.acc?.attacks > 0);
        const lgPct = lgPlayers.length > 0
            ? Math.round(lgPlayers.reduce((s, p) => s + p.weapons.lg.acc.hits / p.weapons.lg.acc.attacks * 100, 0) / lgPlayers.length)
            : null;
        const sgPlayers = players.filter(p => p.weapons?.sg?.acc?.attacks > 0);
        const sgPct = sgPlayers.length > 0
            ? Math.round(sgPlayers.reduce((s, p) => s + p.weapons.sg.acc.hits / p.weapons.sg.acc.attacks * 100, 0) / sgPlayers.length)
            : null;

        const eff = kills + deaths > 0 ? Math.round(100 * kills / (kills + deaths)) : 0;

        return { frags, eff, kills, deaths, rlHits, lgPct, sgPct, dmgGiven, dmgTaken, ra, ya };
    }

    // Render header
    let html = `
        <table class="msm-table">
            <thead>
                <tr>
                    <th class="msm-col-frags">Frags</th>
                    <th class="msm-col-name">Name</th>
                    <th>Eff%</th>
                    <th>Kills</th>
                    <th>Deaths</th>
                    <th>RL#</th>
                    <th>LG%</th>
                    <th>SG%</th>
                    <th>Dmg</th>
                    <th>Taken</th>
                    <th class="msm-col-ra">RA</th>
                    <th class="msm-col-ya">YA</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Render team summary rows + player rows per team
    teamKeys.forEach((teamKey, teamIdx) => {
        const teamPlayers = teams[teamKey];
        const agg = aggTeam(teamPlayers);
        const teamDisplay = teamPlayers[0]?.team || teamKey;

        // Team aggregate row
        html += `
            <tr class="msm-team-row">
                <td class="msm-col-frags msm-frags-bold">${agg.frags}</td>
                <td class="msm-col-name msm-team-name">${_escapeHtml(QWHubService.qwToAscii(teamDisplay))}</td>
                <td>${agg.eff}%</td>
                <td>${agg.kills}</td>
                <td>${agg.deaths}</td>
                <td>${agg.rlHits}</td>
                <td>${agg.lgPct !== null ? agg.lgPct + '%' : '—'}</td>
                <td>${agg.sgPct !== null ? agg.sgPct + '%' : '—'}</td>
                <td>${agg.dmgGiven.toLocaleString()}</td>
                <td>${agg.dmgTaken.toLocaleString()}</td>
                <td class="msm-col-ra">${agg.ra}</td>
                <td class="msm-col-ya">${agg.ya}</td>
            </tr>
        `;

        // Divider between teams
        if (teamIdx < teamKeys.length - 1) {
            html += '<tr class="msm-divider"><td colspan="12"></td></tr>';
        }
    });

    // Separator before individual players
    html += '<tr class="msm-separator"><td colspan="12"></td></tr>';

    // Player rows (all players sorted by frags, grouped by team)
    teamKeys.forEach((teamKey, teamIdx) => {
        teams[teamKey].forEach(player => {
            const eff = player.stats.kills + player.stats.deaths > 0
                ? Math.round(100 * player.stats.kills / (player.stats.kills + player.stats.deaths))
                : 0;
            const rlHits = player.weapons?.rl?.acc?.hits || 0;
            const lgAcc = player.weapons?.lg?.acc;
            const lgPct = lgAcc && lgAcc.attacks > 0
                ? Math.round(100 * lgAcc.hits / lgAcc.attacks)
                : null;
            const sgAcc = player.weapons?.sg?.acc;
            const sgPct = sgAcc && sgAcc.attacks > 0
                ? Math.round(100 * sgAcc.hits / sgAcc.attacks)
                : null;

            const nameHtml = QWHubService.coloredQuakeName
                ? QWHubService.coloredQuakeName(player.name, player.name_color)
                : _escapeHtml(QWHubService.qwToAscii(player.name));

            html += `
                <tr class="msm-player-row">
                    <td class="msm-col-frags">${player.stats.frags}</td>
                    <td class="msm-col-name">${nameHtml}</td>
                    <td>${eff}%</td>
                    <td>${player.stats.kills}</td>
                    <td>${player.stats.deaths}</td>
                    <td>${rlHits}</td>
                    <td>${lgPct !== null ? lgPct + '%' : '—'}</td>
                    <td>${sgPct !== null ? sgPct + '%' : '—'}</td>
                    <td>${(player.dmg?.given || 0).toLocaleString()}</td>
                    <td>${(player.dmg?.taken || 0).toLocaleString()}</td>
                    <td class="msm-col-ra">${player.items?.ra?.took || 0}</td>
                    <td class="msm-col-ya">${player.items?.ya?.took || 0}</td>
                </tr>
            `;
        });

        // Team divider (between player groups)
        if (teamIdx < teamKeys.length - 1) {
            html += '<tr class="msm-player-divider"><td colspan="12"></td></tr>';
        }
    });

    html += '</tbody></table>';
    return html;
}
```

### Modal Shell Rendering

```javascript
function _render(matchId, ktxstats, matchMeta) {
    const mapName = ktxstats.map || matchMeta?.map || '?';
    const dateStr = matchMeta?.date
        ? matchMeta.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : ktxstats.date?.split(' ')[0] || '';

    const teamNames = (ktxstats.teams || []).map(t => QWHubService.qwToAscii(t)).join(' vs ');
    const hubUrl = `https://hub.quakeworld.nu/games/?gameId=${matchId}`;

    return `
        <div class="msm-header">
            <div class="msm-title">
                <span class="msm-title-text">Match Stats: ${_escapeHtml(teamNames)} — ${mapName} (${dateStr})</span>
            </div>
            <div class="msm-header-actions">
                <a href="${hubUrl}" target="_blank" class="msm-hub-link">QW Hub &rarr;</a>
                <button class="msm-close" title="Close">&times;</button>
            </div>
        </div>
        <div class="msm-body">
            ${_renderStatsTable(ktxstats, matchMeta?.ourTag || '')}
        </div>
    `;
}
```

### Draggable Implementation

```javascript
function _makeDraggable(modal, handle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.style.cursor = 'grab';

    handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('.msm-close') || e.target.closest('.msm-hub-link')) return;
        isDragging = true;
        handle.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        startLeft = modal.offsetLeft;
        startTop = modal.offsetTop;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        modal.style.left = `${startLeft + e.clientX - startX}px`;
        modal.style.top = `${startTop + e.clientY - startY}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            handle.style.cursor = 'grab';
        }
    });
}
```

---

## CSS Additions

Add to `src/css/input.css`:

```css
/* ============================================
   Slice 5.2c: Match Stats Popout Modal
   ============================================ */

.match-stats-modal {
    position: fixed;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    min-width: 38rem;
    max-width: 52rem;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.msm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    user-select: none;
}

.msm-title-text {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.msm-header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
}

.msm-hub-link {
    font-size: 0.6875rem;
    color: var(--primary);
    text-decoration: none;
    white-space: nowrap;
}

.msm-hub-link:hover {
    opacity: 0.8;
}

.msm-close {
    font-size: 1.25rem;
    color: var(--muted-foreground);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
}

.msm-close:hover {
    color: var(--foreground);
}

.msm-body {
    overflow-y: auto;
    padding: 0.5rem;
}

/* Stats table */
.msm-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.6875rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.msm-table th {
    padding: 0.25rem 0.375rem;
    text-align: right;
    color: var(--muted-foreground);
    font-weight: 600;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
}

.msm-table td {
    padding: 0.25rem 0.375rem;
    text-align: right;
    color: var(--foreground);
    white-space: nowrap;
}

.msm-col-name {
    text-align: left !important;
    min-width: 7rem;
}

.msm-col-frags {
    font-weight: 700;
}

.msm-frags-bold {
    font-size: 0.8125rem;
}

.msm-col-ra { color: rgb(252, 165, 165) !important; } /* red-300 */
.msm-col-ya { color: rgb(253, 224, 71) !important; }  /* yellow-300 */

.msm-team-row {
    background: var(--muted);
}

.msm-team-row td {
    font-weight: 600;
}

.msm-team-name {
    font-weight: 700 !important;
}

.msm-divider td {
    padding: 0;
    height: 2px;
    background: linear-gradient(to right,
        rgba(239, 68, 68, 0.2),
        rgba(251, 146, 60, 0.8),
        rgba(251, 146, 60, 0.2));
}

.msm-separator td {
    padding: 0;
    height: 1px;
    background: var(--border);
}

.msm-player-row:nth-child(odd) {
    background: rgba(148, 163, 184, 0.05);
}

.msm-player-row:hover {
    background: rgba(14, 165, 233, 0.1);
}

.msm-player-divider td {
    padding: 0;
    height: 1px;
    background: var(--border);
}

/* Zero values dimmed */
.msm-table td:empty,
.msm-zero {
    color: var(--muted-foreground);
    opacity: 0.5;
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Modal open: ktxstats already cached from Match History click interaction
- Stats table rendering: Pure DOM creation from cached data
- Modal drag: Native mouse events, no reflow

COLD PATHS (rare):
- If user opens modal without prior click (shouldn't happen in normal flow):
  Would need to fetch ktxstats — but this path doesn't exist in the UI

BACKEND PERFORMANCE:
- No new API calls — reads from QWHubService cache
- No Firebase interactions
```

---

## Data Flow

```
User clicks "Full Stats" in Match History preview
    → TeamsBrowserPanel.openFullStats(matchId)
        → Get match from _matchDataById (Supabase data)
        → Get ktxstats from _selectedMatchStats (already fetched on click)
        → If ktxstats not available, fetch from QWHubService.getGameStats(demoHash)
        → Call MatchStatsModal.open(matchId, ktxstats, matchMeta)

MatchStatsModal.open()
    → Check if modal already open for this matchId
        → Yes: bring existing modal to front
        → No: create new modal
    → Create DOM element in document.body
    → Render header (title, hub link, close button)
    → Render trimmed stats table
    → Make draggable
    → Register close handlers (X button, Escape)

User opens second match stats
    → New modal created with staggered position
    → Both modals visible for comparison
    → Click either to bring to front

User closes modal
    → X button or Escape
    → Remove DOM element
    → Remove from _openModals map
```

---

## Test Scenarios

- [ ] "Full Stats" button opens modal with correct match data
- [ ] Modal shows trimmed stats table with all 12 columns
- [ ] Team aggregate rows show correct summed/averaged stats
- [ ] Player rows show individual stats with colored names (if available)
- [ ] Teams sorted: our team first, opponent second
- [ ] Players sorted by frags descending within each team
- [ ] "QW Hub" link opens correct game URL in new tab
- [ ] X button closes the modal
- [ ] Escape key closes the topmost modal
- [ ] Modal is draggable by the header bar
- [ ] Opening same match twice focuses existing modal (no duplicate)
- [ ] Opening different match creates second modal with staggered position
- [ ] Multiple modals can be visible simultaneously
- [ ] Clicking a background modal brings it to front
- [ ] Zero values show dimmed styling
- [ ] RA column has red tint, YA has yellow tint
- [ ] LG% shows "—" for players who didn't use lightning gun
- [ ] SG% shows "—" for players who didn't use shotgun
- [ ] Modal doesn't overflow viewport (max-height: 80vh with scroll)
- [ ] ktxstats with bogus players (ping=0) are filtered out

## Common Integration Pitfalls

- [ ] ktxstats player names are QW-encoded — use `qwToAscii()` for team matching, `coloredQuakeName()` for display
- [ ] ktxstats `name_color` may not exist — fallback to plain name rendering
- [ ] Team matching between Supabase (teams array) and ktxstats (player.team) uses different encodings — always compare via `qwToAscii().toLowerCase()`
- [ ] Draggable mousedown handler must not prevent clicks on close button or hub link
- [ ] Multiple Escape handlers: each modal registers its own, must unregister on close
- [ ] Don't forget to expose `openFullStats` on TeamsBrowserPanel public API
- [ ] Modal cleanup: call `MatchStatsModal.closeAll()` when navigating away from teams view

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/js/components/MatchStatsModal.js` | Create | New component (~200 lines) |
| `public/js/components/TeamsBrowserPanel.js` | Modify | Add `openFullStats()` method |
| `src/css/input.css` | Modify | Add modal + stats table styles |
| `public/index.html` | Modify | Add MatchStatsModal.js script tag |

## Quality Checklist

- [ ] Stats table renders correctly with monospace font for aligned columns
- [ ] Modal z-index management doesn't conflict with other overlays
- [ ] Draggable implementation handles edge cases (mouse leaving window)
- [ ] Memory cleanup: modals removed from DOM on close, event listeners unregistered
- [ ] CSS uses rem units (except borders/shadows)
- [ ] Table is scrollable if content exceeds modal max-height
- [ ] Works with both 4on4 teams and edge cases (uneven player counts)
