import * as THREE from "three";

/** Scene background — a dark neutral that suits the CRT/night mood. */
export const BACKGROUND_COLOR = 0x0d0f12;

// --- Camera -----------------------------------------------------------
// Navigation is scroll-driven dolly zoom: the camera slides along a fixed
// direction toward/away from a fixed look-at target. Because it's a real
// perspective dolly (not a 2D pan trick), near/far layers naturally
// parallax against each other as the distance changes.
export const CAMERA_FOV = 45;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 200;
// Kept clear of the central building's base tier (6x6, front face at
// z=3): with CAMERA_DIRECTION purely horizontal, distance == camera.z,
// so 10 leaves a clear 7 units in front of that face.
export const CAMERA_MIN_DISTANCE = 10;
export const CAMERA_MAX_DISTANCE = 40;
// Wide enough for the default view to fit the whole mock panel row
// without needing to scroll out first (a level camera has less width
// to work with than the old elevated one, since there's no downward
// angle compressing distant width into the frame).
export const CAMERA_INITIAL_DISTANCE = 28;
/** Higher = snappier damping toward the scroll target (0-1 per frame @60fps). */
export const CAMERA_DAMPING = 0.08;
/** Wheel deltaY -> distance units. */
export const CAMERA_ZOOM_SPEED = 0.015;
// Level, head-on view — camera sits at the same height as the look-at
// target and faces it straight on (direction has no Y component), no
// elevated/looking-down tilt.
export const CAMERA_LOOK_AT = new THREE.Vector3(0, 2, 0);
export const CAMERA_DIRECTION = new THREE.Vector3(0, 0, 1);

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
