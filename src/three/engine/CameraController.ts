import * as THREE from "three";

export interface CameraControllerOptions {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  minZoom: number;
  maxZoom: number;
  initialZoom: number;
  /** Damping factor applied per-frame at 60fps; frame-rate independent. */
  damping: number;
  zoomSpeed: number;
}

/**
 * A real zoom-lens effect, not a dolly: the camera position is set once
 * and never moves — scroll (desktop) or pinch (touch) only ever change
 * `camera.zoom`, which on a PerspectiveCamera rescales the frustum from
 * `fov / zoom` (verified directly against the installed three.js
 * source) — mathematically the same image as narrowing the FOV at that
 * same fixed position. Distinct from a dolly (which changes perspective/
 * parallax as distance changes) and from a pure orthographic zoom (which
 * has no perspective at all): this keeps real depth cues at every zoom
 * level, on every input device.
 */
export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly damping: number;
  private readonly zoomSpeed: number;
  private zoom: number;
  private targetZoom: number;
  private element: HTMLElement | null = null;
  private lastPinchDistance: number | null = null;

  constructor(camera: THREE.PerspectiveCamera, options: CameraControllerOptions) {
    this.camera = camera;
    this.minZoom = options.minZoom;
    this.maxZoom = options.maxZoom;
    this.damping = options.damping;
    this.zoomSpeed = options.zoomSpeed;
    this.zoom = options.initialZoom;
    this.targetZoom = options.initialZoom;

    this.camera.position.copy(options.position);
    this.camera.lookAt(options.lookAt);
    this.applyZoom();
  }

  attach(element: HTMLElement) {
    this.element = element;
    element.addEventListener("wheel", this.handleWheel, { passive: false });
    element.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    element.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    element.addEventListener("touchend", this.handleTouchEnd);
    element.addEventListener("touchcancel", this.handleTouchEnd);
  }

  detach(element: HTMLElement) {
    element.removeEventListener("wheel", this.handleWheel);
    element.removeEventListener("touchstart", this.handleTouchStart);
    element.removeEventListener("touchmove", this.handleTouchMove);
    element.removeEventListener("touchend", this.handleTouchEnd);
    element.removeEventListener("touchcancel", this.handleTouchEnd);
    if (this.element === element) this.element = null;
  }

  private handleWheel = (event: WheelEvent) => {
    // Scroll is fully repurposed as the zoom control, so the page itself
    // must never scroll underneath it.
    event.preventDefault();
    this.stepZoom(Math.exp(-event.deltaY * this.zoomSpeed));
  };

  // Pinch is the touch equivalent of the wheel: two fingers moving apart
  // zooms in, moving together zooms out, camera position untouched
  // exactly like the wheel path. A single finger does nothing here (no
  // pan/drag exists on desktop either, so touch shouldn't add one).
  private handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    this.lastPinchDistance = pinchDistance(event.touches);
  };

  private handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();

    const distance = pinchDistance(event.touches);
    if (this.lastPinchDistance !== null && this.lastPinchDistance > 0) {
      this.stepZoom(distance / this.lastPinchDistance);
    }
    this.lastPinchDistance = distance;
  };

  private handleTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) this.lastPinchDistance = null;
  };

  /** Multiplicative, not additive: a fixed step feels huge zoomed in and negligible zoomed out. */
  private stepZoom(factor: number) {
    this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * factor, this.minZoom, this.maxZoom);
  }

  /** Advance the damped zoom toward its target. `delta` in seconds. */
  update(delta: number) {
    const lerpFactor = 1 - Math.pow(1 - this.damping, delta * 60);
    this.zoom = THREE.MathUtils.lerp(this.zoom, this.targetZoom, lerpFactor);
    this.applyZoom();
  }

  private applyZoom() {
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  /** 0 = fully zoomed out, 1 = fully zoomed in — for the minimap indicator. */
  get normalizedZoom(): number {
    const t = (this.zoom - this.minZoom) / (this.maxZoom - this.minZoom);
    return THREE.MathUtils.clamp(t, 0, 1);
  }
}

function pinchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}
