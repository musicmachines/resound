import type { Resound } from "../../wasm/resound";
import type { Grid, SelectedStep } from "./grid";
import type { UndoStack } from "../state/undo";

export class Inspector {
  private container: HTMLElement;
  private resound: Resound;
  private grid: Grid;
  private undo: UndoStack;

  private titleEl: HTMLElement;
  private velocitySlider: HTMLInputElement;
  private velocityValue: HTMLElement;
  private pitchSlider: HTMLInputElement;
  private pitchValue: HTMLElement;
  private closeBtn: HTMLButtonElement;

  constructor(container: HTMLElement, resound: Resound, grid: Grid, undo: UndoStack) {
    this.container = container;
    this.resound = resound;
    this.grid = grid;
    this.undo = undo;

    container.innerHTML = "";
    container.classList.add("inspector");
    container.hidden = true;

    this.titleEl = document.createElement("div");
    this.titleEl.className = "inspector-title";
    container.appendChild(this.titleEl);

    const velGroup = document.createElement("div");
    velGroup.className = "inspector-group";
    const velLabel = document.createElement("label");
    velLabel.textContent = "Velocity";
    velGroup.appendChild(velLabel);
    this.velocitySlider = document.createElement("input");
    this.velocitySlider.type = "range";
    this.velocitySlider.min = "0";
    this.velocitySlider.max = "1";
    this.velocitySlider.step = "0.01";
    velGroup.appendChild(this.velocitySlider);
    this.velocityValue = document.createElement("span");
    this.velocityValue.className = "inspector-value";
    velGroup.appendChild(this.velocityValue);
    container.appendChild(velGroup);

    const pitchGroup = document.createElement("div");
    pitchGroup.className = "inspector-group";
    const pitchLabel = document.createElement("label");
    pitchLabel.textContent = "Pitch";
    pitchGroup.appendChild(pitchLabel);
    this.pitchSlider = document.createElement("input");
    this.pitchSlider.type = "range";
    this.pitchSlider.min = "-24";
    this.pitchSlider.max = "24";
    this.pitchSlider.step = "1";
    pitchGroup.appendChild(this.pitchSlider);
    this.pitchValue = document.createElement("span");
    this.pitchValue.className = "inspector-value";
    pitchGroup.appendChild(this.pitchValue);
    container.appendChild(pitchGroup);

    this.closeBtn = document.createElement("button");
    this.closeBtn.type = "button";
    this.closeBtn.className = "inspector-close";
    this.closeBtn.textContent = "✕";
    this.closeBtn.title = "Close inspector (Esc)";
    this.closeBtn.addEventListener("click", () => grid.setSelection(null));
    container.appendChild(this.closeBtn);

    this.wireSlider(this.velocitySlider, "velocity");
    this.wireSlider(this.pitchSlider, "pitch");

    grid.onSelectionChange((sel) => this.show(sel));
    document.addEventListener("keydown", (e) => this.handleKeyboard(e));
  }

  private show(sel: SelectedStep): void {
    if (!sel) {
      this.container.hidden = true;
      return;
    }
    this.container.hidden = false;
    this.titleEl.textContent = `${this.resound.track_name(sel.voice)} / Step ${sel.step + 1}`;
    const vel = this.resound.step_velocity(sel.voice, sel.step);
    const pitch = this.resound.step_pitch(sel.voice, sel.step);
    this.velocitySlider.value = String(vel);
    this.pitchSlider.value = String(pitch);
    this.velocityValue.textContent = Math.round(vel * 100).toString();
    this.pitchValue.textContent = pitch > 0 ? `+${Math.round(pitch)}` : String(Math.round(pitch));
  }

  private wireSlider(slider: HTMLInputElement, axis: "velocity" | "pitch"): void {
    let gestureActive = false;
    slider.addEventListener("pointerdown", () => {
      gestureActive = true;
      this.undo.beginGesture();
    });
    const endGesture = (): void => {
      if (gestureActive) {
        this.undo.endGesture();
        gestureActive = false;
      }
    };
    slider.addEventListener("pointerup", endGesture);
    slider.addEventListener("pointercancel", endGesture);
    slider.addEventListener("blur", endGesture);

    slider.addEventListener("input", () => {
      const sel = this.grid.selection();
      if (!sel) return;
      const v = Number(slider.value);
      if (axis === "velocity") {
        this.resound.set_step_velocity(sel.voice, sel.step, v);
        this.velocityValue.textContent = Math.round(v * 100).toString();
      } else {
        this.resound.set_step_pitch(sel.voice, sel.step, v);
        this.pitchValue.textContent = v > 0 ? `+${Math.round(v)}` : String(Math.round(v));
      }
      this.grid.refreshCell(sel.voice, sel.step);
    });
  }

  private handleKeyboard(e: KeyboardEvent): void {
    if (this.container.hidden) return;
    if (isTypingTarget(e.target)) return;
    const sel = this.grid.selection();
    if (!sel) return;

    if (e.key === "Escape") {
      e.preventDefault();
      this.grid.setSelection(null);
      return;
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const dir = e.key === "ArrowUp" ? 1 : -1;
    e.preventDefault();

    this.undo.beginGesture();
    if (e.altKey) {
      // cents — ±1 cent per press
      const cur = this.resound.step_pitch(sel.voice, sel.step);
      this.resound.set_step_pitch(sel.voice, sel.step, cur + dir * 0.01);
    } else if (e.shiftKey) {
      // semitone
      const cur = this.resound.step_pitch(sel.voice, sel.step);
      this.resound.set_step_pitch(sel.voice, sel.step, cur + dir);
    } else {
      // velocity 0.01
      const cur = this.resound.step_velocity(sel.voice, sel.step);
      this.resound.set_step_velocity(sel.voice, sel.step, cur + dir * 0.01);
    }
    this.undo.endGesture();
    this.show(sel);
    this.grid.refreshCell(sel.voice, sel.step);
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
