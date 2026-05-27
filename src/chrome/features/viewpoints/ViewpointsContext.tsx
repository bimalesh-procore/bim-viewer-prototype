import { createContext, useCallback, useContext, useMemo } from 'react';
import * as store from './viewpointStore';
import type { Viewpoint, WriteResult } from './types';

interface ViewpointsApi {
  // The model the chrome currently considers active. May be null before a model is loaded.
  activeModelId: string | null;
  // Async because the source of truth is a file fetched from the dev/static server.
  getHomeView: () => Promise<Viewpoint | null>;
  setHomeView: (viewpoint: Viewpoint) => Promise<WriteResult>;
  getCustomViews: () => Promise<Viewpoint[]>;
}

const ViewpointsContext = createContext<ViewpointsApi | null>(null);

interface ProviderProps {
  activeModelId: string | null;
  children: React.ReactNode;
}

export function ViewpointsProvider({ activeModelId, children }: ProviderProps) {
  const getHomeView = useCallback(async () => {
    if (!activeModelId) return null;
    return store.getHomeView(activeModelId);
  }, [activeModelId]);

  const setHomeView = useCallback(async (viewpoint: Viewpoint): Promise<WriteResult> => {
    if (!activeModelId) return { ok: false, reason: 'no-active-model' };
    return store.setHomeView(activeModelId, viewpoint);
  }, [activeModelId]);

  const getCustomViews = useCallback(async () => {
    if (!activeModelId) return [];
    return store.getCustomViews(activeModelId);
  }, [activeModelId]);

  const api = useMemo<ViewpointsApi>(
    () => ({ activeModelId, getHomeView, setHomeView, getCustomViews }),
    [activeModelId, getHomeView, setHomeView, getCustomViews],
  );

  return <ViewpointsContext.Provider value={api}>{children}</ViewpointsContext.Provider>;
}

export function useViewpoints(): ViewpointsApi {
  const ctx = useContext(ViewpointsContext);
  if (!ctx) {
    throw new Error('useViewpoints must be used within a ViewpointsProvider');
  }
  return ctx;
}
