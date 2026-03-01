export function clamp(v: number, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }

export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export function smoothVec(prev: Float32Array, next: number[], alpha: number) {
  for (let i = 0; i < prev.length; i++) prev[i] = lerp(prev[i], next[i], alpha);
  return prev;
}
