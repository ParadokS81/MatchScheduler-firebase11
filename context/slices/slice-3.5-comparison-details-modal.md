# Slice 3.5: Comparison Details Modal

## 1. Slice Definition

- **Slice ID:** 3.5
- **Name:** Comparison Details Modal
- **User Story:** As a team leader, I can click a matching time slot to see detailed opponent rosters and contact opposing leaders via Discord so that I can initiate match scheduling.
- **Success Criteria:**
  - User clicks a match slot in comparison mode → modal opens with detailed rosters
  - Modal shows user's team roster and all matching opponent teams
  - Leaders see opponent leader Discord contact info with functional contact button
  - Non-leaders see rosters but no contact information
  - Discord DM link opens Discord app/web when clicked

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.2.4: Comparison Modal - Click match slot shows detailed view with rosters and contact
- 4.2.6: Performance Requirements - Modal must open instantly (data already cached)

DEPENDENT SECTIONS:
- 4.3.5: Discord Contact System - DM link generation, leader-only visibility
- 1.4: Discord Integration - Username and user ID storage pattern

IGNORED SECTIONS:
- 4.3: Discord OAuth (future Slice 4.3) - Manual entry works for MVP
- Internal messaging system - Using Discord as communication channel
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- ComparisonModal (NEW)
  - Firebase listeners: none (snapshot at click time)
  - Cache interactions: reads from ComparisonEngine, TeamService, UserService
  - UI responsibilities:
    - Display user's team roster for the slot
    - Display all matching opponent teams with rosters
    - Show Discord contact button for leaders
    - Handle copy-to-clipboard for Discord username
  - User actions:
    - Click "Contact via Discord" → opens Discord DM link
    - Click "Copy Username" → copies to clipboard
    - Click backdrop/X/Close → closes modal

- AvailabilityGrid (MODIFY)
  - Add click handler for match cells in comparison mode
  - Distinguish between hover (tooltip) and click (modal)

FRONTEND SERVICES:
- UserService (MODIFY - add method)
  - getUserDiscordInfo(userId): Promise<{discordUsername, discordUserId} | null>
  - Method → Backend mapping: Direct Firestore read (no Cloud Function needed)

- ComparisonEngine (MODIFY - add leaderId)
  - getSlotMatches(weekId, slotId) - MODIFY to include leaderId in match objects
  - getUserTeamInfo(weekId, slotId) - MODIFY to include leaderId in return object
  - Current: returns { teamId, teamTag, teamName, availablePlayers, unavailablePlayers }
  - Needed: add `leaderId` field from team data

BACKEND REQUIREMENTS:
⚠️ NO NEW CLOUD FUNCTIONS NEEDED
- All data is read-only from existing documents
- Discord contact is client-side link generation
- No new Firestore writes

- Firestore Operations:
  - READ /users/{leaderId} - Get opponent leader's Discord info
  - Already permitted by existing security rules (users can read other profiles)

- Authentication/Authorization:
  - Current user must be authenticated
  - Leader contact button visibility: check if currentUser is leader of their team
  - No new permissions needed

- Event Logging:
  - None required for read-only modal

- External Services:
  - Discord deep link: discord://users/{discordUserId}
  - Fallback: https://discord.com/users/{discordUserId}

INTEGRATION POINTS:
- Frontend → Cache: ComparisonEngine provides roster data instantly
- Frontend → Firestore: Single read for leader Discord info (cold path)
- No real-time listeners needed (modal is snapshot view)
- Data flow: Click → Cache lookup → Optional leader fetch → Render modal
```

---

## 4. Integration Code Examples

### Click Handler in AvailabilityGrid

```javascript
// In AvailabilityGrid._clickHandler() - add comparison mode detection
function _clickHandler(event) {
    const cell = event.target.closest('.grid-cell');
    if (!cell) return;

    // NEW: Check if in comparison mode and clicking a match cell
    if (_isComparisonMode && cell.classList.contains('comparison-match')) {
        event.stopPropagation();
        const slotId = cell.dataset.slot;
        const weekId = cell.closest('.week-grid').dataset.weekId;
        ComparisonModal.show(weekId, slotId);
        return;
    }

    // Existing selection logic...
}
```

### ComparisonModal Component

```javascript
const ComparisonModal = (function() {
    'use strict';

    let _container = null;
    let _isOpen = false;
    let _keydownHandler = null;

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function show(weekId, slotId) {
        // 1. Get data from cache (instant)
        const userTeamInfo = ComparisonEngine.getUserTeamInfo(weekId, slotId);
        const matches = ComparisonEngine.getSlotMatches(weekId, slotId);

        if (!userTeamInfo || matches.length === 0) {
            console.warn('No match data available for slot');
            return;
        }

        // 2. Check if current user is a leader
        const currentUserId = AuthService.getCurrentUserId();
        const isLeader = userTeamInfo.userTeam.leaderId === currentUserId;

        // 3. Fetch leader Discord info if user is a leader (cold path)
        let leaderDiscordInfo = {};
        if (isLeader) {
            const leaderIds = matches.map(m => m.leaderId).filter(Boolean);
            leaderDiscordInfo = await _fetchLeaderDiscordInfo(leaderIds);
        }

        // 4. Render modal
        _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo);
    }

    async function _fetchLeaderDiscordInfo(leaderIds) {
        const info = {};
        await Promise.all(leaderIds.map(async (leaderId) => {
            const discordInfo = await UserService.getUserDiscordInfo(leaderId);
            if (discordInfo) {
                info[leaderId] = discordInfo;
            }
        }));
        return info;
    }

    function _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo) {
        // Format slot for display
        const [day, time] = slotId.split('_');
        const dayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
                          thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
        const formattedSlot = `${dayNames[day]} ${time.slice(0,2)}:${time.slice(2)}`;

        const html = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="comparison-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border shrink-0">
                        <div>
                            <h2 class="text-lg font-semibold text-foreground">Match Details</h2>
                            <p class="text-sm text-muted-foreground">${formattedSlot}</p>
                        </div>
                        <button id="comparison-modal-close"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4 overflow-y-auto flex-1">
                        <!-- Your Team -->
                        <div class="mb-6">
                            <h3 class="text-sm font-medium text-muted-foreground mb-2">Your Team</h3>
                            ${_renderTeamCard(userTeamInfo.userTeam, userTeamInfo.availablePlayers, userTeamInfo.unavailablePlayers, null, false)}
                        </div>

                        <!-- Opponent Teams -->
                        <div>
                            <h3 class="text-sm font-medium text-muted-foreground mb-2">
                                Matching Opponents (${matches.length})
                            </h3>
                            <div class="space-y-3">
                                ${matches.map(match => _renderTeamCard(
                                    match,
                                    match.availablePlayers,
                                    match.unavailablePlayers,
                                    isLeader ? leaderDiscordInfo[match.leaderId] : null,
                                    isLeader
                                )).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="p-4 border-t border-border shrink-0">
                        <button id="comparison-modal-done" class="btn btn-primary w-full">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (!_container) {
            _container = document.createElement('div');
            _container.id = 'comparison-modal-container';
            document.body.appendChild(_container);
        }

        _container.innerHTML = html;
        _attachListeners();
        _isOpen = true;
    }

    function _renderTeamCard(team, availablePlayers, unavailablePlayers, discordInfo, showContact) {
        const availableHtml = availablePlayers.map(p =>
            `<span class="inline-flex items-center gap-1 px-2 py-1 bg-success/20 text-success text-xs rounded">
                <span class="font-medium">${_escapeHtml(p.initials)}</span>
                <span class="text-success/70">${_escapeHtml(p.displayName)}</span>
            </span>`
        ).join('');

        const unavailableHtml = unavailablePlayers.map(p =>
            `<span class="inline-flex items-center gap-1 px-2 py-1 bg-muted/30 text-muted-foreground text-xs rounded">
                <span class="font-medium">${_escapeHtml(p.initials)}</span>
                <span>${_escapeHtml(p.displayName)}</span>
            </span>`
        ).join('');

        let contactHtml = '';
        if (showContact) {
            if (discordInfo && discordInfo.discordUserId) {
                contactHtml = `
                    <div class="mt-3 pt-3 border-t border-border">
                        <p class="text-xs text-muted-foreground mb-2">Team Leader Contact</p>
                        <div class="flex items-center gap-2">
                            <a href="discord://users/${discordInfo.discordUserId}"
                               target="_blank"
                               class="btn btn-sm bg-[#5865F2] hover:bg-[#4752C4] text-white">
                                <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                                </svg>
                                Open Discord DM
                            </a>
                            <button class="btn btn-sm btn-secondary copy-discord-btn"
                                    data-username="${_escapeHtml(discordInfo.discordUsername)}">
                                Copy @${_escapeHtml(discordInfo.discordUsername)}
                            </button>
                        </div>
                    </div>
                `;
            } else {
                contactHtml = `
                    <div class="mt-3 pt-3 border-t border-border">
                        <p class="text-xs text-muted-foreground">
                            Leader hasn't linked Discord account
                        </p>
                    </div>
                `;
            }
        }

        return `
            <div class="bg-muted/20 border border-border rounded-lg p-3">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-mono text-primary">[${_escapeHtml(team.teamTag)}]</span>
                        <span class="font-medium text-foreground">${_escapeHtml(team.teamName)}</span>
                    </div>
                    <span class="text-xs text-muted-foreground">
                        ${availablePlayers.length}/${availablePlayers.length + unavailablePlayers.length} available
                    </span>
                </div>

                <div class="space-y-2">
                    <div>
                        <p class="text-xs text-success mb-1">Available</p>
                        <div class="flex flex-wrap gap-1">
                            ${availableHtml || '<span class="text-xs text-muted-foreground">None</span>'}
                        </div>
                    </div>
                    ${unavailablePlayers.length > 0 ? `
                    <div>
                        <p class="text-xs text-muted-foreground mb-1">Unavailable</p>
                        <div class="flex flex-wrap gap-1">
                            ${unavailableHtml}
                        </div>
                    </div>
                    ` : ''}
                </div>

                ${contactHtml}
            </div>
        `;
    }

    function _attachListeners() {
        const backdrop = document.getElementById('comparison-modal-backdrop');
        const closeBtn = document.getElementById('comparison-modal-close');
        const doneBtn = document.getElementById('comparison-modal-done');

        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);
        doneBtn?.addEventListener('click', close);

        // Copy buttons
        document.querySelectorAll('.copy-discord-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const username = btn.dataset.username;
                try {
                    await navigator.clipboard.writeText(username);
                    btn.textContent = 'Copied!';
                    setTimeout(() => {
                        btn.textContent = `Copy @${username}`;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        });

        // ESC key to close
        _keydownHandler = (e) => {
            if (e.key === 'Escape' && _isOpen) close();
        };
        document.addEventListener('keydown', _keydownHandler);
    }

    function close() {
        if (_container) _container.innerHTML = '';
        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
        _isOpen = false;
    }

    function isOpen() { return _isOpen; }

    function cleanup() {
        close();
        if (_container) {
            _container.remove();
            _container = null;
        }
    }

    return { show, close, isOpen, cleanup };
})();
```

### ComparisonEngine Modification

```javascript
// In ComparisonEngine._calculateMatches(), line ~108, add leaderId:
_matches[fullSlotId].push({
    teamId: opponentId,
    teamTag: opponentTeam?.teamTag || '??',
    teamName: opponentTeam?.teamName || 'Unknown',
    leaderId: opponentTeam?.leaderId || null,  // ADD THIS LINE
    availablePlayers,
    unavailablePlayers
});

// In ComparisonEngine.getUserTeamInfo(), line ~254, add leaderId:
return {
    teamId: _userTeamId,
    teamTag: userTeam.teamTag || '??',
    teamName: userTeam.teamName || 'Your Team',
    leaderId: userTeam.leaderId || null,  // ADD THIS LINE
    availablePlayers,
    unavailablePlayers
};
```

### UserService Addition

```javascript
// Add to UserService
const UserService = {
    // ... existing methods ...

    /**
     * Get Discord info for a user (for leader contact)
     * @param {string} userId - The user ID
     * @returns {Promise<{discordUsername: string, discordUserId: string} | null>}
     */
    async getUserDiscordInfo(userId) {
        try {
            const { doc, getDoc } = await import('firebase/firestore');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', userId));

            if (!userDoc.exists()) return null;

            const data = userDoc.data();
            if (data.discordUsername && data.discordUserId) {
                return {
                    discordUsername: data.discordUsername,
                    discordUserId: data.discordUserId
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching user Discord info:', error);
            return null;
        }
    }
};
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Modal opening: All roster data from ComparisonEngine cache (instant)
- Modal rendering: Pure DOM generation, no async operations for non-leaders
- Close modal: Direct DOM manipulation

COLD PATHS (<2s):
- Leader Discord info fetch:
  - Triggered only when leader opens modal
  - Parallel fetch for all opponent leader userIds
  - ~100-300ms per user document (Firebase read)
  - Show modal immediately, load contact info async

BACKEND PERFORMANCE:
- No Cloud Functions involved (all client-side reads)
- Firestore reads have no cold start
- Single document reads are fast (~100ms)
```

---

## 6. Data Flow Diagram

```
NON-LEADER FLOW (instant):
Click Match Cell → ComparisonEngine.getSlotMatches() [cache] → Render Modal → Display

LEADER FLOW (with async contact):
Click Match Cell → ComparisonEngine.getSlotMatches() [cache] → Render Modal (no contact yet)
                                                                      ↓
                                              UserService.getUserDiscordInfo() [Firestore read]
                                                                      ↓
                                                             Update contact section

CONTACT BUTTON CLICK:
Click "Open Discord DM" → Browser opens discord://users/{id} → Discord app/web opens DM

COPY USERNAME:
Click "Copy" → navigator.clipboard.writeText() → Button shows "Copied!" → Reset after 2s
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] Click match cell in comparison mode opens modal
- [ ] Click non-match cell in comparison mode does NOT open modal (normal selection)
- [ ] Modal displays correct slot (day/time) in header
- [ ] User's team roster shows correct available/unavailable split
- [ ] All matching opponent teams are displayed
- [ ] ESC key closes modal
- [ ] Backdrop click closes modal
- [ ] Close button closes modal

LEADER-SPECIFIC TESTS:
- [ ] Leader sees "Team Leader Contact" section for each opponent
- [ ] Discord button shows when opponent leader has Discord linked
- [ ] Discord button opens discord://users/{id} link
- [ ] "Copy" button copies username to clipboard
- [ ] "Leader hasn't linked Discord" shows when no Discord info
- [ ] Non-leaders do NOT see any contact sections

BACKEND TESTS:
- [ ] UserService.getUserDiscordInfo returns correct data for linked user
- [ ] UserService.getUserDiscordInfo returns null for user without Discord
- [ ] UserService.getUserDiscordInfo handles non-existent user gracefully

INTEGRATION TESTS:
- [ ] Modal opens with cached data even when offline
- [ ] Discord info loads asynchronously without blocking modal
- [ ] Multiple opponent teams all fetch Discord info in parallel
- [ ] Copy to clipboard works across browsers

END-TO-END TESTS:
- [ ] Full flow: Leader clicks slot → sees opponents → clicks Discord → DM opens
- [ ] Full flow: Non-leader clicks slot → sees rosters → no contact options
- [ ] Performance: Modal opens in <50ms (cached path)
- [ ] Performance: Discord info appears within 500ms of modal open
```

---

## 8. Common Integration Pitfalls

- [ ] **Forgetting to check comparison mode** - Click handler must only trigger modal in comparison mode
- [ ] **Blocking modal on Discord fetch** - Must show modal immediately, load contact async
- [ ] **Not checking leader status correctly** - Use `team.leaderId === currentUserId`
- [ ] **Missing XSS protection** - All user data must be escaped before rendering
- [ ] **Discord link not working on mobile** - Test both `discord://` and fallback
- [ ] **Copy API not available** - navigator.clipboard requires HTTPS
- [ ] **Modal not closing properly** - Must remove keydown listener on close

---

## 9. Implementation Notes

### Files to Create
- `/public/js/components/ComparisonModal.js` - New modal component

### Files to Modify
- `/public/js/components/AvailabilityGrid.js` - Add click handler for match cells
- `/public/js/services/ComparisonEngine.js` - Add `leaderId` to match objects
- `/public/js/services/UserService.js` - Add `getUserDiscordInfo()` method
- `/public/index.html` - Add script tag for ComparisonModal.js

### Dependencies
- Requires Slice 3.4 (Comparison Engine) - already complete
- Uses OverflowModal as pattern reference
- Uses ComparisonEngine for roster data

### Gotchas
1. **Discord deep link behavior varies by platform:**
   - Desktop with Discord app: Opens app directly
   - Desktop without app: May show "Open Discord?" prompt or fail
   - Mobile: Usually works if Discord is installed
   - Consider adding fallback `https://discord.com/users/{id}` link

2. **ComparisonEngine MUST add leaderId:**
   - Current implementation returns `teamId`, `teamTag`, `teamName`
   - MUST add `leaderId: opponentTeam.leaderId` to each match object
   - Also add to getUserTeamInfo() return for the user's team

3. **Copy to clipboard requires user gesture:**
   - Must be triggered by click event
   - Won't work in async callbacks without gesture

---

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Discord username display is sufficient for MVP
- **Rationale**: Users can copy and paste into Discord search; full OAuth integration comes in Slice 4.3
- **Alternative**: Could add QR code or Discord invite link

- **[ASSUMPTION]**: No caching of leader Discord info
- **Rationale**: Leader info rarely changes; fresh read ensures accuracy; single read is fast enough
- **Alternative**: Could cache in UserService but adds complexity

- **[ASSUMPTION]**: Show "Leader hasn't linked Discord" rather than hiding contact section entirely
- **Rationale**: Transparency helps users understand why contact isn't available; may encourage linking
- **Alternative**: Could hide section completely for cleaner UI
