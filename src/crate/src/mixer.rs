use serde::{Deserialize, Serialize};

use crate::pattern::NUM_VOICES;

pub const DEFAULT_TRACK_LEVEL: f32 = 0.8;
pub const DEFAULT_MASTER_LEVEL: f32 = 0.8;
pub const TRACK_TUNING_MIN: i32 = -12;
pub const TRACK_TUNING_MAX: i32 = 12;

#[derive(Clone, Serialize, Deserialize)]
pub struct Mixer {
    tracks: [f32; NUM_VOICES],
    /// Per-track pitch shift in semitones, clamped to [-12, 12]. Applied via
    /// AudioBufferSourceNode.playbackRate = 2^(semis/12) on each trigger.
    tunings: [i32; NUM_VOICES],
    master: f32,
}

impl Mixer {
    pub fn new() -> Self {
        Self {
            tracks: [DEFAULT_TRACK_LEVEL; NUM_VOICES],
            tunings: [0; NUM_VOICES],
            master: DEFAULT_MASTER_LEVEL,
        }
    }

    pub fn track_level(&self, voice: usize) -> f32 {
        self.tracks[voice]
    }

    pub fn set_track_level(&mut self, voice: usize, level: f32) {
        self.tracks[voice] = level.clamp(0.0, 1.0);
    }

    pub fn track_tuning(&self, voice: usize) -> i32 {
        self.tunings[voice]
    }

    pub fn set_track_tuning(&mut self, voice: usize, semitones: i32) {
        self.tunings[voice] = semitones.clamp(TRACK_TUNING_MIN, TRACK_TUNING_MAX);
    }

    pub fn master_level(&self) -> f32 {
        self.master
    }

    pub fn set_master_level(&mut self, level: f32) {
        self.master = level.clamp(0.0, 1.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults() {
        let m = Mixer::new();
        for v in 0..NUM_VOICES {
            assert_eq!(m.track_level(v), 0.8);
            assert_eq!(m.track_tuning(v), 0);
        }
        assert_eq!(m.master_level(), 0.8);
    }

    #[test]
    fn levels_clamp() {
        let mut m = Mixer::new();
        m.set_track_level(2, -1.0);
        assert_eq!(m.track_level(2), 0.0);
        m.set_master_level(2.0);
        assert_eq!(m.master_level(), 1.0);
    }

    #[test]
    fn tuning_clamps_to_pm_12() {
        let mut m = Mixer::new();
        m.set_track_tuning(0, 20);
        assert_eq!(m.track_tuning(0), 12);
        m.set_track_tuning(0, -50);
        assert_eq!(m.track_tuning(0), -12);
        m.set_track_tuning(0, 7);
        assert_eq!(m.track_tuning(0), 7);
    }
}
