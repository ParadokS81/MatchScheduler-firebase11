# Slice 13.0a: Panel Content Relocation

**Dependencies:** None (pure UI relocation)
**User Story:** As a user, I want the team panel to only show logo and roster so that it fits comfortably when the grid has fewer timeslots.

---

## Context: Layout Restructure (Slice 13.0)

The 3x3 grid links row heights across columns. When users hide timeslots, the top row shrinks, squeezing the team panel. This slice is part of a restructure:

**Target Layout:**
```
┌─────────────────┬────────────────────────────────┬─────────────────┐
│ TOP-LEFT        │ TOP-CENTER                     │ TOP-RIGHT       │
│ • Logo          │ • Week header (tools in 13.0b) │ • Favorites     │
│ • Roster        │ • Week 1 grid                  │                 │
├─────────────────┼────────────────────────────────┼─────────────────┤
│ MID-LEFT        │ MID-CENTER                     │ MID-RIGHT       │
│ • Team name ◄───┼─ MOVED FROM TOP-LEFT           │ • Min players   │
│   + gear icon   │                                │                 │
├─────────────────┼────────────────────────────────┼─────────────────┤
│ BOTTOM-LEFT     │ BOTTOM-CENTER                  │ BOTTOM-RIGHT    │
│ • Profile ◄─────┼─ MOVED FROM MID-LEFT           │ • Team browser  │
│ • Upcoming      │ • Week 2 / Content             │                 │
└─────────────────┴────────────────────────────────┴─────────────────┘
```

Grid tools (templates, display modes) will move to grid header in Slice 13.0b.

---

## Scope

Move two pieces of content to different panels:
1. **Team name + tag** → mid-left panel (currently shows compact profile)
2. **Compact profile** → bottom-left panel (above upcoming matches)
3. **Grid tools drawer** → removed from TeamInfo (will be in grid header in 13.0b)

---

## Changes

### 1. TeamInfo.js — Remove team name and grid tools

**File:** `public/js/components/TeamInfo.js`

In `_renderTeamsMode()`:

**Remove from render:**
- `teamNameRow` section (the `<div class="group flex items-center justify-center gap-1.5">` with team name and gear icon)
- `gridToolsDrawer` section entirely (moving to grid header in 13.0b)
- Display mode buttons (moving to grid header)

**Keep in render:**
- Logo section (active + inactive team logos)
- Roster section

**Remove drawer-related code:**
- `_drawerExpanded` state variable
- `_toggleGridToolsDrawer()` function
- `_updateDrawerHeight()` function
- `grid-tools-drawer-ready` event dispatch
- `grid-tools-drawer-toggled` event dispatch
- Event listeners for `templates-updated`

**New render structure:**
```javascript
function _renderTeamsMode() {
    // Logo section - same as before but without teamNameRow below it
    let logoSection = '';
    if (_selectedTeam) {
        const activeLogoUrl = _selectedTeam.activeLogo?.urls?.medium;
        const activeLogoContent = activeLogoUrl
            ? `<img src="${activeLogoUrl}" alt="${_selectedTeam.teamName} logo" class="w-full h-full object-cover">`
            : `<span class="text-3xl font-bold text-muted-foreground">${_selectedTeam.teamTag}</span>`;

        // Inactive team logo (if user has 2 teams)
        let inactiveLogoHTML = '';
        const inactiveTeam = _userTeams.find(t => t.id !== _selectedTeam.id);
        if (inactiveTeam) {
            // ... same inactive logo code ...
        }

        logoSection = inactiveLogoHTML
            ? `<div class="flex flex-col items-center gap-1.5 mb-3">
                    <div class="flex items-end justify-center gap-2">
                        <div class="team-logo-clickable overflow-hidden w-28 h-28 flex items-center justify-center cursor-pointer transition-all"
                             data-action="team-manage" title="Manage team">
                            ${activeLogoContent}
                        </div>
                        ${inactiveLogoHTML}
                    </div>
                </div>`
            : `<div class="flex flex-col items-center gap-1.5 mb-3">
                    <div class="team-logo-clickable overflow-hidden w-36 h-36 flex items-center justify-center cursor-pointer transition-all"
                         data-action="team-manage" title="Manage team">
                        ${activeLogoContent}
                    </div>
                </div>`;
    }

    // Roster - same as before
    let rosterHTML = '';
    if (_selectedTeam) {
        rosterHTML = _selectedTeam.playerRoster.map(player => {
            // ... same roster rendering code ...
        }).join('');
    }

    // NO grid tools drawer - removed!

    return `
        <div class="team-info-container h-full flex flex-col">
            <div class="space-y-2 flex-1 min-h-0 overflow-y-auto px-1">
                ${logoSection}
                <div class="space-y-0.5 max-w-fit mx-auto">
                    ${rosterHTML}
                </div>
            </div>
        </div>
    `;
}
```

**Add new public method to expose team info:**
```javascript
function getSelectedTeam() {
    return _selectedTeam;
}

// In return object:
return {
    init,
    updateUser,
    getSelectedTeam,  // NEW
    cleanup
};
```

---

### 2. Mid-Left Panel — Team Name Display

**File:** `public/js/components/TeamNameDisplay.js` (NEW)

Create a simple component to show team name + tag in mid-left panel:

```javascript
// TeamNameDisplay.js - Shows team name in mid-left divider panel
const TeamNameDisplay = (function() {
    'use strict';

    let _panel = null;
    let _selectedTeam = null;

    function init(panelId) {
        _panel = document.getElementById(panelId);
        if (!_panel) {
            console.error('TeamNameDisplay: Panel not found:', panelId);
            return;
        }

        // Listen for team selection changes
        window.addEventListener('team-selected', _handleTeamSelected);

        _render();
    }

    function _handleTeamSelected(event) {
        _selectedTeam = event.detail?.team || null;
        _render();
    }

    function setTeam(team) {
        _selectedTeam = team;
        _render();
    }

    function _render() {
        if (!_panel) return;

        if (!_selectedTeam) {
            _panel.innerHTML = '';
            return;
        }

        // Compact team name display for 3rem height divider
        _panel.innerHTML = `
            <div class="flex items-center justify-center gap-2 h-full px-2">
                <span class="text-sm font-semibold text-foreground truncate">${_selectedTeam.teamName}</span>
                <span class="team-settings-icon opacity-60 hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0"
                      data-action="open-settings" title="Team Settings">
                    <svg class="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                </span>
            </div>
        `;

        _attachEventListeners();
    }

    function _attachEventListeners() {
        const settingsIcon = _panel?.querySelector('[data-action="open-settings"]');
        if (settingsIcon) {
            settingsIcon.addEventListener('click', () => {
                if (_selectedTeam && typeof TeamManagementModal !== 'undefined') {
                    TeamManagementModal.show(_selectedTeam.id);
                }
            });
        }
    }

    function cleanup() {
        window.removeEventListener('team-selected', _handleTeamSelected);
        _panel = null;
        _selectedTeam = null;
    }

    return { init, setTeam, cleanup };
})();
```

---

### 3. index.html — Update mid-left panel

**File:** `public/index.html`

Change mid-left panel from profile container to team name container:

```html
<!-- Before -->
<div id="panel-mid-left" class="panel panel-divider">
    <div id="profile-compact-container" class="panel-content-compact">
        <!-- UserProfile.renderCompact() renders here -->
    </div>
</div>

<!-- After -->
<div id="panel-mid-left" class="panel panel-divider">
    <div id="team-name-container" class="panel-content-compact">
        <!-- TeamNameDisplay renders here -->
    </div>
</div>
```

---

### 4. Bottom-Left Panel — Add Profile Above Matches

**File:** `public/index.html`

Update bottom-left panel to include profile area:

```html
<!-- Before -->
<div id="panel-bottom-left" class="panel">
    <div id="upcoming-matches-container" class="panel-content h-full">
    </div>
</div>

<!-- After -->
<div id="panel-bottom-left" class="panel">
    <div class="panel-content h-full flex flex-col">
        <div id="profile-compact-container" class="flex-shrink-0 border-b border-border pb-2 mb-2">
            <!-- UserProfile.renderCompact() renders here -->
        </div>
        <div id="upcoming-matches-container" class="flex-1 min-h-0 overflow-y-auto">
        </div>
    </div>
</div>
```

---

### 5. app.js — Update initialization

**File:** `public/js/app.js`

Add TeamNameDisplay initialization and update event dispatching:

```javascript
// In initialization section, after TeamInfo.init():
TeamNameDisplay.init('team-name-container');

// In setSelectedTeam() or wherever team selection is handled:
function setSelectedTeam(team) {
    _selectedTeam = team;

    // Dispatch event for TeamNameDisplay
    window.dispatchEvent(new CustomEvent('team-selected', {
        detail: { team }
    }));

    // ... rest of existing code ...
}
```

Also update UserProfile.renderCompact() call to use the new container location:
```javascript
// Was: UserProfile.renderCompact('profile-compact-container');
// Still the same, just the container is now in bottom-left panel
UserProfile.renderCompact('profile-compact-container');
```

---

### 6. Script Loading — Add TeamNameDisplay

**File:** `public/index.html`

Add script tag for new component:

```html
<script src="js/components/TeamNameDisplay.js"></script>
```

---

### 7. CSS Cleanup

**File:** `src/css/input.css`

Remove grid tools drawer styles (will be replaced in 13.0b):

```css
/* REMOVE these styles - drawer is being removed */
.grid-tools-drawer { ... }
.grid-tools-drawer.drawer-closed { ... }
.grid-tools-drawer.drawer-open { ... }
.grid-tools-header { ... }
.grid-tools-drawer-body { ... }
.drawer-arrow { ... }
```

---

## Verification

After this slice:

1. **Top-left panel shows:** Logo + roster only (no team name, no grid tools)
2. **Mid-left panel shows:** Team name + gear icon (centered in 3rem height)
3. **Bottom-left panel shows:** Compact profile + upcoming matches
4. **Clicking gear icon in mid-left:** Opens TeamManagementModal
5. **Grid tools:** Temporarily not visible (will be added to grid header in 13.0b)

---

## Test Scenarios

- [ ] Logo displays correctly (single team: large, two teams: with switcher)
- [ ] Roster displays all players with correct visual mode
- [ ] Team name shows in mid-left divider with gear icon
- [ ] Gear icon hover state works
- [ ] Clicking gear opens TeamManagementModal
- [ ] Profile shows in bottom-left panel
- [ ] Upcoming matches appear below profile
- [ ] Team switch updates both team panel (logo) and mid-left (name)
- [ ] Guest mode works (no team name shown, sign-in UI in team panel)
- [ ] No-team mode works (join/create UI in team panel)

---

## Notes

- GridActionButtons is NOT removed, just not rendered anywhere in this slice
- The drawer CSS/JS cleanup prepares for 13.0b where it moves to grid header
- TeamInfo.getSelectedTeam() allows other components to access current team
- The `team-selected` event provides a clean coordination mechanism
