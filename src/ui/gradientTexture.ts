/**
 * Procedural reproduction of the original hand-tuned GradientSlider PSD/PNG.
 *
 * Decoding the original showed it is a separable gradient:
 *  - Down Y: a saturated rainbow (hue eased non-uniformly — captured as RGB
 *    stops sampled from the original's center column).
 *  - Across X: left half ramps brightness 0.254 → 1.0 (color = sat · V); right
 *    half ramps saturated → white 0 → 0.867 (color = lerp(sat, white, W)).
 *    Both ramps are ~linear; the split is at the center.
 *
 * Reproduced this way, the output matches the original to within a couple of
 * 8-bit levels (verified by scripts/compare-gradient.mjs via Playwright).
 */

// Saturated rainbow stops [t, r, g, b] from the original's center column.
const HUE_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 252, 0, 0],
  [0.0316, 252, 38, 0],
  [0.0632, 252, 94, 0],
  [0.0949, 252, 156, 0],
  [0.1265, 252, 211, 0],
  [0.1581, 252, 251, 0],
  [0.1897, 220, 252, 0],
  [0.2213, 169, 252, 0],
  [0.253, 112, 252, 0],
  [0.2846, 55, 252, 0],
  [0.3162, 13, 252, 0],
  [0.3478, 0, 252, 16],
  [0.3794, 0, 252, 58],
  [0.4111, 0, 252, 111],
  [0.4427, 0, 252, 166],
  [0.4743, 0, 252, 215],
  [0.5059, 0, 252, 250],
  [0.5375, 0, 220, 252],
  [0.5692, 0, 166, 252],
  [0.6008, 0, 104, 252],
  [0.6324, 0, 47, 252],
  [0.664, 0, 6, 252],
  [0.6957, 25, 0, 252],
  [0.7273, 71, 0, 252],
  [0.7589, 125, 0, 253],
  [0.7905, 179, 0, 252],
  [0.8221, 224, 0, 253],
  [0.8538, 252, 0, 249],
  [0.8854, 252, 0, 205],
  [0.917, 253, 0, 143],
  [0.9486, 253, 0, 78],
  [0.9802, 252, 0, 22],
  [1.0, 252, 0, 0],
];

/**
 * Horizontal luma curve [nx, value] measured (averaged over rows) from the
 * original. value ≤ 1 → brightness multiplier on the saturated color (left
 * half, black→sat); value > 1 → `1 + whiteAmount`, i.e. lerp(sat, white,
 * value-1) (right half, sat→white). The split (value = 1) is near nx 0.514.
 */
const LUMA_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.2510],
  [0.027, 0.2738],
  [0.054, 0.3019],
  [0.081, 0.3349],
  [0.108, 0.3725],
  [0.135, 0.4136],
  [0.162, 0.4577],
  [0.189, 0.504],
  [0.216, 0.5522],
  [0.243, 0.6007],
  [0.27, 0.6502],
  [0.297, 0.6987],
  [0.324, 0.7465],
  [0.351, 0.7935],
  [0.378, 0.8369],
  [0.405, 0.8784],
  [0.432, 0.9155],
  [0.459, 0.949],
  [0.486, 0.977],
  [0.514, 1.0],
  [0.541, 1.0274],
  [0.568, 1.0615],
  [0.595, 1.1021],
  [0.622, 1.1478],
  [0.649, 1.1974],
  [0.676, 1.251],
  [0.703, 1.3071],
  [0.73, 1.3653],
  [0.757, 1.4245],
  [0.784, 1.4838],
  [0.811, 1.5422],
  [0.838, 1.5996],
  [0.865, 1.6543],
  [0.892, 1.7063],
  [0.919, 1.7541],
  [0.946, 1.7969],
  [0.973, 1.8346],
  [1.0, 1.8655],
];

function lumaAt(nx: number): number {
  if (nx <= 0) return LUMA_STOPS[0][1];
  const last = LUMA_STOPS[LUMA_STOPS.length - 1];
  if (nx >= 1) return last[1];
  let i = 1;
  while (i < LUMA_STOPS.length && LUMA_STOPS[i][0] < nx) i++;
  const a = LUMA_STOPS[i - 1];
  const b = LUMA_STOPS[i];
  return a[1] + (b[1] - a[1]) * ((nx - a[0]) / (b[0] - a[0]));
}

// Saturated peak value (the original's rainbow peaks at ~252, not 255).
const V_PEAK = 252 / 255;

// Hue angle (degrees) for each stop, unwrapped to increase monotonically 0→360
// so interpolation never desaturates (the original keeps full saturation).
const HUE_ANGLES: number[] = (() => {
  const angles = HUE_STOPS.map(([, r, g, b]) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min || 1;
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return h;
  });
  let off = 0;
  for (let i = 1; i < angles.length; i++) {
    if (angles[i] + off < angles[i - 1]) off += 360;
    angles[i] += off;
  }
  return angles;
})();

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Saturated rainbow color at vertical fraction `t` (hue-angle interpolated). */
function hueAt(t: number): [number, number, number] {
  if (t <= 0) return hsvToRgb(HUE_ANGLES[0], 1, V_PEAK);
  if (t >= 1) return hsvToRgb(HUE_ANGLES[HUE_ANGLES.length - 1], 1, V_PEAK);
  let i = 1;
  while (i < HUE_STOPS.length && HUE_STOPS[i][0] < t) i++;
  const f = (t - HUE_STOPS[i - 1][0]) / (HUE_STOPS[i][0] - HUE_STOPS[i - 1][0]);
  const hue = HUE_ANGLES[i - 1] + (HUE_ANGLES[i] - HUE_ANGLES[i - 1]) * f;
  return hsvToRgb(hue, 1, V_PEAK);
}

/** Paint the gradient into a 2D context of size w×h. */
export function paintGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const ny = h > 1 ? y / (h - 1) : 0;
    const [sr, sg, sb] = hueAt(ny);
    for (let x = 0; x < w; x++) {
      const nx = w > 1 ? x / (w - 1) : 0;
      const luma = lumaAt(nx);
      let r: number;
      let g: number;
      let b: number;
      if (luma <= 1) {
        r = sr * luma;
        g = sg * luma;
        b = sb * luma;
      } else {
        const t = luma - 1; // whiten
        r = sr + (255 - sr) * t;
        g = sg + (255 - sg) * t;
        b = sb + (255 - sb) * t;
      }
      const o = (y * w + x) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Create an offscreen canvas painted with the gradient. */
export function createGradientCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paintGradient(c.getContext("2d")!, w, h);
  return c;
}
