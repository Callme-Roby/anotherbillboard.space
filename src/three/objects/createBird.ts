import * as THREE from "three";

/** Black, like the crows this is modelled on — and like every outline. */
const BIRD_COLOR = 0x101010;

/**
 * Wingspan — about double true scale, and deliberately so. Against the
 * towers (SKYLINE in createCentralBuilding.ts runs 3.8-8.2 for buildings
 * of ~20-30m) a real crow's ~1m span works out around 0.33 units, which
 * lands on one or two texels at the scene's low internal render
 * resolution: at that size the CRT pass's chromatic fringing is *wider
 * than the bird*, so the flock reads as coloured specks rather than
 * silhouettes. Checked at both sizes against clear sky, not guessed.
 */
export const BIRD_WINGSPAN = 0.7;

/** Peak wing deflection either side of level, in radians. */
const FLAP_AMPLITUDE = 0.62;

/** A spot a bird can stand on: the top surface of something in the scene. */
export interface PerchSpot {
  x: number;
  y: number;
  z: number;
}

export interface Bird {
  group: THREE.Group;
  /** Sets the wings for a flap phase; `phase` is in turns, not radians. */
  flap: (phase: number) => void;
  /** Holds the wings at a fixed angle — a perched bird isn't flapping. */
  setWingAngle: (angle: number) => void;
  /**
   * Scales the wings in, 1 being fully spread. A perched bird folds them
   * against its body; left at full spread it keeps the gliding
   * silhouette and reads as hovering over its perch rather than sitting
   * on it.
   */
  setWingSpread: (spread: number) => void;
}

/**
 * One bird: a body line with two wings hinged at it, flapping.
 *
 * Local frame is wings along ±X, body along Z with the head at +Z — so
 * a bird facing the camera shows the classic silhouette, wings rotate
 * about Z to flap, and the flock's yaw/bank/pitch are plain Euler
 * angles on the group (see Birds.ts).
 *
 * Both wings share one geometry, the left one mirrored with `scale.x =
 * -1`. That mirror also flips the *sense* of its flap: three.js composes
 * a local matrix as T·R·S, so the scale applies before the rotation and
 * a positive `rotation.z` sends the mirrored tip down rather than up —
 * hence the negated angle in `flap` rather than one shared value.
 */
export function createBird(): Bird {
  const group = new THREE.Group();
  group.name = "bird";

  const material = new THREE.LineBasicMaterial({ color: BIRD_COLOR });
  const span = BIRD_WINGSPAN / 2;

  // Root -> wrist -> tip, swept back a little at the tip so the wing
  // reads as a wing rather than a straight spar.
  const wingGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.52 * span, 0.1 * span, -0.05 * span),
    new THREE.Vector3(1.0 * span, 0.02 * span, -0.3 * span),
  ]);

  const rightWing = new THREE.Line(wingGeometry, material);
  const leftWing = new THREE.Line(wingGeometry, material);
  leftWing.scale.x = -1;

  const body = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.01 * span, 0.55 * span),
      new THREE.Vector3(0, 0, -0.75 * span),
    ]),
    material,
  );

  group.add(rightWing, leftWing, body);

  const setWingAngle = (angle: number) => {
    rightWing.rotation.z = angle;
    leftWing.rotation.z = -angle;
  };

  return {
    group,
    setWingAngle,
    // The left wing keeps its mirroring sign, so folding scales both
    // toward the body rather than flipping one through it.
    setWingSpread: (spread: number) => {
      rightWing.scale.x = spread;
      leftWing.scale.x = -spread;
    },
    flap: (phase: number) => setWingAngle(Math.sin(phase * Math.PI * 2) * FLAP_AMPLITUDE),
  };
}
