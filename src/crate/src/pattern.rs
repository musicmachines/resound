use serde::{Deserialize, Serialize};

pub const NUM_VOICES: usize = 8;
pub const STEPS: usize = 16;

pub const DEFAULT_STEP_VELOCITY: f32 = 0.8;
pub const DEFAULT_STEP_PITCH: f32 = 0.0;
pub const VELOCITY_MIN: f32 = 0.0;
pub const VELOCITY_MAX: f32 = 1.0;
pub const PITCH_MIN: f32 = -24.0;
pub const PITCH_MAX: f32 = 24.0;

#[derive(Copy, Clone, Serialize, Deserialize, PartialEq, Debug)]
pub struct Step {
    pub on: bool,
    pub velocity: f32,
    pub pitch: f32,
}

impl Default for Step {
    fn default() -> Self {
        Self {
            on: false,
            velocity: DEFAULT_STEP_VELOCITY,
            pitch: DEFAULT_STEP_PITCH,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Pattern {
    cells: [[Step; STEPS]; NUM_VOICES],
}

impl Pattern {
    pub fn new() -> Self {
        Self { cells: [[Step::default(); STEPS]; NUM_VOICES] }
    }

    pub fn with_default_kick() -> Self {
        let mut p = Self::new();
        p.set_on(0, 0, true);
        p
    }

    pub fn cell(&self, voice: usize, step: usize) -> Step {
        self.cells[voice][step]
    }

    pub fn is_on(&self, voice: usize, step: usize) -> bool {
        self.cells[voice][step].on
    }

    /// Toggle on/off; velocity and pitch are preserved across off→on→off cycles
    /// per spec §5 ("toggle-off semantics").
    pub fn toggle(&mut self, voice: usize, step: usize) {
        self.cells[voice][step].on = !self.cells[voice][step].on;
    }

    pub fn set_on(&mut self, voice: usize, step: usize, on: bool) {
        self.cells[voice][step].on = on;
    }

    pub fn set_velocity(&mut self, voice: usize, step: usize, velocity: f32) {
        self.cells[voice][step].velocity = velocity.clamp(VELOCITY_MIN, VELOCITY_MAX);
    }

    pub fn velocity(&self, voice: usize, step: usize) -> f32 {
        self.cells[voice][step].velocity
    }

    pub fn set_pitch(&mut self, voice: usize, step: usize, pitch: f32) {
        self.cells[voice][step].pitch = pitch.clamp(PITCH_MIN, PITCH_MAX);
    }

    pub fn pitch(&self, voice: usize, step: usize) -> f32 {
        self.cells[voice][step].pitch
    }

    /// Reset every step's on/velocity/pitch to defaults (clear pattern, §10).
    pub fn clear(&mut self) {
        self.cells = [[Step::default(); STEPS]; NUM_VOICES];
    }

    pub fn cells_active_at(&self, step: usize) -> impl Iterator<Item = (u32, Step)> + '_ {
        (0..NUM_VOICES).filter_map(move |v| {
            let c = self.cells[v][step];
            if c.on {
                Some((v as u32, c))
            } else {
                None
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_pattern_is_all_default_off() {
        let p = Pattern::new();
        for v in 0..NUM_VOICES {
            for s in 0..STEPS {
                let c = p.cell(v, s);
                assert!(!c.on);
                assert_eq!(c.velocity, DEFAULT_STEP_VELOCITY);
                assert_eq!(c.pitch, DEFAULT_STEP_PITCH);
            }
        }
    }

    #[test]
    fn default_kick_pattern_has_only_voice_0_step_0_on() {
        let p = Pattern::with_default_kick();
        assert!(p.is_on(0, 0));
        for v in 0..NUM_VOICES {
            for s in 0..STEPS {
                if v == 0 && s == 0 {
                    continue;
                }
                assert!(!p.is_on(v, s));
            }
        }
    }

    #[test]
    fn toggle_off_preserves_velocity_and_pitch() {
        let mut p = Pattern::new();
        p.set_on(2, 5, true);
        p.set_velocity(2, 5, 0.42);
        p.set_pitch(2, 5, -7.0);
        p.toggle(2, 5);
        assert!(!p.is_on(2, 5));
        assert_eq!(p.velocity(2, 5), 0.42);
        assert_eq!(p.pitch(2, 5), -7.0);
        p.toggle(2, 5);
        assert!(p.is_on(2, 5));
        assert_eq!(p.velocity(2, 5), 0.42);
        assert_eq!(p.pitch(2, 5), -7.0);
    }

    #[test]
    fn velocity_clamps_to_0_1() {
        let mut p = Pattern::new();
        p.set_velocity(0, 0, -0.3);
        assert_eq!(p.velocity(0, 0), 0.0);
        p.set_velocity(0, 0, 1.4);
        assert_eq!(p.velocity(0, 0), 1.0);
    }

    #[test]
    fn pitch_clamps_to_pm_24() {
        let mut p = Pattern::new();
        p.set_pitch(0, 0, -40.0);
        assert_eq!(p.pitch(0, 0), -24.0);
        p.set_pitch(0, 0, 100.0);
        assert_eq!(p.pitch(0, 0), 24.0);
    }

    #[test]
    fn clear_resets_velocity_to_default() {
        let mut p = Pattern::new();
        p.set_on(3, 7, true);
        p.set_velocity(3, 7, 0.2);
        p.set_pitch(3, 7, 5.0);
        p.clear();
        let c = p.cell(3, 7);
        assert!(!c.on);
        assert_eq!(c.velocity, DEFAULT_STEP_VELOCITY);
        assert_eq!(c.pitch, DEFAULT_STEP_PITCH);
    }

    #[test]
    fn cells_active_at_emits_voice_step_pair() {
        let mut p = Pattern::new();
        p.set_on(0, 4, true);
        p.set_velocity(0, 4, 0.5);
        p.set_pitch(0, 4, 3.0);
        p.set_on(5, 4, true);
        let v: Vec<_> = p.cells_active_at(4).collect();
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].0, 0);
        assert_eq!(v[0].1.velocity, 0.5);
        assert_eq!(v[0].1.pitch, 3.0);
        assert_eq!(v[1].0, 5);
    }
}
