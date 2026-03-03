precision highp float;
uniform float time;
uniform float mouseInfluence;
uniform float electricIntensity;
uniform float glowStrength;
uniform float arcFrequency;

uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;
uniform vec3 uColor6;
uniform vec3 uColor7;
uniform vec3 uColor8;

varying vec3 vPosition;
varying vec3 vNormal;
varying float vIntensity;
varying float vDistFromMouse;
varying vec2 vUv;

/* Insert noise helpers (same as vert) */
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
float t1 = sin(time * 0.8 + vUv.x * 5.0) * 0.5 + 0.5;
float t2 = cos(time * 0.6 - vUv.y * 6.0) * 0.5 + 0.5;
float t3 = sin(time * 1.5 + length(vPosition) * 2.0) * 0.5 + 0.5;
float noisePattern = fbm(vPosition * 3.5 + vec3(time * 0.8, -time * 0.5, time * 1.1));
float energyFlow = fbm(vPosition * 2.5 - vec3(time * 2.2, -time * 1.2, time * 1.8));

float slowPulse = sin(time * 2.5 + vPosition.x * 2.0) * 0.5 + 0.5;
float fastPulse = sin(time * 18.0 + vPosition.y * 5.0) * 0.5 + 0.5;

float arcSpeed1 = 10.0 + arcFrequency * 5.0;
float arcTravel1 = sin(vPosition.x * 15.0 + vPosition.y * 10.0 + time * arcSpeed1);
float arcTravel2 = cos(vPosition.y * 9.0 - vPosition.z * 12.0 - time * arcSpeed1 * 0.8);
float arcTravel3 = sin(vPosition.z * 11.0 + vPosition.x * 13.0 + time * arcSpeed1 * 1.2);

float arc1 = smoothstep(0.75, 0.9, arcTravel1) * smoothstep(0.9, 0.75, arcTravel1);
float arc2 = smoothstep(0.7, 0.85, arcTravel2) * smoothstep(0.85, 0.7, arcTravel2);
float arc3 = smoothstep(0.8, 0.95, arcTravel3) * smoothstep(0.95, 0.8, arcTravel3);
float arc = max(max(arc1, arc2), arc3);
arc = pow(arc, 1.5);
arc *= electricIntensity * (1.0 + arcFrequency);

float nodeEffect = 0.0;
vec3 normPos = normalize(vPosition);
float closenessToAxes = pow(abs(normPos.x * normPos.y * normPos.z), 0.1);
if (closenessToAxes < 0.8 && hash3D(floor(vPosition * 8.0)) > 0.7) {
    float nodePulse = sin(time * 6.0 + hash(length(vPosition)) * 15.0) * 0.5 + 0.5;
    nodeEffect = nodePulse * arcFrequency * 0.8 * smoothstep(0.8, 0.7, closenessToAxes);
}
float spark = 0.0;
float sparkThreshold = 0.98 - arcFrequency * 0.1;
if (hash(floor(time * (25.0 + arcFrequency * 20.0)) + vPosition.x * 18.0 + vPosition.y * 9.0) > sparkThreshold) {
    spark = (0.8 + hash(vPosition.z + time) * 0.2) * electricIntensity;
    spark = pow(spark, 2.0);
}
vec3 baseColor = mix(uColor1, uColor2, noisePattern * 0.6 + 0.4);
baseColor = mix(baseColor, uColor3, t1 * 0.6);
baseColor = mix(baseColor, uColor4, energyFlow * 0.4 * electricIntensity * slowPulse);
baseColor = mix(baseColor, uColor8, sin(vPosition.z * 5.0 - time * 1.5) * 0.1 * t2);

float arcWidth = 0.6 + sin(time * 4.0 + vPosition.x * 6.0) * 0.4;
vec3 arcColor = mix(uColor4, uColor5, arcWidth * t2);
arcColor = mix(arcColor, uColor6, arc * t3 * 0.8);
vec3 finalColor = mix(baseColor, arcColor, arc * arcWidth);

vec3 nodeColor = mix(uColor6, uColor7, fastPulse);
finalColor = mix(finalColor, nodeColor, nodeEffect);
finalColor = mix(finalColor, uColor7, nodeEffect * fastPulse * 0.6);

vec3 sparkColor = mix(uColor6, uColor7, hash(vPosition.y + time) * 0.8 + 0.2);
finalColor = mix(finalColor, sparkColor, spark);

float highlight = smoothstep(0.6, 1.5, vIntensity);
finalColor = mix(finalColor, uColor4, highlight * 0.4 * (1.0 - arc));
finalColor = mix(finalColor, uColor5, highlight * 0.2 * arc);

float mouseEffect = smoothstep(0.8, 0.1, vDistFromMouse) * mouseInfluence;
if (mouseEffect > 0.1) {
    float dischargeNoise = hash(vPosition.x * 10.0 + vPosition.y * 10.0 + floor(time * (30.0 + mouseInfluence * 20.0)));
    float dischargeThreshold = 0.6 - mouseInfluence * 0.3;
    if (dischargeNoise > dischargeThreshold) {
        float dischargeStrength = pow((dischargeNoise - dischargeThreshold) / (1.0 - dischargeThreshold), 2.0);
        vec3 dischargeColor = mix(uColor5, uColor7, dischargeStrength);
        finalColor = mix(finalColor, dischargeColor, dischargeStrength * mouseEffect * 1.5);
    }
    finalColor = mix(finalColor, uColor8, mouseEffect * 0.3 * t3);
}

float edgeFactor = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.5);
vec3 edgeColor = mix(uColor3, uColor5, t2 * slowPulse);
edgeColor = mix(edgeColor, uColor6, edgeFactor * 0.4);
finalColor += edgeColor * edgeFactor * electricIntensity * 0.8;

float flicker = 0.9 + 0.1 * hash(vPosition.x * 20.0 + floor(time * (35.0 + arcFrequency * 15.0)));
flicker *= 0.96 + 0.04 * sin(time * 80.0 + vPosition.y * 40.0);
finalColor *= flicker;

float glow = pow(vIntensity * (mouseEffect * 0.6 + 0.4), 2.0) * glowStrength;
glow = clamp(glow * 1.0, 0.0, 1.0);
finalColor += mix(uColor4, uColor5, t3) * glow * 0.4;
finalColor += uColor6 * glow * 0.25 * fastPulse;

finalColor *= (0.7 + electricIntensity * 0.5);

gl_FragColor = vec4(finalColor, 1.0);
}
