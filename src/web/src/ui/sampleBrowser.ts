import type { Resound } from "../../wasm/resound";
import type { Grid } from "./grid";
import type { KitPicker } from "./kit";
import type { Scheduler } from "../audio/scheduler";
import type { AudioEngine } from "../audio/engine";
import type { UndoStack } from "../state/undo";

export class SampleBrowser {
  private modal: HTMLElement;
  private titleEl: HTMLElement;
  private listEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private closeBtn: HTMLButtonElement;
  private currentVoice: number | null = null;
  private allNames: string[];

  constructor(
    private readonly resound: Resound,
    private readonly grid: Grid,
    private readonly kit: KitPicker,
    private readonly scheduler: Scheduler,
    private readonly engine: AudioEngine,
    private readonly undo: UndoStack,
  ) {
    this.allNames = resound.pool_sample_names() as unknown as string[];

    this.modal = document.createElement("div");
    this.modal.className = "sample-browser";
    this.modal.hidden = true;

    const card = document.createElement("div");
    card.className = "sample-browser-card";
    this.modal.appendChild(card);

    const header = document.createElement("header");
    this.titleEl = document.createElement("h2");
    header.appendChild(this.titleEl);
    this.closeBtn = document.createElement("button");
    this.closeBtn.type = "button";
    this.closeBtn.className = "sample-browser-close";
    this.closeBtn.textContent = "✕";
    this.closeBtn.addEventListener("click", () => this.close());
    header.appendChild(this.closeBtn);
    card.appendChild(header);

    this.searchInput = document.createElement("input");
    this.searchInput.type = "search";
    this.searchInput.placeholder = "Search…";
    this.searchInput.className = "sample-search";
    this.searchInput.addEventListener("input", () => this.renderList());
    card.appendChild(this.searchInput);

    this.listEl = document.createElement("ul");
    this.listEl.className = "sample-list";
    card.appendChild(this.listEl);

    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });
    document.body.appendChild(this.modal);

    document.addEventListener("keydown", (e) => {
      if (this.modal.hidden) return;
      if (e.key === "Escape") this.close();
    });
  }

  open(voice: number): void {
    this.currentVoice = voice;
    this.titleEl.textContent = `Assign sample to: ${this.resound.track_name(voice)}`;
    this.searchInput.value = "";
    this.renderList();
    this.modal.hidden = false;
    setTimeout(() => this.searchInput.focus(), 0);
  }

  close(): void {
    this.modal.hidden = true;
    this.currentVoice = null;
  }

  private renderList(): void {
    if (this.currentVoice === null) return;
    const query = this.searchInput.value.toLowerCase();
    const current = this.resound.voice_pool_sample(this.currentVoice);
    this.listEl.innerHTML = "";
    for (const name of this.allNames) {
      if (query && !name.toLowerCase().includes(query)) continue;
      const li = document.createElement("li");
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "sample-preview";
      preview.textContent = "▶";
      preview.title = "Preview";
      preview.addEventListener("click", (e) => {
        e.stopPropagation();
        this.scheduler.voicePlayer.previewByName(name, this.engine.audioCtx.currentTime);
      });
      li.appendChild(preview);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "sample-label";
      label.textContent = name;
      if (name === current) label.classList.add("current");
      label.addEventListener("click", () => this.assign(name));
      li.appendChild(label);
      this.listEl.appendChild(li);
    }
  }

  private assign(name: string): void {
    if (this.currentVoice === null) return;
    if (this.resound.voice_pool_sample(this.currentVoice) === name) {
      this.close();
      return;
    }
    this.resound.set_voice_pool_sample(this.currentVoice, name);
    this.undo.commit();
    this.grid.refreshTrackHeader(this.currentVoice);
    this.kit.notifyChange();
    this.close();
  }
}
