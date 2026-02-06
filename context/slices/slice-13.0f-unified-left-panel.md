# Slice 13.0f: Unified Left Panel

## Overview
Consolidate the three left-side panels (panel-top-left, panel-mid-left, panel-bottom-left) into a single unified panel that spans all grid rows. Mirrors the right panel unification from 13.0e for visual symmetry and cleaner layout.

## User Value
- Cleaner visual hierarchy — symmetric sidebars framing the center grid
- Team identity cohesion — logo and team name together (currently separated)
- More vertical space for matches section (no padding/margins between panels)
- Calmer, more focused UI

## Current State

### HTML Structure
```
Row 1: panel-top-left (Logo + Roster) | panel-top-center    | panel-right (unified)
Row 2: panel-mid-left (Team Name)     | panel-mid-center    |
Row 3: panel-bottom-left (Matches)    | panel-bottom-center |
```

### Left Panel Contents
- **panel-top-left**: TeamInfo (logo + roster list)
- **panel-mid-left**: TeamNameDisplay (team name + tag in divider row)
- **panel-bottom-left**: UpcomingMatchesPanel + UserProfile compact

### Problem
Team name is isolated in the divider row, separated from logo and roster. This breaks team identity cohesion and wastes vertical space.

---

## Target State

### HTML Structure
```
Row 1-3: panel-left (unified) | panel-top-center    | panel-right (unified)
                              | panel-mid-center    |
                              | panel-bottom-center |
```

### Unified Left Panel Layout
```
┌───────────────────────────────┐
│         [Team Logo]           │  ← Centered, same size as current
│                               │
│     Team Name (larger)        │  ← Prominent, under logo
│          ]TAG[                │  ← Tag below name
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│  PAR  ParadokS           ★    │  ← Roster list
│  ZER  Zero                    │
│  RAZ  Razor                   │
│  GRI  Grisling                │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│  YOUR MATCHES                 │  ← Section header
│  ]SR[ vs -s- Feb 12 22:00     │  ← Scheduled matches for user's teams
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│  UPCOMING                     │  ← Section header (scrollable)
│  Team A vs Team B             │  ← System-wide matches
│  Team C vs Team D             │
│  ...                          │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│  [Avatar] ParadokS · PAR      │  ← Profile pinned at bottom
└───────────────────────────────┘
```

### Section Breakdown

| Section | Content | Flex Behavior |
|---------|---------|---------------|
| Team Identity | Logo + Name + Tag | flex-shrink-0 |
| Roster | Player list with initials | flex-shrink-0 |
| Your Matches | User's scheduled matches | flex-shrink-0 |
| Upcoming | System-wide matches | flex-1, overflow-y-auto |
| Profile | Avatar + name + team tag | flex-shrink-0 (pinned) |

---

## Implementation

### Phase 1: HTML Restructure

**index.html changes:**

Remove:
- `#panel-top-left`
- `#panel-mid-left`
- `#panel-bottom-left`

Add single panel:
```html
<!-- Left Sidebar (spans all rows) -->
<div id="panel-left" class="panel sidebar-panel">
    <div class="sidebar-content">
        <!-- Team Identity Section -->
        <div class="sidebar-section sidebar-header">
            <div id="team-identity-container">
                <!-- Logo + Team Name + Tag rendered by TeamInfo -->
            </div>
        </div>

        <!-- Roster Section -->
        <div class="sidebar-section">
            <div id="roster-container">
                <!-- Roster list rendered by TeamInfo -->
            </div>
        </div>

        <!-- Your Matches Section -->
        <div class="sidebar-section">
            <div id="your-matches-container">
                <!-- User's team matches -->
            </div>
        </div>

        <!-- Upcoming Matches Section (scrollable) -->
        <div class="sidebar-section sidebar-list">
            <div id="upcoming-matches-container">
                <!-- System-wide upcoming matches -->
            </div>
        </div>

        <!-- Profile Section (pinned bottom) -->
        <div class="sidebar-section sidebar-footer">
            <div id="profile-compact-container">
                <!-- UserProfile.renderCompact() -->
            </div>
        </div>
    </div>
</div>
```

### Phase 2: CSS Updates

**src/css/input.css:**

```css
#panel-left {
    grid-column: 1;
    grid-row: 1 / 4;  /* Span all 3 rows */
}

.sidebar-footer {
    margin-top: auto;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
}
```

Update explicit grid placement:
```css
#panel-left { grid-column: 1; grid-row: 1 / 4; }

#panel-top-center { grid-column: 2; grid-row: 1; }
#panel-mid-center { grid-column: 2; grid-row: 2; }
#panel-bottom-center { grid-column: 2; grid-row: 3; }

#panel-right { grid-column: 3; grid-row: 1 / 4; }
```

### Phase 3: Component Updates

**TeamInfo.js:**
- Split rendering: identity (logo+name+tag) → `#team-identity-container`
- Roster → `#roster-container`
- Remove team name from old location

**TeamNameDisplay.js:**
- Deprecate or integrate into TeamInfo
- Name + tag now rendered as part of team identity section

**UpcomingMatchesPanel.js:**
- Split into two sections:
  - "Your Matches" → `#your-matches-container` (matches for user's teams only)
  - "Upcoming" → `#upcoming-matches-container` (all other matches, scrollable)

**UserProfile.js:**
- renderCompact() target changes to new container
- No logic changes needed

### Phase 4: Mobile Updates

**MobileLayout.js:**
- Update `_moveNodesToDrawers()` to handle single `#panel-left`
- Left drawer receives unified panel content

---

## Files to Modify

| File | Changes |
|------|---------|
| `public/index.html` | Replace 3 left panels with 1 unified panel |
| `src/css/input.css` | Grid placement, sidebar-footer styles |
| `public/js/components/TeamInfo.js` | Split rendering (identity vs roster) |
| `public/js/components/TeamNameDisplay.js` | Deprecate (merge into TeamInfo) |
| `public/js/components/UpcomingMatchesPanel.js` | Split your-matches vs upcoming |
| `public/js/MobileLayout.js` | Update drawer panel logic |

---

## Visual Design Notes

### Team Identity Section
```
┌─────────────────────────────────────┐
│            [Logo 80px]              │
│                                     │
│       Slackers (text-lg)            │
│           ]SR[ (text-muted)         │
└─────────────────────────────────────┘
```
- Logo centered, same size as current
- Team name: `text-lg font-semibold`
- Tag: `text-sm text-muted-foreground`

### Roster Section
```
┌─────────────────────────────────────┐
│  PAR  ParadokS                  ★   │
│  ZER  Zero                          │
│  RAZ  Razor                         │
│  GRI  Grisling                      │
└─────────────────────────────────────┘
```
- Initials in colored badge (existing)
- Star for team leader (existing)
- Smaller text than team name

### Your Matches vs Upcoming
```
YOUR MATCHES                    ← Only if user has scheduled matches
┌─────────────────────────────────────┐
│  🏆 ]SR[ vs -s-                     │
│     Feb 12 Thu 22:00 (D1)           │
└─────────────────────────────────────┘

UPCOMING                        ← All other matches (scrollable)
┌─────────────────────────────────────┐
│  Team A vs Team B                   │
│  Feb 13 Fri 20:00                   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                │
│  Team C vs Team D                   │
│  Feb 14 Sat 21:00                   │
└─────────────────────────────────────┘
```

---

## Testing Checklist

- [ ] Unified panel renders correctly, spans full height
- [ ] Logo + name + tag display properly in identity section
- [ ] Roster list renders in roster section
- [ ] "Your Matches" shows only user's team matches
- [ ] "Upcoming" section scrolls independently
- [ ] Profile stays pinned at bottom
- [ ] Team drawer (gear icon) still opens
- [ ] Mobile: panel hidden, content in left drawer
- [ ] Mobile: drawer opens/closes correctly
- [ ] No console errors
- [ ] Grid row sizing still works (center panels)

---

## Dependencies
- Slice 13.0e complete (right panel unified, pattern established)
- No external dependencies

---

*Created: 2026-02-06*
