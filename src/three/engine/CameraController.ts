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
 * True (orthographic) zoom, not a dolly: the camera position is set once
 * and never moves — scroll only ever changes `camera.zoom`, which
 * rescales the view frustum (see OrthographicCamera.updateProjectionMatrix
 * — verified directly against the installed three.js source: it divides
 * the frustum by `zoom`, no repositioning involved). That's also what
 * keeps the flat, no-perspective-foreshortening look intact at every
 * zoom level, rather than only at one particular distance.
 */
export class CameraController {
  private readonly camera: THREE.OrthographicCamera;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly damping: number;
  private readonly zoomSpeed: number;
  private zoom: number;
  private targetZoom: number;
  private element: HTMLElement | null = null;

  constructor(camera: THREE.OrthographicCamera, options: CameraControllerOptions) {
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
  }

  detach(element: HTMLElement) {
    element.removeEventListener("wheel", this.handleWheel);
    if (this.element === element) this.element = null;
  }

  private handleWheel = (event: WheelEvent) => {
    // Scroll is fully repurposed as the zoom control, so the page itself
    // must never scroll underneath it.
    event.preventDefault();
    // Exponential, not linear: each wheel tick multiplies the zoom by a
    // constant ratio, so the control feels equally responsive whether
    // zoomed in or out (a fixed additive step would feel huge at low
    // zoom and negligible at high zoom).
    const factor = Math.exp(-event.deltaY * this.zoomSpeed);
    this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * factor, this.minZoom, this.maxZoom);
  };

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
