import * as THREE from "three";

/**
 * Where the pointer is across the canvas, as -1 (left edge) to +1
 * (right edge), damped.
 *
 * Damped rather than followed exactly: the crowd walks toward this (see
 * Crowd.ts), and a target that snaps to the cursor makes them read as a
 * mechanism rather than as people drifting your way.
 */
export interface PointerTracker {
  /** Latest damped position, -1 to 1. */
  readonly x: number;
  update: (delta: number) => void;
  dispose: () => void;
}

/** Per-frame follow rate at 60fps; frame-rate independent below. */
const DAMPING = 0.1;

export function createPointerTracker(element: HTMLElement): PointerTracker {
  let target = 0;
  let current = 0;

  const handlePointerMove = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) return;
    const across = (event.clientX - rect.left) / rect.width;
    target = THREE.MathUtils.clamp(across * 2 - 1, -1, 1);
  };

  // Pointer gone (or a touch lifted): back to centre, so the crowd walks
  // home rather than staying bunched at whichever edge it last saw.
  const handlePointerOut = () => {
    target = 0;
  };

  element.addEventListener("pointermove", handlePointerMove, { passive: true });
  element.addEventListener("pointerleave", handlePointerOut, { passive: true });
  element.addEventListener("pointercancel", handlePointerOut, { passive: true });

  return {
    get x() {
      return current;
    },
    update: (delta: number) => {
      current += (target - current) * (1 - Math.pow(1 - DAMPING, delta * 60));
    },
    dispose: () => {
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerleave", handlePointerOut);
      element.removeEventListener("pointercancel", handlePointerOut);
    },
  };
}
