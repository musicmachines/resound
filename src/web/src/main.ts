import init, { Resound } from "../wasm/resound";
import { createEngine } from "./audio/engine";
import { InternalClock } from "./audio/clock";
import { Scheduler } from "./audio/scheduler";
import { UndoStack } from "./state/undo";
import { Grid } from "./ui/grid";
import { Inspector } from "./ui/inspector";
import { SampleBrowser } from "./ui/sampleBrowser";
import { wireTransport } from "./ui/transport";
import { wireTrackFaders } from "./ui/mixer";
import { wireClearReset } from "./ui/clearReset";
import { attachPlayhead } from "./ui/playhead";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

async function boot(): Promise<void> {
  await init();
  const resound = new Resound();
  const engine = await createEngine(resound);
  console.log(
    `[resound] decoded ${engine.poolBuffers.size} pool samples; sampleRate=${engine.audioCtx.sampleRate}`,
  );

  const undo = new UndoStack(resound);

  const gridRoot = el<HTMLElement>("grid");
  const grid = new Grid(gridRoot, resound, undo);
  grid.render();
  wireTrackFaders(gridRoot, resound, engine, undo);
  attachPlayhead(gridRoot, resound);

  const clock = new InternalClock(resound);
  const scheduler = new Scheduler(resound, engine, clock);

  const browser = new SampleBrowser(resound, grid, scheduler, engine, undo);

  gridRoot.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (t.classList.contains("browse")) {
      const v = Number(t.dataset.voice);
      browser.open(v);
    }
  });

  new Inspector(el<HTMLElement>("inspector"), resound, grid, undo);

  wireTransport(resound, scheduler, clock, engine, undo, {
    playBtn: el<HTMLButtonElement>("play"),
    stopBtn: el<HTMLButtonElement>("stop"),
    bpmInput: el<HTMLInputElement>("bpm"),
    bpmDownBtn: el<HTMLButtonElement>("bpm-down"),
    bpmUpBtn: el<HTMLButtonElement>("bpm-up"),
    swingSlider: el<HTMLInputElement>("swing"),
    swingValue: el<HTMLElement>("swing-value"),
    masterSlider: el<HTMLInputElement>("master"),
  });

  const moreBtn = el<HTMLButtonElement>("more-menu");
  const resetAllBtn = el<HTMLButtonElement>("reset-all");
  moreBtn.addEventListener("click", () => {
    resetAllBtn.hidden = !resetAllBtn.hidden;
  });

  wireClearReset(resound, grid, scheduler, undo, {
    clearPatternBtn: el<HTMLButtonElement>("clear-pattern"),
    resetAllBtn,
    undoBtn: el<HTMLButtonElement>("undo"),
    redoBtn: el<HTMLButtonElement>("redo"),
  });
}

boot().catch((err) => {
  console.error("[resound] boot failed:", err);
});
