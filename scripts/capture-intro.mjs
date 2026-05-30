import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const URL = process.env.HF_URL || "http://localhost:4173/";
mkdirSync("helloflower-images/_compare", { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({
  viewport: { width: 480, height: 540 },
  deviceScaleFactor: 2,
});
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__hf && window.__hf.ready, null, {
  timeout: 10000,
});
await page.waitForTimeout(900);
await page.screenshot({ path: "helloflower-images/_compare/intro.png" });

await page.mouse.click(240, 270); // click anywhere to start
await page.waitForTimeout(1000);
await page.screenshot({ path: "helloflower-images/_compare/intro-after.png" });

await browser.close();
console.log("wrote intro.png and intro-after.png");
