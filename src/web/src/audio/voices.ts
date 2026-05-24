import type { AudioEngine } from "./engine";

export function triggerVoice(
  engine: AudioEngine,
  voice: number,
  audioTime: number,
): void {
  const buffer = engine.buffers[voice];
  if (!buffer) return;

  const src = engine.audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(engine.trackGains[voice]);
  src.start(audioTime);
  src.onended = () => src.disconnect();
}
