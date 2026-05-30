import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { NaturalCubicSpline } from "../../src/engine/math/NaturalCubicSpline";

describe("NaturalCubicSpline", () => {
  const cps = [
    new Vector3(0, 0, 0),
    new Vector3(0.13, 0.5, 0.1),
    new Vector3(0.36, 1.0, 0.0),
    new Vector3(0.75, 1.5, 0.1),
    new Vector3(1.14, 1.8, 0),
  ];

  it("returns exactly `steps` points", () => {
    const spline = new NaturalCubicSpline(32, false);
    const pts = spline.eval(cps)!;
    expect(pts).not.toBeNull();
    expect(pts.length).toBe(32);
  });

  it("interpolates the endpoints exactly", () => {
    const spline = new NaturalCubicSpline(32, false);
    const pts = spline.eval(cps)!;
    expect(pts[0].distanceTo(cps[0])).toBeLessThan(1e-5);
    expect(pts[pts.length - 1].distanceTo(cps[cps.length - 1])).toBeLessThan(
      1e-4,
    );
  });

  it("returns null for fewer than 2 control points", () => {
    const spline = new NaturalCubicSpline(8, false);
    expect(spline.eval([new Vector3(0, 0, 0)])).toBeNull();
  });

  it("is deterministic (regression guard on first interior sample)", () => {
    const spline = new NaturalCubicSpline(16, false);
    const a = spline.eval(cps)!;
    const b = spline.eval(cps)!;
    for (let i = 0; i < a.length; i++) {
      expect(a[i].distanceTo(b[i])).toBe(0);
    }
  });
});
