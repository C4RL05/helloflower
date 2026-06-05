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
const INTRO_FADE_MS = 400; // intro logo fade-out; keep the CSS transition in sync
const UNSELECTED_ALPHA = 0.15; // editor: faded non-selected corollas (Unity unselectedPetalAlpha)
const SELECT_ALPHA = 0.5; // corolla opacity in the exploded select view
const TAP_PX = 6; // movement under this (px) counts as a tap, not a drag

// Full-screen toggle icons (outward corners = enter, inward = exit).
const FS_SVG = (inward: boolean): string =>
  `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${
    inward
      ? "M2 6h4V2M14 6h-4V2M2 10h4v4M14 10h-4v4"
      : "M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"
  }"/></svg>`;

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
  private readonly fullscreenBtn: HTMLButtonElement;
  private introEl?: HTMLDivElement; // built lazily on first startIntro()
  private logoEl?: HTMLImageElement; // the logo inside introEl (faded via filter)
  private intro = false;
  private home = false; // home menu (black bg) between intro and editor
  private select = false; // exploded petal-selection view between home and editor
  private editing = false; // in the flower editor (fades non-selected corollas)
  private received = false; // viewing a received shared flower over its gradient
  private corollasSolid = false; // editor: all corollas opaque while drag-rotating
  private gradTopHex = 0x000000; // share gradient top color, default black
  private gradBottomHex = 0x000000; // share gradient bottom color, default black
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
    // Let pointer events drive all gestures (incl. two-finger pinch) instead of
    // the browser's default touch scroll/zoom.
    this.renderer.domElement.style.touchAction = "none";
    this.container.appendChild(this.renderer.domElement);

    // Native-app feel: block the browser menus/gestures that would interrupt
    // the UI (right-click / long-press menu, iOS pinch-zoom gestures).
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("gesturestart", (e) => e.preventDefault());

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
      onBack: () => this.enterSelect(), // editor back → petal selection
      onHome: () => this.enterHome(), // select back → home
      onEdit: () => this.enterSelect(), // home edit → petal selection
      onSelectCorolla: (slot) => this.editCorolla(slot),
      onShare: () => this.enterShare(),
      onShareCopy: () => this.share(),
      onShareColor: (index, color) => this.onShareColor(index, color),
      onGallery: () => this.gallery.open(),
      onColor: (index, color) => this.onColor(index, color),
      onParam: (name, value) => this.onParam(name, value),
      onToggleShape: (active) => this.onToggleShape(active),
    });
    this.toastEl = this.makeToast();
    this.fullscreenBtn = this.makeFullscreenButton();

    this.gallery = new Gallery(this.container, {
      store: this.store,
      onLoad: (description) => {
        this.loadDescription(description);
        this.enterHome(); // gallery loads return to the home screen
      },
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
      if (shared.gradient) {
        this.gradTopHex = shared.gradient[0];
        this.gradBottomHex = shared.gradient[1];
      }
      this.loadDescription(shared.description);
      this.enterReceived(); // present the shared flower over its gradient
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
        this.home = false;
        this.select = false;
        this.editing = false;
        this.received = false;
        if (this.introEl) this.introEl.style.display = "none";
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
    this.updateCorollaAppearance();
    this.frameCamera();
    this.panel.setCorolla(this.flower.corollas[0].data);
  }

  private share(): void {
    const description = this.flower.toDescription();
    const gradient: [number, number] = [this.gradTopHex, this.gradBottomHex];
    const url = buildShareUrl(
      window.location.origin,
      window.location.pathname,
      description,
      gradient,
    );
    // Reflect the current flower in the address bar so a refresh/copy works.
    window.history.replaceState(null, "", encodeFlowerHash(description, gradient));
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.toast("link copied to clipboard"),
        () => this.toast("link is in the address bar"),
      );
    } else {
      this.toast("link is in the address bar");
    }
  }

  /** Pick a corolla (from a tapped petal or the bottom/middle/top buttons) and
   * drop into the editor for it. */
  private editPetal(index: number): void {
    this.selectedCorolla = index;
    this.panel.setCorolla(this.flower.corollas[index].data);
    this.enterEditor();
  }

  /** Bottom/middle/top button: slot 0/1/2 maps to a corolla via slotOrder. */
  private editCorolla(slot: number): void {
    this.editPetal(this.flower.slotOrder[slot] ?? slot);
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
    this.updateCorollaAppearance();
  }

  /**
   * Drive each corolla's separation + opacity for the current mode: the select
   * view explodes them apart and fades all to SELECT_ALPHA; otherwise they merge
   * and only non-selected corollas ghost while shape-editing.
   */
  private updateCorollaAppearance(): void {
    if (this.select) {
      this.flower.setSeparated(true);
      this.flower.corollas.forEach((c) => c.setOpacityGoal(SELECT_ALPHA));
      return;
    }
    this.flower.setSeparated(false);
    // In the editor (EditPetal/EditShape) the non-selected corollas fade to
    // UNSELECTED_ALPHA; the intro/home/shared views stay solid. While drag-
    // rotating the camera (corollasSolid), all corollas go opaque too.
    const fade = this.editing && !this.corollasSolid;
    this.flower.corollas.forEach((c, i) =>
      c.setOpacityGoal(fade && i !== this.selectedCorolla ? UNSELECTED_ALPHA : 1),
    );
  }

  /** Tap a petal (in the select view) to edit its corolla. */
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
    if (idx >= 0) this.editPetal(idx);
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
      // No z-index / opacity here: either would form an isolated group that
      // cuts the logo's blend mode off from the canvas (revealing the image's
      // black backdrop). As a positioned element appended last it still paints
      // on top of the (static) canvas.
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
      // Fade out by darkening to black (invisible under screen) rather than via
      // opacity, which would isolate the blend and expose the black backdrop.
      transition: `filter ${INTRO_FADE_MS}ms`,
    } as CSSStyleDeclaration);
    el.appendChild(logo);
    el.addEventListener("pointerdown", () => this.endIntro());
    this.container.appendChild(el);
    this.logoEl = logo;
    return el;
  }

  /** Landing screen: black background, top-down spinning flower, logo overlay. */
  private startIntro(): void {
    this.intro = true;
    this.introEl ??= this.makeIntro(); // build (and fetch the logo) on demand
    this.background.setColors(0x000000, 0x000000);
    this.setFullscreenVariant(this.fullscreenBtn, true); // reversed on black
    this.panel.setVisible(false);
    this.introEl.style.display = "flex";
    if (this.logoEl) this.logoEl.style.filter = "brightness(1)";
    this.orbit.setAngles(0, 88); // top-down
    this.autoSpin = true;
    this.lastInteraction = 0; // start the idle rotation immediately
  }

  /** Dismiss the intro logo and drop into the home menu. */
  private endIntro(): void {
    if (!this.intro || !this.introEl) return;
    this.intro = false;
    const el = this.introEl;
    if (this.logoEl) this.logoEl.style.filter = "brightness(0)"; // fade to black
    window.setTimeout(() => (el.style.display = "none"), INTRO_FADE_MS);
    this.enterHome();
  }

  /** Home menu: black background, top-down spinning flower, edit/gallery/share.
   * Reached from the intro logo and from the editor's `back` button. */
  private enterHome(): void {
    this.home = true;
    this.select = false;
    this.editing = false;
    this.received = false;
    this.background.setColors(0x000000, 0x000000); // home is always black
    this.panel.setReversed(true);
    this.setFullscreenVariant(this.fullscreenBtn, true);
    this.panel.setVisible(true);
    this.panel.showHome();
    this.updateCorollaAppearance(); // merge the corollas back, opaque
    this.orbit.glideTo(this.orbit.azimuth, 88); // ease back to top-down
    this.autoSpin = true;
    this.lastInteraction = 0; // keep the idle rotation running
  }

  /** Received a shared flower: present it over its gradient with only `back`
   * (the gradient is kept, so it reappears when entering share). */
  private enterReceived(): void {
    this.home = false;
    this.select = false;
    this.editing = false;
    this.received = true;
    this.applyShareBackground(); // the shared gradient + button reversal
    this.panel.setVisible(true);
    this.panel.showReceived();
    this.updateCorollaAppearance(); // merged, opaque
    this.orbit.glideTo(this.orbit.azimuth, 14); // 3/4 view shows the gradient
    this.autoSpin = true;
    this.lastInteraction = 0;
  }

  /** Share view: present the flower over the gradient and edit the two gradient
   * colors; the `share` button copies a link that carries the gradient. */
  private enterShare(): void {
    this.home = false;
    this.select = false;
    this.editing = false;
    this.received = false;
    this.applyShareBackground();
    this.panel.setVisible(true);
    this.panel.showShare();
    this.updateCorollaAppearance(); // merged, opaque
    this.orbit.glideTo(this.orbit.azimuth, 14); // 3/4 view shows the gradient
    this.autoSpin = false;
  }

  private onShareColor(index: number, color: Color): void {
    const hex = color.getHex();
    if (index === 0) this.gradTopHex = hex;
    else this.gradBottomHex = hex;
    this.applyShareBackground();
  }

  /** Drive the background gradient and the over-gradient button variants from
   * the two share colors. Bars reverse with the top color, the bottom-right
   * full-screen button with the bottom color (where each sits on the gradient). */
  private applyShareBackground(): void {
    this.background.setColors(this.gradTopHex, this.gradBottomHex);
    this.panel.setShareColors(
      new THREE.Color(this.gradTopHex),
      new THREE.Color(this.gradBottomHex),
    );
    this.panel.setReversed(luminance(this.gradTopHex) < 0.55);
    this.setFullscreenVariant(
      this.fullscreenBtn,
      luminance(this.gradBottomHex) < 0.55,
    );
  }

  /** Petal selection: white background, corollas exploded apart + semi-
   * transparent, with bottom/middle/top + back. Reached from home's `edit` and
   * the editor's `back`. Tapping a petal (or a button) opens the editor. */
  private enterSelect(): void {
    this.home = false;
    this.select = true;
    this.editing = false;
    this.received = false;
    if (this.shapeMode) this.onToggleShape(false); // leave shape mode first
    this.panel.setShapeActive(false);
    this.background.setColors(0xffffff, 0xececf1);
    this.setFullscreenVariant(this.fullscreenBtn, false); // light on white
    this.panel.setVisible(true);
    this.panel.showSelect();
    this.scene.updateMatrixWorld(true); // separation reads corolla bounds
    this.updateCorollaAppearance(); // explode apart + fade to SELECT_ALPHA
    this.orbit.glideTo(this.orbit.azimuth, 14); // ease to the 3/4 view
    this.autoSpin = false;
  }

  /** Enter the flower editor: white background, full controls, 3/4 view. */
  private enterEditor(): void {
    this.home = false;
    this.select = false;
    this.editing = true;
    this.received = false;
    this.background.setColors(0xffffff, 0xececf1);
    this.setFullscreenVariant(this.fullscreenBtn, false); // light on white
    this.panel.showEditor();
    this.updateCorollaAppearance(); // merge the corollas back together
    this.orbit.glideTo(this.orbit.azimuth, 14); // ease down to the 3/4 view
    this.autoSpin = false;
  }

  private makeToast(): HTMLDivElement {
    const el = document.createElement("div");
    // Styled like a (reversed) card button: same 12px corner, 13px font, and
    // 37px pill height (ControlPanel BUTTON_HEIGHT); light-on-dark to match the
    // home/gallery buttons it appears over. Width hugs the text.
    Object.assign(el.style, {
      position: "absolute",
      bottom: "70px",
      left: "50%",
      transform: "translateX(-50%)",
      height: "37px",
      display: "flex",
      alignItems: "center",
      padding: "0 14px",
      boxSizing: "border-box",
      whiteSpace: "nowrap",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(255,255,255,0.1)",
      color: "#f2f2f4",
      font: "13px system-ui, sans-serif",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 0.25s",
    } as CSSStyleDeclaration);
    this.container.appendChild(el);
    return el;
  }

  /** Always-present full-screen toggle (bottom-right), styled like a card
   * button. Lives above the gallery overlay; variant flipped per background. */
  private makeFullscreenButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.title = "Full screen";
    btn.innerHTML = FS_SVG(false);
    Object.assign(btn.style, {
      position: "absolute",
      // Clear the device safe area (rounded corners / side notch / home bar).
      bottom: "max(16px, env(safe-area-inset-bottom, 0px))",
      right: "max(16px, env(safe-area-inset-right, 0px))",
      zIndex: "30", // above the gallery overlay (z-index 20)
      width: "37px",
      height: "37px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      borderRadius: "12px",
      cursor: "pointer",
    } as CSSStyleDeclaration);
    btn.addEventListener("click", () => this.toggleFullscreen());
    document.addEventListener("fullscreenchange", () => {
      btn.innerHTML = FS_SVG(!!document.fullscreenElement);
    });
    this.container.appendChild(btn);
    this.setFullscreenVariant(btn, false); // default light; states override it
    return btn;
  }

  /** Light card-button colors on white backgrounds, reversed on black. */
  private setFullscreenVariant(btn: HTMLButtonElement, dark: boolean): void {
    Object.assign(btn.style, {
      border: `1px solid rgba(${dark ? "255,255,255" : "0,0,0"},0.25)`,
      background: dark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.92)",
      color: dark ? "#f2f2f4" : "#6e6e6e",
      boxShadow: dark ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
    } as CSSStyleDeclaration);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
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

    // Two-finger pinch zoom (touch) takes priority over rotate / handle-drag.
    const pinching = this.orbit.pinch(this.input);
    const handleDrag = this.shapeMode && this.editor.handleInput(this.input);
    const consumed = pinching || handleDrag;
    if (consumed) {
      this.gestureConsumed = true;
      this.markInteraction();
    } else if (this.orbit.handleInput(this.input)) {
      this.markInteraction();
    }

    // Editor: a single-touch camera-rotation drag temporarily makes every
    // corolla opaque (Unity CameraBehaviour); otherwise non-selected ones fade.
    const dragging =
      this.editing && !!touch && touch.phase !== "Ended" && !consumed;
    if (dragging !== this.corollasSolid) {
      this.corollasSolid = dragging;
      this.updateCorollaAppearance();
    }

    if (
      touch &&
      touch.phase === "Ended" &&
      !this.gestureConsumed &&
      this.maxMove < TAP_PX &&
      this.select // petals are only selectable in the exploded select view
    ) {
      this.trySelectAt(touch.x, touch.y);
    }

    const spinFrames = 60 * dt; // keep deg/sec constant across refresh rates
    if (this.intro || this.home || this.received) {
      this.orbit.spinIdle(0.2 * spinFrames); // spin under the logo / home / received
    } else if (
      this.autoSpin &&
      !this.shapeMode &&
      now - this.lastInteraction > IDLE_DELAY_MS
    ) {
      this.orbit.spinIdle(0.15 * spinFrames);
    }
    if (this.shapeMode) {
      this.editor.update(dt, this.container.clientHeight);
    }

    this.flower.update(); // ease corolla separation + opacity (select view)
    this.orbit.update(dt);
    this.lighting.update(this.camera, this.orbit.target);

    this.renderer.clear();
    this.background.render(this.renderer);
    this.renderer.render(this.scene, this.camera);
  };
}

/** Relative luminance (0..1) of an 0xRRGGBB color — for the dark/light button
 * decision over the background gradient. */
function luminance(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const container = document.getElementById("app");
if (!container) throw new Error("#app container not found");
new App(container);
