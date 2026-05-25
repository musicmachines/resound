import type { Resound } from "../../wasm/resound";
import type { AudioEngine } from "./engine";
import type { ClockSource } from "./clock";
import { VoicePlayer } from "./voices";

export class Scheduler {
  readonly voicePlayer: VoicePlayer;

  constructor(
    private readonly resound: Resound,
    engine: AudioEngine,
    private readonly clock: ClockSource,
  ) {
    this.voicePlayer = new VoicePlayer(engine);
    this.clock.onTick(({ horizonStep, stepToAudioTime }) => {
      const events = this.resound.pull_events(horizonStep);
      // 4 slots per event: [voice, step_global, velocity_q, pitch_q]
      for (let i = 0; i < events.length; i += 4) {
        const voice = events[i];
        const step = events[i + 1];
        const velocity = events[i + 2] / 127;
        const pitch = events[i + 3] / 100 - 24;
        this.voicePlayer.trigger(voice, stepToAudioTime(step), velocity, pitch);
      }
    });
  }

  start(audioCtx: AudioContext): void {
    this.clock.start(audioCtx);
  }

  stop(): void {
    this.clock.stop();
  }
}
