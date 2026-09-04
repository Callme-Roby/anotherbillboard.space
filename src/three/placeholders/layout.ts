export interface GroundPosition {
  x: number;
  z: number;
}

/**
 * Placeholder plaza layout: fans panels out across an arc facing the
 * camera's default viewing direction (+Z), staggered across a few radius
 * bands. This stands in for the real placement algorithm (which will
 * fill `panels.position_x` / `position_y`, considering amount ranking,
 * category, and collision packing) — isolated here so it's a one-file
 * swap later.
 */
export function placeholderArcLayout(
  count: number,
  options?: { innerRadius?: number; outerRadius?: number; spreadDegrees?: number },
): GroundPosition[] {
  const innerRadius = options?.innerRadius ?? 6;
  const outerRadius = options?.outerRadius ?? 13;
  const spread = ((options?.spreadDegrees ?? 150) * Math.PI) / 180;

  const positions: GroundPosition[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = -spread / 2 + t * spread;
    const radius = innerRadius + ((i % 3) / 3) * (outerRadius - innerRadius);
    positions.push({
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius,
    });
  }
  return positions;
}
