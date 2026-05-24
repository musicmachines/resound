import type { Resound } from "../../wasm/resound";
import { VOICES } from "../audio/engine";

const FIXED_COLS_BEFORE_GRID = 2; // label + fader columns

export function attachPlayhead(gridRoot: HTMLElement, resound: Resound): void {
  const overlay = document.createElement("div");
  overlay.className = "playhead";
  overlay.style.gridRow = `1 / span ${VOICES}`;
  overlay.style.display = "none";
  gridRoot.appendChild(overlay);

  let lastStep = -2;
  const loop = (): void => {
    const step = resound.current_step();
    if (step !== lastStep) {
      if (step < 0) {
        overlay.style.display = "none";
      } else {
        overlay.style.display = "";
        overlay.style.gridColumn = `${FIXED_COLS_BEFORE_GRID + 1 + step}`;
      }
      lastStep = step;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
