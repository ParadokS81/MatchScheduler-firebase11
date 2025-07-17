# Slice 1.2: Team Creation & Management

## 1. Slice Definition
- **Slice ID:** 1.2
- **Name:** Team Creation & Management
- **User Story:** As a new user, I can create/join a team and as a team leader, I can manage team settings and see all relevant information
- **Success Criteria:** 
  - User can create a team and becomes leader
  - Leader can see and regenerate join code in drawer
  - Leader can adjust team settings
  - Members see appropriate read-only view

## 2. PRD Mapping

### PRIMARY SECTIONS:
- **1.2 Authenticated User**: Unified onboarding modal specs (nickname, initials, create/join flow)
- **4.3.1 Team Creation**: Post-creation experience, first-time guidance
- **4.3.4 Team Management Drawer**: Complete drawer UI/UX for leaders and members
- **4.3.2 Team Settings**: Max players, divisions, join code regeneration

### DEPENDENT SECTIONS:
- **2.3 Team Member → Leader**: State lifecycle when becoming leader
- **5.1 Hot Paths**: Team switching must be instant
- **5.3 Data Caching**: Pre-load all teams on app init
- **5.6 Event Logging**: Team creation and join events

### IGNORED SECTIONS:
- **4.3.3 Player Management**: Kick/transfer features (Slice 3.3)
- **Logo Management**: Upload/display (Slice 4.1)
- **Discord Contact**: Leader-to-leader messaging (Slice 4.2)

## 3. Component Architecture

### NEW COMPONENTS:
- **TeamManagementDrawer** (child of TeamInfo)
  - Firebase listeners: none (receives data from parent)
  - Cache interactions: none (display only)
  - Parent: TeamInfo component

### MODIFIED COMPONENTS:
- **TeamInfo**
  - Add drawer component integration
  - Remove join code from main display (move to drawer)
  - Handle drawer open/close state
  - Pass team data + user role to drawer

- **OnboardingModal**
  - Already complete from previous work
  - No modifications needed

### SERVICE UPDATES:
- **TeamService**
  - Already has getAllTeams() and caching
  - No new methods needed

## 4. Performance Classification

### HOT PATHS (<50ms):
- **Open/close drawer**: CSS transform only, no data fetch
- **Copy join code**: Clipboard API, instant feedback
- **Team data display**: Read from TeamInfo's existing data

### COLD PATHS (<2s):
- **Regenerate join code**: Cloud Function call, show loading state
- **Update max players**: Firestore update, optimistic UI
- **Update divisions**: Firestore update, optimistic UI

## 5. Data Flow Diagram

```
TeamInfo Component Init:
→ Has team data from listener
→ Determines user role (leader/member)
→ Renders drawer with appropriate view

User Opens Drawer:
→ CSS transform (instant)
→ Drawer shows pre-loaded data
→ No network calls needed

Leader Regenerates Code:
→ Button click → Loading state
→ Cloud Function → New code
→ Firestore update → Listener fires
→ TeamInfo updates → Drawer updates
```

## 6. Test Scenarios

- [ ] Leader can open drawer and see join code with regenerate button
- [ ] Member can open drawer and see join code without regenerate button
- [ ] Join code copies to clipboard with success feedback
- [ ] Regenerating code updates UI in real-time
- [ ] Max players dropdown shows current value and updates work
- [ ] Drawer animation is smooth and doesn't affect performance
- [ ] Team switching preserves drawer state appropriately
- [ ] Leave team button shows for members (disabled for now)

## 7. Implementation Notes

### Key Details from PRD:
- Drawer is **collapsed by default** at bottom of Team Info panel
- First-time leaders should see drawer pulse/highlight
- Join code field has copy button that generates share string
- Max players dropdown: 4-20 players range
- Logo shows 5rem square placeholder for now
- Leave Team button disabled unless last player (not implemented yet)

### Existing Code to Reuse:
- Drawer CSS classes already in styles (from previous attempts)
- Copy-to-clipboard pattern exists in codebase
- Loading button states pattern established

### Architecture Compliance:
- Drawer is child component, NO Firebase listeners
- All data flows from TeamInfo's existing listener
- No callbacks or complex state management
- Follows revealing module pattern

### Visual Reference:
- See `/context/UI_examples/team_panel.png` for drawer design
- OKLCH theme variables for consistent styling
- Follow button and form patterns from ProfileModal

### Edge Cases:
- Handle drawer state when switching teams
- Ensure drawer closes when user loses team access
- Validate max players can't go below current roster size