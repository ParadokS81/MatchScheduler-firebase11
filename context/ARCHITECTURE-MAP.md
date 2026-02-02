# Architecture Map

Quick-orientation guide for navigating the codebase. Start here, drill into specifics as needed.

## Documentation Layers

```
CLAUDE.md                        ← START HERE: Critical patterns & rules
  └─ context/ARCHITECTURE-MAP.md ← YOU ARE HERE: File map & module guide
       ├─ context/Pillar*.md     ← Deep dive: Architecture, PRD, perf, stack
       ├─ context/SCHEMA.md      ← Deep dive: Firestore document structures
       └─ context/slices/        ← Deep dive: Per-feature implementation specs
```

**Rule of thumb:** CLAUDE.md has the patterns you must follow. This file tells you where things live. Pillars/slices have the full specs when you need detail.

---

## File Structure

```
public/
├── index.html                    ← Single-page app shell, sacred 3x3 grid
├── js/
│   ├── app.js                    ← Entry point, init sequence, auth flow
│   ├── MobileLayout.js           ← Mobile drawer management (open/close/DOM relocation)
│   ├── MobileBottomBar.js        ← Mobile bottom bar (tabs, week nav, hamburger toggles)
│   ├── services/                 ← Cache-only data layer (NO listeners here)
│   │   ├── AuthService.js        ← Auth state, dev user switching
│   │   ├── TeamService.js        ← Team CRUD, cache
│   │   ├── AvailabilityService.js← Availability CRUD, cache
│   │   ├── ProposalService.js    ← Match proposal operations
│   │   ├── ScheduledMatchService.js
│   │   ├── FavoritesService.js   ← Per-user team favorites
│   │   ├── FilterService.js      ← Division/tag filtering state
│   │   ├── TemplateService.js    ← Availability templates
│   │   ├── TimezoneService.js    ← UTC offset handling
│   │   ├── QWHubService.js       ← External QuakeWorld stats API
│   │   ├── LogoUploadService.js  ← Team logo upload
│   │   ├── AvatarUploadService.js← Player avatar upload
│   │   ├── PlayerColorService.js ← Player color assignments
│   │   ├── PlayerDisplayService.js← Player display name resolution
│   │   ├── ComparisonEngine.js   ← Slot overlap calculation
│   │   ├── TeamBrowserState.js   ← Browser panel selection state
│   │   └── ConfirmationModal.js  ← Reusable confirm dialog
│   ├── components/               ← UI components (OWN their Firebase listeners)
│   │   ├── AvailabilityGrid.js   ← The calendar grid (pointer events, drag-select)
│   │   ├── WeekDisplay.js        ← Week date rendering
│   │   ├── WeekNavigation.js     ← Week prev/next navigation
│   │   ├── TeamInfo.js           ← Left panel: current team info
│   │   ├── TeamBrowser.js        ← Right panel: browse/select teams
│   │   ├── TeamsBrowserPanel.js  ← Teams+Players browsing panel
│   │   ├── FilterPanel.js        ← Division filter UI
│   │   ├── FavoritesPanel.js     ← Favorites list UI
│   │   ├── BottomPanelController.js ← Tab switching (calendar/teams/players/etc)
│   │   ├── ComparisonModal.js    ← Slot comparison detail modal
│   │   ├── MatchesPanel.js       ← Match proposals panel
│   │   ├── UpcomingMatchesPanel.js← Scheduled matches panel
│   │   ├── GridActionButtons.js  ← Grid toolbar (clear, template, etc)
│   │   ├── SelectionActionButton.js ← FAB for grid selection actions
│   │   ├── OverflowModal.js      ← Cell overflow detail
│   │   ├── ProfileModal.js       ← User profile editor
│   │   ├── UserProfile.js        ← Auth state UI (login/avatar)
│   │   ├── OnboardingModal.js    ← First-time user flow
│   │   ├── TeamManagementDrawer.js← Team settings drawer
│   │   ├── TeamManagementModal.js ← Team management modal
│   │   ├── LogoUploadModal.js    ← Logo upload UI
│   │   ├── AvatarUploadModal.js  ← Avatar upload UI
│   │   ├── AvatarManagerModal.js ← Manage all avatars
│   │   ├── KickPlayerModal.js    ← Kick player confirmation
│   │   ├── TransferLeadershipModal.js
│   │   ├── ColorPickerPopover.js ← Player color selector
│   │   ├── PlayerTooltip.js      ← Hover tooltip for players
│   │   ├── ToastService.js       ← Toast notifications
│   │   └── DevToolbar.js         ← Dev-only user switcher
│   └── utils/
│       └── DateUtils.js          ← Date/time formatting helpers
├── css/
│   └── main.css                  ← GENERATED - never edit (see src/css/input.css)
└── assets/                       ← Static assets (logos, etc)

src/
└── css/
    └── input.css                 ← EDIT THIS: Tailwind + custom CSS source

functions/                        ← Cloud Functions (backend)
├── index.js                      ← Function exports & registration
├── team-operations.js            ← Team CRUD, join codes, roster management
├── availability.js               ← Availability read/write
├── match-proposals.js            ← Proposal create/accept/decline
├── favorites.js                  ← Favorites toggle
├── templates.js                  ← Template save/load
├── user-profile.js               ← Profile updates
├── discord-auth.js               ← Discord OAuth flow
├── logo-processing.js            ← Logo upload + resize
└── avatar-processing.js          ← Avatar upload + resize

context/                          ← Architecture & specs (read-only reference)
├── SCHEMA.md                     ← Firestore collections & document interfaces
├── QWHUB-API-REFERENCE.md        ← External QWHub API endpoints & schemas
├── PROJECT_ROADMAP.md            ← Slice sequencing & progress tracking
├── PROJECT_SLICE_TEMPLATE.md     ← How to write slice specs
├── Pillar 1 - PRD.md             ← Full product requirements
├── Pillar 2 - performance and ux.md ← Hot/cold paths, UX targets
├── Pillar 3 - technical architecture.md ← Patterns, security, data flow
├── Pillar 4 - technology stack.md    ← Tech choices & rationale
└── slices/                       ← Per-feature specs (see roadmap for status)
```

---

## Key Subsystems

### Mobile (landscape ≤1024px)
| File | Role |
|------|------|
| `MobileLayout.js` | Drawer open/close, DOM relocation between grid and drawers |
| `MobileBottomBar.js` | Bottom bar: tab icons, week nav, hamburger toggles |
| `src/css/input.css` (lines 3334-3673) | All mobile CSS in media queries |
| `AvailabilityGrid.js` | Pointer events for touch drag-select |
| `DevToolbar.js` | Repositions above bottom bar on mobile |

**Z-index stack:** Bottom bar (46) > Drawers (45) > Overlay (44)

### Availability Grid
| File | Role |
|------|------|
| `AvailabilityGrid.js` | Grid rendering, pointer events, drag-select, display modes |
| `AvailabilityService.js` | Cache for availability data, Firestore CRUD |
| `WeekDisplay.js` | Renders day headers with dates |
| `WeekNavigation.js` | Week prev/next, broadcasts week changes |
| `GridActionButtons.js` | Toolbar: clear, template load/save |
| `SelectionActionButton.js` | FAB that appears during multi-cell selection |

### Team Management
| File | Role |
|------|------|
| `TeamService.js` | Team cache, CRUD calls |
| `TeamInfo.js` | Left panel: team name, roster, join code |
| `TeamManagementDrawer.js` | Settings: rename, kick, transfer leadership |
| `TeamBrowser.js` | Right panel: browse all teams |
| `TeamsBrowserPanel.js` | Combined teams+players browser |
| `functions/team-operations.js` | Backend: create, join, leave, kick, etc |

### Comparison & Scheduling
| File | Role |
|------|------|
| `ComparisonEngine.js` | Calculates slot overlaps between teams |
| `ComparisonModal.js` | Shows detailed overlap analysis |
| `ProposalService.js` | Match proposal CRUD |
| `MatchesPanel.js` | Lists proposals (pending/accepted/declined) |
| `functions/match-proposals.js` | Backend: create/accept/decline proposals |

---

## Data Flow Pattern

```
User Action → Component → Service (cache + Cloud Function call)
                                      ↓
                              Firestore update
                                      ↓
                              onSnapshot listener (in Component)
                                      ↓
                              UI update + cache refresh
```

Services manage cache only. Components own their Firestore listeners. See CLAUDE.md for the complete pattern with code examples.

---

## CSS Build Pipeline

```
src/css/input.css  →  (Tailwind CLI watcher)  →  public/css/main.css
     EDIT THIS                                      NEVER EDIT
```

Custom CSS goes in `input.css`. Tailwind classes work directly in HTML. The watcher rebuilds `main.css` automatically.
