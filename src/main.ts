import './style.css'
import { createAudioAnalyser } from './audio'
import {createRenderer,} from "./render"
import fragSrc from "./shader.frag?raw"
import vertSrc from "./shader.vert?raw"
import { smoothVec, lerp } from './utility'

const canvas = document.querySelector('#glcanvas') as HTMLCanvasElement;
const trackSel = document.querySelector('#track') as HTMLInputElement | null;

const soloButton = document.querySelector('#solo') as HTMLButtonElement | null;
const info = document.querySelector('#info') as HTMLElement | null;

if (!canvas) throw new Error('Canvas not found');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const renderer = createRenderer(canvas, vertSrc, fragSrc);

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext);
let audioSourceNode: MediaStreamAudioSourceNode  | MediaElementAudioSourceNode | null = null;
let audioProc: {analyzer: AnalyserNode; getFeatures: ()=> any} | null = null;

// features & smoothing
let bands = new Float32Array([0,0,0]);
let centroid = 0;
let onset = 0;
let soloMid = false;

// ripple handling
let mouseVec: [number, number, number] = [0.5, 0.5, 0.0];
type NoteEvent = { x: number; y: number; energy: number; age: number; life: number; hue: number; vx: number; vy: number };
const MAX_EVENTS = 6;
const events: NoteEvent[] = [];

function spawnEvent(x: number, y:number, energy = 1, hue = 0.5){
  if (events.length >= MAX_EVENTS) {
    // replace oldest
    let idx = 0;
    let maxAge = -1;
    for (let i = 0; i < events.length; i++) if (events[i].age > maxAge) { maxAge = events[i].age; idx = i; }
    events[idx] = { x, y, energy, age: 0, life: 1.0, hue, vx: 0, vy: 0 };
  } else {
    events.push({ x, y, energy, age: 0, life: 1.0, hue, vx: 0, vy: 0 });
  }
}

if (trackSel) {
  trackSel.addEventListener('change', () => {
    const url = trackSel.value;
    playTrack(url).catch(console.error);
  });
  // auto-play initial selection
  if (trackSel.value) playTrack(trackSel.value).catch(console.error);
}
// play track helper
async function playTrack(url: string) {
  const audioEl = new Audio(url);
  audioEl.loop = true;
  audioEl.autoplay = true;
  audioEl.crossOrigin = 'anonymous';
  audioEl.volume = 0.7;
  // ensure element is in DOM for some browsers to play reliably
  audioEl.style.display = 'none';
  document.body.appendChild(audioEl);
  if (audioSourceNode) try { audioSourceNode.disconnect(); } catch {}
  audioSourceNode = audioCtx.createMediaElementSource(audioEl);
  audioProc = await createAudioAnalyser(audioCtx, audioSourceNode);
  if (audioCtx.state === 'suspended') await audioCtx.resume();
}

if (soloButton) {
  soloButton.addEventListener('click', () => {
    soloMid = !soloMid;
    if (info) info.textContent = soloMid ? 'Solo MID ON' : 'Solo MID OFF';
  });
}
// pointer interactions: short tap spawn event, drag creates continuous event
let pointerDown = false;
let pointerStart = 0;
let lastPointer: { x: number; y: number } | null = null;

canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = 1 - (e.clientY - r.top) / r.height;
  pointerDown = true;
  pointerStart = performance.now();
  lastPointer = { x, y };
  mouseVec = [x, y, 1];
  // spawn gentle immediate event
  spawnEvent(x, y, 0.9, centroid);
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = 1 - (e.clientY - r.top) / r.height;
  mouseVec = [x, y, pointerDown ? 1 : 0];
  if (pointerDown) {
    // while dragging, spawn small trailing events
    if (!lastPointer || Math.hypot(x - lastPointer.x, y - lastPointer.y) > 0.02) {
      spawnEvent(x, y, 0.6, centroid);
      lastPointer = { x, y };
    }
  }
});
canvas.addEventListener('pointerup', (e) => {
  pointerDown = false;
  mouseVec[2] = 0;
  const dur = performance.now() - pointerStart;
  if (dur > 600) {
    // long press toggles solo
    soloMid = !soloMid;
    if (info) info.textContent = soloMid ? 'Solo MID ON' : 'Solo MID OFF';
  } else {
    // short tap: stronger event (already spawned on down) — give a pulse
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = 1 - (e.clientY - r.top) / r.height;
    spawnEvent(x, y, 1.6, centroid);
    // optional: small audio blip via oscillator
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = 440 + centroid * 600;
      g.gain.value = 0.01;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
      o.stop(audioCtx.currentTime + 0.15);
    } catch {}
  }
});

//reder loop
function smoothScalar(prev: number, next: number, alpha: number) {
  return prev + (next - prev) * alpha;
}
function computeOnsetImpulse(flux: number, threshold = 0.01) {
  return flux > threshold ? Math.min(1, flux * 10) : 0;
}

// main render loop
function frame(t: number) {
  if (audioProc) {
    const features = audioProc.getFeatures();
    // smooth bands
    smoothVec(bands, [features.bass, features.mid * (soloMid ? 1.5 : 1.0), features.high], 0.08);
    centroid = smoothScalar(centroid, features.centroid, 0.06);
    onset = computeOnsetImpulse(features.flux);
  } else {
    // gently decay when no audio
    bands[0] = lerp(bands[0], 0, 0.02);
    bands[1] = lerp(bands[1], 0, 0.02);
    bands[2] = lerp(bands[2], 0, 0.02);
    onset = lerp(onset, 0, 0.08);
  }
  // update events
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    ev.age += 1 / 60;
    ev.energy = ev.energy * 0.96;
    if (ev.age > ev.life) events.splice(i, 1);
    // simple drift
    ev.x += ev.vx * 0.01;
    ev.y += ev.vy * 0.01;
  }
  // pack events into arrays for uniforms (fixed length)
  const evPos = new Float32Array(MAX_EVENTS * 3); // x,y,age
  const evMeta = new Float32Array(MAX_EVENTS * 2); // energy, hue
  for (let i = 0; i < MAX_EVENTS; i++) {
    if (i < events.length) {
      const e = events[i];
      evPos[i * 3 + 0] = e.x;
      evPos[i * 3 + 1] = e.y;
      evPos[i * 3 + 2] = e.age / e.life;
      evMeta[i * 2 + 0] = e.energy;
      evMeta[i * 2 + 1] = e.hue;
    } else {
      evPos[i * 3 + 0] = -1;
      evPos[i * 3 + 1] = -1;
      evPos[i * 3 + 2] = 0;
      evMeta[i * 2 + 0] = 0;
      evMeta[i * 2 + 1] = 0;
    }
  }

  renderer.setUniforms({
    u_time: t / 1000,
    u_resolution: [canvas.width, canvas.height],
    u_bands: [bands[0], bands[1], bands[2]],
    u_centroid: centroid,
    u_onset: onset,
    u_mouse: mouseVec,
    u_eventPos: Array.from(evPos),
    u_eventMeta: Array.from(evMeta),
    u_eventCount: events.length
  });
  renderer.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
