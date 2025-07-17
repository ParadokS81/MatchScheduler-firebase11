---
description: Execute implementation for a specific slice
argument-hint: <slice-id>
allowed-tools: Read, Write, Bash
---

# Implement Slice $ARGUMENTS

Execute the technical specification for slice $ARGUMENTS with focus on clean, performant code.

## Pre-Implementation

1. **Load Slice Specification**:
   ```
   Read: /context/slices/slice-$ARGUMENTS-*.md
   ```

2. **Verify Context**:
   - Ensure CLAUDE.md patterns are understood
   - Confirm cache + listener architecture is clear
   - Review performance requirements

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

Ask about any implementation details not covered in the slice:
- Specific UI element preferences
- Error message wording
- Loading state visuals
- Edge case handling

## Implementation Checklist

Create a task list before starting:
- [ ] Component structure following revealing module pattern
- [ ] Firebase v11 modular imports only
- [ ] Cache + listener pattern for data
- [ ] rem units for all sizing (except borders)
- [ ] Hot path optimizations (if applicable)
- [ ] Follow execution boundaries from slice

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

### Sacred 3x3 Grid
Never modify panel dimensions or grid structure.

### Performance Requirements
- Hot paths: Use cache or optimistic updates
- Cold paths: Can show loading states

## Post-Implementation

After completing the code:
1. Review against slice test scenarios
2. Check for common pitfalls listed in slice
3. Ensure all patterns are followed
4. Verify performance requirements met