# Resound — Technical Specification (v1)

## 1. Overview

**Resound** is a browser-based 8-voice step-sequencer drum machine. A Rust core compiled to WebAssembly owns all musical state and sequencing logic. The Web Audio API, driven from a thin TypeScript layer on the main thread, handles audio playback. HTML/CSS renders the UI. Everything runs 100% in the browser; v1 has no backend (a small proxy is introduced in §16.5 for Freesound integration).

---

## 2. Feature Scope

**In scope (v1):**

- 8 voices, 1 fixed sample each: kick, snare, clap, lo tom, hi tom, closed hat, open hat, cymbal
- Single fixed kit (samples bundled into the WASM binary)
- 8 tracks × 16 steps at 16th-note resolution
- Per-step: on/off only
- Per-track: level control
- Global: master level, BPM
- Transport: play / stop
- Choke per voice (new trigger cuts the previous one on the same voice)
- Stereo output
- Visual playhead showing the current step
- Desktop and tablet as primary targets; phones must run but UX is not optimized

**Out of scope (deferred to later versions):**

- Per-step velocity / accent
- Swing / shuffle
- Mute / solo per track
- Pattern save / load / share
- Multiple kits or sample swapping
- Pattern chaining, song mode
- MIDI in / out, export
- Undo / redo
- Mobile-optimized UI

**Explicit non-goals (not deferred — not happening):**

- **Drum synthesis.** This is a sample-based instrument by design. All sound production is sample playback, now and later. Envelopes, filters, and effects (§16) shape sample playback; they do not synthesize. The Freesound integration roadmap (§16.5) reinforces this — sample-based identity is core to the product, not a v1 simplification.

---

## 3. Architecture

Three layers:

**Rust core (WASM).** Source of truth for all musical state. Pure logic — no DOM access, no Web Audio access, no wall-clock time. Compiled with `wasm-pack` to an ES module. Internally organized as reusable modules (`pattern`, `transport`, `mixer`) with `Resound` as a thin façade over them, so future entry points (an audio-worklet-side DSP module, a separate sequencer for sample-accurate timing) can share the same underlying types.

**TypeScript audio engine.** Three decoupled pieces:

- *Clock source* — emits step-progression ticks with timestamps. v1 ships one implementation: an internal `setInterval`-based clock driving the lookahead window. Later versions add a MIDI-clock-driven slave implementation and an outgoing MIDI-clock emitter for master mode. The scheduler depends on the `ClockSource` interface, not on any concrete implementation.
- *Scheduler* — receives ticks, pulls events from Rust, schedules them on the audio graph. Source-agnostic.
- *Audio graph* — holds the `AudioContext`, sample buffers, per-voice nodes, and master output. Loaded at startup from Rust-provided sample bytes. Per-voice chain is designed to accept additional nodes (envelope gains, filters, effects) without restructuring.

**HTML/CSS UI.** Renders the 8×16 grid, faders, BPM input, transport. On user input, calls into Rust to mutate state. On `requestAnimationFrame`, reads transport position from Rust and updates the playhead.

Data flow:

- User input → JS handler → Rust mutation
- Clock tick → Scheduler → Rust query (`pull_events`) → JS schedules on Web Audio
- rAF → Rust query (`current_step`) → DOM update

Crucially, **Rust knows nothing about audio time or wall-clock time**. Rust counts steps in an abstract integer space. The scheduler converts step counts to `AudioContext.currentTime` using either an internal BPM (v1) or external MIDI tick timestamps (future). Swapping clock sources requires zero Rust changes. This keeps the Rust core deterministic, trivially unit-testable, and source-agnostic.

---

## 4. Tech Stack

- **Rust** (stable, `wasm32-unknown-unknown` target). Crate configured as `crate-type = ["cdylib", "rlib"]` from day one — the `cdylib` form is what `wasm-pack` consumes; the `rlib` form lets future workspace members (audio-worklet DSP, separate sequencer crate) depend on the same modules without source duplication.
- **wasm-bindgen** + **wasm-pack** for JS interop and bundling
- **Vite** for dev server, HMR, and production bundling
- **vite-plugin-wasm** + **vite-plugin-top-level-await** for ESM-WASM loading
- **TypeScript** for the JS layer
- Plain HTML/CSS — no UI framework at this scale

---

## 5. Project Layout

```
resound/
├── docs/
│   └── resound-v1-spec.md              # this document
├── src/
│   ├── crate/                          # Rust core
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs                  # wasm-bindgen exports
│   │   │   ├── pattern.rs              # 8×16 grid + mutation API
│   │   │   ├── transport.rs            # play state, BPM, step counter
│   │   │   ├── mixer.rs                # per-track + master levels
│   │   │   └── samples.rs              # include_bytes! for the 8 kit samples
│   │   └── samples/                    # source WAVs
│   │       ├── kick.wav
│   │       ├── snare.wav
│   │       ├── clap.wav
│   │       ├── lo_tom.wav
│   │       ├── hi_tom.wav
│   │       ├── closed_hat.wav
│   │       ├── open_hat.wav
│   │       └── cymbal.wav
│   └── web/
│       ├── index.html
│       ├── src/
│       │   ├── main.ts                 # boot sequence
│       │   ├── audio/
│       │   │   ├── engine.ts           # AudioContext + graph wiring
│       │   │   ├── clock.ts            # ClockSource interface + InternalClock impl
│       │   │   ├── scheduler.ts        # consumes ticks, pulls events, schedules audio
│       │   │   └── voices.ts           # per-voice triggering + choke
│       │   ├── ui/
│       │   │   ├── grid.ts
│       │   │   ├── transport.ts
│       │   │   ├── mixer.ts
│       │   │   └── playhead.ts
│       │   └── styles.css
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
└── README.md
```

`docs/` holds the spec and any future design notes. `src/crate/` and `src/web/` are siblings; the Rust build emits its WASM bundle into `src/web/wasm/`, consumed by Vite. The nested `src/` directories inside each tool's folder (Rust's `src/crate/src/`, Vite's `src/web/src/`) are tooling conventions and stay where they're expected.

---

## 6. Rust Core API

Single struct `Resound` exported via `wasm-bindgen` — keeps state ownership clean and avoids module-level statics.

```rust
#[wasm_bindgen]
pub struct Resound { /* ... */ }

#[wasm_bindgen]
impl Resound {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self;

    // Samples (called once at boot)
    pub fn sample_count(&self) -> u32;                  // 8
    pub fn sample_name(&self, voice: u32) -> String;
    pub fn sample_bytes(&self, voice: u32) -> Vec<u8>;

    // Pattern mutation
    pub fn toggle_step(&mut self, voice: u32, step: u32);
    pub fn set_step(&mut self, voice: u32, step: u32, on: bool);
    pub fn is_step_on(&self, voice: u32, step: u32) -> bool;
    pub fn clear_pattern(&mut self);

    // Mixer
    pub fn set_track_level(&mut self, voice: u32, level: f32);   // 0.0..=1.0
    pub fn track_level(&self, voice: u32) -> f32;
    pub fn set_master_level(&mut self, level: f32);
    pub fn master_level(&self) -> f32;

    // Transport
    pub fn set_bpm(&mut self, bpm: f32);
    pub fn bpm(&self) -> f32;
    pub fn play(&mut self);
    pub fn stop(&mut self);
    pub fn is_playing(&self) -> bool;
    pub fn set_position(&mut self, global_step: u32);  // jump to step; preserves play/stop state
                                                       // (unused in v1; reserved for MIDI SPP & external resyncs)

    // Scheduler query.
    // Returns events with step index strictly less than `until_step` that
    // haven't been pulled yet. Advances Rust's internal "next unpulled step"
    // cursor. JS converts step indices to AudioContext time using BPM.
    // Encoded as a flat [voice, step_global, voice, step_global, ...] for cheap transfer.
    pub fn pull_events(&mut self, until_step: u32) -> Vec<u32>;

    // For UI rendering
    pub fn current_step(&self) -> i32;  // 0..16 while playing, -1 when stopped
}
```

**On `pull_events`.** The contract is that `until_step` is a monotonic global step counter (not modulo 16). Rust returns every step event with `voice on at step % 16` whose global index is less than `until_step` and greater than or equal to the last pulled cursor. This makes the scheduler/Rust contract clock-free and easy to reason about.

---

## 7. Audio Graph

Per voice:

```
AudioBufferSourceNode (one-shot, GC'd on end)
        │
        ▼
GainNode (per-trigger fade gain, for choke)
        │
        ▼
GainNode (per-track level) ─┐
                             │
                  (other 7 voices) ─► GainNode (master) ─► destination
```

Per voice the JS layer maintains:

- The decoded `AudioBuffer`
- A persistent track-level `GainNode` (8 total, never recreated)
- A reference to the **currently sounding** source + its fade gain (for choke)

The master `GainNode` and per-track `GainNode`s are wired once at boot and only have their `.gain.value` mutated thereafter.

---

## 8. Triggering and Choke

When the scheduler decides voice `v` should fire at audio time `t`:

1. If a previous source for voice `v` is still sounding, ramp its **fade gain** from 1 to 0 over ~3 ms starting at `t - 0.003`, then call `.stop(t)` on that source.
2. Create a fresh `AudioBufferSourceNode` and a fresh fade `GainNode` (gain = 1). Connect: source → fade gain → track gain.
3. Call `source.start(t)`.
4. Store the new source + fade gain as voice `v`'s current sounding pair.

`AudioBufferSourceNode` is one-shot by design — after it finishes (`onended`), drop the reference so the GC reclaims it. The ~3 ms ramp prevents click artifacts on choke.

---

## 9. Clock Source & Scheduler

The scheduler does not own its clock. It consumes ticks from a `ClockSource`, which is a small interface with one v1 implementation (`InternalClock`) and two future ones (`MidiSlaveClock`, plus an output-side `MidiMasterEmitter` that piggybacks on the internal clock). This split is the single most important future-proofing decision in the spec — it isolates timing concerns from sequencing concerns and means MIDI clock sync slots in without touching Rust or the audio graph.

### Clock source interface

```ts
interface ClockSource {
  start(audioCtx: AudioContext): void;        // user-gesture-safe entry
  stop(): void;
  // Emits ticks. Each tick says: "advance the scheduler's horizon to this
  // global step, and these are the audio times to use for steps up to it."
  // For InternalClock this fires every LOOKAHEAD_MS via setInterval.
  // For MidiSlaveClock it fires on each incoming MIDI 0xF8 clock byte.
  onTick(handler: (tick: ClockTick) => void): void;
}

interface ClockTick {
  horizonStep: number;        // global step counter; pull_events called with this
  stepToAudioTime: (step: number) => number;  // converts step index → AudioContext time
}
```

The scheduler is then trivially source-agnostic:

```ts
clock.onTick(({ horizonStep, stepToAudioTime }) => {
  const events = resound.pull_events(horizonStep);
  for (let i = 0; i < events.length; i += 2) {
    const voice = events[i];
    const step  = events[i + 1];
    triggerVoice(voice, stepToAudioTime(step));
  }
});
```

### InternalClock (v1)

Standard lookahead pattern (Chris Wilson, "A Tale of Two Clocks"):

```
LOOKAHEAD_MS    = 25    // setInterval cadence
SCHEDULE_AHEAD  = 0.1   // seconds of audio to schedule ahead
```

State held:

- `audioCtx`
- `transportStartTime` (AudioContext time of step 0 in the current play session)
- `bpm` (read from Rust each tick)

On each `setInterval` invocation, compute `horizonStep` as the largest step whose start time is less than `audioCtx.currentTime + SCHEDULE_AHEAD`, and provide `stepToAudioTime(step) = transportStartTime + (step * 60) / (bpm * 4)`. Emit a tick.

Step duration in seconds is `60 / bpm / 4` (sixteen 16ths per four beats per bar).

**BPM changes mid-playback:** the formula above re-derives the audio time for any future step using the *current* BPM. To avoid retroactive smearing, when BPM changes we re-anchor: snap `transportStartTime` so that the *next unscheduled step* still lands at its computed audio time, then proceed. Events already committed to the Web Audio scheduler are not rescheduled — they fire at their old times, which is acceptable behavior at the lookahead boundary.

### Future clock sources (not implemented in v1, but contract supports them)

- **`MidiSlaveClock`** — listens to a `MIDIInput`. Each incoming `0xF8` advances a fractional step counter by 1/6 (24 PPQN = 6 ticks per 16th note). On step crossings, emits a tick whose `stepToAudioTime` converts the MIDI message timestamp (`performance.now()` domain) to AudioContext time via the offset captured from `AudioContext.getOutputTimestamp()`. Start/Continue/Stop map to `play()` / `play()` from current position / `stop()`. Song Position Pointer (`0xF2`) calls `set_position()`.
- **`MidiMasterEmitter`** — composes alongside `InternalClock`, not as a replacement. It schedules 24 outgoing `0xF8` per beat through `MIDIOutput.send(data, whenAsPerformanceTime)` from the same lookahead window. Sends `0xFA` on play, `0xFC` on stop.

---

## 10. Sample Bundling

Each WAV is included at compile time:

```rust
const KICK:       &[u8] = include_bytes!("../samples/kick.wav");
const SNARE:      &[u8] = include_bytes!("../samples/snare.wav");
// ... etc
```

`sample_bytes(voice)` returns a `Vec<u8>` (one-time copy into JS land at boot). JS calls `audioCtx.decodeAudioData()` on each, storing the resulting `AudioBuffer` indexed by voice.

WAV format requirements: 16- or 24-bit PCM, 44.1 or 48 kHz, mono or stereo. `decodeAudioData` handles all of these and resamples to the AudioContext rate as needed. Expect the kit to add roughly 0.5–2 MB to the final `.wasm` binary depending on sample length — acceptable per the bundling choice.

---

## 11. UI Layout

Single-page layout, designed around a ~1024 px minimum width target:

```
┌───────────────────────────────────────────────────────────────┐
│  [▶ Play]  [■ Stop]    BPM: [120]    Master: [────o────]      │
├───────────────────────────────────────────────────────────────┤
│  Kick        [──o──]   ■ □ □ □ ■ □ □ □ ■ □ □ □ ■ □ □ □         │
│  Snare       [──o──]   □ □ □ □ ■ □ □ □ □ □ □ □ ■ □ □ □         │
│  Clap        [──o──]   □ □ □ □ ■ □ □ □ □ □ □ □ ■ □ □ □         │
│  Lo Tom      [──o──]   ...                                     │
│  Hi Tom      [──o──]   ...                                     │
│  Closed Hat  [──o──]   □ ■ □ ■ □ ■ □ ■ □ ■ □ ■ □ ■ □ ■         │
│  Open Hat    [──o──]   ...                                     │
│  Cymbal      [──o──]   ...                                     │
└───────────────────────────────────────────────────────────────┘
       beat boundaries every 4 steps (subtle gutter)
       current step column highlighted via playhead overlay
```

UI conventions:

- Step cell: ~40 px square, rendered as `<button>` for free keyboard support and accessibility
- Beat boundary (every 4 steps): small vertical gap or rule
- Active step: filled accent color
- Playhead: column-wide overlay updated each rAF
- Track level: horizontal fader per row
- Master level: horizontal fader top-right
- BPM: numeric `<input type="number">` plus +/- buttons (drag-to-scrub deferred)

On tablet, touch targets are sized generously enough for finger input. On phones it works but the layout will need horizontal scrolling — not addressed in v1.

---

## 12. State Model (Rust)

```rust
pub struct Resound {
    pattern: [[bool; 16]; 8],         // [voice][step]
    track_levels: [f32; 8],           // 0.0..=1.0
    master_level: f32,                // 0.0..=1.0
    bpm: f32,
    transport: Transport,
    sample_names: [&'static str; 8],
    sample_bytes: [&'static [u8]; 8],
}

enum Transport {
    Stopped,
    Playing {
        next_unpulled_step: u32,      // global; pattern position = step % 16
        current_step: u32,            // global; for UI; advanced by `current_step()` reads
    },
}
```

The pattern loops every 16 steps; `% 16` gives the position within the bar.

---

## 13. Boot Sequence

1. Browser loads `index.html`, Vite bundle, WASM module.
2. JS constructs a `Resound` instance.
3. JS calls `sample_count()`, then iterates `sample_bytes(i)` for `i in 0..8`.
4. Each byte array is passed to `audioCtx.decodeAudioData()` (in parallel via `Promise.all`).
5. UI renders empty grid, mixer, transport. All controls bind their initial values from Rust getters.
6. **Autoplay policy:** browsers require a user gesture before audio can start. The Play button handler calls `audioCtx.resume()` before `resound.play()`.
7. Hitting play sets transport to `Playing`, anchors `transportStartTime = audioCtx.currentTime`, and starts the scheduler `setInterval`.

---

## 14. Testing

The Rust core is pure and time-independent — all tests are plain `#[cfg(test)]` units:

- Pattern toggle/set/clear behaves correctly
- BPM round-trips
- `pull_events` returns the right events for a given step horizon and advances the cursor exactly once per event
- Playing → stopping resets the relevant counters

The JS layer is harder to test end-to-end, but the scheduler module can be unit-tested with a stubbed `AudioContext`.

---

## 15. Build & Dev Workflow

**Dev:**

```bash
# Terminal 1 — Rust watch
cd src/crate
cargo watch -s "wasm-pack build --target web --out-dir ../web/wasm --dev"

# Terminal 2 — Vite
cd src/web
pnpm dev
```

**Production:**

```bash
cd src/crate && wasm-pack build --release --target web --out-dir ../web/wasm
cd src/web && pnpm build
```

Output lands in `src/web/dist/` — a folder of static files deployable to any static host (GitHub Pages, Cloudflare Pages, S3, etc.).

---

## 16. Future Direction (Roadmap)

v1 ships only what's in §2, but the architecture is deliberately shaped to absorb the following without rewrites. Each item lists what changes and what stays.

### 16.1 Envelopes (amp / pitch / filter)

**Change:** Rust state gains per-voice envelope parameters (attack, decay, etc.). JS reads them on each trigger and applies via Web Audio `AudioParam` automation (`setValueAtTime` + `linearRampToValueAtTime` on the per-voice gain; `playbackRate` for pitch envelopes; insert a `BiquadFilterNode` per voice for filter envelopes).

**Stays:** scheduler, clock, choke logic, `pull_events` contract.

### 16.2 Web Audio–native effects (filter, distortion, reverb)

**Change:** insert `BiquadFilterNode`, `WaveShaperNode`, `ConvolverNode` into per-voice or master chains. Add the corresponding parameters to Rust state.

**Stays:** everything else. The per-voice chain in §7 was designed to accept inserted nodes.

### 16.3 Custom DSP in Rust (audio thread)

The point at which Rust starts processing actual sample frames.

**Change:** add an `AudioWorkletProcessor` hosting a second WASM artifact compiled from the same Rust crate (separate `[lib]` target or workspace member, reusing the `pattern`/`mixer`/`transport` modules via the `rlib` form). The main-thread `Resound` instance remains state-of-truth; the worklet receives parameter updates via `MessagePort` (or `SharedArrayBuffer` for lock-free updates). DSP code is `no_std`-friendly, takes block buffers as input/output.

**Stays:** Rust core modules (reused via `rlib`), UI, clock source / scheduler split.

This is where the `crate-type = ["cdylib", "rlib"]` decision pays off.

### 16.4 MIDI clock sync (slave & master)

**Change:** add `MidiSlaveClock` and `MidiMasterEmitter` as described in §9. Add a UI "Clock Source" toggle (Internal / MIDI Slave). Add `set_position()` wiring for Song Position Pointer. Request Web MIDI access on first toggle to MIDI mode (gated user gesture).

**Stays:** Rust core, scheduler, audio graph, UI grid, choke. The clock-source interface is the entire integration surface.

Web MIDI browser support: Chrome / Edge / Safari (recent). Firefox requires a flag. Fail gracefully if `navigator.requestMIDIAccess` is unavailable — disable the toggle, keep internal clock.

Hardware-compatibility gotcha: implement *both* Start (reset-from-zero) and Continue + Song Position Pointer (mid-pattern resync) — gear like Elektrons and MPCs rely on the latter.

### 16.5 Freesound sample integration

Browse, audition, and assign samples from [freesound.org](https://freesound.org) to any of the 8 voice slots. The fixed kit becomes a default; any voice's sample can be replaced at runtime. The pattern itself is sample-agnostic — "voice N fires at step M" doesn't care what voice N currently sounds like.

This is the first roadmap item with a backend component. The backend exists for one reason only: Freesound's API requires credentials that cannot be embedded in the client.

**Backend (new, minimal).** A stateless HTTP proxy. Suitable hosts: Cloudflare Workers, Vercel Edge Functions, a tiny Rust `axum` service, a Node `fastify` app — the surface is small enough that any of these works. Endpoints:

- `GET /api/freesound/search?q=&filter=&page=` → forwards to `https://freesound.org/apiv2/search/text/`, attaches the server-side API token, returns the JSON.
- `GET /api/freesound/sound/:id` → forwards to `/apiv2/sounds/:id/`, attaches token, returns JSON.
- `GET /api/freesound/audio/:id` → fallback only. Freesound preview URLs (mp3/ogg, ~192 kbps) may be fetchable directly from the browser; if CORS turns out to be missing on those URLs, the proxy streams the audio through. Confirm at implementation time before deciding whether to ship this endpoint.

Holds `FREESOUND_API_TOKEN` as an environment variable. Rate-limits to protect the API quota. **Stores nothing** — no database, no auth, no caching of sounds or patterns. Single-purpose credential boundary.

(API key only — no OAuth2 needed. OAuth2 is required for original-quality downloads and per-user data, neither of which a step sequencer needs. Previews are sufficient.)

**Frontend changes:**

- The JS sample registry, currently `samples: AudioBuffer[8]` populated once at boot, becomes mutable per voice. New operation: `assignSampleToVoice(voiceIndex, source)` where `source` is either the default bundled sample or a Freesound sound ID.
- New "Browse Freesound" panel: search box, results list with name / duration / license / preview play button, "Assign to voice N" action.
- Each voice slot displays its currently-loaded sample name and license badge (Freesound returns the CC license per sound — CC0, CC-BY, CC-BY-NC, etc.).
- Per-voice load states (loading, ready, error) since fetches are async and can fail (404, removed, network).
- Optional polish: IndexedDB cache for decoded buffers across sessions. Not architectural, just an optimization to avoid re-fetching.

**Rust changes:** none. The Rust core has no opinion about what audio plays for each voice — that mapping has always been JS-side. The `pattern[voice][step]` model survives untouched.

**Default kit:** stays bundled in the WASM binary. Freesound is additive — replacing a voice's sample is an explicit user action. The app boots fully functional offline; Freesound integration is a network-dependent extension layered on top.

**Stays:** Rust core entirely. Scheduler. Clock source. Audio graph topology. Choke. UI grid. The only frontend module that meaningfully changes is the sample registry.

**Licensing & attribution caveat** (not architectural, but worth surfacing now): if pattern save/share (§16.7) ever lands alongside Freesound, the export needs to handle CC-BY attribution. The Freesound API returns the license and the original uploader — capture both at assignment time so they're available later. Design pattern export with this in mind.

### 16.6 Sample-accurate sequencing (sequencer in the worklet)

The eventual move for live-performance-grade timing. Requires meaningful refactor regardless of language.

**Change:** sequencing moves into an `AudioWorkletProcessor`. The worklet calls into a WASM-compiled sequencer with the same `pull_events(until_step)` contract used by the main-thread JS scheduler today. Main thread becomes a UI/state surface that mutates pattern state and forwards mutations to the worklet (via `MessagePort` or shared memory).

**Stays:** `pull_events` semantics. Pattern / transport / mixer modules. Audio graph structure. UI.

This is the only roadmap item that touches the Rust↔JS contract in a non-additive way, and even there the function signature is preserved.

### 16.7 Roadmap items not yet architected

These are deferred features that don't reshape the architecture — they're additive to existing modules: per-step velocity/accent, swing, mute/solo, pattern save/load, multi-kit, undo/redo, pattern chaining, MIDI note in/out. Each is a feature ticket, not a design question.

---

## 17. Locked Defaults

v1 boots with these values, hardcoded in `Resound::new()`:

- **BPM range:** 40–240. BPM defaults to 120. Min/max enforced in the Rust setter.
- **Level scale:** linear 0.0–1.0 internally, displayed as 0–100 in the UI. dB scale deferred.
- **Default pattern on boot:** kick (voice 0) on step 0; all other 127 steps off. A single hit on play confirms audio is working without committing the user to a full rhythm they need to clear.
- **Default master / track levels on boot:** master 0.8, each track 0.8.
- **Stop behavior:** stop resets the playhead to step 0. (Pause-and-resume from current step is deferred — not worth the transport-state complexity in v1.)
