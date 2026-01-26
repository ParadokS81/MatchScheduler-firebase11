# Slice 3.6-3.7: Leader Management (Bundled)

## 1. Slice Definition

- **Slice ID:** 3.6-3.7
- **Name:** Leader Management - Remove Player & Transfer Leadership
- **User Story:** As a team leader, I can remove players from my team and transfer leadership to another member so that I can manage roster disputes and step down when needed
- **Success Criteria:**
  - Leader can remove any non-leader player with immediate effect
  - Leader can transfer leadership to any team member
  - Removed players lose access immediately and their availability is cleared
  - Previous leader becomes regular member after transfer

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.3.3 (Player Management): Remove player functionality, leadership transfer
- 5.6 (Event Logging): KICKED and TRANSFERRED_LEADERSHIP events

DEPENDENT SECTIONS:
- 4.3.4 (Team Management UI): Drawer buttons already exist from slice 1.2b
- 2.4 (Team Rules): 2-team limit, role definitions

IGNORED SECTIONS:
- 4.3.5 (Contact Integration): Discord contact is Part 4
- Logo management: Part 4 polish
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

- KickPlayerModal (NEW)
  - Firebase listeners: none (uses cached roster from TeamService)
  - Cache interactions: reads playerRoster from TeamService.teams[teamId]
  - UI responsibilities:
    - Display list of kickable players (exclude self, exclude leader if multiple leaders)
    - Radio button selection for player to remove
    - Confirm/Cancel buttons
  - User actions: Select player → Confirm → calls TeamService.kickPlayer()

- TransferLeadershipModal (NEW)
  - Firebase listeners: none (uses cached roster from TeamService)
  - Cache interactions: reads playerRoster from TeamService.teams[teamId]
  - UI responsibilities:
    - Display list of team members (exclude self)
    - Radio button selection for new leader
    - Confirm/Cancel buttons
  - User actions: Select member → Confirm → calls TeamService.transferLeadership()

- TeamManagementDrawer (MODIFY)
  - Add click handlers for "Remove Player" and "Transfer Leadership" buttons
  - Wire up to open respective modals

FRONTEND SERVICES:

- TeamService (MODIFY):
  - kickPlayer(teamId, playerToKickId) → kickPlayer Cloud Function
  - transferLeadership(teamId, newLeaderId) → transferLeadership Cloud Function

BACKEND REQUIREMENTS:

⚠️ THESE CLOUD FUNCTIONS MUST BE IMPLEMENTED IN /functions/team-operations.js:

- Cloud Functions:
  - kickPlayer({ teamId, playerToKickId }):
    - File: /functions/team-operations.js
    - Purpose: Remove a player from team roster and clear their availability
    - Validation:
      - Caller must be authenticated
      - Caller must be team leader (team.leaderId === auth.uid)
      - Player to kick must be on the roster
      - Cannot kick yourself
    - Operations (in transaction):
      1. Remove player from playerRoster array
      2. Query all availability/{teamId}_* documents
      3. Remove kicked player's userId from all slots
      4. Update kicked player's user document (remove teamId from teams array)
      5. Create KICKED event in eventLog
    - Returns: { success: true } or { success: false, error: "message" }

  - transferLeadership({ teamId, newLeaderId }):
    - File: /functions/team-operations.js
    - Purpose: Transfer leadership role to another team member
    - Validation:
      - Caller must be authenticated
      - Caller must be current team leader
      - New leader must be on the roster
      - Cannot transfer to yourself
    - Operations (in transaction):
      1. Update team.leaderId to newLeaderId
      2. Update playerRoster: old leader role → 'member', new leader role → 'leader'
      3. Create TRANSFERRED_LEADERSHIP event in eventLog
    - Returns: { success: true } or { success: false, error: "message" }

- Function Exports Required:
  // In /functions/index.js add:
  const { kickPlayer, transferLeadership } = require('./team-operations');
  exports.kickPlayer = kickPlayer;
  exports.transferLeadership = transferLeadership;

- Firestore Operations:
  - teams/{teamId}: UPDATE playerRoster, leaderId
  - availability/{teamId}_{weekId}: UPDATE slots (remove kicked user)
  - users/{userId}: UPDATE teams array (remove teamId for kicked user)
  - eventLog/{eventId}: CREATE event documents

- Authentication/Authorization:
  - Both operations require caller to be team leader
  - Validated via: team.leaderId === request.auth.uid

- Event Logging (per PRD 5.6):

  KICKED event:
  {
    eventId: "{date}-{time}-{teamName}-kicked_{random}",
    teamId: string,
    teamName: string,
    type: "KICKED",
    category: "PLAYER_MOVEMENT",
    timestamp: serverTimestamp(),
    userId: kickedPlayerId,
    player: {
      displayName: string,
      initials: string
    },
    details: {
      kickedBy: callerUserId,
      kickedByName: string
    }
  }

  TRANSFERRED_LEADERSHIP event:
  {
    eventId: "{date}-{time}-{teamName}-transferred_leadership_{random}",
    teamId: string,
    teamName: string,
    type: "TRANSFERRED_LEADERSHIP",
    category: "PLAYER_MOVEMENT",
    timestamp: serverTimestamp(),
    userId: newLeaderId,
    player: {
      displayName: string,
      initials: string
    },
    details: {
      fromUserId: previousLeaderId,
      fromUserName: string
    }
  }

INTEGRATION POINTS:

- Frontend → Backend calls:
  - TeamService.kickPlayer() → httpsCallable('kickPlayer')
  - TeamService.transferLeadership() → httpsCallable('transferLeadership')

- API Contracts:
  kickPlayer:
    Request: { teamId: string, playerToKickId: string }
    Success: { success: true }
    Error: { success: false, error: "Only team leaders can remove players" }

  transferLeadership:
    Request: { teamId: string, newLeaderId: string }
    Success: { success: true }
    Error: { success: false, error: "Only team leaders can transfer leadership" }

- Real-time listeners:
  - Existing teams/{teamId} listener in TeamInfo updates roster UI
  - Kicked player's listener will show team removed from their view
  - Old leader's view will update to show 'member' role
```

---

## 4. Integration Code Examples

### KickPlayerModal Component
```javascript
// public/js/components/KickPlayerModal.js
const KickPlayerModal = (function() {
    let _selectedPlayerId = null;

    function show(teamId) {
        const team = TeamService.getTeam(teamId);
        const currentUserId = AuthService.getCurrentUserId();

        // Filter out self and get kickable players
        const kickablePlayers = team.playerRoster.filter(p =>
            p.userId !== currentUserId
        );

        if (kickablePlayers.length === 0) {
            ToastService.show('No players to remove', 'warning');
            return;
        }

        _selectedPlayerId = null;
        renderModal(kickablePlayers, teamId);
    }

    function renderModal(players, teamId) {
        const container = document.getElementById('modal-container');
        container.innerHTML = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-card rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
                    <h2 class="text-lg font-semibold mb-4">Remove Player</h2>
                    <p class="text-muted-foreground text-sm mb-4">
                        Select a player to remove from the team. This action cannot be undone.
                    </p>
                    <div class="space-y-2 mb-6" id="player-list">
                        ${players.map(p => `
                            <label class="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                                <input type="radio" name="kick-player" value="${p.userId}"
                                    class="w-4 h-4 text-primary" onchange="KickPlayerModal.selectPlayer('${p.userId}')">
                                <span class="flex-1">${p.displayName}</span>
                                <span class="text-xs text-muted-foreground">${p.role}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="flex gap-3 justify-end">
                        <button onclick="KickPlayerModal.close()"
                            class="px-4 py-2 rounded-lg border border-border hover:bg-muted">
                            Cancel
                        </button>
                        <button id="confirm-kick-btn" onclick="KickPlayerModal.confirm('${teamId}')"
                            class="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                            disabled>
                            Remove Player
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.classList.remove('hidden');
    }

    function selectPlayer(playerId) {
        _selectedPlayerId = playerId;
        document.getElementById('confirm-kick-btn').disabled = false;
    }

    async function confirm(teamId) {
        if (!_selectedPlayerId) return;

        const btn = document.getElementById('confirm-kick-btn');
        btn.disabled = true;
        btn.textContent = 'Removing...';

        try {
            const result = await TeamService.kickPlayer(teamId, _selectedPlayerId);

            if (result.success) {
                ToastService.show('Player removed from team', 'success');
                close();
            } else {
                ToastService.show(result.error || 'Failed to remove player', 'error');
                btn.disabled = false;
                btn.textContent = 'Remove Player';
            }
        } catch (error) {
            console.error('Kick player failed:', error);
            ToastService.show('Network error - please try again', 'error');
            btn.disabled = false;
            btn.textContent = 'Remove Player';
        }
    }

    function close() {
        const container = document.getElementById('modal-container');
        container.innerHTML = '';
        container.classList.add('hidden');
        _selectedPlayerId = null;
    }

    return { show, selectPlayer, confirm, close };
})();
```

### TeamService Methods
```javascript
// In TeamService.js - add these methods

async kickPlayer(teamId, playerToKickId) {
    const kickPlayerFn = httpsCallable(_functions, 'kickPlayer');
    const result = await kickPlayerFn({ teamId, playerToKickId });
    return result.data;
},

async transferLeadership(teamId, newLeaderId) {
    const transferFn = httpsCallable(_functions, 'transferLeadership');
    const result = await transferFn({ teamId, newLeaderId });
    return result.data;
}
```

### Cloud Function - kickPlayer
```javascript
// In /functions/team-operations.js

exports.kickPlayer = onCall(async (request) => {
    const { teamId, playerToKickId } = request.data;
    const callerId = request.auth?.uid;

    if (!callerId) {
        return { success: false, error: 'Authentication required' };
    }

    if (!teamId || !playerToKickId) {
        return { success: false, error: 'Missing required parameters' };
    }

    if (callerId === playerToKickId) {
        return { success: false, error: 'Cannot remove yourself. Use "Leave Team" instead.' };
    }

    try {
        await db.runTransaction(async (transaction) => {
            const teamRef = db.collection('teams').doc(teamId);
            const teamDoc = await transaction.get(teamRef);

            if (!teamDoc.exists) {
                throw new Error('Team not found');
            }

            const team = teamDoc.data();

            // Verify caller is leader
            if (team.leaderId !== callerId) {
                throw new Error('Only team leaders can remove players');
            }

            // Find player to kick
            const playerToKick = team.playerRoster.find(p => p.userId === playerToKickId);
            if (!playerToKick) {
                throw new Error('Player not found on team roster');
            }

            // Remove from roster
            const updatedRoster = team.playerRoster.filter(p => p.userId !== playerToKickId);
            transaction.update(teamRef, { playerRoster: updatedRoster });

            // Update kicked player's user document
            const userRef = db.collection('users').doc(playerToKickId);
            const userDoc = await transaction.get(userRef);
            if (userDoc.exists) {
                const userData = userDoc.data();
                const updatedTeams = (userData.teams || []).filter(t => t !== teamId);
                transaction.update(userRef, { teams: updatedTeams });
            }

            // Create event log
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
            const teamNameClean = team.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
            const randomSuffix = Math.random().toString(36).substring(2, 6);
            const eventId = `${dateStr}-${timeStr}-${teamNameClean}-kicked_${randomSuffix}`;

            const caller = team.playerRoster.find(p => p.userId === callerId);

            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId,
                teamName: team.name,
                type: 'KICKED',
                category: 'PLAYER_MOVEMENT',
                timestamp: FieldValue.serverTimestamp(),
                userId: playerToKickId,
                player: {
                    displayName: playerToKick.displayName,
                    initials: playerToKick.initials
                },
                details: {
                    kickedBy: callerId,
                    kickedByName: caller?.displayName || 'Unknown'
                }
            });
        });

        // After transaction: clean up availability (outside transaction for query)
        const availabilitySnap = await db.collection('availability')
            .where('teamId', '==', teamId)
            .get();

        const batch = db.batch();
        availabilitySnap.docs.forEach(doc => {
            const data = doc.data();
            const slots = data.slots || {};
            let hasChanges = false;

            Object.keys(slots).forEach(slotKey => {
                if (Array.isArray(slots[slotKey]) && slots[slotKey].includes(playerToKickId)) {
                    slots[slotKey] = slots[slotKey].filter(uid => uid !== playerToKickId);
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                batch.update(doc.ref, { slots });
            }
        });

        await batch.commit();

        return { success: true };
    } catch (error) {
        console.error('kickPlayer error:', error);
        return { success: false, error: error.message };
    }
});
```

### Cloud Function - transferLeadership
```javascript
// In /functions/team-operations.js

exports.transferLeadership = onCall(async (request) => {
    const { teamId, newLeaderId } = request.data;
    const callerId = request.auth?.uid;

    if (!callerId) {
        return { success: false, error: 'Authentication required' };
    }

    if (!teamId || !newLeaderId) {
        return { success: false, error: 'Missing required parameters' };
    }

    if (callerId === newLeaderId) {
        return { success: false, error: 'You are already the leader' };
    }

    try {
        await db.runTransaction(async (transaction) => {
            const teamRef = db.collection('teams').doc(teamId);
            const teamDoc = await transaction.get(teamRef);

            if (!teamDoc.exists) {
                throw new Error('Team not found');
            }

            const team = teamDoc.data();

            // Verify caller is current leader
            if (team.leaderId !== callerId) {
                throw new Error('Only the current leader can transfer leadership');
            }

            // Verify new leader is on roster
            const newLeader = team.playerRoster.find(p => p.userId === newLeaderId);
            if (!newLeader) {
                throw new Error('Selected player is not on the team');
            }

            // Update roster roles
            const updatedRoster = team.playerRoster.map(p => {
                if (p.userId === callerId) {
                    return { ...p, role: 'member' };
                }
                if (p.userId === newLeaderId) {
                    return { ...p, role: 'leader' };
                }
                return p;
            });

            // Update team
            transaction.update(teamRef, {
                leaderId: newLeaderId,
                playerRoster: updatedRoster
            });

            // Create event log
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
            const teamNameClean = team.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
            const randomSuffix = Math.random().toString(36).substring(2, 6);
            const eventId = `${dateStr}-${timeStr}-${teamNameClean}-transferred_leadership_${randomSuffix}`;

            const oldLeader = team.playerRoster.find(p => p.userId === callerId);

            transaction.set(db.collection('eventLog').doc(eventId), {
                eventId,
                teamId,
                teamName: team.name,
                type: 'TRANSFERRED_LEADERSHIP',
                category: 'PLAYER_MOVEMENT',
                timestamp: FieldValue.serverTimestamp(),
                userId: newLeaderId,
                player: {
                    displayName: newLeader.displayName,
                    initials: newLeader.initials
                },
                details: {
                    fromUserId: callerId,
                    fromUserName: oldLeader?.displayName || 'Unknown'
                }
            });
        });

        return { success: true };
    } catch (error) {
        console.error('transferLeadership error:', error);
        return { success: false, error: error.message };
    }
});
```

### TeamManagementDrawer Integration
```javascript
// In TeamManagementDrawer.js - add to leader section button handlers

// Find the existing "Remove Player" button and add handler
document.getElementById('remove-player-btn')?.addEventListener('click', () => {
    KickPlayerModal.show(_currentTeamId);
});

// Find the existing "Transfer Leadership" button and add handler
document.getElementById('transfer-leadership-btn')?.addEventListener('click', () => {
    TransferLeadershipModal.show(_currentTeamId);
});
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- None - both are infrequent leader admin actions

COLD PATHS (<2s):
- Kick player: Cloud Function with transaction + availability cleanup
  - Loading state: "Removing..." on confirm button
  - Expected: ~500ms-1.5s depending on availability docs

- Transfer leadership: Cloud Function with transaction
  - Loading state: "Transferring..." on confirm button
  - Expected: ~300ms-800ms

BACKEND PERFORMANCE:
- Cloud Function cold starts: Acceptable for admin actions
- Database queries:
  - kickPlayer queries availability collection (indexed by teamId)
  - transferLeadership is single document transaction (fast)
- No new indexes required (teamId already indexed on availability)
```

---

## 6. Data Flow Diagram

```
KICK PLAYER FLOW:
Click "Remove Player" → TeamManagementDrawer
→ KickPlayerModal.show() → render player list from cache
→ User selects player + clicks "Remove Player"
→ TeamService.kickPlayer(teamId, playerId)
→ kickPlayer() Cloud Function:
   ├── Validate leader permission
   ├── Transaction: remove from roster, update user doc, log event
   └── Batch: clear from all availability docs
→ Returns { success: true }
→ Toast shows "Player removed"
→ teams/{teamId} update triggers listener
→ TeamInfo.updateUI() shows updated roster
→ Kicked player's listener removes team from their view

TRANSFER LEADERSHIP FLOW:
Click "Transfer Leadership" → TeamManagementDrawer
→ TransferLeadershipModal.show() → render member list from cache
→ User selects new leader + clicks "Transfer"
→ TeamService.transferLeadership(teamId, newLeaderId)
→ transferLeadership() Cloud Function:
   ├── Validate leader permission
   └── Transaction: update leaderId, update roles, log event
→ Returns { success: true }
→ Toast shows "Leadership transferred"
→ teams/{teamId} update triggers listener
→ TeamInfo.updateUI() shows new leader
→ Old leader's UI updates to show 'member' role
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] KickPlayerModal shows list of team members (excludes self)
- [ ] TransferLeadershipModal shows list of members (excludes self)
- [ ] Radio selection enables confirm button
- [ ] Confirm button shows loading state during operation
- [ ] Modal closes on successful operation
- [ ] Modal shows error and re-enables button on failure
- [ ] Cancel button closes modal without action

BACKEND TESTS:
- [ ] kickPlayer rejects non-authenticated users
- [ ] kickPlayer rejects non-leader callers
- [ ] kickPlayer rejects kicking yourself
- [ ] kickPlayer rejects player not on roster
- [ ] kickPlayer removes player from roster correctly
- [ ] kickPlayer updates user document (removes teamId)
- [ ] kickPlayer clears player from all availability slots
- [ ] kickPlayer creates KICKED event log
- [ ] transferLeadership rejects non-authenticated users
- [ ] transferLeadership rejects non-leader callers
- [ ] transferLeadership rejects transferring to yourself
- [ ] transferLeadership rejects player not on roster
- [ ] transferLeadership updates leaderId correctly
- [ ] transferLeadership updates both roster roles correctly
- [ ] transferLeadership creates TRANSFERRED_LEADERSHIP event log

INTEGRATION TESTS:
- [ ] Kick: Button click → backend executes → roster updates in UI
- [ ] Kick: Kicked player's view removes team immediately
- [ ] Kick: Availability grid no longer shows kicked player
- [ ] Transfer: Button click → backend executes → roles update in UI
- [ ] Transfer: Old leader sees 'member' role, new leader sees 'leader'
- [ ] Transfer: New leader can access leader-only features
- [ ] Error responses show toast with message
- [ ] Network failure shows appropriate error

END-TO-END TESTS:
- [ ] Full kick flow: open modal → select → confirm → see updated roster
- [ ] Full transfer flow: open modal → select → confirm → see role changes
- [ ] Kicked player cannot see team or availability after kick
- [ ] New leader can kick players and transfer leadership
- [ ] Old leader cannot access leader features after transfer
```

---

## 8. Common Integration Pitfalls

- [ ] **Frontend calls backend but doesn't handle errors** - Both modals must catch errors and show toast
- [ ] **Backend updates database but frontend doesn't listen** - Existing teams/{teamId} listener handles this
- [ ] **Loading states missing during backend operations** - Button text changes to "Removing..."/"Transferring..."
- [ ] **Cache not updated after backend changes** - Listener updates cache automatically via TeamService.updateCachedTeam()
- [ ] **Real-time listeners not set up** - Already exist from slice 1.2b
- [ ] **Permission errors not shown to user** - Backend returns error message, frontend shows in toast
- [ ] **Availability cleanup missed** - kickPlayer must query and batch update all availability docs
- [ ] **User document not updated on kick** - Must remove teamId from kicked user's teams array
- [ ] **Modal not properly closed on success** - Must clear innerHTML and hide container

---

## 9. Implementation Notes

**Gotchas:**
- Availability cleanup must happen AFTER the transaction (can't query inside transaction)
- Use batch writes for availability cleanup (more efficient than individual updates)
- Radio button `onchange` needs to call modal method (use global function reference)
- TransferLeadershipModal is nearly identical to KickPlayerModal - consider shared base

**Similar patterns:**
- `leaveTeam` in team-operations.js shows player removal from roster
- `ConfirmationModal.js` shows modal rendering pattern
- `OnboardingModal.js` shows form-based modal pattern

**Dependencies:**
- Requires TeamManagementDrawer from slice 1.2b (complete)
- Requires TeamService with Firebase Functions setup (complete)
- Requires ToastService (complete)

**Files to create:**
1. `/public/js/components/KickPlayerModal.js` (NEW)
2. `/public/js/components/TransferLeadershipModal.js` (NEW)

**Files to modify:**
1. `/functions/team-operations.js` - Add kickPlayer, transferLeadership functions
2. `/functions/index.js` - Export new functions
3. `/public/js/services/TeamService.js` - Add service methods
4. `/public/js/components/TeamManagementDrawer.js` - Wire up button handlers
5. `/public/index.html` - Add script tags for new modals

---

## 10. Pragmatic Assumptions

None needed - all requirements clarified via PRD and user question (simple radio list UI confirmed).
