# Slice 8.0 Testing Session Notes

## Status: COMPLETE (Test 10 partial - Load Grid View broken, tracked in slice 8.1)

## Bugs Found & Fixed
1. **Security rules** - `involvedTeamMembers` check fails on list queries. Fixed: simplified to auth-only read.
2. **Availability not pre-loaded** - Proposal cards showed 0 slots because opponent availability wasn't in cache. Fixed: `_ensureAvailabilityLoaded()` in MatchesPanel pre-loads before render.
3. **Card naming** - Showed only one team name. Fixed: always show "Proposer vs Opponent".
4. **`_isSlotPast` wrong week calc** - Used ISO week formula that disagreed with AvailabilityGrid's `getMondayOfWeek()` by 1 week. All slots appeared "past". Fixed: aligned with AvailabilityGrid logic.
5. **Seed script** - Didn't clean up matchProposals/scheduledMatches on reseed. Fixed: added `clearCollection()`.
6. **Clipboard** - `navigator.clipboard.writeText` fails on HTTP localhost (WSL). Not a bug, dev-only. Already has try/catch fallback.
7. **ComparisonEngine.getComparisonState()** didn't include `filters` in return. Proposals always saved as 1v1. Fixed: added `filters: { ..._filters }`.
8. **confirmSlot transaction ordering** - Read availability docs AFTER writes when match detected. Firestore requires all reads before writes. Fixed: moved all availability reads to top of transaction.

## Tests Completed
- [x] Test 1: Scheduler delegation toggle (works)
- [x] Test 2: Propose Match from ComparisonModal (works after fixes)
- [x] Test 3: Matches tab - proposal card appears with correct slot count
- [x] Test 4: Expand card - 22 slots with "X vs Y" counts + Confirm buttons
- [x] Test 5: Confirm slot as proposer (works)
- [x] Test 6: Opponent confirms same slot -> match scheduled (works after transaction fix)
- [x] Test 7: Withdraw confirmation (works)
- [x] Test 8: Cancel proposal (works)
- [x] Test 9: Permission checks - Bella Knight no buttons, Alex Storm has buttons (works)

- [x] Test 10a: Rapid clicks - confirm/withdraw spam works correctly, no duplicates
- [x] Test 10b: Duplicate proposal prevention - blocks same team+week combo
- [ ] Test 10c: Load Grid View - **NON-FUNCTIONAL** (tracked in slice 8.1)
- [ ] Test 10d: Blocked slots after scheduling - not tested (depends on Load Grid View working)

## Post-Testing TODOs (Fix After Testing Complete)
1. **Extract shared `getMondayOfWeek` utility** - Currently duplicated in AvailabilityGrid, WeekDisplay, and MatchesPanel._isSlotPast. Should be a single shared function to prevent week calculation mismatches. Add to a DateUtils or WeekUtils module.
2. **Add CLAUDE.md note** about canonical week calculation source.

## Key Context for Continuation
- Current user: ParadokS (dev-user-001), leader of Dev Squad (team-dev-001)
- Active proposal: Dev Squad vs Phoenix Rising, W05, 22 slots, Min 1v1
- DevToolbar (red DEV button bottom-left) switches users
- Emulator running: Firestore :8080, Functions :5001, Auth :9099, Hosting :5000
- Test walkthrough checklist: docs/TESTING-8.0.md
- Slice spec: context/slices/slice-8.0-match-proposals.md

## Files Modified During Testing
- `firestore.rules` - simplified matchProposals read rule
- `public/js/components/MatchesPanel.js` - availability preload, card naming, _isSlotPast fix, debug logs removed
- `public/js/services/ProposalService.js` - debug logs removed
- `scripts/seed-emulator.js` - clearCollection for matchProposals/scheduledMatches
