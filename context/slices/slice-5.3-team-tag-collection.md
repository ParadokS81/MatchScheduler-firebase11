# Slice 5.3: Team Tag Collection

## 1. Slice Definition

- **Slice ID:** 5.3
- **Name:** Team Tag Collection
- **User Story:** As a team leader, I can add multiple historical team tags to my team so that match history, H2H stats, and map stats aggregate results from all tags the team has played under.
- **Success Criteria:** Leader adds tags via Team Settings → QWHub/QWStats queries use all tags → Match history shows unified results deduplicated by match ID → H2H and Form tabs work with multi-tag teams.

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Team Management: Multi-tag storage with primary designation
- QWHub Integration: Aggregate match history across multiple tags
- QWStats Integration: Aggregate H2H/form/map stats across multiple tags

DEPENDENT SECTIONS:
- Team Settings Modal: Existing tag editing UI (Slice 6.0a)
- QWHub API: Existing Supabase query patterns (Slice 5.1b)
- QWStats API: Existing PostgreSQL query patterns (Slice 11.0a)

IGNORED SECTIONS:
- Tag uniqueness enforcement (different teams CAN share historical tags)
- Auto-detection of historical tags from QWHub data
```

---

## 3. Full Stack Architecture

### FRONTEND COMPONENTS

**TeamManagementModal** (`public/js/components/TeamManagementModal.js`)
- Firebase listeners: Existing team doc listener (no change)
- Cache interactions: Reads `teamTags[]` from TeamService cache
- UI responsibilities:
  - Render tag chips with remove buttons
  - One chip marked as primary (star icon)
  - Input + "Add" button for new tags
  - Click star on non-primary chip to change primary
- User actions:
  - Add tag → calls `updateTeamTags` Cloud Function
  - Remove tag → calls `updateTeamTags` Cloud Function
  - Set primary → calls `updateTeamTags` Cloud Function

### FRONTEND SERVICES

**QWHubService** (`public/js/services/QWHubService.js`)
- Modified methods:
  - `getRecentMatches(teamTags[], limit)` — accepts array, parallel queries, merge + dedup
  - `getMatchHistory(teamTags[], months)` — same pattern
  - `getTeamMapStats(teamTags[], months)` — same pattern
  - `getH2HMatches(teamTagsA[], teamTagsB[])` — cross-product queries, dedup

**QWStatsService** (`public/js/services/QWStatsService.js`)
- Modified methods:
  - `getH2H(teamTagsA[], teamTagsB[], opts)` — passes arrays to backend
  - `getForm(teamTags[], opts)` — passes array to backend
  - `getMaps(teamTags[], opts)` — passes array to backend
  - `getRoster(teamTags[], opts)` — passes array to backend

**TeamService** (`public/js/services/TeamService.js`)
- New helper: `getTeamAllTags(teamId)` — returns all tags (lowercased) from cache
- New helper: `getTeamPrimaryTag(teamId)` — returns primary tag from cache

### BACKEND REQUIREMENTS

**Cloud Function: `updateTeamTags`**
- File: `/functions/team-operations.js`
- Purpose: Add/remove tags, change primary designation
- Parameters: `{ teamId, teamTags: [{ tag: string, isPrimary: boolean }] }`
- Validation:
  - User must be team leader
  - Each tag: 1-4 chars, valid QW chars regex
  - Exactly one tag marked isPrimary
  - At least 1 tag (can't have empty)
  - Max 6 tags (practical limit)
- Operations:
  - Update `/teams/{teamId}` → `teamTags` array and `teamTag` (primary)
  - Propagate primary tag change to active proposals/scheduled matches (existing `_propagateTeamTagChange`)
- Returns: `{ success: true }` or `{ success: false, error: "message" }`
- Event log: `team-tags-updated` with old/new tags

**QWStats API: Update all endpoints to accept tag arrays**
- File: `/qw-stats/api/server.js`
- Endpoints to update:
  - `GET /api/h2h?teamA=tag1,tag2&teamB=tag3,tag4` → SQL `ANY($1::text[])`
  - `GET /api/form?team=tag1,tag2` → SQL `ANY($1::text[])`
  - `GET /api/maps?team=tag1,tag2` → SQL `ANY($1::text[])`
  - `GET /api/roster?team=tag1,tag2` → SQL `ANY($1::text[])`
- SQL change pattern:
  ```sql
  -- Before:
  WHERE g.team_a_ascii = $1
  -- After:
  WHERE g.team_a_ascii = ANY($1::text[])
  ```

### FIRESTORE SCHEMA CHANGE

```javascript
// /teams/{teamId}
{
    teamTag: "SR",           // Primary tag (kept for backward compat + display)
    teamTags: [              // NEW: All tags for stats aggregation
        { tag: "SR", isPrimary: true },
        { tag: "]sr[", isPrimary: false },
        { tag: "slax", isPrimary: false }
    ],
    // ... rest of team document unchanged
}
```

**Migration:** One-time script to populate `teamTags` from existing `teamTag`:
```javascript
// For each team: teamTags = [{ tag: teamData.teamTag, isPrimary: true }]
```

### INTEGRATION POINTS

- Frontend → Backend: `TeamService.callFunction('updateTeamTags', { teamId, teamTags })`
- Frontend → QWHub API: `QWHubService.getRecentMatches(tags)` fires parallel Supabase queries per tag
- Frontend → QWStats API: `QWStatsService.getH2H(tagsA, tagsB)` passes comma-separated to query param
- Real-time: Existing team doc listener picks up `teamTags` changes automatically
- Cache: `TeamService.getTeamAllTags(teamId)` reads from cached team doc

---

## 4. Integration Code Examples

### Tag Management UI → Backend

```javascript
// In TeamManagementModal — handling "Add Tag" click
async function _handleAddTag() {
    const newTag = document.getElementById('new-tag-input').value.trim();
    if (!newTag) return;

    const validation = TeamService.validateTeamTag(newTag);
    if (validation) {
        _showTagError(validation);
        return;
    }

    // Build updated tags array
    const currentTags = [...(_teamData.teamTags || [])];
    if (currentTags.some(t => t.tag.toLowerCase() === newTag.toLowerCase())) {
        _showTagError('Tag already exists');
        return;
    }
    currentTags.push({ tag: newTag, isPrimary: false });

    _setTagsLoading(true);
    try {
        const result = await TeamService.callFunction('updateTeamTags', {
            teamId: _teamId,
            teamTags: currentTags
        });
        if (!result.success) {
            _showTagError(result.error || 'Failed to add tag');
        }
        // Success: listener will update UI
    } catch (err) {
        _showTagError('Network error — try again');
    } finally {
        _setTagsLoading(false);
    }
}
```

### QWHubService — Parallel Multi-Tag Query

```javascript
// QWHubService.getRecentMatches — updated for tag arrays
async function getRecentMatches(teamTags, limit = 5) {
    if (!Array.isArray(teamTags)) teamTags = [teamTags];
    const apiTags = teamTags.map(t => t.toLowerCase());

    // Check cache for each tag, fire queries only for uncached
    const results = [];
    const uncached = [];
    for (const tag of apiTags) {
        const cached = _matchCache.get(tag);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
            results.push(...cached.data);
        } else {
            uncached.push(tag);
        }
    }

    // Parallel fetch uncached tags
    if (uncached.length > 0) {
        const fetches = uncached.map(tag => _fetchMatchesForTag(tag));
        const fetchResults = await Promise.all(fetches);
        for (let i = 0; i < uncached.length; i++) {
            _matchCache.set(uncached[i], { data: fetchResults[i], fetchedAt: Date.now() });
            results.push(...fetchResults[i]);
        }
    }

    // Deduplicate by match ID, sort by timestamp desc, limit
    const seen = new Set();
    const deduped = results.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
    deduped.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return deduped.slice(0, limit);
}
```

### QWStats API — SQL with ANY()

```javascript
// qw-stats/api/server.js — H2H endpoint updated
app.get('/api/h2h', async (req, res) => {
    const tagsA = req.query.teamA.split(',').map(t => t.trim().toLowerCase());
    const tagsB = req.query.teamB.split(',').map(t => t.trim().toLowerCase());

    const query = `
        SELECT g.id, g.played_at, g.map,
               g.team_a_ascii, g.team_b_ascii,
               g.team_a_frags, g.team_b_frags,
               g.demo_sha256
        FROM games g
        WHERE g.is_clan_game
          AND ((g.team_a_ascii = ANY($1::text[]) AND g.team_b_ascii = ANY($2::text[]))
            OR (g.team_a_ascii = ANY($2::text[]) AND g.team_b_ascii = ANY($1::text[])))
          AND g.played_at >= $3
        ORDER BY g.played_at DESC LIMIT $4
    `;
    const result = await pool.query(query, [tagsA, tagsB, sinceDate, limit]);
    // ... format response
});
```

### Callers Pass Tag Arrays

```javascript
// TeamsBrowserPanel._loadH2HData() — updated to pass all tags
async function _loadH2HData(teamA, teamB) {
    const tagsA = TeamService.getTeamAllTags(teamA.id); // ["sr", "]sr[", "slax"]
    const tagsB = TeamService.getTeamAllTags(teamB.id); // ["ving", "v!ng"]

    const [h2hData, formA, formB, rosterA, rosterB] = await Promise.all([
        QWStatsService.getH2H(tagsA, tagsB, { months, limit }),
        QWStatsService.getForm(tagsA, { months, limit }),
        QWStatsService.getForm(tagsB, { months, limit }),
        QWStatsService.getRoster(tagsA, { months }),
        QWStatsService.getRoster(tagsB, { months })
    ]);
    // ... render H2H panel
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Reading team tags from cache: TeamService.getTeamAllTags() — instant from _teamCache
- Rendering tag chips in modal: Pure DOM render from cached data
- QWHub cached queries: Per-tag cache hit returns instantly

COLD PATHS (<2s):
- Adding/removing tags: Cloud Function call + loading state on button
- QWHub uncached queries: Parallel fetch, ~500ms per tag, show loading spinner
- QWStats queries with tag arrays: Single SQL query, ~200-500ms

BACKEND PERFORMANCE:
- updateTeamTags Cloud Function: Single Firestore update + propagation batch (~500ms)
- QWStats SQL with ANY(): Uses existing indexes on team_a_ascii/team_b_ascii — no new indexes needed, ANY() leverages btree indexes
- No cold start concern — shares existing v1 function container
```

---

## 6. Data Flow Diagram

### Tag Management Flow
```
Leader clicks "Add Tag" → TeamManagementModal._handleAddTag()
    → TeamService.callFunction('updateTeamTags', { teamId, teamTags })
        → Cloud Function validates + updates /teams/{teamId}
            → Propagates primary tag to proposals/matches
                → onSnapshot fires on team doc
                    → TeamService.updateCachedTeam()
                    → TeamManagementModal re-renders tag chips
```

### Stats Query Flow (after tags saved)
```
User opens Match History tab
    → QWHubService.getRecentMatches(TeamService.getTeamAllTags(teamId))
        → Per-tag cache check (instant if cached)
        → Parallel Supabase queries for uncached tags
        → Merge + deduplicate by match ID
        → Sort by timestamp, apply limit
    → Render match cards

User opens H2H tab
    → QWStatsService.getH2H(tagsA[], tagsB[], opts)
        → GET /api/h2h?teamA=sr,]sr[,slax&teamB=ving,v!ng
            → SQL: WHERE team_a_ascii = ANY($1) AND team_b_ascii = ANY($2)
        → Return unified results
    → Render H2H panel
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] Tag chips render correctly from teamTags array
- [ ] Primary tag shows star icon, others don't
- [ ] Add tag input validates (1-4 chars, valid QW chars, no duplicates)
- [ ] Remove button removes chip and calls backend
- [ ] Star click on non-primary changes primary and calls backend
- [ ] Can't remove last remaining tag
- [ ] Loading state shows during add/remove/primary-change operations

BACKEND TESTS:
- [ ] updateTeamTags rejects non-leader
- [ ] updateTeamTags validates each tag format
- [ ] updateTeamTags rejects missing isPrimary
- [ ] updateTeamTags rejects >6 tags
- [ ] updateTeamTags propagates primary tag to proposals/matches
- [ ] updateTeamTags logs event to eventLog
- [ ] QWStats /api/h2h accepts comma-separated tags
- [ ] QWStats SQL ANY() returns matches for all tags
- [ ] QWStats deduplicates when same match appears under multiple tags (shouldn't happen but guard)

INTEGRATION TESTS:
- [ ] Add tag → Firestore updates → listener fires → UI shows new chip
- [ ] Change primary → proposals/matches update → sidebar shows new tag
- [ ] QWHub match history shows results from ALL team tags
- [ ] H2H tab shows combined results across tag aliases
- [ ] Form tab shows combined recent form across tag aliases
- [ ] Error from backend → user sees error message, tags unchanged

END-TO-END:
- [ ] Leader adds historical tag → views match history → sees older matches appear
- [ ] Leader changes primary tag → sidebar/proposals show new tag
- [ ] Team with 3 tags: match history merges all 3 sources correctly
- [ ] H2H between two multi-tag teams returns complete matchup history
```

---

## 8. Common Integration Pitfalls

- [ ] **Forgetting lowercase normalization** — All tags must be lowercased before API calls. Store case-sensitive in Firestore (display), lowercase before Supabase/PostgreSQL queries.
- [ ] **Not deduplicating QWHub results** — Parallel queries for tags like `sr` and `]sr[` might return the same match if a team name appears both ways in QWHub. Must deduplicate by match `id`.
- [ ] **Backward compatibility** — All existing code reads `teamTag` (singular). Must keep `teamTag` synced with primary from `teamTags[]`. Existing callers that pass a single string must still work.
- [ ] **QWHubService cache key** — Currently caches by single tag string. With arrays, cache each tag independently (not the combined array) so adding a tag only fetches data for the new one.
- [ ] **PostgREST URL encoding** — Special QW chars like `]`, `[`, `!` need proper URL encoding in Supabase queries. Test with real tags like `]sr[`.
- [ ] **QWStats comma parsing** — Tags like `GoF!` contain no commas, but validate backend doesn't break on edge-case tag characters in query params.
- [ ] **Empty teamTags migration** — Teams created before migration won't have `teamTags[]`. Service helpers must fall back to `[teamTag]` when array is missing.
- [ ] **Propagation scope** — Only the primary tag propagates to proposals/matches. Historical tags are stats-only, never shown in proposals.

---

## 9. Implementation Notes

### Migration Script
```javascript
// scripts/migrate-team-tags.js
// For each team doc: if !teamTags, set teamTags = [{ tag: teamTag, isPrimary: true }]
// Safe to run multiple times (idempotent)
```

### Backward Compatibility Strategy
Keep `teamTag` field always in sync with the primary tag from `teamTags[]`. This means:
- All existing code that reads `teamTag` continues to work
- Only stats-fetching code needs to change to use `teamTags[]`
- The `updateTeamTags` Cloud Function writes BOTH fields atomically

### Implementation Order
1. **Schema + migration** — Add `teamTags[]`, run migration, keep `teamTag` synced
2. **Cloud Function** — `updateTeamTags` with validation + propagation
3. **Team Settings UI** — Tag chips, add/remove, primary selection
4. **QWStats API** — Update SQL to use `ANY()` for all 4 endpoints
5. **QWStatsService** — Update to pass tag arrays
6. **QWHubService** — Update to parallel-query + merge for tag arrays
7. **Callers** — Update TeamsBrowserPanel, match history, H2H to pass tag arrays

### Dependencies
- No new npm packages needed
- No new Firestore indexes needed
- QWStats PostgreSQL: `ANY()` works with existing btree indexes on `team_a_ascii` / `team_b_ascii`
- Supabase API: No changes needed (existing `cs.{}` operator per-tag)

### Gotchas
- `getH2HMatches` in QWHubService already uses `cs.{tagA,tagB}` for "both teams in same match". With multi-tag, this becomes multiple queries with tag combinations. Consider using the QWStats H2H endpoint instead (which handles arrays natively with SQL).
- Max 6 tags × parallel queries = max 6 Supabase API calls. With 5-min cache, this only happens on first load after cache expires. Acceptable for 300-player community app.
