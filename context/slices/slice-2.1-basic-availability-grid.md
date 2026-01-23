# Slice 2.1: Basic Availability Grid

## 1. Slice Definition
- **Slice ID:** 2.1
- **Name:** Basic Availability Grid
- **User Story:** As a team member, I can see a visual weekly time grid so that I understand the time slot structure for setting availability
- **Success Criteria:** User can see a bi-weekly availability grid with proper time slots (18:00-23:00), days (Mon-Sun), and can click individual cells to select/deselect them

## Design Goals (1080p Optimization)
- **No scrolling required** on 1080p displays - entire grid (nav bar + 2 weeks) fits in viewport
- **Remove top "MatchScheduler" title** to reclaim vertical space
- **Compact but clickable cells** - tight spacing while maintaining usability
- **Vanilla JS only** - simple event delegation, no framework overhead

## 2. PRD Mapping
```
PRIMARY SECTIONS:
- 4.1.1 Grid Structure: Time slots (30-min intervals, 18:00-23:00 CET), days (Mon-Sun), bi-weekly display
- 4.1.2 Grid Display Options: Basic grid structure (Team View Mode as default)

DEPENDENT SECTIONS:
- 6.1 Sacred 3x3 Grid Layout: Middle-center (Week 1) and bottom-center (Week 2) panels
- 6.2 Hybrid Scaling Strategy: rem units for all sizing
- 6.5 Component Layout Patterns: Revealing Module Pattern

IGNORED SECTIONS (for this slice):
- 4.1.2 Player initials/avatars display - comes in slice 2.5 (Team View Display)
- 4.1.3 Selection Mechanics (multi-select methods) - comes in slice 2.3
- 4.1.4 Grid Tools Panel - comes in slice 2.4
- 4.1.5 Performance requirements for adding/removing self - comes in slice 2.2
- Week navigation Prev/Next buttons - minimal enhancement later
```

## 3. Full Stack Architecture
```
FRONTEND COMPONENTS:
- AvailabilityGrid (NEW)
  - Firebase listeners: none for this slice (just rendering structure)
  - Cache interactions: none for this slice
  - UI responsibilities:
    - Render 7 columns (Mon-Sun) x 11 rows (18:00-23:00 in 30-min slots)
    - Display day headers and time labels
    - Visual cell selection state
  - User actions: Single-click to select/deselect a cell

- WeekDisplay (NEW)
  - Firebase listeners: none for this slice
  - Cache interactions: none for this slice
  - UI responsibilities:
    - Show which week is being displayed (e.g., "Week 5: Jan 27 - Feb 2")
    - Container for AvailabilityGrid component
  - User actions: none for this slice (navigation comes later)

- WeekNavigation (NEW - minimal)
  - Firebase listeners: none
  - Cache interactions: none
  - UI responsibilities:
    - Display current bi-weekly block info (e.g., "Weeks 5-6")
    - Placeholder for future Prev/Next buttons
  - User actions: none for this slice

FRONTEND SERVICES:
- None for this slice (grid is pure UI)

BACKEND REQUIREMENTS:
⚠️ NO BACKEND NEEDED FOR THIS SLICE
- This slice is purely frontend UI structure
- No Cloud Functions required
- No Firestore operations
- No security rules changes

INTEGRATION POINTS:
- WeekNavigation renders in panel-top-center
- WeekDisplay (with AvailabilityGrid) renders in panel-middle-center (Week 1)
- WeekDisplay (with AvailabilityGrid) renders in panel-bottom-center (Week 2)
- Selection state is local only (not persisted) - for visual feedback
```

## 4. Integration Code Examples

### AvailabilityGrid Component (Vanilla JS)

```javascript
// AvailabilityGrid.js - Vanilla JS with Revealing Module Pattern
const AvailabilityGrid = (function() {
    'use strict';

    let _panel = null;
    let _weekId = null;
    let _selectedCells = new Set();

    const TIME_SLOTS = [
        '1800', '1830', '1900', '1930', '2000',
        '2030', '2100', '2130', '2200', '2230', '2300'
    ];

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    function _formatTime(slot) {
        return `${slot.slice(0, 2)}:${slot.slice(2)}`;
    }

    function _handleCellClick(cellId) {
        const cell = document.querySelector(`[data-cell-id="${cellId}"]`);
        if (_selectedCells.has(cellId)) {
            _selectedCells.delete(cellId);
            cell?.classList.remove('bg-primary', 'border-primary');
            cell?.classList.add('bg-muted', 'border-border', 'hover:bg-accent');
        } else {
            _selectedCells.add(cellId);
            cell?.classList.add('bg-primary', 'border-primary');
            cell?.classList.remove('bg-muted', 'border-border', 'hover:bg-accent');
        }
    }

    function _render() {
        if (!_panel) return;

        // Compact grid optimized for 1080p - gap-px for minimal spacing
        _panel.innerHTML = `
            <div class="h-full flex flex-col">
                <!-- Day Headers -->
                <div class="grid grid-cols-8 gap-px">
                    <div></div>
                    ${DAY_LABELS.map(day => `
                        <div class="text-center text-xs font-medium text-foreground py-0.5">${day}</div>
                    `).join('')}
                </div>

                <!-- Time Grid -->
                <div class="flex-1 grid grid-rows-11 gap-px">
                    ${TIME_SLOTS.map(time => `
                        <div class="grid grid-cols-8 gap-px">
                            <div class="text-xs text-muted-foreground text-right pr-1 flex items-center justify-end">
                                ${_formatTime(time)}
                            </div>
                            ${DAYS.map(day => `
                                <div class="cell bg-muted border border-border rounded-sm cursor-pointer hover:bg-accent transition-colors"
                                     data-cell-id="${day}_${time}">
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Event delegation for better performance
        _panel.addEventListener('click', (e) => {
            const cell = e.target.closest('.cell');
            if (cell) _handleCellClick(cell.dataset.cellId);
        });
    }

    return {
        init(panelId, weekId) {
            _panel = document.getElementById(panelId);
            _weekId = weekId;
            _selectedCells.clear();
            _render();
        },
        getSelectedCells: () => Array.from(_selectedCells),
        clearSelection() {
            _selectedCells.forEach(id => _handleCellClick(id));
        },
        cleanup() {
            _selectedCells.clear();
            if (_panel) _panel.innerHTML = '';
        }
    };
})();
```

### WeekDisplay Component
```javascript
// WeekDisplay.js - Container for availability grid with week info
const WeekDisplay = (function() {
    'use strict';

    let _panel = null;
    let _weekNumber = null;
    let _weekLabel = null;

    function _getWeekLabel(weekNumber) {
        // Calculate date range for the week
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const daysOffset = (weekNumber - 1) * 7;

        // Find Monday of that week
        const mondayOffset = (startOfYear.getDay() + 6) % 7;
        const monday = new Date(startOfYear);
        monday.setDate(startOfYear.getDate() - mondayOffset + daysOffset);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const formatDate = (date) => {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[date.getMonth()]} ${date.getDate()}`;
        };

        return `Week ${weekNumber}: ${formatDate(monday)} - ${formatDate(sunday)}`;
    }

    function _render() {
        if (!_panel) return;

        // Clear existing content class overrides
        _panel.querySelector('.panel-content')?.remove();

        _panel.innerHTML = `
            <div class="panel-content h-full flex flex-col p-2">
                <h3 class="text-sm font-semibold mb-2 text-foreground">${_weekLabel}</h3>
                <div id="availability-grid-week${_weekNumber}" class="flex-1 min-h-0">
                    <!-- AvailabilityGrid renders here -->
                </div>
            </div>
        `;
    }

    function init(panelId, weekNumber) {
        _panel = document.getElementById(panelId);
        _weekNumber = weekNumber;
        _weekLabel = _getWeekLabel(weekNumber);
        _render();

        // Initialize the grid inside
        AvailabilityGrid.init(`availability-grid-week${weekNumber}`, weekNumber);
    }

    function cleanup() {
        if (_panel) _panel.innerHTML = '';
    }

    return {
        init,
        cleanup
    };
})();
```

### WeekNavigation Component
```javascript
// WeekNavigation.js - Shows current bi-weekly block (static for now)
const WeekNavigation = (function() {
    'use strict';

    let _panel = null;
    let _currentWeekBlock = 1; // Block 1 = Weeks 1+2, Block 2 = Weeks 3+4

    function _getCurrentWeekNumber() {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
        return Math.ceil((days + startOfYear.getDay() + 1) / 7);
    }

    function _render() {
        if (!_panel) return;

        const currentWeek = _getCurrentWeekNumber();
        const week1 = currentWeek;
        const week2 = currentWeek + 1;

        _panel.innerHTML = `
            <div class="panel-content h-full flex items-center justify-center px-4">
                <div class="flex items-center gap-4">
                    <!-- Prev button placeholder (disabled for now) -->
                    <button class="btn-ghost px-2 py-1 text-muted-foreground cursor-not-allowed opacity-50"
                            disabled title="Coming soon">
                        ◀
                    </button>

                    <div class="text-center">
                        <span class="text-lg font-semibold text-foreground">
                            Weeks ${week1} - ${week2}
                        </span>
                        <span class="text-sm text-muted-foreground ml-2">
                            (Current + Next)
                        </span>
                    </div>

                    <!-- Next button placeholder (disabled for now) -->
                    <button class="btn-ghost px-2 py-1 text-muted-foreground cursor-not-allowed opacity-50"
                            disabled title="Coming soon">
                        ▶
                    </button>
                </div>
            </div>
        `;
    }

    function init(panelId) {
        _panel = document.getElementById(panelId);
        _render();
    }

    function cleanup() {
        if (_panel) _panel.innerHTML = '';
    }

    return {
        init,
        cleanup
    };
})();
```

## 5. Performance Classification
```
HOT PATHS (<50ms):
- Cell click selection: Pure DOM manipulation, no network calls
- Visual state toggle: CSS class changes only

COLD PATHS (<2s):
- Initial grid render: One-time setup, DOM generation

BACKEND PERFORMANCE:
- N/A - No backend calls in this slice
```

## 6. Data Flow Diagram
```
User clicks cell → AvailabilityGrid._handleCellClick() → Update local _selectedCells Set
                                                       → Toggle CSS classes on cell

(No Firebase involved in this slice - selection is visual only)

FUTURE DATA FLOW (Slice 2.2):
Click "Add me" → Selection state → Firebase update → onSnapshot → UI refresh + Cache update
```

## 7. Test Scenarios
```
FRONTEND TESTS:
- [ ] Grid renders 7 columns (Mon-Sun) with correct day headers
- [ ] Grid renders 11 rows (18:00-23:00 in 30-min intervals)
- [ ] Time labels show correctly (18:00, 18:30, 19:00, etc.)
- [ ] Both week panels render (middle-center and bottom-center)
- [ ] Week headers show correct week numbers and date ranges
- [ ] Single cell click toggles selection state
- [ ] Selected cells have distinct visual styling (primary color)
- [ ] Hover effect works on unselected cells
- [ ] Cell IDs follow format: 'day_time' (e.g., 'mon_1800')
- [ ] "MatchScheduler" title is removed from page

BACKEND TESTS:
- N/A - No backend in this slice

INTEGRATION TESTS (CRITICAL):
- [ ] **1080P TEST**: Full grid visible without scrolling at 1920x1080
- [ ] Grid fits within panel bounds without overflow
- [ ] Both grids work independently (Week 1 selection doesn't affect Week 2)
- [ ] Navigation panel shows correct current week info
- [ ] Grid scales properly with rem-based sizing
- [ ] Grid remains usable at different viewport sizes (1920x1080+)
- [ ] Cells are large enough to click comfortably on desktop

END-TO-END TESTS:
- [ ] Full bi-weekly grid displays on page load
- [ ] User can click cells in both weeks
- [ ] Selection state persists during session (until page refresh)
```

## 8. Common Integration Pitfalls
- [ ] Grid exceeds panel height - MUST use flex-1 and overflow handling
- [ ] Hard-coded pixel values - MUST use rem/tailwind spacing
- [ ] Cell IDs not matching PRD format - MUST be 'day_time' (e.g., 'mon_1800')
- [ ] Week calculation off by one - test with current date
- [ ] Time display not padded - '1800' should show as '18:00'
- [ ] Cells not receiving click events - ensure event delegation works

## 9. Implementation Notes
- **Remove title**: Delete `<h1>MatchScheduler</h1>` from index.html to maximize vertical space
- **Grid sizing**: Use CSS Grid with `grid-cols-8` (1 for time labels + 7 days)
- **Cell height**: Let cells flex to fill available space (no fixed height) - use `grid-rows-11` with `1fr` each
- **1080p target**: At 1080px height, with ~3rem nav and two equal week panels, each week gets ~500px
- **Gap optimization**: Use `gap-px` (1px gaps) for maximum density while maintaining visual separation
- **Week IDs**: Use ISO week numbers (1-52) for consistency
- **Vanilla JS only**: Event delegation + Set for selection state - simple and predictable

### File Structure
```
public/js/components/
├── AvailabilityGrid.js    (NEW)
├── WeekDisplay.js         (NEW)
└── WeekNavigation.js      (NEW)
```

### HTML Updates (index.html)

**CRITICAL: Remove top title to reclaim vertical space**
```html
<!-- REMOVE THIS from index.html -->
<h1 class="text-2xl font-bold text-primary text-center py-4">MatchScheduler</h1>

<!-- The app-container should go directly to main-grid -->
<div class="app-container">
    <main class="main-grid h-screen">
        <!-- Grid panels start immediately -->
    </main>
</div>
```

**Grid height optimization for 1080p:**
```css
/* In src/css/input.css - ensure grid uses full viewport */
.main-grid {
    height: 100vh;
    /* Existing grid-template-rows needs adjustment */
    grid-template-rows: 3rem 1fr 1fr; /* Compact nav, equal week panels */
}

/* Cells need to fill available space */
.grid-rows-11 > div {
    min-height: 0; /* Allow shrinking */
}
```

### Script Tags
```html
<!-- Add before app.js -->
<script src="js/components/AvailabilityGrid.js"></script>
<script src="js/components/WeekNavigation.js"></script>
```

### app.js Integration
```javascript
// In app.js initialization
function initializeApp() {
    // ... existing auth and team initialization ...

    // Initialize availability grid components
    WeekNavigation.init('panel-top-center');

    // Get current week number
    const currentWeek = getCurrentWeekNumber();
    WeekDisplay.init('panel-middle-center', currentWeek);
    WeekDisplay.init('panel-bottom-center', currentWeek + 1);
}
```

## 10. Pragmatic Assumptions
- **[ASSUMPTION]**: Week numbering uses ISO 8601 (Monday as first day)
- **Rationale**: Standard for European gaming communities (CET timezone per PRD)
- **Alternative**: Could use Sunday-start weeks, but ISO is more common in EU

- **[ASSUMPTION]**: Time slots are fixed 18:00-23:00 without configurability
- **Rationale**: PRD explicitly states these times; no need for flexibility MVP
- **Alternative**: Could make configurable, but adds complexity without value

- **[ASSUMPTION]**: Each WeekDisplay creates its own AvailabilityGrid instance
- **Rationale**: Keeps components simple and independent
- **Alternative**: Single AvailabilityGrid component managing both weeks (more complex)

---

## Quality Checklist

Before considering this slice spec complete:
- [x] Frontend requirements specified (3 new components)
- [x] Backend requirements specified (none needed)
- [x] All PRD requirements mapped (4.1.1, 4.1.2 structure)
- [x] Architecture follows established patterns (Revealing Module)
- [x] Hot paths clearly identified (cell click = instant)
- [x] Test scenarios cover frontend and integration
- [x] No anti-patterns present
- [x] Data flow complete (local selection state)
- [x] Integration examples show actual code
- [x] Error handling not needed (no backend calls)
- [x] Loading states not needed (instant render)
- [x] Event logging N/A (no backend operations)
- [x] API contracts N/A (no backend calls)
- [x] Security rules N/A (no data persistence)

---

*Slice created: 2026-01-23*
