# MatchScheduler Project Implementation Roadmap

## 🎯 Purpose
This document serves as the **single source of truth** for project progress, implementation phases, and AI collaboration workflow. It ensures continuity across sessions and provides clear direction for both human project lead and AI assistants.

---

## 📋 Project Status Dashboard

### Current Phase: **Phase 0 - Foundation ✅ COMPLETE**
### Next Phase: **Phase 1 - Core Onboarding Journey**
### Overall Progress: **[▓▓░░░░░░░░] 20%**

### Environment Status:
- ✅ Firebase Project: `matchscheduler-dev`
- ✅ Development Setup: WSL + Cursor + Claude Code
- ✅ Emulator Strategy: Hybrid (Functions/Hosting local, Firestore live)
- ✅ Sacred 3x3 Grid: Implemented
- ✅ OKLCH Theme: Configured

---

## 🏗️ Implementation Phases

### Phase 0: Foundation ✅ COMPLETE
**Goal:** Set up the non-negotiable project shell

#### Completed Tasks:
- [x] Firebase project initialization
- [x] WSL development environment with Node.js 20
- [x] Package.json with Firebase v11 dependencies
- [x] Sacred 3x3 grid HTML structure
- [x] OKLCH color system in CSS
- [x] Development scripts (`./dev.sh`)
- [x] Basic revealing module pattern in app.js
- [x] Logo processing Cloud Function (v2 syntax)

#### Key Files Created:
- `/public/index.html` - Sacred 3x3 grid layout
- `/src/css/input.css` - OKLCH theme configuration
- `/public/js/app.js` - Application entry point
- `/functions/logo-processing.js` - Cloud Function for team logos
- `./dev.sh` - One-command development startup

---

### Phase 1: Core Onboarding Journey 🚧 IN PLANNING
**Goal:** Allow a brand new user to become a team leader

#### Slice 1.1: Guest Mode & Authentication
**Status:** Not Started
**Dependencies:** None
**Key Features:**
- [ ] Guest mode exploration
- [ ] Google OAuth integration
- [ ] Authentication state management
- [ ] User profile creation flow

**Implementation Checklist:**
- [ ] Create `AuthService` module
- [ ] Implement Google Sign-In UI
- [ ] Handle auth state changes
- [ ] Create profile creation modal
- [ ] Write `createProfile` Cloud Function
- [ ] Add profile data to Firestore

**Test Criteria:**
- [ ] User can browse as guest
- [ ] User can sign in with Google
- [ ] Profile is created on first sign-in
- [ ] User sees their name in UI

#### Slice 1.2: Team Creation
**Status:** Not Started
**Dependencies:** Slice 1.1 (Authentication)
**Key Features:**
- [ ] Unified onboarding modal
- [ ] Team creation form
- [ ] Join code generation
- [ ] Team leader permissions

**Implementation Checklist:**
- [ ] Create `TeamService` module
- [ ] Build onboarding modal component
- [ ] Implement team creation form
- [ ] Write `createTeam` Cloud Function
- [ ] Update user's team membership
- [ ] Display team info in left panel

**Test Criteria:**
- [ ] User can create a team
- [ ] Join code is generated
- [ ] User becomes team leader
- [ ] Team info displays correctly

---

### Phase 2: Core Product Value 📅 PLANNED
**Goal:** Enable team scheduling functionality

#### Slice 2.1: Individual Availability
**Status:** Not Started
**Dependencies:** Phase 1 Complete
**Key Features:**
- [ ] Availability grid interaction
- [ ] Week navigation
- [ ] Grid tools (Add Me, Clear)
- [ ] Availability persistence

#### Slice 2.2: Team View & Joining
**Status:** Not Started
**Dependencies:** Slice 2.1
**Key Features:**
- [ ] Join team with code
- [ ] Multi-user availability display
- [ ] Real-time updates
- [ ] Team roster display

---

### Phase 3: Power Features 🔮 FUTURE
**Goal:** Administrative and comparison features

#### Slice 3.1: Team Management
- Team management drawer
- Leader permissions
- Member management

#### Slice 3.2: Team Comparison
- Browse teams
- Favorites system
- Comparison view

---

## 🛠️ AI Collaboration Workflow

### Starting a New Session

1. **Open CLAUDE.md** - Review shortcuts and guidelines
2. **Open PROJECT_ROADMAP.md** - Check current phase and next tasks
3. **Start with context**: 
   ```
   I'm working on MatchScheduler Phase X, Slice Y.
   Current status: [describe what's complete]
   Next task: [specific task from checklist]
   ```

### During Implementation

1. **Use shortcuts**:
   - `qnew` - Load best practices
   - `qplan` - Plan implementation approach
   - `qcode` - Execute implementation
   - `qcheck` - Validate code quality

2. **Test incrementally** - After each checklist item
3. **Update this document** - Mark tasks complete
4. **Commit meaningful chunks** - Use `qgit` for commits

### Ending a Session

1. **Update status** in this document
2. **Document blockers** or decisions needed
3. **Note the next task** for easy resumption
4. **Commit all changes**

---

## 📊 Git Strategy

### Branch Structure
- `main` - Stable, tested features only
- `dev` - Active development
- `feature/phase-X-slice-Y` - Specific implementation branches

### Commit Convention
```
feat(phase-1): implement Google OAuth integration
fix(availability): correct timezone handling
docs(roadmap): update Phase 1 progress
```

### Milestone Tags
- `v0.1.0` - Phase 1 Complete (Basic Onboarding)
- `v0.2.0` - Phase 2 Complete (Core Scheduling)
- `v1.0.0` - Phase 3 Complete (Full Feature Set)

---

## 🎓 Learning Checkpoints

### After Each Slice:
1. **Code Review** - Use Cursor to review implementation
2. **Pattern Recognition** - What patterns worked well?
3. **Performance Check** - Does it meet PRD requirements?
4. **User Test** - Can you complete the user journey?
5. **Document Learnings** - Add notes below

### Learning Notes:
<!-- Add your discoveries and insights here -->
- 

---

## 🚨 Common Pitfalls to Avoid

1. **Don't skip test criteria** - Each slice must work end-to-end
2. **Don't over-engineer** - Build only what's in the current slice
3. **Don't forget real-time** - Test with multiple browser tabs
4. **Don't ignore performance** - Check against PRD requirements
5. **Don't skip commits** - Commit after each working feature

---

## 📝 Decision Log

### Major Decisions:
1. **Hybrid Emulator Strategy** (2024-01-10)
   - Reason: Better reflects production performance
   - Impact: Faster development, real security rules testing

2. **Vertical Slice Approach** (2024-01-10)
   - Reason: Delivers working features incrementally
   - Impact: Better progress visibility, easier testing

<!-- Add more decisions as they're made -->

---

## 🔄 Session Continuity Checklist

Before starting a new AI session, ensure:
- [ ] This document is up to date
- [ ] Last session's code is committed
- [ ] Development environment is running (`./dev.sh`)
- [ ] You know the exact next task
- [ ] You have the relevant PRD section ready

## 📞 Quick Status Check

For any AI assistant, you can share:
```
Project: MatchScheduler (Gaming Community Scheduling)
Current Phase: [X] - [Phase Name]
Current Slice: [X.Y] - [Slice Name]
Status: [% complete]
Next Task: [Specific task from checklist]
Blockers: [Any blockers]
```

---

## 🎯 Success Metrics

### Phase 1 Success:
- [ ] New user can sign up in < 30 seconds
- [ ] Team creation takes < 1 minute
- [ ] All PRD "First-Time User" requirements met

### Phase 2 Success:
- [ ] Availability updates in < 50ms (hot path)
- [ ] Multi-user grid updates in real-time
- [ ] Weekly scheduling workflow is intuitive

### Phase 3 Success:
- [ ] Team comparison loads in < 2 seconds
- [ ] All leader tools accessible in drawer
- [ ] 40 teams browsable without performance issues

---

Last Updated: 2024-01-10
Next Review: After Phase 1.1 completion