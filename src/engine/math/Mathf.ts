/**
 * Faithful port of the subset of UnityEngine.Mathf used by the flower engine.
 *
 * These match Unity's semantics exactly (notably: `Lerp` clamps `t` to [0,1],
 * `Clamp01` clamps to [0,1]), because the ported geometry/painting code depends
 * on that behavior. Do NOT substitute generic equivalents.
 */
export const Mathf = {
  PI: Math.PI,

  Clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  },

  Clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  },

  /** Unity Mathf.Lerp: t is clamped to [0,1]. */
  Lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Mathf.Clamp01(t);
  },

  /** Unity Mathf.LerpUnclamped. */
  LerpUnclamped(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  },

  /** Unity Mathf.FloorToInt. */
  FloorToInt(value: number): number {
    return Math.floor(value);
  },

  Sin(x: number): number {
    return Math.sin(x);
  },

  Min(a: number, b: number): number {
    return a < b ? a : b;
  },

  Max(a: number, b: number): number {
    return a > b ? a : b;
  },
} as const;
