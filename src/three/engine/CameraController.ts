import * as THREE from "three";

export interface CameraControllerOptions {
  minDistance: number;
  maxDistance: number;
  initialDistance: number;
  lookAt: THREE.Vector3;
  direction: THREE.Vector3;
  /** Damping factor applied per-frame at 60fps; frame-rate independent. */
  damping: number;
  zoomSpeed: number;
}

/**
 * Scroll-driven dolly zoom. The camera always looks at a fixed target and
 * sits at `distance` along a fixed unit `direction` from it — scrolling
 * only changes that distance, smoothed with damping. Because this is a
 * genuine perspective dolly, near and far objects parallax against each
 * other automatically; there's no separate "layers" system to fake it.
 */
export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly lookAtTarget: THREE.Vector3;
  private readonly direction: THREE.Vector3;
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly damping: number;
  private readonly zoomSpeed: number;
  private distance: number;
  private targetDistance: number;
  private element: HTMLElement | null = null;

  constructor(camera: THREE.PerspectiveCamera, options: CameraControllerOptions) {
    this.camera = camera;
    this.lookAtTarget = options.lookAt.clone();
    this.direction = options.direction.clone().normalize();
    this.minDistance = options.minDistance;
    this.maxDistance = options.maxDistance;
    this.damping = options.damping;
    this.zoomSpeed = options.zoomSpeed;
    this.distance = options.initialDistance;
    this.targetDistance = options.initialDistance;
    this.applyPosition();
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
    const next = this.targetDistance + event.deltaY * this.zoomSpeed;
    this.targetDistance = THREE.MathUtils.clamp(next, this.minDistance, this.maxDistance);
  };

  /** Advance the damped distance toward its target. `delta` in seconds. */
  update(delta: number) {
    const lerpFactor = 1 - Math.pow(1 - this.damping, delta * 60);
    this.distance = THREE.MathUtils.lerp(this.distance, this.targetDistance, lerpFactor);
    this.applyPosition();
  }

  private applyPosition() {
    this.camera.position
      .copy(this.lookAtTarget)
      .addScaledVector(this.direction, this.distance);
    this.camera.lookAt(this.lookAtTarget);
  }

  /** 0 = fully zoomed out, 1 = fully zoomed in — for the minimap indicator. */
  get normalizedZoom(): number {
    const t = (this.distance - this.minDistance) / (this.maxDistance - this.minDistance);
    return 1 - THREE.MathUtils.clamp(t, 0, 1);
  }
}
