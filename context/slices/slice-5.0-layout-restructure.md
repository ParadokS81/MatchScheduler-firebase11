# Slice 5.0: Layout Restructure - Dynamic Bottom Section

## Overview

Fundamental shift from the original 3x3 grid (with top navigation row) to a new 3x3 grid where the middle row serves as a divider/tab bar controlling dynamic bottom content.

**Why:** The original top row (profile, week nav, min players) took vertical space without providing proportional value. Moving it to a middle divider:
- Gains vertical space for the grids
- Creates natural tab interface for switching bottom content
- Enables future features (Teams browser, Tournament hub) without layout changes
- Keeps the symmetric 3-column visual structure

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
│  + Upcoming │   (tab-dependent)           │  Teams      │
│  Matches    │                             │             │
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

## Implementation Phases

### Phase 5.0.1: HTML/CSS Layout Foundation
**Scope:** Restructure grid without breaking existing functionality

1. Update `public/index.html`:
   - Change to new 3x3 structure
   - Add panel-mid-* divider row
   - Move existing component containers to new positions

2. Update `src/css/input.css`:
   - Replace `.main-grid` with new row structure
   - Add `.panel-divider` styles
   - Add `.divider-tab` button styles

3. Update `public/js/app.js`:
   - Update component initialization to new panel IDs
   - Skip deprecated panel initializations

**Acceptance:** Page renders with new layout, existing grids still work

---

### Phase 5.0.2: Week Navigation in Grid Headers
**Scope:** Move week nav from center divider to grid headers

1. Update `WeekDisplay.js`:
   - Add prev/next arrows to week header
   - Emit navigation events

2. Create `WeekNavigationService.js`:
   - Singleton managing "anchor week" state
   - Handles single-week vs dual-week mode
   - Coordinates both grid displays

3. Navigation logic:
   - When Calendar tab active (2 grids visible): arrows shift anchor by 1
   - When other tab active (1 grid visible): arrows shift anchor by 1
   - Top grid always shows anchor week
   - Bottom grid shows anchor+1 (when in calendar mode)

**Acceptance:** Week navigation works via grid headers, middle row has no week nav

---

### Phase 5.0.3: Tab Switching Infrastructure
**Scope:** Wire up tab buttons to show/hide bottom content

1. Create `BottomPanelController.js`:
   - Manages active tab state
   - Shows/hides content containers
   - Coordinates with WeekNavigationService for week mode

2. Tab behavior:
   - **Calendar:** Show Week 2 grid in bottom-center
   - **Teams:** Show Teams browser (placeholder for now)
   - **Tournament:** Show Tournament hub (placeholder for now)

3. Side panel context:
   - Grid Tools shows context-relevant content based on active tab

**Acceptance:** Clicking tabs switches bottom content, Calendar shows Week 2 grid

---

### Phase 5.0.4: Profile & MinPlayers Relocation
**Scope:** Wire relocated components

1. Profile indicator (panel-mid-left):
   - Compact display: avatar + name
   - Click opens ProfileModal (existing)

2. MinPlayers filter (panel-top-right, under Favorites):
   - Move FilterPanel render target
   - Compact layout fitting below Compare button

**Acceptance:** Profile clickable, MinPlayers filter works in new location

---

### Phase 5.0.5: Grid Tools Cleanup
**Scope:** Prepare for contextual floating actions

1. Condense Grid Tools:
   - Row 1: Display toggle + Clear All
   - Row 2: Templates dropdown + Save

2. Remove Add Me/Remove Me buttons (will become floating action)

3. Add "Upcoming Matches" placeholder section

**Acceptance:** Grid Tools panel is compact, has space for future content

---

### Phase 5.0.6: Floating Action Button for Selection
**Scope:** Contextual Add/Remove near selection

1. Create `SelectionActionButton.js`:
   - Appears near selected cells
   - Shows "Add Me" or "Remove Me" based on state
   - Positioned relative to selection bounds

2. Keyboard support:
   - Enter confirms action
   - Escape cancels selection

**Acceptance:** Selecting cells shows floating button, clicking performs action

---

## Documentation Updates Required

### CLAUDE.md (lines 203-205)
**Current:**
```markdown
### Sacred 3x3 Grid Layout
The grid structure is immutable. Never modify panel dimensions or positions.
See Pillar 1 for complete layout specification.
```

**New:**
```markdown
### Sacred 3x3 Grid Layout
The grid maintains a 3x3 structure with a middle divider row:
- **Top row:** Team Info | Week Grid 1 | Favorites+Compare
- **Middle row:** Profile | Tab Bar | (context)
- **Bottom row:** Grid Tools | Dynamic Content | Browse Teams

The middle row controls the bottom-center content:
- Calendar tab: Shows Week 2 grid
- Teams tab: Shows team/roster browser
- Tournament tab: Shows tournament hub

See Pillar 1 for complete layout specification.
```

### Pillar 1 - PRD.md (Section 6.1)
Replace entire "Sacred 3x3 Grid Layout System" section with new structure:
- New ASCII diagram
- New panel map
- Updated CSS grid template
- Explanation of tab behavior

### Pillar 3 - technical architecture.md (Section 3)
Update "Layout System: The Sacred 3x3 Grid" with:
- New ASCII diagram
- New reasoning (dynamic content, vertical space gain)

### input.css
- Remove old `.main-grid` definition
- Document new `.main-grid` as the standard
- Remove experimental `.main-grid-v2`, `.main-grid-v3` after merge

---

## Migration from Experiment Branch

Current state: `experiment/center-divider-layout` branch has working v3 layout

To merge:
1. Complete Phase 5.0.1-5.0.2 on experiment branch
2. Squash commits into clean history
3. Merge to main
4. Update all documentation
5. Delete experiment branch

---

## Dependencies

- **None from other slices** - this is foundational
- Future slices depend on this:
  - Slice 5.1: Teams Browser tab content
  - Slice 5.2: Tournament Hub tab content
  - Slice 5.3: Big4 integration

---

## Risk Mitigation

1. **Breaking existing functionality:**
   - Keep panel IDs for components that don't move (bottom-left, bottom-right)
   - Phase implementation to maintain working state

2. **CSS specificity conflicts:**
   - Remove old grid classes completely after migration
   - Don't leave `.main-grid-v2`, `.main-grid-v3` in production

3. **Component initialization order:**
   - Document new panel IDs clearly
   - Update app.js initialization sequence

---

## Success Metrics

- [ ] New layout renders correctly on 1080p and 1440p
- [ ] Week grids display and function as before
- [ ] Tab switching works (Calendar shows grid, others show placeholder)
- [ ] Profile indicator clickable, opens modal
- [ ] MinPlayers filter works in new location
- [ ] Week navigation works via grid headers
- [ ] No console errors on page load
- [ ] All existing slice functionality preserved
