import {
  AmbientLight,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  Vector3,
} from "three";

/**
 * Lighting rig porting Unity `CameraBehaviour`'s main directional light + a
 * camera-attached light, plus an ambient term standing in for the petal
 * shader's `Ambient(1,1,1,1)` (so the painted texture stays visible on faces
 * turned away from the key light). Intensities are placeholders until the scene
 * values are recovered (M3).
 */
export const DEFAULT_AMBIENT = 0.85;

export class LightingRig {
  readonly group = new Group();
  private readonly key: DirectionalLight;
  private readonly camLight: DirectionalLight;
  private readonly ambient: AmbientLight;
  private readonly _target = new Vector3();

  constructor() {
    this.key = new DirectionalLight(0xffffff, 1.4);
    this.key.position.set(0.4, 1.0, 0.6);
    this.group.add(this.key);
    this.group.add(this.key.target);

    this.camLight = new DirectionalLight(0xffffff, 0.7);
    this.group.add(this.camLight);
    this.group.add(this.camLight.target);

    this.ambient = new AmbientLight(0xffffff, DEFAULT_AMBIENT);
    this.group.add(this.ambient);
  }

  /** Set the ambient light intensity (stands in for the petal shader's Ambient term). */
  setAmbient(intensity: number): void {
    this.ambient.intensity = intensity;
  }

  get ambientIntensity(): number {
    return this.ambient.intensity;
  }

  addTo(scene: Scene): void {
    scene.add(this.group);
  }

  /** Keep the camera light pointing from the camera toward the target. */
  update(camera: PerspectiveCamera, target: Vector3): void {
    this.camLight.position.copy(camera.position);
    this.camLight.target.position.copy(target);
    this._target.copy(target);
    this.key.target.position.copy(target);
  }
}
