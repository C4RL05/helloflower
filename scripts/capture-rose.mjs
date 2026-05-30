/**
 * Playwright capture for shader verification: loads the Rose, hides UI, sets a
 * white background and a 3/4 top-down view to match helloflower-Rose.png, and
 * screenshots the canvas to helloflower-images/_compare/rose-ours.png.
 *
 * Tunables via env: AZ, EL (degrees), AMB (ambient), OUT (path), HF_URL.
 * Requires a server (e.g. `npx vite preview --port 4173`) at HF_URL.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const URL = process.env.HF_URL || "http://localhost:4173/";
const AZ = Number(process.env.AZ ?? 18);
const EL = Number(process.env.EL ?? 45);
const AMB = process.env.AMB !== undefined ? Number(process.env.AMB) : null;
const OUT = process.env.OUT || "helloflower-images/_compare/rose-ours.png";

mkdirSync(dirname(OUT), { recursive: true });

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
page.on("console", (m) => console.log("[page]", m.text()));
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__hf && window.__hf.ready, null, {
  timeout: 10000,
});
const diag = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const gl = c && (c.getContext("webgl2") || c.getContext("webgl"));
  return {
    canvas: c ? `${c.width}x${c.height}` : "none",
    gl: gl ? "ok" : "none",
  };
});
console.log("diag", JSON.stringify(diag));
await page.evaluate(
  ({ az, el, amb, unlit }) => {
    const hf = window.__hf;
    hf.loadIndex(0); // Rose
    hf.hideUI();
    hf.setBackground(0xffffff, 0xffffff);
    if (amb !== null) hf.setAmbient(amb);
    if (unlit) hf.unlit();
    hf.setView(az, el);
  },
  { az: AZ, el: EL, amb: AMB, unlit: process.env.UNLIT === "1" },
);
await page.waitForTimeout(700);
await page.locator("canvas").screenshot({ path: OUT });
await browser.close();
console.log(`wrote ${OUT}  (AZ=${AZ} EL=${EL}${AMB !== null ? ` AMB=${AMB}` : ""})`);
