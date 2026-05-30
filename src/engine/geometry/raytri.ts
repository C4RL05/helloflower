import { Vector3 } from "three";

/**
 * Möller–Trumbore ray/triangle intersection, ported exactly from the inlined
 * version in Unity `Petal.Raycast` (originally from
 * http://www.graphics.cornell.edu/pubs/1997/MT97.pdf).
 *
 * Preserves the original's quirks: it is BACKFACE-CULLED with `det > -1e-5`
 * rejected (note the vert1/vert2 swap in the caller means "front" faces have
 * negative determinant), and uses ±0.001 barycentric tolerances. Returns the
 * ray distance `t` to the hit, or `Number.MAX_VALUE` for a miss.
 */
const _edge1 = new Vector3();
const _edge2 = new Vector3();
const _pvec = new Vector3();
const _tvec = new Vector3();
const _qvec = new Vector3();

export function rayTriangleIntersect(
  origin: Vector3,
  direction: Vector3,
  vert0: Vector3,
  vert1: Vector3,
  vert2: Vector3,
): number {
  _edge1.subVectors(vert1, vert0);
  _edge2.subVectors(vert2, vert0);
  _pvec.crossVectors(direction, _edge2);
  const det = _edge1.dot(_pvec);

  if (det > -0.00001) return Number.MAX_VALUE;

  const invDet = 1 / det;
  _tvec.subVectors(origin, vert0);
  const u = _tvec.dot(_pvec) * invDet;
  if (u < -0.001 || u > 1.001) return Number.MAX_VALUE;

  _qvec.crossVectors(_tvec, _edge1);
  const v = direction.dot(_qvec) * invDet;
  if (v < -0.001 || u + v > 1.001) return Number.MAX_VALUE;

  const t = _edge2.dot(_qvec) * invDet;
  if (t <= 0) return Number.MAX_VALUE;
  return t;
}
