# Slice 6.0: Team Panel UI Refactor

## Slice Definition
- **Slice ID:** 6.0
- **Name:** Team Panel UI Refactor - Modal + Grid Tools Drawer
- **User Story:** As a team member, I can manage my team through a clean modal interface and access grid tools through a compact drawer, providing better UX at all screen resolutions
- **Success Criteria:**
  - Team management options accessible via modal triggered from team name
  - Grid Tools relocated to collapsible drawer in team panel
  - Old Team Management drawer removed
  - Works smoothly at 1080p and 1440p resolutions

## Problem Statement

The current Team Management drawer has issues:
1. **Too much content** - Join code, max players, logo, remove player, transfer leadership, leave team
2. **Variable height** - Content changes based on role (leader vs member)
3. **Resolution issues** - Behaves inconsistently at different viewport sizes
4. **Overloaded responsibility** - Trying to do too many things in one component

Meanwhile, Grid Tools + Templates at the bottom feel disconnected from the roster they control.

## Solution

### 1. Team Management Modal (NEW)
Move all team management to a proper modal:
- Trigger: Click team name or hover to reveal edit button
- Contains: Join code, max players, logo management, all action buttons
- Modals handle complex, variable content much better than drawers

### 2. Grid Tools Drawer (REPURPOSE)
Repurpose the drawer mechanism for Grid Tools:
- Located directly below roster list (logical grouping)
- Contains: Display mode toggle, templates (max 3 rows), Save Template, Clear All
- **Bounded content** - max 4-5 rows, predictable height
- Collapsed by default, expands on click

### 3. Remove Old Drawer
Delete TeamManagementDrawer component entirely.

---

## Visual Design

### Team Panel Layout (After Refactor)
```
┌─────────────────────────┐
│ [Slackers ⚙️] [+]       │  ← Click team name or gear → Modal
├─────────────────────────┤
│      ┌─────────┐        │
│      │   SLK   │        │  Logo/tag
│      └─────────┘        │
│                         │
│ PAR  ParadokS  ★        │  Roster
│ ZER  Zero               │
│ GRI  Grisling           │
│ RAZ  Razor              │
├─────────────────────────┤
│ Grid Tools         [▼]  │  ← Small drawer header
│                         │  (collapsed by default)
│ ABC [ABC] ●●● 👤        │  Display modes
│ [Template 1] W1 W2      │  Templates (when expanded)
│ [Template 2] W1 W2      │
│ [+ Save] [Clear All]    │
└─────────────────────────┘
```

### Team Management Modal
```
┌─────────────────────────────────────────┐
│  Team Settings                    [×]   │
├─────────────────────────────────────────┤
│                                         │
│  Join Code    [LLQAM6] [📋] [🔄]       │
│                                         │
│  Max Players  [▼ 10]                    │
│                                         │
│        ┌───────────────┐                │
│        │               │                │
│        │     SLK       │    [Change Logo]
│        │               │                │
│        └───────────────┘                │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [Remove Player]  [Transfer Leadership] │
│                                         │
│  [Leave Team]                           │
│                                         │
└─────────────────────────────────────────┘
```

---

## Component Architecture

```
NEW COMPONENTS:
- TeamManagementModal
  - Firebase listeners: none (receives data via props, updates via existing listeners)
  - Cache interactions: none
  - Parent: Triggered from TeamInfo
  - Reuses existing action handlers from TeamManagementDrawer

MODIFIED COMPONENTS:
- TeamInfo
  - Remove drawer initialization
  - Add team name click handler → opens TeamManagementModal
  - Add settings gear icon next to team name

- GridActionButtons
  - Extract into collapsible drawer format
  - Move from bottom-left panel to team panel (below roster)
  - Add drawer header with toggle
  - Keep all existing functionality (display modes, templates)

REMOVED COMPONENTS:
- TeamManagementDrawer (delete entirely)

SERVICE UPDATES:
- None required - all existing services remain unchanged
```

---

## Implementation Details

### Sub-slice 6.0a: Team Management Modal
**Scope:** Create modal, wire up triggers, migrate functionality

1. Create `TeamManagementModal.js`:
   - Standard modal pattern (similar to KickPlayerModal, TransferLeadershipModal)
   - Receives team data and isLeader flag
   - Renders appropriate view (leader vs member)
   - Reuses all existing action handlers from TeamManagementDrawer:
     - `_handleCopyJoinCode`
     - `_handleRegenerateJoinCode` (with showRegenerateModal)
     - `_handleMaxPlayersChange`
     - `_handleManageLogo`
     - `_handleRemovePlayer`
     - `_handleTransferLeadership`
     - `_handleLeaveTeam`

2. Update TeamInfo:
   - Add gear icon (⚙️) next to team name in switcher
   - Click gear → `TeamManagementModal.show(teamData, isLeader)`
   - Remove `_initializeDrawer()` call
   - Remove `_drawerInstance` variable

3. Update index.html:
   - Add TeamManagementModal.js script tag
   - Remove TeamManagementDrawer.js script tag (or keep temporarily)

### Sub-slice 6.0b: Grid Tools Drawer
**Scope:** Relocate grid tools to team panel with drawer behavior

1. Create drawer wrapper in TeamInfo:
   - Add drawer HTML structure below roster
   - Header: "Grid Tools" + toggle arrow
   - Content: Display modes + Templates (from GridActionButtons)

2. Move content from GridActionButtons:
   - Display mode toggle (ABC, colored ABC, dots, avatars)
   - Template rows with W1/W2 load buttons
   - Save Template button
   - Clear All button

3. Remove "Upcoming Matches" section:
   - Currently a placeholder anyway
   - Can be added later in a different location

4. Drawer behavior:
   - Collapsed by default
   - Click header to expand
   - CSS transition for smooth animation
   - Max height constraint to prevent overflow

### Sub-slice 6.0c: Cleanup
**Scope:** Remove old code, update app.js

1. Delete TeamManagementDrawer.js (after 6.0a verified working)
2. Update app.js if any drawer references exist
3. Update GridActionButtons container reference (now in team panel)
4. Clean up any orphaned CSS

---

## CSS Considerations

### Grid Tools Drawer (in Team Panel)
```css
/* Drawer within team panel - predictable, bounded height */
.grid-tools-drawer {
  position: relative;  /* NOT absolute - flows with content */
  border-top: 1px solid var(--border);
  margin-top: auto;  /* Push to bottom of team panel */
}

.grid-tools-header {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.grid-tools-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 300ms ease-out;
}

.grid-tools-drawer.expanded .grid-tools-content {
  max-height: 12rem;  /* ~5 rows max */
}

.grid-tools-drawer .drawer-arrow {
  transition: transform 300ms ease-out;
}

.grid-tools-drawer.expanded .drawer-arrow {
  transform: rotate(180deg);
}
```

### Team Management Modal
Uses existing modal patterns - no special CSS needed.

---

## Data Flow

### Team Management Modal Flow
```
User clicks gear icon → TeamManagementModal.show(teamData, isLeader)
                                    ↓
                            Modal renders
                                    ↓
User clicks action (e.g., "Regenerate Join Code")
                                    ↓
                    Existing handler executes (e.g., showRegenerateModal)
                                    ↓
                    Cloud Function called → Firestore updated
                                    ↓
                    TeamInfo's existing listener catches update
                                    ↓
                    TeamInfo re-renders, modal sees fresh data on next open
```

### Grid Tools Drawer Flow
```
User clicks drawer header → toggleDrawer()
                                    ↓
                    CSS transition expands content
                                    ↓
User clicks display mode / template button
                                    ↓
                    Existing GridActionButtons handlers execute
                                    ↓
                    Grid updates via existing event system
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Modal open/close: Pure DOM, instant
- Drawer expand/collapse: CSS transition only
- Display mode toggle: Already optimized
- Template load: From cache

COLD PATHS (<2s):
- Any Cloud Function calls (regenerate code, update settings, etc.)
- All existing cold paths remain unchanged
```

---

## Test Scenarios

### Team Management Modal
- [ ] Gear icon visible next to team name
- [ ] Click gear opens modal
- [ ] Modal shows correct content for member vs leader
- [ ] All action buttons work (copy, regenerate, change logo, etc.)
- [ ] Modal closes on X, escape, or backdrop click
- [ ] Changes reflect in TeamInfo after modal action completes

### Grid Tools Drawer
- [ ] Drawer visible below roster list
- [ ] Starts collapsed on page load
- [ ] Click header expands with smooth animation
- [ ] Arrow rotates on expand/collapse
- [ ] Display mode toggle works and updates grid
- [ ] Template rows visible with W1/W2 buttons
- [ ] Save Template button works
- [ ] Clear All button works
- [ ] Drawer stays within panel bounds at all resolutions

### Cleanup
- [ ] TeamManagementDrawer no longer loads
- [ ] No console errors related to missing drawer
- [ ] All team management features still accessible via modal

### Resolution Testing
- [ ] 1080p: Modal and drawer fit without scrolling
- [ ] 1440p: Layout scales appropriately
- [ ] Mobile (if applicable): Graceful degradation

---

## Migration Strategy

1. **Phase 1 (6.0a):** Build modal alongside existing drawer
   - Both can coexist during development
   - Test modal independently

2. **Phase 2 (6.0b):** Move grid tools to team panel
   - Keep original GridActionButtons location temporarily
   - Test in new location

3. **Phase 3 (6.0c):** Remove old components
   - Delete TeamManagementDrawer
   - Remove original GridActionButtons container from bottom-left
   - Final cleanup and testing

---

## File Changes Summary

```
NEW FILES:
public/js/components/TeamManagementModal.js

MODIFIED FILES:
public/js/components/TeamInfo.js
  - Add modal trigger (gear icon)
  - Remove drawer initialization
  - Add Grid Tools drawer section

public/js/components/GridActionButtons.js
  - May need container reference update
  - OR: Extract grid tools content to TeamInfo directly

public/index.html
  - Add TeamManagementModal.js script
  - Update container ID for grid tools

src/css/input.css
  - Add grid-tools-drawer styles (if not using Tailwind only)

DELETED FILES:
public/js/components/TeamManagementDrawer.js (after migration complete)
```

---

## Common Pitfalls to Avoid

- [ ] **Don't break existing action handlers** - Copy them to modal, don't rewrite
- [ ] **Don't use position: fixed for drawer** - Use relative/normal flow
- [ ] **Don't forget to update event listeners** - Modal needs same handlers as drawer
- [ ] **Don't overcomplicate the drawer** - It's just for grid tools, keep it simple
- [ ] **Don't remove drawer before modal is verified** - Keep both during development

---

## Dependencies

- Existing modals work correctly (KickPlayerModal, TransferLeadershipModal, etc.)
- TeamService.callFunction works
- ToastService works
- GridActionButtons existing functionality

---

## Quality Checklist

- [x] User story defined
- [x] Visual mockups provided
- [x] Component architecture specified
- [x] Implementation sub-slices defined
- [x] CSS considerations addressed
- [x] Data flow documented
- [x] Performance classified
- [x] Test scenarios listed
- [x] Migration strategy outlined
- [x] File changes summarized
- [x] Pitfalls identified
- [x] Dependencies noted

---

*Slice created: 2026-01-29*
*Addresses: Team Management drawer resolution issues, Grid Tools placement*
