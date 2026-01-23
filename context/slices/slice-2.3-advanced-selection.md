# Slice 2.3: Advanced Selection

## 1. Slice Definition
- **Slice ID:** 2.3
- **Name:** Advanced Selection
- **User Story:** As a team member, I can efficiently select multiple time slots using drag selection, header clicks, and shift+click so that I can quickly mark my availability across many slots
- **Success Criteria:** User can select multiple cells using drag selection (rectangular), day/time header clicks (toggle behavior), shift+click (range selection), and "Select All" button, with all selection methods working within a single week

## 2. PRD Mapping
```
PRIMARY SECTIONS:
- 4.1.3 Selection Mechanics: All multi-select methods
  - Click & Drag: Select multiple cells like Google Sheets within one week
  - Day Header Click: Select entire column for that week
  - Time Header Click: Select entire row for that week (confirmed via clarification)
  - Shift + Click: Rectangular selection between two cells in same week

DEPENDENT SECTIONS:
- 4.1.4 Grid Tools Panel: [Select all] and [Clear all] buttons (implemented here)
- 5.1 Hot Paths: Selection operations must be instant

IGNORED SECTIONS (for this slice):
- 4.1.4 Template System: Save/load templates deferred to slice 2.4
- 4.1.4 Display Toggle: Initials/avatars toggle deferred to slice 2.4
- 4.1.2 Player Display: Showing player initials in slots deferred to slice 2.5
```

## 3. Full Stack Architecture
```
FRONTEND COMPONENTS:
- AvailabilityGrid (ENHANCED)
  - Firebase listeners: none (unchanged)
  - Cache interactions: none (unchanged)
  - UI responsibilities:
    - EXISTING: Render grid, single-click selection, sync indicator
    - NEW: Drag selection (rectangular, mouse events)
    - NEW: Shift+click range selection
    - NEW: Day header click (toggle entire column)
    - NEW: Time header click (toggle entire row)
    - NEW: Visual feedback during drag (highlight preview)
  - User actions:
    - Single click: toggle cell (existing)
    - Click + drag: rectangular selection
    - Shift + click: range selection from last clicked cell
    - Click day header: toggle column
    - Click time header: toggle row

- GridActionButtons (ENHANCED - minimal change)
  - Firebase listeners: none (unchanged)
  - Cache interactions: none (unchanged)
  - UI responsibilities:
    - EXISTING: Add Me / Remove Me buttons
    - NEW: Select All button
    - NEW: Clear All button
  - User actions:
    - Select All → selects all cells in both visible weeks
    - Clear All → deselects all cells in both visible weeks

FRONTEND SERVICES:
- None required (pure frontend feature)

BACKEND REQUIREMENTS:
- None required (selection is entirely frontend state)

INTEGRATION POINTS:
- GridActionButtons → AvailabilityGrid: Select All / Clear All trigger grid methods
- Selection state feeds into existing Add Me / Remove Me flow (unchanged)
- WeekDisplay coordinates selection across both grids
```

## 4. Integration Code Examples

### Enhanced AvailabilityGrid - Selection Methods
```javascript
// Additions to AvailabilityGrid.js

// New private state for drag selection
let _isDragging = false;
let _dragStartCell = null;
let _lastClickedCell = null; // For shift+click

// Drag selection (rectangular)
function _handleMouseDown(e) {
    const cell = e.target.closest('.grid-cell');
    if (!cell || !cell.dataset.cellId) return;

    _isDragging = true;
    _dragStartCell = cell.dataset.cellId;
    _lastClickedCell = cell.dataset.cellId;

    // Start preview
    _updateDragPreview(_dragStartCell, _dragStartCell);

    // Prevent text selection during drag
    e.preventDefault();
}

function _handleMouseMove(e) {
    if (!_isDragging || !_dragStartCell) return;

    const cell = e.target.closest('.grid-cell');
    if (!cell || !cell.dataset.cellId) return;

    _updateDragPreview(_dragStartCell, cell.dataset.cellId);
}

function _handleMouseUp(e) {
    if (!_isDragging) return;

    const cell = e.target.closest('.grid-cell');
    const endCell = cell?.dataset.cellId || _dragStartCell;

    // Apply selection to all cells in rectangle
    _applyRectangularSelection(_dragStartCell, endCell);
    _clearDragPreview();

    _isDragging = false;
    _dragStartCell = null;
}

function _updateDragPreview(startId, endId) {
    // Clear previous preview
    _clearDragPreview();

    // Calculate rectangle and add preview class
    const cellsInRect = _getCellsInRectangle(startId, endId);
    cellsInRect.forEach(cellId => {
        const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
        if (cell) cell.classList.add('drag-preview');
    });
}

function _clearDragPreview() {
    const previewCells = _container?.querySelectorAll('.drag-preview');
    previewCells?.forEach(cell => cell.classList.remove('drag-preview'));
}

function _getCellsInRectangle(startId, endId) {
    const [startDay, startTime] = startId.split('_');
    const [endDay, endTime] = endId.split('_');

    const startDayIdx = DAYS.indexOf(startDay);
    const endDayIdx = DAYS.indexOf(endDay);
    const startTimeIdx = TIME_SLOTS.indexOf(startTime);
    const endTimeIdx = TIME_SLOTS.indexOf(endTime);

    // Get min/max for proper rectangle
    const minDay = Math.min(startDayIdx, endDayIdx);
    const maxDay = Math.max(startDayIdx, endDayIdx);
    const minTime = Math.min(startTimeIdx, endTimeIdx);
    const maxTime = Math.max(startTimeIdx, endTimeIdx);

    const cells = [];
    for (let d = minDay; d <= maxDay; d++) {
        for (let t = minTime; t <= maxTime; t++) {
            cells.push(`${DAYS[d]}_${TIME_SLOTS[t]}`);
        }
    }
    return cells;
}

function _applyRectangularSelection(startId, endId) {
    const cellsInRect = _getCellsInRectangle(startId, endId);

    // Toggle behavior: if all are selected, deselect all; else select all
    const allSelected = cellsInRect.every(id => _selectedCells.has(id));

    cellsInRect.forEach(cellId => {
        const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
        if (!cell) return;

        if (allSelected) {
            _selectedCells.delete(cellId);
            cell.classList.remove('selected');
        } else {
            _selectedCells.add(cellId);
            cell.classList.add('selected');
        }
    });

    _notifySelectionChange();
}

// Shift+click range selection
function _handleShiftClick(cellId) {
    if (!_lastClickedCell) {
        // No previous cell, treat as normal click
        _handleCellClickWithNotify(cellId);
        return;
    }

    // Select rectangle between last clicked and current
    _applyRectangularSelection(_lastClickedCell, cellId);
    _lastClickedCell = cellId;
}

// Day header click (toggle entire column)
function _handleDayHeaderClick(day) {
    const columnCells = TIME_SLOTS.map(time => `${day}_${time}`);

    // Toggle: if all selected, deselect; else select all
    const allSelected = columnCells.every(id => _selectedCells.has(id));

    columnCells.forEach(cellId => {
        const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
        if (!cell) return;

        if (allSelected) {
            _selectedCells.delete(cellId);
            cell.classList.remove('selected');
        } else {
            _selectedCells.add(cellId);
            cell.classList.add('selected');
        }
    });

    _notifySelectionChange();
}

// Time header click (toggle entire row)
function _handleTimeHeaderClick(time) {
    const rowCells = DAYS.map(day => `${day}_${time}`);

    // Toggle: if all selected, deselect; else select all
    const allSelected = rowCells.every(id => _selectedCells.has(id));

    rowCells.forEach(cellId => {
        const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
        if (!cell) return;

        if (allSelected) {
            _selectedCells.delete(cellId);
            cell.classList.remove('selected');
        } else {
            _selectedCells.add(cellId);
            cell.classList.add('selected');
        }
    });

    _notifySelectionChange();
}

// Select All (for this grid's week)
function selectAll() {
    DAYS.forEach(day => {
        TIME_SLOTS.forEach(time => {
            const cellId = `${day}_${time}`;
            _selectedCells.add(cellId);
            const cell = _container?.querySelector(`[data-cell-id="${cellId}"]`);
            if (cell) cell.classList.add('selected');
        });
    });
    _notifySelectionChange();
}

// Clear All (for this grid's week)
function clearAll() {
    clearSelection(); // Existing method
    _notifySelectionChange();
}

// Helper to notify selection changes
function _notifySelectionChange() {
    if (_onSelectionChangeCallback) {
        _onSelectionChangeCallback();
    }
}
```

### Enhanced Grid HTML with Clickable Headers
```javascript
// Updated _render() method
function _render() {
    if (!_container) return;

    _container.innerHTML = `
        <div class="availability-grid-container">
            <!-- Day Headers Row -->
            <div class="grid-header">
                <div class="time-label-spacer"></div>
                ${DAYS.map((day, idx) => `
                    <div class="day-header clickable" data-day="${day}">${DAY_LABELS[idx]}</div>
                `).join('')}
            </div>

            <!-- Time Rows -->
            <div class="grid-body">
                ${TIME_SLOTS.map(time => `
                    <div class="grid-row">
                        <div class="time-label clickable" data-time="${time}">${formatTime(time)}</div>
                        ${DAYS.map(day => `
                            <div class="grid-cell" data-cell-id="${day}_${time}"></div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    _attachEventListeners();
}

function _attachEventListeners() {
    // Cell click (with shift detection)
    _container.addEventListener('click', (e) => {
        const cell = e.target.closest('.grid-cell');
        if (cell && cell.dataset.cellId) {
            if (e.shiftKey && _lastClickedCell) {
                _handleShiftClick(cell.dataset.cellId);
            } else {
                _handleCellClickWithNotify(cell.dataset.cellId);
                _lastClickedCell = cell.dataset.cellId;
            }
        }

        // Day header click
        const dayHeader = e.target.closest('.day-header');
        if (dayHeader && dayHeader.dataset.day) {
            _handleDayHeaderClick(dayHeader.dataset.day);
        }

        // Time header click
        const timeLabel = e.target.closest('.time-label');
        if (timeLabel && timeLabel.dataset.time) {
            _handleTimeHeaderClick(timeLabel.dataset.time);
        }
    });

    // Drag selection events
    _container.addEventListener('mousedown', _handleMouseDown);
    _container.addEventListener('mousemove', _handleMouseMove);

    // Mouse up on document (in case drag ends outside grid)
    document.addEventListener('mouseup', _handleMouseUp);

    // Clean up document listener on grid cleanup
    _documentMouseUpHandler = _handleMouseUp;
}
```

### Enhanced GridActionButtons
```javascript
// Addition to GridActionButtons.js

function _render() {
    if (!_container) return;

    _container.innerHTML = `
        <div class="grid-action-buttons flex flex-wrap gap-2 p-2 bg-card border border-border rounded-lg shadow-md">
            <button id="add-me-btn"
                    class="btn-primary px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled>
                Add Me
            </button>
            <button id="remove-me-btn"
                    class="btn-secondary px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled>
                Remove Me
            </button>
            <div class="border-l border-border mx-1"></div>
            <button id="select-all-btn"
                    class="btn-secondary px-3 py-2 rounded text-sm font-medium">
                Select All
            </button>
            <button id="clear-all-btn"
                    class="btn-secondary px-3 py-2 rounded text-sm font-medium">
                Clear All
            </button>
        </div>
    `;

    _attachListeners();
}

function _attachListeners() {
    // ... existing Add Me / Remove Me listeners ...

    document.getElementById('select-all-btn')?.addEventListener('click', _handleSelectAll);
    document.getElementById('clear-all-btn')?.addEventListener('click', _handleClearAll);
}

function _handleSelectAll() {
    // _selectAllCallback passed during init
    if (_selectAllCallback) {
        _selectAllCallback();
    }
}

function _handleClearAll() {
    // _clearAllCallback passed during init
    if (_clearAllCallback) {
        _clearAllCallback();
    }
}

// Updated init signature
function init(containerId, options = {}) {
    _container = document.getElementById(containerId);
    _getSelectedCells = options.getSelectedCells;
    _clearSelections = options.clearSelections;
    _onSyncStart = options.onSyncStart;
    _onSyncEnd = options.onSyncEnd;
    _selectAllCallback = options.selectAll;     // NEW
    _clearAllCallback = options.clearAll;       // NEW

    _render();
}
```

### WeekDisplay Coordination
```javascript
// In WeekDisplay.js - coordinate Select All / Clear All across both grids

function _handleSelectAll() {
    _gridInstances.forEach(grid => grid.selectAll());
}

function _handleClearAll() {
    _gridInstances.forEach(grid => grid.clearAll());
}

// Pass to GridActionButtons init
GridActionButtons.init('grid-tools-container', {
    getSelectedCells: _getSelectedCellsFromBothGrids,
    clearSelections: _clearSelectionsFromBothGrids,
    selectAll: _handleSelectAll,     // NEW
    clearAll: _handleClearAll,       // NEW
    onSyncStart: _handleSyncStart,
    onSyncEnd: _handleSyncEnd
});
```

### CSS for Advanced Selection
```css
/* Add to src/css/input.css */

/* Drag preview highlight */
.grid-cell.drag-preview {
    background-color: oklch(0.6801 0.1583 276.9349 / 0.2); /* primary with 20% opacity */
    outline: 2px dashed var(--primary);
    outline-offset: -2px;
}

/* Clickable headers */
.day-header.clickable,
.time-label.clickable {
    cursor: pointer;
    transition: background-color 150ms ease;
    user-select: none;
}

.day-header.clickable:hover,
.time-label.clickable:hover {
    background-color: var(--accent);
}

.day-header.clickable:active,
.time-label.clickable:active {
    background-color: var(--primary);
    color: var(--primary-foreground);
}

/* Prevent text selection during drag */
.availability-grid-container.dragging {
    user-select: none;
}
```

## 5. Performance Classification
```
HOT PATHS (<50ms):
- Single click selection: Pure DOM toggle - instant
- Drag selection preview: Pure DOM class toggle - instant
- Drag selection apply: Pure DOM batch update - instant
- Shift+click range selection: Pure DOM batch update - instant
- Header click (day/time): Pure DOM batch update - instant
- Select All: Pure DOM batch update - instant
- Clear All: Pure DOM batch update - instant

COLD PATHS:
- None in this slice (all selection is frontend state)

BACKEND PERFORMANCE:
- N/A (selection triggers existing Add Me / Remove Me which already handles backend)
```

## 6. Data Flow Diagram
```
DRAG SELECTION FLOW:
MouseDown on cell → Set _isDragging = true, capture start cell
                          ↓
MouseMove over cells → Calculate rectangle → Update preview classes (visual feedback)
                          ↓
MouseUp → Calculate final rectangle → Apply toggle logic → Update _selectedCells
                          ↓
                   Notify selection change callback
                          ↓
                   GridActionButtons updates button states


SHIFT+CLICK FLOW:
Click cell (no shift) → Normal toggle → Store as _lastClickedCell
                          ↓
Shift+Click another cell → Calculate rectangle from _lastClickedCell to current
                          ↓
                   Apply toggle logic → Update _selectedCells → Notify callback


HEADER CLICK FLOW:
Click day header "Mon" → Get all cells in Mon column
                          ↓
Check if ALL are selected → Yes: deselect all → No: select all
                          ↓
                   Update _selectedCells → Notify callback


SELECT ALL / CLEAR ALL FLOW:
Click "Select All" → WeekDisplay._handleSelectAll()
                          ↓
            For each grid instance → grid.selectAll()
                          ↓
         All cells in both weeks selected → Notify callback


ADD ME (unchanged, just more cells):
User clicks "Add Me" → GridActionButtons._handleAddMe()
                          ↓
           Get selected cells from both grids (may be hundreds)
                          ↓
        AvailabilityService.addMeToSlots() for each week → Firebase updates
```

## 7. Test Scenarios
```
FRONTEND TESTS - Drag Selection:
- [ ] MouseDown on cell starts drag mode
- [ ] MouseMove shows preview highlight on cells in rectangle
- [ ] Preview updates as mouse moves to different cells
- [ ] MouseUp applies selection to all cells in rectangle
- [ ] Dragging from bottom-right to top-left works correctly
- [ ] Dragging outside grid area still completes selection
- [ ] Drag preview clears after mouseup
- [ ] Rapid clicking doesn't break drag state

FRONTEND TESTS - Shift+Click:
- [ ] First click sets _lastClickedCell
- [ ] Shift+click creates rectangular selection from last cell
- [ ] Selection includes both start and end cells
- [ ] Multiple shift+clicks update selection correctly
- [ ] Shift+click without prior click behaves as normal click

FRONTEND TESTS - Header Clicks:
- [ ] Day header click selects entire column (7 cells per time = 77 cells)
- [ ] Day header click on fully selected column deselects all
- [ ] Time header click selects entire row (7 cells)
- [ ] Time header click on fully selected row deselects all
- [ ] Headers show hover state
- [ ] Headers show active/pressed state

FRONTEND TESTS - Select All / Clear All:
- [ ] Select All selects all cells in both visible weeks
- [ ] Clear All deselects all cells in both visible weeks
- [ ] Select All followed by Clear All leaves no selection
- [ ] Add Me / Remove Me buttons enable after Select All

INTEGRATION TESTS (with existing Add Me flow):
- [ ] Drag select 10 cells → Add Me → All 10 cells update in Firebase
- [ ] Select All → Add Me → All 154 cells (77 per week) update
- [ ] Clear All → Add Me button disabled
- [ ] Shift+click large range → Remove Me → All cells in range updated
- [ ] Mix of selection methods (drag + click + header) → Add Me works

END-TO-END TESTS:
- [ ] Complete workflow: drag select → add me → see sync → confirm in Firestore
- [ ] Large selection (Select All) completes without timeout
- [ ] Selection state survives week navigation
- [ ] Selection cleared after successful Add Me/Remove Me
```

## 8. Common Integration Pitfalls
- [ ] Document mouseup listener not cleaned up on grid destroy (memory leak)
- [ ] Drag preview not cleared on unexpected mouseup (e.g., window blur)
- [ ] Shift+click fails if _lastClickedCell was from other grid instance
- [ ] Header click selects wrong cells if DAYS/TIME_SLOTS arrays misaligned
- [ ] Select All counts as 154 cells - may hit Cloud Function rate limits
- [ ] Drag selection interfering with cell click events (need to distinguish)
- [ ] Preview class not removed if mouse leaves container during drag
- [ ] Touch devices: no mouse events - drag won't work (acceptable for MVP, desktop-only)

## 9. Implementation Notes

### File Changes
```
public/js/components/
├── AvailabilityGrid.js    (ENHANCE - add drag, shift, header methods)
├── GridActionButtons.js   (ENHANCE - add Select All / Clear All)
└── WeekDisplay.js         (ENHANCE - coordinate Select/Clear callbacks)

src/css/
└── input.css              (ADD - drag preview and header hover styles)
```

### Distinguishing Click vs Drag
```javascript
// Track if this was a drag (moved more than 5px) vs just a click
let _dragDistance = 0;
const DRAG_THRESHOLD = 5;

function _handleMouseDown(e) {
    _dragDistance = 0;
    _dragStartPos = { x: e.clientX, y: e.clientY };
    // ... rest of handler
}

function _handleMouseMove(e) {
    if (!_isDragging) return;

    _dragDistance = Math.max(
        _dragDistance,
        Math.abs(e.clientX - _dragStartPos.x),
        Math.abs(e.clientY - _dragStartPos.y)
    );
    // ... rest of handler
}

function _handleMouseUp(e) {
    // If barely moved, treat as click (handled by click event)
    if (_dragDistance < DRAG_THRESHOLD) {
        _clearDragPreview();
        _isDragging = false;
        return;
    }
    // ... rest of handler for actual drag
}
```

### Cross-Grid Selection Limitation
- Each grid instance manages its own selection
- Shift+click only works within the same grid (same week)
- Select All / Clear All are the only cross-grid operations
- This matches PRD requirement: "Selection tools restricted to one week"

### Mouse Event Cleanup
```javascript
// Store reference for cleanup
let _documentMouseUpHandler = null;

function cleanup() {
    // Remove document-level listener
    if (_documentMouseUpHandler) {
        document.removeEventListener('mouseup', _documentMouseUpHandler);
        _documentMouseUpHandler = null;
    }
    // ... existing cleanup
}
```

### Keyboard Accessibility (Nice to Have)
- Arrow keys to move between cells
- Space to toggle selection
- Shift+arrows for range selection
- Not required for MVP but good to keep in mind

## 10. Quality Checklist

Before considering this slice spec complete:
- [x] Frontend AND backend requirements specified (frontend-only slice)
- [x] All PRD requirements mapped (4.1.3 multi-select methods)
- [x] Architecture follows established patterns (factory pattern, revealing module)
- [x] Hot paths clearly identified (all selection is instant DOM manipulation)
- [x] Test scenarios cover full stack (frontend tests for this slice)
- [x] No anti-patterns present
- [x] Data flow complete (selection → Add Me → existing Firebase flow)
- [x] Integration examples show actual code
- [x] Error handling specified (edge cases in pitfalls section)
- [x] Loading states defined (N/A for selection, existing shimmer for sync)
- [x] Event logging checked (not applicable - selection is transient state)
- [x] API contracts fully specified (no backend changes)
- [x] Security rules documented (unchanged from slice 2.2)

---

*Slice created: 2026-01-23*
*Based on PRD 4.1.3 Selection Mechanics*
*Clarifications obtained: Rectangular drag, toggle headers, time headers clickable*
