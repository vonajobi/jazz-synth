precision highp float;
//attribute vec3 position;
//attribute vec3 normal;
//attribute vec2 uv;

uniform float time;
uniform vec2 mouse;
uniform float mouseInfluence;
uniform float electricIntensity;
uniform float arcFrequency;

varying vec3 vPosition;
varying vec3 vNormal;
varying float vIntensity;
varying float vDistFromMouse;
varying vec2 vUv;

/* Insert the noise helper functions (same as your code) */
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

void main() {
  vec3 pos = position;
  vNormal = normal;
  vUv = uv;
  float wave = sin(position.x * 2.5 + time * 1.8) * cos(position.y * 2.2 + time * 1.4) * sin(position.z * 2.0 + time * 1.1) * 0.35;
  wave += sin(position.x * 4.0 - time * 2.1) * cos(position.y * 3.5 - time * 1.6) * sin(position.z * 4.5 - time * 1.0) * 0.25;
  wave += sin(position.x * 9.0 + time * 3.5) * cos(position.y * 8.0 + time * 2.8) * sin(position.z * 10.0 + time * 4.0) * 0.1;

  float arcNoise = fbm(vec3(pos * 6.0 + time * 3.5));
  float arcEffect = 0.0;
  float arcThreshold = 0.6 + (1.0 - arcFrequency) * 0.2;
  if (arcNoise > arcThreshold) {
      float arcStrength = smoothstep(arcThreshold, arcThreshold + 0.1, arcNoise);
      arcEffect = arcStrength * arcFrequency * 2.0;
  }

  if (hash(floor(time * (10.0 + arcFrequency * 15.0)) + length(position) * 15.0) > 0.97) {
      arcEffect += hash(position.x * 10.0 + position.y * 5.0) * arcFrequency * 1.8;
  }

  vec3 viewPos = (modelViewMatrix * vec4(pos, 1.0)).xyz;
  vec2 screenPos = viewPos.xy / viewPos.z;
  vDistFromMouse = length(screenPos - mouse * vec2(1.0, -1.0));

  float rippleSpeed = 18.0;
  float rippleDecay = smoothstep(3.0, 0.0, vDistFromMouse);
  float ripple1 = sin(vDistFromMouse * 4.0 - time * rippleSpeed) * 0.7;
  float ripple2 = sin(vDistFromMouse * 8.0 - time * rippleSpeed * 1.3) * 0.4;
  float combinedRipple = (ripple1 + ripple2) * mouseInfluence * rippleDecay;

  vec3 pullDir = normalize(vec3(mouse.x, -mouse.y, 0.5) - normalize(viewPos));
  float pullStrength = mouseInfluence * rippleDecay * 0.8;
  if (mouseInfluence > 0.6 && vDistFromMouse < 0.5) {
      pullStrength += sin(time * 40.0) * 0.1 * mouseInfluence;
  }

  float generalDistortion = fbm(pos * 3.5 - time * 1.5) * 0.1;
  pos += vNormal * (wave * 0.18 * electricIntensity);
  pos += vNormal * (arcEffect * 0.45 * electricIntensity);
  pos += vNormal * (generalDistortion * electricIntensity);
  pos += vNormal * (combinedRipple * 0.8);
  pos += pullDir * pullStrength;

  vIntensity = wave * 0.5 + 0.5;
  vIntensity += arcEffect * 3.0;
  vIntensity += abs(combinedRipple) * 1.5;
  vIntensity += abs(generalDistortion) * 1.0;
  vIntensity = clamp(vIntensity, 0.0, 3.0);

  vPosition = pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
