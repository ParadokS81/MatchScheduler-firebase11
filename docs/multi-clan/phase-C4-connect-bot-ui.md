# Phase C4: Connect Bot UI — MatchScheduler Side

## Context

With quad now supporting multiple teams per Discord server (C1-C3), the MatchScheduler "Connect Bot" UI needs to detect when the bot is already in a server the user belongs to, and adjust the instructions accordingly. Instead of always showing "Invite Bot →", it should say "The bot is already in [ServerName]. Run /register in your team's channel."

Read `COMMUNITY-SERVER-CONTRACT.md` for the full contract.

---

## What Changes

1. **Cloud Function** returns a list of guild names where the bot is already present and the user is a member
2. **TeamManagementModal** shows two variants of the pending instructions based on this list
3. **Instructions text** updated: "Run /register in your team's channel" (not "in any channel")

---

## Files to Modify

### 1. `functions/bot-registration.js`

#### Update `_handleConnect()` to return `botAlreadyInGuilds`

After creating the pending registration (around line 112), query all active registrations and check if the user's Discord ID appears in any `guildMembers` cache:

```javascript
async function _handleConnect(userId, teamId, team) {
    // ... existing validation (lines 70-84) ...

    // ... existing registration creation (lines 86-112) ...

    // NEW: Check if bot is already in servers this user belongs to
    const botAlreadyInGuilds = [];
    try {
        const activeRegs = await db.collection('botRegistrations')
            .where('status', '==', 'active')
            .get();

        const userDiscordId = user.discordUserId;
        const seenGuilds = new Set(); // Deduplicate by guildId (multiple teams per guild)

        for (const regDoc of activeRegs.docs) {
            const regData = regDoc.data();
            if (!regData.guildId || seenGuilds.has(regData.guildId)) continue;

            // Check if user's Discord ID is in this guild's member cache
            if (regData.guildMembers && regData.guildMembers[userDiscordId]) {
                botAlreadyInGuilds.push({
                    guildId: regData.guildId,
                    guildName: regData.guildName || 'Unknown Server',
                });
                seenGuilds.add(regData.guildId);
            }
        }
    } catch (err) {
        // Non-fatal — just don't show the hint
        console.warn('Failed to check existing guild memberships:', err.message);
    }

    return {
        success: true,
        registration: {
            ...registration,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        botAlreadyInGuilds,  // NEW
    };
}
```

**Performance note:** This queries ALL active registrations. At current scale (~40 teams), this is fine. If it grows, add a Firestore composite index or cache active registrations.

---

### 2. `public/js/services/BotRegistrationService.js`

#### Store `botAlreadyInGuilds` from connect response

Update `connectBot()` (around line 50-66) to pass through the guild list:

```javascript
async function connectBot(teamId) {
    // ... existing code ...
    const result = await manageBotRegistration({ action: 'connect', teamId });

    if (result.data.success) {
        const regData = {
            ...result.data.registration,
            botAlreadyInGuilds: result.data.botAlreadyInGuilds || [],  // NEW
        };
        _cache.set(teamId, regData);
        return regData;
    }

    throw new Error(result.data.error || 'Failed to connect bot');
}
```

---

### 3. `public/js/components/TeamManagementModal.js`

#### Update `_renderVoiceBotSection()` pending state (lines 725-752)

Replace the pending state HTML to show two variants:

```javascript
if (_botRegistration.status === 'pending') {
    const inviteUrl = typeof BotRegistrationService !== 'undefined'
        ? BotRegistrationService.getBotInviteUrl()
        : '#';

    const alreadyInGuilds = _botRegistration.botAlreadyInGuilds || [];

    let instructionsHtml;
    if (alreadyInGuilds.length > 0) {
        // Variant B: Bot already in server(s) the user is in
        const guildList = alreadyInGuilds
            .map(g => `<li class="text-foreground font-medium">${_escapeHtml(g.guildName)}</li>`)
            .join('');

        instructionsHtml = `
            <p class="text-xs text-foreground mb-2">The bot is already in:</p>
            <ul class="text-xs mb-2 list-disc list-inside">${guildList}</ul>
            <p class="text-xs text-muted-foreground">
                Run <code class="bg-muted px-1 py-0.5 rounded text-foreground">/register</code>
                in your team's channel to link this squad.
            </p>
            <div class="mt-2 pt-2 border-t border-border">
                <p class="text-xs text-muted-foreground">
                    Or invite to a different server:
                    <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer"
                       class="text-primary hover:underline ml-1">Invite Bot &rarr;</a>
                </p>
            </div>
        `;
    } else {
        // Variant A: Bot not in any of user's servers (same as today, with updated wording)
        instructionsHtml = `
            <p class="text-xs text-foreground">Complete setup in Discord:</p>
            <ol class="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>
                    Add the bot to your server
                    <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer"
                       class="text-primary hover:underline ml-1">Invite Bot &rarr;</a>
                </li>
                <li>Run <code class="bg-muted px-1 py-0.5 rounded text-foreground">/register</code> in your team's channel</li>
            </ol>
        `;
    }

    return `
        <div id="voice-bot-section">
            <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-foreground">Quad Bot</label>
                <span class="text-xs text-amber-500 font-medium">Pending</span>
            </div>
            <div class="mt-1 p-3 bg-muted/50 border border-border rounded-lg space-y-2">
                ${instructionsHtml}
            </div>
            <button id="voice-bot-cancel-btn"
                    class="mt-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors">
                Cancel
            </button>
        </div>
    `;
}
```

#### Also update connected state to show channel scoping info

When status is 'active' and `registeredChannelId` exists, show which channel the bot is scoped to:

In the connected state section (around line 755-777), after the guild name display, add:

```javascript
const channelInfo = _botRegistration.registeredCategoryName
    ? `<p class="text-xs text-muted-foreground">Scoped to: ${_escapeHtml(_botRegistration.registeredCategoryName)}</p>`
    : '';
```

And include `${channelInfo}` in the connected state HTML after the guild name paragraph.

---

### 4. Also update `public/js/mobile/MobileTeamTab.js`

Apply the same pending-state changes to the mobile version. The mobile tab has a similar `_renderVoiceBotSection()` function. Mirror the changes from `TeamManagementModal.js`.

---

## Verification

1. **Deploy functions**: `cd functions && npm run deploy` (or `npm run deploy:functions` from root)
2. **Normal clan flow**: Click "Connect Bot" for a team where the bot isn't in any of the user's servers. Should see the standard invite link + instructions (Variant A).
3. **Community flow**: Click "Connect Bot" for a team where the user IS in a Discord server that already has the bot registered. Should see Variant B: "The bot is already in [ServerName]" with the invite link deprioritized.
4. **Multiple servers**: User is in 2 Discord servers with the bot. Both should be listed.
5. **Connected state**: After registration completes, verify the connected state shows the category scope if applicable.

---

## What's NOT in this phase

- quad changes — those are C1-C3
- Auto-record UI changes — auto-record isn't implemented yet
- Community admin dashboard — not in scope per contract
