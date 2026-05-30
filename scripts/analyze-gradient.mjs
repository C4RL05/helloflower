/**
 * Decodes the original GradientSlider PNG and analyzes its structure so we can
 * reproduce it procedurally. Prints the center-column hue progression, a middle
 * row's luma curve, corners, and how far the current analytic HSB formula
 * deviates per channel.
 */
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

function decodePng(buf) {
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const stride = width * ch;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = raw[p + i];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 255;
      }
      cur[i] = v;
    }
    p += stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * ch;
      if (ch >= 3) {
        out[o] = cur[s];
        out[o + 1] = cur[s + 1];
        out[o + 2] = cur[s + 2];
        out[o + 3] = ch === 4 ? cur[s + 3] : 255;
      } else {
        out[o] = out[o + 1] = out[o + 2] = cur[s];
        out[o + 3] = 255;
      }
    }
    prev = cur;
  }
  return { width, height, colorType, data: out };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

const png = decodePng(readFileSync("tests/fixtures/GradientSlider.png"));
const { width: W, height: H, data, colorType } = png;
const px = (x, y) => {
  const o = (y * W + x) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
};

console.log(`size ${W}x${H} colorType ${colorType}`);

console.log("\n-- center column (x=" + (W >> 1) + ") hue down Y --");
for (let y = 0; y < H; y += 16) {
  const [r, g, b, a] = px(W >> 1, y);
  const hsv = rgbToHsv(r, g, b);
  console.log(
    `y=${String(y).padStart(3)} rgb(${r},${g},${b}) a${a}  H=${hsv.h.toFixed(0)} S=${hsv.s.toFixed(2)} V=${hsv.v.toFixed(2)}`,
  );
}

console.log("\n-- middle row (y=" + (H >> 1) + ") across X --");
for (let x = 0; x < W; x += 6) {
  const [r, g, b] = px(x, H >> 1);
  console.log(`x=${String(x).padStart(2)} rgb(${r},${g},${b})`);
}

console.log("\n-- corners --");
for (const [lx, ly, name] of [
  [0, 0, "TL"],
  [W - 1, 0, "TR"],
  [0, H - 1, "BL"],
  [W - 1, H - 1, "BR"],
  [W >> 1, 0, "Tmid"],
  [W >> 1, H - 1, "Bmid"],
]) {
  const [r, g, b, a] = px(lx, ly);
  console.log(`${name}: rgb(${r},${g},${b}) a${a}`);
}

// transparency? count non-opaque
let nonOpaque = 0;
for (let i = 3; i < data.length; i += 4) if (data[i] < 250) nonOpaque++;
console.log(`\nnon-opaque pixels: ${nonOpaque}/${W * H}`);
