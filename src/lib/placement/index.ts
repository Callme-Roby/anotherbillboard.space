import { PANEL_ASPECT_RATIO } from "../economy";

export interface PlacedPanel {
  positionX: number;
  positionY: number;
  size: number;
}

const GAP = 0.4; // minimum clearance between panel bounding circles
const ANGLE_STEP = 0.5; // radians per spiral iteration
const RADIUS_STEP = 0.6; // world units the spiral grows per full turn
const MIN_RADIUS = 5; // keep clear of the central building's footprint
const MAX_ITERATIONS = 20_000;

/**
 * Finds a non-overlapping ground position for a new panel of the given
 * `size`, spiralling outward from the plaza center so the site fills in
 * from the middle out as more panels are purchased.
 *
 * Panels are approximated as bounding circles (radius = half the wider
 * dimension, i.e. half the *width* since panels are landscape) rather
 * than exact rectangles — simpler collision math, at the cost of some
 * wasted space versus true rectangle packing. Only ground panels
 * (`buildingId IS NULL`) participate; building screens are placed by
 * their fixed `slotIndex` on their building instead.
 *
 * O(existing.length) per candidate point, so worst case O(n) candidates
 * x O(n) existing panels = O(n²) for the nth placement. Fine up to at
 * least a few thousand panels; a spatial grid/quadtree would be the
 * next step if that ever becomes the bottleneck.
 */
export function findGroundPlacement(
  existing: PlacedPanel[],
  newSize: number,
): { positionX: number; positionY: number } {
  const newRadius = radiusOf(newSize);

  let radius = MIN_RADIUS;
  let angle = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    if (!collidesWithAny(x, y, newRadius, existing)) {
      return { positionX: x, positionY: y };
    }

    angle += ANGLE_STEP;
    if (angle >= Math.PI * 2) {
      angle -= Math.PI * 2;
      radius += RADIUS_STEP;
    }
  }

  // Should be unreachable in practice (the spiral radius grows without
  // bound), but never leave a purchase unplaced — push it out past
  // everything else along a deterministic angle instead of failing.
  const fallbackRadius = MIN_RADIUS + existing.length * RADIUS_STEP;
  return { positionX: fallbackRadius, positionY: 0 };
}

function radiusOf(size: number): number {
  return (size * PANEL_ASPECT_RATIO) / 2;
}

function collidesWithAny(x: number, y: number, radius: number, existing: PlacedPanel[]): boolean {
  for (const panel of existing) {
    const dx = x - panel.positionX;
    const dy = y - panel.positionY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = radius + radiusOf(panel.size) + GAP;
    if (distance < minDistance) return true;
  }
  return false;
}
