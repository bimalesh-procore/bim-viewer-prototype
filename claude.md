# CLAUDE.md

## Commands
- **Start Server (Chrome UI):** `npm run dev` → opens `http://localhost:3000` (`demo/index.html`)
- **Start Server (legacy dark theme):** `npm run dev:old` → opens `http://localhost:3000/old.html`
- **Run Tests:** `npm test`
- **Smoke Test:** `npm run smoke`
- **Lint:** `npm run lint`
- **Convert IFC → .frag.gz:** `npm run convert <path-to-ifc-file>` → outputs to `public/models/` (alias for `node scripts/ifc-to-frag.mjs`)

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
| E / Space | Up |
| Q / Shift | Down |
| Escape | Return to Default mode |

**Right-click temporary mode switching** is handled entirely within `Navigation.js` via a `pointerdown` capture listener. Navigation only activates after the pointer moves **more than 4 px** while the right button is held — a clean right-click (no movement) lets the browser show the context menu normally. The Chrome layer does not need to manage any of this — it happens transparently to the adapter.

**Scroll wheel** zooms toward the 3D point under the cursor (raycasted). Acceleration formula: `Math.pow(|deltaY| / 100, 1.5)`.

**Cursor feedback** is communicated via engine events:
- `navigation.emit('right-drag-orbit-start')` → `modelViewerAdapter.ts` sets orbit SVG cursor
- `navigation.emit('right-drag-orbit-end')` → adapter clears custom cursor

**Critical implementation gotchas** (do not break these):
- **Use `pointerdown` (not `mousedown`) for capture.** Three.js r175 OrbitControls listens on `pointerdown`. A `mousedown` capture listener will not intercept it.
- **After `preventDefault()` on `pointerdown`, never listen for `mouseup`.** It won't fire. Always use `pointerup` for the corresponding release.
- **Never call `controls.update()` while right-drag is active in orbit mode.** It will overwrite any direct camera rotation. Guard the update call: `if (!this._rightDragging) this.controls.update()`.
- **Always call `camera.updateMatrixWorld()` before projecting 3D points to screen.** Do this in the animate loop, not in event handlers, to avoid stale matrix bugs.
- **Do not modify `src/core/ModelViewer.js`** to accommodate navigation changes — all logic stays in `Navigation.js`.

### 5. Sync Source (`model-chrome/`)
- `model-chrome/` is a **read-only reference copy** of the external ModelChrome repository maintained by colleagues.
- It is periodically updated by pulling from their repo.
- **Do not edit files in `model-chrome/` directly.** All edits go in `src/chrome/`.
- When `model-chrome/` is updated, diff against `src/chrome/` and merge relevant changes into `src/chrome/`.
- Once colleagues move to this repo, they will contribute directly to `src/chrome/` via their own branches. At that point, `model-chrome/` can be removed.
- **⚠️ Check for `@procore/*` imports before merging any synced file.** The colleague repo uses Procore-internal packages (`@procore/core-icons`, etc.) that are not installed here. Replace any such imports with the `lucide-react` equivalent before committing. All standard UI icons (`ChevronDown`, `ChevronRight`, `Folder`, `Check`, etc.) are available in `lucide-react` under the same names.

### 6. Testing
- **Full test plan:** See [`test_plan.md`](./test_plan.md) for test infrastructure, suites, helpers, and guidelines.
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

See **[`mergetomain.md`](./mergetomain.md)** for:
- The feature → test suite mapping table
- Agent instructions (run targeted tests before `gh pr merge`)
- Human instructions (run tests manually before merging)
