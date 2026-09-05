import * as THREE from "three";

import { ANNOUNCEMENT_PLACEHOLDERS, RANK_SLOT_PLACEHOLDERS } from "../placeholders/mockPanels";
import { createBuildingMesh } from "./createBuilding";
import { createScreenRig, FRAME_MARGIN, SCREEN_STANDOFF, type ScreenRigSpec } from "./createScreenRig";
import { createSkyscraper, type SkyscraperSpec } from "./createSkyscraper";

interface TowerScreen {
  /** Index into RANK_SLOT_PLACEHOLDERS — 0 is rank 1. */
  rank: number;
  /** Tier whose front face the rig is mounted off. */
  tier: number;
  /** Local Y of the rig's main face center. */
  y: number;
  /**
   * Pulls the rig back from that tier's front face — only used by the
   * roof-mounted `crown`, whose legs have to land *on* the roof rather
   * than off its front edge.
   */
  inset?: number;
  rig: ScreenRigSpec;
}

interface TowerSpec {
  x: number;
  /**
   * Depth offset from the cluster's nominal z=0 line — positive is
   * *toward* the camera (see CAMERA_DIRECTION in engine/constants.ts).
   * Each tower stands on its own footprint at varying proximity to the
   * camera on purpose: a shared podium at a single depth read as one
   * fused monolith rather than a cluster of distinct buildings, and gave
   * no parallax as the camera zooms/pans.
   */
  z: number;
  building: SkyscraperSpec;
  screen: TowerScreen;
}

/**
 * The skyline: five towers, each carrying exactly one of the top five
 * ranked screens, left to right ranks 4 / 3 / 1 / 2 / 5 — the best spot
 * in the middle and the highest up, the rest falling away to the sides,
 * so the ranking is legible from the silhouette alone before you read a
 * single number.
 *
 * Every tower is a *stack* of boxes (podium / shaft / crown) rather than
 * one volume, and no two carry their screen the same way (see
 * ScreenRigKind) — the two things that separate a Times Square block
 * from five rectangles in a row. Screens routinely overhang the tower
 * holding them; that's the look, not a bug.
 *
 * Horizontal clearances between neighbouring towers *and their
 * overhanging screens* were checked by hand across this table; the
 * rotating summit's swept radius is checked against it too (see
 * ROTOR_RADIUS).
 */
const SKYLINE: TowerSpec[] = [
  {
    // Rank 4 — a low block wearing its wrap around the shaft's bottom
    // corner. Mounted on the shaft rather than the (visually more
    // interesting) street-level podium because the ground billboard row
    // stands at z=9, in front of the whole cluster, and occludes what
    // is behind it — checked on screen. Kept here even after the ground
    // panels were scaled down (their row now tops out around y=1.4):
    // the wrap reads better against the shaft's windows than against a
    // blank podium anyway.
    x: -6.2,
    z: 1.4,
    building: {
      tiers: [
        { width: 2.8, height: 1.5, depth: 2.2 },
        { width: 2.0, height: 3.6, depth: 2.0, windows: { rows: 7, columns: 5 } },
      ],
      antenna: { height: 0.9 },
      roofSpots: { tier: 1, count: 4 },
    },
    screen: {
      rank: 3,
      tier: 1,
      y: 2.5,
      rig: { kind: "wrap", width: 2.9, height: 1.7, wrapDepth: 1.0, wrapSide: -1 },
    },
  },
  {
    // Rank 3 — slim shaft, screen with its own ticker strip slung under
    // it, set high enough to clear the neighbours in front.
    x: -3.1,
    z: -1.0,
    building: {
      tiers: [
        { width: 1.8, height: 5.0, depth: 1.8, windows: { rows: 9, columns: 5 } },
        { width: 1.3, height: 1.1, depth: 1.3, windows: { rows: 2, columns: 2 } },
      ],
      antenna: { height: 1.1 },
      roofSpots: { tier: 1, count: 3 },
    },
    screen: {
      rank: 2,
      tier: 0,
      y: 3.6,
      rig: { kind: "stack", width: 2.4, height: 1.7, tickerHeight: 0.4 },
    },
  },
  {
    // Rank 1 — the tallest, and the only one carrying two screens: a
    // huge corner wrap on the shaft, plus its bonus slot on the rotating
    // summit above (see createRotatingSummit).
    x: 0,
    z: 0.6,
    building: {
      tiers: [
        { width: 3.2, height: 1.8, depth: 2.8, windows: { rows: 3, columns: 7 } },
        { width: 2.4, height: 5.4, depth: 2.4, windows: { rows: 10, columns: 6 } },
        { width: 1.5, height: 1.0, depth: 1.5, windows: { rows: 2, columns: 2 } },
      ],
      roofSpots: { tier: 1, count: 5 },
    },
    screen: {
      rank: 0,
      tier: 1,
      y: 4.6,
      rig: { kind: "wrap", width: 3.6, height: 2.6, wrapDepth: 1.4, wrapSide: 1 },
    },
  },
  {
    // Rank 2 — the portrait ribbon: a screen taller than it is wide,
    // running most of the shaft, the loudest silhouette after rank 1's.
    x: 3.2,
    z: -1.3,
    building: {
      tiers: [
        { width: 1.9, height: 6.2, depth: 1.9, windows: { rows: 11, columns: 5 } },
        { width: 1.4, height: 1.0, depth: 1.4, windows: { rows: 2, columns: 2 } },
      ],
      antenna: { height: 1.3 },
      roofSpots: { tier: 1, count: 3 },
    },
    screen: {
      rank: 1,
      tier: 0,
      y: 3.9,
      rig: { kind: "banner", width: 2.2, height: 4.2 },
    },
  },
  {
    // Rank 5 — the shortest tower, compensating with a rooftop
    // spectacular raised on legs and tilted back over the street.
    x: 6.3,
    z: 1.0,
    building: {
      tiers: [
        { width: 2.6, height: 1.2, depth: 2.2 },
        { width: 2.2, height: 2.6, depth: 2.2, windows: { rows: 5, columns: 5 } },
      ],
      antenna: { height: 0.7 },
      roofSpots: { tier: 1, count: 4 },
    },
    screen: {
      rank: 4,
      tier: 1,
      y: 4.9,
      inset: 0.25,
      rig: { kind: "crown", width: 3.2, height: 1.5 },
    },
  },
];

/** Index into SKYLINE of the tower carrying the rotating summit. */
const SUMMIT_TOWER = 2;

const POLE_COLOR = 0xffffff;

// The rotating summit: a mast above the tallest tower's apex carrying 4
// screens arranged like spokes, slowly turning. Three of them run
// site-wide announcements; the fourth is rank 1's bonus screen — see
// ANNOUNCEMENT_PLACEHOLDERS. Deliberately slow (radians/second): a real
// rotating sign, not something that spins fast enough to distract or to
// blur under the scene's low internal render resolution.
const ROTOR_MAST_HEIGHT = 0.45;
// Clears the cap below it, and — checked against SKYLINE — keeps the
// screens' swept reach clear of the neighbouring towers. A screen of
// width w centered at this radius sweeps out to sqrt(r² + (w/2)²)
// = sqrt(1.8² + 1.3²) ≈ 2.22 from the mast, against a nearest
// neighbouring tower surface at ≈ 2.77. Since all four screens are
// rigidly attached to the same rotor, checking that once is enough —
// nothing moves relative to anything else as it spins.
const ROTOR_RADIUS = 1.8;
const ROTOR_SPEED = 0.3;
const ROTOR_SCREEN = { width: 2.6, height: 1.9 };

export interface CentralBuilding {
  group: THREE.Group;
  /** Advances the rotating summit. `delta` in seconds. */
  update: (delta: number) => void;
}

/**
 * The skyline cluster (see SKYLINE): five individually-grounded towers,
 * each carrying one of the top five ranked screens, plus the rotating
 * announcement summit on the tallest.
 */
export function createCentralBuilding(): CentralBuilding {
  const group = new THREE.Group();
  group.name = "central-building";

  let summitApexY = 0;

  for (const tower of SKYLINE) {
    const skyscraper = createSkyscraper(tower.building);
    skyscraper.group.position.set(tower.x, 0, tower.z);
    group.add(skyscraper.group);

    const { screen } = tower;
    const mountTier = tower.building.tiers[screen.tier];
    const rig = createScreenRig(RANK_SLOT_PLACEHOLDERS[screen.rank], screen.rig);
    rig.position.set(
      tower.x,
      screen.y,
      tower.z + mountTier.depth / 2 + SCREEN_STANDOFF - (screen.inset ?? 0),
    );
    group.add(rig);

    if (tower === SKYLINE[SUMMIT_TOWER]) summitApexY = skyscraper.apexY;
  }

  const summitTower = SKYLINE[SUMMIT_TOWER];
  const summit = createRotatingSummit(summitTower.x, summitTower.z, summitApexY);
  group.add(summit.group);

  return { group, update: summit.update };
}

/**
 * Four screens standing above the roofline on a single central mast,
 * arranged like spokes and slowly rotating around it. One mast rather
 * than a support per screen: at the scene's low internal render
 * resolution (see PostProcessing) several thin adjacent struts have
 * little margin to still read as distinct shapes, where a single
 * slightly thicker mast stays legible at any zoom level.
 */
function createRotatingSummit(
  x: number,
  z: number,
  apexY: number,
): { group: THREE.Group; update: (delta: number) => void } {
  const group = new THREE.Group();

  const mast = createBuildingMesh({ width: 0.14, height: ROTOR_MAST_HEIGHT, depth: 0.14 }, POLE_COLOR);
  mast.position.set(x, apexY, z);
  group.add(mast);

  const rotor = new THREE.Group();
  rotor.position.set(x, apexY + ROTOR_MAST_HEIGHT + ROTOR_SCREEN.height / 2, z);
  ANNOUNCEMENT_PLACEHOLDERS.forEach((panel, i) => {
    const angle = (i / ANNOUNCEMENT_PLACEHOLDERS.length) * Math.PI * 2;
    const screen = createScreenRig(panel, { kind: "banner", ...ROTOR_SCREEN });
    // Positioned and rotated by the *same* angle: each screen's front
    // (its local +Z, see createPanel.ts) then points the way it's
    // offset, so it faces outward along its own spoke rather than
    // across the rotor.
    screen.position.set(Math.sin(angle) * ROTOR_RADIUS, 0, Math.cos(angle) * ROTOR_RADIUS);
    screen.rotation.y = angle;
    rotor.add(screen);
  });
  group.add(rotor);

  return {
    group,
    update: (delta: number) => {
      rotor.rotation.y += delta * ROTOR_SPEED;
    },
  };
}

/** A spot a bird can stand on: the top surface of something in the skyline. */
export interface PerchSpot {
  x: number;
  y: number;
  z: number;
}

/**
 * Everywhere a bird can land, derived from SKYLINE rather than listed by
 * hand — move a tower or resize a screen and its perch follows, instead
 * of quietly leaving birds standing in mid-air.
 *
 * Roofs (the front edge of each tower's top tier) plus the top edge of
 * each flat-mounted screen — the crow-on-a-billboard silhouette. The
 * `crown` rig is skipped: it's tilted back (see createScreenRig), so its
 * top edge isn't level and a bird would sit visibly askew on it.
 */
export const PERCHES: PerchSpot[] = SKYLINE.flatMap((tower) => {
  const apexY = tower.building.tiers.reduce((sum, tier) => sum + tier.height, 0);
  const topTier = tower.building.tiers[tower.building.tiers.length - 1];
  const spots: PerchSpot[] = [
    // Just inside the roof's front edge, so a perched bird reads against
    // the sky rather than half-buried in the roof behind it, and off the
    // centre line so the flock doesn't line up through the antenna mast.
    { x: tower.x + topTier.width * 0.22, y: apexY, z: tower.z + topTier.depth / 2 - 0.12 },
  ];

  if (tower.screen.rig.kind !== "crown") {
    const mountTier = tower.building.tiers[tower.screen.tier];
    spots.push({
      x: tower.x,
      y: tower.screen.y + tower.screen.rig.height / 2 + FRAME_MARGIN,
      z: tower.z + mountTier.depth / 2 + SCREEN_STANDOFF - (tower.screen.inset ?? 0),
    });
  }

  return spots;
});
