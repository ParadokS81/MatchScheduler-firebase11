# Slice 11.0b: H2H Form Tab — Recent Results (Symmetric Split)

## Slice Definition
- **Slice ID:** 11.0b
- **Name:** H2H Form Tab — Recent Results with Symmetric Hover
- **Depends on:** Slice 11.0a (H2H Foundation — service, team selector, sub-tabs)
- **User Story:** As a user, I can see both teams' recent match results side by side, with scoreboard previews appearing on the opposite side when I hover, so I can compare their current form before scheduling a match
- **Success Criteria:**
  - Form sub-tab shows symmetric ~50/50 split: Team A results left, Team B results right
  - Each side fetches independently via `QWStatsService.getForm()` (3mo, 10 results)
  - Hover a LEFT result → layout shifts ~40:60, RIGHT side shows scoreboard
  - Hover a RIGHT result → layout shifts ~60:40, LEFT side shows scoreboard
  - Content (scoreboard) always appears on the **opposite side** of the hovered result
  - Only one side active at a time — hovering one side clears the other
  - Click behavior: locks the stats view (same as H2H tab)
  - Click again: toggles off (returns to symmetric view)
  - Period selector (from 11.0a) applies to Form data
  - Each side shows opponent tag, score, result, map for each game
  - Loading/empty states per side

## Problem Statement

The H2H tab (11.0a) shows direct matchups between two teams, but many team pairs have few or no direct meetings. The Form tab fills this gap by showing each team's recent results against everyone, letting users gauge overall form, activity level, and strength independent of the matchup.

The symmetric layout with hover-flip interaction is unique to this tab — it needs to feel like a natural extension of the split-panel patterns already established.

---

## Visual Design

### Form Tab — Default (no hover, ~50/50)

```
┌────────────────────────────┬────────────────────────────────┐
│  TEAM A RECENT FORM         │  TEAM B RECENT FORM            │
│  ─────────────────           │  ──────────────────            │
│  Jan 15  dm2  vs oeks  W   │  Jan 14  dm3  vs pol   L       │
│  230 - 198                   │  156 - 210                     │
│                              │                                │
│  Jan 10  dm3  vs pol   L    │  Jan 12  e1m2  vs tsq  W      │
│  156 - 210                   │  280 - 245                     │
│                              │                                │
│  Jan 08  e1m2  vs tsq  W   │  Jan 09  dm2  vs gof   W      │
│  280 - 245                   │  198 - 165                     │
│                              │                                │
│  Jan 05  dm2  vs sr    D   │  Jan 07  dm3  vs book  L       │
│  200 - 200                   │  180 - 220                     │
│                              │                                │
│  4W 1D 2L (57%)             │  3W 0D 4L (43%)               │
└────────────────────────────┴────────────────────────────────┘
```

### Form Tab — Hover LEFT Result (~40:60)

```
┌──────────────────┬──────────────────────────────────────────┐
│  TEAM A FORM      │  ┌────────────────────────────────────┐  │
│                    │  │       SCOREBOARD                   │  │
│  Jan 15  dm2  W   │  │     (dm2 mapshot bg)               │  │
│  230 - 198        │  │                                    │  │
│                    │  │  book 230   vs   oeks 198          │  │
│  Jan 10  dm3  L ◄ │  │  player rows...                    │  │
│  156 - 210        │  │                                    │  │
│                    │  └────────────────────────────────────┘  │
│  Jan 08  e1m2  W  │                                          │
│  280 - 245        │                                          │
│                    │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

### Form Tab — Hover RIGHT Result (~60:40)

```
┌──────────────────────────────────────────┬──────────────────┐
│  ┌────────────────────────────────────┐  │  TEAM B FORM      │
│  │       SCOREBOARD                   │  │                    │
│  │     (dm3 mapshot bg)               │  │  Jan 14  dm3  L   │
│  │                                    │  │  156 - 210        │
│  │  oeks 156   vs   pol 210          │  │                    │
│  │  player rows...                    │  │  Jan 12  e1m2  W ◄│
│  │                                    │  │  280 - 245        │
│  └────────────────────────────────────┘  │                    │
│                                          │  Jan 09  dm2  W   │
│                                          │  198 - 165        │
│                                          │                    │
└──────────────────────────────────────────┴──────────────────┘
```

### Form Tab — Click (Sticky Stats)

Same as hover, but the stats view locks and shows full ktxstats stats table (Performance/Weapons/Resources tabs) instead of just the scoreboard preview. Click same result again to unlock.

---

## Architecture Changes

### Component Changes: TeamsBrowserPanel

**New private state:**
```javascript
// Slice 11.0b: Form tab state
let _formResultsA = null;          // QWStatsService.getForm() response for Team A
let _formResultsB = null;          // QWStatsService.getForm() response for Team B
let _formLoading = false;          // Loading state
let _formHoveredSide = null;       // 'left' | 'right' | null — which side is hovered
let _formHoveredId = null;         // Hovered result ID
let _formSelectedSide = null;      // 'left' | 'right' | null — which side has sticky selection
let _formSelectedId = null;        // Clicked/sticky result ID
let _formSelectedStats = null;     // ktxstats for selected result
let _formStatsLoading = false;     // Loading ktxstats
let _formDataByIdA = new Map();    // Team A result objects by ID
let _formDataByIdB = new Map();    // Team B result objects by ID
```

**New methods:**

- `_renderFormTab()` — Dispatches to default/hover-left/hover-right layouts
- `_renderFormDefault()` — Symmetric ~50/50 split
- `_renderFormHoverLeft()` — ~40:60 layout (list left, scoreboard right)
- `_renderFormHoverRight()` — ~60:40 layout (scoreboard left, list right)
- `_renderFormResultList(games, side)` — Result rows for one team
- `_renderFormSummary(games)` — Record summary per side
- `_loadFormData()` — Fetches form for both teams in parallel
- `_resetFormState()` — Clears form state

**New public methods:**

- `previewFormResult(resultId, side)` — Hover handler with side awareness
- `clearFormPreview(side)` — Mouse leave handler
- `selectFormResult(resultId, side)` — Click handler with side awareness

**Modified methods:**

- `_renderH2HSubTabContent()` — Route `case 'form'` to `_renderFormTab()`
- `switchH2HSubTab(subTab)` — When switching to 'form', trigger `_loadFormData()` if not loaded
- `_resetH2HState()` — Also call `_resetFormState()`

### No New Services

Uses `QWStatsService.getForm()` from Slice 11.0a.

---

## Implementation Details

### Form Tab Renderer

```javascript
function _renderFormTab() {
    if (!_h2hOpponentId) {
        return `
            <div class="h2h-empty-state">
                <p class="text-sm text-muted-foreground">Select an opponent to compare form</p>
            </div>
        `;
    }

    if (_formLoading) {
        return `
            <div class="form-split form-split-default">
                <div class="form-side"><div class="h2h-skeleton">Loading...</div></div>
                <div class="form-divider"></div>
                <div class="form-side"><div class="h2h-skeleton">Loading...</div></div>
            </div>
        `;
    }

    // Determine layout based on hover/selection state
    const activeSide = _formSelectedSide || _formHoveredSide;
    const activeId = _formSelectedId || _formHoveredId;

    if (!activeSide) {
        return _renderFormDefault();
    } else if (activeSide === 'left') {
        return _renderFormHoverLeft(activeId);
    } else {
        return _renderFormHoverRight(activeId);
    }
}
```

### Default Symmetric Layout

```javascript
function _renderFormDefault() {
    const teamA = _allTeams.find(t => t.id === _selectedTeamId);
    const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
    const gamesA = _formResultsA?.games || [];
    const gamesB = _formResultsB?.games || [];

    return `
        <div class="form-split form-split-default">
            <div class="form-side form-side-left">
                <div class="form-side-header">${_escapeHtml(teamA?.teamTag || '?')} Recent Form</div>
                ${gamesA.length > 0
                    ? _renderFormResultList(gamesA, 'left') + _renderFormSummary(gamesA)
                    : '<div class="h2h-empty-state"><p class="text-xs text-muted-foreground">No recent matches</p></div>'
                }
            </div>
            <div class="form-divider"></div>
            <div class="form-side form-side-right">
                <div class="form-side-header">${_escapeHtml(teamB?.teamTag || '?')} Recent Form</div>
                ${gamesB.length > 0
                    ? _renderFormResultList(gamesB, 'right') + _renderFormSummary(gamesB)
                    : '<div class="h2h-empty-state"><p class="text-xs text-muted-foreground">No recent matches</p></div>'
                }
            </div>
        </div>
    `;
}
```

### Hover Left Layout (~40:60)

```javascript
function _renderFormHoverLeft(activeId) {
    const teamA = _allTeams.find(t => t.id === _selectedTeamId);
    const gamesA = _formResultsA?.games || [];
    const game = _formDataByIdA.get(String(activeId));
    const isSticky = _formSelectedSide === 'left';

    return `
        <div class="form-split form-split-hover-left">
            <div class="form-side form-side-left form-side-narrow">
                <div class="form-side-header">${_escapeHtml(teamA?.teamTag || '?')}</div>
                ${_renderFormResultList(gamesA, 'left')}
            </div>
            <div class="form-content-panel" id="form-content-panel">
                ${game
                    ? (isSticky && _formSelectedStats
                        ? _renderStatsView(_transformFormGameForScoreboard(game, 'left'), _formSelectedStats)
                        : isSticky && _formStatsLoading
                            ? _renderH2HSimpleScoreboard(_transformFormGameToH2HFormat(game, 'left'))
                                + '<div class="mh-stats-bar text-xs text-muted-foreground p-2">Loading detailed stats...</div>'
                            : _renderH2HSimpleScoreboard(_transformFormGameToH2HFormat(game, 'left'))
                    )
                    : '<div class="mh-preview-empty"><p class="text-xs text-muted-foreground">Hover a result</p></div>'
                }
            </div>
        </div>
    `;
}
```

### Hover Right Layout (~60:40)

```javascript
function _renderFormHoverRight(activeId) {
    const teamB = _allTeams.find(t => t.id === _h2hOpponentId);
    const gamesB = _formResultsB?.games || [];
    const game = _formDataByIdB.get(String(activeId));
    const isSticky = _formSelectedSide === 'right';

    return `
        <div class="form-split form-split-hover-right">
            <div class="form-content-panel" id="form-content-panel">
                ${game
                    ? (isSticky && _formSelectedStats
                        ? _renderStatsView(_transformFormGameForScoreboard(game, 'right'), _formSelectedStats)
                        : isSticky && _formStatsLoading
                            ? _renderH2HSimpleScoreboard(_transformFormGameToH2HFormat(game, 'right'))
                                + '<div class="mh-stats-bar text-xs text-muted-foreground p-2">Loading detailed stats...</div>'
                            : _renderH2HSimpleScoreboard(_transformFormGameToH2HFormat(game, 'right'))
                    )
                    : '<div class="mh-preview-empty"><p class="text-xs text-muted-foreground">Hover a result</p></div>'
                }
            </div>
            <div class="form-side form-side-right form-side-narrow">
                <div class="form-side-header">${_escapeHtml(teamB?.teamTag || '?')}</div>
                ${_renderFormResultList(gamesB, 'right')}
            </div>
        </div>
    `;
}
```

### Result List (Per Side)

```javascript
function _renderFormResultList(games, side) {
    return `
        <div class="mh-match-list">
            ${games.map(g => {
                const dateStr = new Date(g.playedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                });
                const resultClass = g.result === 'W' ? 'mh-result-win'
                                  : g.result === 'L' ? 'mh-result-loss'
                                  : 'mh-result-draw';
                const isSelected = _formSelectedSide === side && _formSelectedId === String(g.id);
                const isHovered = _formHoveredSide === side && _formHoveredId === String(g.id);

                return `
                    <div class="mh-table-row ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}"
                         data-result-id="${g.id}"
                         data-side="${side}"
                         onmouseenter="TeamsBrowserPanel.previewFormResult('${g.id}', '${side}')"
                         onmouseleave="TeamsBrowserPanel.clearFormPreview('${side}')"
                         onclick="TeamsBrowserPanel.selectFormResult('${g.id}', '${side}')">
                        <span class="mh-td mh-td-date">${dateStr}</span>
                        <span class="mh-td mh-td-map">${g.map}</span>
                        <span class="mh-td mh-td-score">${g.teamFrags}-${g.oppFrags}</span>
                        <span class="mh-td mh-td-opponent">${_escapeHtml(g.opponent)}</span>
                        <span class="mh-td mh-td-result ${resultClass}">${g.result}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}
```

### Hover / Click Handlers (Side-Aware)

```javascript
function previewFormResult(resultId, side) {
    if (_formSelectedSide) return; // Don't override sticky

    _formHoveredSide = side;
    _formHoveredId = String(resultId);
    // Re-render the entire form tab to switch layout
    _rerenderFormTab();
}

function clearFormPreview(side) {
    if (_formHoveredSide !== side) return;
    _formHoveredSide = null;
    _formHoveredId = null;

    if (!_formSelectedSide) {
        _rerenderFormTab();
    }
}

async function selectFormResult(resultId, side) {
    const id = String(resultId);

    // Toggle off
    if (_formSelectedSide === side && _formSelectedId === id) {
        _formSelectedSide = null;
        _formSelectedId = null;
        _formSelectedStats = null;
        _rerenderFormTab();
        return;
    }

    _formSelectedSide = side;
    _formSelectedId = id;
    _formSelectedStats = null;
    _formStatsLoading = true;
    _rerenderFormTab();

    // Fetch ktxstats
    const dataMap = side === 'left' ? _formDataByIdA : _formDataByIdB;
    const game = dataMap.get(id);

    if (game?.demoSha256) {
        try {
            const stats = await QWHubService.getGameStats(game.demoSha256);
            if (_formSelectedSide === side && _formSelectedId === id) {
                _formSelectedStats = stats;
                _formStatsLoading = false;
                _rerenderFormTab();
            }
        } catch (error) {
            console.error('Failed to load form game stats:', error);
            _formStatsLoading = false;
            if (_formSelectedSide === side && _formSelectedId === id) {
                _rerenderFormTab();
            }
        }
    } else {
        _formStatsLoading = false;
    }
}

function _rerenderFormTab() {
    const container = document.querySelector('.team-detail-tab-content');
    if (container && _activeTab === 'h2h' && _h2hSubTab === 'form') {
        // Re-render just the form content area (below the header)
        const formContainer = document.getElementById('h2h-subtab-content');
        if (formContainer) {
            formContainer.innerHTML = _renderFormTab();
        }
    }
}
```

### Data Loading

```javascript
async function _loadFormData() {
    const teamA = _allTeams.find(t => t.id === _selectedTeamId);
    const teamB = _allTeams.find(t => t.id === _h2hOpponentId);

    if (!teamA?.teamTag || !teamB?.teamTag) return;

    _formLoading = true;
    _formResultsA = null;
    _formResultsB = null;
    _formHoveredSide = null;
    _formHoveredId = null;
    _formSelectedSide = null;
    _formSelectedId = null;
    _formSelectedStats = null;
    _formDataByIdA.clear();
    _formDataByIdB.clear();
    _rerenderFormTab();

    try {
        const [formA, formB] = await Promise.all([
            QWStatsService.getForm(teamA.teamTag, { months: _h2hPeriod, limit: 10 }),
            QWStatsService.getForm(teamB.teamTag, { months: _h2hPeriod, limit: 10 })
        ]);

        // Guard
        if (_selectedTeamId !== teamA.id || _h2hOpponentId !== teamB.id) return;

        _formResultsA = formA;
        _formResultsB = formB;

        if (formA.games) formA.games.forEach(g => _formDataByIdA.set(String(g.id), g));
        if (formB.games) formB.games.forEach(g => _formDataByIdB.set(String(g.id), g));
    } catch (error) {
        console.error('Failed to load form data:', error);
    } finally {
        _formLoading = false;
        _rerenderFormTab();
    }
}
```

### Transform Functions

```javascript
function _transformFormGameToH2HFormat(game, side) {
    // Transform Form API response to match H2H scoreboard format
    const teamTag = side === 'left'
        ? (_allTeams.find(t => t.id === _selectedTeamId)?.teamTag || '')
        : (_allTeams.find(t => t.id === _h2hOpponentId)?.teamTag || '');

    return {
        map: game.map,
        playedAt: game.playedAt,
        teamAFrags: game.teamFrags,
        teamBFrags: game.oppFrags,
        result: game.result,
        demoSha256: game.demoSha256,
        // For scoreboard display
        teamA: teamTag,
        teamB: game.opponent
    };
}

function _transformFormGameForScoreboard(game, side) {
    // Transform for full stats view reuse
    const teamTag = side === 'left'
        ? (_allTeams.find(t => t.id === _selectedTeamId)?.teamTag || '')
        : (_allTeams.find(t => t.id === _h2hOpponentId)?.teamTag || '');

    return {
        id: game.id,
        map: game.map,
        date: new Date(game.playedAt),
        ourTag: teamTag,
        opponentTag: game.opponent,
        ourScore: game.teamFrags,
        opponentScore: game.oppFrags,
        result: game.result,
        demoHash: game.demoSha256
    };
}
```

---

## CSS Additions

Add to `src/css/input.css`:

```css
/* ============================================
   Slice 11.0b: Form Tab — Symmetric Split
   ============================================ */

/* Default 50/50 layout */
.form-split {
    display: flex;
    height: 100%;
    gap: 0;
}

.form-split-default .form-side {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-y: auto;
}

/* Center divider */
.form-divider {
    width: 1px;
    background: var(--border);
    flex-shrink: 0;
}

.form-side-header {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

/* Hover-left: list ~40%, content ~60% */
.form-split-hover-left .form-side-narrow {
    width: 38%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    min-width: 0;
    overflow-y: auto;
}

.form-split-hover-left .form-content-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-y: auto;
}

/* Hover-right: content ~60%, list ~40% */
.form-split-hover-right .form-side-narrow {
    width: 38%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    min-width: 0;
    overflow-y: auto;
}

.form-split-hover-right .form-content-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-y: auto;
}

/* Form summary (bottom of each side) */
.form-summary {
    padding: 0.375rem 0.5rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    display: flex;
    gap: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
}

/* Remove padding for form splits */
.team-detail-tab-content:has(.form-split) {
    padding: 0;
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Hover: Layout shift from 50/50 → 40/60 or 60/40 (DOM re-render, no API call)
- Mouse leave: Return to 50/50 layout
- Scoreboard preview: Rendered from cached API data

COLD PATHS (<2s):
- Initial form load: 2 parallel getForm() calls (~500-1000ms wall clock)
- ktxstats fetch on click: ~300-500ms, cached indefinitely
- Period change: Re-fetches both teams' form data

NOTE ON HOVER RE-RENDERS:
The layout shift on hover requires a full re-render of the form tab content.
This is acceptable because:
- The DOM is small (10 rows per side max)
- No API calls involved
- Re-renders complete in <5ms
- Alternative (CSS-only transitions) would require both layouts in DOM simultaneously,
  adding complexity for marginal benefit
```

---

## Data Flow

```
User switches to Form sub-tab
    → switchH2HSubTab('form')
    → _h2hSubTab = 'form'
    → _loadFormData() (if not already loaded)
        → QWStatsService.getForm(teamA.tag, { months: _h2hPeriod })
        → QWStatsService.getForm(teamB.tag, { months: _h2hPeriod })
        → Both fetched in parallel
    → Populate _formResultsA, _formResultsB, _formDataByIdA, _formDataByIdB
    → Render symmetric 50/50 layout

User hovers a result on LEFT side
    → previewFormResult(resultId, 'left')
    → _formHoveredSide = 'left', _formHoveredId = resultId
    → _rerenderFormTab()
        → _renderFormHoverLeft(resultId)
        → Left panel narrows to ~40%
        → Right panel shows scoreboard for hovered game

User moves mouse away
    → clearFormPreview('left')
    → _formHoveredSide = null
    → _rerenderFormTab() → back to 50/50

User hovers a result on RIGHT side
    → previewFormResult(resultId, 'right')
    → _formHoveredSide = 'right'
    → _rerenderFormTab()
        → _renderFormHoverRight(resultId)
        → Right panel narrows to ~40%
        → Left panel shows scoreboard

User clicks a result
    → selectFormResult(resultId, side)
    → _formSelectedSide = side, _formSelectedId = resultId
    → Layout locks in hover position
    → Fetch ktxstats async
    → Guard: verify selection unchanged
    → Render full stats view in content panel

User clicks same result again
    → Toggle off
    → _formSelectedSide = null
    → Return to 50/50 layout
```

---

## Test Scenarios

- [ ] Form tab shows symmetric 50/50 split when both teams have data
- [ ] Team A results on left, Team B results on right
- [ ] Each side shows up to 10 results with date, map, opponent, score, result
- [ ] Side headers show team tags
- [ ] Record summary at bottom of each side (e.g., "4W 1D 2L")
- [ ] Hovering LEFT result shifts layout to ~40:60 with scoreboard on right
- [ ] Hovering RIGHT result shifts layout to ~60:40 with scoreboard on left
- [ ] Mouse leave returns to 50/50 (when no sticky selection)
- [ ] Hovering one side while other side hovered → switches (only one side active)
- [ ] Click locks the layout and shows scoreboard
- [ ] Click → ktxstats fetch → full stats view (guards against race condition)
- [ ] Click same result again toggles off → 50/50
- [ ] Sticky selection blocks hover on either side
- [ ] Period change re-fetches both teams' form data
- [ ] Loading state shown while fetching
- [ ] Empty state per side if team has no recent matches
- [ ] Switching teams or opponent resets form state
- [ ] Guard: team switch during fetch doesn't render stale data
- [ ] Layout transitions feel smooth (no jarring jumps)

## Common Integration Pitfalls

- [ ] Form tab hover requires **full re-render** (not just panel update) because the layout structure changes. Use a dedicated `_rerenderFormTab()` method, not `_renderCurrentView()`
- [ ] Two separate data maps (_formDataByIdA, _formDataByIdB) — must use correct map based on `side` parameter
- [ ] Form API returns `teamFrags`/`oppFrags`/`opponent`, different field names from H2H API
- [ ] Must transform Form game to H2H-compatible format for scoreboard reuse
- [ ] Side parameter must be passed through all hover/click handlers to identify which team's data to look up
- [ ] Expose `previewFormResult`, `clearFormPreview`, `selectFormResult` in public return
- [ ] Period change (`changeH2HPeriod`) must re-fetch form data as well as H2H data

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/js/components/TeamsBrowserPanel.js` | Modify | Form tab renderer, side-aware hover/click, layout switching |
| `src/css/input.css` | Modify | Form split layouts (default, hover-left, hover-right) |

No new files needed — builds on 11.0a foundation.

## Quality Checklist

- [ ] Symmetric layout is visually balanced (50/50 default)
- [ ] Layout shift on hover is immediate (no API calls, <5ms render)
- [ ] Only one side can be hovered/selected at a time
- [ ] Scoreboard appears on **opposite** side of hovered result
- [ ] ktxstats fetch guarded against race conditions
- [ ] State fully reset when switching teams, opponents, or sub-tabs
- [ ] CSS uses rem units throughout (except borders)
- [ ] Result rows reuse existing mh-table-row styles where possible
- [ ] All public methods exposed for onclick handlers
