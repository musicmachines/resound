use crate::pattern::VOICES;

const KICK: &[u8] = include_bytes!("../samples/kick.wav");
const SNARE: &[u8] = include_bytes!("../samples/snare.wav");
const CLAP: &[u8] = include_bytes!("../samples/clap.wav");
const LO_TOM: &[u8] = include_bytes!("../samples/lo_tom.wav");
const HI_TOM: &[u8] = include_bytes!("../samples/hi_tom.wav");
const CLOSED_HAT: &[u8] = include_bytes!("../samples/closed_hat.wav");
const OPEN_HAT: &[u8] = include_bytes!("../samples/open_hat.wav");
const CYMBAL: &[u8] = include_bytes!("../samples/cymbal.wav");

pub const NAMES: [&str; VOICES] = [
    "Kick",
    "Snare",
    "Clap",
    "Lo Tom",
    "Hi Tom",
    "Closed Hat",
    "Open Hat",
    "Cymbal",
];

pub const BYTES: [&[u8]; VOICES] = [
    KICK, SNARE, CLAP, LO_TOM, HI_TOM, CLOSED_HAT, OPEN_HAT, CYMBAL,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_samples_non_empty() {
        for (i, bytes) in BYTES.iter().enumerate() {
            assert!(!bytes.is_empty(), "sample {} ({}) is empty", i, NAMES[i]);
        }
    }

    #[test]
    fn names_and_bytes_both_have_8_entries() {
        assert_eq!(NAMES.len(), 8);
        assert_eq!(BYTES.len(), 8);
    }

    #[test]
    fn all_samples_look_like_wav() {
        for (i, bytes) in BYTES.iter().enumerate() {
            assert!(
                bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE",
                "sample {} ({}) does not have RIFF/WAVE header",
                i,
                NAMES[i]
            );
        }
    }
}
