import init, { Resound } from "../wasm/resound";
import { decodeKit } from "./audio/engine";
import { renderGrid } from "./ui/grid";

async function boot(): Promise<void> {
  await init();
  const resound = new Resound();

  const sampleCount = resound.sample_count();
  const sampleBytes: Uint8Array[] = [];
  for (let i = 0; i < sampleCount; i++) {
    sampleBytes.push(resound.sample_bytes(i));
  }

  const { audioCtx, buffers } = await decodeKit(sampleBytes);
  console.log(
    `[resound] decoded ${buffers.length} samples; audioCtx sampleRate=${audioCtx.sampleRate}`,
  );

  const grid = document.getElementById("grid");
  if (!grid) throw new Error("grid element missing");
  renderGrid(grid, resound);

  // Wire transport buttons / bpm / master to no-ops in slice 1 so the
  // controls feel alive even though audio isn't running yet.
  const playBtn = document.getElementById("play") as HTMLButtonElement | null;
  const stopBtn = document.getElementById("stop") as HTMLButtonElement | null;
  const bpmInput = document.getElementById("bpm") as HTMLInputElement | null;
  const masterInput = document.getElementById("master") as HTMLInputElement | null;

  if (bpmInput) bpmInput.value = String(resound.bpm());
  if (masterInput) masterInput.value = String(resound.master_level());

  playBtn?.addEventListener("click", () => {
    console.log("[resound] play (slice 1 stub — wiring lands in slice 2)");
  });
  stopBtn?.addEventListener("click", () => {
    console.log("[resound] stop (slice 1 stub — wiring lands in slice 2)");
  });
}

boot().catch((err) => {
  console.error("[resound] boot failed:", err);
});
