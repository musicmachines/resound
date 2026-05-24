import type { AudioEngine } from "./engine";

const FADE_SECONDS = 0.003;

interface ActiveVoice {
  source: AudioBufferSourceNode;
  fadeGain: GainNode;
}

export class VoicePlayer {
  private active: Array<ActiveVoice | null>;

  constructor(private readonly engine: AudioEngine) {
    this.active = new Array(engine.buffers.length).fill(null);
  }

  trigger(voice: number, audioTime: number): void {
    const buffer = this.engine.buffers[voice];
    if (!buffer) return;
    const { audioCtx, trackGains } = this.engine;

    // Choke prior sounding source on this voice.
    const prior = this.active[voice];
    if (prior) {
      const fadeStart = Math.max(audioCtx.currentTime, audioTime - FADE_SECONDS);
      // setValueAtTime anchors the current value so the ramp has a defined start.
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
}
