# Slice 5.0a: Layout Foundation - Dynamic Bottom Section

## Overview

Fundamental shift from the original 3x3 grid (with top navigation row) to a new 3x3 grid where the middle row serves as a divider/tab bar controlling dynamic bottom content.

**Why:** The original top row (profile, week nav, min players) took vertical space without providing proportional value. Moving it to a middle divider:
- Gains vertical space for the grids
- Creates natural tab interface for switching bottom content
- Enables future features (Teams browser, Tournament hub) without layout changes
- Keeps the symmetric 3-column visual structure

**Experimental branch:** `experiment/center-divider-layout` has working prototype

## New Layout Structure

```
┌─────────────┬─────────────────────────────┬─────────────┐
│  Team Info  │     Week 5 Grid             │  Favorites  │
│  + Roster   │   (with nav in header)      │  + Compare  │
│             │                             │  + MinPlyr  │
├─────────────┼─────────────────────────────┼─────────────┤
│  👤 Profile │  [📅 Calendar][👥 Teams][🏆]│  (empty or  │
│  indicator  │       (centered tabs)       │  context)   │
├─────────────┼─────────────────────────────┼─────────────┤
│  Grid Tools │     Bottom Content          │  Browse     │
│             │   (tab-dependent)           │  Teams      │
└─────────────┴─────────────────────────────┴─────────────┘
```

### Grid CSS
```css
.main-grid {
  grid-template-columns: clamp(200px, 15vw, 300px) 1fr clamp(200px, 15vw, 300px);
  grid-template-rows: 1fr 3rem 1fr;  /* Equal grids, compact divider */
}
```

### Panel ID Changes
| Old ID | New ID | Content |
|--------|--------|---------|
| panel-top-left | (removed) | - |
| panel-top-center | (removed) | - |
| panel-top-right | (removed) | - |
| panel-middle-left | panel-top-left | Team Info + Roster |
| panel-middle-center | panel-top-center | Week Grid 1 |
| panel-middle-right | panel-top-right | Favorites + Compare + MinPlayers |
| (new) | panel-mid-left | Profile indicator |
| (new) | panel-mid-center | Tab bar |
| (new) | panel-mid-right | Context actions (or empty) |
| panel-bottom-left | panel-bottom-left | Grid Tools (unchanged) |
| panel-bottom-center | panel-bottom-center | Dynamic content (Week 2 / Teams / Tournament) |
| panel-bottom-right | panel-bottom-right | Browse Teams (unchanged) |

---

## Implementation Steps

### Step 1: HTML/CSS Layout Foundation

**Files to modify:**
- `public/index.html`
- `src/css/input.css`
- `public/js/app.js`

**HTML Changes (`public/index.html`):**
1. Remove old `panel-top-left`, `panel-top-center`, `panel-top-right`
2. Rename `panel-middle-*` to `panel-top-*`
3. Add new `panel-mid-left`, `panel-mid-center`, `panel-mid-right` divider row
4. Keep `panel-bottom-*` as-is

**CSS Changes (`src/css/input.css`):**
1. Replace `.main-grid` with new row structure: `grid-template-rows: 1fr 3rem 1fr`
2. Add `.panel-divider` styles for middle row
3. Add `.divider-tab` button styles
4. Clean up experimental `.main-grid-v2`, `.main-grid-v3` classes

**JS Changes (`public/js/app.js`):**
1. Update `UserProfile.init()` - skip or point to new panel-mid-left
2. Update `FilterPanel.init()` - point to panel-top-right (inside Favorites)
3. Update `WeekNavigation.init()` - skip (will be in grid headers)
4. Keep `TeamInfo.init('panel-top-left')` - just renamed panel
5. Keep `WeekDisplay` targets - panel IDs unchanged for center panels

**Acceptance:** Page renders with new layout, existing grids still work

---

### Step 2: Week Navigation in Grid Headers

**Files to modify:**
- `public/js/components/WeekDisplay.js`
- `public/js/components/WeekNavigation.js` (repurpose or replace)

**WeekDisplay Changes:**
```javascript
// Update _render() to include navigation arrows
_panel.innerHTML = `
    <div class="week-display">
        <div class="week-header-nav">
            <button class="week-nav-btn" data-dir="prev">◀</button>
            <h3 class="week-header">${_weekLabel}</h3>
            <button class="week-nav-btn" data-dir="next">▶</button>
        </div>
        <div id="${gridContainerId}" class="week-grid-container"></div>
    </div>
`;
```

**Navigation Logic:**
- Create singleton `WeekNavigationService` managing "anchor week" state
- Top grid shows anchor week
- Bottom grid shows anchor + 1 (when Calendar tab active)
- Both grids' nav buttons update the same anchor
- When non-Calendar tab active, only top grid nav is relevant

**Acceptance:** Week navigation works via grid headers, centered with arrows

---

### Step 3: Tab Switching Infrastructure

**Files to create:**
- `public/js/components/BottomPanelController.js`

**Tab Behavior:**
- **Calendar tab (default):** Show Week 2 grid in panel-bottom-center
- **Teams tab:** Show placeholder "Teams browser coming soon"
- **Tournament tab:** Show placeholder "Tournament hub coming soon"

**Implementation:**
```javascript
const BottomPanelController = (function() {
    let _activeTab = 'calendar';
    let _containers = {};

    function init() {
        _containers = {
            calendar: document.getElementById('panel-bottom-center'),
            teams: _createPlaceholder('teams'),
            tournament: _createPlaceholder('tournament')
        };

        // Wire up tab buttons
        document.querySelectorAll('.divider-tab').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
    }

    function switchTab(tabId) {
        // Update active states
        // Show/hide containers
        // Notify WeekNavigationService of mode change
    }

    return { init, switchTab, getActiveTab };
})();
```

**Acceptance:** Clicking tabs switches bottom content, Calendar shows Week 2 grid

---

### Step 4: Profile & MinPlayers Relocation

**Profile Indicator (panel-mid-left):**
- Compact display: avatar (32px) + nickname
- Click opens existing ProfileModal
- Reuse UserProfile component with compact mode flag

**MinPlayers Filter (panel-top-right):**
- Move inside FavoritesPanel, below Compare button
- Compact inline layout: `Min [1▼] vs [1▼]`
- FilterPanel already exists, just change render target

**Acceptance:** Profile clickable opens modal, MinPlayers filter works in new location

---

## Documentation Updates (after implementation)

### CLAUDE.md
Update "Sacred 3x3 Grid Layout" section to describe new structure with middle divider row.

### Pillar 1 - PRD.md (Section 6.1)
Replace entire layout section with new panel map and CSS.

### Pillar 3 - technical architecture.md (Section 3)
Update ASCII diagram and reasoning.

---

## Files Changed Summary

| File | Change Type |
|------|-------------|
| `public/index.html` | Major restructure |
| `src/css/input.css` | New grid + divider styles |
| `public/js/app.js` | Update init targets |
| `public/js/components/WeekDisplay.js` | Add nav arrows |
| `public/js/components/WeekNavigation.js` | Repurpose to service |
| `public/js/components/BottomPanelController.js` | New file |
| `public/js/components/UserProfile.js` | Add compact mode |
| `public/js/components/FilterPanel.js` | Update render target |
| `public/js/components/FavoritesPanel.js` | Include filter |

---

## Success Metrics

- [ ] New layout renders correctly on 1080p and 1440p
- [ ] Week grids display and function as before
- [ ] Week navigation works via grid headers (arrows around week label)
- [ ] Tab switching works (Calendar shows grid, others show placeholder)
- [ ] Profile indicator clickable, opens ProfileModal
- [ ] MinPlayers filter works in new location (under Favorites)
- [ ] No console errors on page load
- [ ] All existing slice functionality preserved (selection, templates, comparison)

---

## Next Slice

After 5.0a is complete, proceed to **Slice 5.0b: Grid Tools Enhancement** which adds:
- Condensed Grid Tools panel
- Floating action button for Add/Remove selection
- Upcoming Matches placeholder section
