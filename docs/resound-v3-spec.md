# Resound — Technical Specification (v3)

## 1. Overview

v3 walks back the kit feature introduced in v2. The sample pool stays. Per-voice sample assignment via the pool browser stays. Everything else from v2 (per-step velocity / pitch, swing, track names, undo / redo, clear / reset operations) stays.

What goes away: the kit concept as a first-class, addressable thing — no built-in kits, no kit picker, no `active_kit` / `kit_modified` state, no per-voice "revert to kit's sample" operation, no kit JSON authoring pipeline.

What remains true in spirit: the current 8-voice arrangement is still a "kit" in the everyday sense (a set of sounds loaded into voices), but it's not a named, saved, or loadable thing in v3. The boot state simply assigns 8 default pool samples and from there the user freely reassigns voices.

**Why:** kits-as-data was a v2 addition that pulled in JSON authoring, kit-modified bookkeeping, a kit picker, and an extra "revert" operation — meaningful surface area for a feature whose actual user value is unclear without save / load (deferred indefinitely in v2 §17). v3 cuts down to the part that does provide value: a browsable pool of samples, assignable per voice.

If kits return later, they return as user-created saved arrangements alongside patch save / load (v2 §17, unchanged). That's a roadmap concern, not a v3 one.

Sections not mentioned below (clock source / scheduler split, choke logic, audio context lifecycle, audio graph topology, project layout outside the listed deletions) are inherited unchanged from v2 — which itself inherited them from v1.

---

## 2. Feature Scope (deltas from v2)

**Removed:**

- Built-in kits (the 909 and Hip-Hop kits).
- Kit JSON authoring (`src/crate/kits/`, `include_str!`-embedded JSON, runtime parsing).
- Kit picker UI.
- "Kit modified" indicator.
- `clear_track_sample` operation (no longer meaningful — there's nothing canonical to revert *to*).
- The "kit load overwrites all track names" rule (kit load no longer exists).

**Unchanged from v2:**

- Sample pool (16 samples), browsable via per-track `📁` button.
- Per-voice sample assignment from the pool, with preview.
- Per-step velocity and pitch.
- Global swing.
- Track names (user-editable, overwritten on pool-sample pick).
- Clear pattern, reset all.
- Undo / redo with bounded stack.
- All v1 carryovers (8 voices, 16 steps, choke, scheduler / clock split, audio graph, etc.).

**Still deferred / non-goals:** unchanged from v2 §2 except `clear_track_sample` is no longer applicable.

---

## 3. Architecture Deltas

No layer changes. Cuts are confined to:

- **Rust state:** drop `active_kit`, `kit_modified`. Keep `voice_pool_samples`.
- **Rust data:** drop `KIT_SOURCES`, `KitSource`, `Kit`, the `kits/*.json` files, and the JSON-parsing step from `Resound::new()`.
- **Rust API:** drop all `kit_*` and `set_active_kit` methods, and `clear_track_sample`.
- **Boot:** voice → sample initialization comes from a static `DEFAULT_VOICE_SAMPLES` array (an `[&'static str; NUM_VOICES]` of pool names), not a kit.
- **UI:** drop the kit picker row from the transport area; drop the per-track "clear sample" affordance.
- **Dependencies:** drop the JSON crate (`serde_json` or `serde-json-wasm`) if it was added for v2.

Nothing else moves. `pull_events`, the audio graph, the scheduler, the clock source split, undo serialization shape — all unchanged.

---

## 4. Default Voice Mapping

v2's "kit 0 is the boot state" becomes simpler: a private constant.

```rust
static DEFAULT_VOICE_SAMPLES: [&'static str; NUM_VOICES] = [
    "909_kick",
    "909_snare",
    "909_clap",
    "909_lo_tom",
    "909_hi_tom",
    "closed_hat",
    "open_hat",
    "909_crash",
];
```

Used in two places only: `Resound::new()` and `reset_all`. Not exposed to JS. The user is never told "these are the defaults" — the boot state is just the boot state, same as v1 booting with a kick on step 0.

Curator constraint: every entry in `DEFAULT_VOICE_SAMPLES` must resolve to an entry in `POOL`. Covered by a unit test that boots `Resound` and asserts every default name resolves.

Specific samples in the array above are a curator choice — they need to be in the pool, and they need to make a reasonable starting kit, but nothing in the architecture cares which 8 they are.

---

## 5. Updated Rust State

```rust
pub struct Resound {
    voice_pool_samples: [String; NUM_VOICES],   // current sample name per voice
    pattern: [[Step; 16]; NUM_VOICES],
    track_levels: [f32; NUM_VOICES],
    track_names: [String; NUM_VOICES],
    master_level: f32,
    bpm: f32,
    swing: f32,
    transport: Transport,
}
```

`Step`, `Transport`, `POOL`, and `NUM_VOICES` are unchanged from v2.

Removed fields vs v2: `active_kit`, `kit_modified`.

---

## 6. Updated Rust API

**Carried forward from v2 unchanged:** `toggle_step`, `set_step`, `is_step_on`, `set_track_level`, `track_level`, `set_master_level`, `master_level`, `set_bpm`, `bpm`, `play`, `stop`, `is_playing`, `set_position`, `current_step`, `clear_pattern`, `pool_sample_names`, `pool_sample_bytes`, `voice_pool_sample`, `set_voice_pool_sample`, `set_step_velocity`, `step_velocity`, `set_step_pitch`, `step_pitch`, `set_swing`, `swing`, `track_name`, `set_track_name`, `reset_all`, `serialize_snapshot`, `restore_snapshot`.

**Removed:**

```rust
// All kit APIs:
pub fn kit_count(&self) -> u32;
pub fn kit_name(&self, kit_id: u32) -> String;
pub fn kit_json(&self, kit_id: u32) -> String;
pub fn active_kit(&self) -> u32;
pub fn kit_modified(&self) -> bool;
pub fn set_active_kit(&mut self, kit_id: u32);

// Kit-dependent revert:
pub fn clear_track_sample(&mut self, voice: u32);
```

`pull_events` is unchanged from v2 — events still carry voice, step, velocity, and pitch in the same flat-array encoding (4 slots per event with the same quantization).

---

## 7. Track Names

Simpler rules without kit loads as an overwriting event:

1. User-set name (explicit rename) sticks until next overwriting event.
2. Overwriting events: pool-sample pick for that voice sets that voice's name to the picked sample's name.

That's the whole hierarchy. "Kit load overwrites all names" and "clear track sample resets name" are gone.

UI behavior unchanged: inline edit on click, Enter / blur to commit, 32-char max, empty submission reverts.

---

## 8. Clear & Reset Operations

| Operation | What stays | What resets |
|---|---|---|
| **Clear pattern** | Voice pool assignments, track names, levels, BPM, swing | All step `on` flags → false; all velocity → 0.8; all pitch → 0.0 |
| **Reset all** | Nothing | Voice assignments → `DEFAULT_VOICE_SAMPLES`; track names → those samples' names; pattern → initial-boot pattern (voice 0 step 0 on at default velocity / pitch, rest off); levels → 0.8; master → 0.8; BPM → 120; swing → 0.5; transport → stopped |

`clear_track_sample` is removed — there's nothing canonical to revert a voice to. A user wanting a different sample picks one from the browser.

UI placement: **Clear pattern** stays as a single-click button. **Reset all** stays behind the `⋮` menu with confirmation, same wording as v2.

---

## 9. Undo / Redo

Unchanged from v2 in mechanism: snapshot-based, 100-entry capped stacks, coalesced gestures, JS-owned stacks, Rust-owned serialization.

The set of undoable actions loses three entries — no kit loads, no kit-modified flips, no `clear_track_sample`. Everything else (step toggles, velocity / pitch edits, level / BPM / swing changes, pool-sample picks, renames, clear pattern, reset all) is still undoable.

The serialized snapshot is smaller (no `active_kit`, no `kit_modified`), but format is opaque to JS so this is invisible across the boundary.

---

## 10. UI Layout

Transport area loses the kit picker. The undo / redo / clear-pattern controls move up into the space the picker used to occupy:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [▶ Play] [■ Stop]   BPM [120]   Swing [50%]   Master [───o───]      [⋮] │
│  [↶ Undo] [↷ Redo] [Clear Pat.]                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  [Kick     ✎] [📁] [────o]  ▓▒▒▒▓▒▒▒▓▒▒▒▓▒▒▒                             │
│  [Snare    ✎] [📁] [────o]  ▒▒▒▒▓▒▒▒▒▒▒▒▓▒▒▒                             │
│  ...                                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

Removed UI elements:

- Kit picker (`Kit:  ( 909   Hip-Hop )`).
- "(modified)" suffix on the kit name.
- Per-track "clear sample" affordance (in v2 it appeared only when a track had been individually re-assigned — gone entirely).

Per-track `📁` (sample browser) and `✎` (rename) are unchanged. The sample browser itself is unchanged from v2 §16 — same modal, same preview, same search, same 16 entries.

---

## 11. Boot Sequence

Identical to v2 §15 except:

- Step 2: no kit JSON parsing. `Resound::new()` initializes with `voice_pool_samples = DEFAULT_VOICE_SAMPLES.map(String::from)`, `track_names` from the same array, and pattern = initial-boot pattern (voice 0 step 0 on at default velocity / pitch, all other 127 steps off).
- Step 4 (kit picker population) is deleted.

Pool decode (step 3) is unchanged and remains the boot bottleneck — the same 16 `decodeAudioData` calls in parallel.

---

## 12. File Layout Changes

```
src/crate/
├── Cargo.toml              ← drop serde_json / serde-json-wasm dependency
├── kits/                   ← deleted directory
├── src/
│   ├── lib.rs
│   ├── pattern.rs
│   ├── transport.rs
│   ├── mixer.rs
│   └── samples.rs
└── samples/                ← the 16 pool WAVs (unchanged from v2)
```

---

## 13. Testing

Drop from the v2 suite:

- Kit-load tests (state after load, names overwritten, modified-flag cleared).
- `set_voice_pool_sample` sets `kit_modified` (flag doesn't exist).
- `set_active_kit` clears `kit_modified`.
- `clear_track_sample` reverts to kit's slot and restores name.
- All built-in kit JSON files parse successfully.

Add:

- `Resound::new()` initializes `voice_pool_samples` and `track_names` from `DEFAULT_VOICE_SAMPLES`.
- Every entry in `DEFAULT_VOICE_SAMPLES` resolves to a real `POOL` entry. (Cheap insurance against typos in the constant.)
- `reset_all` lands on the documented v3 factory state from any prior state.

Snapshot round-trip and "transport not captured" tests remain — adapted to the smaller v3 state struct.

---

## 14. Roadmap Notes

The v2 roadmap stands: CDN-loaded samples, per-kit default patterns, save / load user content, user-uploaded samples, user-created kits, pool expansions, mute / solo, pattern chaining, MIDI in / out, per-track effects insert chain. Carried-forward v1 items (envelopes, Web Audio effects, custom DSP in worklet, MIDI clock sync, sample-accurate sequencing) are unchanged.

One reframing:

- **User-created kits** (previously post-v2). If kits return, they return as user-saved arrangements — not as built-in content. The data model is trivial: 8 sample names + 8 track names = a kit. Implementation depends entirely on the broader save / load decision (also v2 roadmap, unresolved).

The built-in kits authored for v2 (`909.json`, `hip-hop.json`) are not lost forever — if "built-in presets" land later (whether as kits, patches, or some other unit), the curated voice mappings in those files are a reasonable starting point.

---

## 15. Locked Defaults (v3)

Identical to v2 §19 except:

- **Active kit on first boot:** removed (no kits).
- **Kits in v2:** removed.
- **Pool size:** unchanged at 16 samples.

All other defaults (BPM 120, swing 0.5, velocity 0.8 default for newly-active steps, levels 0.8, master 0.8, stop-resets-to-step-0, BPM range 40–240, swing range 0.5–0.75, pitch range −24 to +24, undo stack cap 100) carry forward unchanged.
