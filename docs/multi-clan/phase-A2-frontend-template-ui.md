# Phase A2: Frontend Template UI Simplification

## Context

Phase A1 migrated templates from a subcollection (up to 3 named templates) to a single flat field on the user doc. The frontend UI components (`TemplatesModal.js`, `MobileBottomBar.js`, `GridActionButtons.js`) still expect the old multi-template model. This phase rewrites the template UI to match the new single-template model.

Read `AVAILABILITY-ENHANCEMENT-CONTRACT.md` at the orchestrator level for the full contract.

**Prerequisite**: Phase A1 must be deployed first (schema + Cloud Functions + TemplateService.js).

---

## What Changes

1. **Rewrite `TemplatesModal.js`** — simplified single-template UI with recurring toggle
2. **Update `GridActionButtons.js`** — adjust save template flow (no name prompt)
3. **Update `MobileBottomBar.js`** — update mobile template popup
4. **Event name**: Listen for `'template-updated'` (was `'templates-updated'`)

---

## New UI Design

### Desktop (TemplatesModal)

**When template exists:**
```
┌─ Template ─────────────────────── ✕ ─┐
│                                      │
│  28 slots saved            [Update]  │
│  ─────────────────────────────────── │
│  Load to:   [Week 1]  [Week 2]      │
│  ─────────────────────────────────── │
│  Auto-fill weekly   [toggle: OFF]    │
│  ─────────────────────────────────── │
│  Clear Template    Clear Availability│
└──────────────────────────────────────┘
```

**When no template:**
```
┌─ Template ─────────────────────── ✕ ─┐
│                                      │
│  No template saved                   │
│  [Save Current Selection]            │
│  ─────────────────────────────────── │
│  Clear Availability                  │
└──────────────────────────────────────┘
```

### Behavior

| Element | Action |
|---------|--------|
| **Update** | Overwrites template with currently selected cells (no name prompt). Disabled if no selection. |
| **Save Current Selection** | Same as Update but shown when no template exists yet. Disabled if no selection. |
| **Load to Week 1/2** | Selects cells matching template slots on target week grid. Closes modal. |
| **Auto-fill weekly toggle** | Calls `setRecurring()` Cloud Function (Phase A4 will add this). For now, can show as disabled with tooltip "Coming soon" OR implement the toggle UI that sets `template.recurring` via a direct Firestore write. |
| **Clear Template** | Calls `TemplateService.clearTemplate()`. Shows confirmation. |
| **Clear Availability** | Existing behavior — removes user from all slots both weeks. |

---

## Files to Modify

### 1. `public/js/components/TemplatesModal.js` — Rewrite

Key changes from the current implementation:

**Old API calls to remove:**
- `TemplateService.getTemplates()` → `TemplateService.getTemplate()` (returns single object or null)
- `TemplateService.canSaveMore()` → `TemplateService.hasTemplate()` (for conditional UI)
- `TemplateService.saveTemplate(name, slots)` → `TemplateService.saveTemplate(slots)` (no name)
- `TemplateService.deleteTemplate(id)` → `TemplateService.clearTemplate()`
- `TemplateService.renameTemplate(id, name)` → removed entirely
- `TemplateService.MAX_NAME_LENGTH` → removed

**Event listener change:**
```javascript
// Old:
window.addEventListener('templates-updated', _render);
// New:
window.addEventListener('template-updated', _render);
```

**Remove `_showNameModal()`** — no longer needed since there's no template name.

**Remove `_renderTemplateRow()`** — no longer a list, just a single template display.

**New `_render()` function**: Check `TemplateService.getTemplate()`:
- If null → show "No template saved" + "Save Current Selection" button
- If has template → show slot count + Update/Load/Recurring/Clear buttons

**The `_onLoadTemplate` callback**: Currently called with `(template.slots, weekIndex)`. New call: `_onLoadTemplate(template.slots, weekIndex)` — same signature since `TemplateService.getTemplate()` returns `{ slots, recurring, ... }`.

**Recurring toggle**: The toggle sets `template.recurring` on the user doc. If the `setRecurring` Cloud Function from Phase A4 isn't deployed yet, you can implement this as a direct Firestore update from the frontend (the user doc is writeable by the user). Use:
```javascript
const { doc, updateDoc } = await import('firebase-firestore...');
await updateDoc(doc(_db, 'users', userId), {
    'template.recurring': !currentValue
});
```

This is fine as an interim approach — Phase A4 will add the Cloud Function that also triggers immediate apply on toggle-on.

### 2. `public/js/components/GridActionButtons.js` — Update save flow

Find where `TemplateService.saveTemplate(name, slots)` is called (via the TemplatesModal save handler). Update to `TemplateService.saveTemplate(slots)` — no name parameter.

If this file has a direct "Save as Template" action (outside the modal), update similarly.

### 3. `public/js/components/MobileBottomBar.js` — Update mobile template popup

This component has a compact template list for mobile. Update to single-template model:
- Show template status (slot count or "No template")
- Save / Load W1 / Load W2 / Clear buttons
- Remove per-template rename/delete row buttons
- Update event listener: `'template-updated'`

### 4. Cleanup: Remove references to old multi-template concepts

Search across the frontend for any remaining references to:
- `getTemplates()` (plural) → should be `getTemplate()` (singular)
- `canSaveMore()` → `hasTemplate()`
- `templateId` (specific IDs) → no longer needed
- `template.name` / `template.id` → templates no longer have names or IDs
- `MAX_TEMPLATES` → removed
- `'templates-updated'` event → `'template-updated'`

---

## Verification

1. Run `npm run dev` and open `http://localhost:5000`
2. Click "Templates" button in the grid toolbar
3. If you have a template from migration: verify slot count shows, Update/Load/Clear work
4. If no template: verify "Save Current Selection" works (select some cells first)
5. Load template to Week 1 → verify cells are selected
6. Load template to Week 2 → verify cells are selected on next week grid
7. Clear template → verify UI updates to "No template saved"
8. Mobile: verify the bottom bar popup shows the same simplified UI
9. Recurring toggle: verify it toggles (visual state), even if the backend function isn't deployed yet
