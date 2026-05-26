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
    // ao: GTAO ambient occlusion. custom: edge detection + outlines. gamma:
    // linear→sRGB final conversion (replaces the renderer's own sRGB output
    // path while postproduction is active).
    this.postproduction.setPasses({ ao: true, custom: true, gamma: true });

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

    this.postproduction.enabled = true;
    // Sync passes to current viewport size (the renderer may have resized
    // between _build and enable, especially if Realism is the URL default).
    const size = new THREE.Vector2();
    sm.renderer.getSize(size);
    this.postproduction.setSize(size.x, size.y);

    sm.setRenderOverride(() => this.postproduction.composer.render());
    this.enabled = true;
  }

  disable() {
    if (!this.enabled) return;
    const sm = this.viewer.sceneManager;
    sm.setRenderOverride(null);
    if (this.postproduction) this.postproduction.enabled = false;

    // Restore the renderer settings that Postproduction.initialize() overrode.
    sm.renderer.outputColorSpace = this._savedColorSpace ?? THREE.SRGBColorSpace;
    sm.renderer.toneMapping = this._savedToneMapping ?? THREE.ACESFilmicToneMapping;
    sm.renderer.toneMappingExposure = this._savedToneMappingExposure ?? 1.0;

    this.enabled = false;
  }

  resize(width, height) {
    if (this.postproduction) this.postproduction.setSize(width, height);
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
