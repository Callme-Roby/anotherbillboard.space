import * as THREE from "three";

import { BACKGROUND_COLOR, GROUND_SIZE } from "../engine/constants";

/**
 * Flat unlit ground plane plus a subtle grid, purely to anchor the scene
 * — no texturing, consistent with the "simple geometry, no lighting"
 * constraint that applies to the rest of the placeholder scenery.
 *
 * Exactly BACKGROUND_COLOR, so ground and sky read as one
 * continuous page rather than two different surfaces — structure comes
 * from the grid and from every other shape's black outline, not from a
 * ground/sky color split.
 */
export function createGround(): THREE.Group {
  const group = new THREE.Group();
  group.name = "ground";

  const planeGeometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  const planeMaterial = new THREE.MeshBasicMaterial({ color: BACKGROUND_COLOR });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.01;
  group.add(plane);

  // The ground plane's own (filled-area) color is what actually carries
  // legibility once downsampled to the low internal render resolution —
  // 1px grid lines are thin enough that most of them fall between sample
  // points and vanish at that resolution, so the grid needs strong
  // contrast against the plane to read at all. Dark on the light ground
  // (inverted from the dark-ground version this replaces — see git
  // history), matching every other shape's black outline.
  const grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE / 2, 0x1a1a1c, 0x8a8a8f);
  group.add(grid);

  return group;
}
