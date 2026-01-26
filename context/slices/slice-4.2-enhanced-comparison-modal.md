# Slice 4.2: Enhanced Comparison Modal with Logos

## 1. Slice Definition

- **Slice ID:** 4.2
- **Name:** Enhanced Comparison Modal with Logos
- **User Story:** As a team leader, I can view potential matches in a side-by-side "VS" layout with team logos and clear roster visualization so that I can quickly assess match viability and contact opponents.
- **Success Criteria:**
  - Modal displays side-by-side layout: user's team (left) VS opponent (right)
  - Team logos appear in both cards (medium size: 150px)
  - Roster uses green/grey dot system for available/unavailable players
  - Tab selector with small logos (48px) appears when multiple opponents match
  - Contact section displays for team leaders

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.2.4: Comparison Modal - Enhanced visual design for match details
- 4.3.2 (Logo Display): Logos shown in comparison view (medium/small sizes)

DEPENDENT SECTIONS:
- Slice 3.5: Existing ComparisonModal implementation (to be enhanced)
- Slice 4.1: Logo upload providing activeLogo.urls.medium and activeLogo.urls.small

IGNORED SECTIONS (for this slice):
- 4.3.2 (Logo Upload): Already implemented in Slice 4.1
- Discord OAuth: Uses existing discordUsername/discordUserId from schema
```

---

## 3. Visual Design Specification

### Main Modal Layout

```
+-------------------------------------------------------------+
| Match Details                                          [X]   |
| Monday 19:30                                                 |
+-------------------------------------------------------------+
|                                                              |
|   +-------------------+   VS   +-------------------+         |
|   |   [SR Logo]       |        |   [BB Logo]       |         |
|   |   150px circle    |        |   150px circle    |         |
|   |                   |        |                   |         |
|   |   Slackers        |        |   Black Book      |         |
|   |   3/5 available   |        |   2/3 available   |         |
|   +-------------------+        +-------------------+         |
|   | * ParadokS        |        | * Milton          |         |
|   | * zero            |        | * Diki            |         |
|   | * grisling        |        | o creature        |         |
|   | o phrenic         |        |                   |         |
|   | o macler          |        | [Contact Leader]  |         |
|   +-------------------+        +-------------------+         |
|                                                              |
|   Opponents: [BB] [SD] [WM]  <- tab buttons with small logos |
|                                                              |
|                      [ Close ]                               |
+-------------------------------------------------------------+

Legend:
  * = green dot (available)
  o = grey dot (unavailable)
```

### Design Tokens

| Element | Size | Color/Style |
|---------|------|-------------|
| Main logo | 150px (w-[9.375rem]) | Rounded, object-cover, border |
| Tab logo | 48px (w-12 h-12) | Rounded-full, object-cover |
| Available dot | 8px (w-2 h-2) | bg-success (--success variable) |
| Unavailable dot | 8px (w-2 h-2) | bg-muted-foreground opacity-50 |
| Available text | text-foreground | Normal weight |
| Unavailable text | text-muted-foreground | opacity-60 |
| VS divider | text-2xl | text-muted-foreground, font-bold |
| Tab active | - | border-primary, bg-primary/10 |
| Tab inactive | - | border-border, bg-muted/30 |

---

## 4. Full Stack Architecture

```
FRONTEND COMPONENTS:
- ComparisonModal (REWRITE)
  - Firebase listeners: None (snapshot at click time - existing pattern)
  - Cache interactions: Reads from ComparisonEngine, TeamService, UserService
  - UI responsibilities:
    - Render VS layout with two team cards
    - Display team logos (medium size) with fallback to team tag
    - Show roster with green/grey dot system
    - Tab selector for switching between opponents
    - Contact section for leaders
  - User actions:
    - Click opponent tab -> Switch displayed opponent
    - Click "Contact via Discord" -> Opens Discord DM link
    - Click "Copy Username" -> Copies to clipboard
    - Click backdrop/X/Close -> Closes modal

FRONTEND SERVICES:
- No new services needed
- Uses existing:
  - ComparisonEngine.getSlotMatches(weekId, slotId)
  - ComparisonEngine.getUserTeamInfo(weekId, slotId)
  - TeamService.getTeamFromCache(teamId) for logo URLs
  - AuthService.getCurrentUser() for leader check

BACKEND REQUIREMENTS:
NO NEW CLOUD FUNCTIONS NEEDED
- All data is read-only from existing documents
- Logo URLs already in team document (activeLogo.urls.medium, activeLogo.urls.small)
- Discord contact is client-side link generation (existing)

DATA DEPENDENCIES:
- Team document: { activeLogo: { urls: { medium, small } } }
- User document: { discordUsername, discordUserId }
- ComparisonEngine match data: { teamId, teamTag, teamName, leaderId, availablePlayers, unavailablePlayers }
```

---

## 5. Integration Code Examples

### Modal State Management

```javascript
// In ComparisonModal.js - add state for selected opponent
let _selectedOpponentIndex = 0;  // Track which opponent tab is selected

async function show(weekId, slotId) {
    // Reset to first opponent when opening
    _selectedOpponentIndex = 0;

    // ... existing data fetching logic ...

    _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo);
}
```

### VS Layout Structure

```javascript
function _renderVSLayout(userTeamInfo, selectedOpponent, isLeader, discordInfo) {
    return `
        <div class="vs-layout flex items-start justify-center gap-4 py-4">
            <!-- Left: User Team Card -->
            <div class="vs-team-card flex-1 max-w-[14rem]">
                ${_renderTeamCardEnhanced(userTeamInfo, true, null, false)}
            </div>

            <!-- VS Divider -->
            <div class="vs-divider flex items-center justify-center py-8">
                <span class="text-2xl font-bold text-muted-foreground">VS</span>
            </div>

            <!-- Right: Opponent Team Card -->
            <div class="vs-team-card flex-1 max-w-[14rem]">
                ${_renderTeamCardEnhanced(selectedOpponent, false, discordInfo, isLeader)}
            </div>
        </div>
    `;
}
```

### Enhanced Team Card with Logo

```javascript
function _renderTeamCardEnhanced(teamInfo, isUserTeam, discordInfo, showContact) {
    // Get logo URL from TeamService cache
    const teamData = TeamService.getTeamFromCache(teamInfo.teamId);
    const logoUrl = teamData?.activeLogo?.urls?.medium;

    // Logo or fallback
    const logoHtml = logoUrl
        ? `<img src="${_escapeHtml(logoUrl)}" alt="${_escapeHtml(teamInfo.teamTag)}"
             class="w-[9.375rem] h-[9.375rem] rounded-lg object-cover border border-border">`
        : `<div class="w-[9.375rem] h-[9.375rem] rounded-lg bg-muted border border-border
             flex items-center justify-center">
             <span class="text-3xl font-bold text-muted-foreground">
               ${_escapeHtml(teamInfo.teamTag)}
             </span>
           </div>`;

    // Roster with dots
    const rosterHtml = _renderRosterWithDots(
        teamInfo.availablePlayers,
        teamInfo.unavailablePlayers
    );

    return `
        <div class="team-card-enhanced bg-card border border-border rounded-lg p-4 text-center">
            <!-- Logo -->
            <div class="flex justify-center mb-3">
                ${logoHtml}
            </div>

            <!-- Team Name -->
            <h3 class="font-semibold text-foreground mb-1">
                ${_escapeHtml(teamInfo.teamName)}
            </h3>

            <!-- Availability Count -->
            <p class="text-sm text-muted-foreground mb-3">
                ${teamInfo.availablePlayers.length}/${teamInfo.availablePlayers.length + teamInfo.unavailablePlayers.length} available
            </p>

            <!-- Roster -->
            <div class="roster-list text-left space-y-1">
                ${rosterHtml}
            </div>

            <!-- Contact Section (opponent only, if leader) -->
            ${!isUserTeam && showContact ? _renderContactSection(discordInfo) : ''}
        </div>
    `;
}
```

### Roster with Green/Grey Dots

```javascript
function _renderRosterWithDots(availablePlayers, unavailablePlayers) {
    const availableHtml = availablePlayers.map(p => `
        <div class="roster-player flex items-center gap-2 py-0.5">
            <span class="player-dot w-2 h-2 rounded-full bg-success flex-shrink-0"></span>
            <span class="text-sm text-foreground">${_escapeHtml(p.displayName || p.initials)}</span>
        </div>
    `).join('');

    const unavailableHtml = unavailablePlayers.map(p => `
        <div class="roster-player flex items-center gap-2 py-0.5">
            <span class="player-dot w-2 h-2 rounded-full bg-muted-foreground/50 flex-shrink-0"></span>
            <span class="text-sm text-muted-foreground/60">${_escapeHtml(p.displayName || p.initials)}</span>
        </div>
    `).join('');

    return availableHtml + unavailableHtml;
}
```

### Tab Selector with Small Logos

```javascript
function _renderOpponentTabs(matches) {
    if (matches.length <= 1) return '';

    return `
        <div class="opponent-tabs flex items-center justify-center gap-2 mt-4 pt-4 border-t border-border">
            <span class="text-xs text-muted-foreground mr-2">Opponents:</span>
            ${matches.map((match, index) => {
                const teamData = TeamService.getTeamFromCache(match.teamId);
                const smallLogoUrl = teamData?.activeLogo?.urls?.small;
                const isActive = index === _selectedOpponentIndex;

                return `
                    <button class="opponent-tab flex items-center gap-1.5 px-2 py-1 rounded-lg
                                   border transition-colors
                                   ${isActive
                                     ? 'border-primary bg-primary/10'
                                     : 'border-border bg-muted/30 hover:bg-muted/50'}"
                            data-opponent-index="${index}">
                        ${smallLogoUrl
                          ? `<img src="${_escapeHtml(smallLogoUrl)}"
                                 class="w-6 h-6 rounded-full object-cover">`
                          : `<span class="w-6 h-6 rounded-full bg-secondary flex items-center
                                   justify-center text-xs font-bold">
                               ${_escapeHtml(match.teamTag.substring(0, 2))}
                             </span>`}
                        <span class="text-xs font-medium ${isActive ? 'text-primary' : 'text-foreground'}">
                            ${_escapeHtml(match.teamTag)}
                        </span>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}
```

### Tab Click Handler

```javascript
function _attachListeners() {
    // ... existing listeners ...

    // Tab switching
    document.querySelectorAll('.opponent-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const index = parseInt(tab.dataset.opponentIndex, 10);
            if (!isNaN(index)) {
                _selectedOpponentIndex = index;
                // Re-render with new selection
                // Note: This requires storing current modal data to re-render
                _updateOpponentDisplay();
            }
        });
    });
}

// Store modal data for re-rendering
let _currentModalData = null;

function _updateOpponentDisplay() {
    if (!_currentModalData) return;

    const { weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo } = _currentModalData;
    _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo);
}
```

### Contact Section (Enhanced)

```javascript
function _renderContactSection(discordInfo) {
    if (!discordInfo || !discordInfo.discordUsername) {
        return `
            <div class="contact-section mt-4 pt-3 border-t border-border">
                <p class="text-xs text-muted-foreground text-center">
                    Leader hasn't linked Discord
                </p>
            </div>
        `;
    }

    const discordIcon = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515..."/>
    </svg>`;

    return `
        <div class="contact-section mt-4 pt-3 border-t border-border">
            <p class="text-xs text-muted-foreground text-center mb-2">Contact Leader</p>
            <div class="flex flex-col gap-2">
                ${discordInfo.discordUserId ? `
                    <a href="discord://users/${discordInfo.discordUserId}"
                       class="btn btn-sm bg-[#5865F2] hover:bg-[#4752C4] text-white w-full justify-center">
                        ${discordIcon}
                        <span class="ml-1">Open Discord DM</span>
                    </a>
                ` : ''}
                <button class="btn btn-sm btn-secondary w-full justify-center copy-discord-btn"
                        data-username="${_escapeHtml(discordInfo.discordUsername)}">
                    Copy @${_escapeHtml(discordInfo.discordUsername)}
                </button>
            </div>
        </div>
    `;
}
```

---

## 6. CSS Additions

Add to `src/css/input.css`:

```css
/* ========================================
   SLICE 4.2: ENHANCED COMPARISON MODAL
   ======================================== */

/* VS Layout */
.vs-layout {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 1rem;
  padding: 1rem 0;
}

.vs-team-card {
  flex: 1;
  max-width: 14rem;
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
  align-self: center;
}

/* Team Card Enhanced */
.team-card-enhanced {
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  text-align: center;
}

/* Roster with dots */
.roster-player {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.125rem 0;
}

.player-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.player-dot.available {
  background-color: var(--success);
}

.player-dot.unavailable {
  background-color: var(--muted-foreground);
  opacity: 0.5;
}

/* Opponent Tab Selector */
.opponent-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.opponent-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background-color: oklch(from var(--muted) l c h / 0.3);
  transition: all 150ms ease;
  cursor: pointer;
}

.opponent-tab:hover {
  background-color: oklch(from var(--muted) l c h / 0.5);
}

.opponent-tab.active {
  border-color: var(--primary);
  background-color: oklch(from var(--primary) l c h / 0.1);
}

/* Contact Section */
.contact-section {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

/* Modal responsive adjustments */
@media (max-width: 640px) {
  .vs-layout {
    flex-direction: column;
    gap: 0.5rem;
  }

  .vs-team-card {
    max-width: 100%;
    width: 100%;
  }

  .vs-divider {
    padding: 0.5rem 0;
  }

  .opponent-tabs {
    flex-wrap: wrap;
  }
}
```

---

## 7. Performance Classification

```
HOT PATHS (<50ms):
- Modal opening: All roster data from ComparisonEngine cache (instant)
- Logo URLs from TeamService cache (instant, already loaded)
- Tab switching: Pure DOM update, no async operations
- Modal rendering: Pure DOM generation

COLD PATHS (<2s):
- Leader Discord info fetch:
  - Triggered only when leader opens modal
  - Parallel fetch for all opponent leader userIds
  - ~100-300ms per user document (Firebase read)
  - Show modal immediately, load contact info async

PERFORMANCE NOTES:
- Logo URLs are pre-loaded in team documents (no additional fetches)
- TeamService.getTeamFromCache() is synchronous
- Tab switching requires no network calls
```

---

## 8. Data Flow Diagram

```
USER CLICKS MATCH CELL
         |
         v
+------------------+
| ComparisonEngine |  (Cache - synchronous)
| .getSlotMatches  |
| .getUserTeamInfo |
+------------------+
         |
         v
+------------------+
| TeamService      |  (Cache - synchronous)
| .getTeamFromCache| --> activeLogo.urls.medium
|                  | --> activeLogo.urls.small
+------------------+
         |
         v
+------------------+
| Render Modal     |  (Instant)
| - VS layout      |
| - Logos or tags  |
| - Dot roster     |
| - Tabs if >1     |
+------------------+
         |
         v (async, leader only)
+------------------+
| UserService      |  (Firestore read)
| .getUserDiscord  |
+------------------+
         |
         v
+------------------+
| Update Contact   |  (Re-render section)
| Section          |
+------------------+

TAB CLICK FLOW:
Tab Click --> _selectedOpponentIndex update --> Re-render with new opponent
(No network calls - all data already cached)
```

---

## 9. Test Scenarios

```
FRONTEND TESTS:
- [ ] Modal opens with VS layout (user team left, opponent right)
- [ ] User team logo displays (medium size) when available
- [ ] User team tag displays as fallback when no logo
- [ ] Opponent team logo displays (medium size) when available
- [ ] Opponent team tag displays as fallback when no logo
- [ ] Available players show green dot + white text
- [ ] Unavailable players show grey dot + grey text
- [ ] Tab selector appears when multiple opponents match
- [ ] Tab selector hidden when only one opponent
- [ ] Tab logos display (small size) when available
- [ ] Tab falls back to initials when no logo
- [ ] Clicking tab switches displayed opponent
- [ ] VS divider displays centered between cards
- [ ] ESC key closes modal
- [ ] Backdrop click closes modal
- [ ] Close button closes modal

LEADER-SPECIFIC TESTS:
- [ ] Leader sees contact section on opponent card
- [ ] Discord button shows when opponent leader has Discord linked
- [ ] Discord button opens discord://users/{id} link
- [ ] "Copy" button copies username to clipboard
- [ ] "Leader hasn't linked Discord" shows when no Discord info
- [ ] Non-leaders do NOT see contact section

RESPONSIVE TESTS:
- [ ] Modal stacks vertically on mobile (<640px)
- [ ] VS divider repositions between stacked cards
- [ ] Tab selector wraps on narrow screens
- [ ] Touch targets are adequately sized on mobile

EDGE CASES:
- [ ] Single opponent - no tab selector, opponent displays directly
- [ ] Team with no logo - shows team tag fallback
- [ ] Team with very long name - truncates gracefully
- [ ] Team with 0 unavailable players - no grey section
- [ ] Team with 0 available players - shows "None available"
- [ ] 5+ opponents - tab selector scrolls or wraps
```

---

## 10. Common Integration Pitfalls

- [ ] **Forgetting to call TeamService.getTeamFromCache()** for logo URLs - logos won't appear
- [ ] **Using large logo URL instead of medium** - incorrect sizing
- [ ] **Not handling missing activeLogo field** - will throw if not checked
- [ ] **Tab click not updating state** - need to store and re-render
- [ ] **Re-rendering entire modal on tab switch** - could lose scroll position
- [ ] **Missing XSS escaping on logo URLs** - security vulnerability
- [ ] **Logo images not loading** - need proper error handling and fallback
- [ ] **Contact section visible to non-leaders** - must check isLeader
- [ ] **Tab order not matching matches array order** - confusing UX

---

## 11. Files to Modify

### Files to REWRITE
- `/public/js/components/ComparisonModal.js` - Complete rewrite with VS layout

### Files to MODIFY
- `/src/css/input.css` - Add CSS for VS layout and enhanced styling

### Files UNCHANGED
- `/public/js/services/ComparisonEngine.js` - Already provides needed data with leaderId
- `/public/js/services/TeamService.js` - Already caches team data with activeLogo
- `/public/index.html` - ComparisonModal.js already included

---

## 12. Implementation Notes

### Dependencies
- **Slice 4.1 (Logo Upload)** must be complete - provides activeLogo.urls structure
- **Slice 3.5 (Comparison Modal)** provides base implementation to enhance
- TeamService must have teams loaded with activeLogo field

### Existing Pattern Preservation
- Keep existing `show(weekId, slotId)` API signature
- Keep existing close/ESC/backdrop behavior
- Keep existing Discord contact functionality
- Keep existing async Discord info fetch pattern

### Gotchas
1. **Logo URL caching**: TeamService already caches team data including activeLogo - no need for separate logo service
2. **Tab state persistence**: Store `_selectedOpponentIndex` to maintain selection during re-renders
3. **Modal data storage**: Store current modal data to enable tab switching without re-fetching
4. **Responsive breakpoint**: Use 640px (sm) for mobile stack layout, consistent with Tailwind

### Size Reference
- Medium logo: 150px = 9.375rem (w-[9.375rem])
- Small logo: 48px = 3rem (w-12 h-12)
- Dot size: 8px = 0.5rem (w-2 h-2)

---

## 13. Pragmatic Assumptions

- **[ASSUMPTION]**: Teams without logos are common initially
- **Rationale**: Logo upload is new; fallback to team tag must look good
- **Alternative**: Could show placeholder image instead of tag

- **[ASSUMPTION]**: Most match scenarios have 1-3 opponents
- **Rationale**: Tab selector designed for this range; scrolling handles more
- **Alternative**: Could add "View All" modal for 5+ opponents

- **[ASSUMPTION]**: Leader contact is primary use case for modal
- **Rationale**: Players just need to see roster; leaders need to initiate scheduling
- **Alternative**: Could add "Share with Team" functionality

---

## Quality Checklist

- [x] Frontend AND backend requirements specified (frontend only - read-only feature)
- [x] All PRD requirements mapped (enhanced modal, logo display)
- [x] Architecture follows cache + listener pattern (uses ComparisonEngine cache)
- [x] Hot/cold paths identified (all hot except Discord fetch)
- [x] Test scenarios cover full stack
- [x] No anti-patterns present
- [x] Data flow complete (Cache -> Render -> Tab Switch -> Re-render)
- [x] Integration examples show actual code
- [x] Error handling specified (logo fallback, missing Discord)
- [x] Loading states defined (async Discord fetch)
- [x] CSS uses rem units (except borders per CLAUDE.md)
- [x] Security considerations (XSS escaping)
