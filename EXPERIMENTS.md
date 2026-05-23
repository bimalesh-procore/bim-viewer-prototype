# EXPERIMENTS.md

A log of approaches that were researched, prototyped, or partially implemented but ultimately
reverted or deferred. The goal is to prevent re-covering the same ground and to capture the
"why not" so future decisions can be made with full context.

---

## 1. MeshCullerRenderer (OBC frustum/occlusion culling)

**Date:** May 2026  
**Goal:** Improve rendering performance for large models (Data Center ~31 MB, Mastodon ~81 MB)
by hiding geometry that is outside the camera frustum.

### What we tried

`@thatopen/components` ships a `MeshCullerRenderer` (accessed via `OBC.Cullers`) that performs
off-screen visibility checks. It renders the scene to a small color-buffer in a Web Worker,
counts pixels per color-coded mesh, and hides any mesh that registers fewer pixels than a
threshold. It runs on a `setInterval` (default 1 second).

**Implementation plan (Option B — threshold-gated):**
- Create the culler once in `IFCLoader.init()` alongside the existing OBC world.
- After a model finishes loading, if it has ≥ 500 meshes, register every mesh with
  `culler.add(mesh)`.
- `culler.add()` hides meshes immediately; restore `mesh.visible = true` after registration
  so the model stays visible until the first cull pass fires.
- On `unloadModel`, call `culler.remove(mesh)` for each registered mesh before
  `fragmentsManager.disposeGroup()`.
- Models below the 500-mesh threshold bypass the culler entirely.

### Non-obvious technical hurdle: OBC world setters

`world.renderer` and `world.camera` have OBC setters that do more than store the value.
On assignment they call:
```js
renderer.worlds.set(worldUuid, world);
renderer.currentWorld = world;
renderer.onWorldChanged.trigger({ world, action: "added" });
```
Assigning a plain proxy object (e.g. `Object.defineProperties({}, {...})`) throws:
> `TypeError: Cannot read properties of undefined (reading 'set')`

**Fix:** the assigned object must include `worlds` (a Map), `currentWorld` (any writable
property), and `onWorldChanged` (an object with a `.trigger()` method), even as no-ops.
Live getters for `clippingPlanes` and `three` can sit alongside these shims:
```js
world.renderer = {
  worlds: new Map(),
  currentWorld: null,
  onWorldChanged: { trigger: () => {} },
  get clippingPlanes() { return threeRenderer.clippingPlanes; },
  get three() { return threeRenderer; },
};
world.camera = {
  worlds: new Map(),
  currentWorld: null,
  onWorldChanged: { trigger: () => {} },
  get three() { return sceneManager.getCamera(); },
};
```

### Why it was reverted

Despite getting the plumbing right, the culler's behavior was unacceptable in practice:

1. **Meshes disappearing at distance.** The culler's pixel-counting threshold hides meshes
   that are technically in the frustum but small on screen — i.e. distant geometry. For a
   BIM model where users pan far out to see the whole building, this is very visible and
   confusing.

2. **Freeze during first registration.** Calling `culler.add()` in a tight loop for hundreds
   or thousands of meshes (Data Center has thousands) caused a noticeable main-thread stall.
   Each `add()` creates a new `THREE.InstancedMesh`, allocates GPU memory, and involves
   synchronous JS work — all sequential.

3. **The threshold needs careful per-model tuning.** `config.threshold` (default 100 pixels)
   determines how small a mesh can appear before being hidden. Getting this right requires
   profiling each model at representative camera distances, which is not practical without a
   dedicated tuning workflow.

### What to try instead if revisiting

- **Three.js built-in frustum culling** (`mesh.frustumCulled = true`) is already active by
  default on all meshes. It's zero-cost compared to the OBC pixel-buffer approach and handles
  the "off-screen" case correctly. If geometry is still too expensive, this isn't the bottleneck.

- **Level of Detail (LOD)** via `THREE.LOD` — swap in simplified geometry at far distances.
  Requires pre-processing models to generate LOD meshes, which `@thatopen/components` does
  not do automatically.

- **Instancing / merging** — reduce draw calls rather than hiding meshes. More relevant for
  highly repetitive models (e.g. many identical structural members).

- **`MeshCullerRenderer` with a much lower threshold and larger interval** — if revisited,
  set `culler.config.threshold = 10` (hide only truly invisible meshes) and
  `culler.config.updateInterval = 3000` (reduce processing frequency). Still experimental.

- **Worker-based geometry streaming** — `@thatopen/components` `IfcGeometryTiler` can stream
  geometry in chunks. Not currently used for `.frag.gz` files (those load all geometry at
  once), but could be a path for very large IFC files loaded live.

### Files touched (all reverted)

- `src/core/IFCLoader.js` — world shims, culler init, mesh registration, unload cleanup
- `context.md` — wiring status entry, known issue entry
- `CLAUDE.md` — §4b frustum culling note

---

*Add new experiments below this line.*
