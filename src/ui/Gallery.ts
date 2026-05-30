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

const PAGE_SIZE = 12; // 4 columns × 3 rows
const COLS = 4;

interface Page {
  type: "preset" | "user";
  presets?: string[]; // descriptions
  users?: SavedFlower[];
}

/**
 * Paged gallery overlay. Page 1 holds the read-only preset flowers; subsequent
 * pages hold the user's saved creations. Every page is padded to a full grid
 * with empty slots — on user pages an empty slot saves the current flower; a new
 * page is added once a page fills. Matches the original's black grid + "back".
 */
export class Gallery {
  private readonly deps: GalleryDeps;
  private readonly root: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly pageLabel: HTMLSpanElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;

  private readonly presetThumbs = new Map<string, string>();
  private presetReady = false;
  private pages: Page[] = [];
  private current = 0;
  private open_ = false;

  constructor(parent: HTMLElement, deps: GalleryDeps) {
    this.deps = deps;

    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      background: "#000",
      display: "none",
      flexDirection: "column",
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
    } as CSSStyleDeclaration);
    this.root.appendChild(back);

    this.grid = document.createElement("div");
    Object.assign(this.grid.style, {
      flex: "1",
      display: "grid",
      gridTemplateColumns: `repeat(${COLS}, 1fr)`,
      gridAutoRows: "1fr",
      gap: "16px",
      alignContent: "center",
      padding: "64px 24px 16px",
      maxWidth: "560px",
      width: "100%",
      margin: "0 auto",
      boxSizing: "border-box",
      overflowY: "auto",
    } as CSSStyleDeclaration);
    this.root.appendChild(this.grid);

    // Footer: pager + hint
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "6px",
      padding: "10px 0 16px",
    } as CSSStyleDeclaration);
    const pager = document.createElement("div");
    Object.assign(pager.style, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    } as CSSStyleDeclaration);
    this.prevBtn = this.makeButton("‹", () => this.go(-1));
    this.nextBtn = this.makeButton("›", () => this.go(1));
    this.pageLabel = document.createElement("span");
    this.pageLabel.style.minWidth = "120px";
    this.pageLabel.style.textAlign = "center";
    pager.append(this.prevBtn, this.pageLabel, this.nextBtn);
    const hint = document.createElement("div");
    hint.textContent = "touch slot to load · empty slot to save";
    hint.style.opacity = "0.5";
    footer.append(pager, hint);
    this.root.appendChild(footer);

    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<void> {
    this.open_ = true;
    this.root.style.display = "flex";
    if (!this.presetReady) {
      for (const desc of PRESET_FLOWERS) {
        this.presetThumbs.set(desc, this.deps.captureDescription(desc));
      }
      this.presetReady = true;
    }
    this.current = 0;
    await this.rebuild();
  }

  close(): void {
    this.open_ = false;
    this.root.style.display = "none";
  }

  private async rebuild(keepPage = false): Promise<void> {
    let users: SavedFlower[] = [];
    try {
      users = await this.deps.store.list();
    } catch {
      this.deps.toast("gallery storage unavailable");
    }

    const pages: Page[] = [];
    for (let i = 0; i < PRESET_FLOWERS.length; i += PAGE_SIZE) {
      pages.push({ type: "preset", presets: PRESET_FLOWERS.slice(i, i + PAGE_SIZE) });
    }
    const presetPageCount = pages.length;
    if (users.length === 0) {
      pages.push({ type: "user", users: [] });
    } else {
      for (let i = 0; i < users.length; i += PAGE_SIZE) {
        pages.push({ type: "user", users: users.slice(i, i + PAGE_SIZE) });
      }
      // Ensure a trailing empty slot exists to save into.
      if (users.length % PAGE_SIZE === 0) pages.push({ type: "user", users: [] });
    }

    this.pages = pages;
    if (!keepPage) this.current = presetPageCount; // open on the user's pages
    this.current = Math.min(Math.max(0, this.current), pages.length - 1);
    this.render();
  }

  private render(): void {
    const page = this.pages[this.current];
    this.grid.replaceChildren();

    for (let i = 0; i < PAGE_SIZE; i++) {
      if (page.type === "preset") {
        const desc = page.presets?.[i];
        this.grid.appendChild(
          desc ? this.presetSlot(desc) : this.emptySlot(false),
        );
      } else {
        const item = page.users?.[i];
        this.grid.appendChild(item ? this.userSlot(item) : this.emptySlot(true));
      }
    }

    const label = page.type === "preset" ? "presets" : "my flowers";
    this.pageLabel.textContent = `${label} — ${this.current + 1} / ${this.pages.length}`;
    this.prevBtn.style.visibility = this.current > 0 ? "visible" : "hidden";
    this.nextBtn.style.visibility =
      this.current < this.pages.length - 1 ? "visible" : "hidden";
  }

  private go(delta: number): void {
    this.current = Math.min(
      Math.max(0, this.current + delta),
      this.pages.length - 1,
    );
    this.render();
  }

  private presetSlot(description: string): HTMLElement {
    const cell = this.makeCell();
    cell.appendChild(this.thumb(this.presetThumbs.get(description)!));
    cell.appendChild(this.badge("preset"));
    cell.addEventListener("click", () => {
      this.deps.onLoad(description);
      this.close();
    });
    return cell;
  }

  private userSlot(item: SavedFlower): HTMLElement {
    const cell = this.makeCell();
    cell.appendChild(this.thumb(item.thumbnail));
    cell.addEventListener("click", () => {
      this.deps.onLoad(item.description);
      this.close();
    });

    const del = document.createElement("button");
    del.textContent = "×";
    Object.assign(del.style, {
      position: "absolute",
      top: "2px",
      right: "2px",
      width: "20px",
      height: "20px",
      borderRadius: "50%",
      border: "none",
      background: "rgba(0,0,0,0.55)",
      color: "#fff",
      cursor: "pointer",
      lineHeight: "1",
    } as CSSStyleDeclaration);
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.deps.store.delete(item.id);
      await this.rebuild(true);
    });
    cell.appendChild(del);
    return cell;
  }

  private emptySlot(saveable: boolean): HTMLElement {
    const cell = this.makeCell();
    cell.style.border = "1px dashed rgba(255,255,255,0.18)";
    if (saveable) {
      cell.style.color = "rgba(255,255,255,0.6)";
      cell.style.fontSize = "12px";
      cell.textContent = "+ save";
      cell.addEventListener("click", async () => {
        try {
          const thumb = this.deps.captureCurrent();
          await this.deps.store.save(this.deps.getDescription(), thumb);
          this.deps.toast("flower saved");
          await this.rebuild(); // jumps to the user pages (newest first)
        } catch {
          this.deps.toast("save failed");
        }
      });
    } else {
      cell.style.cursor = "default";
    }
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

  private badge(text: string): HTMLDivElement {
    const b = document.createElement("div");
    b.textContent = text;
    Object.assign(b.style, {
      position: "absolute",
      bottom: "3px",
      left: "3px",
      padding: "1px 5px",
      borderRadius: "6px",
      background: "rgba(0,0,0,0.5)",
      color: "rgba(255,255,255,0.8)",
      fontSize: "9px",
      pointerEvents: "none",
    } as CSSStyleDeclaration);
    return b;
  }

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      minWidth: "44px",
      padding: "8px 12px",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "#ddd",
      cursor: "pointer",
    } as CSSStyleDeclaration);
    btn.addEventListener("click", onClick);
    return btn;
  }
}
