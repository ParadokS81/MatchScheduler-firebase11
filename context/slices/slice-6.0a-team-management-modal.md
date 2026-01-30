# Slice 6.0a: Team Management Modal

## 1. Slice Definition

- **Slice ID:** 6.0a
- **Name:** Team Management Modal
- **User Story:** As a team member, I can click a settings icon next to my team name to open a modal with all team management options, so I have a cleaner UI that works well at all resolutions
- **Success Criteria:**
  - Gear icon appears on hover over team name in switcher
  - Clicking gear opens Team Management Modal
  - Modal shows appropriate options based on role (leader vs member)
  - All 7 action handlers work identically to current drawer
  - Modal closes via X button, backdrop click, or ESC key
  - Real-time updates flow through existing listeners

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- PRD 4.3.2: Team Settings Management (Leaders Only)
  - Max Players dropdown (4-20, can't go below roster size)
  - Join Code display + Copy + Regenerate
  - Logo Management button
- PRD 4.3.3: Player Management (Leaders Only)
  - Remove Player button
  - Transfer Leadership button
  - Leave Team button (conditional)
- PRD 4.3.4: Team Management UX
  - Member view vs Leader view differentiation

DEPENDENT SECTIONS:
- PRD 4.1.3: Team Switcher - trigger location
- PRD 5.6: Event Logging - existing handlers already log

IGNORED SECTIONS:
- PRD 4.3.5: Grid Tools - deferred to slice 6.0b
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

NEW: TeamManagementModal
  - Firebase listeners: none (uses cache, updates via existing TeamInfo listener)
  - Cache interactions: reads from TeamService.getTeamFromCache()
  - UI responsibilities:
    - Render modal with team settings
    - Show member view OR leader view based on role
    - Provide all action buttons with loading states
  - User actions:
    - Copy join code
    - Regenerate join code (leaders)
    - Change max players (leaders)
    - Manage logo (leaders)
    - Remove player (leaders)
    - Transfer leadership (leaders)
    - Leave team (all, conditional)

MODIFIED: TeamInfo
  - Add gear icon (⚙️) that appears on hover over team name
  - Remove _drawerInstance variable
  - Remove _initializeDrawer() function and call
  - Add _handleTeamSettingsClick() to open modal
  - Keep existing Firebase listener (unchanged)

FRONTEND SERVICES:
- TeamService: No changes - all existing methods reused
  - callFunction('regenerateJoinCode', {teamId, userId})
  - callFunction('updateTeamSettings', {teamId, maxPlayers})
  - callFunction('leaveTeam', {teamId, userId})
  - updateCachedTeam(teamId, data)

BACKEND REQUIREMENTS:
⚠️ NO NEW CLOUD FUNCTIONS NEEDED - All existing functions reused:
- regenerateJoinCode (functions/team-operations.js)
- updateTeamSettings (functions/team-operations.js)
- kickPlayer (functions/team-operations.js)
- transferLeadership (functions/team-operations.js)
- leaveTeam (functions/team-operations.js)

Firestore Operations:
- No changes - modal reuses existing patterns

Security Rules:
- No changes - existing rules apply

Event Logging:
- No changes - existing handlers already log events

INTEGRATION POINTS:
- TeamInfo click handler → TeamManagementModal.show(teamId)
- Modal button click → Existing handler → TeamService.callFunction()
- Cloud Function → Firestore update → TeamInfo listener → UI update
- Modal does NOT need its own listener - TeamInfo handles real-time
```

---

## 4. Integration Code Examples

### Opening the Modal (TeamInfo.js)

```javascript
// In _renderTeamsMode() - add gear icon to team button
function _renderTeamsMode() {
    const teamButtons = userTeams.map(team => {
        const isActive = team.id === _selectedTeam?.id;
        return `
            <button class="team-btn ${isActive ? 'active' : ''}" data-team-id="${team.id}">
                <span class="team-name">${team.teamName}</span>
                ${isActive ? `
                    <span class="team-settings-icon opacity-0 group-hover:opacity-100 transition-opacity"
                          data-action="open-settings" title="Team Settings">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </span>
                ` : ''}
            </button>
        `;
    }).join('');
    // ...
}

// In _attachEventListeners()
_panel.addEventListener('click', async (e) => {
    const settingsIcon = e.target.closest('[data-action="open-settings"]');
    if (settingsIcon) {
        e.stopPropagation();
        _handleTeamSettingsClick();
        return;
    }
    // ... existing handlers
});

// New handler
function _handleTeamSettingsClick() {
    if (!_selectedTeam) return;
    TeamManagementModal.show(_selectedTeam.id);
}
```

### Modal Structure (TeamManagementModal.js)

```javascript
const TeamManagementModal = (function() {
    let _teamId = null;
    let _teamData = null;
    let _isLeader = false;
    let _currentUserId = null;

    function show(teamId) {
        _teamId = teamId;
        _teamData = TeamService.getTeamFromCache(teamId);
        _currentUserId = window.firebase?.currentUser?.uid;

        if (!_teamData) {
            ToastService.show('Team data not found', 'error');
            return;
        }

        _isLeader = _teamData.playerRoster.some(
            p => p.userId === _currentUserId && p.role === 'leader'
        );

        _renderModal();
        _attachListeners();
    }

    function _renderModal() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" data-action="close"></div>
            <div class="modal-content max-w-md" role="dialog" aria-modal="true">
                <div class="modal-header">
                    <h2 class="text-lg font-semibold">Team Settings</h2>
                    <button class="modal-close" data-action="close" aria-label="Close">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body space-y-4">
                    ${_renderJoinCodeSection()}
                    ${_isLeader ? _renderMaxPlayersSection() : _renderMaxPlayersReadonly()}
                    ${_isLeader ? _renderLogoSection() : ''}

                    <hr class="border-border my-4">

                    ${_isLeader ? _renderLeaderActions() : ''}
                    ${_renderLeaveTeamSection()}
                </div>
            </div>
        `;
        modalContainer.classList.remove('hidden');
    }

    // ... render sections

    return { show, close };
})();
```

### Action Handler Example (Regenerate Join Code)

```javascript
// Inside TeamManagementModal
async function _handleRegenerateJoinCode() {
    // Show confirmation first
    const confirmed = await _showRegenerateConfirmation();
    if (!confirmed) return;

    const btn = document.getElementById('regenerate-btn');
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Generating...
    `;

    try {
        const result = await TeamService.callFunction('regenerateJoinCode', {
            teamId: _teamId,
            userId: _currentUserId
        });

        if (result.success) {
            // UI updates via TeamInfo's listener
            ToastService.show('New join code generated!', 'success');
        } else {
            ToastService.show(result.error || 'Failed to generate code', 'error');
        }
    } catch (error) {
        console.error('Regenerate join code failed:', error);
        ToastService.show('Network error - please try again', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
```

### Real-time Update Flow

```javascript
// TeamInfo.js - existing listener (NO CHANGES NEEDED)
// This already handles all team updates including those triggered from modal
onSnapshot(doc(db, 'teams', teamId), (doc) => {
    const teamData = doc.data();
    _selectedTeam = { id: doc.id, ...teamData };
    _render();
    TeamService.updateCachedTeam(teamId, teamData);
});
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Modal open: Pure DOM render from cached data - instant
- Modal close: Pure DOM removal - instant
- Copy join code: Clipboard API - instant

COLD PATHS (<2s):
- Regenerate join code: Cloud Function call
  - Loading state: Spinner on button
  - Success: Toast + listener updates UI
  - Error: Toast with message

- Update max players: Cloud Function call
  - Loading state: Disable dropdown
  - Success: Toast + listener updates

- Leave team: Cloud Function call
  - Loading state: Spinner on button
  - Success: Redirect to team selection

- All leader actions: Already have loading states in existing handlers

BACKEND PERFORMANCE:
- No new Cloud Functions - existing performance applies
- No new database queries or indexes needed
```

---

## 6. Data Flow Diagram

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                    TEAM MANAGEMENT MODAL                │
                     └─────────────────────────────────────────────────────────┘

OPEN FLOW:
┌─────────┐    click gear    ┌─────────────────┐    getTeamFromCache    ┌─────────────┐
│ TeamInfo│ ──────────────→ │ TeamManagement  │ ─────────────────────→ │ TeamService │
│  (UI)   │                 │     Modal       │                         │   (Cache)   │
└─────────┘                 └─────────────────┘                         └─────────────┘
                                    │
                                    │ render with team data
                                    ↓
                            ┌─────────────────┐
                            │   Modal HTML    │
                            │  (in #modal-    │
                            │   container)    │
                            └─────────────────┘

ACTION FLOW (e.g., Regenerate Join Code):
┌─────────────────┐    callFunction     ┌─────────────┐    HTTPS    ┌────────────────┐
│ Modal Button    │ ─────────────────→ │ TeamService │ ─────────→ │ Cloud Function │
│ (loading state) │                     └─────────────┘             │ regenerate     │
└─────────────────┘                                                 │ JoinCode       │
                                                                    └────────────────┘
                                                                            │
                                                                            │ update
                                                                            ↓
                                                                    ┌────────────────┐
                                                                    │   Firestore    │
                                                                    │ /teams/{teamId}│
                                                                    └────────────────┘
                                                                            │
                                                                            │ onSnapshot
                                                                            ↓
┌─────────────────┐    re-render    ┌─────────────┐    listener    ┌────────────────┐
│ Toast: Success  │ ←─────────────── │  TeamInfo   │ ←───────────── │   Firebase     │
│ UI shows new    │                  │  (updates)  │                │   Listener     │
│ join code       │                  └─────────────┘                └────────────────┘
└─────────────────┘                         │
                                            │ updateCachedTeam
                                            ↓
                                    ┌─────────────┐
                                    │ TeamService │
                                    │   (Cache)   │
                                    └─────────────┘
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] Gear icon appears on hover over active team name
- [ ] Gear icon NOT visible on inactive team buttons
- [ ] Click gear opens modal with team data
- [ ] Modal shows member view for non-leaders
- [ ] Modal shows leader view (extra buttons) for leaders
- [ ] Join code displays correctly
- [ ] Copy button copies join code to clipboard
- [ ] X button closes modal
- [ ] Backdrop click closes modal
- [ ] ESC key closes modal
- [ ] All buttons show loading state during operations

BACKEND TESTS:
- [ ] (Existing) regenerateJoinCode validates leader
- [ ] (Existing) updateTeamSettings validates maxPlayers >= roster size
- [ ] (Existing) leaveTeam validates conditions
- All Cloud Functions already tested - no changes

INTEGRATION TESTS:
- [ ] Regenerate join code: button → Cloud Function → Firestore → listener → UI shows new code
- [ ] Update max players: dropdown → Cloud Function → Firestore → listener → UI shows new value
- [ ] Leave team: button → Cloud Function → redirect to team selection
- [ ] Error from backend shows toast in modal
- [ ] Network failure shows error toast, re-enables button
- [ ] Concurrent modal + drawer operation (if drawer still exists during 6.0a)

END-TO-END TESTS:
- [ ] Leader opens modal, regenerates code, teammate sees new code in real-time
- [ ] Leader changes max players from 10 to 8, setting persists on refresh
- [ ] Leader removes player via modal, player sees they've been removed
- [ ] Member views modal (read-only settings), clicks Leave Team
- [ ] Modal works at 1080p resolution
- [ ] Modal works at 1440p resolution
```

---

## 8. Common Integration Pitfalls

- [ ] **Forgetting to close modal after Leave Team** - User leaves team, modal should close, UI should redirect
- [ ] **Not updating TeamInfo's cached team** - Modal doesn't have its own listener; relies on TeamInfo to update cache
- [ ] **Copy join code fails silently** - Must show toast feedback for clipboard operations
- [ ] **Regenerate modal-in-modal** - The confirmation for regenerate code is a nested modal; ensure backdrop handling works
- [ ] **Disabled Leave Team not explained** - When leader can't leave, show tooltip explaining why
- [ ] **Max players validation missing frontend** - Check roster size before Cloud Function call
- [ ] **ESC key not wired up** - Add document keydown listener for escape
- [ ] **Missing ARIA attributes** - Modal needs role="dialog", aria-modal="true"
- [ ] **Not escaping team name in HTML** - XSS risk if team name has special characters

---

## 9. Implementation Notes

### Patterns to Follow

**KickPlayerModal.js** is the closest reference:
- Same reveal module pattern
- Same `show(teamId)` signature
- Same `_renderModal()` + `_attachListeners()` structure
- Same `close()` cleanup

### Key Differences from Drawer

1. **Modal is ephemeral** - Opens, does action, closes. Drawer was persistent.
2. **No listener in modal** - Drawer had its own `updateTeamData()`. Modal reads cache once on `show()`.
3. **Gear icon trigger** - New hover-reveal pattern for gear icon

### Handler Migration

All 7 handlers can be copied almost verbatim from `TeamManagementDrawer.js`:
- `_handleCopyJoinCode` - no changes
- `_handleRegenerateJoinCode` + `showRegenerateModal` - adapt modal-in-modal
- `_handleMaxPlayersChange` - no changes
- `_handleManageLogo` - no changes (opens LogoUploadModal)
- `_handleRemovePlayer` - no changes (opens KickPlayerModal)
- `_handleTransferLeadership` - no changes (opens TransferLeadershipModal)
- `_handleLeaveTeam` - add modal close on success

### CSS Notes

- Modal uses existing modal styles (`.modal-backdrop`, `.modal-content`, `.modal-header`, `.modal-body`)
- Gear icon uses Tailwind: `opacity-0 group-hover:opacity-100 transition-opacity`
- Team button needs `group` class for hover state to propagate

### Script Loading Order

```html
<!-- index.html - add after TransferLeadershipModal.js -->
<script src="js/components/TeamManagementModal.js"></script>
```

---

## 10. File Changes Summary

```
NEW FILES:
public/js/components/TeamManagementModal.js
  - ~200-250 lines
  - Reveal module pattern
  - 7 action handlers (migrated from drawer)
  - Member view + Leader view rendering

MODIFIED FILES:
public/js/components/TeamInfo.js
  - Remove: _drawerInstance variable (~line 18)
  - Remove: _initializeDrawer() call (~line 540)
  - Remove: _initializeDrawer() function (~lines 545-580)
  - Add: Gear icon in _renderTeamsMode() team button
  - Add: CSS class "group" to team button for hover state
  - Add: Click handler for [data-action="open-settings"]
  - Add: _handleTeamSettingsClick() function

public/index.html
  - Add: <script src="js/components/TeamManagementModal.js"></script>
    (after line 218, after TransferLeadershipModal.js)

KEEP FOR NOW (delete in 6.0c):
public/js/components/TeamManagementDrawer.js
  - Keep during 6.0a for reference and fallback
```

---

## 11. Dependencies

**Required (already exist):**
- TeamService.getTeamFromCache()
- TeamService.callFunction()
- ToastService.show()
- Modal CSS styles (`.modal-*` classes)
- KickPlayerModal (called from modal)
- TransferLeadershipModal (called from modal)
- LogoUploadModal (called from modal)

**No new dependencies needed.**

---

## 12. Quality Checklist

- [x] Frontend AND backend requirements specified
- [x] All PRD requirements mapped (4.3.2, 4.3.3, 4.3.4)
- [x] Architecture follows cache + listener pattern
- [x] Hot paths identified (modal open/close: instant)
- [x] Cold paths have loading states
- [x] Test scenarios cover frontend, backend, and integration
- [x] Data flow is complete (UI → Cloud Function → Firestore → Listener → UI)
- [x] Integration examples show actual code
- [x] Error handling specified for all operations
- [x] Loading states defined for backend calls
- [x] No new event logging needed (existing handlers log)
- [x] API contracts unchanged (reusing existing functions)
- [x] Security rules unchanged (existing rules apply)

---

*Slice 6.0a created: 2026-01-29*
*Parent slice: 6.0 Team Panel UI Refactor*
*Addresses: Moving team management from drawer to modal for better UX*
