import type { ModelViewpoints, Viewpoint, ViewpointsFile, WriteResult } from './types';

const FILE_URL = '/viewpoints.json';
const WRITE_HOME_URL = '/__viewpoints/home';
const WRITE_CUSTOM_URL = '/__viewpoints/custom';
const EMPTY_FILE: ViewpointsFile = { schemaVersion: 3, models: {} };

let cachePromise: Promise<ViewpointsFile> | null = null;

function emptyEntry(): ModelViewpoints {
  return { homeView: null, customViews: [] };
}

// v2 viewpoints didn't carry hiddenObjects or sectioning; fill them in so
// callers can treat every viewpoint as v3 without conditional branches.
function migrateViewpoint(vp: Viewpoint): Viewpoint {
  return {
    ...vp,
    hiddenObjects: vp.hiddenObjects ?? [],
    sectioning: vp.sectioning ?? null,
    markups: vp.markups ?? [],
  };
}

function migrateEntry(entry: ModelViewpoints): ModelViewpoints {
  return {
    homeView: entry.homeView ? migrateViewpoint(entry.homeView) : null,
    customViews: (entry.customViews ?? []).map(migrateViewpoint),
  };
}

function normalize(raw: unknown): ViewpointsFile {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_FILE };
  const r = raw as Partial<ViewpointsFile> & { schemaVersion?: number };
  // Accept v2 and v3 — migrate v2 to v3 on read so callers see one shape.
  if ((r.schemaVersion !== 2 && r.schemaVersion !== 3) || !r.models || typeof r.models !== 'object') {
    return { ...EMPTY_FILE };
  }
  const models: Record<string, ModelViewpoints> = {};
  for (const [modelId, entry] of Object.entries(r.models)) {
    if (entry && typeof entry === 'object') {
      models[modelId] = migrateEntry(entry as ModelViewpoints);
    }
  }
  return { schemaVersion: 3, models };
}

async function fetchFile(): Promise<ViewpointsFile> {
  try {
    // `cache: 'no-cache'` so the chrome always sees the latest committed
    // viewpoints — Vercel's CDN may otherwise serve a stale snapshot for
    // a few minutes after a deploy.
    const res = await fetch(FILE_URL, { cache: 'no-cache' });
    if (!res.ok) return { ...EMPTY_FILE };
    return normalize(await res.json());
  } catch (err) {
    console.warn('[viewpointStore] fetch failed; using empty state', err);
    return { ...EMPTY_FILE };
  }
}

function loadCache(): Promise<ViewpointsFile> {
  if (!cachePromise) cachePromise = fetchFile();
  return cachePromise;
}

export function invalidateCache(): void {
  cachePromise = null;
}

export async function preload(): Promise<void> {
  await loadCache();
}

export async function getModelEntry(modelId: string): Promise<ModelViewpoints> {
  const cache = await loadCache();
  return cache.models[modelId] ?? emptyEntry();
}

export async function getHomeView(modelId: string): Promise<Viewpoint | null> {
  return (await getModelEntry(modelId)).homeView;
}

export async function getCustomViews(modelId: string): Promise<Viewpoint[]> {
  return (await getModelEntry(modelId)).customViews;
}

async function postAndUpdateCache(url: string, body: object): Promise<WriteResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'server-error' };
  }
  if (res.status === 404) return { ok: false, reason: 'writer-unavailable', status: 404 };
  if (!res.ok) return { ok: false, reason: 'server-error', status: res.status };
  try {
    cachePromise = Promise.resolve(normalize(await res.json()));
  } catch {
    cachePromise = null;
  }
  return { ok: true };
}

export async function setHomeView(modelId: string, viewpoint: Viewpoint): Promise<WriteResult> {
  return postAndUpdateCache(WRITE_HOME_URL, { modelId, viewpoint });
}

export async function addCustomView(modelId: string, viewpoint: Viewpoint): Promise<WriteResult> {
  return postAndUpdateCache(WRITE_CUSTOM_URL, { modelId, action: 'add', viewpoint });
}

export async function deleteCustomView(modelId: string, viewpointId: string): Promise<WriteResult> {
  return postAndUpdateCache(WRITE_CUSTOM_URL, { modelId, action: 'delete', viewpointId });
}

export async function renameCustomView(modelId: string, viewpointId: string, name: string): Promise<WriteResult> {
  return postAndUpdateCache(WRITE_CUSTOM_URL, { modelId, action: 'rename', viewpointId, name });
}

export async function reorderCustomViews(modelId: string, viewpoints: Viewpoint[]): Promise<WriteResult> {
  return postAndUpdateCache(WRITE_CUSTOM_URL, { modelId, action: 'reorder', viewpoints });
}

export async function updateCustomView(modelId: string, viewpoint: Viewpoint): Promise<WriteResult> {
  return postAndUpdateCache(WRITE_CUSTOM_URL, { modelId, action: 'update', viewpoint });
}
