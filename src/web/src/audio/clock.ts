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

function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

/**
 * Convert a global step index to audio time given a per-pair swing factor.
 *
 * Swing delays every second 16th note (odd-indexed within a pair):
 *   pairIdx       = floor(step/2)
 *   pairStart     = startTime + pairIdx * 2 * stepDur
 *   even-in-pair  -> pairStart
 *   odd-in-pair   -> pairStart + 2 * stepDur * swing
 *
 * swing=0.5 collapses to v1's straight schedule (odd lands at pairStart+stepDur).
 */
export function stepToAudioTime(
  step: number,
  startTime: number,
  bpm: number,
  swing: number,
): number {
  const stepDur = stepDuration(bpm);
  const pairIdx = Math.floor(step / 2);
  const pairStart = startTime + pairIdx * 2 * stepDur;
  return step % 2 === 1 ? pairStart + 2 * stepDur * swing : pairStart;
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

  /**
   * Update BPM and re-anchor transportStartTime so the next unscheduled step
   * still lands at the audio time it would have under the old BPM. Identical
   * approach to v1 — swing is independent of BPM, so this anchor logic
   * doesn't need to know about swing.
   */
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

  /**
   * Swing changes mid-playback: future events use the new swing via the
   * lookahead. Already-scheduled events fire at their old times. Same trade-
   * off as BPM changes per spec §9.
   */
  setSwing(newSwing: number): void {
    this.resound.set_swing(newSwing);
  }

  private tick(): void {
    if (!this.audioCtx || !this.handler) return;
    const bpm = this.resound.bpm();
    const swing = this.resound.swing();
    const dt = stepDuration(bpm);
    const deadline = this.audioCtx.currentTime + SCHEDULE_AHEAD;
    // Conservative horizon: the largest step whose *un-swung* start time is
    // before the deadline, +1. Swing only shifts a step within its pair by at
    // most `2 * stepDur * (swing - 0.5)`, well under SCHEDULE_AHEAD at any
    // reasonable BPM, so a step at-or-near the horizon won't get pushed out
    // past the audio time we can still hit.
    const elapsed = deadline - this.transportStartTime;
    const horizonStep = Math.max(0, Math.floor(elapsed / dt) + 1);
    if (horizonStep <= this.nextScheduledStep) return;

    const start = this.transportStartTime;
    const tick: ClockTick = {
      horizonStep,
      stepToAudioTime: (step) => stepToAudioTime(step, start, bpm, swing),
    };
    this.handler(tick);
    this.nextScheduledStep = horizonStep;
  }
}
