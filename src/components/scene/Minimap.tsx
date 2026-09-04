"use client";

import { useEffect, useRef } from "react";

import { sceneEvents, ZOOM_CHANGE_EVENT, type ZoomChangeDetail } from "@/three/engine/sceneEvents";

/**
 * Transparent rectangle, bottom-left: outer box is the overall plaza
 * bounds, inner box is the area currently visible at the camera's zoom
 * level. Updated imperatively from scene events (see sceneEvents.ts) so
 * scroll-driven zoom never triggers a React re-render here.
 */
export function Minimap() {
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleZoomChange(event: Event) {
      const { normalized } = (event as CustomEvent<ZoomChangeDetail>).detail;
      const el = indicatorRef.current;
      if (!el) return;
      // Indicator shrinks toward the center as the camera zooms in.
      const scale = 1 - normalized * 0.7;
      el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    sceneEvents.addEventListener(ZOOM_CHANGE_EVENT, handleZoomChange);
    return () => sceneEvents.removeEventListener(ZOOM_CHANGE_EVENT, handleZoomChange);
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 h-24 w-32 overflow-hidden border border-white/30 bg-black/30 backdrop-blur-sm"
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
