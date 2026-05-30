import { Box3, Group } from "three";
import { FlowerData } from "../engine/serialization/FlowerData";
import { NaturalCubicSpline } from "../engine/math/NaturalCubicSpline";
import type { FlowerConfig } from "../engine/model/FlowerConfig";
import { loadPetalMasks } from "../engine/paint/PetalChannels";
import { Corolla } from "./Corolla";

/**
 * Scene-graph port of Unity `Flower.cs` — owns the corollas and the shared
 * spline evaluator. For M1 it just assembles the geometry; raycast selection
 * and camera-target centering arrive in later milestones (a simple bounding-box
 * helper is provided for initial framing).
 */
export class Flower {
  readonly group = new Group();
  readonly data: FlowerData;
  readonly corollas: Corolla[] = [];

  private readonly spline: NaturalCubicSpline;

  constructor(description: string, config: FlowerConfig) {
    this.group.name = "Flower";
    // Reflect across X to convert Unity's left-handed space to three's
    // right-handed space (otherwise the flower renders mirrored). DoubleSide
    // petals + the inverse-transpose normal matrix keep lighting correct.
    this.group.scale.x = -1;
    this.data = FlowerData.parse(description, config);
    this.spline = new NaturalCubicSpline(
      config.device.petalCurvePointCount,
      false,
    );

    const masks = loadPetalMasks();

    this.data.corollas.forEach((corollaData, i) => {
      const corolla = new Corolla(
        "Corolla" + i,
        corollaData,
        config,
        this.spline,
        masks,
      );
      this.corollas.push(corolla);
      this.group.add(corolla.group);
    });
  }

  /** World-space bounding box of the assembled flower (for camera framing). */
  computeBounds(): Box3 {
    return new Box3().setFromObject(this.group);
  }

  get name(): string {
    return this.data.flowerName;
  }

  /**
   * Serialize the CURRENT flower state (editors mutate the same CorollaData the
   * FlowerData holds, so this reflects live edits) as a `helloflower1.3` string.
   */
  toDescription(): string {
    return this.data.toString();
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}
