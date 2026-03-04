# Slice 22.0: ComparisonModal Proposal Flow Redesign — Timeslots in VS Column

**Dependencies:** Slice 4.2 (ComparisonModal), Slice 8.0 (Match Proposals)
**User Story:** As a team leader proposing a match, I want to see all viable timeslots at a glance alongside both rosters so I can quickly toggle the ones I want without losing my place in a tiny scrolling list.
**Trigger:** The current proposal flow crams timeslots into a narrow stepper footer. Users lose scroll position on toggle, can't see all slots, and get disoriented by auto-selection of 4v4 slots.

**Success Criteria:**
- [ ] Stepper (3 steps) moves from footer to a compact bar between header and VS layout
- [ ] Timeslot list moves from stepper step 2 into the VS divider column (replacing "VS" text)
- [ ] Pill toggles replace checkboxes for slot selection (consistent with slice 21.0 toggle pattern)
- [ ] No scroll-jump on toggle — slot toggles update in-place without full modal re-render
- [ ] All viable slots visible without scrolling in typical cases (5-8 slots)
- [ ] Auto-select behavior removed — user explicitly picks slots
- [ ] "Propose (N) →" button at bottom of center column
- [ ] Team card logos/boxes slightly narrower to give center column ~8-10rem width
- [ ] Mobile responsive: center column stacks below team cards at ≤640px

---

## Design Decisions

| Decision | Answer | Rationale |
|----------|--------|-----------|
| Stepper placement | **Compact bar above VS layout** | Frees footer for just Close/Done. Step indicators stay visible without stealing body space |
| Timeslot placement | **VS divider column** | Natural vertical flow between both rosters. No separate scroll container. Users see rosters + times together |
| Slot controls | **Pill toggles (rounded-full)** | Matches slice 21.0 proposal card pattern. More tactile than checkboxes. Green=on, muted=off |
| Auto-select 4v4 | **Remove** | Users reported unwanted selections. Better UX: start empty, let user pick. Count badge on Propose button shows selection state |
| Scroll-jump fix | **Targeted DOM update** | Only update the toggled slot element + Propose button count. Never re-render full modal for slot toggles |
| Center column width | **~8-10rem (w-36 to w-40)** | Enough for: day header + time + pill + XvX count. Team cards shrink from `flex-1` to accommodate |
| Modal max-width | **Keep max-w-3xl** | Current 48rem is enough if team cards shrink slightly. Avoids layout shift for existing users |

---

## Visual Design

### Before (Current)
```
┌─────────────────────────────────────────┐
│ Match Details — Week 10            [X]  │
├─────────────────────────────────────────┤
│  ┌──────────┐   VS   ┌──────────┐      │
│  │  Team A   │        │  Team B   │     │
│  │  (wide)   │ (tiny) │  (wide)   │     │
│  └──────────┘        └──────────┘      │
├─────────────────────────────────────────┤
│ ①MatchType │ ②Timeslots(scroll) │ ③Sent│
│ [Off][Prac] │ ☑Tue 22:00 4v5   │  🎮  │
│             │ ☑Tue 22:30 4v5   │      │
│             │ (scroll for more) │      │
│             │ [Propose (4)→]    │      │
│ [Close]                                 │
└─────────────────────────────────────────┘
```

### After (Redesigned)
```
┌─────────────────────────────────────────────┐
│ Match Details — Week 10                [X]  │
├─────────────────────────────────────────────┤
│ ① [Off][Prac] ─── ② Select ─── ③ Sent 🎮  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌────────┐    TUESDAY       ┌────────┐    │
│  │ Team A │   22:00 ●  4v5   │ Team B │    │
│  │  logo  │   22:30 ●  4v5   │  logo  │    │
│  │  tag   │                   │  tag   │    │
│  │        │    WEDNESDAY      │        │    │
│  │ roster │   22:00 ○  4v3   │ roster │    │
│  │        │   22:30 ○  4v3   │        │    │
│  │        │                   │        │    │
│  │        │    THURSDAY       │        │    │
│  └────────┘   22:00 ○  4v4   └────────┘    │
│                                             │
│              [Propose (2) →]                │
├─────────────────────────────────────────────┤
│ [Close]                                     │
└─────────────────────────────────────────────┘

● = green pill (selected)    ○ = muted pill (unselected)
```

### Stepper Bar Detail (Compact)
```
Step 1 not done:     ① [Official] [Practice]  ─── ② ─── ③
Step 1 done:         ✓ Official  ─────────── ② Select ─── ③
Step 2 done:         ✓ Official  ─── ✓ Created ─── ③ Sent 🎮
```
- Horizontal, single line, ~2rem tall
- Step 1 shows game type buttons inline (no "Match Type" label needed)
- Step 2 label changes to "Select" (shorter)
- Step 3 shows discord icon inline

### Slot Row Detail
```
┌─────────────────────────┐
│  TUESDAY                │  ← day header (colored, uppercase, 0.65rem)
│  22:00  ●  4v5          │  ← time + pill toggle + roster count
│  22:30  ●  4v5          │
│                         │
│  WEDNESDAY              │
│  22:00  ○  4v3          │
│  22:30  ○  4v3          │
└─────────────────────────┘

Pill toggle: w-5 h-3 rounded-full
  ON:  bg-green-500, white dot slides right
  OFF: bg-muted, dot stays left
  Hover: slight brightness change
```

### Design Tokens

| Element | Size | Color/Style |
|---------|------|-------------|
| Center column | `w-36` (9rem) | No background, transparent |
| Day header | `text-[0.65rem]` | Day-specific color (existing `dayColors` map) |
| Time label | `text-xs font-medium` | `text-foreground` |
| Pill toggle | `w-5 h-3 rounded-full` | `bg-green-500` on / `bg-muted` off |
| Pill dot | `w-2.5 h-2.5 rounded-full` | `bg-white` |
| Roster count | `text-[0.65rem]` | `text-muted-foreground` |
| Propose button | `text-xs px-3 py-1 rounded` | `bg-primary text-primary-foreground` |
| Stepper bar | `px-4 py-2` | `border-b border-border bg-muted/10` |

---

## Full Stack Architecture

```
FRONTEND COMPONENTS (MODIFY):
- ComparisonModal.js
  - _renderModal(): Restructure HTML — add stepper bar, widen center column
  - _renderStepper(): Collapse to single-line compact bar
  - _renderSlotPicker(): NEW — renders slot list in VS column (extracted from stepper)
  - _attachListeners(): Fix slot toggle to update DOM in-place (no full re-render)
  - _computeViableForProposal(): Remove auto-select logic

FRONTEND SERVICES (NO CHANGES):
- ProposalService.js — computeViableSlots() and createProposal() unchanged
- TeamService.js — getTeamFromCache() unchanged

CSS (MODIFY):
- src/css/input.css
  - .vs-divider: Expand from narrow spacer to slot-list container
  - .cm-slot-*: Update for pill toggle layout
  - NEW: .cm-stepper-bar for compact stepper
  - NEW: .cm-pill-toggle for slot pill switches
  - .vs-team-card: Constrain max-width to give center room

BACKEND (NO CHANGES):
- No Cloud Function or Firestore changes needed
```

---

## Integration Code Examples

### 1. New Modal Structure (_renderModal body section)
```javascript
// Body: Stepper bar + VS layout with center slot picker
<div class="p-4 overflow-y-auto flex-1">
    <!-- Compact stepper bar -->
    <div class="cm-stepper-bar">
        ${_renderCompactStepper()}
    </div>

    <!-- VS Container with center slot column -->
    <div class="vs-container">
        ${_renderTeamCard(/* user team */)}

        <!-- Center: Slot picker (replaces VS divider) -->
        <div class="vs-divider-slots" id="cm-slot-column">
            ${canSchedule && _selectedGameType
                ? _renderSlotPicker()
                : '<span class="vs-text">VS</span>'}
        </div>

        ${_renderTeamCard(/* opponent team */)}
    </div>
</div>
```

### 2. Slot Picker in Center Column (_renderSlotPicker)
```javascript
function _renderSlotPicker() {
    const refDate = _getRefDate(_currentData?.weekId);
    if (_viableSlots.length === 0) {
        return `<div class="text-center">
            <span class="vs-text">VS</span>
            <div class="text-xs text-muted-foreground/60 mt-2">No 4v3+ slots</div>
        </div>`;
    }

    let lastDay = '';
    const rows = _viableSlots.map(slot => {
        const selected = _selectedSlots.has(slot.slotId);
        const display = TimezoneService.formatSlotForDisplay(slot.slotId, refDate);
        const dayName = display.dayLabel || '';

        let dayHeader = '';
        if (dayName !== lastDay) {
            const dayColor = dayColors[dayName] || 'text-muted-foreground';
            const mt = lastDay ? 'mt-2' : '';
            dayHeader = `<div class="cm-slot-day-header ${mt} ${dayColor}">${dayName}</div>`;
            lastDay = dayName;
        }

        return `${dayHeader}
            <div class="cm-slot-row" data-slot-id="${slot.slotId}">
                <span class="cm-slot-time">${display.timeLabel}</span>
                <button class="cm-pill-toggle ${selected ? 'active' : ''}"
                        data-slot-id="${slot.slotId}"
                        aria-pressed="${selected}">
                    <span class="cm-pill-dot"></span>
                </button>
                <span class="cm-slot-count">${slot.proposerCount}v${slot.opponentCount}</span>
            </div>`;
    }).join('');

    const selCount = _selectedSlots.size;
    return `
        <div class="cm-slot-picker" id="cm-slot-list">${rows}</div>
        <button id="propose-match-btn" class="cm-propose-btn mt-2
                ${selCount > 0 ? 'active' : ''}"
                ${selCount > 0 ? '' : 'disabled'}>
            ${selCount > 0 ? `Propose (${selCount}) →` : 'Select times'}
        </button>`;
}
```

### 3. In-Place Toggle (No Re-render) — THE KEY FIX
```javascript
// In _attachListeners(), replace full re-render with targeted update:
document.getElementById('cm-slot-column')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.cm-pill-toggle');
    if (!pill) return;

    const slotId = pill.dataset.slotId;
    const nowSelected = !_selectedSlots.has(slotId);

    if (nowSelected) {
        _selectedSlots.add(slotId);
    } else {
        _selectedSlots.delete(slotId);
    }

    // Toggle just this pill's visual state
    pill.classList.toggle('active', nowSelected);
    pill.setAttribute('aria-pressed', String(nowSelected));

    // Update just the Propose button text/state
    const proposeBtn = document.getElementById('propose-match-btn');
    if (proposeBtn) {
        const count = _selectedSlots.size;
        proposeBtn.disabled = count === 0;
        proposeBtn.classList.toggle('active', count > 0);
        proposeBtn.textContent = count > 0 ? `Propose (${count}) →` : 'Select times';
    }
});
```

### 4. Compact Stepper Bar
```javascript
function _renderCompactStepper() {
    const step1Done = !!_selectedGameType;
    const step2Done = _proposalStep >= 3;
    const step3Active = _proposalStep === 3;

    // Step 1: Game type buttons (always visible inline)
    const step1Html = step1Done
        ? `<span class="cm-step-badge ${_selectedGameType === 'official' ? 'text-green-400' : 'text-amber-400'}">
             ${checkSvg} ${_selectedGameType === 'official' ? 'Official' : 'Practice'}
           </span>`
        : `<div class="flex items-center gap-1.5">
             <button id="game-type-off" class="cm-type-btn ${_selectedGameType === 'official' ? 'official active' : 'official'}">Official</button>
             <button id="game-type-prac" class="cm-type-btn ${_selectedGameType === 'practice' ? 'practice active' : 'practice'}">Practice</button>
             ${_selectedGameType === 'practice' ? `
                 <button id="standin-toggle" class="cm-type-btn standin ${_withStandin ? 'active' : ''}">
                     ${_withStandin ? 'SI ✓' : 'SI'}
                 </button>` : ''}
           </div>`;

    // Step 2: Just a label
    const step2Html = step2Done
        ? `<span class="text-green-400 text-xs">${checkSvg} Created</span>`
        : `<span class="text-xs ${step1Done ? 'text-foreground' : 'text-muted-foreground/40'}">Select</span>`;

    // Step 3: Discord action
    const step3Html = step3Active
        ? _renderStep3Actions()  // DM Leader + Copy buttons
        : `<span class="text-muted-foreground/30">${discordIcon}</span>`;

    return `
        <div class="flex items-center gap-2 mb-3">
            ${circle(1, step1Done, !step1Done)}
            ${step1Html}
            ${line(step1Done)}
            ${circle(2, step2Done, step1Done && !step2Done)}
            ${step2Html}
            ${line(step2Done)}
            ${circle(3, false, step3Active)}
            ${step3Html}
        </div>`;
}
```

---

## CSS Changes (src/css/input.css)

### Modified Classes
```css
/* VS divider becomes slot column */
.vs-divider-slots {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 9rem;              /* was: auto/shrink */
    padding: 0.5rem 0;
    align-self: stretch;      /* was: center — now fills height */
}

/* Team cards: constrained to give center room */
.vs-team-card {
    flex: 1;
    min-width: 0;
    max-width: calc(50% - 5.5rem);  /* NEW: accounts for center column */
    /* rest unchanged */
}
```

### New Classes
```css
/* Compact stepper bar */
.cm-stepper-bar {
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
}

/* Slot picker container in center column */
.cm-slot-picker {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    width: 100%;
}

/* Slot row: time + pill + count */
.cm-slot-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.2rem 0;
    cursor: pointer;
}

/* Pill toggle switch */
.cm-pill-toggle {
    position: relative;
    width: 1.5rem;            /* w-6 */
    height: 0.875rem;         /* h-3.5 */
    border-radius: 9999px;
    background: var(--muted);
    border: none;
    cursor: pointer;
    transition: background-color 150ms ease;
    flex-shrink: 0;
}

.cm-pill-toggle.active {
    background: var(--color-green-500);
}

.cm-pill-toggle:hover {
    filter: brightness(1.15);
}

.cm-pill-dot {
    position: absolute;
    top: 50%;
    left: 2px;
    transform: translateY(-50%);
    width: 0.625rem;          /* w-2.5 */
    height: 0.625rem;
    border-radius: 9999px;
    background: white;
    transition: left 150ms ease;
}

.cm-pill-toggle.active .cm-pill-dot {
    left: calc(100% - 0.625rem - 2px);
}

/* Propose button in center column */
.cm-propose-btn {
    width: 100%;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius);
    font-size: 0.75rem;
    font-weight: 500;
    text-align: center;
    background: color-mix(in srgb, var(--muted) 30%, transparent);
    color: color-mix(in srgb, var(--muted-foreground) 40%, transparent);
    border: none;
    cursor: not-allowed;
    transition: all 150ms ease;
}

.cm-propose-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
    cursor: pointer;
}

.cm-propose-btn.active:hover {
    opacity: 0.85;
}

/* Game type buttons in compact stepper */
.cm-type-btn {
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--muted-foreground);
    background: transparent;
    cursor: pointer;
    transition: all 150ms ease;
}

.cm-type-btn.official.active {
    border-color: var(--color-green-500);
    color: var(--color-green-400);
    background: color-mix(in srgb, var(--color-green-500) 10%, transparent);
}

.cm-type-btn.practice.active {
    border-color: var(--color-amber-500);
    color: var(--color-amber-400);
    background: color-mix(in srgb, var(--color-amber-500) 10%, transparent);
}

.cm-type-btn.standin.active {
    border-color: var(--color-cyan-500);
    color: var(--color-cyan-400);
    background: color-mix(in srgb, var(--color-cyan-500) 10%, transparent);
}

/* Mobile: slot column goes below team cards */
@media (max-width: 640px) {
    .vs-divider-slots {
        width: 100%;
        flex-direction: column;
        order: 3;  /* After both team cards */
    }
}
```

---

## Performance Classification

| Path | Type | Approach |
|------|------|----------|
| Slot pill toggle | **HOT** | In-place DOM update. Toggle CSS class + update button text. Zero re-render |
| Game type select | Cold | Full re-render OK (triggers `_computeViableForProposal` + layout change) |
| Propose button click | Cold | Loading state → API call → re-render to step 3 |
| Modal open | Cold | Full render from scratch (current behavior, unchanged) |

---

## Data Flow

```
User clicks pill toggle
  → _selectedSlots.add/delete(slotId)      [in-memory Set]
  → Toggle .active class on pill element    [direct DOM]
  → Update Propose button text/disabled     [direct DOM]
  → NO re-render, NO Firebase call

User clicks "Propose (N) →"
  → ProposalService.createProposal()        [Cloud Function call]
  → _proposalStep = 3                       [state update]
  → _reRenderModal()                        [full re-render OK — one-time transition]
  → Step 3 shows Discord actions
```

---

## Testing Checklist

### Layout
- [ ] Stepper bar appears as compact single line above VS layout
- [ ] Center column shows "VS" text when no game type selected
- [ ] Center column shows slot list after game type selection
- [ ] Team cards are balanced width, logos not clipped
- [ ] All typical slot counts (5-8 slots) visible without scrolling
- [ ] Modal doesn't overflow viewport at 85vh

### Slot Toggles
- [ ] Pill toggles are green when on, muted when off
- [ ] Dot animates left↔right on toggle
- [ ] NO scroll position change when toggling
- [ ] Propose button count updates immediately
- [ ] Starting state: all slots unselected (no auto-select)

### Proposal Flow
- [ ] Official/Practice selection triggers slot list appearance
- [ ] Standin toggle appears only for Practice, updates slot counts
- [ ] "Propose (N) →" disabled when 0 selected
- [ ] Propose creates proposal and advances to step 3
- [ ] Step 3 shows Discord DM/Copy buttons
- [ ] Close/Done button works in all steps

### Mobile (≤640px)
- [ ] Team cards stack vertically
- [ ] Slot column appears below both teams
- [ ] All controls remain usable at small width

### Edge Cases
- [ ] 0 viable slots: shows "VS" + "No 4v3+ slots" message
- [ ] 1 viable slot: single row, no day header ambiguity
- [ ] 15+ viable slots: column scrolls gracefully within body scroll
- [ ] Switching opponent tab resets slot selection and re-computes

---

## Implementation Notes

1. **The scroll-jump fix is the highest-value change.** Even if everything else stays the same, switching from `_reRenderModal()` to targeted DOM updates on slot toggle eliminates the most frustrating bug.

2. **Keep _reRenderModal() for non-slot actions.** Game type changes, opponent tab switches, and step transitions still do a full re-render — that's fine since they change significant layout.

3. **The .vs-divider element becomes .vs-divider-slots.** Old `.vs-divider` CSS can be removed or kept for non-scheduler views (when `canSchedule` is false, we still show "VS" text).

4. **Auto-select removal is a behavior change.** Currently all 4v4 slots are pre-checked. New behavior: nothing pre-checked. This is intentional — user screenshots showed confusion about unwanted selections.

5. **Compact stepper re-render scope:** When game type is selected, only the stepper bar + center column need updating. Could optimize further but full re-render is fine for this infrequent action.

6. **The center column width (9rem) is a balance.** Narrower than that and time labels get cramped. Wider and team cards feel too small. Test with real data to calibrate.
