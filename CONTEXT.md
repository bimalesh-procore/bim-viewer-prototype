# Project Context — Chrome UI Integration

## What This Project Is

A **3D BIM/IFC Model Viewer** built with Three.js, web-ifc, and @thatopen/components. The viewer loads IFC building models, provides orbit/pan navigation, element selection, visibility control, sectioning planes, object trees, and search sets.

A **Chrome UI** (React 19 / TypeScript / Tailwind) is being integrated as the new presentation layer — replacing the existing dark-theme vanilla JS UI with a modern, modular, light-themed interface.

## Architecture Decision: Blend Approach

The Chrome UI and 3D engine live in the **same project, same `npm install`, same Vite build**. React owns the layout shell; the vanilla JS engine runs inside it.

### Why Blend (not npm workspaces or separate repos)
- Single build pipeline — no cross-package dependency headaches
- Procore Viewer integration is planned — the adapter boundary matters more than folder structure
- Colleagues currently work in a separate ModelChrome repo but will eventually move to this repo
- `model-chrome/` is kept as a **read-only sync source** until colleagues migrate

## Two Entry Points

| Entry | URL | Theme | Purpose |
|---|---|---|---|
| `demo/index.html` | `localhost:3000/` | Light (Tailwind) | Chrome UI — the current default (`npm run dev`) |
| `demo/old.html` | `localhost:3000/old.html` | Dark | Legacy dark-theme UI used by Playwright tests (`npm run dev:old`) |

- `npm run dev` opens the Chrome UI (default)
- `npm run dev:old` opens the legacy dark-theme UI
- **Never modify `demo/old.html` or `demo/test-page.html`** — Playwright tests depend on them

## The ViewerAdapter Boundary

**The single most important architectural rule:** Chrome components communicate with the 3D engine **only** through the `ViewerAdapter` interface. No exceptions.

```
Chrome UI (React) ←→ ViewerAdapter ←→ 3D Engine (vanilla JS)
```

### Key files
| File | Role |
|---|---|
| `src/chrome/features/viewer-adapter/types.ts` | Interface definition (engine-agnostic) |
| `src/chrome/features/viewer-adapter/mockViewerAdapter.ts` | Console-logging mock for standalone dev |
| `src/chrome/features/viewer-adapter/modelViewerAdapter.ts` | Real adapter wrapping ModelViewer |
| `src/chrome/features/viewer-adapter/ViewerAdapterContext.tsx` | React Context + `useViewerAdapter()` hook |

### Sole engine import rule
Only `src/chrome/app/ChromeApp.tsx` imports from the engine (`../../index.js`). Every other chrome file gets engine access through the adapter context. This keeps the boundary clean.

## Plugin Pattern

Both engine features and chrome UI components follow a **standalone plugin pattern**:

- **Engine features:** `src/features/[FeatureName].js` — class with `enable()`, `disable()`, `destroy()`
- **Chrome features:** `src/chrome/features/[feature-name]/` — React component(s) with own state and adapter calls
- No cross-feature imports between siblings
- Each feature is independently enable-able/disable-able

## God Object Protection

`src/core/ModelViewer.js` is the stability anchor. **Never modify it** unless explicitly asked to refactor core. Never add feature-specific logic into it.

## Chrome UI Structure

```
src/chrome/
├── app/
│   ├── App.tsx              ← Standalone mock-mode entry (model-chrome dev)
│   └── ChromeApp.tsx        ← Blended entry (creates ModelViewer + real adapter)
├── features/
│   ├── chrome-layout/       ← Shell that composes all features (no logic).
│   │                          Desktop variant keeps docked desktop UI;
│   │                          tablet/phone use shared ChromeLayoutMobile
│   │                          + index.tsx selector + DeviceFrame.tsx (bezelled
│   │                          tablet/phone shell with rotation + device-preview buttons).
│   ├── header/              ← Back/forward, project dropdown, search, settings cog, device-preview button.
│   │                          Variant files: Header.{desktop,tablet,phone}.tsx + index.tsx
│   ├── mobile-header/       ← Shared tablet/phone header (transparent white overlay;
│   │                          close, model label, settings, search, overflow)
│   ├── mobile-bottom-bar/   ← Shared tablet/phone toolbar system (General/Tools rows,
│   │                          tool/detail rows, Save/Exit detail actions, reset/undo/redo)
│   ├── joystick-overlay/    ← Shared tablet/phone visual joystick overlays (stub-only)
│   ├── form-factor/         ← FormFactorContext (desktop/tablet/phone + orientation).
│   │                          URL-driven via ?form= and ?orient=.
│   ├── form-factor-menu/    ← Radio menu of Desktop/Tablet/Phone. Opened from
│   │                          the phone-icon button in the header.
│   ├── settings-panel/      ← Settings dialog (Measurement System stub, Performance stub,
│   │                          Home View save). Variant files + sections/.
│   │                          Renders inside a FloatingWindow anchored to the right toolbar.
│   ├── floating-window/     ← Reusable free-floating in-page dialog. Title bar drag,
│   │                          close X, Escape to close, no auto-dismiss. See CLAUDE.md §4f.
│   ├── toast/               ← Reusable toast surface (success/error/info/warning,
│   │                          bottom-center, auto-dismiss). See CLAUDE.md §4g.
│   ├── viewpoints/          ← Persistent home view + custom saved viewpoints.
│   │                          Source of truth is public/viewpoints.json (committed),
│   │                          dev-only writes via scripts/vite-plugin-viewpoints-writer.mjs.
│   │                          ViewpointsContext provides live customViews state + CRUD.
│   │                          See CLAUDE.md §4e.
│   ├── dock-manager/        ← DockedPanel host + panelContent.tsx defining all panel contents:
│   │                          Viewpoints panel, Sheets panel (two-line tree rows — building/
│   │                          level folder headers + sheet number/name leaf rows), Properties,
│   │                          and future panels. See CLAUDE.md §4f for the docked-panel pattern.
│   ├── left-toolbar/        ← Object Tree, Search Sets, Viewpoints, Items, Properties, Deviation
│   ├── right-toolbar/       ← View group, Tools group, History group
│   ├── view-cube/           ← 3D orientation indicator
│   ├── minimap/             ← Floor plan overview
│   ├── bottom-toolbar/      ← Home, nav-mode picker, ortho/render/x-ray (synced
│   │                          with right toolbar), render-style picker
│   ├── viewer-settings/     ← Shared React context for isOrthographic,
│   │                          isXRayActive, renderToggles — single source of
│   │                          truth so right & bottom toolbars stay in sync
│   ├── viewer-canvas/       ← Mount point for 3D engine (callback ref)
│   ├── model-manager/       ← Landing page shown when no ?model= param is present. Static
│   │                          Procore header + empty-state UI with "Create Project Model" CTA
│   │                          (navigates to ?model=condos). Viewer Close button strips params.
│   └── viewer-adapter/      ← Interface, mock, real adapter, React Context
├── shared/                  ← Shared UI primitives: TreeNode (extensible tree row with opt-in
│                              actions/rename/DnD/subtitle/hideFolderIcon/labelBold props —
│                              see CLAUDE.md §4f), DropdownMenu + DropdownMenuItem (portaled
│                              context menus, right-aligned to anchor, outside-click dismiss),
│                              ToolbarButton (CSS-hover tooltip via mv-toolbar-button class),
│                              useItemsView (useSyncExternalStore singleton for Items panel
│                              navigation state — lives in shared/ so DockManager can read
│                              it without a cross-feature import)
├── assets/icons/            ← SVGs for all toolbars and header
├── index.css                ← Tailwind directives + dark-theme CSS overrides
└── main.tsx                 ← Entry point: mounts ModelManagerPage when ?model= is absent,
                               otherwise mounts ChromeApp. Routing is URL-based — no router
                               library. See CLAUDE.md §4a.
```

See [`MOBILE_VARIANTS.md`](./MOBILE_VARIANTS.md) for the tablet/phone variant workstream status and next steps. See [CLAUDE.md §3a–3d](./CLAUDE.md) for the variant file convention, device frame, viewer-container remount migration, and URL-param preservation rules.

## How ChromeApp Integrates the Engine

1. `ViewerCanvas` provides a `<div>` whose ref is a **callback ref backed by state** in `ChromeApp` — this is what allows the viewer to survive form-factor variant switches (see CLAUDE.md §3c)
2. `ChromeApp` creates `ModelViewer(container, { showToolbar: false, showStatusBar: false })` in a `useEffect` keyed on the container; the effect's first run creates the viewer, subsequent runs (variant remount) migrate `viewer.canvasContainer` to the new container
3. On `ready` event: overrides dark scene background to light gray, creates real adapter via `createModelViewerAdapter(viewer)`, sets adapter state, auto-loads the default model
4. `ViewerAdapterProvider` distributes the adapter to all chrome components via React Context
5. Chrome components call `useViewerAdapter()` to get the adapter
6. **Model switching** is in-place: `handleSelectModel` calls `viewer.clearAllModels()`, resets streaming state, then calls `viewer.loadModel()`. No page reload. The header model picker uses native `<a href="?model=…">` navigation whose href is built via `URLSearchParams` so `?form=` and `?orient=` survive
7. **Load errors** surface as a dismissible toast at the bottom of the viewport (`loadError` state in `ChromeApp`). The toast appears for auto-load and model switch failures

## CSS Override Strategy

`dark-theme.css` is a side-effect import in `ModelViewer.js` — it always loads when the engine is instantiated. In Chrome mode, `src/chrome/index.css` overrides:

- `.model-viewer { position: absolute; inset: 0; background: transparent }` — removes dark background, fixes positioning
- `.mv-toolbar, .mv-status-bar, .mv-left-sidebar { display: none }` — hides dark-theme UI elements Chrome replaces
- `.mv-context-menu, .mv-tree-panel, .mv-panel { background: white; color: gray }` — re-themes engine panels to light
- `.mv-loading { background: white }` — light loading overlay

## Navigation System

`src/features/Navigation.js` implements all camera controls. Three modes are available:

| Mode | Activation | Left-drag behavior |
|---|---|---|
| Default (look-around) | Bottom toolbar nav-mode menu "Default" button or Escape | Look around (yaw/pitch). Camera stays fixed. |
| Orbit | Bottom toolbar nav-mode menu "Orbit" button | Orbit around a center target point. Origin dot shown at target. |
| Fly | Bottom toolbar nav-mode menu "Fly" button | Look around. WASD/QE + scroll propels camera freely. |

### Keyboard Shortcuts (active in all modes simultaneously)

| Key | Action |
|---|---|
| W / ↑ | Move forward (camera-relative) |
| S / ↓ | Move backward (camera-relative) |
| A / ← | Strafe left (camera-relative) |
| D / → | Strafe right (camera-relative) |
| E | Move up (camera-relative) |
| Q | Move down (camera-relative) |

Movement is **camera-relative** — forward is always along the camera's look direction, not projected onto the world XZ plane.

### Right-Click Temporary Mode Switching

| Active mode | Right-click + drag | On release |
|---|---|---|
| Default | Orbits around a point in front of the camera | Returns to Default |
| Fly | Orbits around a point in front of the camera | Returns to Fly |
| Orbit | Look-around (yaw/pitch, no camera translation) | Returns to Orbit |

Navigation only activates if the pointer moves more than **4 px** while the right button is held. A clean right-click (no movement) lets the browser fire the `contextmenu` event as normal. An orbit origin dot tracks the orbit center once drag is active. The cursor switches to the orbit cursor via `right-drag-orbit-start` / `right-drag-orbit-end` events emitted from `Navigation.js` and consumed by `modelViewerAdapter.ts`.

### Scroll Wheel

Scroll zooms toward/away from the 3D point directly under the mouse cursor (raycasted). Acceleration curve: `Math.pow(|deltaY| / 100, 1.5)` — gentle at low speed, aggressive at high speed. Forward movement is capped at 90% of distance-to-cursor to prevent overshooting distant objects, but the cap is floored at `MIN_STEP = 0.5` so the camera can always punch through walls at architectural-detail distances (otherwise it asymptotically approaches surfaces and feels frozen). Zoom-out has the same MIN_STEP floor so slow scrolls still make meaningful progress.

When the cursor points at empty space (sky / open atrium / past the model edge), the raycast miss falls back to `_lastRaycastDist` — the distance of the most recent successful hit, clamped to 2–150 units. This keeps the scroll step proportional to nearby geometry instead of using a fixed value, which previously caused the camera to teleport far outside the model on rapid scrolls in open areas.

### Origin Dots

- **Fly mode click** — dot at the world point clicked, showing the camera's look target
- **Orbit mode drag** — dot projected from the orbit center target onto the screen
- **Right-drag orbit (Default/Fly)** — dot projected from the temporary orbit target
- All dots: `box-shadow: 0 0 0 2px white` for a 2 px white outline without affecting element size

### Key Implementation Gotchas

- **Three.js r175 OrbitControls uses `pointerdown`**, not `mousedown`. Intercepting right-clicks requires a `pointerdown` capture listener (`{ capture: true }`).
- **`event.preventDefault()` on `pointerdown` suppresses synthesis of `mouseup`**. Always use `pointermove` / `pointerup` for right-drag tracking — never `mousemove` / `mouseup`.
- **`controls.update()` owns the camera in orbit mode.** To apply direct camera rotations, skip `controls.update()` during the drag (guard: `if (!this._rightDragging) this.controls.update()`). Re-anchor `controls.target` on drag end so orbit resumes cleanly.
- **Camera-relative vectors**: `new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion)` for forward, `(1,0,0)` for right, `(0,1,0)` for up. Never project onto world XZ.
- **`camera.updateMatrixWorld()`** must be called before `Vector3.project(camera)` when computing screen-space dot positions (do this in the animate loop, not in event handlers).
- **External drag suspension (`_externalDragActive` + `_controlsEnabledBeforeDrag`)**: When an external system (e.g. section-plane drag) needs to own the mouse, call `navigation.setControlsEnabled(false)`. This sets `_externalDragActive = true` (guards `onLookMouseDown` / `onFlyMouseDown`), snapshots `controls.enabled` into `_controlsEnabledBeforeDrag`, and cancels any in-progress look/fly drag. On `setControlsEnabled(true)`, the snapshot is **restored** rather than force-set to `true` — critical because look mode keeps `controls.enabled = false` as its resting state, so force-`true` would accidentally re-enable OrbitControls and cause jank orbit on next left-drag.

---

## Current Wiring Status

### Wired and working
- **Reset** → `viewer.resetView()`. The right-toolbar reset button shows a **ModificationPill** badge — a small circle displaying the total count of active modifications (sectioning + hidden objects + isolate + markups + measurements). When any count increases the pill expands into an orange label (e.g., "Sectioning") for 3 seconds before collapsing back to the count circle. The label re-fires at the moment you exit sectioning mode (when the pill was hidden), so Section Plane/Cut actions always get their label even though they're placed inside the sectioning UI. When all modifications are cleared the pill plays a reverse pop-out animation (`mv-badge-pop-out` CSS keyframe, `cubic-bezier(0.34,1.56,0.64,1)`) before unmounting. Pill position: `-translate-y-[135%] translate-x-[15%]` relative to the reset button.
- **Object Tree** → `viewer.treePanel.toggle()`. Each leaf node in the Object Tree panel shows a **hide icon button** on hover. Clicking it calls `adapter.hideObjects([expressID])`. Hidden objects show an always-visible **show icon button** instead. Clicking it calls `adapter.showObjects([expressID])`. The panel subscribes to `adapter.subscribeHiddenObjects` to keep `hiddenIds` in sync with the engine. New adapter methods: `showObjects`, `subscribeHiddenObjects` (backed by `visibility.on('visibility-change', ...)` + `visibility.off`). Icon assets: `src/chrome/assets/icons/panel/hide.svg`, `src/chrome/assets/icons/panel/show.svg`.
- **Sectioning** — three sub-tools (right toolbar):
  - **Section Plane** — click an object face to place a clip plane; drag the gizmo to reposition.
  - **Section Cut** — drag a full cross-section slice through the model.
  - **Section Box** — surrounds selected geometry with 6 clip planes; inner sub-modes: drag-face / move / rotate. Default box size is 20% of cam-to-center distance, clamped 8%–30% of scene extent. Re-entering section-box mode reuses the existing box (`hasSectionBox` guard — no box recreation). Right-click "Isolate in section box" fits the box around the clicked object with 25% padding and activates move mode automatically. **Drag-face mode** shows both the translucent blue fill (`_boxFaceMesh`) and wireframe edges (`_boxEdgeMesh`) alongside the ring gizmos — the box updates live as each face is dragged since both meshes are driven by the same clip planes.
  - **Gizmo overlay vs clip planes:** `setActiveTool(null)` (called by `setViewpointState` on viewpoint restore) hides the wireframe overlay and gizmos without removing clip planes. `clearSectioningPlanes()` actually removes the planes from the renderer — called by "Exit and don't save" only. Do not conflate these two.
- **Bottom toolbar Home button** → restores the saved home view (camera + sectioning + visibility) with a 550ms ease-in-out animation; falls back to `zoomToFit()` if no home view is saved
- **Settings → Update Home View** → saves current camera + isOrthographic + hiddenObjects + sectioning to `public/viewpoints.json`. Dev-write only; prod shows an error toast. See CLAUDE.md §4e.
- **Saved home auto-restore on model load** → seeded at viewer-ready time (before model parse) so the camera starts at the home pose with no post-load jump. Sectioning is also applied at seed time (clip planes are renderer-global and clip streaming meshes as they appear). Visibility is applied at load-complete (needs element IDs). Camera is **not** snapped back if the user navigated during the load
- **Settings window** → floating in-page dialog (`FloatingWindow`) anchored to the right toolbar on first open; draggable by title bar; Escape closes
- **Device-preview button (header)** → phone icon next to the settings cog; opens the FormFactorMenu
- **Navigation modes** → `viewer.navigation.setMode('look'|'orbit'|'fly')` via the bottom toolbar nav-mode menu (active state shown on the picker button)
- **WASD/QE keyboard movement** → `Navigation.js` (all modes, camera-relative, always active)
- **Right-click temporary mode** → `Navigation.js` (Default/Fly→orbit, Orbit→look-around)
- **Scroll zoom-to-cursor** → `Navigation.js` raycasts to cursor point with acceleration curve; `MIN_STEP = 0.5` floor lets the camera punch through walls at close range; empty-space fallback uses `_lastRaycastDist` (last successful hit, clamped to 2–150) instead of `controls.target` distance
- **Interior navigation** → `IFCLoader.finalizeMeshAfterReveal` forces all materials to `THREE.DoubleSide` so geometry is visible from inside the model (some `@thatopen/fragments` materials default to `FrontSide` and would otherwise back-face-cull on interior crossing); scroll handlers also guard against `dist < 1e-4` / non-finite to prevent NaN camera corruption
- **Z-fighting on flat BIM surfaces** → `IFCLoader.finalizeMeshAfterReveal` spreads opaque meshes across 4096 polygonOffset buckets via a stable hash on `mesh.id`, breaking ties between coplanar layers (slab + topping + finish, wall + sheathing + finish). Transparent materials (window glass) skip the offset to keep the transparent render-pass depth sort intact. Replaces the older 7-bucket `(revealIndex % 7)` scheme that guaranteed collisions. Residual subtle speckle remains at dense seams (parapet junctions); see [`Z_FIGHTING.md`](./Z_FIGHTING.md) for the coplanar-grouping follow-up plan
- **Navigation orbit cursor** → `right-drag-orbit-start` / `right-drag-orbit-end` events → `modelViewerAdapter.ts`
- **Isolation** → `viewer.visibility.isolate()` / `showAll()`
- **Zoom In/Out** → `viewer.navigation.zoom(±1)` (adapter ready, no button yet)
- **View Orientations** → `viewer.navigation.setCamera()` with presets (adapter ready, ViewCube not wired)
- **Model switching** → `viewer.clearAllModels()` + `viewer.loadModel()` (in-place, no page reload)
- **Load error feedback** → dismissible toast rendered by `ChromeApp` on any load failure
- **Model prev/next navigation** → Back/Forward arrow buttons in header cycle through models list with wrapping (`Header.tsx` `handlePrev` / `handleNext`)
- **Header dropdown z-index** → wrapper raised to `z-[60]` in `ChromeLayout.tsx` so the model picker always floats above left/right toolbar panels (`z-50`)
- **Selection — click-to-deselect** → clicking a selected object a second time deselects it (`Selection.js` `onClick`)
- **Selection — drag-vs-click suppression** → left-button drags (>4px between mousedown and mouseup) do not trigger selection on release, so a navigation drag that happens to end over an object no longer selects it. Clean clicks still select. Mirrors the existing right-click drag detection (`Selection.js` `leftMouseDown` / `leftMouseMoved`)
- **Selection — opaque highlight** → selection highlight material has no transparency; selected objects render fully opaque with tint only
- **Selection — hover transparency removed** → `applyHover()` body commented out; re-enable by uncommenting the block
- **Right-click context menu — objects only** → `openContextMenuAtEvent` no longer fires on empty-space clicks; context menu only appears when the raycast hits an object. Right-clicking an unselected object also selects it (visual highlight), so the context menu always acts on the highlighted element. Right-clicking an already-selected object keeps the selection unchanged.
- **Section plane/cut immediate drag** → clicking an object to create a section plane or section cut immediately begins dragging it in the same mousedown–move–mouseup gesture; camera is fully suspended for the duration via `navigation.setControlsEnabled(false)` + `_externalDragActive` guard
- **Section plane/cut gizmo overflow button** → the white circle button that appears to the right of a plane gizmo on hover. Show/hide is driven by `onDocMouseMove` in `_createPlaneGizmo`. The listener must be registered in **capture phase** (`document.addEventListener('mousemove', …, { capture: true })`); using bubble phase means `el.stopPropagation()` (called in the gizmo's own mousemove handler) silently blocks the listener for section-cut gizmos whose rotation angle is axis-aligned (no bounding-rect corner gap). The render loop hides the button via `if (!visible || this.isDragging) overflowBtn.style.display = 'none'` to suppress it during drag and when the gizmo centroid is occluded.
- **Form-factor selector** → desktop keeps the header device-preview control; tablet/phone expose the same menu from the DeviceFrame button beneath rotate. URL updates via `history.replaceState` to `?form=…`; clean URLs omit the param for desktop. Refresh respects the URL; bare URL defaults to desktop. See [CLAUDE.md §3a](./CLAUDE.md) and [`MOBILE_VARIANTS.md`](./MOBILE_VARIANTS.md)
- **Device frame** (tablet/phone) → centered, bezelled device shell with rotation button outside top-right. Tablet/phone variant trees are wrapped in `DeviceFrame` from `chrome-layout/index.tsx`. Bezel/notch/home indicator live outside the chrome's scale transform so they stay visually consistent across orientation and viewport size
- **Orientation toggle** → rotate button on tablet/phone swaps `?orient=portrait`/`?orient=landscape`. Tablet default = landscape; phone default = portrait. URL omits `?orient=` when it matches the default
- **Undo / Redo** → right-toolbar undo/redo buttons are fully wired. A typed undo stack in `modelViewerAdapter.ts` handles all three modes:
  - *Default mode*: delta entries per visibility change (`vis-hide`/`vis-show`, tracked via the `visibility-change` engine event so both the object-tree eye icon AND the 3D canvas right-click context menu are captured). Complex ops (isolate, clear-all) use a full `vis-snapshot` entry. Camera moves debounced at 1 s; only committed if position/target moved > 1 mm. On save-and-exit of sectioning view mode, N × `section-step` entries are pushed (one per plane-add/drag/etc.) so each step can be individually undone from default mode via `viewer.sectioning.undo()`.
  - *Sectioning mode*: delegates to `viewer.sectioning.undo()/redo()`. `sectionUndoDepth` tracks plane-add, plane-remove, section-box-activate, and `drag-end` (for plane/box move drags). When `sectionUndoDepth` reaches 0 undo falls through to camera entries in the default stack.
  - *Markup mode*: delegates to `viewer.markup.undo()/redo()`. `markupUndoDepth` tracks strokes via `markups-changed`.
  Buttons show disabled (40 % opacity) when their respective stack is empty. Camera moves from inside a sectioning session are trimmed from the default stack on exit so they don't pollute default-mode undo. See `modelViewerAdapter.ts` (`_suppressVisibilityUndo`, `_suppressCameraUndoCount`, `UndoEntry` union type).
- **Bottom toolbar ↔ right toolbar sync (Ortho / Render Settings / X-Ray)** → `ViewerSettingsContext` owns `isOrthographic`, `isXRayActive`, and `renderToggles`; both toolbars read/write through `useViewerSettings()`. Ortho/X-Ray delegate to the adapter; render-settings state is context-only until the engine has a concept for it
- **Render style picker** → bottom toolbar dropdown (Default / Realism). Selection persists in URL via `?style=realism` (URL omitted when Default) using `URLSearchParams` + `history.replaceState` — preserves `?model=`, `?form=`, `?orient=` per [CLAUDE.md §3d](./CLAUDE.md). Visual-only — no adapter call yet
- **Items panel (Related Items)** → hub list of 9 categories with custom SVG icons (`src/chrome/assets/icons/items/`) at 16×16px. Assets category is fully wired: list view with search/filter UI (matches `PanelSearchBar` styling), tile cards (status pill, comment count, external-link icon), and a detail view behind each tile (6 tabs: General · Doc · Field · Cx · Ops · Maintenance — General tab fully populated with Photo hero + thumbnails, General Information, Specification Details, Maintenance Details, and Specialty Contractor collapsible cards). Clicking a tile calls `adapter.selectAndFocusObject(linkedElementId)` to highlight the corresponding BIM element. All other hub categories (Punch List, RFIs, etc.) show a placeholder. Internal navigation uses `useItemsView` (`src/chrome/shared/useItemsView.ts`) — a `useSyncExternalStore` singleton that DockManager reads to drive the panel header title and back-arrow without coupling `ItemsContent` to `DockManager`. Mock data lives in `assetsData.ts` behind `getAssets()` / `getAssetById()` Promises — swap to real API by replacing those two functions only. `linkedElementId` is an IFC `expressID` today; GUID swap is a data + adapter change only. **`ItemCard`** (`src/chrome/features/items-panel/ItemCard.tsx`) is the generic card component for all Items tools — it takes `title`, `status`, `commentCount`, `showExternalLink`, `meta`, `secondaryMeta`, and `onClick` as plain props with no dependency on `Asset`. `AssetTile` is now a thin wrapper that maps `Asset` fields to `ItemCard` props. Import via the barrel: `import { ItemCard } from '../items-panel'`.
- **Toolbar tooltips** → CSS-based, no JS timer. `ToolbarButton` renders a `.mv-toolbar-tooltip` div when `showTooltip` is true (default). Visibility is controlled entirely by CSS: `.mv-toolbar-container:hover .mv-toolbar-tooltip { opacity: 1 }` shows all tooltips when hovering any button in the left or right toolbar; `.mv-toolbar-button:hover .mv-toolbar-tooltip` handles per-button hover for standalone contexts (bottom toolbar, flyout panels). Left and right toolbar containers carry the `mv-toolbar-container` class. Bottom toolbar nav-mode, Render Settings, and Render Mode buttons have inline `.mv-toolbar-tooltip-top` divs since they are raw `<button>` elements not using `ToolbarButton`.
- **Viewpoints panel** → full custom-viewpoint CRUD. Orange `+` in panel header opens a Create dropdown (Create Viewpoint wired; Create Folder and Import stubs). "Create Viewpoint" captures current camera + hiddenObjects + sectioning and saves to `public/viewpoints.json` via `POST /__viewpoints/custom`. Click a row to restore (camera + visibility + sectioning animated). Selected row auto-deselects on camera move (700ms cooldown after restore animation). Hover or selected state reveals Edit Name, Share, and More icon buttons; More dropdown offers Update (re-save to existing viewpoint in-place), Rename, Delete (all wired) plus Move to Folder and Add to Project Views (stubs). Double-click or Edit Name button renames inline (Enter/blur commits, Escape cancels). Drag-to-reorder persists order to file. Empty state shown when no viewpoints saved. Dev-write only — prod shows error toast on save. State lives in `ViewpointsContext`. Rows render via `TreeNode` directly (no `ViewRow` wrapper); both the Create and More dropdowns use the shared `DropdownMenu` component. See CLAUDE.md §4e and §4f.

### Wired to stubs (engine feature not built)
- Properties, Measure — log to console

### Not wired yet
- Search Sets, Deviation, Render Modes (mesh/lines/terrain/point-cloud toggles — context-only, no engine concept), Markup, Quick Create, ViewCube faces, Header Search, MiniMap
- Items panel non-Assets categories (Punch List, RFIs, Quality Inspections, etc.) — placeholder views only; real data + sub-views not yet built
- Items panel Asset detail tabs Doc / Field / Cx / Ops / Maintenance — stub content

## React StrictMode Consideration

React StrictMode double-mounts in dev mode. The `ChromeApp` uses a `viewerInstanceRef` guard to prevent creating two ModelViewer instances. The cleanup function in `useEffect` does **not** call `viewer.destroy()` because the WebGL context disposal is irreversible.

## Sync Workflow (model-chrome/)

1. Colleagues update their external ModelChrome repo
2. Pull their changes into `model-chrome/` in this repo
3. Diff `model-chrome/src/` against `src/chrome/` and merge relevant changes
4. Once colleagues move to this repo, they contribute to `src/chrome/` directly and `model-chrome/` is removed

## Model Files

Sample models live in `public/models/` as **pre-converted `.frag.gz` files**. IFC sources are not committed (too large for GitHub). The `.frag.gz` format is `@thatopen/components`' binary fragment format, gzip-compressed.

| Model | File | Size |
|---|---|---|
| Condos | `condos.frag.gz` | ~4 MB |
| Data Center | `data-center.frag.gz` | ~31 MB |
| Tower | `tower.frag.gz` | ~6 MB |
| Vortex Architectural | `vortex-architectural.frag.gz` | ~21 MB |
| Mastodon | `mastodon.frag.gz` | ~81 MB |

**To add a model:** drop the `.ifc` in `public/models/`, run `npm run convert <path>`, delete the `.ifc`, commit the `.frag.gz`, then register it in the `MODELS` array in `ChromeApp.tsx`. See CLAUDE.md §4b for full details.

## Tech Stack

| Layer | Technologies |
|---|---|
| 3D Engine | Three.js, web-ifc, @thatopen/components, @thatopen/fragments |
| Chrome UI | React 19, TypeScript 5.7, Tailwind CSS 3.4, Lucide React |
| Build | Vite 5 + @vitejs/plugin-react |
| Tests | Playwright (engine e2e tests in `evals/tests/`) |
| Config | `tsconfig.json` (scoped to `src/chrome/`), `tailwind.config.js` (scoped to `src/chrome/`), `postcss.config.js` |

## Test Suites

| Suite | Count | Location |
|---|---|---|
| Regression | 80 | `evals/tests/regression.spec.js` |
| Search Sets | 28 | `evals/tests/search-sets.spec.js` |
| Selection | 23 (3 pre-existing failures) | `evals/tests/selection.spec.js` |
| Left Sidebar | 11 | `evals/tests/left-sidebar.spec.js` |
| IFC Loading | 8 | `evals/tests/ifc-loading.spec.js` |
| Chrome Compatibility | 43 (15 expected failures) | `evals/tests/chrome-compatibility.spec.js` |

Run all: `npm test`. Tests use `demo/old.html` and `demo/test-page.html` — never the Chrome UI entry.

## Known Issues / Next Steps

1. **Toolbar buttons feel disconnected** — many Chrome buttons aren't wired to the adapter yet. Each "not wired" button needs: adapter method added to `types.ts`, implemented in `modelViewerAdapter.ts` and `mockViewerAdapter.ts`, and called from the Chrome component.
2. ~~**Right-click context menu**~~ — **Resolved.** Right-click now only activates navigation after the pointer moves >4 px; a clean right-click shows the context menu as normal. Context menu is suppressed on empty-space clicks (no object hit).
3. **No active state management (most toolbars)** — most Chrome toolbar buttons don't track active/pressed state. The bottom toolbar nav-mode picker is the exception — it tracks the selected mode and reflects it on the button icon. Other toolbars still need this.
4. **SearchSets not wired** — the engine has a full SearchSets feature + panel, but the Chrome left toolbar button doesn't toggle it yet.
5. ~~**Object tree stale on model switch**~~ — **Resolved.** `ChromeApp.handleSelectModel` now calls `viewer.objectTree.buildTree()` + `viewer.treePanel.refresh()` immediately after `clearAllModels()`, so the tree goes blank at the start of the load rather than showing stale data throughout.
6. **Navigation tests sparse** — the REG-NAV suite predates the WASD/right-click/scroll-to-cursor work. Tests for camera-relative movement, right-click mode switching, zoom-to-cursor, and origin dots have not been written yet.
7. **Procore Viewer integration** — future work. Write `procoreAdapter.ts` implementing the same `ViewerAdapter` interface. Chrome components don't change.
8. ~~**Section plane/cut camera interference**~~ — **Resolved.** Creating a section plane/cut and immediately dragging in the same gesture no longer moves the camera. Fixed via `_externalDragActive` flag in `Navigation.js` (guards look/fly drag start) and save/restore of `controls.enabled` in `setControlsEnabled` (prevents accidental OrbitControls re-enable in look mode after drag ends).
9. **Mobile/tablet variant buildout** — shared mobile chrome is now active for tablet/phone (`ChromeLayoutMobile`, `MobileHeader`, `MobileBottomBar`, `JoystickOverlay`, single-panel replacement flow). Remaining work is behavior depth (touch joystick wiring, mobile drawer/tab system, and additional feature parity). See [`MOBILE_VARIANTS.md`](./MOBILE_VARIANTS.md).

## Experiments & Dead Ends

See [`EXPERIMENTS.md`](./EXPERIMENTS.md) for a log of approaches that were researched or
prototyped but ultimately reverted — including the `MeshCullerRenderer` frustum-culling
attempt and the lessons learned from it.

## Branch History

| Branch | Purpose |
|---|---|
| `main` | Stable base |
| `searchsetManager` | Search Set Manager feature |
| `feature/model-chrome-ui` | Chrome UI integration (current work) |
