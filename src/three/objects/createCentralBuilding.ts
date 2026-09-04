import * as THREE from "three";

import { RANK_SLOT_PLACEHOLDERS } from "../placeholders/mockPanels";
import type { BuildingDimensions } from "./createBuilding";
import { createBuildingMesh } from "./createBuilding";
import { createPanelMesh } from "./createPanel";

interface TowerSpec extends BuildingDimensions {
  /** Horizontal offset from the cluster's center. */
  x: number;
}

const PODIUM: BuildingDimensions = { width: 12.5, height: 1.8, depth: 3.4 };

// A cluster of towers of varying height packed tightly together (per
// user-provided reference: an irregular Shinjuku/Times-Square-style
// skyline, not a single symmetric block), all standing on the shared
// podium below. Still plain boxes — the "simple geometry, unlit" spec
// applies to shape count and material, not to silhouette variety.
const TOWERS: TowerSpec[] = [
  { x: -4.3, width: 2.0, height: 5.0, depth: 2.0 },
  { x: -2.3, width: 1.6, height: 6.6, depth: 1.6 },
  { x: 0, width: 2.4, height: 8.6, depth: 2.4 }, // central spire, tallest
  { x: 2.3, width: 1.8, height: 7.6, depth: 1.8 },
  { x: 4.3, width: 2.2, height: 4.0, depth: 2.2 },
];

// Small cap on the central spire for a less flat silhouette at the peak.
const SPIRE_CAP: BuildingDimensions = { width: 1.3, height: 1.1, depth: 1.3 };

/**
 * The central building: a cluster of towers standing on a shared podium.
 * Represents the ranking of the top 1-4 cumulative payments via up to 4
 * screens (regular panel meshes — a building's screens are just panels)
 * on the podium's front face standing in for the rank-1..4 slots.
 */
export function createCentralBuilding(): THREE.Group {
  const group = new THREE.Group();
  group.name = "central-building";

  const podiumGroup = createBuildingMesh(PODIUM);
  group.add(podiumGroup);

  for (const tower of TOWERS) {
    const towerGroup = createBuildingMesh(tower);
    towerGroup.position.set(tower.x, PODIUM.height, 0);
    group.add(towerGroup);

    if (tower.x === 0) {
      const cap = createBuildingMesh(SPIRE_CAP);
      cap.position.set(0, PODIUM.height + tower.height, 0);
      group.add(cap);
    }
  }

  const frontZ = PODIUM.depth / 2 + 0.02;
  const spacing = PODIUM.width / (RANK_SLOT_PLACEHOLDERS.length + 1);

  RANK_SLOT_PLACEHOLDERS.forEach((slot, i) => {
    const mesh = createPanelMesh(slot);
    mesh.position.set(-PODIUM.width / 2 + spacing * (i + 1), PODIUM.height / 2, frontZ);
    group.add(mesh);
  });

  return group;
}
