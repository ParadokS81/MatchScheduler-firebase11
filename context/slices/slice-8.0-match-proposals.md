# Slice 8.0: Match Proposals & Scheduling

**Dependencies:** Slices 3.4 (Comparison Engine), 4.2 (ComparisonModal), 5.0a (Tab system), 7.0 (UTC Foundation)
**User Story:** As a team leader (or delegated scheduler), I want to propose match times to an opponent team so we can agree on a schedule without manually scanning the availability grid repeatedly.
**Success Criteria:**
- [ ] Leader or scheduler can create a match proposal for an opponent team from the ComparisonModal
- [ ] Proposal auto-populates viable slots from ComparisonEngine (based on min-vs-min filter)
- [ ] Slots update live as availability changes (players filling in their week)
- [ ] Either side's leader/scheduler can confirm a slot; both must confirm to lock in a scheduled match
- [ ] Past timeslots are hidden from the UI but preserved in database for audit trail
- [ ] Proposals gracefully degrade — card disappears when last viable slot passes its time
- [ ] "Matches" tab in center panel shows: Active Proposals / Upcoming / Archived
- [ ] Upcoming matches display in bottom-left panel (user's matches + site-wide)
- [ ] Discord template message copied on proposal creation with boilerplate + link
- [ ] Scheduled match blocks the confirmed slot for both teams in other proposals
- [ ] Leaders can delegate scheduling rights to roster members (`schedulers` field)

---

## Design Decisions Log

Decisions made during review (2026-01-31):

| Decision | Answer | Rationale |
|----------|--------|-----------|
| Leadership check on confirm | **Live-check** team.leaderId + schedulers[] | Leadership can transfer; snapshot would go stale |
| 24h cooldown | **Removed** | Premature complexity; monitor for abuse first |
| Rate limit (3 proposals) | **Removed** | Same — let teams be proactive, add limits if needed |
| Multi-confirm per side | **Yes** — confirm as many slots as you want | Cast a wide net; first mutual match wins |
| Match trigger | Server creates match automatically, toast celebrates | No client-side confirmation modal; race window is ~200ms, negligible |
| Cancel vs reject | **Single status** (`cancelled`), store `cancelledBy` userId | Simpler; audit trail via cancelledBy |
| Proposal visibility | **Restrict reads** to involved teams' members via security rules | Privacy-forward, especially with team privacy features coming |
| Past slots | **Hide from UI**, keep in database | Cleaner UX; data preserved for audit |
| Proposal expiry | Card disappears when last slot passes; document stays as `expired` | Graceful degradation |
| Live vs locked proposals | **Live only** — slots always computed from current availability | No use case for locked-time proposals; both teams confirm anyway |
| Availability drop warning | Store `countAtConfirm`, show visual warning if current count drops below | No auto-revoke; humans decide (confirm means "we WILL show up") |
| Blocked slots on schedule | Block **1 slot** (the confirmed slot only) for both teams | Conservative; 30min slot covers minimum match time |
| Scheduler delegation | `schedulers[]` on team doc; leaders always implicit | Not just leaders — delegated members can propose/confirm |
| Proxy availability | **Separate slice (2.8)** — leader fills availability for roster members | Independent of 8.0, enhances proposal quality |

---

## Problem Statement

Leaders currently find overlapping availability through the comparison grid, then manually contact opponents via Discord. There's no persistent view of viable slots, no confirmation workflow, and no record of scheduled matches. Leaders must repeatedly scan the grid to check for changes. Once a match is agreed upon in Discord, there's no way to record it in the system for display or external API consumption.

---

## Solution

A **Match Proposal** is a persistent, auto-updating comparison between two teams for a specific week. It stores the team pairing and min-vs-min filter, then computes viable slots live from availability data. Either side's leader or delegated scheduler can confirm a slot they like; when both sides confirm the same slot, a **Scheduled Match** is created automatically. The confirmed slot is blocked for both teams in other proposals to prevent double-booking. The proposal eliminates repetitive manual scanning and creates a clean data trail from discovery -> negotiation -> confirmation -> scheduled match.

---

## Sub-slice Breakdown

### Slice 8.0a: Schema + Cloud Functions + Scheduler Delegation
- `schedulers` field on team document + toggle UI in team management
- MatchProposal and ScheduledMatch Firestore documents
- Cloud Functions: createProposal, confirmSlot, withdrawConfirmation, cancelProposal
- Security rules restricting proposal reads to involved teams
- Event logging for proposal lifecycle
- Update SCHEMA.md

### Slice 8.0b: Matches Tab + Proposal Cards
- "Matches" tab in center panel (BottomPanelController)
- MatchesPanel component with three sections: Active Proposals / Upcoming / Archived
- ProposalCard component: collapsed = team logo + name + slot count; expanded = live slot list
- Live slot computation: subscribe to both teams' availability (on expand only), run ComparisonEngine logic
- Blocked-slot filtering: exclude slots already scheduled by either team
- Slot rows show "4 vs 3" with hover for roster names
- Warning indicator when availability drops below countAtConfirm
- Confirm/withdraw buttons per slot (for leaders + schedulers)
- Past timeslots hidden from UI
- "Load Grid View" shortcut -> auto-select opponent + filter in comparison grid

### Slice 8.0c: Proposal Creation Flow + Discord Integration
- "Propose Match" button in ComparisonModal footer (leaders + schedulers only)
- On click: creates proposal via Cloud Function + copies Discord template to clipboard
- Discord template: team tags, all viable slot times with roster counts, proposal link
- Toast confirmation: "Proposal created! Message copied to clipboard"

### Slice 8.1: Upcoming Matches Panel (Bottom-Left)
- UpcomingMatchesPanel component in panel-bottom-left
- "Your Matches" section (1-2 upcoming for user's teams)
- "Community Matches" section (site-wide scheduled matches feed)
- Listener on scheduledMatches collection
- Compact cards: team logos + time + roster count

---

## Schema

### Team Document Addition

```typescript
// Add to existing /teams/{teamId} document
interface TeamDocumentAddition {
  schedulers: string[];  // userIds who can propose/confirm matches (in addition to leader)
}
```

**Note:** Leader is always implicitly a scheduler. The `schedulers` array is for delegated members only. Leaders manage this via team management UI.

### `/matchProposals/{proposalId}`

```typescript
interface MatchProposalDocument {
  // Identity
  proposerTeamId: string;          // Team that created the proposal
  opponentTeamId: string;          // Team being proposed to
  weekId: string;                  // ISO week: "2026-05"

  // Filter used to compute viable slots
  minFilter: {
    yourTeam: number;              // 1-4
    opponent: number;              // 1-4
  };

  // Confirmations - which slots each side has confirmed
  // Key = UTC slotId (e.g., "mon_2000"), Value = { userId, countAtConfirm }
  proposerConfirmedSlots: {
    [slotId: string]: {
      userId: string;              // Who confirmed
      countAtConfirm: number;      // How many players were available when confirmed
    };
  };
  opponentConfirmedSlots: {
    [slotId: string]: {
      userId: string;
      countAtConfirm: number;
    };
  };

  // Result - set when both confirm same slot
  confirmedSlotId: string | null;  // The slot both agreed on
  scheduledMatchId: string | null; // Reference to created ScheduledMatch

  // Status
  status: 'active' | 'confirmed' | 'cancelled' | 'expired';
  cancelledBy: string | null;      // userId who cancelled (for audit)

  // Denormalized display data
  proposerTeamName: string;
  proposerTeamTag: string;
  opponentTeamName: string;
  opponentTeamTag: string;

  // Metadata
  createdBy: string;               // userId who created (may be scheduler, not leader)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;            // Sunday 23:59 UTC of the proposal week
}
```

**Document ID:** Auto-generated

**Key design decisions:**
- Slots are NOT stored in the proposal — they're computed live from availability data
- Only confirmations are stored (which slots each side clicked "Confirm" on)
- `countAtConfirm` enables the UI to show a warning if availability drops after confirmation
- This means the card always shows the latest roster state, even if availability changes after proposal creation
- `confirmedSlotId` is set by the Cloud Function when both sides confirm the same slot
- `cancelledBy` distinguishes who cancelled for audit purposes
- `createdBy` tracks the actual user (could be a scheduler, not necessarily the leader)
- Team names/tags denormalized to avoid extra reads when listing proposals
- Authorization checks use **live** team.leaderId + team.schedulers (not snapshot values)

### `/scheduledMatches/{matchId}`

```typescript
interface ScheduledMatchDocument {
  // Teams
  teamAId: string;
  teamAName: string;
  teamATag: string;
  teamBId: string;
  teamBName: string;
  teamBTag: string;

  // Schedule
  weekId: string;                  // "2026-05"
  slotId: string;                  // UTC slot: "mon_2000"
  scheduledDate: string;           // ISO date: "2026-02-02" (computed from weekId + slotId)

  // Blocked slot for double-booking prevention
  blockedSlot: string;             // Same as slotId — the confirmed slot
  blockedTeams: string[];          // [teamAId, teamBId]

  // Roster snapshot at confirmation time
  teamARoster: string[];           // userIds available at confirmation
  teamBRoster: string[];           // userIds available at confirmation

  // Origin
  proposalId: string;              // Reference back to matchProposal

  // Status
  status: 'upcoming' | 'completed' | 'cancelled';

  // Metadata
  confirmedAt: Timestamp;
  confirmedByA: string;            // userId from team A who confirmed
  confirmedByB: string;            // userId from team B who confirmed
  createdAt: Timestamp;
}
```

**Document ID:** Auto-generated

---

## Full Stack Architecture

### FRONTEND COMPONENTS

**MatchesPanel** (new: `public/js/components/MatchesPanel.js`)
- Firebase listeners: `/matchProposals` where proposerTeamId or opponentTeamId matches user's teams
- Cache interactions: reads from ProposalService cache, updates on listener callback
- UI responsibilities: Three-section layout (Active Proposals / Upcoming Matches / Archived)
- User actions: Expand proposal card, confirm slot, cancel proposal, load grid view

**ProposalCard** (inline within MatchesPanel, not a separate file)
- Firebase listeners: Subscribes to availability docs for BOTH teams **only when expanded** (unsubscribe on collapse)
- Cache interactions: Reads AvailabilityService cache, ComparisonEngine logic for slot computation
- Blocked-slot filtering: Reads ScheduledMatchService cache, excludes blocked slots for either team
- UI responsibilities: Collapsed card (logo + name + viable slot count), expanded view (slot list with roster counts, confirm buttons)
- Warning indicator: When live count < countAtConfirm, show amber warning on that slot
- User actions: Toggle expand, confirm slot, withdraw confirmation, cancel proposal
- Authorization: Confirm/withdraw/cancel buttons visible to leader + schedulers of that team

**UpcomingMatchesPanel** (new: `public/js/components/UpcomingMatchesPanel.js`)
- Firebase listeners: `/scheduledMatches` where status == 'upcoming'
- Cache interactions: Reads from ScheduledMatchService cache
- UI responsibilities: "Your Matches" (filtered to user's teams) + "Community Matches" (all)
- User actions: Click match -> navigate to team detail? (minimal interaction)

### FRONTEND SERVICES

**ProposalService** (new: `public/js/services/ProposalService.js`)
- `loadProposalsForTeams(teamIds)` -> fetch active proposals where user's teams are involved
- `getProposalsFromCache()` -> return cached proposals instantly
- `updateCache(proposalId, data)` -> called by component listeners
- `createProposal(data)` -> calls `createProposal` Cloud Function
- `confirmSlot(proposalId, slotId)` -> calls `confirmSlot` Cloud Function
- `withdrawConfirmation(proposalId, slotId)` -> calls `withdrawConfirmation` Cloud Function
- `cancelProposal(proposalId)` -> calls `cancelProposal` Cloud Function
- `computeViableSlots(proposerTeamId, opponentTeamId, weekId, minFilter)` -> runs ComparisonEngine logic on cached availability data, filters out blocked slots from scheduled matches, returns array of `{ slotId, proposerCount, opponentCount, proposerRoster, opponentRoster }`

**ScheduledMatchService** (new: `public/js/services/ScheduledMatchService.js`)
- `loadUpcomingMatches()` -> fetch all upcoming matches
- `getMatchesFromCache()` -> return cached matches instantly
- `updateCache(matchId, data)` -> called by component listeners
- `getBlockedSlotsForTeam(teamId, weekId)` -> returns Set of slotIds blocked by scheduled matches

### BACKEND REQUIREMENTS

**CLOUD FUNCTIONS IN `/functions/match-proposals.js`:**

**`createProposal({ proposerTeamId, opponentTeamId, weekId, minFilter })`**
- File: `/functions/match-proposals.js`
- Purpose: Create a new match proposal between two teams
- Validation:
  - User is authenticated
  - User is leader OR in `schedulers[]` of proposerTeamId (live check on team doc)
  - opponentTeamId exists and is active
  - weekId is current week or future (max 4 weeks ahead)
  - minFilter.yourTeam and minFilter.opponent are 1-4
  - No existing active proposal for this team pair + week (bidirectional check)
- Operations:
  - Read proposer team doc (get name, tag, leaderId, schedulers)
  - Read opponent team doc (get name, tag)
  - Create `/matchProposals/{auto}` document
  - Create eventLog entry (PROPOSAL_CREATED)
- Returns: `{ success: true, proposalId: string }`

**`confirmSlot({ proposalId, slotId })`**
- File: `/functions/match-proposals.js`
- Purpose: Leader/scheduler confirms they want to play at this slot
- Validation:
  - User is authenticated
  - Proposal exists and status is 'active'
  - User is leader OR in `schedulers[]` of proposer/opponent team (live check on team doc)
  - slotId matches valid UTC slot format
  - slotId is not blocked by an existing scheduled match for either team
- Operations:
  - Determine which side the user is on (proposer or opponent)
  - Read current availability to get countAtConfirm
  - Update `proposerConfirmedSlots` or `opponentConfirmedSlots` with `{ [slotId]: { userId, countAtConfirm } }`
  - Check if BOTH sides have confirmed the same slot
  - If match: create ScheduledMatch doc (with blockedSlot + blockedTeams), update proposal status to 'confirmed', set confirmedSlotId
  - Create eventLog entry (SLOT_CONFIRMED or MATCH_SCHEDULED)
- Returns: `{ success: true, matched: boolean, scheduledMatchId?: string }`

**`withdrawConfirmation({ proposalId, slotId })`**
- File: `/functions/match-proposals.js`
- Purpose: Leader/scheduler un-confirms a slot they previously confirmed
- Validation:
  - User is authenticated
  - Proposal status is 'active' (can't withdraw from confirmed match)
  - User is leader OR in `schedulers[]` of their side's team
  - That side has actually confirmed this slot
- Operations:
  - Remove slotId from the appropriate confirmedSlots map
  - Update `updatedAt`
- Returns: `{ success: true }`

**`cancelProposal({ proposalId })`**
- File: `/functions/match-proposals.js`
- Purpose: Either side's leader/scheduler cancels the proposal
- Validation:
  - User is authenticated
  - Proposal status is 'active'
  - User is leader OR in `schedulers[]` of either involved team
- Operations:
  - Update proposal status to 'cancelled', set `cancelledBy` to userId
  - Create eventLog entry (PROPOSAL_CANCELLED)
- Returns: `{ success: true }`

**`expireProposals` (scheduled cleanup)**
- File: `/functions/match-proposals.js`
- Purpose: Mark proposals as expired when their week has passed
- Approach: Frontend hides expired proposals based on `expiresAt`; daily scheduled Cloud Function batch-updates status to 'expired' for cleanup
- Operations:
  - Query active proposals where expiresAt < now
  - Batch update status to 'expired'

**Function Exports Required:**
```javascript
// In /functions/index.js add:
const { createProposal, confirmSlot, withdrawConfirmation, cancelProposal } = require('./match-proposals');
exports.createProposal = createProposal;
exports.confirmSlot = confirmSlot;
exports.withdrawConfirmation = withdrawConfirmation;
exports.cancelProposal = cancelProposal;
```

**Security Rules:**
```
/matchProposals/{proposalId}
- Read: Authenticated users who are members of proposerTeamId OR opponentTeamId
- Write: Cloud Functions only

/scheduledMatches/{matchId}
- Read: Authenticated users (all matches are public — community feed)
- Write: Cloud Functions only
```

**Note on proposal read rules:** This requires checking the user's team memberships against the proposal's team IDs. Implementation options:
- Option A: Store `involvedTeamMembers[]` (denormalized userIds from both rosters) on the proposal — enables simple `request.auth.uid in resource.data.involvedTeamMembers` rule. Downside: must update when roster changes.
- Option B: Read both team docs in the security rule — expensive (2 reads per rule evaluation).
- Option C: Use `involvedTeamIds[]` array field + check user's team membership client-side, with server-side rules just checking auth. Simpler but less strict.
- **Recommendation:** Option A with the understanding that roster changes during an active proposal week are rare. The array is updated at proposal creation time and is "good enough" for the lifetime of a weekly proposal.

**Event Logging:**
```
PROPOSAL_CREATED   -> category: SCHEDULING, details: { proposerTeamId, opponentTeamId, weekId, createdBy }
SLOT_CONFIRMED     -> category: SCHEDULING, details: { proposalId, slotId, confirmedBy, side }
MATCH_SCHEDULED    -> category: SCHEDULING, details: { proposalId, matchId, slotId, teams }
PROPOSAL_CANCELLED -> category: SCHEDULING, details: { proposalId, cancelledBy }
```

### INTEGRATION POINTS

- ComparisonModal -> ProposalService.createProposal() -> `createProposal` Cloud Function
- ProposalCard -> ProposalService.confirmSlot() -> `confirmSlot` Cloud Function
- ProposalCard -> ProposalService.cancelProposal() -> `cancelProposal` Cloud Function
- MatchesPanel subscribes to `/matchProposals` filtered by team IDs
- ProposalCard subscribes to `/availability/{teamId}_{weekId}` for BOTH teams **on expand only**
- UpcomingMatchesPanel subscribes to `/scheduledMatches` filtered by status
- BottomPanelController adds 'matches' case to switchTab()
- ProposalService.computeViableSlots() checks ScheduledMatchService for blocked slots

---

## Integration Code Examples

### 1. Creating a Proposal from ComparisonModal

```javascript
// In ComparisonModal._renderModal() — add to footer (leaders + schedulers)
const canSchedule = isLeader || TeamService.isScheduler(userTeamInfo.teamId, currentUserId);

const footerHtml = `
    <div class="p-4 border-t border-border shrink-0 flex gap-2">
        ${canSchedule ? `
            <button id="propose-match-btn" class="btn btn-primary flex-1">
                Propose Match
            </button>
        ` : ''}
        <button id="comparison-modal-done" class="btn ${canSchedule ? 'btn-secondary' : 'btn-primary'} flex-1">
            Close
        </button>
    </div>
`;

// Click handler
document.getElementById('propose-match-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('propose-match-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        const result = await ProposalService.createProposal({
            proposerTeamId: userTeamInfo.teamId,
            opponentTeamId: selectedMatch.teamId,
            weekId: weekId,
            minFilter: ComparisonEngine.getComparisonState().filters || { yourTeam: 1, opponent: 1 }
        });

        if (result.success) {
            // Copy Discord template to clipboard
            const template = _generateDiscordTemplate(weekId, userTeamInfo, selectedMatch);
            await navigator.clipboard.writeText(template);
            ToastService.showSuccess('Proposal created! Message copied to clipboard');
            ComparisonModal.close();
        } else {
            ToastService.showError(result.error || 'Failed to create proposal');
        }
    } catch (error) {
        ToastService.showError('Network error — please try again');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Propose Match';
    }
});
```

### 2. Proposal Card with Live Slot Computation + Warnings

```javascript
// ProposalCard (within MatchesPanel)
function _renderExpandedProposal(proposal) {
    // Compute viable slots from LIVE availability data, filtered by blocked slots
    const viableSlots = ProposalService.computeViableSlots(
        proposal.proposerTeamId,
        proposal.opponentTeamId,
        proposal.weekId,
        proposal.minFilter
    );

    const now = new Date();
    const isProposerSide = _isUserOnSide(proposal, 'proposer');
    const isOpponentSide = _isUserOnSide(proposal, 'opponent');
    const canAct = isProposerSide || isOpponentSide;
    const myConfirmedSlots = isProposerSide
        ? proposal.proposerConfirmedSlots
        : proposal.opponentConfirmedSlots;
    const theirConfirmedSlots = isProposerSide
        ? proposal.opponentConfirmedSlots
        : proposal.proposerConfirmedSlots;

    // Filter out past slots from display (kept in DB for audit)
    const visibleSlots = viableSlots.filter(slot => !_isSlotPast(proposal.weekId, slot.slotId, now));

    const slotsHtml = visibleSlots.map(slot => {
        const myConfirm = myConfirmedSlots?.[slot.slotId];
        const theirConfirm = theirConfirmedSlots?.[slot.slotId];
        const iConfirmed = !!myConfirm;
        const theyConfirmed = !!theirConfirm;
        const bothConfirmed = iConfirmed && theyConfirmed;

        // Warning: availability dropped below what was confirmed at
        const myCount = isProposerSide ? slot.proposerCount : slot.opponentCount;
        const droppedWarning = iConfirmed && myCount < myConfirm.countAtConfirm;

        const display = TimezoneService.formatSlotForDisplay(slot.slotId);
        const statusIcon = bothConfirmed ? '✓✓' : (theyConfirmed ? '✓ them' : (iConfirmed ? '✓ you' : ''));

        return `
            <div class="proposal-slot flex items-center justify-between py-1.5 px-2 rounded
                        ${bothConfirmed ? 'bg-green-500/10 border border-green-500/30' : ''}
                        ${droppedWarning ? 'bg-amber-500/10 border border-amber-500/30' : ''}"
                 data-slot-id="${slot.slotId}">
                <div class="flex items-center gap-2">
                    <span class="text-sm">${display.dayLabel.slice(0, 3)} ${display.timeLabel}</span>
                    <span class="text-xs text-muted-foreground">${slot.proposerCount} vs ${slot.opponentCount}</span>
                    ${droppedWarning ? '<span class="text-xs text-amber-400" title="Player dropped since confirmed">⚠</span>' : ''}
                    <span class="text-xs">${statusIcon}</span>
                </div>
                ${canAct ? `
                    ${iConfirmed ? `
                        <button class="btn btn-xs btn-secondary withdraw-btn" data-slot="${slot.slotId}">
                            Withdraw
                        </button>
                    ` : `
                        <button class="btn btn-xs btn-primary confirm-btn" data-slot="${slot.slotId}">
                            Confirm
                        </button>
                    `}
                ` : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="proposal-slots space-y-1 mt-2">
            ${slotsHtml || '<p class="text-sm text-muted-foreground">No viable slots this week</p>'}
        </div>
        <div class="flex gap-2 mt-3">
            <button class="btn btn-xs btn-secondary load-grid-btn"
                    data-team="${isProposerSide ? proposal.opponentTeamId : proposal.proposerTeamId}"
                    data-min-your="${proposal.minFilter.yourTeam}"
                    data-min-opp="${proposal.minFilter.opponent}">
                Load Grid View
            </button>
            ${canAct ? `
                <button class="btn btn-xs text-red-400 hover:text-red-300 cancel-proposal-btn"
                        data-proposal="${proposal.id}">
                    Cancel
                </button>
            ` : ''}
        </div>
    `;
}

// Authorization helper: check if current user can act for a side
function _isUserOnSide(proposal, side) {
    const teamId = side === 'proposer' ? proposal.proposerTeamId : proposal.opponentTeamId;
    const team = TeamService.getTeam(teamId);
    if (!team) return false;
    const userId = AuthService.getCurrentUser()?.uid;
    return team.leaderId === userId || (team.schedulers || []).includes(userId);
}
```

### 3. Confirm Slot -> Cloud Function -> Listener Updates UI

```javascript
// ProposalCard confirm handler
async function _handleConfirmSlot(proposalId, slotId) {
    const btn = document.querySelector(`[data-slot="${slotId}"].confirm-btn`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = '...';
    }

    try {
        const result = await ProposalService.confirmSlot(proposalId, slotId);

        if (result.success) {
            if (result.matched) {
                ToastService.showSuccess('Match scheduled! Both teams confirmed.');
            } else {
                ToastService.showSuccess('Slot confirmed — waiting for opponent');
            }
            // UI updates via listener automatically
        } else {
            ToastService.showError(result.error || 'Failed to confirm');
        }
    } catch (error) {
        ToastService.showError('Network error — please try again');
    }
    // No finally — listener will re-render the card
}
```

### 4. MatchesPanel Listener Setup

```javascript
// MatchesPanel.init()
async function init(containerId) {
    _container = document.getElementById(containerId);
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) return;

    // Get user's team IDs
    const userTeamIds = Object.keys(
        UserProfileService.getCachedProfile()?.teams || {}
    );
    if (userTeamIds.length === 0) {
        _renderEmptyState();
        return;
    }

    // Initial load from cache
    const cached = ProposalService.getProposalsFromCache();
    _renderProposals(cached);

    // Set up listener for proposals involving user's teams
    const { collection, query, where, onSnapshot } = await import(
        'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
    );

    // Need two queries per team: one for proposer, one for opponent
    // Firestore doesn't support OR on different fields in one query
    for (const teamId of userTeamIds) {
        const proposerQuery = query(
            collection(window.firebase.db, 'matchProposals'),
            where('proposerTeamId', '==', teamId)
        );
        const opponentQuery = query(
            collection(window.firebase.db, 'matchProposals'),
            where('opponentTeamId', '==', teamId)
        );

        _unsubscribers.push(onSnapshot(proposerQuery, (snapshot) => {
            snapshot.docChanges().forEach(change => {
                ProposalService.updateCache(change.doc.id, change.doc.data());
            });
            _renderProposals(ProposalService.getProposalsFromCache());
        }));

        _unsubscribers.push(onSnapshot(opponentQuery, (snapshot) => {
            snapshot.docChanges().forEach(change => {
                ProposalService.updateCache(change.doc.id, change.doc.data());
            });
            _renderProposals(ProposalService.getProposalsFromCache());
        }));
    }

    console.log('MatchesPanel initialized');
}
```

### 5. Blocked Slot Filtering in computeViableSlots

```javascript
// ProposalService.computeViableSlots()
function computeViableSlots(proposerTeamId, opponentTeamId, weekId, minFilter) {
    // Get availability from cache
    const proposerAvail = AvailabilityService.getCachedAvailability(proposerTeamId, weekId);
    const opponentAvail = AvailabilityService.getCachedAvailability(opponentTeamId, weekId);

    if (!proposerAvail || !opponentAvail) return [];

    // Get blocked slots for both teams
    const proposerBlocked = ScheduledMatchService.getBlockedSlotsForTeam(proposerTeamId, weekId);
    const opponentBlocked = ScheduledMatchService.getBlockedSlotsForTeam(opponentTeamId, weekId);

    const viableSlots = [];
    const allSlotIds = new Set([
        ...Object.keys(proposerAvail.slots || {}),
        ...Object.keys(opponentAvail.slots || {})
    ]);

    for (const slotId of allSlotIds) {
        // Skip blocked slots
        if (proposerBlocked.has(slotId) || opponentBlocked.has(slotId)) continue;

        const proposerPlayers = proposerAvail.slots?.[slotId] || [];
        const opponentPlayers = opponentAvail.slots?.[slotId] || [];

        if (proposerPlayers.length >= minFilter.yourTeam &&
            opponentPlayers.length >= minFilter.opponent) {
            viableSlots.push({
                slotId,
                proposerCount: proposerPlayers.length,
                opponentCount: opponentPlayers.length,
                proposerRoster: proposerPlayers,
                opponentRoster: opponentPlayers
            });
        }
    }

    return viableSlots.sort((a, b) => _slotSortOrder(a.slotId) - _slotSortOrder(b.slotId));
}
```

### 6. Load Grid View Shortcut

```javascript
// From proposal card "Load Grid View" button
function _handleLoadGridView(opponentTeamId, minYour, minOpp) {
    // Switch to calendar tab
    BottomPanelController.switchTab('calendar');

    // Set the comparison filter
    window.dispatchEvent(new CustomEvent('filter-changed', {
        detail: { yourTeam: parseInt(minYour), opponent: parseInt(minOpp) }
    }));

    // Start comparison with the opponent team
    const userTeamId = TeamService.getActiveTeamId();
    ComparisonEngine.startComparison(userTeamId, [opponentTeamId], {
        yourTeam: parseInt(minYour),
        opponent: parseInt(minOpp)
    });
}
```

---

## Performance Classification

### HOT PATHS (<50ms)
- **Expand/collapse proposal card**: Pure DOM toggle, no network
- **Hover slot to see roster**: Data already computed from cached availability, tooltip renders instantly
- **Load Grid View**: Dispatches events to existing components, cached data

### COLD PATHS (<2s)
- **Create proposal**: Cloud Function call (show "Creating..." loading state)
- **Confirm slot**: Cloud Function call (disable button, show "..." state)
- **Initial proposals load**: Firestore query on first visit to Matches tab
- **Live slot computation**: Reads both teams' availability from cache, runs comparison logic (~50-100ms for 77 slots, acceptable)

### BACKEND PERFORMANCE
- **createProposal**: 2 team reads + 1 duplicate check query + 1 write + 1 eventLog write ~ 5 operations
- **confirmSlot**: 1 proposal read + 2 team reads (auth) + 1 availability read (countAtConfirm) + 1 update + potentially 1 scheduledMatch write + 1 eventLog ~ 5-7 operations
- **Indexes needed**:
  - `matchProposals`: composite index on `proposerTeamId + status`
  - `matchProposals`: composite index on `opponentTeamId + status`
  - `scheduledMatches`: composite index on `status + scheduledDate`
  - `scheduledMatches`: composite index on `blockedTeams` (array-contains) + `weekId`

---

## Data Flow Diagram

### Proposal Creation
```
Leader/scheduler clicks "Propose Match" in ComparisonModal
    |
    v
ComparisonModal -> ProposalService.createProposal()
    |                                      |
    |-- Copy Discord template to clipboard |
    |                                      v
    |                          Cloud Function: createProposal()
    |                                      |
    |                          Validate: auth, scheduler role, no duplicate
    |                                      |
    |                          Create /matchProposals/{id}
    |                          Create /eventLog/{id}
    |                                      |
    |                                      v
    |                          onSnapshot fires on MatchesPanel
    |                                      |
    |                                      v
    |                          ProposalService.updateCache()
    |                          MatchesPanel._renderProposals()
    |                                      |
    v                                      v
Toast: "Proposal created!"    New proposal card appears in Matches tab
```

### Slot Confirmation -> Match Scheduled
```
Leader/scheduler clicks "Confirm" on Wed 21:00
    |
    v
ProposalCard -> ProposalService.confirmSlot(proposalId, 'wed_2000')
    |
    v
Cloud Function: confirmSlot()
    |
    |-- Live-check: user is leader or in schedulers[] of their team
    |-- Read availability to get countAtConfirm
    |-- Check slot not blocked by existing scheduled match
    |
    |-- Update proposerConfirmedSlots.wed_2000 = { userId, countAtConfirm: 4 }
    |
    |-- Check: does opponentConfirmedSlots.wed_2000 exist?
    |   |
    |   |-- NO: return { matched: false }
    |   |       |
    |   |       v
    |   |   onSnapshot -> card re-renders with checkmark on Wed 21:00
    |   |
    |   +-- YES: MATCH!
    |           |
    |           |-- Create /scheduledMatches/{id} with blockedSlot + blockedTeams
    |           |-- Update proposal: status='confirmed', confirmedSlotId='wed_2000'
    |           |-- Create eventLog: MATCH_SCHEDULED
    |           |
    |           v
    |       onSnapshot fires on BOTH:
    |       - MatchesPanel (proposal moves to Upcoming section)
    |       - UpcomingMatchesPanel (new match appears)
    |       - Other proposals for these teams: blocked slot now filtered out
    |
    v
Toast: "Match scheduled!" or "Slot confirmed — waiting for opponent"
```

### Live Slot Updates (Availability Changes)
```
Player fills in availability for Wed 21:00
    |
    v
AvailabilityGrid -> AvailabilityService -> Firestore
    |
    v
onSnapshot fires on ProposalCard (subscribed to availability/{teamId}_{weekId} while expanded)
    |
    v
ProposalCard recalculates viable slots:
    ProposalService.computeViableSlots(...) — includes blocked-slot filtering
    |
    v
New slot appears in proposal card (e.g., "Wed 21:00 — 4 vs 4")
                                                 (now meets filter!)

--- OR ---

Player removes availability, dropping below countAtConfirm:
    |
    v
Slot shows warning: "Wed 21:00 — 2 vs 4 ⚠ Confirmed (was 3)"
    Leader decides: withdraw or keep (standin coming)
```

---

## Tab Bar Changes

### Current tabs in `public/index.html` mid-center:
```html
Calendar | Teams | Players | Tournament
```

### New:
```html
Calendar | Teams | Players | Tournament | Matches
```

Add `matches` case to BottomPanelController.switchTab():
```javascript
case 'matches':
    _showMatchesPanel();
    break;
```

---

## Proposal Card UI Design

### Collapsed
```
+---------------------------------------------+
|  [logo] Bear Beer Balalaika  .  3 slots  v  |
|         Week 5 . Min 4v3                    |
+---------------------------------------------+
```

### Expanded
```
+---------------------------------------------+
|  [logo] Bear Beer Balalaika  .  3 slots  ^  |
|         Week 5 . Min 4v3                    |
|---------------------------------------------|
|  Wed 5th 20:00   4 vs 3  ⚠ you    [Withdraw]|  <- confirmed but player dropped
|  Wed 5th 21:00   4 vs 4  ✓✓     SCHEDULED   |  <- both confirmed
|  Thu 6th 20:30   4 vs 4  ✓ them   [Confirm] |  <- they confirmed, you haven't
|                                              |
|  [Load Grid View]              [Cancel]      |
+---------------------------------------------+
```

**Note:** Past timeslots are hidden entirely (not muted). "✓ you" / "✓ them" / "✓✓" indicates confirmation status.

---

## Scheduler Delegation UI

### Team Management Addition
In the team management drawer/modal, leaders see a new section:

```
Scheduling Permissions
─────────────────────
[PlayerA]  [toggle: Can Schedule]
[PlayerB]  [toggle: Can Schedule]
[PlayerC]  [toggle: Can Schedule]
```

Toggle adds/removes userId from `team.schedulers[]`. Uses existing `updateTeamSettings` Cloud Function pattern (or a new lightweight function).

---

## Test Scenarios

### FRONTEND TESTS
- [ ] "Propose Match" button shows for leaders AND schedulers in ComparisonModal
- [ ] "Propose Match" button hidden for regular members
- [ ] Clicking "Propose Match" shows loading state, then success toast
- [ ] Discord template is copied to clipboard on proposal creation
- [ ] Proposal card renders in Matches tab after creation
- [ ] Expanding card subscribes to availability; collapsing unsubscribes
- [ ] Expanding card shows live-computed slots with correct roster counts
- [ ] Blocked slots (from scheduled matches) are excluded from viable slots
- [ ] Hovering a slot shows roster names
- [ ] "Confirm" button changes to "Withdraw" after confirming
- [ ] Warning indicator shows when availability drops below countAtConfirm
- [ ] Past timeslots are hidden (not shown)
- [ ] Card disappears when all slots are past
- [ ] "Load Grid View" switches to calendar tab with correct comparison state
- [ ] "Cancel" button removes proposal from active list
- [ ] Scheduler delegation toggles work in team management

### BACKEND TESTS
- [ ] createProposal validates leader authorization
- [ ] createProposal validates scheduler authorization
- [ ] createProposal rejects regular members
- [ ] createProposal rejects duplicate proposal for same teams + week (bidirectional)
- [ ] confirmSlot creates ScheduledMatch when both confirm same slot
- [ ] confirmSlot stores countAtConfirm from current availability
- [ ] confirmSlot rejects if slot is blocked by existing scheduled match
- [ ] confirmSlot doesn't create match when only one side confirms
- [ ] confirmSlot creates blockedSlot + blockedTeams on ScheduledMatch
- [ ] withdrawConfirmation removes the confirmation entry
- [ ] cancelProposal sets status to 'cancelled' and stores cancelledBy
- [ ] Event log entries created for all lifecycle events

### INTEGRATION TESTS (CRITICAL)
- [ ] Create proposal -> listener fires -> card appears in Matches tab
- [ ] Confirm slot -> listener fires -> card shows confirmation status
- [ ] Both confirm same slot -> ScheduledMatch created -> appears in Upcoming
- [ ] Scheduled match blocks slot in other active proposals for same teams
- [ ] Player updates availability -> proposal card slots update live (when expanded)
- [ ] Player drops below countAtConfirm -> warning indicator appears
- [ ] Cancel proposal -> listener fires -> card removed from active section
- [ ] Network failure on confirm -> error toast shown, button re-enabled
- [ ] Non-authorized user tries to confirm -> permission denied error shown

### END-TO-END TESTS
- [ ] Full journey: compare -> propose -> confirm -> match scheduled -> slot blocked
- [ ] Proposal graceful degradation: all slots pass -> card disappears
- [ ] Community feed: scheduled match visible to all users in Upcoming panel
- [ ] Cross-timezone: slot times display correctly for both sides in different timezones
- [ ] Scheduler delegation: leader grants scheduling rights -> member can propose + confirm

---

## Common Integration Pitfalls

- [ ] **Frontend calls Cloud Function but doesn't handle errors** — wrap all ProposalService calls in try/catch, show user-friendly messages
- [ ] **Proposal created but no listener for updates** — MatchesPanel MUST set up onSnapshot on matchProposals collection
- [ ] **Slot computation doesn't use latest availability** — ProposalCard must subscribe to BOTH teams' availability docs on expand
- [ ] **Forgot to filter blocked slots** — computeViableSlots must check ScheduledMatchService for blocked slots
- [ ] **Loading states missing** — "Propose Match" and "Confirm" buttons must show loading during Cloud Function call
- [ ] **Cache not updated from listener** — every onSnapshot callback must call ProposalService.updateCache()
- [ ] **Timezone conversion forgotten in slot display** — always use TimezoneService.formatSlotForDisplay() for slot times
- [ ] **Using set({ merge: true }) for confirmedSlots** — use update() with dot-notation: `update({ 'proposerConfirmedSlots.mon_2000': { userId, countAtConfirm } })`
- [ ] **Not cleaning up listeners** — MatchesPanel.cleanup() must unsubscribe all listeners when tab switches; ProposalCard must unsubscribe availability listeners on collapse
- [ ] **Week boundary not computed correctly** — use WeekNavigation.getCurrentWeekNumber() and UTC consistently
- [ ] **Authorization checking snapshot instead of live** — always read fresh team doc for leaderId + schedulers in Cloud Functions

---

## Implementation Notes

### Reusing ComparisonEngine Logic
ProposalService.computeViableSlots() should reuse the same slot-matching logic as ComparisonEngine._calculateMatches() but scoped to a single opponent and single week, plus blocked-slot filtering. Extract the core comparison logic into a shared utility or duplicate it (it's simple enough: check both teams' availability counts against the min filter).

### Firestore Query Limitations
Firestore doesn't support OR queries across different fields. To get "proposals where I'm proposer OR opponent", we need two separate queries/listeners merged in the component. This is a standard Firestore pattern.

### Proposal Expiration
Frontend hides proposals where `expiresAt < now` or where all viable slots are past. A daily scheduled Cloud Function cleans up by batch-updating expired proposals. No need for per-minute precision.

### Blocked Slot Queries
To check if a slot is blocked for a team, query scheduledMatches where `blockedTeams` array-contains teamId AND `weekId` matches. Cache the results in ScheduledMatchService for instant lookups during slot computation.

### Indexes
Create composite indexes in `firebase.json` or via the Firebase console:
- `matchProposals`: `proposerTeamId` ASC + `status` ASC
- `matchProposals`: `opponentTeamId` ASC + `status` ASC
- `scheduledMatches`: `status` ASC + `scheduledDate` ASC
- `scheduledMatches`: `blockedTeams` (array-contains) + `weekId` ASC

### Dependencies on Other Slices
- Slice 3.4 (ComparisonEngine) — slot matching logic
- Slice 4.2 (ComparisonModal) — "Propose Match" button entry point
- Slice 7.0 (UTC) — all slot IDs are UTC, display conversion via TimezoneService
- Slice 5.0a (BottomPanelController) — adding "matches" tab

### Related Future Slices
- Slice 2.8 (Proxy Availability) — leader fills availability for roster members; independent of 8.0 but enhances proposal quality
- Slice 9.0 (Team Privacy) — affects proposal visibility and roster display in slots

---

## File Changes Summary

| File | Action | Sub-slice | Notes |
|------|--------|-----------|-------|
| `functions/match-proposals.js` | **Create** | 8.0a | Cloud Functions for proposal lifecycle |
| `functions/index.js` | Modify | 8.0a | Export new functions |
| `context/SCHEMA.md` | Modify | 8.0a | Add matchProposals + scheduledMatches + schedulers field |
| `public/js/services/TeamService.js` | Modify | 8.0a | Add `isScheduler()` helper, scheduler toggle method |
| `public/js/services/ProposalService.js` | **Create** | 8.0b | Proposal cache + Cloud Function calls + viable slot computation |
| `public/js/services/ScheduledMatchService.js` | **Create** | 8.0b | Scheduled match cache + blocked slot lookups |
| `public/js/components/MatchesPanel.js` | **Create** | 8.0b | Matches tab content + proposal cards |
| `public/js/components/UpcomingMatchesPanel.js` | **Create** | 8.1 | Bottom-left upcoming matches |
| `public/js/components/ComparisonModal.js` | Modify | 8.0c | Add "Propose Match" button for leaders + schedulers |
| `public/js/components/BottomPanelController.js` | Modify | 8.0b | Add 'matches' tab case |
| `public/index.html` | Modify | 8.0b | Add Matches tab button, load new scripts |
| `src/css/input.css` | Modify | 8.0b | Proposal card styles |
| Team management component | Modify | 8.0a | Add scheduler delegation toggles |

---

## Quality Checklist

- [x] Frontend AND backend requirements specified
- [x] Integration examples show actual code
- [x] Hot paths identified and approach specified
- [x] Test scenarios cover full stack
- [x] Data flow is complete (UI -> DB -> UI)
- [x] Error handling specified for all operations
- [x] Loading states defined for backend calls
- [x] Event logging requirements documented
- [x] API contracts fully specified
- [x] Security rules documented (restricted to involved teams)
- [x] Cache + Listeners pattern followed (services manage cache, components own listeners)
- [x] UTC timezone handling throughout (TimezoneService for display)
- [x] Authorization model specified (leader + schedulers, live-checked)
- [x] Blocked slots prevent double-booking
- [x] countAtConfirm enables availability-drop warnings
- [x] Design decisions logged with rationale
