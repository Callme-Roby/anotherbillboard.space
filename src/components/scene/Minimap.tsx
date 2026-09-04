"use client";

import { useEffect, useRef } from "react";

import { sceneEvents, VIEW_CHANGE_EVENT, type ViewChangeDetail } from "@/three/engine/sceneEvents";

/**
 * Transparent rectangle, bottom-left: outer box is the overall plaza
 * bounds, inner box is the area currently visible at the camera's zoom
 * level, shifted to reflect the current drag-to-pan position. Updated
 * imperatively from scene events (see sceneEvents.ts) so scroll/pinch/
 * drag-driven view changes never trigger a React re-render here.
 *
 * Only the pan's x axis moves the indicator: this is a top-down (x/z)
 * map of the plaza, and pan's y axis tilts the camera's vertical framing
 * (look more toward rooftops or the ground) rather than moving it to a
 * different spot in the plaza — nothing a top-down map can represent, so
 * it's deliberately left out rather than shown as a misleading shift.
 */
export function Minimap() {
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleViewChange(event: Event) {
      const { normalized, pan } = (event as CustomEvent<ViewChangeDetail>).detail;
      const el = indicatorRef.current;
      if (!el) return;
      // Indicator shrinks toward the center as the camera zooms in.
      const scale = 1 - normalized * 0.7;
      // `translate()` percentages resolve against the indicator's own
      // (unscaled) box regardless of the `scale()` alongside it, and
      // that box is the same size as its parent (h-full w-full) — so
      // "pan.x * 50%" here doubles as "50% of the parent", letting this
      // shift the indicator toward the parent's edge as pan approaches
      // its clamped bounds (±1).
      el.style.transform = `translate(calc(-50% + ${pan.x * 50}%), -50%) scale(${scale})`;
    }

    sceneEvents.addEventListener(VIEW_CHANGE_EVENT, handleViewChange);
    return () => sceneEvents.removeEventListener(VIEW_CHANGE_EVENT, handleViewChange);
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-[calc(1rem+var(--safe-bottom))] left-[calc(1rem+var(--safe-left))] h-16 w-24 overflow-hidden border border-white/30 bg-black/30 backdrop-blur-sm sm:h-24 sm:w-32"
      aria-hidden="true"
    >
      <div
        ref={indicatorRef}
        className="absolute left-1/2 top-1/2 h-full w-full border border-white/70 bg-white/10 transition-transform duration-150 ease-out"
        style={{ transform: "translate(-50%, -50%) scale(1)" }}
      />
    </div>
  );
}
