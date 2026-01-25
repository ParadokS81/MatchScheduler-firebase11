---
description: Execute implementation for a specific slice
argument-hint: <slice-id>
allowed-tools: Read, Write, Edit, Bash, Task, TodoWrite, AskUserQuestion
---

# Implement Slice $ARGUMENTS

Execute the technical specification for slice $ARGUMENTS with focus on clean, performant code that works end-to-end.

## Strategy: TodoWrite + Targeted Exploration

Use TodoWrite to track progress visibly. Use Task agents for exploration to preserve context.

## Phase 1: Load Slice & Create Task List

1. **Read the slice specification**:
   ```
   Read: /context/slices/slice-$ARGUMENTS-*.md
   ```

2. **Create detailed TodoWrite task list** from the slice:
   - Extract all frontend tasks
   - Extract all backend tasks
   - Extract all integration tasks
   - Add verification tasks at the end

Example:
```
TodoWrite([
  { content: "Create PlayerDisplayService", status: "pending" },
  { content: "Enhance AvailabilityGrid with badge rendering", status: "pending" },
  { content: "Add CSS for player badges", status: "pending" },
  { content: "Wire up overflow click handler", status: "pending" },
  { content: "Test integration points", status: "pending" }
])
```

## Phase 2: Clarification (if needed)

If the slice has gaps or ambiguities, use AskUserQuestion ONCE:
```
AskUserQuestion({
  questions: [{
    question: "The slice mentions X but doesn't specify Y. Which approach?",
    header: "Approach",
    options: [
      { label: "Option A", description: "..." },
      { label: "Option B", description: "..." }
    ]
  }]
})
```

Only ask about significant gaps. Skip minor details.

## Phase 3: Implementation

Work through the todo list systematically:

1. **Mark task in_progress** before starting each task
2. **Use Task(Explore)** when you need to find existing patterns:
   ```
   Task(Explore): "Find how other components handle X in this codebase"
   ```
3. **Implement the task** using Edit/Write
4. **Mark task completed** immediately after finishing
5. **Move to next task**

### Core Patterns (from CLAUDE.md)

**Cache + Listener Pattern**:
```javascript
// Service manages cache only
const Service = {
    getData(id) { return cache[id]; },
    updateCache(id, data) { cache[id] = data; }
};

// Component owns its listener
onSnapshot(doc(db, 'collection', id), (doc) => {
    updateUI(doc.data());
    Service.updateCache(id, doc.data());
});
```

**Frontend -> Backend Integration**:
```javascript
async function handleUserAction() {
    try {
        setLoading(true);
        const result = await callCloudFunction('functionName', params);
        if (result.success) {
            updateUI(result.data);
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

### Technical Rules
- Firebase v11 modular imports only
- rem units (Tailwind handles this)
- Edit src/css/input.css for custom CSS (not main.css)
- Never modify sacred 3x3 grid structure

## Phase 4: Integration Verification

Before declaring complete, trace each user journey:

1. User action -> Handler fires?
2. Handler -> Backend call made?
3. Backend -> Database updated?
4. Database -> Listener fires?
5. Listener -> UI updates?
6. Error case -> User sees feedback?

Use Task(Explore) if you need to verify connections:
```
Task(Explore): "Verify the integration between ComponentX and ServiceY -
trace the data flow from button click to database update"
```

## Phase 5: Wrap Up

1. Mark all todos as completed
2. Provide a brief summary of what was implemented
3. **STOP** - Wait for user to run QCHECK

## What NOT to Do

- Do NOT write automated tests (wait for explicit request)
- Do NOT start/stop Firebase emulators (already running)
- Do NOT start web servers
- Do NOT run the app to "verify" (that's QCHECK/QTEST)

## Context Efficiency

This approach saves context by:
- **TodoWrite**: Visible progress without re-explaining
- **Task(Explore)**: Pattern searches don't fill main context
- **Slice spec**: Self-contained reference, read once
- **Focused implementation**: One task at a time
