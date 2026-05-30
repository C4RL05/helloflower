import { describe, it, expect } from "vitest";
import { FlowerData } from "../../src/engine/serialization/FlowerData";
import { DEFAULT_CONFIG } from "../../src/engine/model/FlowerConfig";
import { INCLUDED_FLOWERS } from "../../src/data/includedFlowers";

const config = DEFAULT_CONFIG; // textureMultiplier = 1 → colorMult = 2 for 1.0 header

describe("FlowerData parsing", () => {
  it("parses the built-in Rose structure", () => {
    const rose = FlowerData.parse(INCLUDED_FLOWERS[0], config);
    expect(rose.flowerName).toBe("Rose");
    expect(rose.version).toBe("helloflower1.0");
    expect(rose.corollas.length).toBe(3);
    expect(rose.corollas.map((c) => c.petalCount)).toEqual([5, 8, 8]);
  });

  it("applies the legacy 1.0 color doubling (colorMult = 2/textureMultiplier)", () => {
    const rose = FlowerData.parse(INCLUDED_FLOWERS[0], config);
    const mult = 2 / config.textureMultiplier;
    // First corolla colors raw = "0.02352941 0.2588235 0 ..." → scaled by colorMult.
    const c0 = rose.corollas[0].colors[0];
    expect(c0.r).toBeCloseTo(0.02352941 * mult, 6);
    expect(c0.g).toBeCloseTo(0.2588235 * mult, 6);
    expect(c0.b).toBeCloseTo(0, 6);
  });

  it("round-trips: parse → toString(1.3) → parse is idempotent", () => {
    const all = INCLUDED_FLOWERS;
    for (const desc of all) {
      const a = FlowerData.parse(desc, config);
      const str = a.toString();
      expect(str.startsWith("helloflower1.3#name_")).toBe(true);
      // Re-parsing a 1.3 string uses colorMult = 1, so values are stable.
      const b = FlowerData.parse(str, config);
      expect(b.corollas.length).toBe(a.corollas.length);
      for (let i = 0; i < a.corollas.length; i++) {
        const ca = a.corollas[i];
        const cb = b.corollas[i];
        expect(cb.petalCount).toBe(ca.petalCount);
        expect(cb.controlPoints.length).toBe(ca.controlPoints.length);
        for (let p = 0; p < ca.controlPoints.length; p++) {
          expect(cb.controlPoints[p].distanceTo(ca.controlPoints[p])).toBeLessThan(
            1e-6,
          );
        }
        for (let k = 0; k < ca.colors.length; k++) {
          expect(cb.colors[k].r).toBeCloseTo(ca.colors[k].r, 6);
          expect(cb.colors[k].g).toBeCloseTo(ca.colors[k].g, 6);
          expect(cb.colors[k].b).toBeCloseTo(ca.colors[k].b, 6);
        }
      }
    }
  });
});
