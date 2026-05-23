import { useRef, useEffect, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { ChromeLayout } from '../features/chrome-layout';
import { ViewerAdapterProvider } from '../features/viewer-adapter/ViewerAdapterContext';
import { FormFactorProvider } from '../features/form-factor';
import { createModelViewerAdapter } from '../features/viewer-adapter/modelViewerAdapter';
import { mockViewerAdapter } from '../features/viewer-adapter/mockViewerAdapter';
import type { ViewerAdapter, ObjectStreamingState } from '../features/viewer-adapter/types';
import type { ModelEntry } from '../features/header';
// This is the sole engine import — isolated to this entry file.
// @ts-expect-error -- ModelViewer is vanilla JS with no type declarations
import { ModelViewer } from '../../index.js';

// Registered sample models that show up in the header's "Project Model" dropdown.
// Files live in `public/models/`; spaces in filenames are URL-encoded.
const MODELS: readonly ModelEntry[] = [
  { id: 'condos',      label: 'Condos',      url: '/models/condos.frag.gz' },
  { id: 'data-center',   label: 'Data Center',   url: '/models/data-center.frag.gz' },
  { id: 'tower',          label: 'Tower',          url: '/models/tower.frag.gz' },
  { id: 'vortex',        label: 'Vortex Architectural', url: '/models/vortex-architectural.frag.gz' },
  { id: 'mastodon',      label: 'Mastodon',             url: '/models/mastodon.frag.gz' },
] as const;

const DEFAULT_MODEL = MODELS[0];

// Read which sample model the dropdown asked for via `?model=<id>` in the URL.
// We use a URL param + page reload to switch models so the FragmentsManager,
// object tree, properties, and selection state all start from a clean slate.
function getInitialModel(): ModelEntry {
  if (typeof window === 'undefined') return DEFAULT_MODEL;
  const requestedId = new URLSearchParams(window.location.search).get('model');
  return MODELS.find((m) => m.id === requestedId) ?? DEFAULT_MODEL;
}

function setInitialLoadingCamera(viewer: InstanceType<typeof ModelViewer>) {
  // Keep a stable wide framing before any geometry appears.
  viewer.navigation.setCamera(
    { x: 55, y: 40, z: 55 },
    { x: 0, y: 0, z: 0 },
  );
}

export function ChromeApp() {
  // Callback ref backed by state so the effect re-runs when the variant
  // tree remounts the viewer container with a different DOM node.
  const [viewerContainer, setViewerContainerState] = useState<HTMLDivElement | null>(null);
  const setViewerContainer = useCallback((node: HTMLDivElement | null) => {
    setViewerContainerState(node);
  }, []);
  const viewerInstanceRef = useRef<InstanceType<typeof ModelViewer> | null>(null);
  const [adapter, setAdapter] = useState<ViewerAdapter>(mockViewerAdapter);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadRequested, setLoadRequested] = useState(false);
  const initialModelRef = useRef<ModelEntry>(getInitialModel());
  const [activeModelId, setActiveModelId] = useState<string | null>(initialModelRef.current.id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<ObjectStreamingState>({
    streamingSupported: false,
    parserProgress: 0,
    totalObjects: 0,
    streamComplete: false,
    hasError: false,
    phase: 'init',
    bytesLoaded: 0,
    bytesTotal: 0,
  });

  useEffect(() => {
    const container = viewerContainer;
    if (!container) return;

    // If the viewer already exists, this is a variant-tree remount — React unmounted
    // the previous container div, which detached `mv-canvas-container` (the parent
    // of the WebGL canvas). Move it to the new container so the canvas (and the
    // pointer/wheel listeners attached to it) re-appears. Update `viewer.container`
    // so future cursor/class-list mutations target the right element.
    if (viewerInstanceRef.current) {
      const viewer = viewerInstanceRef.current;
      if (viewer.canvasContainer && viewer.canvasContainer.parentNode !== container) {
        container.classList.add('model-viewer');
        container.appendChild(viewer.canvasContainer);
        viewer.container = container;
      }
      return;
    }

    const viewer = new ModelViewer(container, {
      showToolbar: false,
      showStatusBar: false,
      showGrid: false,
      showLoadingOverlay: false,
      autoZoomOnLoad: false,
      autoZoomOnObjectLoadStart: false,
    });
    viewerInstanceRef.current = viewer;

    viewer.on('ready', () => {
      console.log('[ChromeApp] viewer ready — switching to real adapter');

      const scene = viewer.sceneManager.getScene();
      if (scene?.background?.setHex) {
        scene.background.setHex(0xf3f4f6);
      }
      const renderer = viewer.sceneManager.getRenderer();
      if (renderer?.shadowMap) {
        renderer.shadowMap.enabled = false;
      }

      const realAdapter = createModelViewerAdapter(viewer);
      flushSync(() => {
        setAdapter(realAdapter);
      });
      (window as unknown as Record<string, unknown>).__viewerAdapterReady = true;

      // Auto-load the default sample model
      setLoadRequested(true);
      setModelLoaded(true);
      setInitialLoadingCamera(viewer);
      const initial = initialModelRef.current;
      viewer.loadModel(initial.url, initial.label).catch((err: unknown) => {
        console.error('Failed to auto-load default model:', err);
        setModelLoaded(false);
        setLoadError('Failed to load model. Please try again.');
      });
    });

    viewer.on('error', (data: unknown) => {
      console.error('[ChromeApp] viewer error:', data);
    });

    viewer.on('load-complete', () => {
      setModelLoaded(true);
    });

    (window as unknown as Record<string, unknown>).viewer = viewer;
  }, [viewerContainer]);

  const handleSelectModel = useCallback(
    async (model: ModelEntry) => {
      if (model.id === activeModelId) return;

      const viewer = viewerInstanceRef.current;
      if (!viewer) return;

      setActiveModelId(model.id);
      setLoadError(null);
      setLoadRequested(true);
      setModelLoaded(true);
      // Reset streaming state so the progress bar starts fresh for the new model.
      setStreamingState({
        streamingSupported: false,
        parserProgress: 0,
        totalObjects: 0,
        streamComplete: false,
        hasError: false,
        phase: 'init',
        bytesLoaded: 0,
        bytesTotal: 0,
      });

      viewer.clearAllModels();
      // Immediately rebuild the object tree from the now-empty model list so the
      // previous model's tree isn't visible during the new model's load.
      if (viewer.objectTree) viewer.objectTree.buildTree();
      if (viewer.treePanel?.isOpen) viewer.treePanel.refresh();
      setInitialLoadingCamera(viewer);

      try {
        await viewer.loadModel(model.url, model.label);
      } catch (err) {
        console.error('Failed to switch model:', err);
        setLoadError('Failed to load model. Please try again.');
      }
    },
    [activeModelId],
  );

  useEffect(() => {
    if (!adapter.subscribeObjectStreamingState || !adapter.getObjectStreamingState) {
      return;
    }

    setStreamingState(adapter.getObjectStreamingState());
    const unsubscribe = adapter.subscribeObjectStreamingState((nextState) => {
      setStreamingState(nextState);
    });

    return unsubscribe;
  }, [adapter]);

  const showStreamingIndicator =
    loadRequested &&
    !streamingState.streamComplete &&
    !streamingState.hasError &&
    (streamingState.streamingSupported || streamingState.parserProgress > 0);

  // Phase-weighted progress percentage. Bar fill flows smoothly through phases
  // — there's no special parse animation, so the bar simply rests at 55%
  // during parse and resumes filling once reveal begins.
  //   init     0–10%   step (single milestone — no continuous % to report)
  //   download 10–55%  bytesLoaded / bytesTotal
  //   parse    55%     resting fill while web-ifc parses (no progress source)
  //   reveal   80–100% real per-batch progress from progressivelyRevealModel
  //   complete 100%
  const phasePercent = (() => {
    switch (streamingState.phase) {
      case 'init':
        return 5;
      case 'download': {
        const ratio = streamingState.bytesTotal > 0
          ? Math.min(1, streamingState.bytesLoaded / streamingState.bytesTotal)
          : 0;
        return 10 + ratio * 45;
      }
      case 'parse':
        return 55;
      case 'reveal':
        return 80 + Math.max(0, Math.min(1, streamingState.parserProgress)) * 20;
      case 'complete':
        return 100;
      case 'error':
        return 100;
      default:
        return 0;
    }
  })();
  const phaseProgressPercent = Math.round(phasePercent);

  const formatBytes = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${n} B`;
  };
  let phaseLabel = 'Loading';
  let phaseDetail = '';
  switch (streamingState.phase) {
    case 'init':
      phaseLabel = 'Initializing viewer';
      phaseDetail = '';
      break;
    case 'download':
      phaseLabel = 'Downloading model';
      phaseDetail = streamingState.bytesTotal > 0
        ? `${formatBytes(streamingState.bytesLoaded)} / ${formatBytes(streamingState.bytesTotal)}`
        : formatBytes(streamingState.bytesLoaded);
      break;
    case 'parse':
      phaseLabel = 'Parsing geometry';
      phaseDetail = 'This can take a minute on large models';
      break;
    case 'reveal':
      phaseLabel = 'Loading objects';
      phaseDetail = streamingState.totalObjects > 0
        ? `${Math.round(streamingState.parserProgress * streamingState.totalObjects)} / ${streamingState.totalObjects} objects`
        : `${phaseProgressPercent}%`;
      break;
    case 'complete':
      phaseLabel = 'Done';
      phaseDetail = '';
      break;
    case 'error':
      phaseLabel = 'Failed to load';
      phaseDetail = '';
      break;
  }

  return (
    <FormFactorProvider>
    <ViewerAdapterProvider adapter={adapter}>
      <ChromeLayout
        viewerContainerRef={setViewerContainer}
        showOverlays={loadRequested}
        streamingProgress={showStreamingIndicator ? phaseProgressPercent : null}
        streamingLabel={phaseLabel}
        streamingDetail={phaseDetail}
        models={MODELS}
        activeModelId={activeModelId}
        onSelectModel={handleSelectModel}
      />
      {loadError && (
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 shadow-md text-sm text-red-700 whitespace-nowrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {loadError}
          <button
            type="button"
            onClick={() => setLoadError(null)}
            aria-label="Dismiss"
            className="ml-1 text-red-400 hover:text-red-600 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </ViewerAdapterProvider>
    </FormFactorProvider>
  );
}
