import * as THREE from "three";

import { type Bird, BIRD_WINGSPAN, createBird, type PerchSpot } from "../objects/createBird";

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
// other, so cycling all of them in lockstep still takes a long time to
// repeat a combination — varied without needing randomness, which also
// keeps a screenshot of flight N reproducible.
const ALTITUDES = [7.4, 8.9, 6.5];
const DEPTHS = [-5.5, 1.2, -2.4, -0.6, 3.0];
const SPEEDS = [4.6, 5.5, 5.0];
/** Quiet sky between flights, in seconds. Cycled like everything else. */
const FLIGHT_GAPS = [13, 19, 16];

/** Half the crossing distance — well outside the widest zoom-out view. */
const FLIGHT_HALF_SPAN = 24;

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

// --- Landing flights ------------------------------------------------------
/** One flight in this many comes in to land instead of passing through. */
const PERCH_EVERY = 3;
const APPROACH_S = 4.4;
/** How far out a landing flight starts, and carries on to, from its perch. */
const APPROACH_RUN = 15;
const DEPARTURE_RUN = 17;
/** How long they stay put once down. */
const PERCH_S = 5;
const DEPARTURE_S = 3.9;
/** Gap between birds sharing a perch, so they line up along its edge. */
const PERCH_SPACING = 0.4;
/**
 * Lifts a bird's body off the surface its feet are standing on. Raised
 * from a first pass at 0.16 spans: perched that low, the birds' own dark
 * lines sat within a few pixels of the roof's black outline and merged
 * straight into it — they were landing correctly and reading as nothing.
 */
const PERCH_LIFT = BIRD_WINGSPAN * 0.3;
/** Height of the swoop over the straight line in and out of a perch. */
const APPROACH_ARC = 0.9;
/** Wings held slightly drooped when settled, rather than stiffly level. */
const PERCHED_WING_ANGLE = -0.13;
/**
 * How far the wings fold in once down — see Bird.setWingSpread. Tucked
 * in further than a first pass at 0.4, which still read as a bird
 * holding its wings out while sitting still.
 */
const PERCHED_WING_SPREAD = 0.2;
/**
 * Landing and taking off are beaten only slightly harder than cruising.
 * A first pass ran up to 1.7x the crossing rate, which read as panic
 * rather than as a bird putting itself down — the flapping *is* what
 * makes a landing look nervous, more than the trajectory does.
 */
const APPROACH_FLAP_GAIN = 0.2;
const DEPARTURE_FLAP_GAIN = 0.25;
/** How fast a settled bird looks around. Slow: it is resting, not twitching. */
const PERCHED_IDLE_HZ = 0.45;
/** Nose-up posture when settled: perched birds stand, they don't glide. */
const PERCHED_PITCH = -0.4;

/** Don't re-announce the same flock more than this often, in seconds. */
const CALL_COOLDOWN_S = 2.5;
/**
 * Frustum bound for "on screen", slightly inset in NDC so a bird calls
 * once it is properly in view rather than while still clipping the edge.
 */
const IN_VIEW_BOUND = 0.94;

type Phase = "waiting" | "crossing" | "approach" | "perched" | "departure";

export interface BirdsOptions {
  /**
   * Everywhere the flock may land — today just the signature sign, by
   * design: every other flight crosses without stopping. Passed in
   * rather than imported so the flock doesn't need to know what the
   * scene is made of (see SceneManager).
   */
  perches: PerchSpot[];
  /**
   * Fired when a flock comes into view — including when it was already
   * flying and a zoom brought it into frame, since the test runs against
   * the live camera projection.
   */
  onEnterView?: () => void;
}

/**
 * The flock overhead: at most three black birds at building height, in a
 * formation that changes from one flight to the next. Most flights cross
 * and are gone; every third comes in to land on the skyline, sits for a
 * few seconds, and leaves again.
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
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();

  private flightIndex = 0;
  /**
   * Counts landings only, so perches cycle 0, 1, 2, … in order. There is
   * only one perch today (the signature sign), but indexing by
   * `flightIndex` instead worked only by the accident that 3
   * (PERCH_EVERY) and the perch count happened to be coprime: add a
   * second perch back and that version would loop over a subset of them
   * forever, never visiting the rest.
   */
  private landingIndex = 0;
  private phase: Phase = "waiting";
  /** Seconds spent in the current phase. */
  private phaseTime = 0;
  private elapsed = 0;

  /** Distance covered along a crossing. */
  private travelled = 0;

  private direction: 1 | -1 = 1;
  private altitude = ALTITUDES[0];
  private depth = DEPTHS[0];
  private speed = SPEEDS[0];
  private gap = FLIGHT_GAPS[0];
  private formation = FORMATIONS[0];
  private activeCount = 0;
  private readonly perches: PerchSpot[];
  private perch: PerchSpot;

  private wasInView = false;
  private lastCallAt = Number.NEGATIVE_INFINITY;

  constructor(options: BirdsOptions) {
    this.onEnterView = options.onEnterView;
    this.perches = options.perches;
    this.perch = this.perches[0];

    this.group = new THREE.Group();
    this.group.name = "birds";

    for (let i = 0; i < MAX_FLOCK_SIZE; i++) {
      const bird = createBird();
      bird.group.visible = false;
      this.birds.push(bird);
      this.group.add(bird.group);
    }

    // Opens on a short wait rather than a flight: starting one here would
    // park the whole flock, visible, at the world origin — inside the
    // buildings — until the first frame moved it.
    this.gap = FLIGHT_GAPS[0] * 0.25;
  }

  /** Call once per frame, after the camera has been updated. */
  update(delta: number, camera: THREE.Camera): void {
    this.elapsed += delta;
    this.phaseTime += delta;

    switch (this.phase) {
      case "waiting":
        if (this.phaseTime >= this.gap) this.startFlight();
        return;
      case "crossing":
        this.updateCrossing(delta);
        break;
      case "approach":
        this.updateApproach();
        break;
      case "perched":
        this.updatePerched();
        break;
      case "departure":
        this.updateDeparture();
        break;
    }

    this.checkView(camera);
  }

  dispose(): void {
    this.birds.length = 0;
  }

  // --- Flight lifecycle ---------------------------------------------------

  private startFlight(): void {
    const n = this.flightIndex;
    this.formation = FORMATIONS[n % FORMATIONS.length];
    this.altitude = ALTITUDES[n % ALTITUDES.length];
    this.depth = DEPTHS[n % DEPTHS.length];
    this.speed = SPEEDS[n % SPEEDS.length];
    this.gap = FLIGHT_GAPS[n % FLIGHT_GAPS.length];
    this.direction = n % 2 === 0 ? 1 : -1;
    this.activeCount = this.formation.length;

    this.travelled = 0;
    this.wasInView = false;
    this.birds.forEach((bird, i) => {
      bird.group.visible = i < this.activeCount;
    });

    const landing = n % PERCH_EVERY === 0;
    if (landing) {
      this.perch = this.perches[this.landingIndex % this.perches.length];
      this.landingIndex++;
    }
    this.enter(landing ? "approach" : "crossing");
  }

  private endFlight(): void {
    this.flightIndex++;
    this.wasInView = false;
    for (const bird of this.birds) bird.group.visible = false;
    this.enter("waiting");
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  // --- Phases -------------------------------------------------------------

  /** A flight that simply passes through, edge to edge. */
  private updateCrossing(delta: number): void {
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
      this.animateWings(bird, i, FLAP_HZ, BANK_AMPLITUDE);
    });
  }

  /** Coming in to land: swooping down onto the perch and slowing into it. */
  private updateApproach(): void {
    const t = Math.min(1, this.phaseTime / APPROACH_S);
    // Eased out, so they arrive slowing down rather than arriving at
    // cruising speed and stopping dead.
    const eased = 1 - Math.pow(1 - t, 3);

    this.formation.forEach((offset, i) => {
      const bird = this.birds[i];
      this.entryPoint(offset, this.from);
      this.perchSlot(i, this.to);
      bird.group.position.lerpVectors(this.from, this.to, eased);
      // A swoop rather than a straight glide down the diagonal.
      bird.group.position.y += Math.sin(t * Math.PI) * APPROACH_ARC;

      bird.group.rotation.y = this.direction * YAW_TOWARD_HEADING * (1 - eased);
      // Flaring: nose comes up as they settle onto the perch.
      bird.group.rotation.x = 0.35 * eased;
      // Beating a little harder the closer they get — braking gently.
      this.animateWings(bird, i, FLAP_HZ * (1 + eased * APPROACH_FLAP_GAIN), BANK_AMPLITUDE * (1 - eased));
    });

    if (t >= 1) this.enter("perched");
  }

  /** Settled: wings folded, facing the camera, only a small idle sway. */
  private updatePerched(): void {
    this.formation.forEach((_, i) => {
      const bird = this.birds[i];
      this.perchSlot(i, this.to);
      bird.group.position.copy(this.to);
      // Each bird looks around on its own slow rhythm — the only thing
      // separating "perched" from "three models parked on a roof".
      const idle = Math.sin(this.elapsed * PERCHED_IDLE_HZ + i * 1.7);
      bird.group.rotation.y = idle * 0.28;
      bird.group.rotation.x = PERCHED_PITCH;
      bird.group.rotation.z = 0;
      bird.setWingSpread(PERCHED_WING_SPREAD);
      // Mostly still, with an occasional small wing shuffle.
      bird.setWingAngle(PERCHED_WING_ANGLE + Math.max(0, idle - 0.96) * 0.9);
    });

    if (this.phaseTime >= PERCH_S) this.enter("departure");
  }

  /** Off again: pushing off the perch, climbing away and accelerating. */
  private updateDeparture(): void {
    const t = Math.min(1, this.phaseTime / DEPARTURE_S);
    const eased = t * t * t;

    this.formation.forEach((offset, i) => {
      const bird = this.birds[i];
      this.perchSlot(i, this.from);
      this.exitPoint(offset, this.to);
      bird.group.position.lerpVectors(this.from, this.to, eased);
      bird.group.position.y += Math.sin(t * Math.PI) * APPROACH_ARC * 0.5;

      bird.group.rotation.y = this.direction * YAW_TOWARD_HEADING * eased;
      // Nose up on the climb out, levelling as they get going.
      bird.group.rotation.x = -0.3 * (1 - eased);
      this.animateWings(
        bird,
        i,
        FLAP_HZ * (1 + DEPARTURE_FLAP_GAIN * (1 - eased)),
        BANK_AMPLITUDE * eased,
      );
    });

    if (t >= 1) this.endFlight();
  }

  // --- Helpers ------------------------------------------------------------

  private animateWings(bird: Bird, index: number, flapHz: number, bank: number): void {
    // Each bird on its own phase, so the flock never beats as one block —
    // the single cheapest thing that stops three copies of the same model
    // reading as three copies of the same model.
    const phase = this.elapsed * flapHz + index * 0.37;
    bird.group.rotation.z = Math.sin(phase * 0.5) * bank;
    bird.setWingSpread(1);
    bird.flap(phase);
  }

  /** Where bird `i` stands, spread along the perch's edge. */
  private perchSlot(index: number, out: THREE.Vector3): void {
    const spread = (index - (this.activeCount - 1) / 2) * PERCH_SPACING;
    out.set(this.perch.x + spread, this.perch.y + PERCH_LIFT, this.perch.z);
  }

  /**
   * Both ends of a landing flight are measured *from the perch*, not from
   * fixed points in the world: an absolute entry point works only while
   * every perch happens to sit near the middle of the scene, and sends
   * the flock flying backwards into an off-centre one (the signature
   * sign at x=-15 is exactly that case).
   */
  private entryPoint(offset: { x: number; y: number; z: number }, out: THREE.Vector3): void {
    out.set(
      this.perch.x - this.direction * APPROACH_RUN + offset.x * this.direction,
      this.altitude + offset.y,
      this.perch.z + offset.z - 2.5,
    );
  }

  private exitPoint(offset: { x: number; y: number; z: number }, out: THREE.Vector3): void {
    out.set(
      this.perch.x + this.direction * DEPARTURE_RUN + offset.x * this.direction,
      this.altitude + 1.4 + offset.y,
      this.perch.z + offset.z - 2,
    );
  }

  /**
   * Calls out on the flock's first frame in view. Edge-triggered rather
   * than level-triggered, plus a cooldown, so a bird hovering on the
   * frustum boundary can't chatter frame after frame.
   */
  private checkView(camera: THREE.Camera): void {
    let inView = false;
    for (let i = 0; i < this.activeCount; i++) {
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
