import * as THREE from "three";

import { createCentralBuilding } from "../objects/createCentralBuilding";
import { createGround } from "../objects/createGround";
import { createPanelMesh } from "../objects/createPanel";
import { placeholderRowLayout } from "../placeholders/layout";
import { MOCK_PANELS, SIGNATURE_PANEL } from "../placeholders/mockPanels";
import { sizeFromAmount } from "../placeholders/sizing";
import { CameraController } from "./CameraController";
import * as C from "./constants";
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

    // Panels are fixed flat planes, not camera-tracking billboards (that
    // behavior is reserved for characters/birds per spec) — they all
    // face +Z, the camera's general approach direction. Note this is
    // deliberately *not* `mesh.lookAt(origin)`: for panels spread wide,
    // facing the scene origin points them edge-on to the camera instead
    // of toward it, since "toward the origin" and "toward the camera"
    // diverge sharply once a panel sits far enough to either side.
    const panelsGroup = new THREE.Group();
    panelsGroup.name = "panels";
    const widths = MOCK_PANELS.map((panel) => (panel.size ?? sizeFromAmount(panel.amount)).width);
    const positions = placeholderRowLayout(widths);
    MOCK_PANELS.forEach((panel, i) => {
      const mesh = createPanelMesh(panel);
      const pos = positions[i];
      mesh.position.set(pos.x, mesh.geometry.parameters.height / 2, pos.z);
      panelsGroup.add(mesh);
    });
    this.scene.add(panelsGroup);

    // Fixed, non-purchasable, excentered — outside the placement algorithm.
    // x=-15 clears the mock row above (~±11 wide) with room to spare. A
    // modest yaw (not the ~36° first tried) keeps it near-legible instead
    // of edge-on to the camera's fixed viewing direction.
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

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) {
          material.forEach(disposeMaterial);
        } else {
          disposeMaterial(material);
        }
      }
    });

    this.postProcessing.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

function disposeMaterial(material: THREE.Material) {
  const map = (material as THREE.MeshBasicMaterial).map;
  map?.dispose();
  material.dispose();
}
