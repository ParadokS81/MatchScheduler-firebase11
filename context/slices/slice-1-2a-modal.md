# Slice 1.2a: Create/Join Team Modal

## Slice Definition
- **Slice ID:** 1.2a
- **Name:** Create/Join Team Modal
- **User Story:** As an authenticated user, I can create a new team or join an existing team through a unified modal interface
- **Success Criteria:** User successfully creates team and becomes leader OR joins existing team as member

## PRD Mapping
```
PRIMARY SECTIONS:
- 2.2 Authenticated (No Profile) → Team Member: Unified modal flow
- 4.3.1 Team Creation & Initial Setup: Post-creation experience

DEPENDENT SECTIONS:
- 1.2 Authenticated User: Permissions and state
- 1.3 Team Member: Result state after joining
- 1.4 Team Leader: Result state after creating

IGNORED SECTIONS:
- Team management features (drawer, settings)
- Logo upload functionality
```

## Component Architecture
```
NEW COMPONENTS:
- CreateJoinTeamModal
  - Firebase listeners: none (one-time operations)
  - Cache interactions: updates team cache after create/join
  - Parent: triggered by button click in TeamInfo panel

MODIFIED COMPONENTS:
- TeamInfo: Show "Create/Join Team" button when no team
- App: Handle modal display state

SERVICE UPDATES:
- TeamService: createTeam(), joinTeam() methods
- CacheService: update user teams map, add team to cache
```

## Implementation Details

### Modal Structure (Unified Flow)
```
[Profile Section]
Nickname: [text input]
Initials: [3-char input] 

[Divider]

[Join Existing Team]
Join Code: [6-char input] [Join Team Button]

[Create New Team] 
Team Name: [text input]
Team Tag: [4-char input]
Divisions: [checkboxes 1, 2, 3]
Max Players: [dropdown, default 10]
[Create Team Button]
```

### Flow Behavior
- **Join Path:** Validates only join code field
- **Create Path:** Validates only create team fields
- **Success:** Modal closes, dashboard updates immediately
- **Error:** Inline error messages (wrong code, name taken, etc.)

## Performance Classification
```
HOT PATHS (<50ms):
- Modal open/close animations
- Form field interactions

COLD PATHS (<2s):
- Create team operation (shows "Creating..." state)
- Join team operation (brief loading)
```

## Status Note
**This slice is already complete and working.** This spec documents what was built for reference and ensures the implementation matches PRD requirements.

---