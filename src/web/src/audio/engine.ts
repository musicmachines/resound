import type { Resound } from "../../wasm/resound";

export const NUM_VOICES = 8;

export interface AudioEngine {
  audioCtx: AudioContext;
  masterGain: GainNode;
  trackGains: GainNode[];
  /** Decoded once at boot, keyed by pool sample name. Never evicted. */
  poolBuffers: Map<string, AudioBuffer>;
  /** Look up the buffer the given voice should play right now. */
  voiceBuffer: (voice: number) => AudioBuffer;
}

export async function createEngine(resound: Resound): Promise<AudioEngine> {
  const audioCtx = new AudioContext();

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = resound.master_level();
  masterGain.connect(audioCtx.destination);

  const trackGains: GainNode[] = [];
  for (let v = 0; v < NUM_VOICES; v++) {
    const g = audioCtx.createGain();
    g.gain.value = resound.track_level(v);
    g.connect(masterGain);
    trackGains.push(g);
  }

  const names = resound.pool_sample_names() as unknown as string[];
  const decoded = await Promise.all(
    names.map(async (name) => {
      const bytes = resound.pool_sample_bytes(name);
      const buf = await audioCtx.decodeAudioData(bytes.slice().buffer);
      return [name, buf] as const;
    }),
  );
  const poolBuffers = new Map<string, AudioBuffer>(decoded);

  const voiceBuffer = (voice: number): AudioBuffer => {
    const name = resound.voice_pool_sample(voice);
    const buf = poolBuffers.get(name);
    if (!buf) throw new Error(`pool buffer not loaded for "${name}"`);
    return buf;
  };

  return { audioCtx, masterGain, trackGains, poolBuffers, voiceBuffer };
}
