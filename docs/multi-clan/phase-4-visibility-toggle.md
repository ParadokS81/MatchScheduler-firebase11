# Phase 4: Default Visibility Toggle — Multi-Clan Voice Replay

## Context

Phase 3 landed Firestore rules that enforce visibility on voice recordings: `public` recordings are readable by anyone, `private` recordings require team membership. The quad bot (Phase 2) already reads `teams/{teamId}.voiceSettings.defaultVisibility` at upload time and stamps each recording with the resolved visibility.

Currently, no team has `voiceSettings` set, so the bot defaults to `'private'` for all registered teams. This phase adds a simple toggle so leaders can choose.

Read `docs/multi-clan/CONTRACT.md` for the full schema reference.

---

## What to Build

### Visibility Toggle in Voice Bot Connected State

Add a toggle to the Voice Bot section of TeamManagementModal — visible only when the bot is **connected** (status: 'active'). Place it inside the connected state's info box, after the guild name display and before the Disconnect button.

**Behavior:**
- Toggle ON (right/green) = `'public'` — New recordings visible to everyone
- Toggle OFF (left/gray) = `'private'` — New recordings visible only to team members
- Default state: OFF (private) — matches the bot's default when `voiceSettings` is absent

**Copy:**
- Label: `"Default visibility"` (or `"Recording visibility"`)
- Sublabel when public: `"New recordings visible to everyone"`
- Sublabel when private: `"New recordings visible to team members only"`

### Follow Existing Toggle Pattern

The modal already has two toggle patterns to follow:

1. **Privacy toggles** (`_handlePrivacyToggle`, lines ~437-480) — closest match. Uses:
   - `TeamService.callFunction('updateTeamSettings', { [setting]: newEnabled })`
   - Optimistic UI update + revert on error
   - `data-enabled` attribute for state tracking

2. **Toggle HTML** (same in both patterns):
   ```html
   <button class="voice-visibility-toggle relative w-9 h-5 rounded-full transition-colors shrink-0
               ${isPublic ? 'bg-primary' : 'bg-muted-foreground/30'}"
           data-enabled="${isPublic}">
     <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
           style="left: ${isPublic ? '1.125rem' : '0.125rem'}"></span>
   </button>
   ```

### Write Path

The toggle writes to the team document:

```javascript
// On toggle:
await TeamService.callFunction('updateTeamSettings', {
  voiceSettings: { defaultVisibility: isPublic ? 'public' : 'private' }
});
```

If `updateTeamSettings` doesn't currently handle nested `voiceSettings`, update it to merge this field onto the team doc. The write is a simple `{ voiceSettings: { defaultVisibility: 'public' | 'private' } }` merge — no complex logic needed.

### Read Path

On modal open, read the current value from the team doc:

```javascript
const team = /* however the modal currently gets team data */;
const defaultVisibility = team.voiceSettings?.defaultVisibility || 'private';
const isPublic = defaultVisibility === 'public';
```

---

## Firestore Rules Update

The `hasValidTeamUpdateData()` function in `firestore.rules` needs to accept `voiceSettings`. Add a validation check alongside the existing field validators:

```
// In hasValidTeamUpdateData():
&& (!('voiceSettings' in data) || isValidVoiceSettings())
```

```
function isValidVoiceSettings() {
  return request.resource.data.voiceSettings is map
    && 'defaultVisibility' in request.resource.data.voiceSettings
    && request.resource.data.voiceSettings.defaultVisibility in ['public', 'private'];
}
```

This only matters if the write goes through client-side Firestore (not Cloud Functions, which use Admin SDK and bypass rules). Add it as defense-in-depth regardless.

---

## What NOT to Build

- **Per-recording visibility override** — That's Phase 5. This phase only sets the team-wide default.
- **Recordings list or discovery UI** — Phase 5.
- **Changes to quad bot** — It already reads `voiceSettings.defaultVisibility` (Phase 2).
- **Changes to replay.html** — Phase 3 already handles public vs private display.
- **Retroactive visibility changes** — Changing the toggle does NOT update existing recordings. Only new uploads pick up the new default. This is by design.

---

## Important Note: Toggle Only Affects Future Recordings

The toggle sets `defaultVisibility` which the bot reads at **upload time**. Changing from private to public (or vice versa) only affects recordings uploaded after the change. Existing recordings keep their original visibility.

This is intentional — retroactive updates would require a batch Firestore write across all team recordings, which is a separate feature if needed. The brief should NOT implement retroactive changes.

---

## Files Likely Touched

| File | Change |
|------|--------|
| `public/js/components/TeamManagementModal.js` | Add toggle HTML + handler in connected Voice Bot state |
| `functions/index.js` (or equivalent) | Update `updateTeamSettings` to handle `voiceSettings` merge (if needed) |
| `firestore.rules` | Add `isValidVoiceSettings()` validation in `hasValidTeamUpdateData()` |
