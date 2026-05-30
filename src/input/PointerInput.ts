/**
 * Unified pointer (mouse + touch + pen) input, modernizing Unity
 * `MouseInput`/`MouseTouch`. Exposes a touch-like snapshot each frame with
 * positions in **bottom-left-origin** pixels (Unity convention) so the ported
 * editors' coordinate math (e.g. ColorEditor's `Screen.height - y`) carries over
 * unchanged. Call `update()` once per frame before consumers read.
 */
export type TouchPhase = "Began" | "Moved" | "Ended";

export interface PointerTouch {
  readonly id: number;
  /** x in CSS pixels, left origin. */
  readonly x: number;
  /** y in CSS pixels, BOTTOM origin (flipped from the DOM's top origin). */
  readonly y: number;
  /** Movement since the previous frame, in CSS pixels (y up-positive). */
  readonly dx: number;
  readonly dy: number;
  readonly phase: TouchPhase;
}

interface ActivePointer {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  phase: TouchPhase;
  ended: boolean;
}

export class PointerInput {
  touches: PointerTouch[] = [];
  width = 0;
  height = 0;

  private readonly el: HTMLElement;
  private readonly active = new Map<number, ActivePointer>();

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
  }

  get touchCount(): number {
    return this.touches.length;
  }

  /** True on any frame where at least one pointer is down. */
  get engaged(): boolean {
    return this.touches.length > 0;
  }

  dispose(): void {
    this.el.removeEventListener("pointerdown", this.onDown);
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("pointercancel", this.onUp);
  }

  /** Finalize per-frame deltas and advance phases. Call once per frame. */
  update(): void {
    this.width = this.el.clientWidth;
    this.height = this.el.clientHeight;

    const out: PointerTouch[] = [];
    for (const [id, a] of this.active) {
      const dx = a.x - a.prevX;
      const dy = a.y - a.prevY;
      out.push({
        id,
        x: a.x,
        y: a.y,
        dx,
        dy,
        phase: a.ended ? "Ended" : a.phase,
      });

      a.prevX = a.x;
      a.prevY = a.y;
      if (a.ended) {
        this.active.delete(id);
      } else if (a.phase === "Began") {
        a.phase = "Moved";
      }
    }
    this.touches = out;
  }

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this.el.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: rect.height - (e.clientY - rect.top), // flip to bottom-left origin
    };
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    const p = this.toLocal(e);
    this.active.set(e.pointerId, {
      x: p.x,
      y: p.y,
      prevX: p.x,
      prevY: p.y,
      phase: "Began",
      ended: false,
    });
  };

  private onMove = (e: PointerEvent): void => {
    const a = this.active.get(e.pointerId);
    if (!a) return;
    const p = this.toLocal(e);
    a.x = p.x;
    a.y = p.y;
  };

  private onUp = (e: PointerEvent): void => {
    const a = this.active.get(e.pointerId);
    if (!a) return;
    a.ended = true;
  };
}
