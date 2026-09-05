import * as THREE from "three";

/**
 * One small figure standing at the foot of a billboard — the scene's
 * "1 panel = 1 character" rule: every panel someone buys puts one more
 * person in the plaza, so the crowd *is* the sales figure, readable at a
 * glance before any number is.
 *
 * Written as a push-into-shared-buffers function rather than a factory
 * returning an Object3D, on the same pattern as the towers' window grids
 * (createSkyscraper.ts): it lets each figure be merged straight into its
 * billboard's existing structure `LineSegments`, so adding a character
 * per panel costs zero extra draw calls on the object the scene has the
 * most of. The trade-off is that a figure can't be moved or animated on
 * its own while merged — if they ever need to walk, they come out into
 * their own (ideally instanced) geometry, which is the same direction
 * the panels themselves are already headed for LOD.
 */

/**
 * Human scale against the signs. A real billboard panel on its posts
 * stands roughly 7m; a person is about a quarter of that — which is what
 * keeps the crowd reading as *people next to signs* rather than as
 * decorations on them.
 */
export const CHARACTER_HEIGHT = 0.3;

/** How far in front of the structure (toward the camera) a figure stands. */
const CHARACTER_FORWARD_Z = 0.18;
/** Sideways stand-off, as a multiple of the panel's half-width. */
const CHARACTER_SIDE_FRACTION = 1.08;

export interface CharacterPlacement {
  /** Feet position, in the billboard's local space. */
  x: number;
  z: number;
  height: number;
  /** Selects pose + build. Any integer; see poseFromVariant. */
  variant: number;
}

/**
 * Where the figure for a panel of this width stands, and which pose it
 * takes — both derived from `seed` (the panel's id) so a figure keeps
 * the same look and spot across refetches. The LOD refetch reconciles
 * panels continuously (see LivePanels), and a crowd that reshuffled its
 * poses every time the camera zoomed would read as flickering, not as a
 * crowd.
 *
 * Beside the posts rather than between them: a figure is shorter than
 * the posts are tall, so it would otherwise be read against the
 * cross-bracing instead of against clean background.
 */
export function placeCharacter(seed: string, panelWidth: number): CharacterPlacement {
  const hash = hashSeed(seed);
  const side = hash & 1 ? 1 : -1;
  // ±8% build variation, so a row doesn't read as one figure stamped out
  // N times, while everyone still shares the same scale.
  const heightJitter = 1 + (((hash >> 1) % 5) - 2) * 0.04;

  return {
    x: side * (panelWidth / 2) * CHARACTER_SIDE_FRACTION,
    z: CHARACTER_FORWARD_Z,
    height: CHARACTER_HEIGHT * heightJitter,
    variant: hash >> 4,
  };
}

/**
 * Appends one figure's line segments to `positions` / `colors`.
 *
 * The head is drawn in the owning panel's own colour while the body
 * stays in the scene's structural black: at the size these render, the
 * head is the one part big enough to carry colour, and it's what ties
 * each figure to the panel it belongs to — visibly one person per panel,
 * not an anonymous crowd sprinkled around.
 */
export function pushCharacter(
  positions: number[],
  colors: number[],
  placement: CharacterPlacement,
  ink: THREE.Color,
  accent: THREE.Color,
): void {
  const { x, z, height: h } = placement;

  const segment = (ax: number, ay: number, bx: number, by: number, color: THREE.Color) => {
    positions.push(x + ax, ay, z, x + bx, by, z);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  };

  const headHalf = 0.12 * h;
  const headBottom = 0.76 * h;
  const shoulderY = 0.72 * h;
  const hipY = 0.42 * h;
  const torsoHalf = 0.13 * h;

  // Head — drawn as stacked fill lines rather than a square outline, so
  // it resolves to a *solid* dot of the panel's colour instead of a
  // hollow box the figure looks like it's carrying (compared on screen
  // at both ends of the zoom range). The banding this leaves at maximum
  // zoom sits comfortably inside the scene's CRT look.
  const headRows = 4;
  for (let row = 0; row < headRows; row++) {
    const y = headBottom + ((row + 0.5) / headRows) * (h - headBottom);
    segment(-headHalf, y, headHalf, y, accent);
  }

  // Neck + torso.
  segment(0, shoulderY, 0, headBottom, ink);
  segment(-torsoHalf, shoulderY, torsoHalf, shoulderY, ink);
  segment(-torsoHalf, hipY, torsoHalf, hipY, ink);
  segment(-torsoHalf, hipY, -torsoHalf, shoulderY, ink);
  segment(torsoHalf, hipY, torsoHalf, shoulderY, ink);

  const { armPose, legSpread } = poseFromVariant(placement.variant);
  for (const side of [-1, 1] as const) {
    const raised = armPose === 1 && side === 1;
    const handX = side * (raised ? 0.24 : armPose === 2 ? 0.24 : 0.19) * h;
    const handY = raised ? 0.95 * h : armPose === 2 ? 0.52 * h : 0.44 * h;
    segment(side * torsoHalf, shoulderY, handX, handY, ink);
    segment(side * 0.07 * h, hipY, side * legSpread * h, 0, ink);
  }
}

function poseFromVariant(variant: number): { armPose: number; legSpread: number } {
  return {
    // 0 = arms at rest, 1 = one arm up toward the sign, 2 = arms out.
    armPose: variant % 3,
    legSpread: Math.floor(variant / 3) % 2 === 0 ? 0.06 : 0.11,
  };
}

/** FNV-1a — small, stable, and enough to spread ids across poses. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
