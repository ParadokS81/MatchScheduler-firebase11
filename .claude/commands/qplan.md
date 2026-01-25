---
description: Create detailed technical slice specification for implementation
argument-hint: <slice-id>
allowed-tools: Read, Write, Task, AskUserQuestion
---

# Create Technical Slice for $ARGUMENTS

Generate a comprehensive technical specification for slice $ARGUMENTS following the project template.

## Strategy: Use Task Agents to Preserve Context

This command uses Task agents for heavy exploration work, keeping the main conversation context lean.

## Phase 1: Gather Context (via Task Agent)

Use the Task tool with `subagent_type: "Explore"` to gather all needed context:

```
Task(Explore): "Analyze slice $ARGUMENTS for MatchScheduler planning:

1. Read PROJECT_ROADMAP.md - find slice $ARGUMENTS entry, note PRD sections referenced
2. Read PROJECT_SLICE_TEMPLATE.md - understand required sections
3. Read the PRD sections mentioned for this slice (in Pillar 1)
4. Search for existing components/services that will be modified
5. Check context/slices/ for similar completed slices as reference
6. Look at SCHEMA.md for relevant data structures

Return a structured summary:
- Slice definition from roadmap
- PRD requirements to implement
- Existing code that will be touched
- Data structures involved
- Similar patterns from completed slices
- Any obvious gaps or questions"
```

## Phase 2: Clarify Requirements

After receiving the exploration summary, use AskUserQuestion for any ambiguities:
- UI/UX preferences not specified in PRD
- Performance approach if multiple options
- Integration choices if unclear

Only ask about significant gaps. Skip minor details (error wording, button text, etc.)

## Phase 3: Create Slice Specification

Based on exploration results and clarifications, create the slice spec following PROJECT_SLICE_TEMPLATE.md:

1. **Slice Definition** - ID, name, user story, success criteria
2. **PRD Mapping** - Primary, dependent, ignored sections
3. **Full Stack Architecture** - Components, services, backend, integration points
4. **Integration Code Examples** - Actual code showing connections
5. **Performance Classification** - Hot paths vs cold paths
6. **Data Flow Diagram** - Visual flow from UI to database
7. **Test Scenarios** - Frontend, backend, integration, E2E
8. **Common Pitfalls** - What often gets missed
9. **Implementation Notes** - Gotchas, patterns, dependencies

## Phase 4: Save Output

Save the completed slice as:
`/context/slices/slice-$ARGUMENTS-[descriptive-name].md`

## Why This Approach Works

- **Exploration happens in agent**: ~4000 tokens saved from main context
- **Only the summary enters conversation**: Focused, relevant info only
- **Clarifications are targeted**: You don't re-read docs to answer questions
- **Slice spec is self-contained**: All context captured in the document

## Quality Checklist

Before saving:
- [ ] Frontend AND backend requirements specified
- [ ] Integration examples show actual code
- [ ] Hot paths identified and approach specified
- [ ] Test scenarios cover full stack
- [ ] Data flow is complete (UI -> DB -> UI)
- [ ] No anti-patterns from CLAUDE.md
