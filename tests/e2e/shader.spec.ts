import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies every built-in flower renders with its expected color signature from
 * the petal shader (a regression guard against the earlier "too dark / blank"
 * lighting). For each flower we pose it top-down on white, sample the average of
 * the non-background pixels in the central region, and assert a per-flower hue
 * signature plus that a flower is actually present and not dark.
 *
 * Signatures were measured from the real renders (scripts/measure.mjs).
 */
declare global {
  interface Window {
    __hf: {
      ready: boolean;
      loadIndex(i: number): void;
      hideUI(): void;
      setBackground(top: number, bottom: number): void;
      setView(az: number, el: number): void;
    };
  }
}

interface Sample {
  r: number;
  g: number;
  b: number;
  coverage: number;
}

async function sampleFlower(page: Page, index: number): Promise<Sample> {
  await page.evaluate((i) => {
    window.__hf.loadIndex(i);
    window.__hf.hideUI();
    window.__hf.setBackground(0xffffff, 0xffffff);
    window.__hf.setView(18, 45);
  }, index);
  await page.waitForTimeout(600);

  return page.evaluate(
    () =>
      new Promise<Sample>((resolve) => {
        requestAnimationFrame(() => {
          const c = document.querySelector("canvas") as HTMLCanvasElement;
          const t = document.createElement("canvas");
          t.width = c.width;
          t.height = c.height;
          const ctx = t.getContext("2d")!;
          ctx.drawImage(c, 0, 0);
          const w = t.width;
          const h = t.height;
          const d = ctx.getImageData(
            (w * 0.15) | 0,
            (h * 0.15) | 0,
            (w * 0.7) | 0,
            (h * 0.7) | 0,
          ).data;
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
            if (R > 245 && G > 245 && B > 245) continue; // skip white background
            r += R;
            g += G;
            b += B;
            n++;
          }
          resolve({
            r: Math.round(r / n),
            g: Math.round(g / n),
            b: Math.round(b / n),
            coverage: n / tot,
          });
        });
      }),
  );
}

interface FlowerCase {
  name: string;
  index: number;
  check(s: Sample): void;
}

const FLOWERS: FlowerCase[] = [
  {
    name: "Rose (magenta)",
    index: 0,
    check: (s) => {
      expect(s.r).toBeGreaterThan(s.g + 30);
      expect(s.b).toBeGreaterThan(s.g);
    },
  },
  {
    name: "Blue (blue)",
    index: 1,
    check: (s) => {
      expect(s.b).toBeGreaterThan(s.r + 30);
      expect(s.b).toBeGreaterThan(s.g);
    },
  },
  {
    name: "Lily (light pink)",
    index: 2,
    check: (s) => {
      expect(Math.min(s.r, s.g, s.b)).toBeGreaterThan(90); // bright/pale
      expect(s.r).toBeGreaterThan(s.g);
      expect(s.b).toBeGreaterThan(s.g);
    },
  },
  {
    name: "Sunflower (yellow)",
    index: 3,
    check: (s) => {
      expect(s.r).toBeGreaterThan(s.b + 30);
      expect(s.g).toBeGreaterThan(s.b + 30);
    },
  },
  {
    name: "Lotus (warm pink)",
    index: 4,
    check: (s) => {
      expect(s.r).toBeGreaterThan(s.g + 20);
      expect(s.r).toBeGreaterThanOrEqual(s.b);
    },
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__hf?.ready, null, { timeout: 15000 });
});

for (const flower of FLOWERS) {
  test(`renders ${flower.name}`, async ({ page }) => {
    const s = await sampleFlower(page, flower.index);

    // A flower is present (not blank white) and not dark/black.
    expect(s.coverage).toBeGreaterThan(0.2);
    expect(s.coverage).toBeLessThan(0.97);
    expect(Math.max(s.r, s.g, s.b)).toBeGreaterThan(60);

    flower.check(s);
  });
}
