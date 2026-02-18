# Slice M1.0: Mobile Home + Calendar

> **Dependencies:** None (clean slate, replaces existing mobile code)
> **Estimated complexity:** Large (new layout system + new grid component + contextual content panel)
> **Branch:** `feature/mobile-m1`

## 1. Slice Definition

- **Slice ID:** M1.0
- **Name:** Mobile Home + Calendar
- **User Story:** As a player on my phone, I can view my team's weekly availability calendar and mark my own availability with simple taps, so I can manage scheduling on the go without needing a desktop.
- **Success Criteria:**
  - [ ] Portrait-first layout renders on phones (≤768px width)
  - [ ] Calendar grid shows 7 days × current timeslot range with single-letter colored initials
  - [ ] Tap cells to select → bottom context area shows bulk actions (Mark Available / Unavailable)
  - [ ] Proposals and scheduled matches visible in default bottom content
  - [ ] Bottom nav bar with 4 tabs (Home active, others placeholder)
  - [ ] Team switching via tappable team name in header
  - [ ] Week navigation via arrows in header
  - [ ] Desktop layout completely unaffected
  - [ ] Old mobile code removed (MobileLayout.js, MobileBottomBar.js, portrait blocker)

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Breakpoint | `max-width: 768px` | Covers all phones portrait + landscape. Tablets (768px+) get desktop. |
| Orientation | Both portrait + landscape | No more forced landscape. Portrait-first, landscape also works. |
| Layout | Flexbox column (header → calendar → context → nav) | Simple, predictable, no grid overlap issues |
| Calendar/content split | `flex: 3` / `flex: 2` (~60/40) | Calendar is primary, content is supplementary |
| Grid interaction | Tap-to-select + batch action | No drag painting on mobile — deliberate tap + confirm pattern |
| Cell display | Single-letter colored initials always | Budget is tight at ~45-50px cell width. Full initials won't fit. |
| Action sheet | Bottom content area IS the action area | No separate overlay/sheet. Context panel reacts to grid state. |
| Team switching | Tap team name in header → dropdown | Familiar pattern, minimal UI overhead |
| Week navigation | ◀ ▶ arrows in header | Swipe conflicts with cell selection. Arrows are unambiguous. |
| Old mobile code | Remove entirely | Clean slate. Old landscape-only drawer approach doesn't fit portrait-first design. |

---

## 3. PRD Mapping

- **PRIMARY:** Pillar 1 (Layout), Pillar 2 §2.1 (Availability hot path)
- **DEPENDENT:** Existing AvailabilityService, ProposalService, ScheduledMatchService, TimezoneService
- **DEFERRED:** Compare mode (M2.0), Team roster view (M3.0), Profile tab (M4.0), Match history/H2H

---

## 4. Full Stack Architecture

### 4a. New Files

| File | Purpose |
|------|---------|
| `public/js/mobile/MobileApp.js` | Top-level mobile orchestrator. Detects mobile, renders layout, manages tab state. |
| `public/js/mobile/MobileCalendarGrid.js` | Mobile-optimized calendar grid. Tap selection, single-letter initials, compact cells. |
| `public/js/mobile/MobileHomeContent.js` | Bottom context panel. Shows proposals/matches by default, switches to actions on cell selection. |
| `public/js/mobile/MobileBottomNav.js` | Fixed bottom navigation bar. 4 tabs, active state indicator. |

### 4b. Modified Files

| File | Changes |
|------|---------|
| `public/index.html` | Add mobile layout containers + script tags. Keep desktop containers as-is. |
| `public/js/app.js` | Add mobile detection. If mobile → init MobileApp instead of desktop components. |
| `src/css/input.css` | Remove old mobile CSS (portrait blocker, landscape media queries, drawer styles, bottom bar styles). Add new mobile styles. |

### 4c. Removed Files

| File | Reason |
|------|--------|
| `public/js/MobileLayout.js` | Replaced by MobileApp.js |
| `public/js/MobileBottomBar.js` | Replaced by MobileBottomNav.js |

### 4d. Reused Services (no changes)

| Service | Usage |
|---------|-------|
| `AvailabilityService` | Cache + listener for availability data |
| `ProposalService` | Cache + listener for match proposals |
| `ScheduledMatchService` | Cache + listener for scheduled matches |
| `TeamService` | Team data cache |
| `TimezoneService` | UTC ↔ local slot mapping |
| `WeekNavigation` | Week ID calculation, current/next week |
| `AuthService` | User auth state, team membership |

### 4e. Backend

No backend changes. All Cloud Functions and Firestore rules remain as-is. Mobile uses the same services which call the same functions.

---

## 5. Layout Specification

### Screen Structure (Portrait)

```
┌──────────────────────────────┐
│ 🏆 Slackers ▾  W8 Feb16-22 ◀▶│  ← Header (3rem fixed)
├──────────────────────────────┤
│    M   T   W   T   F  S  S  │
│   RP  RP  RP  RP   P  P  RP │ 20:00
│   RP  RP  RP  RP   P  P  RP │ 20:30    ← Calendar
│   RP  RP  RP  RP  RP  P  RP │ 21:00      (flex: 3, ~60%)
│   RP RGP  RP RGPZ  P GP  🎮 │ 21:30
│  RPZ RGPZ RPZ RGPZ PZ GPZ RZ│ 22:00
│  RPZ RGPZ RPZ RGPZ PZ GPZ RZ│ 22:30
│  RPZ RGPZ RPZ RGPZ PZ GPZ RZ│ 23:00
├──────────────────────────────┤
│  PROPOSALS                   │
│  🐉 Gubbgrottan · OFFI      │
│  This Week                   │  ← Context Panel
│                              │     (flex: 2, ~40%)
│  YOUR MATCHES                │
│  [hx] vs ]SR[ · Sun 21:30   │
│  gg vs koff · Tue 20:30     │
│                              │
│  UPCOMING                    │
│  gg vs ToT · Thu 21:00      │
├──────────────────────────────┤
│  🏠    ⚔️    👥    👤       │  ← Nav (3.5rem fixed)
│ Home Compare Team  Profile   │
└──────────────────────────────┘
```

### Cell Size Math (iPhone 14: 390×844pt)

| Element | Height |
|---------|--------|
| Status bar (PWA) | 0px (or ~47px in browser) |
| Header | 48px (3rem) |
| Calendar (flex: 3) | ~420px |
| Context (flex: 2) | ~280px |
| Bottom nav | 56px (3.5rem) |
| **Total** | ~804px ✓ |

| Element | Width |
|---------|-------|
| Time labels | ~36px |
| 7 day columns | ~50px each (354px total) |
| **Total** | ~390px ✓ |

**Cell dimensions: ~50px wide × ~52px tall** — comfortably tappable (Apple minimum: 44×44pt).

### Calendar Grid Cell Content

Each cell shows colored single-letter initials of available players:

```
┌──────┐
│ R P  │  ← 2 players: R (green), P (red) — same colors as desktop
│      │
└──────┘

┌──────┐
│RGPZ  │  ← 4 players: all initials in a row
│      │
└──────┘

┌──────┐
│RPZ+2 │  ← 5+ players: show 3 + overflow count
│      │
└──────┘
```

**Match cell** (slot has a scheduled match):
```
┌──────┐
│  🎮  │  ← Game controller icon, distinct purple/accent background
└──────┘
```

### Context Panel States

**State 1: Default (no selection)**
Shows scrollable list of proposals, your matches, and upcoming matches.

**State 2: Cells selected**
Replaces default content with action UI:
```
┌──────────────────────────────┐
│  ✓ 3 slots selected          │
│  Mon 21:00 · Tue 21:30 ·    │
│  Wed 22:00                   │
│                              │
│  ┌──────────────────────┐    │
│  │  ✅ Mark Available    │    │  ← Primary button
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  ❌ Mark Unavailable  │    │  ← Secondary button
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │     Clear Selection   │    │  ← Muted/text button
│  └──────────────────────┘    │
└──────────────────────────────┘
```

**State 3: Match cell tapped**
Shows match detail card:
```
┌──────────────────────────────┐
│  [hx] 🏆 vs ]SR[ 🏆         │
│  OFFI · Sunday 21:30 (D1)   │
│                              │
│  Roster: Player1, Player2,  │
│  Player3, Player4           │
│  vs                         │
│  Player5, Player6,          │
│  Player7, Player8           │
│                              │
│  [Back to overview]          │
└──────────────────────────────┘
```

---

## 6. Integration Code Examples

### 6a. Mobile Detection + Routing (app.js)

```javascript
// In MatchSchedulerApp.init():
const MOBILE_QUERY = '(max-width: 768px)';
const mobileMediaQuery = window.matchMedia(MOBILE_QUERY);

if (mobileMediaQuery.matches) {
    // Mobile path: hide desktop layout, init mobile
    document.querySelector('.main-grid-v3').style.display = 'none';
    await MobileApp.init();
} else {
    // Desktop path: existing initialization (unchanged)
    await _initializeComponents();
}

// Listen for viewport changes (e.g., browser resize, dev tools)
mobileMediaQuery.addEventListener('change', (e) => {
    if (e.matches) {
        // Switched to mobile — reload to re-init
        // (Simpler than hot-swapping layouts mid-session)
        window.location.reload();
    }
    // Mobile → desktop transition also reloads
});
```

### 6b. MobileApp.js — Orchestrator

```javascript
const MobileApp = (function() {
    let _currentTab = 'home';

    async function init() {
        // Show mobile container
        const mobileRoot = document.getElementById('mobile-app');
        mobileRoot.classList.remove('hidden');

        // Init services (same as desktop — they're shared)
        await TimezoneService.init();
        WeekNavigation.init();

        // Init mobile components
        _initHeader();
        await MobileCalendarGrid.init('mobile-calendar');
        MobileHomeContent.init('mobile-context');
        MobileBottomNav.init('mobile-nav');

        // Set up listeners
        _setupListeners();
    }

    function _initHeader() {
        const teamName = document.getElementById('mobile-team-name');
        const currentTeam = TeamService.getCurrentTeam();
        if (currentTeam) {
            teamName.textContent = currentTeam.name;
        }

        // Team switcher dropdown
        teamName.addEventListener('click', _showTeamSwitcher);

        // Week navigation
        document.getElementById('mobile-week-prev').addEventListener('click', () => {
            WeekNavigation.previousWeek();
        });
        document.getElementById('mobile-week-next').addEventListener('click', () => {
            WeekNavigation.nextWeek();
        });
    }

    function _showTeamSwitcher() {
        const userTeams = AuthService.getUserTeams();
        if (userTeams.length <= 1) return;

        // Show dropdown with team options
        // (Simple absolute-positioned dropdown below header)
        const dropdown = document.getElementById('mobile-team-dropdown');
        dropdown.innerHTML = '';
        userTeams.forEach(team => {
            const option = document.createElement('button');
            option.textContent = team.name;
            option.className = 'mobile-team-option';
            option.addEventListener('click', () => {
                TeamService.setCurrentTeam(team.id);
                dropdown.classList.add('hidden');
            });
            dropdown.appendChild(option);
        });
        dropdown.classList.toggle('hidden');
    }

    function _setupListeners() {
        // Week change → refresh grid + content
        document.addEventListener('week-changed', (e) => {
            const weekLabel = document.getElementById('mobile-week-label');
            weekLabel.textContent = e.detail.label;
            MobileCalendarGrid.loadWeek(e.detail.weekId);
            MobileHomeContent.refresh();
        });

        // Team change → refresh everything
        document.addEventListener('user-team-changed', () => {
            _initHeader();
            MobileCalendarGrid.reload();
            MobileHomeContent.refresh();
        });

        // Grid selection → switch context panel state
        document.addEventListener('mobile-selection-changed', (e) => {
            const { selectedCells } = e.detail;
            if (selectedCells.length > 0) {
                MobileHomeContent.showSelectionActions(selectedCells);
            } else {
                MobileHomeContent.showDefault();
            }
        });
    }

    function switchTab(tabId) {
        _currentTab = tabId;
        // For M1.0, only 'home' is functional
        // Future slices will add compare, team, profile
    }

    return { init, switchTab };
})();
```

### 6c. MobileCalendarGrid.js — Calendar Grid

```javascript
const MobileCalendarGrid = (function() {
    let _containerId;
    let _weekId;
    let _selectedCells = new Set();
    let _availabilitySlots = {};  // { localSlotId: [playerIds] }
    let _unsubscribe = null;
    let _utcToLocal = new Map();
    let _localToUtc = new Map();
    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    async function init(containerId) {
        _containerId = containerId;
        _weekId = WeekNavigation.getCurrentWeekId();
        _buildTimeMaps();
        _render();
        await _loadData();
    }

    function _buildTimeMaps() {
        // Same timezone mapping logic as desktop AvailabilityGrid
        const timeSlots = TimezoneService.getVisibleTimeSlots();
        _utcToLocal.clear();
        _localToUtc.clear();
        DAYS.forEach(day => {
            timeSlots.forEach(time => {
                const localId = `${day}_${time}`;
                const utcId = TimezoneService.localToUtc(localId);
                _localToUtc.set(localId, utcId);
                _utcToLocal.set(utcId, localId);
            });
        });
    }

    function _render() {
        const container = document.getElementById(_containerId);
        const timeSlots = TimezoneService.getVisibleTimeSlots();

        let html = '<table class="mobile-grid-table">';

        // Header row
        html += '<thead><tr><th class="mobile-grid-time-col"></th>';
        DAY_LABELS.forEach((label, i) => {
            html += `<th class="mobile-grid-day-header">${label}</th>`;
        });
        html += '</tr></thead>';

        // Time rows
        html += '<tbody>';
        timeSlots.forEach(time => {
            const displayTime = time.substring(0, 2) + ':' + time.substring(2);
            html += `<tr><td class="mobile-grid-time-label">${displayTime}</td>`;
            DAYS.forEach(day => {
                const cellId = `${day}_${time}`;
                html += `<td class="mobile-grid-cell" data-cell="${cellId}"></td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';

        container.innerHTML = html;

        // Attach tap handler (event delegation on table)
        container.querySelector('.mobile-grid-table').addEventListener('click', _handleCellTap);
    }

    function _handleCellTap(e) {
        const cell = e.target.closest('.mobile-grid-cell');
        if (!cell) return;

        const cellId = cell.dataset.cell;

        // Check if this cell has a scheduled match
        const utcSlot = _localToUtc.get(cellId);
        const match = ScheduledMatchService.getMatchAtSlot(_weekId, utcSlot);
        if (match) {
            // Dispatch match-tapped event for context panel
            document.dispatchEvent(new CustomEvent('mobile-match-tapped', {
                detail: { match, cellId }
            }));
            return;
        }

        // Toggle selection
        if (_selectedCells.has(cellId)) {
            _selectedCells.delete(cellId);
            cell.classList.remove('mobile-cell-selected');
        } else {
            _selectedCells.add(cellId);
            cell.classList.add('mobile-cell-selected');
        }

        // Notify context panel
        document.dispatchEvent(new CustomEvent('mobile-selection-changed', {
            detail: {
                selectedCells: Array.from(_selectedCells),
                weekId: _weekId
            }
        }));
    }

    async function _loadData() {
        const teamId = TeamService.getCurrentTeamId();
        if (!teamId) return;

        // Get from cache first (instant)
        const cached = AvailabilityService.getCachedData(teamId, _weekId);
        if (cached) {
            _updateGrid(cached.slots || {});
        }

        // Set up real-time listener
        if (_unsubscribe) _unsubscribe();
        _unsubscribe = AvailabilityService.subscribe(teamId, _weekId, (data) => {
            _updateGrid(data.slots || {});
        });
    }

    function _updateGrid(utcSlots) {
        // Convert UTC slots to local display
        _availabilitySlots = {};
        Object.entries(utcSlots).forEach(([utcId, players]) => {
            const localId = _utcToLocal.get(utcId);
            if (localId) {
                _availabilitySlots[localId] = players;
            }
        });

        // Update cell contents
        const container = document.getElementById(_containerId);
        const cells = container.querySelectorAll('.mobile-grid-cell');
        const roster = TeamService.getCurrentTeamRoster();

        cells.forEach(cell => {
            const cellId = cell.dataset.cell;
            const players = _availabilitySlots[cellId] || [];
            cell.innerHTML = _renderCellContent(players, roster);
            cell.className = 'mobile-grid-cell' +
                (_selectedCells.has(cellId) ? ' mobile-cell-selected' : '');
        });
    }

    function _renderCellContent(playerIds, roster) {
        if (playerIds.length === 0) return '';

        const MAX_SHOWN = 4;
        const initials = playerIds.slice(0, MAX_SHOWN).map(uid => {
            const player = roster.find(p => p.userId === uid);
            if (!player) return '?';
            const initial = (player.initials || player.displayName || '?')[0];
            const colorClass = player.color ? `color-${player.color}` : '';
            return `<span class="mobile-cell-initial ${colorClass}">${initial}</span>`;
        });

        let html = initials.join('');
        if (playerIds.length > MAX_SHOWN) {
            html += `<span class="mobile-cell-overflow">+${playerIds.length - MAX_SHOWN}</span>`;
        }
        return html;
    }

    function clearSelection() {
        _selectedCells.forEach(cellId => {
            const cell = document.querySelector(`[data-cell="${cellId}"]`);
            if (cell) cell.classList.remove('mobile-cell-selected');
        });
        _selectedCells.clear();
        document.dispatchEvent(new CustomEvent('mobile-selection-changed', {
            detail: { selectedCells: [], weekId: _weekId }
        }));
    }

    function loadWeek(weekId) {
        _weekId = weekId;
        _selectedCells.clear();
        _buildTimeMaps();
        _render();
        _loadData();
    }

    function reload() {
        loadWeek(_weekId);
    }

    function cleanup() {
        if (_unsubscribe) _unsubscribe();
    }

    return { init, loadWeek, reload, clearSelection, cleanup };
})();
```

### 6d. MobileHomeContent.js — Context Panel

```javascript
const MobileHomeContent = (function() {
    let _containerId;
    let _currentState = 'default'; // 'default' | 'selection' | 'match-detail'

    function init(containerId) {
        _containerId = containerId;
        showDefault();

        // Listen for match cell taps
        document.addEventListener('mobile-match-tapped', (e) => {
            showMatchDetail(e.detail.match);
        });
    }

    function showDefault() {
        _currentState = 'default';
        const container = document.getElementById(_containerId);

        // Build proposals + matches + upcoming
        let html = '';

        // Proposals
        const teamId = TeamService.getCurrentTeamId();
        const proposals = ProposalService.getProposalsForTeam(teamId);
        if (proposals.length > 0) {
            html += '<div class="mobile-section">';
            html += '<h3 class="mobile-section-header">Proposals</h3>';
            proposals.forEach(p => {
                html += _renderProposalCard(p);
            });
            html += '</div>';
        }

        // Your matches
        const userId = AuthService.getCurrentUserId();
        const myMatches = ScheduledMatchService.getUserMatches(userId);
        if (myMatches.length > 0) {
            html += '<div class="mobile-section">';
            html += '<h3 class="mobile-section-header">Your Matches</h3>';
            myMatches.forEach(m => {
                html += _renderMatchCard(m);
            });
            html += '</div>';
        }

        // Upcoming community matches
        const upcoming = ScheduledMatchService.getUpcomingMatches();
        if (upcoming.length > 0) {
            html += '<div class="mobile-section">';
            html += '<h3 class="mobile-section-header">Upcoming</h3>';
            upcoming.forEach(m => {
                html += _renderMatchCard(m, true); // compact mode
            });
            html += '</div>';
        }

        if (!html) {
            html = '<div class="mobile-empty-state">No proposals or matches this week</div>';
        }

        container.innerHTML = html;
    }

    function showSelectionActions(selectedCells) {
        _currentState = 'selection';
        const container = document.getElementById(_containerId);

        const slotLabels = selectedCells.map(cellId => {
            const [day, time] = cellId.split('_');
            const dayLabel = day.charAt(0).toUpperCase() + day.slice(1, 3);
            const timeLabel = time.substring(0, 2) + ':' + time.substring(2);
            return `${dayLabel} ${timeLabel}`;
        });

        container.innerHTML = `
            <div class="mobile-selection-actions">
                <div class="mobile-selection-header">
                    <span class="mobile-selection-count">✓ ${selectedCells.length} slot${selectedCells.length > 1 ? 's' : ''} selected</span>
                </div>
                <div class="mobile-selection-slots">${slotLabels.join(' · ')}</div>
                <div class="mobile-selection-buttons">
                    <button class="mobile-action-btn mobile-action-available"
                            onclick="MobileHomeContent.commitAction('add')">
                        Mark Available
                    </button>
                    <button class="mobile-action-btn mobile-action-unavailable"
                            onclick="MobileHomeContent.commitAction('remove')">
                        Mark Unavailable
                    </button>
                    <button class="mobile-action-btn mobile-action-clear"
                            onclick="MobileCalendarGrid.clearSelection()">
                        Clear Selection
                    </button>
                </div>
            </div>
        `;
    }

    async function commitAction(action) {
        const teamId = TeamService.getCurrentTeamId();
        const userId = AuthService.getCurrentUserId();
        if (!teamId || !userId) return;

        // Get selected cells as UTC slot IDs
        const selectedCells = MobileCalendarGrid.getSelectedCellsWithWeekId
            ? MobileCalendarGrid.getSelectedCellsWithWeekId()
            : []; // Fallback

        // Use AvailabilityService to batch update
        // Same backend call as desktop — toggle user in/out of slots
        try {
            if (action === 'add') {
                await AvailabilityService.addUserToSlots(teamId, userId, selectedCells);
            } else {
                await AvailabilityService.removeUserFromSlots(teamId, userId, selectedCells);
            }
            // Clear selection after successful commit
            MobileCalendarGrid.clearSelection();
            // Grid will auto-update via listener
        } catch (error) {
            console.error('Failed to update availability:', error);
            // Show toast/error — reuse existing ToastService
            ToastService.show('Failed to update. Try again.', 'error');
        }
    }

    function showMatchDetail(match) {
        _currentState = 'match-detail';
        const container = document.getElementById(_containerId);

        const teamA = TeamService.getTeam(match.teamAId);
        const teamB = TeamService.getTeam(match.teamBId);

        container.innerHTML = `
            <div class="mobile-match-detail">
                <div class="mobile-match-teams">
                    <span class="mobile-match-team">${teamA?.name || 'Unknown'}</span>
                    <span class="mobile-match-vs">vs</span>
                    <span class="mobile-match-team">${teamB?.name || 'Unknown'}</span>
                </div>
                <div class="mobile-match-info">
                    ${match.gameType || 'OFFI'} · ${_formatSlot(match.slot)}
                </div>
                <button class="mobile-action-btn mobile-action-clear"
                        onclick="MobileHomeContent.showDefault()">
                    Back to overview
                </button>
            </div>
        `;
    }

    function _renderProposalCard(proposal) {
        const opponent = TeamService.getTeam(proposal.opponentTeamId);
        return `
            <div class="mobile-proposal-card">
                <div class="mobile-proposal-header">
                    <span class="mobile-proposal-team">${opponent?.name || 'Unknown'}</span>
                    <span class="mobile-proposal-type badge-${proposal.gameType?.toLowerCase()}">${proposal.gameType || 'OFFI'}</span>
                </div>
                <div class="mobile-proposal-meta">This Week · Waiting for confirmations</div>
            </div>
        `;
    }

    function _renderMatchCard(match, compact = false) {
        const teamA = TeamService.getTeam(match.teamAId);
        const teamB = TeamService.getTeam(match.teamBId);
        return `
            <div class="mobile-match-card${compact ? ' compact' : ''}">
                <span>${teamA?.name || '?'} vs ${teamB?.name || '?'}</span>
                <span class="mobile-match-time">${_formatSlot(match.slot)}</span>
            </div>
        `;
    }

    function _formatSlot(slot) {
        if (!slot) return '';
        // Convert UTC slot to local display
        const localSlot = TimezoneService.utcToLocal(slot);
        if (!localSlot) return slot;
        const [day, time] = localSlot.split('_');
        const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
        const timeLabel = time.substring(0, 2) + ':' + time.substring(2);
        return `${dayLabel} ${timeLabel}`;
    }

    function refresh() {
        if (_currentState === 'default') showDefault();
    }

    return { init, showDefault, showSelectionActions, showMatchDetail, commitAction, refresh };
})();
```

### 6e. MobileBottomNav.js — Navigation Bar

```javascript
const MobileBottomNav = (function() {
    const TABS = [
        { id: 'home', icon: '🏠', label: 'Home' },
        { id: 'compare', icon: '⚔️', label: 'Compare' },
        { id: 'team', icon: '👥', label: 'Team' },
        { id: 'profile', icon: '👤', label: 'Profile' },
    ];

    function init(containerId) {
        const container = document.getElementById(containerId);

        let html = '';
        TABS.forEach(tab => {
            const active = tab.id === 'home' ? ' active' : '';
            const disabled = tab.id !== 'home' ? ' disabled' : '';
            html += `
                <button class="mobile-nav-tab${active}${disabled}"
                        data-tab="${tab.id}"
                        ${tab.id !== 'home' ? 'disabled' : ''}>
                    <span class="mobile-nav-icon">${tab.icon}</span>
                    <span class="mobile-nav-label">${tab.label}</span>
                </button>
            `;
        });
        container.innerHTML = html;

        // Tab click handler
        container.addEventListener('click', (e) => {
            const tab = e.target.closest('.mobile-nav-tab');
            if (!tab || tab.disabled) return;

            container.querySelectorAll('.mobile-nav-tab').forEach(t =>
                t.classList.remove('active'));
            tab.classList.add('active');
            MobileApp.switchTab(tab.dataset.tab);
        });
    }

    return { init };
})();
```

### 6f. HTML Structure (additions to index.html)

```html
<!-- Mobile layout container (hidden on desktop) -->
<div id="mobile-app" class="mobile-app hidden">

    <!-- Header -->
    <header class="mobile-header">
        <button id="mobile-team-name" class="mobile-team-name">
            Select team ▾
        </button>
        <div id="mobile-team-dropdown" class="mobile-team-dropdown hidden">
            <!-- Populated by JS -->
        </div>
        <div class="mobile-week-nav">
            <button id="mobile-week-prev" class="mobile-week-btn">◀</button>
            <span id="mobile-week-label" class="mobile-week-label">W8 · Feb 16-22</span>
            <button id="mobile-week-next" class="mobile-week-btn">▶</button>
        </div>
    </header>

    <!-- Calendar grid -->
    <div id="mobile-calendar" class="mobile-calendar">
        <!-- MobileCalendarGrid renders here -->
    </div>

    <!-- Context panel -->
    <div id="mobile-context" class="mobile-context">
        <!-- MobileHomeContent renders here -->
    </div>

    <!-- Bottom nav -->
    <nav id="mobile-nav" class="mobile-nav">
        <!-- MobileBottomNav renders here -->
    </nav>

</div>
```

### 6g. CSS Foundation (src/css/input.css additions)

```css
/* ===== MOBILE LAYOUT ===== */
/* Breakpoint: max-width 768px, both orientations */

@media (max-width: 768px) {
    /* Hide desktop layout */
    .main-grid-v3 { display: none !important; }

    /* Show mobile layout */
    .mobile-app {
        display: flex !important;
        flex-direction: column;
        height: 100dvh;
        overflow: hidden;
        background: var(--background);
        color: var(--foreground);
    }
}

/* Mobile header */
.mobile-header {
    height: 3rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.75rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
}

.mobile-team-name {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--primary);
    background: none;
    border: none;
    cursor: pointer;
}

.mobile-week-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.mobile-week-label {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    white-space: nowrap;
}

.mobile-week-btn {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--secondary);
    border: none;
    border-radius: var(--radius);
    color: var(--foreground);
    cursor: pointer;
}

/* Mobile calendar */
.mobile-calendar {
    flex: 3;
    overflow: hidden;
    padding: 0.25rem;
}

.mobile-grid-table {
    width: 100%;
    height: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    touch-action: manipulation; /* Allow taps, prevent zoom */
}

.mobile-grid-time-col {
    width: 2.25rem;
}

.mobile-grid-day-header {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-align: center;
    padding: 0.25rem 0;
}

.mobile-grid-time-label {
    font-size: 0.6rem;
    color: var(--muted-foreground);
    text-align: right;
    padding-right: 0.25rem;
    vertical-align: middle;
}

.mobile-grid-cell {
    text-align: center;
    vertical-align: middle;
    background: var(--secondary);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.65rem;
    padding: 0.125rem;
    -webkit-tap-highlight-color: transparent;
}

.mobile-grid-cell:active {
    opacity: 0.7;
}

.mobile-cell-selected {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--primary) 20%, var(--secondary));
}

.mobile-cell-initial {
    font-weight: 700;
}

.mobile-cell-overflow {
    font-size: 0.5rem;
    color: var(--muted-foreground);
}

/* Context panel */
.mobile-context {
    flex: 2;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border);
    background: var(--card);
}

.mobile-section-header {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    margin-bottom: 0.375rem;
}

.mobile-proposal-card,
.mobile-match-card {
    padding: 0.5rem;
    margin-bottom: 0.375rem;
    background: var(--secondary);
    border-radius: var(--radius);
    font-size: 0.8rem;
}

.mobile-match-time {
    font-size: 0.7rem;
    color: var(--muted-foreground);
}

/* Selection actions */
.mobile-selection-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem 0;
}

.mobile-selection-count {
    font-weight: 600;
    font-size: 0.9rem;
}

.mobile-selection-slots {
    font-size: 0.75rem;
    color: var(--muted-foreground);
}

.mobile-action-btn {
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-radius: var(--radius);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
}

.mobile-action-available {
    background: var(--primary);
    color: var(--primary-foreground);
}

.mobile-action-unavailable {
    background: var(--destructive);
    color: var(--destructive-foreground);
}

.mobile-action-clear {
    background: transparent;
    color: var(--muted-foreground);
    border: 1px solid var(--border);
}

/* Bottom nav */
.mobile-nav {
    height: 3.5rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: var(--card);
    border-top: 1px solid var(--border);
}

.mobile-nav-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    background: none;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    padding: 0.25rem 0.75rem;
}

.mobile-nav-tab.active {
    color: var(--primary);
}

.mobile-nav-tab:disabled {
    opacity: 0.3;
    cursor: default;
}

.mobile-nav-icon {
    font-size: 1.25rem;
}

.mobile-nav-label {
    font-size: 0.6rem;
    font-weight: 500;
}

/* Team switcher dropdown */
.mobile-team-dropdown {
    position: absolute;
    top: 3rem;
    left: 0.75rem;
    background: var(--popover);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    z-index: 50;
    min-width: 10rem;
}

.mobile-team-option {
    display: block;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: none;
    border: none;
    text-align: left;
    color: var(--foreground);
    cursor: pointer;
    font-size: 0.85rem;
}

.mobile-team-option:hover,
.mobile-team-option:active {
    background: var(--accent);
}

/* Match detail */
.mobile-match-detail {
    text-align: center;
    padding: 1rem 0;
}

.mobile-match-teams {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
}

.mobile-match-vs {
    color: var(--muted-foreground);
    margin: 0 0.5rem;
    font-weight: 400;
    font-size: 0.8rem;
}

.mobile-match-info {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    margin-bottom: 1rem;
}

.mobile-empty-state {
    text-align: center;
    color: var(--muted-foreground);
    padding: 2rem 0;
    font-size: 0.85rem;
}
```

---

## 7. Performance Classification

| Path | Type | Approach |
|------|------|----------|
| Grid render (initial) | Cold | Show loading spinner, then render. Acceptable 200-500ms. |
| Grid cell update (listener) | Hot | Direct DOM update on listener callback. No re-render. |
| Cell tap → selection highlight | Hot | Instant CSS class toggle. No async. |
| Commit availability | Cold | Show loading on button, restore on complete/error. |
| Proposals/matches display | Cold | Render from cache first, listener updates incrementally. |
| Week navigation | Cold | Clear grid, show brief loading, render new week. |
| Team switch | Cold | Full refresh of grid + content. Loading state acceptable. |

---

## 8. Data Flow Diagram

```
User taps cell         User taps "Mark Available"
     │                          │
     ▼                          ▼
MobileCalendarGrid      MobileHomeContent
  _handleCellTap()        commitAction('add')
     │                          │
     │ toggle CSS class         │ get selected cells
     │ dispatch event           │ as UTC slot IDs
     │                          │
     ▼                          ▼
MobileHomeContent       AvailabilityService
  showSelectionActions()   addUserToSlots()
     │                          │
     │ render action buttons    │ Firestore write
     │                          │
     ▼                          ▼
Context panel shows      Firestore listener fires
action UI                       │
                                ▼
                        AvailabilityService callback
                                │
                                ▼
                        MobileCalendarGrid
                          _updateGrid()
                                │
                                ▼
                        Cell DOM updated with
                        new player initials
```

---

## 9. Test Scenarios

### Frontend
- [ ] Mobile layout shows at ≤768px, desktop at >768px
- [ ] Calendar grid renders 7 days × correct time slots
- [ ] Single-letter colored initials display in cells
- [ ] Tap cell → cell highlights with primary outline
- [ ] Tap again → cell deselects
- [ ] Multi-select: tap 3 cells → all highlighted
- [ ] Context panel switches to action view when cells selected
- [ ] "Mark Available" commits and clears selection
- [ ] "Mark Unavailable" commits and clears selection
- [ ] "Clear Selection" deselects all without committing
- [ ] Week arrows navigate forward/backward
- [ ] Team name tap shows switcher dropdown (for multi-team users)
- [ ] Match cell tap shows match detail in context panel
- [ ] "Back to overview" returns to default content
- [ ] Bottom nav shows 4 tabs, only Home active
- [ ] Scrollable context panel when content overflows

### Service Integration
- [ ] Grid data loads from AvailabilityService cache on init
- [ ] Real-time listener updates grid when other users change availability
- [ ] Proposals load from ProposalService cache
- [ ] Scheduled matches load from ScheduledMatchService cache
- [ ] Timezone mapping matches desktop behavior

### Layout
- [ ] Portrait mode works on iPhone SE (375×667)
- [ ] Portrait mode works on iPhone 14 (390×844)
- [ ] Portrait mode works on iPhone 14 Pro Max (430×932)
- [ ] Landscape mode works on phones (but not required to be optimal)
- [ ] Desktop layout unaffected by mobile CSS
- [ ] No horizontal scrolling on any phone size
- [ ] Cells are tappable without mis-taps (≥44×44pt)
- [ ] Bottom nav doesn't overlap with OS home indicator

### Auth States
- [ ] Logged-out user sees grid (read-only), no selection actions
- [ ] Logged-in user can select cells and commit availability
- [ ] User with no team sees "Join a team" message instead of grid

---

## 10. Common Integration Pitfalls

| Pitfall | Prevention |
|---------|------------|
| Desktop grid breaks | Mobile CSS uses `.mobile-*` classes only. Desktop `.main-grid-v3` untouched. Media query hides one, shows other. |
| Service method mismatch | MobileCalendarGrid calls exact same AvailabilityService methods as desktop. Verify method signatures match. |
| Timezone mapping diverges | Reuse TimezoneService.localToUtc/utcToLocal — do NOT reimplement. |
| Selection persists across weeks | `loadWeek()` clears `_selectedCells` set before rendering new week. |
| Context panel stale after commit | `clearSelection()` triggers `mobile-selection-changed` event → MobileHomeContent.showDefault(). |
| Touch event issues | Use `click` event (not `pointerdown`) for cell taps. `click` works on both touch and mouse, includes 300ms delay handling by browsers. Set `touch-action: manipulation` to disable double-tap zoom. |
| PWA safe area | Add `env(safe-area-inset-bottom)` padding to mobile-nav for notched phones. |

---

## 11. Implementation Notes

### Files to Create
1. `public/js/mobile/MobileApp.js` — Layout orchestrator
2. `public/js/mobile/MobileCalendarGrid.js` — Calendar grid
3. `public/js/mobile/MobileHomeContent.js` — Context panel
4. `public/js/mobile/MobileBottomNav.js` — Navigation bar

### Files to Modify
1. `public/index.html` — Add mobile HTML containers + script tags
2. `public/js/app.js` — Mobile detection, conditional init
3. `src/css/input.css` — Remove old mobile CSS (~800 lines), add new (~300 lines)

### Files to Delete
1. `public/js/MobileLayout.js`
2. `public/js/MobileBottomBar.js`

### Patterns to Follow
- **Revealing Module Pattern** for all mobile components (matches existing codebase)
- **Cache + Listener** pattern: get from cache first, subscribe for updates
- **Event delegation** on grid table (one listener, not per-cell)
- **Custom events** for cross-component communication (`mobile-selection-changed`, `mobile-match-tapped`)

### Edge Cases
- **No team selected**: Show message "Join a team to see availability" in calendar area
- **Not logged in**: Grid renders read-only. Cell taps show "Log in to mark availability" in context panel
- **Empty week**: Grid renders with empty cells, context panel shows "No availability set"
- **Single team user**: Team name in header, no dropdown arrow
- **Slow connection**: Loading state on grid init, optimistic selection highlights

### What This Slice Does NOT Include
- Compare mode / opponent overlay (→ Slice M2.0)
- Team roster view tab (→ Slice M3.0)
- Profile/settings tab (→ Slice M4.0)
- Match proposal creation from mobile (→ Slice M2.0)
- Voice replay, H2H stats, WebQTV (desktop only for now)
- PWA install prompt (separate concern)
- Push notifications (separate concern)

---

## 12. Migration Notes

### Removing Old Mobile Code

The old mobile implementation spans:
- `MobileLayout.js` (319 lines) — Drawer management + swipe gestures
- `MobileBottomBar.js` (607 lines) — Bottom bar with 7 button groups
- `src/css/input.css` portrait blocker (lines ~4656-4695)
- `src/css/input.css` mobile landscape styles (lines ~4735-5467)
- `public/index.html` drawer containers + overlay + bottom bar

**Removal sequence:**
1. Remove JS files (MobileLayout.js, MobileBottomBar.js)
2. Remove script tags from index.html
3. Remove mobile drawer/overlay/bottom-bar HTML from index.html
4. Remove old mobile CSS blocks from input.css
5. Remove MobileLayout.init() and MobileBottomBar.init() calls from app.js
6. Remove BottomPanelController references that only exist for mobile
7. Verify desktop layout still works (it should — these files only affected mobile viewport)
