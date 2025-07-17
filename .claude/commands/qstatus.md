---
description: Check current project progress and next steps
argument-hint: (no arguments needed)
allowed-tools: Read, Bash
---

# Project Status Report

Generate a concise status update for the MatchScheduler project.

## Data Collection

1. **Read Current Progress**:
   ```
   Read: PROJECT_ROADMAP_V2.md
   ```

2. **Check Git Status** (optional):
   ```bash
   git status --short
   git log --oneline -5
   ```

## Status Report Format

```
MATCHSCHEDULER STATUS REPORT
═══════════════════════════

📍 Current Position
- Active Slice: [X.Y] - [Name]
- Status: [Not Started | In Progress | Complete]
- Blockers: [Any blocking issues]

📊 Overall Progress  
- Slices Complete: [N] / [Total]
- Current Part: [Part N - Description]
- Progress Bar: [▓▓▓░░░░░░░] [N]%

🎯 Next Steps
1. [Immediate next task]
2. [Following task]
3. [Upcoming milestone]

💻 Working State
- Uncommitted changes: [Yes/No - list files if yes]
- Last commit: [message]

🏁 Part Completion
- Part 1 (Foundation): [Status]
- Part 2 (Scheduling): [Status]  
- Part 3 (Coordination): [Status]
- Part 4 (Polish): [Status]
```

## Quick Decision Helper

Based on current state, suggest next action:

- If slice in progress → "Continue with [specific task]"
- If slice complete → "Run /qtest to verify, then start next slice"  
- If blocked → "Resolve [blocker] before continuing"
- If all clean → "Ready to start Slice [X.Y] with /qplan"

## Optional Additions

If relevant, include:
- Recent accomplishments (last 24h)
- Upcoming challenges
- Technical debt notes
- Performance concerns