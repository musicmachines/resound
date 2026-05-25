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
    this.voicePlayer = new VoicePlayer(engine, resound);
    this.clock.onTick(({ horizonStep, stepToAudioTime }) => {
      const events = this.resound.pull_events(horizonStep);
      // 2 slots per event: [voice, step_global]
      for (let i = 0; i < events.length; i += 2) {
        const voice = events[i];
        const step = events[i + 1];
        this.voicePlayer.trigger(voice, stepToAudioTime(step));
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
