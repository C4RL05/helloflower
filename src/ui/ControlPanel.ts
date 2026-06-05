import { Color } from "three";
import type { CorollaData } from "../engine/serialization/CorollaData";
import { ColorUtils } from "../engine/color/ColorUtils";
import { paintGradient } from "./gradientTexture";

export type ParamName = "petals" | "open" | "spin" | "sway" | "curve";

export interface ControlPanelCallbacks {
  /** Editor `back` → return to the petal-selection view. */
  onBack(): void;
  /** Selection-view `back` → return to the home menu. */
  onHome(): void;
  /** Home `edit` → enter the petal-selection view. */
  onEdit(): void;
  /** Selection-view bottom/middle/top (slot 0/1/2) → edit that corolla. */
  onSelectCorolla(slot: number): void;
  /** Home `share` → enter the share (background-gradient) view. */
  onShare(): void;
  /** Share view `share` → copy the link. */
  onShareCopy(): void;
  /** Share view gradient swatch: index 0 (top) / 1 (bottom) picked color. */
  onShareColor(index: number, color: Color): void;
  onGallery(): void;
  /** index 0 (main) / 1 (secondary); color is the picked [0,1] color. */
  onColor(index: number, color: Color): void;
  onParam(name: ParamName, value: number): void;
  onToggleShape(active: boolean): void;
}

interface SliderSpec {
  name: ParamName;
  min: number;
  max: number;
  step: number;
  int?: boolean;
}

const SLIDERS: Record<ParamName, SliderSpec> = {
  petals: { name: "petals", min: 1, max: 16, step: 1, int: true },
  open: { name: "open", min: -90, max: 90, step: 1 },
  spin: { name: "spin", min: -180, max: 180, step: 1 },
  sway: { name: "sway", min: -90, max: 90, step: 1 },
  curve: { name: "curve", min: -0.5, max: 0.5, step: 0.01 },
};

const COLUMN_WIDTH = 74;
// Rendered height of a card button (makeButton); the slider thumb matches it.
const BUTTON_HEIGHT = 37;

// Edge offsets that clear the device's safe area (notch / camera hole / rounded
// corners) — important in landscape and full screen. Falls back to 14px.
const SAFE_TOP = "max(14px, env(safe-area-inset-top, 0px))";
const SAFE_LEFT = "max(14px, env(safe-area-inset-left, 0px))";
const SAFE_RIGHT = "max(14px, env(safe-area-inset-right, 0px))";

/**
 * The editing UI, styled to match the original's left control column:
 * `back`, a two-tone color swatch (main over secondary), `shape`, then
 * `petals/open/spin/sway/curve`. Tapping a param button reveals a vertical
 * slider (plus a `reset`) in the column; tapping the swatch opens the
 * GradientSlider color picker, which
 * appears BELOW the column at full width. The picked position is shown with a
 * white/grey-bordered circle marker (on the gradient and in the active swatch
 * half). Only one sub-editor is open at a time.
 */
export class ControlPanel {
  private readonly cb: ControlPanelCallbacks;

  private readonly swatchTop: HTMLDivElement;
  private readonly swatchBottom: HTMLDivElement;
  private readonly swatchMarkers: HTMLDivElement[] = [];
  private readonly shapeBtn: HTMLButtonElement;
  private readonly paramBtns = new Map<ParamName, HTMLButtonElement>();
  private readonly uiRoot: HTMLDivElement;
  private readonly wrap: HTMLDivElement; // editor: scalable bar + sub-editor
  private readonly bar: HTMLDivElement; // button bar (back/swatch/shape/params)
  private readonly sub: HTMLDivElement; // active sub-editor (slider or picker)
  private readonly homeBar: HTMLDivElement; // home menu (over the black landing)
  private readonly selectBar: HTMLDivElement; // petal-selection: back/top/middle/bottom
  private readonly selectMsg: HTMLDivElement; // "select or touch petals to edit"
  private readonly shareBar: HTMLDivElement; // share: back + gradient swatch + share
  private readonly gradTop: HTMLDivElement; // top gradient swatch half
  private readonly gradBottom: HTMLDivElement; // bottom gradient swatch half
  private readonly gradMarkers: HTMLDivElement[] = [];
  // Buttons over the (gradient) background that flip light/dark with brightness.
  private readonly reversibleBtns: HTMLButtonElement[] = [];
  private colorTarget: "corolla" | "gradient" = "corolla";

  // Color picker (below the column)
  private readonly colorPop: HTMLDivElement;
  private readonly picker: HTMLCanvasElement;
  private readonly pickerCtx: CanvasRenderingContext2D;
  private readonly gradientMarker: HTMLDivElement;
  private picking = false;

  // Param slider (vertical card in the column) + reset
  private static sliderStyleInjected = false;
  private readonly sliderCard: HTMLDivElement;
  private readonly sliderInput: HTMLInputElement;
  private readonly resetBtn: HTMLButtonElement;

  private activeParam: ParamName | null = null;
  private activeColor = 0;
  private shapeActive = false;
  private values: Record<ParamName, number> = {
    petals: 5,
    open: 0,
    spin: 0,
    sway: 0,
    curve: 0,
  };
  // Snapshot of `values` at load/select time; `reset` reverts the active param.
  private defaults: Record<ParamName, number> = {
    petals: 5,
    open: 0,
    spin: 0,
    sway: 0,
    curve: 0,
  };

  constructor(parent: HTMLElement, cb: ControlPanelCallbacks) {
    this.cb = cb;

    // All panel UI lives in this root (so it can be shown/hidden as a unit).
    // pointer-events:none lets canvas gestures pass through the empty areas.
    this.uiRoot = document.createElement("div");
    Object.assign(this.uiRoot.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    } as CSSStyleDeclaration);
    parent.appendChild(this.uiRoot);
    parent = this.uiRoot;

    // Editor: the button bar plus whichever sub-editor (slider or color picker)
    // is open. The wrapper scales down to fit the viewport height (keeping the
    // button aspect); the sub-editor stacks under the bar, or moves to its
    // right when it doesn't fit under (see layoutEditor()).
    const wrap = (this.wrap = document.createElement("div"));
    Object.assign(wrap.style, {
      position: "absolute",
      top: SAFE_TOP,
      left: SAFE_LEFT,
      display: "none",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "8px",
      transformOrigin: "top left",
      pointerEvents: "auto",
    } as CSSStyleDeclaration);
    wrap.addEventListener("pointerdown", (e) => e.stopPropagation());

    const bar = (this.bar = document.createElement("div"));
    Object.assign(bar.style, {
      display: "flex",
      flexDirection: "column",
      gap: "7px",
      width: `${COLUMN_WIDTH}px`,
      flex: "none",
    } as CSSStyleDeclaration);

    bar.appendChild(this.makeButton("back", () => this.onBack()));

    // Two-tone corolla color swatch.
    const editSwatch = this.makeSwatch(this.swatchMarkers, (i) =>
      this.openColor(i),
    );
    this.swatchTop = editSwatch.top;
    this.swatchBottom = editSwatch.bottom;
    bar.appendChild(editSwatch.swatch);

    this.shapeBtn = this.makeButton("shape", () => this.toggleShape());
    bar.appendChild(this.shapeBtn);

    // Param buttons (petals → curve) grouped into a single card, separated by
    // thin dividers, matching the original's stacked control box.
    const paramGroup = this.makeCardGroup();
    (Object.keys(SLIDERS) as ParamName[]).forEach((name, i) => {
      const btn = this.makeParamButton(name, i > 0, () => this.toggleParam(name));
      this.paramBtns.set(name, btn);
      paramGroup.appendChild(btn);
    });
    bar.appendChild(paramGroup);
    wrap.appendChild(bar);

    // Sub-editor column (slider + reset, or the color picker). Hidden until a
    // param/swatch is tapped; layoutEditor() places it under or beside the bar.
    const sub = (this.sub = document.createElement("div"));
    Object.assign(sub.style, {
      display: "none",
      flexDirection: "column",
      gap: "7px",
      width: `${COLUMN_WIDTH}px`,
      flex: "none",
      pointerEvents: "auto", // stays interactive when reparented to the right
    } as CSSStyleDeclaration);
    sub.addEventListener("pointerdown", (e) => e.stopPropagation());

    // Vertical param slider, shown when a param is selected.
    this.sliderCard = document.createElement("div");
    Object.assign(this.sliderCard.style, {
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "150px",
      boxSizing: "border-box",
      borderRadius: "12px",
      border: "1px solid rgba(0,0,0,0.25)",
      background: "rgba(255,255,255,0.92)",
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    } as CSSStyleDeclaration);
    ControlPanel.injectSliderStyle();
    this.sliderInput = document.createElement("input");
    this.sliderInput.type = "range";
    this.sliderInput.className = "hf-slider";
    this.sliderInput.addEventListener("input", () => this.onSliderInput());
    this.sliderCard.append(this.sliderInput);
    sub.appendChild(this.sliderCard);

    // Reset just the active param to its loaded value.
    this.resetBtn = this.makeButton("reset", () => this.resetParam());
    this.resetBtn.style.display = "none";
    sub.appendChild(this.resetBtn);

    // Color picker (full sub-column width).
    this.colorPop = document.createElement("div");
    Object.assign(this.colorPop.style, {
      position: "relative",
      width: "100%",
      display: "none",
    } as CSSStyleDeclaration);
    this.colorPop.addEventListener("pointerdown", (e) => e.stopPropagation());
    // Procedurally generated gradient (matches the original GradientSlider PNG),
    // used for both display and color sampling. Native 77×256, like the original.
    this.picker = document.createElement("canvas");
    this.picker.width = 77;
    this.picker.height = 256;
    this.pickerCtx = this.picker.getContext("2d", {
      willReadFrequently: true,
    })!;
    paintGradient(this.pickerCtx, this.picker.width, this.picker.height);
    Object.assign(this.picker.style, {
      width: "100%",
      height: "auto", // preserve 77:256 aspect ratio
      borderRadius: "10px",
      cursor: "crosshair",
      touchAction: "none",
      display: "block",
      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    } as CSSStyleDeclaration);
    this.picker.addEventListener("pointerdown", (e) => this.onPick(e, true));
    this.picker.addEventListener("pointermove", (e) => this.onPick(e, false));
    this.picker.addEventListener("pointerup", () => (this.picking = false));
    this.picker.addEventListener("pointercancel", () => (this.picking = false));
    this.gradientMarker = this.makeMarker();
    this.gradientMarker.style.display = "none";
    this.colorPop.append(this.picker, this.gradientMarker);
    sub.appendChild(this.colorPop);
    wrap.appendChild(sub);

    parent.appendChild(wrap);
    window.addEventListener("resize", () => this.layoutEditor());

    // Home menu, shown over the black landing background after the intro logo.
    // Same column/bar style as the editor, but reversed (light on dark) so the
    // buttons read on black. `edit` opens the editor; plus gallery + share.
    this.homeBar = document.createElement("div");
    Object.assign(this.homeBar.style, {
      position: "absolute",
      top: SAFE_TOP,
      left: SAFE_LEFT,
      display: "none",
      flexDirection: "column",
      gap: "7px",
      width: `${COLUMN_WIDTH}px`,
      pointerEvents: "auto",
    } as CSSStyleDeclaration);
    this.homeBar.addEventListener("pointerdown", (e) => e.stopPropagation());
    const homeButtons = [
      this.makeButton("edit", () => this.cb.onEdit(), true),
      this.makeButton("gallery", () => this.cb.onGallery(), true),
      this.makeButton("share", () => this.cb.onShare(), true),
    ];
    this.homeBar.append(...homeButtons);
    this.reversibleBtns.push(...homeButtons);
    parent.appendChild(this.homeBar);

    // Petal-selection bar (white background): back + bottom/middle/top, which
    // map to the exploded corollas (slot 0/1/2).
    this.selectBar = document.createElement("div");
    Object.assign(this.selectBar.style, {
      position: "absolute",
      top: SAFE_TOP,
      left: SAFE_LEFT,
      display: "none",
      flexDirection: "column",
      gap: "7px",
      width: `${COLUMN_WIDTH}px`,
      pointerEvents: "auto",
    } as CSSStyleDeclaration);
    this.selectBar.addEventListener("pointerdown", (e) => e.stopPropagation());
    // top/middle/bottom grouped into one card (like the param buttons); back
    // stays separate.
    const corollaGroup = this.makeCardGroup();
    (["top", "middle", "bottom"] as const).forEach((label, i) => {
      const slot = 2 - i; // top→2, middle→1, bottom→0
      corollaGroup.appendChild(
        this.makeParamButton(label, i > 0, () => this.cb.onSelectCorolla(slot)),
      );
    });
    this.selectBar.append(this.makeButton("back", () => this.cb.onHome()));
    this.selectBar.appendChild(corollaGroup);
    parent.appendChild(this.selectBar);

    this.selectMsg = document.createElement("div");
    this.selectMsg.textContent = "select or touch petals to edit";
    Object.assign(this.selectMsg.style, {
      position: "absolute",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "none",
      color: "rgba(0,0,0,0.4)",
      font: "13px system-ui, sans-serif",
      whiteSpace: "nowrap",
      pointerEvents: "none",
    } as CSSStyleDeclaration);
    parent.appendChild(this.selectMsg);

    // Share view: back, the background-gradient swatch (tap a half to pick its
    // color), and a `share` button that copies the link. These sit over the
    // gradient, so they're reversible by brightness.
    this.shareBar = document.createElement("div");
    Object.assign(this.shareBar.style, {
      position: "absolute",
      top: SAFE_TOP,
      left: SAFE_LEFT,
      display: "none",
      flexDirection: "column",
      gap: "7px",
      width: `${COLUMN_WIDTH}px`,
      pointerEvents: "auto",
    } as CSSStyleDeclaration);
    this.shareBar.addEventListener("pointerdown", (e) => e.stopPropagation());
    const shareBack = this.makeButton("back", () => this.cb.onHome(), true);
    const gradSwatch = this.makeSwatch(this.gradMarkers, (i) =>
      this.openGradientColor(i),
    );
    this.gradTop = gradSwatch.top;
    this.gradBottom = gradSwatch.bottom;
    const shareCopy = this.makeButton("share", () => this.cb.onShareCopy(), true);
    this.shareBar.append(shareBack, gradSwatch.swatch, shareCopy);
    this.reversibleBtns.push(shareBack, shareCopy);
    parent.appendChild(this.shareBar);
  }

  /** Show/hide the entire control UI (used by the intro screen). */
  setVisible(visible: boolean): void {
    this.uiRoot.style.display = visible ? "" : "none";
  }

  /** Home menu: show the reversed edit/gallery/share bar, hide the rest. */
  showHome(): void {
    this.closeColor();
    this.closeParam();
    this.homeBar.style.display = "flex";
    this.wrap.style.display = "none";
    this.selectBar.style.display = "none";
    this.selectMsg.style.display = "none";
    this.shareBar.style.display = "none";
  }

  /** Petal selection: show back/bottom/middle/top + the prompt; hide the rest. */
  showSelect(): void {
    this.closeColor();
    this.closeParam();
    this.homeBar.style.display = "none";
    this.wrap.style.display = "none";
    this.selectBar.style.display = "flex";
    this.selectMsg.style.display = "block";
    this.shareBar.style.display = "none";
  }

  /** Share view: back + gradient swatch + share(copy). */
  showShare(): void {
    this.closeColor();
    this.closeParam();
    this.homeBar.style.display = "none";
    this.wrap.style.display = "none";
    this.selectBar.style.display = "none";
    this.selectMsg.style.display = "none";
    this.shareBar.style.display = "flex";
  }

  /** Editor: show the editing bar + sub-editor, hide the home/selection UI. */
  showEditor(): void {
    this.homeBar.style.display = "none";
    this.selectBar.style.display = "none";
    this.selectMsg.style.display = "none";
    this.shareBar.style.display = "none";
    this.wrap.style.display = "flex";
    this.layoutEditor();
  }

  /** Paint the gradient swatch from the current share colors. */
  setShareColors(top: Color, bottom: Color): void {
    this.paintSwatch(this.gradTop, top);
    this.paintSwatch(this.gradBottom, bottom);
  }

  /**
   * Fit the editor to the viewport height: scale the bar (uniformly, keeping
   * the button aspect) if it's taller than the available space, and stack the
   * open sub-editor under the bar — or, when it won't fit underneath, move it
   * to the right edge of the screen (scaled independently).
   */
  private layoutEditor(): void {
    if (this.wrap.style.display === "none") return;
    const subOpen =
      this.sliderCard.style.display !== "none" ||
      this.colorPop.style.display !== "none";
    this.sub.style.display = subOpen ? "flex" : "none";

    const gap = 8;
    // Resolved top includes the safe-area inset (notch); reserve 14px at the bottom.
    const availH = this.uiRoot.clientHeight - this.wrap.offsetTop - 14;
    const barH = this.bar.offsetHeight; // intrinsic (transform doesn't affect it)
    const subH = subOpen ? this.sub.offsetHeight : 0;
    const fitsUnder = subOpen && barH + gap + subH <= availH;

    if (!subOpen || fitsUnder) {
      // Stacked: sub-editor under the bar, scaled together with it.
      if (this.sub.parentElement !== this.wrap) this.wrap.appendChild(this.sub);
      Object.assign(this.sub.style, {
        position: "",
        top: "",
        right: "",
        transform: "",
        transformOrigin: "",
      } as CSSStyleDeclaration);
      const naturalH = subOpen ? barH + gap + subH : barH;
      const scale = naturalH > 0 ? Math.min(1, availH / naturalH) : 1;
      this.wrap.style.transform = scale < 1 ? `scale(${scale})` : "none";
    } else {
      // Doesn't fit under: keep the bar top-left and move the sub-editor to the
      // right edge of the screen. Both use the SAME scale so all editor buttons
      // stay one size (the sub-editor is shorter than the bar, so the bar's
      // scale always fits it).
      const scale = barH > 0 ? Math.min(1, availH / barH) : 1;
      const css = scale < 1 ? `scale(${scale})` : "none";
      this.wrap.style.transform = css;

      if (this.sub.parentElement !== this.uiRoot) this.uiRoot.appendChild(this.sub);
      Object.assign(this.sub.style, {
        position: "absolute",
        top: SAFE_TOP,
        right: SAFE_RIGHT,
        transformOrigin: "top right",
        transform: css,
      } as CSSStyleDeclaration);
    }
  }

  setCorolla(data: CorollaData): void {
    this.paintSwatch(this.swatchTop, data.colors[0]);
    this.paintSwatch(this.swatchBottom, data.colors[1] ?? data.colors[0]);
    this.values = {
      petals: data.petalCount,
      open: data.open,
      spin: data.spin,
      sway: data.sway,
      curve: data.curve,
    };
    this.defaults = { ...this.values };
    if (this.activeParam) this.loadSlider(this.activeParam);
  }

  setShapeActive(active: boolean): void {
    this.shapeActive = active;
    this.highlight(this.shapeBtn, active);
  }

  // ── interactions ──────────────────────────────────────────────────────────

  private onBack(): void {
    this.closeColor();
    this.closeParam();
    if (this.shapeActive) this.toggleShape();
    this.cb.onBack();
  }

  private toggleShape(): void {
    this.shapeActive = !this.shapeActive;
    this.highlight(this.shapeBtn, this.shapeActive);
    if (this.shapeActive) {
      this.closeParam();
      this.closeColor();
    }
    this.cb.onToggleShape(this.shapeActive);
  }

  private toggleParam(name: ParamName): void {
    if (this.activeParam === name) {
      this.closeParam();
      return;
    }
    this.closeColor();
    this.activeParam = name;
    for (const [n, btn] of this.paramBtns) this.highlight(btn, n === name);
    this.loadSlider(name);
    this.sliderCard.style.display = "flex";
    this.resetBtn.style.display = "";
    this.layoutEditor();
  }

  private closeParam(): void {
    this.activeParam = null;
    for (const btn of this.paramBtns.values()) this.highlight(btn, false);
    this.sliderCard.style.display = "none";
    this.resetBtn.style.display = "none";
    this.layoutEditor();
  }

  private loadSlider(name: ParamName): void {
    const spec = SLIDERS[name];
    this.sliderInput.min = String(spec.min);
    this.sliderInput.max = String(spec.max);
    this.sliderInput.step = String(spec.step);
    this.sliderInput.value = String(this.values[name]);
  }

  /** Revert just the active param to its loaded (snapshot) value. */
  private resetParam(): void {
    if (!this.activeParam) return;
    const v = this.defaults[this.activeParam];
    this.values[this.activeParam] = v;
    this.sliderInput.value = String(v);
    this.cb.onParam(this.activeParam, v);
  }

  private onSliderInput(): void {
    if (!this.activeParam) return;
    const spec = SLIDERS[this.activeParam];
    const v = spec.int
      ? Math.round(+this.sliderInput.value)
      : +this.sliderInput.value;
    this.values[this.activeParam] = v;
    this.cb.onParam(this.activeParam, v);
  }

  private openColor(index: number): void {
    this.closeParam();
    this.colorTarget = "corolla";
    this.activeColor = index;
    if (this.colorPop.parentElement !== this.sub) this.sub.appendChild(this.colorPop);
    this.colorPop.style.display = "block";
    this.gradientMarker.style.display = "none"; // until they pick
    this.gradMarkers.forEach((m) => (m.style.display = "none"));
    this.swatchMarkers[0].style.display = index === 0 ? "block" : "none";
    this.swatchMarkers[1].style.display = index === 1 ? "block" : "none";
    this.layoutEditor();
  }

  /** Pick a share-gradient color (0 = top, 1 = bottom) — reuses the picker, but
   * routes the result to the gradient and shows it inside the share bar. */
  private openGradientColor(index: number): void {
    this.colorTarget = "gradient";
    this.activeColor = index;
    this.shareBar.insertBefore(this.colorPop, this.shareBar.lastElementChild);
    this.colorPop.style.display = "block";
    this.gradientMarker.style.display = "none";
    this.swatchMarkers.forEach((m) => (m.style.display = "none"));
    this.gradMarkers[0].style.display = index === 0 ? "block" : "none";
    this.gradMarkers[1].style.display = index === 1 ? "block" : "none";
  }

  private closeColor(): void {
    this.colorPop.style.display = "none";
    this.swatchMarkers.forEach((m) => (m.style.display = "none"));
    this.gradMarkers.forEach((m) => (m.style.display = "none"));
    this.layoutEditor();
  }

  private onPick(e: PointerEvent, begin: boolean): void {
    if (begin) {
      this.picking = true;
      this.picker.setPointerCapture(e.pointerId);
    }
    if (!this.picking) return;
    const rect = this.picker.getBoundingClientRect();
    const nx = clamp01((e.clientX - rect.left) / rect.width);
    const ny = clamp01((e.clientY - rect.top) / rect.height);
    const sx = Math.min(this.picker.width - 1, Math.floor(nx * this.picker.width));
    const sy = Math.min(
      this.picker.height - 1,
      Math.floor(ny * this.picker.height),
    );
    const px = this.pickerCtx.getImageData(sx, sy, 1, 1).data;
    const color = new Color(px[0] / 255, px[1] / 255, px[2] / 255);

    // Position the gradient marker.
    this.gradientMarker.style.display = "block";
    this.gradientMarker.style.left = `${nx * 100}%`;
    this.gradientMarker.style.top = `${ny * 100}%`;

    if (this.colorTarget === "gradient") {
      this.paintSwatch(this.activeColor === 0 ? this.gradTop : this.gradBottom, color);
      this.cb.onShareColor(this.activeColor, color);
    } else {
      this.paintSwatch(
        this.activeColor === 0 ? this.swatchTop : this.swatchBottom,
        color,
      );
      this.cb.onColor(this.activeColor, color);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Inject the vertical-slider CSS once: no visible track, and a thumb styled
   * exactly like a card button (white rounded rect, no text) that drags. */
  private static injectSliderStyle(): void {
    if (ControlPanel.sliderStyleInjected) return;
    ControlPanel.sliderStyleInjected = true;
    // Thumb is identical to a card button: full column width, same height and
    // look (radius/border/background/shadow) as makeButton — just no text.
    const thumb = `
      box-sizing: border-box;
      width: ${COLUMN_WIDTH}px; height: ${BUTTON_HEIGHT}px;
      border-radius: 12px;
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(0,0,0,0.25);
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
      cursor: grab;`;
    const style = document.createElement("style");
    style.textContent = `
      .hf-slider {
        -webkit-appearance: none; appearance: none;
        writing-mode: vertical-lr; direction: rtl; /* min at bottom, max at top */
        /* Track runs 1px past the card top and bottom so the thumb's travel
           extends 1px each way without changing the thumb or card size. */
        width: ${COLUMN_WIDTH}px; height: calc(100% + 2px); flex: none;
        margin: 0; padding: 0; background: transparent; cursor: pointer;
      }
      .hf-slider::-webkit-slider-runnable-track { background: transparent; border: 0; }
      .hf-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;${thumb} }
      .hf-slider::-moz-range-track { background: transparent; border: 0; }
      .hf-slider::-moz-range-thumb {${thumb} }
    `;
    document.head.appendChild(style);
  }

  /** A card button. `dark` reverses the colors (light on transparent) so it
   * reads over the black home/landing background. */
  private makeButton(
    label: string,
    onClick: () => void,
    dark = false,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      width: `${COLUMN_WIDTH}px`,
      padding: "9px 0",
      borderRadius: "12px",
      font: "13px system-ui, sans-serif",
      textAlign: "center",
      cursor: "pointer",
    } as CSSStyleDeclaration);
    this.applyButtonVariant(btn, dark);
    btn.addEventListener("click", onClick);
    return btn;
  }

  /** The light (dark-on-white) or reversed (light-on-dark) card-button colors. */
  private applyButtonVariant(btn: HTMLButtonElement, dark: boolean): void {
    Object.assign(btn.style, {
      border: `1px solid rgba(${dark ? "255,255,255" : "0,0,0"},0.25)`,
      background: dark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.92)",
      color: dark ? "#f2f2f4" : "#6e6e6e",
      boxShadow: dark ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
    } as CSSStyleDeclaration);
  }

  /** Flip the over-background buttons (home + share bars) light/dark, e.g. when
   * the share gradient becomes too bright for the reversed style. */
  setReversed(dark: boolean): void {
    for (const btn of this.reversibleBtns) this.applyButtonVariant(btn, dark);
  }

  /** A rounded card that stacks borderless rows (made with makeParamButton)
   * separated by thin dividers — used for the params and the corolla buttons. */
  private makeCardGroup(): HTMLDivElement {
    const group = document.createElement("div");
    Object.assign(group.style, {
      display: "flex",
      flexDirection: "column",
      borderRadius: "12px",
      overflow: "hidden",
      border: "1px solid rgba(0,0,0,0.25)",
      background: "rgba(255,255,255,0.92)",
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    } as CSSStyleDeclaration);
    return group;
  }

  /** A param row inside the grouped card: borderless, with an optional top
   * divider. The card supplies the rounded corners, border, and background. */
  private makeParamButton(
    label: string,
    divider: boolean,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      width: "100%",
      padding: "9px 0",
      border: "0",
      borderTop: divider ? "1px solid rgba(0,0,0,0.25)" : "0",
      background: "transparent",
      color: "#6e6e6e",
      font: "13px system-ui, sans-serif",
      textAlign: "center",
      cursor: "pointer",
    } as CSSStyleDeclaration);
    btn.addEventListener("click", onClick);
    return btn;
  }

  /** A two-tone color swatch (top/bottom halves), each with a hidden active
   * marker; tapping a half calls onHalf(0=top, 1=bottom). */
  private makeSwatch(
    markers: HTMLDivElement[],
    onHalf: (index: number) => void,
  ): { swatch: HTMLDivElement; top: HTMLDivElement; bottom: HTMLDivElement } {
    const swatch = document.createElement("div");
    Object.assign(swatch.style, {
      height: "56px",
      borderRadius: "12px",
      overflow: "hidden",
      border: "1px solid rgba(0,0,0,0.08)",
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
    } as CSSStyleDeclaration);
    const top = this.makeSwatchHalf(markers);
    const bottom = this.makeSwatchHalf(markers);
    swatch.append(top, bottom);
    swatch.addEventListener("click", (e) => {
      const rect = swatch.getBoundingClientRect();
      onHalf(e.clientY - rect.top < rect.height / 2 ? 0 : 1);
    });
    return { swatch, top, bottom };
  }

  private makeSwatchHalf(markers: HTMLDivElement[]): HTMLDivElement {
    const half = document.createElement("div");
    Object.assign(half.style, {
      flex: "1",
      position: "relative",
      boxSizing: "border-box",
    } as CSSStyleDeclaration);
    const marker = this.makeMarker();
    marker.style.left = "50%";
    marker.style.top = "50%";
    marker.style.display = "none";
    half.appendChild(marker);
    markers.push(marker);
    return half;
  }

  /** White circle with a grey border (selected-position indicator). */
  private makeMarker(): HTMLDivElement {
    const m = document.createElement("div");
    Object.assign(m.style, {
      position: "absolute",
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      background: "#fff",
      border: "1.5px solid #8a8f98",
      boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
    } as CSSStyleDeclaration);
    return m;
  }

  private highlight(btn: HTMLButtonElement, on: boolean): void {
    btn.style.background = on ? "#8c9099" : "rgba(255,255,255,0.92)";
    btn.style.color = on ? "#fff" : "#6e6e6e";
    btn.style.borderColor = on ? "transparent" : "rgba(0,0,0,0.25)";
  }

  private paintSwatch(half: HTMLDivElement, color: Color): void {
    const c = ColorUtils.Clamp(color);
    half.style.background = `rgb(${Math.round(c.r * 255)},${Math.round(
      c.g * 255,
    )},${Math.round(c.b * 255)})`;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
