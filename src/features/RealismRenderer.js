import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import { Postproduction } from '@thatopen/components-front';

/**
 * Wraps That Open's `Postproduction` effect stack (N8AO GTAO + edge detection
 * + gamma) around the existing WebGLRenderer. Because we feed the inner
 * Postproduction class our own renderer instead of using the wrapper
 * `PostproductionRenderer`, no new canvas is mounted — the same DOM element
 * receives the post-processed frames, so every pointer/wheel listener bound
 * by Navigation, Selection, and Sectioning continues to work unchanged.
 */
export class RealismRenderer {
  constructor(viewer) {
    this.viewer = viewer;
    this.enabled = false;
    this.components = null;
    this.postproduction = null;
    this._world = null;
    // Postproduction.initialize() rewrites outputColorSpace and toneMapping on
    // the renderer it's given. Snapshot the originals so disable() can restore
    // them and Default mode looks identical to before Realism was ever touched.
    this._savedColorSpace = null;
    this._savedToneMapping = null;
    this._savedToneMappingExposure = null;
    // Phase 2 — cast shadows on/off. Default mode keeps shadows disabled per
    // ChromeApp; Realism flips them on.
    this._savedShadowMapEnabled = null;
    this._onCameraChange = null;
    // Phase 3 — lighting boost while Realism is on. We snapshot Ambient +
    // Hemisphere intensities on enable() and multiply by LIGHT_BOOST so the
    // post-processed image isn't visibly darker than Default mode. NoToneMapping
    // (forced by Postproduction.initialize) + N8AO + edge pass all subtract
    // perceived brightness; boosting fill light compensates without touching the
    // DirectionalLight (which would also shift the shadow look).
    this._lightSnapshots = [];
  }

  // Tuning constants for the post-process chain. Defaults inherited from the
  // package are too aggressive for dense BIM geometry — edges read as a
  // wireframe overlay and AO darkens every join. See REALISM.md for the package
  // defaults we're overriding and the rationale.
  static EDGE_OPACITY = 0.2;       // package default 0.4
  static EDGE_TOLERANCE = 6;       // package default 3 — higher = fewer edges
  static EDGE_LINE_COLOR = 0xbbbbbb; // package default 0x999999
  static AO_INTENSITY = 2.5;       // newSaoPass default 4
  static AO_RADIUS = 1;            // newSaoPass default 1 (unchanged; left here for visibility)
  static LIGHT_BOOST = 1.3;        // ambient + hemisphere multiplier

  _build() {
    const sm = this.viewer.sceneManager;
    const renderer = sm.renderer;
    this.components = new OBC.Components();

    // Minimal world wrapper. Postproduction only reads `.scene.three`,
    // `.camera.three`, and a few `world.renderer` shape-bits (clippingPlanes,
    // getSize). A getter on `.camera.three` keeps us correct across the
    // ortho↔perspective camera swap that Navigation.setOrthographic does.
    this._world = {
      scene: { three: sm.scene },
      camera: {
        get three() { return sm.camera; },
      },
      renderer: {
        three: renderer,
        get clippingPlanes() { return renderer.clippingPlanes; },
        getSize() {
          const v = new THREE.Vector2();
          renderer.getSize(v);
          return { width: v.x, height: v.y };
        },
      },
    };

    this.postproduction = new Postproduction(this.components, renderer, this._world);
    // Pre-set _settings.ao = true BEFORE triggering initialize. Postproduction
    // defaults to ao=false; calling setPasses() AFTER initialize hits an
    // iteration bug in updatePasses (it mutates composer.passes while iterating
    // with for...of), so passes get duplicated. Setting `_settings.ao` directly
    // means initialize's own updatePasses constructs the pass list correctly on
    // the first try. (custom + gamma default to true; no other tweaks needed.)
    this.postproduction._settings.ao = true;
    // Triggers Postproduction.initialize(). We leave `enabled = true` permanently
    // and gate "is realism on" via SceneManager.setRenderOverride() — the
    // composer only runs when the override is installed.
    this.postproduction.enabled = true;

    // Sync the composer's pixel ratio to the renderer's. EffectComposer does
    // NOT auto-inherit pixelRatio from the renderer it wraps — left at its
    // default (1.0), its internal render targets are sized at CSS pixels.
    // On a retina display (DPR=2), that's a quarter of the canvas pixel count;
    // the upscale to the canvas reads as a soft/blurry image vs Default mode.
    // Setting it here means composer.setSize(w, h) creates render targets at
    // (w * dpr, h * dpr) — matching the renderer's drawing buffer exactly.
    this.postproduction.composer.setPixelRatio(renderer.getPixelRatio());

    // Post-init tuning. The customEffects + n8ao getters throw before
    // initialize() runs, so this MUST happen after `enabled = true`.
    // CustomEffectsPass: tame the always-on depth+normal Sobel edge pass so
    // dense BIM joins don't read as a wireframe overlay. (Sobel runs regardless
    // of `outlineEnabled`, which controls a separate selection-highlight path.)
    const ce = this.postproduction.customEffects;
    if (ce) {
      ce.opacity = RealismRenderer.EDGE_OPACITY;
      ce.tolerance = RealismRenderer.EDGE_TOLERANCE;
      ce.lineColor = RealismRenderer.EDGE_LINE_COLOR;
    }
    // N8AO: soften the package's newSaoPass override (intensity 4 → 2.5) so AO
    // compounds less with the edge pass and the shadow cast. aoRadius stays at
    // 1; the visible darkness is intensity-dominated at this radius.
    const ao = this.postproduction.n8ao;
    if (ao && ao.configuration) {
      ao.configuration.intensity = RealismRenderer.AO_INTENSITY;
      ao.configuration.aoRadius = RealismRenderer.AO_RADIUS;
    }

    // Re-point the post-processing camera when the user swaps ortho/perspective.
    this._onCameraChange = () => {
      if (this.enabled && this.postproduction) {
        this.postproduction.updateCamera();
      }
    };
    this.viewer.navigation.on('camera-change', this._onCameraChange);
  }

  enable() {
    if (this.enabled) return;

    // Snapshot BEFORE _build(). _build() calls postproduction.enabled = true,
    // which runs Postproduction.initialize() and overwrites renderer.toneMapping
    // (→ NoToneMapping) and outputColorSpace (→ "srgb"). Snapshotting after
    // would capture the overridden values, so disable() could never restore
    // Default mode's original tone-mapping curve.
    const sm = this.viewer.sceneManager;
    this._savedColorSpace = sm.renderer.outputColorSpace;
    this._savedToneMapping = sm.renderer.toneMapping;
    this._savedToneMappingExposure = sm.renderer.toneMappingExposure;
    this._savedShadowMapEnabled = sm.renderer.shadowMap.enabled;

    if (!this.postproduction) this._build();

    // Sync passes to current viewport size (the renderer may have resized
    // between _build and enable, especially if Realism is the URL default).
    const size = new THREE.Vector2();
    sm.renderer.getSize(size);
    this._resizePostproduction(size.x, size.y);

    // Enable cast shadows. SceneManager already has a directional light
    // configured with `castShadow = true` and a shadow map; ChromeApp disables
    // the renderer-level flag for Default mode (see ChromeApp.tsx). Flipping it
    // back on here makes the existing infrastructure render shadows. Mesh
    // castShadow/receiveShadow flags are set by IFCLoader.finalizeMeshAfterReveal.
    sm.renderer.shadowMap.enabled = true;
    sm.renderer.shadowMap.needsUpdate = true;

    // Boost ambient + hemisphere intensities to compensate for the post-process
    // chain darkening the image. DirectionalLight is intentionally left alone
    // so the shadow contribution doesn't shift.
    this._lightSnapshots = [];
    sm.scene.traverse((obj) => {
      if (obj.isAmbientLight || obj.isHemisphereLight) {
        this._lightSnapshots.push({ light: obj, intensity: obj.intensity });
        obj.intensity = obj.intensity * RealismRenderer.LIGHT_BOOST;
      }
    });

    sm.setRenderOverride(() => this.postproduction.composer.render());
    this.enabled = true;
  }

  disable() {
    if (!this.enabled) return;
    const sm = this.viewer.sceneManager;
    sm.setRenderOverride(null);
    // Leave postproduction.enabled = true permanently — see _build(). The
    // composer simply isn't called because setRenderOverride(null) makes
    // SceneManager.animate() fall back to the default renderer.render().

    // Restore the renderer settings that Postproduction.initialize() overrode.
    sm.renderer.outputColorSpace = this._savedColorSpace ?? THREE.SRGBColorSpace;
    sm.renderer.toneMapping = this._savedToneMapping ?? THREE.ACESFilmicToneMapping;
    sm.renderer.toneMappingExposure = this._savedToneMappingExposure ?? 1.0;

    // Restore the shadow-map enabled flag (Default mode has it off).
    sm.renderer.shadowMap.enabled = this._savedShadowMapEnabled ?? false;
    sm.renderer.shadowMap.needsUpdate = true;

    // Restore pre-boost light intensities so Default mode matches a fresh load.
    for (const snap of this._lightSnapshots) {
      snap.light.intensity = snap.intensity;
    }
    this._lightSnapshots = [];

    this.enabled = false;
  }

  resize(width, height) {
    if (this.postproduction) this._resizePostproduction(width, height);
  }

  // Bypass the broken Postproduction.setSize, which toggles custom on/off
  // around the resize and triggers updatePasses each time — that method has a
  // bug in @thatopen/components-front@2.4.12 where it removes passes from
  // composer.passes while iterating with for...of, so passes get duplicated.
  //
  // EffectComposer.setSize is safe: it iterates this.passes without mutating,
  // calling pass.setSize(width * pixelRatio, height * pixelRatio) on each.
  // Because we sync composer.setPixelRatio to the renderer's DPR in _build(),
  // composer.setSize alone produces correctly-sized render targets for every
  // pass — no manual per-pass setSize calls needed. (Re-syncing pixelRatio on
  // resize too, in case the canvas is moved to a screen with a different DPR.)
  _resizePostproduction(width, height) {
    const pp = this.postproduction;
    if (!pp || !pp.composer) return;
    const dpr = this.viewer.sceneManager.renderer.getPixelRatio();
    if (pp.composer._pixelRatio !== dpr) pp.composer.setPixelRatio(dpr);
    pp.composer.setSize(width, height);
  }

  dispose() {
    this.disable();
    if (this._onCameraChange) {
      this.viewer.navigation.off('camera-change', this._onCameraChange);
      this._onCameraChange = null;
    }
    if (this.postproduction) this.postproduction.dispose();
    if (this.components) this.components.dispose();
    this.postproduction = null;
    this.components = null;
    this._world = null;
  }
}
