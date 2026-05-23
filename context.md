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
│   ├── chrome-layout/       ← Shell that composes all features (no logic)
│   ├── header/              ← Back/forward, project dropdown, search, settings
│   ├── left-toolbar/        ← Object Tree, Search Sets, Views, Items, Properties, Deviation
│   ├── right-toolbar/       ← View group, Tools group, History group
│   ├── view-cube/           ← 3D orientation indicator
│   ├── minimap/             ← Floor plan overview
│   ├── navigation-wheel/    ← Fit-to-view button
│   ├── viewer-canvas/       ← Mount point for 3D engine (ref-based)
│   └── viewer-adapter/      ← Interface, mock, real adapter, React Context
├── shared/                  ← For shared UI primitives (currently empty)
├── assets/icons/            ← SVGs for all toolbars and header
├── index.css                ← Tailwind directives + dark-theme CSS overrides
└── main.tsx                 ← Entry point (loads ChromeApp)
```

## How ChromeApp Integrates the Engine

1. `ViewerCanvas` provides a `<div ref>` as the mount point
2. `ChromeApp` creates `ModelViewer(container, { showToolbar: false, showStatusBar: false })` in a `useEffect`
3. On `ready` event: overrides dark scene background to light gray, creates real adapter via `createModelViewerAdapter(viewer)`, sets adapter state, auto-loads the default model
4. `ViewerAdapterProvider` distributes the adapter to all chrome components via React Context
5. Chrome components call `useViewerAdapter()` to get the adapter
6. A `WelcomeOverlay` (accessible via the Upload button) supports drag-drop and sample model buttons for loading custom files
7. **Model switching** is in-place: `handleSelectModel` calls `viewer.clearAllModels()`, resets streaming state, then calls `viewer.loadModel()`. No page reload.
8. **Load errors** surface as a dismissible toast at the bottom of the viewport (`loadError` state in `ChromeApp`). The toast appears for auto-load, URL load, file upload, and model switch failures.

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
| Default (look-around) | NavigationWheel "Default" button or Escape | Look around (yaw/pitch). Camera stays fixed. |
| Orbit | NavigationWheel "Orbit" button | Orbit around a center target point. Origin dot shown at target. |
| Fly | NavigationWheel "Fly" button | Look around. WASD/QE + scroll propels camera freely. |

### Keyboard Shortcuts (active in all modes simultaneously)

| Key | Action |
|---|---|
| W / ↑ | Move forward (camera-relative) |
| S / ↓ | Move backward (camera-relative) |
| A / ← | Strafe left (camera-relative) |
| D / → | Strafe right (camera-relative) |
| E / Space | Move up (camera-relative) |
| Q / Shift | Move down (camera-relative) |
| Escape | Switch to Default (look) mode |

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
- **Reset** → `viewer.resetView()`
- **Object Tree** → `viewer.treePanel.toggle()`
- **Sectioning** → `viewer.sectioning.clearClipPlanes()`
- **NavigationWheel fit-to-view** → `viewer.navigation.zoomToFit()`
- **Navigation modes** → `viewer.navigation.setMode('look'|'orbit'|'fly')` via NavigationWheel buttons (with active state)
- **WASD/QE keyboard movement** → `Navigation.js` (all modes, camera-relative, always active)
- **Right-click temporary mode** → `Navigation.js` (Default/Fly→orbit, Orbit→look-around)
- **Scroll zoom-to-cursor** → `Navigation.js` raycasts to cursor point with acceleration curve; `MIN_STEP = 0.5` floor lets the camera punch through walls at close range; empty-space fallback uses `_lastRaycastDist` (last successful hit, clamped to 2–150) instead of `controls.target` distance
- **Interior navigation** → `IFCLoader.finalizeMeshAfterReveal` forces all materials to `THREE.DoubleSide` so geometry is visible from inside the model (some `@thatopen/fragments` materials default to `FrontSide` and would otherwise back-face-cull on interior crossing); scroll handlers also guard against `dist < 1e-4` / non-finite to prevent NaN camera corruption
- **Navigation orbit cursor** → `right-drag-orbit-start` / `right-drag-orbit-end` events → `modelViewerAdapter.ts`
- **Isolation** → `viewer.visibility.isolate()` / `showAll()`
- **Zoom In/Out** → `viewer.navigation.zoom(±1)` (adapter ready, no button yet)
- **View Orientations** → `viewer.navigation.setCamera()` with presets (adapter ready, ViewCube not wired)
- **Model switching** → `viewer.clearAllModels()` + `viewer.loadModel()` (in-place, no page reload)
- **Load error feedback** → dismissible toast rendered by `ChromeApp` on any load failure
- **Model prev/next navigation** → Back/Forward arrow buttons in header cycle through models list with wrapping (`Header.tsx` `handlePrev` / `handleNext`)
- **Header dropdown z-index** → wrapper raised to `z-[60]` in `ChromeLayout.tsx` so the model picker always floats above left/right toolbar panels (`z-50`)
- **Selection — click-to-deselect** → clicking a selected object a second time deselects it (`Selection.js` `onClick`)
- **Selection — opaque highlight** → selection highlight material has no transparency; selected objects render fully opaque with tint only
- **Selection — hover transparency removed** → `applyHover()` body commented out; re-enable by uncommenting the block
- **Right-click context menu — objects only** → `openContextMenuAtEvent` no longer fires on empty-space clicks; context menu only appears when the raycast hits an object
- **Section plane/cut immediate drag** → clicking an object to create a section plane or section cut immediately begins dragging it in the same mousedown–move–mouseup gesture; camera is fully suspended for the duration via `navigation.setControlsEnabled(false)` + `_externalDragActive` guard

### Wired to stubs (engine feature not built)
- Properties, Measure, Undo, Redo — log to console

### Not wired yet
- Search Sets, Views & Markups, Items, Deviation, Orthographic, Render Modes, X-Ray, Markup, Quick Create, ViewCube faces, Header Search, MiniMap

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
3. **No active state management (most toolbars)** — most Chrome toolbar buttons don't track active/pressed state. NavigationWheel mode buttons are the exception — they do track active state. Other toolbars still need this.
4. **SearchSets not wired** — the engine has a full SearchSets feature + panel, but the Chrome left toolbar button doesn't toggle it yet.
5. ~~**Object tree stale on model switch**~~ — **Resolved.** `ChromeApp.handleSelectModel` now calls `viewer.objectTree.buildTree()` + `viewer.treePanel.refresh()` immediately after `clearAllModels()`, so the tree goes blank at the start of the load rather than showing stale data throughout.
6. **Navigation tests sparse** — the REG-NAV suite predates the WASD/right-click/scroll-to-cursor work. Tests for camera-relative movement, right-click mode switching, zoom-to-cursor, and origin dots have not been written yet.
7. **Procore Viewer integration** — future work. Write `procoreAdapter.ts` implementing the same `ViewerAdapter` interface. Chrome components don't change.
8. ~~**Section plane/cut camera interference**~~ — **Resolved.** Creating a section plane/cut and immediately dragging in the same gesture no longer moves the camera. Fixed via `_externalDragActive` flag in `Navigation.js` (guards look/fly drag start) and save/restore of `controls.enabled` in `setControlsEnabled` (prevents accidental OrbitControls re-enable in look mode after drag ends).

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
