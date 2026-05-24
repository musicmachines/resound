import type { Resound } from "../../wasm/resound";

export const VOICES = 8;

export interface AudioEngine {
  audioCtx: AudioContext;
  masterGain: GainNode;
  trackGains: GainNode[];
  buffers: AudioBuffer[];
}

export async function createEngine(resound: Resound): Promise<AudioEngine> {
  const audioCtx = new AudioContext();

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = resound.master_level();
  masterGain.connect(audioCtx.destination);

  const trackGains: GainNode[] = [];
  for (let v = 0; v < VOICES; v++) {
    const g = audioCtx.createGain();
    g.gain.value = resound.track_level(v);
    g.connect(masterGain);
    trackGains.push(g);
  }

  const sampleBytes: Uint8Array[] = [];
  for (let i = 0; i < resound.sample_count(); i++) {
    sampleBytes.push(resound.sample_bytes(i));
  }
  const buffers = await Promise.all(
    sampleBytes.map((bytes) => audioCtx.decodeAudioData(bytes.slice().buffer)),
  );

  return { audioCtx, masterGain, trackGains, buffers };
}
