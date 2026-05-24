use wasm_bindgen::prelude::*;

mod mixer;
mod pattern;
mod samples;
mod transport;

use mixer::Mixer;
use pattern::{Pattern, STEPS, VOICES};
use transport::Transport;

#[wasm_bindgen]
pub struct Resound {
    pattern: Pattern,
    mixer: Mixer,
    transport: Transport,
}

#[wasm_bindgen]
impl Resound {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            pattern: Pattern::with_default_kick(),
            mixer: Mixer::new(),
            transport: Transport::new(),
        }
    }

    // Samples ---------------------------------------------------------------

    pub fn sample_count(&self) -> u32 {
        VOICES as u32
    }

    pub fn sample_name(&self, voice: u32) -> String {
        samples::NAMES[voice as usize].to_string()
    }

    pub fn sample_bytes(&self, voice: u32) -> Vec<u8> {
        samples::BYTES[voice as usize].to_vec()
    }

    // Pattern ---------------------------------------------------------------

    pub fn toggle_step(&mut self, voice: u32, step: u32) {
        self.pattern.toggle(voice as usize, step as usize);
    }

    pub fn set_step(&mut self, voice: u32, step: u32, on: bool) {
        self.pattern.set(voice as usize, step as usize, on);
    }

    pub fn is_step_on(&self, voice: u32, step: u32) -> bool {
        self.pattern.is_on(voice as usize, step as usize)
    }

    pub fn clear_pattern(&mut self) {
        self.pattern.clear();
    }

    // Mixer -----------------------------------------------------------------

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

    // Transport -------------------------------------------------------------

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

    /// Returns events with global step index in [cursor, until_step) for any
    /// active pattern cells. Encoded as flat [voice, step_global, ...] pairs
    /// for cheap transfer to JS. Advances the cursor to `until_step`.
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
    fn new_has_default_kick_pattern() {
        let r = Resound::new();
        assert!(r.is_step_on(0, 0));
        assert!(!r.is_step_on(1, 0));
        assert!(!r.is_step_on(0, 1));
    }

    #[test]
    fn pull_events_empty_when_stopped() {
        let mut r = Resound::new();
        let ev = r.pull_events(4);
        assert!(ev.is_empty());
    }

    #[test]
    fn pull_events_returns_kick_on_step_0() {
        let mut r = Resound::new();
        r.play();
        let ev = r.pull_events(4);
        assert_eq!(ev, vec![0, 0]);
    }

    #[test]
    fn pull_events_advances_cursor_exactly_once_per_event() {
        let mut r = Resound::new();
        r.play();
        let ev = r.pull_events(4);
        assert_eq!(ev, vec![0, 0]);
        let ev = r.pull_events(4);
        assert!(ev.is_empty(), "second call with same horizon should be empty");
        let ev = r.pull_events(16);
        assert!(ev.is_empty(), "no other steps active until next bar");
        let ev = r.pull_events(20);
        assert_eq!(ev, vec![0, 16], "kick fires again at global step 16 (start of bar 2)");
    }

    #[test]
    fn pull_events_multi_voice_in_step_order() {
        let mut r = Resound::new();
        r.clear_pattern();
        r.set_step(0, 4, true);
        r.set_step(3, 4, true);
        r.set_step(7, 4, true);
        r.play();
        let ev = r.pull_events(8);
        assert_eq!(ev, vec![0, 4, 3, 4, 7, 4]);
    }

    #[test]
    fn stop_then_play_resets_cursor() {
        let mut r = Resound::new();
        r.play();
        r.pull_events(20);
        r.stop();
        r.play();
        let ev = r.pull_events(4);
        assert_eq!(ev, vec![0, 0], "kick should fire again on fresh play");
    }
}
