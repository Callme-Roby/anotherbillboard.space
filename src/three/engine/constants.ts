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
// y=3.7 roughly centers the central building (towers + its rooftop-mounted
// rank screens, the tallest of which reaches ~y=11.1 — see
// createCentralBuilding.ts) vertically at the default zoom, while still
// keeping ground panels comfortably in frame below. Re-verify visually
// after changing building heights or mount heights — this is a "looks
// right in a screenshot" number, not derived from a formula.
export const CAMERA_LOOK_AT = new THREE.Vector3(0, 3.7, 0);
export const CAMERA_DIRECTION = new THREE.Vector3(0, 0, 1);
export const CAMERA_FIXED_DISTANCE = 30;
// Desktop-tuned zoom-out floor. The *effective* min zoom used at runtime
// is `min(this, an aspect-ratio-driven bound)` — see
// CameraController.computeAspectMinZoom() — so a narrow/tall mobile
// viewport zooms out further than this to still fit the same world width
// (same vertical FOV but a smaller aspect ratio means a narrower
// horizontal frustum at any given zoom, which otherwise crops the sides
// on mobile — reported directly against the running site).
export const CAMERA_MIN_ZOOM = 0.6;
// Absolute floor under the aspect-driven bound above, so a pathologically
// narrow viewport can't compute a near-zero (or negative-frustum) zoom.
// Low on purpose: CAMERA_OVERVIEW_HALF_WIDTH evaluated at
// CAMERA_OVERVIEW_CONTENT_Z's depth already legitimately computes ~0.15
// for an ordinary phone aspect ratio (see computeAspectMinZoom) — this
// floor exists only for genuinely degenerate viewports, not normal ones.
export const CAMERA_ABSOLUTE_MIN_ZOOM = 0.05;
export const CAMERA_MAX_ZOOM = 2.5;
export const CAMERA_INITIAL_ZOOM = 1;
/** Higher = snappier damping toward the scroll/drag target (0-1 per frame @60fps). */
export const CAMERA_DAMPING = 0.08;
/** Multiplicative zoom step per wheel deltaY unit (exponential, not linear — see CameraController). */
export const CAMERA_ZOOM_SPEED = 0.0015;
// World-space half-width (x) that must stay visible at maximum zoom-out,
// on *any* viewport aspect ratio — the whole "home" scene (building
// cluster + ground panel row + the off-center signature panel, see
// SIGNATURE_PANEL_X/Z below), not just whatever CAMERA_MIN_ZOOM happens
// to show on a wide desktop aspect ratio. Drives computeAspectMinZoom().
export const CAMERA_OVERVIEW_HALF_WIDTH = 18;
// The depth (z) that CAMERA_OVERVIEW_HALF_WIDTH is solved at — must be
// the closest-to-camera depth among the "must stay visible" content
// (here, the signature panel's own z; the ground panel row sits at a
// similar depth, see placeholders/layout.ts, and needs much less width
// so it isn't the binding constraint). This *must* be a real distance
// from the camera, not the arbitrary CAMERA_LOOK_AT/CAMERA_FIXED_DISTANCE
// reference plane (z=0): perspective makes closer content project wider
// per world-unit, so solving the fit at the wrong (farther) depth
// under-zooms-out and still crops the sides — caught by actually
// checking whether the signature panel was reachable without panning,
// not by the formula looking right on paper.
export const CAMERA_OVERVIEW_CONTENT_Z = 8;
// How far the drag-to-pan view center may drift from CAMERA_LOOK_AT on
// each axis, so panning lets you explore the whole scene without ever
// drifting off into empty, content-free space.
export const CAMERA_PAN_BOUNDS = { x: 16, y: 7 };

// --- Fixed signature panel ("Built by Roby") ---------------------------
// Shared with SceneManager (where it's placed) and CAMERA_OVERVIEW_* above
// (which needs its depth to size the mobile zoom-out floor correctly) so
// the two can't silently drift apart.
export const SIGNATURE_PANEL_X = -15;
export const SIGNATURE_PANEL_Z = 8;

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
