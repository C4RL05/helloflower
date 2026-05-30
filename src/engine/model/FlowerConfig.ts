/**
 * Tuning values that originally lived on the `Flower` MonoBehaviour and the
 * per-device `DeviceAssets` component, serialized inside the binary Unity scene
 * (`Assets/Scenes/HelloFlower.unity`, Unity 3.5.1f2).
 *
 * The four multipliers are the EXACT values extracted from the binary scene's
 * Flower component (verified via its PPtr layout: stem/material/4 textures/
 * cameraTarget). The petal point counts are still reasonable placeholders — they
 * affect mesh density only, not color/shadow fidelity, and the DeviceAssets
 * layout was not cleanly recoverable from the binary.
 */
export interface DeviceAssets {
  /** Spline sample count == petal mesh rows. `segmentsY = this - 1`. */
  petalCurvePointCount: number;
  /** Petal mesh columns. `segmentsX = this`. */
  petalSpanPointCount: number;
}

export interface FlowerConfig {
  /** Used by the legacy `helloflower1.0` color-doubling path. */
  colorMultiplier: number;
  /** Scales painted petal texture brightness. */
  textureMultiplier: number;
  /** Scales the computed specular color. */
  specularMultiplier: number;
  /** Scales the shadow darkening term in the painter. */
  shadowMultiplier: number;

  device: DeviceAssets;
}

/** Multipliers are the exact scene values; point counts are placeholders. */
export const DEFAULT_CONFIG: FlowerConfig = {
  colorMultiplier: 1.5,
  textureMultiplier: 1.1,
  specularMultiplier: 0.5,
  shadowMultiplier: 0.7,
  device: {
    petalCurvePointCount: 32,
    petalSpanPointCount: 12,
  },
};

/**
 * The factor a freshly picked color is scaled by before storage, matching Unity
 * `EditPetalModule`: `selectedColor * (colorMultiplier / textureMultiplier)`.
 */
export const colorPickScale = (config: FlowerConfig): number =>
  config.colorMultiplier / config.textureMultiplier;
