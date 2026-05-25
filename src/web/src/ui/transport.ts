import type { Resound } from "../../wasm/resound";
import type { InternalClock } from "../audio/clock";
import type { Scheduler } from "../audio/scheduler";
import type { AudioEngine } from "../audio/engine";
import type { UndoStack } from "../state/undo";

export interface TransportRefs {
  playBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  bpmInput: HTMLInputElement;
  bpmDownBtn: HTMLButtonElement;
  bpmUpBtn: HTMLButtonElement;
  swingSlider: HTMLInputElement;
  swingValue: HTMLElement;
  masterSlider: HTMLInputElement;
}

export function wireTransport(
  resound: Resound,
  scheduler: Scheduler,
  clock: InternalClock,
  engine: AudioEngine,
  undo: UndoStack,
  refs: TransportRefs,
): void {
  // Play / stop ------------------------------------------------------------
  refs.playBtn.addEventListener("click", async () => {
    if (engine.audioCtx.state === "suspended") await engine.audioCtx.resume();
    resound.play();
    scheduler.start(engine.audioCtx);
  });
  refs.stopBtn.addEventListener("click", () => {
    scheduler.stop();
    resound.stop();
  });

  // BPM --------------------------------------------------------------------
  refs.bpmInput.value = String(resound.bpm());
  const applyBpm = (v: number): void => {
    if (!Number.isFinite(v)) return;
    undo.beginGesture();
    clock.setBpm(v);
    undo.endGesture();
    refs.bpmInput.value = String(resound.bpm());
  };
  refs.bpmInput.addEventListener("change", () => applyBpm(Number(refs.bpmInput.value)));
  refs.bpmDownBtn.addEventListener("click", () => applyBpm(resound.bpm() - 1));
  refs.bpmUpBtn.addEventListener("click", () => applyBpm(resound.bpm() + 1));

  // Swing ------------------------------------------------------------------
  const renderSwing = (): void => {
    const s = resound.swing();
    refs.swingSlider.value = String(s);
    refs.swingValue.textContent = `${Math.round(s * 100)}%`;
  };
  renderSwing();
  refs.swingSlider.addEventListener("pointerdown", () => undo.beginGesture());
  refs.swingSlider.addEventListener("pointerup", () => undo.endGesture());
  refs.swingSlider.addEventListener("pointercancel", () => undo.endGesture());
  refs.swingSlider.addEventListener("input", () => {
    clock.setSwing(Number(refs.swingSlider.value));
    renderSwing();
  });

  // Master -----------------------------------------------------------------
  refs.masterSlider.value = String(resound.master_level());
  refs.masterSlider.addEventListener("pointerdown", () => undo.beginGesture());
  refs.masterSlider.addEventListener("pointerup", () => undo.endGesture());
  refs.masterSlider.addEventListener("pointercancel", () => undo.endGesture());
  refs.masterSlider.addEventListener("input", () => {
    const v = Number(refs.masterSlider.value);
    resound.set_master_level(v);
    engine.masterGain.gain.value = resound.master_level();
  });
}
