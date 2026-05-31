import {
  DoubleSide,
  Euler,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MathUtils,
} from "three";
import type { Color } from "three";
import { Petal } from "../engine/geometry/Petal";
import { PetalPainter } from "../engine/paint/PetalPainter";
import type { PetalMasks } from "../engine/paint/PetalChannels";
import type { CorollaData } from "../engine/serialization/CorollaData";
import type { NaturalCubicSpline } from "../engine/math/NaturalCubicSpline";
import type { FlowerConfig } from "../engine/model/FlowerConfig";
import { createPetalMaterial, updateSpecular } from "./PetalMaterial";

/**
 * Scene-graph port of Unity `Corolla.cs`: one shared, deformed petal mesh
 * instanced `petalCount` times in a ring, with a per-corolla painted material.
 *
 * Per-petal local rotation reproduces Unity `localEulerAngles = (sway,
 * 360*i/count, open)` using Euler order 'YXZ' (matches Unity's Z→X→Y
 * application order). The corolla node carries `spin` as its own Y rotation.
 *
 * Handedness vs the original Unity (left-handed) is reconciled by reflecting the
 * whole flower across X in Flower.ts (`group.scale.x = -1`), so per-petal angles
 * are used verbatim here.
 */
export class Corolla {
  readonly group = new Group();
  readonly data: CorollaData;
  readonly petal = new Petal();

  private readonly config: FlowerConfig;
  private readonly spline: NaturalCubicSpline;
  private readonly painter: PetalPainter;
  private readonly material: ReturnType<typeof createPetalMaterial>;
  private meshes: Mesh[] = [];

  constructor(
    name: string,
    data: CorollaData,
    config: FlowerConfig,
    spline: NaturalCubicSpline,
    masks: PetalMasks,
  ) {
    this.data = data;
    this.config = config;
    this.spline = spline;
    this.group.name = name;

    const segX = config.device.petalSpanPointCount;
    const segY = config.device.petalCurvePointCount - 1;
    this.petal.build(segX, segY, false);
    this.petal.build(segX, segY, true);
    this.petal.curve = data.curve;
    this.petal.updatePetal(spline.eval(data.controlPoints));

    this.painter = new PetalPainter(masks, config);
    this.painter.paint(data.colors[0], data.colors[1]);
    this.material = createPetalMaterial(this.painter.texture);
    updateSpecular(
      this.material,
      data.colors[0],
      data.colors[1],
      config.specularMultiplier,
    );

    this.setPetalCount(data.petalCount);
    this.setSpin(data.spin);
  }

  setPetalCount(petalCount: number): void {
    for (const m of this.meshes) this.group.remove(m);
    this.meshes = [];

    for (let i = 0; i < petalCount; i++) {
      const mesh = new Mesh(this.petal.geometry, this.material);
      mesh.name = "Petal" + i;
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.data.petalCount = petalCount;
    this.applyPetalRotations();
  }

  /** Apply per-petal local euler (sway, 360*i/count, open) in Unity's Z→X→Y order. */
  private applyPetalRotations(): void {
    const { open, sway, petalCount } = this.data;
    for (let i = 0; i < this.meshes.length; i++) {
      this.meshes[i].rotation.copy(
        new Euler(
          MathUtils.degToRad(sway),
          MathUtils.degToRad((360 * i) / petalCount),
          MathUtils.degToRad(open),
          "YXZ",
        ),
      );
    }
  }

  setOpen(open: number): void {
    this.data.open = open;
    this.applyPetalRotations();
  }

  setSway(sway: number): void {
    this.data.sway = sway;
    this.applyPetalRotations();
  }

  setCurve(curve: number): void {
    this.data.curve = curve;
    this.petal.curve = curve;
    this.updateShape();
  }

  /** Repaint the petal texture + specular after a color change (1-based index). */
  setColor(colorIndex: number, color: Color): void {
    this.data.colors[colorIndex - 1] = color;
    this.painter.paint(this.data.colors[0], this.data.colors[1]);
    updateSpecular(
      this.material,
      this.data.colors[0],
      this.data.colors[1],
      this.config.specularMultiplier,
    );
  }

  setSpin(spin: number): void {
    this.data.spin = spin;
    this.group.rotation.y = MathUtils.degToRad(spin);
  }

  /** Re-evaluate the spline and rebuild the (shared) petal mesh in place. */
  updateShape(): void {
    this.petal.updatePetal(this.spline.eval(this.data.controlPoints));
  }

  /** The petal profile curve (centerline through the control points). */
  evalShape() {
    return this.spline.eval(this.data.controlPoints);
  }

  /**
   * Transform node of the first petal instance, used by the shape editor to
   * place control-point handles on an actual petal and to convert
   * world↔control-point-local coordinates. Undefined if petalCount is 0.
   */
  get referenceNode(): Mesh | undefined {
    return this.meshes[0];
  }

  /** Petal meshes, for selection raycasts. */
  get petalMeshes(): readonly Mesh[] {
    return this.meshes;
  }

  /** Diagnostic: swap petals to an unlit material showing the raw texture. */
  setUnlit(): void {
    const mat = new MeshBasicMaterial({
      map: this.painter.texture,
      side: DoubleSide,
    });
    for (const m of this.meshes) m.material = mat;
  }

  /** Fade this corolla (1 = opaque) — used for the exploded select view and to
   * ghost unselected corollas. */
  setOpacity(alpha: number): void {
    const transparent = alpha < 1;
    this.material.uniforms.uOpacity.value = alpha;
    this.material.transparent = transparent;
    this.material.depthWrite = !transparent;
    // Cull back faces while faded, like the original alpha shader (Cull Back).
    // The petal geometry is already double-sided, so DoubleSide would composite
    // ~twice the layers and read far more opaque than the 0.5 alpha implies.
    this.material.side = transparent ? FrontSide : DoubleSide;
  }

  // ── exploded "select" view animation ──────────────────────────────────────
  private sepGoal = 0;
  private sepNow = 0;
  private opacityGoal = 1;
  private opacityNow = 1;

  /** Target Y offset for the separated select view (0 = merged). */
  setSeparationGoal(y: number): void {
    this.sepGoal = y;
  }

  /** Target opacity (1 = opaque); eased in update(). */
  setOpacityGoal(alpha: number): void {
    this.opacityGoal = alpha;
  }

  /** Ease separation + opacity toward their goals; call once per frame. */
  update(): void {
    const ease = 0.16;
    this.sepNow +=
      Math.abs(this.sepGoal - this.sepNow) > 1e-4
        ? (this.sepGoal - this.sepNow) * ease
        : this.sepGoal - this.sepNow;
    this.group.position.y = this.sepNow;

    if (this.opacityNow !== this.opacityGoal) {
      this.opacityNow +=
        Math.abs(this.opacityGoal - this.opacityNow) > 1e-3
          ? (this.opacityGoal - this.opacityNow) * ease
          : this.opacityGoal - this.opacityNow;
      this.setOpacity(this.opacityNow);
    }
  }
}
