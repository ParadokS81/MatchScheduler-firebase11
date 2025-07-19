---
description: Verify implementation against architecture patterns and slice requirements
argument-hint: (optional: specific component or pattern to check)
allowed-tools: Read
---

# Verify Implementation Quality

Review the recent implementation for adherence to MatchScheduler patterns and requirements.

## Phase 1: Architecture Review

### Cache + Listener Pattern
- [ ] Services manage cache ONLY (no listeners/subscriptions)
- [ ] Components own their Firebase listeners
- [ ] Cache is updated when listeners receive data
- [ ] No service.subscribeToX() methods exist

### Code Patterns
- [ ] Revealing module pattern used for components
- [ ] Firebase v11 modular imports (`import { doc } from 'firebase/firestore'`)
- [ ] No old Firebase syntax (`firebase.firestore()`)
- [ ] Event bus used only for coordination, not data

### Styling
- [ ] All sizing uses rem units (except borders)
- [ ] No pixel values for padding/margins
- [ ] Sacred 3x3 grid structure preserved
- [ ] Tailwind utilities used (no custom CSS)

## Phase 2: Integration Deep Dive (CRITICAL)

### Frontend → Backend Connections
Check EACH user action:
- [ ] Button has click handler attached?
- [ ] Handler calls appropriate Cloud Function?
- [ ] Function call includes all required parameters?
- [ ] Success response updates UI?
- [ ] Error response shows user feedback?
- [ ] Loading state shown during operation?

### Backend → Frontend Flow
For EACH Cloud Function:
- [ ] Input validation present?
- [ ] Error cases return proper error messages?
- [ ] Success returns expected data structure?
- [ ] Database updates trigger listener updates?
- [ ] Event logging implemented?

### Common Missing Pieces (Check These!)
```javascript
// 1. Missing error handling
try {
    const result = await callFunction();
    // ❓ What if result.success is false?
} catch (error) {
    // ❓ Is this catch block present?
}

// 2. Missing loading states
async function handleAction() {
    // ❓ setLoading(true)?
    const result = await callFunction();
    // ❓ setLoading(false)?
}

// 3. Missing cache updates
onSnapshot(doc, (snapshot) => {
    updateUI(snapshot.data());
    // ❓ Is cache being updated too?
});

// 4. Missing parameter validation
function cloudFunction(data) {
    // ❓ What if data.teamId is undefined?
    // ❓ What if user isn't authorized?
}
```

## Phase 3: Functionality Testing

### User Journey Verification
Walk through the ENTIRE user flow:
1. User sees initial state → correct?
2. User clicks button → handler fires?
3. Loading state appears → visible?
4. Backend processes → completes?
5. Database updates → correct data?
6. Listener fires → UI updates?
7. Error case → user informed?

### Edge Cases to Test
- [ ] What if user rapidly clicks button?
- [ ] What if network fails mid-operation?
- [ ] What if user lacks permission?
- [ ] What if concurrent updates happen?
- [ ] What if data is malformed?

## Phase 4: Performance Validation

### Hot Paths (<50ms)
- [ ] Availability updates use optimistic updates
- [ ] Team switching uses cached data
- [ ] Week navigation is instant
- [ ] No loading states on frequent actions

### Cold Paths
- [ ] Loading states present for one-time operations
- [ ] User feedback for long operations

## Phase 5: Security & Data Integrity

### Security Rules
- [ ] Can unauthorized users access this feature?
- [ ] Are Cloud Functions checking auth?
- [ ] Do Firestore rules match the implementation?

### Data Consistency
- [ ] If operation fails halfway, is data consistent?
- [ ] Are transactions used where needed?
- [ ] Can race conditions corrupt data?

## Common Issues Found by Cursor (Proactively Check)

### Missing Await Keywords
```javascript
// ❌ Often missed
handleAction(); // Should be: await handleAction();
```

### Unhandled Promise Rejections
```javascript
// ❌ Silent failures
promise.then(result => {...}); 
// ✅ Should have .catch()
```

### Memory Leaks
```javascript
// ❌ Listener not cleaned up
onSnapshot(doc, callback);
// ✅ Should store and call unsubscribe
```

### Incorrect Event Targets
```javascript
// ❌ Event on parent instead of button
parentDiv.addEventListener('click', ...);
// ✅ Should be on specific button
```

## Report Format

```
IMPLEMENTATION REVIEW - $ARGUMENTS

✅ Working Correctly:
- [List what follows patterns]
- [List what meets requirements]
- [Integration points that work]

⚠️ Issues Found:
CRITICAL (Blocking):
- [Missing error handling at X]
- [No connection between Y and Z]
- [Security hole at A]

IMPORTANT (Should fix):
- [Performance issue at B]
- [Missing loading state at C]
- [Cache not updated at D]

MINOR (Nice to have):
- [Code style at E]
- [Could optimize F]

🔧 Quick Fixes Needed:
1. [Specific fix with code example]
2. [Specific fix with code example]

🧪 Manual Testing Required:
1. [Specific user flow to test]
2. [Edge case to verify]

Ready for Testing: [YES/NO]
[If NO, list critical blockers only]
```

## Iteration Expectation

This is iteration [1/2/3] of implementation review.

Expected remaining work:
- Iteration 1: Fix critical connection issues
- Iteration 2: Add error handling and polish
- Iteration 3: Final verification

## Quick Fix Templates

### Missing Error Handling
```javascript
// Add to every Cloud Function call:
try {
    setLoading(true);
    const result = await TeamService.callFunction('name', params);
    if (!result.success) {
        showError(result.error || 'Operation failed');
        return;
    }
    // success handling
} catch (error) {
    console.error('Function call failed:', error);
    showError('Network error - please try again');
} finally {
    setLoading(false);
}
```

### Missing Cache Update
```javascript
// Add to listener:
onSnapshot(doc(db, 'teams', teamId), (doc) => {
    const data = doc.data();
    updateUI(data);
    TeamService.updateCache(teamId, data); // ADD THIS
});
```

### Missing Loading State
```javascript
// Add to component state:
let isLoading = false;

// Add to UI:
${isLoading ? '<div class="spinner">Loading...</div>' : ''}

// Add to button:
<button ${isLoading ? 'disabled' : ''}>
```