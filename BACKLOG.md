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

## Items panel — ItemCard styling updates

**Why:** The generic `ItemCard` component was extracted but styling changes were deferred — the user wanted to describe them during implementation. Paused due to repo migration.

**Approach:** Open `src/chrome/features/items-panel/ItemCard.tsx` and apply the styling changes the user describes. Since `AssetTile` is a thin wrapper, any change to `ItemCard` automatically updates the Assets list view.

**Touchpoints:** `src/chrome/features/items-panel/ItemCard.tsx` only.

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

---

## Mobile chrome follow-up: drawer tabs and touch joystick behavior

**Why:** Tablet and phone now use the shared mobile header/bottom-bar shell,
but the `General`/`Tools` flow is still placeholder-only and joystick overlays
are visual stubs. To match the Figma UX, tapping `General` or `Tools` should
reveal the panel-tab drawer, and joystick drags should control navigation.

### Options

1. **Add a `MobileDrawer` + `MobilePanel` in the shared mobile chrome
   (recommended).** Keep the bottom bar fixed and animate a tab row from
   beneath it (`Views`, `Items`, `Objects`, `Properties`, `Groups`,
   `Deviations`). Render the existing panel content components inside a
   mobile panel shell, reusing the same contexts as desktop.
2. **Keep desktop panels only and no drawer.** Lower implementation effort,
   but mobile interactions diverge from design and `General`/`Tools` remain
   dead ends.

For joystick behavior, either:
- **A)** map pointer-drag deltas to adapter navigation calls (walk/look/up-down)
  with dead-zone + acceleration tuning, or
- **B)** leave visual-only stubs (current behavior).

### Touchpoints

- `src/chrome/features/mobile-bottom-bar/MobileBottomBar.tsx` — wire
  `General`/`Tools` to drawer open/close state.
- `src/chrome/features/chrome-layout/ChromeLayoutMobile.tsx` — own drawer/panel
  state and mount `MobilePanel`.
- `src/chrome/features/dock-manager/panelContent.tsx` — reuse exported panel
  content components in the mobile panel shell.
- `src/chrome/features/joystick-overlay/JoystickOverlay.tsx` — convert from
  visual-only to pointer-interactive controls.
- `src/chrome/features/viewer-adapter/types.ts` and `modelViewerAdapter.ts` —
  add/bridge any missing movement primitives needed for continuous touch input.

---

## Search Sets panel — remaining stubs

**Why:** The core Search Sets panel is fully wired but several secondary actions are stubbed.

**Items still to build:**

1. **Create Folder in header** (`+ → Create Folder`) — the button is wired but calls the same `handleCreateFolder` that creates a root-level extra folder. The design calls for it to open a location picker so the user can choose where the folder lands.

2. **Import from Navisworks** — the `importFromNavisworks` option in the add menu is wired to open the file picker. The XML parser (`xmlParser.ts`) is fully implemented. Any remaining work is edge-case handling (very large files, unusual encoding, nested selection node shapes).

3. **Per-row "Share" button** — visual stub, no action. Requires knowing the share destination (link, user, etc.) — design decision needed.

4. **Move to Folder → Existing Folder for derived folders (bulk)** — when the bulk selection contains derived folders (not just sets), the "Existing Folder" path currently moves the contained sets only. A cleaner approach would move the entire sub-tree by re-parenting all contained sets' `source + folderPath` prefix to the destination folder's path. Complex because `folderPath` segments are path-encoded in the set records.

**Touchpoints:** `src/chrome/features/dock-manager/panelContent.tsx` (all four), `src/chrome/features/search-sets/xmlParser.ts` (Navisworks edge cases).

---

## Undo/Redo — measurement mode

**Why:** When the Measure tool is actually implemented, undo/redo should work within measurement mode just like markup and sectioning. Currently measurements are not implemented so there is nothing to track.

**Approach:** Mirror the markup pattern. Add `measureUndoDepth`/`measureRedoDepth` counters. When the measurement engine fires a "measurement-added" or equivalent event, increment `measureUndoDepth`. In `undo()`, when `measurementsModeActive`, call the measurement engine's undo and decrement the counter. Wire `canUndo`/`canRedo` in `buildActionSummary` to include the measurement depth check.

**Touchpoints:** `src/chrome/features/viewer-adapter/modelViewerAdapter.ts` (counters + undo/redo dispatch), `src/chrome/features/viewer-adapter/types.ts` (no changes needed — `measurementsCount` field already in `ActionHistorySummary`).

---

## Undo/Redo — clear-all doesn't restore section planes

**Why:** `clearAllActions()` calls `viewer.sectioning.clearAll()` which removes clip planes. The undo entry pushed is a `vis-snapshot` (visibility only). So undoing "Clear All" restores visibility but does NOT restore the section planes that were cleared.

**Approach:** Change `clearAllActions` to also capture the current sectioning state and push a combined `vis-snapshot + sectioning-state` entry. On undo, restore both. Alternatively, push a `SectioningUndoEntry` first (for the plane state) and a `VisibilitySnapshotEntry` second (for visibility), so they undo in the correct order (visibility first, then planes).

**Touchpoints:** `modelViewerAdapter.ts` — `clearAllActions()` and the undo/redo dispatch branches.
