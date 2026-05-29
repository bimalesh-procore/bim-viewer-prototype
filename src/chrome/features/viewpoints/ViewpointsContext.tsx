import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as store from './viewpointStore';
import type { Viewpoint, ViewpointFolder, WriteResult } from './types';

interface ViewpointsApi {
  activeModelId: string | null;
  getHomeView: () => Promise<Viewpoint | null>;
  setHomeView: (viewpoint: Viewpoint) => Promise<WriteResult>;
  folders: ViewpointFolder[];
  customViews: Viewpoint[];
  addCustomView: (viewpoint: Viewpoint) => Promise<WriteResult>;
  updateCustomView: (id: string, viewpoint: Viewpoint) => Promise<WriteResult>;
  deleteCustomView: (id: string) => Promise<WriteResult>;
  renameCustomView: (id: string, name: string) => Promise<WriteResult>;
  reorderCustomViews: (viewpoints: Viewpoint[]) => Promise<WriteResult>;
}

const ViewpointsContext = createContext<ViewpointsApi | null>(null);

interface ProviderProps {
  activeModelId: string | null;
  children: React.ReactNode;
}

export function ViewpointsProvider({ activeModelId, children }: ProviderProps) {
  const [folders, setFolders] = useState<ViewpointFolder[]>([]);
  const [customViews, setCustomViews] = useState<Viewpoint[]>([]);

  useEffect(() => {
    if (!activeModelId) { setFolders([]); setCustomViews([]); return; }
    store.getModelEntry(activeModelId).then((entry) => {
      setFolders(entry.folders);
      setCustomViews(entry.customViews);
    });
  }, [activeModelId]);

  const refreshCustomViews = useCallback(async () => {
    if (!activeModelId) return;
    const entry = await store.getModelEntry(activeModelId);
    setFolders(entry.folders);
    setCustomViews(entry.customViews);
  }, [activeModelId]);

  const getHomeView = useCallback(async () => {
    if (!activeModelId) return null;
    return store.getHomeView(activeModelId);
  }, [activeModelId]);

  const setHomeView = useCallback(async (viewpoint: Viewpoint): Promise<WriteResult> => {
    if (!activeModelId) return { ok: false, reason: 'no-active-model' };
    return store.setHomeView(activeModelId, viewpoint);
  }, [activeModelId]);

  const addCustomView = useCallback(async (viewpoint: Viewpoint): Promise<WriteResult> => {
    if (!activeModelId) return { ok: false, reason: 'no-active-model' };
    const result = await store.addCustomView(activeModelId, viewpoint);
    if (result.ok) await refreshCustomViews();
    return result;
  }, [activeModelId, refreshCustomViews]);

  const updateCustomView = useCallback(async (id: string, viewpoint: Viewpoint): Promise<WriteResult> => {
    if (!activeModelId) return { ok: false, reason: 'no-active-model' };
    const result = await store.updateCustomView(activeModelId, { ...viewpoint, id });
    if (result.ok) await refreshCustomViews();
    return result;
  }, [activeModelId, refreshCustomViews]);

  const deleteCustomView = useCallback(async (id: string): Promise<WriteResult> => {
    if (!activeModelId) return { ok: false, reason: 'no-active-model' };
    const result = await store.deleteCustomView(activeModelId, id);
    if (result.ok) await refreshCustomViews();
    return result;
  }, [activeModelId, refreshCustomViews]);

  const renameCustomView = useCallback(async (id: string, name: string): Promise<WriteResult> => {
    if (!activeModelId) return { ok: false, reason: 'no-active-model' };
    const result = await store.renameCustomView(activeModelId, id, name);
    if (result.ok) await refreshCustomViews();
    return result;
  }, [activeModelId, refreshCustomViews]);

  const reorderCustomViews = useCallback(async (viewpoints: Viewpoint[]): Promise<WriteResult> => {
    if (!activeModelId) return { ok: false, reason: 'no-active-model' };
    const result = await store.reorderCustomViews(activeModelId, viewpoints);
    if (result.ok) await refreshCustomViews();
    return result;
  }, [activeModelId, refreshCustomViews]);

  const api = useMemo<ViewpointsApi>(
    () => ({ activeModelId, getHomeView, setHomeView, folders, customViews, addCustomView, updateCustomView, deleteCustomView, renameCustomView, reorderCustomViews }),
    [activeModelId, getHomeView, setHomeView, folders, customViews, addCustomView, updateCustomView, deleteCustomView, renameCustomView, reorderCustomViews],
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
