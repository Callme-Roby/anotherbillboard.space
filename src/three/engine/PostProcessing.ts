import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

import { CRTShader } from "../shaders/crtShader";
import {
  CRT_ABERRATION_STRENGTH,
  CRT_SCANLINE_INTENSITY,
  CRT_VIGNETTE_STRENGTH,
  INTERNAL_RESOLUTION_SCALE,
} from "./constants";

export interface PostProcessingHandle {
  composer: EffectComposer;
  render: () => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

function internalResolution(width: number, height: number) {
  return {
    width: Math.max(2, Math.round(width * INTERNAL_RESOLUTION_SCALE)),
    height: Math.max(2, Math.round(height * INTERNAL_RESOLUTION_SCALE)),
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
  const rt = internalResolution(width, height);

  const renderTarget = new THREE.WebGLRenderTarget(rt.width, rt.height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
  });

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(1);
  composer.setSize(rt.width, rt.height);

  composer.addPass(new RenderPass(scene, camera));

  const crtPass = new ShaderPass(CRTShader);
  crtPass.uniforms.uResolution.value.set(rt.width, rt.height);
  crtPass.uniforms.uScanlineIntensity.value = CRT_SCANLINE_INTENSITY;
  crtPass.uniforms.uVignetteStrength.value = CRT_VIGNETTE_STRENGTH;
  crtPass.uniforms.uAberrationStrength.value = CRT_ABERRATION_STRENGTH;
  composer.addPass(crtPass);

  // Custom ShaderPass instances read/write raw (linear) color values and
  // don't get the renderer's linear->sRGB encoding for free the way
  // built-in materials do — without this pass colors come out too dark,
  // darkest tones worst. OutputPass applies that encoding (plus tone
  // mapping) and must be the terminal pass in the chain.
  const outputPass = new OutputPass();
  outputPass.renderToScreen = true;
  composer.addPass(outputPass);

  return {
    composer,
    render: () => composer.render(),
    setSize: (newWidth, newHeight) => {
      const newRt = internalResolution(newWidth, newHeight);
      composer.setSize(newRt.width, newRt.height);
      crtPass.uniforms.uResolution.value.set(newRt.width, newRt.height);
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
