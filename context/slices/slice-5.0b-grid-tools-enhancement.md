# Slice 5.0b: Grid Tools Enhancement

## 1. Slice Definition

- **Slice ID:** 5.0b
- **Name:** Grid Tools Enhancement
- **User Story:** As a team member, I can select grid cells and see a contextual floating action button positioned near my selection that performs "Add Me" or "Remove Me" immediately, without hunting for buttons in the left panel. The Grid Tools panel is condensed to 2 compact rows, freeing space for upcoming match information.
- **Success Criteria:** User can select cells, see floating button appear near selection with icon + text (+ Add Me / − Remove Me), click (or press Enter) to add/remove availability, and see streamlined tools panel with display toggle, clear all, and template dropdown.

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Layout restructure (5.0a dependency): Grid Tools condensed layout
- Personal Availability (2.2): Add/Remove me functionality (existing, moved to floating button)
- Advanced Selection (2.3): Selection interaction (existing, enhanced with events)

DEPENDENT SECTIONS:
- Templates (2.4): Template functionality remains, UI condensed to dropdown
- Team View Display (2.5): Display mode toggle remains

IGNORED SECTIONS:
- Big4 Integration (5.3): "Upcoming Matches" is placeholder only for this slice
- Backend changes: This is frontend-only refactoring
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

NEW - SelectionActionButton.js
  - Firebase listeners: none
  - Cache interactions: none
  - UI responsibilities: Floating button near grid selection
  - User actions: Click to add/remove from selected slots
  - Keyboard: Enter confirms, Escape cancels/hides
  - Visual: Icon (+ or −) + text label

MODIFIED - GridActionButtons.js
  - Firebase listeners: none (unchanged)
  - Cache interactions: none (unchanged)
  - UI responsibilities:
    - Condensed 2-row layout
    - Row 1: Display toggle (ABC/avatar) + Clear All
    - Row 2: Template dropdown + W1/W2 load buttons + Save
    - "Upcoming Matches" placeholder section
  - User actions: Template save/load, display toggle, clear all
  - Removed: Add Me, Remove Me, Select All buttons (moved to floating button)
  - New public methods: addMe(), removeMe(), clearAll() for SelectionActionButton

MODIFIED - AvailabilityGrid.js
  - Firebase listeners: unchanged
  - Cache interactions: unchanged
  - UI responsibilities: unchanged
  - New event: Dispatches 'grid-selection-change' CustomEvent
  - Event detail: { gridId, selectedCells, bounds }

FRONTEND SERVICES:
- No new services required
- AvailabilityService: unchanged (already handles add/remove)
- TemplateService: unchanged
- PlayerDisplayService: unchanged

BACKEND REQUIREMENTS:
⚠️ NO BACKEND CHANGES REQUIRED
This is a frontend-only UI enhancement. All backend functionality
(addAvailability, removeAvailability, etc.) already exists from Slice 2.2.

INTEGRATION POINTS:
- SelectionActionButton listens to 'grid-selection-change' events
- SelectionActionButton calls GridActionButtons.addMe() and .removeMe()
- AvailabilityGrid dispatches events on selection change
- GridActionButtons retains all backend integration (AvailabilityService calls)
```

---

## 4. Integration Code Examples

### Event Dispatch (AvailabilityGrid enhancement)

```javascript
// In AvailabilityGrid.js - after selection changes

function _notifySelectionChange() {
    if (_onSelectionChangeCallback) {
        _onSelectionChangeCallback();
    }

    // NEW: Dispatch custom event for floating button
    const selectedArray = Array.from(_selectedCells);
    const bounds = _getSelectionBounds(selectedArray);

    document.dispatchEvent(new CustomEvent('grid-selection-change', {
        detail: {
            gridId: _weekId,
            selectedCells: selectedArray.map(slotId => ({ weekId: _weekId, slotId })),
            bounds: bounds // { top, left, right, bottom } in viewport coords
        }
    }));
}

function _getSelectionBounds(selectedCells) {
    if (selectedCells.length === 0) return null;

    let minTop = Infinity, minLeft = Infinity;
    let maxBottom = 0, maxRight = 0;

    selectedCells.forEach(cellId => {
        const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
        if (cell) {
            const rect = cell.getBoundingClientRect();
            minTop = Math.min(minTop, rect.top);
            minLeft = Math.min(minLeft, rect.left);
            maxBottom = Math.max(maxBottom, rect.bottom);
            maxRight = Math.max(maxRight, rect.right);
        }
    });

    return { top: minTop, left: minLeft, right: maxRight, bottom: maxBottom };
}
```

### Floating Action Button (SelectionActionButton.js)

```javascript
const SelectionActionButton = (function() {
    'use strict';

    let _button = null;
    let _currentSelection = [];
    let _currentBounds = null;

    function _createButton() {
        _button = document.createElement('button');
        _button.className = 'selection-action-btn fixed z-50 hidden';
        _button.innerHTML = `
            <span class="action-icon mr-1 text-base font-bold"></span>
            <span class="action-text"></span>
        `;
        document.body.appendChild(_button);

        _button.addEventListener('click', _handleAction);
    }

    function _handleSelectionChange(e) {
        const { gridId, selectedCells, bounds } = e.detail;
        _currentSelection = selectedCells;
        _currentBounds = bounds;

        if (selectedCells.length === 0 || !bounds) {
            _hide();
            return;
        }

        _updateButtonState();
        _positionButton();
        _show();
    }

    function _updateButtonState() {
        const userId = window.firebase?.currentUser?.uid;
        if (!userId || _currentSelection.length === 0) return;

        // Check if user is in ALL selected cells
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        const userInAllCells = _currentSelection.every(({ weekId, slotId }) => {
            const availability = AvailabilityService.getSlotAvailability(teamId, weekId, slotId);
            return availability?.includes(userId);
        });

        const isRemove = userInAllCells;
        const icon = _button.querySelector('.action-icon');
        const text = _button.querySelector('.action-text');

        icon.textContent = isRemove ? '−' : '+';
        text.textContent = isRemove ? 'Remove Me' : 'Add Me';
        _button.dataset.action = isRemove ? 'remove' : 'add';

        // Style based on action
        _button.className = `selection-action-btn fixed z-50 flex items-center px-3 py-2 rounded-lg shadow-lg font-medium text-sm transition-all ${
            isRemove
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`;
    }

    function _positionButton() {
        if (!_currentBounds || !_button) return;

        const padding = 8;
        const buttonRect = _button.getBoundingClientRect();
        const buttonWidth = buttonRect.width || 120;
        const buttonHeight = buttonRect.height || 40;

        // Default: bottom-right of selection
        let left = _currentBounds.right + padding;
        let top = _currentBounds.bottom - buttonHeight;

        // Smart repositioning: keep button visible
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // If too far right, move to left of selection
        if (left + buttonWidth > viewportWidth - padding) {
            left = _currentBounds.left - buttonWidth - padding;
        }

        // If still off-screen (selection very wide), position at right edge
        if (left < padding) {
            left = viewportWidth - buttonWidth - padding;
        }

        // If too low, move up
        if (top + buttonHeight > viewportHeight - padding) {
            top = viewportHeight - buttonHeight - padding;
        }

        // If too high, position below selection
        if (top < padding) {
            top = _currentBounds.bottom + padding;
        }

        _button.style.left = `${left}px`;
        _button.style.top = `${top}px`;
    }

    async function _handleAction() {
        const action = _button.dataset.action;

        // Show loading state
        const originalText = _button.querySelector('.action-text').textContent;
        _button.querySelector('.action-text').textContent = action === 'add' ? 'Adding...' : 'Removing...';
        _button.disabled = true;

        try {
            if (action === 'add') {
                await GridActionButtons.addMe();
            } else {
                await GridActionButtons.removeMe();
            }
        } finally {
            _button.disabled = false;
            _button.querySelector('.action-text').textContent = originalText;
            _hide();
        }
    }

    function _handleKeydown(e) {
        if (!_button || _button.classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            _handleAction();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            _hide();
            // Also clear grid selections
            GridActionButtons.clearAll?.();
        }
    }

    function _show() {
        _button?.classList.remove('hidden');
    }

    function _hide() {
        _button?.classList.add('hidden');
    }

    function init() {
        _createButton();

        document.addEventListener('grid-selection-change', _handleSelectionChange);
        document.addEventListener('keydown', _handleKeydown);

        console.log('✨ SelectionActionButton initialized');
    }

    function cleanup() {
        document.removeEventListener('grid-selection-change', _handleSelectionChange);
        document.removeEventListener('keydown', _handleKeydown);
        _button?.remove();
        _button = null;
    }

    return { init, cleanup };
})();
```

### GridActionButtons Exposed Methods

```javascript
// Modify GridActionButtons return statement to expose methods
return {
    init,
    onSelectionChange,
    cleanup,
    // NEW: Expose for SelectionActionButton
    addMe: _handleAddMe,
    removeMe: _handleRemoveMe,
    clearAll: _handleClearAll
};
```

### Condensed Layout (GridActionButtons._render refactor)

```javascript
function _render() {
    if (!_container) return;

    const templates = typeof TemplateService !== 'undefined' ? TemplateService.getTemplates() : [];
    const canSaveMore = typeof TemplateService !== 'undefined' ? TemplateService.canSaveMore() : false;
    const hasSelection = _getSelectedCells ? _getSelectedCells().length > 0 : false;

    const currentMode = typeof PlayerDisplayService !== 'undefined'
        ? PlayerDisplayService.getDisplayMode()
        : 'initials';
    const isInitials = currentMode === 'initials';

    _container.innerHTML = `
        <div class="grid-tools-compact flex flex-col gap-2 p-2 bg-card border border-border rounded-lg">
            <!-- Row 1: Display toggle + Clear All -->
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground">View:</span>
                    <div class="flex gap-0.5">
                        <button id="display-mode-initials"
                                class="px-1.5 py-0.5 text-xs rounded ${isInitials ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}"
                                title="Show initials">ABC</button>
                        <button id="display-mode-avatars"
                                class="px-1.5 py-0.5 text-xs rounded ${!isInitials ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}"
                                title="Show avatars">
                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <button id="clear-all-btn"
                        class="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent">
                    Clear All
                </button>
            </div>

            <!-- Row 2: Template dropdown + Load/Save -->
            <div class="flex items-center gap-2">
                <select id="template-select" class="flex-1 px-2 py-1 text-xs bg-input border border-border rounded max-w-[8rem]">
                    <option value="">Load template...</option>
                    ${templates.map(t => `
                        <option value="${t.id}">${_escapeHtml(t.name)}</option>
                    `).join('')}
                </select>
                <button id="load-template-w1-btn"
                        class="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent disabled:opacity-50"
                        title="Load to Week 1" disabled>W1</button>
                <button id="load-template-w2-btn"
                        class="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent disabled:opacity-50"
                        title="Load to Week 2" disabled>W2</button>
                <button id="save-template-btn"
                        class="px-2 py-0.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        ${!hasSelection || !canSaveMore ? 'disabled' : ''}>
                    Save
                </button>
            </div>

            <!-- Upcoming Matches Placeholder -->
            <div class="border-t border-border pt-2 mt-1">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-muted-foreground">Upcoming Matches</span>
                </div>
                <p class="text-xs text-muted-foreground italic">No scheduled matches</p>
            </div>
        </div>
    `;

    _attachListeners();
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Selection change → Button appears: Purely DOM, no async operations
- Button position calculation: Simple math on cached bounds
- Add/Remove click → Loading state: Immediate UI feedback

COLD PATHS (<2s):
- Add/Remove → Database sync: Shows button loading state, handled by existing AvailabilityService
- Template load: Existing cold path behavior unchanged

BACKEND PERFORMANCE:
- No new Cloud Functions
- Existing availability functions already optimized
- No new indexes required
```

---

## 6. Data Flow Diagram

```
SELECTION FLOW:
User drags on grid → AvailabilityGrid._handleMouseUp()
    → _notifySelectionChange()
    → dispatchEvent('grid-selection-change', {bounds, cells, gridId})
    → SelectionActionButton._handleSelectionChange()
    → _updateButtonState() + _positionButton() + _show()

ACTION FLOW:
User clicks floating button → SelectionActionButton._handleAction()
    → Show "Adding..." or "Removing..." loading text
    → GridActionButtons.addMe() or .removeMe()
    → AvailabilityService.addMeToSlots() or .removeMeFromSlots()
    → Cloud Function → Firestore update
    → onSnapshot listener fires → Grid UI updates
    → SelectionActionButton._hide()

KEYBOARD FLOW:
User presses Enter → SelectionActionButton._handleKeydown()
    → _handleAction() → (same as click flow)

User presses Escape → SelectionActionButton._handleKeydown()
    → _hide() → GridActionButtons.clearAll() → Grids clear selection
    → AvailabilityGrid dispatches event with empty selection
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] Grid Tools panel renders in 2 compact rows
- [ ] Display toggle works (ABC ↔ Avatar icon)
- [ ] Clear All button clears selections in both grids
- [ ] Template dropdown shows saved templates
- [ ] W1/W2 buttons enable when template selected
- [ ] Save button disabled when no selection
- [ ] "Upcoming Matches" placeholder visible
- [ ] Existing template menu (rename/delete) still works

FLOATING BUTTON TESTS:
- [ ] Button appears when cells selected in Week 1 grid
- [ ] Button appears when cells selected in Week 2 grid
- [ ] Button shows "+" icon with "Add Me" text when user not in all cells
- [ ] Button shows "−" icon with "Remove Me" text when user in all cells
- [ ] Button positioned near selection (bottom-right)
- [ ] Button repositions when selection at viewport edge (smart positioning)
- [ ] Button has primary styling for Add, destructive styling for Remove
- [ ] Button hidden when selection cleared

INTERACTION TESTS:
- [ ] Click "Add Me" → Button shows "Adding..." → Success toast → Button hidden
- [ ] Click "Remove Me" → Button shows "Removing..." → Success toast → Button hidden
- [ ] Press Enter → Same as clicking the visible action
- [ ] Press Escape → Button hidden, selections cleared
- [ ] New selection after action → Button reappears with correct state

INTEGRATION TESTS:
- [ ] Add Me → Firebase updated → Grid shows user in cells
- [ ] Remove Me → Firebase updated → Grid removes user from cells
- [ ] Multiple cells across times/days → All updated correctly
- [ ] Error from backend → Error toast shown, button re-enabled

END-TO-END TESTS:
- [ ] Complete flow: Select → Add → See badge → Remove → Badge gone
- [ ] Template: Save → Select from dropdown → Load to W1 → Grid populates
- [ ] Keyboard-only: Tab to grid → Select with Shift+Click → Enter → Success
```

---

## 8. Common Integration Pitfalls

```
WATCH FOR:
- [ ] Floating button not hiding after action completes
- [ ] Event listener not removed on component cleanup
- [ ] Button position incorrect when grid scrolled
- [ ] Enter/Escape handlers conflicting with other global handlers
- [ ] Template dropdown change handler not updating W1/W2 button states
- [ ] Memory leak from orphaned event listeners
- [ ] Button showing wrong action after rapid selections
- [ ] Button staying visible when switching teams

SPECIFIC TO THIS SLICE:
- [ ] GridActionButtons.addMe/removeMe not exposed as public methods
- [ ] Selection bounds null when cells programmatically cleared
- [ ] Floating button z-index conflicts with modals (use z-50, modals are z-50+)
- [ ] _getSelectionBounds called with empty array returns null - must handle
- [ ] Button disabled state not reset after error
```

---

## 9. Implementation Notes

### File Changes Summary

| File | Action | Key Changes |
|------|--------|-------------|
| `public/js/components/SelectionActionButton.js` | CREATE | New floating button component |
| `public/js/components/GridActionButtons.js` | MODIFY | Condensed layout, expose addMe/removeMe/clearAll |
| `public/js/components/AvailabilityGrid.js` | MODIFY | Dispatch selection events with bounds |
| `src/css/input.css` | MODIFY | Floating button styles |
| `public/js/app.js` | MODIFY | Initialize SelectionActionButton |
| `public/index.html` | NO CHANGE | Container already exists from 5.0a |

### Dependencies

- **Hard:** Slice 5.0a (Layout Foundation) must be complete
- **Soft:** Slices 2.2-2.5 (availability, selection, templates, display mode)

### Existing Patterns to Follow

- **Event dispatch:** Same pattern as `templates-updated` and `display-mode-changed` events
- **Revealing Module:** Same as GridActionButtons, AvailabilityGrid
- **Toast notifications:** Use existing ToastService.showSuccess/showError
- **Button states:** Follow existing disabled/loading patterns from GridActionButtons

### CSS Additions

Add to `src/css/input.css`:

```css
/* Floating Selection Action Button */
.selection-action-btn {
  min-width: 6rem;
  transition: transform 0.1s ease, opacity 0.15s ease;
}

.selection-action-btn:hover {
  transform: translateY(-1px);
}

.selection-action-btn:active {
  transform: translateY(0);
}

.selection-action-btn.hidden {
  display: none;
}

.selection-action-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Compact grid tools */
.grid-tools-compact select {
  max-width: 8rem;
}
```

### Script Loading Order

In `public/index.html`, ensure SelectionActionButton.js loads after GridActionButtons.js:

```html
<script src="js/components/GridActionButtons.js"></script>
<script src="js/components/SelectionActionButton.js"></script>
```

### Initialization in app.js

```javascript
// After GridActionButtons.init() is called
SelectionActionButton.init();
```

---

## 10. Pragmatic Assumptions

**[ASSUMPTION]:** Smart repositioning for floating button
- **Rationale:** User confirmed "Smart repositioning" - button moves to stay visible when near viewport edges
- **Alternative:** Fixed position could cut off button

**[ASSUMPTION]:** Icon + text for button visual
- **Rationale:** User confirmed "Icon + text" - shows + or − icon plus "Add Me" or "Remove Me" text
- **Alternative:** Text-only or icon-only options were available

---

## Quality Checklist

Before implementation complete:
- [x] Frontend changes specified (no backend needed)
- [x] Integration examples show actual code
- [x] Hot paths are cache/optimistic (selection → button is instant)
- [x] Test scenarios cover full stack interactions
- [x] Data flow is complete (UI → Event → Button → Service → DB → Listener → UI)
- [x] Error handling specified (backend errors surface as toasts)
- [x] Loading states defined (button shows "Adding..."/"Removing..." during action)
- [x] Keyboard accessibility included (Enter/Escape)
- [x] Smart repositioning handles edge cases
- [x] Visual style specified (icon + text, primary/destructive colors)

## Implementation Status: COMPLETE

Implementation completed on 2026-01-27. Files modified:
- `public/js/components/SelectionActionButton.js` (NEW)
- `public/js/components/AvailabilityGrid.js` (dispatch selection events with bounds)
- `public/js/components/GridActionButtons.js` (condensed layout, expose methods)
- `src/css/input.css` (floating button styles)
- `public/index.html` (script loading order)
- `public/js/app.js` (initialization and cleanup)
