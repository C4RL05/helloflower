import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

/**
 * Verifies the procedurally generated color picker gradient
 * (src/ui/gradientTexture.ts) matches the original hand-tuned GradientSlider
 * PNG to within a couple of 8-bit levels. Decodes the reference fixture in Node
 * and compares against the app's `__hf.gradientPixels` (the real generator).
 */
function decodePng(buf: Buffer): { W: number; H: number; data: Uint8Array } {
  let off = 8;
  let W = 0;
  let H = 0;
  let ct = 6;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      W = d.readUInt32BE(0);
      H = d.readUInt32BE(4);
      ct = d[9];
    } else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : 3;
  const stride = W * ch;
  const out = new Uint8Array(W * H * 4);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const f = raw[p++];
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = raw[p + i];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 255;
      }
      cur[i] = v;
    }
    p += stride;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const s = x * ch;
      out[o] = cur[s];
      out[o + 1] = cur[s + 1];
      out[o + 2] = cur[s + 2];
      out[o + 3] = ch === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { W, H, data: out };
}

test("procedural gradient matches the original GradientSlider PNG", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__hf?.ready, null, {
    timeout: 15000,
  });

  const orig = decodePng(readFileSync("tests/fixtures/GradientSlider.png"));
  const IW = orig.W - 2; // interior excludes 1px border
  const IH = orig.H - 2;
  const proc: number[] = await page.evaluate(
    ([w, h]) => (window as any).__hf.gradientPixels(w, h),
    [IW, IH],
  );

  const MARGIN = 3; // skip rounded-corner anti-aliasing
  let sum = 0;
  let n = 0;
  let max = 0;
  for (let y = MARGIN; y < IH - MARGIN; y++) {
    for (let x = MARGIN; x < IW - MARGIN; x++) {
      const oo = ((y + 1) * orig.W + (x + 1)) * 4;
      if (orig.data[oo + 3] < 250) continue;
      const po = (y * IW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const diff = Math.abs(orig.data[oo + c] - proc[po + c]);
        sum += diff;
        n++;
        if (diff > max) max = diff;
      }
    }
  }
  const mean = sum / n;
  console.log(
    `gradient match: mean ${mean.toFixed(2)}/255 (${((1 - mean / 255) * 100).toFixed(2)}%), max ${max}`,
  );

  expect(mean).toBeLessThan(2); // visually identical
  expect(max).toBeLessThan(14); // no large localized deviation
});
