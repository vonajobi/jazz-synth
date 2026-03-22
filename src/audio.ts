import { SmoothValue, clamp } from './utility';

export type Bands = { bass: number; mid: number; high: number; };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private dataArray: Uint8Array | null = null;
  private buffer: AudioBuffer | null = null;
  private playing = false;
  private bassSmooth = new SmoothValue(0.1, 0);
  private midSmooth = new SmoothValue(0.12, 0);
  private highSmooth = new SmoothValue(0.15, 0);

  public onPlayStateChanged: ((playing: boolean) => void) | null = null;

  async init() {
    if (!this.ctx) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  async loadArrayBuffer(url: string) {
    await this.init();
    if (!this.ctx) throw new Error('AudioContext not initialized');
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(ab);
  }

  async play() {
    if (!this.ctx || !this.buffer) return;
    if (this.playing) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1.0;

    this.source.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.source.start(0);
    this.playing = true;
    this.source.onended = () => { this.playing = false; this.onPlayStateChanged?.(false); };
    this.onPlayStateChanged?.(true);
  }

  pause() {
    if (!this.playing) return;
    this.source?.stop();
    this.source = null;
    this.playing = false;
    this.onPlayStateChanged?.(false);
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  isPlaying() { return this.playing; }

  getBands(): Bands {
  if (!this.playing) {
    // When not playing, return the current smoothed values to prevent graphics from resetting
    return {
      bass: clamp(this.bassSmooth.get(), 0, 1),
      mid: clamp(this.midSmooth.get(), 0, 1),
      high: clamp(this.highSmooth.get(), 0, 1)
    };
  }
  if (!this.analyser || !this.dataArray) return { bass: 0, mid: 0, high: 0 };
  this.analyser.getByteFrequencyData(this.dataArray as Uint8Array<ArrayBuffer>);
  const data = this.dataArray;
  const n = data.length;
  // map bins to frequency bands roughly
  const bassBins = [2, Math.floor(n * 0.08)]; // up to ~200Hz
  const midBins = [Math.floor(n * 0.08) + 1, Math.floor(n * 0.5)]; // ~200Hz - 3kHz
  const highBins = [Math.floor(n * 0.5) + 1, n - 1]; // upper
  function avg(range: number[]) {
    let sum = 0, count = 0;
    for (let i = range[0]; i <= range[1]; i++) { sum += data[i]; count++; }
    return count ? sum / count / 255 : 0;
  }
  const rawBass = avg(bassBins);
  const rawMid = avg(midBins);
  const rawHigh = avg(highBins);
  const bass = this.bassSmooth.update(rawBass);
  const mid = this.midSmooth.update(rawMid);
  const high = this.highSmooth.update(rawHigh);
  return { bass: clamp(bass, 0, 1), mid: clamp(mid, 0, 1), high: clamp(high, 0, 1) };
  }
}

