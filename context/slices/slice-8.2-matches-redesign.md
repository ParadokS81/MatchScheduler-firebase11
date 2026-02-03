# Slice 8.2: Matches Page Redesign + Cancel Scheduled Match

**Dependencies:** Slice 8.0 (Match Proposals), Slice 8.1 (Upcoming Matches Panel)
**User Story:** As a team leader or scheduler, I can cancel a confirmed match (reverting the proposal to active), and I can view all my proposals organized by week in a column layout so I can manage scheduling across multiple weeks at a glance.
**Success Criteria:**
- [ ] Leader/scheduler can cancel a confirmed scheduled match from the matches page
- [ ] Cancelled match frees the blocked slot; parent proposal reverts to 'active' status
- [ ] Matches page uses a column layout: 3 weekly columns (current, +1, +2) + upcoming matches column
- [ ] Active proposals are grouped into their respective week column
- [ ] Upcoming matches show in compact format: `[Logo] Team vs Team [Logo]` + `Feb.12 Thu 22:00 (Div 1)`
- [ ] Archived proposals remain accessible in a collapsed section at bottom
- [ ] Cancel button on upcoming matches visible only to leaders/schedulers of involved teams

---

## Design Decisions Log

| Decision | Answer | Rationale |
|----------|--------|-----------|
| Cancel match effect on proposal | Revert proposal to 'active', clear confirmedSlotId/scheduledMatchId | User wants to pick a different slot, not start over |
| Who can cancel a match | Leader or scheduler of either team | Same auth pattern as cancelProposal |
| Upcoming match card style | No border/card wrapper, compact rows | Density — not many matches, avoid excess padding |
| Weekly columns count | 3 (current week, +1, +2) | Teams rarely schedule >2 weeks ahead |
| Proposal scope | My teams only | Current behavior, no community proposals |
| Archived section | Kept, collapsed at bottom | User requested |
| Team logos in match display | Use `activeLogo.urls.small` (48px) | Compact format needs small logos |
| Division display | Show from team data `divisions[]` | Context for match importance |

---

## Sub-slice Breakdown

### Slice 8.2a: Cancel Scheduled Match (Backend)
- New `cancelScheduledMatch` Cloud Function in `functions/match-proposals.js`
- Validates user is leader/scheduler of either team (live-check)
- Updates scheduledMatch status to `cancelled`, sets `cancelledBy`
- Reverts parent proposal: status → `active`, clears `confirmedSlotId` and `scheduledMatchId`
- Clears both teams' confirmed slots for that slot on the proposal
- Event log: `MATCH_CANCELLED`
- Add `cancelScheduledMatch` to ProposalService frontend wrapper

### Slice 8.2b: Matches Page Column Layout
- Redesign MatchesPanel from single-column to multi-column layout
- 3 weekly columns with headers: `W06 · Feb 9-15`, `W07 · Feb 16-22`, `W08 · Feb 23-Mar 1`
- Active proposals sorted into columns by their `weekId`
- Right-side column: confirmed upcoming matches (compact format from 8.2c)
- Archived section collapsed at bottom spanning full width
- Responsive: columns stack or scroll on narrow viewports

### Slice 8.2c: Compact Upcoming Match Display + Cancel Button
- Upcoming matches rendered as compact rows (no card border):
  - `[Logo] TeamName vs TeamName [Logo]`
  - `Feb.12 Thu 22:00 (Div 1)`
- Cancel button (small, text-only) for leaders/schedulers
- Cancel triggers `cancelScheduledMatch` from 8.2a with confirmation prompt
- Loading state during cancel operation

---

## Schema Changes

### ScheduledMatch Document — New Fields

```typescript
// Add to existing /scheduledMatches/{matchId}
interface ScheduledMatchAdditions {
  cancelledBy?: string;           // userId who cancelled (set when status → 'cancelled')
  cancelledAt?: Timestamp;        // When cancelled
}
```

No new collections. No security rule changes needed (writes already Cloud Functions only).

---

## Full Stack Architecture

### FRONTEND COMPONENTS

**MatchesPanel** (MODIFY: `public/js/components/MatchesPanel.js`)
- Firebase listeners: Same proposal + scheduledMatch listeners (unchanged)
- Cache interactions: reads ProposalService cache, ScheduledMatchService cache, TeamService cache (for logos)
- UI responsibilities:
  - Render 4-column layout: 3 week columns + upcoming matches column
  - Group active proposals by weekId into week columns
  - Render upcoming matches in right column using compact format
  - Render archived section at bottom (collapsed)
- User actions:
  - Expand/collapse proposal cards (existing)
  - Confirm/withdraw slots (existing)
  - Cancel proposal (existing)
  - **NEW:** Cancel scheduled match (calls cancelScheduledMatch)
  - Toggle archived section visibility

**UpcomingMatchesPanel** (MODIFY: `public/js/components/UpcomingMatchesPanel.js`)
- Update match card rendering to use new compact format (logo + team vs team)
- No cancel button here (cancel only from main matches page)

### FRONTEND SERVICES

**ProposalService** (MODIFY: `public/js/services/ProposalService.js`)
- Add method: `cancelScheduledMatch(matchId)` → calls Cloud Function

**ScheduledMatchService** (MODIFY: `public/js/services/ScheduledMatchService.js`)
- Add method: `getMatchById(matchId)` → from cache
- Existing `removeFromCache` / `updateCache` handles listener updates

### BACKEND REQUIREMENTS

⚠️ CLOUD FUNCTION TO IMPLEMENT IN `/functions/match-proposals.js`:

```
cancelScheduledMatch(data: { matchId: string }):
  - File: /functions/match-proposals.js
  - Purpose: Cancel a confirmed scheduled match and revert proposal
  - Validation:
    - User authenticated
    - Match exists with status 'upcoming'
    - User is leader/scheduler of teamA OR teamB (live-check both team docs)
  - Operations (transaction):
    1. Read scheduledMatch doc
    2. Read both team docs (live auth check)
    3. Read parent proposal doc (via match.proposalId)
    4. Update scheduledMatch: { status: 'cancelled', cancelledBy: userId, cancelledAt: serverTimestamp }
    5. Update proposal: { status: 'active', confirmedSlotId: null, scheduledMatchId: null, updatedAt: serverTimestamp }
    6. Clear the confirmed slot from both proposerConfirmedSlots and opponentConfirmedSlots for the cancelled slotId
    7. Write eventLog: MATCH_CANCELLED
  - Returns: { success: true } or { success: false, error: "message" }
```

**Function Exports Required:**
```javascript
// In /functions/index.js add:
exports.cancelScheduledMatch = cancelScheduledMatch;
```

**Event Logging:**
```javascript
{
  type: 'MATCH_CANCELLED',
  category: 'match',
  teamId: matchData.teamAId,  // Primary team
  details: {
    matchId: matchId,
    proposalId: matchData.proposalId,
    teamAId: matchData.teamAId,
    teamAName: matchData.teamAName,
    teamBId: matchData.teamBId,
    teamBName: matchData.teamBName,
    slotId: matchData.slotId,
    weekId: matchData.weekId,
    cancelledBy: userId
  },
  performedBy: userId,
  timestamp: serverTimestamp
}
```

### INTEGRATION POINTS

- Frontend → Backend: `ProposalService.cancelScheduledMatch(matchId)` → Cloud Function `cancelScheduledMatch`
- API Contract:
  - Request: `{ matchId: string }`
  - Success: `{ success: true }`
  - Error: `{ success: false, error: "Not authorized" | "Match not found" | "Match already cancelled" }`
- Real-time listeners: Existing `onSnapshot` on scheduledMatches collection (status='upcoming') will automatically remove cancelled matches from UI. Proposal listener will pick up the reverted proposal and show it back in active proposals.

---

## Integration Code Examples

### Cancel Scheduled Match — Full Flow

```javascript
// 1. MatchesPanel: Cancel button click handler
async function _handleCancelMatch(matchId) {
    const confirmed = confirm('Cancel this scheduled match? The proposal will revert to active so you can pick a different slot.');
    if (!confirmed) return;

    const btn = document.querySelector(`[data-cancel-match="${matchId}"]`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Cancelling...';
    }

    try {
        const result = await ProposalService.cancelScheduledMatch(matchId);
        if (result.success) {
            ToastService.showSuccess('Match cancelled. Proposal is active again.');
            // UI updates via listeners — match disappears from upcoming, proposal reappears in active
        } else {
            ToastService.showError(result.error || 'Failed to cancel match');
        }
    } catch (error) {
        console.error('Cancel match failed:', error);
        ToastService.showError('Network error — please try again');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Cancel';
        }
    }
}

// 2. ProposalService: Cloud Function wrapper
async cancelScheduledMatch(matchId) {
    return callCloudFunction('cancelScheduledMatch', { matchId });
}

// 3. Cloud Function: cancelScheduledMatch (in match-proposals.js)
// Follows exact pattern of cancelProposal but for scheduled matches
// Transaction: read match + teams + proposal → validate auth → update match + proposal + eventLog

// 4. Real-time update flow (already in place):
// onSnapshot(scheduledMatches where status='upcoming') → match removed from UI
// onSnapshot(matchProposals where proposerTeamId/opponentTeamId) → proposal reappears as active
```

### Compact Upcoming Match Rendering

```javascript
// Renders a single upcoming match row (no card border)
function _renderUpcomingMatchCompact(match) {
    const teamA = TeamService.getTeam(match.teamAId);
    const teamB = TeamService.getTeam(match.teamBId);
    const logoA = teamA?.activeLogo?.urls?.small || '';
    const logoB = teamB?.activeLogo?.urls?.small || '';
    const display = TimezoneService.formatSlotForDisplay(match.slotId);

    // Get division from either team
    const div = teamA?.divisions?.[0] || teamB?.divisions?.[0] || '';

    // Format date: "Feb.12"
    const date = new Date(match.scheduledDate);
    const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const canCancel = _canUserCancelMatch(match);

    return `
        <div class="flex items-center gap-2 py-1.5 group">
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
                ${logoA ? `<img src="${logoA}" class="w-5 h-5 rounded-sm object-cover" alt="">` : '<div class="w-5 h-5"></div>'}
                <span class="text-sm truncate">${match.teamAName} vs ${match.teamBName}</span>
                ${logoB ? `<img src="${logoB}" class="w-5 h-5 rounded-sm object-cover" alt="">` : '<div class="w-5 h-5"></div>'}
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs text-muted-foreground">${monthDay} ${display.fullLabel}</span>
                ${div ? `<span class="text-xs text-muted-foreground/60">${div}</span>` : ''}
                ${canCancel ? `
                    <button class="text-xs text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            data-action="cancel-match" data-match-id="${match.id}">
                        Cancel
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}
```

### Column Layout Structure

```javascript
function _renderColumnLayout(proposals, scheduledMatches) {
    const currentWeekId = DateUtils.getCurrentWeekId(); // e.g., "2026-06"
    const weeks = _getThreeWeeks(currentWeekId);        // [W06, W07, W08]

    // Group active proposals by weekId
    const byWeek = {};
    weeks.forEach(w => byWeek[w.weekId] = []);

    const active = proposals.filter(p => p.status === 'active');
    const archived = proposals.filter(p => p.status === 'cancelled' || p.status === 'expired');

    for (const p of active) {
        if (byWeek[p.weekId]) {
            byWeek[p.weekId].push(p);
        }
        // Proposals for weeks outside the 3-column range go into overflow or are hidden
    }

    return `
        <div class="matches-panel h-full flex flex-col">
            <div class="flex-1 flex gap-3 p-3 overflow-hidden">
                ${weeks.map(w => `
                    <div class="flex-1 min-w-0 flex flex-col">
                        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            W${w.weekNumber} · ${w.dateRange}
                        </h3>
                        <div class="flex-1 overflow-y-auto space-y-2">
                            ${byWeek[w.weekId].length > 0
                                ? byWeek[w.weekId].map(p => _renderProposalCard(p, 'active')).join('')
                                : '<p class="text-xs text-muted-foreground/50 italic">No proposals</p>'}
                        </div>
                    </div>
                `).join('')}

                <div class="w-56 shrink-0 flex flex-col border-l border-border pl-3">
                    <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Upcoming Matches
                    </h3>
                    <div class="flex-1 overflow-y-auto">
                        ${scheduledMatches.length > 0
                            ? scheduledMatches.map(m => _renderUpcomingMatchCompact(m)).join('')
                            : '<p class="text-xs text-muted-foreground/50 italic">No scheduled matches</p>'}
                    </div>
                </div>
            </div>

            ${archived.length > 0 ? _renderArchivedSection(archived) : ''}
        </div>
    `;
}
```

---

## Performance Classification

```
HOT PATHS (<50ms):
- Expand/collapse proposal card: Cache read + local DOM toggle (instant)
- Toggle archived section: DOM visibility toggle (instant)

COLD PATHS (<2s):
- Cancel scheduled match: Cloud Function call, show "Cancelling..." state
- Initial load: Firestore queries for proposals + scheduled matches
- Availability load on expand: Firestore reads (lazy, per-card)

BACKEND PERFORMANCE:
- cancelScheduledMatch: Single transaction (read match + 2 teams + proposal, write 3 docs)
- No new indexes required (existing queries unchanged)
- Cloud Function cold start: ~1s (acceptable for cancel action)
```

---

## Data Flow Diagrams

### Cancel Scheduled Match
```
Click "Cancel" on match → confirm() dialog → _handleCancelMatch(matchId)
→ ProposalService.cancelScheduledMatch(matchId) → Cloud Function cancelScheduledMatch()
→ Transaction:
    Read: scheduledMatch, teamA, teamB, proposal
    Validate: user is leader/scheduler of teamA or teamB
    Write: scheduledMatch.status='cancelled' + proposal.status='active' + eventLog
→ Firestore triggers two onSnapshot listeners:
    1. scheduledMatches listener → match removed from upcoming column
    2. matchProposals listener → proposal reappears in week column as active
→ _renderAll() → UI updates automatically
```

### Page Load
```
MatchesPanel.init() → _getUserTeamIds() → _setupProposalListeners() + _setupScheduledMatchListeners()
→ onSnapshot fires with initial data → ProposalService.updateCache() + ScheduledMatchService.updateCache()
→ _renderAll() → _renderColumnLayout(proposals, scheduledMatches)
→ Group proposals by weekId into 3 columns
→ Render upcoming matches in right column
→ Render archived at bottom (collapsed)
```

---

## Test Scenarios

```
FRONTEND TESTS:
- [ ] Proposals are grouped into correct week columns
- [ ] Week columns show correct headers (W06 · Feb 9-15)
- [ ] Empty week columns show "No proposals" placeholder
- [ ] Upcoming matches show team logos, names, date, time, division
- [ ] Cancel button only visible to leaders/schedulers of involved teams
- [ ] Cancel button hidden for non-authorized users
- [ ] Archived section is collapsed by default
- [ ] Archived section expands on click

BACKEND TESTS:
- [ ] cancelScheduledMatch succeeds for leader of teamA
- [ ] cancelScheduledMatch succeeds for scheduler of teamB
- [ ] cancelScheduledMatch rejects non-authorized users
- [ ] cancelScheduledMatch rejects already-cancelled matches
- [ ] cancelScheduledMatch rejects matches with status != 'upcoming'
- [ ] Proposal reverts to 'active' with confirmedSlotId cleared
- [ ] Both teams' confirmedSlots for cancelled slotId are cleared
- [ ] Event log created with correct MATCH_CANCELLED details
- [ ] scheduledMatch gets cancelledBy and cancelledAt fields set

INTEGRATION TESTS:
- [ ] Cancel match → match disappears from upcoming column
- [ ] Cancel match → proposal reappears in correct week column as active
- [ ] Cancel match → slot is no longer blocked for other proposals
- [ ] Cancel match → other proposals' viable slots recalculate (blocked slot freed)
- [ ] Error from Cloud Function → toast shows error message
- [ ] Network failure → toast shows network error
- [ ] Button re-enabled after error

END-TO-END TESTS:
- [ ] Full flow: cancel match → proposal active → confirm different slot → new match scheduled
- [ ] Cancel match as teamA leader, then teamB leader confirms different slot
- [ ] Real-time: cancel match on one tab → other tab updates automatically
- [ ] Performance: column layout renders within 100ms after data load
```

---

## Common Integration Pitfalls

- [ ] **Forgetting to clear confirmedSlots on proposal revert** — Must delete the specific slotId from both `proposerConfirmedSlots` and `opponentConfirmedSlots`, not just clear `confirmedSlotId`
- [ ] **Not handling the case where proposal was cancelled between match creation and cancel** — Validate proposal exists and isn't already cancelled
- [ ] **Missing loading state on cancel button** — User clicks cancel, nothing happens visually, clicks again = duplicate call
- [ ] **Not checking blocked slots after cancel** — Other proposals should automatically recalculate viable slots (they already do via live computation from ScheduledMatchService cache)
- [ ] **Week ID calculation mismatch** — Must use same ISO week calculation as existing code (DateUtils or getMondayOfWeek helper)
- [ ] **TeamService cache miss for logos** — Teams may not be loaded yet; handle undefined gracefully with fallback placeholder
- [ ] **Timezone display inconsistency** — Always use `TimezoneService.formatSlotForDisplay()`, never raw slotId
- [ ] **Archived section not updating after cancel** — Cancelled proposals should move to correct section on re-render
- [ ] **Column overflow** — Proposals for weeks outside the 3-column range (e.g., W09) would be lost; decide on overflow behavior
- [ ] **Cancel button showing on UpcomingMatchesPanel (bottom-left)** — Cancel should only be on the main MatchesPanel, not the community feed panel

---

## Implementation Notes

### Reference Patterns
- **cancelScheduledMatch** should follow the exact pattern of `cancelProposal` (lines 559-636 in match-proposals.js) but extended to also revert the proposal
- **Column layout** follows the existing panel patterns — `flex` containers with `overflow-y-auto` for scrollable content within fixed-height panels
- **Compact match display** similar to UpcomingMatchesPanel cards but without the border wrapper

### Dependencies
- `DateUtils` for week ID calculation — check if already extracted (slice 8.1a) or use inline helper
- `TeamService.getTeam()` must be called after teams are loaded (usually done at app init)
- `TimezoneService` must be initialized before rendering slot times

### Gotchas
- The `_renderAll()` function in MatchesPanel is called on every listener update — the column layout must be efficient to re-render
- `FieldValue.delete()` is needed to remove nested map keys from confirmedSlots — same pattern as `withdrawConfirmation`
- The `involvedTeamMembers` field on proposals is used by security rules — don't modify it during cancel
- Existing `_isSlotPast()` helper filters expired slots from active proposals — still needed in column view
- `_setupScheduledMatchListeners()` queries `status == 'upcoming'` — cancelled matches will automatically disappear from the query results

### Implementation Order
1. **8.2a first** — Backend function must exist before UI can call it
2. **8.2c second** — Compact match rendering can be built/tested independently
3. **8.2b last** — Column layout integrates everything together

---

## Pragmatic Assumptions

- **[ASSUMPTION]**: Proposals for weeks outside the 3-column range (e.g., 3+ weeks ahead) will not be shown in the column view. They are rare and can be surfaced later if needed.
- **Rationale**: Teams rarely schedule >2 weeks ahead per user input. Keeps layout simple.
- **Alternative**: Add a "More" overflow column or scrollable column strip.

- **[ASSUMPTION]**: The `confirm()` dialog is sufficient for cancel confirmation (no custom modal needed).
- **Rationale**: Cancel is a rare action; native dialog is fast to implement and clear.
- **Alternative**: Custom confirmation modal with team names and match details.
