---
description: Create detailed technical slice specification for implementation
argument-hint: <slice-id>
allowed-tools: Read, Write
---

# Create Technical Slice for $ARGUMENTS

Generate a comprehensive technical specification for slice $ARGUMENTS following the project template.

## Pre-Work

1. **Load Context** (if not already loaded):
   - PROJECT_ROADMAP_V2.md
   - PROJECT_SLICE_TEMPLATE.md
   - Relevant Pillar documents

2. **Review Roadmap Entry**:
   - Find slice $ARGUMENTS in the roadmap
   - Note the PRD sections referenced
   - Understand dependencies

3. **Load PRD Sections**:
   - Read only the specific PRD sections mentioned for this slice
   - Focus on user journeys and requirements

## Clarifying Questions

Before creating the slice, ask about:
- Any ambiguous requirements in the PRD
- UI/UX preferences not specified
- Performance considerations
- Error handling approaches
- Integration with existing components

## Slice Creation

Follow PROJECT_SLICE_TEMPLATE.md structure:

1. **Slice Definition** - ID, name, user story, success criteria
2. **PRD Mapping** - Primary, dependent, and ignored sections
3. **Component Architecture** - New/modified components, services
4. **Execution Boundaries** - Start state, end state, out of scope
5. **Performance Classification** - Hot paths vs cold paths
6. **Test Scenarios** - Checklist format
7. **Implementation Notes** - Gotchas and patterns
8. **Pragmatic Assumptions** - Document any decisions made

## Output

Save the completed slice as:
`/context/slices/slice-$ARGUMENTS-[descriptive-name].md`

Replace [descriptive-name] with a kebab-case description of the feature.