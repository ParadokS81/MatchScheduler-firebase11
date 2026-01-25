# Slice 3.2: Favorites System

## 1. Slice Definition

| Field | Value |
|-------|-------|
| **Slice ID** | 3.2 |
| **Name** | Favorites System |
| **User Story** | As a team leader, I can star teams for quick access so I can easily compare my frequently matched opponents |
| **Panel Location** | Middle-Right (`#panel-middle-right`) |
| **Depends On** | Slice 3.1 (TeamBrowser) |
| **Enables** | Slice 3.4 (Compare Now) |

### Success Criteria
- [ ] Star button in TeamBrowser adds/removes teams from favorites
- [ ] Favorites panel displays starred teams with team cards
- [ ] Clicking team cards toggles selection (unified with Browse panel)
- [ ] Select All / Deselect All buttons work correctly
- [ ] Compare Now button present (stub for Slice 3.4)
- [ ] Favorites persist across page refreshes (localStorage)
- [ ] Real-time updates when favorited team data changes

---

## 2. PRD Mapping

### Primary Sections
| PRD Section | Requirement | Implementation |
|-------------|-------------|----------------|
| 4.2.1 Middle-Right | List of starred teams for quick comparison | FavoritesPanel with team cards |
| 4.2.1 Middle-Right | Click team card to select/deselect | Unified selection state via TeamBrowserState |
| 4.2.1 Middle-Right | Visual highlight shows selected state | CSS class `selected` on team cards |
| 4.2.1 Middle-Right | [Select All] / [Deselect All] toggle buttons | Toolbar buttons in FavoritesPanel |
| 4.2.1 Middle-Right | [Compare Now] button at bottom | Button stub (functionality in Slice 3.4) |

### Dependent Sections (from other slices)
| PRD Section | Dependency | Status |
|-------------|------------|--------|
| 4.2.1 Bottom-Right | TeamBrowser with star button | ✅ Slice 3.1 complete (visual only) |
| 4.2.2 | Team selection workflow | Uses unified TeamBrowserState |
| 4.2.3 | Comparison initiation | Compare Now button location defined here |

### Explicitly NOT in Scope
- Comparison logic (Slice 3.4)
- Filter controls integration (Slice 3.3)
- Overlap visualization (Slice 3.5)

---

## 3. Full Stack Architecture

### 3.1 Frontend Components

#### FavoritesPanel (NEW)
**Location:** `/public/js/components/FavoritesPanel.js`

**Responsibilities:**
- Display favorited teams as clickable cards
- Handle team selection for comparison
- Provide Select All / Deselect All controls
- Show Compare Now button (stub)
- Listen to favorites changes and team data updates

**State:**
- Favorites list from FavoritesService
- Selection state from TeamBrowserState (unified)

#### FavoritesService (NEW)
**Location:** `/public/js/services/FavoritesService.js`

**Responsibilities:**
- Persist favorites to localStorage
- Provide add/remove/toggle favorite methods
- Dispatch events on favorites changes
- Load favorites on init

**Storage:** Firestore `/users/{userId}` document - `favoriteTeams` array field

#### TeamBrowser Enhancement
**Location:** `/public/js/components/TeamBrowser.js`

**Changes:**
- Star button calls FavoritesService.toggleFavorite()
- Visual state reflects favorite status
- Listen to favorites-updated events to sync star display

### 3.2 Backend Components

#### Cloud Function: updateFavorites
**Location:** `/functions/src/index.ts`

**Responsibilities:**
- Add/remove teamId from user's `favoriteTeams` array
- Validate team exists before adding
- Use arrayUnion/arrayRemove for atomic updates

**Signature:**
```typescript
updateFavorites({ teamId: string, action: 'add' | 'remove' })
// Returns: { success: boolean, favoriteTeams: string[] }
```

### 3.3 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                            │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Star Button   │    │ Team Card     │    │ Select All    │
│ (TeamBrowser) │    │ (Favorites)   │    │ (Favorites)   │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────────────────────────┐
│FavoritesService│   │         TeamBrowserState          │
│  (Firestore)   │   │      (unified selection)          │
└───────┬───────┘    └───────────────┬───────────────────┘
        │                             │
        │ Cloud Function              │  'selection-changed'
        │ updateFavorites             │
        ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              /users/{userId} document listener                  │
│         (fires on favoriteTeams array changes)                  │
└─────────────────────────────────────────────────────────────────┘
        │
        │  onSnapshot triggers re-render
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FavoritesPanel                             │
│    (reads favoriteTeams from UserService, team data from        │
│     TeamService cache)                                          │
└─────────────────────────────────────────────────────────────────┘
```

**Favorite Toggle Flow:**
```
User clicks star → Optimistic UI toggle → FavoritesService.toggleFavorite()
    → Cloud Function updateFavorites({ teamId, action })
    → Firestore arrayUnion/arrayRemove on /users/{userId}.favoriteTeams
    → User document listener fires → UI re-renders with confirmed state
```

---

## 4. Integration Code Examples

### 4.1 FavoritesService (Firestore persistence)

```javascript
// /public/js/services/FavoritesService.js
const FavoritesService = (function() {
    let _favorites = new Set();  // Local cache for instant access
    let _userId = null;
    let _pendingOperations = new Map(); // Track in-flight operations for optimistic UI

    function init(userId, initialFavorites = []) {
        _userId = userId;
        _favorites = new Set(initialFavorites);
    }

    // Called by UserService when user document updates
    function updateFromFirestore(favoriteTeams) {
        _favorites = new Set(favoriteTeams || []);
        _dispatchChange();
    }

    function _dispatchChange() {
        window.dispatchEvent(new CustomEvent('favorites-updated', {
            detail: { favorites: Array.from(_favorites) }
        }));
    }

    async function addFavorite(teamId) {
        if (_favorites.has(teamId)) return { success: true };

        // Optimistic update
        _favorites.add(teamId);
        _dispatchChange();

        try {
            const result = await callCloudFunction('updateFavorites', {
                teamId,
                action: 'add'
            });

            if (!result.success) {
                // Rollback on failure
                _favorites.delete(teamId);
                _dispatchChange();
            }
            return result;
        } catch (error) {
            // Rollback on error
            _favorites.delete(teamId);
            _dispatchChange();
            console.error('Failed to add favorite:', error);
            return { success: false, error: error.message };
        }
    }

    async function removeFavorite(teamId) {
        if (!_favorites.has(teamId)) return { success: true };

        // Optimistic update
        _favorites.delete(teamId);
        _dispatchChange();

        try {
            const result = await callCloudFunction('updateFavorites', {
                teamId,
                action: 'remove'
            });

            if (!result.success) {
                // Rollback on failure
                _favorites.add(teamId);
                _dispatchChange();
            }
            return result;
        } catch (error) {
            // Rollback on error
            _favorites.add(teamId);
            _dispatchChange();
            console.error('Failed to remove favorite:', error);
            return { success: false, error: error.message };
        }
    }

    async function toggleFavorite(teamId) {
        if (_favorites.has(teamId)) {
            return removeFavorite(teamId);
        } else {
            return addFavorite(teamId);
        }
    }

    function isFavorite(teamId) {
        return _favorites.has(teamId);
    }

    function getFavorites() {
        return Array.from(_favorites);
    }

    function getFavoriteCount() {
        return _favorites.size;
    }

    return {
        init,
        updateFromFirestore,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        isFavorite,
        getFavorites,
        getFavoriteCount
    };
})();

export default FavoritesService;
```

### 4.2 Cloud Function: updateFavorites

```typescript
// /functions/src/index.ts

export const updateFavorites = onCall(async (request) => {
    const { teamId, action } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
        throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    if (!teamId || !['add', 'remove'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Invalid teamId or action');
    }

    const userRef = db.collection('users').doc(userId);

    if (action === 'add') {
        // Verify team exists before adding
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new HttpsError('not-found', 'Team not found');
        }

        await userRef.update({
            favoriteTeams: FieldValue.arrayUnion(teamId)
        });
    } else {
        await userRef.update({
            favoriteTeams: FieldValue.arrayRemove(teamId)
        });
    }

    // Return updated list
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    return {
        success: true,
        favoriteTeams: userData?.favoriteTeams || []
    };
});
```

### 4.2 FavoritesPanel Component

```javascript
// /public/js/components/FavoritesPanel.js
const FavoritesPanel = (function() {
    let _container;
    let _unsubscribeTeams;

    async function init() {
        _container = document.getElementById('panel-middle-right');
        _render();
        _setupEventListeners();
        await _setupTeamListener();
    }

    function _render() {
        const favorites = FavoritesService.getFavorites();
        const selectedTeams = TeamBrowserState.getSelectedTeams();

        _container.innerHTML = `
            <div class="p-4 h-full flex flex-col">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-semibold text-foreground">
                        Favorites (${favorites.length})
                    </h3>
                    <div class="flex gap-2">
                        <button id="favorites-select-all"
                                class="px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80
                                       text-muted-foreground transition-colors"
                                ${favorites.length === 0 ? 'disabled' : ''}>
                            Select All
                        </button>
                        <button id="favorites-deselect-all"
                                class="px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80
                                       text-muted-foreground transition-colors"
                                ${selectedTeams.size === 0 ? 'disabled' : ''}>
                            Deselect All
                        </button>
                    </div>
                </div>

                <div id="favorites-list" class="flex-1 overflow-y-auto space-y-2">
                    ${_renderFavoritesList(favorites, selectedTeams)}
                </div>

                <div class="mt-3 pt-3 border-t border-border">
                    <button id="compare-now-btn"
                            class="w-full py-2 px-4 rounded-lg font-medium transition-colors
                                   ${selectedTeams.size >= 2
                                       ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                       : 'bg-muted text-muted-foreground cursor-not-allowed'}"
                            ${selectedTeams.size < 2 ? 'disabled' : ''}>
                        Compare Now (${selectedTeams.size} selected)
                    </button>
                </div>
            </div>
        `;

        _attachButtonHandlers();
    }

    function _renderFavoritesList(favorites, selectedTeams) {
        if (favorites.length === 0) {
            return `
                <div class="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <svg class="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                    </svg>
                    <p class="text-sm">No favorites yet</p>
                    <p class="text-xs mt-1">Star teams in the browser below</p>
                </div>
            `;
        }

        return favorites.map(teamId => {
            const team = TeamService.getTeam(teamId);
            if (!team) return '';

            const isSelected = selectedTeams.has(teamId);
            const playerCount = team.playerRoster ? Object.keys(team.playerRoster).length : 0;

            return `
                <div class="favorite-team-card p-3 rounded-lg cursor-pointer transition-all
                            ${isSelected
                                ? 'bg-primary/20 border-2 border-primary'
                                : 'bg-card border border-border hover:border-primary/50'}"
                     data-team-id="${teamId}">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="font-medium text-foreground">[${team.teamTag}]</span>
                            <span class="text-muted-foreground">${team.teamName}</span>
                        </div>
                        <button class="unfavorite-btn p-1 rounded hover:bg-destructive/20
                                       text-yellow-500 hover:text-destructive transition-colors"
                                data-team-id="${teamId}"
                                title="Remove from favorites">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>${playerCount} players</span>
                        ${team.divisions?.length ? `<span>${team.divisions.join(', ')}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function _attachButtonHandlers() {
        // Select All
        document.getElementById('favorites-select-all')?.addEventListener('click', () => {
            const favorites = FavoritesService.getFavorites();
            favorites.forEach(teamId => TeamBrowserState.selectTeam(teamId));
        });

        // Deselect All
        document.getElementById('favorites-deselect-all')?.addEventListener('click', () => {
            const favorites = FavoritesService.getFavorites();
            favorites.forEach(teamId => TeamBrowserState.deselectTeam(teamId));
        });

        // Compare Now (stub for Slice 3.4)
        document.getElementById('compare-now-btn')?.addEventListener('click', () => {
            const selected = TeamBrowserState.getSelectedTeams();
            console.log('[Slice 3.4 stub] Compare teams:', Array.from(selected));
            // TODO: Slice 3.4 will implement actual comparison
        });

        // Team card clicks (selection toggle)
        document.querySelectorAll('.favorite-team-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't toggle selection if clicking unfavorite button
                if (e.target.closest('.unfavorite-btn')) return;

                const teamId = card.dataset.teamId;
                TeamBrowserState.toggleTeamSelection(teamId);
            });
        });

        // Unfavorite buttons
        document.querySelectorAll('.unfavorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const teamId = btn.dataset.teamId;
                FavoritesService.removeFavorite(teamId);
            });
        });
    }

    function _setupEventListeners() {
        // Listen for favorites changes
        window.addEventListener('favorites-updated', _render);

        // Listen for selection changes (from TeamBrowserState)
        window.addEventListener('team-selection-changed', _render);
    }

    async function _setupTeamListener() {
        // Listen for team data changes to update displayed info
        const { collection, onSnapshot } = await import('firebase/firestore');

        _unsubscribeTeams = onSnapshot(
            collection(window.firebase.db, 'teams'),
            (snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        const teamId = change.doc.id;
                        if (FavoritesService.isFavorite(teamId)) {
                            // Update cache and re-render
                            TeamService.updateCachedTeam(teamId, change.doc.data());
                            _render();
                        }
                    }
                });
            }
        );
    }

    function cleanup() {
        window.removeEventListener('favorites-updated', _render);
        window.removeEventListener('team-selection-changed', _render);
        if (_unsubscribeTeams) _unsubscribeTeams();
    }

    return { init, cleanup };
})();

export default FavoritesPanel;
```

### 4.3 TeamBrowser Star Button Integration

```javascript
// In TeamBrowser.js - enhance existing star button

function _renderTeamCard(team) {
    const isFavorite = FavoritesService.isFavorite(team.id);

    return `
        <div class="team-card ..." data-team-id="${team.id}">
            <!-- existing card content -->
            <button class="star-btn ${isFavorite ? 'text-yellow-500' : 'text-muted-foreground'}"
                    data-team-id="${team.id}"
                    title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                <svg class="w-5 h-5" fill="${isFavorite ? 'currentColor' : 'none'}"
                     stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674..."/>
                </svg>
            </button>
        </div>
    `;
}

// Add event listener for star buttons
function _attachStarButtonHandlers() {
    document.querySelectorAll('.star-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Don't trigger card selection
            const teamId = btn.dataset.teamId;
            FavoritesService.toggleFavorite(teamId);
        });
    });
}

// Listen for favorites changes to update star display
window.addEventListener('favorites-updated', () => {
    _renderTeamList(); // Re-render to update star states
});
```

### 4.4 TeamBrowserState Enhancement (for unified selection)

```javascript
// In TeamBrowserState.js - add event dispatch for selection changes

function _dispatchSelectionChange() {
    window.dispatchEvent(new CustomEvent('team-selection-changed', {
        detail: { selectedTeams: Array.from(_selectedTeams) }
    }));
}

// Update existing methods to dispatch events
function toggleTeamSelection(teamId) {
    if (_selectedTeams.has(teamId)) {
        _selectedTeams.delete(teamId);
    } else {
        _selectedTeams.add(teamId);
    }
    _dispatchSelectionChange();
}

function selectTeam(teamId) {
    if (!_selectedTeams.has(teamId)) {
        _selectedTeams.add(teamId);
        _dispatchSelectionChange();
    }
}

function deselectTeam(teamId) {
    if (_selectedTeams.has(teamId)) {
        _selectedTeams.delete(teamId);
        _dispatchSelectionChange();
    }
}
```

---

## 5. Performance Classification

### Hot Paths (must be instant <50ms)
| Action | Approach |
|--------|----------|
| Toggle favorite | Optimistic UI update, then Cloud Function in background |
| Toggle team selection | In-memory Set operation, event dispatch |
| Re-render favorites list | DOM update from cached data |
| Star button display | Read from FavoritesService.isFavorite() (cached) |

### Cold Paths (can show loading)
| Action | Notes |
|--------|-------|
| Initial load | Favorites loaded from user document (already fetched at login) |
| Cloud Function confirmation | Runs in background after optimistic update |

**Key:** Optimistic updates make favorites feel instant despite Firestore round-trip.

---

## 6. Test Scenarios

### Frontend Tests
| Test | Expected Behavior |
|------|-------------------|
| Click star on unfavorited team | Star fills yellow, team appears in Favorites panel |
| Click star on favorited team | Star empties, team removed from Favorites panel |
| Click team card in Favorites | Card shows selected state (border highlight) |
| Click selected team card | Card deselects |
| Click Select All | All favorited teams become selected |
| Click Deselect All | All selected teams deselect |
| Page refresh | Favorites persist, selection clears |

### Integration Tests
| Test | Expected Behavior |
|------|-------------------|
| Star team in Browse → Favorites updates | Team appears in Favorites panel immediately |
| Select in Favorites → Browse shows selection | Same team shows selected in Browse panel |
| Team data updates in Firestore | Favorite card updates with new data |
| Remove from favorites while selected | Team deselects and removes from list |

### Edge Cases
| Test | Expected Behavior |
|------|-------------------|
| No favorites | Empty state message shown |
| 1 team selected | Compare Now disabled (need >= 2) |
| Favorite deleted team | Handle gracefully, remove from favorites |
| Network failure during toggle | Rollback optimistic update, show error toast |
| Different device login | Favorites sync from Firestore automatically |

---

## 7. Common Pitfalls

### Pattern Violations to Avoid
| Anti-Pattern | Correct Approach |
|--------------|------------------|
| FavoritesService managing listeners | Service manages cache only, FavoritesPanel owns listeners |
| Separate selection states | Use unified TeamBrowserState for both panels |
| Fetching team data on render | Read from TeamService cache |
| Not updating cache on Firestore change | Always call TeamService.updateCachedTeam() |

### Integration Mistakes
| Mistake | Prevention |
|---------|------------|
| Star button not updating Browse display | Listen to 'favorites-updated' event |
| Selection not syncing between panels | Use single TeamBrowserState instance |
| Compare Now not updating count | Re-render on 'team-selection-changed' |
| Optimistic update not rolled back on error | Wrap Cloud Function call in try/catch with rollback |

---

## 8. Implementation Notes

### File Creation Order
1. `FavoritesService.js` - localStorage persistence
2. `FavoritesPanel.js` - UI component
3. Enhance `TeamBrowser.js` - star button functionality
4. Enhance `TeamBrowserState.js` - add event dispatch

### Module Loading
Add to `public/index.html` script loading:
```html
<script type="module">
    import FavoritesService from './js/services/FavoritesService.js';
    import FavoritesPanel from './js/components/FavoritesPanel.js';

    // Initialize after auth
    FavoritesService.init(currentUserId);
    await FavoritesPanel.init();
</script>
```

### CSS Classes Used
All styling uses existing Tailwind classes:
- `bg-primary/20` - selected state background
- `border-primary` - selected state border
- `text-yellow-500` - favorited star color
- `bg-card`, `border-border` - card styling
- `text-muted-foreground` - secondary text

### Dependencies
- TeamService (for cached team data)
- TeamBrowserState (for unified selection)
- firebase/firestore (for team data listener)

---

## 9. Definition of Done

- [ ] FavoritesService persists to localStorage
- [ ] FavoritesPanel renders in middle-right panel
- [ ] Star button in TeamBrowser toggles favorites
- [ ] Team cards toggle selection on click
- [ ] Select All / Deselect All work correctly
- [ ] Compare Now button shows selection count
- [ ] Selection syncs between Favorites and Browse panels
- [ ] Team data updates in real-time via listener
- [ ] Empty state shows helpful message
- [ ] Favorites survive page refresh
- [ ] No console errors
- [ ] Follows cache + listeners pattern per CLAUDE.md
