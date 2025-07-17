---
description: Verify implementation against architecture patterns and slice requirements
argument-hint: (optional: specific component or pattern to check)
allowed-tools: Read
---

# Verify Implementation Quality

Review the recent implementation for adherence to MatchScheduler patterns and requirements.

## Architecture Review

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

## Performance Validation

### Hot Paths (<50ms)
- [ ] Availability updates use optimistic updates
- [ ] Team switching uses cached data
- [ ] Week navigation is instant
- [ ] No loading states on frequent actions

### Cold Paths
- [ ] Loading states present for one-time operations
- [ ] User feedback for long operations

## Slice Compliance

Check against the slice specification:
- [ ] All test scenarios implemented
- [ ] Execution boundaries respected (no scope creep)
- [ ] Common pitfalls avoided
- [ ] Out of scope items not implemented

## Report Format

```
IMPLEMENTATION REVIEW - $ARGUMENTS

✅ Working Correctly:
- [List what follows patterns]
- [List what meets requirements]

⚠️ Issues Found:
- [Pattern violations with file:line]
- [Performance issues identified]
- [Missing requirements]

💡 Improvements:
- [Optional enhancements]
- [Code quality suggestions]

Ready for Testing: [YES/NO]
[If NO, list blockers]
```

## Quick Fixes

If issues found, suggest specific fixes:
```javascript
// ❌ Found: service with subscription
TeamService.subscribeToTeam(id, callback)

// ✅ Fix: direct listener in component
onSnapshot(doc(db, 'teams', id), (doc) => {
    updateUI(doc.data());
    TeamService.updateCachedTeam(id, doc.data());
});
```