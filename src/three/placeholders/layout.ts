export interface GroundPosition {
  x: number;
  z: number;
}

/**
 * Placeholder plaza layout: a single row facing the camera, spaced by
 * each panel's actual width so nothing overlaps. This stands in for the
 * real placement algorithm (which will fill `panels.position_x` /
 * `position_y`, considering amount ranking, category, and collision
 * packing) — isolated here so it's a one-file swap later.
 *
 * A single row (rather than staggered depth/radius bands) is deliberate:
 * the camera is level and head-on, so panels placed at different depths
 * would occlude each other in screen space instead of visually
 * separating the way they would under an elevated, angled camera.
 */
export function placeholderRowLayout(
  widths: number[],
  options?: { gap?: number; z?: number },
): GroundPosition[] {
  const gap = options?.gap ?? 0.6;
  const z = options?.z ?? 9;

  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
  let cursor = -totalWidth / 2;

  return widths.map((width) => {
    const x = cursor + width / 2;
    cursor += width + gap;
    return { x, z };
  });
}
