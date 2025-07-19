# Vertical Slice 1.2c: Team Actions Implementation

## 1. Slice Definition

- **Slice ID:** 1.2c
- **Name:** Team Actions Implementation
- **User Story:** As a team member or leader, I can perform team management actions (copy join code, leave team, regenerate code, update settings) so that I can effectively manage my team participation
- **Success Criteria:** User can execute all drawer actions with full persistence, real-time updates, and proper error handling

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.3.2: Copy function implementation, regenerate join code, max players update
- 4.3.3: Leave team functionality with role-specific behavior

DEPENDENT SECTIONS:
- 4.3.4: Team drawer UI (already implemented in 1.2b)
- 4.3.1: Join code system understanding
- 5.6: Event logging requirements

IGNORED SECTIONS:
- 4.3.2: Logo management (deferred to slice 4.1)
- 4.3.3: Remove Player, Transfer Leadership (separate modals, future slices)
```

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- TeamManagementDrawer (enhance existing)
  - Firebase listeners: Already set up in TeamInfo
  - Cache interactions: Reads from TeamService cache
  - UI responsibilities: Handle button clicks, show loading states
  - User actions: Copy, Leave, Regenerate, Update Max Players

FRONTEND SERVICES:
- TeamService (add new methods):
  - callFunction('regenerateJoinCode', {teamId}) → backend regenerateJoinCode
  - callFunction('leaveTeam', {teamId}) → backend leaveTeam  
  - callFunction('updateTeamSettings', {teamId, maxPlayers}) → backend updateTeamSettings
  - copyJoinCode(joinCode, teamName) → clipboard operation (frontend only)

BACKEND REQUIREMENTS:
- Cloud Functions:
  - regenerateJoinCode({teamId}):
    - Purpose: Generate new join code, invalidate old one
    - Validation: User must be team leader
    - Operations: Update teams/{teamId}.joinCode
    - Returns: { success: true, data: { joinCode: "ABC123" } }
  
  - leaveTeam({teamId}):
    - Purpose: Remove user from team
    - Validation: User must be on team, special rules for leaders
    - Operations: Remove from roster, update user teams, handle last player
    - Returns: { success: true, data: { leftTeam: true, teamArchived?: true } }
  
  - updateTeamSettings({teamId, maxPlayers}):
    - Purpose: Update team configuration
    - Validation: User must be leader, maxPlayers >= current roster size
    - Operations: Update teams/{teamId}.maxPlayers
    - Returns: { success: true, data: { maxPlayers: 10 } }

- Firestore Operations:
  - teams/{teamId}: Update joinCode, maxPlayers, playerRoster, status
  - users/{userId}: Update teams map when leaving
  - Security Rules: Already exist for team operations

- Authentication/Authorization:
  - All functions require authenticated user
  - Leader-only: regenerateJoinCode, updateTeamSettings
  - Member/Leader: leaveTeam (different behavior)

- Event Logging:
  - TEAM_SETTINGS_UPDATED: When maxPlayers changed
  - JOIN_CODE_REGENERATED: When new code generated
  - LEFT: When player leaves team
  - TEAM_ARCHIVED: When last player leaves

- External Services: None

INTEGRATION POINTS:
- Frontend → Backend calls:
  - TeamManagementDrawer clicks → TeamService methods → Cloud Functions
- API Contracts:
  - regenerateJoinCode: { teamId: string } → { success: true, data: { joinCode: string } }
  - leaveTeam: { teamId: string } → { success: true, data: { leftTeam: boolean, teamArchived?: boolean } }
  - updateTeamSettings: { teamId: string, maxPlayers: number } → { success: true, data: { maxPlayers: number } }
- Real-time listeners: TeamInfo already listening to teams/{teamId}
- Data flow: Button click → TeamService → Cloud Function → Firestore → Listener → UI Update
```

## 4. Integration Code Examples

```javascript
// In TeamManagementDrawer - Copy Join Code
async function handleCopyJoinCode() {
    const joinCode = _teamData.joinCode;
    const teamName = _teamData.teamName;
    
    // Enhanced copy string per PRD
    const copyText = `Use code: ${joinCode} to join ${teamName} at ${window.location.origin}`;
    
    try {
        await navigator.clipboard.writeText(copyText);
        ToastService.showSuccess('Join code copied to clipboard!');
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = copyText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        ToastService.showSuccess('Join code copied to clipboard!');
    }
}

// In TeamManagementDrawer - Regenerate Join Code
async function handleRegenerateJoinCode() {
    // Show confirmation modal first
    const confirmed = await showConfirmModal({
        title: 'Regenerate Join Code?',
        message: 'This will immediately invalidate the current join code. Anyone trying to use the old code will not be able to join.',
        confirmText: 'Regenerate',
        confirmClass: 'bg-primary hover:bg-primary/90',
        cancelText: 'Cancel'
    });
    
    if (!confirmed) return;
    
    const button = document.getElementById('regenerate-join-code-btn');
    const originalContent = button.innerHTML;
    
    // Show loading state
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>';
    
    try {
        const result = await TeamService.callFunction('regenerateJoinCode', {
            teamId: _teamData.id
        });
        
        if (!result.success) {
            ToastService.showError(result.error || 'Failed to regenerate code');
        }
        // No success feedback - the code change is visible in UI
    } catch (error) {
        console.error('Error regenerating join code:', error);
        ToastService.showError('Network error - please try again');
    } finally {
        button.disabled = false;
        button.innerHTML = originalContent;
    }
}

// In TeamService - Generic Cloud Function caller
async function callFunction(functionName, data) {
    if (!_initialized || !_functions) {
        throw new Error('TeamService not initialized');
    }
    
    try {
        const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
        const cloudFunction = httpsCallable(_functions, functionName);
        const result = await cloudFunction(data);
        
        return result.data;
    } catch (error) {
        console.error(`Error calling ${functionName}:`, error);
        
        // Extract user-friendly error message
        if (error.code === 'unauthenticated') {
            return { success: false, error: 'Please sign in to continue' };
        } else if (error.code === 'permission-denied') {
            return { success: false, error: 'You do not have permission for this action' };
        } else if (error.message) {
            return { success: false, error: error.message };
        } else {
            return { success: false, error: 'An unexpected error occurred' };
        }
    }
}

// In TeamManagementDrawer - Leave Team
async function handleLeaveTeam() {
    const isLastMember = _teamData.playerRoster.length === 1;
    const message = isLastMember 
        ? 'You are the last member. Leaving will archive this team permanently.'
        : 'Are you sure you want to leave this team? You can rejoin later with a join code.';
    
    const confirmed = await showConfirmModal({
        title: 'Leave Team?',
        message: message,
        confirmText: 'Leave Team',
        confirmClass: 'bg-destructive hover:bg-destructive/90',
        cancelText: 'Cancel'
    });
    
    if (!confirmed) return;
    
    const button = document.getElementById('leave-team-btn');
    const originalContent = button.innerHTML;
    
    // Show loading state
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Leaving...';
    
    try {
        const result = await TeamService.callFunction('leaveTeam', {
            teamId: _teamData.id
        });
        
        if (result.success) {
            // Navigation/switching handled by parent components
            // No toast needed - the UI change is feedback enough
        } else {
            ToastService.showError(result.error || 'Failed to leave team');
            button.disabled = false;
            button.innerHTML = originalContent;
        }
    } catch (error) {
        console.error('Error leaving team:', error);
        ToastService.showError('Network error - please try again');
        button.disabled = false;
        button.innerHTML = originalContent;
    }
}

// In TeamManagementDrawer - Update Max Players
async function handleMaxPlayersChange(event) {
    const newValue = parseInt(event.target.value);
    const oldValue = _teamData.maxPlayers;
    const currentRosterSize = _teamData.playerRoster.length;
    
    // Optimistically update UI
    _teamData.maxPlayers = newValue;
    
    // Silently validate
    if (newValue < currentRosterSize) {
        // Revert without any error message
        event.target.value = oldValue;
        _teamData.maxPlayers = oldValue;
        return;
    }
    
    try {
        const result = await TeamService.callFunction('updateTeamSettings', {
            teamId: _teamData.id,
            maxPlayers: newValue
        });
        
        if (!result.success) {
            // Silently revert on error
            event.target.value = oldValue;
            _teamData.maxPlayers = oldValue;
        }
        // No success feedback - the change is visible
    } catch (error) {
        console.error('Error updating max players:', error);
        // Silently revert
        event.target.value = oldValue;
        _teamData.maxPlayers = oldValue;
    }
}

// Leader tooltip for disabled leave button
function addLeaderTooltip() {
    const leaveButton = document.getElementById('leave-team-btn');
    if (leaveButton && leaveButton.disabled) {
        leaveButton.title = 'Leaders cannot leave their team. Transfer leadership first or be the last member.';
    }
}

// Real-time update flow (already exists)
// teams/{teamId} change → TeamInfo listener → updateUI() → TeamService.updateCache()
// This means UI updates automatically when backend changes joinCode, maxPlayers, etc.
```

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Copy join code: Pure frontend operation, instant
- Dropdown state changes: Instant UI update before save

COLD PATHS (<2s):
- Regenerate join code: Shows loading spinner on button
- Leave team: Shows loading state, may trigger navigation
- Update max players: Shows loading feedback on save

BACKEND PERFORMANCE:
- Cloud Function cold starts: Not critical for these operations
- Database queries: Simple document updates, no indexes required
```

## 6. Data Flow Diagram

```
COPY JOIN CODE:
Click "Copy" → handleCopyJoinCode() → navigator.clipboard → Success Toast

REGENERATE JOIN CODE:
Click "Regenerate" → TeamDrawer.handleRegenerateJoinCode() → TeamService.callFunction() 
→ regenerateJoinCode() → Update teams/{teamId} → onSnapshot fires → TeamInfo.updateUI() 
→ TeamManagementDrawer.updateTeamData() → New code displayed

LEAVE TEAM:
Click "Leave" → Show confirmation modal → Confirm → TeamService.callFunction('leaveTeam')
→ leaveTeam() → Update teams/{teamId} + users/{userId} → Listeners fire 
→ If last team: Navigate to home → If have other team: Switch to it

UPDATE MAX PLAYERS:
Change dropdown → handleMaxPlayersChange() → Validate >= roster size → If valid: 
TeamService.callFunction('updateTeamSettings') → updateTeamSettings() 
→ Update teams/{teamId} → onSnapshot → UI reflects new max
If invalid or error: Silently revert to previous value
```

## 7. Test Scenarios

```
FRONTEND TESTS:
- [x] Copy button copies enhanced string to clipboard
- [x] Copy shows success toast
- [x] Regenerate button shows confirmation modal before action
- [x] Regenerate button shows loading spinner during operation
- [x] Max players dropdown shows current value
- [x] Max players silently reverts if value < roster size
- [x] Leave team button enabled for members, disabled for leaders with tooltip
- [x] Leave team shows confirmation modal with appropriate message
- [x] All buttons disabled during their respective operations

BACKEND TESTS:
- [x] regenerateJoinCode generates unique 6-char code
- [x] regenerateJoinCode rejects non-leaders
- [x] leaveTeam removes player from roster
- [x] leaveTeam updates user's teams map
- [x] leaveTeam archives team if last player
- [x] updateTeamSettings validates maxPlayers >= roster size
- [x] All functions log appropriate events

INTEGRATION TESTS (CRITICAL):
- [x] Regenerate code → old code becomes invalid → new code works
- [x] Leave team → user removed from roster → team UI updates
- [x] Last player leaves → team archived → not shown in browse
- [x] Update max players → prevents joins when full
- [x] Network failure → appropriate error shown → UI remains consistent
- [x] Permission denied → user sees explanation → no partial updates

END-TO-END TESTS:
- [x] Member can copy and share join code successfully
- [x] Leader can regenerate code and share new one
- [x] Member can leave and rejoin with new code
- [x] Real-time updates work across multiple tabs
- [x] All actions complete within performance budgets
```

## 8. Common Integration Pitfalls

- [x] Not showing loading states during Cloud Function calls
- [x] Not handling clipboard API failures (older browsers)
- [x] Forgetting to disable buttons during operations
- [x] Not updating both team roster AND user teams when leaving
- [x] Missing validation for max players < current roster size
- [x] Not handling the "last player leaving" edge case
- [x] Assuming clipboard API is always available

## 9. Implementation Notes

- Copy function uses enhanced string format per PRD 4.3.2
- Clipboard API has fallback for older browsers
- Leave team requires confirmation modal (to be implemented)
- Max players changes save immediately (no separate save button) for better UX
- Loading states use inline spinners, not overlays
- All Cloud Functions return consistent { success, data, error } format
- Event logging follows existing patterns from team creation

## 10. Design Decisions (From User Input)

- **Enhanced Copy Format**: Uses full format with team name and URL
- **Confirmed by user**: More helpful for Discord sharing than just the code

- **Max Players Auto-Save**: Saves immediately on dropdown change
- **Confirmed by user**: Simpler UX without save/cancel buttons

- **Silent Error Handling**: Max players silently reverts on any error
- **Confirmed by user**: No popups or toasts - seamless experience preferred

- **Leave Team Confirmation**: Shows modal with context-aware message
- **Confirmed by user**: Safety for destructive action

- **Regenerate Confirmation**: Shows warning modal, no success toast afterward
- **Confirmed by user**: Visual feedback of new code is sufficient

## 11. Implementation Dependencies

### Required Modal System
The slice depends on a `showConfirmModal` function that needs to be implemented:
```javascript
// Expected signature
async function showConfirmModal({
    title: string,
    message: string, 
    confirmText: string,
    confirmClass: string,
    cancelText: string
}) => Promise<boolean>
```

### Existing Dependencies
- `ToastService`: Already implemented with showSuccess/showError/showWarning/showInfo methods
- `TeamInfo` component: Must be listening to team document for real-time updates
- `TeamService.callFunction`: Generic Cloud Function caller (to be added to TeamService)

---

## Quality Checklist

- [x] Frontend AND backend requirements specified
- [x] All PRD requirements mapped (except deferred logo/modals)
- [x] Architecture follows cache + listener pattern
- [x] Hot paths identified (copy is instant)
- [x] Test scenarios cover full stack
- [x] No anti-patterns present
- [x] Data flow complete for all actions
- [x] Integration examples show actual code
- [x] Error handling specified for all operations  
- [x] Loading states defined for backend calls
- [x] Event logging requirements from PRD 5.6 included
- [x] API contracts fully specified
- [x] Security rules noted as existing