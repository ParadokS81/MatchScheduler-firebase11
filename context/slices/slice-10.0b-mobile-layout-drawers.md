# Slice 10.0b: MobileLayout.js Core + Drawer Management

## 1. Slice Definition

- **Slice ID:** 10.0b
- **Name:** MobileLayout.js Core + Drawer Management
- **User Story:** As a mobile player in landscape mode, I can open left/right drawers to access team info and browse teams, with an overlay preventing interaction with the grid while a drawer is open, so that I can manage my experience in the constrained mobile viewport.
- **Success Criteria:**
  - MobileLayout.js detects mobile viewport (≤900px landscape) and relocates DOM nodes to drawers
  - Left drawer contains Team Info content (moved from `#panel-top-left`)
  - Right drawer contains Favorites + Browse Teams content (moved from `#panel-top-right`, `#panel-mid-right`)
  - Tapping overlay closes the open drawer
  - Drawers are mutually exclusive — opening one closes the other
  - Resizing back to desktop (>900px) restores DOM nodes to original panels
  - Desktop layout has zero regression — all changes gated behind mobile detection
  - Drawer open/close transitions use the existing 200ms CSS transition

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Section 6.8 (Responsive Design): Drawer/revealing menus for hidden side panels
- Section 6.1-6.7 (UI Patterns): Adapted for mobile drawer context

DEPENDENT SECTIONS:
- Slice 10.0a: CSS foundation + HTML skeleton (drawer containers, overlay, media queries) ✅ COMPLETE
- Slice 5.0a: 3x3 grid layout (`main-grid-v3`) — source of DOM nodes to relocate

IGNORED SECTIONS (deferred to later sub-slices):
- 10.0c: Bottom bar tab switching, week navigation, drawer toggle BUTTONS
- 10.0d: Touch swipe gestures, drag-select on touch
- 10.0e: Right drawer tabs, toast/button repositioning
```

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

NEW — MobileLayout.js (Revealing Module Pattern)
  - Firebase listeners: none
  - Cache interactions: none
  - UI responsibilities:
    - Detect mobile breakpoint via matchMedia
    - Move DOM nodes: TeamInfo → left drawer, Favorites+Browser → right drawer
    - Toggle drawer open/close state (add/remove .open class + .hidden on overlay)
    - Prevent body scroll when drawer open
    - Restore DOM nodes to original panels on desktop resize
  - User actions:
    - Tap overlay → close drawer
    - (Drawer toggle buttons added in 10.0c — MobileLayout exposes public API)

MODIFIED — app.js (minimal)
  - Add MobileLayout.init() call after component initialization
  - Add <script> tag for MobileLayout.js in index.html

FRONTEND SERVICES:
- No service changes

BACKEND REQUIREMENTS:
- None — purely frontend DOM manipulation

INTEGRATION POINTS:
- MobileLayout exposes public API for 10.0c to consume:
  - openLeftDrawer()
  - openRightDrawer()
  - closeDrawer()
  - isDrawerOpen() → boolean
  - isMobile() → boolean
- MobileLayout listens to:
  - matchMedia('(max-width: 900px) and (orientation: landscape)') change events
  - Overlay click events
```

## 4. Integration Code Examples

### 4a. MobileLayout.js — Core Module

```javascript
const MobileLayout = (function() {
    // Private state
    let _mobileQuery = null;
    let _isMobile = false;
    let _activeDrawer = null; // 'left' | 'right' | null

    // DOM references
    let _leftDrawer, _rightDrawer, _overlay;

    // Original parent references for DOM restoration
    let _originalParents = {};

    // Node relocation map: { nodeId: targetDrawerContentSelector }
    const LEFT_DRAWER_NODES = ['panel-top-left'];        // Team Info
    const RIGHT_DRAWER_NODES = ['panel-top-right', 'panel-mid-right']; // Favorites, Browse Teams

    function init() {
        _leftDrawer = document.getElementById('mobile-drawer-left');
        _rightDrawer = document.getElementById('mobile-drawer-right');
        _overlay = document.getElementById('mobile-drawer-overlay');

        if (!_leftDrawer || !_rightDrawer || !_overlay) {
            console.warn('MobileLayout: drawer elements not found, skipping init');
            return;
        }

        // Store original parents before any moves
        _storeOriginalParents();

        // Set up media query listener
        _mobileQuery = window.matchMedia('(max-width: 900px) and (orientation: landscape)');
        _mobileQuery.addEventListener('change', _handleBreakpointChange);

        // Overlay click closes drawer
        _overlay.addEventListener('click', closeDrawer);

        // Apply initial state
        _handleBreakpointChange(_mobileQuery);
    }

    function _storeOriginalParents() {
        [...LEFT_DRAWER_NODES, ...RIGHT_DRAWER_NODES].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.parentElement) {
                _originalParents[id] = {
                    parent: el.parentElement,
                    nextSibling: el.nextElementSibling
                };
            }
        });
    }

    function _handleBreakpointChange(e) {
        const matches = e.matches !== undefined ? e.matches : e;
        if (matches) {
            _enterMobile();
        } else {
            _exitMobile();
        }
    }

    function _enterMobile() {
        _isMobile = true;
        _moveNodesToDrawers();
    }

    function _exitMobile() {
        closeDrawer();
        _isMobile = false;
        _restoreNodesToOriginal();
    }

    function _moveNodesToDrawers() {
        const leftContent = _leftDrawer.querySelector('.mobile-drawer-content');
        const rightContent = _rightDrawer.querySelector('.mobile-drawer-content');

        LEFT_DRAWER_NODES.forEach(id => {
            const el = document.getElementById(id);
            if (el) leftContent.appendChild(el);
        });

        RIGHT_DRAWER_NODES.forEach(id => {
            const el = document.getElementById(id);
            if (el) rightContent.appendChild(el);
        });
    }

    function _restoreNodesToOriginal() {
        Object.entries(_originalParents).forEach(([id, info]) => {
            const el = document.getElementById(id);
            if (el && info.parent) {
                if (info.nextSibling) {
                    info.parent.insertBefore(el, info.nextSibling);
                } else {
                    info.parent.appendChild(el);
                }
            }
        });
    }

    function openLeftDrawer() {
        if (!_isMobile) return;
        if (_activeDrawer === 'left') return;
        if (_activeDrawer) closeDrawer(); // Mutually exclusive

        _leftDrawer.classList.remove('hidden');
        _overlay.classList.remove('hidden');
        // Force reflow before adding .open for transition
        _leftDrawer.offsetHeight;
        _leftDrawer.classList.add('open');
        _leftDrawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        _activeDrawer = 'left';
    }

    function openRightDrawer() {
        if (!_isMobile) return;
        if (_activeDrawer === 'right') return;
        if (_activeDrawer) closeDrawer();

        _rightDrawer.classList.remove('hidden');
        _overlay.classList.remove('hidden');
        _rightDrawer.offsetHeight;
        _rightDrawer.classList.add('open');
        _rightDrawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        _activeDrawer = 'right';
    }

    function closeDrawer() {
        if (!_activeDrawer) return;

        const drawer = _activeDrawer === 'left' ? _leftDrawer : _rightDrawer;
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        _overlay.classList.add('hidden');
        document.body.style.overflow = '';

        // Hide drawer element after transition completes
        drawer.addEventListener('transitionend', function handler() {
            if (!drawer.classList.contains('open')) {
                drawer.classList.add('hidden');
            }
            drawer.removeEventListener('transitionend', handler);
        });

        _activeDrawer = null;
    }

    function isDrawerOpen() {
        return _activeDrawer !== null;
    }

    function isMobile() {
        return _isMobile;
    }

    function cleanup() {
        if (_mobileQuery) {
            _mobileQuery.removeEventListener('change', _handleBreakpointChange);
        }
        if (_overlay) {
            _overlay.removeEventListener('click', closeDrawer);
        }
        closeDrawer();
        _restoreNodesToOriginal();
    }

    return {
        init,
        cleanup,
        openLeftDrawer,
        openRightDrawer,
        closeDrawer,
        isDrawerOpen,
        isMobile
    };
})();
```

### 4b. app.js Integration

```javascript
// In the existing init sequence, AFTER component initialization:
// (components must be initialized first so their DOM exists to move)

if (typeof MobileLayout !== 'undefined') {
    MobileLayout.init();
}
```

### 4c. index.html Script Tag

```html
<!-- Before app.js, after component scripts -->
<script src="/js/MobileLayout.js"></script>
```

### 4d. Moved Panels Visibility Fix

The side panels have `display: none` on mobile from 10.0a CSS. Once moved into drawers, they need to be visible inside the drawer context:

```css
/* In src/css/input.css — inside the mobile media query */
@media (max-width: 900px) and (orientation: landscape) {
  /* Panels moved into drawers need to be visible */
  .mobile-drawer-content #panel-top-left,
  .mobile-drawer-content #panel-top-right,
  .mobile-drawer-content #panel-mid-right {
    display: block;
  }
}
```

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Drawer open/close toggle: Pure DOM class manipulation, instant
- Overlay show/hide: CSS class toggle, instant
- Scroll lock toggle: Single style property change, instant

COLD PATHS (<2s):
- DOM node relocation on breakpoint change: ~10 DOM moves, negligible
- Initial MobileLayout.init(): matchMedia setup + conditional DOM moves

BACKEND PERFORMANCE:
- N/A — no backend changes
```

## 6. Data Flow Diagram

```
No Firestore data flow changes — this slice is DOM manipulation only.

DRAWER OPEN FLOW:
10.0c button tap (future) → MobileLayout.openLeftDrawer()
  → Remove .hidden from drawer + overlay
  → Force reflow
  → Add .open to drawer (triggers CSS transform transition)
  → Set aria-hidden="false"
  → Lock body scroll
  → _activeDrawer = 'left'

DRAWER CLOSE FLOW:
Overlay tap → MobileLayout.closeDrawer()
  → Remove .open from drawer (triggers CSS transition)
  → Set aria-hidden="true"
  → Add .hidden to overlay
  → Unlock body scroll
  → On transitionend → Add .hidden to drawer
  → _activeDrawer = null

BREAKPOINT CHANGE FLOW:
Window resize crosses 900px → matchMedia fires
  → If entering mobile:
    → Move panel nodes into drawer containers
    → Set _isMobile = true
  → If leaving mobile:
    → Close any open drawer
    → Restore panel nodes to original parents
    → Set _isMobile = false

IMPORTANT: Firebase listeners on moved nodes (TeamInfo, FavoritesPanel)
continue working after DOM relocation — listeners are not DOM-dependent.
```

## 7. Test Scenarios

```
FRONTEND TESTS (Manual):
- [ ] MobileLayout.js loads without errors on desktop
- [ ] At desktop viewport (>900px): No DOM changes, drawers hidden
- [ ] At mobile viewport (≤900px landscape): panel-top-left is inside left drawer
- [ ] At mobile viewport: panel-top-right + panel-mid-right are inside right drawer
- [ ] MobileLayout.openLeftDrawer() shows left drawer with slide-in animation
- [ ] MobileLayout.openRightDrawer() shows right drawer with slide-in animation
- [ ] Opening left while right is open → right closes, left opens
- [ ] Opening right while left is open → left closes, right opens
- [ ] Tapping overlay closes whichever drawer is open
- [ ] Body cannot scroll while drawer is open
- [ ] Body scroll restored after drawer closes
- [ ] aria-hidden updates correctly on open/close

RESPONSIVE TESTS:
- [ ] Resize from desktop → mobile: nodes move to drawers
- [ ] Resize from mobile → desktop: nodes restored to original panels
- [ ] Resize from mobile (drawer open) → desktop: drawer closes, nodes restored
- [ ] Rotate to portrait on mobile: portrait overlay appears (existing 10.0a behavior)
- [ ] Rotate back to landscape: drawer state is closed (clean start)

INTEGRATION TESTS:
- [ ] TeamInfo content renders correctly inside left drawer
- [ ] FavoritesPanel content renders correctly inside right drawer
- [ ] If TeamInfo has a Firestore listener, it continues receiving updates after DOM move
- [ ] If FavoritesPanel has a listener, it continues receiving updates after DOM move
- [ ] Availability grid remains interactive when drawer is closed
- [ ] Existing modals (Comparison, Team Management) still work on mobile
- [ ] Toast notifications still visible when drawer is open (z-index check)

REGRESSION TESTS (Desktop):
- [ ] Desktop at 1920x1080: Layout identical to before
- [ ] All existing panel content renders in correct positions
- [ ] All existing modals, buttons, interactions unchanged
- [ ] No console errors from MobileLayout on desktop
```

## 8. Common Integration Pitfalls

- [ ] **Forgetting to show moved panels inside drawers** — 10.0a CSS hides side panels with `display: none` on mobile. Must add CSS override for panels when they're inside `.mobile-drawer-content`
- [ ] **DOM move order matters** — Components must be initialized BEFORE MobileLayout.init() so their DOM nodes exist to move
- [ ] **Transition timing with .hidden** — Cannot add `.hidden` (display:none) before CSS transition completes. Must use `transitionend` event
- [ ] **matchMedia initial check** — Must call handler on init, not just on change events
- [ ] **Original parent references going stale** — Store references BEFORE any DOM moves happen
- [ ] **Force reflow before .open** — Adding `.hidden` removal and `.open` in same frame skips transition. Need `offsetHeight` read between them
- [ ] **Overlay z-index** — Overlay (44) must be between bottom bar (43) and drawer (45), but below modals (50+)
- [ ] **Body scroll lock leaking** — If user resizes to desktop while drawer open, scroll lock must be removed

## 9. Implementation Notes

- **Pattern follows:** Revealing Module Pattern per CLAUDE.md. No Firebase, no services, pure DOM management.
- **Similar to:** SelectionActionButton.js (Slice 5.0b) — DOM positioning, show/hide logic, viewport awareness.
- **Dependencies:** 10.0a must be complete (✅). Drawer HTML + CSS already in place.
- **Consumed by:** 10.0c will call `MobileLayout.openLeftDrawer()` / `openRightDrawer()` from bottom bar buttons. This slice only provides the API — no visible toggle buttons yet.
- **Testing without buttons:** During development, use browser console: `MobileLayout.openLeftDrawer()` to test drawers since 10.0c hasn't added the UI buttons yet.
- **Tailwind watcher:** Must be running to pick up any CSS changes in `src/css/input.css`.

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: No keyboard handling needed for drawers on mobile (no physical keyboard)
  - **Rationale**: Mobile landscape users don't have Escape key. Desktop never shows drawers.
- **[ASSUMPTION]**: Moving entire panel elements (including all children) is sufficient — no need to move individual sub-components
  - **Rationale**: Panel elements contain all rendered component content. Moving the parent moves everything.
- **[ASSUMPTION]**: Drawers default to closed state on every mobile entry (resize or page load)
  - **Rationale**: No need to persist drawer state. Clean start is predictable UX.
- **[ASSUMPTION]**: The `.hidden` class uses `display: none` and is compatible with drawer transition approach (remove hidden, force reflow, add open)
  - **Rationale**: Standard pattern. Hidden prevents layout thrashing when drawer not in use.

---

## Files Changed Summary

| File | Change Type | Scope |
|------|------------|-------|
| `public/js/MobileLayout.js` | **NEW** | ~120 lines — drawer management module |
| `public/index.html` | Modify | Add `<script>` tag for MobileLayout.js |
| `public/js/app.js` | Modify | Add `MobileLayout.init()` call (~3 lines) |
| `src/css/input.css` | Modify | Add drawer-content panel visibility override (~6 lines) |

## Implementation Order

1. Create `MobileLayout.js` with full module (private state, DOM refs, matchMedia, open/close/move/restore)
2. Add `<script>` tag in `index.html` before `app.js`
3. Add `MobileLayout.init()` call in `app.js` after component init
4. Add CSS override for panels inside drawer content
5. Test on desktop — verify zero regression
6. Test on mobile viewport — verify DOM moves, drawer open/close via console
7. Test resize between desktop ↔ mobile — verify DOM restoration
