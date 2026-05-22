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
    setOrthographic(enabled: boolean): void;
    getIsOrthographic(): boolean;
    setControlsEnabled?(enabled: boolean): void;
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
    isolate(ids: string[]): void;
    hide(ids: string[]): void;
    getMeshByElementId(id: string): unknown | null;
    getHiddenElements(): string[];
    on(event: string, callback: (data: unknown) => void): void;
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
    clearAll(): void;
    flipActivePlane(): boolean;
    deleteActivePlane(): boolean;
    setPlaneContextMenuOpen(open: boolean): void;
    activeSectionPlaneId: string | null;
    undo(): void;
    redo(): void;
    resetMode(): void;
    clearHistory(): void;
    on(event: string, callback: (data: unknown) => void): void;
    getClipPlanes(): Array<{ id: string }>;
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

  // ── Markup mode state ───────────────────────────────────────────────
  let markupModeActive = false;
  let markupEditingViewId: string | null = null;
  let markupColor = '#FF0000';
  let readOnlyRevealToken = 0;
  const viewsListeners = new Set<(views: ViewData[], selectedId: string | null) => void>();

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
  });

  // If user manually navigates camera while a view is selected (and not in edit mode),
  // automatically deselect the view and hide associated markups.
  viewer.on('camera-change', () => {
    if (markupModeActive) return;
    if (viewer.views.isCameraTransitioning?.()) return;
    if (!viewer.views.getSelectedViewId()) return;

    readOnlyRevealToken++;
    viewer.views.deselectView();
    viewer.markup.hideOverlay();
    emitViews();
  });

  const buildActionSummary = (): ActionHistorySummary => {
    const selectedView = viewer.views.getSelectedView() as ViewData | null;
    return {
      sectioningCount: viewer.sectioning.getClipPlanes().length,
      hiddenObjectsCount: viewer.visibility.getHiddenElements().length,
      isolateCount,
      markupsCount: selectedView ? selectedView.markups.length : 0,
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

  // React to visibility changes
  viewer.visibility.on('visibility-change', () => emitActionHistory());

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
      if (sectioningActive) {
        viewer.sectioning.resetMode();
        return;
      }
      viewer.resetView();
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
        viewer.sectioning.clearAll();
        viewer.sectioning.activateSectionBox();
      } else {
        viewer.sectioning.clearSectionBox();
      }
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
          const sv = viewer.views.getSelectedView();
          if (sv) {
            viewer.views.clearMarkups(sv.id);
            if (viewer.markup.isActive) {
              viewer.markup.loadMarkups([]);
            } else {
              viewer.markup.hideOverlay();
            }
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
    enterMarkupMode(viewId?: string) {
      // Auto-save current view's markups before switching
      if (markupModeActive && markupEditingViewId) {
        const currentMarkups = JSON.parse(JSON.stringify(viewer.markup.getMarkups()));
        viewer.views.setViewMarkups(markupEditingViewId, currentMarkups);
      }

      let view: ViewData;
      if (viewId) {
        const existing = viewer.views.getView(viewId) as ViewData | null;
        if (existing) {
          viewer.views.selectView(viewId);
          view = existing;
        } else {
          view = viewer.views.createView() as ViewData;
          viewer.views.selectView(view.id);
        }
      } else {
        view = viewer.views.createView() as ViewData;
        viewer.views.selectView(view.id);
      }
      markupModeActive = true;
      markupEditingViewId = view.id;
      viewer.markup.loadMarkups(view.markups);
      viewer.markup.enable();
      viewer.navigation.setControlsEnabled?.(false);
      emitViews();
      return view.id;
    },
    exitMarkupMode(save: boolean) {
      if (markupModeActive && markupEditingViewId) {
        if (save) {
          const markups = JSON.parse(JSON.stringify(viewer.markup.getMarkups()));
          viewer.views.setViewMarkups(markupEditingViewId, markups);
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
      }
      markupModeActive = false;
      markupEditingViewId = null;
      emitViews();
      emitActionHistory();
    },
    isMarkupModeActive() {
      return markupModeActive;
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
  };
}
