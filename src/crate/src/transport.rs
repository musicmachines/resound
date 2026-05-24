pub const BPM_MIN: f32 = 40.0;
pub const BPM_MAX: f32 = 240.0;
pub const DEFAULT_BPM: f32 = 120.0;

pub enum State {
    Stopped,
    Playing {
        next_unpulled_step: u32,
        current_step: u32,
    },
}

pub struct Transport {
    bpm: f32,
    state: State,
}

impl Transport {
    pub fn new() -> Self {
        Self {
            bpm: DEFAULT_BPM,
            state: State::Stopped,
        }
    }

    pub fn bpm(&self) -> f32 {
        self.bpm
    }

    pub fn set_bpm(&mut self, bpm: f32) {
        self.bpm = bpm.clamp(BPM_MIN, BPM_MAX);
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
            State::Playing {
                next_unpulled_step,
                current_step,
            } => {
                *next_unpulled_step = global_step;
                *current_step = global_step;
            }
            State::Stopped => {
                self.state = State::Playing {
                    next_unpulled_step: global_step,
                    current_step: global_step,
                };
                self.stop();
            }
        }
    }

    pub fn current_step(&self) -> i32 {
        match self.state {
            State::Stopped => -1,
            State::Playing { current_step, .. } => (current_step % 16) as i32,
        }
    }

    /// Advance the "next unpulled" cursor up to `until_step` (exclusive).
    /// Returns the (prev_cursor, new_cursor) range, or None if not playing.
    pub fn advance_pull_cursor(&mut self, until_step: u32) -> Option<(u32, u32)> {
        match &mut self.state {
            State::Playing {
                next_unpulled_step,
                current_step,
            } => {
                let prev = *next_unpulled_step;
                if until_step <= prev {
                    return Some((prev, prev));
                }
                *next_unpulled_step = until_step;
                // current_step trails next_unpulled by lookahead; for v1's
                // purpose of "what step is sounding now" we approximate it as
                // the last step pulled.
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
    fn default_bpm_is_120() {
        let t = Transport::new();
        assert_eq!(t.bpm(), 120.0);
    }

    #[test]
    fn bpm_clamps_to_range() {
        let mut t = Transport::new();
        t.set_bpm(20.0);
        assert_eq!(t.bpm(), 40.0);
        t.set_bpm(300.0);
        assert_eq!(t.bpm(), 240.0);
        t.set_bpm(140.0);
        assert_eq!(t.bpm(), 140.0);
    }

    #[test]
    fn bpm_round_trips_within_range() {
        let mut t = Transport::new();
        for v in [40.0, 60.0, 90.0, 120.0, 180.0, 240.0] {
            t.set_bpm(v);
            assert_eq!(t.bpm(), v);
        }
    }

    #[test]
    fn stopped_by_default() {
        let t = Transport::new();
        assert!(!t.is_playing());
        assert_eq!(t.current_step(), -1);
    }

    #[test]
    fn play_starts_at_step_0() {
        let mut t = Transport::new();
        t.play();
        assert!(t.is_playing());
        assert_eq!(t.current_step(), 0);
    }

    #[test]
    fn stop_resets_current_step() {
        let mut t = Transport::new();
        t.play();
        t.advance_pull_cursor(8);
        t.stop();
        assert!(!t.is_playing());
        assert_eq!(t.current_step(), -1);
    }

    #[test]
    fn play_after_stop_starts_fresh_at_zero() {
        let mut t = Transport::new();
        t.play();
        t.advance_pull_cursor(5);
        t.stop();
        t.play();
        assert_eq!(t.current_step(), 0);
    }

    #[test]
    fn advance_pull_cursor_returns_range() {
        let mut t = Transport::new();
        t.play();
        let r = t.advance_pull_cursor(4).unwrap();
        assert_eq!(r, (0, 4));
        let r = t.advance_pull_cursor(7).unwrap();
        assert_eq!(r, (4, 7));
    }

    #[test]
    fn advance_pull_cursor_idempotent_when_horizon_not_advanced() {
        let mut t = Transport::new();
        t.play();
        t.advance_pull_cursor(8);
        let r = t.advance_pull_cursor(8).unwrap();
        assert_eq!(r, (8, 8));
        let r = t.advance_pull_cursor(3).unwrap();
        assert_eq!(r, (8, 8));
    }

    #[test]
    fn advance_pull_cursor_none_when_stopped() {
        let mut t = Transport::new();
        assert!(t.advance_pull_cursor(4).is_none());
    }
}
