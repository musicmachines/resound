import type { Resound } from "../../wasm/resound";
import type { UndoStack } from "../state/undo";

export const NUM_VOICES = 8;
export const STEPS = 16;

/**
 * Binary on/off grid. v4 dropped per-step velocity/pitch + inspector.
 * Track row layout (per row): header (name + browse) | level | tuning | 16 cells
 */
export class Grid {
  constructor(
    private readonly root: HTMLElement,
    private readonly resound: Resound,
    private readonly undo: UndoStack,
  ) {}

  render(): void {
    this.root.innerHTML = "";
    for (let v = 0; v < NUM_VOICES; v++) {
      this.renderTrackHeader(v);
      this.renderTrackLevel(v);
      this.renderTrackTuning(v);
      for (let s = 0; s < STEPS; s++) {
        this.renderCell(v, s);
      }
    }
  }

  refreshCell(voice: number, step: number): void {
    const cell = this.cellEl(voice, step);
    if (cell) cell.classList.toggle("on", this.resound.is_step_on(voice, step));
  }

  refreshAllCells(): void {
    for (let v = 0; v < NUM_VOICES; v++) {
      for (let s = 0; s < STEPS; s++) {
        this.refreshCell(v, s);
      }
    }
  }

  refreshTrackHeader(voice: number): void {
    const header = this.root.querySelector<HTMLElement>(`.row-header[data-voice="${voice}"]`);
    if (header) this.populateTrackHeader(header, voice);
  }

  refreshTrackLevel(voice: number): void {
    const fader = this.root.querySelector<HTMLInputElement>(`.row-fader[data-voice="${voice}"]`);
    if (fader) fader.value = String(this.resound.track_level(voice));
  }

  refreshTrackTuning(voice: number): void {
    const tuner = this.root.querySelector<HTMLInputElement>(`.row-tuner[data-voice="${voice}"]`);
    if (tuner) {
      tuner.value = String(this.resound.track_tuning(voice));
      const readout = this.root.querySelector<HTMLElement>(
        `.row-tuner-readout[data-voice="${voice}"]`,
      );
      if (readout) readout.textContent = formatSemis(this.resound.track_tuning(voice));
    }
  }

  // ---- internal -------------------------------------------------------

  private cellEl(voice: number, step: number): HTMLButtonElement | null {
    return this.root.querySelector<HTMLButtonElement>(
      `.cell[data-voice="${voice}"][data-step="${step}"]`,
    );
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
  }

  private renderTrackLevel(voice: number): void {
    const fader = document.createElement("input");
    fader.type = "range";
    fader.min = "0";
    fader.max = "1";
    fader.step = "0.01";
    fader.value = String(this.resound.track_level(voice));
    fader.className = "row-fader";
    fader.dataset.voice = String(voice);
    fader.title = "Level";
    this.root.appendChild(fader);
  }

  private renderTrackTuning(voice: number): void {
    const wrap = document.createElement("div");
    wrap.className = "row-tuner-wrap";
    const tuner = document.createElement("input");
    tuner.type = "range";
    tuner.min = "-12";
    tuner.max = "12";
    tuner.step = "1";
    tuner.value = String(this.resound.track_tuning(voice));
    tuner.className = "row-tuner";
    tuner.dataset.voice = String(voice);
    tuner.title = "Tuning (semitones, ±1 octave)";
    wrap.appendChild(tuner);
    const readout = document.createElement("span");
    readout.className = "row-tuner-readout";
    readout.dataset.voice = String(voice);
    readout.textContent = formatSemis(this.resound.track_tuning(voice));
    wrap.appendChild(readout);
    this.root.appendChild(wrap);
  }

  private renderCell(voice: number, step: number): void {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell" + (step % 4 === 0 && step > 0 ? " beat-start" : "");
    cell.dataset.voice = String(voice);
    cell.dataset.step = String(step);
    if (this.resound.is_step_on(voice, step)) cell.classList.add("on");
    cell.addEventListener("click", () => {
      this.resound.toggle_step(voice, step);
      this.undo.commit();
      this.refreshCell(voice, step);
    });
    this.root.appendChild(cell);
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

function formatSemis(s: number): string {
  if (s === 0) return "0";
  return s > 0 ? `+${s}` : String(s);
}
