import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Sectioning - Manages clipping planes for sectioning the model
 */

export class Sectioning {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.getScene();
    this.renderer = sceneManager.getRenderer();
    this.camera = sceneManager.getCamera();
    this.domElement = sceneManager.getDomElement();
    this._mvContainer = this.domElement.closest('.model-viewer') || this.domElement.parentElement;

    this._setCursor = (value) => {
      if (value === 'none') {
        this._mvContainer.classList.add('mv-cursor-none');
      } else {
        this._mvContainer.classList.remove('mv-cursor-none');
      }
      this.domElement.style.cursor = value;
    };

    // Clipping planes storage
    this.clipPlanes = new Map(); // id -> { plane, normal, point, helper, enabled }
    this.planeIdCounter = 0;

    // Enable clipping on renderer
    this.renderer.localClippingEnabled = true;

    // Drag state
    this.isDragging = false;
    this.dragPlaneId = null;
    this.dragStartPoint = new THREE.Vector3();
    this.dragPlane = new THREE.Plane();
    this.activeSectionPlaneId = null;

    // Helpers group
    this.helpersGroup = new THREE.Group();
    this.helpersGroup.name = 'SectionPlaneHelpers';
    this.scene.add(this.helpersGroup);

    // Raycaster for plane interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Event listeners
    this.eventListeners = new Map();

    // Bind event handlers
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);

    // Cached scene bounds for plane sizing
    this.sceneBounds = null;

    // Active sectioning tool state
    this.activeTool = null; // 'section-plane' | 'section-box' | 'section-cut' | null
    this.sectionBoxPlaneIds = [];
    this.sectionBoxGroup = null;
    this.hoverHighlight = null;
    this.previewGroup = null;

    // Section-cut placement-cursor + section-plane edit-state markers.
    // The rotation-authoring and persistent-contour systems were removed —
    // every committed plane (regardless of which tool placed it) is owned by
    // the shared Section Plane post-commit machinery (_planeGizmos,
    // _setSectionPlaneDefault, _showPlaneGizmo, drag-to-translate).
    this.cutHoverMarker = null;          // crosshair/scissor cursor for section-cut placement
    this.planeHoverMarker = null;        // drag-arrow cursor for hovering committed planes
    this._cutSurfaceHighlight = null;    // overlay mesh for hovered surface
    this._cutHighlightCacheKey = null;   // "meshUuid:instanceId:faceIndex" to skip redundant rebuilds
    this._cutHoverMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff33,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      clippingPlanes: [],
      toneMapped: false,
    });
    this._planeHoverMaterial = new THREE.MeshBasicMaterial({
      color: 0x00a8ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      clippingPlanes: [],
      toneMapped: false,
    });

    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this._onToolChange = null;

    this._arrowSpriteTexture = null;
    this._loadArrowSpriteTexture();

    this._gizmoArrowTexture = null;
    this._loadGizmoArrowTexture();

    // Spring-back state — used to elastically return a plane to bounds after
    // an overshot drag release.
    this._springPlaneId  = null;
    this._springTargetD  = 0;   // target projection onto plane normal (world)
    this._springVelocity = 0;

    // ── Section-box state ─────────────────────────────────────────────
    // Sub-tool controls which mouse interaction is active.
    this._boxSubTool = 'drag-face'; // 'drag-face' | 'move' | 'rotate'
    // Logical box: center + half-extents + orientation quaternion.
    this._boxState = null;
    // Visual meshes — a BoxGeometry face mesh (multi-material for per-face
    // hover highlight) and a LineSegments edges mesh.
    this._boxFaceMesh = null;
    this._boxEdgeMesh = null;
    this._boxFaceMaterials = null; // Array<MeshBasicMaterial>[6]
    this._boxFacePlanes    = null; // unused — cleared for safety
    this._boxHoveredFace = -1;     // 0-5 or -1
    // Set of planeIds that belong to the current section box — used for O(1)
    // lookup in movePlane so the box mesh stays in sync during face drags.
    this._sectionBoxPlaneSet = new Set();
    // Move / rotate drag state (separate from the per-plane isDragging flag).
    this._isBoxDragging = false;
    this._boxDragType = null;      // 'move' | 'rotate'
    this._boxDragStartPoint = new THREE.Vector3();
    this._boxDragPlane = new THREE.Plane();
    this._boxDragStartClientX    = 0;
    this._boxDragStartClientY    = 0;
    this._boxRotateStartQuat     = null; // quaternion snapshot at drag start (for undo)
    this._boxMoveCumulative = new THREE.Vector3();
    this._boxRotateCumulative = 0;
    this._rotatePinnedCornerSigns = null; // {sX, sZ} locked while dragging, null otherwise
    this._rotateGizmos         = [];   // {el, planeId, mesh3D} per box face, shown in rotate mode
    this._rotateGizmoTextures  = null; // [texTopBottom, texSide] — shared, disposed on clear

    // Section-cut placement preview line.
    // Shows a green line on the hovered surface indicating where the cut
    // will slice. The user can press 'r' to rotate the cut by 45° around
    // the surface normal. The angle persists across hover frames within
    // a single section-cut session.
    this._cutRotationAngle = 0;          // radians; toggled by 'r' key
    this._cutPreviewLine = null;         // THREE.Line in helpersGroup
    this._lastCutHover = null;           // { point, normal } cached so 'r' can re-apply without a mousemove

    // Section-plane default-state overlays (ring-with-arrows icon per set plane)
    this._planeGizmos = new Map(); // planeId → { el, centroid }
    this._hoveringPlaneGizmo = false;
    this._hoveredPlaneId = null;  // which gizmo is under the cursor right now

    // Live contour outline + fill for the active edit-state section plane
    // Rendered in a separate THREE.Scene to bypass global clipping planes
    this._activePlaneContour = null;
    this._activePlaneContourPlaneId = null;
    // rAF id for coalescing contour rebuilds during drag — prevents stacking
    // O(triangles) work on every pointer move when the OS fires faster than vsync.
    this._activeContourRafId = 0;
    // Mesh-list cache populated at plane-drag start so _computePlaneIntersection
    // can skip a full scene.traverse on every frame while dragging.
    this._dragMeshCache = null;

    // Mode-scoped action history for undo/redo/reset
    this._actionHistory = [];  // stack of { undo(), redo() }
    this._redoStack = [];
    this._skipRecord = false;
    this._dragCumulativeDistance = 0;
    this._dragMinD = null;  // model AABB min projection onto drag normal (set per drag)
    this._dragMaxD = null;  // model AABB max projection onto drag normal

    // ── Tilt gizmo (2-axis section plane tilt control) ──────────────
    // Tunable constants — adjust these to change gizmo feel
    this.TILT_MAX_ANGLE = Math.PI / 4;     // 45° max tilt per axis
    this.TILT_SENSITIVITY = 1.0;           // drag-to-angle multiplier
    this.GIZMO_SCALE_FACTOR = 0.08;        // camera-distance → scale multiplier
    this.GIZMO_SCALE_MIN = 0.3;            // minimum gizmo scale
    this.GIZMO_SCALE_MAX = 5.0;            // maximum gizmo scale

    // Tilt gizmo is currently disabled — the asset and code stay in place so
    // it can be re-enabled later, but we skip the GLTF fetch and never attach
    // it to a section plane. Set to true to bring it back.
    this._tiltGizmoEnabled = false;
    this._tiltGizmoTemplate = null;        // loaded GLTF scene (cloned per use)
    this._tiltGizmo = null;                // active THREE.Group in the scene
    this._tiltRingX = null;                // Ring_X mesh ref (forward/back tilt)
    this._tiltRingY = null;                // Ring_Y mesh ref (left/right tilt)
    this._tiltDragging = false;
    this._tiltAxis = null;                 // 'x' | 'y' while dragging
    this._tiltDragStartAngle = 0;          // angle at drag start on the ring plane
    this._tiltBeforeQuat = null;           // quaternion snapshot for undo
    this._tiltCumulativeX = 0;             // accumulated tilt around local X
    this._tiltCumulativeY = 0;             // accumulated tilt around local Y
    this._tiltBaseQuat = null;             // quaternion at drag start (before this drag)
    this._tiltHoveredRing = null;          // currently hovered ring mesh
    if (this._tiltGizmoEnabled) this._loadTiltGizmo();

    // Screen-space scissors icon overlay for section-cut hover
    this.scissorsOverlay = document.createElement('div');
    this.scissorsOverlay.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_8214_4571)"><path d="M6 12.5C3.51472 12.5 1.5 14.5147 1.5 17C1.5 19.4853 3.51472 21.5 6 21.5C8.48528 21.5 10.5 19.4853 10.5 17C10.5 16.8982 10.4949 16.7974 10.4883 16.6973L13.3564 15.041L18.3877 17.9463C20.0617 18.9128 22.2024 18.3389 23.1689 16.665L23.4189 16.2314L22.9863 15.9814L17.3574 12.7314L22.9854 9.48242L23.4189 9.23242L23.1689 8.79883C22.2024 7.12493 20.0617 6.5512 18.3877 7.51758L13.3564 10.4219L10.4385 8.73633C10.4779 8.49665 10.5 8.25085 10.5 8C10.5 5.51472 8.48528 3.5 6 3.5C3.51472 3.5 1.5 5.51472 1.5 8C1.5 10.4853 3.51472 12.5 6 12.5ZM6 12.5C6.91392 12.5 7.76377 12.7731 8.47363 13.2412L9.35645 12.7314L8.0752 11.9922C7.45408 12.3157 6.74877 12.5 6 12.5ZM6 15.5C5.17157 15.5 4.5 16.1716 4.5 17C4.5 17.8284 5.17157 18.5 6 18.5C6.82843 18.5 7.5 17.8284 7.5 17C7.5 16.1716 6.82843 15.5 6 15.5ZM6 6.5C5.17157 6.5 4.5 7.17157 4.5 8C4.5 8.82843 5.17157 9.5 6 9.5C6.82843 9.5 7.5 8.82843 7.5 8C7.5 7.17157 6.82843 6.5 6 6.5Z" fill="#006C16" stroke="#00FF33"/></g><defs><clipPath id="clip0_8214_4571"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>`;
    Object.assign(this.scissorsOverlay.style, {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: '999',
      display: 'none',
    });
    const overlayParent = this.domElement.parentElement || this.domElement;
    overlayParent.appendChild(this.scissorsOverlay);

    // Blue pill tooltip that appears beside the section-cut cursor and fades
    // after 5 s to tell the user about the Command+R rotate shortcut.
    this._rotatePill = document.createElement('div');
    this._rotatePill.textContent = 'Rotate: R';
    Object.assign(this._rotatePill.style, {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: '999',
      background: 'rgba(31, 111, 235, 0.8)',
      color: '#fff',
      fontSize: '12px',
      fontWeight: '500',
      fontFamily: 'system-ui, sans-serif',
      padding: '4px 10px',
      borderRadius: '999px',
      whiteSpace: 'nowrap',
      display: 'none',
      opacity: '1',
      transition: 'opacity 1s ease',
    });
    overlayParent.appendChild(this._rotatePill);
    this._rotatePillVisible = false;        // whether it is currently shown
    this._rotatePillTimer = null;           // setTimeout handle for the 5-s hold
    this._rotatePillShownForSession = false; // reset each time section-cut is activated
    this._rotatePillDone = false;           // true once the fade has fully completed

    this.init();
  }

  setActiveTool(tool) {
    const prevTool = this.activeTool;
    this.activeTool = tool;
    // Outside sectioning mode, keep cuts but hide all interactive helpers.
    this.helpersGroup.visible = Boolean(tool);
    if (tool !== 'section-plane' && tool !== 'section-cut') {
      this.clearCutHoverMarker();
      this.clearPlaneHoverMarker();
      this._removeCutSurfaceHighlight();
      this.clearHoverHighlight();
      this._setCursor('');
    }
    // Reset the section-cut rotation angle when leaving section-cut, so a
    // fresh entry into the tool always starts at the unrotated default.
    if (prevTool === 'section-cut' && tool !== 'section-cut') {
      this._cutRotationAngle = 0;
      this._hideRotatePill();
    }
    // Re-arm the rotate pill whenever the user activates section-cut so
    // it shows again on the first surface hover of each tool session.
    if (tool === 'section-cut' && prevTool !== 'section-cut') {
      this._rotatePillShownForSession = false;
    }
    const isSectioningTool = tool === 'section-plane' || tool === 'section-cut';
    if (!isSectioningTool) {
      // Leaving sectioning mode — hide all plane helpers and gizmos.
      this._detachTiltGizmo();
      this._clearActivePlaneContour();
      this._selectSectionPlane(null);
      for (const [, pd] of this.clipPlanes) {
        if (pd.helper) pd.helper.visible = false;
      }
      for (const [, gizmoData] of this._planeGizmos) {
        if (gizmoData.el) gizmoData.el.style.display = 'none';
        if (gizmoData.overflowBtn) gizmoData.overflowBtn.style.display = 'none';
        if (gizmoData.ring3D) gizmoData.ring3D.visible = false;
      }
      // Hide rotate gizmo DOM overlays — they live outside helpersGroup so they
      // are not automatically hidden when helpersGroup.visible = false.
      for (const gizmo of this._rotateGizmos) {
        gizmo.el.style.display = 'none';
        if (gizmo.mesh3D) gizmo.mesh3D.visible = false;
      }
    } else {
      // Entering (or switching within) sectioning mode — ensure all planes
      // and their gizmos are visible. Skip box planes — they manage their own
      // gizmos independently via _showPlaneGizmo in _buildBoxClipPlanes.
      for (const [planeId, pd] of this.clipPlanes) {
        if (pd.isBoxPlane) continue;
        if (pd.helper) pd.helper.visible = true;
        if (!this._planeGizmos.has(planeId)) {
          const centroid = this._computeCrossSectionCentroid(pd.plane) || pd.point.clone();
          const gizmo = this._createPlaneGizmo(planeId, centroid);
          this._planeGizmos.set(planeId, gizmo);
        }
        const gizmoData = this._planeGizmos.get(planeId);
        if (gizmoData?.el) gizmoData.el.style.display = 'flex';
      }
    }

    // Attach/detach keyboard listener for section-plane/section-cut shortcuts.
    const prevWasSectioning = prevTool === 'section-cut' || prevTool === 'section-plane';
    if (prevWasSectioning && !isSectioningTool) {
      document.removeEventListener('keydown', this.boundOnKeyDown);
    }
    if (isSectioningTool && !prevWasSectioning) {
      document.addEventListener('keydown', this.boundOnKeyDown);
    }

    if (this._onToolChange) this._onToolChange(tool);

    this.emit('tool-change', { tool });
  }

  onToolChange(callback) {
    this._onToolChange = callback;
  }

  /**
   * Calculate the bounding box of all meshes in the scene
   */
  getSceneBounds() {
    const box = new THREE.Box3();

    this.scene.traverse((object) => {
      if (object.isMesh && object.visible && !object.userData.isPlaneHelper) {
        const objectBox = new THREE.Box3().setFromObject(object);
        box.union(objectBox);
      }
    });

    if (box.isEmpty()) {
      // Default bounds if no meshes found
      box.set(
        new THREE.Vector3(-10, -10, -10),
        new THREE.Vector3(10, 10, 10)
      );
    }

    return box;
  }

  /**
   * Get plane size based on scene bounds and plane normal
   * Size is based on dimensions perpendicular to the normal
   */
  getPlaneSizeFromBounds(normal) {
    const bounds = this.getSceneBounds();
    const size = new THREE.Vector3();
    bounds.getSize(size);

    // Get absolute normal components to determine which dimensions matter
    const absNormal = new THREE.Vector3(
      Math.abs(normal.x),
      Math.abs(normal.y),
      Math.abs(normal.z)
    );

    // Calculate the size perpendicular to the normal
    // Weight each dimension by how perpendicular it is to the normal
    let planeWidth, planeHeight;

    if (absNormal.z > absNormal.x && absNormal.z > absNormal.y) {
      // Normal mostly in Z direction - plane spans X and Y
      planeWidth = size.x;
      planeHeight = size.y;
    } else if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
      // Normal mostly in Y direction - plane spans X and Z
      planeWidth = size.x;
      planeHeight = size.z;
    } else {
      // Normal mostly in X direction - plane spans Y and Z
      planeWidth = size.y;
      planeHeight = size.z;
    }

    // Use the larger of the two perpendicular dimensions + 10% padding
    const planeSize = Math.max(planeWidth, planeHeight) * 1.1;

    return planeSize;
  }

  init() {
    this.domElement.addEventListener('mousedown', this.boundOnMouseDown);
    // Use window capture so onMouseMove fires even when the cursor is over a
    // sibling overlay element (e.g. a plane gizmo div) rather than the canvas.
    window.addEventListener('mousemove', this.boundOnMouseMove, { capture: true });
    this.domElement.addEventListener('mouseup', this.boundOnMouseUp);

    // Frame loop to keep HTML overlay icons in sync with camera
    this._overlayAnimId = null;
    const tick = () => {
      this._overlayAnimId = requestAnimationFrame(tick);

      // Spring-back animation: runs after an overshot drag release.
      // Uses a simple spring-damper so the plane decelerates and settles
      // at the boundary without oscillating (critically-damped feel).
      if (this._springPlaneId) {
        const spd = this.clipPlanes.get(this._springPlaneId);
        if (spd) {
          const currentD  = spd.point.dot(spd.normal);
          const error     = this._springTargetD - currentD;
          // Stiffness 0.22, damping 0.68 → fast return, no bounce
          this._springVelocity = (this._springVelocity + error * 0.22) * 0.68;
          const step = this._springVelocity;
          if (Math.abs(error) > 0.002 || Math.abs(step) > 0.002) {
            this.movePlane(this._springPlaneId, step);
          } else {
            // Snap exactly to target and stop
            this.movePlane(this._springPlaneId, error);
            this._springPlaneId  = null;
            this._springVelocity = 0;
          }
        } else {
          this._springPlaneId = null;
        }
      }

      if (this._planeGizmos.size > 0) {
        this._updatePlaneGizmoPositions();
      }
      if (this._rotateGizmos.length > 0
          && this.activeTool === 'section-box'
          && this._boxSubTool === 'rotate') {
        this._updateRotateGizmoPositions();
      }
      // Safety net: if the cursor is over a gizmo, ensure the placement cursor
      // is never visible — even if the canvas mousemove listener missed the event
      // because the cursor was over the overlay div instead.
      if (this._hoveredPlaneId !== null && !this.isDragging) {
        if (this.planeHoverMarker) this.clearPlaneHoverMarker();
        if (this.cutHoverMarker) this.clearCutHoverMarker();
        this._removeCutSurfaceHighlight();
      }
      if (this._activePlaneContour) {
        this._activePlaneContour.traverse(obj => {
          if (obj.material?.isLineMaterial) {
            obj.material.resolution.set(this.domElement.clientWidth, this.domElement.clientHeight);
          }
        });
      }
      if (this.planeHoverMarker) {
        this.planeHoverMarker.traverse(obj => {
          if (obj.material?.isLineMaterial) {
            obj.material.resolution.set(this.domElement.clientWidth, this.domElement.clientHeight);
          }
        });
      }
      if (this.planeHoverMarker?.userData._arrowSprite) {
        this._updateArrowSpriteRotation();
      }
      if (this.planeHoverMarker || this._tiltGizmoScene || this._activePlaneContour || this._gizmoRingScene) {
        this._renderActivePlaneContour();
      }
      // Tilt gizmo: keep scale consistent on screen regardless of camera distance
      if (this._tiltGizmo && this.activeSectionPlaneId) {
        const pd = this.clipPlanes.get(this.activeSectionPlaneId);
        if (pd) {
          const d = this.camera.position.distanceTo(pd.point);
          const s = THREE.MathUtils.clamp(
            d * this.GIZMO_SCALE_FACTOR, this.GIZMO_SCALE_MIN, this.GIZMO_SCALE_MAX
          );
          this._tiltGizmo.scale.setScalar(s);
        }
        // Keep world matrices current for raycasting (gizmo is in a separate scene)
        if (this._tiltGizmoScene) this._tiltGizmoScene.updateMatrixWorld(true);
      }
    };
    tick();
  }

  // ── Mode-scoped action history ────────────────────────────────────

  _pushAction(action) {
    if (this._skipRecord) return;
    this._actionHistory.push(action);
    this._redoStack = [];
  }

  undo() {
    if (this._actionHistory.length === 0) return;
    const action = this._actionHistory.pop();
    this._skipRecord = true;
    try { action.undo(); } finally { this._skipRecord = false; }
    this._redoStack.push(action);
    this.updateRendererClipPlanes();
  }

  redo() {
    if (this._redoStack.length === 0) return;
    const action = this._redoStack.pop();
    this._skipRecord = true;
    try { action.redo(); } finally { this._skipRecord = false; }
    this._actionHistory.push(action);
  }

  resetMode() {
    this.clearCutHoverMarker();
    this.clearPlaneHoverMarker();
    this._removeCutSurfaceHighlight();
    this._skipRecord = true;
    try {
      while (this._actionHistory.length > 0) {
        const action = this._actionHistory.pop();
        action.undo();
      }
    } finally { this._skipRecord = false; }
    this._redoStack = [];
    this.updateRendererClipPlanes();

    // If still in section-box mode, recreate the box — the undo loop
    // cleared it via clearSectionBox() but the tool is still active so
    // the user should always see the box in move/rotate sub-tools.
    if (this.activeTool === 'section-box') {
      this.activateSectionBox();
      // Restore visibility state to match the current sub-tool.
      this.setBoxSubTool(this._boxSubTool || 'move');
    }
  }

  clearHistory() {
    this._actionHistory = [];
    this._redoStack = [];
  }

  _restoreClipPlane(id, normal, point, opts = {}) {
    const plane = new THREE.Plane();
    const clipNormal = normal.clone().normalize().negate();
    plane.setFromNormalAndCoplanarPoint(clipNormal, point.clone());
    const planeSize = this.getPlaneSizeFromBounds(normal);
    const helper = this.createPlaneHelper(plane, normal, point, planeSize);
    helper.userData.planeId = id;
    if (opts.hideHelper) helper.visible = false;
    this.helpersGroup.add(helper);
    this.clipPlanes.set(id, {
      id, plane,
      normal: normal.clone().normalize(),
      point: point.clone(),
      helper, enabled: true, visible: true,
      creatorTool: opts.creatorTool || 'section-plane'
    });
    this.updateRendererClipPlanes();
    this.emit('plane-add', { id, plane, normal, point });
  }

  // ── End action history ────────────────────────────────────────────

  /**
   * Add a clipping plane from a normal and point
   * @param {THREE.Vector3} normal - Plane normal direction
   * @param {THREE.Vector3} point - Point on the plane
   * @returns {string} Plane ID
   */
  addClipPlane(normal, point, opts = {}) {
    const id = `plane-${++this.planeIdCounter}`;

    const plane = new THREE.Plane();
    const clipNormal = normal.clone().normalize().negate();
    plane.setFromNormalAndCoplanarPoint(clipNormal, point.clone());

    // Calculate plane size based on model bounds and plane orientation
    const planeSize = this.getPlaneSizeFromBounds(normal);

    // Create visual helper (hidden for section-cut commits)
    const helper = this.createPlaneHelper(plane, normal, point, planeSize);
    helper.userData.planeId = id;
    if (opts.hideHelper) helper.visible = false;
    this.helpersGroup.add(helper);

    // Store plane data
    this.clipPlanes.set(id, {
      id,
      plane,
      normal: normal.clone().normalize(),
      point: point.clone(),
      helper,
      enabled: true,
      visible: true,
      creatorTool: opts.creatorTool || 'section-plane'
    });

    // Update renderer clipping planes
    this.updateRendererClipPlanes();

    this.emit('plane-add', { id, plane, normal, point });

    const savedNormal = normal.clone();
    const savedPoint = point.clone();
    const savedOpts = { ...opts };
    this._pushAction({
      type: 'add-plane',
      undo: () => { this.removeClipPlane(id); },
      redo: () => {
        this._restoreClipPlane(id, savedNormal, savedPoint, savedOpts);
      },
    });

    return id;
  }

  _setActiveSectionPlane(planeId) {
    const next = planeId || null;
    const changed = this.activeSectionPlaneId !== next;
    this.activeSectionPlaneId = next;
    this._refreshSectionPlaneActiveVisuals();
    if (changed) {
      this.emit('active-plane-change', { planeId: this.activeSectionPlaneId });
    }
  }

  /**
   * Flip the currently selected (edit-state) plane. Returns true if a
   * plane was flipped, false if there is no active plane.
   */
  flipActivePlane() {
    if (!this.activeSectionPlaneId) return false;
    this.flipPlane(this.activeSectionPlaneId);
    return true;
  }

  /**
   * Remove the currently selected (edit-state) plane. Returns true if a
   * plane was deleted, false if there is no active plane.
   */
  deleteActivePlane() {
    if (!this.activeSectionPlaneId) return false;
    const planeId = this.activeSectionPlaneId;
    this.removeClipPlane(planeId);
    return true;
  }

  _refreshSectionPlaneActiveVisuals() {
    // No visible helper children to update — visuals are handled by overlays
  }

  _resolveInwardSectionPlaneNormal(point, normal) {
    const resolved = normal.clone().normalize();
    const bounds = this.getSceneBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const towardCenter = center.sub(point);
    if (towardCenter.lengthSq() > 1e-8) {
      towardCenter.normalize();
      if (resolved.dot(towardCenter) < 0) {
        resolved.negate();
      }
    }
    return resolved;
  }

  _getSectionPlanePlacementPoint(point, inwardNormal) {
    const bounds = this.getSceneBounds();
    const size = bounds.getSize(new THREE.Vector3());
    const sceneDiag = Math.max(size.x, size.y, size.z);
    const epsilon = Math.max(sceneDiag * 0.0005, 0.0005);
    return point.clone().addScaledVector(inwardNormal, epsilon);
  }

  _resolvePlaneIdFromHelperObject(object3D) {
    let node = object3D;
    while (node) {
      if (node.userData?.planeId) return node.userData.planeId;
      node = node.parent;
    }
    return null;
  }

  _beginPlaneDrag(planeId, startPoint) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return false;

    this.isDragging = true;
    this.dragPlaneId = planeId;
    this.dragStartPoint.copy(startPoint);
    this._dragCumulativeDistance = 0;
    // Snapshot the eligible mesh list once — the scene shouldn't change shape
    // mid-drag, and re-traversing it every pointer move is wasteful on big models.
    this._dragMeshCache = this._collectSectionTargetMeshes();

    // Cache model AABB projected onto the drag normal so movePlane can clamp
    // the plane within the model bounds every frame without re-traversing the scene.
    {
      const box = this.getSceneBounds();
      const n = planeData.normal;
      const center = new THREE.Vector3();
      const half   = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(half).multiplyScalar(0.5);
      // Support extent: max distance any AABB corner can project onto n
      const extent = Math.abs(half.x * n.x) + Math.abs(half.y * n.y) + Math.abs(half.z * n.z);
      const cProj  = center.dot(n);
      this._dragMinD = cProj - extent;
      this._dragMaxD = cProj + extent;
    }

    if (this._tiltGizmo) this._tiltGizmo.visible = false;

    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);
    this.dragPlane.setFromNormalAndCoplanarPoint(cameraDir, this.dragStartPoint);
    this.emit('drag-start', { planeId });
    return true;
  }

  // Coalesce contour rebuilds to one per animation frame. Pointer moves can
  // fire faster than 60Hz and each rebuild is O(triangles_near_plane); without
  // this, slow rebuilds queue up and the plane visibly lags the cursor.
  _scheduleActivePlaneContourUpdate() {
    if (this._activeContourRafId) return;
    this._activeContourRafId = requestAnimationFrame(() => {
      this._activeContourRafId = 0;
      this._buildActivePlaneContour();
    });
  }

  /**
   * Create visual helper for clipping plane
   */
  createPlaneHelper(plane, normal, point, size = 5) {
    const group = new THREE.Group();
    group.position.copy(point);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    group.quaternion.copy(quaternion);

    return group;
  }

  /**
   * Remove a clipping plane
   */
  removeClipPlane(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return false;

    // Remove helper from scene
    if (planeData.helper) {
      this.helpersGroup.remove(planeData.helper);
      this.disposeHelper(planeData.helper);
    }

    // Remove associated plane gizmo
    this._removePlaneGizmo(planeId);

    // Remove from map
    this.clipPlanes.delete(planeId);
    if (this.activeSectionPlaneId === planeId) {
      // Use direct assignment here — gizmo is about to be removed, no need to update its visuals
      this.activeSectionPlaneId = null;
      this.emit('active-plane-change', { planeId: null });
    }

    // Update renderer
    this.updateRendererClipPlanes();

    this.emit('plane-remove', { id: planeId });

    return true;
  }

  /**
   * Clear all clipping planes
   */
  clearClipPlanes() {
    const hadActive = this.activeSectionPlaneId !== null;
    const ids = Array.from(this.clipPlanes.keys());
    ids.forEach(id => this.removeClipPlane(id));
    this.activeSectionPlaneId = null;
    this.sectionBoxPlaneIds = [];
    this.emit('planes-clear');
    if (hadActive) {
      this.emit('active-plane-change', { planeId: null });
    }
  }

  activateSectionBox(opts) {
    this.clearSectionBox();

    let center, halfExtents;
    const quaternion = new THREE.Quaternion(); // default: axis-aligned

    if (opts?.center && opts?.halfExtents) {
      // Caller-supplied bounds (e.g. "Isolate in section box" or restoreState)
      center      = opts.center.clone();
      halfExtents = opts.halfExtents.clone();
      // Restore saved rotation if provided
      if (opts.quaternion) {
        quaternion.set(opts.quaternion.x, opts.quaternion.y, opts.quaternion.z, opts.quaternion.w);
      }
    } else {
      const bounds = this.getSceneBounds();
      const groundY = bounds.min.y;
      const size = bounds.getSize(new THREE.Vector3());

      // Place box center at screen-center ray hit on the ground plane.
      const centerNDC = new THREE.Vector2(0, 0);
      this.raycaster.setFromCamera(centerNDC, this.camera);
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
      const groundHit = new THREE.Vector3();
      const sceneCtr = bounds.getCenter(new THREE.Vector3());
      let cx = sceneCtr.x, cz = sceneCtr.z;
      if (this.raycaster.ray.intersectPlane(groundPlane, groundHit)) {
        cx = groundHit.x;
        cz = groundHit.z;
      }

      // Size the box relative to the camera distance so it looks reasonable
      // regardless of model scale. Use 20 % of the camera-to-scene-center
      // distance as the primary signal, then clamp it between 8 % and 30 %
      // of the scene's largest dimension so it stays sensible even when the
      // camera is very close or very far away.
      const camDist      = this.camera.position.distanceTo(sceneCtr);
      const sceneLargest = Math.max(size.x, size.y, size.z);
      const half = Math.max(
        Math.min(camDist * 0.20, sceneLargest * 0.30),
        Math.max(sceneLargest * 0.08, 1.0),
      );
      center      = new THREE.Vector3(cx, groundY + half, cz);
      halfExtents = new THREE.Vector3(half, half, half);
    }

    this._boxState = { center: center.clone(), halfExtents: halfExtents.clone(), quaternion: quaternion.clone() };

    // Create 6 clip planes — one per face, suppressed from action history
    // since we record the box as a single action.
    this._buildBoxClipPlanes();

    // Build translucent blue face mesh + edge overlay.
    this._buildBoxMesh();

    // Build rotate gizmos (hidden until rotate sub-tool is selected).
    this._buildRotateGizmos();

    this._pushAction({
      type: 'section-box',
      undo: () => { this.clearSectionBox(); },
      redo: () => { this.activateSectionBox(); },
    });

    this.emit('section-box-activate', { planeIds: this.sectionBoxPlaneIds });
    return this.sectionBoxPlaneIds;
  }

  // Create 6 clip planes from the current _boxState.
  _buildBoxClipPlanes() {
    const { center, halfExtents, quaternion } = this._boxState;
    // Ordered to match BoxGeometry face groups: +X,-X,+Y,-Y,+Z,-Z
    const localAxes = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    ];
    const halves = [halfExtents.x, halfExtents.x, halfExtents.y, halfExtents.y, halfExtents.z, halfExtents.z];

    const prevSkip = this._skipRecord;
    this._skipRecord = true;
    const planeIds = [];
    for (let i = 0; i < 6; i++) {
      const worldNormal = localAxes[i].clone().applyQuaternion(quaternion).normalize();
      const faceCenter = center.clone().addScaledVector(worldNormal, halves[i]);
      const id = this.addClipPlane(worldNormal, faceCenter);
      // Tag so the sectioning-tool gizmo-creation loop skips these planes.
      const pd = this.clipPlanes.get(id);
      if (pd) pd.isBoxPlane = true;
      planeIds.push(id);
    }
    this._skipRecord = prevSkip;
    this.sectionBoxPlaneIds = planeIds;
    this._sectionBoxPlaneSet = new Set(planeIds);

    // Show the section-plane gizmo ring on every box face so they can be
    // individually dragged exactly like regular section planes.
    for (const id of planeIds) {
      this._showPlaneGizmo(id);
    }
  }

  // Build (or rebuild) the translucent face + edge meshes from _boxState.
  _buildBoxMesh() {
    // Dispose previous
    if (this._boxFaceMesh) {
      this.helpersGroup.remove(this._boxFaceMesh);
      this._boxFaceMesh.geometry.dispose();
      this._boxFaceMesh = null;
    }
    if (this._boxEdgeMesh) {
      this.helpersGroup.remove(this._boxEdgeMesh);
      this._boxEdgeMesh.geometry.dispose();
      this._boxEdgeMesh = null;
    }
    if (this._boxFaceMaterials) {
      this._boxFaceMaterials.forEach(m => m.dispose());
      this._boxFaceMaterials = null;
    }

    const { center, halfExtents, quaternion } = this._boxState;

    // Face fill — 6 materials (one per BoxGeometry face group) for per-face hover highlight.
    //
    // Key material properties:
    //   FrontSide    — render only outward-facing surfaces; prevents the inner/outer face
    //                  stack that caused the heavy blue pixelation (12 transparent layers).
    //   depthTest:false — THE z-fighting fix. Box faces sit at exactly the clip-plane
    //                  boundary. Clipped model triangles are at essentially the same GPU
    //                  depth, so the renderer flickers between "box wins" and "model wins"
    //                  per-fragment per-frame → stippled noise. Disabling depth testing
    //                  makes each face render as a pure 2-D colour overlay — the model
    //                  already in the framebuffer shows through the transparent tint.
    //   depthWrite:false — transparent pass; must not corrupt the depth buffer.
    //   clippingPlanes:[] — opts the visual mesh out of the renderer's global clip planes
    //                  so the face isn't self-clipped by the plane it lies exactly on.
    this._boxFaceMaterials = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({
      color: 0x2B5CE6,
      transparent: true,
      opacity: 0.13,
      side: THREE.FrontSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      clippingPlanes: [],
      clipIntersection: false,
    }));

    const unitGeo = new THREE.BoxGeometry(1, 1, 1);
    this._boxFaceMesh = new THREE.Mesh(unitGeo, this._boxFaceMaterials);
    this._boxFaceMesh.scale.set(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2);
    this._boxFaceMesh.position.copy(center);
    this._boxFaceMesh.quaternion.copy(quaternion);
    this._boxFaceMesh.renderOrder = 1;
    this._boxFaceMesh.userData.isPlaneHelper = true;
    this._boxFaceMesh.userData.isSectionBox = true;
    this._boxFaceMesh.visible = false;
    this.helpersGroup.add(this._boxFaceMesh);

    // Edge overlay — crisp blue outline of the full box boundary.
    // depthTest:true so back edges are naturally occluded by the model interior.
    const edgeGeo = new THREE.EdgesGeometry(unitGeo);
    this._boxEdgeMesh = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
      color: 0x2B5CE6,
      transparent: true,
      opacity: 0.75,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      clippingPlanes: [],
    }));
    this._boxEdgeMesh.scale.copy(this._boxFaceMesh.scale);
    this._boxEdgeMesh.position.copy(center);
    this._boxEdgeMesh.quaternion.copy(quaternion);
    this._boxEdgeMesh.renderOrder = 2;
    this._boxEdgeMesh.userData.isPlaneHelper = true;
    this._boxEdgeMesh.userData.isSectionBox = true;
    this._boxEdgeMesh.visible = false;
    this.helpersGroup.add(this._boxEdgeMesh);
  }

  // Sync the box visual mesh to match the current clip plane positions.
  // Called after a face drag moves one of the box planes via movePlane().
  _syncBoxMeshToPlanes() {
    if (!this._boxState || this.sectionBoxPlaneIds.length !== 6) return;
    const { quaternion } = this._boxState;

    // Recompute center: midpoint of each opposing face pair.
    const pd0 = this.clipPlanes.get(this.sectionBoxPlaneIds[0]);
    const pd1 = this.clipPlanes.get(this.sectionBoxPlaneIds[1]);
    if (!pd0 || !pd1) return;
    const center = pd0.point.clone().add(pd1.point).multiplyScalar(0.5);
    this._boxState.center.copy(center);

    // Recompute half-extents from face-to-center distance along each local axis.
    const pd2 = this.clipPlanes.get(this.sectionBoxPlaneIds[2]);
    const pd4 = this.clipPlanes.get(this.sectionBoxPlaneIds[4]);
    const axisX = pd0.normal.clone();
    const axisY = pd2 ? pd2.normal.clone() : new THREE.Vector3(0, 1, 0);
    const axisZ = pd4 ? pd4.normal.clone() : new THREE.Vector3(0, 0, 1);

    const halfX = Math.abs(pd0.point.clone().sub(center).dot(axisX));
    const halfY = pd2 ? Math.abs(pd2.point.clone().sub(center).dot(axisY)) : this._boxState.halfExtents.y;
    const halfZ = pd4 ? Math.abs(pd4.point.clone().sub(center).dot(axisZ)) : this._boxState.halfExtents.z;
    this._boxState.halfExtents.set(halfX, halfY, halfZ);

    if (this._boxFaceMesh) {
      this._boxFaceMesh.scale.set(halfX * 2, halfY * 2, halfZ * 2);
      this._boxFaceMesh.position.copy(center);
    }
    if (this._boxEdgeMesh) {
      this._boxEdgeMesh.scale.set(halfX * 2, halfY * 2, halfZ * 2);
      this._boxEdgeMesh.position.copy(center);
    }
  }

  // Recompute all 6 clip planes from the current _boxState (used after move/rotate).
  _syncBoxPlanesToState() {
    if (!this._boxState || this.sectionBoxPlaneIds.length !== 6) return;
    const { center, halfExtents, quaternion } = this._boxState;
    const localAxes = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    ];
    const halves = [halfExtents.x, halfExtents.x, halfExtents.y, halfExtents.y, halfExtents.z, halfExtents.z];
    for (let i = 0; i < 6; i++) {
      const planeId = this.sectionBoxPlaneIds[i];
      const pd = this.clipPlanes.get(planeId);
      if (!pd) continue;
      const worldNormal = localAxes[i].clone().applyQuaternion(quaternion).normalize();
      const faceCenter = center.clone().addScaledVector(worldNormal, halves[i]);
      pd.normal.copy(worldNormal);
      pd.point.copy(faceCenter);
      pd.plane.setFromNormalAndCoplanarPoint(worldNormal.clone().negate(), faceCenter);
    }
    this.updateRendererClipPlanes();
  }

  // Set the active section-box sub-tool ('drag-face' | 'move' | 'rotate').
  setBoxSubTool(tool) {
    this._boxSubTool = tool;
    this._setBoxHoveredFace(-1);

    // drag-face: show gizmo rings, hide the translucent box mesh (rings are enough).
    // move/rotate: hide rings (don't intercept clicks), show the box mesh for dragging.
    const showRings      = tool === 'drag-face';
    const showBox        = tool !== 'drag-face';
    const showRotateGizmos = tool === 'rotate';

    if (this.sectionBoxPlaneIds) {
      for (const planeId of this.sectionBoxPlaneIds) {
        const gizmoData = this._planeGizmos.get(planeId);
        if (!gizmoData) continue;
        if (gizmoData.el) gizmoData.el.style.display = showRings ? 'flex' : 'none';
        if (gizmoData.ring3D) gizmoData.ring3D.visible = showRings;
      }
    }

    if (this._boxFaceMesh) this._boxFaceMesh.visible = showBox;
    if (this._boxEdgeMesh) this._boxEdgeMesh.visible = showBox;

    // Show/hide rotate gizmos — hidden in all modes except rotate.
    for (const gizmo of this._rotateGizmos) {
      gizmo.el.style.display = showRotateGizmos ? 'flex' : 'none';
      if (gizmo.mesh3D) gizmo.mesh3D.visible = showRotateGizmos;
    }
    // Position gizmos immediately on switch so they appear on the correct face
    // without waiting for the next RAF tick.
    if (showRotateGizmos) this._updateRotateGizmoPositions();

    // When switching back to drag-face, snap gizmo centroids to the current
    // plane positions in case a move or rotate happened while rings were hidden.
    if (showRings) {
      this._refreshBoxGizmoCentroids();
    }

    // Clear any box cursor class — hover logic in onMouseMove re-applies it
    // only when the pointer is actually over the box.
    this._setBoxCursor(null);
  }

  // Recompute centroids and snap currentPos for all 6 box-plane gizmos.
  // Called after whole-box move/rotate so rings follow the new plane positions.
  _refreshBoxGizmoCentroids() {
    if (!this.sectionBoxPlaneIds) return;
    for (const id of this.sectionBoxPlaneIds) {
      const gd = this._planeGizmos.get(id);
      const pd = this.clipPlanes.get(id);
      if (!gd || !pd) continue;
      // Face centre is the exact centroid — no model traversal needed.
      gd.centroid  = pd.point.clone();
      gd.currentPos = gd.centroid.clone(); // snap immediately — no lerp from old position
      gd.planeBounds2D = null; // force recompute with new box geometry
    }
  }

  // ── Section-box rotate gizmos ─────────────────────────────────────────────
  // One DOM element per box face, visible only in rotate mode. White circle with
  // a bidirectional rotation-arrow SVG. Dragging drives the existing rotate logic.

  // Draws a filled triangular arrowhead at (x,y) pointing in direction `angle`.
  // The tip is at the origin; the base extends in the -angle direction.
  // angle: the rotation applied to the arrowhead triangle.
  // The tip sits at (x,y); the arrowhead POINTS in screen direction (angle + π/2).
  // For a canvas CW arc ending at endAngle, pass angle=endAngle to point forward.
  _drawRotateArrowhead(ctx, x, y, angle, size, hw) {
    if (hw === undefined) hw = size * 0.65;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);       // tip
    ctx.lineTo(-hw, -size); // base left
    ctx.lineTo( hw, -size); // base right
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Shared helper: draws the white circle background with a drop shadow onto ctx.
  _drawGizmoCircleBackground(ctx, S) {
    const cx = S / 2, cy = S / 2;
    ctx.clearRect(0, 0, S, S);

    // Drop shadow behind the circle.
    ctx.shadowColor   = 'rgba(0,0,0,0.32)';
    ctx.shadowBlur    = S * 0.10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = S * 0.04;

    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.44, 0, Math.PI * 2);
    ctx.fill();

    // Reset shadow before border stroke so the border stays clean.
    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.44, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Creates a canvas texture for a rotate gizmo icon.
  // isTopBottom: two-arc ↺ design.
  // side faces: vertical double-arrow SVG icon.
  _createRotateIconTexture(isTopBottom) {
    const S = 256;
    const canvas = document.createElement('canvas');
    canvas.width  = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    const cx = S / 2, cy = S / 2;

    this._drawGizmoCircleBackground(ctx, S);

    if (!isTopBottom) {
      // Side faces — draw the vertical arrow SVG icon provided by design.
      // The SVG is loaded asynchronously; the white-circle base is visible
      // immediately and the icon appears on the next frame after load.
      const svgStr = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="11.9497" y="2" width="2" height="7" transform="rotate(45 11.9497 2)" fill="#232729"/>
<rect width="2" height="7" transform="matrix(0.707107 -0.707107 -0.707107 -0.707107 11.9497 22.3638)" fill="#232729"/>
<rect x="16.8994" y="6.94971" width="2" height="7" transform="rotate(135 16.8994 6.94971)" fill="#232729"/>
<rect width="2" height="7" transform="matrix(-0.707107 -0.707107 -0.707107 0.707107 16.8994 17.4141)" fill="#232729"/>
<rect x="11" y="4" width="2" height="16" fill="#232729"/>
</svg>`;
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter    = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.colorSpace   = THREE.SRGBColorSpace;
      tex.needsUpdate  = true;

      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => {
        // Re-draw background then overlay icon at 60% of canvas size for clarity.
        this._drawGizmoCircleBackground(ctx, S);
        const iconSize = S * 0.60;
        ctx.drawImage(img, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
        URL.revokeObjectURL(url);
        tex.needsUpdate = true;
      };
      img.src = url;
      return tex;
    }

    // Top / bottom faces — rotate box SVG icon.
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter    = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace   = THREE.SRGBColorSpace;
    tex.needsUpdate  = true;

    const rotateSvgStr = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M5.91238 5.36737C7.62321 3.96483 9.74513 3.38709 11.6843 3.38709C16.8292 3.38709 21 7.55789 21 12.7028C21 17.8478 16.8292 22.0186 11.6843 22.0186C9.02023 22.0186 6.61572 20.8987 4.91944 19.1075L4.74632 18.9247L6.57439 17.1935L6.74752 17.3763C7.98811 18.6862 9.74002 19.5008 11.6843 19.5008C15.4387 19.5008 18.4822 16.4572 18.4822 12.7028C18.4822 8.94841 15.4387 5.90486 11.6843 5.90486C10.1722 5.90486 8.61681 6.36285 7.40937 7.40025L10.7529 7.70925L10.5212 10.2163L3 9.52125L3.69508 2L6.20216 2.23169L5.91238 5.36737Z" fill="#232729"/>
</svg>`;
    const rotateBlob = new Blob([rotateSvgStr], { type: 'image/svg+xml' });
    const rotateUrl  = URL.createObjectURL(rotateBlob);
    const rotateImg  = new Image();
    rotateImg.onload = () => {
      this._drawGizmoCircleBackground(ctx, S);
      const iconSize = S * 0.60;
      ctx.drawImage(rotateImg, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
      URL.revokeObjectURL(rotateUrl);
      tex.needsUpdate = true;
    };
    rotateImg.src = rotateUrl;
    return tex;
  }

  _buildRotateGizmos() {
    this._destroyRotateGizmos();
    if (!this._boxState || !this.sectionBoxPlaneIds?.length) return;

    // Only top/bottom faces get a gizmo (Option A — Y-axis spin only).
    const texTopBottom = this._createRotateIconTexture(true);

    const overlayParent = this.domElement.parentElement || this.domElement;

    for (const planeId of this.sectionBoxPlaneIds) {
      const pd = this.clipPlanes.get(planeId);
      if (!pd) continue;
      const isTopBottom = Math.abs(pd.normal.y) > 0.7;

      // Option A: only the top/bottom face gets a rotate gizmo (Y-axis spin only).
      if (!isTopBottom) continue;

      // ── Invisible DOM hit area (pointer events only — no visual) ─────────
      const el = document.createElement('div');
      Object.assign(el.style, {
        position:      'absolute',
        width:         '72px',
        height:        '72px',
        display:       'none',
        transform:     'translate(-50%,-50%)',
        pointerEvents: 'auto',
        zIndex:        '1001',
        userSelect:    'none',
        touchAction:   'none',
        cursor:        'grab',
      });
      overlayParent.appendChild(el);

      // ── 3D PlaneGeometry — lies flat in the face plane ───────────────────
      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        map:            texTopBottom,
        transparent:    true,
        side:           THREE.DoubleSide,
        depthTest:      false,  // always render in front — depth buffer from main pass would hide it
        depthWrite:     false,
        clippingPlanes: [],
        clipIntersection: false,
      });
      const mesh3D = new THREE.Mesh(geo, mat);
      mesh3D.visible = false;               // hidden until rotate mode is active
      // Add to the unclipped overlay scene so section box clip planes don't hide it.
      if (!this._gizmoRingScene) {
        this._gizmoRingScene = new THREE.Scene();
      }
      this._gizmoRingScene.add(mesh3D);

      const gizmoRef = { el, planeId, mesh3D, isTopBottom };
      this._rotateGizmos.push(gizmoRef);

      // ── Pointer event handling ───────────────────────────────────────────
      // Self-contained drag: rotation is applied here directly (not via
      // onMouseMove) and document-level capture listeners guarantee that
      // pointerup is always received even when the cursor leaves the element
      // or the canvas intercepts events below.
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._boxState) return;

        el.style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing';

        this._isBoxDragging      = true;
        this._boxDragType        = 'rotate';
        this._boxRotateCumulative = 0;
        let lastX = e.clientX;
        this._boxRotateStartQuat  = this._boxState.quaternion.clone();
        this._rotatePinnedCornerSigns = gizmoRef._lastCornerSigns || null;

        const onMove = (mv) => {
          // Safety: if mouse button was released outside the window, end drag.
          if (mv.buttons === 0) { onEnd(mv); return; }
          mv.stopPropagation();
          mv.preventDefault();

          const dx = mv.clientX - lastX;
          lastX = mv.clientX;
          if (Math.abs(dx) > 0.5) {
            const angleY = dx * 0.008;
            const dqY = new THREE.Quaternion()
              .setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
            this._boxState.quaternion.premultiply(dqY);
            this._boxRotateCumulative += angleY;
            this._syncBoxPlanesToState();
            if (this._boxFaceMesh) this._boxFaceMesh.quaternion.copy(this._boxState.quaternion);
            if (this._boxEdgeMesh) this._boxEdgeMesh.quaternion.copy(this._boxState.quaternion);
          }
          this.clearHoverHighlight?.();
        };

        const onEnd = (up) => {
          document.removeEventListener('pointermove', onMove, { capture: true });
          document.removeEventListener('pointerup',   onEnd,  { capture: true });
          document.removeEventListener('pointercancel', onEnd, { capture: true });
          el.style.cursor = 'grab';
          document.body.style.cursor = '';
          this._setCursor('');

          this._isBoxDragging = false;
          this._boxDragType   = null;

          const beforeQuat = this._boxRotateStartQuat;
          const afterQuat  = this._boxState?.quaternion.clone();
          this._boxRotateStartQuat  = null;
          this._rotatePinnedCornerSigns = null;
          this._boxRotateCumulative = 0;

          if (beforeQuat && afterQuat && !beforeQuat.equals(afterQuat)) {
            this._pushAction({
              type: 'box-rotate',
              undo: () => { this._applyBoxQuaternion(beforeQuat); },
              redo: () => { this._applyBoxQuaternion(afterQuat); },
            });
          }
          this._refreshBoxGizmoCentroids();
          this._setBoxCursor(null);
        };

        document.addEventListener('pointermove', onMove, { capture: true });
        document.addEventListener('pointerup',   onEnd,  { capture: true });
        document.addEventListener('pointercancel', onEnd, { capture: true });
      });
    }

    // Store shared textures for disposal
    this._rotateGizmoTextures = [texTopBottom];
  }

  _destroyRotateGizmos() {
    for (const { el, mesh3D } of this._rotateGizmos) {
      el.remove();
      if (mesh3D) {
        if (this._gizmoRingScene) this._gizmoRingScene.remove(mesh3D);
        mesh3D.geometry.dispose();
        mesh3D.material.dispose(); // material is per-mesh; texture disposal is below
      }
    }
    this._rotateGizmos = [];
    if (this._rotateGizmoTextures) {
      this._rotateGizmoTextures.forEach(t => t.dispose());
      this._rotateGizmoTextures = null;
    }
  }

  // Projects each face's display position to screen (for the DOM hit area) and
  // updates the 3D mesh position, orientation, and scale each frame.
  // Top/bottom gizmos are offset to a corner of the face for easier grabbing.
  _updateRotateGizmoPositions() {
    if (!this._rotateGizmos.length) return;
    const rect  = this.domElement.getBoundingClientRect();
    const halfW = rect.width  / 2;
    const halfH = rect.height / 2;
    const tempV      = new THREE.Vector3();
    const _tempCamDir = new THREE.Vector3();
    const camPos = this.camera.position;

    for (const gizmo of this._rotateGizmos) {
      const pd = this.clipPlanes.get(gizmo.planeId);
      if (!pd) {
        gizmo.el.style.display = 'none';
        if (gizmo.mesh3D) gizmo.mesh3D.visible = false;
        continue;
      }

      // Only show on front-facing faces.
      const facingCamera = camPos.clone().sub(pd.point).dot(pd.normal) > 0;
      if (!facingCamera) {
        gizmo.el.style.display = 'none';
        if (gizmo.mesh3D) gizmo.mesh3D.visible = false;
        continue;
      }

      // Place the gizmo at the nearest corner of the top face to the camera.
      // While dragging, keep it pinned to the corner where the drag began so
      // it doesn't jump mid-interaction. On release it snaps to nearest again.
      let displayPoint = pd.point;
      if (gizmo.isTopBottom && this._boxState) {
        const q  = this._boxState.quaternion;
        const he = this._boxState.halfExtents;
        const tX = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        const tY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const tZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);

        // Use box-state center + Y half-extent as the base so that corner
        // positions stay correct when side faces are dragged (pd.point only
        // updates when the top face itself moves, not when X/Z extents change).
        const faceCenter = this._boxState.center.clone()
          .addScaledVector(tY, pd.normal.dot(tY) > 0 ? he.y : -he.y);

        // f=0.90 places the gizmo at 90% of the way from face-center to corner.
        const f  = 0.90;
        const cornerSigns = [
          { sX:  1, sZ:  1 },
          { sX:  1, sZ: -1 },
          { sX: -1, sZ:  1 },
          { sX: -1, sZ: -1 },
        ];
        const corners = cornerSigns.map(({ sX, sZ }) =>
          faceCenter.clone().addScaledVector(tX, he.x * f * sX).addScaledVector(tZ, he.z * f * sZ)
        );

        const isDraggingThis =
          this._isBoxDragging &&
          this._boxDragType === 'rotate' &&
          this._rotatePinnedCornerSigns;

        if (isDraggingThis) {
          // Recompute world position of the pinned corner as the box rotates.
          const { sX, sZ } = this._rotatePinnedCornerSigns;
          displayPoint = faceCenter.clone()
            .addScaledVector(tX, he.x * f * sX)
            .addScaledVector(tZ, he.z * f * sZ);
        } else {
          // Pick the corner that projects lowest on screen (highest pixel-Y),
          // which is always the corner visually nearest to the viewer regardless
          // of box aspect ratio or camera height.
          const projV = new THREE.Vector3();
          let bestIdx   = 0;
          let bestScreenY = -Infinity;  // NDC y=-1 is bottom; we want the lowest
          corners.forEach((c, i) => {
            projV.copy(c).project(this.camera);
            // NDC y decreases toward the bottom of the screen; flip it so
            // "lower on screen" = higher value = visually closest corner.
            const screenY = -projV.y;
            if (screenY > bestScreenY) { bestScreenY = screenY; bestIdx = i; }
          });
          gizmo._lastCornerSigns = cornerSigns[bestIdx];
          displayPoint = corners[bestIdx];
        }
      }

      tempV.copy(displayPoint).project(this.camera);
      if (tempV.z > 1) {
        gizmo.el.style.display = 'none';
        if (gizmo.mesh3D) gizmo.mesh3D.visible = false;
        continue;
      }

      // DOM hit area — projected screen position.
      const x = (tempV.x * halfW) + halfW;
      const y = -(tempV.y * halfH) + halfH;
      gizmo.el.style.display = 'flex';
      gizmo.el.style.left    = `${x}px`;
      gizmo.el.style.top     = `${y}px`;

      // 3D mesh — lies flat in the face plane, scales with camera distance.
      if (gizmo.mesh3D) {
        gizmo.mesh3D.visible = (this._boxSubTool === 'rotate');
        const camDist = camPos.distanceTo(displayPoint);
        const scale   = Math.max(Math.min(camDist * 0.045, 10), camDist * 0.011);
        gizmo.mesh3D.scale.setScalar(scale);

        // Offset slightly toward the camera so the icon sits in front of the face.
        const camDir = _tempCamDir.copy(camPos).sub(displayPoint).normalize();
        gizmo.mesh3D.position.copy(displayPoint).addScaledVector(camDir, scale * 0.03);

        // Billboard: always face the camera so the icon stays upright regardless
        // of how the section box is rotated.
        gizmo.mesh3D.quaternion.copy(this.camera.quaternion);
      }
    }
  }

  // Apply (or clear) a section-box cursor via CSS class so it wins over the
  // orbit-mode !important class that blocks inline style.cursor changes.
  // tool: 'move' | 'rotate' | null (null = clear, show default)
  _setBoxCursor(tool) {
    this._mvContainer.classList.remove('mv-cursor-box-move', 'mv-cursor-box-rotate');
    if (tool === 'move') {
      this._mvContainer.classList.add('mv-cursor-box-move');
    } else if (tool === 'rotate') {
      this._mvContainer.classList.add('mv-cursor-box-rotate');
    }
  }

  // Returns a CSS cursor value for the rotate-box interaction.
  // Uses a circular-arrow SVG encoded as a data URI so no extra assets are needed.
  _rotateCursorCSS() {
    if (this.__rotateCursorCSS) return this.__rotateCursorCSS;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <path fill="white" stroke="black" stroke-width="0.5"
        d="M12 4a8 8 0 1 0 7.94 7H22A10 10 0 1 1 12 2v2z"/>
      <polygon fill="white" stroke="black" stroke-width="0.5" points="10,0 14,0 12,4"/>
    </svg>`;
    const encoded = encodeURIComponent(svg);
    this.__rotateCursorCSS = `url("data:image/svg+xml,${encoded}") 12 12, alias`;
    return this.__rotateCursorCSS;
  }

  // Highlight/unhighlight a box face material for hover feedback.
  _setBoxHoveredFace(_faceIdx) {
    // No hover/select visual state on the box faces — cursor change is sufficient feedback.
    this._boxHoveredFace = -1;
  }

  // Translate the entire box by a world-space delta vector.
  _translateSectionBox(delta) {
    if (!this._boxState) return;
    this._boxState.center.add(delta);
    for (const planeId of this.sectionBoxPlaneIds) {
      const pd = this.clipPlanes.get(planeId);
      if (!pd) continue;
      pd.point.add(delta);
      pd.plane.constant += delta.dot(pd.normal);
    }
    if (this._boxFaceMesh) this._boxFaceMesh.position.copy(this._boxState.center);
    if (this._boxEdgeMesh) this._boxEdgeMesh.position.copy(this._boxState.center);
    this.updateRendererClipPlanes();
  }

  // Rotate the entire box around the Y-axis through its center by angleY radians.
  _rotateSectionBox(angleY) {
    if (!this._boxState) return;
    const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
    this._boxState.quaternion.premultiply(dq);
    this._syncBoxPlanesToState();
    if (this._boxFaceMesh) this._boxFaceMesh.quaternion.copy(this._boxState.quaternion);
    if (this._boxEdgeMesh) this._boxEdgeMesh.quaternion.copy(this._boxState.quaternion);
  }

  // Snap the box to an absolute quaternion (used for undo/redo of rotate drags).
  _applyBoxQuaternion(quat) {
    if (!this._boxState) return;
    this._boxState.quaternion.copy(quat);
    this._syncBoxPlanesToState();
    if (this._boxFaceMesh) this._boxFaceMesh.quaternion.copy(quat);
    if (this._boxEdgeMesh) this._boxEdgeMesh.quaternion.copy(quat);
  }

  clearSectionBox() {
    const ids = [...this.sectionBoxPlaneIds];
    ids.forEach(id => this.removeClipPlane(id));
    this.sectionBoxPlaneIds = [];
    this._sectionBoxPlaneSet = new Set();

    // Legacy wireframe group (pre-redesign)
    if (this.sectionBoxGroup) {
      this.helpersGroup.remove(this.sectionBoxGroup);
      this.disposeHelper(this.sectionBoxGroup);
      this.sectionBoxGroup = null;
    }

    if (this._boxFaceMesh) {
      this.helpersGroup.remove(this._boxFaceMesh);
      this._boxFaceMesh.geometry.dispose();
      this._boxFaceMesh = null;
    }
    if (this._boxEdgeMesh) {
      this.helpersGroup.remove(this._boxEdgeMesh);
      this._boxEdgeMesh.geometry.dispose();
      this._boxEdgeMesh = null;
    }
    if (this._boxFaceMaterials) {
      this._boxFaceMaterials.forEach(m => m.dispose());
      this._boxFaceMaterials = null;
    }

    this._destroyRotateGizmos();

    this._boxState = null;
    this._boxHoveredFace = -1;
    this._isBoxDragging = false;
    this._boxDragType = null;
    if (this.activeSectionPlaneId && this._sectionBoxPlaneSet?.has(this.activeSectionPlaneId)) {
      this.activeSectionPlaneId = null;
      this.emit('active-plane-change', { planeId: null });
    }
  }

  hasSectionBox() {
    return this._boxState !== null && this.sectionBoxPlaneIds.length === 6;
  }

  setHoverHighlight(mesh, faceIndex) {
    this.clearHoverHighlight();
    if (!mesh || !mesh.geometry || !Number.isInteger(faceIndex)) return;

    const geometry = mesh.geometry;
    if (!geometry.index || !geometry.attributes?.position) return;
    const indexAttr = geometry.index;
    const positionAttr = geometry.attributes.position;
    const i0 = indexAttr.getX(faceIndex * 3 + 0);
    const i1 = indexAttr.getX(faceIndex * 3 + 1);
    const i2 = indexAttr.getX(faceIndex * 3 + 2);
    if (i0 == null || i1 == null || i2 == null) return;

    const v0 = new THREE.Vector3(positionAttr.getX(i0), positionAttr.getY(i0), positionAttr.getZ(i0));
    const v1 = new THREE.Vector3(positionAttr.getX(i1), positionAttr.getY(i1), positionAttr.getZ(i1));
    const v2 = new THREE.Vector3(positionAttr.getX(i2), positionAttr.getY(i2), positionAttr.getZ(i2));

    const highlightGeometry = new THREE.BufferGeometry().setFromPoints([v0, v1, v2]);
    highlightGeometry.setIndex([0, 1, 2]);
    highlightGeometry.computeVertexNormals();

    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00a8ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlightMesh.userData.isPlaneHelper = true;
    highlightMesh.matrixAutoUpdate = false;
    highlightMesh.matrix.copy(mesh.matrixWorld);

    this.hoverHighlight = highlightMesh;
    this.helpersGroup.add(highlightMesh);
  }

  clearHoverHighlight() {
    if (!this.hoverHighlight) return;
    this.helpersGroup.remove(this.hoverHighlight);
    this.disposeHelper(this.hoverHighlight);
    this.hoverHighlight = null;
  }

  // ── Section-Cut Authoring ──────────────────────────────────────────

  _filterClippedHits(hits) {
    const planes = this.renderer.clippingPlanes;
    if (!planes || planes.length === 0) return hits;
    return hits.filter(hit => {
      for (const plane of planes) {
        if (plane.distanceToPoint(hit.point) < 0) return false;
      }
      return true;
    });
  }

  getWorldNormalFromHit(hit) {
    const pos = hit.object.geometry?.attributes?.position;
    if (!pos || !hit.face) return null;

    // Build the full world matrix, including per-instance transform if applicable
    const fullMatrix = new THREE.Matrix4();
    if (hit.object.isInstancedMesh && hit.instanceId != null) {
      const instanceMat = new THREE.Matrix4();
      hit.object.getMatrixAt(hit.instanceId, instanceMat);
      fullMatrix.multiplyMatrices(hit.object.matrixWorld, instanceMat);
    } else {
      fullMatrix.copy(hit.object.matrixWorld);
    }

    const { a, b, c } = hit.face;
    const vA = new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(fullMatrix);
    const vB = new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(fullMatrix);
    const vC = new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(fullMatrix);

    const normal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(vB, vA),
        new THREE.Vector3().subVectors(vC, vA),
      )
      .normalize();

    if (!Number.isFinite(normal.x) || !Number.isFinite(normal.y) || !Number.isFinite(normal.z)) return null;

    // Ensure normal faces the camera (outward toward viewer)
    const viewDir = this.raycaster.ray.direction;
    if (normal.dot(viewDir) > 0) normal.negate();

    return normal;
  }

  _applyCutSurfaceHighlight(hit, material = this._cutHoverMaterial) {
    const mesh = hit.object;
    const instanceId = hit.instanceId ?? -1;
    const faceIndex = hit.faceIndex;
    const cacheKey = `${mesh.uuid}:${instanceId}:${faceIndex}`;
    if (this._cutHighlightCacheKey === cacheKey) return;

    this._removeCutSurfaceHighlight();
    if (!mesh || !mesh.geometry) return;

    const geometry = mesh.geometry;
    const index = geometry.index;
    const posAttr = geometry.attributes.position;
    if (!posAttr || !hit.face) return;

    // Full world transform (matrixWorld * instanceMatrix) — same as getWorldNormalFromHit
    const fullMatrix = new THREE.Matrix4();
    if (mesh.isInstancedMesh && instanceId >= 0) {
      const instMat = new THREE.Matrix4();
      mesh.getMatrixAt(instanceId, instMat);
      fullMatrix.multiplyMatrices(mesh.matrixWorld, instMat);
    } else {
      fullMatrix.copy(mesh.matrixWorld);
    }

    // Compute hit-face normal and plane in WORLD space
    const hVA = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.a).applyMatrix4(fullMatrix);
    const hVB = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.b).applyMatrix4(fullMatrix);
    const hVC = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.c).applyMatrix4(fullMatrix);
    const hitNormal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(hVB, hVA),
        new THREE.Vector3().subVectors(hVC, hVA),
      ).normalize();
    const viewDir = this.raycaster.ray.direction;
    if (hitNormal.dot(viewDir) > 0) hitNormal.negate();
    const planeD = hitNormal.dot(hVA);

    const faceCount = index ? index.count / 3 : posAttr.count / 3;
    const normalThresh = 0.95;
    const distThresh = 0.05;

    // Snap world-space positions to a grid so duplicated vertices at the same
    // spatial location produce the same hash. IFC geometry frequently duplicates
    // vertices per-face for hard normals, so index-based adjacency misses edges.
    const SNAP = 1e4;
    const posHash = (v) => `${Math.round(v.x * SNAP)},${Math.round(v.y * SNAP)},${Math.round(v.z * SNAP)}`;
    const spatialEdgeKey = (h1, h2) => h1 < h2 ? `${h1}|${h2}` : `${h2}|${h1}`;

    const candidateFaces = new Set();
    const faceVerts = [];    // [faceIdx] → {wA, wB, wC, hA, hB, hC}
    const edgeToFaces = {};  // "posHash|posHash" → [faceIdx, …]
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const tempN = new THREE.Vector3();

    for (let i = 0; i < faceCount; i++) {
      let a, b, c;
      if (index) {
        a = index.getX(i * 3);
        b = index.getX(i * 3 + 1);
        c = index.getX(i * 3 + 2);
      } else {
        a = i * 3; b = i * 3 + 1; c = i * 3 + 2;
      }

      vA.fromBufferAttribute(posAttr, a).applyMatrix4(fullMatrix);
      vB.fromBufferAttribute(posAttr, b).applyMatrix4(fullMatrix);
      vC.fromBufferAttribute(posAttr, c).applyMatrix4(fullMatrix);

      tempN.crossVectors(
        vB.clone().sub(vA),
        vC.clone().sub(vA)
      ).normalize();

      if (tempN.dot(hitNormal) < normalThresh) continue;
      if (tempN.dot(viewDir) > 0) continue;

      if (
        Math.abs(hitNormal.dot(vA) - planeD) > distThresh ||
        Math.abs(hitNormal.dot(vB) - planeD) > distThresh ||
        Math.abs(hitNormal.dot(vC) - planeD) > distThresh
      ) continue;

      const hA = posHash(vA), hB = posHash(vB), hC = posHash(vC);
      candidateFaces.add(i);
      faceVerts[i] = { wA: vA.clone(), wB: vB.clone(), wC: vC.clone(), hA, hB, hC };

      for (const ek of [spatialEdgeKey(hA, hB), spatialEdgeKey(hB, hC), spatialEdgeKey(hA, hC)]) {
        if (!edgeToFaces[ek]) edgeToFaces[ek] = [];
        edgeToFaces[ek].push(i);
      }
    }

    if (!candidateFaces.has(faceIndex)) return;

    // Flood-fill from the hit face through spatially-shared edges to find
    // only the connected surface, not disconnected coplanar patches.
    const visited = new Set();
    const queue = [faceIndex];
    visited.add(faceIndex);
    while (queue.length > 0) {
      const fi = queue.pop();
      const fv = faceVerts[fi];
      if (!fv) continue;
      for (const ek of [spatialEdgeKey(fv.hA, fv.hB), spatialEdgeKey(fv.hB, fv.hC), spatialEdgeKey(fv.hA, fv.hC)]) {
        const neighbors = edgeToFaces[ek];
        if (!neighbors) continue;
        for (const ni of neighbors) {
          if (!visited.has(ni) && candidateFaces.has(ni)) {
            visited.add(ni);
            queue.push(ni);
          }
        }
      }
    }

    // Build overlay geometry from connected faces (already in world space)
    const positions = [];
    for (const fi of visited) {
      const fv = faceVerts[fi];
      if (!fv) continue;
      positions.push(
        fv.wA.x, fv.wA.y, fv.wA.z,
        fv.wB.x, fv.wB.y, fv.wB.z,
        fv.wC.x, fv.wC.y, fv.wC.z,
      );
    }

    if (positions.length === 0) return;

    const hlGeo = new THREE.BufferGeometry();
    hlGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const hlMesh = new THREE.Mesh(hlGeo, material);
    hlMesh.userData.isPlaneHelper = true;
    hlMesh.renderOrder = 999;

    this._cutSurfaceHighlight = hlMesh;
    this._cutHighlightCacheKey = cacheKey;
    this.helpersGroup.add(hlMesh);
  }

  _removeCutSurfaceHighlight() {
    if (!this._cutSurfaceHighlight) return;
    this.helpersGroup.remove(this._cutSurfaceHighlight);
    this._cutSurfaceHighlight.geometry.dispose();
    this._cutSurfaceHighlight = null;
    this._cutHighlightCacheKey = null;
  }

  setCutHoverMarker(point, normal) {
    this.clearCutHoverMarker();

    const camDist = this.camera.position.distanceTo(point);
    const radius = camDist * 0.02;

    // Crosshair arms rotate with the cut line — tangent always lies
    // along the line, bitangent always points perpendicular to it. The
    // dimmed half-arm therefore stays anchored to the cut-away side.
    const tangent = this._computeCutPreviewTangent(normal);
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    const group = new THREE.Group();
    group.userData.isPlaneHelper = true;

    const strokeWidth = radius * 0.15;
    const outlineExtra = strokeWidth * 0.6;
    const armLen = radius;

    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x006c16,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
      clippingPlanes: [],
      toneMapped: false,
    });
    const strokeMat = new THREE.MeshBasicMaterial({
      color: 0x00ff33,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
      clippingPlanes: [],
      toneMapped: false,
    });

    // Dimmed copies for the half-arm that points into the cut-away
    // half-space. 40% opacity so the contrast reads clearly without
    // making the dim arm disappear entirely.
    const fillMatDim = fillMat.clone();
    fillMatDim.opacity = 0.4;
    const strokeMatDim = strokeMat.clone();
    strokeMatDim.opacity = 0.4;

    const origin = point.clone().addScaledVector(normal, radius * 0.15);

    // Shared orientation bases
    const arm1Z = normal.clone();
    const arm1X = tangent.clone();
    const arm1Y = new THREE.Vector3().crossVectors(arm1Z, arm1X).normalize();
    const arm1Quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(arm1X, arm1Y, arm1Z)
    );
    const arm2X = bitangent.clone();
    const arm2Y = new THREE.Vector3().crossVectors(arm1Z, arm2X).normalize();
    const arm2Quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(arm2X, arm2Y, arm1Z)
    );

    const makeRoundedDashGeo = (len, width) => {
      const hw = len / 2, hh = width / 2;
      const r = Math.min(hh, hw);
      const shape = new THREE.Shape();
      shape.moveTo(-hw + r, -hh);
      shape.lineTo(hw - r, -hh);
      shape.absarc(hw - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
      shape.lineTo(-hw + r, hh);
      shape.absarc(-hw + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
      return new THREE.ShapeGeometry(shape, 12);
    };

    const dashLen = armLen * 0.28;
    const gapLen = armLen * 0.14;
    const totalArm = armLen;

    // posMats: materials for the +sign half of the arm (offset along +dirVec)
    // negMats: materials for the -sign half (offset along -dirVec)
    const addDashedArm = (dirVec, quat, posMats, negMats) => {
      let offset = dashLen / 2;
      while (offset + dashLen / 2 <= totalArm + 0.001) {
        for (const sign of [1, -1]) {
          const mats = sign > 0 ? posMats : negMats;
          const dashOrigin = origin.clone().addScaledVector(dirVec, sign * offset);

          // Stroke dash (behind)
          const sGeo = makeRoundedDashGeo(dashLen + outlineExtra, strokeWidth + outlineExtra);
          const sMesh = new THREE.Mesh(sGeo, mats.stroke);
          sMesh.userData.isPlaneHelper = true;
          sMesh.renderOrder = 999;
          sMesh.position.copy(dashOrigin);
          sMesh.quaternion.copy(quat);
          group.add(sMesh);

          // Fill dash (on top)
          const fGeo = makeRoundedDashGeo(dashLen, strokeWidth);
          const fMesh = new THREE.Mesh(fGeo, mats.fill);
          fMesh.userData.isPlaneHelper = true;
          fMesh.renderOrder = 1000;
          fMesh.position.copy(dashOrigin);
          fMesh.quaternion.copy(quat);
          group.add(fMesh);
        }
        offset += dashLen + gapLen;
      }
    };

    const fullMats = { stroke: strokeMat, fill: fillMat };
    const dimMats = { stroke: strokeMatDim, fill: fillMatDim };

    // Tangent arm runs along the green line itself — both halves stay
    // full opacity. Bitangent arm is perpendicular to the line:
    // -bitangent = cut-away half-space (dim — represents what gets
    // removed), +bitangent = kept (full).
    addDashedArm(tangent, arm1Quat, fullMats, fullMats);
    addDashedArm(bitangent, arm2Quat, fullMats, dimMats);

    this.cutHoverMarker = group;
    this.helpersGroup.add(group);

    // Position scissors overlay in screen space above the 3D point
    this._showScissorsOverlay(point);

    // Build / update the green preview line showing where the cut will slice.
    this._updateCutPreviewLine(point, normal);
  }

  _loadArrowSpriteTexture() {
    const svgStr = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="m" maskUnits="userSpaceOnUse" x="5.34277" y="1" width="13" height="22" fill="black">
<rect fill="white" x="5.34277" y="1" width="13" height="22"/>
<path d="M16.9493 6.95016C17.3398 7.34067 17.3397 7.97375 16.9492 8.36423C16.5587 8.75473 15.9256 8.75473 15.5351 8.36423L13.8536 6.68266C13.5386 6.36767 13 6.59076 13 7.03621L13 17.2773C13 17.7227 13.5386 17.9458 13.8536 17.6308L15.5348 15.9495C15.9255 15.5589 16.559 15.5592 16.9495 15.95C17.3398 16.3405 17.3398 16.9737 16.9494 17.3641L12.707 21.6064C12.3165 21.9969 11.6834 21.997 11.2929 21.6065L7.04976 17.3641C6.65927 16.9737 6.65927 16.3405 7.04959 15.9499C7.44008 15.5592 8.07357 15.5589 8.46419 15.9495L10.1464 17.6318C10.4614 17.9468 11 17.7237 11 17.2782L11 7.03523C11 6.58978 10.4614 6.3667 10.1464 6.68168L8.46387 8.36426C8.07338 8.75474 7.44029 8.75474 7.0498 8.36426C6.65932 7.97378 6.65932 7.34068 7.0498 6.9502L11.2928 2.70717C11.6834 2.31662 12.3166 2.31665 12.7071 2.70723L16.9493 6.95016Z"/>
</mask>
<path d="M16.9493 6.95016C17.3398 7.34067 17.3397 7.97375 16.9492 8.36423C16.5587 8.75473 15.9256 8.75473 15.5351 8.36423L13.8536 6.68266C13.5386 6.36767 13 6.59076 13 7.03621L13 17.2773C13 17.7227 13.5386 17.9458 13.8536 17.6308L15.5348 15.9495C15.9255 15.5589 16.559 15.5592 16.9495 15.95C17.3398 16.3405 17.3398 16.9737 16.9494 17.3641L12.707 21.6064C12.3165 21.9969 11.6834 21.997 11.2929 21.6065L7.04976 17.3641C6.65927 16.9737 6.65927 16.3405 7.04959 15.9499C7.44008 15.5592 8.07357 15.5589 8.46419 15.9495L10.1464 17.6318C10.4614 17.9468 11 17.7237 11 17.2782L11 7.03523C11 6.58978 10.4614 6.3667 10.1464 6.68168L8.46387 8.36426C8.07338 8.75474 7.44029 8.75474 7.0498 8.36426C6.65932 7.97378 6.65932 7.34068 7.0498 6.9502L11.2928 2.70717C11.6834 2.31662 12.3166 2.31665 12.7071 2.70723L16.9493 6.95016Z" fill="#194D1E"/>
<path d="M11.2928 2.70717L10.5857 2.00006L11.2928 2.70717ZM7.0498 6.9502L6.3427 6.24309L7.0498 6.9502ZM8.46387 8.36426L7.75676 7.65715L8.46387 8.36426ZM10.1464 17.6318L10.8536 16.9247L10.1464 17.6318ZM7.04976 17.3641L6.34271 18.0713L7.04976 17.3641ZM12.707 21.6064L11.9999 20.8993L12.707 21.6064ZM11.2929 21.6065L10.5858 22.3137L11.2929 21.6065ZM16.9495 15.95L17.6568 15.2431L16.9495 15.95ZM16.9494 17.3641L17.6565 18.0712L16.9494 17.3641ZM13.8536 17.6308L14.5607 18.3379L13.8536 17.6308ZM16.9492 8.36423L16.2421 7.65712L16.9492 8.36423ZM16.9493 6.95016L16.2421 7.65721L16.9493 6.95016ZM15.5351 8.36423L16.2422 7.65712L14.5607 5.97555L13.8536 6.68266L13.1464 7.38976L14.828 9.07133L15.5351 8.36423ZM13 7.03621H12L12 17.2773H13H14L14 7.03621H13ZM13.8536 17.6308L14.5607 18.3379L16.2419 16.6566L15.5348 15.9495L14.8277 15.2424L13.1464 16.9237L13.8536 17.6308ZM16.9494 17.3641L16.2423 16.657L11.9999 20.8993L12.707 21.6064L13.4142 22.3135L17.6565 18.0712L16.9494 17.3641ZM11.2929 21.6065L11.9999 20.8993L7.7568 16.6569L7.04976 17.3641L6.34271 18.0713L10.5858 22.3137L11.2929 21.6065ZM8.46419 15.9495L7.75708 16.6566L9.43934 18.3389L10.1464 17.6318L10.8536 16.9247L9.17129 15.2424L8.46419 15.9495ZM11 17.2782H12L12 7.03523H11H10L10 17.2782H11ZM10.1464 6.68168L9.43934 5.97457L7.75676 7.65715L8.46387 8.36426L9.17097 9.07136L10.8536 7.38879L10.1464 6.68168ZM7.0498 6.9502L7.75691 7.6573L11.9999 3.41427L11.2928 2.70717L10.5857 2.00006L6.3427 6.24309L7.0498 6.9502ZM12.7071 2.70723L11.9999 3.41427L16.2421 7.65721L16.9493 6.95016L17.6565 6.24312L13.4143 2.00018L12.7071 2.70723ZM11.2928 2.70717L11.9999 3.41427L11.9999 3.41427L12.7071 2.70723L13.4143 2.00018C12.6332 1.21902 11.3668 1.21896 10.5857 2.00006L11.2928 2.70717ZM7.0498 8.36426L7.75691 7.65715V7.6573L7.0498 6.9502L6.3427 6.24309C5.56169 7.0241 5.56169 8.29036 6.3427 9.07136L7.0498 8.36426ZM8.46387 8.36426L7.75676 7.65715L7.75691 7.65715L7.0498 8.36426L6.3427 9.07136C7.1237 9.85237 8.38997 9.85237 9.17097 9.07136L8.46387 8.36426ZM11 7.03523H12C12 5.69887 10.3843 5.02962 9.43934 5.97457L10.1464 6.68168L10.8536 7.38879C10.5386 7.70377 10 7.48068 10 7.03523H11ZM10.1464 17.6318L9.43934 18.3389C10.3843 19.2839 12 18.6146 12 17.2782H11H10C10 16.8328 10.5386 16.6097 10.8536 16.9247L10.1464 17.6318ZM7.04959 15.9499L7.75694 16.6568L7.75708 16.6566L8.46419 15.9495L9.17129 15.2424C8.38987 14.461 7.12303 14.4617 6.34224 15.2431L7.04959 15.9499ZM7.04976 17.3641L7.7568 16.6569L7.75694 16.6568L7.04959 15.9499L6.34224 15.2431C5.56178 16.0241 5.56156 17.2902 6.34271 18.0713L7.04976 17.3641ZM12.707 21.6064L11.9999 20.8993V20.8993L11.2929 21.6065L10.5858 22.3137C11.3669 23.0946 12.6332 23.0945 13.4142 22.3135L12.707 21.6064ZM16.9495 15.95L16.2421 16.6568L16.2423 16.657L16.9494 17.3641L17.6565 18.0712C18.4376 17.2901 18.4372 16.024 17.6568 15.2431L16.9495 15.95ZM15.5348 15.9495L16.2419 16.6566L16.2421 16.6568L16.9495 15.95L17.6568 15.2431C16.8761 14.4618 15.6092 14.461 14.8277 15.2424L15.5348 15.9495ZM13 17.2773H12C12 18.6136 13.6157 19.2829 14.5607 18.3379L13.8536 17.6308L13.1464 16.9237C13.4614 16.6087 14 16.8318 14 17.2773H13ZM13.8536 6.68266L14.5607 5.97555C13.6157 5.0306 12 5.69985 12 7.03621H13H14C14 7.48166 13.4614 7.70474 13.1464 7.38976L13.8536 6.68266ZM16.9492 8.36423L16.2421 7.65712H16.2422L15.5351 8.36423L14.828 9.07133C15.609 9.85236 16.8753 9.85236 17.6564 9.07133L16.9492 8.36423ZM16.9492 8.36423L17.6564 9.07133C18.4373 8.29036 18.4374 7.02416 17.6565 6.24312L16.9493 6.95016L16.2421 7.65721L16.2421 7.65712L16.9492 8.36423Z" fill="#56FF77" mask="url(#m)"/>
</svg>`;
    const sz = 256;
    const canvas = document.createElement('canvas');
    canvas.width = sz;
    canvas.height = sz;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, sz, sz);
      const tex = new THREE.CanvasTexture(canvas);
      tex.premultiplyAlpha = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this._arrowSpriteTexture = tex;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  }

  _showToast(message) {
    // Inject slide-up keyframe once
    if (!document.getElementById('_sectionToastStyles')) {
      const style = document.createElement('style');
      style.id = '_sectionToastStyles';
      style.textContent = `
        @keyframes _toastSlideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    // Full-width fixed container handles centering — no transform conflict with
    // the slide-up animation which only moves in Y.
    const container = document.createElement('div');
    Object.assign(container.style, {
      position:       'fixed',
      bottom:         '16px',
      left:           '0',
      right:          '0',
      display:        'flex',
      justifyContent: 'center',
      zIndex:         '99999',
      pointerEvents:  'none',
    });

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      display:      'flex',
      alignItems:   'center',
      gap:          '10px',
      padding:      '12px 20px',
      borderRadius: '10px',
      background:   '#C0392B',
      color:        '#fff',
      fontSize:     '14px',
      fontWeight:   '500',
      fontFamily:   'system-ui, sans-serif',
      boxShadow:    '0 4px 20px rgba(0,0,0,0.35)',
      whiteSpace:   'nowrap',
      animation:    '_toastSlideUp 0.28s cubic-bezier(0.22,1,0.36,1) forwards',
    });

    const icon = document.createElement('span');
    icon.textContent = '⚠';
    icon.style.fontSize = '16px';
    toast.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    container.appendChild(toast);
    document.body.appendChild(container);

    // After 5 s: transition opacity 0→1 then remove
    const DISPLAY_MS = 5000;
    const FADE_MS    = 400;
    setTimeout(() => {
      toast.style.transition = `opacity ${FADE_MS}ms ease`;
      toast.style.opacity    = '0';
      setTimeout(() => container.remove(), FADE_MS);
    }, DISPLAY_MS);
  }

  _loadGizmoArrowTexture() {
    // Draws the two polygon arrows onto a 128×128 canvas used as a billboard
    // sprite inside each drag-face gizmo ring.
    const sz = 128;
    const pad = 8;
    const svgW = 16, svgH = 68;
    const scale = (sz - pad * 2) / svgH;
    const offsetX = (sz - svgW * scale) / 2;
    const offsetY = pad;
    const tx = (x) => offsetX + x * scale;
    const ty = (y) => offsetY + y * scale;

    const c = 8, aW = 6, sW = 1.5;
    const iR = 1.5;
    const oR = 2.0;

    const arrowBase = 20;
    const topPts = [
      [c,          1 ], [c+aW, arrowBase], [c+sW, arrowBase],
      [c+sW,      34 ], [c-sW,        34], [c-sW, arrowBase], [c-aW, arrowBase],
    ];
    const botPts = [
      [c,         67 ], [c+aW, 68-arrowBase], [c+sW, 68-arrowBase],
      [c+sW,      34 ], [c-sW,            34], [c-sW, 68-arrowBase], [c-aW, 68-arrowBase],
    ];

    const canvas = document.createElement('canvas');
    canvas.width = sz;
    canvas.height = sz;
    const ctx = canvas.getContext('2d');

    const norm = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      return [dx / len, dy / len];
    };

    const drawArrow = (pts, alpha) => {
      const [P0, P1, P2, P3, P4, P5, P6] = pts;
      const d32 = norm(P3, P2);
      const d21 = norm(P2, P1);
      const d65 = norm(P6, P5);
      const d54 = norm(P5, P4);
      const ir = iR * scale;

      ctx.globalAlpha = alpha;
      ctx.beginPath();

      ctx.moveTo(tx(P3[0]), ty(P3[1]));

      ctx.lineTo(tx(P2[0] - d32[0] * oR), ty(P2[1] - d32[1] * oR));
      ctx.quadraticCurveTo(
        tx(P2[0]), ty(P2[1]),
        tx(P2[0] + d21[0] * oR), ty(P2[1] + d21[1] * oR),
      );

      ctx.arcTo(tx(P1[0]), ty(P1[1]), tx(P0[0]), ty(P0[1]), ir);
      ctx.arcTo(tx(P0[0]), ty(P0[1]), tx(P6[0]), ty(P6[1]), ir);
      ctx.arcTo(tx(P6[0]), ty(P6[1]), tx(P5[0]), ty(P5[1]), ir);

      ctx.lineTo(tx(P5[0] - d65[0] * oR), ty(P5[1] - d65[1] * oR));
      ctx.quadraticCurveTo(
        tx(P5[0]), ty(P5[1]),
        tx(P5[0] + d54[0] * oR), ty(P5[1] + d54[1] * oR),
      );

      ctx.lineTo(tx(P4[0]), ty(P4[1]));
      ctx.closePath();

      ctx.fillStyle = '#194D1E';
      ctx.fill();
      ctx.strokeStyle = '#56FF77';
      ctx.lineWidth = 0.75 * scale;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawArrow(topPts, 1.0);
    drawArrow(botPts, 0.4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.premultiplyAlpha = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this._gizmoArrowTexture = tex;
  }

  _loadTiltGizmo() {
    const loader = new GLTFLoader();
    loader.load('/assets/gizmo/scene.gltf', (gltf) => {
      this._tiltGizmoTemplate = gltf.scene;
    });
  }

  // ── Tilt gizmo: attach / detach / sync ─────────────────────────────

  _attachTiltGizmo(planeId) {
    this._detachTiltGizmo();
    if (!this._tiltGizmoEnabled) return;
    if (!this._tiltGizmoTemplate) return;

    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

    const inner = this._tiltGizmoTemplate.clone();

    // Strip to 2 rings only — hide arrows, cubes, and the Z-roll ring
    inner.traverse(node => {
      if (node.name === 'Arrows_3' || node.name === 'Cubes_7') {
        node.visible = false;
      }
      if (node.name === 'Ring_Z_10') {
        node.visible = false;
      }
    });

    // Recolor kept rings to green and exempt from clipping
    const greenEmissive = new THREE.Color(0x56ff77);
    const ringXMeshes = [];
    const ringYMeshes = [];

    inner.traverse(node => {
      if (!node.isMesh) return;

      if (node.material) {
        node.material = node.material.clone();
        node.material.clippingPlanes = [];
        node.material.emissive = greenEmissive.clone();
        node.material.emissiveIntensity = 1.0;
      }

      let p = node.parent;
      while (p) {
        if (p.name === 'Ring_X_8') { ringXMeshes.push(node); break; }
        if (p.name === 'Ring_Y_9') { ringYMeshes.push(node); break; }
        p = p.parent;
      }
    });

    inner.traverse(node => {
      if (node.isMesh) node.userData.isTiltGizmo = true;
    });

    ringXMeshes.forEach(m => { m.userData._tiltAxis = 'x'; });
    ringYMeshes.forEach(m => { m.userData._tiltAxis = 'y'; });

    this._tiltRingXMeshes = ringXMeshes;
    this._tiltRingYMeshes = ringYMeshes;

    // Wrap in a Group so position/quaternion/scale changes take effect.
    // The GLTF clone's root node has matrixAutoUpdate=false (baked matrices),
    // so setting quaternion directly on it is silently ignored by Three.js.
    const gizmo = new THREE.Group();
    gizmo.add(inner);

    // Position — center on the cross-section centroid, offset along normal
    const centroid = this._computeCrossSectionCentroid(planeData.plane) || planeData.point;
    const bounds = this.getSceneBounds();
    const bSize = new THREE.Vector3();
    bounds.getSize(bSize);
    const gizmoOffset = Math.max(bSize.x, bSize.y, bSize.z) * 0.03;
    gizmo.position.copy(centroid)
      .addScaledVector(planeData.normal, gizmoOffset);

    // Orient — copy the helper's full quaternion so the gizmo rings stay aligned
    // with the actual tilt axes (no roll loss from setFromUnitVectors).
    gizmo.quaternion.copy(planeData.helper.quaternion);

    // Initial camera-distance-based scale
    const dist = this.camera.position.distanceTo(planeData.point);
    const scale = THREE.MathUtils.clamp(
      dist * this.GIZMO_SCALE_FACTOR, this.GIZMO_SCALE_MIN, this.GIZMO_SCALE_MAX
    );
    gizmo.scale.setScalar(scale);

    // Render in a dedicated scene so we can bypass all clipping planes
    this._tiltGizmoScene = new THREE.Scene();
    this._tiltGizmoScene.add(gizmo);
    this._tiltGizmo = gizmo;

    this._tiltCumulativeX = 0;
    this._tiltCumulativeY = 0;
  }

  _updateTiltGizmoPosition(planeId) {
    if (!this._tiltGizmo) return;
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;
    const centroid = this._computeCrossSectionCentroid(planeData.plane) || planeData.point;
    const bounds = this.getSceneBounds();
    const bSize = new THREE.Vector3();
    bounds.getSize(bSize);
    const gizmoOffset = Math.max(bSize.x, bSize.y, bSize.z) * 0.03;
    this._tiltGizmo.position.copy(centroid)
      .addScaledVector(planeData.normal, gizmoOffset);
  }

  _detachTiltGizmo() {
    if (!this._tiltGizmo) return;

    if (this._tiltGizmoScene) {
      this._tiltGizmoScene.remove(this._tiltGizmo);
      this._tiltGizmoScene = null;
    }
    this._tiltGizmo.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    this._tiltGizmo = null;
    this._tiltRingXMeshes = null;
    this._tiltRingYMeshes = null;
    this._tiltDragging = false;
    this._tiltAxis = null;
    this._tiltHoveredRing = null;
  }

  _unhighlightTiltRing() {
    if (this._tiltHoveredRing && this._tiltHoveredRing.material) {
      this._tiltHoveredRing.material.emissiveIntensity =
        this._tiltHoveredRing.material._origEmissiveIntensity ?? 1.0;
    }
    this._tiltHoveredRing = null;
  }

  _syncTiltToClipPlane(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData || !planeData.helper) return;

    // Derive new normal from helper's rotated local Z
    const newNormal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(planeData.helper.quaternion);
    planeData.normal.copy(newNormal);

    // Rebuild THREE.Plane (negated normal for Three.js clipping convention)
    planeData.plane.setFromNormalAndCoplanarPoint(
      newNormal.clone().negate(), planeData.point
    );

    this.updateRendererClipPlanes();
    // Refresh gizmo centroid after flip so camera-following falls back correctly
    if (this.activeSectionPlaneId) {
      const pd = this.clipPlanes.get(this.activeSectionPlaneId);
      const gizmoData = this._planeGizmos.get(this.activeSectionPlaneId);
      if (pd && gizmoData) {
        const newCentroid = this._computeCrossSectionCentroid(pd.plane);
        if (newCentroid) gizmoData.centroid.copy(newCentroid);
      }
    }
  }

  setPlaneHoverMarker(point, normal) {
    this.clearPlaneHoverMarker();

    const camDist = this.camera.position.distanceTo(point);
    const radius = camDist * 0.017;
    const strokeW = radius * 0.128;
    const outerR = radius * 1.2;
    const innerR = radius * 0.36;

    const up = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3();
    if (Math.abs(normal.dot(up)) > 0.99) {
      tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      tangent.crossVectors(normal, up).normalize();
    }
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    const group = new THREE.Group();
    group.userData.isPlaneHelper = true;

    const matOpts = { transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, clippingPlanes: [] };

    const greenMat = new THREE.MeshBasicMaterial({ ...matOpts, color: 0x56ff77, opacity: 1.0, toneMapped: false });
    const blackFillMat = new THREE.MeshBasicMaterial({ ...matOpts, color: 0x000000, opacity: 0.1 });
    const darkMat = new THREE.MeshBasicMaterial({ ...matOpts, color: 0x56ff77, opacity: 1.0, toneMapped: false });

    const innerDotR = innerR * 0.5;

    const ringStroke = new THREE.Mesh(new THREE.RingGeometry(outerR - strokeW, outerR, 48), greenMat);
    ringStroke.userData.isPlaneHelper = true;
    ringStroke.renderOrder = 1001;
    group.add(ringStroke);

    const ringFill = new THREE.Mesh(new THREE.RingGeometry(innerDotR, outerR - strokeW, 48), blackFillMat);
    ringFill.userData.isPlaneHelper = true;
    ringFill.renderOrder = 1000;
    group.add(ringFill);

    const center = new THREE.Mesh(new THREE.CircleGeometry(innerDotR, 32), darkMat);
    center.userData.isPlaneHelper = true;
    center.renderOrder = 1002;
    group.add(center);

    const basisQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(tangent, bitangent, normal),
    );
    group.quaternion.copy(basisQuat);
    group.position.copy(point).addScaledVector(normal, radius * 0.05);

    if (this._arrowSpriteTexture) {
      const spriteMat = new THREE.SpriteMaterial({
        map: this._arrowSpriteTexture,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        sizeAttenuation: true,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.userData.isPlaneHelper = true;
      sprite.renderOrder = 1010;
      const spriteSize = outerR * 1.4;
      sprite.scale.set(spriteSize, spriteSize, 1);
      sprite.position.set(0, 0, outerR * 1.2);
      group.add(sprite);
      group.userData._arrowSprite = sprite;
      group.userData._planeNormal = normal.clone();
      group.userData._outerR = outerR;
    }

    this.planeHoverMarker = group;
    this.helpersGroup.add(group);
    this._updateArrowSpriteRotation();
    this._setCursor('none');
  }

  _updateArrowSpriteRotation() {
    if (!this.planeHoverMarker) return;
    const sprite = this.planeHoverMarker.userData._arrowSprite;
    const n = this.planeHoverMarker.userData._planeNormal;
    if (!sprite || !n) return;

    const worldPos = new THREE.Vector3();
    sprite.getWorldPosition(worldPos);
    const p1 = worldPos.clone().project(this.camera);
    const p2 = worldPos.clone().add(n).project(this.camera);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.0001) {
      sprite.material.rotation = -Math.atan2(dx, dy);
    }

  }

  clearCutHoverMarker() {
    // Always clear the preview line, even if the marker itself is missing —
    // they share a lifecycle but exist as separate scene objects.
    this._clearCutPreviewLine();
    if (!this.cutHoverMarker) return;
    this.helpersGroup.remove(this.cutHoverMarker);
    this.disposeHelper(this.cutHoverMarker);
    this.cutHoverMarker = null;
    this._hideScissorsOverlay();
  }

  /**
   * Compute the in-surface tangent that defines the direction of the cut
   * preview line. This is also the direction perpendicular to the cut
   * plane normal within the hovered surface, so the visible line is the
   * intersection of the future cut plane with the surface. The 'r' key
   * rotates this tangent around the surface normal.
   */
  _computeCutPreviewTangent(surfaceNormal) {
    const n = surfaceNormal.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3();
    if (Math.abs(n.dot(up)) > 0.99) {
      tangent.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      tangent.crossVectors(n, up).normalize();
    }
    if (this._cutRotationAngle !== 0) {
      tangent.applyAxisAngle(n, this._cutRotationAngle);
    }
    return tangent;
  }

  /**
   * Build / update the green preview line that shows where the section-cut
   * plane will slice the model. The line lies on the hovered surface,
   * passes through the hover point, and extends well past the model on
   * either side so it always reads as "spanning the model".
   */
  _updateCutPreviewLine(point, normal) {
    this._lastCutHover = { point: point.clone(), normal: normal.clone() };

    const tangent = this._computeCutPreviewTangent(normal);
    const bounds = this.getSceneBounds();
    const size = bounds.getSize(new THREE.Vector3());
    const diag = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z);
    // Half-length of the line; total length is ~1.5x the scene diagonal so
    // the green line clearly extends past every model edge from any pivot.
    const half = Math.max(diag * 0.75, 1);

    const start = point.clone().addScaledVector(tangent, -half);
    const end = point.clone().addScaledVector(tangent, half);

    if (!this._cutPreviewLine) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([start.x, start.y, start.z, end.x, end.y, end.z], 3),
      );
      const mat = new THREE.LineBasicMaterial({
        color: 0x00ff33,
        transparent: true,
        opacity: 1.0,
        depthTest: false,
        depthWrite: false,
        clippingPlanes: [],
      });
      const line = new THREE.Line(geo, mat);
      line.userData.isPlaneHelper = true;
      // Render below the crosshair (renderOrder 999/1000) so the icon
      // stays visually on top of the line at the hover point.
      line.renderOrder = 998;
      this._cutPreviewLine = line;
      this.helpersGroup.add(line);
    } else {
      const positions = this._cutPreviewLine.geometry.attributes.position.array;
      positions[0] = start.x; positions[1] = start.y; positions[2] = start.z;
      positions[3] = end.x;   positions[4] = end.y;   positions[5] = end.z;
      this._cutPreviewLine.geometry.attributes.position.needsUpdate = true;
      this._cutPreviewLine.geometry.computeBoundingSphere();
      this._cutPreviewLine.visible = true;
    }
  }

  _clearCutPreviewLine() {
    this._lastCutHover = null;
    if (!this._cutPreviewLine) return;
    this.helpersGroup.remove(this._cutPreviewLine);
    this._cutPreviewLine.geometry.dispose();
    this._cutPreviewLine.material.dispose();
    this._cutPreviewLine = null;
  }

  clearPlaneHoverMarker() {
    if (!this.planeHoverMarker) return;
    this.helpersGroup.remove(this.planeHoverMarker);
    this.disposeHelper(this.planeHoverMarker);
    this.planeHoverMarker = null;
  }

  _showScissorsOverlay(worldPoint) {
    if (!this.scissorsOverlay) return;
    const projected = worldPoint.clone().project(this.camera);
    const rect = this.domElement.getBoundingClientRect();
    const x = ((projected.x + 1) / 2) * rect.width;
    const y = ((-projected.y + 1) / 2) * rect.height;
    this.scissorsOverlay.style.left = `${x - 12}px`;
    // Scissor icon is 24px tall; -52 places its bottom edge ~28px above
    // the hover point so it never touches the top crosshair arm.
    this.scissorsOverlay.style.top = `${y - 52}px`;
    this.scissorsOverlay.style.display = 'block';

    // Keep the rotate pill tracking the cursor (16px right of the scissor icon).
    if (this._rotatePill) {
      this._rotatePill.style.left = `${x + 16}px`;
      // Vertically centred on the scissor icon.
      this._rotatePill.style.top = `${y - 52}px`;

      // Show the pill the first time the cursor lands on a surface in this
      // section-cut session, then let it run its 5-s hold + 1-s fade.
      if (!this._rotatePillShownForSession) {
        // First surface hit this session — arm the pill.
        this._rotatePillShownForSession = true;
        this._rotatePillDone = false;
        this._rotatePill.style.display = 'block';
        this._rotatePill.style.opacity = '1';
        this._rotatePill.style.transition = 'none';
        this._rotatePillVisible = true;

        clearTimeout(this._rotatePillTimer);
        this._rotatePillTimer = setTimeout(() => {
          // Start 1-s fade-out.
          this._rotatePill.style.transition = 'opacity 1s ease';
          this._rotatePill.style.opacity = '0';
          this._rotatePillTimer = setTimeout(() => {
            this._rotatePill.style.display = 'none';
            this._rotatePillVisible = false;
            this._rotatePillDone = true;
          }, 1000);
        }, 5000);
      } else if (!this._rotatePillDone) {
        // Session active but pill was temporarily hidden during camera rotation —
        // restore it now that the cursor is back on a surface.
        this._rotatePill.style.display = 'block';
        this._rotatePill.style.transition = 'none';
        this._rotatePill.style.opacity = '1';
        this._rotatePillVisible = true;
      }
    }
  }

  _hideScissorsOverlay() {
    if (this.scissorsOverlay) this.scissorsOverlay.style.display = 'none';
    // Hide the pill instantly while the cursor is off a surface (e.g. camera
    // rotation). It will reappear when the cursor returns to a surface,
    // unless the fade has already completed.
    if (this._rotatePill && this._rotatePillVisible && !this._rotatePillDone) {
      this._rotatePill.style.transition = 'none';
      this._rotatePill.style.opacity = '0';
      this._rotatePill.style.display = 'none';
      this._rotatePillVisible = false;
      // Note: we do NOT clear _rotatePillTimer — the countdown keeps running
      // so the total on-screen time doesn't extend each time the user rotates.
    }
  }

  _hideRotatePill() {
    if (!this._rotatePill) return;
    clearTimeout(this._rotatePillTimer);
    this._rotatePillTimer = null;
    this._rotatePill.style.transition = 'none';
    this._rotatePill.style.opacity = '0';
    this._rotatePill.style.display = 'none';
    this._rotatePillVisible = false;
    this._rotatePillShownForSession = false;
    this._rotatePillDone = false;
  }

  /**
   * Compute a section-cut plane normal for a single-click placement.
   * Mirrors the angle=0 result of the old rotation-authoring math
   * (placeCutAnchor + commitCutAuthoring): pick a tangent that's
   * perpendicular to the surface normal and to world-up (or world-X
   * when the surface is horizontal), then return tangent x surfaceNormal.
   * Result is a plane whose normal is roughly parallel to world-up — the
   * cut slices through the surface rather than along it.
   */
  _computeSectionCutNormal(surfaceNormal) {
    // Delegates tangent computation (including 'r'-key rotation) to the
    // same helper the preview line uses — this guarantees the placed cut
    // matches what the green preview line shows on screen.
    const n = surfaceNormal.clone().normalize();
    const tangent = this._computeCutPreviewTangent(n);
    return new THREE.Vector3().crossVectors(tangent, n).normalize();
  }

  // Same filter used by _computePlaneIntersection's old inline traverse: only
  // visible model meshes, skipping all section/cut overlays and gizmos.
  _collectSectionTargetMeshes() {
    const meshes = [];
    this.scene.traverse(obj => {
      if (obj.isMesh && obj.visible && !obj.userData.isPlaneHelper &&
          !obj.userData.isCutEditIcon && !obj.userData.isCutContour && !obj.userData.isTiltGizmo &&
          obj.parent?.name !== 'CutContours' &&
          obj.parent?.name !== 'SectionPlaneHelpers') {
        meshes.push(obj);
      }
    });
    return meshes;
  }

  _computePlaneIntersection(clipPlane) {
    // Reuse the mesh list cached at drag start when available — saves a full
    // scene.traverse on every drag-frame for big models.
    const meshes = this._dragMeshCache ?? this._collectSectionTargetMeshes();

    const edges = [];
    const planeNormal = clipPlane.normal;
    const planeConstant = clipPlane.constant;

    // Scratch AABB reused for every plane-vs-mesh-bbox reject. Without this,
    // 150 MB IFCs spend most of their time iterating triangles that the plane
    // doesn't actually cross.
    const worldBox = this._scratchWorldBox ?? (this._scratchWorldBox = new THREE.Box3());
    const boxCenter = this._scratchBoxCenter ?? (this._scratchBoxCenter = new THREE.Vector3());
    const boxHalf = this._scratchBoxHalf ?? (this._scratchBoxHalf = new THREE.Vector3());
    const instMatScratch = this._scratchInstMat ?? (this._scratchInstMat = new THREE.Matrix4());
    const fullMatScratch = this._scratchFullMat ?? (this._scratchFullMat = new THREE.Matrix4());

    const planeIntersectsBox = (box) => {
      // Classic plane-vs-AABB separating-axis test:
      //   project box half-extents onto |plane.normal|,
      //   compare to signed distance from plane to box center.
      box.getCenter(boxCenter);
      box.getSize(boxHalf).multiplyScalar(0.5);
      const r =
        Math.abs(planeNormal.x) * boxHalf.x +
        Math.abs(planeNormal.y) * boxHalf.y +
        Math.abs(planeNormal.z) * boxHalf.z;
      const s = planeNormal.dot(boxCenter) + planeConstant;
      return Math.abs(s) <= r;
    };

    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const posAttr = geo.attributes.position;
      if (!posAttr) continue;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const index = geo.index;
      const faceCount = index ? index.count / 3 : posAttr.count / 3;

      // For InstancedMesh, process each instance
      const instanceCount = mesh.isInstancedMesh ? mesh.count : 1;

      // Non-instanced fast path: world-AABB reject before touching triangles.
      if (!mesh.isInstancedMesh && geo.boundingBox) {
        worldBox.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld);
        if (!planeIntersectsBox(worldBox)) continue;
      }

      for (let inst = 0; inst < instanceCount; inst++) {
        let fullMatrix;
        if (mesh.isInstancedMesh) {
          mesh.getMatrixAt(inst, instMatScratch);
          fullMatrix = fullMatScratch.multiplyMatrices(mesh.matrixWorld, instMatScratch);
          if (geo.boundingBox) {
            worldBox.copy(geo.boundingBox).applyMatrix4(fullMatrix);
            if (!planeIntersectsBox(worldBox)) continue;
          }
        } else {
          fullMatrix = mesh.matrixWorld;
        }

        const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();

        for (let i = 0; i < faceCount; i++) {
          let a, b, c;
          if (index) {
            a = index.getX(i * 3);
            b = index.getX(i * 3 + 1);
            c = index.getX(i * 3 + 2);
          } else {
            a = i * 3; b = i * 3 + 1; c = i * 3 + 2;
          }

          vA.fromBufferAttribute(posAttr, a).applyMatrix4(fullMatrix);
          vB.fromBufferAttribute(posAttr, b).applyMatrix4(fullMatrix);
          vC.fromBufferAttribute(posAttr, c).applyMatrix4(fullMatrix);

          // Signed distances from the plane
          const dA = planeNormal.dot(vA) + planeConstant;
          const dB = planeNormal.dot(vB) + planeConstant;
          const dC = planeNormal.dot(vC) + planeConstant;

          const intersectionPoints = [];

          // Check each edge for a sign change (plane crossing)
          if (dA * dB < 0) {
            const t = dA / (dA - dB);
            intersectionPoints.push(new THREE.Vector3().lerpVectors(vA, vB, t));
          }
          if (dB * dC < 0) {
            const t = dB / (dB - dC);
            intersectionPoints.push(new THREE.Vector3().lerpVectors(vB, vC, t));
          }
          if (dA * dC < 0) {
            const t = dA / (dA - dC);
            intersectionPoints.push(new THREE.Vector3().lerpVectors(vA, vC, t));
          }

          if (intersectionPoints.length === 2) {
            edges.push([intersectionPoints[0], intersectionPoints[1]]);
          }
        }
      }
    }

    return edges;
  }

  // ── Section-Plane Edit / Default State ────────────────────────────

  _createPlaneGizmo(planeId, centroid) {
    const el = document.createElement('div');
    // Visual arrows are now a 3D sprite inside the ring group (_createGizmoRing3D).
    // This div is kept as an invisible hit area for mouse events only.
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'auto',
      cursor: 'grab',
      zIndex: '1000',
      filter: 'none',
      transform: 'translate(-50%, -50%)',
      display: 'none',
      width: '68px',
      height: '68px',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'transparent',
    });
    el.dataset.sectionPlaneId = planeId;

    // ── Overflow button ──────────────────────────────────────────────────────
    // Positioned as a sibling to el (not a child) so it stays at a fixed
    // screen-right offset and doesn't inherit el's rotation transform.
    const isBoxPlane = () => this._sectionBoxPlaneSet?.has(planeId);

    const overflowBtn = document.createElement('button');
    Object.assign(overflowBtn.style, {
      position: 'absolute',
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      background: '#ffffff',
      border: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.22)',
      cursor: 'pointer',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      zIndex: '1001',
      transform: 'translate(0, -50%)',
    });
    // Restore pointer cursor when hovering the button — prevents section-tool
    // cursors (grab, move, rotate) from overriding it.
    overflowBtn.addEventListener('mouseenter', () => {
      this._setCursor('');
      this._mvContainer?.classList.remove('mv-cursor-none', 'mv-cursor-box-move', 'mv-cursor-box-rotate');
    });
    overflowBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3" cy="8" r="1.5" fill="#444"/>
      <circle cx="8" cy="8" r="1.5" fill="#444"/>
      <circle cx="13" cy="8" r="1.5" fill="#444"/>
    </svg>`;
    overflowBtn.title = 'More options';

    // ── Dropdown menu ────────────────────────────────────────────────────────
    const menu = document.createElement('div');
    Object.assign(menu.style, {
      position: 'fixed',
      background: '#ffffff',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      padding: '4px 0',
      zIndex: '9999',
      minWidth: '160px',
      display: 'none',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      color: '#1a1a1a',
      cursor: 'default',
    });
    menu.addEventListener('mouseenter', () => {
      this._setCursor('');
      this._mvContainer?.classList.remove('mv-cursor-none', 'mv-cursor-box-move', 'mv-cursor-box-rotate');
    });
    document.body.appendChild(menu);

    const makeMenuItem = (iconSvg, label, danger, onClick) => {
      const item = document.createElement('button');
      Object.assign(item.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '9px 14px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: '13px',
        color: danger ? '#c0392b' : '#1a1a1a',
        borderRadius: '0',
        whiteSpace: 'nowrap',
      });
      item.innerHTML = `<span style="opacity:0.55;display:flex;align-items:center">${iconSvg}</span><span>${label}</span>`;
      item.addEventListener('mouseenter', () => { item.style.background = '#f5f5f5'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        onClick();
      });
      return item;
    };

    const flipIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8h10M10 5l3 3-3 3M6 5L3 8l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const deleteIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const flipItem = makeMenuItem(flipIcon, 'Flip direction', false, () => {
      this.flipPlane(planeId);
    });
    menu.appendChild(flipItem);

    // Delete is only available for regular section planes, not box faces.
    if (!isBoxPlane()) {
      const deleteItem = makeMenuItem(deleteIcon, 'Delete', true, () => {
        this.removeClipPlane(planeId);
      });
      menu.appendChild(deleteItem);
    }

    let menuOpen = false;
    let hideTimeout = null;

    const openMenu = () => {
      menuOpen = true;
      menu.style.display = 'flex';
      const btnRect = overflowBtn.getBoundingClientRect();
      menu.style.left = `${btnRect.right + 6}px`;
      menu.style.top  = `${btnRect.top}px`;
    };

    const closeMenu = () => {
      menuOpen = false;
      menu.style.display = 'none';
    };

    overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuOpen) { closeMenu(); } else { openMenu(); }
    });
    overflowBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });

    // Close menu when clicking anywhere else
    const onDocClick = (e) => {
      if (!menu.contains(e.target) && e.target !== overflowBtn) closeMenu();
    };
    document.addEventListener('click', onDocClick);

    // ── Show / hide overflow button based on cursor proximity ────────────────
    // Using document mousemove (rather than mouseenter/mouseleave) avoids two
    // failure modes: (a) the canvas gap between el and overflowBtn swallowing
    // enter events, and (b) the button being shorter than el so exit at top/
    // bottom misses the button entirely.
    const isPointInRect = (cx, cy, rect) =>
      cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;

    const onDocMouseMove = (e) => {
      if (el.style.display === 'none') return;
      const inEl  = isPointInRect(e.clientX, e.clientY, el.getBoundingClientRect());
      const inBtn = isPointInRect(e.clientX, e.clientY, overflowBtn.getBoundingClientRect());
      const inMenu = menuOpen && isPointInRect(e.clientX, e.clientY, menu.getBoundingClientRect());
      if (inEl || inBtn || inMenu) {
        overflowBtn.style.display = 'flex';
        clearTimeout(hideTimeout);
      } else {
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
          if (!menuOpen) overflowBtn.style.display = 'none';
        }, 120);
      }
    };
    document.addEventListener('mousemove', onDocMouseMove);

    // Store cleanup refs on el for when this gizmo is destroyed
    el._overflowCleanup = () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('mousemove', onDocMouseMove);
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      clearTimeout(hideTimeout);
    };

    // ── Existing drag / hover logic ──────────────────────────────────────────
    const clearPlacementCursor = () => {
      this.clearCutHoverMarker();
      this.clearPlaneHoverMarker();
      this._removeCutSurfaceHighlight();
      this.clearHoverHighlight();
      this._setCursor('pointer');
    };

    el.addEventListener('mouseenter', () => {
      this._hoveringPlaneGizmo = true;
      this._hoveredPlaneId = planeId;
      // onMouseMove is only bound to the canvas; when the cursor is over this
      // overlay div it never fires there. Clear the placement cursor immediately.
      clearPlacementCursor();
    });
    // Keep clearing while the cursor moves around inside the element.
    el.addEventListener('mousemove', (e) => {
      e.stopPropagation();
      clearPlacementCursor();
    });
    el.addEventListener('mouseleave', () => {
      this._hoveringPlaneGizmo = false;
      if (this._hoveredPlaneId === planeId) this._hoveredPlaneId = null;
    });
    el.addEventListener('mousedown', (e) => {
      // Don't start a drag if the click was on the overflow button
      if (e.target === overflowBtn || overflowBtn.contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      this._hoveringPlaneGizmo = true;

      const downX = e.clientX, downY = e.clientY;
      let didDrag = false;

      // Compute drag start point
      const gizmoData = this._planeGizmos.get(planeId);
      const startPt = gizmoData ? gizmoData.centroid.clone() : this.clipPlanes.get(planeId)?.point.clone() ?? new THREE.Vector3();
      if (gizmoData?.currentPos) {
        gizmoData.dragStartPos = gizmoData.currentPos.clone();
      }
      this._selectSectionPlane(planeId);
      this._beginPlaneDrag(planeId, startPt);
      el.style.cursor = 'grabbing';

      // Let all mousemove/mouseup events fall through to the canvas during drag
      // so the existing drag math runs smoothly. Restoring pointer-events on mouseup.
      el.style.pointerEvents = 'none';

      const onGizmoMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - downX;
        const dy = moveEvent.clientY - downY;
        if (Math.sqrt(dx * dx + dy * dy) > 4) didDrag = true;
        // Drive drag directly from the window capture handler so it works
        // regardless of which DOM element (canvas or overlay) receives mousemove.
        if (this.isDragging) this.onMouseMove(moveEvent);
      };

      const onGizmoMouseUp = (upEvent) => {
        window.removeEventListener('mousemove', onGizmoMouseMove, { capture: true });
        window.removeEventListener('mouseup', onGizmoMouseUp, { capture: true });
        el.style.pointerEvents = 'auto';

        // Restore grab cursor; if pointer left the element during drag (mouseleave
        // couldn't fire while pointerEvents was none), clear hover state now.
        el.style.cursor = 'grab';
        const rect = el.getBoundingClientRect();
        const overEl = (
          upEvent.clientX >= rect.left && upEvent.clientX <= rect.right &&
          upEvent.clientY >= rect.top  && upEvent.clientY <= rect.bottom
        );
        if (!overEl) {
          this._hoveringPlaneGizmo = false;
          // _hoveredPlaneId will be corrected next frame by the proximity check,
          // but clear it now so onMouseMove immediately stops showing pointer.
          if (this._hoveredPlaneId === planeId) this._hoveredPlaneId = null;
        }

        // Only select on a clean click (no significant pointer movement)
        if (!didDrag) {
          this._selectSectionPlane(planeId);
        }
        this.onMouseUp(upEvent);
      };

      window.addEventListener('mousemove', onGizmoMouseMove, { capture: true });
      window.addEventListener('mouseup', onGizmoMouseUp, { capture: true });
    });

    const overlayParent = this.domElement.parentElement || this.domElement;
    overlayParent.appendChild(el);
    overlayParent.appendChild(overflowBtn);

    const ring3D = this._createGizmoRing3D(planeId);
    return { el, overflowBtn, centroid: centroid.clone(), planeBounds2D: null, currentPos: centroid.clone(), dragStartPos: null, ring3D, _ringAnimScale: 1.0 };
  }

  // Called when exiting sectioning mode entirely — hides gizmos and helpers.
  // No longer transitions planes to an icon-only state while inside the mode.
  _setSectionPlaneDefault(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

    this._detachTiltGizmo();

    let activePlaneCleared = false;
    if (this.activeSectionPlaneId === planeId) {
      this.activeSectionPlaneId = null;
      this._clearActivePlaneContour();
      activePlaneCleared = true;
    }

    if (planeData.helper) {
      planeData.helper.visible = false;
    }

    // Hide the gizmo DOM element and 3D ring (keep in map for re-entry)
    const gizmoData = this._planeGizmos.get(planeId);
    if (gizmoData?.el) gizmoData.el.style.display = 'none';
    if (gizmoData?.overflowBtn) gizmoData.overflowBtn.style.display = 'none';
    if (gizmoData?.ring3D) gizmoData.ring3D.visible = false;

    this._refreshSectionPlaneActiveVisuals();
    if (activePlaneCleared) {
      this.emit('active-plane-change', { planeId: null });
    }
  }

  // Show a plane's gizmo immediately — used on plane creation and mode re-entry.
  _showPlaneGizmo(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

    // Show the plane helper (3D frame)
    if (planeData.helper) {
      planeData.helper.visible = true;
    }

    // Ensure gizmo DOM element exists
    if (!this._planeGizmos.has(planeId)) {
      const centroid = this._computeGizmoCentroid(planeId) || planeData.point.clone();
      const gizmo = this._createPlaneGizmo(planeId, centroid);
      this._planeGizmos.set(planeId, gizmo);
    }

    const gizmoData = this._planeGizmos.get(planeId);
    if (gizmoData?.el) {
      gizmoData.el.style.display = 'flex';
    }
  }

  // Re-enter edit for a plane when clicking its gizmo from outside sectioning mode.
  editPlaneFromGizmo(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

    // When outside sectioning mode, switch to whichever tool created this plane.
    // When already in sectioning mode, preserve the tool the user is currently on.
    if (this.activeTool !== 'section-plane' && this.activeTool !== 'section-cut') {
      this.setActiveTool(planeData.creatorTool || 'section-plane');
    }

    this._showPlaneGizmo(planeId);

    const prevActive = this.activeSectionPlaneId;
    this.activeSectionPlaneId = planeId;
    if (prevActive !== planeId) {
      this.emit('active-plane-change', { planeId });
    }
    this.emit('request-edit-plane', { planeId, tool: this.activeTool });
  }

  _createGizmoRing3D(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return null;

    const normal = planeData.normal.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3();
    if (Math.abs(normal.dot(up)) > 0.99) {
      tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      tangent.crossVectors(normal, up).normalize();
    }
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    const group = new THREE.Group();
    group.userData.isPlaneHelper = true;

    const matOpts = { transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, clippingPlanes: [] };
    const strokeMat = new THREE.MeshBasicMaterial({ ...matOpts, color: 0x56ff77, opacity: 1.0, toneMapped: false });
    const fillMat   = new THREE.MeshBasicMaterial({ ...matOpts, color: 0x000000, opacity: 0.30, toneMapped: false });
    const dotMat    = new THREE.MeshBasicMaterial({ ...matOpts, color: 0x56ff77, opacity: 1.0, toneMapped: false });

    // Unit-radius geometry — scaled every frame based on camera distance
    const r = 1;
    const strokeW = r * 0.05;
    const dotR = r * 0.196;  // center dot — 40% bigger than original 0.14

    const ringStroke = new THREE.Mesh(new THREE.RingGeometry(r - strokeW, r, 72), strokeMat);
    ringStroke.renderOrder = 2001;
    group.add(ringStroke);

    const ringFill = new THREE.Mesh(new THREE.RingGeometry(dotR, r - strokeW, 72), fillMat);
    ringFill.renderOrder = 2000;
    group.add(ringFill);

    const centerDot = new THREE.Mesh(new THREE.CircleGeometry(dotR, 32), dotMat);
    centerDot.renderOrder = 2002;
    group.add(centerDot);

    // Store refs for selected-state updates
    group.userData._strokeMat  = strokeMat;
    group.userData._fillMat    = fillMat;
    group.userData._dotMat     = dotMat;
    group.userData._ringStroke = ringStroke;
    group.userData._ringFill   = ringFill;
    group.userData._centerDot  = centerDot;
    group.userData._strokeW    = strokeW;
    group.userData._dotR       = dotR;
    group.userData._r          = r;

    // ── Arrow sprite — billboard that always faces the camera ────────────────
    // Uses a canvas texture with the polygon arrows drawn at the correct style.
    // material.rotation is updated each frame to align arrows with projected normal.
    if (this._gizmoArrowTexture) {
      const spriteMat = new THREE.SpriteMaterial({
        map: this._gizmoArrowTexture,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      });
      const arrowSprite = new THREE.Sprite(spriteMat);
      arrowSprite.renderOrder = 2003;
      // Texture is 128×128 square; arrow content is 16/68 aspect inside it.
      // Uniform scale — the square canvas crops correctly around the tall arrows.
      arrowSprite.scale.set(3.2, 2.42, 1);
      arrowSprite.userData.isPlaneHelper = true;
      group.add(arrowSprite);
      group.userData._arrowSprite  = arrowSprite;
      group.userData._planeNormal  = normal.clone();
    }

    // Orient flat on the plane surface
    const basisQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(tangent, bitangent, normal)
    );
    group.quaternion.copy(basisQuat);
    group.position.copy(planeData.point);
    group.visible = false;

    // Store in a dedicated scene so it renders in the unclipped overlay pass
    // (same pattern as _tiltGizmoScene) — avoids alpha sorting against model geo.
    if (!this._gizmoRingScene) {
      this._gizmoRingScene = new THREE.Scene();
    }
    this._gizmoRingScene.add(group);
    return group;
  }

  // Select a plane — tracks the active plane id and emits the event, but no
  // longer applies any visual select state to the gizmo ring. Hover-only UX.
  _selectSectionPlane(planeId) {
    const prev = this.activeSectionPlaneId;
    if (prev === planeId) return;
    this.activeSectionPlaneId = planeId;
    this.emit('active-plane-change', { planeId: planeId ?? null });
  }

  _removePlaneGizmo(planeId) {
    const data = this._planeGizmos.get(planeId);
    if (!data) return;
    if (data.el) {
      // Run overflow button / menu cleanup (removes document listener + menu node)
      if (typeof data.el._overflowCleanup === 'function') data.el._overflowCleanup();
      if (data.el.parentElement) data.el.parentElement.removeChild(data.el);
    }
    if (data.overflowBtn?.parentElement) {
      data.overflowBtn.parentElement.removeChild(data.overflowBtn);
    }
    if (data.ring3D) {
      if (this._gizmoRingScene) this._gizmoRingScene.remove(data.ring3D);
      data.ring3D.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
    this._planeGizmos.delete(planeId);
    this._hoveringPlaneGizmo = false;
    if (this._hoveredPlaneId === planeId) this._hoveredPlaneId = null;
  }

  _clearAllPlaneGizmos() {
    for (const [planeId] of this._planeGizmos) {
      this._removePlaneGizmo(planeId);
    }
  }

  // Compute gizmo centroid for a plane, clipping against partner planes when this
  // is a section-box face so the centroid lands inside the visible box region.
  _computeGizmoCentroid(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return null;

    // For box planes the exact centroid is the face centre – no model traversal needed.
    if (planeData.isBoxPlane) {
      return planeData.point.clone();
    }

    // For regular planes compute from model intersection edges.
    const edges = this._computePlaneIntersection(planeData.plane);
    if (edges.length === 0) return null;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const [p1, p2] of edges) {
      for (const p of [p1, p2]) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
    }
    return new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  }

  // Compute planeBounds2D for a box face directly from box geometry.
  // The face rectangle is defined by the two tangent axes and their half-extents —
  // no model traversal required, so it's always correct and instant.
  _computeBoxFaceBounds2D(planeId) {
    if (!this._boxState) return null;
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData || !planeData.isBoxPlane) return null;

    const { halfExtents, quaternion } = this._boxState;

    // The 3 local box axes in world space.
    const axes = [
      new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion),
      new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
      new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
    ];
    const halves = [halfExtents.x, halfExtents.y, halfExtents.z];

    // Find which axis aligns with the face normal (the one perpendicular to the face).
    let normalAxisIdx = 0;
    let bestDot = -1;
    for (let i = 0; i < 3; i++) {
      const d = Math.abs(axes[i].dot(planeData.normal));
      if (d > bestDot) { bestDot = d; normalAxisIdx = i; }
    }

    // The two remaining axes are the face tangents.
    const tangentIndices = [0, 1, 2].filter(i => i !== normalAxisIdx);
    const tangent   = axes[tangentIndices[0]];
    const bitangent = axes[tangentIndices[1]];
    const halfT  = halves[tangentIndices[0]];
    const halfBT = halves[tangentIndices[1]];

    const refU = planeData.point.dot(tangent);
    const refV = planeData.point.dot(bitangent);

    return { tangent, bitangent, minU: refU - halfT, maxU: refU + halfT, minV: refV - halfBT, maxV: refV + halfBT };
  }

  _computeCrossSectionCentroid(clipPlane) {
    const edges = this._computePlaneIntersection(clipPlane);
    if (edges.length === 0) return null;
    // Use bounding-box center instead of point average so dense geometry
    // near the base (foundations, platform) can't drag the centroid down.
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const [p1, p2] of edges) {
      for (const p of [p1, p2]) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
    }
    return new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    );
  }

  // Compute the 2D bounding box of the cross-section on the plane surface,
  // expressed in local (tangent, bitangent) coordinates. Returns null if no
  // intersection edges exist. Used to clamp the camera-following gizmo position
  // so it never floats outside the actual cut face.
  _computeCrossSectionBoundsFromEdges(edges, normal) {
    if (!edges || edges.length === 0) return null;
    const tangent = new THREE.Vector3();
    if (Math.abs(normal.x) < 0.9) {
      tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      tangent.crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    }
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [p1, p2] of edges) {
      for (const p of [p1, p2]) {
        const u = p.dot(tangent);
        const v = p.dot(bitangent);
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
    }
    return { tangent, bitangent, minU, maxU, minV, maxV };
  }

  _computeCrossSectionBounds(clipPlane, normal) {
    const edges = this._computePlaneIntersection(clipPlane);
    if (edges.length === 0) return null;

    // Build local 2-D axes on the plane surface
    const tangent = new THREE.Vector3();
    if (Math.abs(normal.x) < 0.9) {
      tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      tangent.crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    }
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [p1, p2] of edges) {
      for (const p of [p1, p2]) {
        const u = p.dot(tangent);
        const v = p.dot(bitangent);
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }

    return { tangent, bitangent, minU, maxU, minV, maxV };
  }

  _updatePlaneGizmoPositions() {
    // Show gizmos for section-plane/cut always, and for section-box in drag-face mode.
    const isSectioningTool = this.activeTool === 'section-plane' || this.activeTool === 'section-cut'
      || (this.activeTool === 'section-box' && this._boxSubTool === 'drag-face');
    if (!isSectioningTool) return;

    const rect = this.domElement.getBoundingClientRect();
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    const tempV = new THREE.Vector3();

    // Collect model meshes once for occlusion raycasts
    const modelMeshes = [];
    this.scene.traverse(obj => {
      if (obj.isMesh && obj.visible && !obj.userData.isPlaneHelper &&
          !obj.userData.isCutEditIcon && !obj.userData.isCutContour && !obj.userData.isTiltGizmo &&
          !obj.userData.isPlaneContourFill &&
          obj.parent?.name !== 'CutContours' &&
          obj.parent?.name !== 'SectionPlaneHelpers') {
        modelMeshes.push(obj);
      }
    });

    const camPos = this.camera.position;
    const occlusionRay = new THREE.Raycaster();

    // Screen-center ray for camera-following gizmo position
    const centerRay = new THREE.Raycaster();
    centerRay.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const sceneBounds = this.getSceneBounds();

    for (const [planeId, data] of this._planeGizmos) {
      if (!data.el) continue;
      const planeData = this.clipPlanes.get(planeId);
      if (!planeData) continue;

      // ── Camera-following gizmo position ──────────────────────────────────
      const mathPlane = new THREE.Plane();
      mathPlane.setFromNormalAndCoplanarPoint(planeData.normal, planeData.point);

      // Lazily compute and cache 2-D cross-section bounds for this gizmo.
      // Box planes use exact geometry from the box state — no model traversal needed.
      if (!data.planeBounds2D) {
        if (planeData.isBoxPlane) {
          data.planeBounds2D = this._computeBoxFaceBounds2D(planeId);
        } else {
          data.planeBounds2D = this._computeCrossSectionBounds(planeData.plane, planeData.normal);
        }
      }

      const isDraggingThisPlane = this.isDragging && this.dragPlaneId === planeId;

      // ── Compute target world position ────────────────────────────────────
      let targetWorld;
      if (isDraggingThisPlane) {
        // During drag: offset the gizmo's pre-drag visual position along the
        // normal by cumulative drag distance. Using dragStartPos (not centroid)
        // means the gizmo starts from exactly where it was rendered — no jump.
        const base = data.dragStartPos || data.centroid;
        targetWorld = base.clone()
          .addScaledVector(planeData.normal, this._dragCumulativeDistance);
      } else {
        tempV.copy(data.centroid);
        tempV.project(this.camera);
        const centScreenX = (tempV.x * halfW) + halfW;
        const centScreenY = -(tempV.y * halfH) + halfH;
        const centroidOnScreen =
          tempV.z <= 1 &&
          centScreenX >= 0 && centScreenX <= rect.width &&
          centScreenY >= 0 && centScreenY <= rect.height;

        if (centroidOnScreen) {
          targetWorld = data.centroid;
        } else {
          // Centroid off-screen — target screen center clamped to cross-section bounds.
          const hitPt = new THREE.Vector3();
          if (centerRay.ray.intersectPlane(mathPlane, hitPt) && data.planeBounds2D) {
            const { tangent, bitangent, minU, maxU, minV, maxV } = data.planeBounds2D;
            let u = hitPt.dot(tangent);
            let v = hitPt.dot(bitangent);
            u = Math.max(minU, Math.min(maxU, u));
            v = Math.max(minV, Math.min(maxV, v));
            const refU = planeData.point.dot(tangent);
            const refV = planeData.point.dot(bitangent);
            targetWorld = planeData.point.clone()
              .addScaledVector(tangent, u - refU)
              .addScaledVector(bitangent, v - refV);
          } else {
            targetWorld = data.centroid;
          }
        }
      }

      // ── Lerp current position toward target ──────────────────────────────
      // During drag: snap instantly (gizmo locks to the moving plane).
      // After release: lerp gently from wherever currentPos is — the gizmo
      // eases to the new centroid without any visible jump.
      if (!data.currentPos) {
        data.currentPos = targetWorld.clone();
      } else if (isDraggingThisPlane) {
        data.currentPos.copy(targetWorld);
      } else {
        data.currentPos.lerp(targetWorld, 0.10);
      }
      const gizmoWorld = data.currentPos;

      // ── Screen-space projection ──────────────────────────────────────────
      tempV.copy(gizmoWorld);
      tempV.project(this.camera);
      const x = (tempV.x * halfW) + halfW;
      const y = -(tempV.y * halfH) + halfH;
      const behind = tempV.z > 1;

      // ── Occlusion check ──────────────────────────────────────────────────
      let occluded = false;
      if (!behind) {
        const dir = gizmoWorld.clone().sub(camPos);
        const dist = dir.length();
        dir.normalize();
        occlusionRay.set(camPos, dir);
        occlusionRay.far = dist - 0.01;
        const rawHits = occlusionRay.intersectObjects(modelMeshes, false);
        const visibleHits = this._filterClippedHits(rawHits);
        if (visibleHits.length > 0) {
          occluded = true;
        }
      }

      const visible = !behind && !occluded;
      data.el.style.display = visible ? 'flex' : 'none';
      data.el.style.left = `${x}px`;
      data.el.style.top = `${y}px`;

      // Keep the overflow button anchored 44px to the right of the gizmo center
      // in screen space — update every frame so it follows camera movement.
      if (data.overflowBtn) {
        data.overflowBtn.style.left = `${x + 44}px`;
        data.overflowBtn.style.top  = `${y}px`;
        if (!visible) data.overflowBtn.style.display = 'none';
      }

      // Rotate the DOM arrows to point along the plane normal in screen space
      const nEnd = gizmoWorld.clone().add(planeData.normal);
      const nProj = nEnd.project(this.camera);
      const nx = (nProj.x * halfW) + halfW;
      const ny = -(nProj.y * halfH) + halfH;
      const angle = Math.atan2(nx - x, -(ny - y)) * (180 / Math.PI);
      data.el.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;

      // ── Sync 3D ring ─────────────────────────────────────────────────────
      if (data.ring3D) {
        data.ring3D.visible = visible;
        if (visible) {
          data.ring3D.position.copy(gizmoWorld);
          const camDist = camPos.distanceTo(gizmoWorld);
          // Zone 1 (close):    r = camDist * 0.036  → constant screen-space size
          // Zone 2 (mid):      r = 8 world units     → shrinks on screen with model
          // Zone 3 (far out):  r = camDist * 0.009  → minimum screen-space size (~25% of normal)
          const r = Math.max(Math.min(camDist * 0.036, 8), camDist * 0.009);
          data.ring3D.scale.setScalar(r);

          // ── Screen-space hover detection ─────────────────────────────────
          // Check cursor proximity every frame so hover triggers correctly
          // even when the gizmo spawns or moves under the cursor (which would
          // silently skip the DOM mouseenter event).
          if (this._cursorClientX !== undefined) {
            const rect   = this.domElement.getBoundingClientRect();
            const cx     = this._cursorClientX - rect.left;
            const cy     = this._cursorClientY - rect.top;
            const hitR   = 34; // gizmo DOM element is 68×68px, so ±34
            const inside = Math.abs(cx - x) < hitR && Math.abs(cy - y) < hitR;
            if (inside && this._hoveredPlaneId !== planeId) {
              this._hoveredPlaneId = planeId;
            } else if (!inside && this._hoveredPlaneId === planeId) {
              this._hoveredPlaneId = null;
            }
          }

          // ── Smooth outer-ring expansion on hover / drag ──────────────────
          // Only hover and active drag expand the ring — no select state.
          const isHovered  = this._hoveredPlaneId === planeId;
          const targetScale = (isHovered || (this.isDragging && this.dragPlaneId === planeId)) ? 1.22 : 1.0;
          // Lerp toward target (fast in, same speed out for snappiness vs. smoothness)
          data._ringAnimScale = data._ringAnimScale !== undefined
            ? data._ringAnimScale + (targetScale - data._ringAnimScale) * 0.18
            : targetScale;
          const as = data._ringAnimScale;
          const rStroke  = data.ring3D.userData._ringStroke;
          const rFill    = data.ring3D.userData._ringFill;
          const rDot     = data.ring3D.userData._centerDot;
          if (rStroke) rStroke.scale.setScalar(as);
          if (rFill)   rFill.scale.setScalar(as);
          if (rDot)    rDot.scale.setScalar(as);

          // ── Rotate arrow sprite to align with projected plane normal ─────
          const arrowSprite = data.ring3D.userData._arrowSprite;
          const planeNormal = data.ring3D.userData._planeNormal;
          if (arrowSprite && planeNormal) {
            const wPos = new THREE.Vector3();
            arrowSprite.getWorldPosition(wPos);
            const p1 = wPos.clone().project(this.camera);
            const p2 = wPos.clone().add(planeNormal).project(this.camera);
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            if (Math.sqrt(dx * dx + dy * dy) > 0.0001) {
              arrowSprite.material.rotation = -Math.atan2(dx, dy);
            }
          }
        }
      }
    }
  }

  _buildActivePlaneContour() {
    this._clearActivePlaneContour();
    // During drag use the dragging plane; otherwise use the selected plane.
    const targetId = this.dragPlaneId || this.activeSectionPlaneId;
    if (!targetId) return;
    const planeData = this.clipPlanes.get(targetId);
    if (!planeData) return;

    let allEdges = this._computePlaneIntersection(planeData.plane);
    if (allEdges.length === 0) return;

    // Clip edges against all OTHER active section planes so the contour
    // hugs the visible cut shape without relying on renderer clipping.
    const otherPlanes = [];
    for (const [id, pd] of this.clipPlanes) {
      if (id !== this.activeSectionPlaneId && pd.plane) otherPlanes.push(pd.plane);
    }
    if (otherPlanes.length > 0) {
      allEdges = this._clipEdgesAgainstPlanes(allEdges, otherPlanes);
      if (allEdges.length === 0) return;
    }

    // Scene-relative offset so lines sit safely on the visible side of the plane
    const bounds = this.getSceneBounds();
    const bSize = new THREE.Vector3();
    bounds.getSize(bSize);
    const diag = Math.max(bSize.x, bSize.y, bSize.z);
    const offsetDir = planeData.plane.normal.clone();
    const offsetDist = diag * 0.005;

    const contourScene = new THREE.Scene();
    contourScene.name = 'ActivePlaneContourScene';

    // ── Object cut-edge highlight — chain raw edges into per-object loops ──
    // Each loop is one connected cross-section outline (a wall, column, floor, etc.).
    // This shows the actual geometry edges being sliced rather than a convex hull.
    const loops = this._chainEdgesIntoLoops(allEdges);
    if (loops.length > 0) {
      const positions = [];
      for (const loop of loops) {
        if (loop.length < 2) continue;
        for (let i = 0; i < loop.length; i++) {
          const p1 = loop[i];
          const p2 = loop[(i + 1) % loop.length];
          positions.push(
            p1.x + offsetDir.x * offsetDist,
            p1.y + offsetDir.y * offsetDist,
            p1.z + offsetDir.z * offsetDist,
            p2.x + offsetDir.x * offsetDist,
            p2.y + offsetDir.y * offsetDist,
            p2.z + offsetDir.z * offsetDist,
          );
        }
      }
      if (positions.length > 0) {
        const lsGeo = new LineSegmentsGeometry();
        lsGeo.setPositions(positions);
        const lsMat = new LineMaterial({
          color: 0x56ff77,
          linewidth: 1,
          transparent: true,
          opacity: 0.5,
          depthTest: false,
          worldUnits: false,
          toneMapped: false,
        });
        lsMat.resolution.set(this.domElement.clientWidth, this.domElement.clientHeight);
        const lineSegs = new LineSegments2(lsGeo, lsMat);
        lineSegs.renderOrder = 998;
        contourScene.add(lineSegs);
      }
    }

    this._activePlaneContour = contourScene;
    this._activePlaneContourPlaneId = targetId;
  }

  _computeConvexHullEdges(edges, tangent, bitangent, normal, clipPlane) {
    // Collect every intersection point, project to 2D, compute convex hull,
    // then lift hull vertices back to 3D on the clip plane.
    const pts2D = [];
    const seen = new Set();
    const EPS = 1e-5;
    const snap = v => `${Math.round(v.x / EPS)}_${Math.round(v.y / EPS)}`;

    for (const [p1, p2] of edges) {
      for (const p of [p1, p2]) {
        const u = p.dot(tangent);
        const v = p.dot(bitangent);
        const pt = { x: u, y: v };
        const k = snap(pt);
        if (!seen.has(k)) {
          seen.add(k);
          pts2D.push(pt);
        }
      }
    }

    if (pts2D.length < 3) return [];

    // Andrew's monotone chain convex hull (O(n log n))
    pts2D.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);

    const lower = [];
    for (const p of pts2D) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
        lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts2D.length - 1; i >= 0; i--) {
      const p = pts2D[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
        upper.pop();
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    const hull2D = lower.concat(upper);

    if (hull2D.length < 3) return [];

    // Lift 2D hull points back to 3D on the clip plane
    const originOnPlane = normal.clone().multiplyScalar(-clipPlane.constant);
    const hull3D = hull2D.map(pt => {
      return originOnPlane.clone()
        .addScaledVector(tangent, pt.x)
        .addScaledVector(bitangent, pt.y);
    });

    const hullEdges = [];
    for (let i = 0; i < hull3D.length; i++) {
      hullEdges.push([hull3D[i], hull3D[(i + 1) % hull3D.length]]);
    }
    return hullEdges;
  }

  _buildCrossSectionFill(edges, clipPlane, offsetDir, offsetDist) {
    const loops = this._chainEdgesIntoLoops(edges);
    if (loops.length === 0) return null;

    const normal = clipPlane.normal;
    let tangent = new THREE.Vector3();
    if (Math.abs(normal.x) < 0.9) {
      tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      tangent.crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    }
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    const allVerts3D = [];
    const allFaces = [];
    let vertexOffset = 0;

    for (const loop of loops) {
      if (loop.length < 3) continue;

      const contour2D = loop.map(p => new THREE.Vector2(p.dot(tangent), p.dot(bitangent)));

      let faces;
      try {
        faces = THREE.ShapeUtils.triangulateShape(contour2D, []);
      } catch {
        continue;
      }
      if (faces.length === 0) continue;

      for (const pt of loop) {
        allVerts3D.push(pt.clone().addScaledVector(offsetDir, offsetDist));
      }
      for (const [a, b, c] of faces) {
        allFaces.push(a + vertexOffset, b + vertexOffset, c + vertexOffset);
      }
      vertexOffset += loop.length;
    }

    if (allFaces.length === 0) return null;

    const posArr = new Float32Array(allVerts3D.length * 3);
    for (let i = 0; i < allVerts3D.length; i++) {
      posArr[i * 3]     = allVerts3D[i].x;
      posArr[i * 3 + 1] = allVerts3D[i].y;
      posArr[i * 3 + 2] = allVerts3D[i].z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setIndex(allFaces);

    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff33,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthTest: false,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 997;
    mesh.userData.isPlaneContourFill = true;
    return mesh;
  }

  _chainEdgesIntoLoops(edges) {
    const EPS = 1e-6;
    const key = v => `${(v.x / EPS | 0)}_${(v.y / EPS | 0)}_${(v.z / EPS | 0)}`;

    const remaining = edges.map(([a, b]) => [a.clone(), b.clone()]);
    const loops = [];

    while (remaining.length > 0) {
      const loop = [];
      const [first] = remaining.splice(0, 1);
      loop.push(first[0], first[1]);

      let changed = true;
      while (changed) {
        changed = false;
        const tailKey = key(loop[loop.length - 1]);
        for (let i = 0; i < remaining.length; i++) {
          const kA = key(remaining[i][0]);
          const kB = key(remaining[i][1]);
          if (kA === tailKey) {
            loop.push(remaining[i][1]);
            remaining.splice(i, 1);
            changed = true;
            break;
          } else if (kB === tailKey) {
            loop.push(remaining[i][0]);
            remaining.splice(i, 1);
            changed = true;
            break;
          }
        }
      }

      if (loop.length >= 3 && key(loop[0]) === key(loop[loop.length - 1])) {
        loop.pop();
      }
      if (loop.length >= 3) {
        loops.push(loop);
      }
    }

    return loops;
  }

  _renderActivePlaneContour() {
    if (!this.planeHoverMarker && !this._tiltGizmoScene && !this._activePlaneContour && !this._gizmoRingScene) return;

    const savedClipPlanes = this.renderer.clippingPlanes;
    const savedAutoClear = this.renderer.autoClear;

    this.renderer.autoClear = false;

    // Contour geometry is pre-clipped against other planes in _buildActivePlaneContour,
    // so render with no clipping to ensure the full stroke is always visible.
    if (this._activePlaneContour) {
      this.renderer.clippingPlanes = [];
      this.renderer.render(this._activePlaneContour, this.camera);
    }

    // Render hover marker unclipped so it's always fully visible
    if (this.planeHoverMarker) {
      if (!this._hoverMarkerScene) {
        this._hoverMarkerScene = new THREE.Scene();
      }
      this.renderer.clippingPlanes = [];
      const parent = this.planeHoverMarker.parent;
      this._hoverMarkerScene.add(this.planeHoverMarker);
      this.renderer.render(this._hoverMarkerScene, this.camera);
      if (parent) parent.add(this.planeHoverMarker);
    }

    // Render tilt gizmo fully unclipped so it's never cut off
    if (this._tiltGizmoScene && this._tiltGizmo) {
      this.renderer.clippingPlanes = [];
      this.renderer.render(this._tiltGizmoScene, this.camera);
    }

    // Render gizmo rings unclipped in the overlay pass for clean transparency
    if (this._gizmoRingScene) {
      this._gizmoRingScene.updateMatrixWorld(true);
      this.renderer.clippingPlanes = [];
      this.renderer.render(this._gizmoRingScene, this.camera);
    }

    this.renderer.autoClear = savedAutoClear;
    this.renderer.clippingPlanes = savedClipPlanes;
  }

  _clipEdgesAgainstPlanes(edges, planes) {
    let result = edges;
    for (const plane of planes) {
      const next = [];
      for (const [p1, p2] of result) {
        const d1 = plane.distanceToPoint(p1);
        const d2 = plane.distanceToPoint(p2);
        if (d1 >= 0 && d2 >= 0) {
          next.push([p1, p2]);
        } else if (d1 >= 0 && d2 < 0) {
          const t = d1 / (d1 - d2);
          const mid = p1.clone().lerp(p2, t);
          next.push([p1, mid]);
        } else if (d1 < 0 && d2 >= 0) {
          const t = d1 / (d1 - d2);
          const mid = p1.clone().lerp(p2, t);
          next.push([mid, p2]);
        }
      }
      result = next;
    }
    return result;
  }

  _clearActivePlaneContour() {
    if (!this._activePlaneContour) return;
    this._activePlaneContour.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    this._activePlaneContour = null;
    this._activePlaneContourPlaneId = null;
  }

  // ── End Section-Plane Edit / Default State ────────────────────────

  onKeyDown(event) {
    const isSectioningTool = this.activeTool === 'section-plane' || this.activeTool === 'section-cut';
    if (!isSectioningTool) return;

    // Enter deselects the active plane (clears Flip/Delete context) without
    // hiding anything — planes and gizmos are always visible in sectioning mode.
    if (event.key === 'Enter') {
      if (this.activeSectionPlaneId) {
        this.activeSectionPlaneId = null;
        this.emit('active-plane-change', { planeId: null });
        event.preventDefault();
      }
    } else if (event.key === 'f' || event.key === 'F') {
      // Flip is only meaningful for section-plane (where the plane lies
      // along the surface) — for section-cut planes the inward/outward
      // orientation is implicit in the placement geometry.
      if (this.activeTool === 'section-plane' && this.activeSectionPlaneId) {
        this.flipPlane(this.activeSectionPlaneId);
        event.preventDefault();
      }
    } else if (event.key === 'r' || event.key === 'R') {
      // Rotate the section-cut preview line (and the eventual placed cut)
      // 45° around the hovered surface normal. Only meaningful while the
      // section-cut tool is active and we have a placement preview to
      // refresh — i.e. we're hovering on a surface.
      if (this.activeTool === 'section-cut') {
        this._cutRotationAngle -= Math.PI / 4;
        if (this._lastCutHover) {
          // Rebuild the whole hover marker (crosshair + line) so the
          // rotation snaps through both visuals on the same frame —
          // setCutHoverMarker calls _updateCutPreviewLine internally.
          this.setCutHoverMarker(this._lastCutHover.point, this._lastCutHover.normal);
        }
        event.preventDefault();
      }
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      // Delete (or Backspace on Mac) removes the currently-selected
      // edit-state plane. Mirrors the trash icon in the right toolbar.
      if (this.activeSectionPlaneId) {
        this.deleteActivePlane();
        event.preventDefault();
      }
    }
  }

  clearAll() {
    this._detachTiltGizmo();
    this.clearSectionBox();
    this.clearClipPlanes();
    this.clearHoverHighlight();
    this._removeCutSurfaceHighlight();
    this.clearCutHoverMarker();
    this.clearPlaneHoverMarker();
    this._clearAllPlaneGizmos();
    this._clearActivePlaneContour();
    this.updateRendererClipPlanes();
  }

  /**
   * Show or hide the section-box wireframe and face meshes without touching
   * the underlying clip planes. Used to keep clipping active in default mode
   * while hiding the interactive box overlay.
   */
  setSectionBoxVisible(visible) {
    if (this._boxFaceMesh) this._boxFaceMesh.visible = visible;
    if (this._boxEdgeMesh) this._boxEdgeMesh.visible = visible;
    // Also hide all box face gizmos (rings, 3D meshes, rotate handles).
    if (this.sectionBoxPlaneIds) {
      for (const planeId of this.sectionBoxPlaneIds) {
        const gizmoData = this._planeGizmos.get(planeId);
        if (!gizmoData) continue;
        if (gizmoData.el)     gizmoData.el.style.display     = visible ? 'flex' : 'none';
        if (gizmoData.ring3D) gizmoData.ring3D.visible        = visible;
      }
    }
    for (const gizmo of this._rotateGizmos) {
      gizmo.el.style.display = 'none'; // rotate gizmos only show inside rotate sub-tool
      if (gizmo.mesh3D) gizmo.mesh3D.visible = false;
    }
  }

  /**
   * Get all clipping planes
   */
  getClipPlanes() {
    return Array.from(this.clipPlanes.values()).map(({ id, plane, normal, point, enabled, visible }) => ({
      id,
      plane,
      normal: normal.clone(),
      point: point.clone(),
      enabled,
      visible
    }));
  }

  /**
   * Serialize the full sectioning state to plain JSON-safe values.
   * Includes standalone planes and (if active) the section-box state.
   * Section-box-owned planes are excluded from the planes array since they
   * are reconstructed from the box state on restore.
   * Returns null when no sectioning is active.
   */
  serializeState() {
    const boxPlaneSet = this._sectionBoxPlaneSet ?? new Set();
    const planes = [];
    for (const pd of this.clipPlanes.values()) {
      if (boxPlaneSet.has(pd.id)) continue;
      planes.push({
        normal: { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
        point:  { x: pd.point.x,  y: pd.point.y,  z: pd.point.z },
        creatorTool: pd.creatorTool ?? 'section-plane',
      });
    }
    const box = this._boxState ? {
      center:      { x: this._boxState.center.x,      y: this._boxState.center.y,      z: this._boxState.center.z },
      halfExtents: { x: this._boxState.halfExtents.x, y: this._boxState.halfExtents.y, z: this._boxState.halfExtents.z },
      quaternion:  { x: this._boxState.quaternion.x,  y: this._boxState.quaternion.y,  z: this._boxState.quaternion.z, w: this._boxState.quaternion.w },
    } : null;
    if (planes.length === 0 && !box) return null;
    return { planes, box };
  }

  /**
   * Restore a sectioning state previously captured via serializeState().
   * Clears any current sectioning first. Passing null clears all sectioning.
   */
  restoreState(snapshot) {
    this.clearAll();
    if (!snapshot) return;
    if (Array.isArray(snapshot.planes)) {
      for (const p of snapshot.planes) {
        const n = new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z);
        const pt = new THREE.Vector3(p.point.x, p.point.y, p.point.z);
        this.addClipPlane(n, pt, { creatorTool: p.creatorTool ?? 'section-plane' });
      }
    }
    if (snapshot.box) {
      const center      = new THREE.Vector3(snapshot.box.center.x,      snapshot.box.center.y,      snapshot.box.center.z);
      const halfExtents = new THREE.Vector3(snapshot.box.halfExtents.x, snapshot.box.halfExtents.y, snapshot.box.halfExtents.z);
      const quaternion  = snapshot.box.quaternion;
      this.activateSectionBox({ center, halfExtents, quaternion });
    }
  }

  /**
   * Move a plane along its normal
   */
  movePlane(planeId, distance) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

    planeData.plane.constant += distance;
    planeData.point.addScaledVector(planeData.normal, distance);

    if (planeData.helper) {
      planeData.helper.position.copy(planeData.point);
    }

    this.updateRendererClipPlanes();

    if (this.isDragging && this._dragCumulativeDistance != null) {
      this._dragCumulativeDistance += distance;
    }

    // Keep the section-box visual in sync when a face plane is dragged.
    // Do NOT invalidate planeBounds2D here — that triggers geometry traversal in
    // _updatePlaneGizmoPositions every frame. Invalidation happens in onMouseUp.
    if (this._sectionBoxPlaneSet?.has(planeId)) {
      this._syncBoxMeshToPlanes();
    }

    this.emit('plane-move', { id: planeId, distance, point: planeData.point.clone() });
  }

  /**
   * Flip the clipping direction
   */
  flipPlane(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

    // ── Section-box planes: flip the whole box as a unit ───────────────────
    // Each box plane stores two separate things:
    //   • planeData.plane  — the THREE.Plane the renderer clips with (negated normal)
    //   • planeData.normal — the outward visual normal (drives gizmo arrows,
    //                         face-visibility checks, and drag direction)
    // Flipping a single plane would break box integrity (inconsistent clip faces).
    // Instead, negate ALL 6 THREE.Planes together (inverts the clipped volume),
    // but leave planeData.normal unchanged so every gizmo arrow, face-facing check,
    // and drag interaction stays correct.
    if (this._sectionBoxPlaneSet?.has(planeId)) {
      for (const bpId of this._sectionBoxPlaneSet) {
        const bp = this.clipPlanes.get(bpId);
        if (bp) bp.plane.negate();
      }
      this.updateRendererClipPlanes();
      this._pushAction({
        type: 'flip-plane',
        undo: () => { this.flipPlane(planeId); },
        redo: () => { this.flipPlane(planeId); },
      });
      this.emit('plane-flip', { id: planeId });
      this._refreshSectionPlaneActiveVisuals();
      return;
    }

    // ── Regular section-plane flip ──────────────────────────────────────────
    planeData.plane.negate();
    planeData.normal.negate();

    if (planeData.helper) {
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), planeData.normal);
      planeData.helper.quaternion.copy(quaternion);
    }

    this.updateRendererClipPlanes();

    // Invalidate cached 2D cross-section bounds so gizmo repositions correctly
    const gizmoData = this._planeGizmos.get(planeId);
    if (gizmoData) gizmoData.planeBounds2D = null;

    this._pushAction({
      type: 'flip-plane',
      undo: () => { this.flipPlane(planeId); },
      redo: () => { this.flipPlane(planeId); },
    });

    this.emit('plane-flip', { id: planeId });
    this._refreshSectionPlaneActiveVisuals();
  }

  /**
   * Enable/disable a plane
   */
  setPlaneEnabled(planeId, enabled) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

    planeData.enabled = enabled;
    this.updateRendererClipPlanes();

    this.emit('plane-toggle', { id: planeId, enabled });
  }

  /**
   * Show/hide plane helper
   */
  setPlaneVisible(planeId, visible) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

    planeData.visible = visible;
    if (planeData.helper) {
      planeData.helper.visible = visible;
    }
  }

  /**
   * Update renderer's clipping planes array
   */
  updateRendererClipPlanes() {
    const activePlanes = [];

    this.clipPlanes.forEach(planeData => {
      if (planeData.enabled) {
        activePlanes.push(planeData.plane);
      }
    });

    this.renderer.clippingPlanes = activePlanes;
  }

  /**
   * Handle mouse down for plane dragging
   */
  onMouseDown(event) {
    if (event.button !== 0) return;
    if (!this.activeTool) return;

    const isSectioningTool = this.activeTool === 'section-plane' || this.activeTool === 'section-cut';

    if (isSectioningTool) {
      this.updateMouse(event);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // ── Tilt gizmo: intercept drag before any other logic (section-plane only) ──
      if (this.activeTool === 'section-plane' && this._tiltGizmo && this.activeSectionPlaneId) {
        const ringMeshes = [
          ...(this._tiltRingXMeshes || []),
          ...(this._tiltRingYMeshes || []),
        ];
        const gizmoHits = this.raycaster.intersectObjects(ringMeshes, false);
        if (gizmoHits.length > 0) {
          const hitMesh = gizmoHits[0].object;
          const axis = hitMesh.userData._tiltAxis; // 'x' or 'y'
          if (axis) {
            this._tiltDragging = true;
            this._tiltAxis = axis;

            const planeData = this.clipPlanes.get(this.activeSectionPlaneId);
            this._tiltBaseQuat = planeData.helper.quaternion.clone();
            this._tiltBeforeQuat = planeData.helper.quaternion.clone();

            // Compute the rotation axis in world space for angle tracking
            const localAxis = axis === 'x'
              ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            const worldAxis = localAxis.applyQuaternion(planeData.helper.quaternion).normalize();

            // Build a plane perpendicular to the rotation axis, through the gizmo center
            const gizmoCenter = planeData.point.clone();
            const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(worldAxis, gizmoCenter);

            const startPt = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(dragPlane, startPt);
            const startDir = startPt.sub(gizmoCenter).normalize();

            this._tiltDragPlane = dragPlane;
            this._tiltDragCenter = gizmoCenter;
            this._tiltDragStartDir = startDir;
            this._tiltWorldAxis = worldAxis;

            this.emit('drag-start', {});
            this._setCursor('default');
            event.stopPropagation();
            event.preventDefault();
            return;
          }
        }
      }

      // Raycast visible model geometry
      const modelMeshes = [];
      this.scene.traverse(obj => {
        if (obj.isMesh && obj.visible && !obj.userData.isPlaneHelper && !obj.userData.isTiltGizmo) {
          modelMeshes.push(obj);
        }
      });
      const rawHits = this.raycaster.intersectObjects(modelMeshes, false);
      const visibleHits = this._filterClippedHits(rawHits);
      if (visibleHits.length === 0) {
        // Click on empty space → deselect through proper channel so ring visuals reset
        this._selectSectionPlane(null);
        return;
      }

      const hit = visibleHits[0];
      const hitNormal = this.getWorldNormalFromHit(hit);
      if (!hitNormal) return;

      // Mirror the onMouseMove suppression: don't create a plane where the
      // create-plane cursor isn't shown (inside the cut area or on the cut face).
      if (this.clipPlanes.size > 0) {
        const hitPt = hit.point;
        const hiddenBehindCut = rawHits.length > 0 &&
          rawHits[0].distance < visibleHits[0].distance - 0.05;
        let onCutFace = false;
        for (const [, pd] of this.clipPlanes) {
          if (pd.plane.distanceToPoint(hitPt) < 0.4) { onCutFace = true; break; }
        }
        if (hiddenBehindCut || onCutFace) return;
      }

      const bounds = this.getSceneBounds();
      const bSize = new THREE.Vector3();
      bounds.getSize(bSize);
      const threshold = Math.max(bSize.x, bSize.y, bSize.z) * 0.02;

      // Enforce 3-plane maximum
      if (this.clipPlanes.size >= 3) {
        this._showToast('No more than 3 section planes can be created');
        return;
      }

      // Click is on model → create a new plane and immediately begin dragging it
      // so the user can position it in one mousedown-move-mouseup motion.
      let newPlaneId;
      if (this.activeTool === 'section-plane') {
        const inwardNormal = this._resolveInwardSectionPlaneNormal(hit.point, hitNormal);
        const outwardNormal = inwardNormal.clone().negate();
        const placementPoint = this._getSectionPlanePlacementPoint(hit.point, inwardNormal);
        newPlaneId = this.addClipPlane(outwardNormal, placementPoint, { creatorTool: 'section-plane' });
      } else {
        // section-cut: normal perpendicular to the surface normal so the cut
        // slices through the model rather than along the surface.
        const cutNormal = this._computeSectionCutNormal(hitNormal);
        newPlaneId = this.addClipPlane(cutNormal, hit.point, { creatorTool: 'section-cut' });
      }

      // Clear ALL placement hover visuals now that the plane is created and
      // the drag is about to start. Without this, the crosshair/scissors icon
      // stays frozen at the click point for the entire drag.
      this.clearCutHoverMarker();
      this.clearPlaneHoverMarker();
      this._removeCutSurfaceHighlight();
      this.clearHoverHighlight();

      this._showPlaneGizmo(newPlaneId);
      this._selectSectionPlane(newPlaneId);

      // Immediately begin the drag so the mouse can slide the plane without
      // releasing. _beginPlaneDrag emits 'drag-start' which ModelViewer picks
      // up to call navigation.setControlsEnabled(false) — this disables
      // OrbitControls before the first pointermove fires, so the camera stays
      // still for the duration of the drag.
      const gizmoData = this._planeGizmos.get(newPlaneId);
      if (gizmoData?.currentPos) gizmoData.dragStartPos = gizmoData.currentPos.clone();
      this._beginPlaneDrag(newPlaneId, hit.point);

      // Capture mouseup on the window so the drag ends cleanly even if the
      // cursor leaves the canvas before the button is released.
      const onCreateDragUp = (upEvent) => {
        window.removeEventListener('mouseup', onCreateDragUp, { capture: true });
        if (this.isDragging) this.onMouseUp(upEvent);
      };
      window.addEventListener('mouseup', onCreateDragUp, { capture: true });

      event.stopPropagation();
      event.preventDefault();
      return;
    }

    // ── Section-box interaction ───────────────────────────────────────
    if (this.activeTool === 'section-box' && this._boxFaceMesh) {
      // drag-face / rotate: gizmo DOM elements handle the mousedown — nothing here.
      // Still consume the event so the Selection system doesn't select model elements.
      if (this._boxSubTool === 'drag-face' || this._boxSubTool === 'rotate') {
        event.stopPropagation();
        return;
      }

      // move: detect click on the box face mesh to begin whole-box drag.
      this.updateMouse(event);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObject(this._boxFaceMesh, false);
      if (hits.length > 0) {
        const hit = hits[0];

        if (this._boxSubTool === 'move') {
          this._isBoxDragging = true;
          this._boxDragType = 'move';
          this._boxMoveCumulative.set(0, 0, 0);
          const cameraDir = new THREE.Vector3();
          this.camera.getWorldDirection(cameraDir);
          this._boxDragPlane.setFromNormalAndCoplanarPoint(cameraDir, hit.point);
          this._boxDragStartPoint.copy(hit.point);
          this._setCursor('grabbing');
          event.stopPropagation();
          event.preventDefault();
          return;
        }

        // rotate is now handled by the per-face gizmo DOM elements above.
      }
      // Always consume — prevent stray clicks from reaching the Selection system.
      event.stopPropagation();
      return;
    }

    // ── Default: existing plane-helper drag logic ─────────────────────
    const helpers = [];
    this.helpersGroup.traverse(obj => {
      if (obj.isMesh && obj.userData.isPlaneHelper && !obj.userData.isSectionBox) {
        helpers.push(obj);
      }
    });

    const intersects = this.raycaster.intersectObjects(helpers, false);

    if (intersects.length > 0) {
      const helper = intersects[0].object;
      const planeId = this._resolvePlaneIdFromHelperObject(helper);

      if (planeId) {
        this._setActiveSectionPlane(planeId);
        this._beginPlaneDrag(planeId, intersects[0].point.clone());

        event.stopPropagation();
        event.preventDefault();
      }
    }
  }

  /**
   * Handle mouse move for plane dragging
   */
  onMouseMove(event) {
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // ── Synchronous gizmo proximity check ────────────────────────────────────
    // _hoveredPlaneId is also updated in the RAF render loop, but that runs one
    // frame after mousemove. Recalculate it here immediately using the DOM
    // element's bounding rect — the most accurate source since it IS the hit area.
    if (!this.isDragging && this._planeGizmos.size > 0) {
      let foundId = null;
      for (const [pid, data] of this._planeGizmos) {
        if (!data.el || data.el.style.display === 'none') continue;
        const er = data.el.getBoundingClientRect();
        const cx = er.left + er.width  / 2;
        const cy = er.top  + er.height / 2;
        if (Math.abs(event.clientX - cx) < 34 && Math.abs(event.clientY - cy) < 34) {
          foundId = pid;
          break;
        }
      }
      this._hoveredPlaneId = foundId;
    }

    // ── Tilt gizmo drag ──
    if (this._tiltDragging && this.activeSectionPlaneId) {
      const pt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this._tiltDragPlane, pt)) {
        const dir = pt.sub(this._tiltDragCenter).normalize();
        // Signed angle between drag start direction and current direction
        const cross = new THREE.Vector3().crossVectors(this._tiltDragStartDir, dir);
        const sign = Math.sign(cross.dot(this._tiltWorldAxis));
        let angle = Math.acos(THREE.MathUtils.clamp(this._tiltDragStartDir.dot(dir), -1, 1));
        angle *= sign * this.TILT_SENSITIVITY;

        // Clamp cumulative tilt — TILT_MAX_ANGLE per axis
        if (this._tiltAxis === 'x') {
          angle = THREE.MathUtils.clamp(
            this._tiltCumulativeX + angle, -this.TILT_MAX_ANGLE, this.TILT_MAX_ANGLE
          ) - this._tiltCumulativeX;
        } else {
          angle = THREE.MathUtils.clamp(
            this._tiltCumulativeY + angle, -this.TILT_MAX_ANGLE, this.TILT_MAX_ANGLE
          ) - this._tiltCumulativeY;
        }

        if (Math.abs(angle) > 0.0001) {
          // Build rotation in local space of the helper
          const localAxis = this._tiltAxis === 'x'
            ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
          const dq = new THREE.Quaternion().setFromAxisAngle(localAxis, angle);

          const planeData = this.clipPlanes.get(this.activeSectionPlaneId);
          // Apply: new = base * dq (local rotation)
          planeData.helper.quaternion.copy(this._tiltBaseQuat).multiply(dq);

          // Update accumulated angles
          if (this._tiltAxis === 'x') this._tiltCumulativeX += angle;
          else this._tiltCumulativeY += angle;

          // Rebuild base quat for next frame's delta
          this._tiltBaseQuat.copy(planeData.helper.quaternion);

          // Reset drag start so delta is frame-relative
          const newPt = new THREE.Vector3();
          this.raycaster.ray.intersectPlane(this._tiltDragPlane, newPt);
          if (newPt) this._tiltDragStartDir = newPt.sub(this._tiltDragCenter).normalize();

          // Sync the gizmo wrapper to match the helper's full orientation
          this._tiltGizmo.quaternion.copy(planeData.helper.quaternion);

          // Live-update the clipping plane and contour
          this._syncTiltToClipPlane(this.activeSectionPlaneId);
        }
      }
      this._setCursor('default');
      return;
    }

    // ── Tilt gizmo hover detection ──
    if (this._tiltGizmo && this.activeSectionPlaneId && !this.isDragging) {
      const ringMeshes = [
        ...(this._tiltRingXMeshes || []),
        ...(this._tiltRingYMeshes || []),
      ];
      const gizmoHits = this.raycaster.intersectObjects(ringMeshes, false);
      if (gizmoHits.length > 0) {
        const hitMesh = gizmoHits[0].object;
        if (this._tiltHoveredRing !== hitMesh) {
          this._unhighlightTiltRing();
          this._tiltHoveredRing = hitMesh;
          if (hitMesh.material) {
            hitMesh.material._origEmissiveIntensity = hitMesh.material.emissiveIntensity;
            hitMesh.material.emissiveIntensity = 2.0;
          }
        }
        this.clearPlaneHoverMarker();
        this._setCursor('default');
        return;
      } else if (this._tiltHoveredRing) {
        this._unhighlightTiltRing();
      }
    }

    // ── Section-box move / rotate drag ───────────────────────────────
    if (this._isBoxDragging && this._boxDragType === 'move') {
      const intersection = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this._boxDragPlane, intersection)) {
        const delta = intersection.clone().sub(this._boxDragStartPoint);
        if (delta.lengthSq() > 1e-8) {
          this._translateSectionBox(delta);
          this._boxMoveCumulative.add(delta);
          this._boxDragStartPoint.copy(intersection);
        }
      }
      this.clearHoverHighlight();
      this._setBoxCursor('move');
      // Prevent orbit controls from also moving the camera during box drag.
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    if (this._isBoxDragging && this._boxDragType === 'rotate') {
      const dx = event.clientX - this._boxDragStartClientX;
      const dy = event.clientY - this._boxDragStartClientY;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        {
          // Y-axis spin only — drag right = CW from above, drag left = CCW.
          // Camera-independent so direction is always predictable.
          const angleY = dx * 0.008;
          const dqY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
          this._boxState.quaternion.premultiply(dqY);
          this._boxRotateCumulative += angleY;
        }
        this._syncBoxPlanesToState();
        if (this._boxFaceMesh) this._boxFaceMesh.quaternion.copy(this._boxState.quaternion);
        if (this._boxEdgeMesh) this._boxEdgeMesh.quaternion.copy(this._boxState.quaternion);
        this._boxDragStartClientX = event.clientX;
        this._boxDragStartClientY = event.clientY;
      }
      this.clearHoverHighlight();
      // Prevent orbit controls from also rotating the camera during box rotate.
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    // ── Existing plane-helper drag ──
    if (this.isDragging) {
      const planeData = this.clipPlanes.get(this.dragPlaneId);
      if (!planeData) return;

      const intersection = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
        const delta = intersection.clone().sub(this.dragStartPoint);
        let distance = delta.dot(planeData.normal);

        // Elastic boundary: inside the model AABB the plane moves normally.
        // Outside it, movement is heavily resisted (25% speed) and capped at
        // 8% of the AABB span so it never floats far away.  On release the
        // spring-back animation returns it smoothly to the nearest boundary.
        if (this._dragMinD != null && this._dragMaxD != null) {
          const span       = this._dragMaxD - this._dragMinD;
          const maxOver    = span * 0.08;
          const currentD   = planeData.point.dot(planeData.normal);
          const proposedD  = currentD + distance;

          if (proposedD < this._dragMinD) {
            const over     = proposedD - this._dragMinD; // negative
            const softOver = Math.max(-maxOver, over * 0.25);
            distance       = (this._dragMinD + softOver) - currentD;
          } else if (proposedD > this._dragMaxD) {
            const over     = proposedD - this._dragMaxD; // positive
            const softOver = Math.min(maxOver, over * 0.25);
            distance       = (this._dragMaxD + softOver) - currentD;
          }
        }

        if (Math.abs(distance) > 0.001) {
          this.movePlane(this.dragPlaneId, distance);
          this.dragStartPoint.copy(intersection);
          // Rebuild the contour outline once per frame while dragging.
          this._scheduleActivePlaneContourUpdate();
        }
      }
      // No planeHoverMarker to update — drag is gizmo-driven, not cursor-driven.
      this._updateTiltGizmoPosition(this.dragPlaneId);
      this._setCursor('none');
      return;
    }

    // ── Hover logic (no drag active) ──
    const helpers = [];
    this.helpersGroup.traverse(obj => {
      if (obj.isMesh && obj.userData.isPlaneHelper) {
        helpers.push(obj);
      }
    });
    const intersects = this.raycaster.intersectObjects(helpers, false);

    if (this.activeTool === 'section-cut' || this.activeTool === 'section-plane') {
      const isSectionPlane = this.activeTool === 'section-plane';

      // Cursor is over a plane gizmo — suppress placement cursor and show pointer.
      // Use the frame-accurate _hoveredPlaneId (set by proximity check every frame)
      // rather than _hoveringPlaneGizmo (DOM mouseenter/leave) which misses cases
      // where a gizmo spawns or moves under the cursor without a real entry event.
      if (this._hoveredPlaneId !== null) {
        this.clearCutHoverMarker();
        this.clearPlaneHoverMarker();
        this._removeCutSurfaceHighlight();
        this.clearHoverHighlight();
        this._setCursor('pointer');
        return;
      }

      // ── Placement cursor — show the tool's cursor on model surfaces ──
      // Drag is now exclusively initiated via the plane gizmo, so there is
      // no hover-near-plane drag-arrow logic here any more.
      const modelMeshes = [];
      this.scene.traverse(obj => {
        if (obj.isMesh && obj.visible && !obj.userData.isPlaneHelper && !obj.userData.isTiltGizmo) {
          modelMeshes.push(obj);
        }
      });
      const rawHits = this.raycaster.intersectObjects(modelMeshes, false);
      const modelHits = this._filterClippedHits(rawHits);

      if (modelHits.length > 0) {
        const hitPt  = modelHits[0].point;
        const normal = this.getWorldNormalFromHit(modelHits[0]);

        if (this.clipPlanes.size > 0) {
          // PRIMARY CHECK — "visible only through the cut"
          // If rawHits[0] (closest geometry regardless of clipping) is meaningfully closer
          // than modelHits[0] (closest visible geometry), there is clipped material between
          // the camera and the surface we hit.  That surface is only visible because the
          // section removed what was in front of it — default cursor, no new plane here.
          const hiddenBehindCut = rawHits.length > 0 &&
            rawHits[0].distance < modelHits[0].distance - 0.05;

          // SECONDARY CHECK — "we're right at the cut face"
          // A straddling triangle whose visible side lands < 0.4 m from the plane is the
          // actual cross-section surface.  rawHits[0] === modelHits[0] in this case so the
          // primary check won't fire; catch it here.
          let onCutFace = false;
          for (const [, pd] of this.clipPlanes) {
            if (pd.plane.distanceToPoint(hitPt) < 0.4) { onCutFace = true; break; }
          }

          if (hiddenBehindCut || onCutFace) {
            this.clearCutHoverMarker();
            this.clearPlaneHoverMarker();
            this._removeCutSurfaceHighlight();
            this.clearHoverHighlight();
            this._setCursor('');
            return;
          }
        }

        if (normal) {
          this.clearHoverHighlight();
          this._applyCutSurfaceHighlight(
            modelHits[0],
            isSectionPlane ? this._planeHoverMaterial : this._cutHoverMaterial,
          );
          if (isSectionPlane) {
            this.clearCutHoverMarker();
            this.setPlaneHoverMarker(modelHits[0].point, normal);
          } else {
            this.clearPlaneHoverMarker();
            this.setCutHoverMarker(modelHits[0].point, normal);
          }
          this._setCursor('none');
          return;
        }
      }

      // Not over a model surface
      this.clearCutHoverMarker();
      this.clearPlaneHoverMarker();
      this._removeCutSurfaceHighlight();
      this.clearHoverHighlight();
      this._setCursor('');
      return;
    }

    // ── Section-box hover ─────────────────────────────────────────────
    if (this.activeTool === 'section-box') {
      // drag-face / rotate: gizmo DOM elements own the cursor — nothing to do here.
      if (this._boxSubTool === 'drag-face' || this._boxSubTool === 'rotate') return;

      // Always suppress model hover/select highlights in move mode —
      // the transparent box would otherwise let the system highlight model geometry
      // behind it, which appears as a spurious hover/select state to the user.
      this.clearHoverHighlight();
      this.clearPlaneHoverMarker();

      const overBox = intersects.some(h => h.object === this._boxFaceMesh);
      this._setBoxCursor(overBox ? this._boxSubTool : null);
      return;
    }

    // Default hover for other tools
    this.clearHoverHighlight();
    this._setCursor(intersects.length > 0 ? 'pointer' : '');
  }

  /**
   * Handle mouse up
   */
  onMouseUp(event) {
    // ── Tilt gizmo drag end ──
    if (this._tiltDragging) {
      this._tiltDragging = false;
      this._tiltAxis = null;
      this._setCursor('default');

      // Push undo action for the tilt
      if (this._tiltBeforeQuat && this.activeSectionPlaneId) {
        const planeId = this.activeSectionPlaneId;
        const beforeQ = this._tiltBeforeQuat.clone();
        const planeData = this.clipPlanes.get(planeId);
        const afterQ = planeData ? planeData.helper.quaternion.clone() : null;

        if (afterQ && !beforeQ.equals(afterQ)) {
          this._pushAction({
            type: 'tilt-plane',
            undo: () => {
              const pd = this.clipPlanes.get(planeId);
              if (!pd) return;
              pd.helper.quaternion.copy(beforeQ);
              if (this._tiltGizmo) {
                this._tiltGizmo.quaternion.copy(beforeQ);
              }
              this._syncTiltToClipPlane(planeId);
              this._updateTiltGizmoPosition(planeId);
            },
            redo: () => {
              const pd = this.clipPlanes.get(planeId);
              if (!pd) return;
              pd.helper.quaternion.copy(afterQ);
              if (this._tiltGizmo) {
                this._tiltGizmo.quaternion.copy(afterQ);
              }
              this._syncTiltToClipPlane(planeId);
              this._updateTiltGizmoPosition(planeId);
            },
          });
        }
      }
      this._tiltBeforeQuat = null;
      if (this.activeSectionPlaneId) {
        this._updateTiltGizmoPosition(this.activeSectionPlaneId);
      }
      this.emit('drag-end');
      return;
    }

    // ── Section-box move / rotate drag end ───────────────────────────
    if (this._isBoxDragging) {
      const dragType = this._boxDragType;
      const moveDelta = this._boxMoveCumulative.clone();
      const rotateAngle = this._boxRotateCumulative;

      this._isBoxDragging = false;
      this._boxDragType = null;
      this._boxMoveCumulative.set(0, 0, 0);
      this._boxRotateCumulative = 0;

      if (dragType === 'move' && moveDelta.lengthSq() > 1e-8) {
        this._pushAction({
          type: 'box-move',
          undo: () => { this._translateSectionBox(moveDelta.clone().negate()); },
          redo: () => { this._translateSectionBox(moveDelta); },
        });
      } else if (dragType === 'rotate') {
        const beforeQuat = this._boxRotateStartQuat;
        const afterQuat  = this._boxState.quaternion.clone();
        // Only record if the box actually moved.
        if (beforeQuat && !beforeQuat.equals(afterQuat)) {
          this._pushAction({
            type: 'box-rotate',
            undo: () => { this._applyBoxQuaternion(beforeQuat); },
            redo: () => { this._applyBoxQuaternion(afterQuat); },
          });
        }
        this._boxRotateStartQuat = null;
        this._rotatePinnedCornerSigns = null;  // release corner pin on mouse up
      }

      // Refresh all 6 gizmo centroids to the new plane positions so they
      // follow the box after a whole-box move or rotate.
      this._refreshBoxGizmoCentroids();

      this._setBoxCursor(null);
      this._setCursor('');
      this.emit('drag-end');
      return;
    }

    if (this.isDragging) {
      const draggedPlaneId = this.dragPlaneId;
      const totalDist = this._dragCumulativeDistance || 0;
      if (Math.abs(totalDist) > 0.0001) {
        this._pushAction({
          type: 'move-plane',
          undo: () => { this.movePlane(draggedPlaneId, -totalDist); },
          redo: () => { this.movePlane(draggedPlaneId, totalDist); },
        });
      }
      this.isDragging = false;
      this.dragPlaneId = null;
      this._dragCumulativeDistance = 0;

      // Spring-back: if the plane was dragged beyond the model AABB, animate
      // it back to the nearest boundary instead of leaving it out of bounds.
      if (this._dragMinD != null && this._dragMaxD != null && draggedPlaneId) {
        const pd = this.clipPlanes.get(draggedPlaneId);
        if (pd) {
          const currentD = pd.point.dot(pd.normal);
          const clampedD = Math.max(this._dragMinD, Math.min(this._dragMaxD, currentD));
          if (Math.abs(clampedD - currentD) > 0.001) {
            this._springPlaneId  = draggedPlaneId;
            this._springTargetD  = clampedD;
            this._springVelocity = 0;
          }
        }
      }
      this._dragMinD = null;
      this._dragMaxD = null;
      // Drop the cached mesh list and run a final synchronous, accurate build
      // so the contour reflects the exact resting position even if a queued
      // rAF rebuild was still pending mid-drag.
      this._dragMeshCache = null;
      // Cancel any pending contour rebuild and clear the outline — it should
      // only be visible while actively dragging.
      if (this._activeContourRafId) {
        cancelAnimationFrame(this._activeContourRafId);
        this._activeContourRafId = 0;
      }
      this._clearActivePlaneContour();
      // Update gizmo anchor after drag completes
      if (draggedPlaneId) {
        const gizmoData = this._planeGizmos.get(draggedPlaneId);
        if (gizmoData) {
          // Anchor the centroid to wherever the gizmo visually landed — no
          // recentering after release. Camera-following still works from here.
          if (gizmoData.currentPos) {
            gizmoData.centroid.copy(gizmoData.currentPos);
          }
          // Invalidate cached 2D bounds so they're recomputed at the new plane position
          gizmoData.planeBounds2D = null;
        }
        // For box-plane drags: refresh centroids for the other 5 faces now that
        // the plane has settled. Done once here (not per-frame) to avoid expense.
        const draggedPd = this.clipPlanes.get(draggedPlaneId);
        if (draggedPd?.isBoxPlane && this._sectionBoxPlaneSet) {
          for (const id of this._sectionBoxPlaneSet) {
            if (id === draggedPlaneId) continue;
            const gd = this._planeGizmos.get(id);
            if (gd) {
              const refreshed = this._computeGizmoCentroid(id);
              if (refreshed) gd.centroid = refreshed;
              gd.planeBounds2D = null;
            }
          }
        }
        // Restore grab cursor on the gizmo element
        const g = this._planeGizmos.get(draggedPlaneId);
        if (g?.el) g.el.style.cursor = 'grab';
      }
      this.clearPlaneHoverMarker();
      this._setCursor('');
      this.emit('drag-end');
      if (draggedPlaneId && this.activeSectionPlaneId === draggedPlaneId) {
        this._attachTiltGizmo(draggedPlaneId);
      }
    }
  }

  updateMouse(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    // Store raw client coords for gizmo hover detection (screen-space distance check).
    this._cursorClientX = event.clientX;
    this._cursorClientY = event.clientY;
  }

  /**
   * Dispose helper geometry and materials
   */
  disposeHelper(helper) {
    helper.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  /**
   * Get state for persistence
   */
  getState() {
    const planes = [];

    this.clipPlanes.forEach(planeData => {
      planes.push({
        id: planeData.id,
        normal: {
          x: planeData.normal.x,
          y: planeData.normal.y,
          z: planeData.normal.z
        },
        constant: planeData.plane.constant,
        enabled: planeData.enabled,
        visible: planeData.visible
      });
    });

    return { clipPlanes: planes };
  }

  /**
   * Restore state from persistence
   */
  setState(state) {
    if (!state || !state.clipPlanes) return;

    // Clear existing planes
    this.clearClipPlanes();

    // Recreate planes from state
    state.clipPlanes.forEach(planeState => {
      const normal = new THREE.Vector3(
        planeState.normal.x,
        planeState.normal.y,
        planeState.normal.z
      );

      // Calculate point from normal and constant
      const point = normal.clone().multiplyScalar(-planeState.constant);

      const id = this.addClipPlane(normal, point);

      // Restore enabled/visible state
      if (!planeState.enabled) {
        this.setPlaneEnabled(id, false);
      }
      if (!planeState.visible) {
        this.setPlaneVisible(id, false);
      }
    });
  }

  // Event handling
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => callback(data));
    }
  }

  destroy() {
    this.domElement.removeEventListener('mousedown', this.boundOnMouseDown);
    window.removeEventListener('mousemove', this.boundOnMouseMove, { capture: true });
    this.domElement.removeEventListener('mouseup', this.boundOnMouseUp);
    document.removeEventListener('keydown', this.boundOnKeyDown);

    if (this._overlayAnimId != null) {
      cancelAnimationFrame(this._overlayAnimId);
    }

    this.clearAll();
    this._clearAllPlaneGizmos();

    if (this.scissorsOverlay && this.scissorsOverlay.parentElement) {
      this.scissorsOverlay.parentElement.removeChild(this.scissorsOverlay);
    }
    if (this._rotatePill && this._rotatePill.parentElement) {
      clearTimeout(this._rotatePillTimer);
      this._rotatePill.parentElement.removeChild(this._rotatePill);
    }

    this.scene.remove(this.helpersGroup);

    this.renderer.clippingPlanes = [];

    this.eventListeners.clear();
  }
}
