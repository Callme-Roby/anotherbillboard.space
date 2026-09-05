import * as THREE from "three";

import { type Bird, createBird } from "../objects/createBird";

/** Hard ceiling on a flock, per the design: never a swarm. */
const MAX_FLOCK_SIZE = 3;

/**
 * Formation offsets, in the flock's own space: -x is *behind* the
 * leader, mirrored automatically when a flight crosses the other way.
 * Cycled in order, one per flight, so the sky keeps showing a different
 * arrangement rather than the same shape on a loop.
 */
const FORMATIONS: { x: number; y: number; z: number }[][] = [
  // Two abreast with a third trailing a little behind and below.
  [
    { x: 0, y: 0, z: 0 },
    { x: -0.25, y: 0.08, z: 0.62 },
    { x: -1.5, y: -0.4, z: -0.35 },
  ],
  // A shallow V.
  [
    { x: 0, y: 0, z: 0 },
    { x: -0.95, y: -0.18, z: 0.8 },
    { x: -0.95, y: -0.14, z: -0.75 },
  ],
  // A loose pair on their own.
  [
    { x: 0, y: 0, z: 0 },
    { x: -0.7, y: 0.28, z: 0.4 },
  ],
  // Strung out in a staggered line.
  [
    { x: 0, y: 0, z: 0 },
    { x: -1.05, y: 0.18, z: 0.25 },
    { x: -2.1, y: 0.34, z: 0.5 },
  ],
];

// Deliberately different lengths from FORMATIONS (4) and from each
// other, so cycling all four in lockstep still takes 4·3·5 = 60 flights
// to repeat a combination — varied without needing randomness, which
// also keeps a screenshot of flight N reproducible.
// Around and just over the roofline (towers reach 3.8-8.2, the rotating
// summit 10.6). Raised from a first pass at 5.4-8.1, which flew the
// flock straight *through* the skyline: at mid-building height the birds
// spend most of a crossing behind a tower, and a flock you only glimpse
// between buildings isn't one — seen on screen, not predicted.
const ALTITUDES = [7.4, 8.9, 6.5];
const DEPTHS = [-5.5, 1.2, -2.4, -0.6, 3.0];
const SPEEDS = [4.6, 5.5, 5.0];

/** Half the crossing distance — well outside the widest zoom-out view. */
const FLIGHT_HALF_SPAN = 24;
/** Quiet sky between flights, in seconds. */
const FLIGHT_GAP_S = 6;

const BOB_AMPLITUDE = 0.22;
const BOB_FREQUENCY = 0.55;
const FLAP_HZ = 4.2;
const BANK_AMPLITUDE = 0.16;

/**
 * How far a bird turns toward its heading, in radians — well short of
 * the ~90° that actually facing the travel direction would need.
 * Deliberate stylisation: a bird crossing the screen and fully yawed
 * shows the camera its edge, which at this size and internal resolution
 * is a flapping vertical tick rather than a bird. Turned partway, the
 * silhouette still reads while the flock still looks like it is going
 * where it is going.
 */
const YAW_TOWARD_HEADING = 0.5;

/** Don't re-announce the same flock more than this often, in seconds. */
const CALL_COOLDOWN_S = 2.5;
/**
 * Frustum bound for "on screen", slightly inset in NDC so a bird calls
 * once it is properly in view rather than while still clipping the edge.
 */
const IN_VIEW_BOUND = 0.94;

export interface BirdsOptions {
  /**
   * Fired when a flock comes into view — including when it was already
   * flying and a zoom brought it into frame, since the test runs against
   * the live camera projection.
   */
  onEnterView?: () => void;
}

/**
 * The flock overhead: at most three black birds crossing at building
 * height, flapping and banking, in a formation that changes from one
 * flight to the next.
 *
 * Birds are pooled and parented straight to this group (no intermediate
 * flock node), so each one's local position *is* its world position —
 * which is what lets the on-screen test project them directly, without
 * depending on where in the frame the scene graph's matrices were last
 * updated.
 */
export class Birds {
  readonly group: THREE.Group;

  private readonly birds: Bird[] = [];
  private readonly onEnterView?: () => void;
  private readonly projected = new THREE.Vector3();

  private flightIndex = 0;
  /** Distance covered along the current crossing. */
  private travelled = 0;
  private waitFor = FLIGHT_GAP_S * 0.4;
  private elapsed = 0;

  private direction: 1 | -1 = 1;
  private altitude = ALTITUDES[0];
  private depth = DEPTHS[0];
  private speed = SPEEDS[0];
  private formation = FORMATIONS[0];

  private wasInView = false;
  private lastCallAt = Number.NEGATIVE_INFINITY;

  constructor(options: BirdsOptions = {}) {
    this.onEnterView = options.onEnterView;

    this.group = new THREE.Group();
    this.group.name = "birds";

    for (let i = 0; i < MAX_FLOCK_SIZE; i++) {
      const bird = createBird();
      bird.group.visible = false;
      this.birds.push(bird);
      this.group.add(bird.group);
    }

    // No startFlight() here: the birds stay hidden until the opening
    // wait elapses and update() starts the first crossing. Starting one
    // now would park the whole flock, visible, at the world origin —
    // inside the buildings — until the first frame moved it.
  }

  /** Call once per frame, after the camera has been updated. */
  update(delta: number, camera: THREE.Camera): void {
    this.elapsed += delta;

    if (this.waitFor > 0) {
      this.waitFor -= delta;
      if (this.waitFor > 0) return;
      this.startFlight();
    }

    this.travelled += this.speed * delta;
    if (this.travelled > FLIGHT_HALF_SPAN * 2) {
      this.endFlight();
      return;
    }

    const x = this.direction * (-FLIGHT_HALF_SPAN + this.travelled);
    const bob = Math.sin(this.travelled * BOB_FREQUENCY) * BOB_AMPLITUDE;
    // Climbing or descending along the bob, used as pitch so the birds
    // point where they're actually going rather than staying level.
    const climb = Math.cos(this.travelled * BOB_FREQUENCY) * BOB_FREQUENCY * BOB_AMPLITUDE;

    this.formation.forEach((offset, i) => {
      const bird = this.birds[i];
      bird.group.position.set(
        x + offset.x * this.direction,
        this.altitude + bob + offset.y,
        this.depth + offset.z,
      );
      bird.group.rotation.y = this.direction * YAW_TOWARD_HEADING;
      bird.group.rotation.x = -climb * 0.5;
      // Each bird on its own phase, so the flock never beats as one
      // block — the single cheapest thing that stops three copies of the
      // same model reading as three copies of the same model.
      const phase = this.elapsed * FLAP_HZ + i * 0.37;
      bird.group.rotation.z = Math.sin(phase * 0.5) * BANK_AMPLITUDE;
      bird.flap(phase);
    });

    this.checkView(camera);
  }

  dispose(): void {
    this.birds.length = 0;
  }

  private startFlight(): void {
    const n = this.flightIndex;
    this.formation = FORMATIONS[n % FORMATIONS.length];
    this.altitude = ALTITUDES[n % ALTITUDES.length];
    this.depth = DEPTHS[n % DEPTHS.length];
    this.speed = SPEEDS[n % SPEEDS.length];
    this.direction = n % 2 === 0 ? 1 : -1;

    this.travelled = 0;
    this.wasInView = false;
    this.birds.forEach((bird, i) => {
      bird.group.visible = i < this.formation.length;
    });
  }

  private endFlight(): void {
    this.flightIndex++;
    this.waitFor = FLIGHT_GAP_S;
    this.wasInView = false;
    for (const bird of this.birds) bird.group.visible = false;
  }

  /**
   * Calls out on the flock's first frame in view. Edge-triggered rather
   * than level-triggered, plus a cooldown, so a bird hovering on the
   * frustum boundary can't chatter frame after frame.
   */
  private checkView(camera: THREE.Camera): void {
    let inView = false;
    for (let i = 0; i < this.formation.length; i++) {
      this.projected.copy(this.birds[i].group.position).project(camera);
      if (
        Math.abs(this.projected.x) <= IN_VIEW_BOUND &&
        Math.abs(this.projected.y) <= IN_VIEW_BOUND &&
        this.projected.z > -1 &&
        this.projected.z < 1
      ) {
        inView = true;
        break;
      }
    }

    if (inView && !this.wasInView && this.elapsed - this.lastCallAt > CALL_COOLDOWN_S) {
      this.lastCallAt = this.elapsed;
      this.onEnterView?.();
    }
    this.wasInView = inView;
  }
}
