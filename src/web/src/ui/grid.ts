import type { Resound } from "../../wasm/resound";

export const VOICES = 8;
export const STEPS = 16;

export function renderGrid(root: HTMLElement, resound: Resound): void {
  root.innerHTML = "";
  for (let v = 0; v < VOICES; v++) {
    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = resound.sample_name(v);
    root.appendChild(label);

    const fader = document.createElement("input");
    fader.type = "range";
    fader.min = "0";
    fader.max = "1";
    fader.step = "0.01";
    fader.value = String(resound.track_level(v));
    fader.className = "row-fader";
    fader.dataset.voice = String(v);
    root.appendChild(fader);

    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell" + (s % 4 === 0 && s > 0 ? " beat-start" : "");
      cell.dataset.voice = String(v);
      cell.dataset.step = String(s);
      if (resound.is_step_on(v, s)) cell.classList.add("on");
      root.appendChild(cell);
    }
  }
}
