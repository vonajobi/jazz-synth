#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_bands;
uniform float u_centroid;
uniform float u_onset;
uniform vec3 u_mouse;

// event arrays
uniform vec3 u_eventPos[6]; // x,y,age
uniform vec2 u_eventMeta[6]; // energy, hue
uniform int u_eventCount;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0));
  float d = hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}

vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.x + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main(){
  vec2 uv = v_uv;
  vec2 p = (uv * 2.0 - 1.0);
  p.x *= u_resolution.x / u_resolution.y;

  float hue = mix(210.0/360.0, 40.0/360.0, clamp(u_centroid, 0.0, 1.0));
  float saturation = 0.6;
  float lightness = 0.12 + 0.25 * u_bands.x;

  float n = noise(uv * 4.0 + u_time * 0.03) * 0.6;
  vec3 color = hsv2rgb(vec3(hue, saturation, clamp(lightness + n * 0.06, 0.0, 1.0)));

  float bass = u_bands.x;
  vec2 center = vec2(0.0, -0.2);
  float d = length(p - center);
  float pulse = smoothstep(0.6, 0.0, d - 0.6 * bass * 0.8);
  color += vec3(1.0, 0.7, 0.45) * pulse * (0.5 + bass);

  float mid = u_bands.y;
  float t = u_time * 0.6;
  float freq = 1.8 + mid * 3.0;
  float amp = 0.15 + mid * 0.4;
  float y = sin((uv.x + t * 0.12) * freq * 2.0) * amp + 0.0;
  float distToRibbon = abs(uv.y - (0.5 + y));
  float ribbon = smoothstep(0.12, 0.0, distToRibbon) * (0.5 + mid * 1.5);
  color += vec3(0.9, 0.6, 0.85) * ribbon;

  // pointer ripple (keep small)
  vec2 ripplePos = u_mouse.xy;
  float pressed = u_mouse.z;
  float ripple = 0.0;
  if (pressed > 0.5) {
    vec2 rp = (ripplePos * 2.0 - 1.0);
    rp.x *= u_resolution.x / u_resolution.y;
    float rd = length(p - rp);
    ripple += smoothstep(0.4, 0.0, rd - sin(u_time * 8.0) * 0.01) * 0.6;
  }

  // event-driven local effects
  for (int i = 0; i < 6; i++) {
    if (i >= u_eventCount) break;
    vec3 ev = u_eventPos[i];
    vec2 meta = u_eventMeta[i];
    vec2 evp = (ev.xy * 2.0 - 1.0);
    evp.x *= u_resolution.x / u_resolution.y;
    float age = ev.z; // 0..1
    float energy = meta.x;
    float ehue = meta.y;
    float ed = length(p - evp);
    // displacement pulse
    float edg = smoothstep(0.02, 0.0, abs(ed - (1.0 - age) * 0.6)) * energy * (1.0 - age);
    ripple += edg * 1.2;
    // colored bloom near event
    float glow = smoothstep(0.35, 0.0, ed) * energy * (1.0 - age) * 1.6;
    vec3 accent = hsv2rgb(vec3(ehue, 0.7, 0.9));
    color += accent * glow;
    // small local ribbon seed
    float seed = smoothstep(0.2, 0.0, ed) * energy * (1.0 - age);
    color += vec3(1.0, 0.8, 0.6) * seed * 0.6;
  }

  color += vec3(0.6,0.9,1.0) * ripple * 0.6;

  float high = u_bands.z;
  float sp = pow(noise(uv * 80.0 + u_time * 6.0), 6.0) * high * 1.6;
  color += vec3(1.0, 0.8, 0.6) * sp;

  float vig = smoothstep(1.0, 0.3, length(p) );
  color *= mix(1.0, 0.6, vig);
  float grain = (hash(gl_FragCoord.xy) - 0.5) * 0.03;
  color += grain;

  outColor = vec4(color, 1.0);
}
