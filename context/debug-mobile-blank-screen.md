# DEBUG: Mobile Layout Blank Screen

## The Problem
Slice M1.0 implements a portrait-first mobile layout. All JS initializes correctly, CSS media query matches, but **the screen is blank** — only the dark background and DEV toolbar show.

## What Works (confirmed by console)
- `📱 mobile-app computed: {display: 'flex', height: '844px', visibility: 'visible'}` — container IS flex, full height, visible
- `📱 Grid: rendering 8 time slots into mobile-calendar` — grid HTML was injected
- Auth works (ParadokS signed in), team loaded from cache (team-sr-001)
- All services initialized (TimezoneService, WeekNavigation, PlayerColorService, etc.)
- **No JS errors in console**

## What Doesn't Work
- Nothing visible on screen in portrait mode (390x844, iPhone 12 Pro DevTools)
- Landscape mode (844x390) shows the **desktop** layout (expected — 844px > 768px breakpoint)

## Architecture
- **CSS**: `src/css/input.css` → Tailwind builds → `public/css/main.css`
- **Tailwind watcher**: Running and rebuilding on changes
- **Mobile detection**: `app.js` checks `(max-width: 768px)`, if true calls `MobileApp.init()` and returns (skips desktop)
- **Visibility**: Pure CSS — `.mobile-app { display: none; }` base, `@media (max-width: 768px) { .mobile-app { display: flex !important; } }`
- **No `hidden` class** — removed from HTML, CSS handles everything

## Files Involved

### New mobile files (in `public/js/mobile/`):
- `MobileApp.js` — orchestrator, team loading, week nav, Firestore data listeners
- `MobileCalendarGrid.js` — 7-day grid, tap selection, player initials
- `MobileHomeContent.js` — context panel (proposals/matches/actions)
- `MobileBottomNav.js` — 4-tab bottom nav

### Modified files:
- `public/index.html` — `#mobile-app` container at line ~257, script tags at ~428-431
- `public/js/app.js` — mobile detection at line ~45-60
- `src/css/input.css` — mobile CSS starts at line ~4663

## CSS Structure (in `src/css/input.css`)

```
Line ~4665: .mobile-app { display: none; }  /* base: hidden */
Line ~4671: @media (max-width: 768px) {
              .main-grid-v3 { display: none !important; }
              .mobile-app { display: flex !important; ... height: 100dvh; }
            }
Line ~4687: .mobile-header { height: 3rem; background: var(--card); ... }
Line ~4743: .mobile-calendar { flex: 3; overflow: hidden; }
Line ~4749: .mobile-grid-table { width: 100%; height: 100%; ... }
Line ~4787: .mobile-grid-cell { background: var(--secondary); border: 1px solid ... }
Line ~4832: .mobile-context { flex: 2; background: var(--card); }
Line ~4952: .mobile-nav { height: 3.5rem; background: var(--card); }
```

## HTML Structure (`public/index.html` line ~257)

```html
<div id="mobile-app" class="mobile-app">
  <header class="mobile-header">
    <button id="mobile-team-name" class="mobile-team-name">Select team ▾</button>
    <div id="mobile-team-dropdown" class="mobile-team-dropdown hidden"></div>
    <div class="mobile-week-nav">
      <button id="mobile-week-prev" class="mobile-week-btn">◀</button>
      <span id="mobile-week-label" class="mobile-week-label">W8</span>
      <button id="mobile-week-next" class="mobile-week-btn">▶</button>
    </div>
  </header>
  <div id="mobile-calendar" class="mobile-calendar"><!-- Grid renders here --></div>
  <div id="mobile-context" class="mobile-context"><!-- Content renders here --></div>
  <nav id="mobile-nav" class="mobile-nav"><!-- BottomNav renders here --></nav>
</div>
```

## What We Already Tried
1. ❌ `hidden` class + JS removal — container fell back to `display: block` instead of flex. **Fixed** by removing `hidden` and using pure CSS.
2. ❌ Stale cache — bumped all cache busters to `v=20260216c`
3. ❌ Emulator data gone — reseeded with `npm run seed:quick`
4. ✅ Confirmed via `getComputedStyle` that container is `display: flex`, `height: 844px`, `visibility: visible`
5. ✅ Confirmed grid renders 8 time slots via console log
6. ⏳ Added debug outlines (red/lime/cyan) to header/calendar/context — not yet verified by user

## What To Investigate Next

### 1. Check if children are physically present but invisible
Open DevTools Elements panel → find `#mobile-app` → check:
- Does it have child elements (header, calendar, context, nav)?
- What are their computed dimensions?
- Are they being covered by another element?

### 2. Z-index / stacking context
The `#mobile-app` div might be behind the desktop `.main-grid-v3` or another absolutely-positioned element. Check:
- What is the stacking order in the DOM?
- Is `.main-grid-v3 { display: none !important; }` actually taking effect? (inspect in Elements)
- Is there another overlay or fixed-position element covering the mobile container?

### 3. The `body` or parent container might constrain height
Check if `body`, `html`, or the parent of `#mobile-app` has `overflow: hidden` or `height: 0` that clips the content.

### 4. Check compiled CSS actually loads
In DevTools Network tab, check that `main.css?v=20260216c` loads and contains `.mobile-app` rules. Search for "mobile-app" in the CSS file via Sources tab.

### 5. Service worker caching
There's a service worker (`sw.js`) that may be serving stale HTML/CSS. Try:
- DevTools → Application → Service Workers → Unregister
- Then hard refresh

### 6. Inspect the actual rendered DOM
Run in console:
```js
const m = document.getElementById('mobile-app');
console.log('children:', m.children.length);
console.log('offsetHeight:', m.offsetHeight);
for (const c of m.children) {
  console.log(c.tagName, c.className, c.offsetHeight, c.offsetWidth, window.getComputedStyle(c).display);
}
```
This will show if children exist and have dimensions.

### 7. Check if desktop grid is truly hidden
Run in console:
```js
const d = document.querySelector('.main-grid-v3');
console.log('desktop grid display:', d ? window.getComputedStyle(d).display : 'not found');
```

## Quick Debug CSS (already added, needs verification)
Debug outlines were added to `src/css/input.css`:
- `.mobile-header` → `outline: 2px solid red`
- `.mobile-calendar` → `outline: 2px solid lime`
- `.mobile-context` → `outline: 2px solid cyan`
- `.mobile-grid-cell` → `border: 1px solid #666`

If these don't show after hard refresh, the compiled CSS isn't being picked up.

## How To Reproduce
1. Open `http://localhost:5000` in Chrome
2. Open DevTools (F12)
3. Toggle device toolbar (Ctrl+Shift+M)
4. Select "iPhone 12 Pro" (390 x 844)
5. Hard refresh (Ctrl+Shift+R)
6. Screen should show mobile layout but is blank
