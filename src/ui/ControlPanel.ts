import { Color } from "three";
import type { CorollaData } from "../engine/serialization/CorollaData";
import { ColorUtils } from "../engine/color/ColorUtils";
import { paintGradient } from "./gradientTexture";

export type ParamName = "petals" | "open" | "spin" | "sway" | "curve";

export interface ControlPanelCallbacks {
  onBack(): void;
  onNextFlower(): void;
  onShare(): void;
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

/**
 * The editing UI, styled to match the original's left control column:
 * `back`, a two-tone color swatch (main over secondary), `shape`, then
 * `petals/open/spin/sway/curve`. Tapping a param button reveals a bottom
 * slider; tapping the swatch opens the GradientSlider color picker, which
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

  // Color picker (below the column)
  private readonly colorPop: HTMLDivElement;
  private readonly picker: HTMLCanvasElement;
  private readonly pickerCtx: CanvasRenderingContext2D;
  private readonly gradientMarker: HTMLDivElement;
  private picking = false;

  // Bottom param slider
  private readonly sliderBar: HTMLDivElement;
  private readonly sliderLabel: HTMLSpanElement;
  private readonly sliderValue: HTMLSpanElement;
  private readonly sliderInput: HTMLInputElement;

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

  constructor(parent: HTMLElement, cb: ControlPanelCallbacks) {
    this.cb = cb;

    const col = document.createElement("div");
    Object.assign(col.style, {
      position: "absolute",
      top: "14px",
      left: "14px",
      display: "flex",
      flexDirection: "column",
      gap: "7px",
      width: `${COLUMN_WIDTH}px`,
    } as CSSStyleDeclaration);
    col.addEventListener("pointerdown", (e) => e.stopPropagation());

    col.appendChild(this.makeButton("back", () => this.onBack()));

    // Two-tone color swatch (each half holds a hidden active marker)
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
    this.swatchTop = this.makeSwatchHalf();
    this.swatchBottom = this.makeSwatchHalf();
    swatch.append(this.swatchTop, this.swatchBottom);
    swatch.addEventListener("click", (e) => {
      const rect = swatch.getBoundingClientRect();
      this.openColor(e.clientY - rect.top < rect.height / 2 ? 0 : 1);
    });
    col.appendChild(swatch);

    this.shapeBtn = this.makeButton("shape", () => this.toggleShape());
    col.appendChild(this.shapeBtn);

    for (const name of Object.keys(SLIDERS) as ParamName[]) {
      const btn = this.makeButton(name, () => this.toggleParam(name));
      this.paramBtns.set(name, btn);
      col.appendChild(btn);
    }

    // Color picker BELOW the column, full column width.
    this.colorPop = document.createElement("div");
    Object.assign(this.colorPop.style, {
      position: "relative",
      width: "100%",
      display: "none",
      marginTop: "2px",
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
    col.appendChild(this.colorPop);

    parent.appendChild(col);

    // Bottom param slider
    this.sliderBar = document.createElement("div");
    Object.assign(this.sliderBar.style, {
      position: "absolute",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(360px, 70%)",
      display: "none",
      alignItems: "center",
      gap: "10px",
      padding: "8px 14px",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.85)",
      border: "1px solid rgba(0,0,0,0.1)",
      font: "13px system-ui, sans-serif",
      color: "#6e6e6e",
    } as CSSStyleDeclaration);
    this.sliderBar.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.sliderLabel = document.createElement("span");
    this.sliderLabel.style.minWidth = "46px";
    this.sliderInput = document.createElement("input");
    this.sliderInput.type = "range";
    this.sliderInput.style.flex = "1";
    this.sliderValue = document.createElement("span");
    this.sliderValue.style.minWidth = "40px";
    this.sliderValue.style.textAlign = "right";
    this.sliderInput.addEventListener("input", () => this.onSliderInput());
    this.sliderBar.append(this.sliderLabel, this.sliderInput, this.sliderValue);
    parent.appendChild(this.sliderBar);

    // Bottom-right utility buttons: share the current flower + cycle built-ins.
    // (The original had a richer Share state; this is a minimal modernization.)
    const utils = document.createElement("div");
    Object.assign(utils.style, {
      position: "absolute",
      bottom: "16px",
      right: "16px",
      display: "flex",
      gap: "7px",
      opacity: "0.75",
    } as CSSStyleDeclaration);
    utils.addEventListener("pointerdown", (e) => e.stopPropagation());
    utils.append(
      this.makeButton("gallery", () => this.cb.onGallery()),
      this.makeButton("share", () => this.cb.onShare()),
      this.makeButton("✿ next", () => this.cb.onNextFlower()),
    );
    parent.appendChild(utils);
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
    this.sliderBar.style.display = "flex";
  }

  private closeParam(): void {
    this.activeParam = null;
    for (const btn of this.paramBtns.values()) this.highlight(btn, false);
    this.sliderBar.style.display = "none";
  }

  private loadSlider(name: ParamName): void {
    const spec = SLIDERS[name];
    this.sliderInput.min = String(spec.min);
    this.sliderInput.max = String(spec.max);
    this.sliderInput.step = String(spec.step);
    this.sliderInput.value = String(this.values[name]);
    this.sliderLabel.textContent = name;
    this.sliderValue.textContent = this.fmt(this.values[name], spec);
  }

  private onSliderInput(): void {
    if (!this.activeParam) return;
    const spec = SLIDERS[this.activeParam];
    const v = spec.int
      ? Math.round(+this.sliderInput.value)
      : +this.sliderInput.value;
    this.values[this.activeParam] = v;
    this.sliderValue.textContent = this.fmt(v, spec);
    this.cb.onParam(this.activeParam, v);
  }

  private openColor(index: number): void {
    this.closeParam();
    this.activeColor = index;
    this.colorPop.style.display = "block";
    this.gradientMarker.style.display = "none"; // until they pick
    this.swatchMarkers[0].style.display = index === 0 ? "block" : "none";
    this.swatchMarkers[1].style.display = index === 1 ? "block" : "none";
  }

  private closeColor(): void {
    this.colorPop.style.display = "none";
    this.swatchMarkers[0].style.display = "none";
    this.swatchMarkers[1].style.display = "none";
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

    this.paintSwatch(
      this.activeColor === 0 ? this.swatchTop : this.swatchBottom,
      color,
    );
    this.cb.onColor(this.activeColor, color);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      width: `${COLUMN_WIDTH}px`,
      padding: "9px 0",
      borderRadius: "12px",
      border: "1px solid rgba(0,0,0,0.07)",
      background: "rgba(255,255,255,0.92)",
      color: "#6e6e6e",
      font: "13px system-ui, sans-serif",
      textAlign: "center",
      cursor: "pointer",
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    } as CSSStyleDeclaration);
    btn.addEventListener("click", onClick);
    return btn;
  }

  private makeSwatchHalf(): HTMLDivElement {
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
    this.swatchMarkers.push(marker);
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
    btn.style.borderColor = on ? "transparent" : "rgba(0,0,0,0.07)";
  }

  private paintSwatch(half: HTMLDivElement, color: Color): void {
    const c = ColorUtils.Clamp(color);
    half.style.background = `rgb(${Math.round(c.r * 255)},${Math.round(
      c.g * 255,
    )},${Math.round(c.b * 255)})`;
  }

  private fmt(v: number, spec: SliderSpec): string {
    return spec.int ? String(Math.round(v)) : v.toFixed(2);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
