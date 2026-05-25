# Resound — Technical Specification (v2)

## 1. Overview

v2 builds directly on the v1 architecture (Rust core in WASM, TS audio engine, HTML/CSS UI). Only changes are documented here; sections not mentioned (clock source / scheduler split, choke logic, audio context lifecycle, project layout, MIDI roadmap) are inherited unchanged from v1.

Headline additions:

- A **sample pool**: a bundled, read-only catalog of samples, browsable by the user.
- Multiple **built-in kits**, each defined as a mapping from voices to pool samples. Read-only. Kits carry no pattern data in v2 — loading a kit replaces sounds, leaving the current pattern alone.
- **Two ways to assign a sample to a voice**: load a kit (all 8 at once), pick one sample from the pool (single voice).
- **User-renamable tracks**.
- **Per-step velocity and pitch**.
- **Global swing** (promoted from deferred to v2 in-scope).
- Explicit clear/reset operations: clear pattern, clear track sample, reset all.

Headline removal:

- **Freesound integration (v1 §16.5) is dropped from the roadmap entirely.** Freesound's terms of service prohibit the kind of API-key proxying and redistribution that integration would require. The sample pool covers the discoverability need; the eventual user-upload path (now deferred — see §18) will cover the rest.

What users *cannot* do in v2: add samples to the pool, edit existing pool samples, create new kits, or edit existing kits. The pool and the kit roster are compile-time content. User-authored kits and pool extension are a clean future addition (§18) but out of scope here.

---

## 2. Feature Scope (v2)

**In scope (additions over v1):**

- Sample pool of 16 samples, bundled into the WASM binary.
- 2 built-in kits referencing pool samples. Kits in v2 carry only voice assignments — no pattern, no global settings.
- Kit picker: load a kit replaces all 8 voice assignments and track names. Pattern, voice levels, BPM, swing, and master are untouched.
- Per-track sample browser: pick any pool sample for that voice. Preview before assigning.
- Per-track display name, editable inline.
- Per-step velocity (0.0–1.0).
- Per-step pitch (±24 semitones).
- Global swing (50%–75%).
- Three clear/reset operations: clear pattern, clear track sample, reset all.
- Global undo / redo across all musical state changes, bounded stack, standard keyboard shortcuts.

**Deferred to later versions:**

- User-created kits (saving the current 8-voice arrangement as a named kit).
- Pool extensions / user-added pool samples.
- Mute / solo per track.
- Pattern chaining, song mode.
- MIDI in / out, export.
- Mobile-optimized UI.
- User-uploaded samples (loading local audio files into a voice). Deferred — the architecture leaves a natural place to add it later (§18).
- ~~Freesound integration~~ — **removed entirely**, not deferred.

**Non-goals (carried forward from v1):**

- Drum synthesis. Resound remains sample-based. Per-step pitch is implemented as `playbackRate` on the sample — sample manipulation, not synthesis.

---

## 3. Architecture Deltas

No layer changes. The Rust core, TS audio engine, and HTML/CSS UI keep the same boundaries from v1.

- Rust still owns all musical state, knows nothing about audio time, and remains the source of truth.
- The `ClockSource` / scheduler / audio-graph split is unchanged.
- The `pull_events` contract is shape-preserving; the per-event payload grows to include velocity and pitch.

Structural additions:

- Rust now owns a static `POOL: &[PoolSample]` and a static `KITS: &[Kit]`. The pool is the single source of truth for sample bytes; kits reference pool entries by ID.
- Per voice, Rust tracks which pool sample is currently assigned (`voice_pool_samples: [String; NUM_VOICES]`, the sample's name; `NUM_VOICES = 8` — declared in §4). Loading a kit and individual pool-sample picks both mutate this array.
- The JS audio engine maintains a **pool buffer cache** keyed by sample name — decoded once at boot, never re-decoded. When playing voice N, the engine looks up the buffer by `voice_pool_samples[N]`.

This means swapping a voice's sound (via kit load or individual pool pick) costs essentially nothing at runtime — it's a pointer update, not a decode.

---

## 4. Sample Pool & Kits

### Pool data model

```rust
struct PoolSample {
    name: &'static str,   // filename without extension; serves as the stable key
    bytes: &'static [u8],
}

static POOL: &[PoolSample] = &[
    PoolSample { name: "909_kick",      bytes: include_bytes!("../samples/909_kick.wav") },
    PoolSample { name: "808_kick",      bytes: include_bytes!("../samples/808_kick.wav") },
    PoolSample { name: "acoustic_kick", bytes: include_bytes!("../samples/acoustic_kick.wav") },
    // ... 16 entries total
];
```

The sample's `name` is the audio file's basename (extension stripped). It serves as **the** identifier — used in kit JSON, the Rust↔JS API, and JS-side caches. There is no separate numeric pool ID; names are the only key. Filenames are inherently unique within a directory, so curator discipline already enforces uniqueness; we don't need a separate constraint or validation pass.

Array order within `POOL` is the iteration order for the sample browser UI. Reordering the static array changes display order but does not break existing kit JSON files (which reference by name).

### Kit data model

```rust
/// Voice count is fixed for v2. All voice-indexed arrays use this constant
/// rather than the bare literal, so future changes (unlikely) touch one
/// place rather than dozens.
pub const NUM_VOICES: usize = 8;

struct Kit {
    name: String,
    voice_samples: [String; NUM_VOICES],   // pool sample names, one per voice
}

// Built-in kits are authored as JSON files (see "Authoring kits as JSON"
// below) and embedded into the binary. Rust parses each at boot into a
// runtime `Kit`. The two contrast strongly in feel (electronic vs. one
// other style; content is a curator decision).
struct KitSource {
    name: &'static str,    // for the UI picker, available before parse
    json: &'static str,    // include_str! of the kit JSON file
}

static KIT_SOURCES: &[KitSource] = &[
    KitSource { name: "909",     json: include_str!("../kits/909.json") },
    KitSource { name: "Hip-Hop", json: include_str!("../kits/hip-hop.json") },
];
```

Kits do not carry sample bytes. They reference the pool. A sample used in two kits costs binary size once.

Track names are derived from the referenced pool sample's `name`. Kits do not override names — if a kit wants a specific label, rename the underlying pool sample. Keeps the data model lean.

### Authoring kits as JSON

Kits are authored as JSON files in the crate's source tree and embedded into the WASM binary via `include_str!`. v2 kit files carry only the kit's display name and the voice→sample mapping; per-kit default patterns are a future addition (§17).

```
src/crate/kits/
├── 909.json
└── hip-hop.json
```

Minimal kit JSON schema:

```json
{
  "name": "909",
  "voices": [
    "909_kick",
    "909_snare",
    "909_clap",
    "909_lo_tom",
    "909_hi_tom",
    "closed_hat",
    "open_hat",
    "909_crash"
  ]
}
```

`name` is the display label shown in the kit picker. `voices` is an array of exactly 8 pool sample names, in fixed voice-slot order. Each name must resolve to an entry in `POOL` (validated at boot — a failed lookup is a build-time error, not a runtime one, since these files ship with the binary).

At boot, Rust parses each embedded kit JSON into the runtime `Kit` struct shown above. A small JSON crate is fine for this — `serde_json` or `serde-json-wasm` both work; the choice is an implementation detail. Parsing 2 small kit JSONs takes microseconds.

**Voice-slot ordering is convention, not constraint.** Without categories on the pool side (above), nothing in the data model says "voice 0 is the kick-like one." But every kit follows the same ordering — kick, snare, clap, lo tom, hi tom, closed hat, open hat, crash — so switching kits doesn't reshuffle the UI's rows. The kit curator maintains this by hand.

### Kit loading semantics

`set_active_kit(kit_id)`:

1. `active_kit = kit_id`
2. `voice_pool_samples = KITS[kit_id].voice_samples` (clone the 8 name strings)
3. `track_names = voice_pool_samples.clone()` — each track's display name is its sample's name; user can rename freely afterward
4. `kit_modified = false`

The pattern, voice levels, BPM, swing, master level, and transport state are all left untouched. A kit is a sound set; loading it swaps the sounds, nothing else.

JS side, on kit-load notification:
- Re-points the eight `voiceBuffers[v]` to `poolBuffers.get(voice_pool_samples[v])`. No decode needed (pool was decoded at boot).
- Re-renders the track-row labels and kit selector state. The pattern grid doesn't need re-rendering (the pattern didn't change), only the row headers.

### Individual pool-sample assignment

`set_voice_pool_sample(voice, name)`:

1. Validate `name` exists in `POOL`. If not, the call is a no-op (or returns false / panics — implementation choice; the JS layer should only ever pass valid pool names).
2. `voice_pool_samples[voice] = name`
3. `track_names[voice] = name` (unless user has manually renamed — see §7)
4. `kit_modified = true`

JS side:
- Re-points `voiceBuffers[voice]` to `poolBuffers.get(name)`.

The pattern is preserved entirely. Velocity, pitch, on/off state — all sample-agnostic, all untouched.

### Kit-modified state

Loading a kit clears the modified flag. Any individual voice's sample change (pool pick) sets it. The UI displays the kit name with a "(modified)" suffix when the flag is set, e.g., `Kit: 909 (modified)`.

This is purely cosmetic — no behavior depends on it. The flag exists so the user knows the current arrangement isn't a clean kit.

---

## 5. Pattern & Step Data

v1's `[[bool; 16]; NUM_VOICES]` expands to:

```rust
#[derive(Copy, Clone)]
struct Step {
    on: bool,
    velocity: f32,  // 0.0..=1.0
    pitch: f32,     // semitones, -24.0..=24.0
}

// Inside Resound:
pattern: [[Step; 16]; NUM_VOICES],
```

**Toggle-off semantics.** When a step is toggled off, its `velocity` and `pitch` are *preserved*. Toggling back on restores them. This lets a user scrub through "what if step 7 weren't here" without losing per-step tweaks. `clear_pattern` does reset velocity/pitch to defaults.

**Defaults for newly-activated steps.** A step that transitions from off to on without prior non-default values gets `velocity = 0.8`, `pitch = 0.0`. The 0.8 matches v1's default track/master levels — headroom, no immediate clipping.

---

## 6. Loading Samples from the Pool

User assigns a pool sample to a voice through a per-track sample browser.

UI flow:

1. User clicks a track's sample-browser affordance (`📁` on the track row).
2. A pool browser opens listing all pool samples (see §17).
3. User can preview any sample (▶ play button).
4. Clicking a sample's name assigns it to the voice. The browser closes.
5. JS calls `set_voice_pool_sample(voice, name)`; track name updates to the new sample's name; the voice's audio buffer re-points to the cached decoded pool buffer.

The pattern is preserved across sample changes. Velocity, pitch, on/off — all sample-agnostic.

### Reverting an individual pick

"Clear track sample" (§10) on a voice that's been individually re-assigned reverts that voice to the current kit's sample for that slot. Implementation queries the runtime `Kit` for `voice_samples[voice]`, calls `set_voice_pool_sample(voice, kit_sample_name)`.

---

## 7. Track Names

Each track has a name displayed on its row. Name sources, in priority order:

1. User-set name (explicit rename via the inline edit input). Sticks until next overwriting event.
2. Most recent overwriting event, in order of recency:
   - Kit load → all 8 names set from the kit's referenced pool sample names.
   - Individual pool-sample pick for voice N → that voice's name set from the picked sample's name.
   - `clear_track_sample(voice)` → that voice's name set from the kit's sample name for that voice.

Crucially: each of (kit load, pool pick, clear) overwrites any prior user-set name. There's no "user rename stickiness across kit changes" — the cost of tracking that is more than the benefit. If a user renames, then later loads a kit, the kit's names win.

Rust stores:

```rust
track_names: [String; NUM_VOICES]
```

UI: clicking the name turns it into a text input. Enter / blur commits. Max length 32 characters; empty submission silently reverts to the prior name.

---

## 8. Per-Step Velocity & Pitch — UI Proposal

The hard question. v1 step cells were binary: filled or empty. v2 needs to show and let users edit two additional per-step values without making the grid unreadable.

### Options considered

**A. Mode toggle on the grid.** Steps / Velocity / Pitch mode picker. *Rejected:* hidden state ("why isn't my click toggling?") and modal feel is fiddly.

**B. Per-cell inline controls (tiny sliders).** *Rejected:* unreadable at 40 px, unusable on touch.

**C. Hover/focus popover per step.** Works but adds a click for every adjustment and degrades on touch.

**D. Drag-to-adjust on the cell + a step inspector strip below the grid.** *Recommended.*

### Recommended design (Option D)

**Visual encoding in the cell, always on:**

- *Velocity* as fill height inside the cell — full-height fill = 1.0, 30%-height = 0.3. Reads at a glance, gives the grid a satisfying "loud / quiet" texture.
- *Pitch* as a small numeric overlay in the corner of the cell, shown only when pitch ≠ 0 (e.g., `+3`, `-7`). Default pitch keeps the cell visually clean.

**Direct manipulation:**

- *Click* a cell → toggle on/off.
- *Vertical drag* on a lit cell → adjust velocity (fill height follows cursor).
- *Shift + vertical drag* on a lit cell → adjust pitch.
- *Click* a lit cell without dragging → "select" it (distinctive border) → inspector strip appears.

**Step inspector strip (below the grid, only when a step is selected):**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kick / Step 9    Velocity [───o─────] 82    Pitch [─o───────] -3   [✕]│
└──────────────────────────────────────────────────────────────────────┘
```

Sliders for precise values. Keyboard with the inspector focused: `↑`/`↓` adjust velocity by 0.01, `Shift+↑`/`↓` adjust pitch by 1 semitone, `Alt+↑`/`↓` adjust pitch by 1 cent. `Esc` deselects.

Selection is UI-side state only — Rust doesn't know which step is "selected."

### Why this design

- **Discoverable.** A new user clicking a step still gets the v1 behavior. Drag is learnable via a hover hint; the inspector is always available as a fallback.
- **Direct.** Power users get drag-to-adjust, matching FL Studio / Ableton drum-rack muscle memory.
- **Touch-friendly.** Drag works on tablet. The inspector also works on tablet. Only Shift-drag is keyboard-dependent — touch users use the inspector for pitch.
- **Extensible.** When envelopes / per-step probability / per-step retrigger arrive later, they slot into the inspector without further grid redesign.

---

## 9. Swing

Global, single value, applied as a timing modification at scheduling time.

### Model

```rust
swing: f32,  // 0.5..=0.75
```

- `0.5` = straight (no swing).
- `0.66` ≈ MPC-style triplet swing.
- `0.75` = max, heavy shuffle.

Clamp in the setter; UI exposes a slider or numeric input next to BPM in the transport bar.

### Scheduling

Swing delays every second 16th note (odd-indexed within a pair). The scheduler's `stepToAudioTime` accounts for it:

```ts
function stepToAudioTime(
  step: number,
  startTime: number,
  bpm: number,
  swing: number,
): number {
  const stepDur = 60 / bpm / 4;
  const pairIdx = Math.floor(step / 2);
  const isOddInPair = step % 2 === 1;
  const pairStart = startTime + pairIdx * 2 * stepDur;
  return isOddInPair
    ? pairStart + 2 * stepDur * swing
    : pairStart;
}
```

At `swing = 0.5`: odd steps land at `pairStart + stepDur` (v1 behavior). At `swing = 0.75`: odd steps push three-quarters into the pair, giving heavy shuffle.

### Behavioral notes

- Swing changes mid-playback re-derive audio time for *future* steps via the lookahead window. Steps already committed to Web Audio fire at their old times. Same trade-off as BPM changes in v1.
- Swing is independent of BPM — adjusting one doesn't affect the other.
- Swing lives in Rust state alongside BPM, mirroring v1's "Rust is the source of truth for musical parameters even though it doesn't deal with audio time directly."

---

## 10. Clear & Reset Operations

| Operation | What stays | What resets |
|---|---|---|
| **Clear pattern** | Active kit, voice pool assignments, track names, levels, BPM, swing | All step `on` flags → false; all velocity → 0.8; all pitch → 0.0 |
| **Clear track sample** (per track) | Pattern, levels, BPM, swing, kit, other tracks | This voice reverts to the current kit's assigned pool sample for that slot; track name reverts to that sample's name |
| **Reset all** | Nothing | Active kit → 0; voice assignments → kit 0; pattern → the initial-boot pattern (voice 0 step 0 on, all other steps off — see §16); track names → kit 0's names; levels → 0.8; master → 0.8; BPM → 120; swing → 0.5; transport → stopped; kit_modified → false |

### UI placement

- **Clear pattern** — button near the kit picker, single-click, no confirmation. Recoverable enough that confirming would annoy.
- **Clear track sample** — small icon in each track row, visible only when that track's voice has been individually re-assigned (i.e., its current pool sample differs from the active kit's voice slot).
- **Reset all** — behind a `⋮` menu in the transport area. Confirmation: "Reset everything to defaults? Your pattern will be lost."

### Rust API

```rust
pub fn clear_pattern(&mut self);
pub fn clear_track_sample(&mut self, voice: u32);  // reverts voice's pool sample to the active kit's slot, restores name
pub fn reset_all(&mut self);
```

---

## 11. Undo / Redo

Global, single-level undo/redo over all user-initiated state changes. Standard keyboard shortcuts. Bounded stack depth.

### What's undoable

Every operation that mutates persistent musical state:

- Toggle a step on/off.
- Change a step's velocity or pitch (per coalesced gesture — see below).
- Change a track level, master level, BPM, or swing (per coalesced gesture).
- Load a kit.
- Pick a pool sample for a voice.
- Revert a voice to the active kit's sample for that slot.
- Rename a track.
- Clear pattern.
- Reset all. The confirmation dialog protects against accidents; undo is the secondary safety net.

What's *not* undoable (transient or UI state):

- Play, stop, set position.
- Step selection in the inspector, sample browser open/close.
- Preview playback in the sample browser.

### Coalescing continuous edits

A velocity drag inside a cell, a BPM scrub, or a fader slide fires many updates in rapid succession. Each one becoming its own undo entry would mean pressing undo fifty times to back out a single gesture.

Continuous edits use a begin/end lifecycle:

- On mouse-down / touch-start / focus on a continuous control, the UI captures a "before" snapshot.
- Intermediate values during the gesture don't push to the stack.
- On mouse-up / touch-end / blur, the UI commits a single undo entry whose "before" is the captured snapshot.

Discrete actions (toggling a step, picking a sample from the browser, loading a kit) commit immediately — no begin/end needed.

### Stack model

Two stacks: an **undo stack** and a **redo stack**. Each entry is a state snapshot.

- A new undoable action: push the *before* snapshot onto undo; clear redo.
- Undo: pop undo, push current onto redo, restore the popped snapshot.
- Redo: pop redo, push current onto undo, restore the popped snapshot.

Both stacks cap at 100 entries. Older entries fall off when the cap is exceeded — standard behavior for any bounded undo system.

### Where state lives

Mirrors the v1 invariant that Rust owns musical state. Rust exposes a serialize / restore pair:

```rust
pub fn serialize_snapshot(&self) -> Vec<u8>;
pub fn restore_snapshot(&mut self, blob: Vec<u8>) -> bool;  // false on malformed blob
```

The blob captures everything in `Resound` except the transport state — active playback and current step aren't undoable. The format is internal to Rust; JS treats it as opaque bytes. Implementation can use a manual binary layout or a serde codec like `postcard` — invisible across the boundary either way.

The undo / redo stacks themselves live in JS. Each entry is just a `Uint8Array` — the Rust blob. No JS-side state needs separate tracking; without custom uploads, the entire undoable state lives in Rust.

### Keyboard shortcuts

- Ctrl/Cmd+Z → undo
- Ctrl/Cmd+Shift+Z → redo (also Ctrl+Y on Windows for muscle memory)

Shortcuts are gated: they don't fire when a text input has focus (track-name editing, BPM input). Typing into the BPM field should let the user backspace a digit, not undo the pattern.

### UI affordance

Undo and redo buttons in the transport area, near the kit picker. Disabled when their respective stacks are empty; tooltips show the keyboard shortcut. The `⋮` menu lists them as named items too, for discoverability.

### Edge cases

- **Undo during playback.** Works. The pattern changes underneath the scheduler; events already committed to Web Audio fire as scheduled, future events use the restored pattern. Same model as any other mid-playback edit.
- **Stack overflow.** Entries falling off the bottom of the cap are silently lost; no warning. Matches universal undo behavior.

---

## 12. Updated Rust State

```rust
pub struct Resound {
    active_kit: u32,
    kit_modified: bool,
    voice_pool_samples: [String; NUM_VOICES],   // current sample name per voice
    pattern: [[Step; 16]; NUM_VOICES],
    track_levels: [f32; NUM_VOICES],
    track_names: [String; NUM_VOICES],
    master_level: f32,
    bpm: f32,
    swing: f32,
    transport: Transport,
}

#[derive(Copy, Clone)]
struct Step {
    on: bool,
    velocity: f32,
    pitch: f32,
}

// Transport enum unchanged from v1.
```

Static tables `POOL: &[PoolSample]` and `KITS: &[Kit]` live at module scope, not inside `Resound`.

---

## 13. Updated Rust API

Pre-existing methods from v1 (`toggle_step`, `set_step`, `is_step_on`, `set_track_level`, `track_level`, `set_master_level`, `master_level`, `set_bpm`, `bpm`, `play`, `stop`, `is_playing`, `set_position`, `current_step`, `clear_pattern`) keep the same signatures.

**Pool API (new, replaces v1's voice-indexed sample API):**

```rust
pub fn pool_sample_names(&self) -> Vec<String>;  // iteration order = pool array order
pub fn pool_sample_bytes(&self, name: &str) -> Vec<u8>;
```

**Kit API (new):**

```rust
pub fn kit_count(&self) -> u32;
pub fn kit_name(&self, kit_id: u32) -> String;
pub fn kit_json(&self, kit_id: u32) -> String;        // raw embedded JSON for round-tripping
pub fn active_kit(&self) -> u32;
pub fn kit_modified(&self) -> bool;
pub fn set_active_kit(&mut self, kit_id: u32);  // see §4 semantics
```

**Per-voice sample assignment (new):**

```rust
pub fn voice_pool_sample(&self, voice: u32) -> String;           // current sample name
pub fn set_voice_pool_sample(&mut self, voice: u32, name: String);
```

**Per-step velocity / pitch (new):**

```rust
pub fn set_step_velocity(&mut self, voice: u32, step: u32, velocity: f32);  // 0..=1
pub fn step_velocity(&self, voice: u32, step: u32) -> f32;
pub fn set_step_pitch(&mut self, voice: u32, step: u32, semitones: f32);    // -24..=24
pub fn step_pitch(&self, voice: u32, step: u32) -> f32;
```

**Swing (new):**

```rust
pub fn set_swing(&mut self, swing: f32);  // clamped 0.5..=0.75
pub fn swing(&self) -> f32;
```

**Track names (new):**

```rust
pub fn track_name(&self, voice: u32) -> String;
pub fn set_track_name(&mut self, voice: u32, name: String);
```

**Clear / reset (new entries; `clear_pattern` already exists):**

```rust
pub fn clear_track_sample(&mut self, voice: u32);
pub fn reset_all(&mut self);
```

**Undo / redo support (new):**

```rust
pub fn serialize_snapshot(&self) -> Vec<u8>;
pub fn restore_snapshot(&mut self, blob: Vec<u8>) -> bool;  // false on malformed blob
```

The Rust side knows nothing about the stack itself — JS owns the undo and redo stacks (§11). Rust only round-trips full state.

### `pull_events` payload change

Events now carry velocity and pitch alongside voice and step. The flat-array encoding grows from 2 to 4 slots per event:

```
[voice, step_global, velocity_q, pitch_q, voice, step_global, ...]

where
  velocity_q = round(velocity * 127)         // 0..=127, u32
  pitch_q    = round((pitch + 24) * 100)     // 0..=4800, u32, encoded with +24 offset
```

Offset encoding for pitch lets us keep `Vec<u32>` for marshaling, sidestepping signed-int hassles across the JS boundary. JS reverses both quantizations:

```ts
for (let i = 0; i < events.length; i += 4) {
  const voice    = events[i];
  const step     = events[i + 1];
  const velocity = events[i + 2] / 127;
  const pitch    = events[i + 3] / 100 - 24;  // semitones
  triggerVoice(voice, stepToAudioTime(step), velocity, pitch);
}
```

Quantization is lossy in the strict sense (1/127 in velocity, 1 cent in pitch), but both are below human discrimination thresholds for drum hits. Wire-format simplicity is worth more than the precision.

This is the only change to the Rust↔JS event payload in v2, and it's strictly additive — JS code that ignores the new slots would still find voice/step in their old positions.

---

## 14. Audio Graph & Sample Caching

Per-voice chain shape unchanged from v1. What's new is the sample registry on the JS side.

### Pool buffer cache

```ts
// Decoded once at boot, keyed by sample name. Never evicted.
const poolBuffers: Map<string, AudioBuffer> = new Map();

function getVoiceBuffer(voice: number): AudioBuffer {
  return poolBuffers.get(resound.voice_pool_sample(voice))!;
}
```

When the scheduler triggers voice N, `getVoiceBuffer(N)` returns the buffer for the voice's currently-assigned pool sample. No decoding ever happens at trigger time. No decoding happens on kit load or individual pick (the pool is pre-decoded). The only decode events in the system are at boot, for the full pool.

### Per-trigger setup

```ts
function triggerVoice(
  voice: number,
  time: number,
  velocity: number,
  pitchSemitones: number,
) {
  // Choke previous source (unchanged from v1).

  const buffer = getVoiceBuffer(voice);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = Math.pow(2, pitchSemitones / 12);

  const fadeGain = audioCtx.createGain();
  fadeGain.gain.value = velocity;  // velocity folded into the fade gain's initial value

  source.connect(fadeGain).connect(trackGain[voice]);
  source.start(time);

  // Store {source, fadeGain} as the voice's currently-sounding pair, for choke.
}
```

- **Pitch** = `playbackRate` on the source. ±24 semitones is a 4× speed range either way. Browser does no anti-aliasing on this; extreme upward pitches sound digital, which is musically useful for drums.
- **Velocity** = scalar applied to the per-trigger gain, folded into the fade gain to avoid adding a node.
- **Choke** works exactly as in v1 — the fade gain ramps to 0 on choke, regardless of its starting value. Velocity 0.6 just means the fade ramps from 0.6 to 0 instead of 1.0 to 0.

Per-track and master `GainNode`s are still wired once at boot and never recreated. No new node types in v2.

---

## 15. Boot Sequence

1. Browser loads HTML, Vite bundle, WASM.
2. JS constructs `Resound`. Rust parses every embedded kit JSON into runtime `Kit` structs once during construction, then initializes with `active_kit = 0`, `voice_pool_samples = KITS[0].voice_samples`, names = kit 0's referenced sample names, and pattern = the initial-boot pattern (voice 0 step 0 on at default velocity/pitch, all other 127 steps off). Same friendly default as v1: one hit on play confirms audio is working without committing to a rhythm the user has to clear.
3. JS calls `pool_sample_names()`, then `pool_sample_bytes(name)` for each name. Decodes all via `decodeAudioData` in parallel (`Promise.all`). Stores results in `poolBuffers` keyed by name.
4. JS calls `kit_count()` and `kit_name(i)` for each kit, populates the kit-picker UI.
5. JS reads `voice_pool_sample(v)` for each voice to set up `voiceBuffers` pointers.
6. JS reads `track_name(v)` for each voice for row labels.
7. UI renders the grid showing the initial-boot pattern (voice 0 step 0 lit) with velocity-as-fill-height visualization.
8. User gesture → `audioCtx.resume()` → `resound.play()` → scheduler starts.

Boot is dominated by step 3 (decoding the whole pool). With 16 samples decoded in parallel, this completes in well under a second on a modern machine — typically faster than the user can click Play, especially since `audioCtx.resume()` requires a user gesture and that's the gating step anyway.

If pool size grows past v2's 16 samples in a later release, lazy decode is a JS-only optimization path — Rust is unaffected.

---

## 16. UI Layout

Updated rough sketch:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [▶ Play] [■ Stop]   BPM [120]   Swing [50%]   Master [───o───]      [⋮] │
│  Kit:  ( 909   Hip-Hop )                  [↶ Undo] [↷ Redo] [Clear Pat.] │
├──────────────────────────────────────────────────────────────────────────┤
│  [Kick     ✎] [📁] [────o]  ▓▒▒▒▓▒▒▒▓▒▒▒▓▒▒▒                             │
│  [Snare    ✎] [📁] [────o]  ▒▒▒▒▓▒▒▒▒▒▒▒▓▒▒▒                             │
│  [Clap     ✎] [📁] [────o]  ▒▒▒▒▓▒▒▒▒▒▒▒▓▒▒▒                             │
│  [Lo Tom   ✎] [📁] [────o]  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                             │
│  [Hi Tom   ✎] [📁] [────o]  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                             │
│  [Cl Hat   ✎] [📁] [────o]  ▒▓▒▓▒▓▒▓▒▓▒▓▒▓▒▓                             │
│  [Op Hat   ✎] [📁] [────o]  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                             │
│  [Cymbal   ✎] [📁] [────o]  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                             │
├──────────────────────────────────────────────────────────────────────────┤
│  Kick / Step 9    Velocity [────o──] 82    Pitch [──o─────] -3       [✕]│
└──────────────────────────────────────────────────────────────────────────┘
```

Where:

- `✎` next to track name = click to rename inline.
- `📁` per track = open the sample browser for this track (pool sample picking).
- Cell fill (`▓`/`▒`) is illustrative of velocity-as-fill-height — a step at velocity 0.5 is half-filled vertically.
- Inspector strip (bottom) is only visible when a step is selected.
- `[⋮]` menu top-right contains the destructive **Reset All** with confirmation, plus duplicate menu entries for Undo / Redo.
- `[↶ Undo]` and `[↷ Redo]` disable when their respective stacks are empty; tooltips show keyboard shortcuts.
- When the active kit has been modified, the kit name in the picker shows "(modified)" suffix.

### Sample browser (opens per-track from `📁`)

```
┌─────────────────────────────────────────────────────────────┐
│  Assign sample to: Kick                                 [✕] │
│                                                              │
│  Search: [____________________]                              │
│  ─────────────────────────────────────────────────────────  │
│  ▶  909 Kick               ← currently assigned             │
│  ▶  909 Snare                                               │
│  ▶  909 Clap                                                │
│  ▶  909 Lo Tom                                              │
│  ▶  909 Hi Tom                                              │
│  ▶  Closed Hat                                              │
│  ▶  Open Hat                                                │
│  ▶  Crash                                                   │
│  ▶  808 Kick                                                │
│  ▶  ...                            (16 total, scroll)       │
└─────────────────────────────────────────────────────────────┘
```

Interaction:

- `▶` previews the sample through the master output (auditioned at velocity 1.0, no pitch shift, regardless of the assigned step's velocity/pitch).
- Clicking the sample name assigns it to the voice and closes the browser.
- Search filters the list by name as you type. At 16 samples, scrolling works fine too; search is convenience, not necessity.

Tablet sizing: cells stay ~40 px square; the browser is a modal-style overlay sized for finger input.

---

## 17. Roadmap (Updated)

Surviving from v1 §16 (priorities and architectural reasoning unchanged):

- **16.1 Envelopes** — per-voice amp / pitch / filter envelopes.
- **16.2 Web Audio effects** — per-voice or master filter / distortion / reverb.
- **16.3 Custom DSP in worklet** — second WASM artifact, audio thread.
- **16.4 MIDI clock sync** — both slave and master, using the v1 `ClockSource` split.
- **16.6 Sample-accurate sequencing in the worklet** — sequencer moves into AudioWorkletProcessor.

Removed:

- ~~**16.5 Freesound integration**~~ — dropped permanently. ToS incompatible.

New post-v2 items (additive to existing modules):

- **CDN-loaded samples.** v2 bundles sample bytes into the WASM binary via `include_bytes!`. A future version moves the audio data to a CDN, with only sample names and URLs compiled in. The pool data model already separates `name` (the identifier) from `bytes` (the data); swapping `bytes: &'static [u8]` for a network fetch is a JS-side change to how the buffer cache is populated, plus a Rust API change to expose URLs instead of bytes. No data-model change — name-based references still work.
- **Per-kit default patterns.** Re-introduce a `pattern` field in kit JSON files, plus a UI affordance to apply a kit's default pattern alongside its sounds (or not — user's choice via a checkbox or distinct menu item). v2 omits this purely on content-cost grounds — authoring good default patterns for each kit is meaningful work, and we wanted to ship without it.
- **Save / load user content (kits, patterns, full patches).** Some form of persistence — download/upload to local disk, store in browser IndexedDB, cloud sync, share via URL, etc. v2 deliberately doesn't commit to any of these; the right shape will become clearer once we know what users actually want to save and share. When we do tackle it, the existing kit JSON format is a reasonable starting point for any file-based approach.
- **User-uploaded samples.** Per-track upload of local audio (WAV/MP3/OGG/FLAC/M4A) overlaid on top of the voice's pool assignment. The JS audio engine would grow a second buffer layer (custom-upload buffer per voice, taking precedence over the pool buffer). Out of scope for v2 to keep the cut focused.
- **User-created kits.** Save the current 8-voice arrangement (8 sample names + 8 track names) as a named kit available alongside built-ins.
- **Pool expansions.** Periodic releases ship new pool samples in the WASM binary. Samples are referenced by name everywhere, so additions are additive — they just become new options in the sample browser.
- Mute / solo per track.
- Pattern chaining / song mode.
- MIDI note in / out.
- Per-track effects insert chain (depends on 16.2).

---

## 18. Testing

Additions to the v1 Rust test suite:

- Loading each kit produces the documented state: voice pool assignments and track names reflect the kit, `kit_modified = false`. Pattern, voice levels, BPM, swing, and master are **unchanged** from the pre-load state.
- `set_voice_pool_sample` updates the voice's assignment, updates the track name, and sets `kit_modified = true`.
- `set_active_kit` clears `kit_modified` even if it was set.
- Velocity and pitch setters clamp correctly (0–1, −24 to +24).
- Velocity and pitch round-trip through `pull_events` with the right quantization.
- Toggling a step off then on preserves its prior velocity and pitch.
- `clear_pattern` resets velocity to 0.8 and pitch to 0 across all cells; voice assignments and `kit_modified` are untouched.
- `reset_all` reaches the documented factory state from any prior state, including `kit_modified = false`.
- Swing is clamped to [0.5, 0.75].
- Track-name setters respect max length and reject empty names.
- `serialize_snapshot` → `restore_snapshot` round-trips full state losslessly (every undoable field returns to its prior value).
- `restore_snapshot` returns `false` on malformed input without mutating state.
- Transport state (playing / current step) is *not* captured in the snapshot.
- All built-in kit JSON files parse successfully at boot and produce valid `Kit` runtime structs (every name resolves to a pool entry; voices array has exactly 8 entries).

JS-side scheduler tests gain one case: events with velocity and pitch make it through to `triggerVoice` with the right values. The undo/redo stack module gets its own tests: push/pop ordering, redo-clears-on-new-action, coalescing of begin/end gestures, single-entry behavior for kit-load.

---

## 19. Locked Defaults (v2)

Inherited from v1 unless restated:

- **BPM** range 40–240, default 120.
- **Track / master levels** default 0.8, range 0–1.
- **Stop behavior** resets playhead to step 0.

New in v2:

- **Active kit on first boot:** kit 0.
- **Initial pattern on first boot:** voice 0 step 0 on at velocity 0.8, pitch 0; all other 127 steps off. Single-hit-on-play confirms audio without committing the user to a rhythm.
- **Kits in v2:** carry only voice→sample mappings. No default patterns, no global settings. Loading a kit swaps sounds only.
- **Per-step velocity** range 0.0–1.0, default 0.8 when a step is newly turned on.
- **Per-step pitch** range −24 to +24 semitones, default 0.0.
- **Swing** range 0.5–0.75, default 0.5 (straight).
- **Track name** max length 32 characters; empty rejected.
- **Pool size for v2:** 16 samples.
- **Kits for v2:** 2 kits, contrasting in feel.
- **Undo / redo stack cap:** 100 entries per stack. Older entries silently fall off when exceeded.
