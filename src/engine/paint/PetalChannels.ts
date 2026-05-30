import {
  PETAL_CHANNELS,
  PETAL_CHANNEL_WIDTH,
  PETAL_CHANNEL_HEIGHT,
} from "./petalChannels.generated";

/**
 * The four petal mask alpha arrays the painter blends over, ported from Unity
 * `Flower.GetAlphas(alpha/lightmap/noise/shadowTexture)`. Source data is decoded
 * from the original 32x16 PSDs by scripts/extract-petal-channels.mjs.
 *
 * `shadow01` and `shadow02` are near-identical in the source; we default to
 * `shadow01` (the 3-channel PetalTexture01).
 */
export interface PetalMasks {
  readonly width: number;
  readonly height: number;
  readonly color: Float32Array; // ↔ colorAlphas
  readonly lightmap: Float32Array; // ↔ lightmapAlphas
  readonly noise: Float32Array; // ↔ noiseAlphas
  readonly shadow: Float32Array; // ↔ shadowAlphas
}

/** Reverse the rows of a width×height mask (vertical flip). */
function flipVertical(
  src: ReadonlyArray<number>,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const dst = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) out[dst + x] = src[y * w + x];
  }
  return out;
}

export function loadPetalMasks(
  shadowVariant: "shadow01" | "shadow02" = "shadow01",
): PetalMasks {
  const w = PETAL_CHANNEL_WIDTH;
  const h = PETAL_CHANNEL_HEIGHT;
  return {
    width: w,
    height: h,
    color: Float32Array.from(PETAL_CHANNELS.color),
    // The lightmap as decoded is oriented base-bright/tip-dark; flip it so the
    // petal is bright at the tip and dark at the base. The shadow mask is
    // base-dark (occlusion), so the two now reinforce instead of cancelling.
    lightmap: flipVertical(PETAL_CHANNELS.lightmap, w, h),
    noise: Float32Array.from(PETAL_CHANNELS.noise),
    shadow: Float32Array.from(PETAL_CHANNELS[shadowVariant]),
  };
}
