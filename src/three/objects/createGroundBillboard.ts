import * as THREE from "three";

import { createBillboardLineMaterial } from "../engine/characterGaze";
import { placeCharacter, pushCharacter } from "./createCharacter";

/**
 * A real roadside-billboard structure: two braced posts, a bezel around
 * the picture, a maintenance catwalk under it and gooseneck lamps over
 * it. Same black as every silhouette in the scene, with the same warm
 * accent the towers use for their roof spots (createSkyscraper.ts).
 */
const STRUCTURE_COLOR = 0x0a0a0a;
const LAMP_COLOR = 0xf2a541;

// Fixed for *every* ground panel regardless of its own size. This is the
// object that appears most on the site — one per purchase, dozens on
// screen at once — so it's deliberately one consistent piece of street
// furniture rather than a per-panel variation: a row of signs standing
// at the same height reads as a plaza, a row at mismatched heights reads
// as an accident. Only the width follows the panel it carries.
const LEG_HEIGHT = 0.5;
const POST_WIDTH = 0.045;
/**
 * Each post sits this far from center as a fraction of the panel's own
 * half-width — inset from the edges rather than flush with them, like a
 * real sign's supports.
 */
const LEG_INSET_FRACTION = 0.62;

/** Bezel offset around the picture, and the catwalk's drop below it. */
const FRAME_MARGIN = 0.035;
const CATWALK_DROP = 0.07;

const LAMP_COUNT = 3;
const LAMP_ARM_HEIGHT = 0.1;
/** How far each lamp head reaches out over the picture (toward +Z). */
const LAMP_REACH = 0.09;
/**
 * Half-length of the lamp head itself, drawn as a bar *across* the view.
 * A head drawn only as a forward reach is a segment pointing straight at
 * a head-on camera, so it projects to nearly a single pixel and the
 * lamps vanish — seen in a close-up before this was added.
 */
const LAMP_HEAD_HALF = 0.038;

/**
 * Y of the top of a ground billboard's frame — where a bird stands if it
 * lands on one. Derived from the same constants that draw the structure,
 * so a perch can never drift away from the thing it sits on.
 */
export function groundBillboardPerchY(panelHeight: number): number {
  return LEG_HEIGHT + panelHeight + FRAME_MARGIN;
}

export interface GroundBillboardOptions {
  /**
   * Stable per-panel key (its id) — decides the figure's pose, build and
   * which side of the sign it stands on, so it stays put across the LOD
   * refetch instead of reshuffling every time the camera zooms.
   */
  seed: string;
  /** The panel's own colour, worn by its figure. Falls back to the ink. */
  accent?: string | null;
}

/**
 * Wraps an already-built flat panel mesh (see createPanel.ts) in its
 * support structure, standing it off the ground, with the one figure
 * that panel brings to the plaza (see createCharacter.ts).
 *
 * The whole structure — posts, bracing, footings, bezel, catwalk and
 * lamps, and the panel's own figure — is a *single* `LineSegments`, with
 * the lamp heads' warm color carried in a vertex-color attribute rather
 * than a second material.
 * That's what lets this object be the detailed one: it costs two draw
 * calls (structure + picture) no matter how much detail is added to it,
 * where the old two-posts-as-boxes version already cost five for far
 * less. Vertex colors are pushed straight from `THREE.Color`, whose
 * values are already in the renderer's linear working space (checked
 * against three.js's ColorManagement) — the same space a color attribute
 * is expected to be in.
 *
 * Returns a group whose origin is at ground level (y=0), ready to
 * position directly at a ground (x, 0, z) spot.
 */
export function createGroundBillboard(
  panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
  options: GroundBillboardOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "ground-billboard";

  const panelWidth = panel.geometry.parameters.width;
  const panelHeight = panel.geometry.parameters.height;

  panel.position.y = LEG_HEIGHT + panelHeight / 2;
  group.add(panel);

  const positions: number[] = [];
  const colors: number[] = [];
  const pivots: number[] = [];
  const structureColor = new THREE.Color(STRUCTURE_COLOR);
  const lampColor = new THREE.Color(LAMP_COLOR);

  const segment = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    color: THREE.Color = structureColor,
  ) => {
    positions.push(ax, ay, az, bx, by, bz);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    // The structure never turns, so each of its vertices pivots about
    // itself — see createBillboardLineMaterial for why that is all it
    // takes to hold it still — and a zero lean scale keeps it out of the
    // lean too.
    pivots.push(ax, az, 0, bx, bz, 0);
  };

  const halfWidth = panelWidth / 2;
  const postX = halfWidth * LEG_INSET_FRACTION;
  const panelBottom = LEG_HEIGHT;
  const panelTop = LEG_HEIGHT + panelHeight;

  for (const side of [-1, 1] as const) {
    const center = side * postX;
    const inner = center - POST_WIDTH / 2;
    const outer = center + POST_WIDTH / 2;

    // Post drawn as a narrow rectangle rather than one line, so it keeps
    // a visible thickness at the scene's low internal render resolution.
    segment(inner, 0, 0, inner, panelBottom, 0);
    segment(outer, 0, 0, outer, panelBottom, 0);
    segment(inner, panelBottom, 0, outer, panelBottom, 0);
    // Footing pad, a touch above ground so it can't z-fight with it.
    segment(center - POST_WIDTH * 1.9, 0.012, 0, center + POST_WIDTH * 1.9, 0.012, 0);
  }

  // Cross-bracing between the posts — the detail that most makes this
  // read as a built structure rather than a sign on two sticks.
  const braceLow = LEG_HEIGHT * 0.14;
  const braceHigh = LEG_HEIGHT * 0.74;
  segment(-postX, braceLow, 0, postX, braceHigh, 0);
  segment(postX, braceLow, 0, -postX, braceHigh, 0);
  segment(-postX, LEG_HEIGHT * 0.44, 0, postX, LEG_HEIGHT * 0.44, 0);

  // Bezel around the picture.
  const frameX = halfWidth + FRAME_MARGIN;
  const frameBottom = panelBottom - FRAME_MARGIN;
  const frameTop = panelTop + FRAME_MARGIN;
  segment(-frameX, frameTop, 0, frameX, frameTop, 0);
  segment(frameX, frameTop, 0, frameX, frameBottom, 0);
  segment(frameX, frameBottom, 0, -frameX, frameBottom, 0);
  segment(-frameX, frameBottom, 0, -frameX, frameTop, 0);

  // Maintenance catwalk slung under the picture, on two brackets.
  const catwalkY = frameBottom - CATWALK_DROP;
  const catwalkX = frameX * 1.04;
  segment(-catwalkX, catwalkY, 0, catwalkX, catwalkY, 0);
  for (const side of [-1, 1] as const) {
    segment(side * frameX * 0.72, frameBottom, 0, side * frameX * 0.72, catwalkY, 0);
  }

  // Gooseneck lamps along the top edge: an upright arm, a neck reaching
  // out over the picture, and the head itself as a bar across the view
  // (the part that carries the warm color).
  for (let i = 0; i < LAMP_COUNT; i++) {
    const x = -halfWidth + ((i + 0.5) / LAMP_COUNT) * panelWidth;
    const armTop = frameTop + LAMP_ARM_HEIGHT;
    const headY = armTop - LAMP_ARM_HEIGHT * 0.2;
    segment(x, frameTop, 0, x, armTop, 0);
    segment(x, armTop, 0, x, headY, LAMP_REACH);
    segment(x - LAMP_HEAD_HALF, headY, LAMP_REACH, x + LAMP_HEAD_HALF, headY, LAMP_REACH, lampColor);
  }

  // The panel's own figure, merged into this same buffer — see
  // createCharacter.ts for why it isn't its own object.
  pushCharacter(
    positions,
    colors,
    pivots,
    placeCharacter(options.seed, panelWidth),
    structureColor,
    options.accent ? new THREE.Color(options.accent) : structureColor,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aPivot", new THREE.Float32BufferAttribute(pivots, 3));
  group.add(new THREE.LineSegments(geometry, createBillboardLineMaterial()));

  return group;
}
