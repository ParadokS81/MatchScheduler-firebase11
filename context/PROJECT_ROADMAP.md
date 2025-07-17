# MatchScheduler Implementation Roadmap v3

## Overview
Vertical slice implementation strategy. Each slice delivers complete working functionality.
Detailed specifications in `/context/slices/[slice-name].md`

## Sequencing Rationale
- **Part 1:** Can't do anything without authenticated users and teams
- **Part 2:** Core value prop - individual then team availability  
- **Part 3:** Network effect features require Part 2 data
- **Part 4:** Polish after core features proven

## Performance Requirements
- **Part 1:** Authentication < 2s (cold path)
- **Part 2:** Availability updates < 50ms (hot path)
- **Part 3:** Comparison < 50ms setup, < 2s results
- **Part 4:** Maintain all performance

---

## Part 1: Foundation & Onboarding

### ✅ Slice 1.1: Authentication & Profile
**Status:** Complete  
**User Value:** Users can sign in with Google and manage their profile  
**PRD Sections:** 1.2, 2.1, 4.4.1  
**Components:** AuthService, UserProfile, EditProfileModal  

### ✅ Slice 1.2a: Create/Join Team Modal
**Status:** Complete  
**User Value:** Users can create a new team or join existing team  
**PRD Sections:** 4.3.1, 2.2  
**Components:** CreateJoinTeamModal  
**Note:** Unified modal complete, team creation working

### ✅ Slice 1.2b: Team Management Drawer
**Status:** Complete  
**User Value:** Team members can access management options via drawer  
**PRD Sections:** 4.3.4, 6.4  
**Components:** TeamManagementDrawer  
**Scope:** Drawer UI only, role-based views, animations

### 📅 Slice 1.2c: Team Actions Implementation  
**Status:** Not Started  
**User Value:** Management buttons actually perform their actions  
**PRD Sections:** 4.3.2, 4.3.3  
**Components:** Copy function, Leave team, Regenerate code  
**Scope:** Wire up drawer buttons (except modals)

---

## Part 2: Core Scheduling

### 📅 Slice 2.1: Basic Availability Grid
**Status:** Not Started  
**User Value:** Users can see and click individual time slots  
**PRD Sections:** 4.1.1, 4.1.2 (structure only)  
**Components:** AvailabilityGrid, WeekDisplay  
**Scope:** Grid rendering, single-slot click selection, week navigation

### 📅 Slice 2.2: Personal Availability Setting
**Status:** Not Started  
**User Value:** Users can add/remove themselves from time slots  
**PRD Sections:** 4.1.3 (single click only), 4.1.5  
**Components:** AvailabilityGrid (enhanced)  
**Scope:** Add me/Remove me buttons, optimistic updates, Firebase sync

### 📅 Slice 2.3: Advanced Selection
**Status:** Not Started  
**User Value:** Users can select multiple slots efficiently  
**PRD Sections:** 4.1.3 (multi-select methods)  
**Components:** SelectionManager  
**Scope:** Drag selection, header clicks, shift+click, select all

### 📅 Slice 2.4: Templates & Grid Tools
**Status:** Not Started  
**User Value:** Users can save and reuse availability patterns  
**PRD Sections:** 4.1.4  
**Components:** GridTools, TemplateManager  
**Scope:** Save/load templates, grid tools panel

### 📅 Slice 2.5: Team View Display
**Status:** Not Started  
**User Value:** Team members can see who's available when  
**PRD Sections:** 4.1.2 (Team View Mode)  
**Components:** PlayerDisplay, OverflowModal  
**Scope:** Show initials/avatars, handle 4+ players, real-time updates

### 📅 Slice 2.6: Team Joining Flow
**Status:** Not Started  
**User Value:** Users can join teams via invite code  
**PRD Sections:** 2.2 (Path A), 4.3.1  
**Components:** JoinTeamModal  
**Scope:** Enter code, validate, join team, show success

### 📅 Slice 2.7: Multi-Team Support
**Status:** Not Started  
**User Value:** Users can switch between their teams  
**PRD Sections:** 2.4  
**Components:** TeamSwitcher  
**Scope:** Team buttons, instant switching, cache management

---

## Part 3: Team Coordination

### 📅 Slice 3.1: Team Browser
**Status:** Not Started  
**User Value:** Users can browse all active teams  
**PRD Sections:** 4.2.1 (bottom panel only)  
**Components:** TeamBrowser  
**Scope:** List teams, search, show basic info

### 📅 Slice 3.2: Favorites System
**Status:** Not Started  
**User Value:** Users can star teams for quick access  
**PRD Sections:** 4.2.1 (middle panel)  
**Components:** FavoritesPanel  
**Scope:** Star/unstar teams, favorites list, localStorage

### 📅 Slice 3.3: Comparison Filters
**Status:** Not Started  
**User Value:** Users can set minimum player requirements  
**PRD Sections:** 4.2.1 (top panel)  
**Components:** FilterPanel  
**Scope:** Min player dropdowns for both teams

### 📅 Slice 3.4: Basic Comparison
**Status:** Not Started  
**User Value:** Teams can see matching time slots  
**PRD Sections:** 4.2.2, 4.2.3  
**Components:** ComparisonEngine  
**Scope:** Compare button, calculate matches, show results

### 📅 Slice 3.5: Comparison Details
**Status:** Not Started  
**User Value:** Users can see who's available in matching slots  
**PRD Sections:** 4.2.4, 4.2.6  
**Components:** ComparisonModal  
**Scope:** Click match slot, show both rosters, contact info

### 📅 Slice 3.6: Leader Management
**Status:** Not Started  
**User Value:** Leaders can remove players  
**PRD Sections:** 4.3.3  
**Components:** KickPlayerModal  
**Scope:** Select players, confirm removal

### 📅 Slice 3.7: Leadership Transfer
**Status:** Not Started  
**User Value:** Leaders can pass leadership to others  
**PRD Sections:** 4.3.3  
**Components:** TransferLeadershipModal  
**Scope:** Select new leader, confirm transfer

---

## Part 4: Polish & Enhancement

### 📅 Slice 4.1: Logo Upload
**Status:** Not Started  
**User Value:** Teams can upload custom logos  
**PRD Sections:** 4.3.2 (Logo Management)  
**Components:** LogoUploadModal  
**Scope:** File selection, cropping UI, upload progress

### 📅 Slice 4.2: Logo Display
**Status:** Not Started  
**User Value:** Team logos appear throughout the app  
**PRD Sections:** 4.3.2  
**Components:** TeamLogo component  
**Scope:** Display in drawer, comparison view, team cards

### 📅 Slice 4.3: Discord OAuth
**Status:** Not Started  
**User Value:** Users can link Discord accounts  
**PRD Sections:** 1.4, 4.4.1  
**Components:** DiscordAuth  
**Scope:** OAuth flow, store Discord data

### 📅 Slice 4.4: Discord Contact
**Status:** Not Started  
**User Value:** Leaders can contact each other  
**PRD Sections:** 4.2.4, 4.3.5  
**Components:** ContactButton  
**Scope:** Show Discord username, generate DM links

### 📅 Slice 4.5: Error States
**Status:** Not Started  
**User Value:** Clear feedback when things go wrong  
**PRD Sections:** 7.1-7.11  
**Components:** ErrorBoundary, ToastSystem  
**Scope:** Error handling, toast notifications, empty states

### 📅 Slice 4.6: Performance Audit
**Status:** Not Started  
**User Value:** Everything feels instant  
**PRD Sections:** 5.1-5.6  
**Components:** All  
**Scope:** Measure hot paths, optimize where needed

---

## Progress Summary
**Slices Complete:** 2.5 / 24

## Current Focus
Ready for Slice 1.2c - Team actions implementation

---

*Last Updated: 2025-01-17*