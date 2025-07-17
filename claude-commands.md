# CLAUDE-COMMANDS.md - MatchScheduler Workflow Commands

## Overview
This document defines streamlined commands for working with Claude on the MatchScheduler project. Each command has a specific purpose in the development workflow.

---

## QNEW - Initialize Context
**Use:** At the start of any new conversation  
**Action:** Load these documents in order:
1. PROJECT_ROADMAP_V2.md (understand current progress)
2. Pillar 2 - performance and ux.md (understand hot vs cold paths)
3. Pillar 3 - technical architecture.md (understand patterns)
4. Pillar 4 - technology stack.md (understand constraints)

Then respond: "Ready to work on MatchScheduler. I see we're on Slice [X.Y]. The roadmap shows [N] slices complete. What would you like to focus on?"

---

## QPLAN - Create Technical Slice
**Use:** When ready to detail the next slice (best with Claude Opus)  
**Command:** `QPLAN [slice-id]` (e.g., `QPLAN 2.1`)  
**Action:** 
1. Review roadmap entry and PRD sections
2. Ask clarifying questions about ambiguous requirements
3. Create detailed slice following PROJECT_SLICE_TEMPLATE.md
4. Save as `/context/slices/slice-[X]-[Y]-[name].md`

---

## QCODE - Execute Implementation  
**Use:** When ready to implement a slice (best with Claude Sonnet)  
**Command:** `QCODE [slice-id]` (e.g., `QCODE 2.1`)  
**Action:**
1. Load slice from `/context/slices/slice-[X]-[Y]-[name].md`
2. List components/files to modify
3. Ask clarifying implementation questions
4. Create task checklist
5. Implement following all patterns (cache + listeners, Firebase v11, rem units)

---

## QCHECK - Verify Implementation
**Use:** After implementing a slice  
**Action:** Review implementation against:
- Slice specification compliance
- Architecture patterns (cache + listeners)
- Technical standards (Firebase v11, rem units)
- Common pitfalls from slice

Output: What works ✅, What needs fixing ⚠️, What could improve 💡, Ready for testing? [YES/NO]

---

## QTEST - Manual Testing Guide
**Use:** When ready to test completed slice  
**Action:** Create manual testing checklist with:
- Setup requirements
- Core functionality tests
- Edge cases
- Performance verification (hot paths instant)
- Real-time update tests (two tabs)

---

## QSTATUS - Progress Check
**Use:** To get current project status  
**Action:** Provide:
- Current slice: [X.Y] - [Name] ([Status])
- Overall progress: [N]/[Total] slices
- Next slice: [X.Y] - [Name]
- Today's progress
- Any blockers

---

## QGIT - Commit Changes
**Use:** After completing and testing implementation  
**Command:** `QGIT`  
**Action:** 
1. Stage all changes
2. Create commit with Conventional Commits format
3. Push to remote

Commit format: `<type>[scope]: <description>`  
Examples:
- `feat(availability): add optimistic updates for hot path performance`
- `fix(team-drawer): correct animation timing to 300ms`
- `refactor(firebase): migrate to v11 direct subscription pattern`

---

## Workflow Example

### Typical Development Session:

1. **Start conversation:**
   ```
   QNEW
   ```
   
2. **Plan next slice (if needed):**
   ```
   QPLAN 2.1
   ```
   
3. **Implement the slice:**
   ```
   QCODE 2.1
   ```
   
4. **Verify the work:**
   ```
   QCHECK
   ```
   
5. **Get testing steps:**
   ```
   QTEST
   ```
   
6. **Commit changes:**
   ```
   QGIT
   ```