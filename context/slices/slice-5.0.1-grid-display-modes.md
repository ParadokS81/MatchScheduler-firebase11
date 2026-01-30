# Slice 5.0.1: Grid Display Modes & Player Colors

> **UPDATE 2026-01-29:** Avatar system simplified - removed multi-size `avatarUrls` object.
> Now using single `photoURL` (128px max) with CSS handling display sizing.
> This simplifies the pipeline and fixes sync issues between user documents and team rosters.

## 1. Slice Definition

- **Slice ID:** 5.0.1
- **Name:** Grid Display Modes & Player Colors
- **User Story:** As a team leader, I can choose how player availability is displayed in the grid (initials, colored initials, colored dots, or avatars) and assign custom colors to roster members for faster visual recognition, so I can quickly scan the grid and identify who's available for a given time slot.
- **Success Criteria:**
  - Four-mode display toggle in Grid Tools (ABC, colored ABC, dots, avatars)
  - Hover over roster member reveals color picker
  - Player colors persist per-user and apply across teams
  - Timeslot cells render players according to selected mode
  - ~~Small avatar URLs stored in user documents for badge mode~~ (Simplified: single photoURL, CSS sizing)

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- Grid Tools Enhancement (5.0b): Display mode toggle expanded from 2 to 4 modes
- Team View Display (2.5): Display mode persistence and rendering

DEPENDENT SECTIONS:
- Avatar Management (4.3.3): Avatar processing already creates 32px small size
- User Profile: New playerColors field for color assignments

NEW FUNCTIONALITY:
- Player color assignment UI (roster hover)
- Color-coded rendering in grid cells
- Colored dot display mode
- Schema update for avatar URLs and player colors
```

---

## 3. Full Stack Architecture

```
FRONTEND COMPONENTS:

MODIFIED - GridActionButtons.js
  - Firebase listeners: none (unchanged)
  - Cache interactions: none (unchanged)
  - UI responsibilities:
    - Four-mode display toggle: [ABC] [ABC̲] [●] [👤]
    - Mode icons with visual distinction
  - User actions: Click to switch display mode

MODIFIED - RosterList.js (or equivalent roster component)
  - Firebase listeners: user document for playerColors
  - Cache interactions: UserService cache
  - UI responsibilities:
    - Show color indicator dot next to each player
    - Hover reveals edit (pencil) icon for color
    - Click opens color picker popover
  - User actions: Assign/change player color

NEW - ColorPickerPopover.js
  - Firebase listeners: none
  - Cache interactions: none
  - UI responsibilities:
    - 12-color preset palette (optimized for dark bg)
    - Optional hex input for power users
    - Clear color option
  - User actions: Select color, input hex, clear

MODIFIED - AvailabilityGrid.js
  - Firebase listeners: unchanged
  - Cache interactions: PlayerDisplayService, UserService (for colors)
  - UI responsibilities:
    - Render cells based on display mode
    - Mode 'initials': Plain text initials (current)
    - Mode 'coloredInitials': Initials with assigned color
    - Mode 'coloredDots': Small colored circles
    - Mode 'avatars': 32px avatar badges
  - Performance: Single-row horizontal layout, max 4 visible + overflow indicator

FRONTEND SERVICES:

MODIFIED - PlayerDisplayService.js
  - New modes: 'initials' | 'coloredInitials' | 'coloredDots' | 'avatars'
  - getPlayerColor(userId): Get assigned color from current user's preferences
  - Default color for unassigned players (muted gray)

MODIFIED - UserService.js
  - getPlayerColors(): Get current user's playerColors map
  - setPlayerColor(targetUserId, color): Update color assignment
  - Cached locally, synced to Firestore

BACKEND REQUIREMENTS:

MODIFIED - avatar-processing.js (Cloud Function)
  - Already creates small (32px) avatars
  - Change: Save all three URLs to user document (not just large)

SCHEMA CHANGES:

users/{userId}:
  + avatarUrls: {              // NEW: All avatar sizes
      large: string,           // 128px (was customAvatarUrl)
      medium: string,          // 64px
      small: string            // 32px - for grid badges
    }
  + playerColors: {            // NEW: Color assignments (per-user preference)
      [targetUserId: string]: string  // hex color, e.g., "#FF6B6B"
    }

  # DEPRECATED (keep for backwards compat during migration):
  - customAvatarUrl: string    // Replaced by avatarUrls.large

MIGRATION NOTE:
- Existing customAvatarUrl values should be copied to avatarUrls.large
- Re-seeding is acceptable per user request
```

---

## 4. Integration Code Examples

### Display Mode Toggle (GridActionButtons enhancement)

```javascript
// Updated render for 4-mode toggle
const modes = [
    { id: 'initials', label: 'ABC', title: 'Plain initials' },
    { id: 'coloredInitials', label: 'ABC', title: 'Colored initials', colored: true },
    { id: 'coloredDots', label: '●', title: 'Colored dots' },
    { id: 'avatars', icon: 'user', title: 'Avatar badges' }
];

const currentMode = PlayerDisplayService.getDisplayMode();

// Render toggle buttons
`<div class="flex items-center gap-0.5">
    ${modes.map(mode => `
        <button id="display-mode-${mode.id}"
                class="px-1.5 py-0.5 text-xs rounded ${currentMode === mode.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'}"
                title="${mode.title}">
            ${mode.icon === 'user'
                ? '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>'
                : mode.colored
                    ? '<span class="bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 bg-clip-text text-transparent font-semibold">ABC</span>'
                    : mode.label}
        </button>
    `).join('')}
</div>`
```

### Roster Color Assignment (hover interaction)

```javascript
// In RosterList or TeamDrawer roster section
function _renderRosterMember(player, assignedColor) {
    return `
        <div class="roster-member group flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50"
             data-user-id="${player.userId}">
            <img src="${player.photoURL || '/images/default-avatar.png'}"
                 class="w-6 h-6 rounded-full" alt="">
            <span class="flex-1 text-sm truncate">${_escapeHtml(player.displayName)}</span>
            <span class="text-xs text-muted-foreground font-mono">${player.initials}</span>
            <div class="color-indicator w-4 h-4 rounded-full border border-border cursor-pointer
                        opacity-0 group-hover:opacity-100 transition-opacity"
                 style="background-color: ${assignedColor || 'transparent'}"
                 title="Set player color">
            </div>
        </div>
    `;
}

// Color picker popover trigger
container.addEventListener('click', (e) => {
    const colorIndicator = e.target.closest('.color-indicator');
    if (colorIndicator) {
        const userId = colorIndicator.closest('.roster-member').dataset.userId;
        ColorPickerPopover.show(colorIndicator, userId);
    }
});
```

### ColorPickerPopover Component

```javascript
const ColorPickerPopover = (function() {
    'use strict';

    // Optimized for dark background visibility
    const PRESET_COLORS = [
        '#FF6B6B', // Red
        '#FF8E53', // Orange
        '#FFD93D', // Yellow
        '#6BCB77', // Green
        '#4ECDC4', // Teal
        '#45B7D1', // Cyan
        '#5D9CEC', // Blue
        '#A78BFA', // Purple
        '#F472B6', // Pink
        '#9CA3AF', // Gray
        '#FBBF24', // Amber
        '#34D399', // Emerald
    ];

    let _popover = null;
    let _targetUserId = null;

    function show(anchorEl, userId) {
        _targetUserId = userId;
        const currentColor = UserService.getPlayerColor(userId);

        if (_popover) _popover.remove();

        _popover = document.createElement('div');
        _popover.className = 'color-picker-popover absolute z-50 bg-card border border-border rounded-lg shadow-xl p-3';
        _popover.innerHTML = `
            <div class="grid grid-cols-6 gap-2 mb-3">
                ${PRESET_COLORS.map(color => `
                    <button class="color-swatch w-6 h-6 rounded-full border-2 transition-transform hover:scale-110
                                   ${color === currentColor ? 'border-primary ring-2 ring-primary/50' : 'border-transparent'}"
                            style="background-color: ${color}"
                            data-color="${color}">
                    </button>
                `).join('')}
            </div>
            <div class="flex items-center gap-2 pt-2 border-t border-border">
                <input type="text"
                       class="flex-1 px-2 py-1 text-xs bg-input border border-border rounded font-mono"
                       placeholder="#RRGGBB"
                       value="${currentColor || ''}"
                       maxlength="7">
                <button class="clear-color text-xs text-muted-foreground hover:text-foreground px-2 py-1">
                    Clear
                </button>
            </div>
        `;

        // Position near anchor
        const rect = anchorEl.getBoundingClientRect();
        _popover.style.top = `${rect.bottom + 8}px`;
        _popover.style.left = `${rect.left}px`;

        document.body.appendChild(_popover);

        // Event listeners
        _popover.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => _selectColor(swatch.dataset.color));
        });

        _popover.querySelector('.clear-color').addEventListener('click', () => _selectColor(null));

        const hexInput = _popover.querySelector('input');
        hexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && _isValidHex(hexInput.value)) {
                _selectColor(hexInput.value);
            }
        });

        // Click outside to close
        setTimeout(() => {
            document.addEventListener('click', _handleOutsideClick);
        }, 0);
    }

    function _selectColor(color) {
        UserService.setPlayerColor(_targetUserId, color);
        hide();
        // Trigger re-render of grid and roster
        window.dispatchEvent(new CustomEvent('player-colors-changed'));
    }

    function _isValidHex(str) {
        return /^#[0-9A-Fa-f]{6}$/.test(str);
    }

    function _handleOutsideClick(e) {
        if (_popover && !_popover.contains(e.target)) {
            hide();
        }
    }

    function hide() {
        document.removeEventListener('click', _handleOutsideClick);
        if (_popover) {
            _popover.remove();
            _popover = null;
        }
        _targetUserId = null;
    }

    return { show, hide };
})();
```

### Grid Cell Rendering (AvailabilityGrid enhancement)

```javascript
function _renderCellContent(userIds, mode, playerRoster, currentUserId) {
    const maxVisible = 4;
    const visibleIds = userIds.slice(0, maxVisible);
    const overflow = userIds.length - maxVisible;

    const players = PlayerDisplayService.getPlayersDisplay(visibleIds, playerRoster, currentUserId);

    let html = '<div class="cell-players flex items-center gap-0.5">';

    players.forEach(player => {
        const color = UserService.getPlayerColor(player.userId);

        switch (mode) {
            case 'initials':
                html += `<span class="text-xs font-medium ${player.isCurrentUser ? 'text-primary' : 'text-foreground'}">${player.initials}</span>`;
                break;

            case 'coloredInitials':
                html += `<span class="text-xs font-semibold" style="color: ${color || 'inherit'}">${player.initials}</span>`;
                break;

            case 'coloredDots':
                html += `<span class="w-2.5 h-2.5 rounded-full inline-block"
                               style="background-color: ${color || '#6B7280'}"></span>`;
                break;

            case 'avatars':
                const avatarUrl = player.avatarUrls?.small || player.photoURL || '/images/default-avatar.png';
                html += `<img src="${avatarUrl}"
                              class="w-5 h-5 rounded-full border ${player.isCurrentUser ? 'border-primary' : 'border-border'}"
                              alt="${player.initials}"
                              title="${player.displayName}">`;
                break;
        }
    });

    if (overflow > 0) {
        html += `<span class="text-xs text-muted-foreground">+${overflow}</span>`;
    }

    html += '</div>';
    return html;
}
```

### Avatar Processing Update (Cloud Function)

```javascript
// In avatar-processing.js, update the Firestore write to include all URLs

// Current (line ~152):
await userRef.update({
    customAvatarUrl: avatarUrls.large,
    avatarSource: 'custom',
    photoURL: avatarUrls.large,
    lastUpdatedAt: FieldValue.serverTimestamp()
});

// Updated:
await userRef.update({
    // New structure with all sizes
    avatarUrls: {
        large: avatarUrls.large,
        medium: avatarUrls.medium,
        small: avatarUrls.small
    },
    // Keep these for backwards compatibility
    customAvatarUrl: avatarUrls.large,
    avatarSource: 'custom',
    photoURL: avatarUrls.large,
    lastUpdatedAt: FieldValue.serverTimestamp()
});
```

### UserService Color Management

```javascript
// Add to UserService.js

let _playerColors = {}; // Local cache

/**
 * Get color assigned to a player by current user
 * @param {string} targetUserId - The player to get color for
 * @returns {string|null} Hex color or null if not assigned
 */
function getPlayerColor(targetUserId) {
    return _playerColors[targetUserId] || null;
}

/**
 * Set color for a player
 * @param {string} targetUserId - The player to assign color to
 * @param {string|null} color - Hex color or null to clear
 */
async function setPlayerColor(targetUserId, color) {
    const userId = window.firebase?.currentUser?.uid;
    if (!userId) return { success: false, error: 'Not authenticated' };

    // Update local cache immediately (optimistic)
    if (color) {
        _playerColors[targetUserId] = color;
    } else {
        delete _playerColors[targetUserId];
    }

    // Sync to Firestore
    try {
        const { doc, updateDoc, deleteField } = await import('firebase/firestore');
        const userRef = doc(window.firebase.db, 'users', userId);

        await updateDoc(userRef, {
            [`playerColors.${targetUserId}`]: color || deleteField()
        });

        return { success: true };
    } catch (error) {
        console.error('Failed to save player color:', error);
        // Revert optimistic update
        if (color) {
            delete _playerColors[targetUserId];
        }
        return { success: false, error: error.message };
    }
}

/**
 * Load player colors from user document (call on init)
 */
function loadPlayerColors(userDoc) {
    _playerColors = userDoc.playerColors || {};
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Display mode toggle: localStorage + DOM update, no async
- Color swatch click: Optimistic local update + async Firestore
- Cell rendering: All data from cache (roster, colors, avatars)

COLD PATHS (<2s):
- Initial load of playerColors: Part of user document load
- Avatar URL fetch on first render: Cached after first load
- Color sync to Firestore: Background operation, UI already updated

BACKEND PERFORMANCE:
- Avatar processing: No change to function complexity
- Player colors: Simple field merge, no new queries needed
- No new indexes required
```

---

## 6. Data Flow Diagram

```
DISPLAY MODE CHANGE:
User clicks mode toggle → PlayerDisplayService.setDisplayMode()
    → localStorage.setItem() + dispatch 'display-mode-changed'
    → AvailabilityGrid listens → _renderCells() with new mode
    → Cells re-render with appropriate style (instant)

COLOR ASSIGNMENT:
User hovers roster member → Color indicator appears
    → User clicks → ColorPickerPopover.show()
    → User selects color → UserService.setPlayerColor()
    → Optimistic: _playerColors updated immediately
    → dispatch 'player-colors-changed'
    → AvailabilityGrid + RosterList re-render
    → Background: Firestore updateDoc()

AVATAR DISPLAY:
Grid needs to render avatar → Check player.avatarUrls.small
    → If exists: Use small URL (32px, cached by browser)
    → If not: Fall back to photoURL or default avatar
    → Render as <img> with appropriate styling

AVATAR UPLOAD (existing flow, enhanced):
User uploads avatar → Storage trigger → processAvatarUpload()
    → Create 3 sizes → Upload to Storage
    → Update user document with avatarUrls object (NEW)
    → Also update photoURL for backwards compat
    → onSnapshot listener → UI updates
```

---

## 7. Test Scenarios

```
DISPLAY MODE TESTS:
- [ ] Grid Tools shows 4-mode toggle (ABC, colored ABC, dot, avatar)
- [ ] Clicking each mode updates toggle visual state
- [ ] Mode persists in localStorage across page refresh
- [ ] Grid cells re-render when mode changes
- [ ] Initials mode: Plain text initials displayed
- [ ] Colored initials mode: Initials in assigned colors
- [ ] Colored dots mode: Small colored circles displayed
- [ ] Avatars mode: 32px avatar images displayed

COLOR ASSIGNMENT TESTS:
- [ ] Roster member hover shows color indicator
- [ ] Click color indicator opens color picker popover
- [ ] 12 preset colors displayed in grid
- [ ] Hex input accepts valid hex codes
- [ ] Clear button removes assigned color
- [ ] Selected color shows ring/border highlight
- [ ] Click outside closes popover
- [ ] Color changes reflect immediately in grid
- [ ] Color persists after page refresh
- [ ] Color applies across different teams (same player)

AVATAR RENDERING TESTS:
- [ ] Users with custom avatars show small (32px) version
- [ ] Users without avatars show default avatar
- [ ] Current user's avatar has primary border
- [ ] Avatar mode shows proper sizing in cells
- [ ] Overflow indicator (+N) works with avatars

SCHEMA/BACKEND TESTS:
- [ ] Avatar upload saves all 3 URLs to avatarUrls object
- [ ] photoURL still updated for backwards compat
- [ ] playerColors field created on first color assignment
- [ ] Color cleared with deleteField() not null

INTEGRATION TESTS:
- [ ] Switch team → colors still apply (user-level, not team-level)
- [ ] New roster member → no color assigned (gray default in dots mode)
- [ ] Player leaves team → their color assignment remains (for if they rejoin)
- [ ] 5+ players in slot → 4 visible + overflow indicator in all modes
```

---

## 8. Common Integration Pitfalls

```
WATCH FOR:
- [ ] Color picker popover z-index conflicts with modals
- [ ] Hex input not validating format before save
- [ ] Optimistic color update not reverted on Firestore error
- [ ] Avatar mode using large URL instead of small (performance)
- [ ] Display mode event not triggering grid re-render
- [ ] Missing fallback when avatarUrls.small is undefined
- [ ] playerColors not loaded on initial user document fetch
- [ ] Color picker not closing when clicking another roster member

SPECIFIC TO THIS SLICE:
- [ ] Gradient text for colored ABC toggle may not work in all browsers
- [ ] 32px avatars may look blurry on retina - consider 64px with CSS sizing
- [ ] deleteField() import needed when clearing colors
- [ ] Color picker positioning when near screen edge
- [ ] Browser caching of old avatar URLs after re-upload
```

---

## 9. Implementation Notes

### File Changes Summary

| File | Action | Key Changes |
|------|--------|-------------|
| `public/js/components/GridActionButtons.js` | MODIFY | 4-mode display toggle |
| `public/js/components/AvailabilityGrid.js` | MODIFY | Multi-mode cell rendering |
| `public/js/components/ColorPickerPopover.js` | CREATE | Color assignment UI |
| `public/js/components/TeamDrawer.js` or `RosterList.js` | MODIFY | Color indicator + hover trigger |
| `public/js/services/PlayerDisplayService.js` | MODIFY | 4 modes, color integration |
| `public/js/services/UserService.js` | MODIFY | playerColors management |
| `functions/avatar-processing.js` | MODIFY | Save all avatar URLs |
| `context/SCHEMA.md` | MODIFY | Document avatarUrls and playerColors |
| `src/css/input.css` | MODIFY | Color picker styles, gradient text |

### Dependencies

- **Hard:** Slice 5.0b (Grid Tools Enhancement) - display toggle exists
- **Soft:** Slice 4.3.3 (Avatar Manager) - avatar processing exists

### Color Palette Rationale

The 12 preset colors are chosen for:
1. **Dark background visibility** - All colors have sufficient contrast on dark UI
2. **Distinguishability** - Colors are spread across the spectrum
3. **Common preferences** - Includes popular team/gaming colors
4. **Accessibility** - Includes both warm and cool tones for variety

### CSS Additions

```css
/* Color picker popover */
.color-picker-popover {
  min-width: 12rem;
}

.color-swatch:focus {
  outline: none;
  ring: 2px;
  ring-color: var(--primary);
}

/* Gradient text for colored ABC toggle */
.text-rainbow {
  background: linear-gradient(90deg, #FF6B6B, #FFD93D, #6BCB77, #45B7D1, #A78BFA);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Cell content layout */
.cell-players {
  min-width: 0; /* Allow flex shrink */
}

.cell-players > * {
  flex-shrink: 0;
}
```

---

## 10. Pragmatic Assumptions

**[ASSUMPTION]:** Player colors are stored per-user, not per-team
- **Rationale:** User may see same player across multiple teams; consistent colors aid recognition
- **Alternative:** Per-team colors would allow different schemes per team

**[ASSUMPTION]:** 32px avatars sufficient for grid display
- **Rationale:** Grid cells are small; 32px is crisp at 1x, acceptable at 2x
- **Alternative:** Could use 64px and CSS scale for retina, at cost of larger downloads

**[ASSUMPTION]:** 12 preset colors plus hex input covers most needs
- **Rationale:** More presets = decision paralysis; hex input serves power users
- **Alternative:** Full color wheel picker (more complex UI)

**[ASSUMPTION]:** Re-seeding data is acceptable
- **Rationale:** User confirmed no important data to preserve
- **Alternative:** Migration script to populate avatarUrls from existing customAvatarUrl

---

## Quality Checklist

Before implementation complete:
- [ ] Schema changes documented (avatarUrls, playerColors)
- [ ] Backend changes specified (avatar-processing.js)
- [ ] Frontend integration examples show actual code
- [ ] Hot paths are optimistic/cached
- [ ] Test scenarios cover all 4 display modes
- [ ] Color picker accessibility considered (keyboard nav)
- [ ] Data flow is complete for both features
- [ ] Error handling specified (Firestore sync failures)
- [ ] Backwards compatibility maintained (customAvatarUrl, photoURL)
