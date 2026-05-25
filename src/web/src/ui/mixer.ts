import type { Resound } from "../../wasm/resound";
import type { AudioEngine } from "../audio/engine";
import type { UndoStack } from "../state/undo";

/**
 * Track faders live inside the grid (one per row), so this wires the grid's
 * event-delegation surface rather than per-fader element refs.
 */
export function wireTrackFaders(
  gridRoot: HTMLElement,
  resound: Resound,
  engine: AudioEngine,
  undo: UndoStack,
): void {
  const gestures = new Set<number>(); // voices currently being dragged

  gridRoot.addEventListener("pointerdown", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t || !t.classList.contains("row-fader")) return;
    const voice = Number((t as HTMLInputElement).dataset.voice);
    if (!gestures.has(voice)) {
      undo.beginGesture();
      gestures.add(voice);
    }
  });

  const endGesture = (voice: number): void => {
    if (gestures.delete(voice)) undo.endGesture();
  };
  gridRoot.addEventListener("pointerup", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t || !t.classList.contains("row-fader")) return;
    endGesture(Number((t as HTMLInputElement).dataset.voice));
  });
  gridRoot.addEventListener("pointercancel", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t || !t.classList.contains("row-fader")) return;
    endGesture(Number((t as HTMLInputElement).dataset.voice));
  });

  gridRoot.addEventListener("input", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t || !t.classList.contains("row-fader")) return;
    const fader = t as HTMLInputElement;
    const voice = Number(fader.dataset.voice);
    const level = Number(fader.value);
    resound.set_track_level(voice, level);
    engine.trackGains[voice].gain.value = resound.track_level(voice);
  });
}
