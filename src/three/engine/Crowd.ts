import * as THREE from "three";

import {
  CHARACTER_SEGMENTS,
  type CrowdMember,
  writeCharacter,
} from "../objects/createCharacter";

function randomHold(): number {
  return WANDER_HOLD_MIN_S + Math.random() * (WANDER_HOLD_MAX_S - WANDER_HOLD_MIN_S);
}

/** Structural black, same as every silhouette in the scene. */
const INK_COLOR = 0x0a0a0a;

/** Per-frame follow rate at 60fps; frame-rate independent below. */
const DAMPING = 0.035;
/** World distance covered per full stride — sets how fast the legs scissor. */
const STRIDE_LENGTH = 0.26;
/** Speed (world units/s) at which the walk is at full stride. */
const FULL_STRIDE_SPEED = 0.7;
/** How far someone turns toward where they are heading, in radians. */
const MAX_YAW = 0.5;
/**
 * How far toward the frame edge the group's centre is allowed to follow
 * the pointer, in NDC. Short of 1 on purpose: the crowd stands *around*
 * the cursor, so a centre taken all the way to the edge would push the
 * outer half of the group off screen. Costs a little tracking accuracy
 * at the very edges, and buys the guarantee that nobody ever walks out
 * of frame.
 */
const POINTER_INSET = 0.74;
/** Below this, treat everyone as arrived and stop rewriting the buffers. */
const SETTLED_EPSILON = 0.0005;

/**
 * How far someone drifts from their place in the group, in world units,
 * and how long they hold a given spot before picking another.
 *
 * This is what keeps the crowd from re-forming the same shape every
 * time: the base offsets alone put everyone back in an identical
 * arrangement at every regroup, which reads as a formation rather than
 * as people. Re-rolled at random — unlike a person's *identity* (build,
 * pose, depth, side), which stays hash-derived so the LOD refetch can't
 * reshuffle it, this is transient motion and has nothing to stay stable
 * for.
 */
const WANDER_RANGE = 0.55;
const WANDER_DEPTH_RANGE = 0.5;
const WANDER_HOLD_MIN_S = 1.8;
const WANDER_HOLD_MAX_S = 5.5;

interface WalkState {
  x: number;
  phase: number;
  gait: number;
  yaw: number;
  /** Current drift from the base offset, and where it is heading. */
  wanderX: number;
  wanderTargetX: number;
  wanderZ: number;
  wanderTargetZ: number;
  /** Seconds until this person picks a new spot. */
  holdFor: number;
}

/**
 * Everyone standing on the plaza, as a single `LineSegments`.
 *
 * One object for the whole crowd rather than one per person: the
 * characters used to be merged into their own panel's geometry, which
 * cost nothing but froze them in place. Walking needs per-person state,
 * so they moved out — into *one* shared buffer rewritten on the CPU each
 * frame, which is one extra draw call for the entire plaza rather than
 * one per panel. The rewrite itself is a few thousand float writes even
 * at the LOD ceiling, and it is skipped entirely on frames where nobody
 * is moving.
 */
export class Crowd {
  readonly group: THREE.Group;

  private readonly ink = new THREE.Color(INK_COLOR);
  private readonly rayPoint = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly states = new Map<string, WalkState>();
  private members: CrowdMember[] = [];

  private geometry = new THREE.BufferGeometry();
  private readonly material: THREE.LineBasicMaterial;
  private positions = new Float32Array(0);
  private colors = new Float32Array(0);
  private capacity = 0;
  /** Forces one write after the roster changes, even if nobody is walking. */
  private dirty = true;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "crowd";

    this.material = new THREE.LineBasicMaterial({ vertexColors: true });
    const lines = new THREE.LineSegments(this.geometry, this.material);
    // Every person is rebuilt in world space each frame, so there is no
    // bounding volume worth maintaining — and a stale one would cull the
    // crowd the moment it walked out of it.
    lines.frustumCulled = false;
    this.group.add(lines);
    this.ensureCapacity(16);
  }

  /** Replaces the roster. Walkers keep their position and stride by id. */
  setMembers(members: CrowdMember[]): void {
    this.members = members;

    const live = new Set(members.map((member) => member.id));
    for (const id of [...this.states.keys()]) {
      if (!live.has(id)) this.states.delete(id);
    }
    for (const member of members) {
      if (this.states.has(member.id)) continue;
      // New arrivals start standing at home rather than sliding in from
      // wherever the crowd happens to be looking.
      this.states.set(member.id, {
        x: member.homeX,
        phase: 0,
        gait: 0,
        yaw: 0,
        wanderX: 0,
        wanderTargetX: 0,
        wanderZ: 0,
        wanderTargetZ: 0,
        // Staggered from the start, so they don't all shift at once.
        holdFor: randomHold() * Math.random(),
      });
    }

    this.ensureCapacity(members.length);
    this.geometry.setDrawRange(0, members.length * CHARACTER_SEGMENTS * 2);
    this.dirty = true;
  }

  /**
   * Walks everyone to their place around the pointer. `pointerNdcX` is
   * -1 at the left edge of the viewport and +1 at the right.
   *
   * The pointer is turned into a *world* position, not just a direction:
   * the crowd gathers at the cursor rather than drifting toward its
   * side, so it stays with you wherever you point instead of piling up
   * against an edge. Each person's depth gets its own solve, because the
   * same screen position is a different world x nearer or further from
   * the camera — solving once for the whole crowd would fan the far half
   * of it away from the cursor.
   */
  update(delta: number, pointerNdcX: number, camera: THREE.Camera): void {
    if (this.members.length === 0) return;

    // A ray through the pointer, in world space. Its x at any depth is
    // independent of the vertical coordinate, so the middle of the
    // screen is as good a y as any.
    this.rayPoint.set(pointerNdcX * POINTER_INSET, 0, 0.5).unproject(camera);
    camera.getWorldPosition(this.cameraPosition);
    this.rayDirection.copy(this.rayPoint).sub(this.cameraPosition);
    const towardScene = Math.abs(this.rayDirection.z) > 1e-6;

    const follow = 1 - Math.pow(1 - DAMPING, delta * 60);
    let moved = false;

    for (const member of this.members) {
      const state = this.states.get(member.id);
      if (!state) continue;

      // Everyone shifts around on their own clock, so the group keeps
      // rearranging instead of snapping back to one fixed shape.
      state.holdFor -= delta;
      if (state.holdFor <= 0) {
        state.holdFor = randomHold();
        state.wanderTargetX = (Math.random() * 2 - 1) * WANDER_RANGE;
        state.wanderTargetZ = (Math.random() * 2 - 1) * WANDER_DEPTH_RANGE;
      }
      // Eased far more slowly than the walk itself: a drift you can see
      // happening is a fidget, not a crowd settling.
      const drift = 1 - Math.pow(1 - DAMPING * 0.25, delta * 60);
      state.wanderX += (state.wanderTargetX - state.wanderX) * drift;
      state.wanderZ += (state.wanderTargetZ - state.wanderZ) * drift;

      const z = member.z + (member.anchored ? 0 : state.wanderZ);

      let target = member.homeX;
      if (!member.anchored && towardScene) {
        const along = (z - this.cameraPosition.z) / this.rayDirection.z;
        target =
          this.cameraPosition.x + this.rayDirection.x * along + member.offsetX + state.wanderX;
      }
      const step = (target - state.x) * follow * member.pace;
      state.x += step;

      if (Math.abs(step) > SETTLED_EPSILON) moved = true;

      // The stride advances with distance actually covered, not with
      // time: stand still and the legs stop, which is the whole
      // difference between walking and marching on the spot.
      state.phase += Math.abs(step) / STRIDE_LENGTH;

      const speed = delta > 0 ? Math.abs(step) / delta : 0;
      const gaitTarget = Math.min(1, speed / FULL_STRIDE_SPEED);
      // Eased separately from the step so the legs wind down over a few
      // frames instead of snapping straight the instant someone arrives.
      state.gait += (gaitTarget - state.gait) * follow * 3;

      const yawTarget = THREE.MathUtils.clamp((target - state.x) * 2, -1, 1) * MAX_YAW;
      state.yaw += (yawTarget - state.yaw) * follow * 2;
    }

    if (!moved && !this.dirty) return;
    this.dirty = false;
    this.write();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.states.clear();
    this.members = [];
  }

  private write(): void {
    this.members.forEach((member, index) => {
      const state = this.states.get(member.id);
      if (!state) return;
      writeCharacter(
        this.positions,
        this.colors,
        index * CHARACTER_SEGMENTS * 2,
        {
          x: state.x,
          z: member.z + (member.anchored ? 0 : state.wanderZ),
          height: member.height,
          variant: member.variant,
          phase: state.phase,
          gait: state.gait,
          yaw: state.yaw,
        },
        this.ink,
        member.accent,
      );
    });

    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("color").needsUpdate = true;
  }

  /** Grows the shared buffers; keeps whatever is already in them. */
  private ensureCapacity(members: number): void {
    if (members <= this.capacity) return;

    // Grow in steps rather than exactly, so a crowd filling in one
    // person at a time doesn't reallocate on every arrival.
    const capacity = Math.max(16, Math.ceil(members / 16) * 16);
    const floats = capacity * CHARACTER_SEGMENTS * 2 * 3;
    const positions = new Float32Array(floats);
    const colors = new Float32Array(floats);
    positions.set(this.positions);
    colors.set(this.colors);

    this.positions = positions;
    this.colors = colors;
    this.capacity = capacity;

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
}
