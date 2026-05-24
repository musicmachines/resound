// Slice 2: InternalClock implementation. Stub for slice 1.

export interface ClockTick {
  horizonStep: number;
  stepToAudioTime: (step: number) => number;
}

export interface ClockSource {
  start(audioCtx: AudioContext): void;
  stop(): void;
  onTick(handler: (tick: ClockTick) => void): void;
}
