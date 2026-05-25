pub const BPM_MIN: f32 = 40.0;
pub const BPM_MAX: f32 = 240.0;
pub const DEFAULT_BPM: f32 = 120.0;

pub const SWING_MIN: f32 = 0.5;
pub const SWING_MAX: f32 = 0.75;
pub const DEFAULT_SWING: f32 = 0.5;

pub enum State {
    Stopped,
    Playing {
        next_unpulled_step: u32,
        current_step: u32,
    },
}

pub struct Transport {
    bpm: f32,
    swing: f32,
    state: State,
}

impl Transport {
    pub fn new() -> Self {
        Self {
            bpm: DEFAULT_BPM,
            swing: DEFAULT_SWING,
            state: State::Stopped,
        }
    }

    pub fn bpm(&self) -> f32 {
        self.bpm
    }

    pub fn set_bpm(&mut self, bpm: f32) {
        self.bpm = bpm.clamp(BPM_MIN, BPM_MAX);
    }

    pub fn swing(&self) -> f32 {
        self.swing
    }

    pub fn set_swing(&mut self, swing: f32) {
        self.swing = swing.clamp(SWING_MIN, SWING_MAX);
    }

    pub fn is_playing(&self) -> bool {
        matches!(self.state, State::Playing { .. })
    }

    pub fn play(&mut self) {
        if !self.is_playing() {
            self.state = State::Playing {
                next_unpulled_step: 0,
                current_step: 0,
            };
        }
    }

    pub fn stop(&mut self) {
        self.state = State::Stopped;
    }

    pub fn set_position(&mut self, global_step: u32) {
        match &mut self.state {
            State::Playing { next_unpulled_step, current_step } => {
                *next_unpulled_step = global_step;
                *current_step = global_step;
            }
            State::Stopped => {}
        }
    }

    pub fn current_step(&self) -> i32 {
        match self.state {
            State::Stopped => -1,
            State::Playing { current_step, .. } => (current_step % 16) as i32,
        }
    }

    /// Advance the "next unpulled" cursor up to `until_step`.
    /// Returns (prev_cursor, new_cursor) when playing, None when stopped.
    pub fn advance_pull_cursor(&mut self, until_step: u32) -> Option<(u32, u32)> {
        match &mut self.state {
            State::Playing { next_unpulled_step, current_step } => {
                let prev = *next_unpulled_step;
                if until_step <= prev {
                    return Some((prev, prev));
                }
                *next_unpulled_step = until_step;
                *current_step = until_step.saturating_sub(1);
                Some((prev, until_step))
            }
            State::Stopped => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_bpm_swing() {
        let t = Transport::new();
        assert_eq!(t.bpm(), 120.0);
        assert_eq!(t.swing(), 0.5);
    }

    #[test]
    fn bpm_clamps() {
        let mut t = Transport::new();
        t.set_bpm(10.0);
        assert_eq!(t.bpm(), 40.0);
        t.set_bpm(300.0);
        assert_eq!(t.bpm(), 240.0);
    }

    #[test]
    fn swing_clamps_to_0_5_0_75() {
        let mut t = Transport::new();
        t.set_swing(0.3);
        assert_eq!(t.swing(), 0.5);
        t.set_swing(1.0);
        assert_eq!(t.swing(), 0.75);
        t.set_swing(0.66);
        assert!((t.swing() - 0.66).abs() < 1e-6);
    }

    #[test]
    fn play_starts_at_step_0() {
        let mut t = Transport::new();
        t.play();
        assert!(t.is_playing());
        assert_eq!(t.current_step(), 0);
    }

    #[test]
    fn stop_resets_then_play_starts_fresh() {
        let mut t = Transport::new();
        t.play();
        t.advance_pull_cursor(5);
        t.stop();
        t.play();
        assert_eq!(t.current_step(), 0);
    }
}
