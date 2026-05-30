/**
 * Measures the average (non-background) color of built-in flowers, to calibrate
 * the e2e color-signature assertions. Requires a server at HF_URL.
 * Usage: INDICES=0,3,4 node scripts/measure.mjs
 */
import { chromium } from "@playwright/test";

const URL = process.env.HF_URL || "http://localhost:4173/";
const INDICES = (process.env.INDICES || "0,3,4").split(",").map(Number);

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({
  viewport: { width: 480, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__hf && window.__hf.ready, null, {
  timeout: 10000,
});

for (const idx of INDICES) {
  const avg = await page.evaluate(async (i) => {
    const hf = window.__hf;
    hf.loadIndex(i);
    hf.hideUI();
    hf.setBackground(0xffffff, 0xffffff);
    hf.setView(18, 45);
    await new Promise((r) => setTimeout(r, 500));
    return await new Promise((res) =>
      requestAnimationFrame(() => {
        const c = document.querySelector("canvas");
        const t = document.createElement("canvas");
        t.width = c.width;
        t.height = c.height;
        const ctx = t.getContext("2d");
        ctx.drawImage(c, 0, 0);
        const w = t.width;
        const h = t.height;
        const x0 = (w * 0.15) | 0;
        const y0 = (h * 0.15) | 0;
        const d = ctx.getImageData(x0, y0, (w * 0.7) | 0, (h * 0.7) | 0).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        let tot = 0;
        for (let p = 0; p < d.length; p += 4) {
          tot++;
          const R = d[p];
          const G = d[p + 1];
          const B = d[p + 2];
          if (R > 245 && G > 245 && B > 245) continue; // skip white bg
          r += R;
          g += G;
          b += B;
          n++;
        }
        res({
          r: Math.round(r / n),
          g: Math.round(g / n),
          b: Math.round(b / n),
          coverage: +(n / tot).toFixed(3),
        });
      }),
    );
  }, idx);
  console.log("index", idx, JSON.stringify(avg));
}
await browser.close();
