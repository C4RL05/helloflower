import { BufferAttribute, BufferGeometry, Vector3 } from "three";

/**
 * Faithful port of Unity `DynamicPlaneMesh.cs`.
 *
 * Builds a (segmentsX+1)×(segmentsY+1) quad grid. `build` is called TWICE on the
 * same instance — once with `reverseNormals=false` (front) and once with
 * `true` (back) — sharing one growing vertex list to produce a double-sided
 * mesh whose two halves have opposite winding (hence opposite normals at the
 * same positions). Vertices are laid out `ix` outer, `iy` inner, so a grid
 * cell's linear index is `ix * vertexCountY + iy` (+ the prior build's offset).
 */
export class DynamicPlaneMesh {
  readonly geometry = new BufferGeometry();

  protected vertices: Vector3[] = [];
  protected uvs: number[] = []; // flat [u,v, u,v, ...]
  protected triangles: number[] = [];

  /** Index maps: front[ix][iy] and back[ix][iy] → vertex index. */
  protected vertex: number[][] = [];
  protected vertexInside: number[][] = [];

  protected segmentsX = 0;
  protected segmentsY = 0;
  protected vertexCountX = 0;
  protected vertexCountY = 0;
  protected vertexCount = 0;

  build(segmentsX: number, segmentsY: number, reverseNormals: boolean): void {
    this.segmentsX = segmentsX;
    this.segmentsY = segmentsY;
    this.vertexCountX = segmentsX + 1;
    this.vertexCountY = segmentsY + 1;
    this.vertexCount = this.vertexCountX * this.vertexCountY;

    const map: number[][] = [];
    for (let ix = 0; ix <= segmentsX; ix++) map.push(new Array(segmentsY + 1));
    if (reverseNormals) this.vertexInside = map;
    else this.vertex = map;

    const lastVertexCount = this.vertices.length;
    let vertexIndex = lastVertexCount;

    for (let ix = 0; ix <= segmentsX; ix++) {
      for (let iy = 0; iy <= segmentsY; iy++) {
        this.vertices.push(new Vector3(ix, iy, 0));
        // V is flipped (1 - iy/segY): three's DataTexture rows are top-origin,
        // so this orients the lightmap/shadow gradients with bright tips and a
        // darker base, matching the original.
        this.uvs.push(ix / segmentsX, 1 - iy / segmentsY);
        map[ix][iy] = vertexIndex;
        vertexIndex++;
      }
    }

    const vcy = this.vertexCountY;
    for (let ix = 0; ix < segmentsX; ix++) {
      for (let iy = 0; iy < segmentsY; iy++) {
        const ix1 = ix + 1;
        const iy1 = iy + 1;

        if (reverseNormals) {
          this.triangles.push(
            ix * vcy + iy + lastVertexCount,
            ix1 * vcy + iy + lastVertexCount,
            ix * vcy + iy1 + lastVertexCount,
          );
          this.triangles.push(
            ix1 * vcy + iy + lastVertexCount,
            ix1 * vcy + iy1 + lastVertexCount,
            ix * vcy + iy1 + lastVertexCount,
          );
        } else {
          this.triangles.push(
            ix * vcy + iy + lastVertexCount,
            ix * vcy + iy1 + lastVertexCount,
            ix1 * vcy + iy + lastVertexCount,
          );
          this.triangles.push(
            ix1 * vcy + iy1 + lastVertexCount,
            ix1 * vcy + iy + lastVertexCount,
            ix * vcy + iy1 + lastVertexCount,
          );
        }
      }
    }

    this.uploadAttributes();

    if (reverseNormals) {
      this.geometry.computeBoundingBox();
      this.geometry.computeBoundingSphere();
      this.geometry.computeVertexNormals();
    }
  }

  /** Faithful port of `UpdateVertices` — re-upload positions, recompute bounds + normals. */
  updateVertices(): void {
    const pos = this.geometry.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();
    this.geometry.computeVertexNormals();
  }

  /** Read-only access to the current triangle index list (for raycasting). */
  get triangleIndices(): readonly number[] {
    return this.triangles;
  }

  /** Read-only access to current local-space vertex positions. */
  get vertexPositions(): readonly Vector3[] {
    return this.vertices;
  }

  private uploadAttributes(): void {
    const positions = new Float32Array(this.vertices.length * 3);
    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }
    this.geometry.setAttribute("position", new BufferAttribute(positions, 3));
    this.geometry.setAttribute(
      "uv",
      new BufferAttribute(new Float32Array(this.uvs), 2),
    );
    this.geometry.setIndex(this.triangles.slice());
  }
}
