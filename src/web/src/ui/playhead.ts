import type { Resound } from "../../wasm/resound";

export function attachPlayhead(gridRoot: HTMLElement, resound: Resound): void {
  const overlay = document.createElement("div");
  overlay.className = "playhead";
  overlay.style.display = "none";
  gridRoot.appendChild(overlay);

  let lastStep = -2;
  const positionFor = (step: number): void => {
    const firstCell = gridRoot.querySelector<HTMLElement>(
      `.cell[data-voice="0"][data-step="${step}"]`,
    );
    const lastCell = gridRoot.querySelector<HTMLElement>(
      `.cell[data-voice="7"][data-step="${step}"]`,
    );
    if (!firstCell || !lastCell) return;
    const gridRect = gridRoot.getBoundingClientRect();
    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();
    overlay.style.left = `${firstRect.left - gridRect.left}px`;
    overlay.style.top = `${firstRect.top - gridRect.top}px`;
    overlay.style.width = `${firstRect.width}px`;
    overlay.style.height = `${lastRect.bottom - firstRect.top}px`;
  };

  const loop = (): void => {
    const step = resound.current_step();
    if (step !== lastStep) {
      if (step < 0) {
        overlay.style.display = "none";
      } else {
        overlay.style.display = "";
        positionFor(step);
      }
      lastStep = step;
    } else if (step >= 0) {
      // Re-measure each frame to track window resize without a separate listener.
      positionFor(step);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
