import type { Resound } from "../../wasm/resound";
import type { Grid } from "./grid";
import type { KitPicker } from "./kit";
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
  kit: KitPicker,
  scheduler: Scheduler,
  undo: UndoStack,
  refs: ClearResetRefs,
): void {
  refs.clearPatternBtn.addEventListener("click", () => {
    resound.clear_pattern();
    undo.commit();
    grid.setSelection(null);
    grid.refreshAllCells();
  });

  refs.resetAllBtn.addEventListener("click", () => {
    const ok = window.confirm(
      "Reset everything to defaults? Your pattern will be lost.",
    );
    if (!ok) return;
    scheduler.stop();
    resound.reset_all();
    undo.commit();
    kit.refreshAfterStateChange();
  });

  const refreshButtons = (): void => {
    refs.undoBtn.disabled = !undo.canUndo();
    refs.redoBtn.disabled = !undo.canRedo();
  };
  refreshButtons();
  undo.onChange(refreshButtons);

  refs.undoBtn.addEventListener("click", () => {
    if (undo.undo()) kit.refreshAfterStateChange();
  });
  refs.redoBtn.addEventListener("click", () => {
    if (undo.redo()) kit.refreshAfterStateChange();
  });

  // Global keyboard shortcuts — gated against text-input focus.
  document.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      if (e.shiftKey) {
        if (undo.redo()) kit.refreshAfterStateChange();
      } else {
        if (undo.undo()) kit.refreshAfterStateChange();
      }
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      if (undo.redo()) kit.refreshAfterStateChange();
    }
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
