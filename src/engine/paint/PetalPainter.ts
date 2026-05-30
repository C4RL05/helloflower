import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { Mathf } from "../math/Mathf";
import { grayscale } from "../color/ColorUtils";
import type { PetalMasks } from "./PetalChannels";
import type { FlowerConfig } from "../model/FlowerConfig";

/**
 * Faithful port of Unity `PetalPainter.cs`. Generates the per-corolla petal
 * texture by blending the two corolla colors over the precomputed mask arrays:
 *
 *   shadowAlpha = clamp01((main.gray + sec.gray) * 0.5 * shadowMultiplier)
 *   shadow      = lerp(shadowAlphas[i], 1, shadowAlpha)
 *   pixel       = lerp(main * noise[i], secondary, color[i])
 *                 * lightmap[i] * textureMultiplier * shadow
 *
 * Output is an UnsignedByte RGBA DataTexture (bottom-origin, matching the mask
 * row order); values are clamped to [0,255] exactly as Unity's RGB24 write did.
 */
export class PetalPainter {
  readonly texture: DataTexture;

  private readonly masks: PetalMasks;
  private readonly config: FlowerConfig;
  private readonly data: Uint8Array<ArrayBuffer>;

  constructor(masks: PetalMasks, config: FlowerConfig) {
    this.masks = masks;
    this.config = config;
    this.data = new Uint8Array(new ArrayBuffer(masks.width * masks.height * 4));

    this.texture = new DataTexture(
      this.data,
      masks.width,
      masks.height,
      RGBAFormat,
      UnsignedByteType,
    );
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.flipY = false; // mask arrays are already bottom-up
  }

  paint(main: Color, secondary: Color): void {
    const { color, lightmap, noise, shadow, width, height } = this.masks;
    const tm = this.config.textureMultiplier;
    const shadowAlpha = Mathf.Clamp01(
      (grayscale(main) + grayscale(secondary)) *
        0.5 *
        this.config.shadowMultiplier,
    );

    const n = width * height;
    for (let i = 0; i < n; i++) {
      const t = Mathf.Clamp01(color[i]); // Color.Lerp clamps t
      const sh = Mathf.Lerp(shadow[i], 1, shadowAlpha);
      const k = lightmap[i] * tm * sh;

      const mr = main.r * noise[i];
      const mg = main.g * noise[i];
      const mb = main.b * noise[i];

      const r = (mr + (secondary.r - mr) * t) * k;
      const g = (mg + (secondary.g - mg) * t) * k;
      const b = (mb + (secondary.b - mb) * t) * k;

      const o = i * 4;
      this.data[o] = toByte(r);
      this.data[o + 1] = toByte(g);
      this.data[o + 2] = toByte(b);
      // Alpha carries the lightmap gradient (bright tip → dark base) as a
      // specular mask, so the additive specular follows the same tip→base
      // falloff instead of brightening the base. (Opacity/ghosting is handled
      // by the material's uOpacity uniform, not this channel.)
      this.data[o + 3] = toByte(lightmap[i]);
    }

    this.texture.needsUpdate = true;
  }
}

function toByte(v: number): number {
  const x = v * 255;
  if (x <= 0) return 0;
  if (x >= 255) return 255;
  return Math.round(x);
}
