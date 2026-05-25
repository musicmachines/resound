import type { Resound } from "../../wasm/resound";
import type { UndoStack } from "../state/undo";

export const NUM_VOICES = 8;
export const STEPS = 16;

export type SelectedStep = { voice: number; step: number } | null;
export type SelectionListener = (sel: SelectedStep) => void;

const VELOCITY_DRAG_RANGE = 80; // pixels of drag = full 0..1
const PITCH_DRAG_RANGE = 24; // pixels per semitone vertically

export class Grid {
  private root: HTMLElement;
  private resound: Resound;
  private undo: UndoStack;
  private selected: SelectedStep = null;
  private listeners: Set<SelectionListener> = new Set();

  constructor(root: HTMLElement, resound: Resound, undo: UndoStack) {
    this.root = root;
    this.resound = resound;
    this.undo = undo;
  }

  onSelectionChange(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  selection(): SelectedStep {
    return this.selected;
  }

  setSelection(sel: SelectedStep): void {
    if (sameSelection(sel, this.selected)) return;
    const prior = this.selected;
    this.selected = sel;
    if (prior) this.updateCellSelectedClass(prior.voice, prior.step);
    if (sel) this.updateCellSelectedClass(sel.voice, sel.step);
    for (const l of this.listeners) l(sel);
  }

  /** Initial render: build voice rows and cells. Subsequent updates use `refreshCell` / `refreshTrack`. */
  render(): void {
    this.root.innerHTML = "";
    for (let v = 0; v < NUM_VOICES; v++) {
      this.renderTrackHeader(v);
      this.renderTrackFader(v);
      for (let s = 0; s < STEPS; s++) {
        this.renderCell(v, s);
      }
    }
  }

  /** Refresh a single cell (after toggle / velocity / pitch change). */
  refreshCell(voice: number, step: number): void {
    const cell = this.cellEl(voice, step);
    if (!cell) return;
    applyCellState(cell, this.resound, voice, step, sameSelection(this.selected, { voice, step }));
  }

  /** Refresh all cells (after pattern-wide changes — kit load, clear, snapshot restore). */
  refreshAllCells(): void {
    for (let v = 0; v < NUM_VOICES; v++) {
      for (let s = 0; s < STEPS; s++) {
        this.refreshCell(v, s);
      }
    }
  }

  /** Re-render a track header — name + clear-track-sample icon visibility. */
  refreshTrackHeader(voice: number): void {
    const header = this.root.querySelector<HTMLElement>(`.row-header[data-voice="${voice}"]`);
    if (!header) return;
    this.populateTrackHeader(header, voice);
  }

  /** Refresh the track-fader's value (without firing input events). */
  refreshTrackFader(voice: number): void {
    const fader = this.root.querySelector<HTMLInputElement>(`.row-fader[data-voice="${voice}"]`);
    if (fader) fader.value = String(this.resound.track_level(voice));
  }

  // ---- internal -------------------------------------------------------

  private cellEl(voice: number, step: number): HTMLButtonElement | null {
    return this.root.querySelector<HTMLButtonElement>(
      `.cell[data-voice="${voice}"][data-step="${step}"]`,
    );
  }

  private updateCellSelectedClass(voice: number, step: number): void {
    const cell = this.cellEl(voice, step);
    if (!cell) return;
    cell.classList.toggle("selected", sameSelection(this.selected, { voice, step }));
  }

  private renderTrackHeader(voice: number): void {
    const header = document.createElement("div");
    header.className = "row-header";
    header.dataset.voice = String(voice);
    this.populateTrackHeader(header, voice);
    this.root.appendChild(header);
  }

  private populateTrackHeader(header: HTMLElement, voice: number): void {
    header.innerHTML = "";

    const name = document.createElement("span");
    name.className = "track-name";
    name.textContent = this.resound.track_name(voice);
    name.title = "Click to rename";
    name.addEventListener("click", () => this.beginInlineRename(voice, name));
    header.appendChild(name);

    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "row-icon browse";
    browse.title = "Browse samples";
    browse.textContent = "📁";
    browse.dataset.voice = String(voice);
    header.appendChild(browse);

    const activeKit = this.resound.active_kit();
    const kitJson = JSON.parse(this.resound.kit_json(activeKit)) as { voices: string[] };
    const kitSample = kitJson.voices[voice];
    if (this.resound.voice_pool_sample(voice) !== kitSample) {
      const revert = document.createElement("button");
      revert.type = "button";
      revert.className = "row-icon revert";
      revert.title = `Revert to ${kitSample} (kit sample)`;
      revert.textContent = "⤺";
      revert.dataset.voice = String(voice);
      revert.dataset.action = "clear-track-sample";
      header.appendChild(revert);
    }
  }

  private renderTrackFader(voice: number): void {
    const fader = document.createElement("input");
    fader.type = "range";
    fader.min = "0";
    fader.max = "1";
    fader.step = "0.01";
    fader.value = String(this.resound.track_level(voice));
    fader.className = "row-fader";
    fader.dataset.voice = String(voice);
    this.root.appendChild(fader);
  }

  private renderCell(voice: number, step: number): void {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell" + (step % 4 === 0 && step > 0 ? " beat-start" : "");
    cell.dataset.voice = String(voice);
    cell.dataset.step = String(step);

    const fill = document.createElement("span");
    fill.className = "cell-fill";
    cell.appendChild(fill);

    const pitchBadge = document.createElement("span");
    pitchBadge.className = "cell-pitch";
    cell.appendChild(pitchBadge);

    applyCellState(cell, this.resound, voice, step, false);
    this.attachCellHandlers(cell, voice, step);
    this.root.appendChild(cell);
  }

  private attachCellHandlers(cell: HTMLButtonElement, voice: number, step: number): void {
    let downAt: { x: number; y: number; time: number } | null = null;
    let drag: { axis: "velocity" | "pitch"; startVel: number; startPitch: number } | null = null;
    let undoBegun = false;
    let pointerId = -1;

    const beginUndo = (): void => {
      if (!undoBegun) {
        this.undo.beginGesture();
        undoBegun = true;
      }
    };

    cell.addEventListener("pointerdown", (ev) => {
      pointerId = ev.pointerId;
      cell.setPointerCapture(pointerId);
      downAt = { x: ev.clientX, y: ev.clientY, time: performance.now() };
      drag = null;
      undoBegun = false;
    });

    cell.addEventListener("pointermove", (ev) => {
      if (!downAt) return;
      const dx = ev.clientX - downAt.x;
      const dy = ev.clientY - downAt.y;
      if (!drag) {
        // Don't start drag until movement exceeds threshold.
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        // Drag only adjusts a lit step. If cell is off, ignore drag (user is just clicking imprecisely).
        if (!this.resound.is_step_on(voice, step)) {
          downAt = null;
          return;
        }
        drag = {
          axis: ev.shiftKey ? "pitch" : "velocity",
          startVel: this.resound.step_velocity(voice, step),
          startPitch: this.resound.step_pitch(voice, step),
        };
        beginUndo();
      }
      if (drag.axis === "velocity") {
        const delta = -dy / VELOCITY_DRAG_RANGE; // up=louder
        this.resound.set_step_velocity(voice, step, drag.startVel + delta);
      } else {
        const delta = -dy / PITCH_DRAG_RANGE;
        this.resound.set_step_pitch(voice, step, drag.startPitch + delta);
      }
      this.refreshCell(voice, step);
    });

    const finish = (): void => {
      if (pointerId >= 0) {
        try {
          cell.releasePointerCapture(pointerId);
        } catch {
          // pointer might be already released
        }
        pointerId = -1;
      }
      if (!downAt) return;
      const wasDrag = drag !== null;
      downAt = null;
      drag = null;
      if (wasDrag) {
        if (undoBegun) this.undo.endGesture();
        return;
      }
      // Click — toggle, then if newly lit, select.
      this.resound.toggle_step(voice, step);
      this.undo.commit();
      this.refreshCell(voice, step);
      if (this.resound.is_step_on(voice, step)) {
        this.setSelection({ voice, step });
      } else if (sameSelection(this.selected, { voice, step })) {
        this.setSelection(null);
      }
    };

    cell.addEventListener("pointerup", finish);
    cell.addEventListener("pointercancel", finish);
  }

  private beginInlineRename(voice: number, nameSpan: HTMLElement): void {
    const current = this.resound.track_name(voice);
    const input = document.createElement("input");
    input.type = "text";
    input.value = current;
    input.maxLength = 32;
    input.className = "track-name-input";
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = (save: boolean): void => {
      if (committed) return;
      committed = true;
      const trimmed = input.value.trim();
      if (save && trimmed.length > 0) {
        this.resound.set_track_name(voice, trimmed);
        this.undo.commit();
      }
      this.refreshTrackHeader(voice);
    };

    input.addEventListener("blur", () => commit(true));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        commit(false);
      }
    });
  }
}

function applyCellState(
  cell: HTMLElement,
  resound: Resound,
  voice: number,
  step: number,
  selected: boolean,
): void {
  const on = resound.is_step_on(voice, step);
  cell.classList.toggle("on", on);
  cell.classList.toggle("selected", selected);

  const fill = cell.querySelector<HTMLElement>(".cell-fill");
  if (fill) {
    if (on) {
      const velocity = resound.step_velocity(voice, step);
      fill.style.height = `${Math.max(8, velocity * 100)}%`;
    } else {
      fill.style.height = "0";
    }
  }

  const badge = cell.querySelector<HTMLElement>(".cell-pitch");
  if (badge) {
    if (on) {
      const p = resound.step_pitch(voice, step);
      const rounded = Math.round(p);
      if (rounded === 0) {
        badge.textContent = "";
      } else {
        badge.textContent = rounded > 0 ? `+${rounded}` : String(rounded);
      }
    } else {
      badge.textContent = "";
    }
  }
}

export function sameSelection(a: SelectedStep, b: SelectedStep): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.voice === b.voice && a.step === b.step;
}
