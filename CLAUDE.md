# CLAUDE.md - MatchScheduler Guidelines

## Why This File Exists
This file reinforces critical patterns that are commonly violated during implementation.
For complete architecture specifications, refer to the Pillar documents.

---

## WSL Development Environment

**Setup:** Windows VSCode + Claude Code extension, with WSL Ubuntu project folder.

### Command Execution Rules
Use `wsl bash -ic` (interactive) for npm scripts so nvm loads properly:

**✅ Simple commands work directly:**
```bash
git status              # Works
bash scripts/foo.sh     # Works
cat / ls / grep         # Works
```

**🔧 For npm scripts, use interactive bash (`-ic` flag is critical):**
```bash
wsl bash -ic "cd /home/paradoks/projects/MatchScheduler && npm run deploy"
wsl bash -ic "cd /home/paradoks/projects/MatchScheduler && npm run build"
wsl bash -ic "cd /home/paradoks/projects/MatchScheduler && npm start"
```

The `-ic` flag runs bash in interactive mode, which loads `.bashrc` and nvm.

---

## Essential References
- **Architecture Map**: `context/ARCHITECTURE-MAP.md` - File map, module guide, subsystem overview (READ FIRST for orientation)
- **Data Schema**: `context/SCHEMA.md` - Firestore document structures (ALWAYS check before writing backend code)
- **Pillar Documents**: `context/Pillar*.md` - Architecture specifications
- **Slice Specs**: `context/slices/` - Feature implementation details
- **Dev Setup**: `docs/DEV-SETUP.md` - Local development with Firebase emulators
- **QWHub API**: `context/QWHUB-API-REFERENCE.md` - External API for match history, detailed stats, mapshots (READ before any QWHub integration work)

---

## THE Critical Pattern: Cache + Listeners

**This is the #1 most important pattern. Every data-displaying component MUST follow it.**

### The Pattern
1. **Services manage cache only** - Pre-load data, provide instant access, NO listeners
2. **Components own their Firebase listeners** - Get initial data from cache, subscribe to updates
3. **Updates flow**: Firebase → Component → UI + Cache

### Correct Implementation
```javascript
// ✅ CORRECT: Service manages cache only
const TeamService = {
    teams: {},
    
    async loadAllTeams() {
        const snapshot = await getDocs(collection(db, 'teams'));
        snapshot.forEach(doc => {
            this.teams[doc.id] = doc.data();
        });
    },
    
    getTeam(teamId) {
        return this.teams[teamId]; // Instant from cache
    },
    
    updateCachedTeam(teamId, data) {
        this.teams[teamId] = data;
    }
};

// ✅ CORRECT: Component owns its listener
const TeamInfo = (function() {
    let _unsubscribe;
    
    async function init(teamId) {
        // 1. Get from cache first (instant/hot path)
        const team = TeamService.getTeam(teamId);
        render(team);
        
        // 2. Set up direct listener for real-time updates
        const { doc, onSnapshot } = await import('firebase/firestore');
        _unsubscribe = onSnapshot(
            doc(window.firebase.db, 'teams', teamId),
            (doc) => {
                const data = doc.data();
                updateUI(data);
                TeamService.updateCachedTeam(teamId, data); // Keep cache fresh
            }
        );
    }
    
    function cleanup() {
        if (_unsubscribe) _unsubscribe();
    }
    
    return { init, cleanup };
})();
```

### What NOT to Do
```javascript
// ❌ WRONG: Service managing subscriptions (creates warehouse pattern)
const TeamService = {
    subscribeToTeam(teamId, callback) { 
        // This is the path to complexity hell
    }
};

// ❌ WRONG: Forgetting to update cache
onSnapshot(doc(db, 'teams', teamId), (doc) => {
    updateUI(doc.data());
    // Missing: TeamService.updateCachedTeam()
});

// ❌ WRONG: Component asking service for updates
TeamService.onTeamUpdate((team) => { ... }); // No! Direct listeners only
```

---

## THE Second Critical Pattern: Frontend ↔ Backend Integration

**A feature isn't done until the frontend and backend are connected.**

### Complete Integration Example
```javascript
// ✅ CORRECT: Full integration from button to database

// 1. UI Component
const TeamDrawer = (function() {
    async function handleRegenerateClick() {
        const button = document.getElementById('regenerate-btn');
        button.disabled = true;
        button.textContent = 'Generating...';
        
        try {
            // 2. Call backend through service
            const result = await TeamService.regenerateJoinCode(
                currentTeamId, 
                currentUserId
            );
            
            if (result.success) {
                // 3. Success - UI will update via listener
                showToast('New join code generated!', 'success');
            } else {
                // 4. Error handling with user feedback
                showToast(result.error || 'Failed to generate code', 'error');
            }
        } catch (error) {
            // 5. Network error handling
            console.error('Regenerate failed:', error);
            showToast('Network error - please try again', 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Regenerate';
        }
    }
    
    return { init, handleRegenerateClick };
})();

// 6. Service calls Cloud Function
const TeamService = {
    async regenerateJoinCode(teamId, userId) {
        return callCloudFunction('regenerateJoinCode', { teamId, userId });
    }
};

// 7. Real-time listener updates UI automatically
onSnapshot(doc(db, 'teams', teamId), (doc) => {
    const teamData = doc.data();
    document.getElementById('join-code').value = teamData.joinCode;
    TeamService.updateCachedTeam(teamId, teamData);
});
```

### Integration Checklist for EVERY Feature
- [ ] Button click handler attached and working
- [ ] Loading state shows during operation
- [ ] Backend function called with correct parameters
- [ ] Success case updates UI (via listener or directly)
- [ ] Error cases show user-friendly messages
- [ ] Network failures handled gracefully
- [ ] Button re-enabled after operation

---

## Non-Negotiable Technical Rules

### Firebase v11 Modular Imports
```javascript
import { doc, onSnapshot } from 'firebase/firestore';  // ✅ Correct
import firebase from 'firebase/app';                   // ❌ Wrong (v8 pattern)
```

### CSS Units - rem Only (Tailwind Handles This!)
```css
/* Custom CSS */
padding: 1rem;        /* ✅ Correct - scales properly */
padding: 16px;        /* ❌ Wrong - except for borders/shadows */
margin: 0.5rem;       /* ✅ Correct */
border: 1px solid;    /* ✅ OK - pixels fine for borders only */
box-shadow: 0px 4px 8px; /* ✅ OK - pixels fine for shadows */
```

**IMPORTANT: Tailwind utility classes already use rem!**
- `px-4` = `1rem` (NOT pixels - it means "padding-x")
- `py-2` = `0.5rem` (NOT pixels - it means "padding-y")
- `p-4` = `1rem` all around
- `w-20` = `5rem` width

Don't be confused by the "px" in class names - it's shorthand for "padding on x-axis", not pixels!

### Tailwind CSS Build Process
```
CRITICAL: Tailwind uses a build pipeline!

Source File (EDIT THIS):     src/css/input.css
                                    ↓
Output File (NEVER EDIT):     public/css/main.css

- Custom CSS must go in src/css/input.css
- Tailwind watcher rebuilds main.css automatically
- Changes to main.css will be lost on rebuild
```

### Sacred 3x3 Grid Layout
The grid structure is immutable. Never modify panel dimensions or positions.
See Pillar 1 for complete layout specification.

### Component Pattern
Two patterns available depending on complexity:

**Revealing Module Pattern** (existing components, simple state):
```javascript
const ComponentName = (function() {
    // Private
    let _state = {};

    // Public
    return {
        init() { },
        cleanup() { }
    };
})();
```

**Alpine.js Pattern** (availability grid, reactive UI):
```html
<div x-data="componentName()">
    <div @click="handleClick" :class="isActive ? 'bg-primary' : 'bg-muted'">
        <span x-text="label"></span>
    </div>
</div>

<script>
function componentName() {
    return {
        isActive: false,
        label: '',
        init() {
            // Get from cache, set up listener
        },
        handleClick() {
            // Optimistic update + Firebase sync
        }
    }
}
</script>
```

**When to use which:**
- Revealing Module: Simple components, existing code, minimal reactivity
- Alpine.js: Availability grid, complex selections, real-time updates with many DOM elements

### Performance Requirements
- **Hot paths** (frequent actions): Must use cache or optimistic updates for instant response
- **Cold paths** (one-time actions): Can show loading states
- See Pillar 2 for complete performance classifications

---

## Development Workflow Reminders

### Firebase Emulator
**The emulator is ALREADY RUNNING. Do not:**
- ❌ Try to start it again
- ❌ Change ports
- ❌ Stop and restart it
- ❌ Run `firebase emulators:start`

**Instead:**
- ✅ Check http://localhost:8080 for Firestore UI
- ✅ Check http://localhost:5001 for Functions logs
- ✅ Just refresh your browser to test changes
- ✅ Run `npm run seed:quick` if you need fresh test data (or `npm run seed` for full with logos)

**Dev Mode Details:** See `docs/DEV-SETUP.md` for complete setup including:
- Fixed UIDs (dev-user-001 for ParadokS)
- Direct Firestore writes (bypasses Cloud Functions)
- WSL networking tips

### Testing Approach
**After implementing a feature:**
1. DO NOT write automated tests immediately
2. DO NOT mess with emulator configuration
3. Use QCHECK to find integration issues
4. Fix issues (1-2 iterations normal)
5. Use QTEST for manual testing guide
6. Only write automated tests if specifically requested

### Deployment (Production)

**Region:** Functions use `europe-west3` (Frankfurt) except storage triggers:
- Backend v1 onCall functions: `functions.region('europe-west3').https.onCall(...)`
- Backend v2 storage triggers: `{ region: 'europe-west10' }` (must match bucket region)
- Frontend: `getFunctions(app, 'europe-west3')` in `public/index.html`

**Architecture (after v1 migration):**
- **v1 functions (25)**: Share a single Cloud Functions container - fast deploys!
- **v2 storage triggers (2)**: `processLogoUpload`, `processAvatarUpload` - separate Cloud Run services

**Deploy all functions:**
```bash
firebase deploy --only functions          # ✅ Works now! v1 functions share infrastructure
./scripts/deploy-functions.sh             # ✅ Same thing, just with logging
```

**Deploy hosting + rules:**
```bash
firebase deploy --only hosting            # Frontend changes
firebase deploy --only firestore:rules    # Security rules
firebase deploy --only hosting,firestore:rules  # Both
```

**After adding a new Cloud Function (v1 pattern):**
```javascript
// In your function file:
const functions = require('firebase-functions');

exports.myNewFunction = functions
    .region('europe-west3')
    .https.onCall(async (data, context) => {
        // data = parameters, context.auth = user auth
    });
```
1. Use the v1 pattern above (NOT v2 `onCall({ region }, handler)`)
2. Export it in `functions/index.js`
3. Deploy with `firebase deploy --only functions`

**Cleaning up old Cloud Run services:** After the region migration, delete orphaned services:
```bash
# List Cloud Run services in the region
gcloud run services list --region=europe-west3

# Delete old function services (keep processLogoUpload, processAvatarUpload)
gcloud run services delete functionName --region=europe-west3
```

### Common Integration Mistakes (Check These First!)

1. **Frontend calls backend but doesn't handle errors**
```javascript
// ❌ WRONG - No error handling
const result = await TeamService.someAction();
updateUI(result.data);

// ✅ CORRECT - Handle all cases
const result = await TeamService.someAction();
if (result.success) {
    updateUI(result.data);
} else {
    showError(result.error);
}
```

2. **Backend updates database but frontend doesn't listen**
```javascript
// ❌ WRONG - No listener, UI won't update
await updateDoc(doc(db, 'teams', teamId), { name: newName });

// ✅ CORRECT - Listener will catch the update
// (Listener already set up in component init)
```

3. **Missing loading states during operations**
```javascript
// ❌ WRONG - User doesn't know something is happening
await longOperation();

// ✅ CORRECT - Clear feedback
setLoading(true);
await longOperation();
setLoading(false);
```

---

## Quick Context

### Scale
- 300 players total
- ~40 teams
- 4 weeks of availability visible
- Players limited to 2 teams maximum

### Gaming Domain
- Time slots: `'ddd_hhmm'` format (e.g., `'mon_1900'`)
- Team operations happen in Discord
- Tournament deadline pressure is real
- Leaders coordinate matches via Discord DMs

### Data Model
- `/teams/{teamId}` - Team info with embedded roster
- `/availability/{teamId}_{weekId}` - Weekly availability grids
- `/users/{userId}` - User profiles
- `/eventLog/{eventId}` - Audit trail

---

## Common AI Mistakes to Avoid

1. **Creating middleware/subscription services** - Use direct listeners
2. **Using pixel units** - Use rem everywhere except borders
3. **Complex state management** - Cache + listeners + Alpine is enough
4. **Trying to start Firebase emulator** - It's already running
5. **Over-engineering** - This is a 300-person community app, not Google
6. **Modifying the sacred grid** - The layout is fixed
7. **Using old Firebase syntax** - v11 modular imports only
8. **Forgetting optimistic updates** - Hot paths must feel instant
9. **Editing main.css directly** - Always edit src/css/input.css for custom CSS
10. **Not connecting frontend to backend** - Every button needs a backend
11. **Writing tests immediately** - Implementation first, check for errors, then test
12. **Using React/Vue for new components** - Use Alpine.js for reactive UI needs
13. **Using `set({ merge: true })` with dot-notation keys** - Use `update()` instead! `set({ merge: true })` treats `"slots.mon_1800"` as a literal top-level field name, while `update()` correctly interprets it as nested path `slots.mon_1800`

---

## Workflow Commands

For all Q-commands and workflow instructions, see `CLAUDE-COMMANDS.md`

Quick reference:
- `QNEW` - Initialize context
- `QPLAN [slice]` - Create technical slice
- `QCODE [slice]` - Execute implementation (no auto tests!)
- `QCHECK` - Verify implementation and find issues
- `QTEST` - Manual testing guide
- `QSTATUS` - Progress check
- `QGIT` - Commit changes

Expected iteration cycle:
1. QCODE implements the slice
2. QCHECK finds issues (always will!)
3. QCODE fixes issues (1-2 iterations normal)
4. QTEST guides manual verification

---

## Remember

1. **Cache + Listeners** is the foundation - everything else builds on this
2. **Frontend ↔ Backend integration** is critical - not done until connected
3. **Keep it simple** - 300 players don't need enterprise architecture
4. **Hot paths are sacred** - Users expect instant response
5. **Discord is home** - Design for where gamers actually communicate
6. **Ship working features** - Perfect is the enemy of good
7. **Iterations are normal** - Expect to run QCHECK/fix cycles

When in doubt:
- Choose the simpler solution that follows the cache + listener pattern
- Make sure frontend and backend are actually connected
- Test manually before writing automated tests