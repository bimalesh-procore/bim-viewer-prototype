import orbitCursor from '../../assets/cursors/orbit-cursor.svg';
import type {
  ViewerAdapter,
  ViewOrientation,
  ObjectStreamingState,
  InteractionMode,
  GlobalSearchObjectEntry,
  ActionHistorySummary,
  ActionHistoryCategory,
  ViewData,
  ViewFolder,
  PropertyGroup,
  ViewpointStateSnapshot,
} from './types';
import * as THREE from 'three';

/**
 * Shape of the ModelViewer instance we consume.
 * Defined locally so Chrome code never imports engine types directly.
 */
interface ModelViewerInstance {
  container?: HTMLElement;
  navigation: {
    zoom(delta: number): void;
    zoomToFit(): void;
    zoomToSelection(meshes: unknown[]): void;
    setMode(mode: 'orbit' | 'pan' | 'firstPerson' | 'fly'): void;
    setCamera(
      position: { x: number; y: number; z: number },
      target: { x: number; y: number; z: number },
    ): void;
    getCamera(): {
      position: { x: number; y: number; z: number };
      target:   { x: number; y: number; z: number };
    };
    getEffectiveCamera(): {
      position: { x: number; y: number; z: number };
      target:   { x: number; y: number; z: number };
    };
    setOrthographic(enabled: boolean): void;
    getIsOrthographic(): boolean;
    setControlsEnabled?(enabled: boolean): void;
    on(event: string, callback: (data: unknown) => void): void;
  };
  selection: {
    getSelected(): string[];
    getSelectedMeshes(): unknown[];
    selectByIds(ids: string[]): void;
    deselect(): void;
    setHoverEnabled?(enabled: boolean): void;
    setContextMenuEnabled?(enabled: boolean): void;
  };
  visibility: {
    showAll(): void;
    show(ids: string[]): void;
    isolate(ids: string[]): void;
    hide(ids: string[]): void;
    getMeshByElementId(id: string): unknown | null;
    getHiddenElements(): string[];
    on(event: string, callback: (data: unknown) => void): void;
    off(event: string, callback: (data: unknown) => void): void;
  };
  objectTree: {
    nodeMap: Map<string, {
      id: string;
      type: string;
      name: string;
      ifcType?: string;
      elementId?: string;
      children?: unknown[];
    }>;
    elementToNode: Map<string, string>;
    treeData: unknown[];
  } | null;
  sectioning: {
    addClipPlane(normal: THREE.Vector3, point: THREE.Vector3): void;
    clearClipPlanes(): void;
    setActiveTool(tool: 'section-plane' | 'section-box' | 'section-cut' | null): void;
    activateSectionBox(): void;
    clearSectionBox(): void;
    hasSectionBox(): boolean;
    clearAll(): void;
    setSectionBoxVisible(visible: boolean): void;
    flipActivePlane(): boolean;
    deleteActivePlane(): boolean;
    setPlaneContextMenuOpen(open: boolean): void;
    setBoxSubTool(tool: 'drag-face' | 'move' | 'rotate'): void;
    activeSectionPlaneId: string | null;
    undo(): void;
    redo(): void;
    resetMode(): void;
    clearHistory(): void;
    on(event: string, callback: (data: unknown) => void): void;
    getClipPlanes(): Array<{ id: string }>;
    serializeState(): unknown;
    restoreState(snapshot: unknown): void;
  };
  treePanel: {
    toggle(): void;
  };
  searchSets: {
    getAll(): Array<{ id: string; name: string; createdAt: string }>;
    executeAndSelect(id: string): void;
    delete(id: string): void;
  };
  views: {
    createView(name?: string): ViewData;
    selectView(id: string): ViewData | null;
    deselectView(): void;
    deleteView(id: string): void;
    renameView(id: string, name: string): void;
    getViews(): ViewData[];
    getSelectedViewId(): string | null;
    getSelectedView(): ViewData | null;
    getView(id: string): ViewData | null;
    getMarkups(viewId: string): unknown[];
    setViewMarkups(viewId: string, markups: unknown[]): void;
    clearMarkups(viewId: string): void;
    createFolder(name: string, parentFolderId?: string | null): ViewFolder;
    deleteFolder(id: string): void;
    renameFolder(id: string, name: string): void;
    getFolders(): ViewFolder[];
    isCameraTransitioning?(): boolean;
    on(event: string, callback: (data: unknown) => void): void;
    off(event: string, callback: (data: unknown) => void): void;
  };
  markup: {
    enable(): void;
    disable(): void;
    isActive: boolean;
    loadMarkups(markups: unknown[]): void;
    getMarkups(): unknown[];
    showReadOnly(markups: unknown[], fadeIn?: boolean): void;
    hideOverlay(): void;
    setTool(tool: string | null): void;
    setColor(color: string): void;
    color: string;
    undo(): void;
    redo(): void;
    on(event: string, callback: (data: unknown) => void): void;
    off(event: string, callback: (data: unknown) => void): void;
  };
  xray: {
    enable(): void;
    disable(): void;
    toggle(): void;
    isEnabled: boolean;
  };
  resetView(): void;
  setInteractionMode(mode: InteractionMode): void;
  setRenderStyle(style: 'default' | 'realism'): void;
  on(event: string, callback: (data: unknown) => void): ModelViewerInstance;
  off(event: string, callback: (data: unknown) => void): ModelViewerInstance;
}

const ORIENTATIONS: Record<
  ViewOrientation,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  top: { position: [0, 30, 0], target: [0, 0, 0] },
  bottom: { position: [0, -30, 0], target: [0, 0, 0] },
  front: { position: [0, 0, 30], target: [0, 0, 0] },
  back: { position: [0, 0, -30], target: [0, 0, 0] },
  left: { position: [-30, 0, 0], target: [0, 0, 0] },
  right: { position: [30, 0, 0], target: [0, 0, 0] },
  isometric: { position: [20, 20, 20], target: [0, 0, 0] },
};

/**
 * Per-type pools of realistic BIM object names for prototype demos.
 * When a real IFC file has generic names (e.g. "Basic Wall", "Slab"), these
 * are cycled through in order so every element gets a descriptive label.
 */
const DEMO_OBJECT_NAMES: Record<string, string[]> = {
  IFCSLAB: ['Foundation Slab', 'Floor Slab', 'Roof Slab', 'Basement Slab', 'Transfer Slab'],
  IFCWALL: ['Exterior Wall', 'Interior Partition', 'Shear Wall', 'Curtain Wall Panel', 'Retaining Wall', 'Fire Barrier Wall'],
  IFCWALLSTANDARDCASE: ['Exterior Wall', 'Interior Partition', 'Shear Wall', 'Curtain Wall Panel', 'Retaining Wall', 'Fire Barrier Wall'],
  IFCCOLUMN: ['Concrete Column', 'Steel Column', 'Composite Column', 'Transfer Column', 'Perimeter Column'],
  IFCBEAM: ['Steel Beam', 'Transfer Beam', 'Concrete Beam', 'Cantilevered Beam', 'Ridge Beam'],
  IFCDOOR: ['Entry Door', 'Interior Door', 'Sliding Door', 'Emergency Exit Door', 'Double Swing Door'],
  IFCWINDOW: ['Fixed Window', 'Casement Window', 'Curtain Wall Window', 'Skylight', 'Clerestory Window'],
  IFCROOF: ['Flat Roof Panel', 'Pitched Roof Panel', 'Green Roof Section', 'Canopy Panel'],
  IFCSTAIR: ['Main Staircase', 'Emergency Staircase', 'Exterior Stair', 'Scissor Stair'],
  IFCFOOTING: ['Spread Footing', 'Strip Foundation', 'Pile Cap', 'Mat Foundation'],
  IFCPILE: ['Bored Concrete Pile', 'Steel H-Pile', 'Precast Concrete Pile', 'Micro Pile'],
  IFCMEMBER: ['Steel Truss Member', 'Bracing Member', 'Purlin', 'Cold-Formed Channel'],
  IFCRAILING: ['Guardrail', 'Handrail', 'Balustrade', 'Parapet Coping'],
  IFCCURTAINWALL: ['Curtain Wall System', 'Structural Glass Facade', 'Unitized Panel System'],
  IFCCOVERING: ['Acoustic Ceiling Tile', 'Floor Finish', 'Wall Cladding', 'Insulation Board'],
  IFCSPACE: ['Office', 'Conference Room', 'Lobby', 'Mechanical Room', 'Parking Bay'],
  IFCFURNISHINGELEMENT: ['Office Chair', 'Workstation Desk', 'Conference Table', 'Storage Unit'],
  IFCFLOWTERMINAL: ['Air Handler Unit', 'Fan Coil Unit', 'Ceiling Diffuser', 'Return Grille', 'Exhaust Register'],
  IFCFLOWSEGMENT: ['Supply Duct', 'Return Duct', 'Exhaust Duct', 'Chilled Water Pipe', 'Conduit Run', 'Hot Water Pipe'],
  IFCFLOWCONTROLLER: ['VAV Box', 'Volume Damper', 'Balancing Valve', 'Gate Valve', 'Check Valve'],
  IFCFLOWMOVINGDEVICE: ['Chilled Water Pump', 'Condenser Pump', 'Exhaust Fan', 'Supply Fan', 'Circulation Pump'],
  IFCENERGYCONVERSIONDEVICE: ['Chiller', 'Boiler', 'Heat Exchanger', 'Cooling Tower', 'Variable Speed Drive'],
  IFCFLOWSTORAGEELEMENT: ['Expansion Tank', 'Pressure Vessel', 'Holding Tank'],
  IFCFLOWFITTING: ['Elbow Fitting', 'Tee Fitting', 'Reducer Fitting', 'Cross Fitting'],
  IFCELECTRICALELEMENT: ['Electrical Panel', 'Distribution Board', 'UPS Unit', 'Transfer Switch'],
  IFCJUNCTIONBOX: ['Electrical Junction Box', 'Data Junction Box'],
  IFCLIGHTFIXTURE: ['LED Recessed Fixture', 'Linear Fluorescent Fixture', 'Exit Sign', 'Emergency Light'],
  IFCOUTLET: ['Power Outlet', 'Data Outlet', 'USB Outlet'],
  IFCSANITARYTERMINAL: ['Water Closet', 'Lavatory Sink', 'Floor Drain', 'Urinal', 'Shower Unit'],
  IFCPIPEFITTING: ['Pipe Elbow', 'Pipe Tee', 'Pipe Reducer', 'Pipe Cap'],
  IFCPIPESEGMENT: ['Domestic Water Pipe', 'Sanitary Drain Pipe', 'Storm Drain Pipe', 'Gas Supply Pipe'],
};

export function createModelViewerAdapter(
  viewer: ModelViewerInstance,
): ViewerAdapter {
  // Maps expressID → display name so getObjectProperties stays in sync with the tree.
  let objectNameCache = new Map<string, string>();

  const collectObjectList = (): GlobalSearchObjectEntry[] => {
    if (!viewer.objectTree) return [];
    const entries: GlobalSearchObjectEntry[] = [];
    const typeCounters = new Map<string, number>();
    const newCache = new Map<string, string>();

    for (const [, node] of viewer.objectTree.nodeMap) {
      const objectId = node.elementId ?? node.id;
      if (!objectId) continue;

      const rawType = (node.ifcType ?? '').toUpperCase();
      const namePool = DEMO_OBJECT_NAMES[rawType];
      let displayName = node.name;
      if (namePool && namePool.length > 0) {
        const idx = typeCounters.get(rawType) ?? 0;
        displayName = namePool[idx % namePool.length];
        typeCounters.set(rawType, idx + 1);
      }

      newCache.set(objectId, displayName);
      entries.push({
        id: node.id ?? objectId,
        name: displayName,
        ifcType: node.ifcType ?? '',
        expressID: objectId,
      });
    }
    objectNameCache = newCache;
    return entries;
  };

  let loadedModelName: string | null = null;
  let cameraAnimRaf: number | null = null;

  function applyCameraSnapshot(
    snapshot: ViewpointStateSnapshot['camera'],
    options?: { animate?: boolean; durationMs?: number },
  ): void {
    const animate = options?.animate ?? false;
    const durationMs = options?.durationMs ?? 550;

    if (cameraAnimRaf !== null) {
      cancelAnimationFrame(cameraAnimRaf);
      cameraAnimRaf = null;
    }

    const needsProjectionSwitch =
      viewer.navigation.getIsOrthographic() !== snapshot.isOrthographic;

    if (!animate) {
      if (needsProjectionSwitch) {
        viewer.navigation.setOrthographic(snapshot.isOrthographic);
      }
      viewer.navigation.setCamera(snapshot.position, snapshot.target);
      return;
    }

    // See getEffectiveCamera in Navigation.js — start the animation from the
    // camera's actual look direction, not from a stale controls.target.
    const from = viewer.navigation.getEffectiveCamera();
    const fromPos = { x: from.position.x, y: from.position.y, z: from.position.z };
    const fromTarget = { x: from.target.x, y: from.target.y, z: from.target.z };
    const start = performance.now();
    const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / durationMs);
      const t = easeInOutSine(raw);
      viewer.navigation.setCamera(
        {
          x: fromPos.x + (snapshot.position.x - fromPos.x) * t,
          y: fromPos.y + (snapshot.position.y - fromPos.y) * t,
          z: fromPos.z + (snapshot.position.z - fromPos.z) * t,
        },
        {
          x: fromTarget.x + (snapshot.target.x - fromTarget.x) * t,
          y: fromTarget.y + (snapshot.target.y - fromTarget.y) * t,
          z: fromTarget.z + (snapshot.target.z - fromTarget.z) * t,
        },
      );
      if (raw < 1) {
        cameraAnimRaf = requestAnimationFrame(tick);
      } else {
        cameraAnimRaf = null;
        if (needsProjectionSwitch) {
          viewer.navigation.setOrthographic(snapshot.isOrthographic);
          viewer.navigation.setCamera(snapshot.position, snapshot.target);
        }
      }
    };
    cameraAnimRaf = requestAnimationFrame(tick);
  }

  const streamingState: ObjectStreamingState = {
    streamingSupported: false,
    parserProgress: 0,
    totalObjects: 0,
    streamComplete: false,
    hasError: false,
    phase: 'init',
    bytesLoaded: 0,
    bytesTotal: 0,
  };
  const streamingListeners = new Set<(state: ObjectStreamingState) => void>();
  let sectioningActive = false;
  let activeSectionTool: 'section-plane' | 'section-box' | 'section-cut' | null = null;
  const sectioningStateListeners = new Set<(active: boolean) => void>();

  const emitSectioningState = () => {
    // Suppress the element-level right-click menu while in sectioning mode —
    // right-click there is reserved for the plane Flip/Delete menu.
    viewer.selection.setContextMenuEnabled?.(!sectioningActive);
    for (const listener of sectioningStateListeners) {
      listener(sectioningActive);
    }
  };

  const emitStreamingState = () => {
    const snapshot = { ...streamingState };
    for (const listener of streamingListeners) {
      listener(snapshot);
    }
  };

  const onLoadStart = (data: unknown) => {
    const payload = data as { name?: string; url?: string; fileName?: string } | null;
    const rawName = payload?.name ?? payload?.fileName ?? payload?.url?.split('/').pop();
    if (rawName) {
      loadedModelName = decodeURIComponent(rawName).replace(/%20/g, ' ');
    }
    // The bar should appear the instant a load is initiated. This flips the
    // "streamingSupported" gate immediately so ChromeApp's bar visibility
    // condition is satisfied without waiting for the fetch to finish.
    streamingState.streamingSupported = true;
    streamingState.streamComplete = false;
    streamingState.hasError = false;
    streamingState.parserProgress = 0;
    streamingState.totalObjects = 0;
    streamingState.phase = 'init';
    streamingState.bytesLoaded = 0;
    streamingState.bytesTotal = 0;
    emitStreamingState();
  };

  const onLoadProgress = (data: unknown) => {
    const payload = data as { phase?: string; received?: number; total?: number };
    if (payload?.phase === 'download') {
      streamingState.phase = 'download';
      if (typeof payload.received === 'number') streamingState.bytesLoaded = payload.received;
      if (typeof payload.total === 'number') streamingState.bytesTotal = payload.total;
    } else if (payload?.phase === 'parse') {
      streamingState.phase = 'parse';
    } else if (payload?.phase === 'reveal') {
      streamingState.phase = 'reveal';
    }
    emitStreamingState();
  };

  const onStreamCapability = (data: unknown) => {
    const payload = data as { streamingSupported?: boolean };
    streamingState.streamingSupported = Boolean(payload?.streamingSupported);
    streamingState.streamComplete = false;
    streamingState.hasError = false;
    emitStreamingState();
  };

  const onObjectLoadProgress = (data: unknown) => {
    const payload = data as { parserProgress?: number; totalObjects?: number };
    if (typeof payload?.parserProgress === 'number') {
      streamingState.parserProgress = payload.parserProgress;
    }
    if (typeof payload?.totalObjects === 'number') {
      streamingState.totalObjects = payload.totalObjects;
    }
    // Any object-load-progress means we're in (or already past) the reveal
    // phase. Keep phase stuck on 'reveal' here so a late-arriving progress
    // event after model-stream-complete doesn't bump us back from 'complete'.
    if (streamingState.phase !== 'complete' && streamingState.phase !== 'error') {
      streamingState.phase = 'reveal';
    }
    emitStreamingState();
  };

  const onModelStreamComplete = () => {
    streamingState.parserProgress = 1;
    streamingState.streamComplete = true;
    streamingState.phase = 'complete';
    emitStreamingState();
  };

  const onObjectLoadError = () => {
    streamingState.hasError = true;
    streamingState.streamComplete = true;
    streamingState.phase = 'error';
    emitStreamingState();
  };

  viewer.on('load-start', onLoadStart);
  viewer.on('load-progress', onLoadProgress);
  viewer.on('stream-capability', onStreamCapability);
  viewer.on('object-load-progress', onObjectLoadProgress);
  viewer.on('model-stream-complete', onModelStreamComplete);
  viewer.on('object-load-error', onObjectLoadError);
  // When a cut-edit icon is clicked (in or out of sectioning mode),
  // activate sectioning with section-cut tool.
  const requestEditCutListeners = new Set<() => void>();
  viewer.sectioning.on('request-edit-cut', () => {
    if (!sectioningActive) {
      sectioningActive = true;
      emitSectioningState();
    }
    activeSectionTool = 'section-cut';
    viewer.selection.setHoverEnabled?.(false);
    for (const listener of requestEditCutListeners) {
      listener();
    }
  });

  const requestEditPlaneListeners = new Set<(tool: 'section-plane' | 'section-cut') => void>();
  viewer.sectioning.on('request-edit-plane', (payload?: { tool?: 'section-plane' | 'section-cut' }) => {
    if (!sectioningActive) {
      sectioningActive = true;
      emitSectioningState();
    }
    // Preserve the user's active tool when already in a sectioning tool —
    // clicking a wedge icon under section-cut shouldn't kick them back to
    // section-plane. Default to section-plane only when entering sectioning
    // from outside (e.g. clicking the icon while no tool was active).
    const nextTool = payload?.tool === 'section-cut' || payload?.tool === 'section-plane'
      ? payload.tool
      : 'section-plane';
    activeSectionTool = nextTool;
    viewer.selection.setHoverEnabled?.(false);
    for (const listener of requestEditPlaneListeners) {
      listener(nextTool);
    }
  });

  // Track whether there's a plane in edit state (selected). The right
  // toolbar's Flip / Delete buttons enable based on this.
  let activeSectionPlanePresent = Boolean(viewer.sectioning.activeSectionPlaneId);
  const activePlaneListeners = new Set<(present: boolean) => void>();
  const emitActivePlane = () => {
    for (const listener of activePlaneListeners) listener(activeSectionPlanePresent);
  };
  viewer.sectioning.on('active-plane-change', (payload?: { planeId?: string | null }) => {
    const next = Boolean(payload?.planeId);
    if (next !== activeSectionPlanePresent) {
      activeSectionPlanePresent = next;
      emitActivePlane();
    }
  });

  // ── Right-click on a plane → context menu request relayed to React. ──
  const planeContextMenuListeners = new Set<
    (data: { planeId: string; x: number; y: number }) => void
  >();
  viewer.sectioning.on(
    'request-plane-context-menu',
    (payload?: { planeId?: string; x?: number; y?: number }) => {
      if (!payload?.planeId || typeof payload.x !== 'number' || typeof payload.y !== 'number') return;
      for (const listener of planeContextMenuListeners) {
        listener({ planeId: payload.planeId, x: payload.x, y: payload.y });
      }
    },
  );

  // ── Action History Tracking ───────────────────────────────────────
  const actionHistoryListeners = new Set<(s: ActionHistorySummary) => void>();
  let isolateCount = 0;
  // Tracks the count of markups currently shown in the read-only overlay.
  // Updated by showMarkupOverlay / hideMarkupOverlay so the flyout chip stays current.
  let readOnlyMarkupsCount = 0;

  // ── Sectioning view mode state ──────────────────────────────────────
  // Parallel to markup mode: tracks a view-aware sectioning session where
  // changes are drafted per-view and committed (or discarded) on exit.
  let sxModeActive = false;
  let sxViewId: string | null = null;                // external view being edited
  let sxAutoViewId: string | null = null;            // auto-created view (persists across remounts)
  let sxPreModeState: ViewpointStateSnapshot | null = null; // captured on entry for discard restore
  const sxListeners = new Set<(active: boolean) => void>();
  const sxDirtyViews = new Map<string, {
    camera: ViewpointStateSnapshot['camera'];
    sectioning: ViewpointStateSnapshot['sectioning'];
  }>();
  let sxCommitCallback: ((dirty: Array<{
    viewId: string;
    camera: ViewpointStateSnapshot['camera'];
    sectioning: ViewpointStateSnapshot['sectioning'];
  }>) => void) | null = null;

  // ── Markup mode state ───────────────────────────────────────────────
  let markupModeActive = false;
  let markupEditingViewId: string | null = null;   // internal ViewsManager ID
  let markupExternalViewId: string | null = null;  // viewpoint ID from ViewpointsContext
  let markupPersistedMarkups: unknown[] | null = null; // markups as saved on disk when entering
  let markupColor = '#FF0000';
  let readOnlyRevealToken = 0;
  const viewsListeners = new Set<(views: ViewData[], selectedId: string | null) => void>();
  const markupModeActiveListeners = new Set<(active: boolean) => void>();
  const markupChangeListeners = new Set<() => void>();
  // External viewpoint ID → markups for all views touched in the current session.
  const markupDirtyViews = new Map<string, unknown[]>();
  // Called with the full dirty set when exitMarkupMode(true) is invoked.
  let markupCommitCallback: ((dirty: Array<{ viewId: string; markups: unknown[] }>) => void) | null = null;

  const revealReadOnlyMarkupsAfterTransition = (viewId: string, markups: unknown[]) => {
    const token = ++readOnlyRevealToken;
    const tryReveal = () => {
      if (token !== readOnlyRevealToken) return;
      if (viewer.views.getSelectedViewId() !== viewId) return;
      if (viewer.views.isCameraTransitioning?.()) {
        requestAnimationFrame(tryReveal);
        return;
      }
      viewer.markup.showReadOnly(markups, true);
    };
    requestAnimationFrame(tryReveal);
  };

  const MOCK_VIEWS: ViewData[] = [
    { id: 'v1', name: 'Entry Lobby',      folderId: 'f1', cameraPosition: { x: 0, y: 0, z: 0 }, cameraTarget: { x: 0, y: 0, z: 0 }, isOrthographic: false, markups: [],            createdAt: 0, isProjectView: false },
    { id: 'v2', name: 'Level 1 Overview', folderId: 'f1', cameraPosition: { x: 0, y: 0, z: 0 }, cameraTarget: { x: 0, y: 0, z: 0 }, isOrthographic: true,  markups: [{ id: 'm1' } as any], createdAt: 0, isProjectView: true  },
    { id: 'v3', name: 'Stairwell Detail', folderId: 'f2', cameraPosition: { x: 0, y: 0, z: 0 }, cameraTarget: { x: 0, y: 0, z: 0 }, isOrthographic: false, markups: [],            createdAt: 0, isProjectView: false },
    { id: 'v4', name: 'Roof Plan',        folderId: null, cameraPosition: { x: 0, y: 0, z: 0 }, cameraTarget: { x: 0, y: 0, z: 0 }, isOrthographic: true,  markups: [],            createdAt: 0, isProjectView: false },
  ];

  const getViewsToEmit = (): ViewData[] => {
    const live = viewer.views.getViews() as ViewData[];
    const hasRealStructure = live.some((v) => v.folderId !== null) || live.length > 1;
    return hasRealStructure ? live : MOCK_VIEWS;
  };

  const emitViews = () => {
    const sel = viewer.views.getSelectedViewId();
    for (const listener of viewsListeners) listener(getViewsToEmit(), sel);
  };

  viewer.views.on('views-changed', () => {
    emitViews();
    emitActionHistory();
  });

  viewer.markup.on('markups-changed', () => {
    emitActionHistory();
    for (const listener of markupChangeListeners) listener();
  });

  // If user manually navigates camera while a view is selected (and not in edit mode),
  // automatically deselect the view and hide associated markups.
  viewer.on('camera-change', () => {
    if (markupModeActive) return;
    if (sxModeActive) return;          // suppress auto-deselect during sectioning session
    if (viewer.views.isCameraTransitioning?.()) return;
    if (!viewer.views.getSelectedViewId()) return;

    readOnlyRevealToken++;
    readOnlyMarkupsCount = 0;
    viewer.views.deselectView();
    viewer.markup.hideOverlay();
    emitActionHistory();
    emitViews();
  });

  const buildActionSummary = (): ActionHistorySummary => {
    return {
      sectioningCount: viewer.sectioning.getClipPlanes().length,
      hiddenObjectsCount: viewer.visibility.getHiddenElements().length,
      isolateCount,
      markupsCount: readOnlyMarkupsCount,
      measurementsCount: 0,
    };
  };

  const emitActionHistory = () => {
    const summary = buildActionSummary();
    for (const listener of actionHistoryListeners) {
      listener(summary);
    }
  };

  // React to sectioning changes
  viewer.sectioning.on('plane-add', () => emitActionHistory());
  viewer.sectioning.on('plane-remove', () => emitActionHistory());
  viewer.sectioning.on('planes-clear', () => emitActionHistory());
  viewer.sectioning.on('section-box-activate', () => emitActionHistory());

  // Isolate in section box — wire ModelViewer event into adapter subscriptions.
  // The engine has already positioned the section box; we update adapter state
  // so subsequent setSectioningActive / setSectionBoxSubTool calls work correctly
  // without re-creating the box.
  const isolateInSectionBoxListeners = new Set<() => void>();
  const cameraChangeListeners = new Set<() => void>();
  viewer.on('camera-change', () => {
    cameraChangeListeners.forEach((l) => l());
  });
  const visibilityChangeListeners = new Set<() => void>();
  viewer.visibility.on('visibility-change', () => {
    emitActionHistory();
    visibilityChangeListeners.forEach((l) => l());
  });
  viewer.on('isolate-in-section-box', () => {
    // Engine already called setActiveTool('section-box'), activateSectionBox, and
    // setBoxSubTool('move'). Just sync the adapter's local state and notify React.
    sectioningActive  = true;
    activeSectionTool = 'section-box';
    emitSectioningState();
    isolateInSectionBoxListeners.forEach(l => l());
  });

  const setViewerCursor = (iconUrl: string | null) => {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;

    if (!iconUrl) {
      root.classList.remove('mv-force-selected-cursor');
      body.style.removeProperty('--mv-selected-cursor');
      return;
    }

    body.style.setProperty('--mv-selected-cursor', `url("${iconUrl}") 10 10`);
    root.classList.add('mv-force-selected-cursor');
  };

  // Right-click orbit in Default/Fly modes: mirror the orbit cursor
  viewer.navigation.on('right-drag-orbit-start', () => setViewerCursor(orbitCursor));
  viewer.navigation.on('right-drag-orbit-end',   () => setViewerCursor(null));

  return {
    zoomIn() {
      viewer.navigation.zoom(1);
    },
    zoomOut() {
      viewer.navigation.zoom(-1);
    },
    fitToView() {
      viewer.navigation.zoomToFit();
    },
    resetView() {
      if (markupModeActive) {
        // In markup mode: clear only the markup canvas so the user starts fresh.
        // Sectioning belongs to the saved view state and must not be touched.
        viewer.markup.loadMarkups([]);
        return;
      }
      if (sectioningActive) {
        viewer.sectioning.resetMode();
        return;
      }
      viewer.resetView();
    },
    getCameraSnapshot() {
      // Use getEffectiveCamera (not getCamera) so the saved target matches
      // where the camera is actually pointing. In look/fly mode controls.target
      // is a stale orbit pivot that can differ from the real look direction;
      // getEffectiveCamera derives the target from camera.getWorldDirection()
      // so restore → setCamera → controls.update() lands on the exact same view.
      const cam = viewer.navigation.getEffectiveCamera();
      return {
        position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        target:   { x: cam.target.x,   y: cam.target.y,   z: cam.target.z },
        isOrthographic: viewer.navigation.getIsOrthographic(),
      };
    },
    setCameraSnapshot(snapshot, options) {
      applyCameraSnapshot(snapshot, options);
    },
    getViewpointState() {
      const cam = viewer.navigation.getEffectiveCamera();
      return {
        camera: {
          position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
          target:   { x: cam.target.x,   y: cam.target.y,   z: cam.target.z },
          isOrthographic: viewer.navigation.getIsOrthographic(),
        },
        hiddenObjects: viewer.visibility.getHiddenElements(),
        sectioning: viewer.sectioning.serializeState() as ViewpointStateSnapshot['sectioning'],
      };
    },
    setViewpointState(state: ViewpointStateSnapshot, options) {
      // Apply order matters: sectioning first (so clip planes are in place
      // before geometry is shown/hidden), then visibility, then camera.
      viewer.sectioning.restoreState(state.sectioning);
      // Outside sectioning mode, hide all interactive helpers (box wireframe,
      // face gizmos, DOM overlays) while keeping clip planes active.
      // setActiveTool(null) is the same path taken on sx-mode exit and reliably
      // hides helpersGroup + every gizmo DOM element in one call.
      if (!sxModeActive) {
        viewer.sectioning.setActiveTool(null);
      }
      viewer.visibility.showAll();
      if (state.hiddenObjects.length > 0) {
        viewer.visibility.hide(state.hiddenObjects);
      }
      applyCameraSnapshot(state.camera, options);
    },
    setViewOrientation(view: ViewOrientation) {
      const preset = ORIENTATIONS[view];
      viewer.navigation.setCamera(
        { x: preset.position[0], y: preset.position[1], z: preset.position[2] },
        { x: preset.target[0], y: preset.target[1], z: preset.target[2] },
      );
    },
    setInteractionMode(mode: InteractionMode) {
      viewer.setInteractionMode(mode);
      if (mode === 'fly') {
        viewer.navigation.setMode('fly');
      }
    },
    setCursorIcon(iconUrl: string | null) {
      setViewerCursor(iconUrl);
    },
    toggleModelBrowser() {
      viewer.treePanel.toggle();
    },
    toggleSectionTool() {
      sectioningActive = !sectioningActive;
      if (!sectioningActive) {
        activeSectionTool = null;
        viewer.sectioning.setActiveTool(null);
        viewer.selection.setHoverEnabled?.(true);
      }
      emitSectioningState();
    },
    setActiveSectioningTool(tool: 'section-plane' | 'section-box' | 'section-cut' | null) {
      activeSectionTool = tool;
      viewer.sectioning.setActiveTool(tool);

      // Disable Selection hover while surface-cut authoring gizmo is active to prevent
      // whole-object highlighting that competes with the surface disc marker.
      const disableHover = tool === 'section-cut' || tool === 'section-plane';
      viewer.selection.setHoverEnabled?.(!disableHover);

      if (!tool) return;

      if (tool === 'section-box') {
        if (viewer.sectioning.hasSectionBox()) {
          // An existing box is already in the scene (e.g. from "Isolate in section box").
          // Just restore visibility — don't clear and recreate it.
          viewer.sectioning.setBoxSubTool('move');
        } else {
          viewer.sectioning.clearAll();
          viewer.sectioning.activateSectionBox();
        }
      } else {
        viewer.sectioning.clearSectionBox();
      }
    },
    setSectionBoxSubTool(tool: 'drag-face' | 'move' | 'rotate') {
      viewer.sectioning.setBoxSubTool(tool);
    },
    clearSectioningPlanes() {
      viewer.sectioning.clearAll();
    },
    flipActiveSectionPlane() {
      return viewer.sectioning.flipActivePlane();
    },
    deleteActiveSectionPlane() {
      return viewer.sectioning.deleteActivePlane();
    },
    hasActiveSectionPlane() {
      return activeSectionPlanePresent;
    },
    subscribeActiveSectionPlane(listener: (present: boolean) => void) {
      activePlaneListeners.add(listener);
      listener(activeSectionPlanePresent);
      return () => {
        activePlaneListeners.delete(listener);
      };
    },
    subscribePlaneContextMenu(listener) {
      planeContextMenuListeners.add(listener);
      return () => {
        planeContextMenuListeners.delete(listener);
      };
    },
    setPlaneContextMenuOpen(open: boolean) {
      viewer.sectioning.setPlaneContextMenuOpen(open);
    },
    isSectioningActive() {
      return sectioningActive;
    },
    setSectioningActive(active: boolean) {
      sectioningActive = active;
      if (active) {
        viewer.sectioning.clearHistory();
      }
      if (!sectioningActive) {
        activeSectionTool = null;
        viewer.sectioning.setActiveTool(null);
        viewer.selection.setHoverEnabled?.(true);
        viewer.sectioning.clearHistory();
      }
      emitSectioningState();
    },
    subscribeSectioningState(listener: (active: boolean) => void) {
      sectioningStateListeners.add(listener);
      listener(sectioningActive);
      return () => {
        sectioningStateListeners.delete(listener);
      };
    },
    subscribeRequestEditCut(listener: () => void) {
      requestEditCutListeners.add(listener);
      return () => {
        requestEditCutListeners.delete(listener);
      };
    },
    subscribeRequestEditPlane(listener: (tool: 'section-plane' | 'section-cut') => void) {
      requestEditPlaneListeners.add(listener);
      return () => {
        requestEditPlaneListeners.delete(listener);
      };
    },
    toggleIsolationMode() {
      const selected = viewer.selection.getSelected();
      if (selected.length > 0) {
        isolateCount = selected.length;
        viewer.visibility.isolate(selected);
      } else {
        isolateCount = 0;
        viewer.visibility.showAll();
      }
      emitActionHistory();
    },
    toggleSearchSetsPanel() {
      window.dispatchEvent(new CustomEvent('mv:toggle-search-sets'));
    },
    getSearchSets() {
      return viewer.searchSets.getAll();
    },
    executeSearchSet(id: string) {
      viewer.searchSets.executeAndSelect(id);
    },
    deleteSearchSet(id: string) {
      viewer.searchSets.delete(id);
    },
    getObjectStreamingState() {
      return { ...streamingState };
    },
    subscribeObjectStreamingState(listener: (state: ObjectStreamingState) => void) {
      streamingListeners.add(listener);
      listener({ ...streamingState });
      return () => {
        streamingListeners.delete(listener);
      };
    },
    togglePropertiesPanel() {
      console.log('[modelViewerAdapter] togglePropertiesPanel — not yet implemented');
    },
    toggleMeasureTool() {
      console.log('[modelViewerAdapter] toggleMeasureTool — not yet implemented');
    },
    getObjectList(): GlobalSearchObjectEntry[] {
      return collectObjectList();
    },
    subscribeObjectList(listener: (entries: GlobalSearchObjectEntry[]) => void) {
      const emit = () => listener(collectObjectList());
      const onProgress = () => emit();
      const onComplete = () => emit();
      viewer.on('object-load-progress', onProgress);
      viewer.on('model-stream-complete', onComplete);
      viewer.on('load-complete', onComplete);
      emit();
      return () => {
        viewer.off('object-load-progress', onProgress);
        viewer.off('model-stream-complete', onComplete);
        viewer.off('load-complete', onComplete);
      };
    },
    selectAndFocusObject(expressID: string) {
      viewer.selection.deselect();
      viewer.selection.selectByIds([expressID]);
      const mesh = viewer.visibility.getMeshByElementId(expressID);
      if (mesh) {
        viewer.navigation.zoomToSelection([mesh]);
      }
    },
    setSelectedObjects(objectIDs: string[]) {
      viewer.selection.deselect();
      if (objectIDs.length > 0) {
        viewer.selection.selectByIds(objectIDs);
      }
    },
    hideObjects(expressIDs: string[]) {
      if (expressIDs.length === 0) return;
      viewer.visibility.hide(expressIDs);
      viewer.selection.deselect(expressIDs);
      emitActionHistory();
    },
    showObjects(expressIDs: string[]) {
      if (expressIDs.length === 0) return;
      viewer.visibility.show(expressIDs);
      emitActionHistory();
    },
    subscribeHiddenObjects(listener: (expressIDs: string[]) => void) {
      const handler = (data: unknown) => {
        const payload = data as { allHidden?: string[] };
        listener(Array.isArray(payload?.allHidden) ? payload.allHidden : []);
      };
      viewer.visibility.on('visibility-change', handler);
      listener(viewer.visibility.getHiddenElements());
      return () => viewer.visibility.off('visibility-change', handler);
    },
    subscribeSelectedObjects(listener: (expressIDs: string[]) => void) {
      const onSelectionChange = (data: unknown) => {
        const payload = data as { selected?: string[] };
        listener(Array.isArray(payload?.selected) ? payload.selected : []);
      };
      viewer.on('selection-change', onSelectionChange);
      listener(viewer.selection.getSelected());
      return () => {
        viewer.off('selection-change', onSelectionChange);
      };
    },
    getLoadedModelName() {
      return loadedModelName;
    },
    getObjectProperties(expressID: string): PropertyGroup[] {
      const groups: PropertyGroup[] = [];

      // --- Resolve ObjectTree node via elementToNode map first, then direct key ---
      let node: { name: string; ifcType?: string; elementId?: string } | undefined;
      if (viewer.objectTree) {
        const nodeId = viewer.objectTree.elementToNode.get(expressID)
                    ?? viewer.objectTree.elementToNode.get(String(expressID));
        if (nodeId) {
          node = viewer.objectTree.nodeMap.get(nodeId);
        }
        if (!node) {
          node = viewer.objectTree.nodeMap.get(`element-${expressID}`);
        }
      }

      // --- Get the mesh for additional userData ---
      const mesh = viewer.visibility.getMeshByElementId(expressID) as
        | { userData?: Record<string, unknown>; name?: string; uuid?: string }
        | null;

      // --- Build Identity group from best available source ---
      const identityName = objectNameCache.get(expressID)
        || node?.name
        || (mesh?.userData?.name as string)
        || mesh?.name
        || '';
      const identityType = node?.ifcType
        || (mesh?.userData?.type as string)
        || (mesh?.userData?.ifcType as string)
        || '';

      if (identityName || identityType || expressID) {
        const idProps = [
          { name: 'Name', value: identityName || '(unnamed)' },
          { name: 'IFC Type', value: identityType || 'Unknown' },
          { name: 'Express ID', value: expressID },
        ];
        if (mesh?.uuid) {
          idProps.push({ name: 'UUID', value: mesh.uuid });
        }
        groups.push({ name: 'Identity', properties: idProps });
      }

      // --- Extract additional property groups from mesh userData ---
      if (mesh?.userData) {
        const ud = mesh.userData;
        const skip = new Set(['expressID', 'type', 'ifcType', 'name']);
        const misc: { name: string; value: string }[] = [];

        for (const [key, val] of Object.entries(ud)) {
          if (skip.has(key)) continue;
          if (val == null) continue;

          if (typeof val === 'object' && !Array.isArray(val)) {
            const nested = val as Record<string, unknown>;
            const props = Object.entries(nested)
              .filter(([, v]) => v != null)
              .map(([k, v]) => ({ name: k, value: String(v) }));
            if (props.length > 0) {
              groups.push({ name: key, properties: props });
            }
          } else {
            misc.push({ name: key, value: String(val) });
          }
        }

        if (misc.length > 0) {
          groups.push({ name: 'General', properties: misc });
        }
      }

      return groups;
    },
    toggleOrthographic() {
      const next = !viewer.navigation.getIsOrthographic();
      viewer.navigation.setOrthographic(next);
    },
    isOrthographic() {
      return viewer.navigation.getIsOrthographic();
    },
    toggleXRay() {
      viewer.xray.toggle();
    },
    isXRayActive() {
      return viewer.xray.isEnabled;
    },
    setRenderStyle(style: 'default' | 'realism') {
      viewer.setRenderStyle(style);
    },
    setHoverEffect(mode: 'gradient' | 'edgeTrace') {
      viewer.selection.setHoverEffectMode(mode);
    },
    getHoverEffect() {
      return viewer.selection.getHoverEffectMode() as 'gradient' | 'edgeTrace';
    },
    undo() {
      if (markupModeActive) {
        viewer.markup.undo();
        return;
      }
      if (sectioningActive) {
        viewer.sectioning.undo();
        return;
      }
    },
    redo() {
      if (markupModeActive) {
        viewer.markup.redo();
        return;
      }
      if (sectioningActive) {
        viewer.sectioning.redo();
        return;
      }
    },
    getActionHistory() {
      return buildActionSummary();
    },
    subscribeActionHistory(listener: (summary: ActionHistorySummary) => void) {
      actionHistoryListeners.add(listener);
      listener(buildActionSummary());
      return () => {
        actionHistoryListeners.delete(listener);
      };
    },
    clearActionCategory(category: ActionHistoryCategory) {
      switch (category) {
        case 'sectioning':
          viewer.sectioning.clearAll();
          break;
        case 'hidden':
          viewer.visibility.showAll();
          break;
        case 'isolate':
          isolateCount = 0;
          viewer.visibility.showAll();
          break;
        case 'markups': {
          if (markupModeActive) {
            // Edit mode — clear the canvas so the user starts fresh.
            viewer.markup.loadMarkups([]);
          } else {
            // Read-only overlay — hide it.
            readOnlyRevealToken++;
            readOnlyMarkupsCount = 0;
            viewer.markup.hideOverlay();
            // For internally-managed views, clear from the ViewsManager too.
            const sv = viewer.views.getSelectedView();
            if (sv) viewer.views.clearMarkups(sv.id);
          }
          break;
        }
        case 'measurements':
          break;
      }
      emitActionHistory();
    },
    clearAllActions() {
      viewer.sectioning.clearAll();
      isolateCount = 0;
      viewer.visibility.showAll();
      readOnlyRevealToken++;
      readOnlyMarkupsCount = 0;
      viewer.markup.hideOverlay();
      emitActionHistory();
    },
    commitActiveCut() {
      // No-op since the rotation-authoring system was removed: section-cut
      // clicks now commit a plane immediately on mousedown, so there is
      // never an in-progress cut to commit.
    },

    // ── Views ─────────────────────────────────────────────────────────
    createView(name?: string) {
      return viewer.views.createView(name) as ViewData;
    },
    selectView(id: string) {
      // Switching views while editing should end markup mode first.
      if (markupModeActive) {
        if (markupEditingViewId) {
          const currentMarkups = JSON.parse(JSON.stringify(viewer.markup.getMarkups()));
          viewer.views.setViewMarkups(markupEditingViewId, currentMarkups);
        }
        viewer.markup.disable();
        viewer.navigation.setControlsEnabled?.(true);
        markupModeActive = false;
        markupEditingViewId = null;
      }

      readOnlyRevealToken++;
      const view = viewer.views.selectView(id);
      if (view && (view as ViewData).markups.length > 0) {
        viewer.markup.hideOverlay();
        revealReadOnlyMarkupsAfterTransition(id, (view as ViewData).markups);
      } else {
        viewer.markup.hideOverlay();
      }
    },
    deselectView() {
      readOnlyRevealToken++;
      viewer.views.deselectView();
      viewer.markup.hideOverlay();
    },
    deleteView(id: string) {
      if (markupEditingViewId === id) {
        viewer.markup.disable();
        viewer.navigation.setControlsEnabled?.(true);
        markupModeActive = false;
        markupEditingViewId = null;
      }
      viewer.views.deleteView(id);
      viewer.markup.hideOverlay();
    },
    renameView(id: string, name: string) {
      viewer.views.renameView(id, name);
    },
    getViews() {
      return viewer.views.getViews() as ViewData[];
    },
    getSelectedViewId() {
      return viewer.views.getSelectedViewId();
    },
    subscribeViews(listener: (views: ViewData[], selectedId: string | null) => void) {
      viewsListeners.add(listener);
      listener(getViewsToEmit(), viewer.views.getSelectedViewId());
      return () => { viewsListeners.delete(listener); };
    },
    createFolder(name: string, parentId?: string | null) {
      return viewer.views.createFolder(name, parentId) as ViewFolder;
    },
    deleteFolder(id: string) {
      viewer.views.deleteFolder(id);
    },
    renameFolder(id: string, name: string) {
      viewer.views.renameFolder(id, name);
    },
    getFolders() {
      const liveFolders = viewer.views.getFolders() as ViewFolder[];
      return liveFolders.length > 0 ? liveFolders : [
        { id: 'f1', name: 'Architecture', parentFolderId: null },
        { id: 'f2', name: 'Structural',   parentFolderId: null },
      ];
    },

    // ── Markup mode ───────────────────────────────────────────────────
    enterMarkupMode(viewId?: string, existingMarkups?: unknown[]) {
      // Auto-save current view's markups as a draft before switching.
      if (markupModeActive && markupExternalViewId) {
        const currentMarkups = JSON.parse(JSON.stringify(viewer.markup.getMarkups()));
        if (markupEditingViewId) {
          viewer.views.setViewMarkups(markupEditingViewId, currentMarkups);
        }
        markupDirtyViews.set(markupExternalViewId, currentMarkups);
      }

      // When viewId is a ViewpointsContext ID, the camera is already being
      // animated by setViewpointState (called by the panel before this). Calling
      // viewer.views.createView() + selectView() would snapshot the current camera
      // and immediately restore it, cancelling that animation. So for externally-
      // managed views we only need the markup canvas — skip viewer.views entirely.
      let internalViewId: string | null = null;
      if (!viewId) {
        const view = viewer.views.createView() as ViewData;
        viewer.views.selectView(view.id);
        internalViewId = view.id;
      } else if (viewer.views.getSelectedViewId()) {
        // Switching from an internal (toolbar) session to an external (panel) session:
        // clear the internal view selection so the camera-change auto-deselect handler
        // doesn't see a non-null selectedViewId and hide the markup overlay.
        viewer.views.deselectView();
      }

      const wasActive = markupModeActive;
      markupModeActive = true;
      markupEditingViewId = internalViewId;
      markupExternalViewId = viewId ?? null;
      // Snapshot the persisted markups so we can restore the overlay on discard.
      if (viewId) {
        markupPersistedMarkups = JSON.parse(JSON.stringify(existingMarkups ?? []));
      }
      // The editable canvas replaces the read-only overlay — clear the chip count.
      readOnlyMarkupsCount = 0;
      emitActionHistory();

      // Load priority:
      //  1. In-session draft — markups drawn earlier this session but not yet committed.
      //  2. Caller-provided markups from ViewpointsContext (persisted on disk).
      //  3. Internal ViewsManager fallback (only relevant when no viewId).
      const sessionDraft = viewId ? markupDirtyViews.get(viewId) : undefined;
      viewer.markup.loadMarkups(sessionDraft ?? existingMarkups ?? []);
      viewer.markup.enable();
      // Only disable controls and notify listeners on first entry — subsequent calls are
      // view-switches inside an already-active markup session. Calling setControlsEnabled
      // again would overwrite _controlsEnabledBeforeDrag with the now-false value, which
      // would leave OrbitControls permanently disabled after exitMarkupMode(true).
      if (!wasActive) {
        viewer.navigation.setControlsEnabled?.(false);
        markupModeActiveListeners.forEach((l) => l(true));
      }
      emitViews();
      return viewId ?? internalViewId ?? '';
    },
    exitMarkupMode(save: boolean) {
      if (markupModeActive) {
        if (save && markupExternalViewId) {
          const markups = JSON.parse(JSON.stringify(viewer.markup.getMarkups()));
          if (markupEditingViewId) {
            viewer.views.setViewMarkups(markupEditingViewId, markups);
          }
          markupDirtyViews.set(markupExternalViewId, markups);
          // Show read-only overlay immediately for the view just exited.
          viewer.markup.disable();
          viewer.navigation.setControlsEnabled?.(true);
          readOnlyMarkupsCount = markups.length;
          if (markups.length > 0) {
            viewer.markup.showReadOnly(markups, false);
          } else {
            viewer.markup.hideOverlay();
          }
          // Deselect any internal view that may have been created during the toolbar-button
          // entry path (enterMarkupMode called first without a viewId, then again with one).
          // If we don't clear it here, the camera-change auto-deselect handler fires during
          // the next panel-driven camera animation, bumps readOnlyRevealToken, and hides the
          // markup overlay for the next view the user clicks (the "one click behind" bug).
          viewer.views.deselectView();
        } else if (!save && markupExternalViewId) {
          // Discard with an externally-managed view — throw away the session and
          // restore the read-only overlay to whatever was persisted before entry.
          viewer.markup.disable();
          viewer.navigation.setControlsEnabled?.(true);
          const persisted = markupPersistedMarkups ?? [];
          readOnlyMarkupsCount = persisted.length;
          if (persisted.length > 0) {
            viewer.markup.showReadOnly(persisted, false);
          } else {
            viewer.markup.hideOverlay();
          }
          viewer.views.deselectView();
        } else if (markupEditingViewId) {
          // Unmanaged session (no external viewId) — use the internal view for overlay.
          const currentMarkups = save
            ? JSON.parse(JSON.stringify(viewer.markup.getMarkups()))
            : null;
          if (save && currentMarkups) {
            viewer.views.setViewMarkups(markupEditingViewId, currentMarkups);
          }
          viewer.markup.disable();
          viewer.navigation.setControlsEnabled?.(true);
          const view = viewer.views.getView(markupEditingViewId) as ViewData | null;
          if (view && view.markups.length > 0) {
            viewer.markup.showReadOnly(view.markups);
          } else {
            viewer.markup.hideOverlay();
          }
        } else {
          viewer.markup.disable();
          viewer.navigation.setControlsEnabled?.(true);
          viewer.markup.hideOverlay();
        }
      } else {
        viewer.markup.disable();
        viewer.navigation.setControlsEnabled?.(true);
      }
      markupModeActive = false;
      markupEditingViewId = null;
      markupExternalViewId = null;
      markupPersistedMarkups = null;
      markupModeActiveListeners.forEach((l) => l(false));

      if (save && markupCommitCallback && markupDirtyViews.size > 0) {
        const dirty = Array.from(markupDirtyViews.entries()).map(
          ([vid, markups]) => ({ viewId: vid, markups }),
        );
        markupDirtyViews.clear();
        markupCommitCallback(dirty);
      } else {
        markupDirtyViews.clear();
      }

      emitViews();
      emitActionHistory();
    },
    isMarkupModeActive() {
      return markupModeActive;
    },
    getMarkupViewId() {
      return markupExternalViewId;
    },
    subscribeMarkupModeActive(listener: (active: boolean) => void) {
      markupModeActiveListeners.add(listener);
      listener(markupModeActive);
      return () => { markupModeActiveListeners.delete(listener); };
    },
    subscribeMarkupChange(listener: () => void) {
      markupChangeListeners.add(listener);
      return () => { markupChangeListeners.delete(listener); };
    },
    registerMarkupCommitCallback(callback: (dirty: Array<{ viewId: string; markups: unknown[] }>) => void) {
      markupCommitCallback = callback;
      return () => { if (markupCommitCallback === callback) markupCommitCallback = null; };
    },
    showMarkupOverlay(markups: unknown[], animate?: boolean) {
      readOnlyRevealToken++;
      if (!markups || markups.length === 0) {
        readOnlyMarkupsCount = 0;
        emitActionHistory();
        viewer.markup.hideOverlay();
        return;
      }
      const token = readOnlyRevealToken;
      const tryReveal = () => {
        if (token !== readOnlyRevealToken) return;
        if (animate && viewer.views.isCameraTransitioning?.()) {
          requestAnimationFrame(tryReveal);
          return;
        }
        readOnlyMarkupsCount = markups.length;
        emitActionHistory();
        viewer.markup.showReadOnly(markups, !!animate);
      };
      if (animate) {
        requestAnimationFrame(tryReveal);
      } else {
        tryReveal();
      }
    },
    hideMarkupOverlay() {
      readOnlyRevealToken++;
      readOnlyMarkupsCount = 0;
      emitActionHistory();
      viewer.markup.hideOverlay();
    },
    setMarkupTool(tool: string | null) {
      viewer.markup.setTool(tool);
    },
    setMarkupColor(color: string) {
      markupColor = color;
      viewer.markup.setColor(color);
    },
    getMarkupColor() {
      return markupColor;
    },
    subscribeIsolateInSectionBox(listener: () => void) {
      isolateInSectionBoxListeners.add(listener);
      return () => isolateInSectionBoxListeners.delete(listener);
    },
    subscribeCameraChange(listener: () => void) {
      cameraChangeListeners.add(listener);
      return () => cameraChangeListeners.delete(listener);
    },
    subscribeVisibilityChange(listener: () => void) {
      visibilityChangeListeners.add(listener);
      return () => visibilityChangeListeners.delete(listener);
    },

    // ── Sectioning view mode ──────────────────────────────────────────
    enterSectioningViewMode(viewId?: string) {
      if (!sxModeActive) {
        // Capture pre-mode state so red X can fully restore the scene.
        const cam = viewer.navigation.getEffectiveCamera();
        sxPreModeState = {
          camera: {
            position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
            target:   { x: cam.target.x,   y: cam.target.y,   z: cam.target.z },
            isOrthographic: viewer.navigation.getIsOrthographic(),
          },
          hiddenObjects: viewer.visibility.getHiddenElements(),
          sectioning: viewer.sectioning.serializeState() as ViewpointStateSnapshot['sectioning'],
        };
        sxModeActive = true;
        sectioningActive = true;
        // Set sxViewId BEFORE firing listeners so that any listener that calls
        // setSectioningViewId() to register a pre-selected view can overwrite it
        // safely — and the view-switch code below never runs for first-time entry.
        sxViewId = viewId ?? null;
        // Call the side-effect directly rather than via emitSectioningState() —
        // emitting state would synchronously fire subscribeSectioningState listeners
        // in the panel, marking the currently-selected view dirty before the
        // 500ms cooldown (set by the subscribeSectioningViewModeActive React effect)
        // has had a chance to be put in place.
        viewer.selection.setContextMenuEnabled?.(false);
        sxListeners.forEach((l) => l(true));
        emitViews();
        return; // ← early return: skip view-switch logic on first entry
      }
      // Already active — switch to a different view.
      // Auto-draft the view we're leaving before switching to the new one.
      if (sxViewId && sxViewId !== (viewId ?? null)) {
        const cam = viewer.navigation.getEffectiveCamera();
        sxDirtyViews.set(sxViewId, {
          camera: {
            position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
            target:   { x: cam.target.x,   y: cam.target.y,   z: cam.target.z },
            isOrthographic: viewer.navigation.getIsOrthographic(),
          },
          sectioning: viewer.sectioning.serializeState() as ViewpointStateSnapshot['sectioning'],
        });
      }
      sxViewId = viewId ?? null;
      emitViews();
    },

    exitSectioningViewMode(save: boolean) {
      if (!sxModeActive) return;

      if (save && sxViewId) {
        // Draft the current view before committing everything.
        const cam = viewer.navigation.getEffectiveCamera();
        sxDirtyViews.set(sxViewId, {
          camera: {
            position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
            target:   { x: cam.target.x,   y: cam.target.y,   z: cam.target.z },
            isOrthographic: viewer.navigation.getIsOrthographic(),
          },
          sectioning: viewer.sectioning.serializeState() as ViewpointStateSnapshot['sectioning'],
        });
      } else if (!save && sxPreModeState) {
        // Discard — wipe any section planes/box added during the session,
        // then restore whatever sectioning (if any) existed before the mode.
        // clearAll() removes planes; clearSectionBox() removes the box geometry.
        viewer.sectioning.clearAll();
        viewer.sectioning.clearSectionBox?.();
        if (sxPreModeState.sectioning) {
          viewer.sectioning.restoreState(sxPreModeState.sectioning);
        }
        applyCameraSnapshot(sxPreModeState.camera, { animate: true });
      }

      sxModeActive = false;
      sxViewId = null;
      sxAutoViewId = null;
      sxPreModeState = null;
      sectioningActive = false;
      activeSectionTool = null;
      viewer.sectioning.setActiveTool(null);
      // On save: leave clip planes live so the user sees their work immediately.
      // The commit callback will re-apply via setViewpointState, but leaving them
      // in place prevents the flash that would occur if we cleared then re-added.
      // On discard: already cleared above in the !save branch.
      if (!save) viewer.sectioning.clearSectionBox?.();
      viewer.selection.setHoverEnabled?.(true);
      emitSectioningState();
      sxListeners.forEach((l) => l(false));

      if (save && sxCommitCallback && sxDirtyViews.size > 0) {
        const dirty = Array.from(sxDirtyViews.entries()).map(
          ([vid, s]) => ({ viewId: vid, camera: s.camera, sectioning: s.sectioning }),
        );
        sxDirtyViews.clear();
        sxCommitCallback(dirty);
      } else {
        sxDirtyViews.clear();
      }

      emitViews();
      emitActionHistory();
    },

    isSectioningViewModeActive() { return sxModeActive; },
    getSectioningViewId() { return sxViewId; },
    setAutoSectioningViewId(id: string | null) { sxAutoViewId = id; },
    getAutoSectioningViewId() { return sxAutoViewId; },
    // Direct setter — registers a view as current without drafting or events.
    // Used by the panel to avoid re-entrant enterSectioningViewMode calls.
    setSectioningViewId(viewId: string | null) { sxViewId = viewId; },

    subscribeSectioningViewModeActive(listener: (active: boolean) => void) {
      sxListeners.add(listener);
      listener(sxModeActive);
      return () => { sxListeners.delete(listener); };
    },

    registerSectioningViewCommitCallback(
      callback: (dirty: Array<{
        viewId: string;
        camera: ViewpointStateSnapshot['camera'];
        sectioning: ViewpointStateSnapshot['sectioning'];
      }>) => void,
    ) {
      sxCommitCallback = callback;
      return () => { if (sxCommitCallback === callback) sxCommitCallback = null; };
    },
  };
}
