import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

/**
 * Renders a square PNG thumbnail (data URL) of a flower group on a black
 * background, from a canonical front-ish view — matching the original gallery's
 * prerendered look. Reuses the app's main WebGLRenderer; owns a small offscreen
 * scene + render target.
 *
 * `capture` reparents the given group into its scene for the render and removes
 * it afterward (leaving it parentless), so the caller must re-add a live scene
 * object, or dispose a throwaway one.
 */
export class ThumbnailRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.01, 100);
  private readonly rt: WebGLRenderTarget;
  private readonly size: number;

  constructor(size = 192) {
    this.size = size;
    this.rt = new WebGLRenderTarget(size, size, { depthBuffer: true });

    this.scene.add(new AmbientLight(0xffffff, 0.85));
    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(0.4, 1.0, 0.6);
    this.scene.add(key, key.target);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(-0.5, 0.3, -0.6);
    this.scene.add(fill, fill.target);
  }

  capture(renderer: WebGLRenderer, group: Object3D): string {
    this.scene.add(group);
    this.scene.updateMatrixWorld(true);

    const box = new Box3().setFromObject(group);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Top-down view: camera straight above, looking down the flower's +y axis,
    // framed to the petal footprint (x–z extent). Up is set to -z since looking
    // straight down makes the default up vector degenerate.
    const radius = Math.max(size.x, size.z) * 0.5 || 1;
    const halfY = size.y * 0.5;
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = (radius / Math.tan(fov / 2)) * 1.2;
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(center.x, center.y + dist, center.z);
    this.camera.near = Math.max(0.01, dist - halfY - radius);
    this.camera.far = dist + halfY + radius;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(center);

    const prevColor = new Color();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    const buf = new Uint8Array(this.size * this.size * 4);
    renderer.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, buf);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    this.scene.remove(group);

    return this.toDataUrl(buf);
  }

  dispose(): void {
    this.rt.dispose();
  }

  private toDataUrl(buf: Uint8Array): string {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = this.size;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(this.size, this.size);
    const row = this.size * 4;
    for (let y = 0; y < this.size; y++) {
      // GL pixels are bottom-up; flip to top-down for the canvas.
      const src = (this.size - 1 - y) * row;
      img.data.set(buf.subarray(src, src + row), y * row);
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL("image/png");
  }
}
