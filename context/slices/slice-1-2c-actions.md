# Slice 1.2c: Team Actions Implementation

## Slice Definition
- **Slice ID:** 1.2c
- **Name:** Team Actions Implementation
- **User Story:** As a team member/leader, I can use the management drawer buttons to perform actual team operations
- **Success Criteria:** Copy button works, leave team works, regenerate code works for leaders

## PRD Mapping
```
PRIMARY SECTIONS:
- 4.3.2 Team Settings Management: Join code regeneration
- 2.5 Team Member → No Teams: Leave team flow

DEPENDENT SECTIONS:
- 1.3 Team Member: Permissions for actions
- 1.4 Team Leader: Additional permissions
- 7.2 Optimistic Update Rollback: For instant UI feedback

IGNORED SECTIONS:
- Remove player functionality (separate slice)
- Transfer leadership (separate slice)
- Logo management (separate slice)
```

## Component Architecture
```
NEW COMPONENTS:
- None (adding functionality to existing drawer)

MODIFIED COMPONENTS:
- TeamManagementDrawer: Wire up button click handlers
  - Copy button: Copy join code with team info
  - Leave button: Show confirmation then execute
  - Regenerate button: Generate new code (leaders only)

SERVICE UPDATES:
- TeamService: 
  - regenerateJoinCode(teamId)
  - leaveTeam(teamId, userId)
- CacheService: Update team data after changes
```

## Execution Boundaries
**Start State:** 
- Team management drawer UI complete (1.2b done)
- All buttons render but show "Not implemented"
- User can open/close drawer

**End State:**
- Copy button copies enhanced string to clipboard
- Leave team removes user and updates UI
- Regenerate creates new join code instantly
- All actions show success/error feedback

**Out of Scope:**
- Remove player modal/functionality
- Transfer leadership modal/functionality
- Logo management modal/functionality

## Implementation Details

### Copy Functionality
```javascript
// Enhanced copy string (frontend generated)
`Use code: ${joinCode} to join ${teamName} at ${window.location.origin}`

// Show success toast: "Join code copied!"
```

### Leave Team Flow
1. Show confirmation modal (simple yes/no)
2. If last member: "This will archive the team"
3. On confirm: Remove from roster, update cache
4. UI updates to show "Create/Join Team" state

### Regenerate Code (Leaders Only)
1. Instant new code generation
2. Old code becomes invalid immediately
3. Update displayed code in drawer
4. Show success toast: "New join code generated"

## Performance Classification
```
HOT PATHS (<50ms):
- Copy to clipboard: Instant browser API
- Code display update: Local state change

COLD PATHS (<2s):
- Leave team: Firebase operation
- Regenerate code: Firebase operation
```

## Test Scenarios
- [ ] Copy button copies full invite string to clipboard
- [ ] Copy button shows success toast
- [ ] Leave team shows appropriate confirmation (different for last member)
- [ ] Leave team updates UI to no-team state
- [ ] Leave team as non-last member stays on team page
- [ ] Regenerate only visible to leaders
- [ ] Regenerate creates new 6-character code
- [ ] Old join code no longer works after regenerate
- [ ] All actions handle errors gracefully

## Implementation Notes
- Use optimistic updates for UI changes
- Confirmation modals can be simple (not styled like main modals)
- Join codes should be 6 uppercase alphanumeric characters
  - **[ASSUMPTION]**: Exclude ambiguous characters (0, O, 1, I) to avoid confusion
  - **Character set**: A-H, J-N, P-Z, 2-9 (23 letters + 8 numbers = 31 chars)
  - **Example codes**: ABC2D3, PQRS56, XYZH89
- Consider using browser Clipboard API with fallback
- Show loading state on buttons during Firebase operations

---