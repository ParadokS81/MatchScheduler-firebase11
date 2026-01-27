# Slice 5.0b: Grid Tools Enhancement

## Overview

Clean up the Grid Tools panel and add contextual floating action button for cell selection. This makes availability editing more intuitive by putting the action near the selection.

**Depends on:** Slice 5.0a (Layout Foundation) must be complete

**Why:**
- Current Add Me/Remove Me buttons require hunting in left panel after selecting
- Grid Tools panel is cluttered with buttons that could be streamlined
- Freed space can show upcoming matches (prep for Big4 integration)

## Current vs New Grid Tools

### Current Layout
```
┌─────────────────────────┐
│ Grid Tools              │
├─────────────────────────┤
│ Display    [ABC] [👤]   │
├─────────────────────────┤
│ [Add Me] [Remove Me]    │
│ [Select All] [Clear All]│
├─────────────────────────┤
│ Templates  [Save]       │
│ No templates saved...   │
├─────────────────────────┤
│ More tools coming soon  │
└─────────────────────────┘
```

### New Layout
```
┌─────────────────────────┐
│ Grid Tools              │
├─────────────────────────┤
│ Display [ABC|👤] [Clear]│
├─────────────────────────┤
│ Template [▼ Select][Save│
├─────────────────────────┤
│ Upcoming Matches        │
│ • vs Team A - Wed 20:00 │
│ • vs Team B - TBD       │
│ (placeholder for now)   │
└─────────────────────────┘
```

## Implementation Steps

### Step 1: Condense Grid Tools Panel

**File:** `public/js/components/GridActionButtons.js`

**Changes:**
1. Remove Add Me / Remove Me buttons (replaced by floating action)
2. Remove Select All button (users can drag or click headers)
3. Keep Clear All as compact button
4. Combine Display toggle and Clear All on one row
5. Make Templates section more compact (dropdown + save on one row)

**New Template:**
```javascript
_container.innerHTML = `
    <div class="grid-tools-compact">
        <!-- Row 1: Display + Clear -->
        <div class="tools-row">
            <span class="tools-label">Display</span>
            <div class="btn-group">
                <button id="display-mode-initials" class="btn-toggle active">ABC</button>
                <button id="display-mode-avatars" class="btn-toggle">👤</button>
            </div>
            <button id="clear-all-btn" class="btn-sm btn-secondary">Clear</button>
        </div>

        <!-- Row 2: Templates -->
        <div class="tools-row">
            <span class="tools-label">Template</span>
            <select id="template-select" class="template-dropdown">
                <option value="">Select...</option>
            </select>
            <button id="save-template-btn" class="btn-sm btn-secondary">Save</button>
        </div>
    </div>
`;
```

**Acceptance:** Grid Tools panel is visually compact with 2 rows

---

### Step 2: Add Upcoming Matches Placeholder

**File:** `public/js/components/GridActionButtons.js` (or new `UpcomingMatches.js`)

**Add section below tools:**
```html
<div class="upcoming-matches">
    <h4 class="section-title">Upcoming Matches</h4>
    <div class="matches-list">
        <p class="text-muted text-sm">No scheduled matches</p>
        <!-- Future: populated from Big4 integration -->
    </div>
</div>
```

**Acceptance:** Placeholder section visible, ready for future content

---

### Step 3: Floating Action Button Component

**New file:** `public/js/components/SelectionActionButton.js`

**Behavior:**
1. Hidden by default
2. Appears when cells are selected in either grid
3. Positioned near the selection (bottom-right of selection bounds)
4. Shows "Add Me" (if user not in all selected) or "Remove Me" (if user in all selected)
5. Click performs the action
6. Disappears after action or when selection cleared

**Implementation:**
```javascript
const SelectionActionButton = (function() {
    let _button = null;
    let _visible = false;

    function init() {
        // Create floating button element
        _button = document.createElement('button');
        _button.className = 'selection-action-btn hidden';
        _button.addEventListener('click', _handleClick);
        document.body.appendChild(_button);

        // Listen for selection changes from both grids
        document.addEventListener('grid-selection-change', _onSelectionChange);

        // Listen for keyboard
        document.addEventListener('keydown', _onKeydown);
    }

    function _onSelectionChange(event) {
        const { selectedCells, bounds } = event.detail;

        if (selectedCells.length === 0) {
            _hide();
            return;
        }

        // Determine action based on user presence in cells
        const action = _determineAction(selectedCells);
        _button.textContent = action === 'add' ? 'Add Me' : 'Remove Me';
        _button.dataset.action = action;

        // Position near selection
        _positionNear(bounds);
        _show();
    }

    function _positionNear(bounds) {
        // Position button at bottom-right of selection
        // Account for viewport edges
        _button.style.top = `${bounds.bottom + 8}px`;
        _button.style.left = `${bounds.right - _button.offsetWidth}px`;
    }

    function _handleClick() {
        const action = _button.dataset.action;
        if (action === 'add') {
            GridActionButtons.addMe();
        } else {
            GridActionButtons.removeMe();
        }
        _hide();
    }

    function _onKeydown(event) {
        if (!_visible) return;

        if (event.key === 'Enter') {
            event.preventDefault();
            _handleClick();
        } else if (event.key === 'Escape') {
            // Clear selection (handled by grid)
            _hide();
        }
    }

    function _show() {
        _button.classList.remove('hidden');
        _visible = true;
    }

    function _hide() {
        _button.classList.add('hidden');
        _visible = false;
    }

    return { init };
})();
```

**CSS for floating button:**
```css
.selection-action-btn {
    position: fixed;
    z-index: 100;
    padding: 0.5rem 1rem;
    background-color: var(--primary);
    color: var(--primary-foreground);
    border: none;
    border-radius: var(--radius);
    font-weight: 500;
    cursor: pointer;
    box-shadow: var(--shadow-lg);
    transition: opacity 150ms ease, transform 150ms ease;
}

.selection-action-btn:hover {
    background-color: oklch(from var(--primary) calc(l + 0.05) c h);
}

.selection-action-btn.hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateY(4px);
}
```

**Acceptance:** Selecting cells shows floating button, clicking performs action

---

### Step 4: Wire Up Selection Events

**File:** `public/js/components/AvailabilityGrid.js`

**Add custom event dispatch on selection change:**
```javascript
// In selection handling code
function _emitSelectionChange() {
    const bounds = _getSelectionBounds();
    const event = new CustomEvent('grid-selection-change', {
        detail: {
            selectedCells: _selectedCells,
            bounds: bounds,
            gridId: _gridContainerId
        }
    });
    document.dispatchEvent(event);
}
```

**Acceptance:** Selection changes emit events, floating button responds

---

### Step 5: Keyboard Support

**Already included in Step 3:**
- `Enter` confirms action (Add/Remove)
- `Escape` cancels (clears selection)

**Ensure grid handles Escape to clear selection:**
```javascript
// In AvailabilityGrid.js
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        _clearSelection();
    }
});
```

**Acceptance:** Enter confirms, Escape cancels

---

## Files Changed Summary

| File | Change Type |
|------|-------------|
| `public/js/components/GridActionButtons.js` | Major refactor (compact) |
| `public/js/components/SelectionActionButton.js` | New file |
| `public/js/components/AvailabilityGrid.js` | Add selection events |
| `src/css/input.css` | Floating button styles |
| `public/js/app.js` | Init SelectionActionButton |

---

## CSS Additions

```css
/* Compact Grid Tools */
.grid-tools-compact {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.tools-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.tools-label {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    min-width: 4rem;
}

.btn-group {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
}

.btn-toggle {
    padding: 0.25rem 0.5rem;
    background: var(--secondary);
    border: none;
    font-size: 0.75rem;
    cursor: pointer;
}

.btn-toggle.active {
    background: var(--primary);
    color: var(--primary-foreground);
}

.template-dropdown {
    flex: 1;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--secondary);
}

/* Upcoming Matches */
.upcoming-matches {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
}

.upcoming-matches .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
}

.matches-list {
    font-size: 0.75rem;
}
```

---

## Success Metrics

- [ ] Grid Tools panel fits in 2 compact rows
- [ ] Templates work via dropdown
- [ ] Clear All button works
- [ ] Display toggle works
- [ ] Floating action button appears on cell selection
- [ ] Button positioned near selection (not overlapping grid)
- [ ] Click on floating button performs Add/Remove
- [ ] Enter key confirms action
- [ ] Escape key clears selection and hides button
- [ ] No Add Me/Remove Me buttons in Grid Tools panel
- [ ] Upcoming Matches placeholder visible

---

## Future Enhancements (not in this slice)

- Populate Upcoming Matches from Big4 integration (Slice 5.3)
- Floating button animation polish
- Multi-grid selection awareness (combine selections from both grids)
