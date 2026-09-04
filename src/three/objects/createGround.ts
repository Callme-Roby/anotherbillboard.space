import * as THREE from "three";

import { GROUND_SIZE } from "../engine/constants";

/**
 * Flat unlit ground plane plus a subtle grid, purely to anchor the scene
 * — no texturing, consistent with the "simple geometry, no lighting"
 * constraint that applies to the rest of the placeholder scenery.
 */
export function createGround(): THREE.Group {
  const group = new THREE.Group();
  group.name = "ground";

  const planeGeometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x363a42 });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.01;
  group.add(plane);

  // The ground plane's own (filled-area) color is what actually carries
  // legibility once downsampled to the low internal render resolution —
  // 1px grid lines are thin enough that most of them fall between sample
  // points and vanish at that resolution, so the grid needs to be bright
  // to read at all rather than merely a shade lighter than the plane.
  const grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE / 2, 0x8b93a3, 0x4a4f5a);
  group.add(grid);

  return group;
}
