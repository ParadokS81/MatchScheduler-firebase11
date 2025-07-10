# MatchScheduler Claude Guidelines

## Implementation Best Practices

### 0 — Purpose  

These rules ensure maintainability, safety, and developer velocity for MatchScheduler gaming community project.
**MUST** rules are enforced; **SHOULD** rules are strongly recommended.

---

### 1 — Before Coding

- **BP-1 (MUST)** Ask the user clarifying questions about gaming community workflows.
- **BP-2 (MUST)** Reference relevant PRD v2 sections and architecture documents before implementing.
- **BP-3 (SHOULD)** Draft and confirm approach for features affecting user workflows.  
- **BP-4 (SHOULD)** If ≥ 2 approaches exist, list clear pros and cons with performance implications.
- **BP-5 (MUST)** Confirm integration patterns align with Firebase v11 direct subscription architecture.

---

### 2 — While Coding

- **C-1 (SHOULD)** Follow TDD when possible: scaffold stub -> write failing test -> implement.
- **C-2 (MUST)** Use existing domain vocabulary: team, roster, availability, comparison, tournament.  
- **C-3 (SHOULD NOT)** Introduce complex classes when simple revealing module pattern suffices.  
- **C-4 (MUST)** Prefer simple, composable, testable functions that align with gaming workflows.
- **C-5 (MUST)** Use Firebase v11 modular imports only:
  ```javascript
  import { doc, onSnapshot } from 'firebase/firestore';  // ✅ Good
  import firebase from 'firebase/app';                   // ❌ Bad v8 pattern
  ```  
- **C-6 (MUST)** Use rem units for all sizing to prevent scaling issues:
  ```css
  padding: 1rem;        /* ✅ Good - scales with viewport */
  padding: 16px;        /* ❌ Bad - fixed, doesn't scale */
  ```
- **C-7 (SHOULD NOT)** Add comments except for gaming community context or critical caveats; rely on self‑explanatory code.
- **C-8 (MUST)** Follow hot path performance requirements (< 50ms):
  - Availability updates must be optimistic
  - Team switching must use cached data
  - Week navigation must be instant
- **C-9 (SHOULD NOT)** Extract a new function unless it will be reused elsewhere, is the only way to unit-test otherwise untestable logic, or drastically improves readability of gaming workflow logic.
- **C-10 (MUST)** Maintain sacred 3x3 grid layout constraints - never modify panel dimensions or positions.

---

### 3 — Testing

- **T-1 (MUST)** For simple functions, colocate unit tests in same directory as source file.
- **T-2 (MUST)** For Firebase integration, use Firebase Emulator Suite for testing.
- **T-3 (MUST)** ALWAYS separate pure-logic unit tests from Firebase-touching integration tests.
- **T-4 (SHOULD)** Prefer integration tests over heavy mocking for Firebase operations.  
- **T-5 (SHOULD)** Unit-test availability calculation algorithms thoroughly.
- **T-6 (SHOULD)** Test the entire gaming workflow in one assertion if possible:
  ```javascript
  expect(teamAvailability).toEqual({
    'mon_1900': ['ABC', 'DEF'], 
    'tue_2000': ['ABC']
  }); // Good

  expect(teamAvailability).toHaveProperty('mon_1900'); // Bad
  expect(teamAvailability['mon_1900']).toContain('ABC'); // Bad
  ```
- **T-7 (MUST)** Test real-time listener behavior and cleanup.
- **T-8 (SHOULD)** Test performance requirements with realistic gaming community data (40 teams, 300 players).

---

### 4 — Firebase Integration

- **F-1 (MUST)** Use direct component subscriptions, avoid complex state management:
  ```javascript
  // ✅ Good - Direct subscription
  onSnapshot(doc(db, 'teams', teamId), (doc) => {
    TeamInfo.updateUI(doc.data());
  });
  
  // ❌ Bad - Complex state middleware
  StateService.subscribeToTeam(teamId, callback);
  ```
- **F-2 (MUST)** Implement optimistic updates with rollback for hot paths.
- **F-3 (SHOULD)** Use compound document IDs for efficient queries: `${teamId}_${weekId}`.
- **F-4 (MUST)** Clean up listeners on component destruction and tab visibility changes.
- **F-5 (SHOULD)** Batch Firebase operations when updating multiple documents.

---

### 5 — Gaming Community Context

- **G-1 (MUST)** Remember scale: 300 players, 40 teams, 4 weeks visibility.
- **G-2 (MUST)** Consider Discord-based communication patterns in UX flows.
- **G-3 (SHOULD)** Design for tournament deadline pressure and team coordination needs.
- **G-4 (MUST)** Validate availability slot formats: `ddd_hhmm` (e.g., `mon_1900`).
- **G-5 (MUST)** Respect 2-team maximum per user constraint.
- **G-6 (SHOULD)** Consider clan teams + draft tournament usage patterns.

---

### 6 — Code Organization

- **O-1 (MUST)** Follow revealing module pattern for components:
  ```javascript
  const ComponentName = (function() {
    let _panel;
    let _state = {};
    
    function init(panelId) {
      _panel = document.getElementById(panelId);
      _setupElements();
      _attachListeners();
    }
    
    return { init, update, cleanup };
  })();
  ```
- **O-2 (MUST)** Place shared utilities in dedicated modules only if used by ≥ 2 components.
- **O-3 (MUST)** Keep component responsibilities clear: data-owning vs pure UI components.

---

### 7 — UI/UX Requirements

- **U-1 (MUST)** Preserve sacred 3x3 grid layout with exact panel proportions.
- **U-2 (MUST)** Use hybrid scaling approach with clamp() for responsive design:
  ```css
  grid-template-columns: clamp(300px, 20vw, 400px) 1fr clamp(300px, 20vw, 400px);
  ```
- **U-3 (MUST)** Follow OKLCH color system for consistent theming.
- **U-4 (SHOULD)** Maintain team management drawer interaction patterns.
- **U-5 (MUST)** Ensure mobile degradation doesn't break core functionality.

---

### 8 — Performance Gates

- **P-1 (MUST)** Hot path operations complete in < 50ms.
- **P-2 (MUST)** Cold path operations complete in < 2 seconds.
- **P-3 (SHOULD)** Cache size remains under 200KB for full team dataset.
- **P-4 (MUST)** Real-time updates propagate within 500ms.

---

### 9 - Git

- **GH-1 (MUST)** Use Conventional Commits format: https://www.conventionalcommits.org/en/v1.0.0
- **GH-2 (SHOULD NOT)** Refer to Claude or Anthropic in commit messages.
- **GH-3 (SHOULD)** Reference PRD sections or architecture decisions in commit body when relevant.

---

## Writing Functions Best Practices

When evaluating whether a function you implemented is good for gaming community workflows:

1. **Gaming Context**: Can a team leader or player easily understand what this function does in their workflow?
2. **Cyclomatic Complexity**: Does the function have very high complexity? Gaming workflows should be simple and predictable.
3. **Data Structures**: Are there gaming-specific patterns (availability grids, team rosters, tournament brackets) that would make this clearer?
4. **Unused Parameters**: Are there any unused parameters that could be team/player context?
5. **Type Safety**: Are availability slot formats (`ddd_hhmm`) properly validated?
6. **Testability**: Can this be tested with realistic gaming community data without complex mocking?
7. **Hidden Dependencies**: Does it depend on Firebase state that could change during gaming sessions?
8. **Naming**: Does the name match gaming domain vocabulary (availability, roster, comparison, tournament)?

IMPORTANT: you SHOULD NOT refactor out a separate function unless there is a compelling need, such as:
  - the refactored function is used across multiple gaming workflows
  - the refactored function handles complex availability calculations that need unit testing
  - the original function is extremely hard for team leaders to understand conceptually

## Writing Tests Best Practices for Gaming Community

When evaluating whether a test for gaming workflows is good:

1. **SHOULD** parameterize with realistic gaming data; never embed unexplained literals like 42 or "foo" - use team names, player initials, realistic time slots.
2. **SHOULD NOT** add a test unless it can fail for a real gaming workflow defect.
3. **SHOULD** ensure test description matches gaming user story: "team leader can remove inactive player" not "removePlayer returns true".
4. **SHOULD** compare results to independent gaming expectations:
   ```javascript
   // ✅ Good - Independent expectation
   expect(availableSlots).toEqual(['mon_1900', 'tue_2000']);
   
   // ❌ Bad - Circular dependency
   expect(availableSlots).toEqual(calculateAvailability(input));
   ```
5. **SHOULD** follow same code quality rules as production.
6. **SHOULD** express gaming invariants when possible:
   ```javascript
   // Team roster size should never exceed maxPlayers
   fc.assert(fc.property(
     fc.array(fc.string(), { maxLength: 20 }),
     fc.integer({ min: 1, max: 20 }),
     (players, maxPlayers) => {
       const team = createTeam(players.slice(0, maxPlayers), maxPlayers);
       return team.playerRoster.length <= team.maxPlayers;
     }
   ));
   ```
7. Unit tests should be grouped under `describe(functionName, () => ...`.
8. Use `expect.any(...)` for variable team/player IDs.
9. ALWAYS use strong assertions: `expect(teamCount).toEqual(2)` not `expect(teamCount).toBeGreaterThan(1)`.
10. **SHOULD** test gaming edge cases: empty teams, max roster, tournament deadlines, Discord integration.
11. **SHOULD NOT** test conditions caught by team/player validation.

## Gaming Community Workflows

Understanding these workflows helps write better code:

- **Team Creation**: Leader creates team → shares join code in Discord → teammates join → set availability → compare with opponents
- **Match Scheduling**: Check team availability → compare with opponents → find overlapping slots → contact other leader via Discord
- **Tournament Context**: Teams know upcoming opponents → deadline pressure → need quick scheduling
- **Community Scale**: 300 players, ~40 teams, 2-team limit per player, Discord-centric communication

## Remember Shortcuts

### QNEW
When I type "qnew", this means:
```
Understand all BEST PRACTICES for MatchScheduler gaming community project.
Your code SHOULD ALWAYS follow these gaming-specific best practices.
Reference PRD v2 sections and architecture docs as needed.
```

### QPLAN
When I type "qplan", this means:
```
Analyze MatchScheduler codebase and determine whether your plan:
- is consistent with gaming community workflows
- follows Firebase v11 direct subscription patterns
- maintains hot path performance requirements
- preserves sacred 3x3 grid layout
- introduces minimal changes to proven patterns
```

### QCODE
When I type "qcode", this means:
```
Implement your plan following MatchScheduler patterns:
- Use revealing module pattern for components
- Implement Firebase v11 direct subscriptions
- Ensure hot paths complete in < 50ms
- Use rem units for all sizing
- Test with Firebase Emulator Suite
- Run tests to ensure gaming workflows still work
```

### QCHECK
When I type "qcheck", this means:
```
You are a SKEPTICAL senior developer familiar with gaming community needs.
Perform this analysis for every MAJOR code change (skip minor changes):

1. MatchScheduler Writing Functions Best Practices checklist.
2. MatchScheduler Writing Tests Best Practices checklist.
3. Gaming community workflow impact analysis.
4. Performance requirements validation (hot vs cold paths).
5. Sacred 3x3 grid layout preservation check.
```

### QCHECKF
When I type "qcheckf", this means:
```
You are a SKEPTICAL senior developer.
Perform this analysis for every MAJOR function you added or edited:

1. MatchScheduler Writing Functions Best Practices checklist.
2. Gaming domain vocabulary usage check.
3. Hot path performance validation if applicable.
```

### QCHECKT
When I type "qcheckt", this means:
```
You are a SKEPTICAL senior developer.
Perform this analysis for every MAJOR test you added or edited:

1. MatchScheduler Writing Tests Best Practices checklist.
2. Gaming community realistic data usage check.
3. Firebase Emulator Suite integration validation.
```

### QUX
When I type "qux", this means:
```
Imagine you are a team leader in a gaming community testing this feature.
Consider tournament deadlines, Discord workflows, and team coordination needs.
Output comprehensive gaming scenarios you would test, sorted by highest priority.
```

### QGIT
When I type "qgit", this means:
```
Add all changes to staging, create a commit, and push to remote.

Follow this checklist for MatchScheduler commit messages:
- SHOULD use Conventional Commits format
- SHOULD NOT refer to Claude or Anthropic
- SHOULD reference PRD sections or architecture decisions when relevant
- SHOULD use gaming domain vocabulary in descriptions
- Structure: <type>[optional scope]: <description>

Examples:
feat(availability): add optimistic updates for hot path performance
fix(team-management): prevent leader from leaving without transfer
refactor(firebase): migrate to v11 direct subscription pattern
```

### QGAMING
When I type "qgaming", this means:
```
Review the current implementation from a gaming community perspective:
- Does this make sense for team leaders coordinating matches?
- Would this work well with Discord-based communication?
- Does this handle tournament deadline pressure appropriately?
- Is this right-sized for 300 players / 40 teams scale?
- Does this respect gaming community social dynamics?
```