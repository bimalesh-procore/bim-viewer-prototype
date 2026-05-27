import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import type { RenderToggleKey, RenderToggles, ViewerSettings } from './types';

const ViewerSettingsContext = createContext<ViewerSettings | null>(null);

const DEFAULT_RENDER_TOGGLES: RenderToggles = {
  mesh: true,
  lines: true,
  terrain: true,
  pointCloud: true,
};

export function ViewerSettingsProvider({ children }: { children: React.ReactNode }) {
  const adapter = useViewerAdapter();
  const [isOrthographic, setIsOrthographic] = useState<boolean>(
    () => adapter.isOrthographic?.() ?? false,
  );
  const [isXRayActive, setIsXRayActive] = useState<boolean>(
    () => adapter.isXRayActive?.() ?? false,
  );
  const [renderToggles, setRenderToggles] = useState<RenderToggles>(DEFAULT_RENDER_TOGGLES);

  const toggleOrthographic = useCallback(() => {
    adapter.toggleOrthographic?.();
    setIsOrthographic((prev) => !prev);
  }, [adapter]);

  const toggleXRay = useCallback(() => {
    adapter.toggleXRay?.();
    setIsXRayActive((prev) => !prev);
  }, [adapter]);

  const setRenderToggle = useCallback((key: RenderToggleKey, value: boolean) => {
    setRenderToggles((prev) => ({ ...prev, [key]: value }));
  }, []);

  const value = useMemo<ViewerSettings>(
    () => ({
      isOrthographic,
      isXRayActive,
      renderToggles,
      toggleOrthographic,
      toggleXRay,
      setRenderToggle,
    }),
    [isOrthographic, isXRayActive, renderToggles, toggleOrthographic, toggleXRay, setRenderToggle],
  );

  return (
    <ViewerSettingsContext.Provider value={value}>{children}</ViewerSettingsContext.Provider>
  );
}

export function useViewerSettings(): ViewerSettings {
  const ctx = useContext(ViewerSettingsContext);
  if (!ctx) {
    throw new Error('useViewerSettings must be used within a ViewerSettingsProvider');
  }
  return ctx;
}
