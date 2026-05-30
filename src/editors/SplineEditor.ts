import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
} from "three";
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
const HANDLE_PX = 32;
const ACTIVE_PX = 44;
const DASH_COUNT = 26;
const DASH_SPEED = 1.2;

export class SplineEditor {
  private readonly camera: PerspectiveCamera;
  private readonly group = new Group();
  private readonly raycaster = new Raycaster();
  private readonly handleTex: CanvasTexture;

  private readonly handles: Sprite[] = [];
  private line: Line | null = null;
  private lineMat: ShaderMaterial | null = null;

  private corolla: Corolla | null = null;
  private dragging = -1;
  private readonly dragPlane = new Plane();
  private readonly hit = new Vector3();
  private readonly normal = new Vector3();
  private readonly tmp = new Vector3();
  private time = 0;
  private viewportHeight = 600;

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

    this.lineMat = makeMarchingAntsMaterial();
    this.line = new Line(new BufferGeometry(), this.lineMat);
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
    if (this.line) {
      this.group.remove(this.line);
      this.line.geometry.dispose();
      this.lineMat?.dispose();
    }
    this.line = null;
    this.lineMat = null;
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

  /** Animate the dashes and keep handles at a constant screen size. */
  update(dtSeconds: number, viewportHeight: number): void {
    this.viewportHeight = viewportHeight;
    this.time += dtSeconds * DASH_SPEED;
    if (this.lineMat) this.lineMat.uniforms.time.value = this.time;

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
    const dist = new Float32Array(samples.length);
    let total = 0;
    const prev = new Vector3();
    for (let i = 0; i < samples.length; i++) {
      this.tmp.copy(samples[i]);
      ref.localToWorld(this.tmp);
      positions[i * 3] = this.tmp.x;
      positions[i * 3 + 1] = this.tmp.y;
      positions[i * 3 + 2] = this.tmp.z;
      if (i > 0) total += this.tmp.distanceTo(prev);
      dist[i] = total;
      prev.copy(this.tmp);
    }
    for (let i = 0; i < dist.length; i++) dist[i] = total > 0 ? dist[i] / total : 0;

    const geo = this.line.geometry;
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    geo.setAttribute("lineDistance", new BufferAttribute(dist, 1));
    geo.computeBoundingSphere();
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

function makeHandleTexture(): CanvasTexture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(250,250,252,0.95)");
  g.addColorStop(0.75, "rgba(150,160,178,0.55)");
  g.addColorStop(1.0, "rgba(120,130,150,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeMarchingAntsMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthTest: false,
    uniforms: { time: { value: 0 }, dashCount: { value: DASH_COUNT } },
    vertexShader: /* glsl */ `
      attribute float lineDistance;
      varying float vDist;
      void main() {
        vDist = lineDistance;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float dashCount;
      varying float vDist;
      void main() {
        float d = vDist * dashCount - time;
        if (fract(d) > 0.5) discard;
        gl_FragColor = vec4(0.42, 0.47, 0.56, 1.0);
      }
    `,
  });
}
