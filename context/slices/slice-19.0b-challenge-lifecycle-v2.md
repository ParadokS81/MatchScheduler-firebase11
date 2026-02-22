# Slice 19.0b: Challenge Lifecycle v2 — Atomic Proposal with 4v3 Gate

**Dependencies:** Slice 8.0 (Match Proposals), 3.4 (ComparisonEngine)
**Parent Design:** `context/DISCORD-BRIDGE-DESIGN.md`
**User Story:** As a team leader or scheduler, I want to select game type AND specific timeslots in one flow, so that my proposal is born with substance and the opponent receives a credible challenge with concrete times.
**Success Criteria:**
- [ ] "Propose" button disabled unless at least one 4v3+ overlap slot exists
- [ ] After selecting game type, a timeslot picker shows all viable 4v3+ slots for the week
- [ ] User must select at least 1 timeslot before proposal can be submitted
- [ ] Proposal is created with selected slots pre-confirmed on the proposer's side (atomic)
- [ ] The full viable set remains visible on the proposal — opponent can confirm any viable slot
- [ ] Desktop (ComparisonModal) and mobile (MobileCompareDetail) both updated
- [ ] Existing proposal viewing/confirming in MatchesPanel is unaffected

---

## Problem Statement

Currently, proposals are created as empty "open contracts" — no timeslots attached. The proposer must separately navigate to the Matches panel to confirm slots. This creates two problems:
1. Proposals with no confirmed slots lack urgency and credibility
2. The opponent sees a challenge with no concrete times proposed
3. There's no viability gate — a 1v1 overlap can generate a proposal that will never become a match

Additionally, the manual Discord notification (copy message → paste in DM) means opponents often don't know they've been challenged.

---

## Solution

Merge game type selection, timeslot selection, and proposal creation into one atomic flow. The 3-step stepper changes from:

```
BEFORE: [Game Type] → [Propose] → [Contact on Discord]
AFTER:  [Game Type] → [Select Timeslots + Propose] → [Done / Contact]
```

The 4v3 gate ensures only credible challenges are created. The `createProposal` Cloud Function is extended to accept pre-confirmed slots.

---

## 4v3 Gate Logic

### When to disable "Propose"

The gate is evaluated **per-opponent** in the comparison modal. When a user opens the modal for a slot:

1. Compute all viable slots for the week between these two teams using `ProposalService.computeViableSlots()`
2. Use a **fixed filter of `{ yourTeam: 4, opponent: 3 }`** — meaning: proposer needs 4 (or 3 + standin), opponent needs at least 3
3. If zero slots meet 4v3: disable the Propose button, show explanatory text
4. If 1+ slots meet 4v3: enable the flow

**Why 4v3 and not 4v4?** The proposer's team should be at full strength (4, or 3+standin). The opponent only needs 3 because they might have a 4th who hasn't filled in availability yet, or they can find a standin too. This matches the "challenger must be ready, opponent evaluates" philosophy.

**Standin interaction:** If the user enables the standin toggle (practice only), it adds +1 to their count (capped at 4). So a team with 3 available + standin = 4 effective. This means 3 real players + standin passes the 4v3 gate.

### UI when gate is not met

Show a muted message below the game type buttons:
```
"Need at least 4v3 overlap to propose (currently best: 3v2)"
```

This educates the user about why they can't propose and motivates them to get more teammates to fill in availability.

---

## Timeslot Selection UI

### Desktop (ComparisonModal)

Replace the current Step 2 ("Propose" single button) with a timeslot picker:

```
Step 2: Select Times & Propose
┌─────────────────────────────────────────────┐
│ Select times to propose (1+ required):      │
│                                              │
│ ☑ Sun 22:30  4v4  ← pre-checked if 4v4     │
│ ☑ Sun 23:00  4v4                            │
│ ☐ Mon 21:00  4v3                            │
│ ☐ Wed 20:00  4v3                            │
│                                              │
│ [Propose (2 times selected) →]              │
└─────────────────────────────────────────────┘
```

**Behavior:**
- List all viable slots (4v3+) for the week, sorted by player count desc, then day/time
- Each slot shows: day/time (in user's timezone) + player counts (e.g., "4v4", "4v3")
- Checkboxes for multi-select
- Auto-check all 4v4 slots (most viable), leave 4v3 unchecked as suggestions
- "Propose" button shows count of selected slots, disabled if 0 selected
- Clicking "Propose" creates the proposal with those slots pre-confirmed

**Stepper stays 3 steps but the meaning shifts:**
1. **Game Type** — Official/Practice + Standin (unchanged)
2. **Select Times & Propose** — timeslot picker + propose button (merged)
3. **Done** — confirmation + optional Discord contact (simplified)

### Mobile (MobileCompareDetail)

The mobile flow currently shows: `[Official] [Practice] [SI?] [Propose →]` in a single row.

**New mobile flow:**
```
[Official] [Practice] [SI?]
─────────────────────────────
Select times:
☑ Sun 22:30 (4v4)
☑ Sun 23:00 (4v4)
☐ Mon 21:00 (4v3)
[Propose (2) →]
```

After selecting game type, the timeslot list appears below the type buttons. Same logic as desktop — auto-check 4v4, user can toggle, propose when 1+ selected.

---

## Cloud Function Changes

### Modified: `createProposal` (in `functions/match-proposals.js`)

**New parameter:** `confirmedSlots` — array of slot IDs the proposer is pre-confirming.

```javascript
const { proposerTeamId, opponentTeamId, weekId, minFilter, gameType, proposerStandin,
        confirmedSlots } = data;  // NEW: confirmedSlots

// Validate confirmedSlots
if (!Array.isArray(confirmedSlots) || confirmedSlots.length === 0) {
    throw new functions.https.HttpsError('invalid-argument',
        'At least one confirmed slot is required');
}
if (confirmedSlots.length > 14) {
    throw new functions.https.HttpsError('invalid-argument',
        'Too many confirmed slots');
}
for (const slotId of confirmedSlots) {
    if (!isValidSlotId(slotId)) {
        throw new functions.https.HttpsError('invalid-argument',
            `Invalid slot ID: ${slotId}`);
    }
}
```

**Build `proposerConfirmedSlots` at creation time:**

After reading availability docs (same pattern as `confirmSlot`), populate the confirmed slots:

```javascript
// Read proposer availability to get countAtConfirm for each slot
const proposerAvailDocId = `${proposerTeamId}_${weekId}`;
const proposerAvailDoc = await db.collection('availability').doc(proposerAvailDocId).get();
const proposerAvail = proposerAvailDoc.exists ? proposerAvailDoc.data() : { slots: {} };

// Build proposerConfirmedSlots from the provided slot list
const proposerConfirmedSlots = {};
for (const slotId of confirmedSlots) {
    const countAtConfirm = (proposerAvail.slots?.[slotId] || []).length;
    proposerConfirmedSlots[slotId] = {
        userId,
        countAtConfirm,
        gameType
    };
}

// Replace empty object with pre-populated one
const proposalData = {
    // ... existing fields ...
    proposerConfirmedSlots,  // Was: {}
    opponentConfirmedSlots: {},
    // ... rest unchanged ...
};
```

**Backward compatibility:** If `confirmedSlots` is not provided (old clients), fall back to empty `proposerConfirmedSlots: {}`. This ensures any cached old frontend doesn't break.

---

## Frontend Changes

### ComparisonModal.js

**State additions:**
```javascript
let _viableSlots = [];          // All 4v3+ viable slots for the week
let _selectedSlots = new Set(); // Slot IDs the user has checked
```

**Modified `_renderStepper()`:**

Step 2 changes from a single "Propose" button to a timeslot picker with checkboxes + propose button.

Key rendering logic:
```javascript
// Compute viable slots when game type is selected
function _computeViableForProposal() {
    const selectedMatch = _currentData.matches[_selectedOpponentIndex];
    const standinSettings = _selectedGameType === 'practice' && _withStandin
        ? { proposerStandin: true, opponentStandin: false }
        : undefined;

    // Fixed 4v3 gate filter
    const gateFilter = { yourTeam: 4, opponent: 3 };

    _viableSlots = ProposalService.computeViableSlots(
        _currentData.userTeamInfo.teamId,
        selectedMatch.teamId,
        _currentData.weekId,
        gateFilter,
        standinSettings
    );

    // Auto-select all 4v4 slots
    _selectedSlots = new Set();
    for (const slot of _viableSlots) {
        const effectiveProposer = slot.proposerCount + (slot.proposerStandin ? 1 : 0);
        const effectiveOpponent = slot.opponentCount + (slot.opponentStandin ? 1 : 0);
        if (effectiveProposer >= 4 && effectiveOpponent >= 4) {
            _selectedSlots.add(slot.slotId);
        }
    }
}
```

**Modified propose handler:**

Pass `confirmedSlots` to the Cloud Function:
```javascript
const result = await ProposalService.createProposal({
    proposerTeamId: _currentData.userTeamInfo.teamId,
    opponentTeamId: selectedMatch.teamId,
    weekId: _currentData.weekId,
    minFilter: { yourTeam: 4, opponent: 4 },  // Proposal filter stays 4v4
    gameType: _selectedGameType,
    proposerStandin: _selectedGameType === 'practice' && _withStandin,
    confirmedSlots: [..._selectedSlots]  // NEW
});
```

**Note on `minFilter` vs gate filter:**
- The **gate filter** (4v3) determines what slots appear in the picker (which slots are viable enough to propose)
- The **proposal's `minFilter`** (4v4) determines what slots appear in the proposal's viable list after creation (the living document filter)
- These are different! The gate is about "should you be allowed to propose at all?" The proposal filter is about "what slots are shown to both teams going forward"

### Step 3 simplification

After proposal creation, Step 3 changes from "Contact on Discord" (the primary action) to "Done" with an optional Discord contact as secondary:

```
Step 3: Done
✓ Proposal created with 2 timeslots
Opponent will be notified automatically.

[DM their leader on Discord]  (optional, secondary)
[Done]
```

The "opponent will be notified automatically" text is forward-looking — it'll be true once the quad scheduler module is built (slice 19.0c + quad work). For now it can say "Proposal created! Share it with your opponent." and keep the existing Discord contact buttons.

### MobileCompareDetail.js

**Modified `_renderProposalRow()` → `_renderProposalSection()`:**

Instead of a single row, render a section with game type buttons + timeslot list + propose button:

```javascript
function _renderProposalSection(index) {
    const gameType = _gameTypes[index] || null;
    const withStandin = _standins[index] || false;
    const selectedSlots = _selectedSlotsByIndex[index] || new Set();

    let html = '<div class="mcd-proposal-section">';

    // Game type row (unchanged)
    html += '<div class="mcd-proposal-row">';
    html += `<button ...>Official</button>`;
    html += `<button ...>Practice</button>`;
    if (gameType === 'practice') html += `<button ...>SI</button>`;
    html += '</div>';

    // Timeslot list (new — only shown when game type selected)
    if (gameType) {
        const viableSlots = _computeViableSlotsForIndex(index);

        if (viableSlots.length === 0) {
            html += '<div class="mcd-no-slots">Need 4v3+ overlap to propose</div>';
        } else {
            html += '<div class="mcd-slot-list">';
            viableSlots.forEach(slot => {
                const checked = selectedSlots.has(slot.slotId);
                const display = _formatSlot(slot.slotId);
                html += `
                    <label class="mcd-slot-item" data-action="toggle-slot"
                           data-index="${index}" data-slot-id="${slot.slotId}">
                        <span class="mcd-slot-check">${checked ? '☑' : '☐'}</span>
                        <span class="mcd-slot-time">${display.day} ${display.time}</span>
                        <span class="mcd-slot-count">(${slot.proposerCount}v${slot.opponentCount})</span>
                    </label>`;
            });
            html += '</div>';

            // Propose button
            const count = selectedSlots.size;
            html += `<button class="mcd-propose-btn ${count > 0 ? '' : 'mcd-disabled'}"
                             data-action="propose-match" data-index="${index}"
                             ${count > 0 ? '' : 'disabled'}>
                        Propose${count > 0 ? ` (${count})` : ''} →
                     </button>`;
        }
    }

    html += '</div>';
    return html;
}
```

**New state:**
```javascript
let _selectedSlotsByIndex = {};  // index → Set of slotIds
```

**New action handler:** `toggle-slot` — toggles a slot ID in the set for that opponent index.

**Modified `propose-match` handler:** Include `confirmedSlots` in the createProposal call.

---

## ProposalService.js Changes

**Modified `createProposal()`:**

Pass through the `confirmedSlots` parameter:
```javascript
async function createProposal(params) {
    return callCloudFunction('createProposal', {
        proposerTeamId: params.proposerTeamId,
        opponentTeamId: params.opponentTeamId,
        weekId: params.weekId,
        minFilter: params.minFilter,
        gameType: params.gameType,
        proposerStandin: params.proposerStandin,
        confirmedSlots: params.confirmedSlots || []  // NEW
    });
}
```

---

## What This Slice Does NOT Include

- Bot notification on proposal creation (that's slice 19.0c)
- Changes to the MatchesPanel proposal cards (they already show confirmed slots)
- Changes to `confirmSlot` Cloud Function (works as-is for additional confirmations)
- Changes to `ComparisonEngine` comparison logic
- Per-slot game type selection (the game type applies to the whole proposal)

---

## Edge Cases

1. **All viable slots are 4v3 (none at 4v4):** No auto-check, user must manually select at least 1
2. **Availability changes between modal open and propose click:** The `createProposal` Cloud Function reads live availability for `countAtConfirm` — the pre-confirmed count reflects the real state at creation time
3. **Opponent has `hideRosterNames: true`:** Slot list still shows player counts (4v3) but not names. This is already how it works.
4. **User opens modal from a specific slot but wants to propose different times:** The timeslot picker shows ALL viable slots for the week, not just the one clicked. The modal entry point determines which opponent is shown, not which slot is locked.
5. **Standin toggle changes viable set:** When standin is toggled, `_computeViableForProposal()` re-runs, updating the slot list and auto-checks.

---

## Testing Checklist

1. Open comparison modal on a slot with 4v4 overlap → game type buttons enabled, timeslot list shows after selection
2. Open comparison modal on a slot with only 2v2 overlap → "Need 4v3+ overlap" message, propose disabled
3. Open comparison modal with 3v3 overlap + standin toggle → toggling standin enables/disables propose (3+1=4 vs 3)
4. Select Official → see slot list → check 2 slots → click Propose → proposal created with 2 pre-confirmed slots
5. Verify proposal in Matches panel shows the 2 slots as already confirmed by proposer
6. Verify opponent can still see and confirm any viable slot (not just the 2 proposed)
7. Mobile: same flow works in MobileCompareDetail bottom sheet
8. Close modal after proposal → navigates to proposal deep link (existing behavior)
9. Old proposal cards in Matches panel still work (backward compat)
10. Proposal with 0 slots selected → Propose button disabled
