# Slice 4.3.2: Discord Linking for Google Users + Account Unification

## 1. Slice Definition

| Field | Value |
|-------|-------|
| **ID** | 4.3.2 |
| **Name** | Discord Linking for Google Users + Account Unification |
| **Priority** | High |
| **Complexity** | Medium-High |
| **Dependencies** | Slice 4.3.1 (Discord OAuth Foundation) - COMPLETED |

### User Story
As a Google-authenticated user, I can link my Discord account for avatars and direct messaging capabilities, enabling better team leader coordination.

As a user who previously signed up with Google, I can sign in with Discord and have my accounts unified seamlessly (if Discord provides matching email).

### Success Criteria
- [ ] Google users can link Discord account via OAuth flow in Edit Profile modal
- [ ] "Link Discord" button initiates OAuth popup (same flow as 4.3.1)
- [ ] OAuth successfully exchanges code for Discord user data
- [ ] Linked status displays with Discord username and unlink option
- [ ] Post-signup prompt shown in Edit Profile modal for new Google users
- [ ] Unlink option removes Discord data from profile
- [ ] Avatar updates to Discord avatar after linking
- [ ] **NEW:** Discord sign-in with email scope detects existing Google accounts
- [ ] **NEW:** Email match prompts user to link accounts instead of creating duplicate
- [ ] **NEW:** New Discord users shown "Have a Google account?" prompt

---

## 2. PRD Mapping

### Primary PRD Sections
- **PRD 1.2** (lines 93-149): Authenticated User - Discord Account Linking flow
- **PRD 4.4.1** (lines 800-834): Edit Profile Modal - Discord account section

### Dependent Sections
- **PRD 4.2**: User Profile data model (Discord fields already defined)
- Slice 4.3.1: Discord OAuth Foundation (provides OAuth infrastructure)

### Ignored for This Slice
- Custom avatar uploads (Slice 4.3.3)
- Discord bot integration (future)

---

## 3. Account Unification Strategy

### The Problem
Without unification, users can accidentally create duplicate accounts:
1. Sign up with Google (`david@gmail.com`) → UID: `abc123`
2. Later, sign in with Discord (never linked) → Creates NEW UID: `xyz789`
3. User now has two accounts with separate teams/data

### The Solution: Email-Based Detection + User Prompt

#### Flow 1: Discord Sign-In with Email Match
```
User clicks "Discord" sign-in
         ↓
Discord OAuth (scope: identify email)
         ↓
discordOAuthExchange receives Discord user
         ↓
Check 1: User with this discordUserId exists?
   YES → Log them in (existing flow)
   NO  → Continue to Check 2
         ↓
Check 2: User with matching email exists?
   YES → Return { requiresLinking: true, existingEmail, discordUser }
   NO  → Create new user (existing flow)
         ↓
Frontend receives requiresLinking response
         ↓
Show modal: "Found existing account with david@gmail.com"
            [Link to existing account] [Create new account anyway]
         ↓
If "Link": User signs in with Google, then we link Discord
If "New": Create separate Discord account (their choice)
```

#### Flow 2: New Discord User Warning
```
New Discord user created (no email match)
         ↓
After sign-in, show toast/prompt:
"Have a Google account? Link it in Edit Profile to avoid duplicate accounts"
```

### OAuth Scope Change
**Current:** `scope: 'identify'` - Only gets username, ID, avatar
**New:** `scope: 'identify email'` - Also gets email (if user has verified email)

Note: Discord email is optional - users may not have verified email. Handle gracefully.

---

## 4. Full Stack Architecture

### Frontend Changes

#### ProfileModal.js - Discord Section Enhancement

**Current State:** Manual entry fields for Discord username/ID, or "Linked via Discord sign-in" message

**New State:**
1. If user signed in via Discord → Show "Linked via Discord sign-in" (read-only)
2. If user signed in via Google + has linked Discord → Show linked status with Unlink button
3. If user signed in via Google + no Discord linked → Show "Link Discord Account" button
4. New Google users → Show prompt encouraging Discord linking

#### AuthService.js - New Method

Add `linkDiscordAccount()` method that:
- Opens Discord OAuth popup (reuse existing popup logic)
- Exchanges code via `discordOAuthExchange` Cloud Function
- Updates user profile with Discord data (NOT sign-in - user already authenticated)
- Returns Discord user info

### Backend Changes

#### discordOAuthExchange Modification
Add email-based account detection when no `discordUserId` match found:

```javascript
// After checking for existing user by discordUserId...
if (existingUserQuery.empty) {
    // Check 2: Look for email match (account unification)
    if (discordUser.email) {
        const emailMatchQuery = await usersRef
            .where('email', '==', discordUser.email)
            .limit(1)
            .get();

        if (!emailMatchQuery.empty) {
            // Found existing account with same email - prompt linking
            console.log(`Found existing account with email: ${discordUser.email}`);
            return {
                success: false,
                requiresLinking: true,
                existingEmail: discordUser.email,
                discordUser: {
                    username: discordUser.username,
                    id: discordUser.id,
                    avatar: discordUser.avatar
                }
            };
        }
    }

    // No match - create new user (existing flow)
    // ...
}
```

#### OAuth Scope Update
Change from `identify` to `identify email` in AuthService.js:
```javascript
scope: 'identify email',  // Now includes email for account unification
```

**Other Functions - No Changes:**
- `updateProfile` - Already handles Discord field updates/clears

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DISCORD LINKING FLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ProfileModal                 AuthService              Cloud Func   │
│  ───────────                 ───────────              ───────────   │
│       │                           │                        │        │
│  [Link Discord]                   │                        │        │
│       │──────────────────────────>│                        │        │
│       │    linkDiscordAccount()   │                        │        │
│       │                           │                        │        │
│       │                    ┌──────┴──────┐                 │        │
│       │                    │ Open Popup  │                 │        │
│       │                    │ Discord     │                 │        │
│       │                    │ OAuth       │                 │        │
│       │                    └──────┬──────┘                 │        │
│       │                           │                        │        │
│       │                    callback.html                   │        │
│       │                    postMessage(code)               │        │
│       │                           │                        │        │
│       │                           │────────────────────────>│       │
│       │                           │  discordOAuthExchange  │        │
│       │                           │                        │        │
│       │                           │        ┌───────────────┤        │
│       │                           │        │ Discord API   │        │
│       │                           │        │ Get user info │        │
│       │                           │        └───────────────┤        │
│       │                           │                        │        │
│       │                           │        ┌───────────────┤        │
│       │                           │        │ Update        │        │
│       │                           │        │ Firestore     │        │
│       │                           │        │ /users/{uid}  │        │
│       │                           │        └───────────────┤        │
│       │                           │<────────────────────────│       │
│       │                           │  { success, user }     │        │
│       │<──────────────────────────│                        │        │
│       │    Discord data returned  │                        │        │
│       │                           │                        │        │
│  ┌────┴────┐                      │                        │        │
│  │ Update  │                      │                        │        │
│  │ Modal   │                      │                        │        │
│  │ UI      │                      │                        │        │
│  └─────────┘                      │                        │        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Integration Code Examples

### UserProfile.js - Handle Linking Required Response

```javascript
// In _handleDiscordSignIn, after calling discordOAuthExchange
async function _handleDiscordCallback(code) {
    // ... existing code ...

    const result = await discordOAuthExchange({ code, redirectUri });

    // NEW: Handle account unification prompt
    if (result.data.requiresLinking) {
        console.log('Account unification required');
        _showAccountLinkingModal(result.data);
        return; // Don't proceed with sign-in
    }

    // Existing flow continues...
    if (!result.data.success) {
        throw new Error(result.data.error || 'Discord authentication failed');
    }
    // ...
}

// NEW: Show modal for account linking decision
function _showAccountLinkingModal(linkingData) {
    const { existingEmail, discordUser } = linkingData;

    // Create modal HTML
    const modalHtml = `
        <div id="account-linking-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div class="bg-card rounded-lg p-6 max-w-md mx-4 shadow-xl">
                <h3 class="text-lg font-semibold text-foreground mb-4">
                    Existing Account Found
                </h3>
                <p class="text-sm text-muted-foreground mb-4">
                    We found an existing account with <strong>${existingEmail}</strong>.
                    Would you like to link your Discord account (${discordUser.username}) to it?
                </p>
                <div class="flex flex-col gap-2">
                    <button id="link-existing-btn"
                        class="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                        Link to Existing Account
                    </button>
                    <button id="create-new-btn"
                        class="w-full py-2 px-4 bg-muted text-muted-foreground rounded-md hover:bg-muted/80">
                        Create Separate Account
                    </button>
                    <button id="cancel-linking-btn"
                        class="w-full py-2 px-4 text-muted-foreground hover:text-foreground">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Attach handlers
    document.getElementById('link-existing-btn').addEventListener('click', async () => {
        _closeAccountLinkingModal();
        // Sign in with Google, then link Discord
        try {
            await AuthService.signInWithGoogle();
            // After Google sign-in, link the Discord account
            await AuthService.linkDiscordAccount();
            ToastService.showSuccess('Accounts linked successfully!');
        } catch (error) {
            ToastService.showError('Failed to link accounts: ' + error.message);
        }
    });

    document.getElementById('create-new-btn').addEventListener('click', async () => {
        _closeAccountLinkingModal();
        // Force create new account (pass flag to skip email check)
        try {
            await AuthService.signInWithDiscord({ forceNew: true });
        } catch (error) {
            ToastService.showError('Failed to create account: ' + error.message);
        }
    });

    document.getElementById('cancel-linking-btn').addEventListener('click', () => {
        _closeAccountLinkingModal();
    });
}

function _closeAccountLinkingModal() {
    const modal = document.getElementById('account-linking-modal');
    if (modal) modal.remove();
}
```

### ProfileModal.js - Discord Section Rendering

```javascript
// In _renderDiscordSection() or equivalent
function _renderDiscordSection() {
    const isDiscordAuth = _userProfile?.authProvider === 'discord';
    const hasLinkedDiscord = _userProfile?.discordUserId && !isDiscordAuth;
    const isNewGoogleUser = _mode === 'create' && !isDiscordAuth;

    if (isDiscordAuth) {
        // User signed in with Discord - read-only display
        return `
            <div class="discord-section">
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="#5865F2">
                        <!-- Discord icon -->
                    </svg>
                    <span>Linked via Discord sign-in: ${_userProfile.discordUsername}</span>
                </div>
            </div>
        `;
    }

    if (hasLinkedDiscord) {
        // Google user with linked Discord - show unlink option
        return `
            <div class="discord-section">
                <label class="block text-sm font-medium text-foreground mb-2">
                    Discord Account
                </label>
                <div class="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="#5865F2">
                            <!-- Discord icon -->
                        </svg>
                        <span class="text-sm">${_userProfile.discordUsername}</span>
                        <span class="text-xs text-green-500">✓ Linked</span>
                    </div>
                    <button type="button" id="unlink-discord-btn"
                        class="text-sm text-muted-foreground hover:text-destructive transition-colors">
                        Unlink
                    </button>
                </div>
            </div>
        `;
    }

    // Google user without Discord - show link button
    return `
        <div class="discord-section">
            <label class="block text-sm font-medium text-foreground mb-2">
                Discord Account ${isNewGoogleUser ? '(Recommended)' : '(Optional)'}
            </label>
            ${isNewGoogleUser ? `
                <p class="text-xs text-muted-foreground mb-2">
                    Link your Discord for avatar sync and easier team coordination
                </p>
            ` : ''}
            <button type="button" id="link-discord-btn"
                class="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors"
                style="background-color: #5865F2; color: white;">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <!-- Discord icon -->
                </svg>
                <span>Link Discord Account</span>
            </button>
        </div>
    `;
}
```

### AuthService.js - Link Discord Method

```javascript
/**
 * Link Discord account to existing authenticated user (Google users)
 * Reuses OAuth popup flow but doesn't sign in - just gets Discord data
 */
async function linkDiscordAccount() {
    // Dev mode - simulate linking
    if (_isDevMode) {
        console.log('🔧 DEV MODE: Simulating Discord link');
        return {
            success: true,
            user: {
                discordUsername: 'dev-discord-user',
                discordUserId: '123456789012345678',
                discordAvatarHash: null
            }
        };
    }

    // Get Discord config
    const { clientId, redirectUri } = _getDiscordConfig();

    if (!clientId) {
        throw new Error('Discord linking is not configured');
    }

    // Build Discord OAuth URL
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify',
        prompt: 'consent'
    });

    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params}`;

    // Open popup
    const popup = window.open(
        discordAuthUrl,
        'discord-oauth',
        'width=500,height=700,menubar=no,toolbar=no,location=no,status=no'
    );

    if (!popup) {
        throw new Error('Popup was blocked. Please allow popups for this site.');
    }

    // Wait for callback
    return new Promise((resolve, reject) => {
        const handleMessage = async (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data.type !== 'discord-oauth-callback') return;

            window.removeEventListener('message', handleMessage);

            try { popup.close(); } catch (e) {}

            if (event.data.error) {
                reject(new Error(event.data.error));
                return;
            }

            if (!event.data.code) {
                reject(new Error('No authorization code received'));
                return;
            }

            try {
                // Exchange code for Discord user data
                const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
                const functions = window.firebase.functions;

                const discordOAuthExchange = httpsCallable(functions, 'discordOAuthExchange');
                const result = await discordOAuthExchange({
                    code: event.data.code,
                    redirectUri: redirectUri
                });

                if (!result.data.success) {
                    throw new Error(result.data.error || 'Discord linking failed');
                }

                console.log('✅ Discord account linked successfully');

                resolve({
                    success: true,
                    user: result.data.user
                });

            } catch (error) {
                console.error('❌ Discord linking error:', error);
                reject(new Error(error.message || 'Failed to link Discord account'));
            }
        };

        window.addEventListener('message', handleMessage);

        // Timeout after 5 minutes
        setTimeout(() => {
            window.removeEventListener('message', handleMessage);
            try { popup.close(); } catch (e) {}
            reject(new Error('Discord linking timed out'));
        }, 300000);
    });
}
```

### ProfileModal.js - Event Handlers

```javascript
// Attach event listeners
function _attachDiscordEventListeners() {
    const linkBtn = _modal.querySelector('#link-discord-btn');
    const unlinkBtn = _modal.querySelector('#unlink-discord-btn');

    if (linkBtn) {
        linkBtn.addEventListener('click', _handleLinkDiscord);
    }

    if (unlinkBtn) {
        unlinkBtn.addEventListener('click', _handleUnlinkDiscord);
    }
}

// Handle link Discord click
async function _handleLinkDiscord() {
    const btn = _modal.querySelector('#link-discord-btn');
    const originalContent = btn.innerHTML;

    // Show loading state
    btn.disabled = true;
    btn.innerHTML = `
        <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
        <span>Linking...</span>
    `;

    try {
        const result = await AuthService.linkDiscordAccount();

        if (result.success) {
            // Update form fields with Discord data
            const usernameInput = _modal.querySelector('#discordUsername');
            const userIdInput = _modal.querySelector('#discordUserId');

            if (usernameInput) usernameInput.value = result.user.discordUsername || '';
            if (userIdInput) userIdInput.value = result.user.discordUserId || '';

            // Re-render Discord section to show linked status
            _renderDiscordSectionUpdate(result.user);

            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Discord account linked!');
            }
        }
    } catch (error) {
        console.error('❌ Discord linking failed:', error);
        _showError(error.message);

        // Reset button
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// Handle unlink Discord click
async function _handleUnlinkDiscord() {
    if (!confirm('Unlink your Discord account? You can re-link it anytime.')) {
        return;
    }

    const btn = _modal.querySelector('#unlink-discord-btn');
    btn.disabled = true;
    btn.textContent = 'Unlinking...';

    try {
        // Clear Discord fields in the form
        const usernameInput = _modal.querySelector('#discordUsername');
        const userIdInput = _modal.querySelector('#discordUserId');

        if (usernameInput) usernameInput.value = '';
        if (userIdInput) userIdInput.value = '';

        // Save immediately to clear Discord data
        await AuthService.updateProfile({
            discordUsername: '',
            discordUserId: ''
        });

        // Re-render to show "Link Discord" button
        _rerenderDiscordSection();

        if (typeof ToastService !== 'undefined') {
            ToastService.showSuccess('Discord account unlinked');
        }
    } catch (error) {
        console.error('❌ Discord unlinking failed:', error);
        _showError('Failed to unlink Discord account');

        btn.disabled = false;
        btn.textContent = 'Unlink';
    }
}
```

---

## 5. Performance Classification

### Hot Paths (Must be instant)
- **None** - Discord linking is an infrequent operation

### Cold Paths (Can show loading)
- **Link Discord button click** - Opens popup, shows spinner on button
- **OAuth exchange** - User waits for Discord API response
- **Unlink confirmation** - Quick confirmation + API call

### Caching Strategy
- Discord data stored in Firestore user document
- `_userProfile` in ProfileModal already caches profile data
- Avatar URL constructed client-side from stored hash

---

## 6. Test Scenarios

### Frontend Tests

| Test | Action | Expected Result |
|------|--------|-----------------|
| Link button visible | Google user opens Edit Profile | "Link Discord Account" button shown |
| Link button hidden | Discord user opens Edit Profile | "Linked via Discord sign-in" shown |
| Popup opens | Click "Link Discord" | Discord OAuth popup opens |
| Link success | Complete OAuth flow | Discord username shown, Unlink button appears |
| Link error | OAuth rejected/fails | Error message shown, button resets |
| Unlink confirmation | Click "Unlink" | Confirmation dialog appears |
| Unlink success | Confirm unlink | Discord data cleared, Link button shown |
| New user prompt | New Google user creates profile | "(Recommended)" label on Discord section |
| **Account linking modal** | Discord sign-in with email match | Modal shows with link/create options |
| **Link to existing** | Click "Link to Existing Account" | Google sign-in triggered, Discord linked |
| **Create new anyway** | Click "Create Separate Account" | New Discord account created |
| **Cancel linking** | Click "Cancel" | Modal closes, no action |

### Backend Tests

| Test | Action | Expected Result |
|------|--------|-----------------|
| OAuth exchange | Valid code + existing user by discordId | Updates user document with Discord data |
| Email match detection | Discord email matches existing user | Returns `requiresLinking: true` |
| No email match | New Discord user, no email match | Creates new user normally |
| Force new user | `forceNew: true` flag passed | Creates new user even with email match |
| Invalid code | Expired/bad code | Returns error, doesn't modify user |
| Update profile | Clear Discord fields | Discord fields removed from document |

### Integration Tests

| Test | Flow | Validation |
|------|------|------------|
| Full link flow | Click Link → OAuth → Complete | Discord data in Firestore, UI updated |
| Link then unlink | Link → Unlink | Discord data cleared, UI shows Link button |
| Avatar update | Link Discord | photoURL updated to Discord avatar |
| **Account unification** | Google user → Discord sign-in → Link | Single account with both auth methods |
| **Separate accounts** | Google user → Discord sign-in → Create New | Two separate accounts (user's choice) |

---

## 7. Common Pitfalls

### 1. Duplicate OAuth Flow
**Wrong:** Creating new popup/callback handling
**Right:** Reuse `_getDiscordConfig()`, `discordOAuthExchange`, and callback page from 4.3.1

### 2. Signing In During Link
**Wrong:** Calling `signInWithCustomToken` after linking (would switch auth)
**Right:** Just update profile data - user remains Google-authenticated

### 3. Forgetting Dev Mode
**Wrong:** Attempting real OAuth in local development
**Right:** Add dev mode bypass in `linkDiscordAccount()` that returns mock data

### 4. Not Updating Avatar
**Wrong:** Linking Discord but keeping old avatar
**Right:** `discordOAuthExchange` already updates `photoURL` field

### 5. UI State After Link
**Wrong:** User must refresh to see linked status
**Right:** Re-render Discord section immediately after successful link

---

## 8. Implementation Notes

### Order of Implementation
1. Add `linkDiscordAccount()` to AuthService.js
2. Update ProfileModal.js Discord section rendering
3. Add event handlers for link/unlink buttons
4. Test full flow on production (OAuth requires real Discord app)
5. Verify avatar updates after linking

### Key Reuse Points
- **OAuth popup logic** - Same as `signInWithDiscord()` minus the `signInWithCustomToken`
- **Cloud Function** - `discordOAuthExchange` handles both sign-in and linking
- **Callback page** - No changes needed
- **Profile update** - `AuthService.updateProfile()` already handles Discord fields

### Backend Behavior Note
The `discordOAuthExchange` function at [discord-auth.js:132-144](functions/discord-auth.js#L132-L144) already handles the "existing user" case by:
1. Finding user by `discordUserId` match
2. Updating `discordUsername`, `discordAvatarHash`, `photoURL`
3. Returning success with user data

For Google users linking Discord, this creates/updates their Discord data seamlessly.

### Security Considerations
- OAuth flow validates through Discord's servers
- Cloud Function runs with admin privileges
- User can only modify their own document (security rules)
- Discord Client Secret never exposed to frontend

---

## 9. Files to Modify

| File | Changes |
|------|---------|
| `public/js/services/AuthService.js` | Add `linkDiscordAccount()`, update scope to `identify email`, add `forceNew` flag support |
| `public/js/components/ProfileModal.js` | Update Discord section rendering, add link/unlink handlers |
| `public/js/components/UserProfile.js` | Add account linking modal, handle `requiresLinking` response |
| `functions/discord-auth.js` | Add email-based account detection in `discordOAuthExchange` |

### Files That Need NO Changes
- `functions/user-profile.js` - Already handles Discord field updates
- `public/auth/discord/callback.html` - Reused as-is
- `context/SCHEMA.md` - Discord fields already defined

---

## 10. Account Unification Edge Cases

| Scenario | Handling |
|----------|----------|
| Discord user has no email | Skip email check, create new user (with warning prompt) |
| Email match but different person | User can choose "Create Separate Account" |
| User already has Discord linked | Sign in works normally (by discordUserId) |
| User cancels linking modal | Nothing happens, stays logged out |
| Google sign-in fails during link | Show error, offer retry |

### Important Notes

1. **Email scope is optional on Discord's side** - Users can choose not to share email. We handle this gracefully by skipping the email check.

2. **We never auto-merge accounts** - Always prompt user for explicit consent. They may intentionally want separate accounts.

3. **The `forceNew` flag** - When user chooses "Create Separate Account", we pass this to skip the email check on retry.

4. **Data ownership** - If user creates separate accounts, their Google account data (teams, availability) stays separate from Discord account. No data migration.
