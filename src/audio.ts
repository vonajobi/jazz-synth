export async function createAudioAnalyser(ctx: AudioContext, sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode) {
  const analyzer = ctx.createAnalyser();
  analyzer.fftSize = 2048;
  sourceNode.connect(analyzer);
  const binCount = analyzer.frequencyBinCount;
  const freqData = new Float32Array(binCount);
  let prevMag = new Float32Array(binCount);

  function getFeatures() {
    analyzer.getFloatFrequencyData(freqData); // dB
    // convert dB to linear
    const mags = new Float32Array(binCount);
    for (let i=0;i<binCount;i++) mags[i] = Math.pow(10, freqData[i]/20);

    // band ranges -> indices
    const sampleRate = ctx.sampleRate;
    const nyquist = sampleRate / 2;
    // const freqForBin = (i:number) => i * (nyquist / binCount);

    // compute sums
    let bass=0, mid=0, high=0, sumMag=0, weightedSum=0;
    for (let i=0;i<binCount;i++){
      const f = i * nyquist / binCount;
      const m = mags[i];
      sumMag += m;
      weightedSum += f * m;
      if (f >= 20 && f < 250) bass += m;
      else if (f >= 250 && f < 2000) mid += m;
      else if (f >= 2000 && f < 12000) high += m;
    }
    const centroid = sumMag>0 ? weightedSum / sumMag / nyquist : 0;

    // spectral flux (onset)
    let flux=0;
    for (let i=0;i<binCount;i++){
      const diff = mags[i] - prevMag[i];
      flux += Math.max(0, diff);
      prevMag[i] = mags[i];
    }
    // normalize band energies (simple)
    const total = bass+mid+high + 1e-9;
    return { bass: bass/total, mid: mid/total, high: high/total, centroid, flux };
  }

  return { analyzer, getFeatures };
}
