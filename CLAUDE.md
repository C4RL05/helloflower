# CLAUDE.md

Project guide for working on **helloflower** — a TypeScript + Three.js port of the
2011 Unity 3.5 iOS app by HelloEnjoy. Keep this file current as conventions change.

## What it is

A browser flower studio: spline-shaped petals, painted per-corolla textures,
shape/color/parameter editors, gallery (IndexedDB), shareable URLs, and an intro
landing screen. The goal is **faithful reproduction** of the original look/behavior.

The original Unity project lives at `HelloFlower-Unity/` (gitignored, read-only
reference). Reference screenshots/renders are in `helloflower-images/` (gitignored).

## Commands

```bash
npm install
npm run dev         # dev server (HMR). Has been on port 5174 (5173 often taken).
npm run build       # tsc --noEmit && vite build  → dist/
npm run preview     # serve dist/ (used by e2e; see below)
npm test            # Vitest unit tests (28)
npm run test:e2e    # Playwright e2e (6) — auto-builds + serves + SwiftShader
npm run typecheck   # tsc --noEmit
```

## Architecture

```
src/
  engine/        PURE core (three-only, no DOM): math, color, geometry, paint, serialization, model
    math/        Mathf, NaturalCubicSpline
    color/       ColorUtils (HSB, grayscale, Unity-style lerp/clamp)
    geometry/    DynamicPlaneMesh (double-sided grid), Petal, raytri (Moller-Trumbore)
    paint/       PetalChannels (mask arrays), PetalPainter, petalChannels.generated.ts
    serialization/ FlowerData, CorollaData  (the helloflower1.x string format)
    model/       FlowerConfig (tuning values)
  scene/         three objects: Flower, Corolla, PetalMaterial (custom shader),
                 LightingRig, GradientBackground, ThumbnailRenderer
  input/         PointerInput (unified touch/mouse), OrbitCamera
  editors/       SplineEditor (drag control points), ColorEditor (analytic HSB)
  ui/            ControlPanel (left column), Gallery, gradientTexture (procedural picker)
  io/            FlowerStore (IndexedDB), ShareUrl
  data/          includedFlowers, presetFlowers (verbatim strings)
  main.ts        App shell: render loop, intro, input routing, debug hooks
tests/unit/      Vitest      tests/e2e/  Playwright      tests/fixtures/  GradientSlider.png (reference)
scripts/         dev/verification tools (PSD decode, scene extract, gradient compare, captures)
```

`App` (main.ts) owns the loop. Editors mutate the same `CorollaData` objects that
`FlowerData` holds, so `flower.toDescription()` always reflects live edits.

## Conventions

- TypeScript strict; `noUnusedLocals/Parameters`. Match surrounding style.
- `engine/` must not import DOM/three-scene/UI — only `three` + local `Mathf`.
- Comments explain *why* (esp. faithfulness quirks), not *what*.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Don't commit/push unless asked. Repo: `github.com/C4RL05/helloflower`, branch `main`.
  MIT license (code only; HelloEnjoy brand/art reserved — see README).

## Faithfulness invariants (don't regress)

- Petal colors of built-in `helloflower1.0` flowers use `colorMult = 2/textureMultiplier`.
- Scene tuning values were extracted from the **binary** Unity scene and are EXACT:
  `colorMultiplier 1.5, textureMultiplier 1.1, specularMultiplier 0.5, shadowMultiplier 0.7`
  (in `FlowerConfig`). Ambient is `0.25` (scene RenderSettings ambient is 0.314;
  we chose 0.25). Petal point counts (32/12) are still placeholders.
- Petal shader = `texture*(ambient + cameraHeadlight·N·V + mainDir·N·L) + specular·specMask`
  (custom ShaderMaterial; NOT MeshPhong — its PBR /π darkened it). Specular is gated by
  the lightmap (packed into the texture **alpha**) so the base stays dark.
- The lightmap mask is **flipped vertically** in `loadPetalMasks` (decoded base-bright;
  flipped to tip-bright/base-dark so it reinforces the base-dark shadow instead of cancelling).
- Color picker gradient is generated procedurally (`gradientTexture.ts`), ~99.6% match to
  the original PNG (now a fixture). Picked colors scale by `colorMultiplier/textureMultiplier`.
- Flower is mirrored via `Flower group.scale.x = -1` (Unity left-handed → three right-handed).

## Dev/test gotchas

- **Bash cwd persists** between tool calls — a `cd helloflower-images` earlier will break
  later relative commands. Re-`cd` to the project root when in doubt.
- **e2e needs a fresh preview**: `playwright.config` `webServer` has `reuseExistingServer:true`,
  so a stale `vite preview` on 4173 serves an OLD build. After `vite build`, kill + restart
  preview before capturing/comparing, or let Playwright start it.
- **Headless WebGL** needs SwiftShader flags (`--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader --ignore-gpu-blocklist`). Already set in playwright.config and scripts.
- **Two canvases now** (WebGL + color picker): capture helpers use `locator("canvas").first()`.
- **e2e viewport pinned to 480x630** (portrait) so color-sample checks frame flowers like
  `scripts/measure.mjs`. Changing lighting/painter may shift the sampled averages — re-run
  `measure.mjs` and recalibrate the per-flower signatures in `tests/e2e/shader.spec.ts`.
- `renderer.preserveDrawingBuffer = true` so the canvas is readable for screenshots.
- `tsconfig` excludes `tests/e2e` (Playwright transpiles those Node+browser specs itself).

## Debug hooks (window.__hf)

Exposed by main.ts for the harness: `ready, loadIndex(i), setView(az,el), setAmbient(v),
setBackground(top,bottom), hideUI()/showUI(), unlit(), gradientPixels(w,h)`. `setView`
dismisses the intro.

## Verification scripts (scripts/)

`extract-petal-channels.mjs` (PSD→mask arrays), `analyze/compare/save-gradient.mjs`
(picker gradient vs original), `measure.mjs` (flower color signatures),
`capture-rose.mjs` / `capture-intro.mjs` (Playwright screenshots; env AZ/EL/AMB/UNLIT).

See **docs/PORTING.md** for the Unity→TS mapping, extracted values, and the binary-scene
extraction method.
