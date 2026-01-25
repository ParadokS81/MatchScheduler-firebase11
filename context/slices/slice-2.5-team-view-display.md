# Slice 2.5: Team View Display

## 1. Slice Definition
- **Slice ID:** 2.5
- **Name:** Team View Display
- **User Story:** As a team member, I can see which teammates are available for each time slot so that I know when we can schedule practices or matches
- **Success Criteria:** User sees player initials/avatars in time slots with proper overflow handling ([+X] indicator), can toggle between initials/avatars display mode, and sees real-time updates when teammates change their availability

## 2. PRD Mapping
```
PRIMARY SECTIONS:
- 4.1.2 Team View Mode (Default):
  - Shows your own team's availability
  - Displays player initials or avatars in time slots (toggle in grid tools)
  - Space for 4 entities per slot: [ABC] [DEF] [GHI] [JKL]
  - Overflow handling: [ABC] [DEF] [GHI] [+2] - click [+2] for modal
  - Click behavior: Empty space = select slot, [+X] button = show overflow

DEPENDENT SECTIONS:
- 5.1 Hot Paths: Real-time updates must be instant (< 50ms UI update)
- 5.4 Real-time Update Architecture: Direct component listeners
- 6.4 Component Interaction Patterns: Overflow handling pattern
- 2.2 Path A: Player display name and initials from user profile

IGNORED SECTIONS (for this slice):
- 4.1.2 Comparison View Mode - comes in Part 3 (Slice 3.x)
- 4.2.x Team Comparison System - comes in Part 3
```

## 3. Full Stack Architecture
```
FRONTEND COMPONENTS:
- AvailabilityGrid (ENHANCED)
  - Firebase listeners: Already has onSnapshot for /availability/{teamId}_{weekId}
  - Cache interactions:
    - Reads player list from availability slots
    - Gets player details (initials, displayName) from TeamService cache
  - UI responsibilities:
    - NEW: Render player badges (initials or avatars) inside cells
    - NEW: Handle overflow with [+X] indicator (max 3 visible badges)
    - NEW: Show hover tooltip with full player list (cells with 4+ players)
    - NEW: Open overflow modal on [+X] click (backup for touch devices)
    - EXISTING: Handle cell selection (clicking empty space or cell edge)
  - User actions:
    - Click empty cell space → toggle cell selection (existing)
    - Hover cell with 4+ players → show tooltip with full list (NEW)
    - Click [+X] badge → open overflow modal (NEW, fallback for mobile)

- PlayerBadge (NEW - internal to AvailabilityGrid)
  - Display mode: initials (default) or avatar
  - Compact pill style with 2-4 character initials
  - Supports user's own badge styling (highlight current user)

- PlayerTooltip (NEW - lightweight hover popup)
  - Firebase listeners: none (receives data from parent)
  - Cache interactions: none (data passed in)
  - UI responsibilities:
    - Show full player list on hover (cells with 4+ players)
    - Display player initials and names in compact list
    - Highlight current user
    - Position intelligently near hovered cell
  - User actions: Hover to show, mouse-out to hide

- OverflowModal (NEW - fallback for mobile/touch)
  - Firebase listeners: none (receives data from parent)
  - Cache interactions: Gets full player details from TeamService
  - UI responsibilities:
    - Display all players available for a slot
    - Show player initials, display name
    - Indicate current user in list
  - User actions: Close modal

- GridActionButtons (ENHANCED)
  - Firebase listeners: none
  - NEW: Display toggle for Initials/Avatars mode
  - Persists preference in localStorage

FRONTEND SERVICES:
- AvailabilityService (existing)
  - getSlotPlayers(teamId, weekId, slotId) → returns array of userIds
  - Already has real-time subscription to availability docs

- TeamService (existing)
  - getTeam(teamId) → returns team with playerRoster array
  - Each player has: userId, displayName, initials, role

- PlayerDisplayService (NEW - lightweight helper)
  - getDisplayMode() → 'initials' | 'avatars'
  - setDisplayMode(mode) → saves to localStorage
  - getPlayerDisplay(userId, teamRoster) → { initials, displayName, photoURL, isCurrentUser }

BACKEND REQUIREMENTS:
⚠️ NO NEW CLOUD FUNCTIONS NEEDED
- Player display uses existing data structures
- Availability data already synced via slice 2.2
- Team roster already available in /teams/{teamId} document

- Firestore Operations:
  - READ ONLY for this slice
  - /teams/{teamId}.playerRoster - get player initials/names
  - /availability/{teamId}_{weekId}.slots - get who's in each slot

- Security Rules:
  - No changes needed - all reads already allowed for authenticated users

INTEGRATION POINTS:
- Frontend data flow:
  Availability listener fires → getSlotPlayers() → match with team roster → render badges
- Player lookup: userId from slot → find in team.playerRoster → get initials/displayName
- Display mode: localStorage preference → apply to badge rendering
```

## 4. Integration Code Examples

### PlayerDisplayService (NEW - lightweight helper)
```javascript
// PlayerDisplayService.js - Display mode management and player lookup
const PlayerDisplayService = (function() {
    'use strict';

    const STORAGE_KEY = 'matchscheduler_display_mode';
    const DEFAULT_MODE = 'initials';

    function getDisplayMode() {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE;
    }

    function setDisplayMode(mode) {
        if (mode === 'initials' || mode === 'avatars') {
            localStorage.setItem(STORAGE_KEY, mode);
            console.log('📺 Display mode set to:', mode);
            return true;
        }
        return false;
    }

    /**
     * Get display info for a player
     * @param {string} userId - The player's user ID
     * @param {Array} playerRoster - Team's playerRoster array
     * @param {string} currentUserId - Current logged-in user ID
     * @returns {Object} { initials, displayName, photoURL, isCurrentUser, found }
     */
    function getPlayerDisplay(userId, playerRoster, currentUserId) {
        const player = playerRoster?.find(p => p.userId === userId);

        if (!player) {
            return {
                initials: '??',
                displayName: 'Unknown Player',
                photoURL: null,
                isCurrentUser: userId === currentUserId,
                found: false
            };
        }

        return {
            initials: player.initials || player.displayName?.substring(0, 2).toUpperCase() || '??',
            displayName: player.displayName || 'Unknown',
            photoURL: player.photoURL || null,
            isCurrentUser: userId === currentUserId,
            found: true
        };
    }

    /**
     * Get display info for multiple players
     * @param {Array<string>} userIds - Array of user IDs
     * @param {Array} playerRoster - Team's playerRoster array
     * @param {string} currentUserId - Current logged-in user ID
     * @returns {Array} Array of player display objects
     */
    function getPlayersDisplay(userIds, playerRoster, currentUserId) {
        return userIds.map(userId => ({
            userId,
            ...getPlayerDisplay(userId, playerRoster, currentUserId)
        }));
    }

    return {
        getDisplayMode,
        setDisplayMode,
        getPlayerDisplay,
        getPlayersDisplay
    };
})();
```

### Enhanced AvailabilityGrid - Cell Rendering with Player Badges
```javascript
// Addition to AvailabilityGrid.js - player badge rendering

// Constants for player display
const MAX_VISIBLE_BADGES = 3;  // Show 3 badges + overflow indicator
const TOOLTIP_THRESHOLD = 4;   // Show tooltip when 4+ players

/**
 * Render player badges inside a cell
 * @param {HTMLElement} cell - The grid cell element
 * @param {Array<string>} playerIds - User IDs of available players
 * @param {Array} playerRoster - Team's playerRoster array
 * @param {string} currentUserId - Current user's ID
 * @param {string} displayMode - 'initials' or 'avatars'
 */
function _renderPlayerBadges(cell, playerIds, playerRoster, currentUserId, displayMode) {
    if (!playerIds || playerIds.length === 0) {
        cell.innerHTML = '';
        cell.classList.remove('has-players', 'has-overflow');
        return;
    }

    cell.classList.add('has-players');

    const players = PlayerDisplayService.getPlayersDisplay(playerIds, playerRoster, currentUserId);
    const hasOverflow = players.length > MAX_VISIBLE_BADGES;
    const visiblePlayers = hasOverflow ? players.slice(0, MAX_VISIBLE_BADGES) : players;
    const overflowCount = players.length - MAX_VISIBLE_BADGES;

    // Mark cell for tooltip behavior if 4+ players
    if (players.length >= TOOLTIP_THRESHOLD) {
        cell.classList.add('has-overflow');
        cell.dataset.playerCount = players.length;
    } else {
        cell.classList.remove('has-overflow');
        delete cell.dataset.playerCount;
    }

    let badgesHtml = '<div class="player-badges">';

    visiblePlayers.forEach(player => {
        const isCurrentUserClass = player.isCurrentUser ? 'current-user' : '';

        if (displayMode === 'avatars' && player.photoURL) {
            badgesHtml += `
                <div class="player-badge avatar ${isCurrentUserClass}" data-player-name="${player.displayName}">
                    <img src="${player.photoURL}" alt="${player.initials}" />
                </div>
            `;
        } else {
            badgesHtml += `
                <div class="player-badge initials ${isCurrentUserClass}" data-player-name="${player.displayName}">
                    ${player.initials}
                </div>
            `;
        }
    });

    if (hasOverflow) {
        badgesHtml += `
            <button class="player-badge overflow" data-overflow-count="${overflowCount}">
                +${overflowCount}
            </button>
        `;
    }

    badgesHtml += '</div>';
    cell.innerHTML = badgesHtml;
}

/**
 * Update all cells with player availability data
 * @param {Object} availabilityData - The availability document data
 * @param {Array} playerRoster - Team's playerRoster array
 * @param {string} currentUserId - Current user's ID
 */
function updateTeamDisplay(availabilityData, playerRoster, currentUserId) {
    if (!_container || !availabilityData) return;

    const displayMode = PlayerDisplayService.getDisplayMode();
    const slots = availabilityData.slots || {};

    // Process each cell
    const allCells = _container.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        const cellId = cell.dataset.cellId;
        const playerIds = slots[cellId] || [];

        _renderPlayerBadges(cell, playerIds, playerRoster, currentUserId, displayMode);

        // Update user-available state (keep existing border indicator)
        if (playerIds.includes(currentUserId)) {
            cell.classList.add('user-available');
        } else {
            cell.classList.remove('user-available');
        }
    });
}

// Handle overflow badge click
function _handleOverflowClick(e) {
    const overflowBadge = e.target.closest('.player-badge.overflow');
    if (!overflowBadge) return;

    e.stopPropagation(); // Don't trigger cell selection

    const cell = overflowBadge.closest('.grid-cell');
    const cellId = cell?.dataset.cellId;

    if (cellId && _onOverflowClickCallback) {
        _onOverflowClickCallback(cellId, _weekId);
    }
}

// Add to instance:
let _onOverflowClickCallback = null;

function onOverflowClick(callback) {
    _onOverflowClickCallback = callback;
}

// Add to public API:
const instance = {
    // ... existing methods
    updateTeamDisplay,
    onOverflowClick,
    setTooltipData  // For tooltip to access player data
};
```

### PlayerTooltip Component (NEW - hover popup)
```javascript
// PlayerTooltip.js - Lightweight hover tooltip for player lists
const PlayerTooltip = (function() {
    'use strict';

    let _tooltip = null;
    let _hideTimeout = null;
    let _currentCellId = null;

    function _createTooltip() {
        if (_tooltip) return;

        _tooltip = document.createElement('div');
        _tooltip.id = 'player-tooltip';
        _tooltip.className = 'player-tooltip';
        _tooltip.style.display = 'none';
        document.body.appendChild(_tooltip);

        // Keep tooltip visible when hovering over it
        _tooltip.addEventListener('mouseenter', () => {
            if (_hideTimeout) {
                clearTimeout(_hideTimeout);
                _hideTimeout = null;
            }
        });

        _tooltip.addEventListener('mouseleave', () => {
            hide();
        });
    }

    /**
     * Show tooltip near the hovered cell
     * @param {HTMLElement} cell - The grid cell being hovered
     * @param {Array} players - Array of player display objects
     * @param {string} currentUserId - Current user's ID
     */
    function show(cell, players, currentUserId) {
        _createTooltip();

        if (_hideTimeout) {
            clearTimeout(_hideTimeout);
            _hideTimeout = null;
        }

        _currentCellId = cell.dataset.cellId;

        // Sort: current user first, then alphabetically
        const sortedPlayers = [...players].sort((a, b) => {
            if (a.isCurrentUser) return -1;
            if (b.isCurrentUser) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

        // Build tooltip content
        const playersHtml = sortedPlayers.map(player => {
            const youBadge = player.isCurrentUser ? ' <span class="tooltip-you">(You)</span>' : '';
            const currentClass = player.isCurrentUser ? 'tooltip-current' : '';
            return `
                <div class="tooltip-player ${currentClass}">
                    <span class="tooltip-initials">${player.initials}</span>
                    <span class="tooltip-name">${player.displayName}${youBadge}</span>
                </div>
            `;
        }).join('');

        _tooltip.innerHTML = `
            <div class="tooltip-header">${players.length} players available</div>
            <div class="tooltip-list">
                ${playersHtml}
            </div>
        `;

        // Position tooltip near cell
        const cellRect = cell.getBoundingClientRect();
        const tooltipRect = _tooltip.getBoundingClientRect();

        // Default: show to the right of the cell
        let left = cellRect.right + 8;
        let top = cellRect.top;

        // If tooltip would go off right edge, show on left
        if (left + 180 > window.innerWidth) {
            left = cellRect.left - 180 - 8;
        }

        // If tooltip would go off bottom, adjust up
        if (top + 200 > window.innerHeight) {
            top = window.innerHeight - 200 - 8;
        }

        _tooltip.style.left = `${left}px`;
        _tooltip.style.top = `${top}px`;
        _tooltip.style.display = 'block';
    }

    function hide() {
        _hideTimeout = setTimeout(() => {
            if (_tooltip) {
                _tooltip.style.display = 'none';
            }
            _currentCellId = null;
        }, 150); // Small delay to allow moving to tooltip
    }

    function hideImmediate() {
        if (_hideTimeout) {
            clearTimeout(_hideTimeout);
            _hideTimeout = null;
        }
        if (_tooltip) {
            _tooltip.style.display = 'none';
        }
        _currentCellId = null;
    }

    function isVisible() {
        return _tooltip && _tooltip.style.display !== 'none';
    }

    function getCurrentCellId() {
        return _currentCellId;
    }

    function cleanup() {
        hideImmediate();
        if (_tooltip) {
            _tooltip.remove();
            _tooltip = null;
        }
    }

    return {
        show,
        hide,
        hideImmediate,
        isVisible,
        getCurrentCellId,
        cleanup
    };
})();
```

### Hover Handler in AvailabilityGrid
```javascript
// Add to AvailabilityGrid.js - hover handling for tooltips

let _playerRoster = null;
let _currentUserId = null;
let _availabilitySlots = null;

// Store data for tooltip access
function setTooltipData(slots, roster, userId) {
    _availabilitySlots = slots;
    _playerRoster = roster;
    _currentUserId = userId;
}

// Handle cell hover for tooltip
function _handleCellMouseEnter(e) {
    const cell = e.target.closest('.grid-cell');
    if (!cell || !cell.classList.contains('has-overflow')) return;

    const cellId = cell.dataset.cellId;
    const playerIds = _availabilitySlots?.[cellId] || [];

    if (playerIds.length >= 4 && _playerRoster) {
        const players = PlayerDisplayService.getPlayersDisplay(
            playerIds,
            _playerRoster,
            _currentUserId
        );
        PlayerTooltip.show(cell, players, _currentUserId);
    }
}

function _handleCellMouseLeave(e) {
    const cell = e.target.closest('.grid-cell');
    if (!cell || !cell.classList.contains('has-overflow')) return;

    PlayerTooltip.hide();
}

// Add to _attachEventListeners():
_container.addEventListener('mouseenter', _handleCellMouseEnter, true);
_container.addEventListener('mouseleave', _handleCellMouseLeave, true);
```

### OverflowModal Component (NEW - fallback for mobile)
```javascript
// OverflowModal.js - Shows all players available for a slot
const OverflowModal = (function() {
    'use strict';

    let _container = null;
    let _isOpen = false;

    function _render(slotId, weekId, players, currentUserId) {
        // Format slot ID for display (e.g., "mon_1900" → "Monday 19:00")
        const [day, time] = slotId.split('_');
        const dayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
        const formattedDay = dayNames[day] || day;
        const formattedTime = `${time.slice(0, 2)}:${time.slice(2)}`;

        const playersHtml = players.map(player => {
            const isCurrentUser = player.userId === currentUserId;
            const currentUserBadge = isCurrentUser ? '<span class="text-xs text-primary ml-2">(You)</span>' : '';

            return `
                <div class="flex items-center gap-3 p-2 rounded ${isCurrentUser ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'}">
                    <div class="player-badge initials ${isCurrentUser ? 'current-user' : ''}">
                        ${player.initials}
                    </div>
                    <span class="text-sm text-foreground">${player.displayName}${currentUserBadge}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="overflow-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <div>
                            <h2 class="text-lg font-semibold text-foreground">Available Players</h2>
                            <p class="text-sm text-muted-foreground">${formattedDay} ${formattedTime} - Week ${weekId}</p>
                        </div>
                        <button id="overflow-modal-close"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4 max-h-80 overflow-y-auto">
                        <p class="text-sm text-muted-foreground mb-3">
                            ${players.length} player${players.length !== 1 ? 's' : ''} available
                        </p>
                        <div class="space-y-2">
                            ${playersHtml}
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="p-4 border-t border-border">
                        <button id="overflow-modal-done"
                                class="btn btn-primary w-full">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function _attachListeners() {
        const backdrop = document.getElementById('overflow-modal-backdrop');
        const closeBtn = document.getElementById('overflow-modal-close');
        const doneBtn = document.getElementById('overflow-modal-done');

        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);
        doneBtn?.addEventListener('click', close);

        // ESC key to close
        document.addEventListener('keydown', _handleKeyDown);
    }

    function _handleKeyDown(e) {
        if (e.key === 'Escape' && _isOpen) {
            close();
        }
    }

    /**
     * Show the overflow modal with player list
     * @param {string} slotId - The slot ID (e.g., "mon_1900")
     * @param {string} weekId - The week ID (e.g., "2026-05")
     * @param {Array<string>} playerIds - Array of user IDs
     * @param {Array} playerRoster - Team's playerRoster array
     * @param {string} currentUserId - Current user's ID
     */
    function show(slotId, weekId, playerIds, playerRoster, currentUserId) {
        // Get player display info
        const players = PlayerDisplayService.getPlayersDisplay(playerIds, playerRoster, currentUserId);

        // Sort: current user first, then alphabetically
        players.sort((a, b) => {
            if (a.isCurrentUser) return -1;
            if (b.isCurrentUser) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

        // Create modal container if needed
        if (!_container) {
            _container = document.createElement('div');
            _container.id = 'overflow-modal-container';
            document.body.appendChild(_container);
        }

        _container.innerHTML = _render(slotId, weekId, players, currentUserId);
        _attachListeners();
        _isOpen = true;
    }

    function close() {
        if (_container) {
            _container.innerHTML = '';
        }
        document.removeEventListener('keydown', _handleKeyDown);
        _isOpen = false;
    }

    function cleanup() {
        close();
        if (_container) {
            _container.remove();
            _container = null;
        }
    }

    return {
        show,
        close,
        cleanup
    };
})();
```

### Enhanced GridActionButtons - Display Mode Toggle
```javascript
// Addition to GridActionButtons.js - display mode toggle

function _render() {
    if (!_container) return;

    const currentMode = PlayerDisplayService.getDisplayMode();
    const isInitials = currentMode === 'initials';

    _container.innerHTML = `
        <div class="grid-action-buttons flex flex-col gap-2 p-3 bg-card border border-border rounded-lg shadow-md">
            <!-- Display Mode Toggle -->
            <div class="flex items-center justify-between mb-2 pb-2 border-b border-border">
                <span class="text-xs text-muted-foreground">Display</span>
                <div class="flex gap-1">
                    <button id="display-mode-initials"
                            class="px-2 py-1 text-xs rounded ${isInitials ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}">
                        ABC
                    </button>
                    <button id="display-mode-avatars"
                            class="px-2 py-1 text-xs rounded ${!isInitials ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}">
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-2">
                <button id="add-me-btn"
                        class="btn-primary px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                        disabled>
                    Add Me
                </button>
                <button id="remove-me-btn"
                        class="btn-secondary px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                        disabled>
                    Remove Me
                </button>
            </div>

            <!-- Selection Buttons -->
            <div class="flex gap-2">
                <button id="select-all-btn"
                        class="btn-secondary px-3 py-1.5 rounded text-xs flex-1">
                    Select All
                </button>
                <button id="clear-all-btn"
                        class="btn-secondary px-3 py-1.5 rounded text-xs flex-1">
                    Clear All
                </button>
            </div>

            <!-- Template Section (from Slice 2.4) -->
            <!-- ... existing template UI ... -->
        </div>
    `;

    _attachListeners();
}

function _attachListeners() {
    // ... existing listeners ...

    // Display mode toggle
    const initialsBtn = document.getElementById('display-mode-initials');
    const avatarsBtn = document.getElementById('display-mode-avatars');

    initialsBtn?.addEventListener('click', () => _setDisplayMode('initials'));
    avatarsBtn?.addEventListener('click', () => _setDisplayMode('avatars'));
}

function _setDisplayMode(mode) {
    PlayerDisplayService.setDisplayMode(mode);
    _render(); // Re-render to update toggle state

    // Notify parent to refresh grid display
    if (_onDisplayModeChange) {
        _onDisplayModeChange(mode);
    }
}

let _onDisplayModeChange = null;

function onDisplayModeChange(callback) {
    _onDisplayModeChange = callback;
}

// Add to public API
return {
    // ... existing
    onDisplayModeChange
};
```

### CSS for Player Badges
```css
/* Add to src/css/input.css */

/* Player Badges Container */
.player-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    justify-content: center;
    align-items: center;
    padding: 1px;
    height: 100%;
}

/* Base Badge Style */
.player-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.5rem;
    font-weight: 600;
    border-radius: 0.125rem;
    line-height: 1;
    min-width: 1.25rem;
    height: 0.875rem;
    padding: 0 0.125rem;
    background-color: var(--secondary);
    color: var(--secondary-foreground);
    border: 1px solid var(--border);
}

/* Initials Badge */
.player-badge.initials {
    text-transform: uppercase;
    letter-spacing: -0.02em;
}

/* Avatar Badge */
.player-badge.avatar {
    padding: 0;
    overflow: hidden;
}

.player-badge.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* Current User Badge - highlighted */
.player-badge.current-user {
    background-color: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
}

/* Overflow Badge */
.player-badge.overflow {
    cursor: pointer;
    background-color: var(--muted);
    color: var(--muted-foreground);
    transition: all 100ms ease;
}

.player-badge.overflow:hover {
    background-color: var(--accent);
    color: var(--accent-foreground);
}

/* Cell with players */
.grid-cell.has-players {
    padding: 0;
}

/* Ensure cell selection still works with badges */
.grid-cell.has-players.selected .player-badge {
    border-color: var(--primary-foreground);
}

.grid-cell.has-players.selected .player-badge.current-user {
    background-color: var(--primary-foreground);
    color: var(--primary);
}

/* Responsive - smaller badges on constrained viewports */
@media (max-height: 800px) {
    .player-badge {
        font-size: 0.4375rem;
        min-width: 1rem;
        height: 0.75rem;
    }
}

/* ========================================
   Player Tooltip (hover popup)
   ======================================== */

.player-tooltip {
    position: fixed;
    z-index: 100;
    background-color: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    min-width: 10rem;
    max-width: 14rem;
    padding: 0.5rem;
    pointer-events: auto; /* Allow hovering over tooltip */
}

.tooltip-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted-foreground);
    padding-bottom: 0.375rem;
    margin-bottom: 0.375rem;
    border-bottom: 1px solid var(--border);
}

.tooltip-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 12rem;
    overflow-y: auto;
}

.tooltip-player {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem;
    border-radius: 0.125rem;
}

.tooltip-player.tooltip-current {
    background-color: oklch(from var(--primary) l c h / 0.15);
}

.tooltip-initials {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--muted-foreground);
    min-width: 1.5rem;
}

.tooltip-name {
    font-size: 0.75rem;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.tooltip-you {
    font-size: 0.625rem;
    color: var(--primary);
    font-weight: 500;
}

/* Cell with overflow shows subtle indicator for hover */
.grid-cell.has-overflow {
    cursor: help;
}
```

### WeekDisplay Integration
```javascript
// In WeekDisplay.js - connect grid to team roster data

async function _initAvailabilityListener() {
    const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
    if (!teamId) return;

    const weekId = _getWeekId();

    // Subscribe to availability updates
    await AvailabilityService.subscribe(teamId, weekId, (availabilityData) => {
        _onAvailabilityUpdate(availabilityData);
    });
}

function _onAvailabilityUpdate(availabilityData) {
    const team = MatchSchedulerApp.getSelectedTeam();
    const currentUserId = window.firebase?.auth?.currentUser?.uid;

    if (!team || !currentUserId) return;

    // Update grid with team display (player badges)
    if (_grid) {
        _grid.updateTeamDisplay(
            availabilityData,
            team.playerRoster || [],
            currentUserId
        );
    }
}

// Handle overflow click from grid
function _setupOverflowHandler() {
    if (_grid) {
        _grid.onOverflowClick((slotId, weekId) => {
            const team = MatchSchedulerApp.getSelectedTeam();
            const currentUserId = window.firebase?.auth?.currentUser?.uid;
            const availabilityData = AvailabilityService.getCachedData(team.id, weekId);
            const playerIds = availabilityData?.slots?.[slotId] || [];

            OverflowModal.show(
                slotId,
                weekId,
                playerIds,
                team.playerRoster || [],
                currentUserId
            );
        });
    }
}
```

## 5. Performance Classification
```
HOT PATHS (<50ms):
- Player badge rendering: Pure DOM manipulation, no network
- Display mode toggle: localStorage read, DOM update
- Cell selection with badges: Click handler, class toggle
- Real-time availability update: Cache lookup + DOM re-render

COLD PATHS (<2s):
- None in this slice - all operations use cached data

BACKEND PERFORMANCE:
- No Cloud Functions in this slice
- All data already cached from previous slices
- Player roster comes from TeamService cache
- Availability data comes from AvailabilityService cache
```

## 6. Data Flow Diagram
```
INITIAL LOAD:
App Load → TeamService.getTeam() → Cache team roster
         → AvailabilityService.subscribe() → Cache availability
                                                    ↓
                                           Grid renders with updateTeamDisplay()
                                                    ↓
                                           Player badges shown in cells

REAL-TIME UPDATE:
Teammate adds availability → Firebase document updates
                                    ↓
                            onSnapshot fires
                                    ↓
                            AvailabilityService updates cache
                                    ↓
                            WeekDisplay._onAvailabilityUpdate()
                                    ↓
                            Grid.updateTeamDisplay() re-renders cells

HOVER TOOLTIP (cells with 4+ players):
User hovers cell with has-overflow class → _handleCellMouseEnter()
                                                   ↓
                                           Get players from cache
                                                   ↓
                                           PlayerTooltip.show() positions near cell
                                                   ↓
                                           Tooltip displays full player list
                                                   ↓
User moves mouse away → _handleCellMouseLeave() → PlayerTooltip.hide()

OVERFLOW CLICK (fallback for mobile):
User clicks [+X] badge → _handleOverflowClick()
                              ↓
                        onOverflowClick callback fires
                              ↓
                        OverflowModal.show() with cached data
                              ↓
                        Modal displays all players

DISPLAY MODE TOGGLE:
User clicks Initials/Avatars → _setDisplayMode()
                                     ↓
                               localStorage updated
                                     ↓
                               GridActionButtons re-renders
                                     ↓
                               onDisplayModeChange callback
                                     ↓
                               All grids call updateTeamDisplay()
```

## 7. Test Scenarios
```
FRONTEND TESTS:
- [ ] Empty slot shows no badges (just muted background)
- [ ] Slot with 1 player shows 1 badge
- [ ] Slot with 3 players shows 3 badges (no overflow)
- [ ] Slot with 4+ players shows 3 badges + [+X] overflow indicator
- [ ] [+X] shows correct overflow count (5 players = [+2])
- [ ] Current user's badge is highlighted with primary color
- [ ] Display mode toggle switches between initials/avatars
- [ ] Display mode preference persists in localStorage
- [ ] Avatar mode shows photos when available, falls back to initials
- [ ] Cell selection still works when clicking empty space
- [ ] Cell selection works when clicking cell edge/border
- [ ] Selected cells show proper styling with badges inside
- [ ] User-available border (blue) still visible with badges
- [ ] Cells with 4+ players show cursor: help indicator

HOVER TOOLTIP TESTS:
- [ ] Hovering cell with 4+ players shows tooltip
- [ ] Tooltip appears near the hovered cell
- [ ] Tooltip shows all players (not just overflow)
- [ ] Current user appears first in tooltip list
- [ ] Current user has "(You)" label in tooltip
- [ ] Players sorted alphabetically after current user
- [ ] Tooltip stays visible when hovering over it
- [ ] Mouse leaving cell hides tooltip (with small delay)
- [ ] Mouse leaving tooltip hides tooltip
- [ ] Hovering cells with 1-3 players does NOT show tooltip
- [ ] Tooltip positioned to avoid going off-screen

OVERFLOW MODAL TESTS (mobile fallback):
- [ ] Clicking [+X] opens overflow modal
- [ ] Modal shows all players in slot (not just overflow)
- [ ] Current user appears first in list
- [ ] Current user is highlighted in modal
- [ ] Players sorted alphabetically after current user
- [ ] Modal shows correct slot time (e.g., "Monday 19:00")
- [ ] Modal shows correct week info
- [ ] Clicking backdrop closes modal
- [ ] Clicking X button closes modal
- [ ] Clicking Done button closes modal
- [ ] ESC key closes modal

INTEGRATION TESTS (CRITICAL):
- [ ] Real-time: User A adds availability → User B sees badge appear within 2s
- [ ] Real-time: User A removes availability → Badge disappears on User B's screen
- [ ] Team switch: Changing teams shows correct roster badges for each team
- [ ] Week navigation: Moving between weeks shows correct availability per week
- [ ] Display toggle: Switching mode updates all visible grids immediately
- [ ] Roster change: New member joins → Their badge can appear in slots
- [ ] Tooltip data updates: Teammate joins slot → Tooltip shows updated list

END-TO-END TESTS:
- [ ] New user sets availability → Badge appears in correct slots
- [ ] 5 players mark same slot → [+2] overflow shows correctly
- [ ] Hover slot with 5 players → Tooltip shows all 5 players
- [ ] Click [+2] → Modal shows all 5 players with correct details
- [ ] Change display mode → All badges switch to new mode
- [ ] Page refresh → Display mode preference restored
- [ ] Real-time: Multiple teammates update simultaneously → UI stays consistent
```

## 8. Common Integration Pitfalls
- [ ] Forgetting to update badges when display mode changes
- [ ] Not passing playerRoster to badge rendering (badges show "??")
- [ ] Click event on badge preventing cell selection
- [ ] Overflow click not stopped, triggering cell selection too
- [ ] Missing current user highlighting (userId comparison error)
- [ ] Badge overflow count off-by-one error (now MAX_VISIBLE=3, so 4 players = [+1])
- [ ] Not sorting players in overflow modal/tooltip
- [ ] Listener not updating UI after real-time change
- [ ] Display mode not synced across both week grids
- [ ] Tooltip not hidden when grid re-renders (stale tooltip)
- [ ] Tooltip position calculation wrong for edge cells
- [ ] Hover events not using event capturing (mouseenter/mouseleave)
- [ ] setTooltipData not called, causing tooltip to have no data

## 9. Implementation Notes

### File Structure
```
public/js/
├── services/
│   └── PlayerDisplayService.js  (NEW - lightweight helper)
├── components/
│   ├── PlayerTooltip.js         (NEW - hover popup)
│   ├── AvailabilityGrid.js      (ENHANCED - add badge rendering)
│   ├── GridActionButtons.js     (ENHANCED - add display toggle)
│   ├── WeekDisplay.js           (ENHANCED - integrate team display)
│   └── OverflowModal.js         (NEW)

src/css/
└── input.css                    (ADD player badge styles)
```

### Badge Sizing for 1080p
The grid cells are quite small on 1080p. Badge sizing is carefully calculated:
- Cell height is roughly `(viewport height - nav - margins) / 11 time slots`
- On 1080p (~900px usable), cells are ~30-35px tall
- Badges need to fit 4 across with gaps: ~7px each
- Font size 0.5rem (8px) is readable but compact
- Use `letter-spacing: -0.02em` to pack initials tightly

### Player Data Source
Players come from `team.playerRoster[]` which contains:
```javascript
{
  userId: string,
  displayName: string,
  initials: string,
  role: 'leader' | 'member',
  joinedAt: Date
}
```
This is already loaded in TeamService cache from previous slices.

### Display Mode Storage Key
Use `matchscheduler_display_mode` in localStorage to persist preference.
Default to 'initials' if not set (more reliable than avatars).

### Click Handling Priority
When cell has player badges:
1. Click on `.player-badge.overflow` → Open modal (stopPropagation)
2. Click on `.player-badge` (non-overflow) → Do nothing (let event bubble to cell)
3. Click on empty cell space → Toggle cell selection (existing behavior)

### Existing Behaviors to Preserve
- Blue border on cells where current user is available (user-available class)
- Selection highlighting (selected class)
- Sync shimmer animation during updates (syncing class)
- Drag selection across cells

## 10. Pragmatic Assumptions

- **[ASSUMPTION]**: Maximum 4 badges visible per cell
- **Rationale**: Matches PRD spec, fits well in constrained cell size
- **Alternative**: Could show 3 for more breathing room, but 4 is PRD spec

- **[ASSUMPTION]**: Unknown players show "??" initials
- **Rationale**: Defensive coding - handles edge case of orphaned userIds
- **Alternative**: Could hide unknown players, but better to show something is there

- **[ASSUMPTION]**: Display mode is global (both week grids use same mode)
- **Rationale**: Consistent UX, simpler state management
- **Alternative**: Could allow per-grid mode but unnecessary complexity

- **[ASSUMPTION]**: Avatar mode uses photoURL from roster, falls back to initials
- **Rationale**: Many users won't have photos; graceful degradation
- **Alternative**: Could show placeholder avatar, but initials more useful

---

## Quality Checklist

Before considering this slice spec complete:
- [x] Frontend AND backend requirements specified
- [x] All PRD requirements mapped (4.1.2 Team View Mode)
- [x] Architecture follows established patterns (Cache + Listeners)
- [x] Hot paths clearly identified (all operations use cache)
- [x] Test scenarios cover full stack
- [x] No anti-patterns present
- [x] Data flow complete (Cache → Render → Update)
- [x] Integration examples show actual code
- [x] Error handling specified (unknown player fallback)
- [x] Loading states defined (N/A - all cached data)
- [x] Event logging checked (not required for display)
- [x] API contracts fully specified
- [x] Security rules documented (no changes needed)

---

*Slice created: 2026-01-23*
