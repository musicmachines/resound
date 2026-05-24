import type { Resound } from "../../wasm/resound";
import type { Scheduler } from "../audio/scheduler";

export interface TransportControls {
  playBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
}

export function wireTransport(
  resound: Resound,
  scheduler: Scheduler,
  audioCtx: AudioContext,
  controls: TransportControls,
): void {
  controls.playBtn.addEventListener("click", async () => {
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    resound.play();
    scheduler.start(audioCtx);
  });
  controls.stopBtn.addEventListener("click", () => {
    scheduler.stop();
    resound.stop();
  });
}
