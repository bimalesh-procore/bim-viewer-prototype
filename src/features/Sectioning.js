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
        if (gizmoData.ring3D) gizmoData.ring3D.visible = false;
      }
    } else {
      // Entering (or switching within) sectioning mode — ensure all planes
      // and their gizmos are visible.
      for (const [planeId, pd] of this.clipPlanes) {
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

  activateSectionBox() {
    this.clearSectionBox();

    const bounds = this.getSceneBounds();
    const min = bounds.min.clone();
    const max = bounds.max.clone();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());

    const epsilon = 0.001;
    const halfExtents = size.clone().multiplyScalar(0.5).addScalar(epsilon);

    const planesData = [
      { normal: new THREE.Vector3(1, 0, 0), point: new THREE.Vector3(center.x + halfExtents.x, center.y, center.z) },
      { normal: new THREE.Vector3(-1, 0, 0), point: new THREE.Vector3(center.x - halfExtents.x, center.y, center.z) },
      { normal: new THREE.Vector3(0, 1, 0), point: new THREE.Vector3(center.x, center.y + halfExtents.y, center.z) },
      { normal: new THREE.Vector3(0, -1, 0), point: new THREE.Vector3(center.x, center.y - halfExtents.y, center.z) },
      { normal: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(center.x, center.y, center.z + halfExtents.z) },
      { normal: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(center.x, center.y, center.z - halfExtents.z) },
    ];

    // Suppress individual plane actions — we record the whole box as one action
    const prevSkip = this._skipRecord;
    this._skipRecord = true;
    const planeIds = [];
    planesData.forEach(({ normal, point }) => {
      const id = this.addClipPlane(normal, point);
      planeIds.push(id);
    });
    this._skipRecord = prevSkip;
    this.sectionBoxPlaneIds = planeIds;

    const boxGeometry = new THREE.BoxGeometry(
      Math.max(max.x - min.x, 0.01),
      Math.max(max.y - min.y, 0.01),
      Math.max(max.z - min.z, 0.01)
    );
    const edges = new THREE.EdgesGeometry(boxGeometry);
    const material = new THREE.LineBasicMaterial({ color: 0x00a8ff, transparent: true, opacity: 0.8 });
    const wireframe = new THREE.LineSegments(edges, material);
    wireframe.position.copy(center);
    wireframe.userData.isPlaneHelper = true;

    this.sectionBoxGroup = new THREE.Group();
    this.sectionBoxGroup.name = 'SectionBoxHelper';
    this.sectionBoxGroup.add(wireframe);
    this.helpersGroup.add(this.sectionBoxGroup);

    const savedPlanesData = planesData.map(p => ({ normal: p.normal.clone(), point: p.point.clone() }));
    this._pushAction({
      type: 'section-box',
      undo: () => { this.clearSectionBox(); },
      redo: () => { this.activateSectionBox(); },
    });

    this.emit('section-box-activate', { planeIds });
    return planeIds;
  }

  clearSectionBox() {
    const ids = [...this.sectionBoxPlaneIds];
    ids.forEach(id => this.removeClipPlane(id));
    this.sectionBoxPlaneIds = [];

    if (this.sectionBoxGroup) {
      this.helpersGroup.remove(this.sectionBoxGroup);
      this.disposeHelper(this.sectionBoxGroup);
      this.sectionBoxGroup = null;
    }
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

  _loadGizmoArrowTexture() {
    // Draws the two polygon arrows (top full opacity, bottom 40% dim) onto a
    // 128×128 canvas so they can be used as a billboard sprite on the gizmo ring.
    // The SVG source viewBox is 16×68; we scale it to fill the canvas height.
    const sz = 128;
    const pad = 8;
    const svgW = 16, svgH = 68;
    const scale = (sz - pad * 2) / svgH;
    const offsetX = (sz - svgW * scale) / 2;
    const offsetY = pad;
    const tx = (x) => offsetX + x * scale;
    const ty = (y) => offsetY + y * scale;

    // c=center, aW=arrowhead half-width, sW=stem half-width (tune independently)
    const c = 8, aW = 6, sW = 1.5;
    // iR: convex corner radius — tip + outer arrowhead shoulders (warp inward)
    // oR: outward-bulge radius  — where arrowhead meets stem (warp outward)
    // base corners (where stem meets center ring) stay sharp
    const iR = 1.5; // SVG units
    const oR = 2.0; // SVG units

    // Each arrow: [tip, rightOuter, rightInner, rightBase, leftBase, leftInner, leftOuter]
    const arrowBase = 20; // arrowhead base y (top arrow); closer to 34 = shorter stem
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

    // Unit vector from point a toward point b
    const norm = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      return [dx / len, dy / len];
    };

    const drawArrow = (pts, alpha) => {
      // pts order: [P0=tip, P1=rightOuter, P2=rightInner, P3=rightBase,
      //             P4=leftBase, P5=leftInner, P6=leftOuter]
      const [P0, P1, P2, P3, P4, P5, P6] = pts;
      const d32 = norm(P3, P2); // direction: base → inner
      const d21 = norm(P2, P1); // direction: inner → outer
      const d65 = norm(P6, P5); // direction: outer → inner (left side)
      const d54 = norm(P5, P4); // direction: inner → base (left side)
      const ir = iR * scale;    // convex radius in canvas px

      ctx.globalAlpha = alpha;
      ctx.beginPath();

      // Start at rightBase — sharp corner
      ctx.moveTo(tx(P3[0]), ty(P3[1]));

      // ── rightInner (P2): outward bulge where arrowhead meets stem ────────
      ctx.lineTo(tx(P2[0] - d32[0] * oR), ty(P2[1] - d32[1] * oR));
      ctx.quadraticCurveTo(
        tx(P2[0]), ty(P2[1]),
        tx(P2[0] + d21[0] * oR), ty(P2[1] + d21[1] * oR),
      );

      // ── rightOuter (P1): inward arc — outer arrowhead shoulder ───────────
      ctx.arcTo(tx(P1[0]), ty(P1[1]), tx(P0[0]), ty(P0[1]), ir);

      // ── tip (P0): inward arc ──────────────────────────────────────────────
      ctx.arcTo(tx(P0[0]), ty(P0[1]), tx(P6[0]), ty(P6[1]), ir);

      // ── leftOuter (P6): inward arc — outer arrowhead shoulder ────────────
      ctx.arcTo(tx(P6[0]), ty(P6[1]), tx(P5[0]), ty(P5[1]), ir);

      // ── leftInner (P5): outward bulge where arrowhead meets stem ─────────
      ctx.lineTo(tx(P5[0] - d65[0] * oR), ty(P5[1] - d65[1] * oR));
      ctx.quadraticCurveTo(
        tx(P5[0]), ty(P5[1]),
        tx(P5[0] + d54[0] * oR), ty(P5[1] + d54[1] * oR),
      );

      // ── leftBase (P4): sharp corner — close path ─────────────────────────
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
    const darkMat = new THREE.MeshBasicMaterial({ ...matOpts, color: 0x194d1e, opacity: 1.0 });

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

    // Oscillate the sprite along the local Z axis (surface normal direction)
    const baseZ = this.planeHoverMarker.userData._spriteBaseZ ?? sprite.position.z;
    this.planeHoverMarker.userData._spriteBaseZ = baseZ;
    const amplitude = this.planeHoverMarker.userData._outerR * 0.18;
    sprite.position.z = baseZ + Math.sin(performance.now() * 0.004) * amplitude;
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
      cursor: 'pointer',
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

        // Restore cursor; if pointer left the element during drag (mouseleave
        // couldn't fire while pointerEvents was none), clear hover state now.
        el.style.cursor = 'pointer';
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

    const ring3D = this._createGizmoRing3D(planeId);
    return { el, centroid: centroid.clone(), planeBounds2D: null, currentPos: centroid.clone(), dragStartPos: null, ring3D, _ringAnimScale: 1.0 };
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
      const centroid = this._computeCrossSectionCentroid(planeData.plane) || planeData.point.clone();
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
    const fillMat   = new THREE.MeshBasicMaterial({ ...matOpts, color: 0x56ff77, opacity: 0.20, toneMapped: false });
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

  // Update ring gizmo visuals between normal and selected states.
  _updateGizmoRingSelected(ring3D, isSelected) {
    if (!ring3D) return;
    const { _strokeMat: sMat, _fillMat: fMat, _dotMat: dMat,
            _ringStroke: rStroke, _ringFill: rFill, _centerDot: dot,
            _strokeW: sw, _dotR: dotR, _r: r } = ring3D.userData;
    if (!sMat || !fMat || !rStroke || !rFill) return;

    const newStrokeW = isSelected ? sw * (4 / 3) : sw;
    const newDotR    = isSelected ? dotR * (4 / 3) : dotR;

    rStroke.geometry.dispose();
    rStroke.geometry = new THREE.RingGeometry(r - newStrokeW, r, 72);

    rFill.geometry.dispose();
    rFill.geometry = new THREE.RingGeometry(newDotR, r - newStrokeW, 72);

    if (dot) {
      dot.geometry.dispose();
      dot.geometry = new THREE.CircleGeometry(newDotR, 32);
    }

    if (dMat) {
      dMat.color.set(0x56ff77);
      dMat.needsUpdate = true;
    }

    fMat.opacity = isSelected ? 0.5 : 0.20;
    fMat.needsUpdate = true;
  }

  // Select a plane by click — updates visual, emits event.
  // Pass null to deselect.
  _selectSectionPlane(planeId) {
    const prev = this.activeSectionPlaneId;
    if (prev === planeId) return;

    // Deselect previous ring and snap its scale animation back to normal
    if (prev) {
      const prevGizmo = this._planeGizmos.get(prev);
      if (prevGizmo?.ring3D) this._updateGizmoRingSelected(prevGizmo.ring3D, false);
      if (prevGizmo) prevGizmo._ringAnimScale = 1.0;
    }

    this.activeSectionPlaneId = planeId;

    // Select new ring
    if (planeId) {
      const gizmo = this._planeGizmos.get(planeId);
      if (gizmo?.ring3D) this._updateGizmoRingSelected(gizmo.ring3D, true);
    }

    this.emit('active-plane-change', { planeId: planeId ?? null });
  }

  _removePlaneGizmo(planeId) {
    const data = this._planeGizmos.get(planeId);
    if (!data) return;
    if (data.el?.parentElement) {
      data.el.parentElement.removeChild(data.el);
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
    // Only show gizmos while in sectioning mode
    const isSectioningTool = this.activeTool === 'section-plane' || this.activeTool === 'section-cut';
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
      if (!data.planeBounds2D) {
        data.planeBounds2D = this._computeCrossSectionBounds(planeData.plane, planeData.normal);
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
          const r = camDist * 0.036;
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

          // ── Smooth outer-ring expansion on hover / selected ──────────────
          // Only the stroke ring and fill ring scale up — arrows + dot stay put.
          const isHovered  = this._hoveredPlaneId === planeId;
          const isSelected = this.activeSectionPlaneId === planeId;
          const targetScale = (isHovered || isSelected || this.isDragging && this.dragPlaneId === planeId) ? 1.22 : 1.0;
          // Lerp toward target (fast in, same speed out for snappiness vs. smoothness)
          data._ringAnimScale = data._ringAnimScale !== undefined
            ? data._ringAnimScale + (targetScale - data._ringAnimScale) * 0.18
            : targetScale;
          const as = data._ringAnimScale;
          const rStroke = data.ring3D.userData._ringStroke;
          const rFill   = data.ring3D.userData._ringFill;
          if (rStroke) rStroke.scale.setScalar(as);
          if (rFill)   rFill.scale.setScalar(as);

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

    this.emit('plane-move', { id: planeId, distance, point: planeData.point.clone() });
  }

  /**
   * Flip the clipping direction
   */
  flipPlane(planeId) {
    const planeData = this.clipPlanes.get(planeId);
    if (!planeData) return;

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

      const bounds = this.getSceneBounds();
      const bSize = new THREE.Vector3();
      bounds.getSize(bSize);
      const threshold = Math.max(bSize.x, bSize.y, bSize.z) * 0.02;

      // Click is on model → create a new plane. The gizmo appears immediately;
      // dragging is initiated only by clicking the gizmo, not by this click.
      if (this.activeTool === 'section-plane') {
        const inwardNormal = this._resolveInwardSectionPlaneNormal(hit.point, hitNormal);
        const outwardNormal = inwardNormal.clone().negate();
        const placementPoint = this._getSectionPlanePlacementPoint(hit.point, inwardNormal);
        const planeId = this.addClipPlane(outwardNormal, placementPoint, { creatorTool: 'section-plane' });
        this._showPlaneGizmo(planeId);
        this._selectSectionPlane(planeId);
      } else {
        // section-cut: normal perpendicular to the surface normal so the cut
        // slices through the model rather than along the surface.
        const cutNormal = this._computeSectionCutNormal(hitNormal);
        const planeId = this.addClipPlane(cutNormal, hit.point, { creatorTool: 'section-cut' });
        this.clearCutHoverMarker();
        this._removeCutSurfaceHighlight();
        this._showPlaneGizmo(planeId);
        this._selectSectionPlane(planeId);
      }
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    // ── Default: existing plane-helper drag logic for section-box etc. ──
    const helpers = [];
    this.helpersGroup.traverse(obj => {
      if (obj.isMesh && obj.userData.isPlaneHelper) {
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
        const normal = this.getWorldNormalFromHit(modelHits[0]);
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
        // Restore pointer cursor on the gizmo element
        const g = this._planeGizmos.get(draggedPlaneId);
        if (g?.el) g.el.style.cursor = 'pointer';
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
