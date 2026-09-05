import * as THREE from "three";

/**
 * How far a character turns at either edge of the viewport, in radians.
 * Small on purpose: the figures are drawn flat, facing the camera (see
 * createCharacter.ts), so a full turn would foreshorten them to a
 * vertical tick. Turned this far they read as looking your way.
 */
const MAX_YAW = 0.55;
/** Per-frame follow rate at 60fps; frame-rate independent below. */
const DAMPING = 0.08;
/**
 * How far a figure's head swings sideways at full lean, in world units.
 * Roughly half a body width — enough to read at a glance, short of
 * looking like it is falling over.
 */
const LEAN_DISTANCE = 0.06;

/**
 * The yaw every ground-panel character is turned by, shared as one
 * uniform *object* across every billboard material.
 *
 * That sharing is the whole trick: each billboard keeps its own
 * `ShaderMaterial` instance (so disposing one billboard can't pull the
 * material out from under the others), but they all point at this same
 * uniform, so making the entire crowd look somewhere is a single number
 * written once per frame — no per-object work, and no extra draw calls,
 * since the turn happens in the vertex shader on geometry that is
 * already being drawn. Identical shader sources also mean three.js
 * compiles the program once and every material shares it (its cache key
 * is derived from the source text — checked against WebGLPrograms).
 */
export const characterYawUniform = { value: 0 };

export interface CharacterGaze {
  /** Advance the damped turn toward the pointer. `delta` in seconds. */
  update: (delta: number) => void;
  dispose: () => void;
}

/**
 * Makes the crowd follow the pointer left and right. Damped rather than
 * snapped: heads that track the cursor exactly read as a mechanism, not
 * as people noticing you.
 */
export function createCharacterGaze(element: HTMLElement): CharacterGaze {
  let target = 0;

  const handlePointerMove = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) return;
    const across = (event.clientX - rect.left) / rect.width;
    target = THREE.MathUtils.clamp(across * 2 - 1, -1, 1) * MAX_YAW;
  };

  // Pointer gone (or a touch lifted): face front again rather than
  // staying frozen mid-turn toward wherever it was last seen.
  const handlePointerOut = () => {
    target = 0;
  };

  element.addEventListener("pointermove", handlePointerMove, { passive: true });
  element.addEventListener("pointerleave", handlePointerOut, { passive: true });
  element.addEventListener("pointercancel", handlePointerOut, { passive: true });

  return {
    update: (delta: number) => {
      const step = 1 - Math.pow(1 - DAMPING, delta * 60);
      characterYawUniform.value += (target - characterYawUniform.value) * step;
    },
    dispose: () => {
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerleave", handlePointerOut);
      element.removeEventListener("pointercancel", handlePointerOut);
      characterYawUniform.value = 0;
    },
  };
}

/**
 * Material for a ground billboard's line work. Turns each vertex around
 * the pivot stored alongside it (`aPivotXZ`) by the shared yaw — so a
 * structure vertex, whose pivot *is* its own position, sits perfectly
 * still while a character vertex, whose pivot is its figure's feet,
 * turns. No branch and no per-vertex flag: the structure's rotation is a
 * rotation of the zero vector.
 */
export function createBillboardLineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uYaw: characterYawUniform, uLean: { value: LEAN_DISTANCE } },
    // Declares `attribute vec3 color` for us (three.js defines USE_COLOR
    // from this) — the lamp heads' warm colour rides in it.
    vertexColors: true,
    vertexShader: `
      // (pivot x, pivot z, 1 / figure height). The third component is 0
      // on structure vertices, which is what excludes them from the lean
      // below — their pivot already excludes them from the turn.
      attribute vec3 aPivot;
      uniform float uYaw;
      uniform float uLean;
      varying vec3 vLineColor;

      void main() {
        vLineColor = color;

        vec2 local = position.xz - aPivot.xy;
        float c = cos(uYaw);
        float s = sin(uYaw);
        vec2 turned = vec2(local.x * c + local.y * s, -local.x * s + local.y * c);
        vec3 turnedPosition = vec3(aPivot.x + turned.x, position.y, aPivot.y + turned.y);

        // Lean toward the pointer, scaled from 0 at the feet to 1 at the
        // head. The rotation alone barely shows on a figure drawn flat —
        // turning it about its own axis mostly just narrows it — where a
        // lean is unmistakable at this size. Measured on screen: the
        // rotation moved a hundred-odd pixels across the whole plaza.
        turnedPosition.x += s * uLean * clamp(position.y * aPivot.z, 0.0, 1.0);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(turnedPosition, 1.0);
      }
    `,
    // Written straight out in linear space, like every built-in material
    // does inside the composer's render target — the final conversion to
    // sRGB is the OutputPass's job (see PostProcessing.ts).
    fragmentShader: `
      varying vec3 vLineColor;

      void main() {
        gl_FragColor = vec4(vLineColor, 1.0);
      }
    `,
  });
}
