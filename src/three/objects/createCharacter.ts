import * as THREE from "three";

/**
 * The people on the plaza — the scene's "1 panel = 1 character" rule:
 * every panel someone buys puts one more person there, so the crowd *is*
 * the sales figure, readable at a glance before any number is.
 *
 * A character writes its vertices straight into buffers owned by the
 * crowd (see engine/Crowd.ts) rather than owning a mesh of its own. Every
 * person in the plaza is therefore one draw call between them all, while
 * still being animated individually on the CPU — which is what walking
 * needs and what a single shared shader uniform could not give: a walk
 * has per-person state (where they are, how far through a stride) that
 * an attribute baked once at build time cannot carry.
 */

/** Line segments one character is made of; the crowd sizes buffers from it. */
export const CHARACTER_SEGMENTS = 13;

/**
 * Human scale against the signs. A real billboard panel on its posts
 * stands roughly 7m; a person is about a quarter of that — which is what
 * keeps the crowd reading as *people next to signs* rather than as
 * decorations on them.
 */
export const CHARACTER_HEIGHT = 0.3;

/** Sideways stand-off from a panel's centre, as a multiple of its half-width. */
const SIDE_FRACTION = 1.08;
/**
 * Half-width of the group that forms around the pointer, in world units.
 * Wide enough that a dozen people read as a gathering rather than a
 * stack, narrow enough that everyone stays within a screen of the
 * cursor — the crowd is meant to be *with* you, never wandering out of
 * frame.
 */
const CLUSTER_HALF_WIDTH = 1.9;
/**
 * Depth band the crowd is spread through, in front of the panel row.
 * Standing them all at one depth reads as a row of cut-outs; spread over
 * a couple of units they overlap at different sizes and start reading as
 * a crowd with people in front of other people.
 */
const DEPTH_NEAR = 3.0;
const DEPTH_FAR = -0.6;

export interface CrowdMember {
  /** Stable key — the panel's id. Keeps a walker's state across refetches. */
  id: string;
  /** Where this person starts, and stays if `anchored`. */
  homeX: number;
  z: number;
  height: number;
  /** Selects pose + build; see poseFromVariant. */
  variant: number;
  /**
   * Where this person stands *relative to the pointer* — its own fixed
   * place in the group. Some stand to its left and some to its right, so
   * a pointer moving right sends part of the crowd right and part of it
   * left to take up position again, rather than everyone sliding as one
   * block.
   */
  offsetX: number;
  /** Stays at `homeX` and ignores the pointer entirely. */
  anchored?: boolean;
  /** Worn on the head — the colour of the panel this person belongs to. */
  accent: THREE.Color;
}

/**
 * Places the person belonging to one panel. Everything is derived from
 * `seed` (the panel's id) so a walker keeps the same build, depth and
 * range across refetches: the LOD refetch reconciles panels continuously
 * (see LivePanels), and a crowd that reshuffled itself every time the
 * camera zoomed would read as flickering, not as a crowd.
 */
export function placeCharacter(
  seed: string,
  panelWidth: number,
  panelX: number,
  panelZ: number,
  accent: THREE.Color,
): CrowdMember {
  const hash = hashSeed(seed);
  const side = hash & 1 ? 1 : -1;
  // Unsigned shifts throughout: the hash runs past 2^31, so a signed
  // `>>` turns it negative and every value derived from it with it — a
  // negative `reach` walks that person *away* from the pointer, and a
  // negative depth stands them outside the band entirely. Both were
  // happening to roughly half the crowd; found by tracing the walk
  // state, not by watching it, since a crowd half of which walks the
  // wrong way just looks like a crowd milling about.
  //
  // ±8% build variation, so a row doesn't read as one figure stamped out
  // N times, while everyone still shares the same scale.
  const heightJitter = 1 + (((hash >>> 1) % 5) - 2) * 0.04;
  const depth = ((hash >>> 4) % 100) / 99;

  // Spread across the group, biased away from dead centre so the middle
  // doesn't bunch up right under the cursor.
  const place = ((hash >>> 7) % 32) / 31;
  const offsetX = (place * 2 - 1) * CLUSTER_HALF_WIDTH;

  return {
    id: seed,
    homeX: panelX + side * (panelWidth / 2) * SIDE_FRACTION,
    z: panelZ + DEPTH_FAR + depth * (DEPTH_NEAR - DEPTH_FAR),
    height: CHARACTER_HEIGHT * heightJitter,
    variant: hash >>> 9,
    offsetX,
    accent,
  };
}

export interface CharacterPose {
  x: number;
  z: number;
  height: number;
  variant: number;
  /** Walk cycle in turns — the legs scissor once per turn. */
  phase: number;
  /** 0 standing, 1 walking at full stride. Scales stride, swing and bob. */
  gait: number;
  /** Turn toward the direction of travel, in radians. */
  yaw: number;
}

/**
 * Writes one character's segments into the crowd's buffers, starting at
 * `firstVertex`. Exactly CHARACTER_SEGMENTS * 2 vertices are written.
 *
 * The head is drawn as stacked fill lines rather than a square outline,
 * so it resolves to a *solid* dot of the panel's colour instead of a
 * hollow box the figure looks like it's carrying — at the size these
 * render, the head is the one part big enough to carry colour, and it's
 * what ties each figure to the panel it belongs to.
 */
export function writeCharacter(
  positions: Float32Array,
  colors: Float32Array,
  firstVertex: number,
  pose: CharacterPose,
  ink: THREE.Color,
  accent: THREE.Color,
): void {
  const h = pose.height;
  // Turning a flat figure is a rotation of its local x into z.
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  let vertex = firstVertex;

  const put = (ax: number, ay: number, bx: number, by: number, color: THREE.Color) => {
    const i = vertex * 3;
    positions[i] = pose.x + ax * cos;
    positions[i + 1] = ay;
    positions[i + 2] = pose.z - ax * sin;
    positions[i + 3] = pose.x + bx * cos;
    positions[i + 4] = by;
    positions[i + 5] = pose.z - bx * sin;
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
    colors[i + 3] = color.r;
    colors[i + 4] = color.g;
    colors[i + 5] = color.b;
    vertex += 2;
  };

  const { armPose, legSpread } = poseFromVariant(pose.variant);
  const swing = Math.sin(pose.phase * Math.PI * 2);
  // The body dips as the legs spread — twice per stride, which is what
  // makes a walk read as weight shifting rather than a sliding sprite.
  const bob = -Math.abs(swing) * 0.03 * h * pose.gait;

  const headHalf = 0.12 * h;
  const headBottom = 0.76 * h + bob;
  const headTop = h + bob;
  const shoulderY = 0.72 * h + bob;
  const hipY = 0.42 * h + bob;
  const torsoHalf = 0.13 * h;

  const headRows = 4;
  for (let row = 0; row < headRows; row++) {
    const y = headBottom + ((row + 0.5) / headRows) * (headTop - headBottom);
    put(-headHalf, y, headHalf, y, accent);
  }

  put(0, shoulderY, 0, headBottom, ink);
  put(-torsoHalf, shoulderY, torsoHalf, shoulderY, ink);
  put(-torsoHalf, hipY, torsoHalf, hipY, ink);
  put(-torsoHalf, hipY, -torsoHalf, shoulderY, ink);
  put(torsoHalf, hipY, torsoHalf, shoulderY, ink);

  for (const side of [-1, 1] as const) {
    const legSwing = swing * side;
    // Arms counter-swing against the legs, as they do when you walk.
    const armSwing = -legSwing * 0.7;

    const raised = armPose === 1 && side === 1;
    const restHandX = side * (raised ? 0.24 : armPose === 2 ? 0.24 : 0.19) * h;
    const restHandY = (raised ? 0.95 : armPose === 2 ? 0.52 : 0.44) * h;
    put(
      side * torsoHalf,
      shoulderY,
      restHandX + armSwing * 0.16 * h * pose.gait,
      restHandY + bob,
      ink,
    );

    const footX = side * legSpread * h + legSwing * 0.17 * h * pose.gait;
    // A leg only lifts on its forward swing; the other stays planted.
    const footY = Math.max(0, legSwing) * 0.07 * h * pose.gait;
    put(side * 0.07 * h, hipY, footX, footY, ink);
  }
}

function poseFromVariant(variant: number): { armPose: number; legSpread: number } {
  return {
    // 0 = arms at rest, 1 = one arm up, 2 = arms out.
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
