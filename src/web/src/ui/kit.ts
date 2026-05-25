import type { Resound } from "../../wasm/resound";
import type { Grid } from "./grid";
import type { UndoStack } from "../state/undo";

/**
 * Renders kit picker buttons + the (modified) suffix. Hooks Set up so that
 * loading a kit triggers a grid header refresh (track names + revert icons).
 */
export class KitPicker {
  private root: HTMLElement;
  private resound: Resound;
  private grid: Grid;
  private undo: UndoStack;
  private modifiedListeners: Set<() => void> = new Set();

  constructor(root: HTMLElement, resound: Resound, grid: Grid, undo: UndoStack) {
    this.root = root;
    this.resound = resound;
    this.grid = grid;
    this.undo = undo;
    this.render();
  }

  /** External hook (sample browser, clear-track-sample) that may flip the modified flag. */
  notifyChange(): void {
    this.refreshModified();
    for (const l of this.modifiedListeners) l();
  }

  onChange(handler: () => void): () => void {
    this.modifiedListeners.add(handler);
    return () => this.modifiedListeners.delete(handler);
  }

  render(): void {
    this.root.innerHTML = "";
    const label = document.createElement("span");
    label.className = "kit-label";
    label.textContent = "Kit:";
    this.root.appendChild(label);

    const count = this.resound.kit_count();
    for (let i = 0; i < count; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kit-btn";
      btn.dataset.kitId = String(i);
      btn.textContent = this.resound.kit_name(i);
      btn.addEventListener("click", () => this.loadKit(i));
      this.root.appendChild(btn);
    }

    const modSpan = document.createElement("span");
    modSpan.className = "kit-modified";
    this.root.appendChild(modSpan);
    this.refreshModified();
  }

  private loadKit(id: number): void {
    if (this.resound.active_kit() === id && !this.resound.kit_modified()) return;
    this.resound.set_active_kit(id);
    this.undo.commit();
    this.afterKitChange();
  }

  /** Public so other modules (clear pattern, snapshot restore) can poke a refresh. */
  refreshAfterStateChange(): void {
    this.refreshModified();
    for (let v = 0; v < 8; v++) {
      this.grid.refreshTrackHeader(v);
      this.grid.refreshTrackFader(v);
    }
    this.grid.refreshAllCells();
    this.grid.setSelection(null);
  }

  private afterKitChange(): void {
    this.refreshModified();
    for (let v = 0; v < 8; v++) {
      this.grid.refreshTrackHeader(v);
    }
    for (const l of this.modifiedListeners) l();
  }

  private refreshModified(): void {
    const active = this.resound.active_kit();
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(".kit-btn")) {
      const id = Number(btn.dataset.kitId);
      btn.classList.toggle("active", id === active);
    }
    const mod = this.root.querySelector<HTMLElement>(".kit-modified");
    if (mod) {
      mod.textContent = this.resound.kit_modified() ? " (modified)" : "";
    }
  }
}
