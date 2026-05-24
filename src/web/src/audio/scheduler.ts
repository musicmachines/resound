import type { Resound } from "../../wasm/resound";
import type { AudioEngine } from "./engine";
import type { ClockSource } from "./clock";
import { triggerVoice } from "./voices";

export class Scheduler {
  constructor(
    private readonly resound: Resound,
    private readonly engine: AudioEngine,
    private readonly clock: ClockSource,
  ) {
    this.clock.onTick(({ horizonStep, stepToAudioTime }) => {
      const events = this.resound.pull_events(horizonStep);
      for (let i = 0; i < events.length; i += 2) {
        const voice = events[i];
        const step = events[i + 1];
        triggerVoice(this.engine, voice, stepToAudioTime(step));
      }
    });
  }

  start(): void {
    this.clock.start(this.engine.audioCtx);
  }

  stop(): void {
    this.clock.stop();
  }
}
