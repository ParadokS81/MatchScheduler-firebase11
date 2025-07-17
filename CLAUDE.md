# CLAUDE.md - MatchScheduler Guidelines

## Why This File Exists
This file reinforces critical patterns that are commonly violated during implementation.
For complete architecture specifications, refer to the Pillar documents.

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
All components use revealing module pattern:
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

### Performance Requirements
- **Hot paths** (frequent actions): Must use cache or optimistic updates for instant response
- **Cold paths** (one-time actions): Can show loading states
- See Pillar 2 for complete performance classifications

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
3. **Complex state management** - Cache + listeners is enough
4. **Trying to start Firebase emulator** - It's already running
5. **Over-engineering** - This is a 300-person community app, not Google
6. **Modifying the sacred grid** - The layout is fixed
7. **Using old Firebase syntax** - v11 modular imports only
8. **Forgetting optimistic updates** - Hot paths must feel instant
9. **Editing main.css directly** - Always edit src/css/input.css for custom CSS

---

## Workflow Commands

For all Q-commands and workflow instructions, see `CLAUDE-COMMANDS.md`

Quick reference:
- `QNEW` - Initialize context
- `QPLAN [slice]` - Create technical slice
- `QCODE [slice]` - Execute implementation
- `QCHECK` - Verify implementation
- `QTEST` - Manual testing guide
- `QSTATUS` - Progress check
- `QGIT` - Commit changes

---

## Remember

1. **Cache + Listeners** is the foundation - everything else builds on this
2. **Keep it simple** - 300 players don't need enterprise architecture
3. **Hot paths are sacred** - Users expect instant response
4. **Discord is home** - Design for where gamers actually communicate
5. **Ship working features** - Perfect is the enemy of good

When in doubt, choose the simpler solution that follows the cache + listener pattern.