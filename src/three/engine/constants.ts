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
// z=3): at CAMERA_DIRECTION's pitch, distance 10 puts the camera ~5
// units past that face instead of pressed almost against it.
export const CAMERA_MIN_DISTANCE = 10;
export const CAMERA_MAX_DISTANCE = 34;
export const CAMERA_INITIAL_DISTANCE = 20;
/** Higher = snappier damping toward the scroll target (0-1 per frame @60fps). */
export const CAMERA_DAMPING = 0.08;
/** Wheel deltaY -> distance units. */
export const CAMERA_ZOOM_SPEED = 0.015;
export const CAMERA_LOOK_AT = new THREE.Vector3(0, 3, 0);
export const CAMERA_DIRECTION = new THREE.Vector3(0, 0.55, 1).normalize();

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
