import { Color } from "three";
import { ColorUtils } from "../engine/color/ColorUtils";

/**
 * Color selection ported from Unity `ColorEditor.cs`, which computes the color
 * ANALYTICALLY from the touch position (the spectrum image was only decorative):
 *
 *   hue        = 360 * y / h
 *   luma       = x / w
 *   luma < 0.5 → brightness = luma / 0.5, saturation = 1
 *   else       → saturation = 1 - (luma - 0.5) / 0.5, brightness = 1
 *   color      = HsbToColor(hue, saturation, brightness)
 *
 * `nx`/`ny` are normalized [0,1] with ny=0 at the BOTTOM (Unity origin), so the
 * left edge is black, the center is the pure hue, and the right edge is white.
 */
export function colorFromPick(nx: number, ny: number): Color {
  const hue = 360 * ny;
  const luma = nx;
  let saturation = 1;
  let brightness = 1;
  if (luma < 0.5) brightness = luma / 0.5;
  else saturation = 1 - (luma - 0.5) / 0.5;
  return ColorUtils.HsbToColor(hue, saturation, brightness);
}

/**
 * Paint the spectrum into a canvas using the exact pick math, so the visible
 * gradient is WYSIWYG with what `colorFromPick` returns. Canvas rows are
 * top-origin, so we flip ny = 1 - row/h.
 */
export function renderSpectrum(canvas: HTMLCanvasElement): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    const ny = 1 - y / (h - 1);
    for (let x = 0; x < w; x++) {
      const nx = x / (w - 1);
      const c = ColorUtils.Clamp(colorFromPick(nx, ny));
      const o = (y * w + x) * 4;
      data[o] = Math.round(c.r * 255);
      data[o + 1] = Math.round(c.g * 255);
      data[o + 2] = Math.round(c.b * 255);
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
