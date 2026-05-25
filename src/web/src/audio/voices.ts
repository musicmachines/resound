import type { Resound } from "../../wasm/resound";
import type { AudioEngine } from "./engine";

const FADE_SECONDS = 0.003;

interface ActiveVoice {
  source: AudioBufferSourceNode;
  fadeGain: GainNode;
}

export class VoicePlayer {
  private active: Array<ActiveVoice | null>;

  constructor(
    private readonly engine: AudioEngine,
    private readonly resound: Resound,
  ) {
    this.active = new Array(engine.trackGains.length).fill(null);
  }

  /**
   * Trigger voice at audioTime. Per-track tuning is read from Rust at the
   * call site; per-step velocity/pitch don't exist in v4 — gain is 1.0
   * pre-track-fader.
   */
  trigger(voice: number, audioTime: number): void {
    const buffer = this.engine.voiceBuffer(voice);
    const { audioCtx, trackGains } = this.engine;
    const tuning = this.resound.track_tuning(voice);

    const prior = this.active[voice];
    if (prior) {
      const fadeStart = Math.max(audioCtx.currentTime, audioTime - FADE_SECONDS);
      prior.fadeGain.gain.setValueAtTime(prior.fadeGain.gain.value, fadeStart);
      prior.fadeGain.gain.linearRampToValueAtTime(0, audioTime);
      try {
        prior.source.stop(audioTime);
      } catch {
        // already stopped — ignore
      }
    }

    const fadeGain = audioCtx.createGain();
    fadeGain.gain.value = 1;
    fadeGain.connect(trackGains[voice]);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, tuning / 12);
    source.connect(fadeGain);

    const slot: ActiveVoice = { source, fadeGain };
    source.onended = () => {
      source.disconnect();
      fadeGain.disconnect();
      if (this.active[voice] === slot) this.active[voice] = null;
    };

    source.start(audioTime);
    this.active[voice] = slot;
  }

  /** Preview a pool sample at unity gain, no tuning. */
  previewByName(name: string, audioTime: number): void {
    const buffer = this.engine.poolBuffers.get(name);
    if (!buffer) return;
    const { audioCtx, masterGain } = this.engine;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);
    source.onended = () => source.disconnect();
    source.start(audioTime);
  }
}
