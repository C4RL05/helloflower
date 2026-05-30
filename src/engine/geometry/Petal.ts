import { Vector3 } from "three";
import { DynamicPlaneMesh } from "./DynamicPlaneMesh";
import { Mathf } from "../math/Mathf";
import { rayTriangleIntersect } from "./raytri";

/**
 * Faithful port of Unity `Petal.cs` (extends DynamicPlaneMesh).
 *
 * Deforms the flat grid into the petal surface from the spline-evaluated
 * positions: row `iy` follows the spline, column `ix` spreads the width via the
 * `(2*ix/segX - 1)` sweep on the spline's z, and `curve` bows the surface in x
 * with a sin·sin bump. Both the front and the back (inside) vertex of each grid
 * cell receive the same position.
 */
export class Petal extends DynamicPlaneMesh {
  radius = 1;
  sweep = 1;
  twist = 0;
  curve = 0;

  updatePetal(splinePositions: Vector3[] | null): void {
    if (splinePositions == null) return;

    const sidePos0 = splinePositions[0];

    for (let iy = 0; iy <= this.segmentsY; iy++) {
      const sp = splinePositions[iy];
      const sideX = sp.x - sidePos0.x;
      const sideY = sp.y - sidePos0.y;
      const sideZ = sp.z - sidePos0.z;

      for (let ix = 0; ix <= this.segmentsX; ix++) {
        const x =
          sideX +
          this.curve *
            Mathf.Sin(Mathf.PI * (ix / this.segmentsX)) *
            Mathf.Sin(Mathf.PI * (iy / this.segmentsY));
        const y = sideY;
        const z = sideZ * ((2 * ix) / this.segmentsX - 1);

        const front = this.vertices[this.vertex[ix][iy]];
        front.set(x, y, z);
        const back = this.vertices[this.vertexInside[ix][iy]];
        back.set(x, y, z);
      }
    }

    this.updateVertices();
  }

  /**
   * Ray/petal intersection in the petal's LOCAL space. Returns the nearest hit
   * distance, or Number.MAX_VALUE on miss. Mirrors `Petal.Raycast`, including
   * the vert1/vert2 swap (`tris[i+2]` before `tris[i+1]`).
   */
  raycastLocal(originLocal: Vector3, directionLocal: Vector3): number {
    const verts = this.vertices;
    const tris = this.triangles;
    let distance = Number.MAX_VALUE;

    for (let i = 0; i < tris.length; i += 3) {
      const t = rayTriangleIntersect(
        originLocal,
        directionLocal,
        verts[tris[i]],
        verts[tris[i + 2]],
        verts[tris[i + 1]],
      );
      if (t < distance) distance = t;
    }
    return distance;
  }
}
