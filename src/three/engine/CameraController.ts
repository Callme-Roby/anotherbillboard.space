import * as THREE from "three";

export interface CameraControllerOptions {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  minZoom: number;
  /** Hard floor under the aspect-driven bound in computeAspectMinZoom(). */
  absoluteMinZoom: number;
  maxZoom: number;
  initialZoom: number;
  /** Damping factor applied per-frame at 60fps; frame-rate independent. */
  damping: number;
  zoomSpeed: number;
  /** World half-width (x) that must stay visible at max zoom-out, on any aspect ratio. */
  overviewHalfWidth: number;
  /**
   * The world z-depth `overviewHalfWidth` is measured at — must be a real
   * depth of content that needs to stay visible (e.g. the closest-to-
   * camera element in the "always visible at max zoom-out" set), *not*
   * the lookAt/distance reference plane: perspective makes closer content
   * project wider per world-unit, so solving the fit at the wrong depth
   * silently under-zooms-out (see computeAspectMinZoom).
   */
  overviewContentZ: number;
  /** How far drag-to-pan may move the view center from `lookAt`, per axis. */
  panBounds: { x: number; y: number };
}

/**
 * A real zoom-lens effect, not a dolly, plus drag-to-pan: `position` and
 * `lookAt` define a fixed *base* rig that never itself moves — scroll
 * (desktop) or pinch (touch) only ever change `camera.zoom`, which on a
 * PerspectiveCamera rescales the frustum via
 * `tan(effectiveFov/2) = tan(baseFov/2) / zoom` (verified directly
 * against the installed three.js source — not a plain `fov / zoom`
 * angle division; the two only agree at zoom=1, a distinction that
 * mattered enough to cause real bugs here, see visibleHeightAtZoom and
 * computeAspectMinZoom below) — mathematically the same image as
 * narrowing the FOV at that same fixed position. Dragging
 * (mouse, or one finger on touch — two fingers is reserved for pinch)
 * instead offsets that whole rig sideways/vertically by the same amount
 * on both `position` and `lookAt`, so the camera's facing direction never
 * changes — a truck/pedestal move, not an orbit — keeping the scene's
 * level, head-on framing at any pan position. The offset is clamped to
 * `panBounds` so panning explores the scene rather than drifting off into
 * empty space.
 */
export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly basePosition: THREE.Vector3;
  private readonly baseLookAt: THREE.Vector3;
  private readonly distance: number;
  /** Distance from the (fixed) camera to overviewContentZ's depth — see computeAspectMinZoom. */
  private readonly overviewDistance: number;
  private readonly baseFovRad: number;
  private readonly minZoomDesktop: number;
  private readonly absoluteMinZoom: number;
  private readonly maxZoom: number;
  private readonly damping: number;
  private readonly zoomSpeed: number;
  private readonly overviewHalfWidth: number;
  private readonly panBounds: { x: number; y: number };

  private zoom: number;
  private targetZoom: number;
  private effectiveMinZoom: number;
  private readonly panOffset = new THREE.Vector2(0, 0);
  private readonly scratchLookAt = new THREE.Vector3();

  private element: HTMLElement | null = null;
  private lastPinchDistance: number | null = null;
  private isPanningTouch = false;
  private isDragging = false;
  private readonly lastPointer = new THREE.Vector2();

  constructor(camera: THREE.PerspectiveCamera, options: CameraControllerOptions) {
    this.camera = camera;
    this.basePosition = options.position.clone();
    this.baseLookAt = options.lookAt.clone();
    this.distance = this.basePosition.distanceTo(this.baseLookAt);
    // Camera looks straight along -z (no tilt — see CAMERA_DIRECTION),
    // so the distance to any z-plane is exactly this subtraction, not an
    // approximation.
    this.overviewDistance = this.basePosition.z - options.overviewContentZ;
    this.baseFovRad = THREE.MathUtils.degToRad(camera.fov);
    this.minZoomDesktop = options.minZoom;
    this.absoluteMinZoom = options.absoluteMinZoom;
    this.maxZoom = options.maxZoom;
    this.damping = options.damping;
    this.zoomSpeed = options.zoomSpeed;
    this.overviewHalfWidth = options.overviewHalfWidth;
    this.panBounds = options.panBounds;
    this.zoom = options.initialZoom;
    this.targetZoom = options.initialZoom;
    this.effectiveMinZoom = this.minZoomDesktop;

    this.updateEffectiveMinZoom();
    this.applyZoom();
    this.applyPan();
  }

  attach(element: HTMLElement) {
    this.element = element;
    element.addEventListener("wheel", this.handleWheel, { passive: false });
    element.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    element.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    element.addEventListener("touchend", this.handleTouchEnd);
    element.addEventListener("touchcancel", this.handleTouchEnd);
    element.addEventListener("mousedown", this.handleMouseDown);
    // mousemove/mouseup live on window, not the element: once a drag
    // starts it must keep tracking even if the cursor leaves the canvas
    // (fast drags, or releasing over another element) — an
    // element-scoped listener would silently stop updating and leave
    // isDragging stuck true.
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("blur", this.handleWindowBlur);
  }

  detach(element: HTMLElement) {
    element.removeEventListener("wheel", this.handleWheel);
    element.removeEventListener("touchstart", this.handleTouchStart);
    element.removeEventListener("touchmove", this.handleTouchMove);
    element.removeEventListener("touchend", this.handleTouchEnd);
    element.removeEventListener("touchcancel", this.handleTouchEnd);
    element.removeEventListener("mousedown", this.handleMouseDown);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    if (this.element === element) this.element = null;
  }

  /** Call after `camera.aspect` changes (see SceneManager.handleResize). */
  handleResize() {
    this.updateEffectiveMinZoom();
    // Re-clamp: a viewport that just became narrower (e.g. rotating from
    // landscape to portrait) may need to zoom out further than the
    // current target to keep showing overviewHalfWidth.
    this.targetZoom = THREE.MathUtils.clamp(this.targetZoom, this.effectiveMinZoom, this.maxZoom);
  }

  private handleWheel = (event: WheelEvent) => {
    // Scroll is fully repurposed as the zoom control, so the page itself
    // must never scroll underneath it.
    event.preventDefault();
    this.stepZoom(Math.exp(-event.deltaY * this.zoomSpeed));
  };

  // Pinch is the touch equivalent of the wheel: two fingers moving apart
  // zooms in, moving together zooms out, same as the wheel path. One
  // finger instead drags/pans — see handleTouchMove.
  private handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 0 || event.touches.length > 2) return;
    event.preventDefault();

    if (event.touches.length === 2) {
      this.isPanningTouch = false;
      this.lastPinchDistance = pinchDistance(event.touches);
    } else {
      this.isPanningTouch = true;
      this.lastPinchDistance = null;
      this.lastPointer.set(event.touches[0].clientX, event.touches[0].clientY);
    }
  };

  private handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 0 || event.touches.length > 2) return;
    event.preventDefault();

    if (event.touches.length === 2) {
      const distance = pinchDistance(event.touches);
      if (this.lastPinchDistance !== null && this.lastPinchDistance > 0) {
        this.stepZoom(distance / this.lastPinchDistance);
      }
      this.lastPinchDistance = distance;
      this.isPanningTouch = false;
    } else if (this.isPanningTouch) {
      const touch = event.touches[0];
      this.applyDragDelta(touch.clientX - this.lastPointer.x, touch.clientY - this.lastPointer.y);
      this.lastPointer.set(touch.clientX, touch.clientY);
    }
  };

  private handleTouchEnd = (event: TouchEvent) => {
    if (event.touches.length === 0) {
      this.lastPinchDistance = null;
      this.isPanningTouch = false;
    } else if (event.touches.length === 1) {
      // Dropped from two fingers to one: stop pinching and resume
      // panning from the remaining finger's *current* position, not its
      // old one, so the view doesn't jump.
      this.lastPinchDistance = null;
      this.isPanningTouch = true;
      this.lastPointer.set(event.touches[0].clientX, event.touches[0].clientY);
    }
  };

  private handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return; // left button (or touch-emulated) only
    event.preventDefault();
    this.isDragging = true;
    this.lastPointer.set(event.clientX, event.clientY);
  };

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.isDragging) return;
    this.applyDragDelta(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y);
    this.lastPointer.set(event.clientX, event.clientY);
  };

  private handleMouseUp = () => {
    this.isDragging = false;
  };

  // Defensive: if the browser window itself loses focus mid-drag (e.g.
  // the mouse is released over devtools or another app, which can eat
  // the mouseup), don't leave isDragging stuck true.
  private handleWindowBlur = () => {
    this.isDragging = false;
  };

  /**
   * Direct 1:1 manipulation, not damped like zoom — a drag should feel
   * glued to the pointer, not ease toward it. `dxPx`/`dyPx` are screen
   * pixels; converted to world units at the current zoom level so a
   * given finger/mouse movement covers the same *visual* distance
   * whether zoomed in or out.
   */
  private applyDragDelta(dxPx: number, dyPx: number) {
    const worldPerPixel = this.computeWorldPerPixel();
    this.panOffset.x = THREE.MathUtils.clamp(
      this.panOffset.x - dxPx * worldPerPixel,
      -this.panBounds.x,
      this.panBounds.x,
    );
    this.panOffset.y = THREE.MathUtils.clamp(
      this.panOffset.y + dyPx * worldPerPixel,
      -this.panBounds.y,
      this.panBounds.y,
    );
  }

  /**
   * Visible world height at the content plane, for the current (damped)
   * zoom — mirrors three.js's own projection math exactly (verified
   * directly against PerspectiveCamera.updateProjectionMatrix): it scales
   * `tan(baseFov/2)` by `1/zoom`, *not* the angle itself by `1/zoom` —
   * those two only agree at zoom=1, which made the same mistake here
   * easy to miss (drag felt right at the default zoom, wrong everywhere
   * else) before checking it against the source.
   */
  private visibleHeightAtZoom(zoom: number): number {
    return (2 * this.distance * Math.tan(this.baseFovRad / 2)) / zoom;
  }

  private computeWorldPerPixel(): number {
    const screenHeight = this.element?.clientHeight || 1;
    return this.visibleHeightAtZoom(this.zoom) / screenHeight;
  }

  /**
   * The zoom level at which the horizontal frustum exactly covers
   * `overviewHalfWidth` *at overviewContentZ's depth* for the camera's
   * *current* aspect ratio — a narrower (more portrait) aspect needs a
   * smaller zoom (more zoomed-out) than a wider one to fit the same
   * world width, since horizontal FOV = vertical FOV * aspect. Solves
   * `visibleHeightAtZoom(zoom) * aspect / 2 = overviewHalfWidth` for zoom,
   * substituting overviewDistance for `distance` in that formula (see its
   * doc comment) since this is specifically about content that isn't
   * sitting at the lookAt plane.
   */
  private computeAspectMinZoom(): number {
    const aspect = this.camera.aspect;
    if (!Number.isFinite(aspect) || aspect <= 0) return this.minZoomDesktop;

    const halfHeightNeeded = this.overviewHalfWidth / aspect;
    const computed = (this.overviewDistance * Math.tan(this.baseFovRad / 2)) / halfHeightNeeded;
    return Number.isFinite(computed) && computed > 0 ? computed : this.minZoomDesktop;
  }

  private updateEffectiveMinZoom() {
    this.effectiveMinZoom = Math.max(
      this.absoluteMinZoom,
      Math.min(this.minZoomDesktop, this.computeAspectMinZoom()),
    );
  }

  /** Multiplicative, not additive: a fixed step feels huge zoomed in and negligible zoomed out. */
  private stepZoom(factor: number) {
    this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * factor, this.effectiveMinZoom, this.maxZoom);
  }

  /** Advance the damped zoom toward its target. `delta` in seconds. */
  update(delta: number) {
    const lerpFactor = 1 - Math.pow(1 - this.damping, delta * 60);
    this.zoom = THREE.MathUtils.lerp(this.zoom, this.targetZoom, lerpFactor);
    this.applyZoom();
    this.applyPan();
  }

  private applyZoom() {
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  private applyPan() {
    this.camera.position.set(
      this.basePosition.x + this.panOffset.x,
      this.basePosition.y + this.panOffset.y,
      this.basePosition.z,
    );
    this.scratchLookAt.set(
      this.baseLookAt.x + this.panOffset.x,
      this.baseLookAt.y + this.panOffset.y,
      this.baseLookAt.z,
    );
    this.camera.lookAt(this.scratchLookAt);
  }

  /** Raw (damped) `camera.zoom` value — for PostProcessing's zoom-compensated internal resolution. */
  get currentZoom(): number {
    return this.zoom;
  }

  /** 0 = fully zoomed out, 1 = fully zoomed in — for the minimap indicator's size. */
  get normalizedZoom(): number {
    const t = (this.zoom - this.effectiveMinZoom) / (this.maxZoom - this.effectiveMinZoom);
    return THREE.MathUtils.clamp(t, 0, 1);
  }

  /** Current pan offset, each axis normalized to [-1, 1] — for the minimap indicator's position. */
  get normalizedPan(): { x: number; y: number } {
    return {
      x: THREE.MathUtils.clamp(this.panOffset.x / this.panBounds.x, -1, 1),
      y: THREE.MathUtils.clamp(this.panOffset.y / this.panBounds.y, -1, 1),
    };
  }
}

function pinchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}
