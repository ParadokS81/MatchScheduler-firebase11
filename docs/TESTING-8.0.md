# Slice 8.0 Manual Testing Walkthrough

## Environment

| Service | URL |
|---------|-----|
| App | http://localhost:5000 |
| Firestore UI | http://localhost:4000/firestore |

**Default user**: ParadokS (`dev-user-001`), leader of Dev Squad
**Team switching**: Red DEV button, bottom-left corner

---

## Test 1: Scheduler Delegation

**User: ParadokS (Dev Squad leader)**

1. Open Team Management for Dev Squad
2. Find "Scheduling Permissions" section
3. Toggle ON for **Alex Storm**
   - [ ] Toggle activates, toast confirms
   - [ ] Firestore: `teams/team-dev-001` has `schedulers: ["fake-user-001"]`
4. Toggle OFF, then back ON (leave Alex as scheduler)

---

## Test 2: Propose Match

**User: ParadokS (Dev Squad leader)**

1. Calendar tab -> select opponent (Phoenix Rising) -> ComparisonModal opens
2. [ ] "Propose Match" button visible in footer
3. Click "Propose Match"
   - [ ] Button shows "Creating..."
   - [ ] Toast: "Proposal created! Message copied to clipboard"
   - [ ] Modal closes
   - [ ] Paste clipboard somewhere - Discord template present
4. Firestore checks:
   - [ ] `matchProposals/` new doc: `proposerTeamId: "team-dev-001"`, `status: "active"`
   - [ ] `eventLog/` has `PROPOSAL_CREATED`

---

## Test 3: Matches Tab

1. Click **Matches** tab in center panel
   - [ ] Tab switches, panel loads
2. [ ] Proposal card visible under "Active Proposals"
   - Shows opponent name + slot count + week

---

## Test 4: Expand Card

1. Click card to expand
   - [ ] Slot list appears with day/time + "X vs Y" counts
   - [ ] "Confirm" buttons on each slot
   - [ ] "Cancel" and "Load Grid View" at bottom
   - [ ] No past timeslots shown
2. Click to collapse
   - [ ] Card collapses back to summary

---

## Test 5: Confirm Slot (Proposer)

**User: ParadokS**

1. Expand card, click "Confirm" on a slot
   - [ ] Button shows "..."
   - [ ] Toast: "Slot confirmed - waiting for opponent"
   - [ ] Button becomes "Withdraw"
   - [ ] Checkmark appears on slot
2. Confirm a second slot too
   - [ ] Both show checkmarks
3. Firestore: `proposerConfirmedSlots` has entries with `userId` + `countAtConfirm`

---

## Test 6: Opponent Confirms -> Match Scheduled

**Switch to: Marcus Chen (Phoenix Rising leader) via DevToolbar**

1. [ ] DevToolbar switch works, app reloads
2. Matches tab -> proposal card visible
3. Expand card
   - [ ] Slots show "them" on ParadokS-confirmed slots
4. Click "Confirm" on **same slot** ParadokS confirmed
   - [ ] Toast: "Match scheduled! Both teams confirmed."
   - [ ] Card moves to Upcoming section
5. Firestore:
   - [ ] `matchProposals/{id}`: `status: "confirmed"`, `confirmedSlotId` set
   - [ ] `scheduledMatches/` new doc with `blockedSlot` + `blockedTeams`
   - [ ] `eventLog/` has `MATCH_SCHEDULED`

---

## Test 7: Withdraw Confirmation

**On any active proposal with a confirmed slot:**

1. Click "Withdraw" on confirmed slot
   - [ ] Button shows "..."
   - [ ] Toast: "Confirmation withdrawn"
   - [ ] Button returns to "Confirm"
2. Firestore: slot entry removed from confirmed slots map

---

## Test 8: Cancel Proposal

1. Create a new proposal (or use existing active one)
2. Expand, click "Cancel"
   - [ ] Button shows "Cancelling..."
   - [ ] Toast: "Proposal cancelled"
   - [ ] Card disappears from Active (moves to Archived)
3. Firestore: `status: "cancelled"`, `cancelledBy` set

---

## Test 9: Permission Checks

**Switch to: Bella Knight (`fake-user-002`) - regular member**

1. Open ComparisonModal with opponent
   - [ ] "Propose Match" button **NOT** visible
2. Matches tab, expand proposal
   - [ ] No Confirm/Withdraw/Cancel buttons

**Switch to: Alex Storm (`fake-user-001`) - scheduler**

3. Open ComparisonModal
   - [ ] "Propose Match" button **IS** visible
4. Matches tab, expand proposal
   - [ ] Confirm and Cancel buttons **ARE** visible

---

## Test 10: Edge Cases

**Rapid clicking:**
- [ ] Click Confirm multiple times fast -> only one call, no duplicates

**Load Grid View:**
- [ ] Click button -> switches to Calendar tab with correct comparison

**Blocked slots:**
- [ ] After scheduling a match, new proposal for same teams+week excludes that slot

**Duplicate proposal:**
- [ ] Creating same team pair + week again -> error toast

---

## Issues Log

```
ISSUE 1:
- Steps:
- Expected:
- Actual:
- Priority: Critical / Important / Minor

ISSUE 2:
- Steps:
- Expected:
- Actual:
- Priority:
```
