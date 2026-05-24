import init, { Resound } from "../wasm/resound";
import { createEngine } from "./audio/engine";
import { InternalClock } from "./audio/clock";
import { Scheduler } from "./audio/scheduler";
import { renderGrid, wireGridClicks } from "./ui/grid";
import { wireTransport } from "./ui/transport";

async function boot(): Promise<void> {
  await init();
  const resound = new Resound();
  const engine = await createEngine(resound);
  console.log(
    `[resound] decoded ${engine.buffers.length} samples; sampleRate=${engine.audioCtx.sampleRate}`,
  );

  const grid = document.getElementById("grid");
  if (!grid) throw new Error("grid element missing");
  renderGrid(grid, resound);
  wireGridClicks(grid, resound);

  const clock = new InternalClock(resound);
  const scheduler = new Scheduler(resound, engine, clock);

  const playBtn = document.getElementById("play") as HTMLButtonElement | null;
  const stopBtn = document.getElementById("stop") as HTMLButtonElement | null;
  if (!playBtn || !stopBtn) throw new Error("transport buttons missing");

  wireTransport(resound, scheduler, engine.audioCtx, { playBtn, stopBtn });

  const bpmInput = document.getElementById("bpm") as HTMLInputElement | null;
  const masterInput = document.getElementById("master") as HTMLInputElement | null;
  if (bpmInput) bpmInput.value = String(resound.bpm());
  if (masterInput) masterInput.value = String(resound.master_level());
}

boot().catch((err) => {
  console.error("[resound] boot failed:", err);
});
