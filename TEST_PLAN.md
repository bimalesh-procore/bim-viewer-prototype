# Test Plan

## Overview

All tests are end-to-end Playwright tests that run against the live Vite dev server in a headless Chromium browser. Tests are located in `evals/tests/` and configured via `playwright.config.js`.

## Running Tests

| Command | Purpose |
|---|---|
| `npm test` | Run **all** test suites (runs in parallel across 4 workers locally, 2 in CI) |
| `npx playwright test evals/tests/regression.spec.js` | Regression suite only (81 tests, ~1.6 min) |
| `npx playwright test evals/tests/ifc-loading.spec.js` | IFC model loading suite only (9 tests, ~16 sec) |
| `npx playwright test evals/tests/selection.spec.js` | Selection suite only |
| `npx playwright test -g "test name"` | Run a single test by name |
| `npx playwright test evals/tests/left-sidebar.spec.js` | Left sidebar suite only |
| `npx playwright test evals/tests/search-sets.spec.js` | Search sets suite only |
| `npx playwright test evals/tests/chrome-compatibility.spec.js` | Chrome UI compatibility suite |
| `npm run test:ui` | Open the interactive Playwright UI |
| `npm run test:report` | View the last HTML report |

## Test Infrastructure

### Playwright Configuration (`playwright.config.js`)

- **Test directory:** `./evals/tests`
- **Timeout:** 30 seconds per test. (Was 180s when IFC tests loaded the real Condos model — see §2 for why that's now ~100ms via a synthetic fixture.)
- **Parallelism:** 4 workers locally, 2 in CI, with `fullyParallel: true`. Tests across files run concurrently. Safe because the synthetic test fixture's ~100ms load doesn't starve parallel workers the way a real-model load did.
- **Browser:** Chromium (headless)
- **Web server:** Vite dev server auto-started on port 3001 (`npm run dev -- --port 3001`)
- **Reporters:** HTML (`evals/report/`), JSON (`evals/results.json`), list (console)
- **Artifacts:** Screenshots on failure, video retained on failure

### Test Pages

| Page | URL | Purpose |
|---|---|---|
| `demo/test-page.html` | `/test-page.html` | Mock scene with 5 colored boxes. Used by regression and selection tests for fast, deterministic assertions without loading real IFC files. |
| `demo/index.html` | `/` | Chrome UI entry point (React/Tailwind light theme). Form factor selectable via `?form=tablet` / `?form=phone` and orientation via `?orient=portrait` / `?orient=landscape`. Used for Chrome UI development and manual testing. Not used by automated Playwright tests yet. |
| `demo/old.html` | `/old.html` | Legacy dark-theme entry point with IFC loading. Used by `ifc-loading.spec.js` and `regression.spec.js`. **Do not modify** — Playwright tests depend on this exact page. |

### Shared Helpers (`evals/tests/test-helpers.js`)

| Helper | Description |
|---|---|
| `setupViewer(page)` | Navigates to `/test-page.html`, waits for `window.viewer` and `window.__sceneReady`. |
| `setupViewerWithModel(page)` | Navigates to demo, clicks sample model button, waits for `load-complete` event. |
| `getCanvas(page)` | Returns Playwright locator for the viewer canvas. |
| `clickCanvasCenter(page, opts)` | Clicks center of canvas. Supports `ctrl`, `button: 'right'`, `dblclick`. |
| `clickCanvas(page, offsetX, offsetY, opts)` | Clicks at offset from canvas center. |
| `clickEmptySpace(page, opts)` | Clicks near the top-left corner (sky area). |
| `hoverCanvasCenter(page)` | Moves mouse to canvas center. |
| `captureEvents(page, eventNames)` | Starts capturing viewer events; returns a getter function. |
| `getSelection(page)` | Returns current selection array from the viewer. |
| `deselectAll(page)` | Clears the viewer selection. |
| `setHoverEnabled(page, enabled)` | Toggles hover highlighting. |

## Test Suites

### 1. Regression Suite (`regression.spec.js`) — 81 tests

Comprehensive regression coverage across all features. Uses the mock scene (`test-page.html`) for speed and determinism.

#### Test ID Convention: `REG-{CATEGORY}-{NNN}`

| Category | ID Prefix | Tests | What It Covers |
|---|---|---|---|
| Viewer Initialization | `REG-INIT` | 5 | DOM structure, subsystem references, mock meshes, canvas dimensions, grid helper |
| Navigation | `REG-NAV` | 13 | Orbit/pan modes, zoom, camera get/set, controls enable/disable, walk speed, zoomToFit/zoomToSelection. **Note:** WASD/QE camera-relative movement, right-click temporary mode switching, scroll zoom-to-cursor, and origin dots are not yet covered by automated tests — see Known Issues in `CONTEXT.md`. |
| Visibility | `REG-VIS` | 14 | hide/show/toggle single and multiple, hideAll/showAll, isolate, opacity, hideByType/showByType, destroy cleanup |
| Object Tree | `REG-TREE` | 9 | buildTree, expand/collapse, toggleNode, selectNode, selectNodesByElementIds, filterTree, destroy, icon/type formatting |
| Sectioning | `REG-SEC` | 9 | addClipPlane, removeClipPlane, clearClipPlanes, movePlane, flipPlane, setPlaneEnabled, setPlaneVisible, state round-trip, destroy |
| State Persistence | `REG-STATE` | 6 | getState structure, camera capture, nav mode capture, hidden elements capture, selection capture, setState restore |
| View Reset | `REG-RESET` | 4 | Deselects all, shows hidden elements, clears section planes, resets nav mode |
| Keyboard Shortcuts | `REG-KEY` | 5 | R (reset), O (orbit), P (pan), H (hide selected), I (isolate selected) |
| Scene Manager | `REG-SCENE` | 7 | getScene, getCamera, getRenderer, getDomElement, showGrid toggle, add/remove objects, resize |
| Integration & Edge Cases | `REG-INT` | 8 | Cross-feature workflows, rapid toggles, destroy cleanup, status bar, event emission |

### 2. IFC Model Loading Suite (`ifc-loading.spec.js`) — 9 tests

Tests the full IFC loading pipeline against a **synthetic 1-cube test fixture** (~600 bytes, loads in ~100ms). Uses the test page (`/test-page.html`), not the chrome UI, because ChromeApp auto-loads a default model on mount which races with the test's listener setup.

The fixture (`public/models/test-fixture.frag.gz`) is generated once from `evals/fixtures/test-fixture.ifc` via the standard converter (`npm run convert evals/fixtures/test-fixture.ifc`). Both the source `.ifc` and the output `.frag.gz` are committed. The fixture is **not** listed in the chrome's model picker — it only exists at this URL for tests. Whole suite runs in **~16 seconds** instead of the ~15 minutes a real-model load would take.

| Test | What It Verifies |
|---|---|
| WASM files are accessible | `/web-ifc.wasm` returns HTTP 200 |
| IFC loader initializes without errors | `ifcLoader`, `components`, and inner `IfcLoader` are all instantiated |
| WASM settings are correctly configured | `wasm.path` is `'/'`, `wasm.absolute` is `true`, `autoSetWasm` is `false` |
| Sample IFC model file is accessible | `/models/test-fixture.frag.gz` returns HTTP 200 |
| Sample IFC model loads successfully via API | `load-start` and `load-complete` events fire, no `load-error`, model count > 0 |
| Model adds meshes to the scene | Scene contains mesh objects after loading |
| No console errors during loading | No critical `console.error` or uncaught page errors |
| loadModel API works programmatically | `viewer.loadModel(...)` resolves with a model ID |
| Object streaming lifecycle events are emitted | `stream-capability`, `object-load-progress` (with numeric `parserProgress`), and `object-load-complete` events fire during load |

**On not having a real-world load test.** This suite exercises the loading *pipeline* — events, error paths, WASM wiring, mesh creation. It does NOT cover regressions that only manifest at thousands-of-meshes scale (e.g. the documented `Fragment.dispose()` materials bug in CLAUDE.md §4b). Such bugs would only get caught by manual verification with a real model. If we ever take a regression of that kind, the fix is to add **one** opt-in real-model smoke test gated behind an env flag (e.g. `RUN_BIG_LOAD=1`) so CI doesn't pay the cost on every run.

### 3. Selection Suite (`selection.spec.js`) — 23 tests

Tests click-based element selection, multi-select (Ctrl+click), deselection, hover highlighting, and context menu interactions.

### 4. Left Sidebar Suite (`left-sidebar.spec.js`) — 11 tests

Tests the **legacy dark-theme** vertical toolbar (`demo/test-page.html`, `.mv-left-sidebar`) — not the React chrome's `src/chrome/features/left-toolbar/`. This suite exists to verify the engine-layer sidebar that powers `demo/old.html`. Chrome left-toolbar tests belong in `src/chrome/__tests__/`.

| Test | What It Verifies |
|---|---|
| SIDEBAR-001 to SIDEBAR-004 | Sidebar renders with 7 buttons, correct positioning, titles, and data-panel attributes |
| SIDEBAR-005 to SIDEBAR-007 | Active state management: single active, toggle on/off |
| SIDEBAR-008 | Object Tree button toggles tree panel open/close |
| SIDEBAR-009 | Stub buttons (Views & Markups, All Items, Properties, Object Groups, Deviation) do not crash |
| SIDEBAR-010 | Each button contains an SVG icon |
| SIDEBAR-011 | Container receives `.mv-has-left-sidebar` class |

### 5. Search Sets Suite (`search-sets.spec.js`) — 28 tests

End-to-end tests for search set management via the UI panel. All execution is triggered by clicking list items, not by calling APIs directly.

| Category | Tests | What It Covers |
|---|---|---|
| Panel open/close | SS-UI-001 to SS-UI-004 | Open via sidebar button, close, toggle, mutual exclusion with Object Tree |
| Execution | SS-UI-005 to SS-UI-011 | Click to execute (AND, OR, nested), result count flash, clear previous selection, re-run |
| Inline rename | SS-UI-012 to SS-UI-015 | Edit icon → input, Enter to save, Escape to cancel, renamed set still executes |
| Delete | SS-UI-016 to SS-UI-018 | Delete with confirm, cancel preserves, empty state after deleting all |
| Metadata | SS-UI-019 to SS-UI-021 | Name, condition count, scope, date display, action button hover transition |
| Cross-feature | SS-UI-022 to SS-UI-027 | Status bar count, no-match query, excluding mode, property-set query, nested groups, currentSelection scope |
| Cleanup | SS-UI-028 | Panel destroy removes from DOM |

### 6. Chrome Compatibility Suite (`chrome-compatibility.spec.js`) — 43 tests

Tests the current 3D engine against every capability that the Chrome UI requires via the ViewerAdapter interface. Used to track readiness for Chrome UI integration.

| Category | Tests | What It Covers |
|---|---|---|
| Required adapter methods | CHROME-REQ-001 to 005 | zoomIn, zoomOut, fitToView, resetView, setViewOrientation |
| Optional adapter methods | CHROME-OPT-001 to 007 | toggleModelBrowser, togglePropertiesPanel, toggleMeasureTool, toggleSectionTool, toggleIsolationMode, undo, redo |
| Left toolbar features | CHROME-LT-001 to 006 | Object Tree, Search Sets, Views & Markups, All Items, Properties, Deviation |
| Right toolbar features | CHROME-RT-001 to 008 | Orthographic, Render Modes, X-Ray, Markup, Measure, Quick Create, Sectioning, Reset |
| Unique components | CHROME-UC-001 to 005 | ViewCube camera API, preset orientations, MiniMap bounds, NavigationWheel modes, Header search |
| UI replacement tracking | CHROME-RPL-001 to 007 | Confirms current UI elements that Chrome will replace |
| New UI tracking | CHROME-NEW-001 to 005 | Confirms that chrome-specific UI elements (Header, Right Toolbar, ViewCube, MiniMap, NavigationWheel) are absent from the legacy engine layer (`demo/old.html`). These elements all exist in the React chrome layer — the tests verify the engine itself does not ship them. NavigationWheel was replaced by the bottom-toolbar nav-mode picker. |

**Note:** Some tests are expected to fail — they document missing features (undo/redo, measure, markup, etc.). As features are implemented, these tests should turn green.

### 7. Chrome Items Panel Suite (`chrome-items-panel.spec.js`) — 18 tests

End-to-end tests for the Related Items (Items) panel hub navigation, Assets sub-view, and back-arrow behaviour across docked and floating panel states.

| Category | Tests | What It Covers |
|---|---|---|
| Open / close | ITEMS-001 to 002 | Toolbar button exists; clicking opens hub list with all categories |
| Hub navigation | ITEMS-003 to 005 | Clicking Assets navigates to list view; header title updates; non-Assets categories show placeholder |
| Back arrow | ITEMS-006 to 008 | Back arrow appears when away from hub; absent on hub; clicking returns to hub |
| Assets list | ITEMS-009 to 013 | Mock tiles render; item count shown; search filters list; clearing search restores list; no-match empty state |
| Asset detail | ITEMS-014 to 016 | Clicking tile opens detail view with tabs; header title shows asset name; back arrow from detail returns to list |
| State reset | ITEMS-017 | Closing and reopening panel resets to hub view |
| Floating panel | ITEMS-018 | Back arrow present and functional after panel is undocked to floating |

### 8. Form Factor & Device Variant Suite — not yet written

When the tablet/phone variants gain real divergent content, add `evals/tests/tablet/` and `evals/tests/phone/` directories. Each spec navigates directly to `?form=tablet` or `?form=phone` — no need to click the settings cog unless the cog itself is under test. Don't share assertions across form factors; each gets its own spec.

| Test ID | What to verify |
|---|---|
| FF-001 | `?form=tablet` loads the tablet variant; settings cog dropdown shows Tablet checked |
| FF-002 | `?form=phone` loads the phone variant; cog dropdown shows Phone checked |
| FF-003 | Bare URL (no `?form=`) defaults to desktop; cog dropdown shows Desktop checked |
| FF-004 | Cog → switch form factor updates the URL via `history.replaceState` (no page reload) |
| FF-005 | Switching form factor preserves other URL params (`?model=tower&form=tablet`) |
| FF-006 | Model picker `<a href>` preserves `?form=` and `?orient=` params |
| FF-007 | Rotation button toggles `?orient=` between portrait and landscape on tablet/phone |
| FF-008 | Switching form factors resets orientation to the new form factor's default (tablet → landscape, phone → portrait) |
| FF-009 | URL omits `?orient=` when orientation matches the form factor's default (clean URLs) |
| FF-010 | Browser back/forward navigation re-syncs the FormFactorContext state to the URL |
| FF-011 | DeviceFrame bezel + notch + home indicator render at fixed CSS pixel sizes (independent of viewport scale) |
| FF-012 | Viewer canvas remains attached and renders after a desktop → tablet switch (variant remount migration — see CLAUDE.md §3c) |
| FF-013 | Viewer canvas remains attached after a tablet → phone switch |
| FF-014 | After variant switch, pointer/wheel listeners still fire on the canvas (orbit, scroll-to-cursor still work) |

### 8. Navigation Suite (`navigation.spec.js`) — not yet written

When written, this suite should cover the following behaviors (all use the mock scene for speed):

| Test ID | What to verify |
|---|---|
| NAV-001 | Default mode: left-drag rotates camera orientation without moving camera position |
| NAV-002 | Orbit mode: left-drag orbits camera around `controls.target` |
| NAV-003 | Fly mode: camera mode is set to `'fly'` |
| NAV-004 | WASD keys move camera in world space when model is loaded |
| NAV-005 | Movement direction is camera-relative (not world-axis-aligned) |
| NAV-006 | Q/E keys move camera up/down |
| NAV-008 | Right-click drag in Default mode orbits (camera position changes) |
| NAV-009 | Right-click drag in Orbit mode performs look-around (camera position unchanged) |
| NAV-010 | `right-drag-orbit-start` event fires on right-mousedown in Default/Fly mode |
| NAV-011 | `right-drag-orbit-end` event fires on right-mouseup |
| NAV-012 | Scroll wheel moves camera toward cursor point (not toward screen center) |
| NAV-013 | Fast scroll moves farther than slow scroll (acceleration curve) |
| NAV-014 | Forward scroll does not overshoot the cursor hit point |
| NAV-015 | Keyboard shortcuts are suppressed when an INPUT or TEXTAREA is focused |
| NAV-016 | `destroy()` removes all listeners (no leaks after destroy) |

**Note:** Tests NAV-008 through NAV-011 require simulating pointer events (`page.mouse` with `button: 'right'`), not mouse events. Use Playwright's `page.mouse.down({ button: 'right' })` / `page.mouse.up({ button: 'right' })`.

## Chrome UI Testing

Chrome component tests live in `src/chrome/__tests__/` and are separate from the engine Playwright tests.

### What to test

| Layer | Location | What It Tests |
|---|---|---|
| **Engine features** | `evals/tests/` (Playwright) | Viewer API behavior, 3D interactions, model loading |
| **Chrome components** | `src/chrome/__tests__/` | React component rendering, button clicks, adapter calls, active states |
| **Chrome compatibility** | `evals/tests/chrome-compatibility.spec.js` (Playwright) | Whether the engine supports what Chrome UI needs |

### Chrome test guidelines

- Chrome component tests verify that clicking a button calls the correct ViewerAdapter method.
- They do **not** test the engine itself — that's what `evals/tests/` is for.
- Mock the ViewerAdapter in chrome tests. The mock should verify the correct method was called with the correct arguments.
- Each chrome feature in `src/chrome/features/[name]/` should have a corresponding test file in `src/chrome/__tests__/[name].test.tsx`.
- For features with **variant files** (e.g. `Header.desktop.tsx` / `Header.tablet.tsx` / `Header.phone.tsx`), test each variant in isolation by mocking `FormFactorContext` to return the form factor under test. Variant routing tests (asserting that `?form=tablet` renders `<HeaderTablet>`) belong in the Form Factor Suite (see §7).

## Writing New Tests

### For a New Engine Feature

1. Create `evals/tests/[feature-name].spec.js`.
2. Import helpers from `./test-helpers.js`.
3. Use `setupViewer(page)` for mock-scene tests (fast, deterministic).
4. Use `setupViewerWithModel(page)` only when you need a real IFC model.
5. Follow the naming convention: `REG-{CATEGORY}-{NNN}: Description`.
6. Add a corresponding `npm` script in `package.json` if the suite should be runnable independently:
   ```json
   "test:[feature]": "npx playwright test evals/tests/[feature-name].spec.js"
   ```

### For a New Chrome Feature

1. Create the feature in `src/chrome/features/[feature-name]/`.
2. Create `src/chrome/__tests__/[feature-name].test.tsx`.
3. Test that the component renders, handles clicks, and calls the correct ViewerAdapter methods.
4. If the feature requires a new ViewerAdapter method, add it to `types.ts` and update `chrome-compatibility.spec.js` to track engine readiness.

### Test Structure Template

```javascript
import { test, expect } from '@playwright/test';
import { setupViewer } from './test-helpers.js';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await setupViewer(page);
  });

  test('REG-FEAT-001: Description of what is tested', async ({ page }) => {
    // Arrange: set up preconditions via page.evaluate()
    // Act: trigger the feature
    // Assert: verify outcomes with expect()
  });
});
```

### Guidelines

- **Prefer the mock scene** (`setupViewer`) over real IFC loading (`setupViewerWithModel`) — it is 10x faster.
- **Use `page.evaluate()`** to call viewer APIs and read state. Avoid relying on DOM selectors for internal state.
- **Capture events** with the `captureEvents` helper when testing that the viewer emits the correct events.
- **Timeouts:** The global timeout is 30s (matches `playwright.config.js`). Use explicit `{ timeout }` overrides only for tests that must wait for external resources or unusually slow animations. Do not set timeouts > 30s without a clear reason — the synthetic fixture loads in ~100ms, so a test needing more than a few seconds is usually waiting for the wrong thing.
- **No flaky waits:** Prefer `waitForFunction` over `waitForTimeout` wherever possible. Use `waitForTimeout` only for rendering settle time after setup.
- **Cleanup:** Features with `destroy()` methods should have a test verifying cleanup (listeners removed, state cleared).

## CI / Pre-Merge Checklist

Before merging any change, ensure:

1. `npm test` passes (all suites, all tests green).
2. No new `console.error` output during any test run.
3. If a new **engine feature** was added, a corresponding test file exists in `evals/tests/`.
4. If a new **chrome feature** was added, a corresponding test file exists in `src/chrome/__tests__/`.
5. The regression suite (`regression.spec.js`) still passes — it must never decrease in count.
6. If a new ViewerAdapter method was added, `chrome-compatibility.spec.js` has a test for it.
