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

### ✅ Slice 1.2c: Team Actions Implementation
**Status:** Complete
**User Value:** Management buttons actually perform their actions
**PRD Sections:** 4.3.2, 4.3.3
**Components:** Copy function, Leave team, Regenerate code
**Scope:** Wire up drawer buttons (except modals)

---

## Part 2: Core Scheduling

### ✅ Slice 2.1: Basic Availability Grid
**Status:** Complete
**User Value:** Users can see and click individual time slots
**PRD Sections:** 4.1.1, 4.1.2 (structure only)
**Components:** AvailabilityGrid, WeekDisplay, WeekNavigation
**Scope:** Grid rendering, single-slot click selection, week headers
**Note:** Factory pattern for independent grid instances, 1080p/1440p optimized

### ✅ Slice 2.2: Personal Availability Setting
**Status:** Complete
**User Value:** Users can add/remove themselves from time slots
**PRD Sections:** 4.1.3 (single click only), 4.1.5
**Components:** AvailabilityService, GridActionButtons, Cloud Function
**Scope:** Add me/Remove me buttons, optimistic updates, Firebase sync
**Note:** Blue border indicates user's saved availability, real-time updates via Firestore listeners

### ✅ Slice 2.3: Advanced Selection
**Status:** Complete
**User Value:** Users can select multiple slots efficiently
**PRD Sections:** 4.1.3 (multi-select methods)
**Components:** AvailabilityGrid (enhanced), GridActionButtons
**Scope:** Drag selection (rectangular), header clicks (day/time), shift+click, Select All/Clear All
**Note:** Toggle behavior (all selected → deselect), cross-grid drag constrained to single grid

### ✅ Slice 2.4: Templates & Grid Tools
**Status:** Complete
**User Value:** Users can save and reuse availability patterns
**PRD Sections:** 4.1.4
**Components:** TemplateService, GridActionButtons (enhanced), Cloud Functions
**Scope:** Save/load/rename/delete templates (max 3), load to W1/W2 independently
**Note:** Real-time sync via Firestore listener, templates stored in /users/{userId}/templates subcollection

### ✅ Slice 2.5: Team View Display
**Status:** Complete
**User Value:** Team members can see who's available when
**PRD Sections:** 4.1.2 (Team View Mode)
**Components:** PlayerDisplayService, PlayerTooltip, OverflowModal, AvailabilityGrid (enhanced)
**Scope:** Show initials/avatars in cells, handle 4+ players with overflow, display mode toggle
**Note:** Max 3 badges per cell, hover tooltip for 4+, click opens modal on overflow badge

### ✅ Slice 2.6: Team Joining Flow
**Status:** Complete
**User Value:** Users can join teams via invite code
**PRD Sections:** 2.2 (Path A), 4.3.1
**Components:** OnboardingModal (join mode), TeamService, Cloud Function
**Scope:** Enter code, validate, join team, show success
**Note:** Full flow in OnboardingModal with validation, error handling, and real-time roster updates

### ✅ Slice 2.7: Multi-Team Support
**Status:** Complete
**User Value:** Users can switch between their teams
**PRD Sections:** 2.4
**Components:** TeamInfo (team switcher buttons), app.js (listener management)
**Scope:** Team buttons, instant switching, cache management
**Note:** 2-button grid when user has 2 teams, instant switch from cached _userTeams array, automatic availability listener swap

---

## Part 3: Team Coordination

### ✅ Slice 3.1: Team Browser
**Status:** Complete
**User Value:** Users can browse all active teams
**PRD Sections:** 4.2.1 (bottom panel only)
**Components:** TeamBrowser, TeamBrowserState
**Scope:** List teams, search by name/player, division filters, team roster tooltip on hover
**Note:** Real-time updates via Firestore listener, excludes user's current team

### ✅ Slice 3.2: Favorites System
**Status:** Complete
**User Value:** Users can star teams for quick access
**PRD Sections:** 4.2.1 (middle panel)
**Components:** FavoritesPanel, FavoritesService, updateFavorites Cloud Function
**Scope:** Star/unstar teams, favorites list, Firestore persistence, Select All/Deselect All
**Note:** Optimistic updates, unified selection with TeamBrowser, team roster tooltip on hover

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
**Slices Complete:** 14 / 24

## Current Focus
Ready for Slice 3.3 - Comparison Filters

---

*Last Updated: 2026-01-25*