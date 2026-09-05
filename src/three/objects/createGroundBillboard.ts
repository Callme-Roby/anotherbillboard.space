import * as THREE from "three";

import { createBuildingMesh } from "./createBuilding";

// A first pass at a *real* billboard structure — two support legs plus
// the panel, replacing a flat plane resting directly on the ground (see
// git history). The legs are a uniform size regardless of the panel's
// own size for now: varying the stand with the panel (a taller payment
// getting a taller/sturdier-looking stand) is future work, not yet done.
const LEG_HEIGHT = 1.3;
const LEG_THICKNESS = 0.1;
// Each leg sits this far from center, as a fraction of the panel's own
// half-width — inset from the panel's edges rather than flush with them,
// like a real sign's support posts.
const LEG_INSET_FRACTION = 0.65;

/**
 * Wraps an already-built flat panel mesh (see createPanel.ts) with a
 * simple two-post support structure standing it up off the ground,
 * rather than the panel resting flush on the ground itself. Same unlit-
 * box-plus-black-edges material as every other structure in the scene
 * (createBuildingMesh) — a real (if simple) 3D model, not a sprite.
 *
 * Returns a group whose origin is at ground level (y=0), ready to
 * position directly at a ground (x, 0, z) spot — replaces the previous
 * `mesh.position.y = height/2` (flush-on-ground) placement at each of
 * this function's call sites.
 */
export function createGroundBillboard(
  panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "ground-billboard";

  const panelWidth = panel.geometry.parameters.width;
  const panelHeight = panel.geometry.parameters.height;
  const legOffsetX = (panelWidth / 2) * LEG_INSET_FRACTION;

  for (const side of [-1, 1]) {
    const leg = createBuildingMesh({ width: LEG_THICKNESS, height: LEG_HEIGHT, depth: LEG_THICKNESS });
    leg.position.set(side * legOffsetX, 0, 0);
    group.add(leg);
  }

  panel.position.y = LEG_HEIGHT + panelHeight / 2;
  group.add(panel);

  return group;
}
