import * as THREE from 'three';
export function clamp(v: number, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }

export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export class SmoothValue {
  private value = 0;
  private velocity = 0;
  public smoothing = 0.08;
  constructor(smoothing = 0.08, initial = 0) { this.smoothing = smoothing; this.value = initial; }
  update(target: number) { this.value += (target - this.value) * this.smoothing; return this.value; }
  set(v: number) { this.value = v; }
  get() { return this.value; }
}

export const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.1 },
    darkness: { value: 1.4 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    uniform vec2 resolution;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      // Aspect-corrected coord centred at 0
      vec2 position = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
      float len = length(position);
      // smooth vignette
      float vignette = smoothstep(0.8, offset * 0.5 + 0.1, len);
      vignette = mix(1.0, vignette, darkness);
      vec4 color = texture2D(tDiffuse, uv);
      // Slight color grading towards deep blue shadows
      vec3 shadowTint = vec3(0.02, 0.05, 0.12);
      color.rgb = mix(color.rgb * shadowTint, color.rgb, 0.96);
      gl_FragColor = vec4(color.rgb * vignette, color.a);
    }
  `,
};

export const noiseHelperFunctions = `
            float hash(float n) { return fract(sin(n) * 43758.5453); }
            float hash3D(vec3 p) {
                p = fract(p * 0.3183099 + 0.1);
                p *= 17.0;
                return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
            }

            float noise(vec3 x) {
                vec3 p = floor(x);
                vec3 f = fract(x);
                f = f * f * (3.0 - 2.0 * f);

                float n = p.x + p.y * 57.0 + p.z * 113.0;
                return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                           mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
                           mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                           mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
            }

            float fbm(vec3 p) {
                float value = 0.0;
                float amplitude = 0.5;
                float frequency = 1.0;
                for (int i = 0; i < 5; i++) {
                    value += amplitude * noise(p * frequency);
                    frequency *= 2.0;
                    amplitude *= 0.5;
                }
                return value;
            }
        `;


