import * as THREE from "three";

/**
 * Scene background — a white leaning very slightly grey. Deliberately
 * neutral rather than the warm "blanc cassé" it replaces, which read as
 * beige. Must stay in sync with `--background` in app/globals.css and
 * `themeColor` in app/layout.tsx: the page behind the canvas, the ground
 * plane, the sky and the CRT pass's out-of-screen bezel are all this
 * exact value, which is what lets them read as one continuous surface
 * (and what the shader's content mask compares against — see
 * crtShader.ts).
 */
export const BACKGROUND_COLOR = 0xf4f4f5;

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
// y=4.2 roughly centers the skyline (the five towers plus the rotating
// announcement summit above the tallest, whose screens top out at
// ~y=10.6 — see SKYLINE in createCentralBuilding.ts) vertically at the
// default zoom, while still keeping ground panels comfortably in frame
// below. Re-verify visually after changing building heights or mount/
// screen sizes — this is a "looks right in a screenshot" number, not
// derived from a formula.
export const CAMERA_LOOK_AT = new THREE.Vector3(0, 4.2, 0);
export const CAMERA_DIRECTION = new THREE.Vector3(0, 0, 1);
export const CAMERA_FIXED_DISTANCE = 30;
// Desktop-tuned zoom-out floor. The *effective* min zoom used at runtime
// is `min(this, an aspect-ratio-driven bound)` — see
// CameraController.computeAspectMinZoom() — so a narrow/tall mobile
// viewport zooms out further than this to still fit the same world width
// (same vertical FOV but a smaller aspect ratio means a narrower
// horizontal frustum at any given zoom, which otherwise crops the sides
// on mobile — reported directly against the running site).
export const CAMERA_MIN_ZOOM = 0.55;
// Absolute floor under the aspect-driven bound above, so a pathologically
// narrow viewport can't compute a near-zero (or negative-frustum) zoom.
// Low on purpose: CAMERA_OVERVIEW_HALF_WIDTH evaluated at
// CAMERA_OVERVIEW_CONTENT_Z's depth already legitimately computes ~0.15
// for an ordinary phone aspect ratio (see computeAspectMinZoom) — this
// floor exists only for genuinely degenerate viewports, not normal ones.
export const CAMERA_ABSOLUTE_MIN_ZOOM = 0.05;
export const CAMERA_MAX_ZOOM = 2.5;
// World half-width the landing view frames, solved at
// CAMERA_OVERVIEW_CONTENT_Z for whatever aspect ratio the window has
// (see CameraController.fitZoomFor) instead of a fixed starting zoom.
// Sized to include the signature panel off to the left — arriving on the
// site should show the whole place, signature included, not a crop of
// the middle that hides it until you think to pan.
export const CAMERA_LANDING_HALF_WIDTH = 13.5;
/** Higher = snappier damping toward the scroll/drag target (0-1 per frame @60fps). */
export const CAMERA_DAMPING = 0.08;
/** Multiplicative zoom step per wheel deltaY unit (exponential, not linear — see CameraController). */
export const CAMERA_ZOOM_SPEED = 0.0015;
// World-space half-width (x) that must stay visible at maximum zoom-out,
// on *any* viewport aspect ratio — the whole "home" scene (building
// cluster + ground panel row + the off-center signature panel, see
// SIGNATURE_PANEL_X/Z below), not just whatever CAMERA_MIN_ZOOM happens
// to show on a wide desktop aspect ratio. Drives computeAspectMinZoom().
export const CAMERA_OVERVIEW_HALF_WIDTH = 16;
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
// Pulled in from -15: at that distance the signature only ever appeared
// at the very edge of the widest zoom-out, so framing the landing view
// around it would have meant a view too wide for everything else.
export const SIGNATURE_PANEL_X = -11.5;
export const SIGNATURE_PANEL_Z = 8;

// --- Post-processing ----------------------------------------------------
// Internal render resolution as a fraction of the real viewport. The
// scene is rendered at this (low) resolution into a NEAREST-filtered
// render target, then the CRT pass upscales it into the full-resolution
// canvas — that mismatch is what produces the blocky PS1-style pixel
// grid, "for free", instead of a blur filter faking it. Raised twice now
// (0.3 -> 0.42 -> this): each shape's black EdgesGeometry outline is
// ~1 texel wide regardless of this value (WebGL effectively ignores
// LineBasicMaterial.linewidth on most platforms), so it's *this*
// resolution — not the line material — that determines how many real
// screen pixels that texel gets upscaled to, and thus how thick outlines
// read; asked for visibly thinner lines, raised again rather than
// switching outlines to a heavier true-width-line material. Still keeps
// a real pixel-staircase look on edges at this value, not smooth
// antialiasing — checked on screen, not assumed from the number alone.
export const INTERNAL_RESOLUTION_SCALE = 0.6;
// This internal resolution is otherwise fixed relative to the *viewport*
// only, not the camera's zoom — since geometry shrinks on screen as the
// camera zooms out, the same fixed pixel grid then covers each edge with
// fewer texels, so straight lines read as coarser/thicker relative to
// the (now smaller) object the further out you zoom — reported directly
// against the running site as outlines visibly "growing" on zoom-out.
// Compensated here by scaling resolution up as `zoom` drops below 1 (see
// PostProcessing.internalResolution) — throttled to only actually resize
// the render target when the *rounded* pixel count changes, not every
// frame, since reallocating a WebGLRenderTarget isn't free.
//
// Deliberately partial (sqrt, not linear) and capped: full 1:1
// compensation (scale by `1/zoom` exactly) was tried and made the
// pixelation nearly disappear at max zoom-out, defeating the look this
// is meant to have in the first place — checked by actually zooming out
// and looking, not assumed from the formula.
export const ZOOM_RESOLUTION_COMPENSATION_EXPONENT = 0.5;
export const ZOOM_RESOLUTION_COMPENSATION_MAX = 1.8;
export const CRT_SCANLINE_INTENSITY = 0.15;
// Scanlines slowly drift downward over time (radians of phase per
// second) rather than sitting static — part of making the CRT look feel
// alive rather than a frozen filter. Slow on purpose: this is meant to
// read as an old tube's imperfect vertical sync, not a strobe.
export const CRT_SCANLINE_SCROLL_SPEED = 1.6;
// Subtle brightness wobble over time (two incommensurate sine waves so
// it doesn't read as a mechanical pulse) — an old tube's imperfect power
// supply, not a strobe effect. Deliberately small: this is a brightness
// dither of a few percent, not a flash — kept well clear of anything
// that could read as a seizure-risk flicker.
export const CRT_FLICKER_STRENGTH = 0.03;
export const CRT_VIGNETTE_STRENGTH = 0.35;
export const CRT_ABERRATION_STRENGTH = 0.0025;
// Barrel/screen curvature — the picture bulges as if seen through curved
// CRT glass, sampled progressively further out toward the corners (see
// crtShader.ts). Outside the curved screen renders in uBezelColor
// (BACKGROUND_COLOR — see PostProcessing.ts) rather than a stretched/
// clamped edge, so the curve reads as part of the scene rather than a
// stray black frame. 0 = flat/off; ~0.1-0.2 is a convincing "old TV"
// curve without reading as a fisheye gimmick.
export const CRT_CURVATURE_STRENGTH = 0.15;

// --- Ground / plaza -----------------------------------------------------
export const GROUND_SIZE = 80;
