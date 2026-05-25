import type { Resound } from "../../wasm/resound";
import type { AudioEngine } from "../audio/engine";
import type { UndoStack } from "../state/undo";
import type { Grid } from "./grid";

/**
 * Per-row level + tuning controls live inside the grid container. Both are
 * delegated through gridRoot.
 */
export function wireTrackControls(
  gridRoot: HTMLElement,
  resound: Resound,
  engine: AudioEngine,
  undo: UndoStack,
  grid: Grid,
): void {
  const levelGestures = new Set<number>();
  const tuneGestures = new Set<number>();

  const beginLevel = (voice: number): void => {
    if (!levelGestures.has(voice)) {
      undo.beginGesture();
      levelGestures.add(voice);
    }
  };
  const endLevel = (voice: number): void => {
    if (levelGestures.delete(voice)) undo.endGesture();
  };
  const beginTune = (voice: number): void => {
    if (!tuneGestures.has(voice)) {
      undo.beginGesture();
      tuneGestures.add(voice);
    }
  };
  const endTune = (voice: number): void => {
    if (tuneGestures.delete(voice)) undo.endGesture();
  };

  gridRoot.addEventListener("pointerdown", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (t.classList.contains("row-fader")) {
      beginLevel(Number((t as HTMLInputElement).dataset.voice));
    } else if (t.classList.contains("row-tuner")) {
      beginTune(Number((t as HTMLInputElement).dataset.voice));
    }
  });
  const endHandler = (ev: PointerEvent): void => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (t.classList.contains("row-fader")) {
      endLevel(Number((t as HTMLInputElement).dataset.voice));
    } else if (t.classList.contains("row-tuner")) {
      endTune(Number((t as HTMLInputElement).dataset.voice));
    }
  };
  gridRoot.addEventListener("pointerup", endHandler);
  gridRoot.addEventListener("pointercancel", endHandler);

  gridRoot.addEventListener("input", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (t.classList.contains("row-fader")) {
      const fader = t as HTMLInputElement;
      const voice = Number(fader.dataset.voice);
      const level = Number(fader.value);
      resound.set_track_level(voice, level);
      engine.trackGains[voice].gain.value = resound.track_level(voice);
    } else if (t.classList.contains("row-tuner")) {
      const tuner = t as HTMLInputElement;
      const voice = Number(tuner.dataset.voice);
      resound.set_track_tuning(voice, Number(tuner.value));
      grid.refreshTrackTuning(voice);
    }
  });
}
