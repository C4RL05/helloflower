import { describe, it, expect } from "vitest";
import { Flower } from "../../src/scene/Flower";
import { DEFAULT_CONFIG } from "../../src/engine/model/FlowerConfig";
import { INCLUDED_FLOWERS } from "../../src/data/includedFlowers";

describe("Flower assembly (full pipeline)", () => {
  it("assembles every built-in flower with finite bounds", () => {
    for (const desc of INCLUDED_FLOWERS) {
      const flower = new Flower(desc, DEFAULT_CONFIG);
      expect(flower.corollas.length).toBe(3);

      // Each corolla produced a non-empty double-sided petal mesh.
      for (const corolla of flower.corollas) {
        expect(corolla.petal.vertexPositions.length).toBeGreaterThan(0);
        expect(corolla.group.children.length).toBe(corolla.data.petalCount);
      }

      const box = flower.computeBounds();
      expect(Number.isFinite(box.min.x)).toBe(true);
      expect(Number.isFinite(box.max.y)).toBe(true);
      expect(box.max.y).toBeGreaterThan(box.min.y);
    }
  });
});
