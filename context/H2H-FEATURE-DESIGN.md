# H2H Feature Design — Head-to-Head Tab

> Extracted from brainstorming session (2026-02-04).
> This is the **agreed direction** — supersedes slice-5.1c and slice-5.2d.
> Next step: `/qplan` to turn this into an implementation slice.

## Overview

The H2H tab lives in MatchScheduler's bottom-center panel (under Details / Match History / Head to Head). It's powered by the **QW Stats API** (PostgreSQL with 18k+ 4on4 games, 2022-2026) rather than the QWHub Supabase API.

## Data Source: QW Stats API

Public URL: `https://qw-api.poker-affiliate.org`

| Endpoint | Purpose |
|----------|---------|
| `GET /api/h2h?teamA=book&teamB=oeks&map=dm2&months=3&limit=10` | Direct matchup results |
| `GET /api/form?team=book&map=dm3&months=3&limit=10` | Recent results vs everyone |
| `GET /api/maps?team=book&vsTeam=oeks&months=6` | Map strength analysis |
| `GET /api/roster?team=book&months=3` | Roster activity & participation |

See `qw-stats/CLAUDE.md` for full API details, DB schema, and deployment info.

### Team Name Mapping

Both APIs use **lowercase ASCII** team names:
- QW Stats API: `team_ascii` column (e.g., `book`, `oeks`)
- QWHub Supabase: `team_names` stored lowercase
- MatchScheduler: `teamTag` may have mixed case (e.g., `Book`, `tSQ`, `GoF!`)

**Rule:** Always `teamTag.toLowerCase()` before querying either API.

## Layout Structure

### H2H Tab Layout (split panel, same as Match History)
```
┌─────────────────────────────────────────────────────┐
│ [Team A logo+name]     VS     [Team B dropdown ▼]   │
│         ─── H2H ── Form ── Maps ───  [All Maps ▼]   │
├──────────── ~40% ─────┬──────────── ~60% ───────────┤
│ Results list           │ Context area                 │
│                        │                              │
│ Default: result rows   │ Default: roster/activity     │
│ Hover → highlight row  │ Hover → scoreboard preview   │
│ Click → select row     │ Click → full stats page      │
│ Click again → deselect │ Click again → back to roster │
└────────────────────────┴─────────────────────────────┘
```

### Form Tab Layout (symmetric flip on hover)
```
Default (no hover):
┌──────────── ~50% ─────┬──────────── ~50% ───────────┐
│ Team A recent results  │ Team B recent results        │
│ (vs everyone, 3mo/10)  │ (vs everyone, 3mo/10)        │
└────────────────────────┴─────────────────────────────┘

Hover LEFT result → flip to ~40:60:
┌──────── ~40% ─────────┬──────────── ~60% ───────────┐
│ Team A results (list)  │ Scoreboard/stats for hovered │
│ [hovered row hl]       │ game from Team A's list       │
└────────────────────────┴─────────────────────────────┘

Hover RIGHT result → flip to ~60:40:
┌──────────── ~60% ─────┬──────────── ~40% ───────────┐
│ Scoreboard/stats for   │ Team B results (list)        │
│ hovered game from B    │ [hovered row hl]              │
└────────────────────────┴─────────────────────────────┘
```

The content (scoreboard/stats) always appears on the **opposite side** of the hovered result. This mirrors the Match History pattern but works symmetrically for two teams. The ratio shift gives the content area enough breathing room for scoreboards and stats tables, especially at 1440p where there's space for team logos and names in the header.

### Maps Tab Layout (alternating mapshot/stats rows)
```
┌─────────────────────────────────────────────────────┐
│ [dm2 mapshot]    │ Team A: 9-5 (64%) +12.3 avg      │
│                  │ Team B: 6-4 (60%) +8.1 avg        │
│                  │ "Both teams strong"                │
├──────────────────┼───────────────────────────────────┤
│ Team A: 6-6 (50%)│ [dm3 mapshot]                     │
│ Team B: 3-7 (30%)│                                   │
│ "Team A favors"  │                                   │
├──────────────────┼───────────────────────────────────┤
│ [e1m2 mapshot]   │ Team A: 7-3 (70%) +15.2 avg      │
│                  │ Team B: 2-8 (20%) -11.4 avg       │
│                  │ "Team A dominates"                 │
└──────────────────┴───────────────────────────────────┘
```
Maps tab is **informational only** — no hover/click interactions. Sorted by combined activity (most played maps first).

## Three Sub-Tabs

### H2H Tab — Direct matchup results between the two teams

- Left (~40%): H2H result list (3mo, capped 10, filterable by map)
- Right (~60%) default: Roster/activity from both teams (from `/api/roster`)
  - Players sorted by games played, core 4-5 highlighted
  - If viewing a scheduled match: players who marked available get a star marker
- Hover result → right shows scoreboard (reuse Match History hover pattern)
- Click result → right shows stats page (reuse Match History click pattern)
- Click again → right returns to roster

### Form Tab — Recent results against everyone (symmetric split)

- Default: ~50/50 split — Team A results left, Team B results right
- Each side shows team's recent results (3mo, capped 10, filterable by map)
- Hover left result → layout shifts ~40:60, right shows scoreboard for that game
- Hover right result → layout shifts ~60:40, left shows scoreboard for that game
- Content always appears on the **opposite side** of the hovered result
- Only one side "active" at a time — hovering one side clears the other
- Click behavior: same as H2H (locks the stats view on opposite side)

### Maps Tab — Map strength analysis (visual, alternating layout)

- Alternating rows: [mapshot | stats] then [stats | mapshot]
- Map images from `a.quake.world/mapshots/webp/lg/{map}.webp`
- Stats per row: win rate, games played, avg frag diff for each team
- Sorted by combined activity (most played maps first)
- Short annotations: "Team A favors", "Even", "Team B avoids", "Team A dominates"
- Informational only — no hover/click interactions

## Data Sources Per Tab

| Tab | Primary Source | Fallback |
|-----|---------------|----------|
| H2H results | QW Stats API `/api/h2h` | Show "No data" message |
| Form results | QW Stats API `/api/form` | Show "No data" message |
| Maps analysis | QW Stats API `/api/maps` | — (needs PostgreSQL) |
| Roster activity | QW Stats API `/api/roster` | — (needs PostgreSQL) |
| Scoreboard hover | ktxstats S3 via demoSha256 | Already works in Match History |
| Stats click | ktxstats S3 via demoSha256 | Already works in Match History |

No Supabase fallback in v1 — the QW Stats API has 4 years of data and is the authoritative source. If the API is unreachable, show a clear error state.

## Team Selection

- Team A: pre-selected (the team currently being viewed in sidebar/teams browser)
- Team B: dropdown in H2H tab header, populated from MatchScheduler's team list
- Clicking a scheduled match pre-fills both teams
- Dropdown uses `teamTag.toLowerCase()` when querying APIs

## Interaction Patterns

The split-panel hover/click pattern reuses what already works in Match History:

1. **Default state**: Left shows result list, right shows roster/activity (H2H) or opposing results (Form)
2. **Hover a result**: Opposite side temporarily swaps to scoreboard preview
3. **Click a result**: Opposite side locks to stats page view
4. **Click again (or click another)**: Toggles back or switches

This keeps the interaction consistent across Match History, H2H, and Form tabs.

## States & Loading

- **Loading**: Skeleton loader while fetching from QW Stats API (external call, may have latency)
- **Empty H2H**: "No direct matchups found between these teams" — suggest checking Form tab
- **Empty Form**: "No recent matches found for [team]" (unlikely for active teams)
- **API Error**: "Unable to load match data — try again later" with retry button
- **No Team B selected**: Show prompt "Select an opponent to compare" with the dropdown highlighted

## Mobile

Desktop-first. Mobile gets a simplified single-column version (TBD).

## Resolved Decisions

1. **Roster star markers** — Include in v1. Query each team's availability for the scheduled match time, mark available players with a star in the roster view. Straightforward — just cross-reference roster data with availability data already in the system.

2. **Time period control** — Dropdown with **1mo, 3mo, 6mo** options. Default to **3mo**. Results capped at 10 per list. The date column on results lets users gauge activity density (clustered = active, spread = sporadic). Shorter default shows recent form; longer options available for deeper history.

3. **Map filter scope** — Filter lives in the **H2H sub-tab header** and applies only to the H2H result list. Form and Maps sub-tabs handle their own data independently (Form shows all maps by default, Maps tab inherently shows all maps).

## Supersedes

- `context/slices/slice-5.1c-head-to-head-compare.md` — Original H2H concept (simple button, single view, Supabase only)
- `context/slices/slice-5.2d-head-to-head-tab.md` — Tabbed version (still Supabase only, no sub-tabs)

Both older slices used QWHub Supabase with limited data. This design uses the full PostgreSQL dataset (18k games, 4 years) via the QW Stats API.
