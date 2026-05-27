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
}
