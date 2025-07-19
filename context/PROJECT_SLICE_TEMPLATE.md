# Vertical Slice Template

## Purpose
This template ensures each slice properly maps PRD requirements to FULL STACK implementation while maintaining architectural consistency. A slice must deliver complete, working functionality from UI to database.

---

## Required Sections

### 1. Slice Definition (MUST HAVE)
- **Slice ID:** [X.Y]
- **Name:** [Descriptive name]
- **User Story:** As a [user type], I can [action] so that [benefit]
- **Success Criteria:** User can complete [specific journey] with full persistence and security

### 2. PRD Mapping (MUST HAVE)
```
PRIMARY SECTIONS:
- [Section]: [What we're implementing from this section]

DEPENDENT SECTIONS:
- [Section]: [What context/requirements we need]

IGNORED SECTIONS:
- [Section]: [What we're intentionally skipping for this slice]
```

### 3. Full Stack Architecture (MUST HAVE)
```
FRONTEND COMPONENTS:
- ComponentName
  - Firebase listeners: [none | specific listeners]
  - Cache interactions: [reads from X, updates Y]
  - UI responsibilities: [what it displays/controls]
  - User actions: [buttons/interactions that trigger backend]

FRONTEND SERVICES:
- ServiceName: [methods to add/update]
  - Method → Backend mapping: [which methods call which Cloud Functions]

BACKEND REQUIREMENTS:
⚠️ THESE CLOUD FUNCTIONS MUST BE IMPLEMENTED IN /functions/*.js:
- Cloud Functions:
  - functionName(params): 
    - File: /functions/[filename].js
    - Purpose: [what it does]
    - Validation: [what it checks]
    - Operations: [Firestore updates]
    - Returns: { success: boolean, data?: {...}, error?: "message" }
  
- Function Exports Required:
  // In /functions/index.js add:
  exports.functionName = functionName;
  
- Firestore Operations:
  - Collection/Document: [CRUD operations needed]
  - Security Rules: [new rules or updates required]
  
- Authentication/Authorization:
  - [Who can perform this action]
  - [What validation is needed]
  
- Event Logging:
  - [Which events to log per PRD section 5.6]
  - [Event type and details structure]
  
- External Services:
  - [Any third-party APIs, storage, etc.]

INTEGRATION POINTS:
- Frontend → Backend calls: [map service methods to Cloud Functions]
- API Contracts:
  - Request format: { param1: type, param2: type }
  - Success response: { success: true, data: {...} }
  - Error response: { success: false, error: "message" }
- Real-time listeners: [which components listen to which documents]
- Data flow: User action → Frontend → Backend → Database → Listeners → UI
```

### 4. Integration Code Examples (MUST HAVE)
Show ACTUAL code snippets for critical connections:

```javascript
// Example: How frontend calls backend
async function handleTeamAction() {
    const response = await TeamService.callFunction('regenerateJoinCode', {
        teamId: currentTeamId,
        userId: currentUserId
    });
    
    if (response.success) {
        updateJoinCodeUI(response.data.joinCode);
    } else {
        showError(response.error);
    }
}

// Example: How real-time updates flow
onSnapshot(doc(db, 'teams', teamId), (doc) => {
    const teamData = doc.data();
    TeamInfo.updateUI(teamData);
    TeamService.updateCache(teamId, teamData);
});
```

### 5. Performance Classification (MUST HAVE)
```
HOT PATHS (<50ms):
- [User action]: [Implementation approach - cache/optimistic]

COLD PATHS (<2s):
- [User action]: [Loading state approach]

BACKEND PERFORMANCE:
- Cloud Function cold starts: [mitigation if needed]
- Database queries: [indexes required]
```

### 6. Data Flow Diagram (MUST HAVE - was NICE TO HAVE)
```
User Action → Component → Service Method → Cloud Function → Firestore → Listeners → UI Update
                              ↓                                             ↓
                        Cache Update ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← Real-time Update

SPECIFIC EXAMPLE FOR THIS SLICE:
[Draw the actual flow for the main feature, e.g.:]
Click "Regenerate" → TeamDrawer.regenerate() → TeamService.callFunction() → regenerateJoinCode() 
→ Update teams/{teamId} → onSnapshot fires → TeamInfo.updateUI() → New code displayed
```

### 7. Test Scenarios (MUST HAVE)
```
FRONTEND TESTS:
- [ ] [UI interaction produces expected result]
- [ ] [Button clicks call correct backend function]
- [ ] [Loading states appear during backend calls]
- [ ] [Success responses update UI correctly]
- [ ] [Error responses show user feedback]

BACKEND TESTS:
- [ ] [Cloud Function executes with valid data]
- [ ] [Cloud Function rejects invalid data]
- [ ] [Security rules prevent unauthorized access]
- [ ] [Data structure in Firestore matches schema]
- [ ] [Event logs created correctly]

INTEGRATION TESTS (CRITICAL):
- [ ] [User clicks button → backend executes → UI updates]
- [ ] [Database change → listener fires → UI reflects change]
- [ ] [Backend error → frontend shows error message]
- [ ] [Network failure → appropriate error handling]
- [ ] [Permission denied → user sees explanation]

END-TO-END TESTS:
- [ ] [Complete user journey works]
- [ ] [Real-time updates work across tabs]
- [ ] [Error recovery works throughout stack]
- [ ] [Performance requirements met]
```

### 8. Common Integration Pitfalls (MUST HAVE - new section)
List specific things that often get missed:
- [ ] Frontend calls backend but doesn't handle errors
- [ ] Backend updates database but frontend doesn't listen
- [ ] Loading states missing during backend operations
- [ ] Cache not updated after backend changes
- [ ] Real-time listeners not set up
- [ ] Permission errors not shown to user

### 9. Implementation Notes (NICE TO HAVE)
- Gotchas to watch for
- Similar patterns in existing code
- Dependencies on other slices
- Required emulator setup

### 10. Pragmatic Assumptions (NICE TO HAVE)
ONLY use this section if no clarifying questions were needed.
When details are ambiguous, document assumptions made:
- **[ASSUMPTION]**: [What you decided] 
- **Rationale**: [Why this is the simplest/best choice]
- **Alternative**: [What else was considered]

**IMPORTANT**: If you have clarifying questions, you MUST ask them and wait for answers BEFORE creating the slice. Do not make assumptions when you could get clear direction.

---

## Guidelines for Creating Slices

1. **Start with the user journey** - What can the user do after this slice?
2. **Map comprehensively** - Find ALL PRD sections that relate
3. **Think full stack** - Every button needs a backend
4. **Show the connections** - Include code examples of integration
5. **Respect the architecture** - Cache + direct listeners pattern
6. **Define performance upfront** - Know your hot vs cold paths
7. **Keep slices small** - Should be 1-3 days of work maximum
8. **Test scenarios are contracts** - Must include frontend, backend, AND integration

## Anti-Patterns to Avoid

❌ Creating service methods without corresponding Cloud Functions  
❌ Implementing UI without backend persistence  
❌ Forgetting security rules for new operations  
❌ Making hot paths that require Cloud Function calls  
❌ Writing frontend-only test scenarios  
❌ Assuming backend "already exists" without verification  
❌ **NEW**: Creating frontend and backend without showing how they connect  
❌ **NEW**: Missing error handling in integration points  
❌ **NEW**: Forgetting to update cache after backend operations  

## Example Full Integration Section

```
BACKEND REQUIREMENTS:
- Cloud Functions:
  - regenerateJoinCode(teamId, userId): 
    - Validates user is team leader
    - Generates new 6-char code (excluding 0,O,1,I)
    - Updates team document
    - Returns { success: true, joinCode: "ABC123" }
    
FRONTEND INTEGRATION:
- TeamManagementDrawer has "Regenerate" button
- Button click → TeamService.regenerateJoinCode(teamId)
- Shows loading state during operation
- On success: Updates UI with new code, shows success toast
- On error: Shows error message, reverts UI
- Real-time listener updates all team members' views

CODE EXAMPLE:
// In TeamManagementDrawer
async function handleRegenerateClick() {
    setRegenerateLoading(true);
    try {
        const result = await TeamService.callFunction('regenerateJoinCode', {
            teamId: currentTeamId,
            userId: currentUserId
        });
        
        if (result.success) {
            // UI will auto-update via listener
            showToast('New join code generated!', 'success');
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        showToast('Network error - please try again', 'error');
    } finally {
        setRegenerateLoading(false);
    }
}
```

## Quality Checklist

Before considering a slice spec complete:
- [ ] Frontend AND backend requirements specified
- [ ] All PRD requirements are mapped
- [ ] Architecture follows established patterns
- [ ] Hot paths are clearly identified
- [ ] Test scenarios cover full stack
- [ ] No anti-patterns present
- [ ] Data flow is complete (UI → DB → UI)
- [ ] **Integration examples show actual code**
- [ ] **Error handling specified for all operations**
- [ ] **Loading states defined for backend calls**
- [ ] Event logging requirements checked against PRD 5.6
- [ ] API contracts fully specified
- [ ] Security rules documented