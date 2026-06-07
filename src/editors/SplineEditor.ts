import {
  CanvasTexture,
  Group,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Corolla } from "../scene/Corolla";
import type { PointerInput } from "../input/PointerInput";

/**
 * Touch/mouse shape editor, porting the interaction of Unity `SplineEditor.cs`.
 *
 * The corolla's control points define the petal's half-profile: each point's
 * X is length along the petal, Y is curl, and **Z is the half-width** at that
 * point. So the handles trace one edge of the petal, and the TIP point keeps
 * z = 0 (zero width → pointed tip); we lock that during drag. The base point
 * (index 0) is fixed at the root, so it gets no handle.
 *
 * Handles (soft radial-gradient sprites, constant screen size) and the
 * marching-ants curve live in an un-mirrored scene group; their world
 * positions are computed via the first petal's transform, and drags convert
 * back to control-point-local space through that same transform. Editing the
 * spline rebuilds the shared petal mesh, so all petals reshape together.
 */
const HANDLE_PX = 40;
const ACTIVE_PX = 52;
const CURVE_PX = 5; // spline curve thickness (screen pixels)
const DASH_COUNT = 26; // marching-ants dash cells along the whole curve
const DASH_SPEED = 1.2; // dash cells marched per second

export class SplineEditor {
  private readonly camera: PerspectiveCamera;
  private readonly group = new Group();
  private readonly raycaster = new Raycaster();
  private readonly handleTex: CanvasTexture;

  private readonly handles: Sprite[] = [];
  private line: Line2 | null = null; // black dashed line (marches on top)
  private lineMat: LineMaterial | null = null;
  private lineBase: Line2 | null = null; // solid white line under the dashes
  private lineBaseMat: LineMaterial | null = null;

  private corolla: Corolla | null = null;
  private dragging = -1;
  private readonly dragPlane = new Plane();
  private readonly hit = new Vector3();
  private readonly normal = new Vector3();
  private readonly tmp = new Vector3();
  private viewportHeight = 600;
  private dashCell = 0; // world length of one dash+gap cell (for the march speed)

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
    this.group.renderOrder = 998;
    this.handleTex = makeHandleTexture();
  }

  get active(): boolean {
    return this.corolla !== null;
  }

  attach(scene: Scene): void {
    scene.add(this.group);
  }

  /** Hide/show the handles + curve (e.g. while capturing a thumbnail). */
  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  enterFor(corolla: Corolla): void {
    this.exit();
    this.corolla = corolla;
    if (!corolla.referenceNode) return;

    const cps = corolla.data.controlPoints;
    // Skip index 0: the base point is fixed at the root, so a handle there would
    // only imply a draggability it doesn't have.
    for (let i = 1; i < cps.length; i++) {
      const mat = new SpriteMaterial({
        map: this.handleTex,
        depthTest: false,
        transparent: true,
      });
      const sprite = new Sprite(mat);
      sprite.renderOrder = 1000;
      sprite.userData = { index: i };
      this.group.add(sprite);
      this.handles.push(sprite);
    }

    // Two stacked lines make classic black/white marching ants: a solid white
    // base, with a black dashed line marching on top (its gaps reveal the white).
    this.lineBaseMat = makeCurveMaterial(0xffffff, false);
    this.lineBase = new Line2(new LineGeometry(), this.lineBaseMat);
    this.lineBase.renderOrder = 998;
    this.lineBase.frustumCulled = false;
    this.group.add(this.lineBase);

    this.lineMat = makeCurveMaterial(0x000000, true);
    this.line = new Line2(new LineGeometry(), this.lineMat);
    this.line.renderOrder = 999;
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this.rebuildGeometry();
  }

  exit(): void {
    for (const h of this.handles) {
      this.group.remove(h);
      (h.material as SpriteMaterial).dispose();
    }
    this.handles.length = 0;
    for (const line of [this.line, this.lineBase]) {
      if (!line) continue;
      this.group.remove(line);
      line.geometry.dispose();
    }
    this.lineMat?.dispose();
    this.lineBaseMat?.dispose();
    this.line = null;
    this.lineMat = null;
    this.lineBase = null;
    this.lineBaseMat = null;
    this.corolla = null;
    this.dragging = -1;
  }

  /** Returns true if a handle is grabbed/dragged this frame (suppress orbit). */
  handleInput(input: PointerInput): boolean {
    if (!this.corolla || input.touchCount !== 1) {
      const was = this.dragging >= 0;
      this.dragging = -1;
      return was;
    }
    const ref = this.corolla.referenceNode;
    if (!ref) return false;

    const t = input.touches[0];
    const ndc = new Vector2(
      (t.x / input.width) * 2 - 1,
      (t.y / input.height) * 2 - 1,
    );

    if (t.phase === "Ended") {
      const was = this.dragging >= 0;
      this.dragging = -1;
      return was;
    }

    if (t.phase === "Began") {
      for (const h of this.handles) h.updateWorldMatrix(true, false);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(this.handles, false);
      const hit = hits[0];
      if (hit) {
        this.dragging = hit.object.userData.index as number;
        hit.object.getWorldPosition(this.tmp);
        this.camera.getWorldDirection(this.normal);
        this.dragPlane.setFromNormalAndCoplanarPoint(this.normal, this.tmp);
        return true;
      }
      return false;
    }

    // Moved
    if (this.dragging >= 0) {
      this.raycaster.setFromCamera(ndc, this.camera);
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hit)) {
        ref.updateWorldMatrix(true, false);
        const local = ref.worldToLocal(this.hit.clone());
        const cps = this.corolla.data.controlPoints;
        const isTip = this.dragging === cps.length - 1;
        if (isTip) local.z = 0; // keep the tip on the petal axis (pointed)
        cps[this.dragging].copy(local);
        this.corolla.updateShape();
        this.rebuildGeometry();
      }
      return true;
    }

    return false;
  }

  /** March the dashes, keep handles at a constant screen size, and keep the
   * curve width in sync with the viewport (LineMaterial sizes its pixel width
   * against `resolution`). */
  update(dtSeconds: number, viewportHeight: number): void {
    this.viewportHeight = viewportHeight;
    const resW = this.camera.aspect * viewportHeight;
    this.lineBaseMat?.resolution.set(resW, viewportHeight);
    if (this.lineMat) {
      this.lineMat.resolution.set(resW, viewportHeight);
      this.lineMat.dashOffset -= dtSeconds * DASH_SPEED * this.dashCell;
    }

    if (!this.corolla?.referenceNode) return;
    this.corolla.referenceNode.updateWorldMatrix(true, false);
    this.positionHandles();
  }

  /** Recompute handle world positions + the curve geometry from control points. */
  private rebuildGeometry(): void {
    if (!this.corolla?.referenceNode) return;
    this.positionHandles();

    const samples = this.corolla.evalShape();
    if (!samples || !this.line) return;
    const ref = this.corolla.referenceNode;

    const positions = new Float32Array(samples.length * 3);
    let total = 0;
    const prev = new Vector3();
    for (let i = 0; i < samples.length; i++) {
      this.tmp.copy(samples[i]);
      ref.localToWorld(this.tmp);
      positions[i * 3] = this.tmp.x;
      positions[i * 3 + 1] = this.tmp.y;
      positions[i * 3 + 2] = this.tmp.z;
      if (i > 0) total += this.tmp.distanceTo(prev);
      prev.copy(this.tmp);
    }
    (this.line.geometry as LineGeometry).setPositions(positions);
    this.line.computeLineDistances(); // world-space distances for the dashes
    if (this.lineBase)
      (this.lineBase.geometry as LineGeometry).setPositions(positions);

    // Keep a constant DASH_COUNT of dashes regardless of the curve's length:
    // size each dash+gap cell to a fraction of the total, 50% dash / 50% gap.
    this.dashCell = total / DASH_COUNT;
    if (this.lineMat) {
      this.lineMat.dashSize = this.dashCell / 2;
      this.lineMat.gapSize = this.dashCell / 2;
    }
  }

  private positionHandles(): void {
    if (!this.corolla?.referenceNode) return;
    const ref = this.corolla.referenceNode;
    const cps = this.corolla.data.controlPoints;
    const vFov = (this.camera.fov * Math.PI) / 180;
    for (const sprite of this.handles) {
      const index = sprite.userData.index as number;
      this.tmp.copy(cps[index]);
      ref.localToWorld(this.tmp);
      sprite.position.copy(this.tmp);

      const d = this.camera.position.distanceTo(this.tmp);
      const worldPerPx = (2 * Math.tan(vFov / 2) * Math.max(d, 0.3)) / this.viewportHeight;
      const px = this.dragging === index ? ACTIVE_PX : HANDLE_PX;
      const s = px * worldPerPx;
      sprite.scale.set(s, s, 1);
    }
  }
}

/** Solid white disc with a grey border + soft shadow, matching the card button
 * style (background rgba(255,255,255,0.92), border rgba(0,0,0,0.25)). */
function makeHandleTexture(): CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const cx = size / 2;
  const r = size * 0.4; // leaves a margin for the border + shadow
  const lineW = size * 0.04;

  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetY = size * 0.015;
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();

  ctx.shadowColor = "transparent"; // crisp border, no shadow
  ctx.lineWidth = lineW;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();

  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** A thick screen-space line for the spline curve (fat-line shader; a plain
 * three Line ignores linewidth on WebGL). `resolution` is set each frame; for
 * the dashed line the dash sizes are set per rebuild (they scale with the curve
 * length) and `dashOffset` is animated in update to make the dashes march. */
function makeCurveMaterial(color: number, dashed: boolean): LineMaterial {
  return new LineMaterial({
    color,
    linewidth: CURVE_PX, // screen pixels (worldUnits stays false)
    dashed,
    transparent: true,
    depthTest: false,
  });
}
