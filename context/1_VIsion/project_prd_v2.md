# MatchScheduler Product Requirements Document v2.0

**Version:** 2.0  
**Status:** In Development  
**Purpose:** Comprehensive product specification for AI-driven development with clear user states, permissions, and performance requirements

---

## Table of Contents

1. [User Types & Permissions](#1-user-types--permissions)
2. [User State Lifecycles](#2-user-state-lifecycles)  
3. [Core User Journeys](#3-core-user-journeys)
4. [Feature Specifications](#4-feature-specifications)
5. [Performance & Data Requirements](#5-performance--data-requirements)
   - 5.1 [Hot Paths](#51-hot-paths-must-be-instant---50ms)
   - 5.2 [Cold Paths](#52-cold-paths-can-show-loading---2-seconds)
   - 5.3 [Data Caching Strategy](#53-data-caching-strategy-pre-load-everything)
   - 5.4 [Real-time Update Architecture](#54-real-time-update-architecture)
   - 5.5 [Error Recovery & Cache Management](#55-error-recovery--cache-management)
   - 5.6 [Event Logging System](#56-event-logging-system)
6. [UI/UX Requirements](#6-uiux-requirements)
7. [Error Handling & User Feedback](#7-error-handling--user-feedback)

---

## 1. User Types & Permissions

### 1.1 Guest (Unauthenticated)

**What they CAN see:**
- Main dashboard in read-only mode
- Public team information (names, logos, divisions)
- General availability grid (without player details)
- Login/signup options

**What they CANNOT see:**
- Player names/initials in availability slots
- Team rosters
- Join codes
- Comparison features

**What they CAN do:**
- Browse public team information
- Click login/signup
- View general layout and features

**What they CANNOT do:**
- Join or create teams
- Set availability
- Access any interactive features
- See detailed player information

**UI State:**
- Header shows "Login / Sign Up" button
- Team Info panel shows "Create Team" and "Join Team" buttons
- Availability grid shows time slots but no player data
- All interactive elements are disabled with hover tooltips explaining login requirement

---

### 1.2 Authenticated User (Unified Onboarding Flow)

**Use Case:** "I just logged in with Google, now I need to create my profile and either join my friends' team or start my own"

**Unified Modal Layout:**
```
[Profile Section]
Nickname: [text input]
Initials: [3-char input] 

[Divider/Separator]

[Join Existing Team]
Join Code: [6-char input] [Join Team Button]

[Create New Team] 
Team Name: [text input]
Team Tag: [4-char input] (e.g., "EQL", "PURG")
Divisions: [checkboxes for 1, 2, 3]
Max Players: [dropdown, default 10]
[Create Team Button]
```

**Flow Behavior:**

**Join Team Path:**
- User fills nickname, initials, join code
- Clicks "Join Team" button (validates only join code field)
- On success: Modal disappears, dashboard shows team data immediately
- Performance: Super fast (team data already exists)

**Create Team Path:**
- User fills nickname, initials, team name, team tag (4 chars), divisions, max players
- Clicks "Create Team" button (validates only create team fields)
- Modal transforms to show "Creating team..." with loading indicator
- Backend processes: Create team document, generate join code, add user as leader
- On success: Modal disappears, dashboard shows new team with user as leader
- Performance: 2-5 seconds (acceptable cold path)

**Discord Integration:** Available later in Edit Profile modal (user icon → top left) for linking Discord profile and avatar.

#### Discord Account Linking
**Purpose:** Enable direct contact between team leaders for match coordination

**What We Store:**
- Discord username (for display)
- Discord user ID (for generating DM links)
- Discord avatar URL (for future profile pictures)

**Linking Flow:**
1. User clicks "Link Discord Account" in Edit Profile modal
2. OAuth redirect to Discord for authorization
3. User approves basic profile access
4. Return to MatchScheduler with Discord data stored
5. "Discord Linked ✓" shown in profile

**Privacy:** Only team leaders can see Discord usernames of other team leaders

---

### 1.3 Team Member (Authenticated + Profile + On Team)

**Use Case:** "I'm on a team, checking schedules daily, setting availability, looking for matches"

### Team Management Drawer Access:
**What Members See:**
- Current join code (read-only)
- Max player limit (read-only)  
- **Action:** Leave Team button

### Grid View Modes:
**Team View Mode (Default):**
- Shows your team's availability with player initials in time slots
- Clear view of your collective team schedule

**Comparison View Mode:**
- Shows match opportunities with selected opponents
- Time slots display opponent team logos/favicons when match criteria met
- "+X" indicator when too many matching teams to display
- Click matching slot → Modal showing matched opponents + their available rosters

**View Mode Toggle:** Located in week header

### Right Panel Layout:
- **Top Right:** Filter controls (own team min players, opponent min players)
- **Middle Right:** Favorites list (starred teams for quick comparison)
- **Bottom Right:** Browse all teams (with star buttons to add to favorites)

### Core Daily Usage:
- Set own availability in grid (hot path - instant)
- Use right panel filters (own team: X players, opponents: Y players)
- Browse favorites list for quick comparison
- Star/unstar teams in browse panel
- Switch teams if on multiple (hot path - instant)

### Comparison Workflow:
1. Set player minimums in top right filter
2. Select opponent teams from favorites or browse
3. Activate comparison to see matching time slots
4. Click matches to see opponent details and leader contact

### What they CANNOT do:
- Remove other players from team
- Change team settings (divisions, max players, logo)
- Regenerate join codes
- Transfer leadership
- Access team management controls

**Performance Notes:**
- Availability updates: Must be instant (optimistic)
- Team switching: Must be instant (cached)
- Comparison activation: Can show 1-2 second loading

---

### 1.4 Team Leader (All Member Permissions + Leadership)

**Use Case:** "I created this team, need to manage roster, settings, and coordinate with other team leaders"

### Team Management Drawer Access (Additional to Member):
**What Leaders See:**
- Current join code with **Regenerate** button
- Max player limit with **dropdown menu** (4-20 players)
- Small logo preview with **"Manage Logo"** button
- **Action Buttons:**
  - **Remove Player** (opens modal for multi-select removal)
  - **Transfer Leadership** (opens modal to select new leader)
  - **Leave Team** (greyed out unless last player, triggers team archive)

### Additional Capabilities:
**Team Settings Management:**
- Adjust max players (4-20) via dropdown
- Change team divisions (multiple selection allowed)
- Logo upload/management through dedicated modal

**Player Management:**
- Remove one or multiple players via modal selection
- Transfer leadership to any current team member
- Cannot remove self (must transfer leadership first)

**Join Code Control:**
- Regenerate join code instantly (old code becomes invalid)
- New code displayed immediately to leader
- Used for security or controlling team access

**Special Leave Conditions:**
- Leader can only leave if last player on team
- Leaving as last player archives the team
- Confirmation modal explains this behavior

### Leadership Transfer Rules:
- Can transfer to any current team member
- Previous leader becomes regular member
- Leadership controls immediately update
- No take-backs (new leader has full control)

**Performance Notes:**
- Join code regeneration: Instant
- Team settings updates: Instant  
- Player removal: Can show brief loading
- Logo upload: Shows progress during upload

---

## 2. User State Lifecycles

### 2.1 Guest → Authenticated User

**Use Case:** "I found MatchScheduler link in Discord, want to check it out"

**Trigger Paths:**
1. **Direct Sign In:** Click "Sign In" (top-left) → Google OAuth → Return to dashboard
2. **Intent-Based:** Click "Join/Create Team" → Google OAuth → Auto-show onboarding modal

**User Experience:**
- Guest and authenticated (no profile) users see identical read-only dashboard
- Only difference: authenticated users have auth token for next step
- No functional difference until they join/create a team

**Data Changes:** 
- User document created in Firestore with Google UID
- Authentication state updated
- Session storage checked for intent flag

**Performance:** OAuth redirect acceptable (cold path)

---

### 2.2 Authenticated (No Profile) → Team Member

**Use Case:** "Just signed in, now I want to join my clan team or create a draft team"

#### Path A: Join Existing Team
**User Flow:**
1. Click "Join/Create Team" → Modal opens
2. Fill out: Nickname, Initials (3 chars), Join Code (6 chars)
3. Click "Join Team" → Instant validation
4. Success → Modal closes, dashboard updates with team data

**What They See After:**
- Full team dashboard with availability grid
- Team info panel shows roster and team details  
- Right panel unlocks favorites and comparison features
- Can start setting availability immediately

#### Path B: Create New Team
**User Flow:**
1. Click "Join/Create Team" → Same modal
2. Fill out: Nickname, Initials, Team Name, Team Tag (4 chars), Divisions, Max Players
3. Click "Create Team" → Modal shows "Creating team..." loader
4. Success (2-3 seconds) → Dashboard renders with leader view

**Data Changes:**
- User profile created/updated with nickname and initials
- Team document created (if creating) with auto-generated join code
- User added to team roster
- User's teams map updated

**Performance:** 
- Join team: Near instant (just roster update)
- Create team: 2-3 seconds acceptable (cold path)

---

### 2.3 Team Member → Team Leader

**Use Case:** "Our team leader went inactive, passing leadership to me"

**Trigger Scenarios:**
1. **Automatic:** User creates a team (becomes leader immediately)
2. **Transfer:** Current leader selects member → "Transfer Leadership" → Confirm

**User Experience:**
- No page reload or navigation change
- Team management drawer instantly shows leader controls
- Can immediately access: regenerate code, remove players, change settings

**Data Changes:**
- Team document leaderId updated
- No user document changes
- Real-time update to all team members

**Performance:** Must be instant (hot path)

---

### 2.4 Single Team → Multi-Team Member

**Use Case:** "I'm on my clan team, but also joining this week's draft tournament"

**User Flow:**
1. While on first team, see "Join/Create Team" as second button
2. Click → Modal opens (nickname/initials pre-filled)
3. Join or create second team
4. Buttons transform into team switchers: [Team A] [Team B]

**Team Switching Experience:**
- Click team button → Instant switch (cached data)
- Entire dashboard updates: availability, roster, filters
- Last viewed team remembered in localStorage

**Data Changes:**
- User's teams map gains second entry
- Both teams cached locally
- Listeners set up for both teams

**Performance:** Switching must be instant (hot path)

---

### 2.5 Team Member → No Teams (Browse-Only)

**Use Case:** "I left my team" or "I was removed" or "Team was archived"

**Trigger Scenarios:**
1. **Voluntary Leave:** Team drawer → "Leave Team" → Confirm
2. **Kicked:** Team leader removes player
3. **Team Archived:** Last player leaves, team auto-archives

**User Experience:**
- If on 2 teams → Instantly switch to remaining team
- If on 1 team → Dashboard reverts to browse-only state
- Profile (nickname/initials) remains intact
- Shows single "Join/Create Team" button again

**Edge Case:** Removed from both teams simultaneously
- Falls back to browse-only with profile intact
- Ready to join/create new teams immediately

**Data Changes:**
- User's teams map updated (entry removed)
- Team roster updated
- Local cache cleared for that team
- Listeners cleaned up

**Note:** Archived teams kept for historical data (event sourcing), users can't self-delete

---

## 3. Core User Journeys

### 3.1 First-Time User Journey

**How They Discover It:**
- **Discord Spam**: Most likely - our whole community lives on Discord currently
- **Podcast Feature**: I'll do a news/podcast show with one of the community guys to showcase the tool and raise immediate awareness
- **Tournament Admin Promotion**: I'll talk with tournament admins to promote it before tournaments as a tool to help teams meet deadlines

**First Impressions:**
- Should be self-explanatory - we're solving ONE specific problem and solving it well
- Sharing individual availability → team collective availability → team vs team comparison
- The interface should immediately communicate this simple purpose

**Their First Week:**
1. Login with Google (everyone has it)
2. Join/Create team (single modal, quick process)
3. Start adding availability for next 4 weeks
4. Check if teammates have done the same
5. Maybe try comparing with another team if both have data

**The Key Challenge:** How to make them keep updating their availability week after week. This is the real product challenge - initial adoption is easy, sustained usage requires:
- Team leader pressure
- Tournament deadlines  
- Visible value (seeing your team's schedule fill up)
- Social pressure (being the only one not updating)

**Important Realization:** The tool succeeds even if used ONLY for internal team availability. While my vision is team-vs-team match finding, the tool is perfectly adequate as just a team availability overview. This is actually the primary use case, with opponent matching as a bonus feature.

---

### 3.2 Actual Usage Pattern (Not Daily)

**Reality Check:** This isn't Facebook - users won't visit daily. Once you've set availability for 4 weeks, you only return to:
- Amend your schedule when things change
- Check your team's collective availability
- Find matches with specific opponents

**Typical Session Flow:**

**For Regular Members:**
1. Get Discord message: "Update your availability!"
2. Open MatchScheduler, see current availability
3. Toggle a few slots that changed
4. Maybe check if enough teammates available for practice
5. Close tab - total time: 2-3 minutes

**For Match Scheduling (Leaders mostly):**
1. Tournament context: "We need to play Team X by Sunday"
2. Check comparison view with Team X
3. See matching slots where both teams have players
4. Click slot to see details (which players available)
5. Contact other team leader
6. Total time: 5-10 minutes

**Tournament Context Matters:**
- Tournaments have stages with deadlines
- Teams know their next 2-3 opponents in advance
- This creates urgency to find match times
- The tool helps meet deadlines without last-minute panic

**"It Takes Two to Tango":**
- Individual value: Set your availability ✓
- Team value: See when your team can play ✓
- Full value: Find matches with opponents (requires BOTH teams participating)
- This network effect is both the challenge and opportunity

---

### 3.3 Team Leader Journey

**Initial Setup:**
1. Create team (becomes leader automatically)
2. Set team name, team tag (4 chars), divisions, max players
3. Get 6-character join code
4. Post in team Discord: "Join MatchScheduler - code: ABC123"
5. Upload team logo (optional but adds legitimacy)
6. Start nagging people to join and set availability

**Ongoing Management:**
- **Weekly Ritual**: Post in Discord "UPDATE YOUR AVAILABILITY"
- **Before Matches**: Check if enough players available for important games
- **Tournament Prep**: Compare with upcoming opponents
- **Roster Maintenance**: Remove inactive players, regenerate code if needed

**Match Coordination Workflow:**
1. Check comparison view for specific opponent
2. See matching time slots
3. Click slot → see both teams' available rosters
4. **Contact Other Leader** (This is where Discord integration matters)
5. Confirm match time
6. Post back to team Discord

**Discord Integration Decision Point:**
- **Option being considered**: Require Discord account linked to contact other leaders
- **Why**: Avoid building a messaging system (unnecessary complexity)
- **How it might work**: Click "Contact Leader" → Opens Discord DM or copies username
- **Benefit**: Keeps communication in existing channels
- **Not decided**: Should ALL members be able to contact other leaders, or just leaders?

**Leader Authority Matters:**
- Even in cooperative/friendly teams, someone needs final say
- Can remove players who don't participate
- Can regenerate join code if shared too widely
- Can transfer leadership if going inactive

---

### 3.4 Community Adoption Journey

**Phase 1 - Early Adoption:**
- A few progressive teams start using it
- They see immediate value for internal scheduling
- Word spreads: "We use this tool, it's actually helpful"

**Phase 2 - Tournament Push:**
- Tournament admins recommend it
- "Use MatchScheduler to avoid scheduling conflicts"
- Deadline pressure drives adoption

**Phase 3 - Network Effect:**
- Teams can't find matches because opponents aren't on platform
- "We need to play you but you're not on MatchScheduler"
- Social pressure to join increases

**Phase 4 - Critical Mass:**
- Most active teams are using it
- Becomes the default way to schedule matches
- Not using it = making things harder for everyone

**Adoption Challenges:**
- Some teams comfortable with Discord chaos
- Getting consistent weekly updates (not just one-time setup)
- Both teams need to participate for match-finding value
- No immediate penalty for not updating

**Why It Should Stick:**
- Solves real pain point (last-minute scheduling scrambles)
- Works as team-only tool (doesn't require full adoption)
- Tournament deadlines create recurring need
- Simpler than Discord polls or shared spreadsheets
- Leaders can enforce participation

---

## 4. Feature Specifications

### 4.1 Availability System

**Core Concept:** Players mark themselves available for specific time slots. Teams can see collective availability and find match times.

#### 4.1.1 Grid Structure
- **Time Slots:** 30-minute intervals from 18:00 to 23:00 CET (11 slots per day)
- **Days:** Monday through Sunday
- **Weeks:** Current week + 3 future weeks (4 weeks total)
- **Display:** Bi-weekly blocks - EITHER Week 1+2 OR Week 3+4
- **Week 1:** Always the current week (containing today)
- **Navigation:** [Prev] and [Next] buttons in week header to switch between views

#### 4.1.2 Grid Display Options

**Team View Mode (Default):**
- Shows your own team's availability
- Displays player initials or avatars in time slots (toggle in grid tools)
- Space for 4 entities per slot: [ABC] [DEF] [GHI] [JKL]
- Overflow handling: [ABC] [DEF] [GHI] [+2] - click [+2] for modal
- Click behavior: Empty space = select slot, [+X] button = show overflow

**Comparison View Mode:**
- Shows matches where your team + opponents meet minimum thresholds
- Displays opponent team logos or 4-char tags (toggle in grid tools)
- Same overflow: [EQL] [PURG] [DIV1] [+2]
- Click behavior: ANY click on matching slot opens comparison modal
- Empty slots show no matches

**Mode Toggle:** Located in week header (temporary placement)

#### 4.1.3 Selection Mechanics

**Selection Scope:** All methods work within ONE week at a time

**Selection Methods:**
1. **Single Click:** Select/deselect one cell
2. **Time Header Click:** Select entire row for that week only
3. **Day Header Click:** Select entire column for that week only
4. **Click & Drag:** Select multiple cells (like Google Sheets) within one week
5. **Shift + Click:** Rectangular selection between two cells in same week

**Multi-Week Selection:**
- Can have active selections in BOTH visible weeks simultaneously
- [Add me] / [Remove me] applies to ALL selected slots across both weeks
- Selection tools restricted to one week for simplicity

#### 4.1.4 Grid Tools Panel (Bottom Left)

**Action Buttons:**
- **[Add me]:** Adds your initials to all selected slots
- **[Remove me]:** Removes your initials from selected slots where present
- **[Select all]:** Selects all slots in both visible weeks
- **[Clear all]:** Deselects everything

**Display Toggle:**
- Switch between showing Initials / Avatars in grid

**Template System:**
- **[Save template]:** Saves current selection pattern from one week
- **Load template to week: [Week 24] [Week 25]:** Side-by-side buttons
- Templates store selection patterns only (day/time combinations)
- Workflow: Load template → Adjust selections → [Add me]

**Use Case:** Player typically available Mon/Wed/Fri 19:00-22:00, saves pattern, loads weekly with minor adjustments

#### 4.1.5 Performance Requirements
- **Adding/Removing Self:** Must be instant (optimistic updates)
- **Real-time Updates:** See teammate changes within 1-2 seconds
- **Week Navigation:** Must be instant (pre-loaded data)
- **Selection Operations:** Must be instant
- **Template Operations:** Can show brief loading

---

### 4.2 Team Comparison System

**Core Concept:** Find time slots where your team and potential opponents both have sufficient players available.

#### 4.2.1 Right Panel Configuration (Sacred 3x3 Grid)

**Top Right - Filter Settings:**
- Panel dimensions locked by grid (height = week header, width = side panels)
- **Your team minimum:** [1-4] players (dropdown/slider)
- **Opponent minimum:** [1-4] players (dropdown/slider)
- Compact layout due to size constraints

**Middle Right - Favorites Panel:**
- List of starred teams for quick comparison
- Click team card to select/deselect (like grid slots)
- Visual highlight shows selected state
- **[Select All] / [Deselect All]** toggle
- **[Compare Now]** button at bottom - initiates comparison

**Bottom Right - Browse All Teams:**
- Scrollable list of all active teams
- Click team card to select/deselect for comparison
- Star icon on each card to add/remove from favorites
- Search/filter functionality
- Shows team name, tag, division, player count

#### 4.2.2 Team Selection Pattern

**Consistent with Grid Selection:**
- Click team card = toggle selection
- Multiple teams can be selected
- Visual feedback (background color) shows selected state
- No checkboxes - cleaner interface

#### 4.2.3 Comparison Process

1. **Set Filters:** Adjust minimum player counts in top right
2. **Select Teams:** Click teams in favorites and/or browse panels
3. **Initiate:** Click [Compare Now] in favorites panel
4. **View Results:** Grid updates to comparison mode showing matches

#### 4.2.4 Comparison Modal (Click on Match)

**Modal Contents:**
- **Your Team:** Shows your available roster for this slot
- **Matching Opponents:** For each opponent:
  - Team name and tag
  - Available players (X/Y): List of who signed up
  - Unavailable players: Grayed out list of who didn't
  - Team leader with [Contact] button (requires Discord linked)

**Discord Integration:**
- [Contact] button visible only if both leaders have Discord linked
- Generates direct DM link: `discord://users/{userId}`
- Opens Discord app/web for direct messaging
- Fallback: Shows "Leader hasn't linked Discord account" if not available
- Avoids building internal messaging system

#### 4.2.5 Visual Indicators

**In Comparison Mode:**
- Matching slots show opponent team logos/tags
- Empty slots remain empty (no matches)
- Overflow handled same as team view: [+X] for more
- Your team's player count could be shown as tooltip

#### 4.2.6 Performance Requirements
- **Team selection:** Must be instant
- **Filter changes:** Must be instant
- **Compare Now:** Can show 1-2 second loading
- **Real-time updates:** Must reflect changes immediately
- **Modal opening:** Must be instant

---

### 4.3 Team Management System

#### 4.3.1 Team Creation & Initial Setup

**Post-Creation Experience:**
1. Dashboard renders with new team context
2. Left middle panel (Team Info) shows:
   - Team name and basic info
   - Current roster (just the leader initially)
   - Placeholder logo
   - **Team Management Drawer** (collapsed at bottom)

**First-Time User Guidance:**
- Highlight/pulse the drawer after creation to guide new leaders
- This teaches them where their control panel is located

**Critical First Actions (in order of priority):**
1. **Find Join Code** - Open drawer, copy code for Discord sharing
2. **Set Team Logo** - Open logo manager modal for team identity

**Enhanced Copy String (Frontend Generated):**
```javascript
`Use code: ${joinCode} to join ${teamName} at ${window.location.origin}`
```

**Post-Creation Leader Workflow:**
1. **Immediate:** Copy join code → Share in Discord
2. **While Waiting:** Set own availability (leader is also a player)
3. **Optional:** Upload team logo for polish
4. **Then:** Wait for teammates to join and fill roster
5. **Later:** Use comparison features when tournament matches scheduled

#### 4.3.2 Team Settings Management (Leaders Only)

**Max Players:**
- Dropdown selection (4-20 players)
- Cannot set below current roster size (shows error: "Cannot set max players below current member count")
- Practical use: Reduce when roster is full to prevent unwanted joins (especially if code leaked)

**Division Assignment:**
- Multiple checkbox selection, at least one required
- Teams evolve skill-wise, may want to change division labels
- Updates immediately

**Join Code Regeneration:**
- Instant new code generation, old becomes invalid immediately
- Security measure after removing problem players
- New code displayed immediately to leader

**Logo Management:**
- Reference existing code in `/functions/src/teams/logos.js`
- Not MVP priority but adds vibrancy
- Opens dedicated modal for upload/management

#### 4.3.3 Player Management (Leaders Only)

**Remove Player:**
- Leader discretion for disputes, inactivity, or general reasons
- Immediate access loss for removed player
- Availability cleared for current and future weeks
- Historical availability preserved

**Leadership Transfer:**
- Any roster member eligible (no restrictions)
- Only 2 roles: leader or not leader
- Immediate role change, no take-backs
- Previous leader becomes regular member

#### 4.3.5 Discord Contact System (Team Leaders Only)

**Viewing Opponent Leaders:**
- In comparison modal, opposing team leaders show Discord username (if linked)
- [Contact via Discord] button appears next to leader name
- Only visible to your team's leader (privacy protection)

**Contact Flow:**
1. Team leader clicks [Contact via Discord]
2. System generates Discord DM link: `discord://users/{userId}`
3. Opens Discord app (if installed) or web Discord with DM to that user
4. Leaders coordinate match time directly in Discord

**Fallback:** If leader hasn't linked Discord, show "Discord not linked" message

#### 4.3.4 Team Management Drawer UX

**What Members See:**
- Current join code (read-only)
- Max player limit (read-only)
- **Action:** Leave Team button

**What Leaders See (Additional):**
- Current join code with **Regenerate** button
- Max player limit with **dropdown menu** (4-20 players)
- Small logo preview with **"Manage Logo"** button
- **Action Buttons:**
  - **Remove Player** (opens modal for selection)
  - **Transfer Leadership** (opens modal to select new leader)
  - **Leave Team** (greyed out unless last player)

**Drawer Behavior:**
- Stays open after most actions (except logo manager opens modal)
- Auto-closes when clicking outside drawer
- First-time users get highlighting to discover controls

**Core Functionality Note:** All roster members (including leaders) have equal access to availability setting and team comparison features. Leadership is purely administrative.

### 4.4 User Profile Management

#### 4.4.1 Edit Profile Modal

**Access:** Click user profile icon in top-left panel

**Modal Contents:**
- **Display Name:** Editable text field (2-20 characters)
- **Initials:** Editable text field (exactly 3 characters)
- **Discord Account:** Link/unlink Discord account section
- **Save/Cancel:** Action buttons

**Discord Account Section:**
```
Discord Account: [Not linked] [Link Discord Account]
                 OR
Discord Account: [Username#1234] [✓] [Unlink]
```

**Discord Linking Flow:**
1. User clicks "Link Discord Account" button
2. OAuth redirect to Discord authorization page
3. User approves MatchScheduler access to basic profile
4. Return to MatchScheduler with Discord data
5. Modal shows linked Discord username
6. Avatar URL and user ID stored in backend

**What Discord Data We Collect:**
- Discord User ID (for generating DM links)
- Discord Username (for display)
- Discord Avatar URL (for future profile pictures)

**Profile Update Flow:**
1. User makes changes to display name/initials
2. Clicks "Save Changes"
3. Validation performed (initials unique per team)
4. All team views updated with new display name
5. Future availability shows new initials

**Note:** Historical availability data remains linked via user ID, not initials

---

## 5. Performance & Data Requirements

### 5.1 Hot Paths (Must Be Instant - < 50ms)

**Availability Updates:**
- Click [Add Me]/[Remove Me] → Instant UI update (optimistic)
- Real-time propagation to teammates/opponents: 100-500ms acceptable
- Rollback mechanism if Firebase write fails

**Team Switching:**
- Between user's teams (if on 2 teams)
- Must load from cached data instantly
- All UI components update simultaneously

**Week Navigation:**
- Moving between bi-weekly blocks (Week 1+2 ↔ Week 3+4)
- Pre-loaded availability data enables instant transitions

**Comparison Updates:**
- Filter adjustments (min player counts)
- Team selection/deselection for comparison
- Real-time match highlighting as teams update availability

---

### 5.2 Cold Paths (Can Show Loading - < 2 seconds)

**Team Operations:**
- Creating teams, joining teams, leaving teams
- Player removal, leadership transfer
- Join code regeneration (actually instant, but acceptable if not)

**Profile & Settings:**
- Logo uploads (can show progress)
- Profile updates (name, initials)
- Discord account linking (OAuth flow)
- Team settings changes (divisions, max players)

**Initial App Load:**
- First-time authentication
- Initial data population
- Cache warming

---

### 5.3 Data Caching Strategy (Pre-load Everything)

**On App Load:**
```javascript
// Cache everything (~188KB total)
const allTeams = await loadAllTeamData();        // ~28KB
const allAvailability = await loadAllAvailabilityData(); // ~160KB
// Enables instant browsing and comparisons
```

**Cache Content:**
- All team basic info (names, rosters, logos, divisions)
- All availability data for all teams (4 weeks)
- Total: ~188KB - very reasonable for modern browsers

**Smart Cache Freshness:**
```javascript
// Check cache freshness with server timestamps
POST /checkFreshness
{
  teams: {
    "team123": "2025-07-08T15:30:45Z", // Last known timestamp
    "team456": "2025-07-08T14:22:10Z"
  }
}

// Response identifies only stale teams
{
  staleTeams: ["team123"], // Only this needs refresh
  freshTeams: ["team456"]  // This is current
}
```

**Benefits:**
- Eliminates most loading states
- Smart refresh of only stale data (few KB vs 188KB)
- Instant team browsing and comparison setup

---

### 5.4 Real-time Update Architecture

**Direct Component Subscriptions:**
```javascript
// Components manage own Firebase subscriptions
onSnapshot(doc(db, 'teams', teamId), (doc) => {
  TeamInfo.updateUI(doc.data()); // Direct, no middleware
});

// Event coordination (not data distribution)
onSnapshot(collection(db, 'eventLog'), (snapshot) => {
  EventHandler.route(event); // Simple routing to affected components
});
```

**Activity-Based Listener Management:**
```javascript
// Tab visibility-based cleanup and recovery
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    checkSystemHealth(); // Silent refresh if needed
  }
});
```

**Listener Lifecycle:**
- **Activate:** When clicking [Compare Now]
- **Maintain:** During Team View ↔ Comparison View switching
- **Cleanup:** New team selection, tab inactive 5+ minutes, user leaves
- **Auto-resume:** Tab visibility detection triggers freshness check + restart

**Real-time Propagation:**
- Optimistic updates for instant UI feedback
- Firebase real-time propagation (100-500ms acceptable)
- Automatic rollback on failures
- Silent background recovery through tab visibility

---

### 5.5 Error Recovery & Cache Management

**Automatic Recovery:**
- Tab visibility triggers health checks
- Silent background refresh without UI disruption
- Listeners restart automatically when user returns
- No page reloads or loading spinners needed

**Memory Management:**
- Pre-load strategy works due to bounded dataset (300 players, 40 teams)
- Activity-based cleanup prevents memory leaks
- 5-minute inactivity timeout for listener cleanup
- Smart refresh avoids re-downloading entire cache

**Performance Validation:**
- 188KB total cache size negligible for modern browsers
- Selective refresh (few KB) vs full reload (188KB) optimization
- Real-time updates: 100-500ms propagation acceptable
- Hot paths: < 50ms for all user interactions

### 5.6 Event Logging System

#### Purpose & Philosophy
The event logging system tracks all significant activities within MatchScheduler, providing a comprehensive audit trail for community analytics, debugging, and future features like activity feeds. Events are separated into two categories for better organization.

#### Event Categories

**Team Lifecycle Events** - Track team creation, status changes, and archival:
- `TEAM_CREATED` - When a new team is formed
- `TEAM_INACTIVE` - When a team has no activity for 14+ days
- `TEAM_ACTIVE` - When an inactive team is reactivated
- `TEAM_ARCHIVED` - When the last member leaves a team

**Player Movement Events** - Track player actions within teams:
- `JOINED` - Player joins a team (via join code or as founder)
- `LEFT` - Player voluntarily leaves a team
- `KICKED` - Player removed by team leader
- `TRANSFERRED_LEADERSHIP` - Leadership changes hands

#### Collection Structure

**Collection:** `/eventLog/{eventId}`

```javascript
{
  // Unique, human-readable event ID
  eventId: "20250709-1430-slackers-team_created_X7Y9",
  
  // Core identifiers
  teamId: "team_abc123",
  teamName: "Slackers",
  type: "TEAM_CREATED",
  category: "TEAM_LIFECYCLE",  // or "PLAYER_MOVEMENT"
  timestamp: serverTimestamp(),
  
  // Optional fields based on event type
  userId: "user_xyz789",  // Present for player events, optional for team events
  
  // Player details (only for PLAYER_MOVEMENT events)
  player: {
    displayName: "John Doe",
    initials: "JDO"
  },
  
  // Event-specific metadata
  details: {
    // Varies by event type - examples below
  }
}
```

#### Event ID Format
Event IDs follow a human-readable pattern for easy debugging:
- Format: `YYYYMMDD-HHMM-teamname-eventtype_XXXX`
- Example: `20250709-1430-slackers-team_created_X7Y9`
- Components:
  - Date/time for chronological sorting
  - Team name (cleaned, lowercase, max 20 chars)
  - Event type (underscored)
  - Random 4-char suffix for uniqueness

#### Event Type Specifications

**TEAM_CREATED**
```javascript
{
  type: "TEAM_CREATED",
  category: "TEAM_LIFECYCLE",
  // NO userId - this is a team-centric event
  details: {
    divisions: ["1", "2"],
    maxPlayers: 10,
    creator: {
      displayName: "John Doe",
      initials: "JDO"
    }
  }
}
```

**JOINED** (Including Founder)
```javascript
{
  type: "JOINED",
  category: "PLAYER_MOVEMENT",
  userId: "user_xyz789",
  player: {
    displayName: "John Doe",
    initials: "JDO"
  },
  details: {
    role: "member" | "owner",
    isFounder: true,  // Only true for team creator
    joinMethod: "created" | "joinCode"
  }
}
```

**LEFT**
```javascript
{
  type: "LEFT",
  category: "PLAYER_MOVEMENT",
  userId: "user_xyz789",
  player: {
    displayName: "John Doe",
    initials: "JDO"
  },
  details: {
    wasLastMember: false,
    previousRole: "member" | "owner"
  }
}
```

**KICKED**
```javascript
{
  type: "KICKED",
  category: "PLAYER_MOVEMENT",
  userId: "user_xyz789",  // The kicked player
  player: {
    displayName: "John Doe",
    initials: "JDO"
  },
  details: {
    kickedBy: "user_abc123",  // Leader who performed the kick
    kickedByName: "Team Leader"
  }
}
```

**TRANSFERRED_LEADERSHIP**
```javascript
{
  type: "TRANSFERRED_LEADERSHIP",
  category: "PLAYER_MOVEMENT",
  userId: "user_xyz789",  // New leader
  player: {
    displayName: "New Leader",
    initials: "NLD"
  },
  details: {
    fromUserId: "user_abc123",
    fromUserName: "Previous Leader"
  }
}
```

**TEAM_INACTIVE**
```javascript
{
  type: "TEAM_INACTIVE",
  category: "TEAM_LIFECYCLE",
  // NO userId - automated system event
  details: {
    lastActivityAt: timestamp,
    inactiveDays: 14
  }
}
```

**TEAM_ACTIVE**
```javascript
{
  type: "TEAM_ACTIVE",
  category: "TEAM_LIFECYCLE",
  userId: "user_xyz789",  // User who triggered reactivation
  details: {
    reactivationTrigger: "availability_update" | "roster_change",
    inactiveSince: timestamp
  }
}
```

**TEAM_ARCHIVED**
```javascript
{
  type: "TEAM_ARCHIVED",
  category: "TEAM_LIFECYCLE",
  userId: "user_xyz789",  // Last member who left
  details: {
    reason: "last_member_left",
    finalMember: {
      displayName: "John Doe",
      initials: "JDO"
    }
  }
}
```

#### Implementation Requirements

**Event Creation:**
- All events created server-side via Cloud Functions
- No direct client writes to eventLog collection
- Use transactions to ensure event creation is atomic with the action

**Dual Event Pattern:**
When a team is created, generate TWO events:
1. `TEAM_CREATED` - The team lifecycle event
2. `JOINED` - The founder joining as owner

**Security Rules:**
```javascript
match /eventLog/{document} {
  // Anyone authenticated can read events
  allow read: if request.auth != null;
  
  // Only Cloud Functions can write
  allow write: if false;
}
```

**Helper Functions:**
- `generateEventId(teamName, eventType)` - Creates readable event IDs
- `logTeamLifecycleEvent(db, transaction, eventType, eventData)`
- `logPlayerMovementEvent(db, transaction, eventType, eventData)`

#### Future Use Cases

**Activity Feed:** Display recent team/community activity
**Analytics:** Track player movement patterns, team stability metrics
**Debugging:** Complete audit trail for support issues
**Historical Queries:** "Show all teams this player has been on"

#### Performance Considerations

**Write Performance:**
- Events written during existing transactions (no extra operations)
- Use batch writes when creating dual events

**Read Performance:**
- Index on: teamId, userId, type, category, timestamp
- Compound indexes for common queries (e.g., team + timestamp)

**Storage:**
- Event documents are small (~500 bytes each)
- At 300 players with moderate activity: ~1000 events/month
- Well within Firestore free tier limits

---

## 6. UI/UX Requirements

### 6.1 Sacred 3x3 Grid Layout System

**The layout structure is IMMUTABLE - it never changes across all screen sizes and features.**

#### Grid Structure
```css
.main-grid {
  display: grid;
  
  /* HYBRID SCALING for sidebars:
     - 15% of viewport width for proportional scaling
     - Never smaller than 12.5rem (200px) - usable minimum
     - Never larger than 18.75rem (300px) - prevents excessive width
     
     Why "hybrid"? Combines fixed boundaries with proportional scaling
     - 1080p (1920px wide): 15vw = 288px ✓ perfect fit
     - 1440p (2560px wide): 15vw = 384px → clamped to 300px max
     - Small (1280px wide): 15vw = 192px → bumped to 200px min
  */
  grid-template-columns: clamp(12.5rem, 15vw, 18.75rem) 1fr clamp(12.5rem, 15vw, 18.75rem);
  
  grid-template-rows: 5rem auto auto;     /* Fixed header, content adapts to contents */
  gap: 0.75rem;                           /* Tighter spacing for more content area */
  max-width: 85rem;                       /* Prevents ultra-wide stretching */
  margin: 0 auto;                         /* Centers on very large screens */
}
```

#### Panel Layout Map
```
┌─────────────┬─────────────────┬─────────────┐
│ TOP-LEFT    │ TOP-CENTER      │ TOP-RIGHT   │
│ User Profile│ Week Navigation │ Team Filters│
├─────────────┼─────────────────┼─────────────┤
│ MIDDLE-LEFT │ MIDDLE-CENTER   │ MIDDLE-RIGHT│
│ Team Info   │ Grid Week 1     │ Favorites   │
├─────────────┼─────────────────┼─────────────┤
│ BOTTOM-LEFT │ BOTTOM-CENTER   │ BOTTOM-RIGHT│
│ Grid Tools  │ Grid Week 2     │ Browse Teams│
└─────────────┴─────────────────┴─────────────┘
```

#### Panel Rules
1. **Components own their panel interior only** - Never modify panel dimensions
2. **Fixed grid positions** - No components can change their assigned panel
3. **Overflow handling** - Each panel handles its own scrolling/truncation
4. **Flexbox for internal layout** - Components use flexbox within their panel

#### Why This Works for Gaming Setups
- **1080p majority**: Optimized for 1920x1080 (most common gaming resolution)
- **Scales to 1440p**: Side panels cap at 300px, preventing wasted space
- **Multi-monitor friendly**: Max-width prevents stretching on ultrawide displays
- **Quick glancing**: Compact layout lets players check availability between matches
- **Discord alongside**: Leaves room for Discord on second monitor

### 6.2 Hybrid Scaling Strategy

**Critical Lesson Learned:** Previous scaling issues were solved with hybrid approach combining viewport units with rem scaling.

#### Base Font Size Scaling
```css
:root {
  /* Base: 16px at 1920px viewport */
  font-size: clamp(14px, 0.833vw, 20px);
}
```

#### Scaling Unit Requirements
| Unit Type | Use Case | Example | Required |
|-----------|----------|---------|----------|
| `rem` | Most sizing (scales with root) | `padding: 1rem` | **MUST USE** |
| `em` | Relative to parent font | `margin: 0.5em` | Acceptable |
| `px` | Borders, minimum sizes | `border: 1px solid` | **ONLY for borders** |
| `%` | Relative widths within panels | `width: 100%` | Component internals |
| `vw/vh` | Full viewport references | `height: calc(100vh - 60px)` | Grid system only |

**🚨 CRITICAL RULE: Never use pixels for sizing. All padding, margins, font sizes, and dimensions must use rem units.**

#### Component Sizing Standards
```css
/* Small elements (buttons, inputs) */
.btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  min-height: 2.5rem;
}

/* Medium elements (cards, sections) */
.card {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 0.5rem;
}

/* Panel content (from working v8 code) */
.panel-content {
  padding: 0.75rem;    /* Tighter padding maximizes content space */
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

### 6.3 OKLCH Color System

**Base Theme:** Started with TweakCN "Clean Slate" theme, then customized for gaming aesthetics

#### Color System Structure (Dark Theme - MVP Default)
```css
.dark {
  /* Base Colors - Dark gaming aesthetic */
  --background: oklch(0.2077 0.0398 265.7549);
  --foreground: oklch(0.9288 0.0126 255.5078);
  --card: oklch(0.2527 0.0346 274.0597);
  --card-foreground: oklch(0.9288 0.0126 255.5078);
  
  /* Interactive Colors - Blue/purple gaming vibes */
  --primary: oklch(0.6801 0.1583 276.9349);
  --primary-foreground: oklch(0.2077 0.0398 265.7549);
  --secondary: oklch(0.3351 0.0331 260.9120);
  --accent: oklch(0.3729 0.0306 259.7328);
  
  /* Functional Colors */
  --muted: oklch(0.2795 0.0368 260.0310);
  --muted-foreground: oklch(0.7137 0.0192 261.3246);
  --destructive: oklch(0.6368 0.2078 25.3313);
  --border: oklch(0.4461 0.0263 256.8018);
  --input: oklch(0.4461 0.0263 256.8018);
  --ring: oklch(0.6801 0.1583 276.9349);
}
```

#### Why OKLCH?
- **Perceptually uniform** color space
- **Consistent lightness** across hues
- **Future theme support** - Easy to swap color sets later
- **Modern CSS standard** with better browser support
- **Gaming community appropriate** (professional dark theme)

#### Theme Architecture (Post-MVP Ready)
```css
/* Structure supports easy theme additions later */
:root { /* Light theme variables */ }
.dark { /* Dark theme (MVP default) */ }
.theme-cyberpunk { /* Future theme example */ }
.theme-tournament { /* Future theme example */ }
```

**Note:** Light theme CSS included for structure but hidden in MVP. Focus on perfecting dark theme for gaming community.

### 6.4 Component Interaction Patterns

#### Click-to-Select Pattern (No Checkboxes)
**Used throughout the interface for consistency:**
- **Timeslots:** Click empty space = select, click initials = deselect
- **Team cards:** Click card = toggle selection state
- **Templates:** Click template = select for loading
- **Navigation:** Click week header = select entire column

#### Visual Selection Feedback
```css
/* Selected state styling */
.selected {
  background-color: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

/* Hover state for selectables */
.selectable:hover {
  background-color: var(--accent);
  color: var(--accent-foreground);
}
```

#### Overflow Handling Pattern
**When content exceeds available space:**
- **Display:** Show 3-4 items, then `[+X]` button
- **Interaction:** Click `[+X]` opens modal with full list
- **Examples:** Team initials in timeslots, team logos in comparison view

#### Team Management Drawer Pattern (Critical Component)
**This was perfected after much iteration - follow exactly:**

```html
<!-- Drawer must be absolute positioned within panel -->
<div id="team-management-drawer" 
     class="absolute left-0 right-0 bottom-0 bg-slate-800 border border-slate-600 
            rounded-t-lg drawer-closed transition-transform duration-300 ease-out 
            z-30 overflow-hidden"
     style="top: 2.5rem;">
```

**Key Implementation Details:**
- **Positioning:** `absolute` within the panel, NOT fixed to viewport
- **Z-index:** `z-30` ensures it's above panel content but below modals
- **Animation:** CSS transform with transition, NOT JavaScript animations
- **States:** Toggle between `drawer-open` and `drawer-closed` classes
- **Overflow:** Set to `hidden` to prevent content bleeding during animation

**Common AI Mistakes to Avoid:**
- ❌ Using `position: fixed` (drawer escapes panel)
- ❌ Animating with JavaScript (causes flicker)
- ❌ Wrong z-index (appears behind content or above modals)
- ❌ Using opacity for show/hide (creates click-through issues)
- ❌ Forgetting overflow hidden (content visible during slide)

### 6.5 Component Layout Patterns

#### Flexible Component Structure
**Each component renders what it needs - no forced structure:**

```javascript
// Simple content-only (Week Navigation)
panel.innerHTML = `
    <div class="flex items-center justify-between px-4 h-full">
        <button>Prev</button>
        <div>Week 28: Jul 7 - Jul 13</div>
        <button>Next</button>
    </div>
`;

// Title + content (Favorites, Browse Teams)
panel.innerHTML = `
    <h3 class="text-base font-semibold mb-3">Favorites</h3>
    <div class="space-y-2 overflow-y-auto">
        <!-- Team cards -->
    </div>
`;

// Custom layout (Team Info with switcher)
panel.innerHTML = `
    <div class="team-switcher mb-3">
        <button class="team-btn active">Team A</button>
        <button class="team-btn">Team B</button>
    </div>
    <div class="team-details">
        <!-- Team information -->
    </div>
    <!-- Drawer component at bottom -->
`;
```

#### Component JavaScript Pattern (Revealing Module)
```javascript
const ComponentName = (() => {
    // Private variables
    let panel;
    let state = {};
    
    // Private functions
    function render() {
        panel.innerHTML = `<!-- Component HTML -->`;
        attachListeners();
    }
    
    function attachListeners() {
        // Event handling
    }
    
    // Public API (what we "reveal")
    return {
        init(panelId) {
            panel = document.getElementById(panelId);
            render();
        },
        update(data) {
            state = data;
            render();
        }
    };
})();
```

#### Key Principles
- **No forced structure** - Components render what they need
- **Direct panel rendering** - Use innerHTML with template literals
- **Event re-attachment** - After each render, re-attach listeners
- **Private state** - Keep component data private inside the module
- **Simple API** - Usually just init() and update() are public

### 6.6 Preserved UI Components

**These components are already perfected and must be preserved in v3:**

#### Team Management Drawer (Fully Working Layout)
**Location:** Team Info panel (middle-left)
**Reference:** `/public/js/components/teamInfo_new_code_V2.js`

**Working Layout for Leaders:**
1. **Join Code Row**: Input field + Copy button + Regenerate button
2. **Max Players Row**: Dropdown selector (1-20 players)
3. **Logo Section**: 5rem square placeholder (ready for logo display)
4. **Action Buttons**:
   - Manage Logo (opens modal)
   - Kick Player (opens selection modal)
   - Transfer Leadership (opens selection modal)
   - Leave Team (disabled unless last player)

**Reused Layout for Members:**
1. **Join Code Row**: Input field + Copy button only (no regenerate)
2. **Max Players Row**: Read-only display
3. **Action Button**: Leave Team only

**Why This Works:**
- Same layout structure for both roles
- Progressive disclosure (members see less)
- Consistent spacing and alignment
- All interactive elements tested and working

#### Logo Upload System
**Backend:** Complete processing pipeline in `/functions/src/teams/logos.js`
**Frontend Status:** 
- Modal structure started but not polished
- Upload flow partially implemented
- Logo display placeholder ready in drawer (5rem square)
- Needs: File picker, upload progress, error handling

#### OKLCH Theme Variables
**File:** `/public/css/styles.css`
**Status:** Complete professional color system (customized from TweakCN)
**Usage:** All components must use these CSS variables

### 6.7 Modal and Overlay Systems

#### Working Modal System from v8
**Reference:** `/public/js/components/modals.js`

**Implemented Modal Types:**
- **Join/Create Team Modal** - Unified onboarding flow ✅
- **Logo Manager Modal** - Functional but needs UI polish
- **Leave Team Modal** - Confirmation with role-specific messaging ✅
- **Transfer Leadership Modal** - Player selection interface ✅
- **Kick Players Modal** - Multi-select with confirmation ✅

#### Modal Structure Pattern
```javascript
const modalHTML = `
    <div class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-[48rem]">
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-slate-700">
                <h2 class="text-xl font-bold text-sky-400">${title}</h2>
                <button class="text-slate-400 hover:text-white">&times;</button>
            </div>
            <!-- Body -->
            <div class="p-4">${content}</div>
            <!-- Footer -->
            <div class="flex items-center justify-end p-4 border-t border-slate-700 gap-3">
                ${buttons}
            </div>
        </div>
    </div>
`;
```

#### Modal Behavior Patterns
- **Show/Hide:** `showModal()` / `hideModal()` functions
- **Backdrop click:** Closes modal (already working)
- **Loading states:** Buttons disable with loading text during async ops
- **Error display:** Inline error messages in modal body
- **Memory cleanup:** Destroy Cropper.js instances, clear file inputs

#### Logo Manager Modal (Needs Polish)
**Backend:** Complete and Firebase v11 compliant (see `.context/UI_examples/logos.js`)
**Frontend Status:**
- ✅ Cropper.js integration working
- ✅ File upload to Firebase Storage
- ✅ Triggers Cloud Function processing
- ⚠️ UI needs polish and testing
- ⚠️ Progress indicators during processing
- ⚠️ Error handling for large files/wrong formats

**Note:** Architecture is solid, just needs UI refinement during implementation phase.

### 6.8 Responsive Design Strategy

#### Primary Platform: Desktop Only (MVP)
**The 3x3 grid layout is designed exclusively for desktop gaming setups (1920x1080+)**

#### Why Desktop-Only for MVP:
- **Gaming context**: Players use desktop/laptop for matches
- **Discord integration**: Multi-monitor setups common
- **Complex grid**: Weekly availability needs screen space
- **Team coordination**: Leaders manage from desktop

#### Mobile Considerations (Post-MVP):
- **Not a responsive version** - Would need complete redesign
- **Different UI paradigm**: Single day view, swipe between days
- **Revealing menus**: Hide panels behind gestures
- **Simplified features**: Just availability setting, not full management

#### Basic Overflow Handling:
```css
/* Minimum viable width */
.app-container {
    min-width: 1024px;  /* Force horizontal scroll if needed */
}

/* Prevent layout break */
.main-grid {
    min-width: 85rem;  /* Maintain grid integrity */
}
```

**Note:** Mobile media query included in CSS for future use but not implemented in MVP. Focus on perfecting desktop experience first.

### 6.9 Animation and Transitions

#### Minimal Animation Philosophy
**Keep it simple and functional - animations should enhance, not distract**

#### Currently Implemented Animations
```css
/* Drawer slide animation (300ms sweet spot) */
.drawer-closed {
    transform: translateY(calc(100% - 2rem));
}
.drawer-open {
    transform: translateY(0);
}
.transition-transform {
    transition: transform 300ms ease-out;
}

/* Button hover states */
.btn:hover {
    background-color: var(--primary-hover);
    transition: background-color 200ms;
}

/* Arrow rotation for drawer */
.drawer-arrow {
    transition: transform 300ms;
}
```

#### Potential Animation Enhancements (Nice to Have)
```css
/* Week switching animation (currently instant) */
.week-transition {
    animation: slideIn 300ms ease-out;
}

@keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
}

/* Selection feedback */
.cell-selected {
    animation: pulse 200ms ease-out;
}
```

#### Animation Guidelines
- **300ms duration** - Fast enough to feel responsive, slow enough to see
- **ease-out timing** - Natural deceleration
- **transform over position** - Better performance with GPU acceleration
- **No animations during data updates** - Avoid jank during Firebase operations

**Note:** Current implementation keeps animations minimal. The drawer is the only major animated element, which helps maintain focus on functionality over flash.

### 6.10 Gaming Community UX Considerations

#### Real Tournament Workflow
**Typical timeline:**
- **Group stages**: Schedule known 1-2 months ahead
- **Playoffs**: Schedule known 1-2 weeks ahead
- **Coordination**: Teams reach out to opponents early, negotiate times
- **Challenge**: Teams aren't in same Discord channels/circles

#### Two Primary Use Cases (Equal Priority)
**1. Internal Team Coordination (Likely Most Used):**
- See when all teammates are available
- Identify best practice times
- Quick overview for team leaders
- "Do we have enough players Tuesday night?"

**2. Opponent Comparison (The Original Vision):**
- Compare availability with specific opponents
- Find overlapping time slots
- Contact other team leader
- "When can we both field full teams?"

#### UX Features That Support Both
**For Internal Use:**
- Clear visual density (many players in one slot = good practice time)
- Quick filtering by player count
- Week-at-a-glance overview

**For Match Scheduling:**
- Easy opponent selection from favorites
- Visual match indicators in comparison mode
- Leader contact info readily available
- Copy-friendly match details for Discord sharing

#### Intentionally Limited Scope (MVP)
**What we're NOT building (yet):**
- Tournament bracket integration
- Automated match reporting
- League standings
- Community-wide calendars

**Focus**: Do one thing perfectly - help teams find when they can play.

### 6.11 Implementation Requirements

#### Development Workflow
1. **Generate theme** using TweakCN editor
2. **Install CSS variables** in main stylesheet
3. **Configure Tailwind** to use theme variables
4. **Follow component patterns** for all new components
5. **Test scaling** across multiple viewport sizes

#### Quality Assurance
- **Viewport testing:** 1366px (laptop) to 2560px (large monitor)
- **Color contrast:** Accessibility compliance
- **Performance:** Smooth animations at 60fps
- **Consistency:** All components follow established patterns

**🔑 Critical Success Factor:** The sacred 3x3 grid with hybrid scaling is the foundation of all UI work. Components must fit within their assigned panels and use rem units for all sizing.

---

## 7. Error Handling & User Feedback

### 7.1 Error Categories & Gaming Context

#### User Input Errors (Gaming Community Specific)
**Team Creation Errors:**
- **Invalid team names**: "Team names must be 3-30 characters, no special characters"
- **Duplicate team tags**: "Team tag 'EQL' already exists, try 'EQL2' or 'EQLX'"
- **Join code failures**: "Join code 'ABC123' not found or expired"
- **Character limits**: Team names (30 chars), initials (3 chars), team tags (4 chars)

**Gaming Workflow Errors:**
- **Two-team limit**: "You can only join 2 teams maximum (clan + draft team)"
- **Invalid availability**: "Cannot set availability for past dates"
- **Initials conflicts**: "Initials 'ABC' already taken on this team"
- **Leader-only actions**: "Only team leaders can remove players"

#### Permission Errors (Community Dynamics)
**Team Management Restrictions:**
- **Leadership transfer**: "Cannot transfer leadership to yourself"
- **Player removal**: "Cannot remove yourself - transfer leadership first"
- **Join code access**: "You must be a team member to see the join code"
- **Max players exceeded**: "Team is full (10/10 players)"

**Gaming Community Rules:**
- **Inactive team joining**: "This team has been inactive for 14+ days"
- **Tournament deadlines**: "Cannot modify availability after tournament deadline"
- **Discord linking required**: "Link Discord account to contact other team leaders"

#### System Errors (Firebase v11 Specific)
**Network Connectivity:**
- **Offline mode**: "Working offline - changes will sync when reconnected"
- **Sync conflicts**: "Your changes conflict with recent updates - please refresh"
- **Firebase service down**: "Scheduling service temporarily unavailable"
- **Real-time listener failures**: "Live updates paused - refresh to see latest data"

**Performance Issues:**
- **Slow operations**: "This is taking longer than expected - please wait"
- **Cache corruption**: "Data may be outdated - refresh to reload"
- **Memory constraints**: "Browser memory low - some features may be slower"

### 7.2 Optimistic Update Rollback System

**Core Pattern for Hot Paths:**
All hot path operations (availability updates, team switching) use optimistic updates with automatic rollback on failure.

#### Availability Update Pattern
```javascript
// Example: Adding availability optimistically
const AvailabilityManager = {
    async toggleSlot(slot, action) {
        // 1. Capture current state for rollback
        const rollbackState = this.captureSlotState(slot);
        
        // 2. Apply optimistic update immediately
        this.updateUIOptimistically(slot, action);
        
        // 3. Attempt Firebase update
        try {
            await this.updateFirebase(slot, action);
            this.confirmOptimisticUpdate(slot);
        } catch (error) {
            // 4. Rollback on failure
            this.rollbackSlotState(slot, rollbackState);
            this.showError('Failed to update availability - changes reverted');
        }
    },
    
    captureSlotState(slot) {
        return {
            slot,
            previousPlayers: [...(availabilityGrid[slot] || [])],
            timestamp: Date.now()
        };
    },
    
    rollbackSlotState(slot, rollbackState) {
        availabilityGrid[slot] = rollbackState.previousPlayers;
        this.renderSlot(slot);
        
        // Visual feedback for rollback
        this.highlightSlotError(slot);
        setTimeout(() => this.clearSlotError(slot), 3000);
    }
};
```

#### Team Switching Rollback
```javascript
// Example: Team switching with rollback
const TeamSwitcher = {
    async switchTeam(newTeamId) {
        const rollbackState = {
            previousTeamId: StateService.getState('currentTeam'),
            previousTeamData: StateService.getState('teamData'),
            previousAvailability: StateService.getState('availabilityData')
        };
        
        // Optimistic switch
        this.updateUIForTeam(newTeamId);
        
        try {
            await this.loadTeamData(newTeamId);
            this.confirmTeamSwitch(newTeamId);
        } catch (error) {
            // Rollback to previous team
            this.rollbackToTeam(rollbackState);
            this.showError('Failed to switch teams - reverted to previous team');
        }
    }
};
```

### 7.3 Firebase v11 Connection Recovery

#### Network State Monitoring
```javascript
// Firebase v11 connection monitoring
import { 
    enableNetwork, 
    disableNetwork, 
    waitForPendingWrites,
    onSnapshotsInSync 
} from 'firebase/firestore';

const ConnectionManager = {
    isOnline: navigator.onLine,
    pendingWrites: 0,
    
    async init() {
        // Monitor browser connectivity
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Monitor Firebase sync status
        onSnapshotsInSync(db, () => {
            this.showSyncStatus('Synced with server');
            this.clearPendingIndicators();
        });
    },
    
    async handleOffline() {
        this.isOnline = false;
        await disableNetwork(db);
        this.showPersistentMessage('Working offline - changes will sync when reconnected', 'warning');
    },
    
    async handleOnline() {
        this.isOnline = true;
        try {
            await enableNetwork(db);
            await waitForPendingWrites(db);
            this.showSuccessMessage('Back online - all changes synced');
        } catch (error) {
            this.showError('Failed to reconnect - refresh page if problems persist');
        }
    }
};
```

#### Listener Recovery System
```javascript
// Automatic listener recovery
const ListenerManager = {
    activeListeners: new Map(),
    
    setupResilientListener(docRef, callback, componentName) {
        const listener = onSnapshot(
            docRef,
            { includeMetadataChanges: true },
            (doc) => {
                if (doc.metadata.fromCache && !doc.metadata.hasPendingWrites) {
                    this.showCacheWarning(componentName);
                }
                callback(doc);
            },
            (error) => {
                console.error(`${componentName} listener error:`, error);
                this.scheduleListenerRecovery(docRef, callback, componentName);
            }
        );
        
        this.activeListeners.set(componentName, listener);
        return listener;
    },
    
    scheduleListenerRecovery(docRef, callback, componentName) {
        setTimeout(() => {
            if (this.activeListeners.has(componentName)) {
                console.log(`Reconnecting ${componentName} listener`);
                this.setupResilientListener(docRef, callback, componentName);
            }
        }, 5000); // Retry after 5 seconds
    }
};
```

### 7.4 Gaming Community Feedback Patterns

#### Tournament Context Messages
```javascript
// Tournament deadline pressure messaging
const TournamentMessaging = {
    showDeadlineWarning(hoursRemaining) {
        if (hoursRemaining <= 24) {
            return this.showUrgentMessage(
                `Match deadline in ${hoursRemaining} hours! Schedule now to avoid forfeit.`,
                'destructive'
            );
        }
        if (hoursRemaining <= 72) {
            return this.showWarning(
                `Match deadline approaching (${hoursRemaining} hours). Coordinate with opponent soon.`
            );
        }
    },
    
    showSchedulingSuccess(opponentTeam, timeSlot) {
        return this.showSuccess(
            `Match scheduled with ${opponentTeam} for ${timeSlot}. Post in Discord to confirm!`
        );
    }
};
```

#### Discord Integration Feedback
```javascript
// Discord-specific user feedback
const DiscordFeedback = {
    showContactInstructions(leaderName) {
        return this.showInfo(
            `Contact ${leaderName} on Discord to confirm match time. Click to copy username.`
        );
    },
    
    showSharingSuccess(teamName) {
        return this.showSuccess(
            `Join code for ${teamName} copied! Share in Discord for teammates to join.`
        );
    }
};
```

### 7.5 Loading States (Hot vs Cold Paths)

#### Hot Path Loading (Minimal/None)
**Performance Requirement: < 50ms - No loading states needed**
```javascript
// Hot paths should never show loading
const HotPathOperations = {
    // ✅ No loading state - instant from cache
    switchTeam(teamId) {
        this.updateUIFromCache(teamId);
    },
    
    // ✅ Optimistic update - instant UI response
    toggleAvailability(slot) {
        this.updateUIOptimistically(slot);
        this.syncToFirebase(slot); // Background sync
    },
    
    // ✅ Pre-loaded data - instant navigation
    navigateWeek(offset) {
        this.renderWeekFromCache(offset);
    }
};
```

#### Cold Path Loading (Acceptable)
**Performance Requirement: < 2s - Loading states expected**
```javascript
// Cold paths can show loading states
const ColdPathOperations = {
    async createTeam(teamData) {
        // Show loading immediately
        this.showLoadingState('Creating team...', teamData.teamName);
        
        try {
            const result = await this.firebaseCreateTeam(teamData);
            this.showSuccessMessage(`Team "${teamData.teamName}" created!`);
            return result;
        } catch (error) {
            this.showError(`Failed to create team: ${error.message}`);
            throw error;
        } finally {
            this.hideLoadingState();
        }
    },
    
    async uploadLogo(file) {
        const progress = this.showProgressIndicator('Uploading logo...');
        
        try {
            await this.firebaseUploadLogo(file, (percent) => {
                progress.update(percent);
            });
            this.showSuccessMessage('Logo uploaded successfully!');
        } catch (error) {
            this.showError(`Logo upload failed: ${error.message}`);
        } finally {
            progress.hide();
        }
    }
};
```

### 7.6 Error Recovery Strategies

#### Automatic Recovery (Silent)
```javascript
const AutoRecovery = {
    // Retry failed operations with exponential backoff
    async retryOperation(operation, maxRetries = 3) {
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                return await operation();
            } catch (error) {
                retryCount++;
                if (retryCount >= maxRetries) throw error;
                
                // Exponential backoff: 1s, 2s, 4s
                await this.sleep(Math.pow(2, retryCount) * 1000);
            }
        }
    },
    
    // Recover from authentication errors
    async handleAuthError(error) {
        if (error.code === 'auth/token-expired') {
            try {
                await AuthService.refreshToken();
                return true; // Retry the operation
            } catch (refreshError) {
                this.showError('Session expired - please log in again');
                AuthService.logout();
                return false;
            }
        }
    }
};
```

#### User-Initiated Recovery
```javascript
const UserRecovery = {
    // Refresh button for stale data
    showRefreshOption(componentName) {
        return this.showActionMessage(
            `${componentName} data may be outdated`,
            'Refresh',
            () => this.refreshComponent(componentName)
        );
    },
    
    // Clear cache option for persistent problems
    showClearCacheOption() {
        return this.showActionMessage(
            'Having issues? Try clearing cached data',
            'Clear Cache',
            () => this.clearAllCache()
        );
    }
};
```

### 7.7 Toast Notification System

#### Gaming Community Toast Types
```javascript
const ToastSystem = {
    // Success messages (green) - Gaming context
    showSuccess(message, duration = 3000) {
        return this.show(message, 'success', duration);
    },
    
    // Warning messages (yellow) - Tournament deadlines
    showWarning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    },
    
    // Error messages (red) - Action failures
    showError(message, duration = 7000) {
        return this.show(message, 'error', duration);
    },
    
    // Info messages (blue) - Instructions
    showInfo(message, duration = 4000) {
        return this.show(message, 'info', duration);
    },
    
    // Persistent messages - Offline mode
    showPersistent(message, type = 'warning') {
        return this.show(message, type, 0); // 0 = no auto-dismiss
    }
};
```

### 7.8 Empty States (Gaming Community)

#### No Teams Joined
```html
<div class="empty-state">
    <h3>Ready to schedule some matches?</h3>
    <p>Join your team or create a new one to get started</p>
    <button class="btn btn-primary" onclick="showOnboardingModal()">
        Join or Create Team
    </button>
</div>
```

#### No Availability Set
```html
<div class="empty-state">
    <h3>Set your availability</h3>
    <p>Click time slots to show when you're available for matches</p>
    <p class="text-muted">Your teammates are counting on you!</p>
</div>
```

#### No Match Results
```html
<div class="empty-state">
    <h3>No matches found</h3>
    <p>Try adjusting your minimum player requirements or ask opponent teams to update their availability</p>
    <button class="btn btn-secondary" onclick="refreshComparison()">
        Refresh Comparison
    </button>
</div>
```

### 7.9 Accessibility & User Experience

#### Screen Reader Support
```javascript
// Announce important state changes
const A11yAnnouncer = {
    announceOptimisticUpdate(slot, action) {
        this.announce(`${action === 'add' ? 'Added to' : 'Removed from'} ${slot}`);
    },
    
    announceError(message) {
        this.announce(message, 'assertive'); // Interrupt current reading
    },
    
    announceSuccess(message) {
        this.announce(message, 'polite'); // Wait for current reading
    }
};
```

#### Keyboard Navigation
```javascript
// Error recovery via keyboard
const KeyboardRecovery = {
    handleKeyPress(event) {
        if (event.key === 'Escape') {
            this.clearAllErrors();
            this.focusMainContent();
        }
        
        if (event.ctrlKey && event.key === 'r') {
            event.preventDefault();
            this.refreshCurrentView();
        }
    }
};
```

### 7.10 Error Logging & Monitoring

#### Structured Error Logging
```javascript
const ErrorLogger = {
    logError(error, context) {
        const errorData = {
            message: error.message,
            stack: error.stack,
            context,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            userId: AuthService.getCurrentUserId(),
            teamId: StateService.getState('currentTeam')
        };
        
        // Log to console for development
        console.error('MatchScheduler Error:', errorData);
        
        // Send to monitoring service (post-MVP)
        if (window.Sentry) {
            window.Sentry.captureException(error, { extra: errorData });
        }
    }
};
```

#### Performance Monitoring
```javascript
const PerformanceMonitor = {
    measureOperation(operationName, operation) {
        const startTime = performance.now();
        
        return operation().finally(() => {
            const duration = performance.now() - startTime;
            
            // Log slow operations
            if (duration > 100) {
                console.warn(`Slow operation: ${operationName} took ${duration}ms`);
            }
            
            // Track performance metrics
            if (window.gtag) {
                window.gtag('event', 'timing_complete', {
                    name: operationName,
                    value: Math.round(duration)
                });
            }
        });
    }
};
```

### 7.11 Implementation Guidelines

#### Error Handling Priorities
1. **Hot paths**: Optimistic updates with silent rollback
2. **Cold paths**: Loading states with error recovery
3. **Network issues**: Automatic retry with user feedback
4. **Authentication**: Silent refresh with fallback to login
5. **Data conflicts**: User-guided resolution

#### Gaming Community Messaging
- **Use familiar gaming terms**: "Team", "Match", "Opponent", "Tournament"
- **Reference Discord workflows**: "Share in Discord", "Contact via Discord"
- **Acknowledge deadlines**: "Tournament deadline approaching"
- **Encourage team coordination**: "Your teammates are counting on you"

#### Testing Requirements
- **Offline functionality**: Disable network, verify graceful degradation
- **Connection recovery**: Simulate network interruption and restoration
- **Optimistic rollback**: Force Firebase failures, verify UI reverts
- **Error message clarity**: Test with non-technical gaming community users

**🔑 Success Metrics:** 
- **Hot paths feel instant** even with network issues
- **Users understand all error messages** in gaming context
- **Automatic recovery** handles 90% of connection problems
- **Manual recovery options** available for edge cases

---

## Implementation Notes for AI Development

### Architecture Philosophy (Based on Lessons Learned)
**Avoid the "Warehouse StateService" Pattern:**
- Previous v8 approach: 400+ line central StateService managing all data distribution
- New v11 approach: Each UI component subscribes directly to what it needs
- Event log listener only for coordination events, not data distribution
- **Result:** Simpler debugging, faster performance, less code

### Component Patterns
**Each Component Self-Contained:**
```javascript
// TeamInfo listens directly to what it needs
onSnapshot(doc(db, 'teams', teamId), (doc) => {
  TeamInfo.updateUI(doc.data()); // Direct, no middleware
});

// Event coordination (not data distribution)
onSnapshot(collection(db, 'eventLog'), (snapshot) => {
  EventHandler.route(event); // Simple routing to affected components
});
```

### Data Flow Strategy
1. **App Load:** Batch fetch all team basic info (instant browsing)
2. **Real-time:** Single event log listener (catches all system changes)  
3. **Availability:** Direct listeners only for teams user cares about
4. **No Complex State:** Components own their data, coordinate via events

### Performance Priorities
- **Hot Paths (< 50ms):** Availability updates, team switching, week navigation
- **Cold Paths (< 2s):** Team operations, profile updates, logo uploads
- **Caching:** Aggressive for browsing, selective for real-time data

---

*This PRD serves as the definitive specification for MatchScheduler v3.0, designed specifically for AI-driven development with Firebase v11 architecture.*