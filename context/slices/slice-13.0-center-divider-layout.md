# Slice 13.0: Center Divider Layout Restructure

**Dependencies:** Slice 12.0 (timeslot filtering), Slice 6.0b (grid tools drawer)
**User Story:** As a user, I want the grid tools and team name moved out of the top-left team panel so that when I hide timeslots to shrink the grid, the roster and logo still have enough space without scrolling.

---

## Problem Statement

The 3x3 grid layout links row heights across columns. When users hide timeslots (Slice 12.0), the top row shrinks, squeezing:
- Top-left: Team logo + name + roster + grid tools drawer
- Top-right: Favorites panel

With 5+ roster members and the grid tools drawer, the team panel overflows and requires scrolling.

## Solution

1. **Move team name → mid-left panel** (replace compact profile)
2. **Move profile → bottom-left panel** (above upcoming matches)
3. **Move grid tools → grid header** (hover-revealed on header row)
4. **Templates → modal** (triggered from grid header)
5. **Default hidden timeslots** (18:00, 18:30, 19:00 hidden by default)

---

## Slice Breakdown

### Slice 13.0a: Panel Content Relocation
Move team name to mid-left, profile to bottom-left.

### Slice 13.0b: Grid Header Tools
Cog icon + hover-revealed tools in grid header bar.

### Slice 13.0c: Templates Modal
Convert templates drawer to modal dialog.

### Slice 13.0d: Default Hidden Timeslots
New users start with 18:00, 18:30, 19:00 hidden.

### Slice 13.0e: Right Panel Simplification (separate, later)
Simplify favorites panel entries to single row.

---

## Grid Header Layout (13.0b)

```
Left group                    Center                         Right group
[⚙️] [Templates] [●○◐]    [◄] 2026 Week 6 Feb 9-15 [►]    [Timeslots] [GMT+1▼]
```

- **Cog icon (⚙️)**: Visual anchor, always visible, indicates settings available
- **Templates button**: Opens templates modal
- **Display mode toggle (●○◐)**: Existing 4 modes (initials, coloredInitials, coloredDots, avatars)
- **Week nav (◄ ►)**: Existing, center position unchanged
- **Timeslots button**: Opens timeslot editor modal (existing from 12.0b)
- **Timezone selector (GMT+1▼)**: Existing, right position unchanged

**Hover behavior:**
- Cog, Templates, Display modes, Timeslots - all hidden by default
- Revealed when hovering header row (same zone as nav arrows)
- Timezone always visible (existing behavior)

---

## Panel Layout Changes

### Before (current):
```
┌─────────────────┬────────────────────────────────┬─────────────────┐
│ TOP-LEFT        │ TOP-CENTER                     │ TOP-RIGHT       │
│ • Logo          │ • Week header + nav            │ • Favorites     │
│ • Team name     │ • Week 1 grid                  │   panel         │
│ • Roster        │                                │                 │
│ • Grid tools    │                                │                 │
│   drawer        │                                │                 │
├─────────────────┼────────────────────────────────┼─────────────────┤
│ MID-LEFT        │ MID-CENTER                     │ MID-RIGHT       │
│ • Profile       │ • Tab buttons                  │ • Min players   │
│   (compact)     │                                │   filter        │
├─────────────────┼────────────────────────────────┼─────────────────┤
│ BOTTOM-LEFT     │ BOTTOM-CENTER                  │ BOTTOM-RIGHT    │
│ • Upcoming      │ • Week 2 / Content             │ • Team browser  │
│   matches       │                                │                 │
└─────────────────┴────────────────────────────────┴─────────────────┘
```

### After (13.0):
```
┌─────────────────┬────────────────────────────────┬─────────────────┐
│ TOP-LEFT        │ TOP-CENTER                     │ TOP-RIGHT       │
│ • Logo          │ • Week header:                 │ • Favorites     │
│ • Roster        │   [⚙️][Templates][●○◐]..nav..  │   panel         │
│                 │   [Timeslots][TZ]              │   (simplified)  │
│                 │ • Week 1 grid                  │                 │
├─────────────────┼────────────────────────────────┼─────────────────┤
│ MID-LEFT        │ MID-CENTER                     │ MID-RIGHT       │
│ • Team name     │ • Tab buttons                  │ • Min players   │
│   + tag         │                                │   filter        │
├─────────────────┼────────────────────────────────┼─────────────────┤
│ BOTTOM-LEFT     │ BOTTOM-CENTER                  │ BOTTOM-RIGHT    │
│ • Profile       │ • Week 2 / Content             │ • Team browser  │
│   (compact)     │                                │                 │
│ • Upcoming      │                                │                 │
│   matches       │                                │                 │
└─────────────────┴────────────────────────────────┴─────────────────┘
```

---

## File Changes Summary

| Slice | Files Modified | Description |
|-------|----------------|-------------|
| 13.0a | TeamInfo.js, UserProfile.js, index.html, input.css | Move team name to mid-left, profile to bottom-left |
| 13.0b | WeekDisplay.js, GridActionButtons.js, input.css | Grid tools to header with hover reveal |
| 13.0c | TemplatesModal.js (new), GridActionButtons.js | Templates as modal instead of inline |
| 13.0d | TimezoneService.js, app.js | Default hidden timeslots |
| 13.0e | FavoritesPanel.js, input.css | Single-row entries |

---

## Implementation Priority

1. **13.0a** - Panel relocation (foundation)
2. **13.0b** - Grid header tools (main UI change)
3. **13.0c** - Templates modal (depends on 13.0b)
4. **13.0d** - Default timeslots (independent, quick)
5. **13.0e** - Right panel (separate concern, can be later)
