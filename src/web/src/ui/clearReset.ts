import type { Resound } from "../../wasm/resound";
import type { Grid } from "./grid";
import type { Scheduler } from "../audio/scheduler";
import type { UndoStack } from "../state/undo";

export interface ClearResetRefs {
  clearPatternBtn: HTMLButtonElement;
  resetAllBtn: HTMLButtonElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
}

export function wireClearReset(
  resound: Resound,
  grid: Grid,
  scheduler: Scheduler,
  undo: UndoStack,
  refs: ClearResetRefs,
): void {
  const refreshAllUiFromState = (): void => {
    for (let v = 0; v < 8; v++) {
      grid.refreshTrackHeader(v);
      grid.refreshTrackFader(v);
    }
    grid.refreshAllCells();
    grid.setSelection(null);
  };

  refs.clearPatternBtn.addEventListener("click", () => {
    resound.clear_pattern();
    undo.commit();
    grid.setSelection(null);
    grid.refreshAllCells();
  });

  refs.resetAllBtn.addEventListener("click", () => {
    const ok = window.confirm("Reset everything to defaults? Your pattern will be lost.");
    if (!ok) return;
    scheduler.stop();
    resound.reset_all();
    undo.commit();
    refreshAllUiFromState();
  });

  const refreshButtons = (): void => {
    refs.undoBtn.disabled = !undo.canUndo();
    refs.redoBtn.disabled = !undo.canRedo();
  };
  refreshButtons();
  undo.onChange(refreshButtons);

  refs.undoBtn.addEventListener("click", () => {
    if (undo.undo()) refreshAllUiFromState();
  });
  refs.redoBtn.addEventListener("click", () => {
    if (undo.redo()) refreshAllUiFromState();
  });

  document.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      if (e.shiftKey) {
        if (undo.redo()) refreshAllUiFromState();
      } else {
        if (undo.undo()) refreshAllUiFromState();
      }
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      if (undo.redo()) refreshAllUiFromState();
    }
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
