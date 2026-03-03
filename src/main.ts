import { AudioEngine } from './audio';
// import { clamp } from './utility';
import { initRenderer, setUniform } from './render'; // adjust if render.ts default/export differs

async function main() {
  const audio = new AudioEngine();
  await audio.init();

  // UI elements
  const playBtn = document.getElementById('playPause') as HTMLButtonElement;
  const trackSelect = document.getElementById('track') as HTMLSelectElement;
  const bloomSlider = document.getElementById('bloom') as HTMLInputElement;
  const intensitySlider = document.getElementById('intensity') as HTMLInputElement;
  const arcSlider = document.getElementById('arc') as HTMLInputElement;

  // initialize renderer (render.ts should read audioEngine internally or expose API)
  await initRenderer(audio);

  // wire UI -> audio & renderer controls
  playBtn.addEventListener('click', async () => {
    // ensure a track is loaded before toggling play
    if (!audio.isPlaying() && !audio['buffer']) {
      const url = trackSelect.value;
      if (url) {
        try {
          await audio.loadArrayBuffer(url);
        } catch (err) {
          console.error('failed to load track', err);
          return;
        }
      }
    }

    audio.toggle();
  });

  audio.onPlayStateChanged = (playing) => {
    playBtn.textContent = playing ? 'Pause' : 'Play';
  };

  trackSelect.addEventListener('change', async () => {
    const url = trackSelect.value;
    if (!url) return;
    if (audio.isPlaying()) audio.pause();
    try {
      await audio.loadArrayBuffer(url);
      audio.play();
    } catch (err) {
      console.error('Failed to load track', err);
    }
  });

  // sliders adjust base uniforms via DOM events (render.ts reads these uniforms from DOM or you can expose setter API)
  bloomSlider.addEventListener('input', () => {
    const val = parseFloat(bloomSlider.value);
    // if render exposes setUniform: renderApi.setUniform('bloomStrength', val);
    // otherwise, set a global or dispatch an event that render.ts listens for
    setUniform('bloomStrength', val);
    // (window as any).__ELECTRIC_BLOOM = val;
  });

  intensitySlider.addEventListener('input', () => {
    const val = parseFloat(intensitySlider.value);
    setUniform('electricIntensity', val);
    // (window as any).__ELECTRIC_INTENSITY_BASE = val;
  });

  arcSlider.addEventListener('input', () => {
    const val = parseFloat(arcSlider.value);
    setUniform('arcFrequency', val);
    // (window as any).__ELECTRIC_ARC_BASE = val;
  });

  // initialize globals used by render.ts defaults
  (window as any).__ELECTRIC_BLOOM = parseFloat(bloomSlider.value);
  (window as any).__ELECTRIC_INTENSITY_BASE = parseFloat(intensitySlider.value);
  (window as any).__ELECTRIC_ARC_BASE = parseFloat(arcSlider.value);

  // keep main lightweight: render.ts uses audio.getBands() each frame to react.
  // optional: expose a simple heartbeat for other modules if needed
  console.log('Main initialized');
}

main().catch(console.error);
