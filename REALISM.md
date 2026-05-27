# Realism Render Mode

Engineering notes for the **Default ↔ Realism** picker in the bottom toolbar.
Captures *what* it does, *how* it's wired, the That Open Components package
internals we depend on, and — importantly — the paths we explored and dropped
so you don't repeat them.

## What Realism does today

Toggle the chip on the right side of the bottom toolbar to switch between two
render modes. **Default** is unchanged from before this feature ever existed.
**Realism** stacks four GPU effects on top of the existing renderer plus
turns directional-light cast shadows on.

| | Default | Realism |
|---|---|---|
| Render path | `renderer.render(scene, camera)` | `Postproduction.composer.render()` |
| Render passes | none | RenderPass → gammaPass → N8AO → CustomEffectsPass |
| Ambient occlusion | none | N8AO (GTAO-ish, screen-space) |
| Edge detection | none | Depth+normal Sobel via CustomEffectsPass |
| Anti-aliasing | renderer's MSAA | inherited via base RenderPass |
| Gamma | renderer's `outputColorSpace = SRGB` | gammaPass at composer end |
| Cast shadows | off (`renderer.shadowMap.enabled = false`) | on (PCFSoftShadowMap, 2K) |
| Fill light intensity | scene default | ambient + hemisphere ×`LIGHT_BOOST` (1.3) |
| Edge pass tuning | n/a | `opacity 0.2`, `tolerance 6`, `lineColor 0xbbbbbb` (softer than package) |
| N8AO tuning | n/a | `intensity 2.5` (down from package `newSaoPass` default 4) |

We use [`@thatopen/components-front@^2.4.12`](https://www.npmjs.com/package/@thatopen/components-front)'s
inner `Postproduction` class — NOT its `PostproductionRenderer` wrapper. See
"Key architectural decision" below for why.

## How the toggle flows

```
BottomToolbar.handleSelectStyle('realism')
  → adapter.setRenderStyle('realism')          // ViewerAdapter API
  → viewer.setRenderStyle('realism')            // ModelViewer instance method
  → realism.enable()                            // RealismRenderer
    → first time: _build() — constructs OBC.Components + Postproduction
    → sceneManager.setRenderOverride(() => postproduction.composer.render())
    → renderer.shadowMap.enabled = true
```

`disable()` reverses every step. State that gets snapshotted on enable and
restored on disable:

- `renderer.outputColorSpace`
- `renderer.toneMapping`
- `renderer.toneMappingExposure`
- `renderer.shadowMap.enabled`
- `AmbientLight.intensity` and `HemisphereLight.intensity` (per-light snapshot
  in `_lightSnapshots`, multiplied by `LIGHT_BOOST` on enable, restored on
  disable). `DirectionalLight` is intentionally left alone so the shadow cast
  doesn't shift between modes.

(Postproduction's `initialize()` overrides the first three. We snapshot before
calling enable so disable can put them back.)

## URL param survival

`?style=realism` in the URL opens straight into Realism mode. Implementation
in [BottomToolbar.tsx](src/chrome/features/bottom-toolbar/BottomToolbar.tsx):
the mount `useEffect` depends on `[adapter]`, not `[]`, because BottomToolbar
first mounts with the **mock** adapter (the chrome layer is up before the
viewer is ready). When ChromeApp swaps in the real adapter via
`setAdapter(realAdapter)`, the effect re-fires and forwards the URL-derived
style to the real engine. With `[]` deps the call only ever hit the mock.

## Key architectural decision: no canvas swap

`@thatopen/components-front` exports `PostproductionRenderer`, a wrapper that
creates its own `<canvas>` element. Adopting it would have required:

- Mounting the new canvas in `mv-canvas-container`
- Hiding the original canvas
- Rebinding the ~20 pointer/wheel/mousedown listeners in
  [Navigation.js](src/features/Navigation.js),
  [Selection.js](src/features/Selection.js), and
  [Sectioning.js](src/features/Sectioning.js) to the new canvas
- Adding a `rebindDomElement(newEl)` method to each, plus a documented
  contract that any future pointer-binding feature must add the same

While reading the package source we found the **inner `Postproduction` class**
takes an existing `THREE.WebGLRenderer` as a constructor arg:

```ts
constructor(components: OBC.Components, renderer: THREE.WebGLRenderer, world: OBC.World);
```

It owns the EffectComposer + passes internally; `composer.render()` writes to
the passed-in renderer's existing canvas. So we wrap **our** WebGLRenderer,
never mount a new canvas, and Navigation/Selection/Sectioning don't know
anything changed. The minimal `world` argument is built ad-hoc in
[RealismRenderer.js](src/features/RealismRenderer.js) — Postproduction only
reads `.scene.three`, `.camera.three`, and a few `world.renderer` shape-bits.

This eliminated a 3-class rebind work-stream and a CLAUDE.md doc update.

## That Open Components gotchas

The 2.4.12 source has several footguns that are easy to hit. **Do not refactor
[RealismRenderer.js](src/features/RealismRenderer.js) without re-reading this
section** — the workarounds look odd in isolation.

### Iteration bug in `Postproduction.updatePasses`

```js
// inside @thatopen/components-front bundle:
updatePasses() {
  for (const t of this.composer.passes)
    this.composer.removePass(t);                 // mutates the array we're iterating
  // ... then add passes back
}
```

`for...of` on an array tracks indices. `removePass` splices the array — every
other element gets skipped. Result: passes accumulate. Three downstream impacts:

1. **`setPasses(...)` calls updatePasses** internally. If you call it after
   construction to flip `ao: true`, you get duplicated passes.
2. **`enabled = true` calls `initialize()` which calls updatePasses** — this
   one is fine because `composer.passes` is empty at that point. So you get
   exactly one clean pass list, but only if you don't call setPasses again.
3. **`setSize(w, h)` does this:**
   ```js
   setPasses({ custom: false });    // updatePasses → duplicates
   setPasses({ custom: false });    // no diff, no-op
   composer.setSize(w, h);
   basePass.setSize(...);
   n8ao.setSize(...);
   customEffects.setSize(...);
   gammaPass.setSize(...);
   setPasses({ custom: true });     // updatePasses → more duplicates
   ```
   Calling Postproduction's `setSize` corrupts the pass list. We bypass it.

### `n8ao`, `customEffects`, `gammaPass` getters throw before init

```js
get gammaPass() {
  if (!this._gammaPass) throw new Error("Custom effects not initialized!");
  return this._gammaPass;
}
```

These getters throw until `initialize()` has run. `initialize()` is private
and only called from the `enabled` setter on first set. So:

- You cannot configure n8ao / customEffects until you flip `enabled = true`.
- The pass list also doesn't exist until then.

### `initialize()` overrides renderer state

```js
this._renderer.outputColorSpace = "srgb";
this._renderer.toneMapping = A.NoToneMapping;
```

`Postproduction.initialize()` reaches into the renderer we passed in and
overwrites its `outputColorSpace` and `toneMapping`. We snapshot the originals
in `enable()` so `disable()` can restore them — without that, Default mode
after a Realism toggle looks different from a fresh page load.

### `gammaPass` bypasses `renderer.toneMapping`

The gammaPass at the end of the composer chain is a fixed linear→sRGB
shader pass. It does not honor `renderer.toneMapping`. We tried swapping it
for three's `OutputPass` (which does honor toneMapping) to get ACES Filmic
in Realism — see "Things we tried and dropped" below.

### `EffectComposer` does not auto-inherit the renderer's `pixelRatio`

`Postproduction` constructs an `EffectComposer` internally and never calls
`composer.setPixelRatio(...)`. EffectComposer's default `_pixelRatio` is `1`,
so its render targets — and every pass's render targets — get created at
**CSS-pixel** dimensions, not drawing-buffer dimensions.

On a retina display where `renderer.setPixelRatio(2)` is in effect, the
canvas's drawing buffer is e.g. 1768×1832 but the composer's render targets
sit at 884×916. The composer's final pass blits its quarter-resolution
result up to the full-resolution canvas — which reads as a soft / blurry
image vs Default mode (Default bypasses the composer entirely, so it draws
directly to the full-resolution drawing buffer).

We sync this in `_build()` immediately after `postproduction.enabled = true`:

```js
this.postproduction.composer.setPixelRatio(renderer.getPixelRatio());
```

And re-sync in `_resizePostproduction` in case the canvas moves between
screens with different DPRs.

**Do not remove this.** It's invisible until you put the build next to the
old build on a retina screen — at which point the regression is obvious.

## How we work around all of the above

In `_build()`:

```js
this.postproduction = new Postproduction(this.components, renderer, this._world);

// Pre-set _settings.ao = true BEFORE init. We can't call setPasses() after
// init without hitting the iteration bug, so we directly mutate the private
// _settings object. When initialize() runs its own updatePasses, the pass
// list is built correctly on the first try.
this.postproduction._settings.ao = true;

// Flip enabled = true to trigger initialize(). We leave it permanently true
// and gate "is realism on" via setRenderOverride() — composer.render() is
// only called when the override is installed.
this.postproduction.enabled = true;

// Post-init tuning. The customEffects + n8ao getters throw before initialize()
// runs, so this MUST come after `enabled = true`. The package defaults are too
// aggressive for dense BIM geometry — see "Post-process tuning" below.
this.postproduction.customEffects.opacity = EDGE_OPACITY;     // 0.4 → 0.2
this.postproduction.customEffects.tolerance = EDGE_TOLERANCE; // 3   → 6
this.postproduction.customEffects.lineColor = EDGE_LINE_COLOR;// 0x999999 → 0xbbbbbb
this.postproduction.n8ao.configuration.intensity = AO_INTENSITY; // 4 → 2.5
```

In `enable()` / `resize()`:

```js
// Bypass the broken Postproduction.setSize. EffectComposer.setSize is safe:
// it iterates this.passes without mutating, calling pass.setSize(w*dpr, h*dpr)
// on each. Because we sync composer.setPixelRatio to the renderer's DPR in
// _build(), composer.setSize alone produces correctly-sized render targets
// for every pass — no manual per-pass setSize calls needed.
_resizePostproduction(width, height) {
  const pp = this.postproduction;
  if (!pp || !pp.composer) return;
  const dpr = this.viewer.sceneManager.renderer.getPixelRatio();
  if (pp.composer._pixelRatio !== dpr) pp.composer.setPixelRatio(dpr);
  pp.composer.setSize(width, height);
}
```

**Earlier versions** of this method called `setSize(width, height)` on each
pass manually as a "belt and suspenders" measure, before we realized
`composer.setSize` already does that — and that the manual calls were
*overwriting* the DPR-scaled dimensions with CSS dimensions, producing
quarter-resolution render targets on retina screens. Don't add them back.

## File layout

| File | Role |
|---|---|
| [src/features/RealismRenderer.js](src/features/RealismRenderer.js) | Owns the lifecycle of OBC.Components + Postproduction + scene-level state |
| [src/core/ModelViewer.js](src/core/ModelViewer.js) | Instantiates `RealismRenderer`, exposes `setRenderStyle(style)` |
| [src/core/SceneManager.js](src/core/SceneManager.js) | `setRenderOverride(fn)` for the animate loop, `setResizeHook(fn)` for viewport resize |
| [src/core/IFCLoader.js](src/core/IFCLoader.js) | Sets `castShadow`/`receiveShadow = true` on every mesh during reveal-finalize (inert in Default; lights up when Realism turns shadows on) |
| [src/chrome/features/viewer-adapter/types.ts](src/chrome/features/viewer-adapter/types.ts) | `setRenderStyle?(style)` on the adapter interface |
| [src/chrome/features/viewer-adapter/modelViewerAdapter.ts](src/chrome/features/viewer-adapter/modelViewerAdapter.ts) | One-line delegate to `viewer.setRenderStyle` |
| [src/chrome/features/viewer-adapter/mockViewerAdapter.ts](src/chrome/features/viewer-adapter/mockViewerAdapter.ts) | No-op log for the mock |
| [src/chrome/features/bottom-toolbar/BottomToolbar.tsx](src/chrome/features/bottom-toolbar/BottomToolbar.tsx) | `handleSelectStyle` + `[adapter]`-keyed mount effect for URL survival |

## Post-process tuning (current)

All tuning constants live as `static` fields on `RealismRenderer` so adjusting
them is one place, not a code hunt. Numbers reflect the current ship values:

| Constant | Value | Package default | Why we changed it |
|---|---|---|---|
| `EDGE_OPACITY` | `0.2` | `0.4` | Sobel-detected edges on dense BIM joins read as a wireframe overlay; halving opacity keeps the silhouette hint without the crosshatch noise. |
| `EDGE_TOLERANCE` | `6` | `3` | Higher tolerance = the Sobel filter only triggers on stronger depth/normal discontinuities, so coplanar slab+finish joins stop producing false-positive edges. |
| `EDGE_LINE_COLOR` | `0xbbbbbb` | `0x999999` | Lighter grey reduces contrast against the Lambert-shaded surfaces, especially on the dark side of the directional light. |
| `AO_INTENSITY` | `2.5` | `4` (set by `newSaoPass`) | Package's `newSaoPass` overrides the N8AO class default of `5` to `4`. We drop further so AO doesn't compound darkness with the edge pass and the cast shadow. `aoRadius` stays at `1` — at this radius, perceived darkness is intensity-dominated. |
| `LIGHT_BOOST` | `1.3` | n/a | Compensates for the perceived brightness loss from NoToneMapping + N8AO + edge pass. Applied to ambient + hemisphere only; directional is left alone so shadow strength is identical between Default and Realism. |

**Where the edge pass actually comes from:** the `CustomEffectsPass`
depth+normal Sobel runs **regardless of `outlineEnabled`**. That boolean only
controls a separate selection-highlight outline path (the `outlinedMeshes`
map). The "boundary lines" users see are always-on Sobel; only `opacity` /
`tolerance` / `lineColor` quiet them.

### Edge-style alternatives (deferred)

We picked "softened" because it preserves silhouette readability on flat-shaded
Lambert geometry. If feedback turns against that choice, the two parked
alternatives are:

**Option B — Edges off entirely.** Set `EDGE_OPACITY = 0` (cheapest), or
gate the customEffects pass out of the composer at build time
(`postproduction._settings.custom = false` before `enabled = true`). Cleanest
photo-real look. Trade-off: flat-shaded walls under uniform fill light lose
the cue that distinguishes adjacent surfaces, so reading geometry in low-
contrast areas gets harder. Worth A/B-ing in front of stakeholders before
committing.

**Option C — User-facing edge toggle.** Add a "edges on/off" sub-control to
the Realism chip in BottomToolbar, route through the adapter, expose
`setEdgeStyle('soft' | 'off')` on `RealismRenderer`. Implementation note: at
runtime, toggling `customEffects.opacity` between `EDGE_OPACITY` and `0` is
safe and immediate — no composer rebuild needed. Toggling pass membership
via `setPasses` would hit the iteration bug ([§Gotchas](#that-open-components-gotchas)).
Skip this until at least one stakeholder asks for it; otherwise it's
yet-another-toggle for no observed user need.

## Things we tried and dropped

These would otherwise be tempting to re-attempt. Read this section before
sinking time into any of them.

### `@thatopen/components-front@3.x` upgrade (for named style presets)

v3 ships named visual-style presets (Basic, Pen, Shadowed Pen, Color Pen,
Color Shadows, Color Pen Shadows). **They are stylized**, not photo-real —
think hand-drawn line art. They go in the opposite direction from our
photo-realism goal. Also requires bumping `@thatopen/components` to 3.x,
`@thatopen/fragments` to ~3.4, and `three` to >=0.182 — large knock-on.

### Lambert → Standard material upgrade

`@thatopen/fragments` ships BIM geometry as `MeshLambertMaterial`. We tried
upgrading every mesh's material to `MeshStandardMaterial` at IFCLoader
finalize time so they'd respond to scene.environment.

**Result**: load slowed from ~5s to 60s+ on the Condos model. Every new
MeshStandardMaterial triggers a shader compile on first render. With 2550
materials, that's 2550 shader compiles serialized through the render loop.
Plus the visual difference at metalness=0 roughness=0.7 was marginal even
when env map was set. **Reverted**.

### HDR environment map via `THREE.RoomEnvironment`

PMREM-filtered RoomEnvironment cubemap assigned to `scene.environment`.
Would give indirect lighting + subtle reflections on shiny surfaces.

**Result**: only visible on `MeshStandardMaterial`. Since we reverted the
material upgrade above, the env map's contribution is zero on Lambert. Also
the RoomEnvironment is fairly bright and washed out the direct-light contrast
even on Standard materials. **Reverted**.

### VSM shadows

`THREE.VSMShadowMap` for softer shadow penumbra than PCFSoftShadowMap.
Configured `directionalLight.shadow.blurSamples = 25` and `radius = 4`.

**Result**: VSM looked grainy in our scene — the blur samples weren't enough
to smooth the noise at our shadow map size, and bumping samples cost
performance. PCFSoftShadowMap (the renderer's default, already configured by
SceneManager) looks cleaner with no extra params. **Reverted to PCFSoft.**

### Aggressive AO + edge tuning

`aoRadius=4`, `intensity=7`, `lineColor=0x111111`, `opacity=0.85`,
`tolerance=1.5`.

**Result**: extremely grainy AO and over-dark edges that didn't compose well
with shadows. We had been *compensating* for a then-undiscovered bug where
`Postproduction.setSize` duplicated passes — each pass running twice doubled
the apparent intensity, which is the "wow" effect we saw briefly during
development. Once setSize was bypassed and the pass list stayed clean, the
aggressive tuning became too much. **Reverted to package defaults.**

### Swap `gammaPass` for `OutputPass` to get ACES tone mapping in Realism

`OutputPass` (from `three/addons/postprocessing/OutputPass.js`) honors
`renderer.toneMapping` / `toneMappingExposure`, so setting them to ACES
Filmic should give Realism the same punchy contrast Default has.

**Result**: didn't visibly improve things. The composer's intermediate render
targets are linear-space and the tone mapping happens at the end — but with
our scene's lighting (ambient + directional + hemisphere, no HDR), the output
was already in LDR range, so ACES did nothing meaningful. **Reverted**.

### `PostproductionRenderer` wrapper class

See "Key architectural decision" above. Brings its own canvas, requires
rebind work in 3 engine classes, larger change for no functional gain.
**Never adopted.**

## Deploy gotcha (resolved)

Installing `@thatopen/components-front` locally resolved 5 packages through
Procore's Artifactory mirror and baked Artifactory URLs into
`package-lock.json` as `"resolved": "https://artifacts.procoretech.com/..."`.
Vercel's build machine has no Artifactory token, so the first deploy hit
401 on `npm install`. Fixed by rewriting those 5 URLs to `registry.npmjs.org`
and adding a repo-level `.npmrc` (`registry=https://registry.npmjs.org/`) so
the same thing can't recur. See [`CLAUDE.md`](./CLAUDE.md) → "NPM registry".

## Known limitations of what shipped

- **No UI for tuning AO/edges/gloss.** Single toggle is the entire surface.
- **No environment lighting.** BIM geometry doesn't get indirect light from
  sky/ground. Means walls facing away from the directional light are uniformly
  ambient — flat. The fix (material upgrade + env map) is documented above as
  attempted and dropped.
- **`Postproduction.updateCamera()` is called on every `camera-change` event,
  including pure pan/orbit.** Wasteful — it only matters on ortho ↔ perspective
  swap. Easy follow-up: gate behind a camera-instance identity check.
- **Cast shadow quality is OK at the model scale we tested with**, but the
  2K directional shadow map will alias on very large IFC files. Bump to 4K
  in [SceneManager.js:64-65](src/core/SceneManager.js:64) if needed.
- **Realism's GPU cost scales with `devicePixelRatio`** since the fix that
  syncs `composer.setPixelRatio` to the renderer's. On retina (DPR=2) every
  post-process pass — N8AO, Sobel edge, gamma — runs over 4× the pixels of
  the CSS viewport. Fine on the models we ship, but if performance complaints
  ever surface on a low-end GPU or a much larger IFC, the obvious knobs are
  (a) cap the composer's pixel ratio below the renderer's (e.g. `Math.min(dpr,
  1.5)` — visible softening but big perf win), or (b) flip N8AO's `halfRes`
  config flag (AO at half res, base + edge still full res — usually
  imperceptible quality hit, decent perf win).

## If you want to push Realism further

In rough order of impact-to-effort for *photo-realism* (not stylization):

1. **A proper HDR environment.** Requires Lambert→Standard upgrade. To avoid
   the per-mesh shader-compile stall, do the upgrade lazily *only* on first
   Realism enable, walk the scene once, and cache the original Lambert on
   `mesh.userData` so disable can restore it. Means Default mode stays
   identical and the cost is paid once on first toggle.
2. **Soft shadows.** PCSS (Percentage-Closer Soft Shadows) via custom shader,
   or just tune the existing PCF shadow with larger map + tighter frustum.
3. **Time-of-day sun angle.** SceneManager directional light angle is fixed.
   Could expose a sun-position control.
4. **Multi-bounce indirect.** Real-time GI is hard. Bake an irradiance volume
   per model on load? Out of scope but where you'd go for "really" photoreal.
