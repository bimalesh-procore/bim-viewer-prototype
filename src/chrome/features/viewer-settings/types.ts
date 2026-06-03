export interface RenderToggles {
  mesh: boolean;
  lines: boolean;
  terrain: boolean;
  pointCloud: boolean;
}

export type RenderToggleKey = keyof RenderToggles;

export interface ViewerSettings {
  isOrthographic: boolean;
  isXRayActive: boolean;
  renderToggles: RenderToggles;
  toggleOrthographic: () => void;
  toggleXRay: () => void;
  setRenderToggle: (key: RenderToggleKey, value: boolean) => void;
  /** Set x-ray to a specific value (idempotent — safe to call when already in that state). */
  setXRay: (active: boolean) => void;
  /** Replace all render toggles at once (used when restoring a saved viewpoint). */
  setRenderToggles: (toggles: RenderToggles) => void;
}
