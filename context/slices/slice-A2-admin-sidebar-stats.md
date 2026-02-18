# Slice A2: Admin Sidebar Stats

## Slice Definition

| Field | Value |
|-------|-------|
| **ID** | A2 |
| **Name** | Admin Sidebar Stats |
| **Depends on** | A1 (admin foundation — `admin-mode-changed` event, `window._isAdmin`) |
| **Blocks** | None (A5 enriches this with historical data but not blocking) |

**User Story:** As the app admin in admin mode, I want the left sidebar to show 3 key engagement metrics (active users, proposals, scheduled matches) with week-over-week comparison so I can gauge community health at a glance.

**Success Criteria:**
1. When admin tab is active, left sidebar identity container shows "Admin Overview" header
2. Roster container shows 3 stat cards with current week values
3. Each card shows delta vs previous week (green arrow up, red arrow down, grey dash for no change)
4. When admin tab is deactivated, left sidebar returns to normal team view
5. Current week stats computed live from existing service caches
6. Previous week stats read from `weeklyStats/{weekId}` if available, computed on the fly if not

---

## Architecture

### Files Changed

| File | Action | What |
|------|--------|------|
| `public/js/services/AdminStatsService.js` | **New** | Compute + cache weekly stats |
| `public/js/components/AdminStatsDisplay.js` | **New** | Render 3 metric cards in left sidebar |
| `public/js/components/TeamInfo.js` | Modify | Add admin mode listener, delegate to AdminStatsDisplay |
| `public/index.html` | Modify | Load new JS files |
| `src/css/input.css` | Modify | Admin stat card styles |

---

## Implementation Details

### 1. `public/js/services/AdminStatsService.js` (New)

Revealing Module Pattern. Computes weekly engagement metrics from existing service caches.

**Public API:**
```javascript
const AdminStatsService = (function() {
    'use strict';

    let _statsCache = new Map(); // weekId → { activeUsers, proposalCount, scheduledCount }

    /**
     * Compute stats for a week from live Firestore data.
     * For current week: queries availability, proposals, matches collections.
     * For past weeks: reads weeklyStats doc if available, else computes from collections.
     */
    async function getWeekStats(weekId) {
        if (_statsCache.has(weekId)) return _statsCache.get(weekId);

        // Try weeklyStats collection first (fast path for past weeks)
        const stored = await _loadStoredStats(weekId);
        if (stored) {
            _statsCache.set(weekId, stored);
            return stored;
        }

        // Compute from live data
        const computed = await _computeLiveStats(weekId);
        _statsCache.set(weekId, computed);
        return computed;
    }

    async function _loadStoredStats(weekId) { ... }  // Read weeklyStats/{weekId}
    async function _computeLiveStats(weekId) { ... }  // Query collections

    function clearCache() { _statsCache.clear(); }

    return { getWeekStats, clearCache };
})();
```

**`_computeLiveStats(weekId)` logic:**

```javascript
async function _computeLiveStats(weekId) {
    const { collection, query, where, getDocs } = await import(
        'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
    );
    const db = window.firebase.db;

    // 1. Active users: unique userIds across all availability docs for this week
    const availSnap = await getDocs(
        query(collection(db, 'availability'), where('weekId', '==', weekId))
    );
    const uniqueUsers = new Set();
    const activeTeamIds = new Set();
    availSnap.forEach(doc => {
        const data = doc.data();
        const slots = data.slots || {};
        let hasUsers = false;
        for (const userIds of Object.values(slots)) {
            userIds.forEach(uid => { uniqueUsers.add(uid); hasUsers = true; });
        }
        if (hasUsers) activeTeamIds.add(data.teamId);
    });

    // 2. Proposals: count all proposals for this week (any status)
    const proposalSnap = await getDocs(
        query(collection(db, 'matchProposals'), where('weekId', '==', weekId))
    );

    // 3. Scheduled matches: count all matches for this week (any status)
    const matchSnap = await getDocs(
        query(collection(db, 'scheduledMatches'), where('weekId', '==', weekId))
    );

    return {
        activeUsers: uniqueUsers.size,
        activeTeams: activeTeamIds.size,
        proposalCount: proposalSnap.size,
        scheduledCount: matchSnap.size
    };
}
```

**`_loadStoredStats(weekId)` logic:**

```javascript
async function _loadStoredStats(weekId) {
    const { doc, getDoc } = await import(
        'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
    );
    const docRef = doc(window.firebase.db, 'weeklyStats', weekId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
        activeUsers: data.activeUsers,
        activeTeams: data.activeTeams,
        proposalCount: data.proposalCount,
        scheduledCount: data.scheduledCount
    };
}
```

**Week ID computation** (reuse DateUtils):
```javascript
function _getCurrentWeekId() {
    const now = new Date();
    const weekNum = DateUtils.getCurrentWeekNumber();
    const year = DateUtils.getISOWeekYear(now);
    return `${year}-${String(weekNum).padStart(2, '0')}`;
}

function _getPreviousWeekId() {
    const now = new Date();
    const prevDate = new Date(now);
    prevDate.setDate(prevDate.getDate() - 7);
    const weekNum = DateUtils.getISOWeekNumber(prevDate);
    const year = DateUtils.getISOWeekYear(prevDate);
    return `${year}-${String(weekNum).padStart(2, '0')}`;
}
```

### 2. `public/js/components/AdminStatsDisplay.js` (New)

Revealing Module Pattern. Renders into a container provided by TeamInfo.

```javascript
const AdminStatsDisplay = (function() {
    'use strict';

    let _container = null;

    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) return;

        _renderLoading();

        const currentWeekId = _getCurrentWeekId();
        const prevWeekId = _getPreviousWeekId();

        const [current, previous] = await Promise.all([
            AdminStatsService.getWeekStats(currentWeekId),
            AdminStatsService.getWeekStats(prevWeekId)
        ]);

        _render(current, previous, currentWeekId, prevWeekId);
    }

    function _render(current, previous, currentWeekId, prevWeekId) {
        _container.innerHTML = `
            <div class="admin-stats-display px-3 py-2 space-y-3">
                <div class="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Week ${currentWeekId.split('-')[1]} Activity
                </div>
                ${_renderStatCard('Active Users', current.activeUsers, previous?.activeUsers, 'users who marked availability')}
                ${_renderStatCard('Proposals', current.proposalCount, previous?.proposalCount, 'match proposals sent')}
                ${_renderStatCard('Matches', current.scheduledCount, previous?.scheduledCount, 'matches scheduled')}
            </div>
        `;
    }

    function _renderStatCard(label, current, previous, description) {
        const delta = previous != null ? current - previous : null;
        const deltaClass = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-muted-foreground';
        const deltaIcon = delta > 0 ? '↑' : delta < 0 ? '↓' : '–';
        const deltaText = delta != null ? `${deltaIcon} ${Math.abs(delta)} vs last week` : 'no previous data';

        return `
            <div class="admin-stat-card">
                <div class="flex items-baseline justify-between">
                    <span class="text-2xl font-bold text-foreground">${current}</span>
                    <span class="text-xs ${deltaClass}">${deltaText}</span>
                </div>
                <div class="text-xs text-muted-foreground mt-0.5">${label} — ${description}</div>
            </div>
        `;
    }

    function cleanup() { _container = null; }

    return { init, cleanup };
})();
```

### 3. `public/js/components/TeamInfo.js` — Modifications

**Add private state** (near line 20):
```javascript
let _adminModeActive = false;
```

**Add event listener in init()** (after line 49):
```javascript
window.addEventListener('admin-mode-changed', _handleAdminModeChanged);
```

**Handler:**
```javascript
function _handleAdminModeChanged(e) {
    _adminModeActive = e.detail.active;
    _render();
}
```

**Modify `_render()` dispatcher** (line 354) — add admin check as FIRST condition:
```javascript
function _render() {
    if (!_identityContainer || !_rosterContainer) return;

    if (_adminModeActive && window._isAdmin) {
        _renderAdminMode();
        return;
    }

    // ... existing guest/noTeams/teams logic unchanged
}
```

**New render function:**
```javascript
function _renderAdminMode() {
    _identityContainer.innerHTML = `
        <div class="text-center py-4">
            <div class="w-14 h-14 rounded-lg bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <svg class="w-7 h-7 text-muted-foreground" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
            </div>
            <h4 class="text-sm font-semibold text-foreground">Admin Overview</h4>
        </div>
    `;

    _rosterContainer.innerHTML = '<div id="admin-stats-sidebar"></div>';
    AdminStatsDisplay.init('admin-stats-sidebar');
}
```

**Cleanup** — add to existing `_cleanupListeners()`:
```javascript
window.removeEventListener('admin-mode-changed', _handleAdminModeChanged);
```

### 4. CSS Additions (`src/css/input.css`)

```css
/* Admin stat cards */
.admin-stat-card {
    background: oklch(from var(--muted) l c h / 0.5);
    border: 1px solid oklch(from var(--border) l c h);
    border-radius: 0.5rem;
    padding: 0.75rem;
}
```

### 5. Script Tags (`public/index.html`)

Add before `</body>`, after existing service/component scripts:
```html
<script src="js/services/AdminStatsService.js"></script>
<script src="js/components/AdminStatsDisplay.js"></script>
```

---

## Data Flow

```
Admin tab clicked (A1)
  → 'admin-mode-changed' { active: true }
  → TeamInfo._handleAdminModeChanged()
  → _render() → _renderAdminMode()
  → AdminStatsDisplay.init('admin-stats-sidebar')
  → AdminStatsService.getWeekStats(currentWeek)
  → AdminStatsService.getWeekStats(previousWeek)
      ├─ Try weeklyStats/{weekId} doc first (fast, if A5 deployed)
      └─ Fall back to live Firestore queries (availability, proposals, matches)
  → Render 3 stat cards with deltas

Non-admin tab clicked
  → 'admin-mode-changed' { active: false }
  → TeamInfo._handleAdminModeChanged()
  → _render() → _renderTeamsMode() (normal view restored)
```

---

## Performance Classification

- **Stats computation:** Cold path. Admin-only, ~3 Firestore queries per week queried. Acceptable latency.
- **Rendering:** Instant after data loads. Show loading skeleton while queries run.
- **Caching:** Stats cached in memory per session. Clear on week change if needed.

---

## Test Scenarios

1. **Click Admin tab** → left sidebar shows "Admin Overview" + 3 stat cards
2. **Click Matches tab** → left sidebar returns to team roster
3. **Stats values** → verify counts match Firestore data (check availability docs, count proposals)
4. **Week-over-week** → if weeklyStats doc exists for previous week, delta shows correctly
5. **No previous data** → shows "no previous data" instead of delta
6. **Loading state** → brief loading indicator while stats compute

---

## Common Pitfalls

- **Don't read from service caches for stats.** ProposalService and ScheduledMatchService caches only contain data relevant to the current user's teams. Admin needs ALL data, so query Firestore directly.
- **DateUtils week utilities.** Use `DateUtils.getISOWeekNumber()` and `DateUtils.getISOWeekYear()` — NOT `WeekNavigation.getCurrentWeekNumber()` which tracks the navigation state, not the actual current week.
- **TeamInfo re-render timing.** When `admin-mode-changed` fires, TeamInfo's existing team listener may also fire. The `_adminModeActive` flag must take priority in `_render()` to prevent flickering.
