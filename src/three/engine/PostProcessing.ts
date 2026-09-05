import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

import { CRTShader } from "../shaders/crtShader";
import {
  BACKGROUND_COLOR,
  CRT_ABERRATION_STRENGTH,
  CRT_CURVATURE_STRENGTH,
  CRT_FLICKER_STRENGTH,
  CRT_SCANLINE_INTENSITY,
  CRT_SCANLINE_SCROLL_SPEED,
  CRT_VIGNETTE_STRENGTH,
  INTERNAL_RESOLUTION_SCALE,
  ZOOM_RESOLUTION_COMPENSATION_EXPONENT,
  ZOOM_RESOLUTION_COMPENSATION_MAX,
} from "./constants";

export interface PostProcessingHandle {
  composer: EffectComposer;
  /** Called once per frame: advances uTime and re-checks the zoom-compensated internal resolution. */
  render: (elapsedSeconds: number, zoom: number) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * How much to scale INTERNAL_RESOLUTION_SCALE up as `zoom` drops below 1
 * — see the constant's own doc comment for why this is partial (sqrt)
 * and capped rather than a full 1/zoom compensation.
 */
function zoomResolutionCompensation(zoom: number): number {
  const safeZoom = Math.max(zoom, 0.01);
  return Math.min(
    ZOOM_RESOLUTION_COMPENSATION_MAX,
    Math.pow(1 / safeZoom, ZOOM_RESOLUTION_COMPENSATION_EXPONENT),
  );
}

function internalResolution(width: number, height: number, zoom: number) {
  const scale = INTERNAL_RESOLUTION_SCALE * zoomResolutionCompensation(zoom);
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
  };
}

/**
 * The scene's single global post-processing pass: `EffectComposer` +
 * `RenderPass` + one custom `ShaderPass` (CRTShader) + `OutputPass`.
 *
 * The composer is deliberately kept at a LOW internal resolution
 * (`composer.setSize`) while the renderer/canvas stays at full display
 * resolution (`renderer.setSize`, set by the caller). Those two are
 * independent: the composer's size only controls its own render-target
 * resolution, not the renderer's drawing-buffer size. That gap is what
 * produces the blocky PS1-style nearest-neighbour upscale in the final
 * pass, instead of a shader trying to fake pixelation after the fact.
 */
export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): PostProcessingHandle {
  let viewportWidth = width;
  let viewportHeight = height;
  let lastZoom = 1;
  let currentRt = internalResolution(width, height, lastZoom);

  const renderTarget = new THREE.WebGLRenderTarget(currentRt.width, currentRt.height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
  });

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(1);
  composer.setSize(currentRt.width, currentRt.height);

  composer.addPass(new RenderPass(scene, camera));

  const crtPass = new ShaderPass(CRTShader);
  crtPass.uniforms.uResolution.value.set(currentRt.width, currentRt.height);
  crtPass.uniforms.uScanlineIntensity.value = CRT_SCANLINE_INTENSITY;
  crtPass.uniforms.uScanlineScrollSpeed.value = CRT_SCANLINE_SCROLL_SPEED;
  crtPass.uniforms.uFlickerStrength.value = CRT_FLICKER_STRENGTH;
  crtPass.uniforms.uVignetteStrength.value = CRT_VIGNETTE_STRENGTH;
  crtPass.uniforms.uAberrationStrength.value = CRT_ABERRATION_STRENGTH;
  crtPass.uniforms.uCurvature.value = CRT_CURVATURE_STRENGTH;
  crtPass.uniforms.uBezelColor.value.set(BACKGROUND_COLOR);
  composer.addPass(crtPass);

  // Custom ShaderPass instances read/write raw (linear) color values and
  // don't get the renderer's linear->sRGB encoding for free the way
  // built-in materials do — without this pass colors come out too dark,
  // darkest tones worst. OutputPass applies that encoding (plus tone
  // mapping) and must be the terminal pass in the chain.
  const outputPass = new OutputPass();
  outputPass.renderToScreen = true;
  composer.addPass(outputPass);

  // Re-picks the internal resolution for the current viewport size *and*
  // zoom, but only actually reallocates the render target when the
  // rounded pixel dimensions changed — called every frame (zoom changes
  // continuously while damping converges) so this early-exit is what
  // keeps that cheap: reallocating a WebGLRenderTarget on every tick of
  // a smooth zoom would be wasteful and could visibly stutter.
  function applyInternalResolution(zoom: number) {
    const rt = internalResolution(viewportWidth, viewportHeight, zoom);
    if (rt.width === currentRt.width && rt.height === currentRt.height) return;
    currentRt = rt;
    composer.setSize(rt.width, rt.height);
    crtPass.uniforms.uResolution.value.set(rt.width, rt.height);
  }

  return {
    composer,
    render: (elapsedSeconds, zoom) => {
      lastZoom = zoom;
      crtPass.uniforms.uTime.value = elapsedSeconds;
      applyInternalResolution(zoom);
      composer.render();
    },
    setSize: (newWidth, newHeight) => {
      viewportWidth = newWidth;
      viewportHeight = newHeight;
      applyInternalResolution(lastZoom);
    },
    dispose: () => {
      // `composer.dispose()` only frees its own ping-pong render targets,
      // not the passes added to it — each pass owns its own material/quad.
      for (const pass of composer.passes) {
        (pass as Partial<{ dispose: () => void }>).dispose?.();
      }
      composer.dispose();
    },
  };
}
