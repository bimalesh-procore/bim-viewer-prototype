# CLAUDE.md

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
  the pass list). The workarounds in `RealismRenderer.js` look odd in isolation
  — read `REALISM.md` before refactoring.
- Realism enables `renderer.shadowMap.enabled = true` and restores on disable.
  The directional light + shadow map are already set up in `SceneManager.js`.
  Mesh `castShadow`/`receiveShadow` flags are set in `IFCLoader.finalizeMeshAfterReveal`.

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
