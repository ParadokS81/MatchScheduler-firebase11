---
description: Execute implementation for a specific slice
argument-hint: <slice-id>
allowed-tools: Read, Write, Bash
---

# Implement Slice $ARGUMENTS

Execute the technical specification for slice $ARGUMENTS with focus on clean, performant code that works end-to-end.

## Pre-Implementation

1. **Load Slice Specification**:
   ```
   Read: /context/slices/slice-$ARGUMENTS-*.md
   ```

2. **Verify Context**:
   - Ensure CLAUDE.md patterns are understood
   - Confirm cache + listener architecture is clear
   - Review performance requirements
   - **CRITICAL**: Identify all integration points between frontend and backend

3. **STOP - Clarification Phase** (REQUIRED):
   Present findings and ask questions BEFORE any coding:
   ```
   I've reviewed slice $ARGUMENTS. Before implementing:
   
   Questions:
   1. [Specific UI/UX question if any ambiguity]
   2. [Technical approach question if multiple options]
   3. [Integration question if unclear]
   
   If no questions: "The slice is clear and comprehensive. Ready to implement with [brief summary of approach]?"
   ```
   
   WAIT for user response before proceeding.

## Clarifying Questions

Ask ONLY about significant gaps or ambiguities that would block implementation:
- **Missing functionality**: "The slice references X but doesn't specify how it works"
- **Architectural decisions**: "Should this use existing pattern Y or create new pattern Z?"
- **Integration gaps**: "How should component A communicate with component B?"
- **Business logic**: "What should happen when user does X in situation Y?"
- **Missing dependencies**: "This needs function X which doesn't exist yet"

DO NOT ask about:
- Error message wording (use common sense)
- Loading spinner styles (use existing patterns)
- Button text (follow the slice or use reasonable defaults)
- Minor UI details (implement reasonably, can adjust later)

## Implementation Checklist

Create a DETAILED task list before starting:

### Frontend Tasks
- [ ] Component structure following revealing module pattern
- [ ] Firebase v11 modular imports only
- [ ] Cache + listener pattern for data
- [ ] rem units for all sizing (except borders)
- [ ] All UI actions have event handlers
- [ ] Error states prepared for backend failures

### Backend Tasks (MUST IMPLEMENT IN /functions/)
- [ ] Create Cloud Functions in /functions/[appropriate-file].js
- [ ] Implement each function specified in the slice
- [ ] Add input validation for all parameters
- [ ] Implement proper error responses with messages
- [ ] Add event logging as specified
- [ ] Export functions in /functions/index.js
- [ ] Update security rules if needed

### Integration Tasks (CRITICAL - DO NOT SKIP)
- [ ] Frontend service methods exist to call Cloud Functions
- [ ] Every button/action calls the correct backend function
- [ ] Backend responses update the UI correctly
- [ ] Real-time listeners connected and updating UI
- [ ] Error responses from backend shown to user
- [ ] Loading states during backend operations
- [ ] Cache updates when backend changes data

## Core Patterns to Follow

### Cache + Listener Pattern
```javascript
// Service manages cache only
const Service = {
    getData(id) { return cache[id]; },
    updateCache(id, data) { cache[id] = data; }
};

// Component owns its listener
const Component = (function() {
    async function init() {
        const data = Service.getData(id); // Instant
        render(data);
        
        const unsubscribe = onSnapshot(doc(db, 'collection', id), (doc) => {
            updateUI(doc.data());
            Service.updateCache(id, doc.data());
        });
    }
})();
```

### Frontend → Backend Integration Pattern
```javascript
// REQUIRED: Show how frontend calls backend
async function handleUserAction() {
    try {
        setLoading(true);
        
        // Call the Cloud Function
        const result = await callCloudFunction('functionName', {
            param1: value1,
            param2: value2
        });
        
        if (result.success) {
            // Update UI with response
            updateUI(result.data);
            // Update cache if needed
            Service.updateCache(id, result.data);
        } else {
            showError(result.error);
        }
    } catch (error) {
        showError('Network error - please try again');
    } finally {
        setLoading(false);
    }
}
```

### Sacred 3x3 Grid
Never modify panel dimensions or grid structure.

### Performance Requirements
- Hot paths: Use cache or optimistic updates
- Cold paths: Can show loading states

## Integration Requirements (NEVER SKIP)

Every slice implementation MUST demonstrate these working connections:

1. **User Action → Backend Call**: 
   - Show the actual button click handler
   - Show the Cloud Function invocation
   - Include proper error handling

2. **Backend Response → UI Update**: 
   - Show how success data updates the screen
   - Show how errors display to the user
   - Include loading state management

3. **Database Change → UI Refresh**: 
   - Show real-time listener setup
   - Show UI update when data changes
   - Show cache synchronization

4. **Error Case → User Feedback**: 
   - Show validation error display
   - Show network error handling
   - Show permission error messages

**If any of these are missing, the implementation is incomplete.**

## Connection Verification Phase

After implementing frontend and backend:

1. **Trace Each User Journey**:
   - Start from user click
   - Follow through frontend handler
   - Verify Cloud Function call
   - Confirm database update
   - Check listener fires
   - Verify UI updates

2. **Test Integration Points**:
   ```javascript
   // Example verification code
   console.log('Testing integration...');
   // 1. Trigger action
   await button.click();
   // 2. Verify function called
   console.log('Cloud Function called:', functionName);
   // 3. Check response
   console.log('Response received:', response);
   // 4. Verify UI updated
   console.log('UI state:', currentUIState);
   ```

3. **Verify Error Flows**:
   - Force network failure
   - Send invalid data
   - Test permission denial
   - Confirm user sees appropriate feedback

## Post-Implementation

After completing the code:
1. Review against slice test scenarios
2. **CRITICAL**: Verify all integration points work
3. Check for common pitfalls listed in slice
4. Ensure all patterns are followed
5. Verify performance requirements met
6. **Run through complete user journey from UI to database and back**

## Testing Approach

**DO NOT:**
- Write automated tests immediately after implementation
- Start/stop Firebase emulators (they're already running)
- Change emulator ports or configuration
- Create test files without being asked
- Start ANY web servers (python http.server, etc.)
- Attempt to "verify" the implementation by running it

**STOP after implementation is complete. Do NOT test.**

**Testing workflow:**
1. Complete implementation
2. Mark todos as done
3. **STOP - Wait for user to run QCHECK**
4. Fix issues found by QCHECK (1-2 iterations expected)
5. Only test when user runs QTEST command

## Final Integration Checklist

Before declaring complete, verify:
- [ ] Can a user complete the entire journey defined in the slice?
- [ ] Do all UI actions result in appropriate backend calls?
- [ ] Do all backend responses update the UI?
- [ ] Do database changes reflect in the UI via listeners?
- [ ] Are all error cases handled with user feedback?
- [ ] Is the connection between frontend and backend clear in the code?

**Remember: A feature isn't done until it works end-to-end!**