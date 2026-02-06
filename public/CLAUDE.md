# Frontend Architecture - MatchScheduler

This document covers the frontend layout system, mobile adaptation, and CSS/JS ownership boundaries.

---

## Layout System Overview

The app uses a **3x3 CSS Grid** (`.main-grid-v3`) with panels:

```
┌─────────────────┬────────────────────────────────┬─────────────────┐
│ panel-top-left  │ panel-top-center               │ panel-top-right │
│ (TeamInfo)      │ (Week 1 Grid)                  │ (Favorites)     │
├─────────────────┼────────────────────────────────┼─────────────────┤
│ panel-mid-left  │ panel-mid-center               │ panel-mid-right │
│ (TeamName)      │ (Tab buttons)                  │ (Filters)       │
├─────────────────┼────────────────────────────────┼─────────────────┤
│ panel-bottom-left│ panel-bottom-center           │ panel-bottom-right│
│ (Profile+Upcoming)│ (Week 2 / Content)           │ (TeamBrowser)   │
└─────────────────┴────────────────────────────────┴─────────────────┘
```

---

## CSS vs JS Ownership

### Grid Row Layout

**CRITICAL: Both CSS and JS control `grid-template-rows` - they must coordinate!**

| Context | Controller | Value | Location |
|---------|------------|-------|----------|
| Desktop | **JS** | `${count/11}fr 3rem 1fr` | `app.js` → `_updateGridLayout()` |
| Mobile | **CSS** | `1fr` | `input.css` → media query |

**Why JS on desktop?** Slice 12.0a added dynamic row sizing - when timeslots are hidden, the top grid shrinks proportionally.

**Why CSS on mobile?** Mobile collapses to single-panel layout. JS must **clear** its inline style or it overrides CSS.

```javascript
// In _updateGridLayout():
if (isMobile) {
    grid.style.gridTemplateRows = ''; // MUST clear for CSS to work
    return;
}
```

### Panel Visibility

| Context | Controller | Mechanism |
|---------|------------|-----------|
| Desktop | CSS | Grid placement, all panels visible |
| Mobile | JS | `MobileLayout.js` moves panels to drawers |

---

## Mobile Adaptation

### Entry Point
- Media query: `(max-width: 1024px) and (orientation: landscape)`
- Handled by: `MobileLayout.js` + CSS media queries

### What Happens on Mobile

1. **Grid collapses** to single column/row (CSS)
2. **Side panels hidden** via `display: none` (CSS)
3. **Panels moved to drawers** physically relocated in DOM (JS - `MobileLayout._moveNodesToDrawers()`)
4. **Bottom bar appears** with navigation (JS - `MobileBottomBar.js`)
5. **Center panels toggle** based on active tab (JS - `MobileBottomBar._togglePanels()`)

### Panel Locations on Mobile

```
LEFT DRAWER (hamburger menu):
  - panel-top-left (TeamInfo + Roster)

RIGHT DRAWER (hamburger menu):
  - panel-top-right (Favorites)
  - panel-bottom-right (TeamBrowser)

MAIN AREA (grid-row: 1):
  - Calendar tab → panel-top-center (Week 1)
  - Other tabs → panel-bottom-center (Content)

BOTTOM BAR:
  - Week navigation (◄ W6 ►)
  - Tab icons (Calendar, Teams, Players, etc.)
  - Compare controls
```

---

## Component Initialization Order

```
MatchSchedulerApp.init()
├── _initializeComponents()
│   ├── TeamInfo.init()
│   ├── TeamNameDisplay.init()
│   ├── ToastService.init()
│   ├── UserProfile.renderCompact()
│   ├── FilterPanel.init()
│   ├── _initializeAvailabilityGrid()
│   │   ├── TimezoneService.init()
│   │   ├── WeekNavigation.init()
│   │   ├── WeekDisplay.create() × 2
│   │   ├── GridActionButtons.init()
│   │   ├── TemplatesModal.init()
│   │   └── _updateGridLayout()  ← Sets initial grid rows
│   ├── _initializeTeamBrowser()
│   ├── MobileLayout.init()      ← Moves panels if mobile
│   └── MobileBottomBar.init()
└── _setupEventListeners()
```

---

## Event Flow

### Viewport Change (Desktop ↔ Mobile)
```
matchMedia('...').change
  → _updateGridLayout()     [app.js]
      Desktop: Set inline gridTemplateRows
      Mobile: Clear inline style (let CSS take over)
  → MobileLayout handles panel movement
```

### Timeslot Filter Change
```
'timeslots-changed' event
  → _updateGridLayout()     [app.js]
  → WeekDisplay.rebuildGrid() × 2
  → Re-setup availability listeners
```

### Tab Switch (Mobile)
```
MobileBottomBar tab click
  → BottomPanelController.switchTab()
  → _togglePanels()         [MobileBottomBar.js]
      Calendar: show panel-top-center, hide panel-bottom-center
      Other: show panel-bottom-center, hide panel-top-center
```

---

## Common Debugging

### Grid not filling height on mobile
1. Check if JS set inline `gridTemplateRows` → should be cleared on mobile
2. Check `_updateGridLayout()` is called on viewport change
3. Run diagnostic:
```javascript
const grid = document.querySelector('.main-grid-v3');
console.log('gridTemplateRows:', getComputedStyle(grid).gridTemplateRows);
// Should be single value on mobile, three values on desktop
```

### Panel not visible
1. Check `display` property
2. Check if panel was moved to drawer (DOM location changed)
3. Mobile: verify `MobileLayout._moveNodesToDrawers()` ran

### Content not filling panel
Panel is flex container. Children need `flex: 1`, not just `height: 100%`.

---

## File Map

| File | Purpose |
|------|---------|
| `js/app.js` | Main entry, component init, `_updateGridLayout()` |
| `js/MobileLayout.js` | Drawer management, panel relocation |
| `js/MobileBottomBar.js` | Bottom bar UI, tab switching, panel toggling |
| `js/components/WeekDisplay.js` | Week grid container with header |
| `js/components/AvailabilityGrid.js` | The actual grid cells |
| `js/components/BottomPanelController.js` | Desktop tab content switching |
| `css/input.css` (src) | Source CSS with mobile media queries |
| `css/main.css` | Compiled output (don't edit directly) |
