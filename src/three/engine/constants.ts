import * as THREE from "three";

/** Scene background — a dark neutral that suits the CRT/night mood. */
export const BACKGROUND_COLOR = 0x0d0f12;

// --- Camera -----------------------------------------------------------
// Orthographic, not perspective: navigation is a true zoom (the view
// frustum's size changes) rather than a dolly (the camera physically
// moving closer). The camera position is fixed — scroll only ever
// changes `camera.zoom` — which is also what gives the flatter,
// poster-like look with no perspective foreshortening, distinct from a
// perspective camera just moved far away with a narrow FOV.
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 200;
// Level, head-on view — camera sits at the same height as the look-at
// target and faces it straight on (direction has no Y component), no
// elevated/looking-down tilt. Orthographic projection means the exact
// distance along that direction doesn't affect framing at all (unlike a
// dolly) — it only needs to clear the near/far planes.
// y=4 roughly centers the (taller, clustered-tower) central building
// vertically while still keeping ground panels comfortably in frame.
export const CAMERA_LOOK_AT = new THREE.Vector3(0, 4, 0);
export const CAMERA_DIRECTION = new THREE.Vector3(0, 0, 1);
export const CAMERA_FIXED_DISTANCE = 30;
// Half-height of the ortho frustum at zoom=1 — the base "how much world
// is visible" scale that CAMERA_MIN_ZOOM/MAX_ZOOM then divide into.
export const CAMERA_VIEW_HEIGHT = 13;
export const CAMERA_MIN_ZOOM = 0.6;
export const CAMERA_MAX_ZOOM = 2.5;
export const CAMERA_INITIAL_ZOOM = 1;
/** Higher = snappier damping toward the scroll target (0-1 per frame @60fps). */
export const CAMERA_DAMPING = 0.08;
/** Multiplicative zoom step per wheel deltaY unit (exponential, not linear — see CameraController). */
export const CAMERA_ZOOM_SPEED = 0.0015;

// --- Post-processing ----------------------------------------------------
// Internal render resolution as a fraction of the real viewport. The
// scene is rendered at this (low) resolution into a NEAREST-filtered
// render target, then the CRT pass upscales it into the full-resolution
// canvas — that mismatch is what produces the blocky PS1-style pixel
// grid, "for free", instead of a blur filter faking it.
export const INTERNAL_RESOLUTION_SCALE = 0.3;
export const CRT_SCANLINE_INTENSITY = 0.15;
export const CRT_VIGNETTE_STRENGTH = 0.35;
export const CRT_ABERRATION_STRENGTH = 0.0025;

// --- Ground / plaza -----------------------------------------------------
export const GROUND_SIZE = 80;
