import type { Resound } from "../../wasm/resound";

export interface ClockTick {
  horizonStep: number;
  stepToAudioTime: (step: number) => number;
}

export interface ClockSource {
  start(audioCtx: AudioContext): void;
  stop(): void;
  onTick(handler: (tick: ClockTick) => void): void;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

// One sixteenth note = 60 / bpm / 4 seconds.
function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

export class InternalClock implements ClockSource {
  private audioCtx: AudioContext | null = null;
  private transportStartTime = 0;
  private nextScheduledStep = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private handler: ((tick: ClockTick) => void) | null = null;

  constructor(private readonly resound: Resound) {}

  onTick(handler: (tick: ClockTick) => void): void {
    this.handler = handler;
  }

  start(audioCtx: AudioContext): void {
    this.audioCtx = audioCtx;
    this.transportStartTime = audioCtx.currentTime;
    this.nextScheduledStep = 0;
    this.tick();
    this.intervalId = setInterval(() => this.tick(), LOOKAHEAD_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.audioCtx = null;
  }

  // Update BPM and re-anchor transportStartTime so the next unscheduled step
  // still lands at the audio time it would have under the old BPM. Already-
  // scheduled events fire at their committed times per spec §9.
  setBpm(newBpm: number): void {
    if (!this.audioCtx) {
      this.resound.set_bpm(newBpm);
      return;
    }
    const oldDt = stepDuration(this.resound.bpm());
    const nextStepOldTime = this.transportStartTime + this.nextScheduledStep * oldDt;
    this.resound.set_bpm(newBpm);
    const newDt = stepDuration(this.resound.bpm());
    this.transportStartTime = nextStepOldTime - this.nextScheduledStep * newDt;
  }

  private tick(): void {
    if (!this.audioCtx || !this.handler) return;
    const bpm = this.resound.bpm();
    const dt = stepDuration(bpm);
    const deadline = this.audioCtx.currentTime + SCHEDULE_AHEAD;
    const elapsed = deadline - this.transportStartTime;
    const horizonStep = Math.max(0, Math.floor(elapsed / dt) + 1);

    if (horizonStep <= this.nextScheduledStep) return;

    const transportStart = this.transportStartTime;
    const tick: ClockTick = {
      horizonStep,
      stepToAudioTime: (step: number) => transportStart + step * dt,
    };
    this.handler(tick);
    this.nextScheduledStep = horizonStep;
  }
}
