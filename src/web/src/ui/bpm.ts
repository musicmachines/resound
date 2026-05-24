import type { Resound } from "../../wasm/resound";
import type { InternalClock } from "../audio/clock";

const STEP = 1;

export interface BpmControls {
  input: HTMLInputElement;
  down: HTMLButtonElement;
  up: HTMLButtonElement;
}

export function wireBpm(
  resound: Resound,
  clock: InternalClock,
  controls: BpmControls,
): void {
  controls.input.value = String(resound.bpm());

  const apply = (value: number): void => {
    clock.setBpm(value);
    // Reflect the clamped value back to the input.
    controls.input.value = String(resound.bpm());
  };

  controls.input.addEventListener("change", () => {
    const v = Number(controls.input.value);
    if (Number.isFinite(v)) apply(v);
  });
  controls.down.addEventListener("click", () => apply(resound.bpm() - STEP));
  controls.up.addEventListener("click", () => apply(resound.bpm() + STEP));
}
