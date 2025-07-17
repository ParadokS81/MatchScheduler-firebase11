---
description: Generate manual testing checklist for current implementation
argument-hint: (optional: slice-id or feature name)
allowed-tools: Read
---

# Generate Testing Checklist

Create a comprehensive manual testing guide for the current implementation.

## Context Loading

If slice specified: Load `/context/slices/slice-$ARGUMENTS-*.md` to understand test scenarios.

## Testing Checklist Format

### Setup Requirements
```markdown
MANUAL TEST CHECKLIST - $ARGUMENTS

Prerequisites:
- [ ] Firebase emulator running (or dev environment)
- [ ] Browser console open for errors
- [ ] Test data prepared (specify what's needed)
```

### Core Functionality Tests

Based on the implementation, create specific test cases:

```markdown
Feature: [Feature Name]

Basic Flow:
- [ ] [User action]
  - Expected: [What should happen]
  - Check: [What to verify in UI]
  - Console: [Any expected logs]

Edge Cases:
- [ ] [Edge case scenario]
  - Expected: [How it should handle]
  - Recovery: [How user recovers]
```

### Performance Verification

```markdown
Hot Path Performance:
- [ ] [Action] feels instant (no loading/flicker)
- [ ] [Action] updates immediately
- [ ] No unnecessary re-renders

Cold Path Performance:
- [ ] [Action] shows loading state
- [ ] Loading completes in < 2 seconds
- [ ] Error states if operation fails
```

### Real-time Sync Testing

```markdown
Multi-Tab Testing:
1. [ ] Open application in two browser tabs
2. [ ] In Tab 1: [Perform action]
3. [ ] In Tab 2: Verify [expected update] appears
4. [ ] Timing: Update visible within 1 second
```

### Data Validation

```markdown
Firebase Console Checks:
- [ ] Data structure matches schema
- [ ] No duplicate documents
- [ ] Timestamps updating correctly
- [ ] Security rules not blocking operations
```

### Error Scenarios

```markdown
Error Handling:
- [ ] Offline mode: Disable network, verify graceful degradation
- [ ] Invalid data: Try edge cases (empty strings, special characters)
- [ ] Permissions: Test with different user roles
- [ ] Recovery: Verify user can recover from errors
```

## Gaming-Specific Tests

Include tests relevant to gaming workflows:
- [ ] Team creation with Discord-style names
- [ ] Join code works when shared
- [ ] 2-team limit enforced
- [ ] Time slots in correct format (mon_1900)
- [ ] Leader vs member permissions

## Output Format

Generate a checklist that can be:
1. Copied to a text file
2. Used as GitHub issue template
3. Checked off during testing session

End with:
```
Testing Complete: [ ]
All Tests Passed: [ ]
Ready for Production: [ ]

Issues Found:
- 

Notes:
- 
```