# Slice 1.2b: Team Management Drawer

## Slice Definition
- **Slice ID:** 1.2b
- **Name:** Team Management Drawer Component
- **User Story:** As a team member, I can access team management options through a drawer interface so that I can view team information and perform allowed actions
- **Success Criteria:** User can open/close drawer with smooth animation, see appropriate controls based on role

## PRD Mapping
```
PRIMARY SECTIONS:
- 4.3.4 Team Management Drawer UX: Complete drawer implementation with role-based views
- 6.4 Component Interaction Patterns: Drawer animation pattern (Critical Component)

DEPENDENT SECTIONS:
- 1.3 Team Member permissions: What members can see/do
- 1.4 Team Leader permissions: Additional leader controls

IGNORED SECTIONS:
- Modal implementations (KickPlayer, TransferLeadership, Logo) - just show buttons
- Actual functionality of buttons - just UI for now
```

## Component Architecture
```
NEW COMPONENTS:
- TeamManagementDrawer
  - Firebase listeners: none (receives data via props)
  - Cache interactions: none
  - Parent: TeamInfo component
  - Renders different UI based on isLeader prop

MODIFIED COMPONENTS:
- TeamInfo: Add drawer integration
  - Import and render TeamManagementDrawer
  - Pass teamData and isLeader props
  - Handle drawer toggle state

SERVICE UPDATES:
- None for this slice
```

## Execution Boundaries
**Start State:** 
- TeamInfo component exists and displays team data
- User authentication working
- Team data structure in place

**End State:**
- Drawer renders at bottom of TeamInfo panel
- Smooth slide animation (300ms)
- Shows appropriate view based on user role
- All buttons visible but non-functional (except close)

**Out of Scope:**
- Modal implementations
- Button functionality (except drawer toggle)
- Data mutations
- Logo display (just placeholder)

## Implementation Details

### Drawer Structure (Member View)
```html
<div id="team-management-drawer" class="drawer-closed">
  <div class="drawer-header">
    <span>Team Management</span>
    <button class="drawer-arrow">▲</button>
  </div>
  <div class="drawer-content">
    <!-- Join Code Row -->
    <div class="drawer-row">
      <label>Join Code</label>
      <input value="ABC123" readonly />
      <button>Copy</button>
    </div>
    
    <!-- Max Players Row -->
    <div class="drawer-row">
      <label>Max Players</label>
      <span>10</span>
    </div>
    
    <!-- Action Button -->
    <button class="btn-destructive">Leave Team</button>
  </div>
</div>
```

### Drawer Structure (Leader View - Additional Elements)
```html
<!-- Same as member view, plus: -->

<!-- Join Code Row gets Regenerate button -->
<button>Regenerate</button>

<!-- Max Players Row gets dropdown -->
<select>
  <option>4</option>
  <!-- ... up to 20 -->
</select>

<!-- Logo Section -->
<div class="drawer-row">
  <div class="logo-placeholder">Logo</div>
  <button>Manage Logo</button>
</div>

<!-- Additional Action Buttons -->
<button>Remove Player</button>
<button>Transfer Leadership</button>
<button disabled>Leave Team</button>
```

### Critical CSS Implementation
```css
/* MUST follow this exact pattern from PRD 6.4 */
.team-management-drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 2.5rem; /* Fixed height when open */
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.5rem 0.5rem 0 0;
  transition: transform 300ms ease-out;
  z-index: 30;
  overflow: hidden;
}

.drawer-closed {
  transform: translateY(calc(100% - 2.5rem));
}

.drawer-open {
  transform: translateY(0);
}
```

## Performance Classification
```
HOT PATHS (<50ms):
- Drawer open/close: CSS transition only, no JS animation
- Role detection: Read from existing TeamInfo state

COLD PATHS (<2s):
- Initial render: One-time setup when TeamInfo loads
```

## Test Scenarios
- [ ] Drawer starts closed showing only header
- [ ] Click header or arrow opens drawer with smooth animation
- [ ] Arrow rotates 180° when opening/closing
- [ ] Member sees: join code (read-only), max players (read-only), leave button
- [ ] Leader sees: all member items PLUS regenerate, dropdown, logo section, action buttons
- [ ] Leave Team button disabled for leader unless last member
- [ ] Clicking outside drawer closes it
- [ ] All buttons render but show "Not implemented" toast when clicked
- [ ] Drawer stays within TeamInfo panel bounds (doesn't escape to viewport)

## Implementation Notes
- **Critical**: Must use `position: absolute` NOT `fixed` (keeps drawer within panel)
- **Critical**: Animation via CSS `transform` NOT JavaScript
- **Critical**: `overflow: hidden` prevents content showing during animation
- Reference existing drawer CSS in PRD section 6.4 exactly
- Drawer height when open should leave room for team name/info above
- Use Tailwind classes except for the specific animation CSS
- Arrow rotation should also use CSS transition

## Common AI Pitfalls to Avoid
❌ Using `position: fixed` (drawer escapes panel)
❌ JavaScript animations (causes flicker)
❌ Forgetting `overflow: hidden` (content bleeds)
❌ Wrong z-index (appears behind/above wrong elements)
❌ Implementing button functionality (out of scope)
❌ Creating modals (separate slices)

---