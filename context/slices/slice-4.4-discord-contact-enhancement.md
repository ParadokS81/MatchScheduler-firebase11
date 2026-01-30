# Slice 4.4: Discord Contact Enhancement

## 1. Slice Definition

- **Slice ID:** 4.4
- **Name:** Discord Contact Enhancement
- **User Story:** As a team leader, when I find a matching time slot with an opponent, I can click "Contact on Discord" to automatically copy a pre-formatted match request message to my clipboard AND open the Discord DM, so I can quickly paste the relevant match details and add a personal note.
- **Success Criteria:**
  - Leader clicks contact button → message copied to clipboard + Discord DM opens
  - Message includes: selected timeslot (marked as priority), other matching slots with player counts
  - Toast notification confirms "Message copied! Paste in Discord"
  - User can immediately paste in Discord and optionally add personal message
  - Works when opponent leader has Discord linked; shows appropriate fallback when not

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.2.4: Comparison Modal - Click match slot shows detailed view with contact option
- 4.3.5: Discord Contact System - Contact flow, DM link generation, leader-only visibility

DEPENDENT SECTIONS:
- 4.3.1-4.3.3: Discord OAuth (COMPLETE) - Provides discordUserId and discordUsername
- 3.5: Comparison Details Modal (COMPLETE) - Base contact UI exists

IGNORED SECTIONS:
- Internal messaging system - Using Discord as communication channel (per PRD)
- QR codes or Discord invite links - Keeping it simple
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:
- ComparisonModal (MODIFY)
  - Firebase listeners: none (snapshot at click time - unchanged)
  - Cache interactions: reads from ComparisonEngine (unchanged)
  - UI responsibilities:
    - EXISTING: Display rosters, VS layout, opponent tabs
    - NEW: Show contact section with message preview
    - NEW: "Contact on Discord" button that copies message + opens DM
    - NEW: Toast notification on copy
  - User actions:
    - Click "Contact on Discord" → copy message + open discord://users/{id}
    - Fallback "Copy Message" button if user prefers manual approach

FRONTEND SERVICES:
- ComparisonEngine (READ ONLY - no changes)
  - getSlotMatches(weekId, slotId) - Get matches for clicked slot
  - getComparisonState() - Get ALL matches for message generation
  - getUserTeamInfo(weekId, slotId) - Get user team roster info

- ToastService (USE EXISTING)
  - showSuccess(message) - "Message copied! Paste in Discord"

BACKEND REQUIREMENTS:
⚠️ NO NEW CLOUD FUNCTIONS NEEDED
- All data is read-only from existing documents
- Discord contact is client-side link generation
- Message generation is purely frontend
- No new Firestore writes

- Firestore Operations:
  - READ /users/{leaderId} - Get opponent leader's Discord info (EXISTING)
  - Already permitted by existing security rules

- Authentication/Authorization:
  - Contact button visibility: currentUser must be leader of their team (EXISTING)
  - No new permissions needed

- Event Logging:
  - None required for read-only feature

- External Services:
  - Discord deep link: discord://-/users/{discordUserId}
  - Clipboard API: navigator.clipboard.writeText()

INTEGRATION POINTS:
- Frontend → Cache: ComparisonEngine provides all match data (instant)
- Frontend → Clipboard API: Copy generated message
- Frontend → Discord: Open DM via deep link
- Frontend → Toast: Show success notification
- No real-time listeners needed (modal is snapshot view)
```

---

## 4. Integration Code Examples

### Message Generation Function

```javascript
/**
 * Generate a formatted match request message
 * @param {string} selectedSlotId - The slot user clicked (e.g., 'mon_1900')
 * @param {string} selectedWeekId - The week of the clicked slot
 * @param {Object} userTeamInfo - User's team info from ComparisonEngine
 * @param {Object} selectedMatch - The opponent team being contacted
 * @returns {string} Formatted message ready to paste
 */
function _generateContactMessage(selectedSlotId, selectedWeekId, userTeamInfo, selectedMatch) {
    const comparisonState = ComparisonEngine.getComparisonState();
    const allMatches = comparisonState.matches;

    // Find all slots where this specific opponent matches
    const opponentSlots = [];
    for (const [fullSlotId, matches] of Object.entries(allMatches)) {
        const opponentMatch = matches.find(m => m.teamId === selectedMatch.teamId);
        if (opponentMatch) {
            const [weekId, ...slotParts] = fullSlotId.split('_');
            const slotId = slotParts.join('_'); // Handle 'mon_1900' format

            // Get user team count for this slot
            const userInfo = ComparisonEngine.getUserTeamInfo(weekId, slotId);
            const userCount = userInfo?.availablePlayers?.length || 0;
            const opponentCount = opponentMatch.availablePlayers.length;

            opponentSlots.push({
                weekId,
                slotId,
                fullSlotId,
                userCount,
                opponentCount,
                isPriority: slotId === selectedSlotId && weekId === selectedWeekId
            });
        }
    }

    // Sort: priority first, then by player count (highest first)
    opponentSlots.sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        const aTotal = a.userCount + a.opponentCount;
        const bTotal = b.userCount + b.opponentCount;
        return bTotal - aTotal;
    });

    // Format the message
    const lines = [
        `Match request: [${userTeamInfo.teamTag}] vs [${selectedMatch.teamTag}]`,
        ''
    ];

    opponentSlots.forEach((slot, index) => {
        const formatted = _formatSlotForMessage(slot.slotId);
        const marker = slot.isPriority ? '> ' : '  ';
        const counts = `${slot.userCount}v${slot.opponentCount}`;
        lines.push(`${marker}${formatted} (${counts})`);
    });

    lines.push('');
    lines.push('Let me know what works!');

    return lines.join('\n');
}

/**
 * Format slot ID for message (e.g., "mon_1900" → "Mon 19:00")
 */
function _formatSlotForMessage(slotId) {
    const [day, time] = slotId.split('_');
    const dayNames = {
        mon: 'Mon', tue: 'Tue', wed: 'Wed',
        thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
    };
    const formattedDay = dayNames[day] || day;
    const formattedTime = `${time.slice(0, 2)}:${time.slice(2)}`;
    return `${formattedDay} ${formattedTime}`;
}
```

### Enhanced Contact Section Rendering

```javascript
/**
 * Render contact section with message preview and combined action button
 */
function _renderContactSection(discordInfo, selectedSlotId, selectedWeekId, userTeamInfo, selectedMatch) {
    if (!discordInfo || !discordInfo.discordUsername) {
        return `
            <div class="mt-3 pt-3 border-t border-border">
                <p class="text-xs text-muted-foreground">Leader hasn't linked Discord</p>
            </div>
        `;
    }

    // Generate message for preview
    const message = _generateContactMessage(selectedSlotId, selectedWeekId, userTeamInfo, selectedMatch);

    // Store message in data attribute for click handler
    const escapedMessage = _escapeHtml(message).replace(/\n/g, '&#10;');

    const discordIcon = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>`;

    return `
        <div class="mt-3 pt-3 border-t border-border">
            <p class="text-xs text-muted-foreground mb-2">Contact Leader</p>

            <!-- Message Preview -->
            <div class="bg-muted/30 rounded p-2 mb-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto">
${_escapeHtml(message)}
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center gap-2 flex-wrap">
                ${discordInfo.discordUserId ? `
                    <button class="btn btn-sm bg-[#5865F2] hover:bg-[#4752C4] text-white contact-discord-btn"
                            data-discord-id="${discordInfo.discordUserId}"
                            data-message="${escapedMessage}">
                        ${discordIcon}
                        <span class="ml-1">Contact on Discord</span>
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-secondary copy-message-btn"
                        data-message="${escapedMessage}">
                    Copy Message Only
                </button>
            </div>
        </div>
    `;
}
```

### Event Handler for Contact Button

```javascript
/**
 * Attach listeners including new contact button
 */
function _attachListeners() {
    // ... existing listeners ...

    // Contact on Discord button (copy + open DM)
    document.querySelectorAll('.contact-discord-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const discordId = btn.dataset.discordId;
            const message = btn.dataset.message.replace(/&#10;/g, '\n');

            try {
                // 1. Copy message to clipboard
                await navigator.clipboard.writeText(message);

                // 2. Show success toast
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('Message copied! Paste in Discord');
                }

                // 3. Open Discord DM (slight delay to ensure toast shows)
                setTimeout(() => {
                    window.open(`discord://-/users/${discordId}`, '_blank');
                }, 100);

            } catch (err) {
                console.error('Failed to copy message:', err);
                // Fallback: just open Discord
                window.open(`discord://-/users/${discordId}`, '_blank');
                if (typeof ToastService !== 'undefined') {
                    ToastService.showInfo('Opening Discord... (copy failed)');
                }
            }
        });
    });

    // Copy message only button (existing pattern)
    document.querySelectorAll('.copy-message-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const message = btn.dataset.message.replace(/&#10;/g, '\n');
            try {
                await navigator.clipboard.writeText(message);
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('Message copied to clipboard!');
                }
                // Visual feedback on button
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg><span class="ml-1">Copied!</span>`;
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        });
    });

    // ... rest of existing listeners ...
}
```

### Updated _renderTeamCard Call

```javascript
// In _renderModal(), pass additional parameters for contact section
function _renderTeamCard(teamId, teamTag, teamName, availablePlayers, unavailablePlayers,
                         isUserTeam, discordInfo, showContact,
                         selectedSlotId, selectedWeekId, userTeamInfo, matchData) {

    // Generate contact section with full context
    const contactSection = (!isUserTeam && showContact)
        ? _renderContactSection(discordInfo, selectedSlotId, selectedWeekId, userTeamInfo, matchData)
        : '';

    // ... rest of team card rendering unchanged ...
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Modal opening: All roster data from ComparisonEngine cache (instant) - UNCHANGED
- Message generation: Pure string manipulation from cached data (~1ms)
- Copy to clipboard: Browser API (~5ms)
- Button rendering: Pure DOM generation

COLD PATHS (<2s):
- Discord app opening: External app launch, out of our control
- Leader Discord info fetch: ~100-300ms (already fetched async, won't block)

BACKEND PERFORMANCE:
- No Cloud Functions involved (all client-side)
- No new Firestore reads (Discord info already fetched in existing flow)
- Zero database load from this feature
```

---

## 6. Data Flow Diagram

```
CONTACT BUTTON CLICK FLOW:
User clicks "Contact on Discord"
         ↓
_generateContactMessage()
         ↓
ComparisonEngine.getComparisonState() ← [All cached matches]
         ↓
Build message string with all matching slots
         ↓
navigator.clipboard.writeText(message)
         ↓
ToastService.showSuccess("Message copied!")
         ↓
window.open(discord://-/users/{id})
         ↓
Discord app opens with DM → User pastes message


DATA SOURCES (all from cache):
┌─────────────────────────────────────────────────────────────┐
│ ComparisonEngine._matches                                   │
│   → All slot matches with opponent info                     │
│                                                             │
│ ComparisonEngine.getUserTeamInfo()                          │
│   → User team tag, name, roster counts                      │
│                                                             │
│ _currentData.leaderDiscordInfo                              │
│   → Already fetched in modal show() - discordUserId         │
└─────────────────────────────────────────────────────────────┘


MESSAGE OUTPUT EXAMPLE:
┌─────────────────────────────────────────────────────────────┐
│ Match request: [QW] vs [ABC]                                │
│                                                             │
│ > Mon 19:00 (4v4)    ← selected slot marked with >          │
│   Tue 20:00 (3v4)                                           │
│   Thu 21:00 (4v3)                                           │
│                                                             │
│ Let me know what works!                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] Message generation includes selected slot marked with ">"
- [ ] Message includes all matching slots for that specific opponent
- [ ] Slots are sorted: priority first, then by total player count
- [ ] Message format is clean and readable
- [ ] Contact section shows message preview
- [ ] "Contact on Discord" button visible when discordUserId exists
- [ ] "Copy Message Only" button always visible as fallback
- [ ] Escaped HTML in message doesn't break rendering

CLIPBOARD TESTS:
- [ ] Clicking "Contact on Discord" copies message to clipboard
- [ ] Clicking "Copy Message Only" copies message to clipboard
- [ ] Newlines in message are preserved when pasted
- [ ] Special characters (brackets, colons) don't break copy

DISCORD INTEGRATION TESTS:
- [ ] Discord deep link uses correct format: discord://-/users/{id}
- [ ] Link opens Discord app on desktop (if installed)
- [ ] Link opens Discord web if app not installed
- [ ] Small delay between copy and open allows toast to show

TOAST NOTIFICATION TESTS:
- [ ] "Message copied! Paste in Discord" shows on contact button click
- [ ] "Message copied to clipboard!" shows on copy-only button click
- [ ] Toast appears even when Discord link fails to open
- [ ] Fallback toast shows if clipboard copy fails

EDGE CASE TESTS:
- [ ] Works with single matching slot (no "other slots" section)
- [ ] Works with many matching slots (message doesn't get too long)
- [ ] Handles opponents with only username (no discordUserId)
- [ ] Non-leaders don't see contact section (existing behavior)

INTEGRATION TESTS:
- [ ] Full flow: Click match → modal opens → click contact → message copied → Discord opens
- [ ] Message contains correct team tags for both teams
- [ ] Player counts in message match what's shown in modal
- [ ] Switching opponent tabs regenerates message for new opponent

END-TO-END TESTS:
- [ ] Leader finds match → contacts opponent → pastes in Discord → message is useful
- [ ] Message can be pasted and read clearly in Discord
- [ ] User can add personal note after pasting
- [ ] Works on Chrome, Firefox, Safari, Edge
```

---

## 8. Common Integration Pitfalls

- [ ] **Forgetting to pass slot context to contact section** - Need selectedSlotId and selectedWeekId for message generation
- [ ] **Not escaping newlines in data attributes** - Use `&#10;` for newlines in HTML attributes
- [ ] **Clipboard API requires HTTPS** - Works in dev (localhost) but ensure production is HTTPS
- [ ] **Clipboard API requires user gesture** - Must be triggered by click, not async callback
- [ ] **Not handling clipboard failure gracefully** - Some browsers restrict clipboard access
- [ ] **Message too long** - If many matching slots, could overflow Discord message limit (2000 chars)
- [ ] **Forgetting to update message when switching opponent tabs** - Re-render must regenerate message
- [ ] **Deep link format wrong** - Use `discord://-/users/{id}` NOT `discord://users/{id}`

---

## 9. Implementation Notes

### Files to Modify
- `/public/js/components/ComparisonModal.js` - Main changes:
  - Add `_generateContactMessage()` function
  - Add `_formatSlotForMessage()` helper
  - Modify `_renderContactSection()` to include message preview
  - Update `_attachListeners()` with new button handlers
  - Pass additional context through `_renderTeamCard()` and `_renderModal()`

### Files Unchanged
- `/public/js/services/ComparisonEngine.js` - Already provides all needed data
- `/public/js/services/ToastService.js` - Already has showSuccess/showInfo
- `/public/index.html` - No new scripts needed
- `/functions/*.js` - No backend changes

### Dependencies
- Requires Slice 4.3.x complete (Discord OAuth) - DONE
- Requires Slice 4.2 (Enhanced Comparison Modal) - DONE
- Uses existing ToastService - available

### Gotchas
1. **Clipboard API is async** - Must use await and handle promise rejection
2. **Discord link timing** - Add small delay before opening to ensure toast shows
3. **Data attribute encoding** - Newlines must be `&#10;`, not literal `\n`
4. **Message preview overflow** - Use `max-h-24 overflow-y-auto` to contain long messages
5. **Tab switching** - When user switches opponent tabs, contact section must regenerate with new opponent's matching slots

### Message Length Consideration
Discord has a 2000 character limit. With typical slot format (~25 chars per slot), we can fit ~60 slots before truncation. This is unlikely to be an issue given our 4-week window and typical match patterns.

---

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Show all matching slots in message, not just current week
- **Rationale**: Leaders want to propose multiple options; limiting to current week loses useful info
- **Alternative**: Only show current week's slots

- **[ASSUMPTION]**: Simple ">" marker for priority slot rather than emoji
- **Rationale**: Keeps message clean, works in all Discord clients, no emoji encoding issues
- **Alternative**: Use star emoji or bold formatting

- **[ASSUMPTION]**: "Let me know what works!" closing is sufficient
- **Rationale**: Short, friendly, prompts response without being prescriptive
- **Alternative**: Make closing message customizable

- **[ASSUMPTION]**: Message preview is read-only (not editable in modal)
- **Rationale**: Keeps UI simple; user can edit after pasting in Discord
- **Alternative**: Add textarea for user to customize before copying

---

## 11. Quality Checklist

- [x] Frontend requirements specified (message generation, contact UI, toast)
- [x] Backend requirements specified (none needed - read-only feature)
- [x] Integration examples show actual code
- [x] Hot paths identified (all from cache - instant)
- [x] Test scenarios cover full stack (frontend, clipboard, Discord, integration)
- [x] Data flow is complete (cache → message → clipboard → Discord → paste)
- [x] No anti-patterns from CLAUDE.md (no service subscriptions, no new listeners)
- [x] Error handling specified (clipboard failures, Discord link failures)
- [x] Loading states defined (none needed - all instant operations)
