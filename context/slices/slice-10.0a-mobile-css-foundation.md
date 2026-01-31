# Slice 10.0a: Mobile Responsive CSS Foundation + HTML Skeleton

## 1. Slice Definition

- **Slice ID:** 10.0a
- **Name:** Mobile CSS Foundation + HTML Skeleton
- **User Story:** As a player on a phone/tablet in landscape mode, I see a usable single-column layout with the availability grid filling the screen, so that I can check and update my availability on mobile.
- **Success Criteria:**
  - At `max-width: 900px`, layout collapses from 3-column grid to full-width single column
  - Side panels (Team Info, Favorites, Browse Teams) are hidden on mobile
  - Availability grid fills 100% width on mobile
  - Empty drawer containers and bottom bar HTML exist (hidden on desktop, visible skeleton on mobile)
  - Portrait orientation shows a "rotate to landscape" overlay
  - Desktop layout is 100% unchanged (zero regression)
  - All touch targets are minimum 2.75rem (44px equivalent) for accessibility

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Section 6 (UI/UX): Responsive mobile layout in landscape orientation
- Section 4.1 (Availability Grid): Grid must remain functional at mobile viewport sizes

DEPENDENT SECTIONS:
- Slice 5.0a: Current 3x3 grid layout (main-grid-v3) that we're adapting
- Slice 5.0b: Floating action button positioning (must not break on mobile)
- All existing panel components: Must remain rendered in DOM (just hidden via CSS)

IGNORED SECTIONS (deferred to later 10.0 sub-slices):
- 10.0b: JavaScript drawer open/close logic, DOM node relocation
- 10.0c: Bottom bar tab switching, week navigation in bottom bar
- 10.0d: Touch swipe gestures, drag-select on touch
- 10.0e: Right drawer tabs, toast/button repositioning polish
```

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- No new JS components in 10.0a
- All existing components remain unchanged
- HTML skeleton added for future JS components (drawers, bottom bar)

FRONTEND SERVICES:
- No service changes

BACKEND REQUIREMENTS:
- None — this is a purely CSS/HTML slice

INTEGRATION POINTS:
- CSS media queries at max-width: 900px
- HTML containers for drawers (empty, populated by JS in 10.0b)
- Portrait orientation detection via @media (orientation: portrait)
```

## 4. Integration Code Examples

### 4a. Mobile Breakpoint — Grid Collapse

```css
/* In src/css/input.css — ADDITIVE media query, desktop untouched */
@media (max-width: 900px) and (orientation: landscape) {
  .app-container {
    padding: 0; /* Remove desktop padding on mobile */
  }

  .main-grid-v3 {
    grid-template-columns: 1fr; /* Single column */
    grid-template-rows: 1fr auto; /* Grid fills space, bottom bar at bottom */
    gap: 0;
  }

  /* Hide side panels */
  #panel-top-left,
  #panel-top-right,
  #panel-mid-left,
  #panel-mid-right,
  #panel-bottom-left,
  #panel-bottom-right {
    display: none;
  }

  /* Hide desktop divider row */
  #panel-mid-center {
    display: none;
  }

  /* Grid panels fill width */
  #panel-top-center,
  #panel-bottom-center {
    grid-column: 1;
  }
}
```

### 4b. Drawer HTML Skeleton (in index.html)

```html
<!-- Mobile Drawer Containers (empty — JS populates in 10.0b) -->

<!-- Left Drawer: Team Info + Roster -->
<div id="mobile-drawer-left" class="mobile-drawer mobile-drawer-left hidden"
     aria-hidden="true" role="dialog" aria-label="Team information">
  <div class="mobile-drawer-content">
    <!-- TeamInfo content moved here by JS in 10.0b -->
  </div>
</div>

<!-- Right Drawer: Favorites + Browse Teams -->
<div id="mobile-drawer-right" class="mobile-drawer mobile-drawer-right hidden"
     aria-hidden="true" role="dialog" aria-label="Team browser">
  <div class="mobile-drawer-content">
    <!-- FavoritesPanel + TeamBrowser moved here by JS in 10.0b -->
  </div>
</div>

<!-- Drawer Overlay -->
<div id="mobile-drawer-overlay" class="mobile-drawer-overlay hidden"></div>

<!-- Mobile Bottom Bar -->
<div id="mobile-bottom-bar" class="mobile-bottom-bar hidden">
  <div class="mobile-bottom-bar-content">
    <!-- Tab buttons + week nav added by JS in 10.0c -->
  </div>
</div>

<!-- Portrait Orientation Overlay -->
<div id="portrait-overlay" class="portrait-overlay">
  <div class="portrait-overlay-content">
    <span class="portrait-icon">↻</span>
    <p>Please rotate your device to landscape mode</p>
  </div>
</div>
```

### 4c. Drawer Container CSS (hidden on desktop, styled for mobile)

```css
/* Drawer base styles — hidden on desktop */
.mobile-drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  width: 70vw;
  max-width: 20rem;
  background-color: var(--card);
  z-index: 45;
  overflow-y: auto;
  transform: translateX(-100%);
  transition: transform 200ms ease;
}

.mobile-drawer-left {
  left: 0;
}

.mobile-drawer-right {
  right: 0;
  transform: translateX(100%);
}

.mobile-drawer.open {
  transform: translateX(0);
}

.mobile-drawer-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0 0 0 / 0.5);
  z-index: 44;
}

/* Mobile bottom bar */
.mobile-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3rem;
  background-color: var(--muted);
  border-top: 1px solid var(--border);
  z-index: 43;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ALL mobile elements hidden on desktop */
.mobile-drawer,
.mobile-drawer-overlay,
.mobile-bottom-bar {
  display: none;
}

@media (max-width: 900px) and (orientation: landscape) {
  .mobile-drawer,
  .mobile-bottom-bar {
    display: flex;
  }

  /* Bottom bar takes space from grid */
  .main-grid-v3 {
    height: calc(100vh - 3rem); /* Account for bottom bar */
  }
}
```

### 4d. Portrait Orientation Overlay

```css
/* Portrait overlay — shown ONLY in portrait on small screens */
.portrait-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background-color: var(--background);
  z-index: 100;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.portrait-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.portrait-icon {
  font-size: 3rem;
  animation: rotate-hint 2s ease-in-out infinite;
}

@keyframes rotate-hint {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(90deg); }
}

@media (max-width: 900px) and (orientation: portrait) {
  .portrait-overlay {
    display: flex;
  }
}
```

### 4e. Touch-Friendly Cell Sizing

```css
@media (max-width: 900px) and (orientation: landscape) {
  /* Ensure grid cells meet minimum touch target size */
  .availability-cell {
    min-height: 2.75rem; /* 44px equivalent at default font-size */
    min-width: 2.75rem;
  }

  /* Slightly larger font for mobile readability */
  .week-header {
    font-size: 0.875rem;
  }
}
```

## 5. Performance Classification

```
HOT PATHS (<50ms):
- CSS media query evaluation: Browser-native, instant
- Grid reflow on orientation change: Browser-native CSS grid
- No runtime JS in this slice

COLD PATHS (<2s):
- Initial page load with mobile CSS: No measurable impact (CSS is additive)

BACKEND PERFORMANCE:
- N/A — no backend changes
```

## 6. Data Flow Diagram

```
No runtime data flow changes in 10.0a.

CSS-only flow:
Browser viewport ≤ 900px + landscape
  → Media queries activate
  → Side panels: display: none
  → Grid: single column
  → Drawer containers: display: flex (but empty/closed)
  → Bottom bar: visible (but no JS functionality yet)

Browser viewport ≤ 900px + portrait
  → Portrait overlay: display: flex (blocks all content)

Browser viewport > 900px
  → All mobile CSS ignored
  → Desktop layout unchanged
  → Mobile elements: display: none
```

## 7. Test Scenarios

```
FRONTEND TESTS (Visual / Manual):
- [ ] Desktop at 1920x1080: Layout identical to before (no regression)
- [ ] Desktop at 2560x1440: Layout identical to before (no regression)
- [ ] Chrome DevTools at 900x500 landscape: Grid collapses to single column
- [ ] Chrome DevTools at 800x400 landscape: Side panels hidden, grid full-width
- [ ] Chrome DevTools at 900x500 portrait: Rotate overlay visible
- [ ] Drawer containers exist in DOM but are not visible on desktop
- [ ] Bottom bar exists in DOM but is not visible on desktop
- [ ] Availability grid cells are at least 44px tall on mobile
- [ ] No horizontal scrollbar on mobile landscape

INTEGRATION TESTS:
- [ ] Existing grid selection still works at mobile viewport
- [ ] Existing modals (Comparison, Team Management) still open correctly
- [ ] Toast notifications still visible on mobile
- [ ] Floating action button (Slice 5.0b) not broken on mobile
- [ ] Week display header/navigation still functional on mobile

END-TO-END:
- [ ] Open on actual phone in landscape — layout is single-column
- [ ] Rotate to portrait — overlay appears
- [ ] Rotate back to landscape — overlay disappears, grid visible
- [ ] All existing functionality works (click cells, navigate weeks)
```

## 8. Common Integration Pitfalls

- [ ] **Editing `public/css/main.css` instead of `src/css/input.css`** — main.css is auto-generated by Tailwind
- [ ] **Using `px` units instead of `rem`** — All sizing must be rem (except borders)
- [ ] **Modifying desktop grid CSS** — All mobile CSS must be inside `@media (max-width: 900px)` queries
- [ ] **Removing DOM elements instead of hiding** — Side panels must stay in DOM (`display: none`, not removed) so existing JS components don't break
- [ ] **Forgetting `orientation: landscape`** — Most mobile media queries need both `max-width` AND `orientation` checks
- [ ] **Z-index conflicts** — Drawers (45), overlay (44), bottom bar (43) must not conflict with modals (50+) or toasts (40)
- [ ] **Not accounting for bottom bar height** — Grid height must subtract bottom bar (3rem) on mobile
- [ ] **Adding JavaScript** — This slice is CSS/HTML only. No JS changes.

## 9. Implementation Notes

- **Similar pattern:** Slice 5.0a restructured the grid layout with pure HTML/CSS changes. This slice follows the same approach but is additive (media queries only).
- **Tailwind watcher:** Must be running (`npm run css:watch` or equivalent) to rebuild `main.css` after `input.css` changes.
- **Testing approach:** Use Chrome DevTools device emulation. Toggle between responsive sizes to verify breakpoint at 900px.
- **Dependencies:** Slice 5.0a must be complete (it is — current layout is `main-grid-v3`).
- **Drawer width choice:** 70vw / max 20rem balances content visibility with seeing the grid behind the drawer.
- **Bottom bar height:** 3rem matches the existing divider row height for visual consistency.

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Landscape-only support is sufficient for 10.0a. Portrait shows rotate message.
  - **Rationale**: Gaming community primarily uses landscape. Portrait grid would be unusable.
- **[ASSUMPTION]**: Drawer width at 70vw / max 20rem provides good balance.
  - **Rationale**: Wide enough to show team info, narrow enough to hint at grid behind it.
  - **Alternative**: Could use 80vw but would obscure too much grid content.
- **[ASSUMPTION]**: Bottom bar height at 3rem matches divider row.
  - **Rationale**: Consistent visual language. Tall enough for touch targets.

---

## Files Changed Summary

| File | Change Type | Scope |
|------|------------|-------|
| `src/css/input.css` | Modify | Add mobile media queries (~80 lines) |
| `public/index.html` | Modify | Add drawer containers + bottom bar + portrait overlay HTML |
| No JS files | None | CSS-only slice |

## Implementation Order

1. Add portrait overlay HTML + CSS (quick win, testable immediately)
2. Add mobile grid collapse media queries (core layout change)
3. Add drawer container HTML + base CSS (hidden on desktop)
4. Add bottom bar HTML + base CSS (hidden on desktop)
5. Add touch-friendly cell sizing
6. Test desktop regression (must be zero changes)
7. Test mobile landscape at various viewport sizes
