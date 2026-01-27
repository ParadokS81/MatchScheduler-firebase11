# Slice 5.0a Completion Checklist

**Status:** IMPLEMENTED (pending QCHECK verification)
**Branch:** `experiment/center-divider-layout`
**Implemented:** 2026-01-27

---

## Current State Assessment

### ✅ DONE - HTML Structure
- [x] Top row panels removed (old panel-top-*)
- [x] Divider row added (panel-mid-left, panel-mid-center, panel-mid-right)
- [x] Tab buttons in place (Calendar, Teams, Tournament)
- [x] Bottom row preserved (panel-bottom-*)
- [x] Using `main-grid-v3` class

### ✅ DONE - CSS Layout
- [x] `.main-grid-v3` with `grid-template-rows: 1fr 3rem 1fr`
- [x] `.panel-divider` styles
- [x] `.divider-tabs` and `.divider-tab` button styles
- [x] `.panel-content-compact` for divider content
- [x] Active/hover states for tabs

### ⚠️ INCONSISTENT - Panel ID Naming
| Location | Current ID | Expected ID | Status |
|----------|------------|-------------|--------|
| HTML line 100 | `panel-top-left` | `panel-top-left` | ✅ Correct |
| HTML line 107 | `panel-middle-center` | `panel-top-center` | ❌ **Rename needed** |
| HTML line 111 | `panel-top-right` | `panel-top-right` | ✅ Correct |
| app.js line 42 | `panel-middle-left` | `panel-top-left` | ❌ **Update needed** |
| app.js line 93 | `panel-middle-center` | `panel-top-center` | ❌ **Update needed** |

---

## Remaining Work

### Step 1: Panel ID Consistency (30 min)

**File: `public/index.html`**
- [ ] Line 107: Rename `panel-middle-center` → `panel-top-center`

**File: `public/js/app.js`**
- [ ] Line 42: Update `TeamInfo.init('panel-middle-left')` → `TeamInfo.init('panel-top-left')`
- [ ] Line 93: Update `WeekDisplay.create('panel-middle-center', ...)` → `WeekDisplay.create('panel-top-center', ...)`
- [ ] Verify `WeekNavigation.init('panel-top-center')` on line 86 (check if this panel should exist or be removed)

**Verification:**
```bash
# Test: Open app, verify Team Info renders in left panel
# Test: Verify Week grids render correctly
# Test: No console errors about missing elements
```

---

### Step 2: Week Navigation in Grid Headers (45 min)

**Current state:** WeekNavigation component exists but renders to removed panel
**Goal:** Navigation arrows in each grid header

**File: `public/js/components/WeekDisplay.js`**
- [ ] Update `_render()` to include nav arrows:
```javascript
<div class="week-header-nav flex items-center justify-center gap-2">
    <button class="nav-btn week-nav-prev" data-dir="prev">◀</button>
    <h3 class="week-header text-lg font-semibold">${_weekLabel}</h3>
    <button class="nav-btn week-nav-next" data-dir="next">▶</button>
</div>
```
- [ ] Add click handlers for nav buttons that call `WeekNavigation.navigate()`
- [ ] Ensure both grids update when navigation changes

**File: `public/js/components/WeekNavigation.js`**
- [ ] Verify it exposes `navigate(direction)` method
- [ ] Verify it has event system to notify WeekDisplay instances

**Verification:**
```bash
# Test: Click prev/next arrows on top grid
# Test: Both grids update to consecutive weeks
# Test: Week labels show correct week numbers
```

---

### Step 3: Tab Switching Infrastructure (45 min)

**Current state:** Tab buttons exist but are non-functional
**Goal:** Clicking tabs switches bottom panel content

**New File: `public/js/components/BottomPanelController.js`**
```javascript
const BottomPanelController = (function() {
    let _activeTab = 'calendar';
    const _weekDisplay2Ref = null; // Reference to bottom week display

    function init(weekDisplay2) {
        _weekDisplay2Ref = weekDisplay2;

        // Wire tab buttons
        document.querySelectorAll('.divider-tab').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
    }

    function switchTab(tabId) {
        if (_activeTab === tabId) return;

        // Update active states
        document.querySelectorAll('.divider-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        const bottomCenter = document.getElementById('panel-bottom-center');

        // Show/hide content based on tab
        switch(tabId) {
            case 'calendar':
                // Show Week 2 grid (already rendered)
                bottomCenter.innerHTML = ''; // Clear placeholder
                _weekDisplay2Ref.init(); // Re-init week grid
                break;
            case 'teams':
                bottomCenter.innerHTML = '<div class="panel-content"><p class="text-muted-foreground text-center">Teams browser coming soon</p></div>';
                break;
            case 'tournament':
                bottomCenter.innerHTML = '<div class="panel-content"><p class="text-muted-foreground text-center">Tournament hub coming soon</p></div>';
                break;
        }

        _activeTab = tabId;
    }

    return { init, switchTab, getActiveTab: () => _activeTab };
})();
```

**File: `public/index.html`**
- [ ] Add script tag: `<script src="js/components/BottomPanelController.js"></script>`

**File: `public/js/app.js`**
- [ ] Initialize BottomPanelController after WeekDisplay2:
```javascript
_weekDisplay2 = WeekDisplay.create('panel-bottom-center', currentWeek + 1);
_weekDisplay2.init();
BottomPanelController.init(_weekDisplay2);
```

**Verification:**
```bash
# Test: Click Calendar tab - Week 2 grid shows
# Test: Click Teams tab - placeholder shows
# Test: Click Tournament tab - placeholder shows
# Test: Click back to Calendar - grid re-renders correctly
```

---

### Step 4: Profile & Filter Relocation (45 min)

**Current state:** Profile shows static "👤 PDX", MinPlayers selects are static HTML
**Goal:** Wire up profile click → ProfileModal, wire up filter selects

**File: `public/js/components/UserProfile.js`**
- [ ] Add `renderCompact(containerId)` method:
```javascript
function renderCompact(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !_currentUser) return;

    container.innerHTML = `
        <div class="flex items-center gap-2 cursor-pointer hover:opacity-80" id="profile-compact-btn">
            <img src="${_currentUser.photoURL || 'img/default-avatar.png'}"
                 class="w-8 h-8 rounded-full" alt="avatar">
            <span class="text-sm font-medium">${_currentUser.displayName || 'User'}</span>
        </div>
    `;

    container.querySelector('#profile-compact-btn').addEventListener('click', () => {
        ProfileModal.show();
    });
}
```

**File: `public/js/app.js`**
- [ ] After user loads, call `UserProfile.renderCompact('panel-mid-left')`

**File: `public/index.html`**
- [ ] Line 119-126: Replace static HTML with container div:
```html
<div id="panel-mid-left" class="panel panel-divider">
    <div id="profile-compact-container" class="panel-content-compact">
        <!-- UserProfile.renderCompact() renders here -->
    </div>
</div>
```

**Filter Relocation (MinPlayers):**
- [ ] Verify FilterPanel.js can render inline (not modal)
- [ ] Wire select changes to FilterService
- [ ] OR: Keep static HTML but add event listeners to call FilterService

**Verification:**
```bash
# Test: Profile avatar/name shows logged-in user
# Test: Click profile → ProfileModal opens
# Test: Change min players filter → grid updates
```

---

## CSS Cleanup (Optional)

**File: `src/css/input.css`**
- [ ] Remove `.main-grid-v2` if exists (v3 is the keeper)
- [ ] Rename `.main-grid-v3` → `.main-grid` once experiment complete

---

## Documentation Updates (After Implementation)

- [ ] Update `CLAUDE.md` Sacred Grid section
- [ ] Update `Pillar1*.md` Section 6.1 layout diagram
- [ ] Update `Pillar3*.md` Section 3 architecture diagram

---

## Summary

| Step | Effort | Priority | Blocker? |
|------|--------|----------|----------|
| Step 1: Panel IDs | 30 min | P0 | Yes - grids won't render |
| Step 2: Week Nav | 45 min | P1 | No |
| Step 3: Tab Switch | 45 min | P1 | No |
| Step 4: Profile/Filter | 45 min | P2 | No |
| CSS Cleanup | 15 min | P3 | No |

**Critical Path:** Step 1 must be done first, then Steps 2-4 can proceed in any order.

**Total Remaining:** ~3 hours including testing iterations
