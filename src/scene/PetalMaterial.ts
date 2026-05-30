import {
  Color,
  DoubleSide,
  ShaderMaterial,
  Texture,
  Vector3,
} from "three";
import { ColorUtils, grayscale, lerpColor } from "../engine/color/ColorUtils";
import { Mathf } from "../engine/math/Mathf";

/**
 * Custom petal material faithfully replicating Unity's fixed-function
 * "Flower/Petal 2.1" shader:
 *
 *   final = texture * (ambient + diffuse) + separateSpecular
 *
 * where `primary = ambient + diffuse` (vertex-lit in the original; per-pixel
 * here), Diffuse/Ambient material colors are white, and specular is an additive
 * Blinn-Phong term using a per-corolla `_SpecColor`.
 *
 * MeshPhong was NOT a good fit: three's physically-based BRDF divides diffuse by
 * π, so it darkened the petals far below the original (whose petal texture
 * already bakes in the lightmap/shadow). This shader has no π factor — the
 * texture shows at full brightness under ambient, with lights adding highlights.
 *
 * `petalEnv` holds the shared ambient + main-light uniforms, referenced by every
 * petal material, so updating it (e.g. from the ambient slider) affects all.
 */
export const petalEnv = {
  // Faithful to Unity CameraBehaviour: a dominant CAMERA "headlight" (lights
  // whatever faces the viewer — the near-flat, texture-dominant look) plus a
  // weaker fixed MAIN directional, over the ambient term. Intensities mirror the
  // originals (cameraLight ~0.85, mainLight ~0.6).
  // Ambient term (Material Ambient(1,1,1,1) × scene ambient). The binary scene's
  // RenderSettings ambient is gray 0.31373, but we use a slightly darker 0.25
  // for richer petal contrast.
  uAmbient: { value: 0.25 },
  uCamColor: { value: new Color(0.85, 0.85, 0.85) },
  uMainDir: { value: new Vector3(0.3, 1.0, 0.5).normalize() },
  uMainColor: { value: new Color(0.45, 0.45, 0.45) },
};

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = mat3(modelMatrix) * normal;
    vViewDirW = cameraPosition - worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float uAmbient;
  uniform vec3 uCamColor;
  uniform vec3 uMainDir;
  uniform vec3 uMainColor;
  uniform vec3 uSpecColor;
  uniform float uShininess;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vec4 texel = texture2D(map, vUv);
    vec3 tex = texel.rgb;
    float specMask = texel.a;              // lightmap gradient (bright tip → dark base)
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;          // double-sided
    vec3 V = normalize(vViewDirW);
    vec3 Lm = normalize(uMainDir);
    float ndv = max(dot(N, V), 0.0);      // camera headlight (dominant)
    float ndlm = max(dot(N, Lm), 0.0);    // main directional
    vec3 primary = vec3(uAmbient) + uCamColor * ndv + uMainColor * ndlm;
    vec3 color = tex * primary;
    // Separate specular (main-light half-vector), gated by the tip→base mask.
    vec3 H = normalize(Lm + V);
    float spec = pow(max(dot(N, H), 0.0), uShininess);
    gl_FragColor = vec4(color + uSpecColor * spec * specMask, uOpacity);
  }
`;

export function createPetalMaterial(map: Texture): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      map: { value: map },
      uAmbient: petalEnv.uAmbient, // shared refs → global ambient/light control
      uCamColor: petalEnv.uCamColor,
      uMainDir: petalEnv.uMainDir,
      uMainColor: petalEnv.uMainColor,
      uSpecColor: { value: new Color(0, 0, 0) },
      uShininess: { value: 13 }, // Unity _Shininess 0.1 ≈ exponent 13
      uOpacity: { value: 1 },
    },
  });
}

/**
 * Faithful port of `Corolla.UpdateSpecular`:
 *   avg  = clamp(lerp(c0, c1, 0.5))
 *   gray = sin((clamp01(avg.grayscale) - 1) * PI/2) + 1
 *   spec = avg * specularMultiplier * (1 - gray)
 */
export function updateSpecular(
  material: ShaderMaterial,
  c0: Color,
  c1: Color,
  specularMultiplier: number,
): void {
  const avg = ColorUtils.Clamp(lerpColor(c0, c1, 0.5));
  const gray =
    Mathf.Sin((Mathf.Clamp01(grayscale(avg)) - 1) * Mathf.PI * 0.5) + 1;
  const s = specularMultiplier * (1 - gray);
  (material.uniforms.uSpecColor.value as Color).setRGB(
    avg.r * s,
    avg.g * s,
    avg.b * s,
  );
}

/** Set the shared ambient term for all petal materials. */
export function setPetalAmbient(v: number): void {
  petalEnv.uAmbient.value = v;
}
