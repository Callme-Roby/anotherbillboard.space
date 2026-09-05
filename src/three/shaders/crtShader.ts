import * as THREE from "three";

/**
 * Single global post-processing pass: PS1-style pixelation (achieved by
 * rendering the scene at a low internal resolution into a NEAREST-filtered
 * render target — see PostProcessing.ts — then upscaling it here) combined
 * with an old-TV/CRT screen look (screen curvature, scanlines, vignette,
 * chromatic aberration) — animated (scanline drift, brightness flicker)
 * rather than a static filter, via uTime.
 *
 * Shape follows the three.js addon convention (`{ uniforms, vertexShader,
 * fragmentShader }`) so it can be passed straight into `new ShaderPass(...)`.
 */
export const CRTShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uScanlineIntensity: { value: 0.15 },
    uScanlineScrollSpeed: { value: 1.6 },
    uFlickerStrength: { value: 0.03 },
    uVignetteStrength: { value: 0.35 },
    uAberrationStrength: { value: 0.0025 },
    uCurvature: { value: 0.15 },
    // Matches BACKGROUND_COLOR (set in PostProcessing.ts). Doubles as the
    // reference the scanline mask compares against — see its own comment
    // below — as well as the curved-screen bezel fill.
    uBezelColor: { value: new THREE.Color(0xffffff) },
  },

  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uScanlineIntensity;
    uniform float uScanlineScrollSpeed;
    uniform float uFlickerStrength;
    uniform float uVignetteStrength;
    uniform float uAberrationStrength;
    uniform float uCurvature;
    uniform vec3 uBezelColor;

    varying vec2 vUv;

    void main() {
      // Barrel/screen curvature: warp toward sampling further outside
      // [0,1] as the fragment approaches a corner (squared falloff, so
      // screen-center stays put and the warp only really bites near the
      // edges) — the picture reads as bulging like curved CRT glass.
      // Outside the curved screen there's nothing to show: uBezelColor
      // (matches the scene background), not a stretched/clamped edge or
      // a wrapped sample.
      vec2 rawCentered = vUv - 0.5;
      float curveDist2 = dot(rawCentered, rawCentered);
      vec2 uv = vUv + rawCentered * curveDist2 * uCurvature;

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(uBezelColor, 1.0);
        return;
      }

      vec2 centered = uv - 0.5;
      float dist = length(centered);

      // Chromatic aberration: sample R/G/B at slightly offset UVs, offset
      // growing with distance from screen center.
      vec2 offset = centered * dist * uAberrationStrength;
      float r = texture2D(tDiffuse, uv - offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + offset).b;
      vec3 color = vec3(r, g, b);

      // Scanlines, spaced to the low-res internal render height so each
      // line tracks a real pixel row rather than an arbitrary frequency —
      // phase drifts slowly with uTime so the pattern rolls instead of
      // sitting frozen, like an old tube's imperfect vertical sync.
      //
      // Masked to actual scene content, not the flat background fill:
      // scanlines are a *screen-space* pattern, entirely independent of
      // what's being rendered, so without this they band evenly across
      // the empty sky/ground too — reported directly against the running
      // site as unwanted horizontal lines "across the whole page in the
      // background". The ground and sky are both exactly BACKGROUND_COLOR
      // (see createGround.ts), so comparing the sampled color against
      // that same reference (uBezelColor) doubles as "is this empty
      // background or real geometry" — smoothstep'd rather than a hard
      // cutoff so the mask edge itself doesn't alias.
      float bgDistance = distance(color, uBezelColor);
      float isContent = smoothstep(0.02, 0.08, bgDistance);
      float scanline = sin(uv.y * uResolution.y * 3.14159265 + uTime * uScanlineScrollSpeed) * 0.5 + 0.5;
      color *= mix(1.0, scanline, uScanlineIntensity * isContent);

      // Light vignette. (smoothstep args ascending — GLSL leaves the
      // edge0 > edge1 case implementation-defined, so invert explicitly
      // rather than rely on it.) Masked by the same isContent as the
      // scanlines above, for the same reason plus one more: left
      // unmasked, this darkens in-bounds empty background (sky/ground)
      // near the frame edges while the *out-of-bounds* bezel right next
      // to it stays at full, undarkened uBezelColor — a visible seam
      // exactly at the curved screen's boundary, reported with a
      // screenshot showing it. Masking makes the whole flat background
      // — bezel and in-bounds alike — one continuous, unshaded fill;
      // only real geometry still gets darkened toward the edges.
      float vignette = 1.0 - smoothstep(0.35, 0.95, dist);
      color *= mix(1.0, vignette, uVignetteStrength * isContent);

      // Subtle brightness flicker: two incommensurate sine frequencies so
      // it doesn't read as a mechanical pulse, kept small (uFlickerStrength
      // is a few percent) so it's felt more than seen — an old tube's
      // imperfect power supply, not a strobe.
      float flicker = 1.0 + (sin(uTime * 17.0) + sin(uTime * 29.3)) * 0.5 * uFlickerStrength;
      color *= flicker;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
