# Slice 4.3.1: Discord OAuth Foundation

## 1. Slice Definition

- **Slice ID:** 4.3.1
- **Name:** Discord OAuth Foundation - Dual Auth Sign-In
- **User Story:** As a new user, I can sign in with Discord (preferred) or Google, so that I can access MatchScheduler with my existing gaming identity and enable future Discord integrations.
- **Success Criteria:**
  - User can sign in with Discord OAuth and have a new account created
  - User can sign in with Google OAuth (existing flow preserved)
  - Sign-in screen nudges users toward Discord with clear benefits messaging
  - Discord user data (username, ID, avatar hash) stored in user profile
  - Dev mode continues to work for local development

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 1.2: Authenticated User - Discord Account Linking (OAuth flow, data storage)
- 4.4.1: Edit Profile Modal - Discord Account Section (linked status display)

DEPENDENT SECTIONS:
- 3.5: Comparison Details Modal (already uses Discord data for contact UI)
- 2.5: Team View Display (avatar toggle already built)

IGNORED FOR THIS SLICE (Future 4.3.2/4.3.3):
- Discord linking for existing Google users (4.3.2)
- Avatar manager and custom uploads (4.3.3)
- "Expose my Discord" privacy toggle (4.5)
- Bot integrations (future)
```

---

## 3. Full Stack Architecture

### FRONTEND COMPONENTS:

**SignInScreen (NEW)**
- Firebase listeners: None (pre-auth)
- Cache interactions: None
- UI responsibilities:
  - Discord sign-in button (prominent, primary)
  - Google sign-in button (secondary)
  - Benefits messaging for Discord ("Recommended - enables avatars & direct messaging")
- User actions:
  - Click "Sign in with Discord" → OAuth popup flow
  - Click "Sign in with Google" → Existing flow

**ProfileModal (MODIFY)**
- Firebase listeners: User document (existing)
- Cache interactions: Reads from UserService cache
- UI responsibilities:
  - Show Discord linked status when signed in via Discord
  - Display Discord username with checkmark
- User actions: None new for 4.3.1 (linking flow is 4.3.2)

### FRONTEND SERVICES:

**AuthService (MODIFY)**
- New methods:
  - `signInWithDiscord()` → Initiates Discord OAuth popup
  - `handleDiscordCallback(code)` → Exchanges code via Cloud Function
- Existing methods preserved:
  - `signInWithGoogle()` → Unchanged
  - `onAuthStateChange()` → Works with both providers

### BACKEND REQUIREMENTS:

**Cloud Functions:**

1. **discordOAuthExchange** (NEW)
   - File: `/functions/discord-auth.js`
   - Purpose: Exchange Discord OAuth code for user data, create/link Firebase Auth
   - Parameters: `{ code: string, redirectUri: string }`
   - Validation:
     - Code is valid string
     - Redirect URI matches configured value
   - Operations:
     1. Exchange code for Discord access token (Discord API)
     2. Fetch Discord user profile (Discord API)
     3. Check if Firebase user exists with this Discord ID
     4. If exists: Return custom token for existing user
     5. If new: Create Firebase Auth user, create user document
   - Returns: `{ success: true, customToken: string, isNewUser: boolean }`
   - Error cases:
     - Invalid/expired code: `{ success: false, error: "Invalid authorization code" }`
     - Discord API error: `{ success: false, error: "Discord authentication failed" }`

2. **createProfile** (MODIFY existing)
   - File: `/functions/user-profile.js`
   - Add: Support for Discord-sourced profile data
   - New fields: `authProvider: "discord" | "google"`

**Firestore Operations:**
- Collection: `/users/{userId}`
- Create: New user document with Discord data
- Update: Existing user if re-linking

**Security Rules:**
```javascript
// Users can only read/write their own profile
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

**External Services:**
- Discord API: OAuth2 token exchange, user profile fetch
- Firebase Auth: Custom token generation, user creation

### INTEGRATION POINTS:

**Frontend → Backend calls:**
- `AuthService.signInWithDiscord()` → Opens popup, receives code
- `AuthService.handleDiscordCallback(code)` → Calls `discordOAuthExchange` Cloud Function
- Cloud Function returns custom token → `signInWithCustomToken(auth, token)`

**API Contracts:**

```javascript
// discordOAuthExchange
Request: {
  code: "abc123...",           // From Discord OAuth callback
  redirectUri: "https://..."   // Must match Discord app config
}

Success Response: {
  success: true,
  customToken: "eyJ...",       // Firebase custom token
  isNewUser: true,             // Show onboarding if true
  user: {
    discordUsername: "ParadokS",
    discordUserId: "123456789012345678",
    discordAvatarHash: "abc123def456"
  }
}

Error Response: {
  success: false,
  error: "Invalid authorization code"
}
```

**Real-time listeners:**
- User document listener (existing) - will receive Discord data after sign-in

**Data flow:**
```
Click "Sign in with Discord"
  → Open Discord OAuth popup
  → User authorizes
  → Redirect with code
  → discordOAuthExchange Cloud Function
  → Discord API (token + profile)
  → Create/find Firebase user
  → Return custom token
  → signInWithCustomToken
  → Auth state changes
  → App loads with user data
```

---

## 4. Integration Code Examples

### Discord OAuth Popup Flow (Frontend)

```javascript
// In AuthService.js
const AuthService = {
    DISCORD_CLIENT_ID: 'YOUR_CLIENT_ID', // From environment/config
    DISCORD_REDIRECT_URI: window.location.origin + '/auth/discord/callback',

    async signInWithDiscord() {
        // Build Discord OAuth URL
        const params = new URLSearchParams({
            client_id: this.DISCORD_CLIENT_ID,
            redirect_uri: this.DISCORD_REDIRECT_URI,
            response_type: 'code',
            scope: 'identify',  // Only need basic profile
            prompt: 'consent'
        });

        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params}`;

        // Open popup
        const popup = window.open(
            discordAuthUrl,
            'discord-oauth',
            'width=500,height=700,menubar=no,toolbar=no'
        );

        // Wait for callback
        return new Promise((resolve, reject) => {
            const handleMessage = async (event) => {
                if (event.origin !== window.location.origin) return;
                if (event.data.type !== 'discord-oauth-callback') return;

                window.removeEventListener('message', handleMessage);
                popup.close();

                if (event.data.error) {
                    reject(new Error(event.data.error));
                    return;
                }

                try {
                    const result = await this.handleDiscordCallback(event.data.code);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };

            window.addEventListener('message', handleMessage);

            // Timeout after 5 minutes
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('Discord sign-in timed out'));
            }, 300000);
        });
    },

    async handleDiscordCallback(code) {
        const { httpsCallable } = await import('firebase/functions');
        const discordOAuthExchange = httpsCallable(window.firebase.functions, 'discordOAuthExchange');

        const result = await discordOAuthExchange({
            code: code,
            redirectUri: this.DISCORD_REDIRECT_URI
        });

        if (!result.data.success) {
            throw new Error(result.data.error);
        }

        // Sign in with the custom token
        const { signInWithCustomToken } = await import('firebase/auth');
        await signInWithCustomToken(window.firebase.auth, result.data.customToken);

        return {
            isNewUser: result.data.isNewUser,
            user: result.data.user
        };
    }
};
```

### OAuth Callback Page (Frontend)

```html
<!-- /public/auth/discord/callback.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Discord Sign-In</title>
</head>
<body>
    <p>Completing sign-in...</p>
    <script>
        // Extract code from URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        // Send back to parent window
        if (window.opener) {
            window.opener.postMessage({
                type: 'discord-oauth-callback',
                code: code,
                error: error
            }, window.location.origin);
        } else {
            // Fallback: redirect to main app with code
            window.location.href = '/?discord_code=' + code;
        }
    </script>
</body>
</html>
```

### Cloud Function - Discord OAuth Exchange

```javascript
// /functions/discord-auth.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

const DISCORD_CLIENT_ID = functions.config().discord?.client_id;
const DISCORD_CLIENT_SECRET = functions.config().discord?.client_secret;
const DISCORD_API_BASE = 'https://discord.com/api/v10';

exports.discordOAuthExchange = functions.https.onCall(async (data, context) => {
    const { code, redirectUri } = data;

    // Validate inputs
    if (!code || typeof code !== 'string') {
        return { success: false, error: 'Invalid authorization code' };
    }

    try {
        // 1. Exchange code for access token
        const tokenResponse = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri
            })
        });

        if (!tokenResponse.ok) {
            console.error('Discord token exchange failed:', await tokenResponse.text());
            return { success: false, error: 'Discord authentication failed' };
        }

        const tokenData = await tokenResponse.json();

        // 2. Fetch Discord user profile
        const userResponse = await fetch(`${DISCORD_API_BASE}/users/@me`, {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        if (!userResponse.ok) {
            console.error('Discord user fetch failed:', await userResponse.text());
            return { success: false, error: 'Failed to get Discord profile' };
        }

        const discordUser = await userResponse.json();

        // 3. Check if user exists with this Discord ID
        const usersRef = admin.firestore().collection('users');
        const existingUserQuery = await usersRef
            .where('discordUserId', '==', discordUser.id)
            .limit(1)
            .get();

        let uid;
        let isNewUser = false;

        if (!existingUserQuery.empty) {
            // Existing user - get their Firebase UID
            uid = existingUserQuery.docs[0].id;

            // Update Discord data (in case username/avatar changed)
            await usersRef.doc(uid).update({
                discordUsername: discordUser.username,
                discordAvatarHash: discordUser.avatar,
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // New user - create Firebase Auth user
            const userRecord = await admin.auth().createUser({
                displayName: discordUser.username,
                // No email - Discord users may not share email
            });

            uid = userRecord.uid;
            isNewUser = true;

            // Create user document
            await usersRef.doc(uid).set({
                displayName: discordUser.username,
                initials: generateInitials(discordUser.username),
                email: discordUser.email || null,
                photoURL: discordUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                    : null,

                // Discord data
                discordUsername: discordUser.username,
                discordUserId: discordUser.id,
                discordAvatarHash: discordUser.avatar,
                discordLinkedAt: admin.firestore.FieldValue.serverTimestamp(),

                // Auth tracking
                authProvider: 'discord',

                // Initialize empty
                teams: {},
                favoriteTeams: [],

                // Timestamps
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // 4. Generate Firebase custom token
        const customToken = await admin.auth().createCustomToken(uid);

        return {
            success: true,
            customToken: customToken,
            isNewUser: isNewUser,
            user: {
                discordUsername: discordUser.username,
                discordUserId: discordUser.id,
                discordAvatarHash: discordUser.avatar
            }
        };

    } catch (error) {
        console.error('Discord OAuth error:', error);
        return { success: false, error: 'Authentication failed' };
    }
});

function generateInitials(username) {
    // Take first 2-3 characters, uppercase
    return username.substring(0, 2).toUpperCase();
}
```

### Sign-In Screen Component

```javascript
// /public/js/components/SignInScreen.js
const SignInScreen = (function() {

    function render() {
        const container = document.getElementById('sign-in-container');
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen bg-background">
                <div class="w-full max-w-sm p-8 bg-card rounded-lg border border-border">
                    <h1 class="text-2xl font-bold text-center mb-2">MatchScheduler</h1>
                    <p class="text-muted-foreground text-center mb-8">
                        Coordinate matches with your team
                    </p>

                    <!-- Discord (Primary) -->
                    <button id="discord-sign-in"
                            class="w-full flex items-center justify-center gap-3 px-4 py-3
                                   bg-[#5865F2] hover:bg-[#4752C4] text-white
                                   rounded-lg font-medium transition-colors mb-3">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                        Sign in with Discord
                    </button>
                    <p class="text-xs text-muted-foreground text-center mb-6">
                        Recommended - enables avatars & direct messaging
                    </p>

                    <div class="flex items-center gap-4 mb-6">
                        <div class="flex-1 h-px bg-border"></div>
                        <span class="text-sm text-muted-foreground">or</span>
                        <div class="flex-1 h-px bg-border"></div>
                    </div>

                    <!-- Google (Secondary) -->
                    <button id="google-sign-in"
                            class="w-full flex items-center justify-center gap-3 px-4 py-3
                                   bg-card hover:bg-muted border border-border
                                   rounded-lg font-medium transition-colors">
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                    </button>
                </div>
            </div>
        `;

        attachEventListeners();
    }

    function attachEventListeners() {
        document.getElementById('discord-sign-in').addEventListener('click', handleDiscordSignIn);
        document.getElementById('google-sign-in').addEventListener('click', handleGoogleSignIn);
    }

    async function handleDiscordSignIn() {
        const button = document.getElementById('discord-sign-in');
        button.disabled = true;
        button.innerHTML = `
            <svg class="animate-spin w-5 h-5" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Connecting to Discord...
        `;

        try {
            const result = await AuthService.signInWithDiscord();

            if (result.isNewUser) {
                // Show onboarding/profile creation
                ProfileModal.show('create', result.user);
            }
            // Auth state listener will handle the rest

        } catch (error) {
            console.error('Discord sign-in failed:', error);
            showToast(error.message || 'Sign-in failed', 'error');

            // Reset button
            button.disabled = false;
            button.innerHTML = `
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <!-- Discord icon SVG -->
                </svg>
                Sign in with Discord
            `;
        }
    }

    async function handleGoogleSignIn() {
        // Existing Google sign-in flow
        const button = document.getElementById('google-sign-in');
        button.disabled = true;

        try {
            const result = await AuthService.signInWithGoogle();
            if (result.isNewUser) {
                ProfileModal.show('create');
            }
        } catch (error) {
            console.error('Google sign-in failed:', error);
            showToast(error.message || 'Sign-in failed', 'error');
        } finally {
            button.disabled = false;
        }
    }

    return { render };
})();
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- None in this slice - auth is inherently a cold path

COLD PATHS (<2s acceptable, <5s tolerable):
- Discord OAuth popup opening: Immediate (browser handled)
- Discord authorization: User interaction (variable)
- Token exchange: 500ms-2s (Discord API + Firebase)
- User document creation: 200-500ms

BACKEND PERFORMANCE:
- Cloud Function cold starts: First Discord sign-in may take 2-3s
  - Mitigation: Not critical for auth (users expect some delay)
- No indexes required (query by discordUserId is rare)

LOADING STATES:
- Button shows spinner + "Connecting to Discord..." during OAuth
- No spinner during popup (user interacting with Discord)
```

---

## 6. Data Flow Diagram

```
DISCORD SIGN-IN FLOW:

User clicks "Sign in with Discord"
         │
         ▼
┌─────────────────┐
│ SignInScreen    │
│ handleDiscord() │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Opens popup      ┌──────────────────┐
│ AuthService     │ ──────────────────▶  │ Discord OAuth    │
│ signInWithDis() │                      │ authorize page   │
└────────┬────────┘                      └────────┬─────────┘
         │                                        │
         │        ◀── code via postMessage ───────┘
         │
         ▼
┌─────────────────┐
│ AuthService     │
│ handleCallback()│
└────────┬────────┘
         │ calls Cloud Function
         ▼
┌─────────────────┐                      ┌──────────────────┐
│ discordOAuth    │ ─── token request ─▶ │ Discord API      │
│ Exchange (CF)   │ ◀── access_token ─── │ /oauth2/token    │
└────────┬────────┘                      └──────────────────┘
         │
         │ fetch user profile
         ▼
┌─────────────────┐                      ┌──────────────────┐
│ discordOAuth    │ ─── GET /users/@me ─▶│ Discord API      │
│ Exchange (CF)   │ ◀── user data ────── │ user profile     │
└────────┬────────┘                      └──────────────────┘
         │
         │ create/find user
         ▼
┌─────────────────┐
│ Firebase Auth   │ ◀── createUser() if new
│ + Firestore     │ ◀── set user document
└────────┬────────┘
         │
         │ returns customToken
         ▼
┌─────────────────┐
│ AuthService     │
│ signInWithCust()│
└────────┬────────┘
         │
         │ auth state changes
         ▼
┌─────────────────┐
│ App.js          │
│ onAuthState()   │ ─── loads user data ─▶ App initializes
└─────────────────┘
```

---

## 7. Test Scenarios

### FRONTEND TESTS:
- [ ] Sign-in screen renders with both Discord and Google buttons
- [ ] Discord button is visually prominent (primary styling)
- [ ] "Recommended" messaging appears under Discord button
- [ ] Click Discord button → popup opens with Discord OAuth URL
- [ ] Click Google button → existing flow works unchanged
- [ ] Loading spinner shows on Discord button during auth
- [ ] Error message displays if OAuth fails

### BACKEND TESTS:
- [ ] `discordOAuthExchange` rejects missing code
- [ ] `discordOAuthExchange` rejects invalid code (Discord returns error)
- [ ] Valid code returns user data and custom token
- [ ] New user → Firebase Auth user created
- [ ] New user → Firestore document created with correct fields
- [ ] Existing user (same Discord ID) → returns existing user's token
- [ ] Existing user → Discord data updated (username/avatar may change)
- [ ] Custom token is valid and can be used with `signInWithCustomToken`

### INTEGRATION TESTS:
- [ ] Complete flow: Click Discord → popup → authorize → app loads
- [ ] New user flow: Sign in → profile modal opens in create mode
- [ ] Returning user flow: Sign in → goes directly to app
- [ ] Auth state listener fires after custom token sign-in
- [ ] User document contains correct Discord data after sign-in
- [ ] Dev mode still works (bypass OAuth, use emulator auth)

### END-TO-END TESTS:
- [ ] New user can sign up with Discord and create profile
- [ ] User can sign out and sign back in with Discord
- [ ] Google sign-in still works for users who prefer it
- [ ] Discord avatar URL is correctly formatted and accessible
- [ ] Multiple tabs: sign in on one → others detect auth state

---

## 8. Common Integration Pitfalls

- [ ] **Popup blocked**: Browser may block popup if not triggered by user click
  - Solution: Ensure `signInWithDiscord` is called directly from click handler

- [ ] **CORS on callback page**: Callback page must be on same origin
  - Solution: Use `/auth/discord/callback.html` on same domain

- [ ] **Discord API rate limits**: Too many requests from same IP
  - Solution: Cloud Function handles API calls (different IP per execution)

- [ ] **Custom token expiration**: Firebase custom tokens expire in 1 hour
  - Solution: Token is used immediately, not stored

- [ ] **Dev mode broken after adding OAuth**:
  - Solution: Check for dev mode BEFORE showing sign-in screen

- [ ] **Missing Discord secrets in production**:
  - Solution: `firebase functions:config:set discord.client_id="..." discord.client_secret="..."`

---

## 9. Implementation Notes

### Discord Developer Portal Setup

1. Go to https://discord.com/developers/applications
2. Click "New Application" → Name it "MatchScheduler"
3. Go to "OAuth2" section
4. Copy **Client ID** (public, goes in frontend config)
5. Copy **Client Secret** (private, goes in Firebase Functions config)
6. Add Redirect URLs:
   - Development: `http://localhost:5000/auth/discord/callback`
   - Production: `https://your-domain.com/auth/discord/callback`
7. Scopes needed: `identify` only (we don't need email, guilds, etc.)

### Firebase Functions Config

```bash
# Set Discord credentials (run once per environment)
firebase functions:config:set discord.client_id="YOUR_CLIENT_ID"
firebase functions:config:set discord.client_secret="YOUR_CLIENT_SECRET"

# Verify config
firebase functions:config:get

# For local emulator, create .runtimeconfig.json
firebase functions:config:get > functions/.runtimeconfig.json
```

### Dev Mode Considerations

Dev mode should continue to work. The sign-in screen should detect dev mode and either:
1. Auto-sign-in with emulator auth (current behavior)
2. Show a "Dev Sign In" button that bypasses OAuth

```javascript
// In SignInScreen or App.js
if (window.APP_CONFIG?.DEV_MODE) {
    // Skip OAuth, use emulator auth
    await AuthService.devSignIn('dev-user-001');
    return;
}
```

### Dependencies

- **Firebase Admin SDK** in Cloud Functions (for `createCustomToken`)
- **node-fetch** or native fetch in Cloud Functions (Node 18+)
- No new frontend dependencies

### Similar Patterns

- **Logo upload** (Slice 4.1): Cloud Function processes external data, updates Firestore
- **Profile creation** (Slice 1.1): Creates user document with validation

---

## 10. Discord Avatar URL Construction

Discord avatars are constructed from user ID and avatar hash:

```javascript
// If user has custom avatar
const avatarUrl = `https://cdn.discordapp.com/avatars/${discordUserId}/${discordAvatarHash}.png`;

// If user has no custom avatar (default Discord avatar)
// The default avatar is based on discriminator or user ID
const defaultAvatar = `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUserId) % 5}.png`;

// Helper function
function getDiscordAvatarUrl(userId, avatarHash) {
    if (avatarHash) {
        return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`;
    }
    return `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;
}
```

Store only `discordAvatarHash` in Firestore (not full URL) - URLs can be constructed client-side and may change format.

---

## File Changes Summary

### New Files:
- `/public/auth/discord/callback.html` - OAuth callback handler
- `/functions/discord-auth.js` - Discord OAuth Cloud Function
- `/public/js/components/SignInScreen.js` - New sign-in UI

### Modified Files:
- `/public/js/services/AuthService.js` - Add Discord OAuth methods
- `/functions/index.js` - Export new Cloud Function
- `/public/index.html` - Replace old sign-in with SignInScreen
- `/functions/user-profile.js` - Handle Discord auth provider

### Config Files:
- Firebase Functions config (discord.client_id, discord.client_secret)
- `/functions/.runtimeconfig.json` - Local dev secrets
