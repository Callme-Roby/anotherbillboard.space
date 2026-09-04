import * as THREE from "three";

/** Scene background — a dark neutral that suits the CRT/night mood. */
export const BACKGROUND_COLOR = 0x0d0f12;

// --- Camera -----------------------------------------------------------
// Perspective, but zoomed like a real camera lens rather than dollied:
// the camera position is fixed (set once, never moves) and scroll only
// ever changes `camera.zoom`. On PerspectiveCamera that's mathematically
// equivalent to narrowing the FOV at a fixed position — verified
// against three.js's source (updateProjectionMatrix computes the
// frustum from `fov / zoom`) — a real zoom-lens effect, not a dolly.
// A moderate base FOV keeps some real perspective depth/parallax
// (full orthographic read as "too flat") without it being dramatic.
export const CAMERA_FOV = 30;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 200;
// Level, head-on view — camera sits at the same height as the look-at
// target and faces it straight on (direction has no Y component), no
// elevated/looking-down tilt.
// y=5.5 roughly centers the central building (towers + its rooftop-mounted
// rank screens, the tallest of which now reaches ~y=12.9 — see
// createCentralBuilding.ts) vertically at the default zoom, while still
// keeping ground panels comfortably in frame below.
export const CAMERA_LOOK_AT = new THREE.Vector3(0, 5.5, 0);
export const CAMERA_DIRECTION = new THREE.Vector3(0, 0, 1);
export const CAMERA_FIXED_DISTANCE = 30;
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
