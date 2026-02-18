# Phase 5 Bug Fixes + Polish

## Context

Phase 5 is implemented but local testing revealed two bugs and three polish items. The bugs are blocking — they break voice discovery and the recordings tab.

---

## Bug 1: Firebase Import Pattern (CRITICAL)

### Problem

Two functions use bare module specifier `'firebase/firestore'` which doesn't resolve in the browser. The project uses Firebase v11 via CDN dynamic imports.

**Error:**
```
Failed to resolve module specifier 'firebase/firestore'
```

**Affected locations:**
- `TeamsBrowserPanel.js` → `_fetchVoiceRecordings()` (~line 2007)
- `TeamManagementModal.js` → `_initRecordingsTab()` (~line 1559)

### Fix

Replace bare `'firebase/firestore'` imports with the CDN URL pattern used everywhere else in the project:

```javascript
// WRONG:
const { collection, query, where, getDocs } = await import('firebase/firestore');

// CORRECT:
const { collection, query, where, getDocs, orderBy } = await import(
    'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
);
```

The Firestore instance is `window.firebase.db` (not `firebase.firestore()`).

**Reference pattern** — see how `BotRegistrationService.js` does it (line 107):
```javascript
const { doc, onSnapshot } = await import(
    'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
);
```

Also check that Cloud Functions are imported correctly if `_initRecordingsTab()` calls `updateRecordingVisibility`. The pattern for functions is:
```javascript
const { httpsCallable } = await import(
    'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
);
const fn = httpsCallable(window.firebase.functions, 'updateRecordingVisibility');
```

See `BotRegistrationService.js` lines 58 and 81 for reference.

---

## Bug 2: Modal Header Redundancy

### Problem

The modal shows "Team Settings" as the h2 header title AND "Team Settings" as the first tab label. This is redundant and wastes vertical space.

### Fix

Remove the separate h2 header row. Make the tab bar serve as the header:

- Remove the `<h2>Team Settings</h2>` from the header section
- Keep the close (X) button — position it in the tab bar row or as an absolute-positioned element
- The tab bar becomes the top element of the modal (right below the border/padding)

For non-leaders (who don't see tabs), show a simple "Team Settings" text header instead — this is the fallback.

---

## Polish 1: Team Name Clickable Link

### What

Make the team name ("Slackers") in the left sidebar panel clickable. Clicking it navigates to the team's detail page.

### Where

In the left panel where the team name is rendered (above the roster), wrap it in an anchor or add an onclick:

```javascript
// Navigate to team detail page
window.location.hash = `#/teams/${teamId}`;
```

The team detail page URL pattern is `#/teams/{teamId}` (e.g., `#/teams/team-sr-001`).

---

## Polish 2: Score Colors Not Visible

### Problem

The score columns use Tailwind classes `text-green-500`, `text-red-500`, and `text-muted-foreground` but these may not render because:
1. The `.mh-td-score` class in `input.css` has a hardcoded `color: var(--foreground)` that overrides Tailwind utility classes
2. Per the QCODE summary, this was supposedly removed — verify it's actually gone

### Fix

Check `input.css` for `.mh-td-score` — ensure there's no hardcoded `color` property that would override the inline Tailwind classes. The score spans need to inherit their color from the Tailwind utility class applied in the HTML.

If Tailwind classes `text-green-500` and `text-red-500` aren't being generated (not in the compiled CSS), add them to the safelist in `tailwind.config.js`, or use inline styles instead:

```javascript
// Alternative: inline styles if Tailwind classes don't compile
style="color: rgb(34, 197, 94)"   // green
style="color: rgb(239, 68, 68)"   // red
```

---

## Polish 3: Voice Filter Toggle

### What

Add a small toggle/icon button in the Match History filter bar that filters the match list to show only matches with voice recordings.

### Where

Next to the existing filter dropdowns (All Maps, All Opponents, 3 months), add a headphone icon button that toggles voice-only filtering:

```javascript
// Filter state
let _voiceOnlyFilter = false;

// In _getFilteredHistoryMatches():
if (_voiceOnlyFilter) {
    matches = matches.filter(m => m.demoHash && _voiceAvailable.has(m.demoHash));
}
```

The button should use the same headphone SVG icon as the table rows, and toggle between active (amber/highlighted) and inactive (muted) states.

---

## Files to Touch

| File | Fix |
|------|-----|
| `public/js/components/TeamsBrowserPanel.js` | Bug 1 (Firebase import in _fetchVoiceRecordings), Polish 3 (voice filter) |
| `public/js/components/TeamManagementModal.js` | Bug 1 (Firebase import in _initRecordingsTab), Bug 2 (header removal) |
| `src/css/input.css` | Polish 2 (check .mh-td-score color override) |

Polish 1 (team name link) location depends on which component renders the team name in the left sidebar.
