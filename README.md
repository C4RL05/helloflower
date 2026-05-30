# helloflower

A creative 3D flower studio — shape petals, blend colors, and design gorgeous
flowers in the browser. Drag to orbit, touch to shape.

This is a faithful **TypeScript + Three.js** port of the original 2011 Unity 3.5
iOS app by [HelloEnjoy](https://helloenjoy.com), rebuilt for the modern web
(touch + mouse).

## Features

- **Procedural flowers** — each petal layer (corolla) is a spline-shaped,
  double-sided mesh, painted with a per-corolla texture blended from two colors.
- **Shape editor** — drag control-point handles to reshape petals; the tip stays
  pointed, the curve previews with marching-ants.
- **Color + parameters** — pick from a gradient spectrum and tune
  `petals / open / spin / sway / curve` per layer.
- **Gallery** — built-in presets plus your own creations saved to IndexedDB,
  with top-down thumbnails.
- **Share** — every flower encodes into a URL you can reopen or send.
- **Faithful look** — the petal shader, lighting (camera headlight + ambient),
  and color multipliers are reconstructed from the original assets/scene.

## Quick start

```bash
npm install
npm run dev        # start the dev server
```

Then open the local URL it prints.

### Other scripts

```bash
npm run build      # typecheck + production build (dist/)
npm run preview    # serve the production build
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end visual checks (Playwright + SwiftShader)
npm run typecheck  # tsc --noEmit
```

The first `npm run test:e2e` downloads a headless Chromium via
`npx playwright install chromium`.

## How it works

- `src/engine/` — framework-light core (no DOM): spline math, geometry, the
  serialization format, color/paint utilities. Unit-tested.
- `src/scene/` — Three.js objects: `Flower`, `Corolla`, the custom petal
  `ShaderMaterial`, lighting, background, thumbnail renderer.
- `src/input/` — unified pointer input and the orbit camera.
- `src/editors/` + `src/ui/` — the shape/color editors and the control panel.
- `src/io/` — gallery persistence (IndexedDB) and shareable URLs.
- `src/ui/gradientTexture.ts` — the color-picker gradient, reproduced
  procedurally (~99.6% match to the original).

Tests live in `tests/` (unit + e2e); helper/verification scripts in `scripts/`.

## Verification

- **28 unit tests** cover the spline, geometry, serialization round-trips, the
  painter, and color math.
- **6 Playwright e2e tests** render the built-in flowers headlessly and assert
  per-flower color signatures, plus that the procedural gradient matches the
  original.

## Credits

Original concept, art, and Unity app: **HelloEnjoy**. Web port built with
[Three.js](https://threejs.org), [Vite](https://vitejs.dev),
[Vitest](https://vitest.dev), and [Playwright](https://playwright.dev).

## License

The **source code** in this repository is licensed under the
[MIT License](LICENSE) © HelloEnjoy.

### Trademarks & assets

The MIT license covers the code only. It does **not** grant any rights to:

- the **"helloflower" and "HelloEnjoy" names, logos, and branding**, which are
  trademarks of HelloEnjoy; and
- the original **artwork and design assets** (e.g. petal textures, the gradient
  spectrum, and other graphics derived from the original app), which remain the
  property of HelloEnjoy and are **not** licensed for reuse.

You're welcome to use the code under the MIT terms, but please don't redistribute
the HelloEnjoy branding or original art, or present derivative works in a way
that implies endorsement by HelloEnjoy.
