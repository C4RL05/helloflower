import { describe, it, expect } from "vitest";
import { Mathf } from "../../src/engine/math/Mathf";

describe("Mathf", () => {
  it("Clamp01 clamps to [0,1]", () => {
    expect(Mathf.Clamp01(-0.5)).toBe(0);
    expect(Mathf.Clamp01(0.5)).toBe(0.5);
    expect(Mathf.Clamp01(1.5)).toBe(1);
  });

  it("Lerp clamps t like Unity", () => {
    expect(Mathf.Lerp(0, 10, 0.5)).toBe(5);
    // t < 0 and t > 1 are clamped
    expect(Mathf.Lerp(0, 10, -1)).toBe(0);
    expect(Mathf.Lerp(0, 10, 2)).toBe(10);
  });

  it("LerpUnclamped does not clamp t", () => {
    expect(Mathf.LerpUnclamped(0, 10, 2)).toBe(20);
  });

  it("FloorToInt matches Math.floor", () => {
    expect(Mathf.FloorToInt(3.9)).toBe(3);
    expect(Mathf.FloorToInt(-0.1)).toBe(-1);
  });
});
