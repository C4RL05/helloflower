import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { Petal } from "../../src/engine/geometry/Petal";
import { rayTriangleIntersect } from "../../src/engine/geometry/raytri";

describe("Petal / DynamicPlaneMesh", () => {
  const segX = 4;
  const segY = 6;

  function makePetal(curve = 0): Petal {
    const p = new Petal();
    p.build(segX, segY, false);
    p.build(segX, segY, true);
    p.curve = curve;
    return p;
  }

  it("builds a double-sided grid with the expected vertex/index counts", () => {
    const p = makePetal();
    const verts = (segX + 1) * (segY + 1);
    expect(p.vertexPositions.length).toBe(2 * verts);
    // each side: segX*segY quads * 2 tris * 3 indices
    expect(p.triangleIndices.length).toBe(2 * segX * segY * 6);
    expect(p.geometry.getAttribute("position")).toBeTruthy();
    expect(p.geometry.getAttribute("normal")).toBeTruthy();
  });

  it("collapses the iy=0 row to the origin after updatePetal", () => {
    const p = makePetal(0.3);
    const spline: Vector3[] = [];
    for (let iy = 0; iy <= segY; iy++) {
      spline.push(new Vector3(0.1 * iy, iy, 0.2));
    }
    p.updatePetal(spline);

    // iy=0: sidePos = 0, and curve term has sin(PI*iy/segY)=0 → all (0,0,0).
    const verts = p.vertexPositions;
    // front index map is ix*vcy+iy with vcy=segY+1; iy=0 → ix*vcy.
    const vcy = segY + 1;
    for (let ix = 0; ix <= segX; ix++) {
      const v = verts[ix * vcy + 0];
      expect(v.length()).toBeLessThan(1e-6);
    }
  });

  it("applies the sweep so column endpoints mirror in z", () => {
    const p = makePetal(0);
    const spline: Vector3[] = [];
    // z grows from 0 so the top row has sideZ = 0.5 (sidePos0.z = 0).
    for (let iy = 0; iy <= segY; iy++) {
      spline.push(new Vector3(0, iy, (0.5 * iy) / segY));
    }
    p.updatePetal(spline);

    const vcy = segY + 1;
    const iy = segY; // top row, sideZ = 0.5
    const left = p.vertexPositions[0 * vcy + iy]; // ix=0 → factor (2*0/segX-1) = -1
    const right = p.vertexPositions[segX * vcy + iy]; // ix=segX → factor +1
    expect(left.z).toBeCloseTo(-0.5, 6);
    expect(right.z).toBeCloseTo(0.5, 6);
  });
});

describe("rayTriangleIntersect (Möller–Trumbore, backface-culled)", () => {
  it("hits a correctly-wound triangle and reports the distance", () => {
    const origin = new Vector3(0.25, 0.25, 1);
    const dir = new Vector3(0, 0, -1);
    const t = rayTriangleIntersect(
      origin,
      dir,
      new Vector3(0, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(1, 0, 0),
    );
    expect(t).toBeCloseTo(1, 6);
  });

  it("culls the opposite winding (backface)", () => {
    const origin = new Vector3(0.25, 0.25, 1);
    const dir = new Vector3(0, 0, -1);
    const t = rayTriangleIntersect(
      origin,
      dir,
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 0),
    );
    expect(t).toBe(Number.MAX_VALUE);
  });
});
