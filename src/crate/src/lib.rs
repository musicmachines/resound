use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

mod mixer;
mod pattern;
mod pool;
mod transport;

use mixer::Mixer;
use pattern::{Pattern, NUM_VOICES, STEPS};
use transport::Transport;

const MAX_TRACK_NAME_LEN: usize = 32;

static DEFAULT_VOICE_SAMPLES: [&str; NUM_VOICES] = [
    "909_kick",
    "909_snare",
    "909_clap",
    "909_lo_tom",
    "909_hi_tom",
    "909_closed_hat",
    "909_open_hat",
    "909_crash",
];

fn default_voice_samples() -> [String; NUM_VOICES] {
    let mut out: [String; NUM_VOICES] = Default::default();
    for (i, name) in DEFAULT_VOICE_SAMPLES.iter().enumerate() {
        out[i] = (*name).to_string();
    }
    out
}

#[wasm_bindgen]
pub struct Resound {
    voice_pool_samples: [String; NUM_VOICES],
    pattern: Pattern,
    track_names: [String; NUM_VOICES],
    mixer: Mixer,
    transport: Transport,
}

#[derive(Serialize, Deserialize)]
struct Snapshot {
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
        let voice_pool_samples = default_voice_samples();
        let track_names = default_voice_samples();
        Self {
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
        pool::find(name).map(|s| s.bytes.to_vec()).unwrap_or_default()
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

    pub fn set_track_name(&mut self, voice: u32, name: String) {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return;
        }
        let v = voice as usize;
        self.track_names[v] = trimmed.chars().take(MAX_TRACK_NAME_LEN).collect();
    }

    // Pattern mutation ------------------------------------------------------

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

    pub fn set_track_tuning(&mut self, voice: u32, semitones: i32) {
        self.mixer.set_track_tuning(voice as usize, semitones);
    }

    pub fn track_tuning(&self, voice: u32) -> i32 {
        self.mixer.track_tuning(voice as usize)
    }

    pub fn set_master_level(&mut self, level: f32) {
        self.mixer.set_master_level(level);
    }

    pub fn master_level(&self) -> f32 {
        self.mixer.master_level()
    }

    // Transport --------------------------------------------------------------

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

    pub fn reset_all(&mut self) {
        self.voice_pool_samples = default_voice_samples();
        self.track_names = default_voice_samples();
        self.pattern = Pattern::with_default_kick();
        self.mixer = Mixer::new();
        self.transport = Transport::new();
    }

    // Undo / redo -----------------------------------------------------------

    pub fn serialize_snapshot(&self) -> Vec<u8> {
        let snap = Snapshot {
            voice_pool_samples: self.voice_pool_samples.clone(),
            pattern: self.pattern.clone(),
            track_names: self.track_names.clone(),
            mixer: self.mixer.clone(),
            bpm: self.transport.bpm(),
            swing: self.transport.swing(),
        };
        postcard::to_allocvec(&snap).expect("snapshot must serialize")
    }

    pub fn restore_snapshot(&mut self, blob: Vec<u8>) -> bool {
        let snap: Snapshot = match postcard::from_bytes(&blob) {
            Ok(s) => s,
            Err(_) => return false,
        };
        for name in &snap.voice_pool_samples {
            if !pool::contains(name) {
                return false;
            }
        }
        self.voice_pool_samples = snap.voice_pool_samples;
        self.pattern = snap.pattern;
        self.track_names = snap.track_names;
        self.mixer = snap.mixer;
        self.transport.set_bpm(snap.bpm);
        self.transport.set_swing(snap.swing);
        true
    }

    /// Scheduler query — events in [cursor, until_step) as flat
    /// [voice, step_global, voice, step_global, ...] (2 slots per event).
    /// JS reads per-track gain + tuning at trigger time.
    pub fn pull_events(&mut self, until_step: u32) -> Vec<u32> {
        let Some((from, to)) = self.transport.advance_pull_cursor(until_step) else {
            return Vec::new();
        };
        let mut out: Vec<u32> = Vec::new();
        for global in from..to {
            let step = (global as usize) % STEPS;
            for voice in self.pattern.voices_active_at(step) {
                out.push(voice);
                out.push(global);
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
    fn new_initializes_from_default_voice_samples() {
        let r = Resound::new();
        for (i, expected) in DEFAULT_VOICE_SAMPLES.iter().enumerate() {
            assert_eq!(r.voice_pool_sample(i as u32), *expected);
            assert_eq!(r.track_name(i as u32), *expected);
            assert_eq!(r.track_tuning(i as u32), 0);
        }
        assert!(r.is_step_on(0, 0));
        assert_eq!(r.bpm(), 120.0);
        assert_eq!(r.swing(), 0.5);
        assert_eq!(r.master_level(), 0.8);
    }

    #[test]
    fn every_default_voice_sample_resolves_to_pool() {
        for name in DEFAULT_VOICE_SAMPLES {
            assert!(pool::contains(name), "unknown pool name {name:?}");
        }
    }

    #[test]
    fn pool_api_exposes_16_samples() {
        let r = Resound::new();
        assert_eq!(r.pool_sample_names().len(), 16);
        assert!(!r.pool_sample_bytes("909_kick").is_empty());
        assert!(r.pool_sample_bytes("does_not_exist").is_empty());
    }

    #[test]
    fn set_voice_pool_sample_updates_name_and_assignment() {
        let mut r = Resound::new();
        r.set_voice_pool_sample(0, "boom_kick".to_string());
        assert_eq!(r.voice_pool_sample(0), "boom_kick");
        assert_eq!(r.track_name(0), "boom_kick");
    }

    #[test]
    fn track_tuning_clamps_and_round_trips() {
        let mut r = Resound::new();
        r.set_track_tuning(0, 5);
        assert_eq!(r.track_tuning(0), 5);
        r.set_track_tuning(0, 20);
        assert_eq!(r.track_tuning(0), 12);
        r.set_track_tuning(0, -100);
        assert_eq!(r.track_tuning(0), -12);
    }

    #[test]
    fn reset_all_returns_to_factory_state() {
        let mut r = Resound::new();
        r.set_voice_pool_sample(0, "ride".to_string());
        r.set_step(4, 12, true);
        r.set_track_level(3, 0.1);
        r.set_track_tuning(3, 9);
        r.set_master_level(0.2);
        r.set_bpm(180.0);
        r.set_swing(0.7);
        r.play();
        r.reset_all();
        for (i, expected) in DEFAULT_VOICE_SAMPLES.iter().enumerate() {
            assert_eq!(r.voice_pool_sample(i as u32), *expected);
            assert_eq!(r.track_tuning(i as u32), 0);
        }
        assert!(r.is_step_on(0, 0));
        assert!(!r.is_step_on(4, 12));
        assert_eq!(r.track_level(3), 0.8);
        assert_eq!(r.master_level(), 0.8);
        assert_eq!(r.bpm(), 120.0);
        assert_eq!(r.swing(), 0.5);
        assert!(!r.is_playing());
    }

    #[test]
    fn snapshot_round_trip_preserves_state_including_tuning() {
        let mut r = Resound::new();
        r.set_step(3, 9, true);
        r.set_track_level(2, 0.3);
        r.set_track_tuning(2, -7);
        r.set_track_name(4, "thumper".to_string());
        r.set_bpm(140.0);
        r.set_swing(0.66);
        let blob = r.serialize_snapshot();

        r.clear_pattern();
        r.set_track_tuning(2, 12);
        r.set_bpm(200.0);

        assert!(r.restore_snapshot(blob));
        assert!(r.is_step_on(3, 9));
        assert_eq!(r.track_level(2), 0.3);
        assert_eq!(r.track_tuning(2), -7);
        assert_eq!(r.track_name(4), "thumper");
        assert_eq!(r.bpm(), 140.0);
        assert!((r.swing() - 0.66).abs() < 1e-6);
    }

    #[test]
    fn pull_events_2_slot_payload() {
        let mut r = Resound::new();
        r.clear_pattern();
        r.set_step(0, 0, true);
        r.set_step(3, 4, true);
        r.play();
        let ev = r.pull_events(8);
        assert_eq!(ev.len(), 4);
        assert_eq!(&ev[0..2], &[0, 0]);
        assert_eq!(&ev[2..4], &[3, 4]);
    }
}
