use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

mod kit;
mod mixer;
mod pattern;
mod pool;
mod transport;

use kit::Kit;
use mixer::Mixer;
use pattern::{Pattern, NUM_VOICES, STEPS};
use transport::Transport;

const MAX_TRACK_NAME_LEN: usize = 32;

#[wasm_bindgen]
pub struct Resound {
    kits: Vec<Kit>,
    active_kit: u32,
    kit_modified: bool,
    voice_pool_samples: [String; NUM_VOICES],
    pattern: Pattern,
    track_names: [String; NUM_VOICES],
    mixer: Mixer,
    transport: Transport,
}

/// Snapshot of all undoable musical state. Mirrors `Resound` minus the kits
/// table (immutable, comes from the binary) and the transport (active
/// playback isn't undoable per spec §11).
#[derive(Serialize, Deserialize)]
struct Snapshot {
    active_kit: u32,
    kit_modified: bool,
    voice_pool_samples: [String; NUM_VOICES],
    pattern: Pattern,
    track_names: [String; NUM_VOICES],
    mixer: Mixer,
    bpm: f32,
    swing: f32,
}

#[wasm_bindgen]
impl Resound {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let kits = kit::load_all();
        let active = &kits[0];
        let voice_pool_samples = active.voice_samples.clone();
        let track_names = active.voice_samples.clone();
        Self {
            kits,
            active_kit: 0,
            kit_modified: false,
            voice_pool_samples,
            pattern: Pattern::with_default_kick(),
            track_names,
            mixer: Mixer::new(),
            transport: Transport::new(),
        }
    }

    // Pool API ---------------------------------------------------------------

    pub fn pool_sample_names(&self) -> Vec<String> {
        pool::POOL.iter().map(|s| s.name.to_string()).collect()
    }

    pub fn pool_sample_bytes(&self, name: &str) -> Vec<u8> {
        pool::find(name)
            .map(|s| s.bytes.to_vec())
            .unwrap_or_default()
    }

    // Kit API ----------------------------------------------------------------

    pub fn kit_count(&self) -> u32 {
        self.kits.len() as u32
    }

    pub fn kit_name(&self, kit_id: u32) -> String {
        self.kits[kit_id as usize].name.clone()
    }

    pub fn kit_json(&self, kit_id: u32) -> String {
        self.kits[kit_id as usize].raw_json.to_string()
    }

    pub fn active_kit(&self) -> u32 {
        self.active_kit
    }

    pub fn kit_modified(&self) -> bool {
        self.kit_modified
    }

    pub fn set_active_kit(&mut self, kit_id: u32) {
        if (kit_id as usize) >= self.kits.len() {
            return;
        }
        self.active_kit = kit_id;
        let k = &self.kits[kit_id as usize];
        self.voice_pool_samples = k.voice_samples.clone();
        self.track_names = k.voice_samples.clone();
        self.kit_modified = false;
    }

    // Per-voice sample assignment -------------------------------------------

    pub fn voice_pool_sample(&self, voice: u32) -> String {
        self.voice_pool_samples[voice as usize].clone()
    }

    pub fn set_voice_pool_sample(&mut self, voice: u32, name: String) {
        if !pool::contains(&name) {
            return;
        }
        let v = voice as usize;
        self.voice_pool_samples[v] = name.clone();
        self.track_names[v] = name;
        self.kit_modified = true;
    }

    // Per-step velocity / pitch ---------------------------------------------

    pub fn set_step_velocity(&mut self, voice: u32, step: u32, velocity: f32) {
        self.pattern.set_velocity(voice as usize, step as usize, velocity);
    }

    pub fn step_velocity(&self, voice: u32, step: u32) -> f32 {
        self.pattern.velocity(voice as usize, step as usize)
    }

    pub fn set_step_pitch(&mut self, voice: u32, step: u32, semitones: f32) {
        self.pattern.set_pitch(voice as usize, step as usize, semitones);
    }

    pub fn step_pitch(&self, voice: u32, step: u32) -> f32 {
        self.pattern.pitch(voice as usize, step as usize)
    }

    // Swing ------------------------------------------------------------------

    pub fn set_swing(&mut self, swing: f32) {
        self.transport.set_swing(swing);
    }

    pub fn swing(&self) -> f32 {
        self.transport.swing()
    }

    // Track names -----------------------------------------------------------

    pub fn track_name(&self, voice: u32) -> String {
        self.track_names[voice as usize].clone()
    }

    /// Truncates to `MAX_TRACK_NAME_LEN` chars; rejects empty names (no-op).
    pub fn set_track_name(&mut self, voice: u32, name: String) {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return;
        }
        let v = voice as usize;
        self.track_names[v] = trimmed.chars().take(MAX_TRACK_NAME_LEN).collect();
    }

    // Pattern mutation (existing v1) ----------------------------------------

    pub fn toggle_step(&mut self, voice: u32, step: u32) {
        self.pattern.toggle(voice as usize, step as usize);
    }

    pub fn set_step(&mut self, voice: u32, step: u32, on: bool) {
        self.pattern.set_on(voice as usize, step as usize, on);
    }

    pub fn is_step_on(&self, voice: u32, step: u32) -> bool {
        self.pattern.is_on(voice as usize, step as usize)
    }

    pub fn clear_pattern(&mut self) {
        self.pattern.clear();
    }

    // Mixer ------------------------------------------------------------------

    pub fn set_track_level(&mut self, voice: u32, level: f32) {
        self.mixer.set_track_level(voice as usize, level);
    }

    pub fn track_level(&self, voice: u32) -> f32 {
        self.mixer.track_level(voice as usize)
    }

    pub fn set_master_level(&mut self, level: f32) {
        self.mixer.set_master_level(level);
    }

    pub fn master_level(&self) -> f32 {
        self.mixer.master_level()
    }

    // Transport (existing v1) -----------------------------------------------

    pub fn set_bpm(&mut self, bpm: f32) {
        self.transport.set_bpm(bpm);
    }

    pub fn bpm(&self) -> f32 {
        self.transport.bpm()
    }

    pub fn play(&mut self) {
        self.transport.play();
    }

    pub fn stop(&mut self) {
        self.transport.stop();
    }

    pub fn is_playing(&self) -> bool {
        self.transport.is_playing()
    }

    pub fn set_position(&mut self, global_step: u32) {
        self.transport.set_position(global_step);
    }

    pub fn current_step(&self) -> i32 {
        self.transport.current_step()
    }

    // Clear / reset (new in v2) ---------------------------------------------

    /// Revert this voice's pool sample to the active kit's assigned sample
    /// for that slot, restoring the track name to match (spec §10).
    pub fn clear_track_sample(&mut self, voice: u32) {
        let v = voice as usize;
        let kit_sample = self.kits[self.active_kit as usize].voice_samples[v].clone();
        self.voice_pool_samples[v] = kit_sample.clone();
        self.track_names[v] = kit_sample;
        // Recompute kit_modified: true if any voice still differs from the kit.
        self.kit_modified = self.voice_pool_samples
            != self.kits[self.active_kit as usize].voice_samples;
    }

    /// Full factory reset (spec §10): kit 0, default pattern, defaults
    /// everywhere. Transport stopped (resetting mid-play stops audio).
    pub fn reset_all(&mut self) {
        let active = &self.kits[0];
        let voice_pool_samples = active.voice_samples.clone();
        let track_names = active.voice_samples.clone();
        self.active_kit = 0;
        self.kit_modified = false;
        self.voice_pool_samples = voice_pool_samples;
        self.track_names = track_names;
        self.pattern = Pattern::with_default_kick();
        self.mixer = Mixer::new();
        self.transport = Transport::new();
    }

    // Undo / redo support ---------------------------------------------------

    pub fn serialize_snapshot(&self) -> Vec<u8> {
        let snap = Snapshot {
            active_kit: self.active_kit,
            kit_modified: self.kit_modified,
            voice_pool_samples: self.voice_pool_samples.clone(),
            pattern: self.pattern.clone(),
            track_names: self.track_names.clone(),
            mixer: self.mixer.clone(),
            bpm: self.transport.bpm(),
            swing: self.transport.swing(),
        };
        postcard::to_allocvec(&snap).expect("snapshot must serialize")
    }

    /// Restore state from a blob produced by `serialize_snapshot`.
    /// Returns false (and mutates nothing) on malformed input.
    pub fn restore_snapshot(&mut self, blob: Vec<u8>) -> bool {
        let snap: Snapshot = match postcard::from_bytes(&blob) {
            Ok(s) => s,
            Err(_) => return false,
        };
        if (snap.active_kit as usize) >= self.kits.len() {
            return false;
        }
        for name in &snap.voice_pool_samples {
            if !pool::contains(name) {
                return false;
            }
        }
        self.active_kit = snap.active_kit;
        self.kit_modified = snap.kit_modified;
        self.voice_pool_samples = snap.voice_pool_samples;
        self.pattern = snap.pattern;
        self.track_names = snap.track_names;
        self.mixer = snap.mixer;
        self.transport.set_bpm(snap.bpm);
        self.transport.set_swing(snap.swing);
        true
    }

    // Scheduler query (4-slot payload — spec §13) ---------------------------

    /// Returns events with global step index in [cursor, until_step) for any
    /// active pattern cells, encoded as flat [voice, step_global,
    /// velocity_q, pitch_q, ...] where velocity_q = round(velocity*127) and
    /// pitch_q = round((pitch + 24) * 100).
    pub fn pull_events(&mut self, until_step: u32) -> Vec<u32> {
        let Some((from, to)) = self.transport.advance_pull_cursor(until_step) else {
            return Vec::new();
        };
        let mut out: Vec<u32> = Vec::new();
        for global in from..to {
            let step = (global as usize) % STEPS;
            for (voice, cell) in self.pattern.cells_active_at(step) {
                let velocity_q = (cell.velocity * 127.0).round().clamp(0.0, 127.0) as u32;
                let pitch_q = ((cell.pitch + 24.0) * 100.0).round().clamp(0.0, 4800.0) as u32;
                out.push(voice);
                out.push(global);
                out.push(velocity_q);
                out.push(pitch_q);
            }
        }
        out
    }
}

impl Default for Resound {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_loads_kit_0_and_default_pattern() {
        let r = Resound::new();
        assert_eq!(r.active_kit(), 0);
        assert!(!r.kit_modified());
        assert_eq!(r.kit_count(), 2);
        assert_eq!(r.kit_name(0), "909");
        assert_eq!(r.kit_name(1), "Hip-Hop");
        assert!(r.is_step_on(0, 0));
        assert_eq!(r.bpm(), 120.0);
        assert_eq!(r.swing(), 0.5);
        assert_eq!(r.master_level(), 0.8);
        assert_eq!(r.voice_pool_sample(0), "909_kick");
        assert_eq!(r.track_name(0), "909_kick");
    }

    #[test]
    fn pool_api_exposes_16_samples() {
        let r = Resound::new();
        let names = r.pool_sample_names();
        assert_eq!(names.len(), 16);
        // Bytes for a real entry come back non-empty
        let bytes = r.pool_sample_bytes("909_kick");
        assert!(!bytes.is_empty());
        // Bytes for a non-entry come back empty
        let bytes = r.pool_sample_bytes("does_not_exist");
        assert!(bytes.is_empty());
    }

    #[test]
    fn set_active_kit_swaps_voice_and_track_names_but_not_pattern() {
        let mut r = Resound::new();
        r.toggle_step(3, 7);
        r.set_track_level(2, 0.3);
        r.set_bpm(140.0);
        r.set_swing(0.66);
        assert!(r.is_step_on(3, 7));

        r.set_active_kit(1);
        assert_eq!(r.active_kit(), 1);
        assert!(!r.kit_modified());
        // Voice + track names came from kit 1
        assert_eq!(r.voice_pool_sample(0), "boom_kick");
        assert_eq!(r.track_name(0), "boom_kick");
        // Pattern, levels, bpm, swing untouched
        assert!(r.is_step_on(3, 7));
        assert_eq!(r.track_level(2), 0.3);
        assert_eq!(r.bpm(), 140.0);
        assert!((r.swing() - 0.66).abs() < 1e-6);
    }

    #[test]
    fn set_voice_pool_sample_marks_kit_modified() {
        let mut r = Resound::new();
        assert!(!r.kit_modified());
        r.set_voice_pool_sample(0, "boom_kick".to_string());
        assert!(r.kit_modified());
        assert_eq!(r.voice_pool_sample(0), "boom_kick");
        assert_eq!(r.track_name(0), "boom_kick");
    }

    #[test]
    fn set_voice_pool_sample_rejects_unknown_name() {
        let mut r = Resound::new();
        r.set_voice_pool_sample(0, "nonsense".to_string());
        assert!(!r.kit_modified());
        assert_eq!(r.voice_pool_sample(0), "909_kick");
    }

    #[test]
    fn set_active_kit_clears_modified_flag() {
        let mut r = Resound::new();
        r.set_voice_pool_sample(0, "boom_kick".to_string());
        assert!(r.kit_modified());
        r.set_active_kit(0);
        assert!(!r.kit_modified());
    }

    #[test]
    fn clear_track_sample_reverts_to_kit_slot() {
        let mut r = Resound::new();
        r.set_voice_pool_sample(0, "boom_kick".to_string());
        assert!(r.kit_modified());
        r.clear_track_sample(0);
        assert_eq!(r.voice_pool_sample(0), "909_kick");
        assert_eq!(r.track_name(0), "909_kick");
        assert!(!r.kit_modified(), "kit_modified flips back when all voices match again");
    }

    #[test]
    fn track_name_max_length_and_empty_rejected() {
        let mut r = Resound::new();
        r.set_track_name(0, "kick again".to_string());
        assert_eq!(r.track_name(0), "kick again");
        r.set_track_name(0, "".to_string());
        assert_eq!(r.track_name(0), "kick again", "empty is rejected");
        r.set_track_name(0, "   ".to_string());
        assert_eq!(r.track_name(0), "kick again", "whitespace-only is rejected");
        let long = "a".repeat(100);
        r.set_track_name(0, long);
        assert_eq!(r.track_name(0).chars().count(), 32);
    }

    #[test]
    fn velocity_and_pitch_clamp() {
        let mut r = Resound::new();
        r.set_step_velocity(0, 0, 2.0);
        assert_eq!(r.step_velocity(0, 0), 1.0);
        r.set_step_pitch(0, 0, 30.0);
        assert_eq!(r.step_pitch(0, 0), 24.0);
        r.set_step_pitch(0, 0, -100.0);
        assert_eq!(r.step_pitch(0, 0), -24.0);
    }

    #[test]
    fn swing_clamps() {
        let mut r = Resound::new();
        r.set_swing(2.0);
        assert_eq!(r.swing(), 0.75);
        r.set_swing(0.1);
        assert_eq!(r.swing(), 0.5);
    }

    #[test]
    fn toggle_off_preserves_velocity_and_pitch() {
        let mut r = Resound::new();
        r.set_step(2, 5, true);
        r.set_step_velocity(2, 5, 0.42);
        r.set_step_pitch(2, 5, -7.0);
        r.toggle_step(2, 5);
        assert!(!r.is_step_on(2, 5));
        assert_eq!(r.step_velocity(2, 5), 0.42);
        assert_eq!(r.step_pitch(2, 5), -7.0);
    }

    #[test]
    fn clear_pattern_resets_velocity_to_default() {
        let mut r = Resound::new();
        r.set_step(0, 0, true);
        r.set_step_velocity(0, 0, 0.2);
        r.set_step_pitch(0, 0, 5.0);
        r.set_voice_pool_sample(1, "boom_kick".to_string());
        r.clear_pattern();
        assert!(!r.is_step_on(0, 0));
        assert_eq!(r.step_velocity(0, 0), 0.8);
        assert_eq!(r.step_pitch(0, 0), 0.0);
        // pool assignment + kit_modified untouched
        assert_eq!(r.voice_pool_sample(1), "boom_kick");
        assert!(r.kit_modified());
    }

    #[test]
    fn reset_all_returns_to_factory_state() {
        let mut r = Resound::new();
        r.set_active_kit(1);
        r.set_voice_pool_sample(0, "ride".to_string());
        r.set_step(4, 12, true);
        r.set_step_velocity(4, 12, 0.3);
        r.set_track_level(3, 0.1);
        r.set_master_level(0.2);
        r.set_bpm(180.0);
        r.set_swing(0.7);
        r.play();

        r.reset_all();

        assert_eq!(r.active_kit(), 0);
        assert!(!r.kit_modified());
        assert_eq!(r.voice_pool_sample(0), "909_kick");
        assert!(r.is_step_on(0, 0));
        assert!(!r.is_step_on(4, 12));
        assert_eq!(r.step_velocity(4, 12), 0.8);
        assert_eq!(r.track_level(3), 0.8);
        assert_eq!(r.master_level(), 0.8);
        assert_eq!(r.bpm(), 120.0);
        assert_eq!(r.swing(), 0.5);
        assert!(!r.is_playing());
    }

    #[test]
    fn snapshot_round_trip_preserves_state() {
        let mut r = Resound::new();
        r.set_active_kit(1);
        r.set_voice_pool_sample(0, "ride".to_string());
        r.set_step(3, 9, true);
        r.set_step_velocity(3, 9, 0.42);
        r.set_step_pitch(3, 9, -5.5);
        r.set_track_level(2, 0.3);
        r.set_track_name(4, "thumper".to_string());
        r.set_bpm(140.0);
        r.set_swing(0.66);
        let blob = r.serialize_snapshot();

        // mutate everything
        r.set_active_kit(0);
        r.clear_pattern();
        r.set_bpm(200.0);
        r.set_swing(0.5);
        r.set_track_level(2, 1.0);

        assert!(r.restore_snapshot(blob.clone()));
        assert_eq!(r.active_kit(), 1);
        assert_eq!(r.voice_pool_sample(0), "ride");
        assert!(r.is_step_on(3, 9));
        assert!((r.step_velocity(3, 9) - 0.42).abs() < 1e-6);
        assert!((r.step_pitch(3, 9) - (-5.5)).abs() < 1e-6);
        assert_eq!(r.track_level(2), 0.3);
        assert_eq!(r.track_name(4), "thumper");
        assert_eq!(r.bpm(), 140.0);
        assert!((r.swing() - 0.66).abs() < 1e-6);
    }

    #[test]
    fn snapshot_does_not_capture_transport() {
        let mut r = Resound::new();
        r.play();
        let blob = r.serialize_snapshot();
        r.stop();
        assert!(r.restore_snapshot(blob));
        // After restore, transport remains as it was *now*, not as it was when snapshotted.
        assert!(!r.is_playing());
    }

    #[test]
    fn restore_snapshot_rejects_malformed() {
        let mut r = Resound::new();
        let original_bpm = r.bpm();
        r.set_bpm(140.0);
        assert!(!r.restore_snapshot(vec![0xff, 0xff, 0xff]));
        // State unchanged
        assert_eq!(r.bpm(), 140.0);
        // (original_bpm just here to confirm we ARE in a non-default state)
        assert_ne!(original_bpm, 140.0);
    }

    #[test]
    fn pull_events_4_slot_payload() {
        let mut r = Resound::new();
        r.clear_pattern();
        r.set_step(0, 0, true);
        r.set_step_velocity(0, 0, 1.0);
        r.set_step_pitch(0, 0, 0.0);
        r.set_step(3, 4, true);
        r.set_step_velocity(3, 4, 0.5);
        r.set_step_pitch(3, 4, -12.0);
        r.play();

        let ev = r.pull_events(8);
        // 2 events × 4 slots
        assert_eq!(ev.len(), 8);
        // first event: voice 0, step 0, velocity 127, pitch encoded 24*100 = 2400
        assert_eq!(ev[0], 0);
        assert_eq!(ev[1], 0);
        assert_eq!(ev[2], 127);
        assert_eq!(ev[3], 2400);
        // second event: voice 3, step 4, velocity round(0.5*127)=64, pitch (−12+24)*100=1200
        assert_eq!(ev[4], 3);
        assert_eq!(ev[5], 4);
        assert_eq!(ev[6], 64);
        assert_eq!(ev[7], 1200);
    }

    #[test]
    fn pull_events_advances_cursor() {
        let mut r = Resound::new();
        r.play();
        let ev = r.pull_events(4);
        assert!(!ev.is_empty());
        let ev2 = r.pull_events(4);
        assert!(ev2.is_empty(), "second call to same horizon returns nothing");
    }
}
