import { describe, it, expect } from "vitest";
import { colorFromPick } from "../../src/editors/ColorEditor";
import { ColorUtils } from "../../src/engine/color/ColorUtils";

describe("ColorEditor.colorFromPick (analytic HSB)", () => {
  it("left edge (luma 0) is black", () => {
    const c = colorFromPick(0, 0.5);
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it("right edge (luma 1) is white for any hue", () => {
    for (const ny of [0, 0.33, 0.66, 1]) {
      const c = colorFromPick(1, ny);
      expect(c.r).toBeCloseTo(1, 5);
      expect(c.g).toBeCloseTo(1, 5);
      expect(c.b).toBeCloseTo(1, 5);
    }
  });

  it("center (luma 0.5) at hue 0 is pure red", () => {
    const c = colorFromPick(0.5, 0);
    expect(c.r).toBeCloseTo(1, 5);
    expect(c.g).toBeCloseTo(0, 5);
    expect(c.b).toBeCloseTo(0, 5);
  });
});

describe("ColorUtils.HsbToColor", () => {
  it("returns black at zero brightness", () => {
    const c = ColorUtils.HsbToColor(120, 1, 0);
    expect(c.r + c.g + c.b).toBe(0);
  });

  it("hue 120, full sat/brightness is green", () => {
    const c = ColorUtils.HsbToColor(120, 1, 1);
    expect(c.r).toBeCloseTo(0, 5);
    expect(c.g).toBeCloseTo(1, 5);
    expect(c.b).toBeCloseTo(0, 5);
  });
});
