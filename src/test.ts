import { AudioEngine } from './audio';
import { clamp } from './utility';
import {initRenderer} from './render';

type TrackItem = { name: string; url: string };

// Small playlist (replace with your tracks)
const TRACKS: TrackItem[] = [
  { name: 'Select a track...', url: '' },
  { name: 'Jazz Neon (example)', url: '/audio/jazz-neon.mp3' },
  { name: 'Downtempo Groove', url: '/audio/downtempo.mp3' },
  { name: 'Ambient Sparkle', url: '/audio/ambient-sparkle.mp3' }
];

async function main() {
  const audio = new AudioEngine();
  await audio.init();

  // UI elements
  const playBtn = document.getElementById('playPause') as HTMLButtonElement;
  const trackSelect = document.getElementById('trackSelect') as HTMLSelectElement;
  const bloomSlider = document.getElementById('bloom') as HTMLInputElement;
  const intensitySlider = document.getElementById('intensity') as HTMLInputElement;
  const arcSlider = document.getElementById('arc') as HTMLInputElement;

  // populate tracks
  TRACKS.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = t.url;
    opt.textContent = t.name;
    opt.selected = i === 0;
    trackSelect.appendChild(opt);
  });

  // init renderer / scene (render.ts)
  const renderApi = await initRenderer({
    containerId: 'app',
    initialUniforms: {
      electricIntensity: parseFloat(intensitySlider.value),
      arcFrequency: parseFloat(arcSlider.value),
      bloomStrength: parseFloat(bloomSlider.value)
    }
  });

  // wire sliders -> render uniforms and postprocessing
  bloomSlider.addEventListener('input', () => {
    const v = parseFloat(bloomSlider.value);
    renderApi.setUniform('bloomStrength', v);
  });
  intensitySlider.addEventListener('input', () => {
    const v = parseFloat(intensitySlider.value);
    renderApi.setUniform('electricIntensity', v);
  });
  arcSlider.addEventListener('input', () => {
    const v = parseFloat(arcSlider.value);
    renderApi.setUniform('arcFrequency', v);
  });

  // audio state callbacks
  audio.onPlayStateChanged = (playing) => {
    playBtn.textContent = playing ? 'Pause' : 'Play';
  };

  // track selection
  trackSelect.addEventListener('change', async () => {
    const url = trackSelect.value;
    if (!url) return;
    // stop current
    if (audio.isPlaying()) audio.pause();
    try {
      await audio.loadArrayBuffer(url);
      // auto-play when loaded
      audio.play();
    } catch (err) {
      console.error('Failed to load track', err);
    }
  });

  // play/pause button
  playBtn.addEventListener('click', () => {
    if (audio.isPlaying()) audio.pause();
    else audio.play();
  });

  // main loop: pull bands and feed render
  let last = performance.now();
  function loop(now = performance.now()) {
    const dt = (now - last) / 1000;
    last = now;

    const bands = audio.getBands(); // { bass, mid, high }

    // map bands to uniforms (with gentle clamping)
    // - mid drives primary motion/time scale
    // - bass thickens (electricIntensity)
    // - high increases sparkle (arcFrequency)
    // ensure no topology changes done here
    const midDrive = clamp(0.8 + bands.mid * 1.5, 0.5, 2.5);
    const bassThickness = clamp(parseFloat(intensitySlider.value) * (1.0 + bands.bass * 0.8), 0.0, 3.0);
    const highSparkle = clamp(parseFloat(arcSlider.value) + bands.high * 0.9, 0.0, 1.0);

    renderApi.setUniform('timeScale', midDrive);
    renderApi.setUniform('electricIntensity', bassThickness);
    renderApi.setUniform('arcFrequency', highSparkle);

    // update render with delta time and current bands for any extra logic
    renderApi.update(dt, bands);

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // handle visibility/unload
  window.addEventListener('beforeunload', () => renderApi.dispose && renderApi.dispose());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // pause audio to conserve resources
      if (audio.isPlaying()) audio.pause();
    }
  });
}

main().catch(console.error);
