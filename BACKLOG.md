# Backlog

Future work items that have been discussed but not yet implemented.

**At the end of every session, do two things:**

1. **Cross things off.** If anything in this file got built during the
   session, remove the entry. The code change is the record. Stale "done"
   entries make this file harder to use.
2. **Add things on.** If a discussion turned up a real problem or
   improvement that wasn't in scope, write a backlog entry before
   wrapping up. Each entry should explain the *why* and at least one
   viable approach — future-you (or a colleague) shouldn't have to
   re-investigate the problem from scratch.

Don't put session-scoped work here — that belongs in the agent's task
list. This file is for things that survive across sessions.

See [`CLAUDE.md` §9](./CLAUDE.md) for the full workflow, and §1 for the
documentation sweep that runs alongside it on every commit.

---

## Items panel — non-Assets categories

**Why:** Clicking Punch List, RFIs, Quality Inspections, etc. shows a generic placeholder ("X content goes here"). These need real sub-views built out.

**Approach:** Each category follows the same pattern as Assets: a list view component + a detail view component, mock data behind a Promise-based accessor, `useItemsView` gets a new `kind` per category, and `panelContent.tsx` + `DockManager` pick up the new kinds automatically.

**Touchpoints:** `src/chrome/features/items-panel/types.ts` (add new `ItemsView` kinds), `panelContent.tsx` (add view branches), `DockManager.tsx` (`getPanelTitle` additions), new list/detail components per category.

---

## Items panel — Asset detail stub tabs

**Why:** Doc, Field, Cx, Ops, and Maintenance tabs show "X content to be added." These need real field layouts once designs land.

**Approach:** Add a `FieldTab`, `DocTab`, etc. component per tab ID inside `AssetDetailView.tsx`, matched on `activeTab`. Design will dictate the card/row structure; the `Asset` type and `assetsData.ts` may need new fields.

**Touchpoints:** `src/chrome/features/items-panel/AssetDetailView.tsx`, `types.ts`, `assetsData.ts`.

---

## Items panel — real API data source

**Why:** `assetsData.ts` returns hard-coded mock data. When the Procore Assets API is available the swap point is `getAssets()` and `getAssetById()` — they already return Promises so callers need no changes.

**Approach:** Replace the two exported functions with real `fetch` calls (or adapter methods). The `Asset` interface is the contract — verify field names match API response shape and add a mapping layer if needed.

**Note:** `linkedElementId` is currently an IFC `expressID` string. When the adapter gains GUID-to-expressID lookup, change the values in `assetsData.ts` to IFC GUIDs and update `modelViewerAdapter.ts` to do the lookup before calling `selectAndFocusObject`.

**Touchpoints:** `src/chrome/features/items-panel/assetsData.ts`, `types.ts`, `src/chrome/features/viewer-adapter/modelViewerAdapter.ts`.

---

## Items panel — Sort and Filter buttons in AssetsListView

**Why:** The sort button (shows "Status") and filter button in `AssetsListView` are visual-only stubs.

**Approach:** Sort: add a dropdown (shared `DropdownMenu`) listing sort options (Status, Name, Last Service Date); sort `filtered` array before rendering. Filter: open a filter panel or popover to narrow by category, status, location.

**Touchpoints:** `src/chrome/features/items-panel/AssetsListView.tsx`.

---

## Apply hidden-objects state during streaming load

**Why:** When a model loads with a saved home view that hides some objects,
the hidden objects are briefly visible while meshes stream in, then snap to
hidden when `load-complete` fires. Visually noticeable on slow loads.

Sectioning already handles this correctly — clip planes are renderer-global
and applied at seed time, so streaming meshes appear pre-clipped. Visibility
can't use the same trick because the `getMeshByElementId(id)` lookup map is
empty until meshes are loaded; calling `hide(['element-123'])` against a
not-yet-loaded model is a silent no-op.

### Options

1. **Queue and apply per-batch (recommended).** Pre-load the hide list as a
   "pending" set on `Visibility`. On each `object-load-progress` or reveal
   batch (whatever event the loader fires per chunk), run `hide()` against
   the IDs that just became resolvable. Objects appear already-hidden as
   they stream. Estimated: 20–40 lines in `Visibility.js` plus a hook in
   the loader's reveal callback.

2. **Accept the brief flash.** Apply visibility at `load-complete` (current
   behavior). Objects appear, then immediately hide. Worse UX but zero
   code change.

Option 1 is the right answer for parity with sectioning. Option 2 is the
status quo if nobody complains.

### Touchpoints

- `src/features/Visibility.js` — add a `setPendingHidden(ids)` API and an
  internal "apply when resolvable" hook.
- `src/core/IFCLoader.js` or wherever reveal batches fire — call into the
  Visibility pending-apply hook per batch.
- `src/chrome/app/ChromeApp.tsx` — in the viewer-ready handler, after the
  camera/sectioning seed, call `viewer.visibility.setPendingHidden(home.hiddenObjects)`
  instead of waiting for `load-complete`.
