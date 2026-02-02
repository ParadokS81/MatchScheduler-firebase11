# Slice 10.0d: Swipe Gestures & Touch Grid Selection

## STATUS: 🔶 PARTIALLY COMPLETE

**Done:**
- ✅ CSS touch styles (touch-action, drag prevention, tap feedback) — in input.css mobile media query
- ✅ AvailabilityGrid already uses pointer events (pointerdown/pointermove/pointerup) instead of mouse events

**Remaining:**
- ❌ AvailabilityGrid: Add `setPointerCapture()` on pointerdown so touch drag tracks across cells
- ❌ MobileLayout.js: Edge swipe gesture detection (left/right screen edges → open drawers)
- ❌ Touch drag vs scroll disambiguation (initial movement direction check)

## 1. Slice Definition

- **Slice ID:** 10.0d
- **Name:** Swipe Gestures & Touch Grid Selection
- **User Story:** As a mobile player using touch, I can swipe from screen edges to open drawers and drag across grid cells to select availability slots, getting natural touch interactions without relying on buttons.
- **Success Criteria:**
  - Swiping from left screen edge opens left drawer with existing slide-in animation
  - Swiping from right screen edge opens right drawer with existing slide-in animation
  - Vertical pointer movement cancels swipe (user is scrolling, not swiping)
  - Dragging across grid cells selects rectangular range (same behavior as desktop mouse drag from Slice 2.3)
  - Touch drag is distinguished from scroll by initial movement direction
  - All gestures show visual feedback (drag preview highlight, drawer slide animation)
  - Desktop layout completely unchanged (pointer events are backward-compatible with mouse)
  - Gestures are supplementary — all actions remain available via bottom bar buttons (Slice 10.0c)

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Section 6 (UI/UX): Mobile touch interaction patterns, gesture support
- Section 6.8 (Responsive Design): Drawer interaction on mobile landscape
- Section 4.1 (Availability Grid): Grid selection usable on touch devices

DEPENDENT SECTIONS:
- Slice 10.0a: CSS foundation (media queries, mobile layout) ✅
- Slice 10.0b: MobileLayout.js drawer API (openLeftDrawer/openRightDrawer) ✅
- Slice 10.0c: Mobile bottom bar (buttons as gesture fallback) ✅
- Slice 2.3: Advanced selection (drag-select rectangle logic, drag preview) ✅

IGNORED SECTIONS (deferred):
- Haptic feedback (vibration API) — defer to 10.0e polish
- Pinch-to-zoom, long-press context menus — out of scope
- Spring/physics-based animations — CSS transitions sufficient
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

MODIFIED — AvailabilityGrid.js
  - Firebase listeners: none (unchanged)
  - Cache interactions: none (unchanged)
  - UI responsibilities:
    - Replace mouse event handlers with pointer event handlers
    - Same rectangular drag-select logic works for mouse + touch + pen
    - Show drag preview highlight during selection
    - Map local cell IDs to UTC via TimezoneService before Firestore update
  - User actions (modified):
    - pointerdown on cell → start drag tracking (replaces mousedown)
    - pointermove → update drag preview (replaces mousemove)
    - pointerup → apply selection (replaces mouseup)
  - Key state (existing, unchanged):
    - _isDragging, _dragStartCell, _dragStartPos, _dragDistance
    - _lastValidDragCell, _selectedCells, _gridToUtcMap

MODIFIED — MobileLayout.js
  - Firebase listeners: none
  - Cache interactions: none
  - UI responsibilities:
    - Detect edge swipe gestures (left & right screen edges)
    - Track pointer position and movement distance
    - Validate swipe direction and threshold
    - Call existing openLeftDrawer/openRightDrawer on valid swipe
    - Cancel swipe if vertical movement detected (scrolling)
  - User actions (new):
    - Edge swipe left-to-right (from left 30px) → open left drawer
    - Edge swipe right-to-left (from right 30px) → open right drawer
  - New state:
    - _swipeStartX, _swipeStartY, _swipeDistance
    - _swipeDirection: 'left' | 'right' | null

MODIFIED — src/css/input.css
  - touch-action rules to prevent default browser gestures during drag
  - :active state styling for tap feedback on cells
  - user-select: none on grid during drag

FRONTEND SERVICES:
- No service changes required

BACKEND REQUIREMENTS:
- None (pure frontend interaction layer)

INTEGRATION POINTS:
- AvailabilityGrid: Pointer events → existing _applyRectangularSelection() → AvailabilityService
- MobileLayout: Swipe detection → existing openLeftDrawer()/openRightDrawer()
- CSS: Mobile media query guards all new touch styles (desktop unchanged)
```

---

## 4. Integration Code Examples

### 4a. AvailabilityGrid.js — Pointer Event Migration

The key change: replace `mousedown/mousemove/mouseup` listeners with `pointerdown/pointermove/pointerup`. The handler logic is nearly identical — pointer events use the same `clientX`/`clientY` API.

```javascript
// In _setupEventListeners() — replace mouse listeners with pointer listeners

// OLD (remove):
_container.addEventListener('mousedown', _handleMouseDown);
_container.addEventListener('mousemove', _handleMouseMove);
document.addEventListener('mouseup', _documentMouseUpHandler);

// NEW (add):
_container.addEventListener('pointerdown', _handlePointerDown, { passive: false });
_container.addEventListener('pointermove', _handlePointerMove, { passive: false });
document.addEventListener('pointerup', _documentPointerUpHandler);
```

```javascript
// _handlePointerDown — same logic as _handleMouseDown, plus isPrimary check
function _handlePointerDown(e) {
    // Ignore secondary pointers (multi-touch)
    if (!e.isPrimary) return;

    if (e.target.closest('.player-badge.overflow')) return;

    const cell = e.target.closest('.grid-cell');
    if (!cell || !cell.dataset.cellId) return;

    _isDragging = true;
    _dragStartCell = cell.dataset.cellId;
    _dragStartPos = { x: e.clientX, y: e.clientY };
    _dragDistance = 0;

    const gridContainer = _container?.querySelector('.availability-grid-container');
    if (gridContainer) gridContainer.classList.add('dragging');

    _updateDragPreview(_dragStartCell, _dragStartCell);
    e.preventDefault();
}

// _handlePointerMove — same logic as _handleMouseMove
function _handlePointerMove(e) {
    if (!_isDragging || !_dragStartCell) return;

    _dragDistance = Math.max(
        _dragDistance,
        Math.abs(e.clientX - _dragStartPos.x),
        Math.abs(e.clientY - _dragStartPos.y)
    );

    const cell = e.target.closest('.grid-cell');
    if (!cell || !cell.dataset.cellId) return;
    if (!_container?.contains(cell)) return;

    _lastValidDragCell = cell.dataset.cellId;
    _updateDragPreview(_dragStartCell, cell.dataset.cellId);
}

// _handlePointerUp — same logic as _handleMouseUp
function _handlePointerUp(e) {
    if (!_isDragging) return;

    const gridContainer = _container?.querySelector('.availability-grid-container');
    if (gridContainer) gridContainer.classList.remove('dragging');

    if (_dragDistance < DRAG_THRESHOLD) {
        _clearDragPreview();
        _isDragging = false;
        _dragStartCell = null;
        _lastValidDragCell = null;
        return;
    }

    const endCell = _lastValidDragCell || _dragStartCell;
    _applyRectangularSelection(_dragStartCell, endCell);
    _clearDragPreview();

    _isDragging = false;
    _dragStartCell = null;
    _lastValidDragCell = null;
}
```

**Also migrate:** `mouseenter`/`mouseleave` for hover tooltips → `pointerenter`/`pointerleave`. These work identically.

### 4b. MobileLayout.js — Swipe Detection

Add swipe detection as a new concern within the existing IIFE. Swipe calls the existing `openLeftDrawer()`/`openRightDrawer()` public methods.

```javascript
// NEW: Swipe detection constants
const SWIPE_THRESHOLD = 50;        // Min horizontal distance to trigger (px)
const EDGE_MARGIN = 30;            // Touch zone from screen edge (px)
const VERTICAL_TOLERANCE = 20;     // Max vertical drift before cancel (px)

// NEW: Swipe state
let _swipeStartX = null;
let _swipeStartY = null;
let _swipeDistance = 0;
let _swipeDirection = null;        // 'left' | 'right' | null

function _setupSwipeDetection() {
    document.addEventListener('pointerdown', _handleSwipeStart, { passive: true });
    document.addEventListener('pointermove', _handleSwipeMove, { passive: true });
    document.addEventListener('pointerup', _handleSwipeEnd);
}

function _handleSwipeStart(e) {
    if (!_isMobile || !e.isPrimary) return;
    // Don't start swipe if drawer already open
    if (_activeDrawer) return;

    const isLeftEdge = e.clientX < EDGE_MARGIN;
    const isRightEdge = e.clientX > (window.innerWidth - EDGE_MARGIN);
    if (!isLeftEdge && !isRightEdge) return;

    _swipeStartX = e.clientX;
    _swipeStartY = e.clientY;
    _swipeDistance = 0;
    _swipeDirection = isLeftEdge ? 'right' : 'left'; // Swipe direction is opposite of edge
}

function _handleSwipeMove(e) {
    if (_swipeStartX === null || !_swipeDirection) return;

    const moveX = Math.abs(e.clientX - _swipeStartX);
    const moveY = Math.abs(e.clientY - _swipeStartY);

    // Cancel if moving too much vertically (user is scrolling)
    if (moveY > VERTICAL_TOLERANCE && moveY > moveX) {
        _resetSwipe();
        return;
    }

    _swipeDistance = moveX;
}

function _handleSwipeEnd(e) {
    if (_swipeStartX === null || !_swipeDirection) return;

    if (_swipeDistance >= SWIPE_THRESHOLD) {
        // Left edge → swipe right → open left drawer
        // Right edge → swipe left → open right drawer
        if (_swipeDirection === 'right') {
            openLeftDrawer();
        } else {
            openRightDrawer();
        }
    }

    _resetSwipe();
}

function _resetSwipe() {
    _swipeStartX = null;
    _swipeStartY = null;
    _swipeDistance = 0;
    _swipeDirection = null;
}
```

Wire into init:
```javascript
function init() {
    // ... existing init code ...
    _setupSwipeDetection();
    console.log('📱 MobileLayout initialized');
}
```

Wire into cleanup:
```javascript
function cleanup() {
    // ... existing cleanup ...
    document.removeEventListener('pointerdown', _handleSwipeStart);
    document.removeEventListener('pointermove', _handleSwipeMove);
    document.removeEventListener('pointerup', _handleSwipeEnd);
}
```

### 4c. src/css/input.css — Touch Interaction Styles

```css
/* Inside mobile media query: @media (max-width: 1024px) and (orientation: landscape) */

/* Prevent default browser gestures during grid interaction */
.availability-grid-container {
    touch-action: manipulation;
}

/* Prevent text selection during drag */
.availability-grid-container.dragging {
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
}

/* Tap feedback on grid cells */
.grid-cell:active {
    opacity: 0.8;
    transition: none;
}

/* Bottom bar button tap feedback */
.mobile-bb-btn:active {
    opacity: 0.8;
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Swipe gesture detection: Pointer callbacks + simple distance math
- Drag preview update: DOM classList toggle on cached container
- Cell :active feedback: CSS-native, zero JS
- Swipe threshold check on pointerup: Single comparison

COLD PATHS (<2s):
- Firestore update on drag-select completion: 0.5-1s (network)
  via existing AvailabilityService.toggleSlots() with optimistic update

BACKEND PERFORMANCE:
- No new backend calls. All gestures trigger existing frontend paths.
```

---

## 6. Data Flow Diagram

```
DRAG-SELECT FLOW (Grid):
  pointerdown on .grid-cell
    → _handlePointerDown() — store start cell, set _isDragging = true
    → Show drag preview on start cell

  pointermove over .grid-cell
    → _handlePointerMove() — track distance, detect cell under pointer
    → Update drag preview (start → current rectangle)

  pointerup
    → _handlePointerUp()
    → If distance > DRAG_THRESHOLD:
      → _applyRectangularSelection(startCell, endCell)
        → Convert local IDs to UTC via _gridToUtcMap
        → AvailabilityService.toggleSlots(utcSlotIds)
          → Optimistic UI update
          → Firestore write (async)
          → onSnapshot listener fires → grid re-renders
    → Else: treat as single click (existing click handler)
    → Clear drag preview, reset state


SWIPE FLOW (Drawer):
  pointerdown at screen edge (<30px or >width-30px)
    → _handleSwipeStart() — store start position, set direction

  pointermove
    → _handleSwipeMove() — track horizontal distance
    → If vertical drift > tolerance: cancel swipe

  pointerup
    → _handleSwipeEnd()
    → If distance >= 50px:
      → openLeftDrawer() or openRightDrawer()
        → Add .open class (CSS transition slides drawer in)
        → Show overlay, lock body scroll
    → Reset swipe state
```

---

## 7. Test Scenarios

```
FRONTEND TESTS — Touch Drag-Select:
- [ ] Touch cell, drag to adjacent cell → rectangular range selects
- [ ] Small movement (<5px) → toggles single cell (treated as click)
- [ ] Drag across multiple cells → all cells in rectangle show drag-preview during drag
- [ ] Pointer leaves grid during drag → selection stops updating, last valid cell used
- [ ] Release pointer → selection applies, preview clears, grid updates via listener

FRONTEND TESTS — Touch Swipe:
- [ ] Swipe right from left edge (<30px start) → left drawer opens
- [ ] Swipe left from right edge (>width-30px start) → right drawer opens
- [ ] Partial swipe (<50px) → drawer doesn't open
- [ ] Vertical drift during swipe → cancels, no drawer opens
- [ ] Swipe while drawer already open → no-op
- [ ] Touch outside edge margin → no swipe tracking

RESPONSIVE TESTS:
- [ ] Desktop (>1024px): No swipe detection, mouse drag-select works unchanged
- [ ] Mobile landscape: Both touch drag and swipe work
- [ ] Resize desktop → mobile: Swipe detection activates
- [ ] Resize mobile → desktop: Swipe detection deactivates, overflow:hidden cleared

VISUAL FEEDBACK:
- [ ] Cell shows :active opacity on finger press
- [ ] Drag preview border appears during drag (real-time)
- [ ] Drawer slides in smoothly on swipe (existing CSS transition)
- [ ] Overlay appears with drawer

ACCESSIBILITY:
- [ ] Bottom bar buttons still open drawers (gesture is optional)
- [ ] Keyboard navigation unaffected
- [ ] Screen reader announces grid cells correctly

INTEGRATION TESTS:
- [ ] Touch drag on grid → AvailabilityService.toggleSlots() called with UTC slot IDs
- [ ] Listener fires → grid shows updated selection state
- [ ] Swipe opens drawer → drawer content (TeamInfo, etc.) still functional
- [ ] Drawer open → grid behind overlay not interactive (overlay blocks)

REGRESSION TESTS (Desktop):
- [ ] Mouse drag-select works identically (pointer events backward-compatible)
- [ ] Mouse hover tooltips (mouseenter/leave → pointerenter/leave) work
- [ ] No swipe detection triggers on desktop
- [ ] All modals, toasts, FAB unaffected
- [ ] No console errors from pointer event code

END-TO-END:
- [ ] Full journey: drag-select cells → swipe drawer open → read content → close → continue selecting
- [ ] Rapid gestures: Fast swipes don't corrupt state
- [ ] Interrupted gestures: Release outside grid/drawer → state resets cleanly
```

---

## 8. Common Integration Pitfalls

- [ ] **Forgetting `passive: false`** on grid pointer listeners — prevents `e.preventDefault()` which is needed to stop text selection during drag. Swipe listeners can be passive since they don't need preventDefault.
- [ ] **Not checking `e.isPrimary`** — Secondary touches (multi-touch) trigger unwanted drag/swipe. Always guard with `if (!e.isPrimary) return`.
- [ ] **Swipe direction vs. edge confusion** — Left *edge* swipe goes *right* (opening left drawer). Map correctly: left edge → swipeDirection 'right' → openLeftDrawer.
- [ ] **Editing main.css instead of input.css** — All CSS goes in `src/css/input.css`. main.css is auto-generated by Tailwind.
- [ ] **touch-action: none too broad** — Breaks scrolling. Use `touch-action: manipulation` (allows pan/scroll, disables double-tap zoom).
- [ ] **Z-index conflicts** — Drawer (z-45) and overlay (z-44) must be above grid. Verify pointer events don't punch through overlay.
- [ ] **Scroll lock leak** — If drawer open and user resizes to desktop, `overflow: hidden` on body must be removed. `_exitMobile()` already calls `closeDrawer()` which handles this.
- [ ] **Drag preview not clearing on edge cases** — If pointer leaves grid and releases outside, preview must still clear. `_handlePointerUp` is on `document`, so it catches this.
- [ ] **mouseenter/mouseleave for tooltips** — Must also migrate to pointerenter/pointerleave, or tooltips break on touch devices.
- [ ] **Not removing old mouse listeners** — If both mouse and pointer listeners are attached, handlers fire twice. Remove mouse listeners completely.

---

## 9. Implementation Notes

- **Pointer Events over Touch Events**: Pointer events (W3C standard, ~98% browser support) handle mouse + touch + pen with a single API. No need for separate touch event handlers.
- **Migration is mechanical**: The handler bodies are nearly identical between mouse and pointer versions. Main additions are `isPrimary` checks and `{ passive: false }` options.
- **Swipe lives in MobileLayout.js**: Natural home since it calls existing drawer methods. No new module needed.
- **CSS changes are minimal**: `touch-action: manipulation` and `:active` states. All within existing mobile media query.
- **No new files created**: All changes are modifications to existing AvailabilityGrid.js, MobileLayout.js, and input.css.
- **Testing**: Chrome DevTools device emulation works for basic testing but real touch device recommended for gesture timing validation.

---

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Pointer events have sufficient browser support for this community
  - **Rationale**: All modern browsers support pointer events. This is a 2026 gaming community — no IE11 users.
  - **Alternative**: Add touchstart/touchmove/touchend fallback (adds complexity with no practical benefit).

- **[ASSUMPTION]**: 50px swipe threshold and 30px edge margin are appropriate
  - **Rationale**: Matches Material Design guidelines. Balanced between accidental triggers and reachability.
  - **Alternative**: Make configurable and tune during 10.0e polish based on user feedback.

- **[ASSUMPTION]**: Drag-select logic is identical for mouse and touch (no separate implementation)
  - **Rationale**: Pointer events abstract input type. Rectangle selection math doesn't change.
  - **Alternative**: Could add touch-specific UX hints, but unnecessary since drag preview provides visual feedback.

- **[ASSUMPTION]**: No gesture animations beyond existing CSS transitions
  - **Rationale**: Drawer already has CSS slide transition from 10.0b. Adding JS-driven spring animations would increase complexity for minimal benefit.
  - **Alternative**: Physics-based animations in 10.0e polish if users request.

- **[ASSUMPTION]**: Swipe-to-close drawer is not needed (overlay click suffices)
  - **Rationale**: Overlay click/tap to close is standard and already implemented. Adding reverse-swipe adds complexity.
  - **Alternative**: Add swipe-to-close in 10.0e if users find overlay-tap insufficient.

---

## Files Changed Summary

| File | Change | Lines (est.) |
|------|--------|-------------|
| `public/js/components/AvailabilityGrid.js` | Replace mouse → pointer event listeners and handlers | ~80 |
| `public/js/MobileLayout.js` | Add swipe detection (constants, state, 3 handlers, setup, cleanup) | ~70 |
| `src/css/input.css` | Add touch-action, :active states, dragging user-select | ~15 |

## Implementation Order

1. AvailabilityGrid.js — Replace mouse listeners with pointer listeners (rename + isPrimary guard)
2. AvailabilityGrid.js — Migrate hover tooltip listeners (mouseenter/leave → pointerenter/leave)
3. MobileLayout.js — Add swipe detection constants, state, handlers
4. MobileLayout.js — Wire _setupSwipeDetection into init(), cleanup into cleanup()
5. src/css/input.css — Add touch-action and :active styles in mobile media query
6. Desktop regression test — Verify mouse interactions unchanged
7. Mobile test — Verify touch drag-select and swipe gestures
