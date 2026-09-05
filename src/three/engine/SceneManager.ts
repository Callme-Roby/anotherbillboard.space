import * as THREE from "three";

import { createCentralBuilding } from "../objects/createCentralBuilding";
import { createGround } from "../objects/createGround";
import { createGroundBillboard } from "../objects/createGroundBillboard";
import { createPanelMesh } from "../objects/createPanel";
import { SIGNATURE_PANEL } from "../placeholders/mockPanels";
import { type BirdCall, createBirdCall } from "./birdCall";
import { Birds } from "./Birds";
import { CameraController } from "./CameraController";
import * as C from "./constants";
import { disposeObject3D } from "./disposeObject3D";
import { LivePanels } from "./LivePanels";
import { createPostProcessing, type PostProcessingHandle } from "./PostProcessing";
import { sceneEvents, VIEW_CHANGE_EVENT, type ViewChangeDetail } from "./sceneEvents";

export interface SceneManagerOptions {
  container: HTMLElement;
}

/**
 * Orchestrates the single Three.js engine driving the whole scene:
 * renderer, scene graph, the scroll/pinch-zoom + drag-pan camera, and the
 * global CRT post-processing pass. One instance per mounted
 * `<SceneCanvas />`.
 */
export class SceneManager {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly cameraController: CameraController;
  private readonly postProcessing: PostProcessingHandle;
  private readonly timer: THREE.Timer;
  private readonly resizeObserver: ResizeObserver;
  private readonly livePanels: LivePanels;
  private readonly birds: Birds;
  private readonly birdCall: BirdCall;
  /** Advances the central building's rotating summit — set in buildScene(). */
  private updateCentralBuilding: (delta: number) => void = () => {};

  private rafId: number | null = null;
  private disposed = false;
  private lastEmittedZoom = -1;
  private lastEmittedPanX = 0;
  private lastEmittedPanY = 0;

  constructor({ container }: SceneManagerOptions) {
    this.container = container;
    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.BACKGROUND_COLOR);

    const { width, height } = this.getSize();

    this.camera = new THREE.PerspectiveCamera(C.CAMERA_FOV, width / height, C.CAMERA_NEAR, C.CAMERA_FAR);
    const fixedPosition = C.CAMERA_LOOK_AT.clone().addScaledVector(C.CAMERA_DIRECTION, C.CAMERA_FIXED_DISTANCE);
    this.cameraController = new CameraController(this.camera, {
      position: fixedPosition,
      lookAt: C.CAMERA_LOOK_AT,
      minZoom: C.CAMERA_MIN_ZOOM,
      absoluteMinZoom: C.CAMERA_ABSOLUTE_MIN_ZOOM,
      maxZoom: C.CAMERA_MAX_ZOOM,
      initialZoom: C.CAMERA_INITIAL_ZOOM,
      damping: C.CAMERA_DAMPING,
      zoomSpeed: C.CAMERA_ZOOM_SPEED,
      overviewHalfWidth: C.CAMERA_OVERVIEW_HALF_WIDTH,
      overviewContentZ: C.CAMERA_OVERVIEW_CONTENT_Z,
      panBounds: C.CAMERA_PAN_BOUNDS,
    });
    this.cameraController.attach(container);

    // Aliasing is deliberately left off: the low-res + NEAREST upscale in
    // the CRT pass is what should define the scene's edges, not MSAA.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, true);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.buildScene();

    // The flock and its call are separate concerns wired together here,
    // so the flock stays silent (and testable) on its own.
    this.birdCall = createBirdCall();
    this.birds = new Birds({ onEnterView: () => this.birdCall.play() });
    this.scene.add(this.birds.group);

    this.livePanels = new LivePanels();
    this.scene.add(this.livePanels.group);
    this.postProcessing = createPostProcessing(this.renderer, this.scene, this.camera, width, height);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.animate();
  }

  private getSize() {
    return {
      width: this.container.clientWidth || window.innerWidth,
      height: this.container.clientHeight || window.innerHeight,
    };
  }

  private buildScene() {
    this.scene.add(createGround());

    const centralBuilding = createCentralBuilding();
    this.scene.add(centralBuilding.group);
    this.updateCentralBuilding = centralBuilding.update;

    // Fixed, non-purchasable, excentered — outside the placement algorithm.
    // x=-15 clears the mock/live panel row (~±11 wide, see LivePanels)
    // with room to spare. Flat, facing +Z like every other panel — an
    // angled yaw was tried and dropped (see git history): legibility
    // matters more here than a decorative angle. Position shared with
    // CAMERA_OVERVIEW_* in constants.ts, which needs this depth to size
    // the mobile zoom-out floor correctly — keep them in sync. On its own
    // stand like every other ground panel (createGroundBillboard), not
    // resting flush on the ground.
    const signature = createGroundBillboard(createPanelMesh(SIGNATURE_PANEL), {
      seed: SIGNATURE_PANEL.id,
      accent: SIGNATURE_PANEL.color,
    });
    signature.position.set(C.SIGNATURE_PANEL_X, 0, C.SIGNATURE_PANEL_Z);
    this.scene.add(signature);
  }

  private handleResize = () => {
    const { width, height } = this.getSize();
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Aspect ratio feeds the zoom-out floor (fit CAMERA_OVERVIEW_HALF_WIDTH
    // on any viewport, not just the desktop-tuned CAMERA_MIN_ZOOM) — must
    // be recomputed whenever aspect changes, e.g. a phone rotating.
    this.cameraController.handleResize();

    this.renderer.setSize(width, height, true);
    this.postProcessing.setSize(width, height);
  };

  private animate = () => {
    if (this.disposed) return;

    this.timer.update();
    const delta = this.timer.getDelta();
    this.cameraController.update(delta);
    this.updateCentralBuilding(delta);
    // After the camera: the flock's "is it on screen yet" test projects
    // through the live camera, so it must see this frame's zoom/pan.
    this.birds.update(delta, this.camera);
    this.emitViewChangeIfNeeded();
    this.postProcessing.render(this.timer.getElapsed(), this.cameraController.currentZoom);

    this.rafId = requestAnimationFrame(this.animate);
  };

  private emitViewChangeIfNeeded() {
    const normalized = this.cameraController.normalizedZoom;
    const pan = this.cameraController.normalizedPan;
    const changed =
      Math.abs(normalized - this.lastEmittedZoom) > 0.0005 ||
      Math.abs(pan.x - this.lastEmittedPanX) > 0.0005 ||
      Math.abs(pan.y - this.lastEmittedPanY) > 0.0005;
    if (!changed) return;

    this.lastEmittedZoom = normalized;
    this.lastEmittedPanX = pan.x;
    this.lastEmittedPanY = pan.y;
    sceneEvents.dispatchEvent(
      new CustomEvent<ViewChangeDetail>(VIEW_CHANGE_EVENT, { detail: { normalized, pan } }),
    );
  }

  /** Tear down the renderer, GPU resources, and all listeners. */
  dispose() {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.timer.disconnect();
    this.resizeObserver.disconnect();
    this.cameraController.detach(this.container);
    this.livePanels.dispose(); // also disconnects the realtime subscription
    this.birds.dispose();
    this.birdCall.dispose(); // closes the AudioContext and drops its unlock listeners

    // Covers everything still in the scene, including anything
    // livePanels.dispose() already handled above — redundant disposal
    // calls on the same geometry/material are safe no-ops in three.js.
    disposeObject3D(this.scene);

    this.postProcessing.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
