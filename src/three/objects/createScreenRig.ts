import * as THREE from "three";

import type { PlaceholderPanel } from "../placeholders/mockPanels";
import { createPanelMesh } from "./createPanel";

/** Screen bezel — same black as every silhouette outline in the scene. */
const FRAME_COLOR = 0x0a0a0a;
/** LED trim along a screen's edge, matching the towers' roof spots. */
const TRIM_COLOR = 0xf2a541;

/** How far the frame stands outside the picture it surrounds. */
export const FRAME_MARGIN = 0.06;
/** How far a rig floats off the wall it's bolted to (its struts' length). */
export const SCREEN_STANDOFF = 0.09;

/**
 * How a rank's screen is mounted on its tower. Four genuinely different
 * silhouettes rather than four sizes of the same rectangle — the point
 * of a Times Square skyline is that no two spectaculars are built the
 * same way:
 *
 * - `wrap`   picture turns the building's corner onto the side face
 * - `banner` tall portrait ribbon running up the shaft
 * - `stack`  main screen with a separate ticker strip under it
 * - `crown`  screen raised above the roofline on legs, tilted back
 *
 * Every one of them is still just flat textured planes (see
 * createPanel.ts) — real screens drop straight into these mounts once
 * panels are DB-backed, no per-shape special casing.
 */
export type ScreenRigKind = "wrap" | "banner" | "stack" | "crown";

export interface ScreenRigSpec {
  kind: ScreenRigKind;
  /** Main face size. Deliberately allowed to overhang its host tower. */
  width: number;
  height: number;
  /** `wrap`: how far the picture continues around the corner. */
  wrapDepth?: number;
  /** `wrap`: which corner it turns — 1 = right (+X), -1 = left (-X). */
  wrapSide?: 1 | -1;
  /** `stack`: height of the ticker strip hung under the main screen. */
  tickerHeight?: number;
}

/**
 * Builds one mounted screen. The returned group's origin is the center
 * of the main face, which lies in the local z=0 plane facing +Z, so a
 * caller positions it by "where on the facade should this screen's
 * middle sit" without knowing anything about the rig's shape.
 */
export function createScreenRig(panel: PlaceholderPanel, spec: ScreenRigSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = `screen-rig-${spec.kind}-${panel.id}`;

  const frame: number[] = [];
  const trim: number[] = [];

  const main = createPanelMesh(panel, { width: spec.width, height: spec.height });
  group.add(main);
  pushFrame(frame, spec.width, spec.height);

  switch (spec.kind) {
    case "wrap": {
      const depth = spec.wrapDepth ?? spec.width * 0.4;
      const side = spec.wrapSide ?? 1;
      // Hinged on the main face's own edge, turning back along -Z. The
      // hinge is the *screen's* corner, not the tower's: these screens
      // overhang their tower on purpose, exactly like a real corner
      // spectacular built on a frame that stands proud of the facade.
      const returnFace = createPanelMesh(panel, { width: depth, height: spec.height });
      returnFace.position.set((side * spec.width) / 2, 0, -depth / 2);
      // +Z (the plane's front) rotates onto ±X, so the picture faces out
      // of the side it wrapped onto rather than into the building.
      returnFace.rotation.y = (side * Math.PI) / 2;
      group.add(returnFace);
      // Trim runs the full wrapped length, across the corner — what
      // makes the two faces read as one screen bent round the building
      // instead of two screens that happen to meet.
      const bottom = -spec.height / 2 - FRAME_MARGIN;
      const edge = (side * spec.width) / 2;
      trim.push(-edge, bottom, 0, edge, bottom, 0, edge, bottom, 0, edge, bottom, -depth);
      break;
    }

    case "banner": {
      // Vertical light strips down both long edges — a portrait ribbon
      // needs its own edge to read at a distance, since it's narrow
      // enough that the frame alone nearly vanishes at low resolution.
      const x = spec.width / 2 + FRAME_MARGIN;
      const y = spec.height / 2;
      trim.push(-x, -y, 0, -x, y, 0, x, -y, 0, x, y, 0);
      break;
    }

    case "stack": {
      const tickerHeight = spec.tickerHeight ?? spec.height * 0.22;
      const tickerWidth = spec.width * 0.92;
      const gap = tickerHeight * 0.5;
      const tickerY = -(spec.height / 2 + gap + tickerHeight / 2);

      const ticker = createPanelMesh(panel, { width: tickerWidth, height: tickerHeight });
      ticker.position.y = tickerY;
      group.add(ticker);
      pushFrame(frame, tickerWidth, tickerHeight, tickerY);

      // The gap is structural, so show the structure: two short hangers
      // between the main screen and the strip it carries.
      for (const side of [-1, 1] as const) {
        const x = side * tickerWidth * 0.42;
        frame.push(x, -spec.height / 2, 0, x, tickerY + tickerHeight / 2, 0);
      }
      break;
    }

    case "crown": {
      // Raised above the roofline on legs and tilted back, so it reads
      // against the sky from below rather than flat-on.
      group.rotation.x = -0.1;
      const legTop = -spec.height / 2 - FRAME_MARGIN;
      const legBottom = legTop - spec.height * 0.3;
      for (const side of [-1, 1] as const) {
        const x = side * spec.width * 0.34;
        frame.push(x, legTop, 0, x, legBottom, 0);
      }
      frame.push(-spec.width * 0.34, legBottom, 0, spec.width * 0.34, legBottom, 0);
      const topY = spec.height / 2 + FRAME_MARGIN;
      trim.push(-spec.width / 2, topY, 0, spec.width / 2, topY, 0);
      break;
    }
  }

  // Mounting struts back to the wall, on every rig that hangs off one.
  if (spec.kind !== "crown") {
    for (const side of [-1, 1] as const) {
      const x = side * spec.width * 0.36;
      const y = spec.height * 0.34;
      frame.push(x, y, 0, x, y, -SCREEN_STANDOFF);
      frame.push(x, -y, 0, x, -y, -SCREEN_STANDOFF);
    }
  }

  group.add(lineSegments(frame, FRAME_COLOR));
  if (trim.length > 0) group.add(lineSegments(trim, TRIM_COLOR));

  return group;
}

/** Bezel rectangle just outside a screen face, in the z=0 plane. */
function pushFrame(out: number[], width: number, height: number, centerY = 0): void {
  const x = width / 2 + FRAME_MARGIN;
  const top = centerY + height / 2 + FRAME_MARGIN;
  const bottom = centerY - height / 2 - FRAME_MARGIN;
  out.push(
    -x, top, 0, x, top, 0,
    x, top, 0, x, bottom, 0,
    x, bottom, 0, -x, bottom, 0,
    -x, bottom, 0, -x, top, 0,
  );
}

function lineSegments(positions: number[], color: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}
