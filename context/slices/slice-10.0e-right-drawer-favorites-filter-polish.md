# Slice 10.0e: Right Drawer Favorites Filter & Polish

## STATUS: ✅ COMPLETE

All success criteria implemented. Additional mobile optimizations applied on top (compact cards, search+filters at bottom, compare controls in bottom bar).

## 1. Slice Definition

- **Slice ID:** 10.0e
- **Name:** Right Drawer — Unified Team Browser with Favorites Filter & UI Polish
- **User Story:** As a mobile player in landscape mode, I can open the right drawer and see a single team browser list with search, division filters, and a "Fav" toggle button that filters to only starred teams, so that I have full team browsing and favorites functionality in one streamlined view.
- **Success Criteria:**
  - ✅ Right drawer shows a single unified team list (TeamBrowser) with search input and filter buttons
  - ✅ Division filter buttons (Div 1 / Div 2 / Div 3) work as existing toggles
  - ✅ New "Fav" filter button filters the team list to show only starred/favorited teams
  - ✅ Star toggle on each team card works via touch (tap) — same as desktop
  - ✅ Team selection (tap card) works and triggers comparison grid updates
  - ✅ FavoritesPanel and FilterPanel are hidden in the right drawer on mobile (CSS in input.css)
  - ✅ FAB repositioned above bottom bar (CSS: .selection-action-btn { bottom: 3.5rem })
  - ✅ Toast container non-colliding (top-4 right-4)
  - ✅ Touch targets meet 44px minimum in right drawer
  - ✅ Desktop layout unchanged
  - ✅ Drawer interactions <50ms (pure DOM/state)

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Section 6.8 (Responsive Design): Right drawer content organization for mobile
- Section 6.1-6.7 (UI Patterns): Touch-friendly filtering, team browsing in constrained space

DEPENDENT SECTIONS:
- Slice 10.0a: CSS foundation + mobile drawer HTML containers ✅
- Slice 10.0b: MobileLayout.js DOM relocation + drawer open/close ✅
- Slice 10.0c: Bottom bar with right drawer toggle button ✅
- Slice 10.0d: Pointer events + swipe gestures ✅
- Slice 3.1: TeamBrowser component + TeamBrowserState ✅
- Slice 3.2: FavoritesService (getFavorites, isFavorite, toggleFavorite) ✅
- Slice 3.3: FilterPanel + FilterService (min player filters) ✅

IGNORED SECTIONS (out of scope):
- FilterPanel mobile adaptation (min player dropdowns) — not needed in unified view
- FavoritesPanel mobile adaptation — replaced by "Fav" filter button
- Automated testing — manual QTEST after implementation
```

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

MODIFIED — TeamBrowser.js
  - Firebase listeners: existing teams collection listener (no change)
  - Cache interactions: existing TeamService cache reads (no change)
  - UI responsibilities:
    - NEW: Add "Fav" toggle button alongside existing Div 1/Div 2/Div 3 filter buttons
    - NEW: When "Fav" is active, filter _getSearchResults() to only show teams in FavoritesService.getFavorites()
    - Existing: Search input, division filters, team cards with star buttons, selection toggle
  - User actions:
    - Tap "Fav" button → toggle favorites-only filter
    - All existing actions unchanged (search, div filter, card tap, star tap)

MODIFIED — TeamBrowserState.js
  - NEW: Add _favoritesFilter boolean state
  - NEW: toggleFavoritesFilter() method
  - NEW: isFavoritesFilterActive() getter
  - Dispatches existing 'team-browser-filter-changed' event on toggle

MODIFIED — MobileLayout.js
  - No code changes needed. DOM relocation already moves panel-top-right, panel-mid-right,
    panel-bottom-right into right drawer. However, on mobile we want to hide FavoritesPanel
    and FilterPanel content since TeamBrowser's "Fav" button replaces them.

MODIFIED — src/css/input.css
  - NEW: Hide #panel-top-right (FilterPanel) and #panel-mid-right (FavoritesPanel) inside
    right drawer on mobile — only #panel-bottom-right (TeamBrowser) visible
  - NEW: Right drawer content layout (full-height TeamBrowser)
  - NEW: "Fav" filter button styling (matches division filter buttons)
  - NEW: Touch target sizing for filter buttons and team cards in drawer
  - VERIFY: FAB positioning above bottom bar (already in 10.0c CSS)

FRONTEND SERVICES:
- FavoritesService: No changes — existing getFavorites(), isFavorite() used by TeamBrowser
- FilterService: No changes — min player filters not shown on mobile
- TeamBrowserState: Add favoritesFilter toggle (see above)

BACKEND REQUIREMENTS:
- None — purely frontend UI slice. All data already loaded via existing listeners.

INTEGRATION POINTS:
- TeamBrowser reads FavoritesService.getFavorites() when "Fav" filter is active
- TeamBrowser listens to 'favorites-updated' event (already does) to re-render when stars change
- TeamBrowserState dispatches filter change events (existing pattern) for "Fav" toggle
- MobileLayout DOM relocation puts all 3 right panels into drawer (existing)
- CSS hides FilterPanel + FavoritesPanel containers in mobile drawer, shows only TeamBrowser
```

## 4. Integration Code Examples

### 4a. TeamBrowserState — Add Favorites Filter

```javascript
// In TeamBrowserState.js — add to existing state
let _favoritesFilterActive = false;

// Add to public API:
function toggleFavoritesFilter() {
    _favoritesFilterActive = !_favoritesFilterActive;
    _notifyFilterChange();
}

function isFavoritesFilterActive() {
    return _favoritesFilterActive;
}

// Include in reset():
function reset() {
    // ... existing reset code ...
    _favoritesFilterActive = false;
}
```

### 4b. TeamBrowser — Add "Fav" Button + Filter Logic

```javascript
// In TeamBrowser._render() — add "Fav" button to the filter row
// After the existing division filter buttons:

`<div class="flex gap-1 flex-wrap">
    <button class="division-filter-btn fav-filter-btn ${TeamBrowserState.isFavoritesFilterActive() ? 'active' : ''}"
            data-filter="fav">
        ★ Fav
    </button>
    <button class="division-filter-btn" data-division="D1">Div 1</button>
    <button class="division-filter-btn" data-division="D2">Div 2</button>
    <button class="division-filter-btn" data-division="D3">Div 3</button>
</div>`

// In TeamBrowser._attachListeners() — wire the Fav button:
const favBtn = _container.querySelector('.fav-filter-btn');
favBtn?.addEventListener('click', () => {
    TeamBrowserState.toggleFavoritesFilter();
    favBtn.classList.toggle('active');
});

// In TeamBrowser._getSearchResults() — add favorites filter:
function _getSearchResults() {
    const searchQuery = TeamBrowserState.getSearchQuery();
    const divisionFilters = TeamBrowserState.getDivisionFilters();
    const favoritesOnly = TeamBrowserState.isFavoritesFilterActive();

    // Get favorites set for filtering
    const favoriteTeamIds = favoritesOnly && typeof FavoritesService !== 'undefined'
        ? new Set(FavoritesService.getFavorites())
        : null;

    const divisionFiltered = _allTeams.filter(team => {
        if (team.id === _currentTeamId) return false;

        // Favorites filter
        if (favoriteTeamIds && !favoriteTeamIds.has(team.id)) return false;

        // Division filter (existing logic unchanged)
        if (divisionFilters.size > 0) {
            // ... existing division filter logic ...
        }
        return true;
    });

    // ... rest of existing search logic unchanged ...
}
```

### 4c. CSS — Right Drawer Mobile Styles

```css
/* In src/css/input.css — inside mobile media query */

/* Hide FilterPanel and FavoritesPanel in right drawer on mobile
   Only TeamBrowser (panel-bottom-right) is visible */
.mobile-drawer-content #panel-top-right,
.mobile-drawer-content #panel-mid-right {
    display: none;
}

/* TeamBrowser fills the right drawer */
.mobile-drawer-content #panel-bottom-right {
    display: flex;
    flex-direction: column;
    height: 100%;
}

/* Right drawer team browser fills available space */
.mobile-drawer-content .team-browser {
    height: 100%;
}

/* Touch-friendly filter buttons in drawer */
.mobile-drawer-content .division-filter-btn {
    min-height: 2.25rem;  /* Touch-friendly but compact */
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
}

/* Touch-friendly team cards in drawer */
.mobile-drawer-content .team-card {
    min-height: 2.75rem;  /* 44px touch target */
    padding: 0.5rem;
}

/* Star button touch area in drawer */
.mobile-drawer-content .star-btn {
    min-width: 2.75rem;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

### 4d. No MobileLayout.js Changes Needed

The existing DOM relocation in MobileLayout already moves all three right panels (`panel-top-right`, `panel-mid-right`, `panel-bottom-right`) into the right drawer. The CSS rules above hide the first two and show only TeamBrowser. This approach:

- Requires zero JS changes to MobileLayout
- Is purely CSS-driven (easier to maintain)
- Automatically restores all panels on desktop when exiting mobile mode

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Tap "Fav" filter button → toggle boolean + re-render filtered list from cache
- Tap division filter button → existing hot path, unchanged
- Tap team card for selection → existing hot path, unchanged
- Tap star button → FavoritesService.toggleFavorite() → optimistic update + Firestore
- Search input typing → existing debounced filter from cache

COLD PATHS (<2s):
- Right drawer open → CSS transition (300ms), TeamBrowser already rendered
- Initial TeamBrowser render in drawer → DOM creation (~100ms)

BACKEND PERFORMANCE:
- N/A — no new backend calls. All filtering is client-side from cached data.
- Star toggle already handled by existing FavoritesService (writes to Firestore).
```

## 6. Data Flow Diagram

```
No new Firestore data flows — this slice is purely UI reorganization + client-side filtering.

FAVORITES FILTER FLOW:
Tap "★ Fav" button → TeamBrowser click handler
  → TeamBrowserState.toggleFavoritesFilter()
    → _favoritesFilterActive = !_favoritesFilterActive
    → Dispatches filter change event
  → TeamBrowser._renderTeamList() [via filter change listener]
    → _getSearchResults() checks isFavoritesFilterActive()
    → If active: filters _allTeams through FavoritesService.getFavorites()
    → Renders only matching teams

STAR TOGGLE IN DRAWER:
Tap ★ on team card → FavoritesService.toggleFavorite(teamId)
  → Updates Firestore /users/{userId} favorites array
  → Dispatches 'favorites-updated' event
  → TeamBrowser._renderTeamList() [via 'favorites-updated' listener]
    → If "Fav" filter active: team appears/disappears from list
    → Star icon fills/unfills on the card

TEAM SELECTION IN DRAWER:
Tap team card → TeamBrowserState.toggleTeamSelection(teamId)
  → Dispatches 'team-selection-changed' event
  → ComparisonEngine updates (if auto-mode active)
  → Grid overlays update with comparison data
  → Card shows selected/deselected state
```

## 7. Test Scenarios

```
FRONTEND TESTS (Manual):

RIGHT DRAWER CONTENT:
- [ ] Open right drawer on mobile → see ONLY TeamBrowser (search + filters + team list)
- [ ] FilterPanel (min player dropdowns) is NOT visible in right drawer
- [ ] FavoritesPanel (favorites list) is NOT visible in right drawer
- [ ] TeamBrowser fills full drawer height with scrollable team list
- [ ] Search input is accessible at top of drawer

FAVORITES FILTER:
- [ ] "★ Fav" button appears before Div 1/2/3 buttons
- [ ] Tap "★ Fav" → list filters to only starred teams
- [ ] Tap "★ Fav" again → filter removed, all teams shown
- [ ] "★ Fav" button shows active state when enabled (same style as active div filters)
- [ ] Star a new team while "Fav" filter active → team appears in filtered list
- [ ] Unstar a team while "Fav" filter active → team disappears from filtered list
- [ ] Combine "Fav" + "Div 1" → shows only favorited Div 1 teams
- [ ] No favorites + "Fav" active → shows empty state message

TEAM INTERACTION:
- [ ] Tap team card → toggles selection (card highlights)
- [ ] Tap star icon on card → toggles favorite (star fills/unfills)
- [ ] Selection state persists after closing and reopening drawer
- [ ] Selected teams trigger comparison grid updates (if auto-compare active)

TOUCH TARGETS:
- [ ] Filter buttons (Fav, Div 1/2/3) meet minimum touch target size
- [ ] Team cards are easy to tap without accidental misclicks
- [ ] Star buttons are large enough to tap accurately
- [ ] Search input is easy to focus via tap

RESPONSIVE TESTS:
- [ ] Desktop (>1024px): FavoritesPanel and FilterPanel render normally in side panels
- [ ] Desktop: TeamBrowser renders normally in bottom-right panel
- [ ] Desktop: No "Fav" button visible (or if visible, works correctly on desktop too)
- [ ] Resize desktop → mobile: Right drawer shows unified TeamBrowser
- [ ] Resize mobile → desktop: All three panels restored to original positions
- [ ] "Fav" filter state persists across drawer open/close cycles

INTEGRATION TESTS:
- [ ] Star team in drawer → desktop FavoritesPanel updates (if resized to desktop)
- [ ] Select team in drawer → comparison grid updates in main content area
- [ ] Division filter in drawer → list filters correctly
- [ ] Search in drawer → filters teams and players correctly
- [ ] Close drawer → open drawer → filter states preserved
- [ ] Bottom bar right ☰ button opens right drawer with correct content
- [ ] Edge swipe from right opens right drawer with correct content

REGRESSION TESTS (Desktop):
- [ ] Desktop at 1920x1080: Layout identical to before
- [ ] FavoritesPanel works normally on desktop (cards, star, select all)
- [ ] FilterPanel dropdowns work normally on desktop
- [ ] TeamBrowser works normally on desktop (search, filters, cards)
- [ ] No console errors on desktop
- [ ] Comparison mode works end-to-end on desktop (unaffected)

FAB & TOAST:
- [ ] FAB (selection action button) appears above bottom bar on mobile
- [ ] FAB doesn't overlap with bottom bar or drawer
- [ ] Toast notifications appear at top-right (already positioned there)
- [ ] Toasts don't overlap with drawer overlay

END-TO-END:
- [ ] Full mobile journey: Open app → tap right ☰ → see team browser → search for team →
      tap "Fav" filter → see favorites → tap to select → close drawer → see comparison on grid
```

## 8. Common Integration Pitfalls

- [ ] **Not hiding FavoritesPanel/FilterPanel in drawer** — CSS must hide `#panel-top-right` and `#panel-mid-right` inside `.mobile-drawer-content`. Without this, all three panels stack vertically and the drawer is cluttered.
- [ ] **"Fav" button active state not syncing with TeamBrowserState** — The button's `active` class must reflect `TeamBrowserState.isFavoritesFilterActive()`. If re-render recreates the button, the class must be set from state, not just toggled on click.
- [ ] **Favorites filter not updating on star change** — When a team is starred/unstarred while "Fav" filter is active, the list must re-render. TeamBrowser already listens to `'favorites-updated'` and calls `_renderTeamList()`, so this should work — but verify.
- [ ] **Tooltip positioning in drawer** — Hover tooltips (roster display) position themselves relative to viewport. In a narrow drawer, tooltips may overflow. On mobile, hover tooltips won't trigger anyway (no mouse). Consider disabling tooltips in mobile drawer or using long-press instead.
- [ ] **Editing main.css instead of input.css** — All custom CSS goes in `src/css/input.css`. main.css is auto-generated by Tailwind.
- [ ] **Breaking desktop by over-scoping CSS** — All new CSS rules must be inside the `@media (max-width: 1024px) and (orientation: landscape)` block, or scoped to `.mobile-drawer-content` selector.
- [ ] **"Fav" button only on mobile** — Decision: Add "Fav" button to TeamBrowser universally (desktop + mobile). It's a good UX improvement everywhere. The PRD roadmap mentions "Same pattern could eventually replace the desktop favorites panel too."
- [ ] **TeamBrowser re-render doesn't preserve search input value** — When `_render()` is called, the search input is recreated. If the user is typing while favorites update, their input may be lost. `_renderTeamList()` only re-renders the list container, not the search input — so this should be fine for filter changes. But verify `_render()` isn't called unnecessarily.

## 9. Implementation Notes

- **Pattern follows:** Revealing Module Pattern. No new components — extends existing TeamBrowser + TeamBrowserState.
- **Key insight:** The user's direction is to NOT create tabs in the right drawer. Instead, have one unified TeamBrowser with a "Fav" filter button. This is simpler and could eventually replace the separate FavoritesPanel on desktop too.
- **CSS-only hiding:** FavoritesPanel and FilterPanel are hidden in the mobile drawer purely via CSS (`.mobile-drawer-content #panel-top-right { display: none }`). No JS changes to MobileLayout needed.
- **Toast position:** Already at `top-4 right-4` (top of screen). No collision with bottom bar. No changes needed.
- **FAB position:** Already repositioned in 10.0c CSS (`.selection-action-btn { bottom: 3.5rem }`). Verify during testing.
- **Tooltip handling on mobile:** Mouse hover tooltips won't fire on touch devices. No explicit handling needed — they simply won't appear. If roster info is needed, that's a future enhancement (long-press or inline expand).
- **Dependencies:** 10.0a-d all complete. TeamBrowser, FavoritesService, TeamBrowserState all exist and work.
- **Tailwind watcher** must be running for CSS changes to compile from `src/css/input.css` → `public/css/main.css`.

---

## Files Changed Summary

| File | Change Type | Scope |
|------|------------|-------|
| `public/js/components/TeamBrowser.js` | Modify | ~20 lines — add "Fav" button + favorites filter in `_getSearchResults()` |
| `public/js/components/TeamBrowserState.js` | Modify | ~15 lines — add `_favoritesFilterActive` state + toggle/getter |
| `src/css/input.css` | Modify | ~30 lines — hide panels in drawer, touch targets, drawer layout |

## Implementation Order

1. Add `_favoritesFilterActive` state + `toggleFavoritesFilter()` + `isFavoritesFilterActive()` to TeamBrowserState.js
2. Add "★ Fav" button to TeamBrowser `_render()` filter row (before Div buttons)
3. Wire "Fav" button click to `TeamBrowserState.toggleFavoritesFilter()`
4. Add favorites filtering logic to `TeamBrowser._getSearchResults()`
5. Add CSS: hide `#panel-top-right` and `#panel-mid-right` inside `.mobile-drawer-content`
6. Add CSS: `#panel-bottom-right` full-height in drawer
7. Add CSS: touch target sizing for filter buttons, team cards, star buttons in drawer
8. Test desktop — verify zero regression (all three panels work normally)
9. Test mobile — verify right drawer shows unified TeamBrowser with "Fav" filter
10. Test favorites filter — star/unstar behavior, combined with division filters
