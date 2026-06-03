# Merge-to-Main Test Gate

Tests run **once, when merging to main** — not on every push.
Pushing to a feature branch is unrestricted.

---

## For the LLM agent (Claude / any AI agent)

Before running `gh pr merge` (or any equivalent merge-to-main command):

1. Identify which files changed on this branch vs `main`:
   ```
   git diff --name-only origin/main...HEAD
   ```

2. Map changed paths to test suites using the table below.

3. Run the targeted tests. `regression.spec.js` always runs as a smoke baseline.

4. **If all pass** → proceed with the merge.

5. **If any fail**:
   - Attempt to auto-fix once.
   - Re-run the same targeted tests.
   - If now passing → **stop and ask the user to verify the app before merging**. Do not merge until confirmed.
   - If still failing → **stop, do not merge, report which tests are failing, ask the user to intervene.**

---

## Feature → Test suite mapping

| Changed path | Tests to run |
|---|---|
| `src/features/Navigation.js` | `evals/tests/navigation.spec.js` + `evals/tests/regression.spec.js` |
| `src/chrome/features/bottom-toolbar/` | `evals/tests/navigation.spec.js` + `evals/tests/chrome-compatibility.spec.js` (houses the nav-mode picker — same engine surface the old NavigationWheel covered) |
| `src/chrome/features/viewer-settings/` | `evals/tests/chrome-compatibility.spec.js` (shared context for ortho/x-ray/render-toggles state across right + bottom toolbars) |
| `src/chrome/features/left-toolbar/` | `evals/tests/left-sidebar.spec.js` |
| `src/chrome/features/items-panel/` | `evals/tests/chrome-items-panel.spec.js` |
| `src/chrome/shared/useItemsView.ts` | `evals/tests/chrome-items-panel.spec.js` |
| `src/chrome/features/dock-manager/` | `evals/tests/chrome-items-panel.spec.js` + `evals/tests/regression.spec.js` (items panel title + back-arrow logic lives in DockManager) |
| `src/chrome/features/search-sets/` | `evals/tests/chrome-search-sets-panel.spec.js` + `evals/tests/search-sets.spec.js` |
| `src/chrome/features/viewer-adapter/` | `evals/tests/chrome-compatibility.spec.js` |
| `src/chrome/features/form-factor/` | `evals/tests/regression.spec.js` (no dedicated suite yet — see [`MOBILE_VARIANTS.md`](./MOBILE_VARIANTS.md) §7) |
| `src/chrome/features/chrome-layout/` | `evals/tests/regression.spec.js` + `evals/tests/chrome-compatibility.spec.js` (touches viewer mount and variant routing — see [CLAUDE.md §3c](./CLAUDE.md)) |
| `src/chrome/features/header/` | `evals/tests/regression.spec.js` + `evals/tests/chrome-compatibility.spec.js` |
| `src/chrome/features/settings-panel/` | `evals/tests/regression.spec.js` (no dedicated suite yet — the panel is mostly stubs; Home View save needs a focused test eventually) |
| `src/chrome/features/floating-window/` | `evals/tests/regression.spec.js` (smoke only — no dedicated suite yet) |
| `src/chrome/features/toast/` | `evals/tests/regression.spec.js` (smoke only — no dedicated suite yet) |
| `src/chrome/features/viewpoints/` | `evals/tests/regression.spec.js` + `evals/tests/chrome-ifc-loading.spec.js` (touches load-complete restore path) |
| `src/chrome/features/form-factor-menu/` | `evals/tests/regression.spec.js` (no dedicated suite — same situation as `form-factor/`) |
| `scripts/vite-plugin-viewpoints-writer.mjs` | `evals/tests/regression.spec.js` (dev-only middleware; integration coverage via the viewpoints round-trip) |
| `public/viewpoints.json` | None — data file. Sanity check that JSON parses. |
| `src/features/Navigation.js` (the `getEffectiveCamera` addition) | `evals/tests/navigation.spec.js` (covered by existing navigation suite) |
| `src/features/Sectioning.js` | `evals/tests/regression.spec.js` (no dedicated sectioning suite yet; covers section planes, section cut, section box sub-modes, isolate-in-section-box, `serializeState`/`restoreState`) |
| `src/chrome/app/ChromeApp.tsx` | `evals/tests/chrome-compatibility.spec.js` + `evals/tests/chrome-ifc-loading.spec.js` (viewer container migration logic lives here — see [CLAUDE.md §3c](./CLAUDE.md)) |
| `src/chrome/` (any other) | `evals/tests/chrome-ifc-loading.spec.js` + `evals/tests/chrome-compatibility.spec.js` |
| `src/chrome/shared/TreeNode.tsx` | `evals/tests/regression.spec.js` + `evals/tests/chrome-compatibility.spec.js` (shared by all docked panels — Viewpoints, Sheets, Object Tree) |
| `src/chrome/features/model-manager/` | `evals/tests/regression.spec.js` (no dedicated suite yet — routing-only page, no engine integration) |
| `src/chrome/main.tsx` | `evals/tests/regression.spec.js` + `evals/tests/chrome-compatibility.spec.js` (routing entry point — same cross-cutting concern as `ChromeApp.tsx`) |
| `src/features/Selection.js` | `evals/tests/selection.spec.js` |
| `src/features/SearchSets.js` | `evals/tests/search-sets.spec.js` |
| `src/features/` or `src/services/` (any) | `evals/tests/ifc-loading.spec.js` |
| `src/core/`, `demo/`, `vite.config.js`, `src/index.*` | `npm test` (full suite — cross-cutting change) |
| Docs, config, `.githooks/` only | `evals/tests/regression.spec.js` (smoke only) |

`evals/tests/regression.spec.js` is always included regardless of what changed.

---

## For humans

Run the targeted tests manually before merging:

```sh
# Identify changed files
git diff --name-only origin/main...HEAD

# Run smoke baseline (always)
npx playwright test evals/tests/regression.spec.js

# Add feature-specific suites from the table above as needed
npx playwright test evals/tests/<feature>.spec.js
```

Or run the full suite if unsure:
```sh
npm test
```
