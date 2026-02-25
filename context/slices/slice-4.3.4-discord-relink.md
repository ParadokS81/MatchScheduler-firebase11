# Slice 4.3.4: Discord Re-Link for Discord-Primary Users

## 1. Slice Definition

| Field | Value |
|-------|-------|
| **ID** | 4.3.4 |
| **Name** | Discord Re-Link for Discord-Primary Users |
| **Priority** | Medium |
| **Complexity** | Low |
| **Dependencies** | Slice 4.3.1 (Discord OAuth Foundation), Slice 4.3.2 (Discord Linking) - COMPLETED |

### User Story
As a Discord-authenticated user, I can re-link my account to a different Discord account so that I can update my identity when I've changed Discord accounts.

### Success Criteria
- [ ] Discord-primary users see a "Re-link" button in Edit Profile
- [ ] Clicking "Re-link" opens the Discord OAuth popup
- [ ] Completing OAuth swaps Discord username, ID, and avatar to the new account
- [ ] Team rosters are updated with the new avatar
- [ ] Error shown if new Discord account is already linked to another MatchScheduler user
- [ ] Confirmation dialog before starting the re-link flow

---

## 2. PRD Mapping

### Primary Sections
- User-reported issue: Discord-primary users cannot change their Discord account
- Edit Profile Modal: Discord section (Case 1) needs action button

### Dependent Sections
- Slice 4.3.1: Discord OAuth popup infrastructure (reused as-is)
- Slice 4.3.2: `linkDiscordAccount()` and `discordOAuthExchange` linkOnly flow (reused)

### Ignored for This Slice
- Google user link/unlink (already works)
- Account unification / email matching (separate concern)
- Firebase Auth UID change (UID stays the same, only Firestore Discord fields change)

---

## 3. Full Stack Architecture

### Key Insight: Minimal New Code Required

The existing `linkOnly` flow in `discordOAuthExchange` already does exactly what re-link needs:
1. Validates caller is authenticated (`context.auth.uid`)
2. Exchanges OAuth code for new Discord user data
3. Checks new Discord ID isn't already linked to another account
4. Updates user doc with new Discord fields
5. Updates team rosters with new avatar/photoURL

Discord-primary users are authenticated and have a UID. The `linkOnly` path works for them too — it just updates their Discord fields in Firestore. **No Cloud Function changes needed.**

```
FRONTEND COMPONENTS:
- ProfileModal.js
  - Firebase listeners: none (profile data loaded on open)
  - Cache interactions: updates _userProfile after re-link
  - UI responsibilities: Adds "Re-link" button to Case 1 (Discord-primary)
  - User actions: Click "Re-link" → OAuth popup → swap Discord account

FRONTEND SERVICES:
- AuthService.js
  - relinkDiscordAccount() → reuses linkDiscordAccount() internally
  - No new Cloud Function call needed — linkOnly flow handles it

BACKEND REQUIREMENTS:
⚠️ NO BACKEND CHANGES NEEDED
- discordOAuthExchange with linkOnly=true already handles:
  - Duplicate Discord ID check
  - User doc update (discordUsername, discordUserId, discordAvatarHash, photoURL)
  - Team roster propagation
- The only requirement is context.auth.uid exists (Discord-primary users have this)

INTEGRATION POINTS:
- Frontend → Backend: AuthService.relinkDiscordAccount() → discordOAuthExchange(linkOnly: true)
- Same OAuth popup, same callback page, same Cloud Function
- Real-time: No listener needed — profile modal re-renders from returned data
```

---

## 4. Integration Code Examples

### ProfileModal.js — Updated Case 1 Rendering

```javascript
// In _renderDiscordSection()
// Case 1: Discord auth — was read-only, now has Re-link button
if (isDiscordAuth) {
    const username = _userProfile?.discordUsername || 'Unknown';
    const userId = _userProfile?.discordUserId || '';
    return `
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                    <!-- Discord icon (same as existing) -->
                </svg>
                <span class="text-sm text-foreground">${username}</span>
                <span class="text-xs text-muted-foreground">(${userId})</span>
                <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
            </div>
            <button type="button" id="relink-discord-btn"
                class="text-xs text-muted-foreground hover:text-primary transition-colors">
                Re-link
            </button>
        </div>
        <input type="hidden" name="discordUsername" id="discordUsername" value="${username}">
        <input type="hidden" name="discordUserId" id="discordUserId" value="${userId}">
    `;
}
```

### ProfileModal.js — Re-link Handler

```javascript
async function _handleRelinkDiscord() {
    if (!confirm('Link a different Discord account? This will replace your current Discord identity.')) {
        return;
    }

    const btn = document.getElementById('relink-discord-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Linking...';
    }

    try {
        const result = await AuthService.relinkDiscordAccount();

        if (result.success) {
            // Update local cache
            _userProfile = {
                ..._userProfile,
                discordUsername: result.user.discordUsername,
                discordUserId: result.user.discordUserId,
                discordAvatarHash: result.user.discordAvatarHash || null
            };

            // Re-render Discord section with new data
            _rerenderDiscordSection();

            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Discord account updated!');
            }
        }
    } catch (error) {
        console.error('Discord re-link failed:', error);
        _showError(error.message || 'Failed to re-link Discord account');

        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Re-link';
        }
    }
}
```

### ProfileModal.js — Attach Event Listener

```javascript
// In _attachDiscordEventListeners()
const relinkBtn = _modal.querySelector('#relink-discord-btn');
if (relinkBtn) {
    relinkBtn.addEventListener('click', _handleRelinkDiscord);
}
```

### AuthService.js — Re-link Method

```javascript
/**
 * Re-link Discord account for Discord-primary users.
 * Opens OAuth popup to authenticate with a different Discord account,
 * then updates user profile with new Discord data.
 * Reuses the linkOnly flow in discordOAuthExchange.
 */
async function relinkDiscordAccount() {
    // Dev mode bypass
    if (_isDevMode) {
        console.log('DEV MODE: Simulating Discord re-link');
        return {
            success: true,
            user: {
                discordUsername: 'relinked-discord-user',
                discordUserId: '999888777666555444',
                discordAvatarHash: null
            }
        };
    }

    // Reuse the existing linkDiscordAccount() — it calls discordOAuthExchange
    // with linkOnly: true, which updates the user doc and team rosters
    return linkDiscordAccount();
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- None — re-linking is a rare, one-time operation

COLD PATHS (<2s):
- Click "Re-link" → confirm → OAuth popup opens (instant)
- Complete OAuth → Cloud Function exchange (~1-2s)
- Button shows "Linking..." during operation

BACKEND PERFORMANCE:
- No new Cloud Function — reuses existing discordOAuthExchange
- No new Firestore queries — same duplicate check as linkOnly flow
```

---

## 6. Data Flow Diagram

```
Click "Re-link" → Confirm dialog → AuthService.relinkDiscordAccount()
                                          ↓
                                    Open Discord OAuth popup
                                          ↓
                                    User authorizes new Discord account
                                          ↓
                                    callback.html → postMessage(code)
                                          ↓
                                    discordOAuthExchange({ code, linkOnly: true })
                                          ↓
                                    Cloud Function:
                                    1. Exchange code → Discord API → new user data
                                    2. Check: new Discord ID linked to another user? → reject
                                    3. Update /users/{uid}: discordUsername, discordUserId,
                                       discordAvatarHash, photoURL
                                    4. Update team rosters with new photoURL
                                          ↓
                                    Return { success, user }
                                          ↓
                                    ProfileModal:
                                    1. Update _userProfile cache
                                    2. Re-render Discord section
                                    3. Show success toast
```

---

## 7. Test Scenarios

### Frontend Tests

| Test | Action | Expected |
|------|--------|----------|
| Re-link button visible | Discord-primary user opens Edit Profile | "Re-link" button shown next to Discord username |
| Re-link button hidden | Google user opens Edit Profile | No "Re-link" button (they see Link/Unlink instead) |
| Confirm dialog | Click "Re-link" | Confirmation dialog: "Link a different Discord account?" |
| Cancel confirm | Click Cancel on dialog | Nothing happens, button still enabled |
| Loading state | Confirm re-link | Button shows "Linking...", disabled |
| Success | Complete OAuth with new Discord | New username/ID displayed, success toast |
| Error: popup blocked | Browser blocks popup | Error message about enabling popups |
| Error: OAuth denied | User denies Discord access | Error message, button resets |
| Error: duplicate | New Discord ID already linked | Error: "This Discord account is already linked to another user" |

### Backend Tests

| Test | Action | Expected |
|------|--------|----------|
| No backend changes | — | Existing `discordOAuthExchange` linkOnly tests still pass |
| Duplicate check | Re-link to Discord ID owned by another user | Returns error |
| Same account | Re-link to same Discord account | Updates timestamp, no error |

### Integration Tests

| Test | Flow | Validation |
|------|------|------------|
| Full re-link | Click Re-link → OAuth → new account | Firestore user doc has new Discord fields |
| Team roster sync | Re-link → check team docs | playerRoster entries have new photoURL |
| Avatar update | Re-link to account with different avatar | photoURL updated in user doc + team rosters |

---

## 8. Common Pitfalls

- [ ] **Forgetting to attach the relink event listener** — `_attachDiscordEventListeners()` must handle `#relink-discord-btn`
- [ ] **Not updating cache after re-link** — `_userProfile` must reflect new Discord data immediately
- [ ] **Re-rendering wrong section** — Must re-render Case 1 (Discord-primary), not switch to Case 3 (no Discord)
- [ ] **Not handling dev mode** — `relinkDiscordAccount()` needs dev mode bypass like `linkDiscordAccount()`

---

## 9. Implementation Notes

### Order of Implementation
1. **AuthService.js** — Add `relinkDiscordAccount()` method (trivial: wraps `linkDiscordAccount()`)
2. **ProfileModal.js** — Update Case 1 rendering to include "Re-link" button
3. **ProfileModal.js** — Add `_handleRelinkDiscord()` handler
4. **ProfileModal.js** — Update `_attachDiscordEventListeners()` to attach relink handler
5. Test on production (OAuth requires real Discord app)

### Key Reuse Points
- **OAuth popup** — Same as `linkDiscordAccount()` / `signInWithDiscord()`
- **Cloud Function** — `discordOAuthExchange` with `linkOnly: true` (unchanged)
- **Callback page** — No changes
- **Team roster update** — Already handled by Cloud Function

### Why No Backend Changes
The `linkOnly` path in `discordOAuthExchange` (discord-auth.js ~line 112-172):
1. Gets `callerUid` from `context.auth.uid` ← Discord-primary users have this
2. Exchanges OAuth code for Discord user data ← Same flow
3. Checks duplicate Discord ID ← Same validation needed
4. Updates user doc fields ← Exactly what re-link needs
5. Updates team rosters ← Exactly what re-link needs

The only assumption is `context.auth.uid` exists, which is true for all authenticated users regardless of provider.

### Files to Modify

| File | Changes |
|------|---------|
| `public/js/services/AuthService.js` | Add `relinkDiscordAccount()` method (~10 lines) |
| `public/js/components/ProfileModal.js` | Update Case 1 rendering + add handler (~30 lines) |

### Files That Need NO Changes
| File | Why |
|------|-----|
| `functions/discord-auth.js` | `linkOnly` flow handles re-link as-is |
| `functions/index.js` | No new exports |
| `public/auth/discord/callback.html` | Reused as-is |
| `firestore.rules` | No new collections/operations |
| `context/SCHEMA.md` | No new fields |

---

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: The "Re-link" button uses the same subtle styling as the existing "Unlink" button (small text, not a prominent button) since it's a rare action
- **Rationale**: Consistent with existing Discord section UI; avoids drawing attention to a rarely-needed feature
- **Alternative**: Could use a more prominent button with Discord branding, but that would clutter the read-only display
