# Phase D2+D3+D4+D5: Discord Roster Management — MatchScheduler Side

## Context

Team leaders can already connect the quad bot to their Discord server via the existing bot registration flow. Now we extend this with **roster management from Discord**: leaders can add Discord server members as phantom roster entries, and those phantoms auto-upgrade when the real person logs in via Discord OAuth.

This phase depends on quad writing `guildMembers` to `botRegistrations/{teamId}` (Phase D1), but Cloud Functions (D2-D4) can be built and tested independently using manually written Firestore data. The full contract is at the orchestrator level in `DISCORD-ROSTER-CONTRACT.md`.

---

## D2: `addPhantomMember` Cloud Function

### What Changes

New callable Cloud Function that creates a phantom user: a Firebase Auth account + user doc + team roster entry, all linked by Discord UID. The phantom acts as a placeholder until the real person logs in.

### File to Modify

#### `functions/team-operations.js`

Add a new callable Cloud Function following the same pattern as `kickPlayer` and `updateRecordingVisibility`:

```javascript
/**
 * Add a Discord user as a phantom member to a team.
 * Creates a Firebase Auth account + user doc + roster entry.
 * The phantom auto-upgrades when the real person logs in via Discord OAuth.
 */
exports.addPhantomMember = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    // 1. Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { teamId, discordUserId, displayName } = data;
    const callerId = context.auth.uid;

    // 2. Validate input
    if (!teamId || typeof teamId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'teamId required');
    }
    if (!discordUserId || typeof discordUserId !== 'string' || !/^\d{17,19}$/.test(discordUserId)) {
      throw new functions.https.HttpsError('invalid-argument', 'Valid Discord user ID required');
    }
    if (!displayName || typeof displayName !== 'string' || displayName.length < 2 || displayName.length > 30) {
      throw new functions.https.HttpsError('invalid-argument', 'Display name must be 2-30 characters');
    }

    // 3. Verify caller is team leader
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Team not found');
    }
    const team = teamDoc.data();
    if (team.leaderId !== callerId) {
      throw new functions.https.HttpsError('permission-denied', 'Only team leaders can add phantom members');
    }

    // 4. Check maxPlayers
    const currentRosterSize = (team.playerRoster || []).length;
    if (currentRosterSize >= (team.maxPlayers || 20)) {
      throw new functions.https.HttpsError('failed-precondition', 'Team is at max capacity');
    }

    // 5. Verify bot registration is active and discordUserId is in guildMembers
    const regDoc = await db.collection('botRegistrations').doc(teamId).get();
    if (!regDoc.exists || regDoc.data().status !== 'active') {
      throw new functions.https.HttpsError('failed-precondition', 'Bot must be connected first');
    }
    const guildMembers = regDoc.data().guildMembers || {};
    if (!guildMembers[discordUserId]) {
      throw new functions.https.HttpsError('not-found', 'Discord user not found in server member list');
    }

    // 6. Conflict check — is this Discord UID already linked to a user with team membership?
    const existingUsers = await db.collection('users')
      .where('discordUserId', '==', discordUserId)
      .limit(1)
      .get();

    if (!existingUsers.empty) {
      const existingUser = existingUsers.docs[0].data();
      const existingTeams = existingUser.teams || {};
      const teamIds = Object.keys(existingTeams).filter(t => existingTeams[t] === true);

      if (teamIds.length > 0) {
        // Find the team name for the error message
        let teamName = 'another team';
        try {
          const otherTeam = await db.collection('teams').doc(teamIds[0]).get();
          if (otherTeam.exists) teamName = otherTeam.data().teamName;
        } catch { /* use fallback */ }

        throw new functions.https.HttpsError(
          'already-exists',
          `This user is already on ${teamName}. They need to join your team themselves.`
        );
      }

      // Orphaned phantom (no teams) — clean it up
      const orphanId = existingUsers.docs[0].id;
      try {
        await admin.auth().deleteUser(orphanId);
      } catch { /* may not have Auth account */ }
      await db.collection('users').doc(orphanId).delete();
    }

    // 7. Check if discordUserId is already in this team's roster
    const alreadyOnRoster = (team.playerRoster || []).some(
      p => p.discordUserId === discordUserId
    );
    if (alreadyOnRoster) {
      throw new functions.https.HttpsError('already-exists', 'This Discord user is already on the roster');
    }

    // 8. Create Firebase Auth account (shell — no email, no password)
    let authUser;
    try {
      authUser = await admin.auth().createUser({
        displayName: displayName,
        disabled: false,
      });
    } catch (err) {
      throw new functions.https.HttpsError('internal', 'Failed to create auth account: ' + err.message);
    }

    const userId = authUser.uid;
    const guildMember = guildMembers[discordUserId];

    // 9. Generate initials (same logic as existing user creation)
    const initials = generateInitials(displayName);

    try {
      // 10. Create user doc
      await db.collection('users').doc(userId).set({
        displayName: displayName,
        initials: initials,
        email: null,
        photoURL: guildMember.avatarUrl || null,
        teams: { [teamId]: true },
        favoriteTeams: [],
        discordUserId: discordUserId,
        discordUsername: guildMember.username || null,
        discordAvatarHash: null,
        discordLinkedAt: null,
        avatarSource: guildMember.avatarUrl ? 'discord' : 'initials',
        isPhantom: true,
        phantomCreatedBy: callerId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 11. Add to team roster
      const rosterEntry = {
        userId: userId,
        displayName: displayName,
        initials: initials,
        photoURL: guildMember.avatarUrl || null,
        joinedAt: new Date(),
        role: 'member',
        isPhantom: true,
        discordUserId: discordUserId,
      };

      await db.collection('teams').doc(teamId).update({
        playerRoster: admin.firestore.FieldValue.arrayUnion(rosterEntry),
      });

      // 12. Update knownPlayers on bot registration
      await db.collection('botRegistrations').doc(teamId).update({
        [`knownPlayers.${discordUserId}`]: displayName,
      });

      console.log('Phantom member added:', { userId, discordUserId, displayName, teamId });
      return { success: true, userId };

    } catch (err) {
      // Cleanup on failure — delete the Auth account we created
      try { await admin.auth().deleteUser(userId); } catch { /* best effort */ }
      try { await db.collection('users').doc(userId).delete(); } catch { /* best effort */ }
      throw new functions.https.HttpsError('internal', 'Failed to create phantom member: ' + err.message);
    }
  });
```

**Note on `generateInitials`:** Reuse the existing initials generation logic from the user creation flow. If it's not already a shared helper, extract it. The logic: take first letter of each word in displayName, uppercase, max 3 chars.

#### `functions/index.js`

Export the new function:
```javascript
exports.addPhantomMember = teamOperations.addPhantomMember;
```

---

## D3: `removePhantomMember` Cloud Function

### What Changes

New callable Cloud Function that completely purges a phantom user: removes from roster, deletes user doc, deletes Firebase Auth account. Only works on phantom users — real users use the existing `kickPlayer` flow.

### File to Modify

#### `functions/team-operations.js`

```javascript
/**
 * Remove a phantom member from a team.
 * Completely deletes the phantom: user doc, Auth account, roster entry, knownPlayers.
 * Rejects if the user is not a phantom (use kickPlayer for real users).
 */
exports.removePhantomMember = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { teamId, userId } = data;
    const callerId = context.auth.uid;

    // Validate input
    if (!teamId || !userId) {
      throw new functions.https.HttpsError('invalid-argument', 'teamId and userId required');
    }

    // Verify caller is team leader
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Team not found');
    }
    if (teamDoc.data().leaderId !== callerId) {
      throw new functions.https.HttpsError('permission-denied', 'Only team leaders can remove phantom members');
    }

    // Read user doc — verify it's a phantom
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    const userData = userDoc.data();
    if (!userData.isPhantom) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This user has logged in and is no longer a phantom. Use the regular kick flow.'
      );
    }

    const discordUserId = userData.discordUserId;

    // Remove from team roster
    const roster = teamDoc.data().playerRoster || [];
    const updatedRoster = roster.filter(p => p.userId !== userId);
    await db.collection('teams').doc(teamId).update({
      playerRoster: updatedRoster,
    });

    // Remove from knownPlayers (if present)
    if (discordUserId) {
      try {
        await db.collection('botRegistrations').doc(teamId).update({
          [`knownPlayers.${discordUserId}`]: admin.firestore.FieldValue.delete(),
        });
      } catch { /* bot registration may not exist */ }
    }

    // Delete user doc
    await db.collection('users').doc(userId).delete();

    // Delete Firebase Auth account
    try {
      await admin.auth().deleteUser(userId);
    } catch (err) {
      console.warn('Failed to delete phantom Auth account (may not exist):', err.message);
    }

    console.log('Phantom member removed:', { userId, discordUserId, teamId });
    return { success: true };
  });
```

#### `functions/index.js`

```javascript
exports.removePhantomMember = teamOperations.removePhantomMember;
```

---

## D4: Modify Discord OAuth Login for Phantom Claim

### What Changes

Small addition to the existing `discordOAuthExchange` Cloud Function. When a Discord user logs in and we find a matching phantom user doc, we "claim" it: upgrade the phantom to a real user instead of creating a new account.

### File to Modify

#### `functions/auth.js` (or wherever `discordOAuthExchange` lives)

Find the existing code that checks for a user with matching Discord ID. It currently looks something like:

```javascript
// Check if Discord ID already linked to an existing user
const existingUsers = await db.collection('users')
  .where('discordUserId', '==', discordUserId)
  .limit(1)
  .get();

if (!existingUsers.empty) {
  // Return existing user's token
  const existingUserId = existingUsers.docs[0].id;
  const token = await admin.auth().createCustomToken(existingUserId);
  return { token, isNewUser: false };
}
```

**Add phantom claim handling** after finding the existing user:

```javascript
if (!existingUsers.empty) {
  const existingDoc = existingUsers.docs[0];
  const existingData = existingDoc.data();
  const existingUserId = existingDoc.id;

  // NEW: Handle phantom claim
  if (existingData.isPhantom) {
    await claimPhantomAccount(existingUserId, discordProfile);
  }

  const token = await admin.auth().createCustomToken(existingUserId);
  return {
    token,
    isNewUser: existingData.isPhantom ? true : false,  // treat claim as "new" for onboarding
    wasClaimed: existingData.isPhantom || false,
  };
}
```

**New helper function:**

```javascript
/**
 * Upgrade a phantom user to a real user account.
 * Updates Auth account, user doc, and all team roster entries.
 */
async function claimPhantomAccount(userId, discordProfile) {
  const { id: discordUserId, username, email, avatar } = discordProfile;

  // 1. Update Firebase Auth account
  const authUpdate = { disabled: false };
  if (email) authUpdate.email = email;
  if (username) authUpdate.displayName = username;
  try {
    await admin.auth().updateUser(userId, authUpdate);
  } catch (err) {
    console.warn('Failed to update phantom Auth account:', err.message);
  }

  // 2. Update user doc
  const userUpdate = {
    isPhantom: admin.firestore.FieldValue.delete(),
    phantomCreatedBy: admin.firestore.FieldValue.delete(),
    discordUsername: username,
    discordUserId: discordUserId,
    discordAvatarHash: avatar || null,
    discordLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Only update email if available and not already set
  const userDoc = await db.collection('users').doc(userId).get();
  const currentData = userDoc.data();
  if (email && !currentData.email) {
    userUpdate.email = email;
  }

  // Update avatar if Discord has one and user was using default
  if (avatar && (!currentData.avatarSource || currentData.avatarSource === 'initials')) {
    const avatarUrl = `https://cdn.discordapp.com/avatars/${discordUserId}/${avatar}.png?size=128`;
    userUpdate.photoURL = avatarUrl;
    userUpdate.avatarSource = 'discord';
  }

  await db.collection('users').doc(userId).update(userUpdate);

  // 3. Update roster entries on all teams — clear isPhantom flag
  const teams = currentData.teams || {};
  for (const teamId of Object.keys(teams)) {
    if (!teams[teamId]) continue;

    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) continue;

    const roster = teamDoc.data().playerRoster || [];
    let updated = false;
    const updatedRoster = roster.map(entry => {
      if (entry.userId === userId && entry.isPhantom) {
        updated = true;
        const newEntry = { ...entry, isPhantom: false };
        // Update photo if we got a Discord avatar
        if (userUpdate.photoURL) newEntry.photoURL = userUpdate.photoURL;
        return newEntry;
      }
      return entry;
    });

    if (updated) {
      await db.collection('teams').doc(teamId).update({ playerRoster: updatedRoster });
    }
  }

  console.log('Phantom account claimed:', { userId, discordUserId });
}
```

### Edge Cases

- **Phantom has different displayName than Discord name:** Keep the QW name the leader assigned. The user can change it later via Edit Profile. Don't overwrite `displayName` during claim.
- **Email conflict:** The Discord account might have an email already linked to a different Firebase Auth user (e.g., they previously signed in with Google using the same email). Handle this gracefully — skip email update if it would conflict.
- **Race condition:** User claims phantom while leader is removing it. The claim should win — `isPhantom` goes `false`, the removePhantomMember function will see `isPhantom != true` and reject.

### Verification

1. Create a phantom via `addPhantomMember` (or manually in Firestore + Firebase Auth)
2. Log in via Discord OAuth with the matching Discord account
3. Verify: user lands on the site with the team already set up
4. Verify: user doc has `isPhantom` removed, Discord fields populated
5. Verify: team roster entry has `isPhantom: false`
6. Verify: displayName is the QW nick the leader assigned (not Discord name)

---

## D5: Manage Players UI

### What Changes

New modal accessible from the team management modal. Shows current roster with phantom indicators, and lists Discord server members available to add.

### Files to Modify

#### 1. `public/js/components/TeamManagementModal.js`

**Add "Manage Players" button** to the Discord tab, near the Player Mapping section header. Only visible when bot status is `active`:

```html
<div class="flex items-center justify-between mb-3">
  <h4 class="text-text-primary font-medium">Player Mapping</h4>
  <!-- NEW: Manage Players button — leader only -->
  <button id="manage-players-btn"
    class="text-sm px-3 py-1 bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
    style="display: ${_isLeader ? 'inline-flex' : 'none'}">
    Manage Players
  </button>
</div>
```

**Event handler:**

```javascript
// In _attachListeners() or wherever Discord tab listeners are set up
container.querySelector('#manage-players-btn')?.addEventListener('click', () => {
  ManagePlayersModal.show(_teamId);
});
```

#### 2. New file: `public/js/components/ManagePlayersModal.js`

Follow the same revealing module pattern as `KickPlayerModal.js` and `TransferLeadershipModal.js`.

```javascript
const ManagePlayersModal = (() => {
  let _teamId = null;
  let _teamData = null;
  let _botRegistration = null;

  async function show(teamId) {
    _teamId = teamId;
    _teamData = TeamService.getTeamFromCache(teamId);
    _botRegistration = BotRegistrationService.getRegistration(teamId);

    _render();
    _attachListeners();
  }

  function _render() {
    const roster = _teamData?.playerRoster || [];
    const guildMembers = _botRegistration?.guildMembers || {};
    const rosterDiscordIds = new Set(
      roster.map(p => p.discordUserId).filter(Boolean)
    );

    // Available = guild members not on roster and not bots
    const available = Object.entries(guildMembers)
      .filter(([id, m]) => !m.isBot && !rosterDiscordIds.has(id))
      .map(([id, m]) => ({ discordUserId: id, ...m }));

    const html = `
      <div class="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="modal-card bg-surface rounded-xl border border-border p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-text-primary">Manage Players</h3>
            <button class="close-modal text-text-secondary hover:text-text-primary">&times;</button>
          </div>

          <!-- Current Roster -->
          <div class="mb-4">
            <h4 class="text-sm font-medium text-text-secondary mb-2">
              ROSTER (${roster.length}/${_teamData?.maxPlayers || 8})
            </h4>
            <div class="space-y-2">
              ${roster.map(p => _renderRosterEntry(p)).join('')}
            </div>
          </div>

          <!-- Available Discord Members -->
          ${available.length > 0 ? `
            <div>
              <h4 class="text-sm font-medium text-text-secondary mb-2">
                ADD FROM DISCORD
              </h4>
              <p class="text-xs text-text-secondary mb-2">
                Members of "${_escapeHtml(_botRegistration?.guildName || 'Discord server')}" not on roster:
              </p>
              <div class="space-y-2">
                ${available.map(m => _renderAvailableMember(m)).join('')}
              </div>
            </div>
          ` : `
            <p class="text-sm text-text-secondary">
              All Discord server members are on the roster.
            </p>
          `}
        </div>
      </div>
    `;

    // Render into modal container
    const container = document.getElementById('modal-container');
    container.innerHTML = html;
    container.classList.remove('hidden');
  }

  function _renderRosterEntry(player) {
    const avatar = player.photoURL
      ? `<img src="${_escapeHtml(player.photoURL)}" class="w-8 h-8 rounded-full" alt="">`
      : `<div class="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-xs font-medium text-text-secondary">${_escapeHtml(player.initials)}</div>`;

    const phantomBadge = player.isPhantom
      ? `<span class="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">Pending</span>`
      : '';

    const roleLabel = player.role === 'leader' ? 'Leader' : '';

    const removeBtn = player.isPhantom
      ? `<button class="remove-phantom text-xs text-red-400 hover:text-red-300"
           data-user-id="${_escapeHtml(player.userId)}">Remove</button>`
      : '';

    return `
      <div class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover">
        <div class="flex items-center gap-3">
          ${avatar}
          <span class="text-text-primary">${_escapeHtml(player.displayName)}</span>
          ${phantomBadge}
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-text-secondary">${roleLabel}</span>
          ${removeBtn}
        </div>
      </div>
    `;
  }

  function _renderAvailableMember(member) {
    const avatar = member.avatarUrl
      ? `<img src="${_escapeHtml(member.avatarUrl)}" class="w-8 h-8 rounded-full" alt="">`
      : `<div class="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-xs text-text-secondary">?</div>`;

    return `
      <div class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover">
        <div class="flex items-center gap-3">
          ${avatar}
          <span class="text-text-primary">${_escapeHtml(member.displayName)}</span>
        </div>
        <button class="add-phantom text-sm px-3 py-1 bg-accent/20 text-accent rounded hover:bg-accent/30"
          data-discord-id="${_escapeHtml(member.discordUserId)}"
          data-display-name="${_escapeHtml(member.displayName)}">
          + Add
        </button>
      </div>
    `;
  }

  function _attachListeners() {
    const container = document.getElementById('modal-container');

    // Close modal
    container.querySelector('.close-modal')?.addEventListener('click', _close);
    container.querySelector('.modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) _close();
    });

    // Add phantom member
    container.querySelectorAll('.add-phantom').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const discordId = e.currentTarget.dataset.discordId;
        const discordName = e.currentTarget.dataset.displayName;
        await _handleAddPhantom(discordId, discordName);
      });
    });

    // Remove phantom member
    container.querySelectorAll('.remove-phantom').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = e.currentTarget.dataset.userId;
        await _handleRemovePhantom(userId);
      });
    });
  }

  async function _handleAddPhantom(discordUserId, discordDisplayName) {
    // Prompt for QW nick
    const qwNick = prompt(`QW nick for ${discordDisplayName}:`, discordDisplayName);
    if (!qwNick || qwNick.trim().length < 2) return;

    try {
      const result = await TeamService.callFunction('addPhantomMember', {
        teamId: _teamId,
        discordUserId: discordUserId,
        displayName: qwNick.trim(),
      });

      if (result.data?.success) {
        ToastService.show(`Added ${qwNick.trim()} to roster`, 'success');
        // Re-fetch team data and re-render
        _teamData = TeamService.getTeamFromCache(_teamId);
        _render();
        _attachListeners();
      }
    } catch (err) {
      const message = err.message || 'Failed to add member';
      ToastService.show(message, 'error');
    }
  }

  async function _handleRemovePhantom(userId) {
    const player = (_teamData?.playerRoster || []).find(p => p.userId === userId);
    if (!player) return;

    const confirmed = confirm(`Remove ${player.displayName} from the roster? This will delete their pending account.`);
    if (!confirmed) return;

    try {
      const result = await TeamService.callFunction('removePhantomMember', {
        teamId: _teamId,
        userId: userId,
      });

      if (result.data?.success) {
        ToastService.show(`Removed ${player.displayName}`, 'success');
        _teamData = TeamService.getTeamFromCache(_teamId);
        _render();
        _attachListeners();
      }
    } catch (err) {
      ToastService.show(err.message || 'Failed to remove member', 'error');
    }
  }

  function _close() {
    const container = document.getElementById('modal-container');
    container.classList.add('hidden');
    container.innerHTML = '';
  }

  return { show };
})();
```

**Note on `prompt()`:** The native `prompt()` dialog is a quick solution. For a polished UX, replace with an inline text input that appears when "+ Add" is clicked. But `prompt()` works fine for the initial implementation.

#### 3. `public/index.html` (or wherever scripts are loaded)

Add the new component script:
```html
<script src="/js/components/ManagePlayersModal.js"></script>
```

### Empty States

- **Bot not connected:** Don't show the "Manage Players" button at all (it's in the Discord tab which only renders when bot is active)
- **No available members:** Show "All Discord server members are on the roster."
- **Guild member list not yet synced:** Show "Discord member list is loading..." (edge case: bot just connected, quad hasn't synced yet)

### Styling Notes

- Follow existing modal patterns: dark overlay + centered card
- Use existing Tailwind utility classes: `bg-surface`, `border-border`, `text-text-primary`, `text-text-secondary`, `bg-accent/20`, `text-accent`
- Phantom "Pending" badge: yellow tint matches the existing warning/pending color patterns
- Max height with scroll for long member lists

---

## Firestore Rules

### botRegistrations — scheduler read access

Check if schedulers already have read access. If not, update:

```
match /botRegistrations/{teamId} {
  allow read: if request.auth != null
    && (get(/databases/$(database)/documents/teams/$(teamId)).data.leaderId == request.auth.uid
        || request.auth.uid in get(/databases/$(database)/documents/teams/$(teamId)).data.schedulers);
  allow write: if false;
}
```

This doesn't affect the Manage Players feature (leader only), but ensures the Discord tab continues to work for schedulers who need to see channel settings and player mapping.

---

## Implementation Order

1. **D2 + D3 first** — Cloud Functions are independent, can be deployed and tested via Firebase console before UI exists
2. **D4 second** — Small modification to existing login flow. Deploy with D2+D3
3. **D5 last** — UI depends on Cloud Functions being available

Within D5:
1. Create `ManagePlayersModal.js` with the roster display (static, from team cache)
2. Add the "Add from Discord" section (reads `botRegistrations.guildMembers`)
3. Wire up `addPhantomMember` calls
4. Wire up `removePhantomMember` calls
5. Add the "Manage Players" button to TeamManagementModal Discord tab

## Deployment

```bash
# After Cloud Function changes (D2+D3+D4):
npm run deploy:functions

# After Firestore rules changes:
npm run deploy:rules

# After frontend changes (D5):
npm run deploy:hosting

# Or all at once:
npm run deploy
```

## Verification

### Test Flow: Add Phantom
1. Ensure bot is connected to a Discord server
2. Open team modal → Discord tab → click "Manage Players"
3. Verify Discord server members appear in the "Add from Discord" section
4. Click "+ Add" on a member → enter QW nick → confirm
5. Verify member appears in roster with "Pending" badge
6. Check Firestore: `users/{uid}` with `isPhantom: true`, `teams/{teamId}.playerRoster` includes new entry

### Test Flow: Claim Phantom
1. After adding a phantom (above), log out
2. Log in with the Discord account matching the phantom's Discord UID
3. Verify: land on the site with team already set up
4. Check Firestore: `isPhantom` removed from user doc and roster entry

### Test Flow: Remove Phantom
1. In Manage Players modal, click "Remove" on a phantom member
2. Confirm the deletion
3. Verify member is gone from roster and "Add from Discord" section
4. Check Firestore: user doc deleted, Auth account deleted

### Test Flow: Conflict Check
1. Add phantom for Discord user X on Team A
2. Try to add the same Discord user X on Team B
3. Verify: error message "Already on team A. They must join themselves."
