---
description: Verify implementation against architecture patterns and slice requirements
argument-hint: <slice-id> (optional - checks most recent implementation if omitted)
allowed-tools: Read, Task
---

# Verify Implementation Quality

Review the implementation for slice $ARGUMENTS against MatchScheduler patterns and requirements.

## Strategy: Task Agent Does the Heavy Lifting

Use Task(Explore) with thoroughness="very thorough" to analyze the implementation. This keeps the detailed file reading out of your main context - only the findings report comes back.

## Phase 1: Launch Verification Agent

```
Task(Explore, thoroughness="very thorough"): "
Verify the implementation for MatchScheduler slice $ARGUMENTS.

CHECK THESE FILES:
1. Read the slice spec: context/slices/slice-$ARGUMENTS-*.md
2. Find all files mentioned in the slice spec
3. Read each implemented/modified file

VERIFY THESE PATTERNS:

1. Cache + Listener Pattern:
   - Services manage cache ONLY (no listeners in services)
   - Components own their Firebase listeners
   - Cache updated when listeners receive data
   - No service.subscribeToX() methods

2. Frontend -> Backend Integration:
   - Every button has click handler
   - Handler calls Cloud Function via service
   - Success/error responses handled
   - Loading states during operations
   - UI updates after backend response

3. Code Patterns:
   - Firebase v11 modular imports (import { doc } from 'firebase/firestore')
   - No old Firebase syntax (firebase.firestore())
   - Revealing module pattern for components
   - rem units (or Tailwind classes) for sizing

4. Integration Completeness:
   For EACH user action in the slice:
   - Button click -> Handler fires?
   - Handler -> Backend call?
   - Backend -> Database update?
   - Listener -> UI refresh?
   - Error -> User feedback?

5. Common Missing Pieces:
   - Missing try/catch around async calls
   - Missing loading state toggle
   - Missing cache update after listener fires
   - Missing error display to user
   - Unsubscribe not stored for cleanup

RETURN A STRUCTURED REPORT:
- Files checked
- Pattern compliance (what's correct)
- Issues found (categorized: CRITICAL / IMPORTANT / MINOR)
- Specific fixes needed with code examples
- Ready for testing: YES/NO
"
```

## Phase 2: Review Findings

The agent returns a focused report. Review it and:

1. **If CRITICAL issues**: List specific fixes needed
2. **If IMPORTANT issues**: Note them for this iteration
3. **If MINOR only**: Ready for testing

## Phase 3: Generate Fix List

For any issues found, provide actionable fixes:

```
IMPLEMENTATION REVIEW - Slice $ARGUMENTS

✅ Working Correctly:
- [List what follows patterns]
- [Integration points that work]

⚠️ Issues Found:

CRITICAL (must fix before testing):
- [Issue]: [File:line] - [What's wrong]
  Fix: [Specific code change]

IMPORTANT (should fix):
- [Issue]: [Description]
  Fix: [How to fix]

MINOR (nice to have):
- [Issue]

🔧 Quick Fixes:
1. [Specific fix with code]
2. [Specific fix with code]

Ready for Testing: [YES/NO]
Next Step: [QCODE iteration / QTEST / specific fix]
```

## Iteration Expectations

- **Iteration 1**: Usually finds 2-3 integration gaps
- **Iteration 2**: Polish and edge cases
- **Iteration 3**: Should be clean (rare to need)

This is normal! The QCODE -> QCHECK -> fix cycle is expected.

## Context Efficiency

- **Agent reads all files**: ~5000 tokens saved from main context
- **Only findings enter conversation**: Focused, actionable report
- **No re-reading slice spec**: Agent already analyzed it
- **Clear next steps**: Either fix or move to QTEST
