/**
 * Saves upscaled PNGs of the procedural gradient (from the app via Playwright)
 * and the original, for a side-by-side visual check.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import zlib from "node:zlib";

const URL = process.env.HF_URL || "http://localhost:4173/";
const W = 77;
const H = 256;
const SCALE = 3;

function decodePng(buf) {
  let off = 8, w = 0, h = 0, ct = 6;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const t = buf.toString("ascii", off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (t === "IDAT") idat.push(d);
    else if (t === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : 3, stride = w * ch, out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = raw[p + i];
      if (f === 1) v = (v + a) & 255; else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; v = (v + pr) & 255; }
      cur[i] = v;
    }
    p += stride;
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, s = x * ch; out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = ch === 4 ? cur[s + 3] : 255; }
    prev = cur;
  }
  return { w, h, data: out };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer); dv.setUint32(0, data.length); out.set([...type].map((c) => c.charCodeAt(0)), 4); out.set(data, 8); dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out; }
function encodePng(rgba, w, h) {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 4)] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (1 + w * 4) + 1); }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(zlib.deflateSync(Buffer.from(raw)))), chunk("IEND", new Uint8Array(0))]);
}
function upscale(src, w, h, s) {
  const W2 = w * s, H2 = h * s, out = new Uint8Array(W2 * H2 * 4);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const si = (Math.floor(y / s) * w + Math.floor(x / s)) * 4, di = (y * W2 + x) * 4;
    out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = 255;
  }
  return { data: out, w: W2, h: H2 };
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__hf && window.__hf.ready, null, { timeout: 10000 });
const proc = await page.evaluate(([w, h]) => window.__hf.gradientPixels(w, h), [W, H]);
await browser.close();

mkdirSync("helloflower-images/_compare", { recursive: true });
const orig = decodePng(readFileSync("tests/fixtures/GradientSlider.png"));
const up1 = upscale(new Uint8Array(proc), W, H, SCALE);
const up2 = upscale(orig.data, orig.w, orig.h, SCALE);
writeFileSync("helloflower-images/_compare/gradient-procedural.png", encodePng(up1.data, up1.w, up1.h));
writeFileSync("helloflower-images/_compare/gradient-original.png", encodePng(up2.data, up2.w, up2.h));
console.log("wrote gradient-procedural.png and gradient-original.png");
