import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Navigation {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.camera = sceneManager.getCamera();
    this.domElement = sceneManager.getDomElement();

    this.controls = null;
    this.mode = 'orbit';
    this.firstPersonEnabled = false;
    this.walkSpeed = 5;
    this.flySpeed = 12;
    this.keyboardSpeed = 15;

    // First person controls state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false
    };

    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.prevTime = performance.now();

    this._perspCamera = this.camera;
    this._orthoCamera = null;
    this._isOrthographic = false;

    this.eventListeners = new Map();
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundFlyMouseDown = this.onFlyMouseDown.bind(this);
    this.boundFlyMouseUp = this.onFlyMouseUp.bind(this);
    this.boundFlyMouseMove = this.onFlyMouseMove.bind(this);
    this.boundFlyWheel = this.onFlyWheel.bind(this);
    this.boundOrbitWheel = this.onOrbitWheel.bind(this);

    // Reusable objects for raycasting — avoids GC pressure on every scroll event
    this._raycaster = new THREE.Raycaster();
    this._ndcVec = new THREE.Vector2();
    // Last successful raycast hit distance — used as a contextually-correct
    // fallback when the cursor points at empty space (sky, open atrium, etc.)
    // so the scroll step stays proportional to the camera's nearby geometry.
    this._lastRaycastDist = 10;
    this.boundWindowBlur = () => { Object.keys(this.keys).forEach(k => { this.keys[k] = false; }); };

    // Fly mode state
    this.isFlyDragging = false;
    this.flyOriginX = 0;
    this.flyOriginY = 0;
    this.flyDeltaX = 0;
    this.flyDeltaY = 0;
    this._flyCircle = null;

    // Look mode state
    this.isLookDragging = false;
    this.lookLastX = 0;
    this.lookLastY = 0;
    this.boundLookMouseDown = this.onLookMouseDown.bind(this);
    this.boundLookMouseUp = this.onLookMouseUp.bind(this);
    this.boundLookMouseMove = this.onLookMouseMove.bind(this);
    this.boundLookWheel = this.onLookWheel.bind(this);

    // Orbit mode state
    this.isOrbitDragging = false;
    this._orbitCircle = null;

    // Set to true by setControlsEnabled(false) to freeze all direct-camera
    // mouse handlers (look/fly drag) while an external system (e.g. section-
    // plane drag) owns the mouse. OrbitControls is frozen via controls.enabled;
    // look and fly modes need this separate flag since they bypass OrbitControls.
    this._externalDragActive = false;
    // Saved snapshot of controls.enabled taken just before an external drag
    // starts, so setControlsEnabled(true) can restore it exactly instead of
    // unconditionally setting true (which breaks look mode).
    this._controlsEnabledBeforeDrag = null;
    this.boundOrbitMouseDown = this.onOrbitMouseDown.bind(this);
    this.boundOrbitMouseUp = this.onOrbitMouseUp.bind(this);

    // Right-click drag state (always-on, mode-aware camera manipulation)
    // Drag only activates after the pointer moves past a small threshold — a clean
    // right-click (no movement) lets the context menu show as normal.
    this._rightDragPending = false; // right button is down but hasn't moved yet
    this._rightDragging = false;    // threshold crossed — navigation is active
    this._rightDragStartX = 0;
    this._rightDragStartY = 0;
    this._rightDragLastX = 0;
    this._rightDragLastY = 0;
    this._rightDragDot = null;
    this.boundRightDragDown = this.onRightDragDown.bind(this);
    this.boundRightDragMove = this.onRightDragMove.bind(this);
    this.boundRightDragUp   = this.onRightDragUp.bind(this);

    this.init();
  }

  init() {
    this.setupOrbitControls();
  }

  setupOrbitControls() {
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 500;
    this.controls.maxPolarAngle = Math.PI;

    // Left drag = look around (pivot at camera), right drag = orbit (pivot at target), middle drag = pan
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    // Left button: free-look — OrbitControls is disabled during the drag and the
    // camera quaternion is rotated directly so position never moves.
    this._isLooking = false;
    this._lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._boundLookMouseDown = this._onLookMouseDown.bind(this);
    this._boundLookMouseMove = this._onLookMouseMove.bind(this);
    this._boundLookMouseUp = this._onLookMouseUp.bind(this);
    this._boundOrbitMouseDown = this._onOrbitMouseDown.bind(this);
    this.domElement.addEventListener('mousedown', this._boundLookMouseDown);
    this.domElement.addEventListener('mousedown', this._boundOrbitMouseDown);
    window.addEventListener('mouseup', this._boundLookMouseUp);

    this.controls.addEventListener('change', () => {
      this.emit('camera-change', {
        position: this.camera.position.clone(),
        target: this.controls.target.clone()
      });
    });

    // Capture phase, pointerdown — Three.js r150+ OrbitControls uses pointer events,
    // so intercepting mousedown does nothing. Capturing pointerdown stops it at source.
    // Note: we do NOT suppress contextmenu globally here. It is suppressed only after
    // the drag threshold is crossed (see onRightDragUp / _activateRightDrag).
    this.domElement.addEventListener('pointerdown', this.boundRightDragDown, { capture: true });

    // Global key listeners — active in all modes so WASD+QE always work
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundWindowBlur);

    // Start animation loop for controls update
    this.animate();
  }

  _onOrbitMouseDown(event) {
    if (event.button !== 2) return;
    // Always orbit around the point directly in front of the camera (screen center)
    // at the current orbit distance so the pivot is never off-center.
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.controls.target.copy(
      this.camera.position.clone().addScaledVector(forward, dist)
    );
    this.controls.update();
  }

  _onLookMouseDown(event) {
    if (event.button !== 0) return;
    this._isLooking = true;
    this.controls.enabled = false;
    this._lookEuler.setFromQuaternion(this.camera.quaternion);
    window.addEventListener('mousemove', this._boundLookMouseMove);
  }

  _onLookMouseMove(event) {
    if (!this._isLooking) return;
    this._lookEuler.y -= event.movementX * 0.002;
    this._lookEuler.x -= event.movementY * 0.002;
    this._lookEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this._lookEuler.x));
    this.camera.quaternion.setFromEuler(this._lookEuler);
    this.emit('camera-change', {
      position: this.camera.position.clone(),
      target: this.controls.target.clone()
    });
  }

  _onLookMouseUp(event) {
    if (event.button !== 0 || !this._isLooking) return;
    this._isLooking = false;
    window.removeEventListener('mousemove', this._boundLookMouseMove);
    // Place the orbit target in front of the camera's new look direction so
    // right-click orbit immediately pivots around screen center.
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.controls.target.copy(
      this.camera.position.clone().addScaledVector(forward, dist)
    );
    this.controls.enabled = true;
    // Do NOT call controls.update() here — the animate loop will pick up the
    // corrected target on the next frame without snapping the camera.
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const time = performance.now();
    const delta = (time - this.prevTime) / 1000;
    this.prevTime = time;

    if (this.firstPersonEnabled) {
      this.updateFirstPerson(delta);
      return;
    }

    // WASD+QE keyboard movement runs in every non-firstPerson mode simultaneously
    this.updateKeyboardMovement(delta);

    // Right-drag orbit dot — update in the animation loop so camera matrices are current
    this._updateRightDragDot();

    // Look and fly modes own the camera directly — skip OrbitControls update
    if (this.mode === 'look') {
      return;
    }

    if (this.mode === 'fly') {
      this.updateFly(delta);
      return;
    }

    if (this.controls) {
      // Skip controls.update while right-dragging so our direct camera changes
      // (look-around rotation in orbit mode) aren't immediately overwritten.
      if (!this._rightDragging) this.controls.update();
      this.updateOrbitCircle();
    }
  }

  setMode(mode) {
    if (mode === this.mode) return;

    this.mode = mode;

    switch (mode) {
      case 'look':
        this.disableOrbit();
        this.disableFirstPerson();
        this.disableFly();
        this.enableLook();
        break;
      case 'orbit': {
        this.disableLook();
        this.disableFirstPerson();
        this.disableFly();
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
        // Re-anchor the orbit target in front of the camera so OrbitControls'
        // first update doesn't snap the view to the stale pre-look-mode target.
        const dist = Math.max(this.camera.position.distanceTo(this.controls.target), 5);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.controls.target.copy(this.camera.position).addScaledVector(fwd, dist);
        this.controls.update();
        this.enableOrbit();
        break;
      }
      case 'pan':
        this.disableOrbit();
        this.disableLook();
        this.disableFirstPerson();
        this.disableFly();
        this.controls.enableRotate = false;
        this.controls.enablePan = true;
        this.controls.screenSpacePanning = true;
        break;
      case 'fly':
        this.disableOrbit();
        this.disableLook();
        this.disableFirstPerson();
        this.enableFly();
        break;
      case 'firstPerson':
        this.disableOrbit();
        this.disableLook();
        this.disableFly();
        this.enableFirstPerson();
        break;
      default:
        this.disableOrbit();
        this.disableLook();
        this.disableFly();
        this.disableFirstPerson();
        break;
    }

    this.emit('mode-change', { mode });
  }

  getMode() {
    return this.mode;
  }

  orbit(deltaX, deltaY) {
    if (this.controls && this.mode === 'orbit') {
      this.controls.rotateLeft(deltaX * 0.01);
      this.controls.rotateUp(deltaY * 0.01);
    }
  }

  pan(deltaX, deltaY) {
    if (this.controls) {
      this.controls.pan(deltaX, deltaY);
    }
  }

  zoom(delta) {
    if (this.controls) {
      if (delta > 0) {
        this.controls.dollyIn(Math.pow(0.95, delta));
      } else {
        this.controls.dollyOut(Math.pow(0.95, -delta));
      }
      this.controls.update();
    }
  }

  zoomToFit(boundingBox) {
    if (!boundingBox) {
      // Get bounding box of entire scene
      boundingBox = new THREE.Box3();
      this.sceneManager.getScene().traverse((object) => {
        if (object.isMesh) {
          boundingBox.expandByObject(object);
        }
      });
    }

    if (boundingBox.isEmpty()) {
      return;
    }

    const center = new THREE.Vector3();
    boundingBox.getCenter(center);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Add some padding

    const direction = new THREE.Vector3(1, 0.5, 1).normalize();
    this.camera.position.copy(center).add(direction.multiplyScalar(cameraZ));

    if (this.controls) {
      this.controls.target.copy(center);
      this.controls.update();
    }

    this.emit('camera-change', {
      position: this.camera.position.clone(),
      target: center
    });
  }

  zoomToSelection(elements) {
    if (!elements || elements.length === 0) return;

    const boundingBox = new THREE.Box3();
    elements.forEach(mesh => {
      if (mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        const meshBox = mesh.geometry.boundingBox.clone();
        meshBox.applyMatrix4(mesh.matrixWorld);
        boundingBox.union(meshBox);
      }
    });

    this.zoomToFit(boundingBox);
  }

  setTarget(point) {
    if (this.controls) {
      this.controls.target.copy(point);
      this.controls.update();
    }
  }

  getCamera() {
    return {
      position: this.camera.position.clone(),
      target: this.controls ? this.controls.target.clone() : new THREE.Vector3()
    };
  }

  setCamera(position, target) {
    this.camera.position.copy(position);
    const targetVec = target
      ? new THREE.Vector3(target.x, target.y, target.z)
      : new THREE.Vector3();

    if (this.controls && target) {
      this.controls.target.copy(targetVec);
      this.controls.update();
    } else {
      this.camera.lookAt(targetVec);
    }

    this.emit('camera-change', { position, target });
  }

  setOrthographic(enabled) {
    if (enabled === this._isOrthographic) return;
    this._isOrthographic = enabled;

    const currentPos = this.camera.position.clone();
    const target = this.controls ? this.controls.target.clone() : new THREE.Vector3();

    if (enabled) {
      const distance = currentPos.distanceTo(target);
      const domElement = this.sceneManager.getDomElement();
      const aspect = domElement.clientWidth / domElement.clientHeight;
      const fov = this._perspCamera.fov * (Math.PI / 180);
      // Compute frustum height at the orbit target distance
      const frustumHeight = Math.tan(fov / 2) * distance * 2;
      const frustumWidth = frustumHeight * aspect;

      this._orthoCamera = new THREE.OrthographicCamera(
        -frustumWidth / 2,
        frustumWidth / 2,
        frustumHeight / 2,
        -frustumHeight / 2,
        0.01,
        2000,
      );
      this._orthoCamera.position.copy(currentPos);
      this._orthoCamera.lookAt(target);

      this.camera = this._orthoCamera;
      this.controls.object = this._orthoCamera;
      this.controls.update();
      this.sceneManager.setCamera(this._orthoCamera);
    } else {
      this._perspCamera.position.copy(this.camera.position);
      this.camera = this._perspCamera;
      this.controls.object = this._perspCamera;
      this.controls.update();
      this.sceneManager.setCamera(this._perspCamera);
    }

    this.emit('camera-change', {
      position: this.camera.position.clone(),
      target,
    });
  }

  getIsOrthographic() {
    return this._isOrthographic;
  }

  /**
   * Enable or disable all camera input (used when dragging section planes, etc.)
   * Freezes OrbitControls AND the direct-camera look/fly drag handlers so that
   * external systems can own the mouse without the camera moving simultaneously.
   *
   * Important: we save and RESTORE controls.enabled rather than force-setting it
   * to true on re-enable. In look mode (default), enableLook() sets
   * controls.enabled = false as its correct resting state. Force-setting it to
   * true after a section drag would accidentally re-enable OrbitControls in look
   * mode, causing left-drag to produce jank orbit instead of smooth look-around.
   */
  setControlsEnabled(enabled) {
    this._externalDragActive = !enabled;
    if (!enabled) {
      // Cancel any camera drag that may already be in progress
      this.isLookDragging = false;
      this.isFlyDragging = false;
      this.flyDeltaX = 0;
      this.flyDeltaY = 0;
      // Save the current controls.enabled state so we can restore it exactly.
      // (In look mode it is false; in orbit mode it is true.)
      this._controlsEnabledBeforeDrag = this.controls ? this.controls.enabled : false;
      if (this.controls) this.controls.enabled = false;
    } else {
      // Restore to whatever state it was in before the external drag started.
      if (this.controls) {
        this.controls.enabled = this._controlsEnabledBeforeDrag ?? false;
      }
      this._controlsEnabledBeforeDrag = null;
    }
  }

  enableFirstPerson() {
    if (this.firstPersonEnabled) return;

    this.firstPersonEnabled = true;

    if (this.controls) {
      this.controls.enabled = false;
    }

    // Lock pointer
    this.domElement.requestPointerLock();

    // Add event listeners
    document.addEventListener('mousemove', this.boundMouseMove);

    this.prevTime = performance.now();
  }

  disableFirstPerson() {
    if (!this.firstPersonEnabled) return;

    this.firstPersonEnabled = false;

    if (this.controls) {
      this.controls.enabled = true;
    }

    // Unlock pointer
    document.exitPointerLock();

    // Remove event listeners
    document.removeEventListener('mousemove', this.boundMouseMove);
  }

  enableFly() {
    if (!this.domElement) return;
    if (this.controls) this.controls.enabled = false;
    this.isFlyDragging = false;
    this.flyDeltaX = 0;
    this.flyDeltaY = 0;

    this._flyCircle = document.createElement('div');
    this._flyCircle.style.cssText = [
      'position:fixed',
      'width:10px',
      'height:10px',
      'border-radius:50%',
      'background:rgba(0,0,0,0.75)',
      'box-shadow:0 0 0 2px white',
      'pointer-events:none',
      'display:none',
      'transform:translate(-50%,-50%)',
      'z-index:9999',
    ].join(';');
    document.body.appendChild(this._flyCircle);

    this.domElement.addEventListener('mousedown', this.boundFlyMouseDown);
    window.addEventListener('mouseup', this.boundFlyMouseUp);
    window.addEventListener('mousemove', this.boundFlyMouseMove);
    this.domElement.addEventListener('wheel', this.boundFlyWheel, { passive: false });
  }

  disableFly() {
    if (!this.domElement) return;

    if (this._flyCircle) {
      this._flyCircle.remove();
      this._flyCircle = null;
    }

    if (this.controls) this.controls.enabled = true;
    this.isFlyDragging = false;
    this.flyDeltaX = 0;
    this.flyDeltaY = 0;

    this.domElement.removeEventListener('mousedown', this.boundFlyMouseDown);
    window.removeEventListener('mouseup', this.boundFlyMouseUp);
    window.removeEventListener('mousemove', this.boundFlyMouseMove);
    this.domElement.removeEventListener('wheel', this.boundFlyWheel);
  }

  enableOrbit() {
    if (!this.domElement) return;
    this._orbitCircle = document.createElement('div');
    this._orbitCircle.style.cssText = [
      'position:fixed',
      'width:10px',
      'height:10px',
      'border-radius:50%',
      'background:rgba(0,0,0,0.75)',
      'box-shadow:0 0 0 2px white',
      'pointer-events:none',
      'display:none',
      'transform:translate(-50%,-50%)',
      'z-index:9999',
    ].join(';');
    document.body.appendChild(this._orbitCircle);
    this.controls.enableZoom = false; // we handle zoom ourselves
    this.domElement.addEventListener('mousedown', this.boundOrbitMouseDown);
    window.addEventListener('mouseup', this.boundOrbitMouseUp);
    this.domElement.addEventListener('wheel', this.boundOrbitWheel, { passive: false });
  }

  disableOrbit() {
    if (this._orbitCircle) {
      this._orbitCircle.remove();
      this._orbitCircle = null;
    }
    this.isOrbitDragging = false;
    if (!this.domElement) return;
    this.controls.enableZoom = true;
    this.domElement.removeEventListener('mousedown', this.boundOrbitMouseDown);
    window.removeEventListener('mouseup', this.boundOrbitMouseUp);
    this.domElement.removeEventListener('wheel', this.boundOrbitWheel);
  }

  updateOrbitCircle() {
    if (!this._orbitCircle || !this.isOrbitDragging || !this.controls) return;
    const target = this.controls.target.clone();
    target.project(this.camera);
    const rect = this.domElement.getBoundingClientRect();
    const x = rect.left + (target.x *  0.5 + 0.5) * rect.width;
    const y = rect.top  + (-target.y * 0.5 + 0.5) * rect.height;
    this._orbitCircle.style.left = `${x}px`;
    this._orbitCircle.style.top  = `${y}px`;
    this._orbitCircle.style.display = 'block';
  }

  enableLook() {
    if (!this.domElement) return;
    if (this.controls) this.controls.enabled = false;
    this.isLookDragging = false;
    this.domElement.addEventListener('mousedown', this.boundLookMouseDown);
    this.domElement.addEventListener('mousemove', this.boundLookMouseMove);
    window.addEventListener('mouseup', this.boundLookMouseUp);
    this.domElement.addEventListener('wheel', this.boundLookWheel, { passive: false });
  }

  disableLook() {
    if (!this.domElement) return;
    this.domElement.removeEventListener('mousedown', this.boundLookMouseDown);
    this.domElement.removeEventListener('mousemove', this.boundLookMouseMove);
    window.removeEventListener('mouseup', this.boundLookMouseUp);
    this.domElement.removeEventListener('wheel', this.boundLookWheel);
    if (this.controls) this.controls.enabled = true;
    this.isLookDragging = false;
  }

  onLookMouseDown(event) {
    if (event.button !== 0) return;
    if (this._externalDragActive) return;
    this.isLookDragging = true;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;
  }

  onLookMouseUp(event) {
    if (event.button !== 0) return;
    this.isLookDragging = false;
  }

  onLookMouseMove(event) {
    if (!this.isLookDragging) return;

    const deltaX = event.clientX - this.lookLastX;
    const deltaY = event.clientY - this.lookLastY;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;

    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= deltaX * 0.002;
    this.euler.x -= deltaY * 0.002;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);

    this.emit('camera-change', { position: this.camera.position.clone() });
  }

  // ── Shared wheel helpers ────────────────────────────────────────────────────

  /**
   * Returns the 3D scene point under the mouse cursor via raycasting.
   * Falls back to a point along the camera ray at a sensible distance if
   * nothing is hit (sky, empty space, etc.).
   */
  _getRaycastTarget(event) {
    const rect = this.domElement.getBoundingClientRect();
    this._ndcVec.set(
      ((event.clientX - rect.left) / rect.width)  *  2 - 1,
      -((event.clientY - rect.top)  / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(this._ndcVec, this.camera);

    const meshes = [];
    this.sceneManager.getScene().traverse((obj) => {
      if (obj.isMesh && obj.visible) meshes.push(obj);
    });

    const hits = this._raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      // Remember the hit distance so the fallback path stays contextually correct
      // (i.e. proportional to the geometry the camera is actually near).
      this._lastRaycastDist = Math.min(Math.max(hits[0].distance, 2), 150);
      return hits[0].point.clone();
    }

    // Fallback: cursor is pointing at sky / empty space.  Use the last known
    // hit distance rather than a fixed value — this keeps the scroll step
    // proportional to where the camera was a moment ago and prevents teleporting
    // the camera far outside the model when no geometry is under the cursor.
    return this._raycaster.ray.at(this._lastRaycastDist, new THREE.Vector3());
  }

  /**
   * Returns an acceleration multiplier based on the raw wheel deltaY.
   * One typical mouse notch (~100 pixels) gives 1.0×.
   * Faster / larger scrolls grow with a power curve for a natural feel.
   */
  _scrollSpeed(event) {
    let pixels = Math.abs(event.deltaY);
    if (event.deltaMode === 1) pixels *= 16;  // lines → pixels
    if (event.deltaMode === 2) pixels *= 600; // pages → pixels
    const normalized = pixels / 100;          // 1.0 = one mouse notch
    return Math.pow(normalized, 1.5);         // gentle acceleration
  }

  // ── Wheel handlers ───────────────────────────────────────────────────────────

  onLookWheel(event) {
    event.preventDefault();
    const dir = event.deltaY > 0 ? -1 : 1;

    const cursorPt = this._getRaycastTarget(event);
    const toPoint  = cursorPt.clone().sub(this.camera.position);
    const dist     = toPoint.length();
    // Guard against NaN / zero-distance — divideScalar(0) would silently corrupt
    // camera.position and require a home-reset to recover.
    if (!isFinite(dist) || dist < 1e-4) return;
    const moveDir  = toPoint.divideScalar(dist); // normalize in-place

    // MIN_STEP keeps the scroll responsive at any distance.  Without it, the
    // `dist * 0.9` overshoot cap makes the camera asymptotically approach a
    // surface but never pass through — feels frozen when navigating inside
    // BIM models where the user explicitly wants to scroll past walls.
    const MIN_STEP = 0.5;
    const baseStep = Math.max(dist * 0.1, MIN_STEP);
    const speed    = this._scrollSpeed(event);
    const step     = dir > 0
      ? Math.min(baseStep * speed, Math.max(dist * 0.9, MIN_STEP)) // cap, but never below MIN_STEP
      : Math.max(baseStep * speed, MIN_STEP);                       // zoom-out: always make progress

    this.camera.position.addScaledVector(moveDir, dir * step);
    this.emit('camera-change', { position: this.camera.position.clone() });
  }

  onOrbitWheel(event) {
    event.preventDefault();
    const dir = event.deltaY > 0 ? -1 : 1;

    const cursorPt = this._getRaycastTarget(event);
    const toPoint  = cursorPt.clone().sub(this.camera.position);
    const dist     = toPoint.length();
    if (!isFinite(dist) || dist < 1e-4) return;
    const moveDir  = toPoint.divideScalar(dist);

    // Same MIN_STEP floor as look mode — prevents the asymptotic-approach
    // freeze when the camera gets close to an orbit target / interior surface.
    const MIN_STEP = 0.5;
    const baseStep = Math.max(dist * 0.1, MIN_STEP);
    const speed    = this._scrollSpeed(event);
    const step     = dir > 0
      ? Math.min(baseStep * speed, Math.max(dist * 0.9, MIN_STEP))
      : Math.max(baseStep * speed, MIN_STEP);

    const delta = moveDir.multiplyScalar(dir * step);
    this.camera.position.add(delta);
    // Shift the orbit target by the same offset so the orbit radius is preserved
    // and the next left-drag orbits naturally from the new camera position.
    this.controls.target.add(delta);

    this.emit('camera-change', { position: this.camera.position.clone() });
  }

  onFlyMouseDown(event) {
    if (event.button === 0) {
      if (this._externalDragActive) return;
      event.preventDefault();
      this.isFlyDragging = true;
      this.flyOriginX = event.clientX;
      this.flyOriginY = event.clientY;
      this.flyDeltaX = 0;
      this.flyDeltaY = 0;

      if (this._flyCircle) {
        this._flyCircle.style.left = event.clientX + 'px';
        this._flyCircle.style.top = event.clientY + 'px';
        this._flyCircle.style.display = 'block';
      }
    }
  }

  onFlyMouseUp(event) {
    if (event.button !== 0) return;
    this.isFlyDragging = false;
    this.flyDeltaX = 0;
    this.flyDeltaY = 0;

    if (this._flyCircle) {
      this._flyCircle.style.display = 'none';
    }
  }

  onFlyMouseMove(event) {
    if (!this.isFlyDragging) return;
    this.flyDeltaX = event.clientX - this.flyOriginX;
    this.flyDeltaY = event.clientY - this.flyOriginY;
  }

  onFlyWheel(event) {
    event.preventDefault();
    // Scroll away from user = tilt up; toward user = tilt down
    const pitchDelta = event.deltaY > 0 ? -0.01 : 0.01;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x + pitchDelta));
    this.camera.quaternion.setFromEuler(this.euler);
    this.emit('camera-change', { position: this.camera.position.clone() });
  }

  onKeyDown(event) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'KeyE':
        this.keys.up = true;
        break;
      case 'KeyQ':
        this.keys.down = true;
        break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'KeyE':
        this.keys.up = false;
        break;
      case 'KeyQ':
        this.keys.down = false;
        break;
    }
  }

  onMouseMove(event) {
    if (!this.firstPersonEnabled) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    this.euler.setFromQuaternion(this.camera.quaternion);

    this.euler.y -= movementX * 0.002;
    this.euler.x -= movementY * 0.002;

    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));

    this.camera.quaternion.setFromEuler(this.euler);

    this.emit('camera-change', {
      position: this.camera.position.clone(),
      rotation: this.camera.rotation.clone()
    });
  }

  onOrbitMouseDown(event) {
    if (event.button !== 0) return;
    this.isOrbitDragging = true;
  }

  onOrbitMouseUp(event) {
    if (event.button !== 0) return;
    this.isOrbitDragging = false;
    if (this._orbitCircle) this._orbitCircle.style.display = 'none';
  }

  onRightDragDown(event) {
    if (event.button !== 2) return;
    // stopPropagation blocks OrbitControls from starting a pan, but we do NOT call
    // preventDefault here — that would suppress the contextmenu event even on a clean
    // click with no movement. Context menu suppression happens in onRightDragUp only
    // when the drag threshold was actually crossed.
    event.stopPropagation();

    this._rightDragPending = true;
    this._rightDragStartX = event.clientX;
    this._rightDragStartY = event.clientY;
    this._rightDragLastX  = event.clientX;
    this._rightDragLastY  = event.clientY;

    window.addEventListener('pointermove', this.boundRightDragMove);
    window.addEventListener('pointerup',   this.boundRightDragUp);
  }

  /**
   * Called once the pointer has moved past the drag threshold.
   * Sets up orbit target anchoring, origin dot, and cursor feedback.
   */
  _activateRightDrag() {
    this._rightDragPending = false;
    this._rightDragging = true;

    if (this.mode !== 'orbit' && this.controls) {
      // Anchor the orbit target directly in front of the camera so the first
      // camera.lookAt() in _orbitAroundTarget doesn't snap the view.
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const dist = Math.max(this.camera.position.distanceTo(this.controls.target), 5);
      this.controls.target.copy(this.camera.position).addScaledVector(fwd, dist);

      // Create the orbit dot indicator
      this._rightDragDot = document.createElement('div');
      this._rightDragDot.style.cssText = [
        'position:fixed',
        'width:10px',
        'height:10px',
        'border-radius:50%',
        'background:rgba(0,0,0,0.75)',
        'box-shadow:0 0 0 2px white',
        'pointer-events:none',
        'display:none',
        'transform:translate(-50%,-50%)',
        'z-index:9999',
      ].join(';');
      document.body.appendChild(this._rightDragDot);

      // Signal the adapter to switch to the orbit cursor
      this.emit('right-drag-orbit-start', {});
    }
  }

  onRightDragMove(event) {
    // Check threshold while in pending state
    if (this._rightDragPending) {
      const dx = event.clientX - this._rightDragStartX;
      const dy = event.clientY - this._rightDragStartY;
      if (Math.sqrt(dx * dx + dy * dy) > 4) {
        this._activateRightDrag();
      }
    }

    if (!this._rightDragging) return;

    const dx = event.clientX - this._rightDragLastX;
    const dy = event.clientY - this._rightDragLastY;
    this._rightDragLastX = event.clientX;
    this._rightDragLastY = event.clientY;

    if (this.mode === 'orbit') {
      // In orbit: right-drag = look around in place (no camera movement)
      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.y -= dx * 0.002;
      this.euler.x -= dy * 0.002;
      this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    } else {
      // In Default/Fly: right-drag = orbit around the anchored target
      this._orbitAroundTarget(dx, dy);
    }
    this.emit('camera-change', { position: this.camera.position.clone() });
  }

  onRightDragUp(event) {
    if (event.button !== 2) return;

    window.removeEventListener('pointermove', this.boundRightDragMove);
    window.removeEventListener('pointerup',   this.boundRightDragUp);

    if (this._rightDragPending) {
      // Clean right-click with no movement — let the context menu fire naturally.
      this._rightDragPending = false;
      return;
    }

    if (!this._rightDragging) return;
    this._rightDragging = false;

    // Suppress the contextmenu event that browsers fire after right-mouseup.
    // The { once: true } flag auto-removes this listener after it fires once.
    window.addEventListener('contextmenu', (e) => e.preventDefault(), { once: true, capture: true });

    // Remove the orbit dot and restore cursor (only created for non-orbit modes)
    if (this._rightDragDot) {
      this._rightDragDot.remove();
      this._rightDragDot = null;
      this.emit('right-drag-orbit-end', {});
    }

    // Re-anchor the orbit target after look-around so OrbitControls resumes cleanly
    if (this.mode === 'orbit' && this.controls) {
      const dist = Math.max(this.camera.position.distanceTo(this.controls.target), 5);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.controls.target.copy(this.camera.position).addScaledVector(fwd, dist);
    }
  }

  _updateRightDragDot() {
    if (!this._rightDragDot || !this.controls) return;
    // Ensure camera matrices are current before projecting the world-space target
    this.camera.updateMatrixWorld();
    const target = this.controls.target.clone();
    target.project(this.camera);
    const rect = this.domElement.getBoundingClientRect();
    const x = rect.left + (target.x *  0.5 + 0.5) * rect.width;
    const y = rect.top  + (-target.y * 0.5 + 0.5) * rect.height;
    this._rightDragDot.style.left = `${x}px`;
    this._rightDragDot.style.top  = `${y}px`;
    this._rightDragDot.style.display = 'block';
  }

  _orbitAroundTarget(dx, dy) {
    const target = this.controls ? this.controls.target.clone() : new THREE.Vector3();
    const offset = this.camera.position.clone().sub(target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= dx * 0.005;
    spherical.phi   -= dy * 0.005;
    spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
    offset.setFromSpherical(spherical);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
  }

  updateFirstPerson(delta) {
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;
    this.velocity.y -= this.velocity.y * 10.0 * delta;

    this.direction.z = Number(this.keys.forward) - Number(this.keys.backward);
    this.direction.x = Number(this.keys.right) - Number(this.keys.left);
    this.direction.y = Number(this.keys.up) - Number(this.keys.down);
    this.direction.normalize();

    const speed = this.walkSpeed * 10;

    if (this.keys.forward || this.keys.backward) {
      this.velocity.z -= this.direction.z * speed * delta;
    }
    if (this.keys.left || this.keys.right) {
      this.velocity.x -= this.direction.x * speed * delta;
    }
    if (this.keys.up || this.keys.down) {
      this.velocity.y -= this.direction.y * speed * delta;
    }

    // Move camera
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();

    const rightVector = new THREE.Vector3();
    rightVector.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));

    this.camera.position.addScaledVector(cameraDirection, -this.velocity.z * delta);
    this.camera.position.addScaledVector(rightVector, -this.velocity.x * delta);
    this.camera.position.y -= this.velocity.y * delta;
  }

  updateKeyboardMovement(delta) {
    const anyKey = this.keys.forward || this.keys.backward ||
                   this.keys.left    || this.keys.right    ||
                   this.keys.up      || this.keys.down;
    if (!anyKey) return;

    // Full camera-relative directions — movement follows camera orientation
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(this.camera.quaternion);
    const up      = new THREE.Vector3(0, 1,  0).applyQuaternion(this.camera.quaternion);

    const spd = this.keyboardSpeed * delta;
    const move = new THREE.Vector3();

    if (this.keys.forward)  move.addScaledVector(forward,  spd);
    if (this.keys.backward) move.addScaledVector(forward, -spd);
    if (this.keys.right)    move.addScaledVector(right,    spd);
    if (this.keys.left)     move.addScaledVector(right,   -spd);
    if (this.keys.up)       move.addScaledVector(up,       spd);
    if (this.keys.down)     move.addScaledVector(up,      -spd);

    this.camera.position.add(move);

    // Orbit mode: keep the target in sync so OrbitControls doesn't snap back
    if (this.mode === 'orbit' && this.controls) {
      this.controls.target.add(move);
    }

    this.emit('camera-change', { position: this.camera.position.clone() });
  }

  updateFly(delta) {
    if (!this.isFlyDragging) return;

    const dist = Math.sqrt(this.flyDeltaX ** 2 + this.flyDeltaY ** 2);
    const DEAD_ZONE = 10;
    const effective = Math.max(0, dist - DEAD_ZONE);
    if (effective === 0) return;

    const speed = effective * this.flySpeed * delta * 0.016;

    // Normalized direction components — both derived from total effective distance
    const dirForward = -this.flyDeltaY / dist; // screen up = forward
    const dirRotate  =  this.flyDeltaX / dist; // screen right = rotate right

    // Rotate around world Y axis first (yaw only, always level regardless of pitch)
    const yawAmount = dirRotate * effective * this.flySpeed * delta * 0.0002;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= yawAmount;
    this.camera.quaternion.setFromEuler(this.euler);

    // Move forward/backward along the updated facing direction, projected onto XZ
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() > 0.0001) forward.normalize();
    this.camera.position.addScaledVector(forward, dirForward * speed);

    this.emit('camera-change', { position: this.camera.position.clone() });
  }

  setWalkSpeed(speed) {
    this.walkSpeed = speed;
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
    this.disableFirstPerson();
    this.disableFly();
    this.disableLook();
    this.disableOrbit();

    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('blur', this.boundWindowBlur);
    window.removeEventListener('pointermove', this.boundRightDragMove);
    window.removeEventListener('pointerup',   this.boundRightDragUp);
    this._rightDragPending = false;
    this._rightDragging = false;
    if (this._rightDragDot) { this._rightDragDot.remove(); this._rightDragDot = null; }
    if (this.domElement) {
      this.domElement.removeEventListener('pointerdown', this.boundRightDragDown, { capture: true });
    }

    if (this.domElement && this._boundLookMouseDown) {
      this.domElement.removeEventListener('mousedown', this._boundLookMouseDown);
      this.domElement.removeEventListener('mousedown', this._boundOrbitMouseDown);
      window.removeEventListener('mousemove', this._boundLookMouseMove);
      window.removeEventListener('mouseup', this._boundLookMouseUp);
    }

    if (this.controls) {
      this.controls.dispose();
    }

    this.eventListeners.clear();
  }
}
