import { Color } from "three";
import { Mathf } from "../math/Mathf";

/**
 * Faithful ports of the Unity color math the flower depends on.
 *
 * IMPORTANT semantics preserved from Unity:
 * - `grayscale` uses the Rec.601-ish weights Unity uses (0.299/0.587/0.114) on
 *   possibly-unclamped components.
 * - `lerp` clamps `t` to [0,1] but does NOT clamp the resulting components
 *   (Unity `Color.Lerp`).
 * - `HsbToColor` mirrors `ColorUtils.HsbToColor` exactly (hue in degrees).
 *
 * We use three's `Color` purely as an {r,g,b} container; its components may hold
 * values outside [0,1] (the painter relies on this), so do NOT use three's own
 * `.lerp`/`.getHSL` here.
 */

/** Unity `Color.grayscale`. */
export function grayscale(c: Color): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/** Unity `Color.Lerp(a, b, t)` — clamps t, not components. */
export function lerpColor(a: Color, b: Color, t: number, out?: Color): Color {
  const tt = Mathf.Clamp01(t);
  const result = out ?? new Color();
  result.r = a.r + (b.r - a.r) * tt;
  result.g = a.g + (b.g - a.g) * tt;
  result.b = a.b + (b.b - a.b) * tt;
  return result;
}

/** Component-wise scalar multiply (returns a new Color). */
export function mulScalar(c: Color, s: number): Color {
  return new Color(c.r * s, c.g * s, c.b * s);
}

export const ColorUtils = {
  /** Faithful port of `ColorUtils.HsbToColor(hue, saturation, brightness)`. */
  HsbToColor(hue: number, saturation: number, brightness: number): Color {
    hue = hue % 360;
    const color = new Color(0, 0, 0);

    if (brightness === 0) return color;

    hue /= 60;
    const i = Mathf.FloorToInt(hue);
    const f = hue - i;
    const p = brightness * (1 - saturation);
    const q = brightness * (1 - saturation * f);
    const t = brightness * (1 - saturation * (1 - f));

    switch (i) {
      case 0:
        color.r = brightness;
        color.g = t;
        color.b = p;
        break;
      case 1:
        color.r = q;
        color.g = brightness;
        color.b = p;
        break;
      case 2:
        color.r = p;
        color.g = brightness;
        color.b = t;
        break;
      case 3:
        color.r = p;
        color.g = q;
        color.b = brightness;
        break;
      case 4:
        color.r = t;
        color.g = p;
        color.b = brightness;
        break;
      case 5:
        color.r = brightness;
        color.g = p;
        color.b = q;
        break;
      default:
        break;
    }

    return color;
  },

  /** Faithful port of `ColorUtils.Clamp` (clamps each component to [0,1]). */
  Clamp(color: Color): Color {
    return new Color(
      Mathf.Clamp01(color.r),
      Mathf.Clamp01(color.g),
      Mathf.Clamp01(color.b),
    );
  },
} as const;
