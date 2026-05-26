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
  }

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
    if (!this.postproduction) this._build();

    const sm = this.viewer.sceneManager;
    this._savedColorSpace = sm.renderer.outputColorSpace;
    this._savedToneMapping = sm.renderer.toneMapping;
    this._savedToneMappingExposure = sm.renderer.toneMappingExposure;
    this._savedShadowMapEnabled = sm.renderer.shadowMap.enabled;

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

    this.enabled = false;
  }

  resize(width, height) {
    if (this.postproduction) this._resizePostproduction(width, height);
  }

  // Bypass the broken Postproduction.setSize, which toggles custom on/off
  // around the resize and triggers updatePasses each time — that method has a
  // bug in @thatopen/components-front@2.4.12 where it removes passes from
  // composer.passes while iterating with for...of, so passes get duplicated.
  // Resize the individual passes directly instead.
  _resizePostproduction(width, height) {
    const pp = this.postproduction;
    if (!pp || !pp.composer) return;
    pp.composer.setSize(width, height);
    pp.basePass?.setSize?.(width, height);
    pp.n8ao?.setSize?.(width, height);
    pp.customEffects?.setSize?.(width, height);
    pp.gammaPass?.setSize?.(width, height);
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
