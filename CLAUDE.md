# CLAUDE.md

## Before Every Commit/Push

Both steps below are **required** every time the agent runs `git commit` or `git push`. Do not skip either.

### 1. Documentation Sweep

**Before committing, update all relevant `.md` files.** The goal is to keep them honest — they're the only durable record of *why* the code does what it does, and they rot fast if nobody minds them.

**Skip this sweep** if the user has just walked through documentation updates manually with the agent in the same session **and** no further file changes have happened since the last doc edit. The point of the sweep is to catch agents committing undocumented changes, not to repeat work already done.

**The sweep:**

1. **Identify which `.md` files describe what just changed.** Map by topic:

   | What changed | File to update |
   |---|---|
   | Architectural rules, new patterns, new chrome features | [`CLAUDE.md`](./CLAUDE.md) |
   | "What's wired and working", structure trees, status | [`CONTEXT.md`](./CONTEXT.md) |
   | Test suite mapping for changed features | [`MERGETOMAIN.md`](./MERGETOMAIN.md) |
   | Tablet / phone variant work | [`MOBILE_VARIANTS.md`](./MOBILE_VARIANTS.md) |
   | Realism render mode internals | [`REALISM.md`](./REALISM.md) |
   | Z-fighting fix history / follow-ups | [`Z_FIGHTING.md`](./Z_FIGHTING.md) |
   | Test infrastructure / suites / fixtures | [`TEST_PLAN.md`](./TEST_PLAN.md) |
   | Dead-end experiments worth remembering | [`EXPERIMENTS.md`](./EXPERIMENTS.md) |
   | Anything surfaced but not built | [`BACKLOG.md`](./BACKLOG.md) — see §10 |

2. **Update each relevant file.** Write the *behavior* and the *reason*, not the line-by-line diff. Future readers want to know what to expect and why decisions were made, not what got renamed.

3. **Consider whether the work warrants a new top-level `.md`.** If a single area accumulated enough engineering nuance that it would overwhelm `CLAUDE.md` (like Realism or Z-Fighting did), create a new `<TOPIC>.md` at the repo root **and add a short summary section in `CLAUDE.md` that links to it**. The new file should not be findable only by `ls` — it has to be discoverable from `CLAUDE.md`.

4. **Cross things off [`BACKLOG.md`](./BACKLOG.md)** if they shipped this session. **Add new entries** for anything that surfaced but didn't get built. See §10 for the workflow.

5. **Then commit.** The doc updates can be part of the same commit as the code change they describe — that's preferred over a separate "docs: …" commit, because the change and its rationale travel together.

### 2. Post-Push Slack Notification

After every `git push` to main, send a message to `#bim-designers` (channel ID: `C0ACL0MGBTN`) using the Slack MCP tool. Format:

```
**BIM Viewer — New Push** by <commit author full name>

> <commit subject line>

<one-sentence recap of what changed, written in plain English>

[View commit on GitHub](<repo URL>/commit/<full SHA>) · [View on Vercel](https://bimdesignviewerprototype.vercel.app/)
```

- Get the author and subject from `git log -1 --pretty=format:"%an%n%s%n%b"`
- Get the SHA from `git rev-parse HEAD`
- The repo URL is `https://github.com/taylorklundt/BIM_design_viewer_prototype`
- Write the one-sentence recap yourself from the commit body — do not paste the full body

## Commands
- **Start Server (Chrome UI):** `npm run dev` → opens `http://localhost:3000` (`demo/index.html`)
- **Start Server (legacy dark theme):** `npm run dev:old` → opens `http://localhost:3000/old.html`
- **Run Tests:** `npm test`
- **Smoke Test:** `npm run smoke`
- **Lint:** `npm run lint`
- **Convert IFC → .frag.gz:** `npm run convert <path-to-ifc-file>` → outputs to `public/models/` (alias for `node scripts/ifc-to-frag.mjs`)

## NPM registry (`.npmrc`)

A repo-level `.npmrc` pins this project to the **public npm registry**
(`https://registry.npmjs.org/`). It overrides any global `~/.npmrc` so:

- Future `npm install` runs resolve from public npm even if your machine is
  set up to use a corporate mirror (e.g. Procore Artifactory at
  `artifacts.procoretech.com`).
- `package-lock.json` entries land with `registry.npmjs.org` URLs, which
  means **Vercel deploys work without any auth tokens**.

**Why this matters:** without the file, packages installed through a private
mirror get their mirror URLs baked into `package-lock.json` as `"resolved":
"https://artifacts.procoretech.com/..."`. Vercel's build then hits 401 on
those packages because its build machine has no Artifactory credentials.
This bit the first Realism-mode deploy — see [`REALISM.md`](./REALISM.md)
and the `Repoint package-lock URLs from Procore Artifactory to public npm`
commit for the historical fix.

This project uses only public packages (no `@procore/*` deps), so the public
registry is sufficient. If a private package ever does become a real need,
that's the moment to either drop the `.npmrc` (and configure Vercel with an
Artifactory token via env var) or add a `@procore:registry=...` line
scoped to just the private namespace.

## Architecture & Code Style

### 1. The "God Object" Protection
- **CRITICAL:** Do NOT modify `src/core/ModelViewer.js` unless explicitly asked to "Refactor Core".
- This file is the stability anchor. Never add feature-specific logic (like "Selection" or "FPS") directly into it.
- This rule extends to the chrome layer: `src/chrome/` must never import from or modify files in `src/core/`.

### 2. Feature Isolation (Plugin Pattern)
- All new **3D engine features** must be standalone classes in `src/features/`.
- **Naming:** `[FeatureName].js` (e.g., `ClashDetection.js`).
- **Structure:**
  ```javascript
  export class FeatureName {
    constructor(viewer) { this.viewer = viewer; }
    enable() { /* Add listeners */ }
    disable() { /* Remove listeners */ }
  }
  ```
- This pattern applies to vanilla JS engine features only. UI chrome components follow React patterns in `src/chrome/` (see Section 3).

### 3. UI Chrome Layer (`src/chrome/`) — Plugin Pattern
- `src/chrome/` is the **React/TypeScript/Tailwind** presentation layer — the visual shell (header, toolbars, view cube, minimap, etc.).
- **Every UI component is a standalone feature.** Each toolbar icon, panel, and widget is its own self-contained plugin — same isolation philosophy as the engine features in Section 2, but using React patterns.
- **Structure:**
  ```
  src/chrome/
  ├── features/              ← Each UI feature is a standalone plugin
  │   ├── object-tree/       ← Own component(s), own state, own adapter calls
  │   ├── search-sets/
  │   ├── properties/
  │   ├── sectioning-tool/
  │   ├── measure-tool/
  │   ├── view-cube/
  │   ├── minimap/
  │   ├── header/
  │   └── viewer-adapter/    ← The bridge (not a UI feature)
  ├── shared/                ← Shared primitives only (buttons, icons, layout shell)
  └── assets/
  ```
- **Naming:** `src/chrome/features/[feature-name]/` directory per feature.
- **Rules for each chrome feature:**
  - Must be self-contained: own component(s), own state, own adapter calls.
  - Must **not** import from sibling features. No cross-feature imports.
  - Communicates with the 3D engine only through the ViewerAdapter (see Section 4).
  - Must be independently enable-able/disable-able.
- **Adding a new toolbar button or UI widget = adding a new feature directory.** Never add feature logic into an existing feature or into the layout shell.
- The layout shell (`ChromeLayout`) only composes features — it must not contain feature-specific logic.
- **CRITICAL — Import Boundary:** Chrome features must **never** import directly from `src/core/`, `src/features/`, or `src/services/`. All viewer communication goes through the ViewerAdapter (see Section 4).

### 3a. Form Factor & Variant File Convention

The chrome supports three form factors — **desktop**, **tablet**, **phone** — selected at runtime. The active form factor is held in `src/chrome/features/form-factor/FormFactorContext.tsx` and driven from the URL (`?form=tablet`, `?form=phone`; absent = desktop). Orientation (`portrait` / `landscape`) lives in the same context, driven by `?orient=` and reset to each form factor's default (tablet → landscape, phone → portrait) when the form factor changes. The settings cog in the header is the user-facing toggle.

**Variant files per feature.** Features that visually diverge between form factors use **variant files** inside the feature dir, with a tiny `index.tsx` selector. The desktop file holds the real implementation; tablet/phone files start as stubs that forward to desktop until real designs land:

```
src/chrome/features/header/
├── index.tsx                ← selector: useFormFactor() → picks variant
├── Header.desktop.tsx       ← real implementation
├── Header.tablet.tsx        ← stub or real tablet JSX
├── Header.phone.tsx         ← stub or real phone JSX
├── HeaderButton.tsx         ← shared atoms used by all variants
└── types.ts                 ← shared props + domain types
```

**Rules:**
- A feature only forks into variants when its design actually differs between form factors. Single-variant features stay as `Feature.tsx` until divergence is real — do not preemptively triplicate.
- All consumers import the feature through its `index.tsx`: `import { Header } from '../header'`, never `'../header/Header'` or `'../header/Header.desktop'`.
- Shared state, handlers, and adapter calls go in a sibling `useFeatureName.ts` hook so variants stay JSX-only. Do not duplicate logic across variants.
- Stub variants forward to the desktop variant with a one-line comment indicating they're stubs.
- New form-factor-only features (e.g. `movement-joystick` for phone) live in their own feature dir and return `null` for form factors they don't apply to.

### 3b. Device Frame & Orientation (tablet/phone)

For tablet and phone, `chrome-layout/index.tsx` wraps the variant in `DeviceFrame.tsx` — a centered, bezelled device shell with a rotation button outside the top-right corner. The bezel is **scale-independent** (lives outside the chrome's `transform: scale()`), so it stays visually consistent across orientations and viewport sizes. Inner content scales to fit; only the chrome is shrunk to mimic the device viewport size, while the bezel, notch, home indicator, and rounded corners stay at fixed CSS dimensions.

**Concentric corner rule:** the outer device border-radius is computed as `SCREEN_CORNER_VISUAL[ff] + bezel`. Inner and outer curves stay concentric, and the bezel reads as a uniform ring around the corner — adjust either value freely without re-pairing them.

**Desktop** renders fullscreen, no frame, with `<div className="h-screen w-screen"><ChromeLayoutDesktop /></div>`. The `ChromeLayoutDesktop` root uses `h-full w-full` (not `h-screen w-screen`) so it can be wrapped in a device frame without overflowing.

### 3c. Viewer-Container Remount on Variant Switch

Variant switching unmounts the old chrome-layout subtree and mounts a new one. Because the WebGL canvas is appended to a DOM node owned by that subtree, switching would orphan the canvas in a detached element. To handle this, `ChromeApp.tsx` does not use `useRef<HTMLDivElement>` for the viewer container — it uses a **callback ref backed by state** (`useState<HTMLDivElement | null>`) and a `useEffect` that runs whenever the container DOM node changes:

- First container: create the `ModelViewer` instance.
- Subsequent container changes (variant switch): move `viewer.canvasContainer` to the new node, update `viewer.container` so future cursor/class-list mutations target the right element, and re-add the `model-viewer` class.

This works because all pointer/wheel listeners are attached to `renderer.domElement` (the canvas itself), which lives inside `mv-canvas-container` — so moving that container brings the canvas and all its listeners along. Do not regress this to a plain `useRef`.

### 3d. URL-Param Preservation on Model Switch

The model picker uses native `<a href="?model=…">` navigation (per §3, the comment in `Header.desktop.tsx` explains why this beats JS navigation during web-ifc parse). The href **must** be built with `URLSearchParams` from `window.location.search` so existing params (`?form=`, `?orient=`) survive. Anywhere else the chrome triggers a page navigation, follow the same pattern.

### 4. ViewerAdapter Boundary
- The `ViewerAdapter` interface (`src/chrome/features/viewer-adapter/types.ts`) is the **only** bridge between the React chrome and the 3D engine.
- All button clicks, tool toggles, and view commands in chrome components must route through the adapter — no direct calls to `ModelViewer` or any feature class.
- The adapter interface must remain **engine-agnostic**: no Three.js types, no Procore types, no engine-specific imports in `types.ts`.
- Adapter implementations live in `src/chrome/features/viewer-adapter/`:
  - `mockViewerAdapter.ts` — logs to console (for standalone chrome development)
  - `modelViewerAdapter.ts` — wraps the current Three.js/web-ifc ModelViewer (working)
  - Future: `procoreAdapter.ts` — wraps Procore Viewer
- The adapter is provided to all chrome components via React Context (`ViewerAdapterContext.tsx` + `useViewerAdapter()` hook).
- **Swapping engines = writing a new adapter file.** Chrome components must never change when the engine changes.
- **The sole engine import** lives in `src/chrome/app/ChromeApp.tsx` — this is the only file that imports from `src/index.js`. No other chrome file may import engine code.

### 4a. Chrome Entry Points
- **`demo/index.html`** — the Chrome UI entry point (default). Loads `src/chrome/main.tsx` → `ChromeApp.tsx`.
- **`demo/old.html`** — the legacy dark-theme entry point. Used by existing Playwright tests. **Do not modify.**
- **`demo/test-page.html`** — mock scene test page. Used by regression and selection tests. **Do not modify.**
- `ChromeApp.tsx` creates `ModelViewer` with `showToolbar: false, showStatusBar: false` (Chrome provides its own UI), overrides the dark scene background to light gray, and provides the real adapter via React Context.
- `src/chrome/index.css` contains Tailwind directives and CSS overrides that neutralize `dark-theme.css` styles (transparent background, hidden dark toolbar/status bar, light-themed panels).

### 4b. Model Files (`public/models/`)
- All sample models are stored as **pre-converted `.frag.gz` files** in `public/models/`.
- IFC source files are **not** committed — they exceed GitHub's 100MB per-file hard limit and are listed in `.gitignore` as `*.ifc`.
- `.frag.gz` = binary fragment data produced by `@thatopen/components` `IfcLoader` + `FragmentsManager.export()`, then gzip-compressed. Resulting files range from ~4 MB to ~80 MB, well within git limits (e.g., 278 MB IFC → 31 MB `.frag.gz`).
- Vite (dev) and standard web servers (prod) serve `.gz` files with `Content-Encoding: gzip` automatically — the browser decompresses transparently. `IFCLoader.js` receives the raw `.frag` bytes.
- **To add a new model:**
  1. Drop the `.ifc` into `public/models/`
  2. Run: `npm run convert public/models/MyModel.ifc`
  3. Delete the `.ifc`; commit only the `.frag.gz`
  4. Add an entry to the `MODELS` array in `src/chrome/app/ChromeApp.tsx`
- **File naming:** lowercase kebab-case (e.g., `data-center.frag.gz`). Spaces break Vite's gzip middleware URL resolution.
- **Format compatibility:** Must use `IfcLoader` + `FragmentsManager.export()` for conversion — not `IfcImporter`. These two use different internal serialization formats; only the Serializer format is readable by `FragmentsManager.load()`.
- **Download progress:** `.frag.gz` files are served with `Content-Encoding: gzip`; the browser decompresses transparently, so `Content-Length` (compressed size) does not match received byte count. `IFCLoader` forces `total = 0` for fragment downloads, showing an indeterminate bar during download. The reveal phase (80–100%) provides accurate per-mesh progress for both IFC and `.frag.gz`.
- **Model disposal bug:** `@thatopen/fragments` `Fragment.dispose()` iterates `mesh.material` assuming it is always an array — it is not. `IFCLoader.unloadModel()` normalizes all materials to arrays before calling `fragmentsManager.disposeGroup(model)`, with a manual Three.js cleanup fallback if that still throws. **Never call `fragmentsManager.dispose()` directly** — it destroys the global `FragmentsManager` and breaks all subsequent loads.
- **Model switching:** `ChromeApp.handleSelectModel` does an in-place switch — calls `viewer.clearAllModels()`, resets streaming state, then loads the new model. No page reload needed.

### 4c. Navigation System (`src/features/Navigation.js`)

The navigation system has three modes with distinct behaviors:

| Mode | Engine call | Left-drag | Right-drag |
|---|---|---|---|
| Default (look-around) | `navigation.setMode('look')` | Look around (camera fixed) | Temporary orbit |
| Orbit | `navigation.setMode('orbit')` | Orbit around target | Temporary look-around |
| Fly | `navigation.setMode('fly')` | Look around | Temporary orbit |

**Keyboard movement** (WASD + Q/E) is active in **all modes simultaneously**. Movement is always camera-relative — forward follows the camera's look direction, not the world XZ plane.

| Key | Action |
|---|---|
| W / ↑ | Forward |
| S / ↓ | Backward |
| A / ← | Strafe left |
| D / → | Strafe right |
| E | Up |
| Q | Down |

**Right-click temporary mode switching** is handled entirely within `Navigation.js` via a `pointerdown` capture listener. Navigation only activates after the pointer moves **more than 4 px** while the right button is held — a clean right-click (no movement) lets the browser show the context menu normally. The Chrome layer does not need to manage any of this — it happens transparently to the adapter.

**Scroll wheel** zooms toward the 3D point under the cursor (raycasted). Acceleration formula: `Math.pow(|deltaY| / 100, 1.5)`. The step is bounded by `Math.min(baseStep * speed, Math.max(dist * 0.9, MIN_STEP))` where `MIN_STEP = 0.5` — the overshoot cap can never go below 0.5 units, so the camera always punches through walls at close range instead of asymptotically approaching them. Zoom-out uses the same MIN_STEP floor. When the cursor points at empty space, `_getRaycastTarget` returns a point along the ray at `_lastRaycastDist` (the distance of the most recent successful hit, clamped to 2–150 units), so the fallback stays proportional to nearby geometry.

**Cursor feedback** is communicated via engine events:
- `navigation.emit('right-drag-orbit-start')` → `modelViewerAdapter.ts` sets orbit SVG cursor
- `navigation.emit('right-drag-orbit-end')` → adapter clears custom cursor

**Suspending navigation for external drags** (e.g. section-plane creation):
Call `navigation.setControlsEnabled(false)` to freeze all camera input. This is wired in `ModelViewer.js` via `sectioning.on('drag-start', ...)` / `sectioning.on('drag-end', ...)`. The method:
1. Sets `_externalDragActive = true` — guards `onLookMouseDown` and `onFlyMouseDown` so they ignore the next `mousedown`
2. Cancels any in-progress look/fly drag (`isLookDragging = false`, `isFlyDragging = false`)
3. Snapshots `controls.enabled` into `_controlsEnabledBeforeDrag` and sets `controls.enabled = false`
On `setControlsEnabled(true)`, the snapshot is **restored** (not force-set to `true`). This is critical: in look mode `enableLook()` keeps `controls.enabled = false`; force-setting `true` would re-enable OrbitControls and cause jank orbit on the next left-drag.

**Critical implementation gotchas** (do not break these):
- **Use `pointerdown` (not `mousedown`) for capture.** Three.js r175 OrbitControls listens on `pointerdown`. A `mousedown` capture listener will not intercept it.
- **After `preventDefault()` on `pointerdown`, never listen for `mouseup`.** It won't fire. Always use `pointerup` for the corresponding release.
- **Never call `controls.update()` while right-drag is active in orbit mode.** It will overwrite any direct camera rotation. Guard the update call: `if (!this._rightDragging) this.controls.update()`.
- **Always call `camera.updateMatrixWorld()` before projecting 3D points to screen.** Do this in the animate loop, not in event handlers, to avoid stale matrix bugs.
- **Force `THREE.DoubleSide` on finalized BIM materials.** Some `@thatopen/fragments` materials default to `FrontSide`; back-face culling makes interior surfaces invisible when the camera navigates inside, so the model "disappears." `IFCLoader.finalizeMeshAfterReveal` explicitly sets `material.side = THREE.DoubleSide` for every material.
- **Floor the scroll overshoot cap at `MIN_STEP = 0.5` in `onLookWheel` / `onOrbitWheel`.** The raw `dist * 0.9` cap is correct for distant approaches but creates an asymptotic-approach freeze near surfaces — the camera gets infinitely closer to a wall but never passes through. The MIN_STEP floor lets each scroll move at least 0.5 units, which is enough to punch through any architectural-detail surface.
- **Guard scroll handlers against `dist < 1e-4` / non-finite `dist`.** `toPoint.divideScalar(0)` produces a NaN unit vector that permanently corrupts `camera.position`, requiring a home-reset to recover. Return early before the divide if `!isFinite(dist) || dist < 1e-4`.
- **Do not modify `src/core/ModelViewer.js`** to accommodate navigation changes — all logic stays in `Navigation.js`.

### 4d. Realism Render Mode (`src/features/RealismRenderer.js`)

The bottom-toolbar **Default ↔ Realism** picker switches between the plain
`WebGLRenderer` and a post-processed render chain (N8AO + edge detection +
gamma + cast shadows) from `@thatopen/components-front`. The same canvas
serves both modes — no canvas swap, no listener rebinding.

**Full engineering notes** (architecture, package-internal bugs we work around,
things we tried and dropped, future tuning knobs): see [`REALISM.md`](./REALISM.md).

The short version:

- We use the inner `Postproduction` class, **not** the `PostproductionRenderer`
  wrapper. The wrapper brings its own canvas; the inner class wraps our existing
  `WebGLRenderer`.
- `@thatopen/components-front@2.4.12` has multiple footguns (iteration bug in
  `updatePasses`, getters that throw before `initialize`, `setSize` corrupts
  the pass list, the internal `EffectComposer` doesn't inherit the renderer's
  `pixelRatio` so its render targets default to CSS dimensions and produce a
  blurry retina render unless we sync it ourselves). The workarounds in
  `RealismRenderer.js` look odd in isolation — read `REALISM.md` before
  refactoring.
- Realism enables `renderer.shadowMap.enabled = true` and restores on disable.
  The directional light + shadow map are already set up in `SceneManager.js`.
  Mesh `castShadow`/`receiveShadow` flags are set in `IFCLoader.finalizeMeshAfterReveal`.

### 4e. Viewpoint Persistence (`public/viewpoints.json` + `scripts/vite-plugin-viewpoints-writer.mjs`)

The chrome's "Home View" — and, later, the Viewpoints panel's custom views —
persist to a JSON file committed to the repo. The file is the single source
of truth; localStorage is **not** used.

**Storage shape** (`public/viewpoints.json`, `schemaVersion: 3`):

```jsonc
{
  "schemaVersion": 3,
  "models": {
    "condos": {
      "homeView": { /* Viewpoint */ } | null,
      "customViews": [ /* Viewpoint, ... */ ]   // reserved for the Viewpoints panel
    },
    ...
  }
}
```

Each `Viewpoint` captures the camera (`cameraPosition`, `cameraTarget`,
`isOrthographic`), the hidden-objects list (`hiddenObjects: string[]`),
sectioning state (`sectioning: SectioningSnapshot | null` — planes + box),
and `markups: MarkupData[]` (currently always `[]`; the Viewpoints panel
will populate). Types live in
`src/chrome/features/viewpoints/types.ts`.

**Reading** — the chrome fetches `/viewpoints.json` with `cache: 'no-cache'`
once on app boot via the module-level promise-cached `viewpointStore`
(`src/chrome/features/viewpoints/viewpointStore.ts`). Every consumer
(`viewpoints.getHomeView()`, the load-complete handler in `ChromeApp.tsx`,
the bottom-toolbar Home button) reads from this cache. Schema v2 entries
are migrated to v3 on read.

**Writing** — `scripts/vite-plugin-viewpoints-writer.mjs` registers a
`POST /__viewpoints/home` middleware on the Vite dev server. The Settings
panel's "Update Home View" button calls this endpoint, the plugin merges
the new viewpoint into the file on disk, and the in-memory cache is
updated. **Active only under `npm run dev`** (`apply: 'serve'`).

**On a Vercel build, the endpoint does not exist.** Saves return 404; the
chrome shows an error toast ("Saving a home view is only available when
running locally"). This is intentional — saves require an authenticated
write back to the GitHub repo, which we don't want to wire up for a
prototype. To update a saved home from prod: run the dev server locally,
save, commit the resulting `public/viewpoints.json` change, push.

**Apply order on home restore** (camera + visibility + sectioning):

1. **Seed time** (before model load, in `ChromeApp.tsx`'s viewer-ready
   handler): apply `camera + isOrthographic` and `sectioning`. Clip planes
   are global to the renderer, so they clip every mesh as it streams in.
2. **Load-complete**: apply `visibility` (hide list) — `getMeshByElementId`
   only resolves once meshes have loaded. Camera is re-applied here too
   **unless** the user has moved during the load (tracked via a
   `camera-change` listener attached after seeding). Same for the
   model-switch path in `handleSelectModel`.

If the user navigated during the model load, the load-complete handler
respects their position and does not snap back. Sectioning + visibility
still apply (they're part of the view's *configuration*, not navigation
state).

Hidden objects briefly flash visible during stream-in before being
hidden — see [`BACKLOG.md`](./BACKLOG.md) for the planned per-batch
queue-and-apply fix that would mirror what sectioning already does.

**Engine-side helpers used by the apply path:**

- `Navigation.getEffectiveCamera()` — like `getCamera()` but derives the
  target from `camera.getWorldDirection()` × current orbit distance instead
  of `controls.target`. Used as the **start** state of any animated camera
  restore, and also as the **capture** state when saving a viewpoint
  (`getViewpointState()` / `getCameraSnapshot()` in `modelViewerAdapter.ts`
  both call `getEffectiveCamera()` rather than `getCamera()`). In look/fly
  mode `controls.target` is a stale orbit pivot that can differ from the
  real look direction — saving it and then restoring with `setCamera` +
  `controls.update()` produces a different angle than the original view.
  Using `getEffectiveCamera()` for both capture and animation-start makes
  save → navigate → home a perfect round-trip regardless of navigation mode.
- `Sectioning.serializeState()` / `restoreState(snapshot)` — capture and
  re-apply the clip planes + box state. Plane IDs are not preserved across
  restore (planes are recreated); anything pinned to plane IDs externally
  would need to be re-pinned.

**Adapter methods** (engine-agnostic, no Three.js types):

- `getCameraSnapshot()` / `setCameraSnapshot(snapshot, { animate, durationMs })`
  — camera + projection only. Animation uses an ease-in-out-sine curve over
  550ms by default.
- `getViewpointState()` / `setViewpointState(state, { animate })` —
  bundled snapshot (camera + hidden objects + sectioning). The apply order
  is sectioning → visibility → camera.

### 4f. FloatingWindow vs Panels vs Dropdowns

Four floating-UI patterns coexist in the chrome. Pick the right one when
building a new piece:

| Pattern | Where | Use when |
|---|---|---|
| **Dropdown / popover** | Header menus, header buttons | Small menu anchored to a button, auto-dismiss on outside click |
| **DockedPanel** | `dock-manager/DockedPanel.tsx` | Persistent feature panel that lives in the layout (Views, Properties, etc.). Can be undocked into a floating in-page panel. |
| **DetachedPanel** | `dock-manager/DetachedPanelPortal.tsx` + `usePopupWindow.ts` | Open a panel in a **real OS popup window** via `window.open()`. Heavy — separate browser window, separate event loop. |
| **FloatingWindow** | `src/chrome/features/floating-window/` | Free-floating in-page dialog with title bar + close X + drag. No auto-dismiss. Non-modal. Centered on first open unless `initialPosition` given. |

The FloatingWindow is the right home for things that aren't dock content
but need to stay open while the user works (the Settings window is the
current example). Multiple may be open; z-index handles stacking.
Escape key closes the focused window.

When opening a FloatingWindow that should anchor near a specific UI
element (e.g. Settings anchors to the right toolbar), compute the
`initialPosition` from that element's bounding rect in the consumer
component, not inside FloatingWindow itself. The right toolbar carries
`id="right-toolbar"` for this purpose.

### 4g. Toast Notifications (`src/chrome/features/toast/`)

Reusable toast surface for transient, non-modal feedback. Variants:
`success`, `error`, `info`, `warning`. Position: bottom-center, 48px from
the viewport bottom, above the bottom toolbar, below modals (`z-40`).
Multiple toasts stack.

**Visual design** — Procore-style solid-color backgrounds (no tinted bg +
border). White icon, white text, white close button. `#26732D` for success,
`#D92626` for error. Warning/info use placeholder amber/blue until fully
designed. 550px wide, 56px tall, `rounded-xl`, drop shadow. Max 65
characters per message (soft limit — enforced by design, not code).

**Auto-dismiss timer** — Each `Toast` component owns its own timer. Default
duration is calculated from word count: `3000ms + (wordCount × 500ms)`,
minimum 3.5s. Pass `duration: 0` for a sticky toast. Timer pauses on hover
and keyboard focus, resumes with remaining time on leave/blur.

**Animations** — Enters at 100ms ease-out (fade in + slide up 16px).
Exits at 150ms ease-in (fade out + slide back down). Exit is triggered by
`dismiss(id)` which sets `dismissing: true` on the toast; the `Toast`
component detects this, runs the CSS transition, then calls `onRemove` via
`onTransitionEnd` to remove it from state. Do not remove toasts directly
from state — the two-phase dismiss keeps the animation clean.

**Optional action** — Pass `action: { label, onClick }` to replace the X
button with underlined action text on the right (e.g. "Undo").

```tsx
const toast = useToast();
toast.show({ kind: 'success', message: 'Home view saved.' });
toast.show({ kind: 'error', message: 'Save failed. Try again.' });
toast.show({ kind: 'success', message: 'Item deleted.', action: { label: 'Undo', onClick: handleUndo } });
toast.show({ kind: 'info', message: 'Syncing…', duration: 0 }); // sticky
```

The provider lives in `ChromeApp.tsx` so any feature can call `useToast()`.
New toast triggers must always go through this surface — don't roll your own.

**Custom icons** — `success` and `error` use SVG files from
`src/chrome/assets/icons/toast/`. The X close button reuses
`src/chrome/assets/icons/header/close.svg` filtered white via
`brightness-0 invert`.

### 4h. Z-Fighting Mitigation (`IFCLoader.finalizeMeshAfterReveal`)

IFC models routinely contain coplanar geometry (slab + topping + finish at
the same Y; stud + sheathing + finish in the same vertical plane). Without
intervention this produces visible jagged crosshatch z-fighting on flat
surfaces in Default render mode.

The mitigation lives in `finalizeMeshAfterReveal`:

- **Opaque meshes** get a `polygonOffset` whose `polygonOffsetUnits` comes
  from a stable hash on `mesh.id` into one of `POLY_OFFSET_BUCKETS = 4096`
  buckets at `step ≈ 0.0623`. This breaks ties between coplanar surfaces.
- **Transparent meshes** (window glass) have `polygonOffset = false` and
  rely on Three's normal transparent render-pass depth sort. Applying a
  large offset here breaks window rendering (black/missing panes).

**Things to know before changing this code:**

- **Do not put back `(revealIndex % 7)` or any low-bucket scheme.** With
  ~2,500 meshes per model, low bucket counts guarantee coplanar collisions.
- **Do not apply polygonOffset to transparent materials.** Windows will
  render black, render in front of the wall, or disappear entirely.
- **`mesh.id` must be stable across reloads** for the hash buckets to be
  stable. `@thatopen/fragments` is currently deterministic; if the loader
  is ever swapped, verify session-to-session consistency.

**Full engineering notes** (history of the investigation, ruled-out
hypotheses, residual limitations, tier-1 / tier-2 follow-ups if we ever
want to fully eliminate the residual speckle): see
[`Z_FIGHTING.md`](./Z_FIGHTING.md).

### 5. Sync Source (`model-chrome/`)
- `model-chrome/` is a **read-only reference copy** of the external ModelChrome repository maintained by colleagues.
- It is periodically updated by pulling from their repo.
- **Do not edit files in `model-chrome/` directly.** All edits go in `src/chrome/`.
- When `model-chrome/` is updated, diff against `src/chrome/` and merge relevant changes into `src/chrome/`.
- Once colleagues move to this repo, they will contribute directly to `src/chrome/` via their own branches. At that point, `model-chrome/` can be removed.
- **⚠️ Check for `@procore/*` imports before merging any synced file.** The colleague repo uses Procore-internal packages (`@procore/core-icons`, etc.) that are not installed here. Replace any such imports with the `lucide-react` equivalent before committing. All standard UI icons (`ChevronDown`, `ChevronRight`, `Folder`, `Check`, etc.) are available in `lucide-react` under the same names.

### 6. Testing
- **Full test plan:** See [`TEST_PLAN.md`](./TEST_PLAN.md) for test infrastructure, suites, helpers, and guidelines.
- **Run all tests:** `npm test`
- **Run regression only:** `npx playwright test evals/tests/regression.spec.js`
- **Run IFC loading only:** `npx playwright test evals/tests/ifc-loading.spec.js`
- Every new **engine feature** must have a corresponding test file in `evals/tests/`.
- Every new **chrome component** must have a corresponding test. Chrome tests live in `src/chrome/__tests__/`.
- **Test fixture for the load pipeline:** `public/models/test-fixture.frag.gz` is a synthetic 1-cube model (~600 bytes, loads in ~100ms) generated from `evals/fixtures/test-fixture.ifc`. It is NOT in the chrome model picker — it only exists at this URL for tests. Use it for any new test that needs to exercise `viewer.loadModel(...)` end-to-end without paying the multi-minute cost of a real IFC. To regenerate after a fragments format change: `npm run convert evals/fixtures/test-fixture.ifc`. Both source `.ifc` and output `.frag.gz` are committed (the `.ifc` via a `.gitignore` exception).

### 7. Adding New Features
- **IMPORTANT:** When a user asks to add a new feature, **do not start coding immediately**.
- First, use the questionnaire in [`FEATURE_INTAKE.md`](./FEATURE_INTAKE.md) to gather requirements.
- The questionnaire uses simple, non-technical language that PMs and designers can answer.
- Once the questionnaire is complete, translate the answers into the correct technical implementation following the patterns in this file.
- This ensures all features follow the plugin architecture and have proper test coverage.

### 8. Merge-to-Main Test Gate

Tests run **when merging to main**, not on every push to a feature branch.

See **[`MERGETOMAIN.md`](./MERGETOMAIN.md)** for:
- The feature → test suite mapping table
- Agent instructions (run targeted tests before `gh pr merge`)
- Human instructions (run tests manually before merging)

### 9. Backlog Workflow (`BACKLOG.md`)

Future work that's been discussed but not yet implemented lives in
[`BACKLOG.md`](./BACKLOG.md) at the repo root. The point is to capture the
*why* and at least one viable approach so future-you (or a colleague)
doesn't have to re-investigate the problem from scratch.

**At the end of a project session:**

1. **Check off finished items.** If a session touched something that
   existed as a backlog entry, remove the entry (the code change *is* the
   record). Don't leave stale "✓ done" entries — the file's job is to
   list things still to do.
2. **Add anything left undone.** If a discussion turned up a real issue
   or improvement that wasn't in scope, write a backlog entry before
   wrapping up. Include:
   - **Why** — what problem this fixes / what behavior is wrong now.
   - **At least one approach** — enough that a future agent can act on
     it without re-investigating.
   - **Touchpoints** — file paths likely to change.
3. **Note alternatives where they exist.** If you considered multiple
   approaches and picked one, list the others too. The next person may
   have different constraints.

**Don't** put session-scoped task lists in `BACKLOG.md` — those live in
the agent's task system. The backlog is for things that survive across
sessions.
