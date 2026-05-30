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

export function loadPetalMasks(
  shadowVariant: "shadow01" | "shadow02" = "shadow01",
): PetalMasks {
  return {
    width: PETAL_CHANNEL_WIDTH,
    height: PETAL_CHANNEL_HEIGHT,
    color: Float32Array.from(PETAL_CHANNELS.color),
    lightmap: Float32Array.from(PETAL_CHANNELS.lightmap),
    noise: Float32Array.from(PETAL_CHANNELS.noise),
    shadow: Float32Array.from(PETAL_CHANNELS[shadowVariant]),
  };
}
