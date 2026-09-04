import * as THREE from "three";

import { RANK_SLOT_PLACEHOLDERS } from "../placeholders/mockPanels";
import type { BuildingDimensions } from "./createBuilding";
import { createBuildingMesh } from "./createBuilding";
import { createPanelMesh } from "./createPanel";

interface TowerSpec extends BuildingDimensions {
  /** Horizontal offset from the cluster's center. */
  x: number;
  /**
   * Depth offset from the cluster's nominal z=0 line — positive is
   * *toward* the camera (see CAMERA_DIRECTION in engine/constants.ts).
   * Each tower stands on its own footprint at varying proximity to the
   * camera on purpose: a shared podium at a single depth read as one
   * fused monolith rather than a cluster of distinct buildings, and gave
   * no parallax as the camera zooms/pans. Adjacent towers' footprints
   * are given enough X clearance that they don't overlap regardless of
   * this z offset (checked by hand against each pair below).
   */
  z: number;
}

// A cluster of towers of varying height, each individually grounded at
// z=0 — no shared podium (per user direction: buildings shouldn't
// necessarily share a base, and standing at different distances from the
// camera is what sells real depth between them, not just a taller/shorter
// silhouette). Generously gapped in x (unlike the old edge-to-edge
// packing) so each one reads as its own standalone structure. Still
// plain boxes — the "simple geometry, unlit" spec applies to shape count
// and material, not to silhouette variety.
const TOWERS: TowerSpec[] = [
  { x: -5.5, z: 1.3, width: 2.0, height: 5.0, depth: 2.0 },
  { x: -2.8, z: -0.9, width: 1.6, height: 6.6, depth: 1.6 },
  { x: 0, z: 0.6, width: 2.4, height: 8.6, depth: 2.4 }, // central spire, tallest
  { x: 2.9, z: -1.4, width: 1.8, height: 7.6, depth: 1.8 },
  { x: 5.6, z: 0.9, width: 2.2, height: 4.0, depth: 2.2 },
];

// Small cap on the central spire for a less flat silhouette at the peak.
const SPIRE_CAP: BuildingDimensions = { width: 1.3, height: 1.1, depth: 1.3 };

type Mount =
  | { kind: "rooftop"; tower: number; poleHeight: number }
  | { kind: "facade"; tower: number; heightFraction: number };

// How each of the 4 ranking screens mounts onto the cluster — per a
// user-provided skyline reference: showcase billboards on rooftop masts
// above the tallest towers (most visible, reserved for the top ranks),
// smaller screens embedded flush on shorter towers' faces partway up.
// `tower` indexes into TOWERS above; must stay the same length as
// RANK_SLOT_PLACEHOLDERS (one mount per ranked screen). Left unmapped:
// TOWERS[0], so the cluster isn't screen-on-every-tower uniform,
// matching the reference's own unevenness.
const RANK_MOUNTS: Mount[] = [
  { kind: "rooftop", tower: 2, poleHeight: 0.5 }, // rank 1 — tallest, central spire
  { kind: "rooftop", tower: 3, poleHeight: 0.3 }, // rank 2 — second-tallest
  { kind: "facade", tower: 1, heightFraction: 0.55 }, // rank 3
  { kind: "facade", tower: 4, heightFraction: 0.5 }, // rank 4
];

const POLE_COLOR = 0xffffff;

/**
 * The central building: a cluster of individually-grounded towers (see
 * TOWERS above), carrying the top 1-4 cumulative-payment ranking as
 * screens (regular panel meshes — a building's screens are just panels)
 * mounted directly on the cluster per RANK_MOUNTS above.
 */
export function createCentralBuilding(): THREE.Group {
  const group = new THREE.Group();
  group.name = "central-building";

  for (const tower of TOWERS) {
    const towerGroup = createBuildingMesh(tower);
    towerGroup.position.set(tower.x, 0, tower.z);
    group.add(towerGroup);

    if (tower.x === 0) {
      const cap = createBuildingMesh(SPIRE_CAP);
      cap.position.set(tower.x, tower.height, tower.z);
      group.add(cap);
    }
  }

  RANK_SLOT_PLACEHOLDERS.forEach((slot, i) => {
    const mount = RANK_MOUNTS[i];
    const tower = TOWERS[mount.tower];
    const mesh = createPanelMesh(slot);

    if (mount.kind === "rooftop") {
      const apexHeight = tower.x === 0 ? tower.height + SPIRE_CAP.height : tower.height;
      group.add(createRooftopMount(mesh, tower.x, tower.z, apexHeight, mount.poleHeight));
    } else {
      const frontZ = tower.z + tower.depth / 2 + 0.02;
      mesh.position.set(tower.x, tower.height * mount.heightFraction, frontZ);
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
  z: number,
  roofY: number,
  poleHeight: number,
): THREE.Group {
  const group = new THREE.Group();

  const mast = createBuildingMesh({ width: 0.15, height: poleHeight, depth: 0.15 }, POLE_COLOR);
  mast.position.set(x, roofY, z);
  group.add(mast);

  panel.position.set(x, roofY + poleHeight + panel.geometry.parameters.height / 2, z);
  group.add(panel);

  return group;
}
