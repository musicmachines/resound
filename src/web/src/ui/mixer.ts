import type { Resound } from "../../wasm/resound";
import type { AudioEngine } from "../audio/engine";

export function wireTrackFaders(
  gridRoot: HTMLElement,
  resound: Resound,
  engine: AudioEngine,
): void {
  gridRoot.addEventListener("input", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("row-fader")) {
      return;
    }
    const voice = Number(target.dataset.voice);
    const level = Number(target.value);
    resound.set_track_level(voice, level);
    engine.trackGains[voice].gain.value = resound.track_level(voice);
  });
}

export function wireMasterFader(
  input: HTMLInputElement,
  resound: Resound,
  engine: AudioEngine,
): void {
  input.addEventListener("input", () => {
    const level = Number(input.value);
    resound.set_master_level(level);
    engine.masterGain.gain.value = resound.master_level();
  });
}
