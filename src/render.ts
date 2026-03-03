import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SmoothValue, clamp } from './utility';
import { AudioEngine } from './audio';
import type { Bands } from './audio';

// Vite raw imports for GLSL files
import vertText from './shader.vert?raw';
import fragText from './shader.frag?raw';

const canvas = document.getElementById('glcanvas') as HTMLCanvasElement;

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let chromaPass: ShaderPass;

let electricMaterial: THREE.ShaderMaterial;
let particlePoints: THREE.Points;
let electricMesh: THREE.LineSegments;

let mouse = new THREE.Vector2(0, 0);
let mouseInfluenceSmooth = new SmoothValue(0.12, 0);
let timeStart = performance.now();
let audioEngine: AudioEngine;

const uniformsBase = {
  time: { value: 0 },
  mouse: { value: new THREE.Vector2() },
  mouseInfluence: { value: 0 },
  electricIntensity: { value: 1.0 },
  arcFrequency: { value: 0.4 },
  glowStrength: { value: 1.0 },
  uColor1: { value: new THREE.Color(0x6af5ff) },
  uColor2: { value: new THREE.Color(0x4bd0ff) },
  uColor3: { value: new THREE.Color(0x9048ff) },
  uColor4: { value: new THREE.Color(0xff6ef5) },
  uColor5: { value: new THREE.Color(0xffd36a) },
  uColor6: { value: new THREE.Color(0xffffff) },
  uColor7: { value: new THREE.Color(0xffb7ff) },
  uColor8: { value: new THREE.Color(0x99ccff) }
};
export function setUniform(name: any, value:any){
    const u = (uniformsBase as any)[name];
    if (u && 'value' in u) u.value = value;
    else if (u !== undefined) (uniformsBase as any)[name] = value;
    else throw new Error('Uniform not found: ' + name);

    if (electricMaterial && (electricMaterial.uniforms as any)[name])
      (electricMaterial.uniforms as any)[name].value = value;
    if (particlePoints && (particlePoints.material as THREE.ShaderMaterial).uniforms[name])
      (particlePoints.material as THREE.ShaderMaterial).uniforms[name].value = value;
}

export async function initRenderer(audio: AudioEngine) {
  audioEngine = audio;
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 6);

  function buildLorenzGeometry() {
    const points: THREE.Vector3[] = [];
    const dt = 0.01;
    const iterations = 10000;

    let sigma = 10.0;
    let rho = 28.0;
    let beta = 8.0 / 3.0;

    let x = 0.1;
    let y = 0.0;
    let z = 0.0;

    for (let i = 0; i < iterations; i++) {
      const dx = sigma * (y - x);
      const dy = x * (rho - z) - y;
      const dz = x * y - beta * z;

      x += dx * dt;
      y += dy * dt;
      z += dz * dt;

      if (i % 3 === 0) {
        points.push(new THREE.Vector3(x * 0.08, y * 0.08, z * 0.08));
      }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const positions = geometry.attributes.position.array as Float32Array;

    const wireframePositions: number[] = [];

    for (let i = 0; i < positions.length - 3; i += 3) {
      wireframePositions.push(
        positions[i], positions[i + 1], positions[i + 2],
        positions[i + 3], positions[i + 4], positions[i + 5]
      );
    }

    const wireframeGeometry = new THREE.BufferGeometry();
    wireframeGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(wireframePositions, 3)
    );

    const normals = new Float32Array(wireframePositions.length);
    const tmp = new THREE.Vector3();

    for (let i = 0; i < wireframePositions.length; i += 3) {
      tmp
        .set(
          wireframePositions[i],
          wireframePositions[i + 1],
          wireframePositions[i + 2]
        )
        .normalize();

      normals[i] = tmp.x;
      normals[i + 1] = tmp.y;
      normals[i + 2] = tmp.z;
    }

    wireframeGeometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(normals, 3)
    );

    const uvs = new Float32Array((wireframePositions.length / 3) * 2);
    for (let i = 0; i < wireframePositions.length / 3; i++) {
      uvs[i * 2] = i / (wireframePositions.length / 3);
      uvs[i * 2 + 1] = 0.5;
    }

    wireframeGeometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(uvs, 2)
    );

    return wireframeGeometry;
  }

  const wireGeom = buildLorenzGeometry();
  const clonedUniforms = THREE.UniformsUtils.clone(uniformsBase as any);

  electricMaterial = new THREE.ShaderMaterial({
    uniforms: clonedUniforms,
    vertexShader: vertText,
    fragmentShader: fragText,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  electricMesh = new THREE.LineSegments(wireGeom, electricMaterial);
  scene.add(electricMesh);

  async function createParticles() {
    const particleCount = 800;
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const offsets = new Float32Array(particleCount);
    const speeds = new Float32Array(particleCount);
    const particleTypes = new Float32Array(particleCount);

    const radius = 2.5;

    for (let i = 0; i < particleCount; i++) {
      const dist = radius + (Math.random() - 0.5) * 0.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = dist * Math.cos(phi);

      sizes[i] = 0.02 + Math.random() * 0.06;
      offsets[i] = Math.random() * 100;
      speeds[i] = 0.4 + Math.random() * 1.2;
      particleTypes[i] = Math.floor(Math.random() * 4);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
    geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('particleType', new THREE.BufferAttribute(particleTypes, 1));

    const pMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        arcFrequency: { value: uniformsBase.arcFrequency.value },
        electricIntensity: { value: uniformsBase.electricIntensity.value },
        uColor3: { value: uniformsBase.uColor3.value },
        uColor4: { value: uniformsBase.uColor4.value },
        uColor5: { value: uniformsBase.uColor5.value },
        uColor6: { value: uniformsBase.uColor6.value }
      },
      vertexShader: `
        precision highp float;
        //attribute vec3 position;
        attribute float size;
        uniform float time;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 100.0;
        }
      `,
      fragmentShader: `
        precision highp float;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          if (length(c) > 0.5) discard;
          gl_FragColor = vec4(1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });

    particlePoints = new THREE.Points(geometry, pMat);
    particlePoints.frustumCulled = false;
    scene.add(particlePoints);
  }

  await createParticles();

  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.0,
    0.4,
    0.85
  );
  composer.addPass(bloomPass);

  const chromaShader = {
    uniforms: {
      tDiffuse: { value: null },
      amount: { value: 0.002 },
      time: { value: 0 }
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
      uniform float amount;
      uniform float time;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        vec2 d = normalize(c + 0.0001);
        vec2 o = d * amount;
        float r = texture2D(tDiffuse, vUv + o).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv - o).b;
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `
  };

  chromaPass = new ShaderPass(chromaShader as any);
  composer.addPass(chromaPass);

  window.addEventListener('resize', onResize);

  window.addEventListener('mousemove', (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.set(nx, ny);
    mouseInfluenceSmooth.update(1.0);
  });

  window.addEventListener('pointerdown', () => mouseInfluenceSmooth.set(1.2));
  window.addEventListener('pointerup', () => mouseInfluenceSmooth.set(0.0));

  animate();
}

function onResize() {
  // adapt canvas size to window dimensions
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

let lastBands: Bands = { bass: 0, mid: 0, high: 0 };

const bassSmooth = new SmoothValue(0.06, 0);
const midSmooth = new SmoothValue(0.08, 0);
const highSmooth = new SmoothValue(0.12, 0);

function animate() {
  requestAnimationFrame(animate);

  const now = (performance.now() - timeStart) * 0.001;

  const bands = audioEngine.getBands();
  lastBands = bands;

  const bass = bassSmooth.update(bands.bass);
  const mid = midSmooth.update(bands.mid);
  const high = highSmooth.update(bands.high);

  const timeScale = 1.0 + mid * 1.8;
  electricMaterial.uniforms.time.value = now * timeScale;

  electricMaterial.uniforms.arcFrequency.value =
    clamp(0.05 + high * 0.6, 0.0, 1.0);

  const intensity = clamp(0.6 + bass * 1.2, 0.0, 2.0);
  electricMaterial.uniforms.electricIntensity.value = intensity;
  electricMaterial.uniforms.glowStrength.value = 0.6 + mid * 1.2;

  (particlePoints.material as THREE.ShaderMaterial).uniforms.time.value =
    now * (1.0 + mid * 0.6);

  (particlePoints.material as THREE.ShaderMaterial).uniforms.electricIntensity.value =
    intensity;

  (particlePoints.material as THREE.ShaderMaterial).uniforms.arcFrequency.value =
    electricMaterial.uniforms.arcFrequency.value;

  const mi = mouseInfluenceSmooth.update(0);
  const mouseInfluence = clamp(mi, 0, 1.5);

  electricMaterial.uniforms.mouseInfluence.value = mouseInfluence;
  electricMaterial.uniforms.mouse.value.set(mouse.x, mouse.y);

  bloomPass.strength = 0.8 + mid * 1.6 + high * 0.4;
  bloomPass.radius = 0.35 + mid * 0.25;
  bloomPass.threshold = 0.75 - mid * 0.3;

  chromaPass.uniforms.time.value = now;
  chromaPass.uniforms.amount.value = 0.0015 + high * 0.004;

  composer.render();
}
