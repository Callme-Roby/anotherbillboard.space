import * as THREE from "three";

import { createCentralBuilding } from "../objects/createCentralBuilding";
import { createGround } from "../objects/createGround";
import { createPanelMesh } from "../objects/createPanel";
import { SIGNATURE_PANEL } from "../placeholders/mockPanels";
import { CameraController } from "./CameraController";
import * as C from "./constants";
import { disposeObject3D } from "./disposeObject3D";
import { LivePanels } from "./LivePanels";
import { createPostProcessing, type PostProcessingHandle } from "./PostProcessing";
import { sceneEvents, ZOOM_CHANGE_EVENT, type ZoomChangeDetail } from "./sceneEvents";

export interface SceneManagerOptions {
  container: HTMLElement;
}

/**
 * Orchestrates the single Three.js engine driving the whole scene:
 * renderer, scene graph, scroll-zoom camera, and the global CRT
 * post-processing pass. One instance per mounted `<SceneCanvas />`.
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

  private rafId: number | null = null;
  private disposed = false;
  private lastEmittedZoom = -1;

  constructor({ container }: SceneManagerOptions) {
    this.container = container;
    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.BACKGROUND_COLOR);

    const { width, height } = this.getSize();

    this.camera = new THREE.PerspectiveCamera(C.CAMERA_FOV, width / height, C.CAMERA_NEAR, C.CAMERA_FAR);
    this.cameraController = new CameraController(this.camera, {
      minDistance: C.CAMERA_MIN_DISTANCE,
      maxDistance: C.CAMERA_MAX_DISTANCE,
      initialDistance: C.CAMERA_INITIAL_DISTANCE,
      lookAt: C.CAMERA_LOOK_AT,
      direction: C.CAMERA_DIRECTION,
      damping: C.CAMERA_DAMPING,
      zoomSpeed: C.CAMERA_ZOOM_SPEED,
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
    this.scene.add(createCentralBuilding());

    // Fixed, non-purchasable, excentered — outside the placement algorithm.
    // x=-15 clears the mock/live panel row (~±11 wide, see LivePanels)
    // with room to spare. A modest yaw (not the ~36° first tried) keeps
    // it near-legible instead of edge-on to the camera's fixed viewing
    // direction.
    const signature = createPanelMesh(SIGNATURE_PANEL);
    signature.position.set(-15, signature.geometry.parameters.height / 2 + 0.4, 8);
    signature.rotation.y = Math.PI / 16;
    this.scene.add(signature);
  }

  private handleResize = () => {
    const { width, height } = this.getSize();
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);
    this.postProcessing.setSize(width, height);
  };

  private animate = () => {
    if (this.disposed) return;

    this.timer.update();
    const delta = this.timer.getDelta();
    this.cameraController.update(delta);
    this.emitZoomIfChanged();
    this.postProcessing.render();

    this.rafId = requestAnimationFrame(this.animate);
  };

  private emitZoomIfChanged() {
    const normalized = this.cameraController.normalizedZoom;
    if (Math.abs(normalized - this.lastEmittedZoom) > 0.0005) {
      this.lastEmittedZoom = normalized;
      sceneEvents.dispatchEvent(
        new CustomEvent<ZoomChangeDetail>(ZOOM_CHANGE_EVENT, { detail: { normalized } }),
      );
    }
  }

  /** Tear down the renderer, GPU resources, and all listeners. */
  dispose() {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.timer.disconnect();
    this.resizeObserver.disconnect();
    this.cameraController.detach(this.container);
    this.livePanels.dispose(); // also disconnects the realtime subscription

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
