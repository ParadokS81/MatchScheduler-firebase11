# Slice 6.0b - Grid Tools Drawer (in Team Panel)

## 1. Slice Definition

- **Slice ID:** 6.0b
- **Name:** Grid Tools Drawer (in Team Panel)
- **Parent Slice:** 6.0 - Team Panel UI Refactor
- **User Story:** As a player, I can access grid tools (display modes, templates) in a collapsible drawer within the team panel so that related functionality is grouped together and the layout is cleaner.
- **Success Criteria:**
  - Grid tools appear as a collapsible drawer below the roster in TeamInfo
  - All existing GridActionButtons functionality works from new location
  - SelectionActionButton (floating) continues to work via GridActionButtons methods
  - Bottom-left panel becomes empty (placeholder for future use)
  - Drawer persists collapsed/expanded state during session

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- PRD 4.1.4 (Grid Tools Panel): Display mode toggle, template system, clear all
- PRD 2.4 (Templates): Save, load, rename, delete templates

DEPENDENT SECTIONS:
- PRD 5.0a (Layout): Grid tools relocated from bottom-left to team panel
- Slice 5.0b (SelectionActionButton): Floating button calls GridActionButtons.addMe/removeMe
- Slice 5.0.1 (Display Modes): 4-mode toggle (initials, coloredInitials, coloredDots, avatars)
- Slice 2.4 (Templates): Template CRUD operations via TemplateService

IGNORED SECTIONS:
- PRD 4.1.4 Upcoming Matches: Deferred (placeholder exists but no implementation)
- Add/Remove buttons: Replaced by floating SelectionActionButton (Slice 5.0b)
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

- TeamInfo.js (MODIFIED)
  - Firebase listeners: Existing team/user listeners (no change)
  - Cache interactions: No change
  - UI responsibilities:
    - NEW: Render Grid Tools drawer below roster
    - NEW: Toggle drawer expanded/collapsed state
    - NEW: Initialize GridActionButtons into drawer container
  - User actions:
    - Click drawer header to expand/collapse
    - Keyboard: Arrow keys or Enter to toggle

- GridActionButtons.js (MODIFIED)
  - Container: Changed from 'grid-action-buttons-container' to 'grid-tools-drawer-content'
  - Public API: UNCHANGED (addMe, removeMe, clearAll, onSelectionChange)
  - _render(): Layout simplified - remove "Upcoming Matches" section (move to separate component later)
  - Display mode toggle: Unchanged functionality
  - Template management: Unchanged functionality

- SelectionActionButton.js (NO CHANGE)
  - Continues to call GridActionButtons.addMe() / removeMe() / clearAll()
  - No awareness of drawer location change

FRONTEND SERVICES:
- TemplateService: No changes
- PlayerDisplayService: No changes
- AvailabilityService: No changes

BACKEND REQUIREMENTS:
⚠️ NO BACKEND CHANGES REQUIRED
- All backend functionality exists (TemplateService, AvailabilityService)
- This is a pure UI relocation slice

INTEGRATION POINTS:
- GridActionButtons → AvailabilityService.addMeToSlots/removeMeFromSlots (existing)
- GridActionButtons → TemplateService.* methods (existing)
- GridActionButtons → PlayerDisplayService.setDisplayMode (existing)
- SelectionActionButton → GridActionButtons.addMe/removeMe/clearAll (existing)
- Window events: 'templates-updated', 'display-mode-changed', 'grid-selection-change' (existing)
```

---

## 4. Integration Code Examples

### TeamInfo Drawer Rendering

```javascript
// In TeamInfo._renderTeamsMode() - add drawer below roster
function _renderTeamsMode() {
    // ... existing team switcher and team card code ...

    const gridToolsDrawer = `
        <div class="grid-tools-drawer mt-4 border-t border-border pt-2">
            <button class="grid-tools-header w-full flex items-center justify-between py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    aria-expanded="false"
                    aria-controls="grid-tools-drawer-content">
                <span>Grid Tools</span>
                <svg class="drawer-arrow w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            <div id="grid-tools-drawer-content"
                 class="grid-tools-content overflow-hidden transition-all duration-300 ease-out"
                 style="max-height: 0;">
                <!-- GridActionButtons will render here -->
            </div>
        </div>
    `;

    return `
        <div class="space-y-4 h-full flex flex-col">
            ${teamSwitcher}
            ${teamCard}
            <div class="mt-auto">
                ${gridToolsDrawer}
            </div>
        </div>
    `;
}
```

### TeamInfo Drawer Toggle Handler

```javascript
// In TeamInfo._attachEventListeners()
function _attachEventListeners() {
    // ... existing listeners ...

    // Grid Tools drawer toggle
    const drawerHeader = _panel.querySelector('.grid-tools-header');
    if (drawerHeader) {
        drawerHeader.addEventListener('click', _toggleGridToolsDrawer);
    }
}

// New private method
function _toggleGridToolsDrawer() {
    const header = _panel.querySelector('.grid-tools-header');
    const content = document.getElementById('grid-tools-drawer-content');
    const arrow = header?.querySelector('.drawer-arrow');

    if (!content) return;

    const isExpanded = header.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
        // Collapse
        content.style.maxHeight = '0';
        header.setAttribute('aria-expanded', 'false');
        arrow?.classList.remove('rotate-180');
    } else {
        // Expand
        content.style.maxHeight = content.scrollHeight + 'px';
        header.setAttribute('aria-expanded', 'true');
        arrow?.classList.add('rotate-180');
    }
}
```

### GridActionButtons Simplified Render

```javascript
// In GridActionButtons._render() - remove Upcoming Matches section
function _render() {
    if (!_container) return;

    const templates = typeof TemplateService !== 'undefined' ? TemplateService.getTemplates() : [];
    const canSaveMore = typeof TemplateService !== 'undefined' ? TemplateService.canSaveMore() : false;
    const hasSelection = _getSelectedCells ? _getSelectedCells().length > 0 : false;
    const currentMode = typeof PlayerDisplayService !== 'undefined'
        ? PlayerDisplayService.getDisplayMode()
        : 'initials';

    // Simplified layout - just Grid Tools content (no Upcoming Matches)
    _container.innerHTML = `
        <div class="grid-tools-content-inner py-2">
            <!-- Display mode toggle row -->
            <div class="flex items-center justify-between mb-3">
                <span class="text-xs text-muted-foreground">View</span>
                <div class="flex items-center gap-0.5">
                    ${_renderDisplayModeButtons(currentMode)}
                </div>
            </div>

            <!-- Templates section -->
            <div class="space-y-1.5">
                ${templates.map(t => _renderTemplateRow(t)).join('')}

                <!-- Save Template + Clear All row -->
                <div class="flex items-center justify-between pt-1 gap-2">
                    ${canSaveMore ? `
                        <button id="save-template-btn"
                                class="flex-1 px-2 py-1 text-xs rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
                                ${!hasSelection ? 'disabled' : ''}>
                            + Save Template
                        </button>
                    ` : '<div class="flex-1"></div>'}
                    <button id="clear-all-btn"
                            class="px-2 py-1 text-xs rounded bg-muted text-muted-foreground hover:bg-accent">
                        Clear All
                    </button>
                </div>
            </div>
        </div>
    `;

    _attachListeners();
}
```

### App.js GridActionButtons Initialization Change

```javascript
// In app.js - change container ID
function _initializeGridComponents() {
    // Wait for TeamInfo to render the drawer first
    // GridActionButtons now initializes into the drawer container
    GridActionButtons.init('grid-tools-drawer-content', {
        getSelectedCells: () => _getSelectedCellsFromAllGrids(),
        clearSelections: () => _clearAllGridSelections(),
        onSyncStart: (cells) => _handleSyncStart(cells),
        onSyncEnd: () => _handleSyncEnd(),
        clearAll: () => _handleClearAll(),
        loadTemplate: (slots, weekIndex) => _handleLoadTemplate(slots, weekIndex),
        onDisplayModeChange: (mode) => _handleDisplayModeChange(mode)
    });
}
```

### CSS for Drawer Animation

```css
/* In src/css/input.css */

/* Grid Tools drawer in team panel */
.grid-tools-drawer {
    margin-top: auto; /* Push to bottom of team panel flex container */
}

.grid-tools-header {
    cursor: pointer;
    user-select: none;
}

.grid-tools-content {
    /* Height animation handled via inline style + JS */
}

.drawer-arrow {
    transition: transform 200ms ease-out;
}

.drawer-arrow.rotate-180 {
    transform: rotate(180deg);
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Drawer toggle: Pure CSS transition + JS attribute toggle (instant)
- Display mode switch: Updates service + dispatches event (existing, fast)
- Template list render: From TemplateService cache (instant)

COLD PATHS (<2s):
- Save template: Cloud Function call (existing flow)
- Delete/rename template: Cloud Function calls (existing flow)
- Load template: Local + AvailabilityService calls (existing flow)

BACKEND PERFORMANCE:
- No new backend calls
- All existing operations remain unchanged
```

---

## 6. Data Flow Diagram

```
DRAWER TOGGLE FLOW:
Click Header → _toggleGridToolsDrawer() → Update aria-expanded + max-height → CSS transition

DISPLAY MODE CHANGE (unchanged):
Click Mode → _setDisplayMode() → PlayerDisplayService.setDisplayMode()
→ Dispatch 'display-mode-changed' → AvailabilityGrid re-renders

TEMPLATE LOAD (unchanged):
Click W1/W2 → _handleLoadTemplate() → _loadTemplateCallback()
→ AvailabilityService.addMeToSlots() → Firestore → Listener → Grid updates

FLOATING BUTTON → GRID TOOLS (unchanged):
Selection in Grid → 'grid-selection-change' event → SelectionActionButton shows
→ Click Add/Remove → GridActionButtons.addMe/removeMe() → AvailabilityService → Firestore

INITIALIZATION ORDER:
1. TeamInfo.init() renders drawer structure
2. TeamInfo._render() creates #grid-tools-drawer-content
3. App.js initializes GridActionButtons into drawer container
4. GridActionButtons._render() populates content
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] Drawer header click toggles expanded/collapsed state
- [ ] Arrow rotates 180° when expanded
- [ ] aria-expanded attribute updates correctly
- [ ] Display mode buttons update active state on click
- [ ] Template rows render correctly in drawer
- [ ] Save Template button disabled when no selection
- [ ] Clear All button visible and clickable

INTEGRATION TESTS (CRITICAL):
- [ ] GridActionButtons initializes into drawer container
- [ ] SelectionActionButton.addMe() still works (calls GridActionButtons.addMe)
- [ ] SelectionActionButton.removeMe() still works (calls GridActionButtons.removeMe)
- [ ] Display mode change updates grid cells (event propagation works)
- [ ] Template save/load/delete operations work from drawer
- [ ] Keyboard shortcuts (Enter/Escape) still work with floating button
- [ ] Drawer state persists through team switch (re-renders)

E2E TESTS:
- [ ] User can expand drawer, change display mode, see grid update
- [ ] User can save template, see it appear in drawer
- [ ] User can load template to week, see cells populate
- [ ] Floating button appears on selection, Add/Remove works
- [ ] Drawer collapses properly, content hidden
- [ ] Works at 1080p and 1440p resolutions

REGRESSION TESTS:
- [ ] Team switching doesn't break drawer
- [ ] Profile listener updates don't break drawer
- [ ] Template updates event re-renders drawer content
```

---

## 8. Common Integration Pitfalls

- [ ] **Container timing**: GridActionButtons.init() called before TeamInfo renders drawer container
  - Solution: Ensure TeamInfo._render() completes before GridActionButtons.init()

- [ ] **Event listener cleanup**: Old container listeners not cleaned up
  - Solution: GridActionButtons.cleanup() before re-init, or handle container change gracefully

- [ ] **Drawer height calculation**: scrollHeight incorrect when content changes
  - Solution: Recalculate max-height on templates-updated event if expanded

- [ ] **SelectionActionButton broken**: GridActionButtons methods not accessible
  - Solution: GridActionButtons module remains global, methods exposed on public API

- [ ] **Display mode event not propagating**: Grid doesn't update after mode change
  - Solution: Verify 'display-mode-changed' event still dispatched, AvailabilityGrid listens

---

## 9. Implementation Notes

### Initialization Order
The key challenge is ensuring GridActionButtons initializes after TeamInfo renders the drawer container:

1. **Option A (Preferred)**: TeamInfo dispatches 'team-panel-ready' event after render
2. **Option B**: App.js uses setTimeout/requestAnimationFrame to delay init
3. **Option C**: GridActionButtons handles missing container gracefully, retries

### Drawer State Persistence
- State stored in TeamInfo module variable (`_drawerExpanded`)
- Restored on re-render after team switch
- NOT persisted to localStorage (session-only)

### Empty Bottom-Left Panel
After relocation, `panel-bottom-left` will contain an empty container:
- Keep the panel structure for layout consistency
- Add placeholder text: "Coming soon" or leave blank
- Future: Upcoming Matches feature will use this space

### Dependencies
- Slice 5.0b (SelectionActionButton) must be complete - provides floating button
- Slice 5.0.1 (Display modes) must be complete - provides 4-mode toggle
- Slice 6.0a (Team Management Modal) should be done first - cleaner codebase

### File Changes Summary
| File | Change Type | Description |
|------|-------------|-------------|
| `public/js/components/TeamInfo.js` | MODIFY | Add drawer HTML + toggle logic |
| `public/js/components/GridActionButtons.js` | MODIFY | Simplify render (remove Upcoming Matches) |
| `public/js/app.js` | MODIFY | Change container ID for GridActionButtons.init() |
| `public/index.html` | MODIFY | Update/empty panel-bottom-left content |
| `src/css/input.css` | MODIFY | Add drawer animation styles |

---

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Drawer starts collapsed by default
  - **Rationale**: Most users won't need grid tools immediately; keeps UI clean
  - **Alternative**: Start expanded, or remember last state in localStorage

- **[ASSUMPTION]**: "Upcoming Matches" placeholder moves to bottom-left panel (deferred)
  - **Rationale**: Keeps this slice focused on drawer relocation
  - **Alternative**: Keep Upcoming Matches in drawer, but it clutters the view

- **[ASSUMPTION]**: Drawer max-height uses CSS calculation, not fixed value
  - **Rationale**: Content height varies with template count (0-3)
  - **Alternative**: Fixed max-height with overflow scroll
