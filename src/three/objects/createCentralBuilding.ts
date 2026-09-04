import * as THREE from "three";

import { RANK_SLOT_PLACEHOLDERS } from "../placeholders/mockPanels";
import type { BuildingDimensions } from "./createBuilding";
import { createBuildingMesh } from "./createBuilding";
import { createPanelMesh } from "./createPanel";

const TIERS: BuildingDimensions[] = [
  { width: 6, height: 3, depth: 6 },
  { width: 4.4, height: 2.4, depth: 4.4 },
  { width: 3, height: 2, depth: 3 },
];

/**
 * The central building: represents the ranking of the top 1-4 cumulative
 * payments. Placeholder geometry is a tiered (ziggurat-style) tower built
 * from stacked `createBuildingMesh` volumes, with up to 4 small screens
 * (regular panel meshes — a building's screens are just panels) on the
 * base tier's front face standing in for the rank-1..4 slots.
 */
export function createCentralBuilding(): THREE.Group {
  const group = new THREE.Group();
  group.name = "central-building";

  let currentY = 0;
  for (const tier of TIERS) {
    const tierGroup = createBuildingMesh(tier);
    tierGroup.position.y = currentY;
    group.add(tierGroup);
    currentY += tier.height;
  }

  const baseTier = TIERS[0];
  const frontZ = baseTier.depth / 2 + 0.02;
  const spacing = baseTier.width / (RANK_SLOT_PLACEHOLDERS.length + 1);

  RANK_SLOT_PLACEHOLDERS.forEach((slot, i) => {
    const mesh = createPanelMesh(slot);
    mesh.position.set(
      -baseTier.width / 2 + spacing * (i + 1),
      baseTier.height / 2,
      frontZ,
    );
    group.add(mesh);
  });

  return group;
}
