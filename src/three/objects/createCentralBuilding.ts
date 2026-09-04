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

type Mount =
  | { kind: "rooftop"; tower: number; poleHeight: number }
  | { kind: "facade"; tower: number; heightFraction: number };

// How each of the 4 ranking screens mounts onto the cluster — per a
// user-provided skyline reference: showcase billboards on rooftop masts
// above the tallest towers (most visible, reserved for the top ranks),
// smaller screens embedded flush on shorter towers' faces partway up —
// rather than the single row along the podium's front this replaces (see
// git history). `tower` indexes into TOWERS above; must stay the same
// length as RANK_SLOT_PLACEHOLDERS (one mount per ranked screen). Left
// unmapped: TOWERS[0], so the cluster isn't screen-on-every-tower
// uniform, matching the reference's own unevenness.
const RANK_MOUNTS: Mount[] = [
  { kind: "rooftop", tower: 2, poleHeight: 0.5 }, // rank 1 — tallest, central spire
  { kind: "rooftop", tower: 3, poleHeight: 0.3 }, // rank 2 — second-tallest
  { kind: "facade", tower: 1, heightFraction: 0.55 }, // rank 3
  { kind: "facade", tower: 4, heightFraction: 0.5 }, // rank 4
];

const POLE_COLOR = 0xffffff;

/**
 * The central building: a cluster of towers standing on a shared podium,
 * carrying the top 1-4 cumulative-payment ranking as screens (regular
 * panel meshes — a building's screens are just panels) mounted directly
 * on the cluster per RANK_MOUNTS above.
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

  RANK_SLOT_PLACEHOLDERS.forEach((slot, i) => {
    const mount = RANK_MOUNTS[i];
    const tower = TOWERS[mount.tower];
    const mesh = createPanelMesh(slot);

    if (mount.kind === "rooftop") {
      const apexHeight = tower.x === 0 ? tower.height + SPIRE_CAP.height : tower.height;
      const roofY = PODIUM.height + apexHeight;
      group.add(createRooftopMount(mesh, tower.x, roofY, mount.poleHeight));
    } else {
      const frontZ = tower.depth / 2 + 0.02;
      mesh.position.set(tower.x, PODIUM.height + tower.height * mount.heightFraction, frontZ);
      group.add(mesh);
    }
  });

  return group;
}

/**
 * A screen standing above a roofline on a single central mast — the
 * "showcase billboard" mount, reserved for the tallest towers where it
 * reads clearly against the sky rather than another tower behind it. One
 * mast rather than twin support struts: at the scene's low internal
 * render resolution (see PostProcessing) a pair of thin adjacent struts
 * has little margin to still read as two distinct shapes, where a single
 * slightly thicker mast stays legible at any zoom level.
 */
function createRooftopMount(
  panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
  x: number,
  roofY: number,
  poleHeight: number,
): THREE.Group {
  const group = new THREE.Group();

  const mast = createBuildingMesh({ width: 0.15, height: poleHeight, depth: 0.15 }, POLE_COLOR);
  mast.position.set(x, roofY, 0);
  group.add(mast);

  panel.position.set(x, roofY + poleHeight + panel.geometry.parameters.height / 2, 0);
  group.add(panel);

  return group;
}
