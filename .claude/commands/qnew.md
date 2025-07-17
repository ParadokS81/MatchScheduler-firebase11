---
description: Initialize MatchScheduler project context with core documents
argument-hint: (no arguments needed)
allowed-tools: Read
---

# Initialize MatchScheduler Context

Load the core project documents to understand current state and architecture.

## Instructions

Use the Read tool to load EXACTLY these 4 documents in order:

1. `PROJECT_ROADMAP.md` - Current progress and next tasks
2. `Pillar 2 - performance and ux.md` - Performance requirements (hot vs cold paths)
3. `Pillar 3 - technical architecture.md` - Architecture patterns and data flow
4. `Pillar 4 - technology stack.md` - Technical constraints and tools

## Important

- Do NOT use Task tool
- Do NOT read code files
- Do NOT read package.json or other documents
- Do NOT analyze the entire codebase

## Response Format

After loading the documents, respond with EXACTLY this format:

"Ready to work on MatchScheduler. I see we're on Slice [X.Y]. The roadmap shows [N] slices complete. What would you like to focus on?"