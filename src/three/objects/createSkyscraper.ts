import * as THREE from "three";

import { type BuildingDimensions, createBuildingMesh } from "./createBuilding";

/**
 * Facade detail (window dashes, antenna masts). Lighter than the shapes'
 * own silhouette outline (0x0a0a0a) on purpose: detail should read as
 * texture *inside* a building, never compete with the black line that
 * defines its shape against the off-white background.
 */
const DETAIL_COLOR = 0x55504a;
/** Roof spots / antenna beacons — the only warm accent on the structures. */
const LIGHT_COLOR = 0xf2a541;

/** Lifts detail off the wall it's drawn on, so it can't z-fight with it. */
const FACE_OFFSET = 0.012;
/** Window dash length as a fraction of its grid cell's width. */
const WINDOW_FILL = 0.55;

export interface SkyscraperTier extends BuildingDimensions {
  /**
   * Window dash grid drawn on this tier's three camera-facing faces
   * (front + both sides). Omit for a deliberately blank tier — a podium
   * that's about to be covered by a screen has no reason to pay for
   * detail nothing will see.
   */
  windows?: { rows: number; columns: number };
}

export interface SkyscraperSpec {
  /** Stacked bottom-to-top, each tier centered on the building's axis. */
  tiers: SkyscraperTier[];
  /** Thin roof mast above the top tier, with a bright tip. */
  antenna?: { height: number };
  /** Bright spots evenly spread along a tier's top front edge. */
  roofSpots?: { tier: number; count: number };
}

export interface Skyscraper {
  group: THREE.Group;
  /** Local Y of the top of the tier stack (antenna excluded). */
  apexY: number;
  /** Local Y of the base of tier `index` (its top is base + height). */
  tierBaseY: (index: number) => number;
  tiers: SkyscraperTier[];
}

/**
 * A Times-Square-style tower: a stack of boxes (podium / shaft / crown)
 * rather than one plain volume, dressed with window dashes, a roof mast
 * and roof spots.
 *
 * Every piece of that dressing is *line* geometry, gathered into exactly
 * two `LineSegments` for the whole building (one dark, one bright) no
 * matter how many windows or spots it carries — detail costs vertices,
 * not draw calls, which is what keeps "add more detail" from turning
 * into "add more per-frame cost". Line geometry also happens to be what
 * survives the scene's low internal render resolution (see
 * PostProcessing): a 1-texel dash still reads as a window, where a small
 * shaded box would just turn to mush.
 */
export function createSkyscraper(spec: SkyscraperSpec): Skyscraper {
  const group = new THREE.Group();
  const detail: number[] = [];
  const lights: number[] = [];

  const baseYs: number[] = [];
  let cursorY = 0;
  for (const tier of spec.tiers) {
    baseYs.push(cursorY);

    const mesh = createBuildingMesh(tier);
    mesh.position.y = cursorY;
    group.add(mesh);

    if (tier.windows) pushWindowGrid(detail, tier, cursorY);
    cursorY += tier.height;
  }
  const apexY = cursorY;

  if (spec.antenna) {
    const tipY = apexY + spec.antenna.height;
    detail.push(0, apexY, 0, 0, tipY, 0);
    // Beacon: a short bright stub at the very tip rather than a separate
    // little mesh — same trick as the roof spots below.
    lights.push(0, tipY - spec.antenna.height * 0.18, 0, 0, tipY, 0);
  }

  if (spec.roofSpots) {
    pushRoofSpots(lights, spec.tiers[spec.roofSpots.tier], baseYs[spec.roofSpots.tier], spec.roofSpots.count);
  }

  if (detail.length > 0) group.add(lineSegments(detail, DETAIL_COLOR));
  if (lights.length > 0) group.add(lineSegments(lights, LIGHT_COLOR));

  return {
    group,
    apexY,
    tierBaseY: (index: number) => baseYs[index],
    tiers: spec.tiers,
  };
}

function lineSegments(positions: number[], color: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}

/**
 * Window dashes on the front face and both side faces. Sides included
 * because the camera is head-on but the towers are spread across x, so
 * every off-center one shows the camera a side face too (an unwindowed
 * one next to a windowed front reads as an unfinished model).
 */
function pushWindowGrid(out: number[], tier: SkyscraperTier, baseY: number): void {
  const { rows, columns } = tier.windows!;
  const halfWidth = tier.width / 2;
  const halfDepth = tier.depth / 2;

  // Keep the grid clear of the tier's own silhouette outline, so windows
  // never merge into the black edge at low resolution.
  const insetY = Math.min(0.3, tier.height * 0.1);
  const bottom = baseY + insetY;
  const spanY = tier.height - insetY * 2;
  if (spanY <= 0) return;

  const y = (v: number) => bottom + v * spanY;

  // Front (+Z).
  pushDashGrid(out, columns, rows, (u, v) =>
    new THREE.Vector3(-halfWidth + u * tier.width, y(v), halfDepth + FACE_OFFSET),
  );
  // Sides (±X) — one fewer column than the front, since a tower's side
  // is the narrower face and an equally dense grid there reads as noise.
  const sideColumns = Math.max(1, columns - 1);
  for (const side of [1, -1] as const) {
    pushDashGrid(out, sideColumns, rows, (u, v) =>
      new THREE.Vector3(side * (halfWidth + FACE_OFFSET), y(v), -halfDepth + u * tier.depth),
    );
  }
}

/**
 * One dash per cell of a `columns` x `rows` grid, laid out on a face
 * parameterized by normalized (u, v) — so the same code draws a front
 * face and a side face, only the mapping differs.
 */
function pushDashGrid(
  out: number[],
  columns: number,
  rows: number,
  point: (u: number, v: number) => THREE.Vector3,
): void {
  const halfDash = (0.5 / columns) * WINDOW_FILL;
  for (let row = 0; row < rows; row++) {
    const v = (row + 0.5) / rows;
    for (let column = 0; column < columns; column++) {
      const u = (column + 0.5) / columns;
      const a = point(u - halfDash, v);
      const b = point(u + halfDash, v);
      out.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
}

/** Short upward stubs along a tier's top front edge — floodlights. */
function pushRoofSpots(out: number[], tier: SkyscraperTier, baseY: number, count: number): void {
  const topY = baseY + tier.height;
  const height = 0.16;
  const z = tier.depth / 2 + FACE_OFFSET;
  for (let i = 0; i < count; i++) {
    const x = -tier.width / 2 + ((i + 0.5) / count) * tier.width;
    out.push(x, topY, z, x, topY + height, z);
  }
}
