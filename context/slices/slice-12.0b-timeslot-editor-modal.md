# Slice 12.0b: Timeslot Editor Modal

**Dependencies:** Slice 12.0a (filter engine working)
**User Story:** As a user, I want to open a modal from the Grid Tools drawer to toggle timeslots on/off, with game frequency trivia bars, so I can customize my calendar view and reclaim vertical space.

---

## Scope

Add "Edit Timeslots" button to Grid Tools drawer. Clicking it opens a modal with toggle switches for all 11 slots, frequency bars, and save/cancel. On save, dispatches `timeslots-changed` (which 12.0a already handles).

---

## Changes

### 1. GridActionButtons.js — Button + Modal

**File:** `public/js/components/GridActionButtons.js`

**Add button in `_render()`** — after the save/clear row (after line ~68), inside the `space-y-1.5` div:

```html
<div class="pt-1 border-t border-border mt-1">
    <button id="edit-timeslots-btn"
            class="w-full px-2 py-1 text-xs rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground">
        ⏱ Edit Timeslots
    </button>
</div>
```

**Wire in `_attachListeners()`:**
```js
const editTimeslotsBtn = document.getElementById('edit-timeslots-btn');
editTimeslotsBtn?.addEventListener('click', _showTimeslotsModal);
```

**Implement `_showTimeslotsModal()`:**

Game frequency data (hardcoded from our EU 4on4 analysis — 15,368 games, excluding US servers and LAN events):

```js
const GAME_FREQUENCY = {
    '1800': { count: 17, pct: 0.1 },
    '1830': { count: 18, pct: 0.2 },
    '1900': { count: 65, pct: 0.6 },
    '1930': { count: 242, pct: 2.1 },
    '2000': { count: 632, pct: 5.5 },
    '2030': { count: 1386, pct: 12.1 },
    '2100': { count: 1912, pct: 16.7 },
    '2130': { count: 2297, pct: 20.1 },
    '2200': { count: 2029, pct: 17.7 },
    '2230': { count: 1629, pct: 14.2 },
    '2300': { count: 1207, pct: 10.6 }
};
```

**Modal layout** — follow existing modal pattern (ProfileModal.js, template naming modal):

```
┌─────────────────────────────────────┐
│ Edit Timeslots            8/11 vis. │
├─────────────────────────────────────┤
│ Toggle timeslots to free up space.  │
│ Minimum 4 must remain visible.      │
│                                     │
│ [ON]  18:00  ░░░░░░░░░░░░░  0.1%   │
│ [ON]  18:30  ░░░░░░░░░░░░░  0.2%   │
│ [ON]  19:00  █░░░░░░░░░░░░  0.6%   │
│  ...                                │
│ [ON]  23:00  ███████████░░  10.6%   │
│                                     │
│ EU 4on4 game frequency (15k games)  │
│ Peak hours: 21:00–22:30             │
├─────────────────────────────────────┤
│                   [Cancel]  [Save]  │
└─────────────────────────────────────┘
```

Each toggle row:
- Hidden `<input type="checkbox">` with class `slot-checkbox` and `data-slot`
- Custom toggle div (styled via CSS, see below)
- Time label in monospace
- Frequency bar (div with percentage width, `bg-primary/50`)
- Percentage text

**Modal behavior:**
- `#timeslots-visible-count` updates on every checkbox change
- When exactly 4 remain checked, disable those 4 checkboxes (add `opacity-50`, set `disabled`)
- When a box is re-checked, recalculate and re-enable as needed
- **Save:** collect unchecked slots → `TimezoneService.setHiddenTimeSlots()` → dispatch `timeslots-changed` → `_persistHiddenTimeslots()` → close modal
- **Cancel / Escape / backdrop click:** close without changes
- Append modal to `document.body`, remove on close

**Implement `_persistHiddenTimeslots(hiddenSlots)`:**
```js
async function _persistHiddenTimeslots(hiddenSlots) {
    try {
        if (typeof AuthService !== 'undefined') {
            await AuthService.updateProfile({ hiddenTimeSlots: hiddenSlots });
        }
    } catch (error) {
        console.error('Failed to save timeslot preferences:', error);
        if (typeof ToastService !== 'undefined') {
            ToastService.showError('Failed to save timeslot preferences');
        }
    }
}
```

### 2. input.css — Toggle switch CSS

**File:** `src/css/input.css`

Tailwind `peer` classes won't work in JS-injected HTML (build scanner doesn't see them). Add custom CSS:

```css
/* Timeslot toggle switch */
.slot-toggle {
    position: relative;
    width: 2rem;
    height: 1rem;
    background-color: var(--muted);
    border-radius: 9999px;
    transition: background-color 150ms ease;
    cursor: pointer;
    flex-shrink: 0;
}

.slot-checkbox:checked + .slot-toggle {
    background-color: var(--primary);
}

.slot-toggle-knob {
    position: absolute;
    top: 0.0625rem;
    left: 0.0625rem;
    width: 0.875rem;
    height: 0.875rem;
    background: white;
    border-radius: 9999px;
    transition: transform 150ms ease;
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.slot-checkbox:checked + .slot-toggle .slot-toggle-knob {
    transform: translateX(1rem);
}

.slot-checkbox:disabled + .slot-toggle {
    opacity: 0.4;
    cursor: not-allowed;
}
```

The HTML pattern per row:
```html
<label class="flex items-center gap-3 py-1.5 cursor-pointer">
    <input type="checkbox" class="sr-only slot-checkbox" data-slot="1800" checked>
    <div class="slot-toggle"><div class="slot-toggle-knob"></div></div>
    <span class="text-sm font-mono w-12">18:00</span>
    <div class="flex-1 flex items-center gap-2">
        <div class="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
            <div class="h-full bg-primary/50 rounded-sm" style="width: 0.5%"></div>
        </div>
        <span class="text-xs text-muted-foreground w-10 text-right">0.1%</span>
    </div>
</label>
```

---

## Verification

1. Open app → expand Grid Tools drawer → "Edit Timeslots" button visible below templates
2. Click → modal opens, all 11 toggles ON, frequency bars display correctly
3. Toggle off 18:00, 18:30, 19:00 → count shows "8/11 visible"
4. Keep toggling off until 4 remain → remaining 4 toggles become disabled (can't go below 4)
5. Toggle one back on → disabled states recalculate correctly
6. Click Save → grids rebuild with fewer rows, top panel shrinks, bottom grows
7. Click Cancel (or Escape, or backdrop) → no changes applied
8. Frequency bars visually match the data (21:30 is tallest, 18:00 is basically invisible)
