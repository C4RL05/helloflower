import { PerspectiveCamera, Vector3, MathUtils } from "three";
import type { PointerInput } from "./PointerInput";

/**
 * Orbital camera modernizing Unity `TouchOrbit` + `CameraBehaviour`.
 *
 * Drag azimuth/elevation around a target at a fixed distance, with eased follow
 * toward the goal (the original's `CameraBehaviour` lerps toward xGoto/yGoto).
 * Speeds/clamps approximate the original; exact values are a calibration item.
 * Zoom is a web modernization: mouse wheel (desktop) + two-finger pinch (touch).
 *
 * Sign convention (inverted "drag the scene" feel): drag right → azimuth
 * decreases; drag up (screen) → elevation decreases. See `handleInput`; negate
 * there to flip back to a "drag the camera" gesture.
 */
export class OrbitCamera {
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3();

  azimuth = 0; // degrees
  elevation = 14; // degrees
  distance = 5;

  // Goals (eased toward).
  private aziGoal = 0;
  private elevGoal = 14;
  private distGoal = 5;
  private pinchPrev = 0; // previous two-finger spread (px); 0 = no active pinch

  // Match the original CameraBehaviour: a drag accumulates into the *goal* and
  // the angle eases toward it each frame. The low ease + goal-lead gives the
  // smooth post-release glide ("momentum"). Distance eases 2.5× faster.
  xSpeed = 200; // deg per screen width dragged
  ySpeed = 100; // deg per screen height dragged
  ease = 0.1; // per-60fps-frame follow factor (CameraBehaviour ease)
  yMin = -25;
  yMax = 88; // allow a near top-down view (used by the intro)
  distMin = 0.5;
  distMax = 40;

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  /** Set framing immediately (no easing) — used when (re)loading a flower. */
  setFraming(opts: {
    target: Vector3;
    distance: number;
    azimuth?: number;
    elevation?: number;
  }): void {
    this.target.copy(opts.target);
    this.distance = this.distGoal = opts.distance;
    if (opts.azimuth !== undefined) this.azimuth = this.aziGoal = opts.azimuth;
    if (opts.elevation !== undefined)
      this.elevation = this.elevGoal = opts.elevation;
    this.distMin = opts.distance * 0.3;
    this.distMax = opts.distance * 4;
    this.apply();
  }

  /** Returns true if the user actively dragged this frame. */
  handleInput(input: PointerInput): boolean {
    if (input.touchCount !== 1 || input.width === 0) return false;
    const t = input.touches[0];
    if (t.dx === 0 && t.dy === 0) return false;

    // Inverted drag: pull the scene with the cursor (drag right → scene/azimuth
    // moves left, drag up → tilt down).
    this.aziGoal -= (t.dx / input.width) * this.xSpeed;
    this.elevGoal -= (t.dy / input.height) * this.ySpeed;
    this.elevGoal = MathUtils.clamp(this.elevGoal, this.yMin, this.yMax);
    return true;
  }

  /** Snap to specific angles (used by the screenshot/verification harness). */
  setAngles(azimuth: number, elevation: number): void {
    this.azimuth = this.aziGoal = azimuth;
    this.elevation = this.elevGoal = MathUtils.clamp(
      elevation,
      this.yMin,
      this.yMax,
    );
    this.apply();
  }

  /** Ease toward angles (sets goals only, so update() animates the transition). */
  glideTo(azimuth: number, elevation: number): void {
    this.aziGoal = azimuth;
    this.elevGoal = MathUtils.clamp(elevation, this.yMin, this.yMax);
  }

  zoom(deltaY: number): void {
    // wheel up (deltaY<0) → zoom in
    const factor = Math.exp(deltaY * 0.001);
    this.distGoal = MathUtils.clamp(
      this.distGoal * factor,
      this.distMin,
      this.distMax,
    );
  }

  /** Two-finger pinch zoom (touch). Returns true while a pinch is active. */
  pinch(input: PointerInput): boolean {
    if (input.touchCount < 2) {
      this.pinchPrev = 0;
      return false;
    }
    const a = input.touches[0];
    const b = input.touches[1];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (this.pinchPrev > 0 && dist > 0) {
      // Fingers spreading (dist grows) → smaller orbit distance → zoom in.
      this.distGoal = MathUtils.clamp(
        this.distGoal * (this.pinchPrev / dist),
        this.distMin,
        this.distMax,
      );
    }
    this.pinchPrev = dist;
    return true;
  }

  /** Idle auto-rotation (used by the Watch/Home idle state). */
  spinIdle(degPerFrame: number): void {
    this.aziGoal += degPerFrame;
  }

  update(dt = 1 / 60): void {
    // Frame-rate-independent easing: reproduce the original's per-60fps-frame
    // lerp at any refresh rate, so the momentum feel is the same on 120Hz.
    const frames = 60 * dt;
    const k = 1 - Math.pow(1 - this.ease, frames);
    const kDist = 1 - Math.pow(1 - this.ease * 2.5, frames); // distance settles faster
    this.azimuth += (this.aziGoal - this.azimuth) * k;
    this.elevation += (this.elevGoal - this.elevation) * k;
    this.distance += (this.distGoal - this.distance) * kDist;
    this.apply();
  }

  private apply(): void {
    const az = MathUtils.degToRad(this.azimuth);
    const el = MathUtils.degToRad(this.elevation);
    const cosEl = Math.cos(el);
    this.camera.position.set(
      this.target.x + this.distance * cosEl * Math.sin(az),
      this.target.y + this.distance * Math.sin(el),
      this.target.z + this.distance * cosEl * Math.cos(az),
    );
    this.camera.lookAt(this.target);
  }
}
