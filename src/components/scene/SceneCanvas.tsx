"use client";

import { useEffect, useRef } from "react";

import { SceneManager } from "@/three/engine/SceneManager";

/**
 * Mounts the single Three.js engine into a full-viewport container.
 * Everything GPU/DOM-related lives inside SceneManager and only runs
 * client-side, inside this effect. The (rare) WebGL-init-failure message
 * is toggled imperatively rather than through React state, since it's
 * the outcome of a synchronous external-system call, not derived UI state.
 */
export function SceneCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let manager: SceneManager | null = null;
    try {
      manager = new SceneManager({ container });
    } catch (err) {
      console.error("[scene] failed to initialize the 3D scene", err);
      // Inline style (not the `hidden` attribute) so it reliably wins over
      // the `flex` utility class below regardless of Tailwind's cascade
      // order — both are same-specificity selectors otherwise.
      if (errorRef.current) errorRef.current.style.display = "flex";
    }

    return () => manager?.dispose();
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black">
      <p
        ref={errorRef}
        style={{ display: "none" }}
        className="h-full w-full items-center justify-center px-6 text-center font-mono text-sm text-white/70"
      >
        Impossible d&rsquo;initialiser le rendu 3D (WebGL indisponible).
      </p>
    </div>
  );
}
