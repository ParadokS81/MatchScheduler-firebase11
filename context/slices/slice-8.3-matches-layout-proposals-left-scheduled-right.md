# Slice 8.3: Matches Panel Layout — Proposals Left, Scheduled Right

**Dependencies:** Slice 8.0 (Match Proposals), Slice 8.2a (Cancel Match), Slice 8.2c (Compact Match Display)
**Supersedes:** Slice 8.2b column layout (was 3-week columns + upcoming column; never fully implemented)

**User Story:** As a team scheduler, I see all my proposals grouped by week on the left and only confirmed matches on the right, so I immediately know what needs action vs what's locked in.

**Success Criteria:**
- [ ] Left column shows all active proposals, grouped by week: current week first, future weeks next, past weeks at bottom
- [ ] Right column shows ONLY confirmed/scheduled matches (no proposals)
- [ ] Past-week proposals no longer labeled "Upcoming" (bug fix)
- [ ] Week group headers clearly show week number and date range
- [ ] Archived proposals remain in collapsed section at bottom (unchanged)
- [ ] Existing functionality preserved: expand/collapse, confirm/withdraw, cancel, Discord contact, game type toggle, standin toggle, roster tooltip

---

## Scope

**This is a frontend-only change.** No backend, no Cloud Functions, no schema changes, no new Firestore listeners. The only file modified is `MatchesPanel.js` (the `_renderAll` function) and minor CSS in `src/css/input.css`.

---

## Design Decisions

| Decision | Answer | Rationale |
|----------|--------|-----------|
| Column split | Keep ~60/40 (flex-[3] / flex-[2]) | Proposals need more space for card content |
| Left column grouping | Current week → future weeks → past weeks | Most important first; past proposals still visible but deprioritized |
| Right column title | "Scheduled Matches" | Clear, matches existing label already used in 8.2c |
| Empty right column | Header only, no placeholder text | User preference — "Scheduled Matches" header is self-explanatory |
| Empty left column | "No active proposals" italic placeholder | Needed to avoid completely blank panel |
| Week group headers | Same `.future-week-header` style | Consistent with existing design |
| Current week highlight | Slightly brighter header text | Distinguishes "this week" from other groups |
| Past week handling | Show below future weeks, dimmed header | Still actionable (proposals may still be active), but visually deprioritized |

---

## Full Stack Architecture

### FRONTEND COMPONENTS

**MatchesPanel** (MODIFY: `public/js/components/MatchesPanel.js`)
- Firebase listeners: **Unchanged** — same proposal + scheduledMatch listeners
- Cache interactions: **Unchanged** — reads ProposalService, ScheduledMatchService, TeamService caches
- UI change: Replace `_renderAll()` layout logic
  - **Left column**: All active proposals grouped by week (current → future → past)
  - **Right column**: Scheduled matches only (existing `_renderUpcomingMatchCompact`)
  - **Bottom**: Archived section (unchanged)
- User actions: **All unchanged** — expand, collapse, confirm, withdraw, cancel, Discord, game type, standin, roster tooltip

### FRONTEND SERVICES

**No changes.** All data access methods already exist.

### BACKEND REQUIREMENTS

**None.** Pure frontend layout refactor.

### CSS

**Minor changes** to `src/css/input.css`:
- New `.week-group-header` style (or reuse `.future-week-header` with variant for current week)
- Past-week group gets dimmed styling

---

## Integration Code Examples

### New `_renderAll()` Layout Logic

```javascript
async function _renderAll() {
    if (!_container) return;
    _hideRosterTooltip();

    const proposals = ProposalService.getProposalsFromCache();
    await _ensureAvailabilityLoaded(proposals);

    const now = new Date();
    const currentWeek = _getCurrentWeek();

    // ─── Categorize proposals ───────────────────────────────
    const currentWeekProposals = [];
    const futureWeekGroups = {};   // weekId → proposals[]
    const pastWeekGroups = {};     // weekId → proposals[]
    const archived = [];

    for (const p of proposals) {
        if (p.status === 'active') {
            if (p.expiresAt && p.expiresAt.toDate && p.expiresAt.toDate() < now) {
                archived.push(p);
            } else if (p.weekId === currentWeek.weekId) {
                currentWeekProposals.push(p);
            } else if (p.weekId > currentWeek.weekId) {
                if (!futureWeekGroups[p.weekId]) futureWeekGroups[p.weekId] = [];
                futureWeekGroups[p.weekId].push(p);
            } else {
                // Past week — still active proposal but week has passed
                if (!pastWeekGroups[p.weekId]) pastWeekGroups[p.weekId] = [];
                pastWeekGroups[p.weekId].push(p);
            }
        } else if (p.status !== 'confirmed') {
            archived.push(p);
        }
    }

    const futureWeekIds = Object.keys(futureWeekGroups).sort();
    const pastWeekIds = Object.keys(pastWeekGroups).sort().reverse(); // Most recent past first

    // ─── Scheduled matches (right column) ───────────────────
    const scheduledMatches = ScheduledMatchService.getUpcomingMatchesForTeams(_userTeamIds);
    scheduledMatches.sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

    // ─── Build left column: proposals grouped by week ───────
    const hasAnyProposals = currentWeekProposals.length > 0
        || futureWeekIds.length > 0
        || pastWeekIds.length > 0;

    let leftColumnHtml = '';

    // Current week group
    leftColumnHtml += `
        <div class="week-group">
            <div class="week-group-header current">
                This Week · W${String(currentWeek.weekNumber).padStart(2, '0')} · ${currentWeek.dateRange}
            </div>
            <div class="space-y-2">
                ${currentWeekProposals.length > 0
                    ? currentWeekProposals.map(p => _renderProposalCard(p, 'active')).join('')
                    : '<p class="text-xs text-muted-foreground/50 italic">No proposals this week</p>'}
            </div>
        </div>
    `;

    // Future week groups
    for (const weekId of futureWeekIds) {
        const [yearStr, weekStr] = weekId.split('-');
        const weekNum = parseInt(weekStr);
        const year = parseInt(yearStr);
        const dateRange = _getWeekDateRange(weekNum, year);
        leftColumnHtml += `
            <div class="week-group">
                <div class="week-group-header">
                    W${String(weekNum).padStart(2, '0')} · ${dateRange}
                </div>
                <div class="space-y-2">
                    ${futureWeekGroups[weekId].map(p => _renderProposalCard(p, 'active')).join('')}
                </div>
            </div>
        `;
    }

    // Past week groups (dimmed)
    for (const weekId of pastWeekIds) {
        const [yearStr, weekStr] = weekId.split('-');
        const weekNum = parseInt(weekStr);
        const year = parseInt(yearStr);
        const dateRange = _getWeekDateRange(weekNum, year);
        leftColumnHtml += `
            <div class="week-group">
                <div class="week-group-header past">
                    W${String(weekNum).padStart(2, '0')} · ${dateRange}
                </div>
                <div class="space-y-2">
                    ${pastWeekGroups[weekId].map(p => _renderProposalCard(p, 'active')).join('')}
                </div>
            </div>
        `;
    }

    // ─── Assemble layout ────────────────────────────────────
    _container.innerHTML = `
        <div class="matches-panel h-full flex flex-col">
            <div class="flex-1 flex gap-4 p-3 overflow-hidden min-h-0">
                <!-- LEFT: ALL PROPOSALS BY WEEK -->
                <div class="flex-[3] min-w-0 flex flex-col overflow-y-auto space-y-4">
                    ${leftColumnHtml}
                </div>

                <!-- RIGHT: SCHEDULED MATCHES ONLY -->
                <div class="flex-[2] min-w-0 flex flex-col border-l border-border pl-4">
                    <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Scheduled Matches
                    </h3>
                    <div class="flex-1 overflow-y-auto space-y-1">
                        ${scheduledMatches.map(m => _renderUpcomingMatchCompact(m)).join('')}
                    </div>
                </div>
            </div>

            ${archived.length > 0 ? _renderArchivedSection(archived) : ''}
        </div>
    `;

    window.dispatchEvent(new CustomEvent('matches-panel-rendered'));
}
```

### New CSS Classes (src/css/input.css)

```css
/* Week group headers in proposals column */
.week-group-header {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--muted-foreground);
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0.5rem;
}

/* Current week: slightly brighter */
.week-group-header.current {
    color: var(--foreground);
}

/* Past weeks: dimmed */
.week-group-header.past {
    color: var(--muted-foreground);
    opacity: 0.6;
}
```

---

## Bug Fix: Past Weeks as "Upcoming"

**Root cause:** Lines 249-259 in current `_renderAll()` — the `else` branch categorizes everything that isn't `currentWeek.weekId` as "future", including past weeks.

**Fix:** The new categorization logic (shown above) explicitly compares `p.weekId` against `currentWeek.weekId` using string comparison (`>` for future, `<` for past). Since weekIds are formatted as `YYYY-WW` with zero-padded weeks, string comparison correctly orders them.

---

## Performance Classification

```
HOT PATHS (<50ms):
- Re-render after listener update: Cache reads only, no async (instant DOM swap)
- Expand/collapse proposal: Local state toggle + re-render
- Toggle archived section: DOM visibility toggle

COLD PATHS (<2s):
- Initial load: Firestore queries for proposals + matches (existing, unchanged)
- Availability load on expand: Firestore reads (lazy, per-card, existing)

BACKEND PERFORMANCE:
- No backend changes — N/A
```

---

## Data Flow Diagram

```
Page Load (unchanged):
MatchesPanel.init() → _setupProposalListeners() + _setupScheduledMatchListeners()
→ onSnapshot fires → ProposalService.updateCache() + ScheduledMatchService.updateCache()
→ _renderAll()

_renderAll() data flow (CHANGED):
1. Get all proposals from cache
2. Categorize: current week | future weeks (sorted asc) | past weeks (sorted desc) | archived
3. Get scheduled matches from cache (for right column)
4. Render left column: week groups with proposal cards
5. Render right column: scheduled matches only
6. Render archived section at bottom
```

---

## Test Scenarios

```
FRONTEND TESTS:
- [ ] Current week proposals appear in "This Week" group at top of left column
- [ ] Future week proposals appear below current week, each in their own group
- [ ] Past week proposals appear at bottom of left column with dimmed headers
- [ ] Past week proposals are NOT labeled "Upcoming" (bug fix verified)
- [ ] Right column shows ONLY scheduled matches, no proposals
- [ ] Right column header says "Scheduled Matches"
- [ ] Empty right column shows just the header (no placeholder text)
- [ ] Empty current week shows italic "No proposals this week" text
- [ ] Week group headers show correct format: "W07 · Feb 16-22"
- [ ] Current week header is visually distinct (brighter text)
- [ ] Archived section still works (collapsed/expanded toggle)

EXISTING FUNCTIONALITY (regression check):
- [ ] Expand/collapse proposal cards works
- [ ] Confirm slot works (with game type selection)
- [ ] Withdraw confirmation works
- [ ] Cancel proposal works
- [ ] Cancel scheduled match works (from right column)
- [ ] Discord contact button works
- [ ] Game type (OFF/PRAC) toggle works
- [ ] Standin toggle works
- [ ] Roster tooltip on hover works
- [ ] "Load Grid View" button works
- [ ] Deep link to proposal (expandProposal) works

EDGE CASES:
- [ ] Week navigation change triggers correct re-categorization
- [ ] Proposal for a week far in the future appears in correct group
- [ ] Multiple proposals in same future week group correctly
- [ ] Proposal that spans week boundary (expires after week change) categorized correctly
```

---

## Common Integration Pitfalls

- [ ] **String comparison for weekIds** — `"2026-06" < "2026-07"` works because of zero-padding; verify weeks 1-9 are padded (`"2026-01"` not `"2026-1"`)
- [ ] **WeekNavigation vs actual calendar week** — `_getCurrentWeek()` uses `WeekNavigation.getCurrentWeekNumber()` which returns the *navigated* week, not necessarily today's week. This is intentional (user may navigate to different weeks).
- [ ] **Scheduled matches listener unchanged** — Right column still fed by `ScheduledMatchService.getUpcomingMatchesForTeams()` which filters `status='upcoming'` — no change needed
- [ ] **Don't break event delegation** — The central `_handleClick` uses `data-action` attributes on DOM elements. New week-group wrappers must not interfere with click bubbling.
- [ ] **Expanded card state preserved across re-renders** — `_expandedProposalId` must still work; proposal cards rendered inside week groups must keep the same `data-proposal-id` attributes.
- [ ] **Scroll position reset on re-render** — `innerHTML` replacement resets scroll. Left column scroll position will reset on each listener update. This is existing behavior (acceptable for now).
- [ ] **No empty state text on right column** — User explicitly said header is sufficient. Don't add placeholder text.
- [ ] **CSS: use `.future-week-header` or new `.week-group-header`** — If reusing existing class, ensure current-week variant styling doesn't break other uses of `.future-week-header`. Recommend new class name to avoid conflict.
- [ ] **Archived proposals: don't double-count** — Expired active proposals go to `archived`, not to past-week groups. The `expiresAt` check must happen before the week comparison.
- [ ] **Availability pre-load still needed** — `_ensureAvailabilityLoaded()` must receive all active proposals (from all week groups), not just current week.

---

## Implementation Notes

### What Changes
1. **`_renderAll()` in MatchesPanel.js** — Replace the categorization logic (lines 244-265) and layout template (lines 285-320)
2. **`src/css/input.css`** — Add `.week-group-header` with `.current` and `.past` variants
3. **Remove**: The `futureWeeksHtml` variable and `_renderFutureWeekGroup()` helper become unnecessary (inline into the new loop), or repurpose them

### What Does NOT Change
- `_renderProposalCard()` — Cards render identically, just in different containers
- `_renderUpcomingMatchCompact()` — Scheduled match rows are identical
- `_renderArchivedSection()` — Same collapsed section at bottom
- `_renderExpandedProposal()` — Expanded card content unchanged
- All event handlers — Same delegation pattern
- All Firestore listeners — Same queries
- All services — No API changes

### Files Touched
| File | Change |
|------|--------|
| `public/js/components/MatchesPanel.js` | Modify `_renderAll()`, remove/refactor `_renderFutureWeekGroup()` |
| `src/css/input.css` | Add `.week-group-header` styles (~10 lines) |

### Estimated Effort
~30 minutes. This is a focused refactor of one render function + minor CSS.
