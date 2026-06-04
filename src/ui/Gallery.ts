import { FlowerStore, type SavedFlower } from "../io/FlowerStore";
import { PRESET_FLOWERS } from "../data/presetFlowers";

export interface GalleryDeps {
  store: FlowerStore;
  /** Load a description into the scene. */
  onLoad(description: string): void;
  /** Current flower description, for saving. */
  getDescription(): string;
  /** Thumbnail (PNG data URL) of the current flower. */
  captureCurrent(): string;
  /** Thumbnail (PNG data URL) of an arbitrary description (for presets). */
  captureDescription(description: string): string;
  toast(message: string): void;
}

const SLOTS = 24; // gallery cells (presets + user); arranged responsively
// Candidate column×row arrangements of SLOTS; the one whose shape best matches
// the screen aspect is chosen so the grid fits and stays centered.
const GRID_LAYOUTS = [
  { cols: 3, rows: 8 },
  { cols: 4, rows: 6 },
  { cols: 6, rows: 4 },
  { cols: 8, rows: 3 },
];
const HOLD_MS = 3000; // press-and-hold duration to delete a saved flower

/**
 * Single-page gallery overlay (4×6 grid) on black, matching the home menu's
 * button language. The read-only preset flowers come first; every remaining
 * slot belongs to the user — filled by their saved creations, then empty
 * "+ save" slots that store the current flower. Loading a flower returns to the
 * home screen.
 */
export class Gallery {
  private readonly deps: GalleryDeps;
  private readonly root: HTMLDivElement;
  private readonly grid: HTMLDivElement;

  private static holdStyleInjected = false;
  private readonly presetThumbs = new Map<string, string>();
  private presetReady = false;
  private open_ = false;

  constructor(parent: HTMLElement, deps: GalleryDeps) {
    this.deps = deps;
    Gallery.injectHoldStyle();

    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      background: "#000",
      display: "none",
      flexDirection: "column",
      alignItems: "center", // center the grid horizontally…
      justifyContent: "center", // …and vertically
      zIndex: "20",
      font: "13px system-ui, sans-serif",
      color: "#fff",
    } as CSSStyleDeclaration);

    const back = this.makeButton("back", () => this.close());
    Object.assign(back.style, {
      position: "absolute",
      top: "14px",
      left: "14px",
      zIndex: "1",
      width: "74px", // match the home/editor button bar
      padding: "9px 0",
    } as CSSStyleDeclaration);
    this.root.appendChild(back);

    // Grid is sized + arranged by layout() (columns/rows and square cell size);
    // the root centers it. No scroll — cells shrink to fit the viewport.
    this.grid = document.createElement("div");
    Object.assign(this.grid.style, {
      display: "grid",
      gap: "12px",
      boxSizing: "border-box",
    } as CSSStyleDeclaration);
    this.root.appendChild(this.grid);

    const hint = document.createElement("div");
    hint.textContent =
      "touch slot to load · empty slot to save · hold to delete";
    Object.assign(hint.style, {
      position: "absolute",
      bottom: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      whiteSpace: "nowrap",
      textAlign: "center",
      opacity: "0.5",
    } as CSSStyleDeclaration);
    this.root.appendChild(hint);

    parent.appendChild(this.root);
    window.addEventListener("resize", () => {
      if (this.open_) this.layout();
    });
  }

  /** Pick the column/row arrangement that best matches the screen aspect, then
   * size square cells to fit the viewport, and keep the grid centered. */
  private layout(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const aspect = w / h;
    let best = GRID_LAYOUTS[1];
    let bestErr = Infinity;
    for (const g of GRID_LAYOUTS) {
      const err = Math.abs(g.cols / g.rows - aspect);
      if (err < bestErr) {
        bestErr = err;
        best = g;
      }
    }
    const gap = 12;
    // Reserve room for the back button (top) and hint (bottom) plus margins.
    const cellW = (w - 32 - gap * (best.cols - 1)) / best.cols;
    const cellH = (h - 130 - gap * (best.rows - 1)) / best.rows;
    const cell = Math.max(36, Math.floor(Math.min(cellW, cellH)));
    this.grid.style.gridTemplateColumns = `repeat(${best.cols}, ${cell}px)`;
    this.grid.style.gridAutoRows = `${cell}px`;
  }

  get isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<void> {
    this.open_ = true;
    this.root.style.display = "flex";
    this.layout();
    if (!this.presetReady) {
      for (const desc of PRESET_FLOWERS) {
        this.presetThumbs.set(desc, this.deps.captureDescription(desc));
      }
      this.presetReady = true;
    }
    await this.rebuild();
  }

  close(): void {
    this.open_ = false;
    this.root.style.display = "none";
  }

  /** Rebuild the single 4×6 page: presets first, then the user's saved flowers,
   * then empty "+ save" slots filling the rest. */
  private async rebuild(): Promise<void> {
    let users: SavedFlower[] = [];
    try {
      users = await this.deps.store.list();
    } catch {
      this.deps.toast("gallery storage unavailable");
    }

    // Place each saved flower at its stored slot (leaving gaps). Legacy records
    // that predate slots — or any out of range — backfill the leftover slots.
    const userSlots = Math.max(0, SLOTS - PRESET_FLOWERS.length);
    const bySlot = new Map<number, SavedFlower>();
    const unslotted: SavedFlower[] = [];
    for (const u of users) {
      if (u.slot >= 0 && u.slot < userSlots && !bySlot.has(u.slot)) {
        bySlot.set(u.slot, u);
      } else {
        unslotted.push(u);
      }
    }

    const cells: HTMLElement[] = PRESET_FLOWERS.slice(0, SLOTS).map((desc) =>
      this.presetSlot(desc),
    );
    for (let s = 0; s < userSlots; s++) {
      const item = bySlot.get(s) ?? unslotted.shift();
      cells.push(item ? this.userSlot(item) : this.emptySlot(s));
    }

    this.grid.replaceChildren(...cells);
  }

  private presetSlot(description: string): HTMLElement {
    const cell = this.makeCell();
    cell.appendChild(this.thumb(this.presetThumbs.get(description)!));
    cell.addEventListener("click", () => {
      this.deps.onLoad(description);
      this.close();
    });
    return cell;
  }

  private userSlot(item: SavedFlower): HTMLElement {
    const cell = this.makeCell();
    cell.style.touchAction = "none"; // so a hold isn't stolen by scrolling
    cell.appendChild(this.thumb(item.thumbnail));

    // Press-and-hold (HOLD_MS) to delete; a white pie-timer fills over the
    // flower while held. A short press just loads the flower.
    const ring = document.createElement("div");
    ring.className = "hf-hold-ring";
    cell.appendChild(ring);

    let holdTimer = 0;
    const cancel = () => {
      if (!holdTimer) return;
      clearTimeout(holdTimer);
      holdTimer = 0;
      ring.classList.remove("run");
    };
    cell.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      ring.classList.remove("run");
      void ring.offsetWidth; // restart the fill animation
      ring.classList.add("run");
      holdTimer = window.setTimeout(async () => {
        holdTimer = 0;
        ring.classList.remove("run");
        await this.deps.store.delete(item.id);
        await this.rebuild();
      }, HOLD_MS);
    });
    cell.addEventListener("pointerup", () => {
      if (!holdTimer) return; // hold completed → already deleting
      cancel(); // released early → treat as a tap
      this.deps.onLoad(item.description);
      this.close();
    });
    cell.addEventListener("pointerleave", cancel);
    cell.addEventListener("pointercancel", cancel);
    return cell;
  }

  /** An empty user slot: a bare "+" that saves the current flower into this
   * exact slot when tapped. */
  private emptySlot(slot: number): HTMLElement {
    const cell = this.makeCell();
    cell.style.color = "rgba(255,255,255,0.4)";
    cell.style.fontSize = "28px";
    cell.textContent = "+";
    cell.addEventListener("click", async () => {
      try {
        const thumb = this.deps.captureCurrent();
        await this.deps.store.save(this.deps.getDescription(), thumb, slot);
        this.deps.toast("flower saved");
        await this.rebuild();
      } catch {
        this.deps.toast("save failed");
      }
    });
    return cell;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private makeCell(): HTMLDivElement {
    const cell = document.createElement("div");
    Object.assign(cell.style, {
      position: "relative",
      aspectRatio: "1",
      borderRadius: "10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      overflow: "hidden",
    } as CSSStyleDeclaration);
    return cell;
  }

  private thumb(src: string): HTMLImageElement {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "flower";
    Object.assign(img.style, {
      width: "100%",
      height: "100%",
      objectFit: "contain",
    } as CSSStyleDeclaration);
    return img;
  }

  /** Inject the press-and-hold timer styles once: a white (0.25) conic "pie"
   * that fills over HOLD_MS, overlaid on the flower being held. */
  private static injectHoldStyle(): void {
    if (Gallery.holdStyleInjected) return;
    Gallery.holdStyleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      @property --hf-hold { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
      @keyframes hf-hold-fill { from { --hf-hold: 0deg; } to { --hf-hold: 360deg; } }
      .hf-hold-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        pointer-events: none;
        opacity: 0;
        background: conic-gradient(rgba(255,255,255,0.25) var(--hf-hold), transparent 0deg);
      }
      .hf-hold-ring.run {
        opacity: 1;
        animation: hf-hold-fill ${HOLD_MS}ms linear forwards;
      }
    `;
    document.head.appendChild(style);
  }

  // Reversed card button, matching the home menu's button language (light on
  // dark, since the gallery sits on a black background).
  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      minWidth: "44px",
      padding: "9px 14px",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(255,255,255,0.1)",
      color: "#f2f2f4",
      font: "13px system-ui, sans-serif",
      textAlign: "center",
      cursor: "pointer",
    } as CSSStyleDeclaration);
    btn.addEventListener("click", onClick);
    return btn;
  }
}
