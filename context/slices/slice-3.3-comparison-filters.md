# Slice 3.3: Comparison Filters

## 1. Slice Definition

| Field | Value |
|-------|-------|
| **Slice ID** | 3.3 |
| **Name** | Comparison Filters |
| **User Story** | As a team leader, I can set minimum player requirements so that I only see time slots with sufficient attendance for a meaningful match |
| **Panel Location** | Top-Right (`#panel-top-right`) |
| **Depends On** | Slice 3.1 (TeamBrowser), Slice 3.2 (FavoritesSystem) |
| **Enables** | Slice 3.4 (Basic Comparison) |

### Success Criteria
- [ ] FilterPanel renders in top-right panel with two dropdown selectors
- [ ] "Your team minimum" dropdown shows options 1-4
- [ ] "Opponent minimum" dropdown shows options 1-4
- [ ] Both dropdowns default to 1
- [ ] Dropdown changes update FilterService state instantly
- [ ] Filter values reset to defaults (1,1) on page refresh
- [ ] FilterService dispatches 'filter-changed' events on value change
- [ ] Other components can read current filters via FilterService.getFilters()
- [ ] Panel fits within grid constraints (~200-300px width)
- [ ] No console errors

---

## 2. PRD Mapping

### Primary Sections
| PRD Section | Requirement | Implementation |
|-------------|-------------|----------------|
| 4.2.1 Top-Right | "Your team minimum" dropdown selector (1-4) | FilterPanel dropdown |
| 4.2.1 Top-Right | "Opponent minimum" dropdown selector (1-4) | FilterPanel dropdown |
| 4.2.1 Top-Right | Settings apply to comparison filtering | FilterService events broadcast changes |

### Dependent Sections (from other slices)
| PRD Section | Dependency | Status |
|-------------|------------|--------|
| 4.2.3 | Comparison workflow uses these filters | Slice 3.4 will consume |
| 4.2.1 Middle-Center | Grid cells use filters for highlighting | Slice 3.4+ will consume |

### Explicitly NOT in Scope
- Comparison logic (Slice 3.4)
- Overlap visualization (Slice 3.5)
- Actual filtering of grid cells (Slice 3.4+)
- Persistence of filter values across sessions

---

## 3. Full Stack Architecture

### 3.1 Frontend Components

#### FilterPanel (NEW)
**Location:** `/public/js/components/FilterPanel.js`

**Responsibilities:**
- Render two labeled dropdown selectors in top-right panel
- Sync dropdown values with FilterService
- Compact layout fitting panel constraints (~200-300px width, ~5rem height)

**State:**
- Current filter values read from FilterService

**User Actions:**
- Change "Your team minimum" dropdown → updates FilterService
- Change "Opponent minimum" dropdown → updates FilterService

#### FilterService (NEW)
**Location:** `/public/js/services/FilterService.js`

**Responsibilities:**
- Hold current filter values in memory (not persisted)
- Provide getters/setters for filter values
- Dispatch 'filter-changed' events when values change
- Reset to defaults on init

**API:**
```javascript
{
    init()                    // Initialize with defaults (1, 1)
    getYourTeamMinimum()      // returns 1-4
    setYourTeamMinimum(n)     // updates and dispatches event
    getOpponentMinimum()      // returns 1-4
    setOpponentMinimum(n)     // updates and dispatches event
    getFilters()              // returns { yourTeam: n, opponent: n }
    reset()                   // reset to defaults (1, 1)
}
```

### 3.2 Backend Components

**None required for this slice.**

This is a frontend-only slice. Filter values are:
- Session-specific (reset each page load)
- Not persisted to Firestore
- Used locally for comparison calculations (Slice 3.4+)

### 3.3 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                            │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────┐                    ┌───────────────────┐
│ Your Team Minimum │                    │ Opponent Minimum  │
│    Dropdown       │                    │    Dropdown       │
└─────────┬─────────┘                    └─────────┬─────────┘
          │                                        │
          └────────────────┬───────────────────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │  FilterService    │
                 │  (state holder)   │
                 └─────────┬─────────┘
                           │
                           │ 'filter-changed' event
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Event Listeners                               │
│  - AvailabilityGrid (Slice 3.4+)                                │
│  - TeamBrowser comparison logic (Slice 3.4+)                    │
│  - Any component needing filter values                          │
└─────────────────────────────────────────────────────────────────┘
```

**Filter Change Flow:**
```
User changes dropdown → FilterPanel.handleChange() → FilterService.setXXX(value)
    → FilterService dispatches 'filter-changed' event
    → Listening components read new values and update
```

---

## 4. Integration Code Examples

### 4.1 FilterService

```javascript
// /public/js/services/FilterService.js
const FilterService = (function() {
    // Private state
    let _yourTeamMinimum = 1;
    let _opponentMinimum = 1;

    function _dispatchChange() {
        window.dispatchEvent(new CustomEvent('filter-changed', {
            detail: {
                yourTeam: _yourTeamMinimum,
                opponent: _opponentMinimum
            }
        }));
    }

    function init() {
        _yourTeamMinimum = 1;
        _opponentMinimum = 1;
        // Don't dispatch on init - components will read initial values
    }

    function getYourTeamMinimum() {
        return _yourTeamMinimum;
    }

    function setYourTeamMinimum(value) {
        const n = Math.max(1, Math.min(4, parseInt(value) || 1));
        if (n !== _yourTeamMinimum) {
            _yourTeamMinimum = n;
            _dispatchChange();
        }
    }

    function getOpponentMinimum() {
        return _opponentMinimum;
    }

    function setOpponentMinimum(value) {
        const n = Math.max(1, Math.min(4, parseInt(value) || 1));
        if (n !== _opponentMinimum) {
            _opponentMinimum = n;
            _dispatchChange();
        }
    }

    function getFilters() {
        return {
            yourTeam: _yourTeamMinimum,
            opponent: _opponentMinimum
        };
    }

    function reset() {
        _yourTeamMinimum = 1;
        _opponentMinimum = 1;
        _dispatchChange();
    }

    return {
        init,
        getYourTeamMinimum,
        setYourTeamMinimum,
        getOpponentMinimum,
        setOpponentMinimum,
        getFilters,
        reset
    };
})();

export default FilterService;
```

### 4.2 FilterPanel Component

```javascript
// /public/js/components/FilterPanel.js
const FilterPanel = (function() {
    let _container;

    function init() {
        _container = document.getElementById('panel-top-right');
        FilterService.init();
        _render();
        _setupEventListeners();
    }

    function _render() {
        const yourTeamMin = FilterService.getYourTeamMinimum();
        const opponentMin = FilterService.getOpponentMinimum();

        _container.innerHTML = `
            <div class="panel-content p-3 h-full flex flex-col justify-center">
                <h3 class="text-sm font-semibold text-foreground mb-3">Match Filters</h3>

                <div class="flex flex-col gap-3">
                    <!-- Your Team Minimum -->
                    <div class="flex items-center justify-between gap-2">
                        <label for="your-team-min"
                               class="text-xs text-muted-foreground whitespace-nowrap">
                            Your team min:
                        </label>
                        <select id="your-team-min"
                                class="bg-muted text-foreground text-sm rounded px-2 py-1
                                       border border-border focus:border-primary focus:outline-none
                                       cursor-pointer min-w-[3.5rem]">
                            ${_renderOptions(yourTeamMin)}
                        </select>
                    </div>

                    <!-- Opponent Minimum -->
                    <div class="flex items-center justify-between gap-2">
                        <label for="opponent-min"
                               class="text-xs text-muted-foreground whitespace-nowrap">
                            Opponent min:
                        </label>
                        <select id="opponent-min"
                                class="bg-muted text-foreground text-sm rounded px-2 py-1
                                       border border-border focus:border-primary focus:outline-none
                                       cursor-pointer min-w-[3.5rem]">
                            ${_renderOptions(opponentMin)}
                        </select>
                    </div>
                </div>
            </div>
        `;

        _attachHandlers();
    }

    function _renderOptions(selectedValue) {
        return [1, 2, 3, 4].map(n =>
            `<option value="${n}" ${n === selectedValue ? 'selected' : ''}>
                ${n} player${n > 1 ? 's' : ''}
            </option>`
        ).join('');
    }

    function _attachHandlers() {
        const yourTeamSelect = document.getElementById('your-team-min');
        const opponentSelect = document.getElementById('opponent-min');

        yourTeamSelect?.addEventListener('change', (e) => {
            FilterService.setYourTeamMinimum(e.target.value);
        });

        opponentSelect?.addEventListener('change', (e) => {
            FilterService.setOpponentMinimum(e.target.value);
        });
    }

    function _setupEventListeners() {
        // Listen for external filter changes (e.g., reset from elsewhere)
        window.addEventListener('filter-changed', () => {
            // Sync dropdowns with service state
            const yourTeamSelect = document.getElementById('your-team-min');
            const opponentSelect = document.getElementById('opponent-min');

            if (yourTeamSelect) {
                yourTeamSelect.value = FilterService.getYourTeamMinimum();
            }
            if (opponentSelect) {
                opponentSelect.value = FilterService.getOpponentMinimum();
            }
        });
    }

    function cleanup() {
        // No listeners to clean up (event listeners on elements are removed with DOM)
    }

    return { init, cleanup };
})();

export default FilterPanel;
```

### 4.3 Usage by Future Components (Slice 3.4+)

```javascript
// Example: How comparison logic will use filters in Slice 3.4
function calculateSlotMatch(yourTeamSlot, opponentSlot) {
    const filters = FilterService.getFilters();

    const yourTeamAvailable = yourTeamSlot.available?.length || 0;
    const opponentAvailable = opponentSlot.available?.length || 0;

    const meetsYourMin = yourTeamAvailable >= filters.yourTeam;
    const meetsOpponentMin = opponentAvailable >= filters.opponent;

    return meetsYourMin && meetsOpponentMin;
}

// Listen for filter changes to re-calculate
window.addEventListener('filter-changed', () => {
    recalculateComparison();
});
```

### 4.4 App Initialization

```javascript
// In app.js - add to initialization sequence
import FilterService from './services/FilterService.js';
import FilterPanel from './components/FilterPanel.js';

async function initApp() {
    // ... existing init code ...

    // Initialize filter system (after auth, before grid)
    FilterService.init();
    FilterPanel.init();

    // ... rest of init ...
}
```

---

## 5. Performance Classification

### Hot Paths (must be instant <50ms)
| Action | Approach |
|--------|----------|
| Change dropdown value | Direct state update, no async operations |
| Read filter values | Synchronous getter from memory |
| Event dispatch | Synchronous CustomEvent |

### Cold Paths
**None** - This slice has no backend operations, no Firebase calls, no async work.

### Why No Backend?
- Filters are session-specific preferences for the comparison task
- Values are transient - they don't represent persistent user preferences
- No need to sync across devices/tabs
- Simpler architecture, faster performance

---

## 6. Test Scenarios

### Frontend Tests
| Test | Expected Behavior |
|------|-------------------|
| Page load | Both dropdowns show "1 player" selected |
| Change "Your team min" to 3 | Dropdown shows "3 players", FilterService.getYourTeamMinimum() returns 3 |
| Change "Opponent min" to 2 | Dropdown shows "2 players", FilterService.getOpponentMinimum() returns 2 |
| FilterService.getFilters() | Returns object with both current values |
| Page refresh | Both values reset to 1 |

### Integration Tests
| Test | Expected Behavior |
|------|-------------------|
| Change dropdown → event fires | 'filter-changed' event dispatched with correct values |
| External component listens | Component receives event with { yourTeam, opponent } detail |
| FilterService.reset() | Both values return to 1, event fires, dropdowns update |
| Dropdown values 1-4 only | Select only contains options 1, 2, 3, 4 |

### Edge Cases
| Test | Expected Behavior |
|------|-------------------|
| Invalid value set programmatically | Clamped to 1-4 range |
| setYourTeamMinimum(0) | Sets to 1 (minimum) |
| setYourTeamMinimum(5) | Sets to 4 (maximum) |
| setYourTeamMinimum("2") | Parses string, sets to 2 |
| setYourTeamMinimum(null) | Defaults to 1 |
| Set same value twice | No event dispatched (no change) |

---

## 7. Common Pitfalls

### Pattern Violations to Avoid
| Anti-Pattern | Correct Approach |
|--------------|------------------|
| Persisting filters to Firestore | Keep in memory only - session-specific |
| Creating subscription service | Simple event dispatch pattern |
| Complex state management | Two integers with getters/setters |
| Separate filter state per component | Single FilterService instance |

### Integration Mistakes
| Mistake | Prevention |
|---------|------------|
| Forgetting to dispatch event on change | _dispatchChange() called in every setter |
| Not validating input values | Clamp to 1-4 range in setters |
| Dropdown not syncing on external change | Listen to 'filter-changed' in FilterPanel |
| Breaking dropdown with invalid options | Only render options 1-4 |

---

## 8. Implementation Notes

### File Creation Order
1. `FilterService.js` - state management
2. `FilterPanel.js` - UI component
3. Update `app.js` - initialize both in correct order

### Panel Constraints
The top-right panel has limited space:
- Width: ~200-300px (from grid layout)
- Height: ~5rem (same as week header)
- Layout: Must be compact, use small text and tight spacing

### CSS Classes Used
All styling uses existing Tailwind classes:
- `bg-muted` - dropdown background
- `text-foreground` - dropdown text
- `border-border` - dropdown border
- `focus:border-primary` - focus state
- `text-xs`, `text-sm` - small text for compact layout
- `p-3`, `gap-3` - tight padding and spacing

### HTML Structure Update
Replace placeholder content in `#panel-top-right`:
```html
<!-- Before -->
<div id="panel-top-right" class="panel">
    <div class="panel-content">
        <h3 class="text-lg font-semibold mb-2">Match Filters</h3>
        <p class="text-muted-foreground">Filter controls will be here</p>
    </div>
</div>

<!-- After (rendered by FilterPanel) -->
<div id="panel-top-right" class="panel">
    <!-- FilterPanel.init() populates this -->
</div>
```

### Dependencies
- None (standalone slice)
- Will be consumed by: Slice 3.4 (Basic Comparison), Slice 3.5 (Overlap Visualization)

---

## 9. Definition of Done

- [ ] FilterService.js created with all methods
- [ ] FilterPanel.js created and renders correctly
- [ ] Panel fits within top-right grid constraints
- [ ] Both dropdowns show options 1-4
- [ ] Default values are both 1
- [ ] Changing dropdown updates FilterService
- [ ] FilterService dispatches 'filter-changed' events
- [ ] FilterService.getFilters() returns current values
- [ ] Page refresh resets to defaults
- [ ] No console errors
- [ ] Added to app.js initialization
- [ ] Follows revealing module pattern per CLAUDE.md
