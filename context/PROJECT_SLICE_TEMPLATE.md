# Vertical Slice Template

## Purpose
This template ensures each slice properly maps PRD requirements to implementation while maintaining architectural consistency.

---

## Required Sections

### 1. Slice Definition (MUST HAVE)
- **Slice ID:** [X.Y]
- **Name:** [Descriptive name]
- **User Story:** As a [user type], I can [action] so that [benefit]
- **Success Criteria:** User can complete [specific journey]

### 2. PRD Mapping (MUST HAVE)
```
PRIMARY SECTIONS:
- [Section]: [What we're implementing from this section]

DEPENDENT SECTIONS:
- [Section]: [What context/requirements we need]

IGNORED SECTIONS:
- [Section]: [What we're intentionally skipping for this slice]
```

### 3. Component Architecture (MUST HAVE)
```
NEW COMPONENTS:
- ComponentName
  - Firebase listeners: [none | specific listeners]
  - Cache interactions: [reads from X, updates Y]
  - Parent/child relationships

MODIFIED COMPONENTS:
- ComponentName: [what changes needed]

SERVICE UPDATES:
- ServiceName: [new methods/cache updates needed]
```

### 4. Performance Classification (MUST HAVE)
```
HOT PATHS (<50ms):
- [User action]: [Implementation approach]

COLD PATHS (<2s):
- [User action]: [Loading state approach]
```

### 5. Data Flow Diagram (NICE TO HAVE)
```
User Action → Component → [Cache|Firebase] → UI Update
```

### 6. Test Scenarios (MUST HAVE)
- [ ] [Specific user action produces expected result]
- [ ] [Real-time update scenario works]
- [ ] [Performance requirement met]
- [ ] [Error handling works]

### 7. Implementation Notes (NICE TO HAVE)
- Gotchas to watch for
- Similar patterns in existing code
- Dependencies on other slices

---

## Guidelines for Creating Slices

1. **Start with the user journey** - What can the user do after this slice?
2. **Map comprehensively** - Find ALL PRD sections that relate
3. **Respect the architecture** - Cache + direct listeners pattern
4. **Define performance upfront** - Know your hot vs cold paths
5. **Keep slices small** - Should be 1-3 days of work maximum
6. **Test scenarios are contracts** - Don't consider slice done until all pass

## Anti-Patterns to Avoid

❌ Creating service methods like `TeamService.subscribeToTeam()`  
❌ Implementing features not in the current slice's PRD sections  
❌ Adding complex state management beyond simple cache  
❌ Making hot paths that require network calls  
❌ Forgetting to update cache from Firebase listeners  

## Example Usage

When creating a new slice:
1. Copy this template to `/context/slices/slice-X-Y-name.md`
2. Fill in all MUST HAVE sections
3. Add NICE TO HAVE sections if they add clarity
4. Review against anti-patterns
5. Get approval before implementation

---

## Quality Checklist

Before considering a slice spec complete:
- [ ] All PRD requirements are mapped
- [ ] Architecture follows established patterns
- [ ] Hot paths are clearly identified
- [ ] Test scenarios cover happy path + edge cases
- [ ] No anti-patterns present