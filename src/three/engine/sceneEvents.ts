/**
 * Tiny scene -> UI event bus.
 *
 * The 3D engine runs its own render loop outside React; rather than
 * pushing per-frame camera state through React state (and re-rendering
 * components 60x/sec), it dispatches plain DOM CustomEvents here. HUD
 * components (Minimap, ...) subscribe and update their own DOM nodes
 * imperatively, so nothing above the canvas re-renders on scroll/zoom/pan.
 */
export const sceneEvents = new EventTarget();

export interface ViewChangeDetail {
  /** 0 = fully zoomed out (whole plaza visible), 1 = fully zoomed in. */
  normalized: number;
  /**
   * Current drag-to-pan offset, each axis normalized to [-1, 1] against
   * its CAMERA_PAN_BOUNDS (see engine/constants.ts) — how the Minimap's
   * indicator positions itself, not just sizes itself.
   */
  pan: { x: number; y: number };
}

export const VIEW_CHANGE_EVENT = "scene:viewchange";
