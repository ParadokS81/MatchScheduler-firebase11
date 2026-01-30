# Slice 5.1a: QW Hub Tag Configuration

## Status: REVISED — Merged into teamTag

### Decision (2026-01-29)
During implementation, we realized that QW Hub tags and in-game team tags are the same thing.
Rather than maintaining a separate `qwHubTag` field, we merged this into the existing `teamTag` field.

### What Changed
1. **No separate `qwHubTag` field** — `teamTag` IS the QW Hub tag
2. **No TeamManagementModal changes** — leaders already set teamTag at team creation
3. **No QWHubService** — validation deferred to Slice 5.1b when match history is displayed
4. **Relaxed `teamTag` validation** to allow real QW in-game tags:
   - Case-sensitive (no forced uppercase) — e.g., `]SR[`, `GoF!`, `tSQ`
   - Special characters allowed: `[] () {} - _ . , !`
   - Min 1 char, max 4 chars (QW scoreboard limit)
5. **Seed scripts updated** with real QW tags as `teamTag`

### Files Modified
- `public/js/services/TeamService.js` — relaxed `validateTeamTag()` regex
- `functions/team-operations.js` — relaxed server-side validation, removed `.toUpperCase()`
- `scripts/seed-big4-teams.js` — real QW tags in `generateTeamTag()`
- `context/SCHEMA.md` — updated `teamTag` description

### Impact on Downstream Slices
- **Slice 5.1b (match history)**: Use `teamData.teamTag` directly for QW Hub API lookups
- **Slice 5.1c (head-to-head)**: Same — use `teamTag` for comparisons
- **QWHubService**: Still needed in 5.1b for API calls, but no longer needs a separate tag field
