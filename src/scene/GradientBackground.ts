import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

/**
 * Procedural vertical two-color gradient background, porting Unity
 * `CameraGradientBackground` (which drew a GL quad lerping top↔bottom). Rendered
 * as a separate ortho scene before the main scene.
 *
 * Defaults to the near-white editing background seen in the Shape/Select
 * screens; `setColors` switches it (e.g. the vivid Share gradient).
 */
export class GradientBackground {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: ShaderMaterial;

  constructor(topColor = 0xffffff, bottomColor = 0xececf1) {
    this.material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        topColor: { value: new Color(topColor) },
        bottomColor: { value: new Color(bottomColor) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        void main() {
          gl_FragColor = vec4(mix(bottomColor, topColor, vUv.y), 1.0);
        }
      `,
    });

    const quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setColors(topColor: number, bottomColor: number): void {
    (this.material.uniforms.topColor.value as Color).set(topColor);
    (this.material.uniforms.bottomColor.value as Color).set(bottomColor);
  }

  /** Render the background. Caller should disable autoClear and clear first. */
  render(renderer: WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }
}
