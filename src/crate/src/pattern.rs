pub const VOICES: usize = 8;
pub const STEPS: usize = 16;

pub struct Pattern {
    cells: [[bool; STEPS]; VOICES],
}

impl Pattern {
    pub fn new() -> Self {
        Self {
            cells: [[false; STEPS]; VOICES],
        }
    }

    pub fn with_default_kick() -> Self {
        let mut p = Self::new();
        p.set(0, 0, true);
        p
    }

    pub fn is_on(&self, voice: usize, step: usize) -> bool {
        self.cells[voice][step]
    }

    pub fn set(&mut self, voice: usize, step: usize, on: bool) {
        self.cells[voice][step] = on;
    }

    pub fn toggle(&mut self, voice: usize, step: usize) {
        self.cells[voice][step] = !self.cells[voice][step];
    }

    pub fn clear(&mut self) {
        self.cells = [[false; STEPS]; VOICES];
    }

    pub fn voices_active_at(&self, step: usize) -> impl Iterator<Item = u32> + '_ {
        (0..VOICES).filter_map(move |v| if self.cells[v][step] { Some(v as u32) } else { None })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_pattern_is_empty() {
        let p = Pattern::new();
        for v in 0..VOICES {
            for s in 0..STEPS {
                assert!(!p.is_on(v, s));
            }
        }
    }

    #[test]
    fn default_kick_has_only_step_0_voice_0() {
        let p = Pattern::with_default_kick();
        assert!(p.is_on(0, 0));
        for v in 0..VOICES {
            for s in 0..STEPS {
                if v == 0 && s == 0 {
                    continue;
                }
                assert!(!p.is_on(v, s), "expected ({v},{s}) off");
            }
        }
    }

    #[test]
    fn toggle_flips_cell() {
        let mut p = Pattern::new();
        p.toggle(3, 7);
        assert!(p.is_on(3, 7));
        p.toggle(3, 7);
        assert!(!p.is_on(3, 7));
    }

    #[test]
    fn set_writes_exact_value() {
        let mut p = Pattern::new();
        p.set(2, 5, true);
        assert!(p.is_on(2, 5));
        p.set(2, 5, false);
        assert!(!p.is_on(2, 5));
    }

    #[test]
    fn clear_resets_everything() {
        let mut p = Pattern::with_default_kick();
        p.set(4, 10, true);
        p.clear();
        for v in 0..VOICES {
            for s in 0..STEPS {
                assert!(!p.is_on(v, s));
            }
        }
    }

    #[test]
    fn voices_active_at_returns_set_voices() {
        let mut p = Pattern::new();
        p.set(0, 4, true);
        p.set(3, 4, true);
        p.set(7, 4, true);
        let active: Vec<u32> = p.voices_active_at(4).collect();
        assert_eq!(active, vec![0, 3, 7]);
    }
}
