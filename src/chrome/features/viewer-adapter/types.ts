export interface SearchSet {
  id: string;
  name: string;
  createdAt: string;
}

export type InteractionMode = 'select' | 'orbit' | 'fly';

export type ViewOrientation =
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'isometric';

// Phases of a real model load. The bar's fill is weighted across these:
//   init     0–10%   – viewer/three.js/wasm warmup, before any bytes move
//   download 10–55%  – real bytes from fetch (Content-Length + chunk reader)
//   parse    55%     – web-ifc parses the buffer; no usable progress source,
//                      so the fill rests at 55% until reveal begins
//   reveal   80–100% – progressivelyRevealModel emits real per-batch progress
//   complete 100%    – bar fades out shortly after
export type LoadPhase =
  | 'init'
  | 'download'
  | 'parse'
  | 'reveal'
  | 'complete'
  | 'error';

export interface ObjectStreamingState {
  streamingSupported: boolean;
  parserProgress: number;
  totalObjects: number;
  streamComplete: boolean;
  hasError: boolean;
  // Real-progress fields (added when the bar was rebuilt to be honest).
  phase: LoadPhase;
  bytesLoaded: number;
  bytesTotal: number;
}

export interface GlobalSearchObjectEntry {
  id: string;
  name: string;
  ifcType: string;
  expressID: string;
}

export type ActionHistoryCategory =
  | 'sectioning'
  | 'hidden'
  | 'isolate'
  | 'markups'
  | 'measurements';

export interface ActionHistorySummary {
  sectioningCount: number;
  hiddenObjectsCount: number;
  isolateCount: number;
  markupsCount: number;
  measurementsCount: number;
}

// ── Object Properties ────────────────────────────────────────────────────────

export interface ObjectProperty {
  name: string;
  value: string;
}

export interface PropertyGroup {
  name: string;
  properties: ObjectProperty[];
}

// ── Views + Markup data types ────────────────────────────────────────────────

export interface MarkupData {
  id: string;
  type: 'text' | 'line' | 'shape' | 'freehand' | 'callout' | 'highlighter' | 'cloud';
  color: string;
  strokeWidth: number;
  opacity: number;
  points?: { x: number; y: number }[];
  rect?: { x: number; y: number; w: number; h: number };
  text?: string;
  fontSize?: number;
  position?: { x: number; y: number };
}

export interface Vec3Plain {
  x: number;
  y: number;
  z: number;
}

export interface SectioningStateSnapshot {
  planes: Array<{
    normal: Vec3Plain;
    point: Vec3Plain;
    creatorTool: 'section-plane' | 'section-cut';
  }>;
  box: {
    center: Vec3Plain;
    halfExtents: Vec3Plain;
    quaternion: { x: number; y: number; z: number; w: number };
  } | null;
}

export interface ViewpointStateSnapshot {
  camera: {
    position: Vec3Plain;
    target:   Vec3Plain;
    isOrthographic: boolean;
  };
  hiddenObjects: string[];
  sectioning: SectioningStateSnapshot | null;
}

export interface ViewData {
  id: string;
  name: string;
  folderId: string | null;
  cameraPosition: { x: number; y: number; z: number };
  cameraTarget: { x: number; y: number; z: number };
  isOrthographic: boolean;
  markups: MarkupData[];
  createdAt: number;
  isProjectView: boolean;
}

export interface ViewFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
}

export interface ViewerAdapter {
  zoomIn(): void;
  zoomOut(): void;
  fitToView(): void;
  resetView(): void;
  setViewOrientation(view: ViewOrientation): void;
  setInteractionMode?(mode: InteractionMode): void;
  setCursorIcon?(iconUrl: string | null): void;

  toggleModelBrowser?(): void;
  togglePropertiesPanel?(): void;
  toggleMeasureTool?(): void;
  toggleSectionTool?(): void;
  setActiveSectioningTool?(
    tool: 'section-plane' | 'section-box' | 'section-cut' | null,
  ): void;
  setSectionBoxSubTool?(tool: 'drag-face' | 'move' | 'rotate'): void;
  clearSectioningPlanes?(): void;
  isSectioningActive?(): boolean;
  setSectioningActive?(active: boolean): void;
  subscribeSectioningState?(
    listener: (active: boolean) => void,
  ): () => void;
  subscribeRequestEditCut?(
    listener: () => void,
  ): () => void;
  subscribeRequestEditPlane?(
    listener: (tool: 'section-plane' | 'section-cut') => void,
  ): () => void;
  // Active edit-state plane controls — used by the right-click context
  // menu's Flip / Delete items. Returns true if a plane was acted on.
  flipActiveSectionPlane?(): boolean;
  deleteActiveSectionPlane?(): boolean;
  hasActiveSectionPlane?(): boolean;
  subscribeActiveSectionPlane?(
    listener: (present: boolean) => void,
  ): () => void;
  // Right-click on a sectioning plane → context menu request. The viewer
  // emits screen coords + planeId; the React layer renders the menu.
  subscribePlaneContextMenu?(
    listener: (data: { planeId: string; x: number; y: number }) => void,
  ): () => void;
  // Tells the engine that the plane context menu is open (true) or closed
  // (false) so it can suppress the plane hover marker while open.
  setPlaneContextMenuOpen?(open: boolean): void;
  toggleIsolationMode?(): void;
  toggleSearchSetsPanel?(): void;
  getSearchSets?(): SearchSet[];
  executeSearchSet?(id: string): void;
  deleteSearchSet?(id: string): void;
  getObjectStreamingState?(): ObjectStreamingState;
  subscribeObjectStreamingState?(
    listener: (state: ObjectStreamingState) => void,
  ): () => void;
  getObjectList?(): GlobalSearchObjectEntry[];
  subscribeObjectList?(
    listener: (entries: GlobalSearchObjectEntry[]) => void,
  ): () => void;
  selectAndFocusObject?(expressID: string): void;
  setSelectedObjects?(objectIDs: string[]): void;
  hideObjects?(expressIDs: string[]): void;
  showObjects?(expressIDs: string[]): void;
  subscribeHiddenObjects?(listener: (expressIDs: string[]) => void): () => void;
  subscribeSelectedObjects?(
    listener: (expressIDs: string[]) => void,
  ): () => void;

  getObjectProperties?(expressID: string): PropertyGroup[];

  getLoadedModelName?(): string | null;

  toggleOrthographic?(): void;
  isOrthographic?(): boolean;

  // Engine-agnostic camera snapshot — used by the chrome's home view and
  // (future) Viewpoints panel to capture and restore camera state without
  // pulling in any Three.js types.
  getCameraSnapshot?(): {
    position: { x: number; y: number; z: number };
    target:   { x: number; y: number; z: number };
    isOrthographic: boolean;
  };
  setCameraSnapshot?(
    snapshot: {
      position: { x: number; y: number; z: number };
      target:   { x: number; y: number; z: number };
      isOrthographic: boolean;
    },
    options?: { animate?: boolean; durationMs?: number },
  ): void;

  // Bundled viewpoint snapshot — camera + hidden objects + sectioning.
  // Always-on for the chrome's viewpoint persistence; the adapter is the
  // only thing that knows the engine-side apply order (sectioning → hidden →
  // camera) and how to read/write each piece.
  getViewpointState?(): ViewpointStateSnapshot;
  setViewpointState?(
    state: ViewpointStateSnapshot,
    options?: { animate?: boolean; durationMs?: number },
  ): void;

  toggleXRay?(): void;
  isXRayActive?(): boolean;

  setRenderStyle?(style: 'default' | 'realism'): void;

  setHoverEffect?(mode: 'gradient' | 'edgeTrace'): void;
  getHoverEffect?(): 'gradient' | 'edgeTrace';

  undo?(): void;
  redo?(): void;

  getActionHistory?(): ActionHistorySummary;
  subscribeActionHistory?(
    listener: (summary: ActionHistorySummary) => void,
  ): () => void;
  clearActionCategory?(category: ActionHistoryCategory): void;
  clearAllActions?(): void;
  commitActiveCut?(): void;

  // ── Views ────────────────────────────────────────────────────────────────
  createView?(name?: string): ViewData;
  selectView?(id: string): void;
  deselectView?(): void;
  deleteView?(id: string): void;
  renameView?(id: string, name: string): void;
  getViews?(): ViewData[];
  getSelectedViewId?(): string | null;
  subscribeViews?(
    listener: (views: ViewData[], selectedId: string | null) => void,
  ): () => void;
  subscribeCameraChange?(listener: () => void): () => void;
  createFolder?(name: string, parentId?: string | null): ViewFolder;
  deleteFolder?(id: string): void;
  renameFolder?(id: string, name: string): void;
  getFolders?(): ViewFolder[];

  // ── Markup mode ──────────────────────────────────────────────────────────
  enterMarkupMode?(viewId?: string): string;
  exitMarkupMode?(save: boolean): void;
  isMarkupModeActive?(): boolean;
  setMarkupTool?(tool: string | null): void;
  setMarkupColor?(color: string): void;
  getMarkupColor?(): string;

  // ── Isolate in section box ────────────────────────────────────────────────
  subscribeIsolateInSectionBox?(listener: () => void): () => void;
}