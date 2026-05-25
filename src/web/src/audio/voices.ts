import type { AudioEngine } from "./engine";

const FADE_SECONDS = 0.003;

interface ActiveVoice {
  source: AudioBufferSourceNode;
  fadeGain: GainNode;
}

export class VoicePlayer {
  private active: Array<ActiveVoice | null>;

  constructor(private readonly engine: AudioEngine) {
    this.active = new Array(engine.trackGains.length).fill(null);
  }

  /** Trigger voice at audioTime with velocity (0..1) and pitch (semitones). */
  trigger(voice: number, audioTime: number, velocity: number, pitchSemitones: number): void {
    const buffer = this.engine.voiceBuffer(voice);
    const { audioCtx, trackGains } = this.engine;

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
    fadeGain.gain.value = velocity;
    fadeGain.connect(trackGains[voice]);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, pitchSemitones / 12);
    source.connect(fadeGain);

    const slot: ActiveVoice = { source, fadeGain };
    source.onended = () => {
      source.disconnect();
      fadeGain.disconnect();
      if (this.active[voice] === slot) {
        this.active[voice] = null;
      }
    };

    source.start(audioTime);
    this.active[voice] = slot;
  }

  /** Preview a pool sample at velocity 1.0 / no pitch shift, mixed via master only. */
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
