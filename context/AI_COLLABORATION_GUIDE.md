# AI Collaboration Guide for MatchScheduler

## 🎯 Purpose
This guide helps both the human project lead and AI assistants work together effectively on the MatchScheduler project. It defines workflows, context management, and best practices for productive AI-assisted development.

---

## 🚀 Quick Start for New Sessions

### Human Project Lead:
1. **Start your dev environment**: `./dev.sh`
2. **Check PROJECT_ROADMAP.md** for current status
3. **Prepare your context** for the AI:
   ```
   Hi! I'm working on MatchScheduler, a gaming community scheduling platform.
   - Current Phase: [X] 
   - Working on: [specific task]
   - Context docs: PROJECT_ROADMAP.md, CLAUDE.md, [relevant PRD section]
   ```

### AI Assistant:
1. **Read provided context** thoroughly
2. **Acknowledge current phase** and task
3. **Use qnew** to load project best practices
4. **Follow established patterns** from existing code

---

## 📁 Context Management Strategy

### Essential Context Hierarchy:
1. **Always Include:**
   - `CLAUDE.md` - Project-specific guidelines and shortcuts
   - `PROJECT_ROADMAP.md` - Current status and next tasks

2. **Phase-Specific Context:**
   - **Phase 1**: `/context/1_Vision/project_prd_v2.md` (First-Time User section)
   - **Phase 2**: `/context/1_Vision/project_prd_v2.md` (Core Features section)
   - **Phase 3**: `/context/1_Vision/project_prd_v2.md` (Advanced Features section)

3. **Technical Context (as needed):**
   - `/context/2_Architecture/technical_decisions_v3.md` - Firebase patterns
   - `/context/2_Architecture/project_frontend.md` - UI patterns
   - `/context/2_Architecture/project_performance_ux.md` - Performance requirements

### Token Budget Management:
- **Start small**: Only include immediately relevant sections
- **Expand as needed**: Add technical docs when hitting implementation details
- **Summarize progress**: Don't re-read completed features
- **Use shortcuts**: `qnew`, `qplan`, `qcode` instead of re-explaining

---

## 🔄 Session Workflow Patterns

### Pattern 1: Feature Implementation Session
```
Human: "I want to implement [feature] from Phase X"
AI: *Reads context* → *Uses qplan* → *Proposes approach*
Human: "Looks good, proceed"
AI: *Uses qcode* → *Implements* → *Uses qcheck*
Human: *Tests* → "Works! Let's commit"
AI: *Uses qgit* → *Updates PROJECT_ROADMAP.md*
```

### Pattern 2: Bug Fix Session
```
Human: "The [feature] isn't working, here's the error: [error]"
AI: *Analyzes* → *Proposes fix* → *Implements*
Human: *Tests* → "Fixed!"
AI: *Commits with fix(*) prefix*
```

### Pattern 3: Architecture Discussion
```
Human: "How should we approach [complex feature]?"
AI: *References PRD and architecture docs* → *Proposes options*
Human: "Let's go with option B"
AI: *Documents decision in PROJECT_ROADMAP.md*
```

---

## 🧭 Navigation Shortcuts

### For Human Project Lead:

#### Starting Work:
- **Check status**: "What's our current progress on Phase X?"
- **Get oriented**: "Show me what we built in the last session"
- **Plan ahead**: "What are the dependencies for the next feature?"

#### During Work:
- **Quality check**: "qcheck this implementation"
- **Performance**: "Will this meet our hot path requirements?"
- **Gaming context**: "qgaming - does this work for team leaders?"

#### Ending Work:
- **Save progress**: "qgit"
- **Update status**: "Update PROJECT_ROADMAP.md with our progress"
- **Plan next**: "What should I work on next session?"

### For AI Assistant:

#### Context Awareness:
- Always check current phase in PROJECT_ROADMAP.md
- Respect the sacred 3x3 grid layout constraints
- Follow Firebase v11 patterns established in Phase 0
- Use revealing module pattern for new components

#### Code Generation:
- Match existing code style (no comments unless asked)
- Use rem units for all sizing
- Follow hot path performance requirements
- Test with gaming community scale (40 teams, 300 players)

---

## 🎮 Gaming Community Context Reminders

### Always Consider:
1. **Discord-centric** communication patterns
2. **Tournament deadlines** create urgency
3. **Team leaders** are volunteer coordinators
4. **Availability windows** are for gaming sessions (evenings/weekends)
5. **Quick actions** needed during tournament pressure

### User Personas to Keep in Mind:
- **Busy Team Leader**: Needs efficient tools, quick actions
- **New Player**: Needs clear onboarding, no friction
- **Tournament Organizer**: Needs to see multiple team availabilities
- **Returning User**: Needs persistent data, quick access

---

## 🚫 Common Pitfalls & Solutions

### Pitfall 1: Overbuilding
**Symptom**: "Let me also add these 5 related features..."
**Solution**: Stick to current slice checklist only

### Pitfall 2: Forgetting State
**Symptom**: "Wait, did we already build authentication?"
**Solution**: Always check PROJECT_ROADMAP.md first

### Pitfall 3: Wrong Patterns
**Symptom**: Using class components or v8 Firebase syntax
**Solution**: Reference Phase 0 implementation patterns

### Pitfall 4: Lost Context
**Symptom**: AI doesn't understand project specifics
**Solution**: Start with "qnew" shortcut

### Pitfall 5: Scope Creep
**Symptom**: "This would be cool to add..."
**Solution**: Document in "Future Ideas" but stay on track

---

## 📈 Progress Tracking

### Daily Progress Template:
```markdown
## Session Date: YYYY-MM-DD

### Started:
- Phase X.Y at Z% complete
- Task: [specific task]

### Completed:
- [x] Implemented [feature]
- [x] Fixed [bug]
- [x] Updated [documentation]

### Blockers:
- [Issue description and impact]

### Next Session:
- Continue with [next task]
- Address [blocker]

### Time Spent: X hours
```

### Weekly Review Questions:
1. What features were completed?
2. What patterns emerged?
3. What was harder than expected?
4. What was easier than expected?
5. Are we on track for phase completion?

---

## 🔧 Maintenance Tasks

### After Each Phase:
- [ ] Update all documentation
- [ ] Run performance benchmarks
- [ ] Test all user journeys
- [ ] Create git tag
- [ ] Celebrate progress! 🎉

### Regular Checks:
- [ ] Dependencies up to date
- [ ] No console errors
- [ ] Security rules tested
- [ ] Mobile responsive
- [ ] Accessibility basics

---

## 💡 Effective Prompting Tips

### Good Prompts:
✅ "Implement the Google OAuth integration from Phase 1.1"
✅ "The availability grid is rendering slowly, how can we optimize?"
✅ "qcheck the TeamService module I just wrote"

### Less Effective Prompts:
❌ "Build the whole authentication system"
❌ "Make it faster"
❌ "Add some features"

### Context-Rich Prompts:
```
I'm working on Phase 1.1 (Authentication) of MatchScheduler.
Current status: Google Sign-In UI is complete
Next task: Handle auth state changes and create profile
Specific question: How should we handle the first-time user profile creation flow?
```

---

## 🎯 Success Metrics for Collaboration

### Good Session Indicators:
- ✅ Clear task completed from roadmap
- ✅ Code follows established patterns
- ✅ Tests pass / feature works
- ✅ Documentation updated
- ✅ Progress visible in browser

### Warning Signs:
- ⚠️ Circular discussions without code
- ⚠️ Rewriting existing features
- ⚠️ Ignoring roadmap/checklist
- ⚠️ No commits for entire session
- ⚠️ Breaking existing functionality

---

## 🤝 Human-AI Collaboration Best Practices

### Human Responsibilities:
1. **Set clear direction** - Which task from roadmap
2. **Test implementation** - Verify it actually works
3. **Provide feedback** - What's working/not working
4. **Make decisions** - Choose between options
5. **Track progress** - Update roadmap

### AI Responsibilities:
1. **Follow established patterns** - Don't reinvent
2. **Respect project constraints** - PRD requirements
3. **Communicate clearly** - Explain decisions
4. **Stay focused** - Current task only
5. **Document changes** - Update relevant files

### Shared Responsibilities:
1. **Quality code** - Both should flag issues
2. **Performance awareness** - Meet PRD targets
3. **User experience** - Consider gaming workflows
4. **Progress tracking** - Keep roadmap current
5. **Learning** - Document insights

---

Last Updated: 2024-01-10
Next Review: After Phase 1 completion