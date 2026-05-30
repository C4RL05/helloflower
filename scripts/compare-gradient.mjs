/**
 * Verifies the procedural gradient (scripts/ui/gradientTexture via the app's
 * __hf.gradientPixels) against the original GradientSlider PNG, using Playwright.
 * Decodes the PNG in Node, compares the INTERIOR (excludes the 1px border), and
 * reports mean/max per-channel diff. Requires a server at HF_URL.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const URL = process.env.HF_URL || "http://localhost:4173/";

function decodePng(buf) {
  let off = 8;
  let W = 0;
  let H = 0;
  let ct = 6;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const t = buf.toString("ascii", off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (t === "IHDR") {
      W = d.readUInt32BE(0);
      H = d.readUInt32BE(4);
      ct = d[9];
    } else if (t === "IDAT") idat.push(d);
    else if (t === "IEND") break;
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

const orig = decodePng(readFileSync("tests/fixtures/GradientSlider.png"));
// Interior excludes the 1px border on all sides.
const IW = orig.W - 2;
const IH = orig.H - 2;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__hf && window.__hf.ready, null, {
  timeout: 10000,
});
const proc = await page.evaluate(
  ([w, h]) => window.__hf.gradientPixels(w, h),
  [IW, IH],
);
await browser.close();

const MARGIN = Number(process.env.MARGIN ?? 3); // skip rounded-corner AA edge
let sum = 0;
let max = 0;
let n = 0;
let worst = null;
for (let y = MARGIN; y < IH - MARGIN; y++) {
  for (let x = MARGIN; x < IW - MARGIN; x++) {
    const oo = ((y + 1) * orig.W + (x + 1)) * 4; // original interior pixel
    if (orig.data[oo + 3] < 250) continue; // skip masked/transparent
    const po = (y * IW + x) * 4;
    for (let c = 0; c < 3; c++) {
      const diff = Math.abs(orig.data[oo + c] - proc[po + c]);
      sum += diff;
      n++;
      if (diff > max) {
        max = diff;
        worst = { x, y, c, orig: orig.data[oo + c], proc: proc[po + c] };
      }
    }
  }
}
const mean = sum / n;
console.log(
  `interior ${IW}x${IH}  mean abs diff = ${mean.toFixed(2)}/255 (${((1 - mean / 255) * 100).toFixed(2)}% match)  max = ${max}`,
);
console.log("worst pixel:", JSON.stringify(worst));
