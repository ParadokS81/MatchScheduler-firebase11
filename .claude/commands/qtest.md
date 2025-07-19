---
description: Guide manual testing of implemented features
argument-hint: <slice-id>
allowed-tools: Read
---

# Manual Testing Guide for Slice $ARGUMENTS

Generate a manual testing checklist for the implemented slice. NO automated tests, NO emulator changes.

## Pre-Testing Checklist

**Assumptions:**
- Firebase emulator is ALREADY RUNNING (do not start/stop/change)
- Implementation has passed QCHECK review
- Ready for manual verification in browser

**DO NOT:**
- Write automated tests
- Start/stop emulators
- Change emulator ports
- Create test files

## Testing Environment

1. **Check implementation is ready**:
   - QCHECK has been run and critical issues fixed
   - Code is saved and browser refreshed
   - Console is open for error monitoring

2. **Verify emulator status**:
   ```
   Expected services running:
   - Firestore on :8080
   - Functions on :5001
   - Auth on :9099
   - Hosting on :5000
   ```

## Manual Test Scenarios

Based on slice $ARGUMENTS, test these user flows:

### Happy Path Testing
Walk through the primary user journey:
1. [First user action]
   - Expected: [What should happen]
   - Check: [What to verify in UI]
   - Console: [Any logs to check]

2. [Next user action]
   - Expected: [What should happen]
   - Check: [What to verify]
   - Database: [Check Firestore emulator UI at :8080]

### Error Path Testing
Test these failure scenarios:
1. **[Invalid input test]**
   - Action: [What to do]
   - Expected: [Error message/behavior]
   - Recovery: [How user recovers]

2. **[Permission test]**
   - Action: [Unauthorized action]
   - Expected: [Error handling]

### Edge Case Testing
1. **Rapid clicking**
   - Action: Click button multiple times quickly
   - Expected: [Proper handling/debouncing]

2. **Concurrent updates**
   - Action: Open in two tabs, make changes in both
   - Expected: [Real-time sync behavior]

## What to Watch For

### In the Browser Console
- [ ] No unhandled errors
- [ ] No 404s for resources
- [ ] No permission denied errors (unless testing that)
- [ ] Expected console.log outputs appear

### In the UI
- [ ] Loading states appear and disappear correctly
- [ ] Success feedback is visible
- [ ] Error messages are user-friendly
- [ ] Data updates without refresh
- [ ] No layout breaks

### In Firestore Emulator UI (:8080)
- [ ] Documents created/updated as expected
- [ ] Data structure matches design
- [ ] No orphaned data
- [ ] Event log entries created

### In Functions Logs
- [ ] Functions execute without errors
- [ ] Validation works correctly
- [ ] Response times are reasonable

## Testing Checklist

### Basic Functionality
- [ ] Feature works as described in user story
- [ ] All buttons/interactions responsive
- [ ] Data persists correctly
- [ ] Real-time updates work

### Error Handling
- [ ] Invalid inputs show errors
- [ ] Network errors handled gracefully
- [ ] Permission errors show correct message
- [ ] Can recover from all error states

### Performance
- [ ] Hot paths feel instant
- [ ] Cold paths show loading states
- [ ] No unnecessary re-renders
- [ ] Responsive to user input

### Multi-User/Tab Behavior
- [ ] Changes in one tab appear in another
- [ ] No conflicts between concurrent users
- [ ] Listeners stay connected

## Issues Found

Document any issues for next iteration:

```
ISSUE 1: [Brief description]
- Steps to reproduce: [How to trigger]
- Expected: [What should happen]
- Actual: [What actually happens]
- Priority: [Critical/Important/Minor]

ISSUE 2: [Brief description]
...
```

## Test Result Summary

```
MANUAL TESTING COMPLETE

✅ Passing:
- [List working features]

❌ Failing:
- [List broken features]

🔧 Needs Iteration:
- [List of fixes needed]

Ready for Production: [YES/NO]
Next Step: [QCODE iteration / Deploy / More testing]
```

## Notes for Next Iteration

If issues found, prepare for QCODE iteration:
1. [Specific fix needed]
2. [Additional feature to implement]
3. [Performance optimization needed]

Remember: 1-2 iterations after initial implementation is NORMAL and expected.