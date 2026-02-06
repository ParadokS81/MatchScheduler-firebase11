# Slice 13.0b: Grid Header Tools

**Dependencies:** Slice 13.0a (panel relocation)
**User Story:** As a user, I want grid settings (display mode, templates, timeslots) accessible from the grid header so they're contextually located where I use them.

---

## Context: Layout Restructure (Slice 13.0)

This slice completes the grid tools relocation. After 13.0a moved team name and profile, the grid tools drawer was removed from TeamInfo. This slice adds those tools to the top grid's header bar.

**Previous location:** Grid tools were in a collapsible drawer at bottom of TeamInfo (top-left panel)
**New location:** Grid header bar (top-center panel), hover-revealed

The cog icon provides visual discoverability - users know settings are available in the header area.

---

## Scope

Add grid tools to the top grid's header bar with hover reveal:
- Cog icon (visible always) as visual anchor
- Templates button (opens modal)
- Display mode toggle (4 modes)
- Timeslots button (opens existing modal)
- All tools except cog hidden until header hover

---

## Grid Header Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [⚙️] [Templates] [ABC][ABC][●●●][👤]  [◄] 2026 Week 6 Feb 9-15 [►]  [Timeslots] [GMT+1▼] │
│  ^        ^            ^                       ^                        ^          ^      │
│ cog   templates    display                  week nav               timeslots   timezone  │
│ always  hover       hover                   hover                    hover      always   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Visibility rules:**
- **Always visible:** Cog icon, Timezone selector
- **Hover visible:** Templates, Display modes, Nav arrows, Timeslots

---

## Changes

### 1. WeekDisplay.js — Add grid tools to header

**File:** `public/js/components/WeekDisplay.js`

Modify `_render()` to include left and right tool groups:

```javascript
function _render() {
    if (!_panel) return;

    const gridContainerId = `availability-grid-week-${_weekNumber}`;

    // Only show tools on top grid (the one with timezone selector)
    const showGridTools = _showTimezoneSelector;

    // Left tools group (cog + templates + display modes)
    const leftToolsHtml = showGridTools ? `
        <div class="grid-header-tools-left">
            <button class="grid-tool-btn grid-tool-cog" title="Grid settings">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
            </button>
            <button class="grid-tool-btn grid-tool-hover grid-tool-templates" title="Availability templates">
                Templates
            </button>
            <div class="grid-tool-hover display-mode-group">
                ${_buildDisplayModeButtons()}
            </div>
        </div>
    ` : '';

    // Navigation arrows
    const navHtml = _showNavigation ? `
        <button class="nav-btn week-nav-prev grid-tool-hover" data-dir="prev" title="Previous week" ${!WeekNavigation.canNavigatePrev() ? 'disabled' : ''}>
            <span>&#9664;</span>
        </button>
    ` : '';

    const navNextHtml = _showNavigation ? `
        <button class="nav-btn week-nav-next grid-tool-hover" data-dir="next" title="Next week" ${!WeekNavigation.canNavigateNext() ? 'disabled' : ''}>
            <span>&#9654;</span>
        </button>
    ` : '';

    // Right tools group (timeslots + timezone)
    const timeslotsHtml = showGridTools ? `
        <button class="grid-tool-btn grid-tool-hover grid-tool-timeslots" title="Edit visible timeslots">
            Timeslots
        </button>
    ` : '';

    const tzSelectorHtml = _showTimezoneSelector ? _buildTzSelector() : '';

    const rightToolsHtml = showGridTools ? `
        <div class="grid-header-tools-right">
            ${timeslotsHtml}
            ${tzSelectorHtml}
        </div>
    ` : (tzSelectorHtml ? `<div class="grid-header-tools-right">${tzSelectorHtml}</div>` : '');

    _panel.innerHTML = `
        <div class="week-display">
            <div class="week-header-nav">
                ${leftToolsHtml}
                <div class="week-nav-center">
                    ${navHtml}
                    <h3 class="week-header">${_weekLabel}</h3>
                    ${navNextHtml}
                </div>
                ${rightToolsHtml}
            </div>
            <div id="${gridContainerId}" class="week-grid-container"></div>
        </div>
    `;

    // Attach handlers
    if (_showNavigation) {
        _attachNavHandlers();
    }
    if (_showTimezoneSelector) {
        _attachTzHandlers();
    }
    if (showGridTools) {
        _attachGridToolsHandlers();
    }
}

function _buildDisplayModeButtons() {
    const currentMode = typeof PlayerDisplayService !== 'undefined'
        ? PlayerDisplayService.getDisplayMode()
        : 'initials';

    const modes = [
        { id: 'initials', label: 'Plain initials', content: 'ABC' },
        { id: 'coloredInitials', label: 'Colored initials', content: '<span class="text-rainbow">ABC</span>' },
        { id: 'coloredDots', label: 'Colored dots', content: '<span class="inline-flex gap-0.5"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span><span class="w-1.5 h-1.5 rounded-full bg-green-400"></span><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span></span>' },
        { id: 'avatars', label: 'Avatars', content: '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>' }
    ];

    return modes.map(m => `
        <button class="display-mode-btn ${currentMode === m.id ? 'active' : ''}"
                data-mode="${m.id}"
                title="${m.label}">
            ${m.content}
        </button>
    `).join('');
}

function _attachGridToolsHandlers() {
    // Templates button → open modal
    const templatesBtn = _panel?.querySelector('.grid-tool-templates');
    if (templatesBtn) {
        templatesBtn.addEventListener('click', () => {
            if (typeof TemplatesModal !== 'undefined') {
                TemplatesModal.show();
            }
        });
    }

    // Display mode buttons
    const displayBtns = _panel?.querySelectorAll('.display-mode-btn');
    displayBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode && typeof PlayerDisplayService !== 'undefined') {
                PlayerDisplayService.setDisplayMode(mode);
                // Update button states
                displayBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            }
        });
    });

    // Timeslots button → open modal
    const timeslotsBtn = _panel?.querySelector('.grid-tool-timeslots');
    if (timeslotsBtn) {
        timeslotsBtn.addEventListener('click', () => {
            if (typeof TimeslotEditorModal !== 'undefined') {
                TimeslotEditorModal.show();
            }
        });
    }

    // Listen for display mode changes from elsewhere
    window.addEventListener('display-mode-changed', _updateDisplayModeButtons);
}

function _updateDisplayModeButtons() {
    const currentMode = typeof PlayerDisplayService !== 'undefined'
        ? PlayerDisplayService.getDisplayMode()
        : 'initials';
    const displayBtns = _panel?.querySelectorAll('.display-mode-btn');
    displayBtns?.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === currentMode);
    });
}
```

---

### 2. CSS — Grid header tools styling

**File:** `src/css/input.css`

Add styles for the new header layout:

```css
/* Grid Header Tools */
.week-header-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    min-height: 2rem;
}

.week-nav-center {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex: 1;
}

.grid-header-tools-left,
.grid-header-tools-right {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

/* Grid tool buttons */
.grid-tool-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 150ms ease;
}

.grid-tool-btn:hover {
    color: var(--foreground);
    background: var(--muted);
}

/* Cog icon - always visible */
.grid-tool-cog {
    padding: 0.25rem;
}

/* Hover-revealed tools */
.grid-tool-hover {
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
}

.week-header-nav:hover .grid-tool-hover {
    opacity: 1;
    pointer-events: auto;
}

/* Display mode button group */
.display-mode-group {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    background: var(--muted);
    border-radius: 0.25rem;
    padding: 0.125rem;
}

.display-mode-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.375rem;
    font-size: 0.625rem;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    border-radius: 0.125rem;
    cursor: pointer;
    transition: all 150ms ease;
}

.display-mode-btn:hover {
    color: var(--foreground);
}

.display-mode-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
}

/* Rainbow text for colored initials preview */
.text-rainbow {
    background: linear-gradient(90deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-weight: 600;
}

/* Timeslots and Templates buttons - text style */
.grid-tool-templates,
.grid-tool-timeslots {
    font-weight: 500;
}
```

---

### 3. GridActionButtons.js — Remove drawer-specific code

**File:** `public/js/components/GridActionButtons.js`

Since templates are now in a modal, GridActionButtons becomes simpler:

- Remove container rendering (no more `grid-tools-drawer-content`)
- Keep the template operation methods (addMe, removeMe, etc.) for SelectionActionButton
- Keep template management methods for TemplatesModal to call

The component becomes a service-like module that just handles operations, not rendering.

---

### 4. TemplatesModal.js — Templates in modal (Slice 13.0c)

This will be a separate slice (13.0c). For now, clicking "Templates" can either:
- Open existing modal if it exists
- Log a message "Templates modal coming in 13.0c"

---

## Verification

After this slice:

1. **Top grid header shows:**
   - Left: Cog icon (always visible)
   - Left (on hover): Templates button, Display mode toggles
   - Center: Nav arrows (on hover), Week label
   - Right (on hover): Timeslots button
   - Right (always visible): Timezone dropdown

2. **Hover behavior:** Hovering anywhere in header bar reveals all hover tools
3. **Display mode buttons:** Clicking switches mode, button shows active state
4. **Timeslots button:** Opens existing TimeslotEditorModal
5. **Templates button:** Opens TemplatesModal (or placeholder until 13.0c)
6. **Bottom grid:** Shows only nav arrows on hover (no tools)

---

## Test Scenarios

- [ ] Cog icon visible without hover
- [ ] Hovering header reveals Templates, display modes, nav arrows, Timeslots
- [ ] Leaving header hides hover tools (except cog, timezone)
- [ ] Display mode buttons show correct active state
- [ ] Clicking display mode changes grid rendering
- [ ] Clicking Timeslots opens TimeslotEditorModal
- [ ] Timezone dropdown still works
- [ ] Nav arrows still work
- [ ] Bottom grid header only shows nav + week label (no tools)
- [ ] Mobile: tools should remain accessible (consider touch behavior)

---

## CSS Notes

The hover reveal uses:
```css
.week-header-nav:hover .grid-tool-hover { opacity: 1; }
```

This means hovering anywhere on the header row reveals all hover tools. This is intentional - once you're in the header area, you have access to everything.

For mobile (touch devices), we may need to add a tap-to-toggle mechanism later if hover doesn't work well.
