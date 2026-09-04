import * as THREE from "three";

/**
 * Single global post-processing pass: PS1-style pixelation (achieved by
 * rendering the scene at a low internal resolution into a NEAREST-filtered
 * render target — see PostProcessing.ts — then upscaling it here) combined
 * with an old-TV/CRT screen look (screen curvature, scanlines, vignette,
 * chromatic aberration).
 *
 * Shape follows the three.js addon convention (`{ uniforms, vertexShader,
 * fragmentShader }`) so it can be passed straight into `new ShaderPass(...)`.
 */
export const CRTShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uScanlineIntensity: { value: 0.15 },
    uVignetteStrength: { value: 0.35 },
    uAberrationStrength: { value: 0.0025 },
    uCurvature: { value: 0.15 },
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
    uniform float uScanlineIntensity;
    uniform float uVignetteStrength;
    uniform float uAberrationStrength;
    uniform float uCurvature;

    varying vec2 vUv;

    void main() {
      // Barrel/screen curvature: warp toward sampling further outside
      // [0,1] as the fragment approaches a corner (squared falloff, so
      // screen-center stays put and the warp only really bites near the
      // edges) — the picture reads as bulging like curved CRT glass.
      // Outside the curved screen there's nothing to show: a black bezel,
      // not a stretched/clamped edge or a wrapped sample.
      vec2 rawCentered = vUv - 0.5;
      float curveDist2 = dot(rawCentered, rawCentered);
      vec2 uv = vUv + rawCentered * curveDist2 * uCurvature;

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
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
      // line tracks a real pixel row rather than an arbitrary frequency.
      float scanline = sin(uv.y * uResolution.y * 3.14159265) * 0.5 + 0.5;
      color *= mix(1.0, scanline, uScanlineIntensity);

      // Light vignette. (smoothstep args ascending — GLSL leaves the
      // edge0 > edge1 case implementation-defined, so invert explicitly
      // rather than rely on it.)
      float vignette = 1.0 - smoothstep(0.35, 0.95, dist);
      color *= mix(1.0, vignette, uVignetteStrength);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
