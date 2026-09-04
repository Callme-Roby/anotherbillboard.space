/**
 * Tiny scene -> UI event bus.
 *
 * The 3D engine runs its own render loop outside React; rather than
 * pushing per-frame camera state through React state (and re-rendering
 * components 60x/sec), it dispatches plain DOM CustomEvents here. HUD
 * components (Minimap, ...) subscribe and update their own DOM nodes
 * imperatively, so nothing above the canvas re-renders on scroll/zoom.
 */
export const sceneEvents = new EventTarget();

export interface ZoomChangeDetail {
  /** 0 = fully zoomed out (whole plaza visible), 1 = fully zoomed in. */
  normalized: number;
}

export const ZOOM_CHANGE_EVENT = "scene:zoomchange";
