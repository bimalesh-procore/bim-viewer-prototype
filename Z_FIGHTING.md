# Z-Fighting Mitigation in Default Render Mode

Engineering notes on the blotchy/patchy shading we used to see on flat BIM
surfaces in Default render mode, what caused it, what we shipped, and the
follow-up plan if we ever want to fully eliminate it.

## The symptom

On the Vortex and Condos sample models, large flat surfaces (roof slabs, wall
finishes, parapet caps) showed irregular dark/light patches that swapped
between two distinct material colors in jagged bands. The patches were
concentrated at junctions where multiple BIM layers terminated at the same
plane — the worst offender was the parapet edge on Condos, where a wall
finish, parapet cap, slab edge, and flashing all share a horizontal seam.

A particularly clear diagnostic: if you selected the affected region, the
patches vanished — not because selection had any depth-fixing magic, but
because the selection material painted every competing surface the same
emissive blue, so the z-fight became invisible.

## Root cause

IFC models genuinely contain coplanar geometry by design — a structural slab
and its topping layer occupy the same Y plane; a stud wall and its finish
share the same vertical plane. The GPU's depth test ties on these surfaces
and picks a winner per pixel, producing the visible patches.

## What we tried (and what didn't work)

| Hypothesis | Verdict |
|---|---|
| Shadow acne from `renderer.shadowMap.enabled = true` | Ruled out — ChromeApp turns shadows off for Default mode |
| `THREE.DoubleSide` back-face shading on non-PBR materials | Ruled out — `__bimDebug.side('front')` did not change the patches |
| Vertex-normal noise from `@thatopen/fragments` serialization | Ruled out — `__bimDebug.flatShadingOn()` did not change the patches |
| Coplanar z-fighting between separate BIM meshes | **Confirmed** — matches the color-swap pattern, the seam concentration, and the selection-masks-it behavior |

The diagnostic was wired up as `window.__bimDebug` (a transient
`src/chrome/app/zFightDebug.ts` file — deleted once the cause was known).

## What's shipping

In `IFCLoader.finalizeMeshAfterReveal`:

- **Hash-based polygonOffset spread.** The old `(revealIndex % 7) * 0.35`
  scheme had only 7 buckets across thousands of meshes — collisions were
  guaranteed. The new scheme hashes `mesh.id` (Mulberry32) into one of 4096
  buckets, each `step = 255/4096 ≈ 0.0623` polygonOffsetUnits apart.
- **Transparent materials are skipped.** Window glass goes through Three.js's
  transparent render pass, which sorts by depth. Large polygonOffset values
  scramble that sort and break window rendering (black/missing panes).
  Transparent materials get `polygonOffset = false` and rely on Three's
  normal transparency sorting.

The constants live at the top of `IFCLoader.js` as `POLY_OFFSET_BUCKETS`,
`POLY_OFFSET_MAX_UNITS`, and `POLY_OFFSET_STEP`.

### Collision probability with 4096 buckets

For K coplanar meshes sharing a plane, the chance of any pair landing in the
same bucket is approximately `K² / (2 × 4096)`:

| K (coplanar meshes) | P(collision) |
|---|---|
| 5 (typical wall/slab assembly) | ~0.3% |
| 10 | ~1.2% |
| 20 (dense parapet junction) | ~4.9% |

In practice the Condos parapet seam is the worst case we've seen — minor
residual speckle remains there, but the jagged crosshatch is gone. Other
models (Vortex, Tower) are clean to the eye.

## Known limitations

- **Random-hash bucketing is fundamentally bucket-limited.** Two specific
  meshes that hash-collide always do. We bumped to 16384 buckets during
  testing and saw no further visible improvement, which suggests we've hit
  the diminishing-returns regime — the residual artifacts are likely
  collisions in dense seams that won't be solved by more buckets alone.
- **Tested visually, not measured.** There's no automated z-fight metric —
  regressions would have to be caught by eye.

## Things to know before changing this code

- **Do not put back the `(revealIndex % 7)` scheme.** With ~2,500+ meshes
  per model, 7 buckets means ~360 meshes share each bucket. Any two
  coplanar meshes in the same bucket z-fight.
- **Do not apply polygonOffset to transparent materials.** It will break
  window rendering (panes go black or render in front of the wall).
- **`mesh.id` must be stable across reloads.** Three.js auto-assigns it on
  Object3D construction; as long as `@thatopen/fragments` constructs meshes
  in a deterministic order from the `.frag` data (it does), the hash buckets
  will be stable. If the loader is ever swapped for one with non-deterministic
  mesh ordering, the bucket assignment will shimmer between sessions.

## Future work — Tier 1: load-time coplanar grouping

If the residual speckle ever becomes a real complaint, the path is to stop
spreading offsets randomly and start *detecting* coplanar groups.

**Algorithm sketch:**

1. After all meshes finalize (hook in after the reveal loop), walk each
   mesh once.
2. Sample 1-3 triangles per mesh, compute their world-space planes
   `(nx, ny, nz, d)`.
3. Quantize each plane to a small tolerance (~1mm) → key.
4. Group meshes by plane key.
5. For each group, sort members deterministically (e.g. by `mesh.id`) and
   assign sequential `polygonOffsetUnits = 0, 1, 2, ...`.
6. Guarantees zero collisions *within* each coplanar group.

**Estimated effort:** 1–2 hours for a practical version that handles 80–90%
of cases (meshes dominated by a single plane). Most production BIM viewers
use a variant of this.

**Things that will eat extra time:**

- **Tolerance tuning.** Too tight misses near-coplanar pairs that still
  fight; too loose groups things that aren't actually coplanar. Expect
  30–60 min of iteration across the 5 sample models.
- **World transforms.** Fragment positions are local — need to bake the
  model matrix in before computing plane keys.
- **Streamed meshes.** If new meshes load after the initial pass (does
  streaming do this today?), they need to join existing groups.
- **No automated test.** Verification is eyeball across all sample models.

## Future work — Tier 2: per-face offsets

For meshes that are *not* dominated by a single plane (e.g., a "wall" mesh
that's actually a 6-face box with only 2 sides coplanar with anything else),
Tier 1 still misclassifies them. The robust solution is per-triangle plane
detection, which requires either:

- Splitting each multi-face mesh into single-plane sub-geometries at load
  (expensive), or
- A custom material that reads the offset from a vertex attribute
  (more code, custom shader).

Estimated effort: 3–5 hours. Diminishing returns are real here — the
residual artifacts after Tier 1 will be subtle speckle that most users
wouldn't notice without being told.

## Future work — source-data cleanup

The artifacts ultimately exist because the IFC source has overlapping
coplanar surfaces. A BIM author with the right IFC tools can identify and
remove redundant coplanar pairs at the data level. Outside the scope of the
viewer, but worth flagging if a partner asks why their model fights more
than another.
