import init, { Resound } from "../wasm/resound";
import { createEngine } from "./audio/engine";
import { InternalClock } from "./audio/clock";
import { Scheduler } from "./audio/scheduler";
import { renderGrid, wireGridClicks } from "./ui/grid";
import { wireTransport } from "./ui/transport";
import { wireMasterFader, wireTrackFaders } from "./ui/mixer";
import { wireBpm } from "./ui/bpm";
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
    `[resound] decoded ${engine.buffers.length} samples; sampleRate=${engine.audioCtx.sampleRate}`,
  );

  const grid = el<HTMLElement>("grid");
  renderGrid(grid, resound);
  wireGridClicks(grid, resound);
  wireTrackFaders(grid, resound, engine);
  attachPlayhead(grid, resound);

  const clock = new InternalClock(resound);
  const scheduler = new Scheduler(resound, engine, clock);

  wireTransport(resound, scheduler, engine.audioCtx, {
    playBtn: el<HTMLButtonElement>("play"),
    stopBtn: el<HTMLButtonElement>("stop"),
  });

  const masterInput = el<HTMLInputElement>("master");
  masterInput.value = String(resound.master_level());
  wireMasterFader(masterInput, resound, engine);

  wireBpm(resound, clock, {
    input: el<HTMLInputElement>("bpm"),
    down: el<HTMLButtonElement>("bpm-down"),
    up: el<HTMLButtonElement>("bpm-up"),
  });
}

boot().catch((err) => {
  console.error("[resound] boot failed:", err);
});
