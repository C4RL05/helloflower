import * as THREE from "three";
// Match the original 2011 gamma pipeline: no sRGB decode/encode or color
// management, so the painted texture multiplies straight through the lighting
// like Unity 3.5's fixed-function path.
THREE.ColorManagement.enabled = false;
import { Flower } from "./scene/Flower";
import { DEFAULT_CONFIG, colorPickScale } from "./engine/model/FlowerConfig";
import { INCLUDED_FLOWERS } from "./data/includedFlowers";
import { PointerInput } from "./input/PointerInput";
import { OrbitCamera } from "./input/OrbitCamera";
import { GradientBackground } from "./scene/GradientBackground";
import { LightingRig } from "./scene/LightingRig";
import { setPetalAmbient } from "./scene/PetalMaterial";
import { paintGradient } from "./ui/gradientTexture";

import { SplineEditor } from "./editors/SplineEditor";
import { ControlPanel, type ParamName } from "./ui/ControlPanel";
import {
  buildShareUrl,
  encodeFlowerHash,
  decodeFlowerFromLocation,
} from "./io/ShareUrl";
import { FlowerStore } from "./io/FlowerStore";
import { Gallery } from "./ui/Gallery";
import { ThumbnailRenderer } from "./scene/ThumbnailRenderer";
import type { Color } from "three";

const IDLE_DELAY_MS = 2500;
const GHOST_OPACITY = 0.22;
const TAP_PX = 6; // movement under this (px) counts as a tap, not a drag

/**
 * App shell: orbit + painted flower + shape editor + the original-style control
 * panel. Tap a petal to select its layer; use the left column to edit color,
 * shape, and the petal parameters.
 */
class App {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly container: HTMLElement;

  private readonly input: PointerInput;
  private readonly orbit: OrbitCamera;
  private readonly background: GradientBackground;
  private readonly lighting: LightingRig;
  private readonly editor: SplineEditor;
  private readonly panel: ControlPanel;
  private readonly raycaster = new THREE.Raycaster();
  private readonly toastEl: HTMLDivElement;
  private toastTimer = 0;
  private readonly introEl: HTMLDivElement;
  private intro = false;
  private readonly store = new FlowerStore();
  private readonly thumbnailer = new ThumbnailRenderer();
  private readonly gallery: Gallery;

  private flower!: Flower;
  private flowerIndex = 0;
  private selectedCorolla = 0;
  private shapeMode = false;
  private lastInteraction = 0;
  private lastFrame = 0;
  private autoSpin = true;

  // Tap/drag gesture tracking
  private downX = 0;
  private downY = 0;
  private maxMove = 0;
  private gestureConsumed = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // allows canvas readback (screenshots/verify)
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // gamma passthrough
    this.renderer.autoClear = false;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);

    this.background = new GradientBackground();
    this.lighting = new LightingRig();
    this.lighting.addTo(this.scene);

    this.input = new PointerInput(this.renderer.domElement);
    this.orbit = new OrbitCamera(this.camera);
    this.editor = new SplineEditor(this.camera);
    this.editor.attach(this.scene);

    this.panel = new ControlPanel(this.container, {
      onBack: () => this.frameCamera(),
      onNextFlower: () =>
        this.loadFlower((this.flowerIndex + 1) % INCLUDED_FLOWERS.length),
      onShare: () => this.share(),
      onGallery: () => this.gallery.open(),
      onColor: (index, color) => this.onColor(index, color),
      onParam: (name, value) => this.onParam(name, value),
      onToggleShape: (active) => this.onToggleShape(active),
    });
    this.toastEl = this.makeToast();
    this.introEl = this.makeIntro();

    this.gallery = new Gallery(this.container, {
      store: this.store,
      onLoad: (description) => this.loadDescription(description),
      getDescription: () => this.flower.toDescription(),
      captureCurrent: () => this.captureCurrent(),
      captureDescription: (desc) => this.captureDescription(desc),
      toast: (m) => this.toast(m),
    });

    this.renderer.domElement.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.orbit.zoom(e.deltaY);
        this.markInteraction();
      },
      { passive: false },
    );

    window.addEventListener("keydown", (e) => {
      if (e.key === "n" || e.key === "N") {
        this.loadFlower((this.flowerIndex + 1) % INCLUDED_FLOWERS.length);
      }
    });

    // Open a shared flower if the URL carries one (skip the intro); otherwise
    // show the first built-in behind the intro logo.
    const shared = decodeFlowerFromLocation(
      window.location.hash,
      window.location.search,
    );
    if (shared) {
      this.loadDescription(shared);
    } else {
      this.loadFlower(0);
      this.startIntro();
    }

    window.addEventListener("resize", this.onResize);
    this.onResize();
    this.renderer.setAnimationLoop(this.tick);

    // Debug/verification hooks (used by the Playwright shader-comparison harness).
    (window as unknown as { __hf: unknown }).__hf = {
      ready: true,
      loadIndex: (i: number) => this.loadFlower(i),
      setView: (az: number, el: number) => {
        this.intro = false; // the harness controls the view directly
        this.introEl.style.display = "none";
        this.autoSpin = false;
        this.orbit.setAngles(az, el);
      },
      setAmbient: (v: number) => setPetalAmbient(v),
      setBackground: (top: number, bottom: number) =>
        this.background.setColors(top, bottom),
      hideUI: () => this.setUIVisible(false),
      showUI: () => this.setUIVisible(true),
      unlit: () => this.flower.corollas.forEach((c) => c.setUnlit()),
      gradientPixels: (w: number, h: number) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d")!;
        paintGradient(ctx, w, h);
        return Array.from(ctx.getImageData(0, 0, w, h).data);
      },
    };
  }

  /** Hide every DOM overlay (keep only the WebGL canvas) — for clean captures. */
  private setUIVisible(visible: boolean): void {
    for (const child of Array.from(this.container.children)) {
      if (child !== this.renderer.domElement) {
        (child as HTMLElement).style.display = visible ? "" : "none";
      }
    }
  }

  private loadFlower(index: number): void {
    this.flowerIndex = index;
    this.buildFlower(INCLUDED_FLOWERS[index]);
  }

  private loadDescription(description: string): void {
    this.flowerIndex = -1;
    this.buildFlower(description);
  }

  private buildFlower(description: string): void {
    this.editor.exit();
    this.shapeMode = false;
    this.panel.setShapeActive(false);
    this.selectedCorolla = 0;

    if (this.flower) {
      this.scene.remove(this.flower.group);
      this.flower.dispose();
    }
    this.flower = new Flower(description, DEFAULT_CONFIG);
    this.scene.add(this.flower.group);
    this.applyGhosting();
    this.frameCamera();
    this.panel.setCorolla(this.flower.corollas[0].data);
  }

  private share(): void {
    const description = this.flower.toDescription();
    const url = buildShareUrl(
      window.location.origin,
      window.location.pathname,
      description,
    );
    // Reflect the current flower in the address bar so a refresh/copy works.
    window.history.replaceState(null, "", encodeFlowerHash(description));
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.toast("link copied to clipboard"),
        () => this.toast("link is in the address bar"),
      );
    } else {
      this.toast("link is in the address bar");
    }
  }

  private selectCorolla(index: number): void {
    if (index === this.selectedCorolla && !this.shapeMode) {
      this.panel.setCorolla(this.flower.corollas[index].data);
      return;
    }
    this.selectedCorolla = index;
    this.panel.setCorolla(this.flower.corollas[index].data);
    this.applyGhosting();
    if (this.shapeMode) this.editor.enterFor(this.flower.corollas[index]);
  }

  private onColor(index: number, color: Color): void {
    const corolla = this.flower.corollas[this.selectedCorolla];
    const scaled = color.clone().multiplyScalar(colorPickScale(DEFAULT_CONFIG));
    corolla.setColor(index + 1, scaled);
  }

  private onParam(name: ParamName, value: number): void {
    const c = this.flower.corollas[this.selectedCorolla];
    switch (name) {
      case "petals":
        c.setPetalCount(Math.max(1, Math.round(value)));
        if (this.shapeMode) this.editor.enterFor(c); // refresh handles (mesh rebuilt)
        break;
      case "open":
        c.setOpen(value);
        break;
      case "spin":
        c.setSpin(value);
        break;
      case "sway":
        c.setSway(value);
        break;
      case "curve":
        c.setCurve(value);
        break;
    }
  }

  private onToggleShape(active: boolean): void {
    this.shapeMode = active;
    if (active) this.editor.enterFor(this.flower.corollas[this.selectedCorolla]);
    else this.editor.exit();
    this.applyGhosting();
  }

  /** Ghost non-selected corollas while editing, like the original Select view. */
  private applyGhosting(): void {
    this.flower.corollas.forEach((c, i) => {
      c.setOpacity(
        this.shapeMode && i !== this.selectedCorolla ? GHOST_OPACITY : 1,
      );
    });
  }

  /** Tap-select the corolla under the pointer (raycast its petals). */
  private trySelectAt(x: number, y: number): void {
    const ndc = new THREE.Vector2(
      (x / this.input.width) * 2 - 1,
      (y / this.input.height) * 2 - 1,
    );
    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = this.flower.corollas.flatMap((c) => [...c.petalMeshes]);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;
    const group = hits[0].object.parent;
    const idx = this.flower.corollas.findIndex((c) => c.group === group);
    if (idx >= 0) this.selectCorolla(idx);
  }

  /** Thumbnail of the current flower (reparented to the thumbnailer, then back). */
  private captureCurrent(): string {
    const group = this.flower.group;
    const url = this.thumbnailer.capture(this.renderer, group);
    this.scene.add(group); // capture left it parentless; restore to the scene
    return url;
  }

  /** Thumbnail of an arbitrary description (built fresh, then disposed). */
  private captureDescription(description: string): string {
    const flower = new Flower(description, DEFAULT_CONFIG);
    const url = this.thumbnailer.capture(this.renderer, flower.group);
    flower.dispose();
    return url;
  }

  private frameCamera(): void {
    const box = this.flower.computeBounds();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * 1.3;

    this.camera.near = Math.max(0.01, dist - radius * 4);
    this.camera.far = dist + radius * 8;
    this.camera.updateProjectionMatrix();

    this.orbit.setFraming({ target: center, distance: dist, azimuth: 0, elevation: 14 });
  }

  private markInteraction(): void {
    this.lastInteraction = performance.now();
  }

  /** Build the intro overlay: the helloflower logo, centered, click to start. */
  private makeIntro(): HTMLDivElement {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      // No z-index: a stacking context would isolate the logo's blend mode from
      // the canvas behind it. As a positioned element appended last, it still
      // paints on top of the (static) canvas.
      transition: "opacity 0.4s",
    } as CSSStyleDeclaration);
    const logo = document.createElement("img");
    logo.src = `${import.meta.env.BASE_URL}images/helloflower.png`;
    logo.draggable = false;
    Object.assign(logo.style, {
      width: "min(72%, 560px)",
      height: "auto",
      pointerEvents: "none",
      userSelect: "none",
      // The logo is white-on-black; "screen" drops the black (no-op in screen
      // blend) and keeps the white text, compositing it over the flower.
      mixBlendMode: "screen",
    } as CSSStyleDeclaration);
    el.appendChild(logo);
    el.addEventListener("pointerdown", () => this.endIntro());
    this.container.appendChild(el);
    return el;
  }

  /** Landing screen: black background, top-down spinning flower, logo overlay. */
  private startIntro(): void {
    this.intro = true;
    this.background.setColors(0x000000, 0x000000);
    this.panel.setVisible(false);
    this.introEl.style.display = "flex";
    this.introEl.style.opacity = "1";
    this.orbit.setAngles(0, 88); // top-down
    this.autoSpin = true;
    this.lastInteraction = 0; // start the idle rotation immediately
  }

  /** Dismiss the intro: reveal the UI and tilt to the normal editing view. */
  private endIntro(): void {
    if (!this.intro) return;
    this.intro = false;
    this.introEl.style.opacity = "0";
    window.setTimeout(() => (this.introEl.style.display = "none"), 400);
    this.background.setColors(0xffffff, 0xececf1);
    this.panel.setVisible(true);
    this.orbit.glideTo(this.orbit.azimuth, 14); // ease down to the 3/4 view
  }

  private makeToast(): HTMLDivElement {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      bottom: "70px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 16px",
      borderRadius: "20px",
      background: "rgba(40,44,52,0.9)",
      color: "#fff",
      font: "13px system-ui, sans-serif",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 0.25s",
    } as CSSStyleDeclaration);
    this.container.appendChild(el);
    return el;
  }

  private toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.style.opacity = "1";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.style.opacity = "0";
    }, 1800);
  }

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private tick = (): void => {
    const now = performance.now();
    const dt = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;

    this.input.update();
    const touch = this.input.touches[0];
    if (touch) {
      if (touch.phase === "Began") {
        this.downX = touch.x;
        this.downY = touch.y;
        this.maxMove = 0;
        this.gestureConsumed = false;
      } else {
        this.maxMove = Math.max(
          this.maxMove,
          Math.hypot(touch.x - this.downX, touch.y - this.downY),
        );
      }
    }

    const consumed = this.shapeMode && this.editor.handleInput(this.input);
    if (consumed) {
      this.gestureConsumed = true;
      this.markInteraction();
    } else if (this.orbit.handleInput(this.input)) {
      this.markInteraction();
    }

    if (
      touch &&
      touch.phase === "Ended" &&
      !this.gestureConsumed &&
      this.maxMove < TAP_PX
    ) {
      this.trySelectAt(touch.x, touch.y);
    }

    if (this.intro) {
      this.orbit.spinIdle(0.2); // spin the rose immediately under the logo
    } else if (
      this.autoSpin &&
      !this.shapeMode &&
      now - this.lastInteraction > IDLE_DELAY_MS
    ) {
      this.orbit.spinIdle(0.15);
    }
    if (this.shapeMode) {
      this.editor.update(dt, this.container.clientHeight);
    }

    this.orbit.update();
    this.lighting.update(this.camera, this.orbit.target);

    this.renderer.clear();
    this.background.render(this.renderer);
    this.renderer.render(this.scene, this.camera);
  };
}

const container = document.getElementById("app");
if (!container) throw new Error("#app container not found");
new App(container);
