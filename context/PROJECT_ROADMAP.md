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

### ✅ Slice 4.3.3: Avatar Manager
**Status:** Complete
**User Value:** Users can customize their avatar (Discord, custom upload, or default)
**PRD Sections:** 4.4.1
**Components:** AvatarManagerModal (new), AvatarUploadModal (new), AvatarUploadService (new), processAvatarUpload Cloud Function, ProfileModal (enhance), UserProfile (enhance)
**Scope:**
- Clickable avatar in ProfileModal header opens AvatarManagerModal
- Source options: Custom upload, Discord, Google, Default, Initials
- Upload custom avatar with Cropper.js (reuses logo upload pattern)
- Cloud Function processes uploads to 128/64/32px sizes
- UserProfile simplified to single-row clickable layout
- Storage rules for avatar-uploads and user-avatars paths

**Note:** Clean UX flow - click avatar to manage, save to persist. Schema updated with avatarSource, customAvatarUrl, discordAvatarHash fields.

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

## Part 5: Layout Evolution & Integrations

### ✅ Slice 5.0a: Layout Foundation
**Status:** Complete
**User Value:** More vertical space for grids, tabbed interface for additional features
**Spec:** `context/slices/slice-5.0a-layout-foundation.md`
**Components:** All layout components, WeekDisplay, WeekNavigation, BottomPanelController (new)
**Scope:**
- Restructure grid: middle row becomes divider/tab bar
- Move week navigation to grid headers
- Tab switching: Calendar | Teams | Tournament
- Relocate profile indicator and min players filter

**Note:** Fixed auth state propagation for compact-only panels, container ID alignment after grid restructure. Reseed script enhanced with all 24 Big4 teams, logos, and Discord contact info.

### ✅ Slice 5.0b: Grid Tools Enhancement
**Status:** Complete
**User Value:** Intuitive selection actions, cleaner tools panel
**Spec:** `context/slices/slice-5.0b-grid-tools-enhancement.md`
**Components:** GridActionButtons (refactor), SelectionActionButton (new)
**Scope:**
- Condense Grid Tools panel to 2 rows
- Remove Add/Remove buttons (replaced by floating action)
- Add floating action button near selection
- Add Upcoming Matches placeholder section

**Note:** Floating button appears near selection with smart repositioning. Shows "+ Add Me" (primary) or "− Remove Me" (destructive) based on user's presence in all selected cells. Keyboard support: Enter to confirm, Escape to cancel/clear selection.

### ✅ Slice 5.1: Teams/Players Browser
**Status:** Complete
**User Value:** Browse all teams and players in a dedicated, organized view
**Spec:** `context/slices/slice-5.1-teams-players-browser.md`
**Components:** TeamsBrowserPanel (new), BottomPanelController (enhance)
**Scope:**
- Tab content for "Teams" and "Players" in bottom-center panel
- **Teams View:** Full-width team detail driven by Browse Teams selection (bottom-right)
- **Players View:** Multi-column responsive grid with search + division filters
- Player cards with team logo + name, hover tooltip shows all teams

**Note:** Foundation for QW Hub integration. Browse Teams panel (bottom-right) drives team selection.

### ✅ Slice 5.1a: QW Hub Tag Configuration
**Status:** Complete (Revised)
**User Value:** Team tags match QW in-game identity, enabling match history lookups
**Components:** TeamService (modify), team-operations Cloud Function (modify), seed scripts
**Scope:**
- ~~Separate `qwHubTag` field~~ → Merged into existing `teamTag`
- Relaxed `teamTag` validation: case-sensitive, allows QW special chars (`[]()-_.,!`), 1-4 chars
- Seed scripts use real QW Hub tags (e.g., `]SR[`, `GoF!`, `tSQ`)
- No UI changes needed — leaders set teamTag at team creation

**Note:** During implementation, discovered that QW Hub tags and in-game tags are the same thing. Simplified by using `teamTag` directly for hub lookups instead of maintaining a separate field.

### ✅ Slice 5.1b: Team Match History (Basic)
**Status:** Complete
**User Value:** See a team's recent match results from QW Hub
**Spec:** `context/slices/slice-5.1b-team-match-history.md`
**Components:** QWHubService (new), TeamsBrowserPanel (enhance)
**Scope:**
- Fetch recent 4on4 matches using team's `teamTag` for QW Hub API lookup
- Display in team detail view with hub-style scoreboard rendering
- Click match row to toggle inline scoreboard with mapshot background
- "View on QW Hub" link, loading/error/retry states
- QW color palette, colored names, country flags

**Note:** Superseded by Slice 5.2 cluster for enhanced UX, but core QWHubService and scoreboard rendering remain.

### Slice 5.2: Team Detail Redesign (Tab Cluster)

Redesign of the team detail view with tabbed navigation, richer landing page, split-panel match history, stats popout, and head-to-head comparison. Supersedes 5.1b layout and 5.1c entirely.

#### ✅ Slice 5.2a: Team Details Landing Page
**Status:** Complete
**User Value:** Rich team identity page with logo, roster, and auto-generated activity stats
**Spec:** `context/slices/slice-5.2a-team-details-landing.md`
**Components:** TeamsBrowserPanel (enhance), QWHubService (enhance)
**Scope:**
- Tabbed sub-navigation: [Details] [Match History] [Head to Head]
- Details tab: Hero logo (11rem), team name + division in right-side header, roster with avatars
- Two-column layout: identity left (logo + roster), activity right (map stats + upcoming)
- Map activity summary: matches per map with W-L record (last 6 months, auto-generated from QWHub)
- New `getTeamMapStats()` method in QWHubService (50 matches, client-side aggregation)
- "Compare H2H" button navigates to Head to Head tab
- Upcoming games placeholder section

**Note:** Seed scripts updated with correct QWHub clan tags for all 24 teams. Record format uses compact W-L dash format (green-red coloring). Teams without QWHub tags show "Match history not available".

#### ✅ Slice 5.2b: Match History Split-Panel
**Status:** Complete
**User Value:** Browse match history with filters and preview scoreboards by hover/click
**Spec:** `context/slices/slice-5.2b-match-history-split-panel.md`
**Components:** TeamsBrowserPanel (enhance)
**Scope:**
- Left panel (38%): Scrollable match list with map/opponent/period filters, sortable columns, up to 20 matches
- Right panel (62%): Scoreboard preview area with mapshot background
- Hover = instant preview (from cached Supabase data), Click = sticky + fetch ktxstats
- Activity chart + map/opponent breakdown in summary view
- "View on QW Hub" game link + "Full Stats" button

**Note:** Split ratio tuned from original 40/60 to 38/62 for better stats table fit at 1080p.

#### ✅ Slice 5.2c: Inline Stats Table (Revised from Popout Modal)
**Status:** Complete
**User Value:** Per-player match stats rendered inline on map background with 3 toggleable tabs
**Spec:** `context/slices/slice-5.2c-stats-popout-modal.md` (original spec — implementation pivoted to inline)
**Components:** TeamsBrowserPanel (enhance), QWHubService (enhance)
**Scope:**
- Unified stats-on-map view: stats table rendered on map background with dark overlay + text-outline
- 3 tabs: Performance (Eff%, Deaths, Dmg, EWEP, ToDie), Weapons (SG%, RL t/d, LG%/t/d), Resources (GA, YA, RA, MH, Q, P, R)
- Team aggregate rows + per-player rows grouped by team, sorted by frags
- Hub-style colored headers (armor/powerup colors), dimmed zeros, red-to-orange team dividers
- QW byte-encoded name rendering via new `coloredQuakeNameFromBytes()`
- Hover shows classic scoreboard, click transitions to unified stats view
- "View on QW Hub" + "Full Stats" links inside overlay

**Note:** Originally planned as draggable popout modal for side-by-side comparison. Pivoted to inline stats-on-map view — simpler, eliminates redundant scoreboard, and the map background gives each match visual identity. Popout can be added later if comparison use case demands it.

#### 📅 Slice 5.2d: Head-to-Head Tab
**Status:** Not Started
**User Value:** Compare two teams' H2H record with stats, map breakdown, and match list
**Spec:** `context/slices/slice-5.2d-head-to-head-tab.md`
**Supersedes:** Slice 5.1c
**Components:** TeamsBrowserPanel (enhance), QWHubService (enhance)
**Scope:**
- H2H tab in team detail navigation, pre-selects current team
- Searchable opponent dropdown (teams with QWHub tags)
- Overall W/L record, per-map breakdown with win bars
- Match list with click-to-view stats (reuses 5.2c MatchStatsModal)
- New `getH2HMatches()` method in QWHubService (sorted cache key)

---

## Part 5b: Cross-Timezone Support

### ✅ Slice 7.0: UTC Timezone Foundation
**Status:** Complete
**User Value:** Players in any timezone see local evening times while availability is stored in UTC, enabling correct cross-timezone comparison
**Spec:** `context/slices/slice-7.0-utc-timezone-foundation.md`
**Components:** TimezoneService (new), AvailabilityGrid (modify), WeekNavigation (modify), WeekDisplay (modify), ComparisonModal (modify), OverflowModal (modify), Cloud Functions (modify), seed scripts (modify)
**Scope:**
- TimezoneService with IANA timezone support, DST-aware via Intl API
- All Firestore slot IDs stored as UTC
- Grid displays local time labels (18:00-23:00 in user's timezone)
- Day wrapping for negative-offset timezones (e.g., EST Mon 21:00 → UTC Tue 02:00)
- Timezone selector UI in grid header (grouped by region)
- Auto-detect timezone from browser, persist to user document
- Cloud Function validation updated to accept any UTC hour (00-23)
- Seed script generates UTC-based slot data
- Templates store UTC slot IDs
- Modals display times in user's local timezone

**Note:** All 7 test suites pass (offset calculation, local→UTC, UTC→local, day wrapping, grid map round-trip, boundary offsets, display formatting). ComparisonEngine unchanged — already compares slot ID strings.

---

### 📅 Slice 5.3: Tournament Hub Tab
**Status:** Not Started
**User Value:** See tournament deadlines and quick-compare against opponents
**Components:** TournamentHubPanel (new)
**Scope:** Tournament list, deadline warnings, preset comparison groups

### 📅 Slice 5.4: Big4 Integration
**Status:** Pending API access
**User Value:** Automatic sync with thebig4.se tournament data
**Components:** Big4Service (new), tournament sync functions
**Scope:** Pull standings/fixtures, push scheduled matches

---

## Part 6: UI Polish & Refactoring

### 📅 Slice 6.0: Team Panel UI Refactor
**Status:** Not Started
**User Value:** Cleaner team management UX via modal, grid tools closer to roster
**Spec:** `context/slices/slice-6.0-team-panel-refactor.md`
**Components:** TeamManagementModal (new), TeamInfo (modify), GridActionButtons (relocate)
**Scope:**
- Move team management from drawer to modal (click team name/gear icon)
- Relocate Grid Tools to collapsible drawer in team panel (below roster)
- Remove old TeamManagementDrawer component
- Better resolution handling at 1080p/1440p

**Sub-slices:**
- 6.0a: Team Management Modal
- 6.0b: Grid Tools Drawer (in team panel)
- 6.0c: Cleanup old drawer

**Note:** Drawer struggled with variable content height. Modal handles complex content better. Grid Tools drawer has bounded content (max 4-5 rows) - ideal for drawer pattern.

---

## Progress Summary
**Slices Complete:** 31 / ~37

## Current Focus
**Open** - Slice 7.0 (UTC Timezone Foundation) complete. Deciding next priority.

## QW Hub Integration Path
5.1 → 5.1a → 5.1b (basic) → ✅ 5.2a → ✅ 5.2b → ✅ 5.2c → **5.2d** (full redesign)

Each 5.2 slice builds on the previous:
- 5.2a: Tab infrastructure + Details landing page (foundation)
- 5.2b: Match History split-panel (requires 5.2a tabs)
- 5.2c: Stats popout modal (requires 5.2b "Full Stats" button)
- 5.2d: H2H tab (requires 5.2a tabs, reuses 5.2b/c patterns)

---

*Last Updated: 2026-01-31*