# Slice P4: Default Visibility Toggle for Voice Recordings

## Slice Definition

- **Slice ID:** P4
- **Name:** Voice Recording Default Visibility Toggle
- **User Story:** As a team leader with a connected voice bot, I can toggle the default visibility of new voice recordings between public and private, so I control who can discover our team's match comms.
- **Success Criteria:**
  - Toggle appears in Voice Bot section only when bot status is 'active' (connected)
  - Toggle defaults to OFF (private) when `voiceSettings` is absent
  - Toggling updates `teams/{teamId}.voiceSettings.defaultVisibility` via Cloud Function
  - UI uses optimistic update with revert on error
  - Sublabel updates to reflect current state
  - Change only affects future recordings (no retroactive updates)

---

## PRD Mapping

**PRIMARY SECTIONS:**
- `docs/multi-clan/phase-4-visibility-toggle.md` — Full feature spec (toggle UI, write path, read path)
- `docs/multi-clan/CONTRACT.md` — Schema: `voiceSettings.defaultVisibility` on `/teams/{teamId}`

**DEPENDENT SECTIONS:**
- Phase 2 (quad): Bot already reads `voiceSettings.defaultVisibility` at upload time — no changes needed
- Phase 3 (P3.1): Firestore rules enforce visibility on `voiceRecordings` — no changes needed
- Existing privacy toggle pattern in TeamManagementModal (`_handlePrivacyToggle`, lines 437-480)

**IGNORED SECTIONS:**
- Phase 5: Per-recording visibility override + recordings discovery UI
- Retroactive visibility changes on existing recordings
- Any changes to quad bot or replay.html

---

## Full Stack Architecture

### FRONTEND COMPONENTS

- **TeamManagementModal** (`public/js/components/TeamManagementModal.js`)
  - Firebase listeners: None new (existing team listener already provides `voiceSettings`)
  - Cache interactions: Reads `_teamData.voiceSettings?.defaultVisibility`, updates `_teamData.voiceSettings` on success
  - UI responsibilities:
    - Render visibility toggle inside connected Voice Bot state (after guild name, before Disconnect button)
    - Show sublabel reflecting current state ("New recordings visible to everyone" / "New recordings visible to team members only")
  - User actions: Click toggle → optimistic UI update → Cloud Function call → revert on error

### FRONTEND SERVICES

- **TeamService** (existing): No new methods needed
  - Uses existing `TeamService.callFunction('updateTeamSettings', { teamId, voiceSettings })` pattern

### BACKEND REQUIREMENTS

#### Cloud Functions

- **updateTeamSettings** (existing, `functions/team-operations.js` line 1026):
  - **File:** `functions/team-operations.js`
  - **Change:** Add `voiceSettings` parameter handling alongside existing parameters
  - **Validation:**
    - `voiceSettings` must be an object
    - `voiceSettings.defaultVisibility` must be `'public'` or `'private'`
  - **Operations:** Merge `voiceSettings` into team document update
  - **Event logging:** Log `oldDefaultVisibility` / `newDefaultVisibility` in event details
  - **Returns:** `{ success: true, data: { voiceSettings: { defaultVisibility } } }`

- **Function Exports:** No changes — `updateTeamSettings` already exported in `functions/index.js`

#### Firestore Operations

- **Collection:** `teams/{teamId}`
  - **UPDATE:** Merge `voiceSettings: { defaultVisibility: 'public' | 'private' }` onto team document
  - **No new documents or collections**

#### Security Rules (`firestore.rules`)

- **Add `isValidVoiceSettings()` function:**
  ```
  function isValidVoiceSettings() {
    return request.resource.data.voiceSettings is map
      && 'defaultVisibility' in request.resource.data.voiceSettings
      && request.resource.data.voiceSettings.defaultVisibility in ['public', 'private'];
  }
  ```
- **Update `hasValidTeamUpdateData()` (line 258-286):**
  Add clause: `&& (!('voiceSettings' in data) || isValidVoiceSettings())`

#### Authentication/Authorization

- Leader-only: `updateTeamSettings` already checks `team.leaderId === userId` (line 1096)
- Toggle only renders for leaders (Voice Bot section is leader-only)

#### Event Logging

- Event type: `TEAM_SETTINGS_UPDATED` (existing)
- Details additions:
  ```javascript
  if (hasVoiceSettings) {
      details.oldDefaultVisibility = team.voiceSettings?.defaultVisibility || 'private';
      details.newDefaultVisibility = voiceSettings.defaultVisibility;
  }
  ```

### INTEGRATION POINTS

- **Frontend → Backend:** `TeamService.callFunction('updateTeamSettings', { teamId, voiceSettings: { defaultVisibility } })`
- **API Contract:**
  - Request: `{ teamId: string, voiceSettings: { defaultVisibility: 'public' | 'private' } }`
  - Success: `{ success: true, data: { voiceSettings: { defaultVisibility: 'public' | 'private' }, lastActivityAt: Timestamp } }`
  - Error: `{ success: false, error: "message" }`
- **Real-time listeners:** Existing team document listener will pick up the `voiceSettings` change if another tab makes the change. The modal reads `_teamData` on open; no additional listener needed for single-tab UX.
- **Data flow:** Toggle click → `_handleVisibilityToggle()` → optimistic UI → `TeamService.callFunction()` → `updateTeamSettings` Cloud Function → `teams/{teamId}` update → listener fires → cache updated

---

## Integration Code Examples

### Toggle HTML (inside connected Voice Bot state)

```javascript
// In _renderVoiceBotSection(), connected state, between guild info div and disconnect button:
const defaultVisibility = _teamData?.voiceSettings?.defaultVisibility || 'private';
const isPublic = defaultVisibility === 'public';

// Insert after the guild name info box:
`
<div class="mt-2 flex items-center justify-between gap-3">
    <div>
        <p class="text-sm text-foreground">Recording visibility</p>
        <p class="text-xs text-muted-foreground voice-visibility-sublabel">
            ${isPublic
                ? 'New recordings visible to everyone'
                : 'New recordings visible to team members only'}
        </p>
    </div>
    <button class="voice-visibility-toggle relative w-9 h-5 rounded-full transition-colors shrink-0
                ${isPublic ? 'bg-primary' : 'bg-muted-foreground/30'}"
            data-enabled="${isPublic}">
        <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
              style="left: ${isPublic ? '1.125rem' : '0.125rem'}"></span>
    </button>
</div>
`
```

### Toggle Handler (mirrors `_handlePrivacyToggle` pattern)

```javascript
async function _handleVisibilityToggle() {
    const btn = document.querySelector('.voice-visibility-toggle');
    if (!btn) return;

    const currentlyPublic = btn.dataset.enabled === 'true';
    const newIsPublic = !currentlyPublic;
    const newVisibility = newIsPublic ? 'public' : 'private';

    // Optimistic UI update
    _applyVisibilityToggleState(btn, newIsPublic);

    try {
        const result = await TeamService.callFunction('updateTeamSettings', {
            teamId: _teamId,
            voiceSettings: { defaultVisibility: newVisibility }
        });

        if (result.success) {
            // Update cached team data
            if (!_teamData.voiceSettings) _teamData.voiceSettings = {};
            _teamData.voiceSettings.defaultVisibility = newVisibility;
            ToastService.showSuccess(
                newIsPublic
                    ? 'New recordings will be public'
                    : 'New recordings will be team-only'
            );
        } else {
            _applyVisibilityToggleState(btn, currentlyPublic);
            ToastService.showError(result.error || 'Failed to update visibility');
        }
    } catch (error) {
        console.error('Error toggling visibility:', error);
        _applyVisibilityToggleState(btn, currentlyPublic);
        ToastService.showError('Network error - please try again');
    }
}

function _applyVisibilityToggleState(button, isPublic) {
    button.dataset.enabled = String(isPublic);
    button.classList.toggle('bg-primary', isPublic);
    button.classList.toggle('bg-muted-foreground/30', !isPublic);
    const knob = button.querySelector('span');
    if (knob) {
        knob.style.left = isPublic ? '1.125rem' : '0.125rem';
    }
    // Update sublabel
    const sublabel = document.querySelector('.voice-visibility-sublabel');
    if (sublabel) {
        sublabel.textContent = isPublic
            ? 'New recordings visible to everyone'
            : 'New recordings visible to team members only';
    }
}
```

### Listener Wiring (in `_attachVoiceBotListeners`)

```javascript
function _attachVoiceBotListeners() {
    // ... existing connect/cancel/disconnect handlers ...

    const visibilityToggle = document.querySelector('.voice-visibility-toggle');
    visibilityToggle?.addEventListener('click', _handleVisibilityToggle);
}
```

### Backend: updateTeamSettings additions

```javascript
// 1. Destructure (line 1036)
const { teamId, teamTag, maxPlayers, divisions, hideRosterNames, hideFromComparison, voiceSettings } = data;

// 2. Add presence check (line 1048)
const hasVoiceSettings = voiceSettings !== undefined;

// 3. Update the "at least one setting" check (line 1050)
if (!hasTeamTag && !hasMaxPlayers && !hasDivisions && !hasHideRosterNames && !hasHideFromComparison && !hasVoiceSettings) {
    throw new functions.https.HttpsError('invalid-argument', 'At least one setting must be provided');
}

// 4. Add validation (after line 1085)
if (hasVoiceSettings) {
    if (typeof voiceSettings !== 'object' || voiceSettings === null) {
        throw new functions.https.HttpsError('invalid-argument', 'voiceSettings must be an object');
    }
    if (!['public', 'private'].includes(voiceSettings.defaultVisibility)) {
        throw new functions.https.HttpsError('invalid-argument', 'defaultVisibility must be "public" or "private"');
    }
}

// 5. Add to update object (after line 1112)
if (hasVoiceSettings) updateData.voiceSettings = { defaultVisibility: voiceSettings.defaultVisibility };

// 6. Add to event details (after line 1149)
if (hasVoiceSettings) {
    details.oldDefaultVisibility = team.voiceSettings?.defaultVisibility || 'private';
    details.newDefaultVisibility = voiceSettings.defaultVisibility;
}
```

---

## Performance Classification

### HOT PATHS (<50ms)

- **Toggle click:** Optimistic UI update — toggle knob moves + sublabel changes instantly before Cloud Function resolves. No perceived latency.

### COLD PATHS (<2s)

- **Cloud Function call:** `updateTeamSettings` is a warm function (shared container with 25 other v1 functions). Expected latency ~200-500ms. Optimistic update eliminates perceived wait.

### BACKEND PERFORMANCE

- **Cold starts:** Unlikely — `updateTeamSettings` is frequently called for other settings
- **Database queries:** Single `get()` + single `update()` on `teams/{teamId}` — no new indexes needed
- **No batch operations** — simple single-document update

---

## Data Flow Diagram

```
Toggle Click
    │
    ▼
_handleVisibilityToggle()
    │
    ├── [INSTANT] _applyVisibilityToggleState(btn, newIsPublic)  ← Optimistic UI
    │       │
    │       └── Toggle knob animates + sublabel text updates
    │
    └── [ASYNC] TeamService.callFunction('updateTeamSettings', {
            teamId, voiceSettings: { defaultVisibility }
        })
            │
            ▼
        Cloud Function: updateTeamSettings
            │
            ├── Auth check (context.auth.uid)
            ├── Leader check (team.leaderId === userId)
            ├── Validate voiceSettings shape
            │
            ▼
        Firestore update: teams/{teamId}
            { voiceSettings: { defaultVisibility: 'public'|'private' }, lastActivityAt: ... }
            │
            ├── eventLog write
            │
            ▼
        Return { success: true }
            │
            ▼
        Frontend: update _teamData cache + show toast
            │
        [On error]: revert toggle state + show error toast
```

---

## Test Scenarios

### FRONTEND TESTS
- [ ] Toggle NOT rendered when bot status is `null` (not connected)
- [ ] Toggle NOT rendered when bot status is `'pending'`
- [ ] Toggle rendered when bot status is `'active'` (connected)
- [ ] Toggle starts OFF (private) when `voiceSettings` is absent on team doc
- [ ] Toggle starts OFF when `voiceSettings.defaultVisibility === 'private'`
- [ ] Toggle starts ON (green) when `voiceSettings.defaultVisibility === 'public'`
- [ ] Sublabel shows "team members only" text when private
- [ ] Sublabel shows "visible to everyone" text when public
- [ ] Toggle click immediately updates visual state (optimistic)
- [ ] Sublabel immediately updates on click (optimistic)

### BACKEND TESTS
- [ ] `updateTeamSettings` accepts `{ voiceSettings: { defaultVisibility: 'public' } }` and writes to team doc
- [ ] `updateTeamSettings` accepts `{ voiceSettings: { defaultVisibility: 'private' } }` and writes to team doc
- [ ] Rejects `voiceSettings` with invalid `defaultVisibility` value (e.g., `'unlisted'`)
- [ ] Rejects `voiceSettings` without `defaultVisibility` key
- [ ] Rejects `voiceSettings` as non-object (e.g., string, null)
- [ ] Non-leaders get permission denied
- [ ] Event log includes `oldDefaultVisibility` and `newDefaultVisibility`
- [ ] Other settings (teamTag, maxPlayers, etc.) still work unchanged

### INTEGRATION TESTS (CRITICAL)
- [ ] Toggle click → Cloud Function → Firestore updated → `_teamData` cache updated
- [ ] Error from Cloud Function → toggle reverts to previous state + error toast shown
- [ ] Network failure → toggle reverts + "Network error" toast shown
- [ ] `voiceSettings` can be sent alongside other settings in same `updateTeamSettings` call (no conflict)

### END-TO-END TESTS
- [ ] Leader opens modal → bot is connected → toggle visible in OFF state
- [ ] Leader toggles ON → toast confirms → close and reopen modal → toggle still ON
- [ ] Leader toggles OFF → toast confirms → close and reopen modal → toggle still OFF
- [ ] Non-leader opens modal → Voice Bot section not shown (existing behavior, no regression)

---

## Common Integration Pitfalls

- [ ] **Forgetting to update `_teamData.voiceSettings` on success** — Must update local cache so reopening modal shows correct state without a Firestore round-trip
- [ ] **Toggle not re-attached after `_rerenderVoiceBotSection()`** — The voice bot section can re-render when `_botRegistration` changes (pending → active). Must ensure `_attachVoiceBotListeners()` wires up the visibility toggle on each re-render
- [ ] **Using `set({ merge: true })` for `voiceSettings`** — The Cloud Function uses `update()` which is correct. But if tempted to use `set({ merge: true })`, remember it would replace the entire `voiceSettings` map, not merge sub-fields
- [ ] **Not handling the case where `_teamData.voiceSettings` is undefined** — Default to `'private'` when reading: `_teamData?.voiceSettings?.defaultVisibility || 'private'`
- [ ] **Not gating toggle render on bot connected state** — Toggle MUST only appear inside `status === 'active'` block, not in pending or disconnected states

---

## Implementation Notes

### Existing Patterns to Follow
- **Privacy toggles** (lines 437-480): Exact same pattern — optimistic update, `_applyToggleState`, revert on error, toast feedback
- **Toggle HTML** (lines 422-427): Same `w-9 h-5 rounded-full` toggle structure with `data-enabled` attribute
- **`_attachVoiceBotListeners()`** (line 754): Already called on every voice bot re-render — add visibility toggle listener here

### Key Locations (line references)
| What | File | Lines |
|------|------|-------|
| Voice Bot connected state HTML | TeamManagementModal.js | 692-712 |
| Privacy toggle handler (pattern) | TeamManagementModal.js | 437-480 |
| `_attachVoiceBotListeners()` | TeamManagementModal.js | 754-763 |
| `_rerenderVoiceBotSection()` | TeamManagementModal.js | 738-748 |
| `updateTeamSettings` function | team-operations.js | 1026-1182 |
| `hasValidTeamUpdateData()` rule | firestore.rules | 258-286 |

### Dependencies
- **Phase 1a (done):** Voice Bot connect/disconnect UI in TeamManagementModal
- **Phase 2 (done, quad):** Bot reads `voiceSettings.defaultVisibility` at upload time
- **Phase 3 / P3.1 (done):** Firestore rules enforce visibility on voiceRecordings

### What This Does NOT Do
- Does not retroactively change visibility of existing recordings
- Does not add per-recording override (Phase 5)
- Does not modify quad bot behavior
- Does not modify replay.html

### Estimated Scope
- ~3 touches: TeamManagementModal.js, team-operations.js, firestore.rules
- Follows established patterns exactly — low risk
- No new services, components, or collections
