use crate::pattern::VOICES;

pub const DEFAULT_TRACK_LEVEL: f32 = 0.8;
pub const DEFAULT_MASTER_LEVEL: f32 = 0.8;

pub struct Mixer {
    tracks: [f32; VOICES],
    master: f32,
}

impl Mixer {
    pub fn new() -> Self {
        Self {
            tracks: [DEFAULT_TRACK_LEVEL; VOICES],
            master: DEFAULT_MASTER_LEVEL,
        }
    }

    pub fn track_level(&self, voice: usize) -> f32 {
        self.tracks[voice]
    }

    pub fn set_track_level(&mut self, voice: usize, level: f32) {
        self.tracks[voice] = level.clamp(0.0, 1.0);
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
    fn defaults_at_0_8() {
        let m = Mixer::new();
        for v in 0..VOICES {
            assert_eq!(m.track_level(v), 0.8);
        }
        assert_eq!(m.master_level(), 0.8);
    }

    #[test]
    fn set_track_level_clamps() {
        let mut m = Mixer::new();
        m.set_track_level(2, -0.5);
        assert_eq!(m.track_level(2), 0.0);
        m.set_track_level(2, 1.7);
        assert_eq!(m.track_level(2), 1.0);
        m.set_track_level(2, 0.42);
        assert_eq!(m.track_level(2), 0.42);
    }

    #[test]
    fn set_master_level_clamps() {
        let mut m = Mixer::new();
        m.set_master_level(2.0);
        assert_eq!(m.master_level(), 1.0);
        m.set_master_level(-1.0);
        assert_eq!(m.master_level(), 0.0);
    }
}
