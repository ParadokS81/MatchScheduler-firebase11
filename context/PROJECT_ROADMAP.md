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

### ✅ Slice 3.3: Comparison Filters
**Status:** Complete
**User Value:** Users can set minimum player requirements
**PRD Sections:** 4.2.1 (top panel)
**Components:** FilterPanel, FilterService
**Scope:** Min player dropdowns for both teams (1-4 range)
**Note:** Compact single-row layout "Minimum Players [x] vs [x]", session-specific (resets on refresh)

### ✅ Slice 3.4: Basic Comparison
**Status:** Complete
**User Value:** Teams can see matching time slots
**PRD Sections:** 4.2.2, 4.2.3
**Components:** ComparisonEngine, AvailabilityGrid (enhanced), FavoritesPanel (enhanced)
**Scope:** Compare button, calculate matches, visual highlights, hover tooltip with rosters
**Note:** Green borders for full match (4v4), amber for partial. Side-by-side tooltip shows user team vs opponents. Filter changes trigger live recalculation.

### ✅ Slice 3.5: Comparison Details Modal
**Status:** Complete
**User Value:** Users can see who's available in matching slots and contact leaders
**PRD Sections:** 4.2.4, 4.2.6
**Components:** ComparisonModal, AvailabilityGrid (click handler), ComparisonEngine (leaderId)
**Scope:** Click match slot for detailed roster view, Discord contact section for leaders
**Note:** Contact UI ready for Discord OAuth (Slice 4.3). Shows "Open DM" when discordUserId available, "Copy Username" as fallback, or "Not linked" message.

### ✅ Slice 3.6-3.7: Leader Management (Bundled)
**Status:** Complete
**User Value:** Leaders can remove players and transfer leadership
**PRD Sections:** 4.3.3, 5.6
**Components:** KickPlayerModal, TransferLeadershipModal, kickPlayer/transferLeadership Cloud Functions
**Scope:** Select player modal, confirm removal, transfer leadership to member, event logging
**Note:** Kicked players have availability cleared. Transaction-safe with proper read-before-write ordering.

---

## Part 4: Polish & Enhancement

### ✅ Slice 4.1: Logo Upload
**Status:** Complete
**User Value:** Teams can upload custom logos
**PRD Sections:** 4.3.2 (Logo Management)
**Components:** LogoUploadModal, LogoUploadService, logo-processing Cloud Function
**Scope:** File selection, client-side preview, upload to Firebase Storage, server-side processing (resize to 3 sizes), Firestore update
**Note:** Leaders only. Cloud Function triggers on upload, validates permissions, creates small/medium/large thumbnails, stores URLs in team document.

### ✅ Slice 4.2: Enhanced Comparison Modal
**Status:** Complete
**User Value:** Team logos appear in comparison modal with improved VS layout
**PRD Sections:** 4.3.2, 4.2.4
**Components:** ComparisonModal (rewritten), TeamInfo (logo display)
**Scope:** Side-by-side VS layout, team logos in cards, green/grey player availability dots, opponent selector tabs in header, Discord contact for leaders
**Note:** Clean header with "Match Details — Day at Time" format. Opponent tabs on right side for multi-match slots. Logos also display in TeamInfo panel.

### ✅ Slice 4.3.1: Discord OAuth Foundation
**Status:** Complete
**User Value:** Users can sign in with Discord (primary) or Google, enabling gaming identity and future integrations
**PRD Sections:** 1.2, 4.4.1
**Components:** SignInScreen (new), AuthService (modify), discordOAuthExchange Cloud Function
**Spec:** `context/slices/slice-4.3.1-discord-oauth-foundation.md`
**Scope:**
- Sign-in screen with Discord as primary, Google as secondary
- Discord OAuth popup flow with Cloud Function token exchange
- Create Firebase user + Firestore document from Discord data
- Store discordUsername, discordUserId, discordAvatarHash
- Dev mode continues to work

**Note:** Completed with account unification - existing Google users with matching email prompted to sign in with Google instead of creating duplicate account.

### ✅ Slice 4.3.2: Discord Linking for Google Users
**Status:** Complete
**User Value:** Google users can link Discord account for avatars and DMs
**PRD Sections:** 1.2, 4.4.1
**Components:** ProfileModal (enhance), AuthService (link method), googleSignIn Cloud Function
**Scope:**
- "Link Discord" button in Edit Profile modal
- OAuth flow that links to existing account (not creates new)
- Unlink option
- Show linked status with Discord username
- Simplified auth flow: googleSignIn creates user doc automatically

**Additional work completed:**
- Delete Account feature (GDPR compliance) - removes user from Firebase Auth + Firestore + team rosters
- ProfileModal UI cleanup - compact layout with nick+initials on one row, Discord in single line, cleaner buttons

### 📅 Slice 4.3.3: Avatar Manager
**Status:** Not Started
**User Value:** Users can customize their avatar (Discord, custom upload, or default)
**PRD Sections:** 4.4.1
**Components:** AvatarManager (new), ProfileModal (enhance)
**Scope:**
- Avatar section in Edit Profile modal
- Priority: Custom upload → Discord → Default → Initials
- Upload custom avatar (reuse logo upload pattern)
- "Use Discord Avatar" toggle (if linked)
- Default Quake-style placeholder (community-designed)
- Integrates with existing grid avatar toggle

### 📅 Slice 4.4: Discord Contact Enhancement
**Status:** Partially Complete (via Slice 3.5)
**User Value:** Leaders can contact each other directly via Discord
**PRD Sections:** 4.2.4, 4.3.5
**Components:** ComparisonModal (already has contact UI)
**Scope:**
- ✅ Contact section in ComparisonModal (done in 3.5)
- ✅ "Open Discord DM" button with deep link (done in 3.5)
- ✅ "Copy Username" fallback button (done in 3.5)
- ⏳ Depends on 4.3 to populate Discord data via OAuth

**Note:** UI is ready, just needs Discord OAuth (4.3) to populate the data fields.

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
**Slices Complete:** 21 / 25 (3.6 and 3.7 bundled, 4.3 expanded to 4.3.1-4.3.3)

## Current Focus
Part 4 in progress! Next up: Slice 4.3.3 Avatar Manager or Slice 4.5 Error States

---

*Last Updated: 2026-01-26*