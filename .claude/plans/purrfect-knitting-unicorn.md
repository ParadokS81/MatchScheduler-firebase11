# Mobile Responsive Layout - Slice Plan

## Overview
Add mobile-responsive layout to MatchScheduler. Landscape-focused, single-column with swipe-in drawers and a combined bottom navigation bar. Desktop layout remains completely untouched.

This maps to **Part 9: Mobile Responsive** in the roadmap, as slice cluster **10.x**.

## Breakpoint Strategy
- **Primary**: `@media (max-width: 1024px)` - catches all phones + tablets
- **Landscape phone**: `@media (max-width: 1024px) and (max-height: 500px)` - tighter spacing
- **Portrait phone**: `@media (max-width: 1024px) and (orientation: portrait)` - show rotate overlay
- Base font-size: `87.5%` (14px) on mobile

## Mobile Layout Structure

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  panel-top-center (calendar grid, full width)   │
│       OR                                        │
│  panel-bottom-center (Teams/Players/Matches)    │
│                                                 │
├─────────────────────────────────────────────────┤
│ ☰  W6 Feb 9-15 ◀▶  │  📅 👥 🎮 🏆 ⚔  🔍      │
└─────────────────────────────────────────────────┘
         ↑ fixed bottom bar (3rem)
```

- **Calendar tab active**: `panel-top-center` visible (Week 1 grid - the "real" grid)
- **Other tab active**: `panel-bottom-center` visible (content from BottomPanelController)
- Side panels + divider row: hidden via CSS, content moved to drawers via JS

### "Load Grid View" from Matches
Already handled - `MatchesPanel._handleLoadGridView()` calls `BottomPanelController.switchTab('calendar')`, which automatically switches mobile back to showing the top grid with comparison mode active.

## Slice Breakdown

### ✅ Slice 10.0a: CSS Foundation + HTML Skeleton
**Status:** Complete
**Scope:** Pure presentation - CSS media queries + static HTML additions
**Files:** `src/css/input.css`, `public/index.html`

What was done:
- `@media (max-width: 1024px)` rules in `input.css`
- Grid collapse to single column, side panels hidden, divider row hidden
- Bottom bar + drawer HTML shells in `index.html` (hidden on desktop)
- Portrait orientation overlay
- `touch-action: manipulation` to prevent double-tap zoom

---

### ✅ Slice 10.0b: MobileLayout.js Core + Drawers
**Status:** Complete
**Scope:** Drawer open/close, DOM content moves, overlay
**Files:** `public/js/MobileLayout.js` (new), `public/js/app.js` (init call)

What was done:
- `MobileLayout` Revealing Module Pattern
- Media query detection via `window.matchMedia('(max-width: 1024px)')`
- On mobile: move panel content into drawer containers
- On desktop: restore content to original parents
- Drawer toggle via buttons + overlay click to close

---

### ✅ Slice 10.0c: Mobile Bottom Bar
**Status:** Complete
**Scope:** Wire bottom bar to existing controllers
**Files:** `public/js/MobileBottomBar.js` (new), `public/js/app.js` (init call)

What was done:
- Tab icons synced with `BottomPanelController.switchTab()`
- Panel switching: Calendar shows top-center, other tabs show bottom-center
- Week nav arrows wired to `WeekNavigation`
- Week label updates from events
- Drawer toggle buttons (hamburger + search)
- FAB repositioned above bottom bar

---

### 📅 Slice 10.0d: Swipe Gestures + Touch Grid
**Status:** Not Started
**Scope:** Touch interactions
**Files:** `public/js/MobileLayout.js` (enhance), `public/js/components/AvailabilityGrid.js` (enhance)

What it needs:
- MobileLayout: swipe-from-edge gesture detection
  - `touchstart`/`touchmove`/`touchend` on document
  - Left edge (first 1.5rem) swipe right = open left drawer
  - Right edge (last 1.5rem) swipe left = open right drawer
  - Threshold: 50px horizontal, <30px vertical
- AvailabilityGrid: touch event support for drag-select
  - `touchstart` → same as `mousedown`
  - `touchmove` → `e.preventDefault()` + `document.elementFromPoint()` + same as `mousemove`
  - `touchend` → same as `mouseup`

**Verify:** On touch device/emulator: swipe from left edge opens left drawer. Drag-select cells works with finger. Single tap toggles cell.

---

### 📅 Slice 10.0e: Right Drawer Tabs + Polish
**Status:** Not Started
**Scope:** Fav/Division filtering in right drawer, final adjustments
**Files:** `public/js/MobileLayout.js` (enhance), `src/css/input.css` (additions)

What it needs:
- Right drawer header tabs: ★ Fav | D1 | D2 | D3
  - Fav: show favorites section, hide browser
  - D1/D2/D3: show browser section with `TeamBrowserState.setDivisionFilter()`, hide favorites
- Toast notifications: reposition above bottom bar on mobile
- Portrait mode: basic usability improvements
- Any remaining polish from testing

**Verify:** Right drawer tabs filter correctly. Toasts appear above bottom bar.

---

## Workflow Per Slice

Each sub-slice runs through the standard workflow in a fresh conversation:
1. `QPLAN 10.0x` → creates spec in `context/slices/`
2. `QCODE 10.0x` → implements
3. `QCHECK` → verifies
4. `QTEST` → manual testing guide
5. `QGIT` → commit

## Test Points
- **After 10.0c** (now): First real mobile test - tabs, drawers, week nav
- **After 10.0e**: Final comprehensive test
