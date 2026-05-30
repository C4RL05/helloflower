import { describe, it, expect } from "vitest";
import { Color } from "three";
import { PetalPainter } from "../../src/engine/paint/PetalPainter";
import { loadPetalMasks } from "../../src/engine/paint/PetalChannels";
import { DEFAULT_CONFIG } from "../../src/engine/model/FlowerConfig";

describe("PetalPainter", () => {
  const masks = loadPetalMasks();

  it("loads 32x16 masks in [0,1]", () => {
    expect(masks.width).toBe(32);
    expect(masks.height).toBe(16);
    for (const arr of [masks.color, masks.lightmap, masks.noise, masks.shadow]) {
      expect(arr.length).toBe(32 * 16);
      for (const v of arr) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of arr) expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("produces a clamped RGBA texture of mask size", () => {
    const painter = new PetalPainter(masks, DEFAULT_CONFIG);
    painter.paint(new Color(0.8, 0.1, 0.3), new Color(0.2, 0.5, 0.9));
    const data = painter.texture.image.data as unknown as Uint8Array;
    expect(data.length).toBe(32 * 16 * 4);
    for (const byte of data) {
      expect(byte).toBeGreaterThanOrEqual(0);
      expect(byte).toBeLessThanOrEqual(255);
    }
    // Alpha carries the lightmap gradient (specular mask), so it varies and is
    // not all opaque.
    let minA = 255;
    let maxA = 0;
    for (let i = 3; i < data.length; i += 4) {
      minA = Math.min(minA, data[i]);
      maxA = Math.max(maxA, data[i]);
    }
    expect(minA).toBeLessThan(255);
    expect(maxA).toBeGreaterThan(minA);
  });

  it("is deterministic for the same colors", () => {
    const p1 = new PetalPainter(masks, DEFAULT_CONFIG);
    const p2 = new PetalPainter(masks, DEFAULT_CONFIG);
    const c0 = new Color(0.9, 0.2, 0.4);
    const c1 = new Color(0.3, 0.0, 0.5);
    p1.paint(c0, c1);
    p2.paint(c0, c1);
    const a = p1.texture.image.data as unknown as Uint8Array;
    const b = p2.texture.image.data as unknown as Uint8Array;
    for (let i = 0; i < a.length; i++) expect(a[i]).toBe(b[i]);
  });
});
