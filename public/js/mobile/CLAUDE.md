# Mobile Portrait-First Architecture

Separate system from the desktop grid. Active at `@media (max-width: 768px)`. Desktop `.app-container` hidden, `.mobile-app` shown.

## Layout Structure

```
┌─────────────────────────────────┐
│ Header (team name + week nav)   │  .mobile-header (2.5rem fixed)
├─────────────────────────────────┤
│ Calendar Grid (scroll-snap)     │  .mobile-calendar (flex: 2)
├─────────────────────────────────┤
│ Context Panel (proposals, etc)  │  .mobile-context (flex: 3)
├─────────────────────────────────┤
│ Bottom Nav (4 tabs)             │  .mobile-nav (3.5rem fixed)
└─────────────────────────────────┘
```

Container: `#mobile-app` in `index.html` (lines ~257-289). All content rendered by JS — no static HTML inside.

## File Map

| File | Role |
|------|------|
| `MobileApp.js` | Orchestrator. Auth, team loading, Firestore listeners, tab switching |
| `MobileBottomNav.js` | Bottom nav bar. 4 tabs: Home, Compare, Team, Profile |
| `MobileCalendarGrid.js` | Horizontal scroll-snap availability grid. Cell/row/column selection. Comparison mode highlights |
| `MobileHomeContent.js` | Context panel for Home tab — proposals, matches, selection actions, template save |
| `MobileCompareContent.js` | Context panel for Compare tab — team browser list |
| `MobileCompareDetail.js` | Comparison slot detail (bottom sheet layer 1) |
| `MobileProposalDetail.js` | Proposal detail with viable slots, confirm/withdraw (bottom sheet layer 1) |
| `MobileTeamTab.js` | Team info sheet — logo, name, tag, roster (bottom sheet layer 1) |
| `MobileProfileTab.js` | Profile summary sheet — avatar, nick, timezone, discord (bottom sheet layer 1) |
| `MobileGridTools.js` | Grid tools from header cogwheel — display mode, templates, timeslots (layer 2), timezone (layer 2) |
| `MobileBottomSheet.js` | **Reusable slide-up container with 2-layer stacking** |

## Bottom Sheet Stacking

Two physical sheet elements exist in DOM (created by `MobileBottomSheet.init()`):

- **Layer 1** (z-index 90/91): Main content sheets (proposals, team, profile)
- **Layer 2** (z-index 92/93): Sub-views pushed on top (timeslot editor, color picker, etc.)

```
Layer 1 API:  open(html, onClose), close(), updateContent(html), getContentElement()
Layer 2 API:  push(html, onPop), pop(), updatePushedContent(html), getPushedContentElement()
```

- `push()` requires layer 1 to be open
- `close()` pops layer 2 first if open, then closes layer 1
- Each layer has independent drag-to-dismiss (80px threshold) and backdrop tap
- Layer 2 backdrop tap → `pop()` (returns to layer 1, doesn't close everything)

## Tab Switching

`MobileApp.switchTab(tabId)` handles all transitions:

| Tab | Behavior |
|-----|----------|
| `home` | Context panel shows proposals/matches via `MobileHomeContent` |
| `compare` | Grid enters comparison mode, context shows team browser via `MobileCompareContent` |
| `team` | Opens `MobileTeamTab` in bottom sheet (layer 1) |
| `profile` | Opens `MobileProfileTab` in bottom sheet (layer 1) |

**Re-entrancy guard**: `_switchingTab` flag prevents infinite loops when `MobileBottomSheet.close()` fires `onClose` callbacks that try to call `switchTab()` again. Team/Profile tabs register an `_onClose` that switches back to Home and updates the nav bar active state.

## Shared Services (reused from desktop)

Mobile components call the same service layer — no duplication:

`AuthService`, `TeamService`, `AvailabilityService`, `ProposalService`, `ScheduledMatchService`, `TimezoneService`, `WeekNavigation`, `DateUtils`, `ToastService`, `PlayerColorService`, `TemplateService`, `ComparisonEngine`, `TeamBrowserState`

## Patterns

### Content rendering
All mobile components render HTML strings via `container.innerHTML = html`. Inline styles used for layout — keeps everything self-contained without needing separate CSS classes for every element. CSS classes (`.mobile-*`) used for reusable patterns (grid cells, proposal tables, action buttons).

### Event delegation
Bottom sheet content uses `onclick="Module.method()"` for simple actions. For complex interaction (proposal detail), event delegation is attached to the content element after `open()`:
```javascript
MobileBottomSheet.open(html, cleanup);
const content = MobileBottomSheet.getContentElement();
content.addEventListener('click', handleAction);
```

### Tab content in sheets vs context panel
- **Home** and **Compare** render into `#mobile-context` (the scrollable area below the grid)
- **Team** and **Profile** open as bottom sheets over the existing layout (grid stays visible behind the backdrop)

### Firebase data access
Components read from service caches for instant display, same as desktop:
```javascript
const team = TeamService.getTeamFromCache(teamId);
const proposals = ProposalService.getProposalsFromCache();
```

For data not cached in services (e.g., user profile in MobileProfileTab), fetch directly from Firestore using dynamic imports:
```javascript
const { doc, getDoc } = await import('firebase/firestore');
const userDoc = await getDoc(doc(window.firebase.db, 'users', uid));
```

## CSS Location

All mobile styles in `src/css/input.css` under the `@media (max-width: 768px)` section. Class prefix: `.mobile-*`. Build via Tailwind: `npx tailwindcss -i src/css/input.css -o public/css/main.css`.

Never edit `public/css/main.css` directly.

## Script Loading Order (index.html)

```
MobileBottomSheet.js    ← must be first (other modules call it)
MobileProposalDetail.js
MobileCompareContent.js
MobileCompareDetail.js
MobileCalendarGrid.js
MobileHomeContent.js
MobileGridTools.js
MobileTeamTab.js
MobileProfileTab.js
MobileBottomNav.js
MobileApp.js            ← must be last (orchestrator, calls all others)
```
