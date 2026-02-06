# Slice 13.0e: Unified Right Panel

## Overview
Consolidate the three right-side panels (panel-top-right, panel-mid-right, panel-bottom-right) into a single unified panel that spans all grid rows. This reduces visual clutter, recovers space lost to inter-panel gaps, and creates a calmer sidebar that complements the active center grid.

## User Value
- Cleaner visual hierarchy — one calm sidebar instead of three stacked boxes
- More vertical space for the team browser list (no padding/margins between sections)
- Less cognitive load — related controls grouped in one continuous panel
- Symmetrical foundation for future left-side unification

## Current State

### HTML Structure (9 panels)
```
Row 1: panel-top-left    | panel-top-center    | panel-top-right (Favorites)
Row 2: panel-mid-left    | panel-mid-center    | panel-mid-right (Filters)
Row 3: panel-bottom-left | panel-bottom-center | panel-bottom-right (TeamBrowser)
```

### Right Panel Contents
- **panel-top-right**: FavoritesPanel (Select All/Deselect All, selected team cards)
- **panel-mid-right**: FilterPanel compact (Compare toggle, Min X vs X dropdowns)
- **panel-bottom-right**: TeamBrowser (Search, Fav/Div filters, team list)

### CSS Grid
```css
.main-grid-v3 {
  grid-template-columns: clamp(200px, 15vw, 300px) 1fr clamp(200px, 15vw, 300px);
  grid-template-rows: ${dynamic}fr 3rem 1fr;  /* JS-controlled */
  gap: 0.5rem;
}
```

Panels use implicit grid placement (DOM order).

## Target State

### HTML Structure (7 panels)
```
Row 1-3: panel-left (unified, future) | panel-top-center    | panel-right (unified)
                                      | panel-mid-center    |
                                      | panel-bottom-center |
```

For this slice, only the right side changes. Left side remains 3 panels.

### Unified Right Panel Layout
```
┌───────────────────────────────┐
│ [Compare]       [1] vs [1]    │  ← Single row: toggle + min filters
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│ 🔍 Search teams...            │  ← Search input
│ [★Fav] [D1] [D2] [D3]         │  ← Filter buttons (Fav is first)
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│                               │
│ Team list                     │  ← Scrollable, gets bulk of space
│ (flex-1, overflow-y)          │
│                               │
└───────────────────────────────┘
```

Internal sections use subtle dividers (border or spacing), not hard panel breaks.

### Key Changes
1. **Remove selected team cards** — selection state shown via highlight on list items (already works)
2. **Remove Select All/Deselect All** — move to header row or keep in list header
3. **Compare toggle always visible** — prominent at top
4. **Min filter** — behind gear icon or inline when Compare is ON
5. **Favorites becomes a filter** — first filter button, not a separate section

---

## Implementation

### Phase 1: HTML Restructure

**index.html changes:**

Remove:
- `#panel-top-right`
- `#panel-mid-right`
- `#panel-bottom-right`

Add single panel:
```html
<!-- Right Sidebar (spans all rows) -->
<div id="panel-right" class="panel sidebar-panel">
    <div class="sidebar-content">
        <!-- Compare Section -->
        <div class="sidebar-section sidebar-header">
            <div id="compare-controls">
                <!-- Compare toggle + settings rendered by FilterPanel -->
            </div>
        </div>

        <!-- Search & Filters Section -->
        <div class="sidebar-section">
            <div id="team-browser-header">
                <!-- Search + filter buttons rendered by TeamBrowser -->
            </div>
        </div>

        <!-- Team List Section (flex-1) -->
        <div class="sidebar-section sidebar-list">
            <div id="team-browser-list">
                <!-- Team list rendered by TeamBrowser -->
            </div>
        </div>
    </div>
</div>
```

### Phase 2: CSS Updates

**src/css/input.css:**

```css
/* Unified sidebar panel */
.sidebar-panel {
    display: flex;
    flex-direction: column;
}

#panel-right {
    grid-column: 3;
    grid-row: 1 / 4;  /* Span all 3 rows */
}

.sidebar-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 0.75rem;
    gap: 0.5rem;
}

.sidebar-section {
    flex-shrink: 0;
}

.sidebar-section.sidebar-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.sidebar-header {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
}
```

Update grid to use explicit placement for remaining panels:
```css
#panel-top-left { grid-column: 1; grid-row: 1; }
#panel-mid-left { grid-column: 1; grid-row: 2; }
#panel-bottom-left { grid-column: 1; grid-row: 3; }

#panel-top-center { grid-column: 2; grid-row: 1; }
#panel-mid-center { grid-column: 2; grid-row: 2; }
#panel-bottom-center { grid-column: 2; grid-row: 3; }

#panel-right { grid-column: 3; grid-row: 1 / 4; }
```

### Phase 3: Component Updates

**FilterPanel.js:**
- Render compare row into `#compare-controls`: `[Compare] [X] vs [X]`
- Compare button: visual state only (muted=off, blue=on), no text toggle
- Min dropdowns: framed buttons, always visible, no chevron
- Remove the old panel-mid-right container logic

**TeamBrowser.js:**
- Render search + filters into `#team-browser-header`
- Render team list into `#team-browser-list`
- Add "★ Fav" as first filter button (before Div 1/2/3)
- Keep Select All/Deselect All in list header area
- Remove FavoritesPanel dependency (favorites = filter state)

**FavoritesPanel.js:**
- Deprecate or remove entirely
- Favorite state already managed by TeamBrowserState
- Star toggle on team cards already works

### Phase 4: Mobile Updates

**MobileLayout.js:**
- Update `_moveNodesToDrawers()` to handle single `#panel-right` instead of 3 panels
- Right drawer receives the unified panel content

**src/css/input.css (mobile):**
```css
@media (max-width: 1024px) and (orientation: landscape) {
    #panel-right {
        display: none;  /* Hidden on mobile, content in drawer */
    }

    .mobile-drawer-content #panel-right {
        display: flex;
        height: 100%;
    }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `public/index.html` | Replace 3 right panels with 1 unified panel |
| `src/css/input.css` | Grid placement, sidebar styles, mobile updates |
| `public/js/components/FilterPanel.js` | Render to new container, restructure compare UI |
| `public/js/components/TeamBrowser.js` | Split rendering (header vs list), add Fav filter |
| `public/js/components/FavoritesPanel.js` | Deprecate (may keep for now, hidden) |
| `public/js/MobileLayout.js` | Update drawer panel logic |
| `public/js/app.js` | Update any panel references if needed |

---

## Migration Strategy

1. **Keep old panels temporarily** — add new unified panel, verify rendering
2. **Switch components one by one** — FilterPanel → TeamBrowser
3. **Remove old panels** — once everything renders in new location
4. **Test mobile** — verify drawer still works
5. **Clean up** — remove dead code, unused containers

---

## Visual Design Notes

### Compare Row (Single Line)
```
┌─────────────────────────────────────┐
│  [Compare]        [1] vs [1]        │
└─────────────────────────────────────┘
```

**Compare Button:**
- No "ON/OFF" text — visual state only
- OFF state: muted fill (`bg-muted`)
- ON state: light blue fill (`bg-primary`) — same pattern as active tab in mid-center menu
- Compact, icon-optional (or just "Compare" text)

**Min Filter Dropdowns:**
- Framed buttons showing current value (1-4)
- No dropdown chevron icon — clean appearance
- Border indicates clickability (`border border-border`)
- Click reveals option list (1, 2, 3, 4)
- Always visible, not hidden behind gear icon
- "vs" label between the two dropdowns

**Layout:** Flexbox with `justify-between` — Compare on left, min filters on right.

### Filter Buttons
```
┌─────────────────────────────┐
│  [★ Fav] [D1] [D2] [D3]     │
└─────────────────────────────┘
```
- Fav button highlighted when active (shows only favorited teams)
- Division buttons are multi-select (can show D1+D2)
- All divisions off = show all

### Team List Item
```
┌─────────────────────────────┐
│ [logo] Team Name        ★   │  ← Star on right, filled if favorite
│        D1 · 7 players       │  ← Division + player count
└─────────────────────────────┘
```
- Selected teams get accent border (existing behavior)
- Favorite star is toggle button on each row

---

## Testing Checklist

- [ ] Unified panel renders correctly, spans full height
- [ ] Compare button toggles state (muted fill ↔ blue fill)
- [ ] Compare toggle affects grid highlighting
- [ ] Min dropdowns (1-4) work, framed button style, no chevron
- [ ] Search filters team list
- [ ] Fav filter shows only favorited teams
- [ ] Division filters work (multi-select)
- [ ] Team selection highlights work
- [ ] Star toggle on team rows updates favorites
- [ ] Mobile: panel hidden, content in right drawer
- [ ] Mobile: drawer opens/closes correctly
- [ ] No console errors
- [ ] Grid row sizing still works (JS dynamic rows)

---

## Future: Left Panel Unification (Slice 13.0f)

Same pattern applied to left side:
- Merge panel-top-left, panel-mid-left, panel-bottom-left
- Sections: Team Identity → Roster → H2H Summary → Upcoming Matches
- `grid-row: 1 / 4` spanning

---

## Dependencies
- Slice 13.0d complete (current grid structure stable)
- No external dependencies

## Estimated Scope
- HTML: ~30 lines changed
- CSS: ~60 lines added/modified
- JS: ~100 lines across 3-4 components
- Testing: 1-2 iterations expected

---

*Created: 2025-02-06*
