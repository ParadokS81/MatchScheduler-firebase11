# Slice 18.0: Quick Add Match

**Dependencies:** Slice 8.0 (Match Proposals & Scheduling), Slice 8.3 (Matches Layout)
**User Story:** As a team leader or delegated scheduler, I can quickly add a pre-arranged match against another team so that externally-scheduled games (Discord, IRC) appear in the system without going through the proposal workflow.
**Success Criteria:**
- [ ] Leader/scheduler sees "+" button in the SCHEDULED MATCHES header (right column of Matches tab)
- [ ] Clicking "+" opens a modal with opponent team selection, date+time picker, and game type
- [ ] Submitting creates a `scheduledMatch` document that immediately appears in both teams' views
- [ ] Match blocks the slot for both teams (prevents double-booking)
- [ ] Event log entry created so the match shows in activity feed
- [ ] Non-leaders/non-schedulers do not see the "+" button

---

## Design Decisions

| Decision | Answer | Rationale |
|----------|--------|-----------|
| Opponent confirmation | **Not required** | Trust-based system — leaders only add confirmed-elsewhere matches |
| Entry point | **"+" in SCHEDULED MATCHES header** | Contextual, discoverable, doesn't clutter proposal workflow |
| Time input | **Free-form date + time** | Maximum flexibility for pre-arranged matches from any source |
| Notification | **Event log entry** | Match appears + eventLog so it shows in activity feed |
| Permissions | **Leaders + schedulers** | Same as proposal confirmation — consistent permission model |
| Origin tracking | **`origin` field on scheduledMatch** | Distinguish quick-add from proposal-created matches |
| Team selection | **Auto-select if 1 team, dropdown if 2** | Minimize clicks for the common case |

---

## PRD Mapping

```
PRIMARY SECTIONS:
- Scheduling: Quick-add path for externally-arranged matches
- Scheduled Matches: Creates scheduledMatch documents with same structure

DEPENDENT SECTIONS:
- Team Management: Leader/scheduler permissions (isAuthorized pattern)
- Slot Blocking: Blocked slots prevent double-booking
- Event Logging: MATCH_QUICK_ADDED event type

IGNORED SECTIONS:
- Proposal workflow: Entirely bypassed (that's the point)
- Availability comparison: No slot computation needed
- Discord integration: Match was already arranged externally
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- MatchesPanel (MODIFY)
  - Add "+" button in SCHEDULED MATCHES header (right column)
  - Button visible only when user is leader/scheduler on ≥1 team
  - Click opens QuickAddMatchModal

- QuickAddMatchModal (NEW)
  - Firebase listeners: none (one-shot form)
  - Cache interactions: reads TeamService cache for team list
  - UI responsibilities:
    - "Your team" selector (auto-selected if only 1 team, dropdown if 2)
    - Opponent team searchable dropdown (all active teams minus user's)
    - Date picker (today or future dates only)
    - Time picker (dropdown: 30-min intervals from 12:00-23:30 in user's timezone)
    - Game type toggle (Official / Practice)
    - Submit button with loading state
  - User actions: Submit → calls quickAddMatch Cloud Function

FRONTEND SERVICES:
- ScheduledMatchService (MODIFY)
  - Add: quickAddMatch(params) → calls 'quickAddMatch' Cloud Function
  - Method → Backend mapping: quickAddMatch → functions/match-proposals.js:quickAddMatch

BACKEND REQUIREMENTS:
⚠️ CLOUD FUNCTION MUST BE IMPLEMENTED IN /functions/match-proposals.js:
- Cloud Functions:
  - quickAddMatch({ teamId, opponentTeamId, dateTime, gameType }):
    - File: /functions/match-proposals.js
    - Purpose: Create a scheduledMatch directly, bypassing proposals
    - Validation:
      - User authenticated
      - User is leader/scheduler on teamId
      - opponentTeamId exists and is active
      - teamId ≠ opponentTeamId
      - dateTime is in the future
      - gameType is 'official' or 'practice'
      - Slot not already blocked for either team
    - Operations:
      - Derive weekId, slotId, scheduledDate from dateTime
      - Create scheduledMatch document
      - Create eventLog entry (MATCH_QUICK_ADDED)
    - Returns: { success: true, matchId: string } or { success: false, error: string }

- Function Exports Required:
  // In /functions/index.js add:
  exports.quickAddMatch = quickAddMatch;

- Firestore Operations:
  - scheduledMatches: CREATE new document
  - eventLog: CREATE new document

- Authentication/Authorization:
  - Must be authenticated
  - Must be leader or in schedulers[] of teamId
  - Must be a member of teamId (roster check)

- Event Logging:
  - Type: MATCH_QUICK_ADDED (new event type)
  - Category: SCHEDULING
  - Details: { matchId, teams, slotId, weekId, gameType, origin: 'quick_add' }

INTEGRATION POINTS:
- Frontend → Backend: ScheduledMatchService.quickAddMatch() → Cloud Function
- API Contract:
  - Request: { teamId: string, opponentTeamId: string, dateTime: string (ISO 8601), gameType: 'official'|'practice' }
  - Success: { success: true, matchId: string }
  - Error: { success: false, error: string }
- Real-time: Existing scheduledMatches listener in MatchesPanel picks up new document automatically
- Data flow: Submit → Cloud Function → scheduledMatches doc → onSnapshot → UI update
```

---

## 4. Schema Changes

### scheduledMatches — New Fields

```typescript
interface ScheduledMatchDocument {
  // ... existing fields ...

  // NEW: Origin tracking
  origin: 'proposal' | 'quick_add';   // How the match was created
  addedBy: string | null;              // userId who quick-added (null for proposal-created)

  // MODIFIED: These become optional for quick_add origin
  proposalId: string | null;           // null for quick_add matches
  confirmedByB: string | null;         // null for quick_add (no opponent confirmation)
  teamARoster: string[];               // empty [] for quick_add (no availability snapshot)
  teamBRoster: string[];               // empty [] for quick_add
}
```

### eventLog — New Event Type

```typescript
type EventType =
  | ... existing types ...
  | 'MATCH_QUICK_ADDED';              // NEW: Quick-add match created
```

### Migration Note
Existing scheduledMatch documents don't have `origin`. Treat missing `origin` as `'proposal'` in frontend code.

---

## 5. Integration Code Examples

### Modal Trigger (MatchesPanel)

```javascript
// In _renderAll(), modify the SCHEDULED MATCHES header:
const isScheduler = _userTeamIds.some(tid => TeamService.isScheduler(tid, currentUser.uid));

`<div class="flex items-center justify-between mb-2">
    <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Scheduled Matches
    </h3>
    ${isScheduler ? `
        <button id="quick-add-match-btn"
                class="text-muted-foreground hover:text-primary transition-colors"
                title="Quick add a match">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        </button>
    ` : ''}
</div>`

// In _handleClick():
if (target.closest('#quick-add-match-btn')) {
    const schedulerTeamIds = _userTeamIds.filter(tid =>
        TeamService.isScheduler(tid, AuthService.getCurrentUser().uid)
    );
    QuickAddMatchModal.show(schedulerTeamIds);
    return;
}
```

### Modal Component (QuickAddMatchModal.js)

```javascript
const QuickAddMatchModal = (function() {
    'use strict';
    let _keydownHandler = null;

    function show(schedulerTeamIds) {
        const allTeams = TeamService.getAllTeams();
        const userTimezone = TimezoneService.getUserTimezone();

        // Auto-select team if user is scheduler on only 1
        const autoTeamId = schedulerTeamIds.length === 1 ? schedulerTeamIds[0] : null;

        const html = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="quick-add-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm">
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h3 class="text-sm font-semibold text-foreground">Quick Add Match</h3>
                        <button id="quick-add-close" class="text-muted-foreground hover:text-foreground">✕</button>
                    </div>
                    <div class="p-4 space-y-3">
                        <!-- Your Team (hidden if only 1) -->
                        ${schedulerTeamIds.length > 1 ? `
                            <div>
                                <label class="text-xs text-muted-foreground">Your team</label>
                                <select id="qa-team" class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm">
                                    ${schedulerTeamIds.map(tid => {
                                        const t = TeamService.getTeamFromCache(tid);
                                        return `<option value="${tid}">${t?.teamName || tid}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        ` : `<input type="hidden" id="qa-team" value="${autoTeamId}">`}

                        <!-- Opponent Team -->
                        <div>
                            <label class="text-xs text-muted-foreground">Opponent</label>
                            <select id="qa-opponent" class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm">
                                <option value="">Select opponent...</option>
                                <!-- Populated dynamically, excluding user's selected team -->
                            </select>
                        </div>

                        <!-- Date -->
                        <div>
                            <label class="text-xs text-muted-foreground">Date</label>
                            <input type="date" id="qa-date"
                                   class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                                   min="${new Date().toISOString().split('T')[0]}">
                        </div>

                        <!-- Time -->
                        <div>
                            <label class="text-xs text-muted-foreground">Time (${userTimezone})</label>
                            <select id="qa-time" class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm">
                                <!-- 30-min intervals from 12:00-23:30 -->
                            </select>
                        </div>

                        <!-- Game Type -->
                        <div class="flex gap-2">
                            <button id="qa-type-official" class="flex-1 px-3 py-1.5 rounded text-xs font-medium
                                border border-green-500/50 bg-green-500/20 text-green-400">Official</button>
                            <button id="qa-type-practice" class="flex-1 px-3 py-1.5 rounded text-xs font-medium
                                border border-border text-muted-foreground">Practice</button>
                        </div>
                    </div>
                    <div class="p-4 border-t border-border">
                        <button id="qa-submit" class="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium
                                hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                            Add Match
                        </button>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('modal-container');
        container.innerHTML = html;
        container.classList.remove('hidden');
        _attachListeners(schedulerTeamIds);
    }

    async function _handleSubmit(schedulerTeamIds) {
        const btn = document.getElementById('qa-submit');
        btn.disabled = true;
        btn.textContent = 'Adding...';

        try {
            const teamId = document.getElementById('qa-team').value;
            const opponentTeamId = document.getElementById('qa-opponent').value;
            const date = document.getElementById('qa-date').value;
            const time = document.getElementById('qa-time').value;
            const gameType = document.getElementById('qa-type-official').classList.contains('bg-green-500/20')
                ? 'official' : 'practice';

            // Combine date + time in user's timezone, convert to ISO 8601 UTC
            const localDateTime = `${date}T${time}:00`;
            const dateTime = TimezoneService.localToUTC(localDateTime);

            const result = await ScheduledMatchService.quickAddMatch({
                teamId, opponentTeamId, dateTime, gameType
            });

            if (result.success) {
                ToastService.show('Match added!', 'success');
                close();
            } else {
                ToastService.show(result.error || 'Failed to add match', 'error');
                btn.disabled = false;
                btn.textContent = 'Add Match';
            }
        } catch (error) {
            console.error('Quick add match failed:', error);
            ToastService.show('Network error — please try again', 'error');
            btn.disabled = false;
            btn.textContent = 'Add Match';
        }
    }

    function close() { /* standard modal close pattern */ }

    return { show, close };
})();
```

### Service Layer (ScheduledMatchService)

```javascript
// Add to ScheduledMatchService:
async quickAddMatch({ teamId, opponentTeamId, dateTime, gameType }) {
    try {
        const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
        const functions = getFunctions(window.firebase.app, 'europe-west3');
        const fn = httpsCallable(functions, 'quickAddMatch');
        const result = await fn({ teamId, opponentTeamId, dateTime, gameType });
        return result.data;
    } catch (error) {
        console.error('quickAddMatch error:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}
```

### Cloud Function (match-proposals.js)

```javascript
exports.quickAddMatch = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const { teamId, opponentTeamId, dateTime, gameType } = data;

        // ── Validation ──
        if (!teamId || typeof teamId !== 'string')
            throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
        if (!opponentTeamId || typeof opponentTeamId !== 'string')
            throw new functions.https.HttpsError('invalid-argument', 'opponentTeamId is required');
        if (teamId === opponentTeamId)
            throw new functions.https.HttpsError('invalid-argument', 'Cannot add a match against your own team');
        if (!dateTime || isNaN(new Date(dateTime).getTime()))
            throw new functions.https.HttpsError('invalid-argument', 'dateTime must be a valid ISO 8601 string');
        if (new Date(dateTime) <= new Date())
            throw new functions.https.HttpsError('invalid-argument', 'Match must be in the future');
        if (!['official', 'practice'].includes(gameType))
            throw new functions.https.HttpsError('invalid-argument', 'gameType must be "official" or "practice"');

        // ── Read teams ──
        const [teamDoc, opponentDoc] = await Promise.all([
            db.collection('teams').doc(teamId).get(),
            db.collection('teams').doc(opponentTeamId).get()
        ]);
        if (!teamDoc.exists) throw new functions.https.HttpsError('not-found', 'Team not found');
        if (!opponentDoc.exists) throw new functions.https.HttpsError('not-found', 'Opponent team not found');

        const team = teamDoc.data();
        const opponent = opponentDoc.data();

        if (opponent.status !== 'active')
            throw new functions.https.HttpsError('failed-precondition', 'Opponent team is not active');

        // ── Authorization ──
        const isMember = team.playerRoster?.some(p => p.userId === userId);
        if (!isMember) throw new functions.https.HttpsError('permission-denied', 'You must be on this team');
        if (!isAuthorized(team, userId))
            throw new functions.https.HttpsError('permission-denied', 'Only leaders or schedulers can add matches');

        // ── Derive schedule fields from dateTime ──
        const matchDate = new Date(dateTime);
        const weekId = computeWeekId(matchDate);         // e.g., "2026-08"
        const slotId = computeSlotId(matchDate);          // e.g., "sun_2030" (UTC)
        const scheduledDate = matchDate.toISOString().split('T')[0]; // "2026-02-22"

        // ── Check for blocked slots ──
        const [teamBlocked, opponentBlocked] = await Promise.all([
            getBlockedSlotsForTeam(teamId, weekId),
            getBlockedSlotsForTeam(opponentTeamId, weekId)
        ]);
        if (teamBlocked.has(slotId))
            throw new functions.https.HttpsError('failed-precondition', 'Your team already has a match in this slot');
        if (opponentBlocked.has(slotId))
            throw new functions.https.HttpsError('failed-precondition', 'Opponent already has a match in this slot');

        // ── Create scheduled match ──
        const now = new Date();
        const matchRef = db.collection('scheduledMatches').doc();

        await matchRef.set({
            teamAId: teamId,
            teamAName: team.teamName,
            teamATag: team.teamTag,
            teamBId: opponentTeamId,
            teamBName: opponent.teamName,
            teamBTag: opponent.teamTag,
            weekId,
            slotId,
            scheduledDate,
            blockedSlot: slotId,
            blockedTeams: [teamId, opponentTeamId],
            teamARoster: [],    // No availability snapshot for quick-add
            teamBRoster: [],
            proposalId: null,   // No proposal involved
            origin: 'quick_add',
            addedBy: userId,
            status: 'upcoming',
            gameType,
            gameTypeSetBy: userId,
            confirmedAt: now,
            confirmedByA: userId,
            confirmedByB: null,  // No opponent confirmation
            createdAt: now
        });

        // ── Event log ──
        const eventId = generateEventId(team.teamName, 'match_quick_added');
        await db.collection('eventLog').doc(eventId).set({
            eventId,
            teamId,
            teamName: team.teamName,
            type: 'MATCH_QUICK_ADDED',
            category: 'SCHEDULING',
            timestamp: now,
            userId,
            details: {
                matchId: matchRef.id,
                slotId,
                weekId,
                gameType,
                origin: 'quick_add',
                teams: {
                    a: { id: teamId, name: team.teamName },
                    b: { id: opponentTeamId, name: opponent.teamName }
                }
            }
        });

        return { success: true, matchId: matchRef.id };

    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('quickAddMatch error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to add match');
    }
});
```

### Helper Functions Needed (match-proposals.js)

```javascript
/**
 * Derive ISO week ID (YYYY-WW) from a Date object.
 * Uses ISO 8601 week numbering (Monday-based weeks).
 */
function computeWeekId(date) {
    // Reuse existing getMondayOfWeek logic or ISO week calculation
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

/**
 * Derive slotId (e.g., "sun_2030") from a Date object in UTC.
 */
function computeSlotId(date) {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const day = days[date.getUTCDay()];
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day}_${hours}${mins}`;
}
```

---

## 6. Performance Classification

```
HOT PATHS (<50ms):
- Opening modal: Instant — team list comes from TeamService cache
- Toggling game type: Pure DOM toggle, no backend call

COLD PATHS (<2s):
- Submit: Cloud Function call — show loading state ("Adding...")
- After submit: UI updates via existing onSnapshot listener (already set up)

BACKEND PERFORMANCE:
- Cloud Function reads: 2 team docs + 2 blocked-slot queries = ~4 reads
- No transaction needed (single write, blocked-slot check is advisory)
- No new indexes required (uses existing blockedTeams array-contains + weekId)
```

---

## 7. Data Flow Diagram

```
Click "+" → QuickAddMatchModal.show()
         → Fill form (team, opponent, date, time, type)
         → Submit
         → ScheduledMatchService.quickAddMatch()
         → Cloud Function: quickAddMatch
         → Validate + derive weekId/slotId + check blocked slots
         → Create scheduledMatches doc + eventLog doc
         → Return { success, matchId }
         → Toast "Match added!"
         → Modal closes
         → Existing onSnapshot on scheduledMatches fires
         → MatchesPanel._renderAll() re-renders right column
         → UpcomingMatchesPanel re-renders (both teams see the match)
```

---

## 8. Test Scenarios

```
FRONTEND TESTS:
- [ ] "+" button visible only when user is leader/scheduler
- [ ] "+" button hidden for regular members
- [ ] Modal opens with correct team pre-selected (single team)
- [ ] Modal shows team dropdown when user is on 2 teams
- [ ] Opponent dropdown excludes user's selected team
- [ ] Date picker prevents past dates
- [ ] Time picker shows 30-min intervals
- [ ] Game type toggle switches visual state
- [ ] Submit button disabled until all fields filled
- [ ] Loading state shown during submission
- [ ] Success toast + modal close on success
- [ ] Error toast + form stays open on failure

BACKEND TESTS:
- [ ] Rejects unauthenticated requests
- [ ] Rejects non-member of team
- [ ] Rejects non-leader/non-scheduler
- [ ] Rejects self-match (teamId === opponentTeamId)
- [ ] Rejects past dateTime
- [ ] Rejects invalid gameType
- [ ] Rejects when slot is blocked for either team
- [ ] Creates scheduledMatch with correct fields (origin, addedBy, etc.)
- [ ] Creates eventLog with MATCH_QUICK_ADDED type
- [ ] Returns matchId on success

INTEGRATION TESTS (CRITICAL):
- [ ] Submit → Cloud Function → scheduledMatch doc → listener fires → UI shows new match
- [ ] New match appears in BOTH teams' scheduled matches panels
- [ ] New match blocks the slot for both teams in future proposals
- [ ] Quick-added match shows in UpcomingMatchesPanel (bottom-left)
- [ ] Cloud Function error → toast error → form still open
- [ ] Permission denied → user sees explanation

END-TO-END:
- [ ] Leader quick-adds match → appears in Matches tab right column
- [ ] Opponent team member sees match in their view (without logging out/in)
- [ ] Quick-added match correctly blocks slot in proposal viable-slot computation
```

---

## 9. Common Integration Pitfalls

- [ ] Forgetting to add `origin: 'quick_add'` field — existing code rendering matches must handle missing `origin` gracefully (treat as `'proposal'`)
- [ ] Not exporting `quickAddMatch` in `functions/index.js`
- [ ] Forgetting `europe-west3` region on both frontend `getFunctions()` and backend function definition
- [ ] Time picker showing local times but sending UTC without conversion — must use `TimezoneService.localToUTC()`
- [ ] Submit button not re-enabled after error (always use `finally` block)
- [ ] Opponent dropdown not updating when user switches their team (if on 2 teams)
- [ ] Missing `blockedTeams` array on the new document — breaks double-booking prevention queries
- [ ] `computeWeekId` using different ISO week logic than existing `week-utils.js` — reuse existing functions

---

## 10. Implementation Notes

### Files to Create
- `public/js/components/QuickAddMatchModal.js` — New modal component

### Files to Modify
- `public/js/components/MatchesPanel.js` — Add "+" button + click handler
- `public/js/services/ScheduledMatchService.js` — Add `quickAddMatch()` method
- `functions/match-proposals.js` — Add `quickAddMatch` Cloud Function + helper functions
- `functions/index.js` — Export `quickAddMatch`
- `public/index.html` — Add `<script>` tag for QuickAddMatchModal.js
- `context/SCHEMA.md` — Document new fields (`origin`, `addedBy`) and event type

### Patterns to Follow
- Modal: Follow `KickPlayerModal.js` pattern (backdrop, ESC close, backdrop click close)
- Cloud Function: Follow `createProposal` pattern (v1, region europe-west3, isAuthorized check)
- Event logging: Follow existing `generateEventId` + `eventLog` pattern from `confirmSlot`
- Service call: Follow existing `httpsCallable` pattern in `ScheduledMatchService`

### Reuse Existing
- `isAuthorized()` from match-proposals.js (already handles leader + schedulers)
- `getBlockedSlotsForTeam()` for double-booking checks
- `generateEventId()` for event log document IDs
- `computeScheduledDate()` from week-utils.js (may need adaptation for free-form dates)
- `TimezoneService` for local ↔ UTC conversion on frontend

### Edge Cases
- User on 2 teams that are opponents of each other — allow it (they pick which side)
- Match date far in the future (no availability data) — fine, no availability needed
- Same opponent, same slot — blocked-slot check prevents duplicates
- User switches team in dropdown — must refresh opponent list to exclude new selection
