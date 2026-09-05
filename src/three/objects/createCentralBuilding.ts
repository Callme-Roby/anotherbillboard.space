import * as THREE from "three";

import { FACADE_DECOR_PLACEHOLDERS, RANK_SLOT_PLACEHOLDERS } from "../placeholders/mockPanels";
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
//
// Index 2 (x=0) is the tallest and carries the rotating summit — see
// SUMMIT_TOWER_INDEX below; the rest each carry one decorative facade
// screen (FACADE_MOUNTS).
const TOWERS: TowerSpec[] = [
  { x: -5.5, z: 1.3, width: 2.0, height: 5.0, depth: 2.0 },
  { x: -2.8, z: -0.9, width: 1.6, height: 6.6, depth: 1.6 },
  { x: 0, z: 0.6, width: 2.4, height: 8.6, depth: 2.4 }, // central spire, tallest
  { x: 2.9, z: -1.4, width: 1.8, height: 7.6, depth: 1.8 },
  { x: 5.6, z: 0.9, width: 2.2, height: 4.0, depth: 2.2 },
];

const SUMMIT_TOWER_INDEX = 2;

// Small cap on the central spire for a less flat silhouette at the peak.
const SPIRE_CAP: BuildingDimensions = { width: 1.3, height: 1.1, depth: 1.3 };

// Where each non-summit tower's decorative facade screen sits, as a
// fraction of that tower's own height — varied a little per tower rather
// than a single flat fraction, so they don't all line up in a row.
// Index into TOWERS; must be all indices except SUMMIT_TOWER_INDEX, same
// length/order as FACADE_DECOR_PLACEHOLDERS.
const FACADE_MOUNTS: { tower: number; heightFraction: number }[] = [
  { tower: 0, heightFraction: 0.5 },
  { tower: 1, heightFraction: 0.62 },
  { tower: 3, heightFraction: 0.45 },
  { tower: 4, heightFraction: 0.55 },
];

const POLE_COLOR = 0xffffff;

// The rotating summit assembly: a mast above the tallest tower's apex
// carrying 4 screens arranged like spokes, slowly turning around it —
// the top-4 cumulative-payment ranking, replacing an earlier version
// scattered as individual rooftop/facade mounts across several towers
// (see git history). Deliberately slow (radians/second): this is meant
// to read as a real rotating sign, not spin fast enough to be
// distracting or to blur under the scene's low internal render
// resolution.
const SUMMIT_MAST_HEIGHT = 0.5;
// Clears rank-1's own half-width (RANK_SLOT_PLACEHOLDERS[0], the widest
// at 3.2 -> half-width 1.6) with margin, so its inner edge doesn't reach
// the mast — the 4 screens are big now (on purpose, see
// RANK_SLOT_PLACEHOLDERS), so this had to grow with them. Since all 4
// screens are rigidly attached to the same rotor and only ever rotate
// together, checking clearance once at this fixed arrangement is enough
// — nothing moves relative to anything else as it spins.
const SUMMIT_ROTOR_RADIUS = 2.0;
const SUMMIT_ROTOR_SPEED = 0.3;

export interface CentralBuilding {
  group: THREE.Group;
  /** Advances the rotating summit. `delta` in seconds. */
  update: (delta: number) => void;
}

/**
 * The central building: a cluster of individually-grounded towers (see
 * TOWERS above). Carries the top 1-4 cumulative-payment ranking as a
 * rotating 4-screen summit on the tallest tower (see
 * createRotatingSummit), plus one small decorative facade screen per
 * other tower (FACADE_MOUNTS) — not tied to any ranking, just set
 * dressing so the cluster reads as a lived-in skyline rather than bare
 * boxes, per a user-provided reference.
 */
export function createCentralBuilding(): CentralBuilding {
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

  FACADE_MOUNTS.forEach((mount, i) => {
    const tower = TOWERS[mount.tower];
    const mesh = createPanelMesh(FACADE_DECOR_PLACEHOLDERS[i]);
    const frontZ = tower.z + tower.depth / 2 + 0.02;
    mesh.position.set(tower.x, tower.height * mount.heightFraction, frontZ);
    group.add(mesh);
  });

  const summitTower = TOWERS[SUMMIT_TOWER_INDEX];
  const apexY = summitTower.height + SPIRE_CAP.height;
  const summit = createRotatingSummit(summitTower.x, summitTower.z, apexY);
  group.add(summit.group);

  return { group, update: summit.update };
}

/**
 * Four screens standing above a roofline on a single central mast,
 * arranged like spokes and slowly rotating around it — the "showcase"
 * mount, reserved for the tallest tower where it reads clearly against
 * the sky. One mast rather than a support per screen: at the scene's low
 * internal render resolution (see PostProcessing) several thin adjacent
 * struts have little margin to still read as distinct shapes, where a
 * single slightly thicker mast stays legible at any zoom level.
 */
function createRotatingSummit(
  x: number,
  z: number,
  apexY: number,
): { group: THREE.Group; update: (delta: number) => void } {
  const group = new THREE.Group();

  const mast = createBuildingMesh({ width: 0.12, height: SUMMIT_MAST_HEIGHT, depth: 0.12 }, POLE_COLOR);
  mast.position.set(x, apexY, z);
  group.add(mast);

  const rotor = new THREE.Group();
  rotor.position.set(x, apexY + SUMMIT_MAST_HEIGHT, z);
  RANK_SLOT_PLACEHOLDERS.forEach((slot, i) => {
    const angle = (i / RANK_SLOT_PLACEHOLDERS.length) * Math.PI * 2;
    const mesh = createPanelMesh(slot);
    // Positioned and rotated by the *same* angle: the plane's local +z
    // (its front, non-mirrored face — see createPanel.ts's fixed +Z
    // convention) then points the same way it's offset, so each screen
    // faces outward along its own spoke rather than across the rotor.
    mesh.position.set(Math.sin(angle) * SUMMIT_ROTOR_RADIUS, 0, Math.cos(angle) * SUMMIT_ROTOR_RADIUS);
    mesh.rotation.y = angle;
    rotor.add(mesh);
  });
  group.add(rotor);

  return {
    group,
    update: (delta: number) => {
      rotor.rotation.y += delta * SUMMIT_ROTOR_SPEED;
    },
  };
}
