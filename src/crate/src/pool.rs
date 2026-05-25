// Pool of bundled samples. 16 entries by display name; only 8 unique source
// WAVs are shipped in v2 (the v1 kit). Each &'static [u8] points at one of
// those 8, so aliased entries cost binary size once — preserving the spec's
// "a sample used in two kits costs binary size once" guarantee (§4).

pub struct PoolSample {
    pub name: &'static str,
    pub bytes: &'static [u8],
}

const KICK: &[u8] = include_bytes!("../samples/kick.wav");
const SNARE: &[u8] = include_bytes!("../samples/snare.wav");
const CLAP: &[u8] = include_bytes!("../samples/clap.wav");
const LO_TOM: &[u8] = include_bytes!("../samples/lo_tom.wav");
const HI_TOM: &[u8] = include_bytes!("../samples/hi_tom.wav");
const CLOSED_HAT: &[u8] = include_bytes!("../samples/closed_hat.wav");
const OPEN_HAT: &[u8] = include_bytes!("../samples/open_hat.wav");
const CYMBAL: &[u8] = include_bytes!("../samples/cymbal.wav");

pub static POOL: &[PoolSample] = &[
    // 909-flavored names
    PoolSample { name: "909_kick", bytes: KICK },
    PoolSample { name: "909_snare", bytes: SNARE },
    PoolSample { name: "909_clap", bytes: CLAP },
    PoolSample { name: "909_lo_tom", bytes: LO_TOM },
    PoolSample { name: "909_hi_tom", bytes: HI_TOM },
    PoolSample { name: "909_closed_hat", bytes: CLOSED_HAT },
    PoolSample { name: "909_open_hat", bytes: OPEN_HAT },
    PoolSample { name: "909_crash", bytes: CYMBAL },
    // Hip-hop-flavored names (same bytes — content placeholders until the
    // pool is curated; future pool expansion plugs in here without API churn)
    PoolSample { name: "boom_kick", bytes: KICK },
    PoolSample { name: "trap_snare", bytes: SNARE },
    PoolSample { name: "snap", bytes: CLAP },
    PoolSample { name: "low_thud", bytes: LO_TOM },
    PoolSample { name: "high_tap", bytes: HI_TOM },
    PoolSample { name: "tight_hat", bytes: CLOSED_HAT },
    PoolSample { name: "wide_hat", bytes: OPEN_HAT },
    PoolSample { name: "ride", bytes: CYMBAL },
];

pub fn find(name: &str) -> Option<&'static PoolSample> {
    POOL.iter().find(|s| s.name == name)
}

pub fn contains(name: &str) -> bool {
    find(name).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pool_has_16_entries() {
        assert_eq!(POOL.len(), 16);
    }

    #[test]
    fn all_pool_names_unique() {
        let mut seen = std::collections::HashSet::new();
        for sample in POOL {
            assert!(seen.insert(sample.name), "duplicate pool name: {}", sample.name);
        }
    }

    #[test]
    fn all_pool_bytes_look_like_wav() {
        for sample in POOL {
            let b = sample.bytes;
            assert!(
                b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WAVE",
                "pool sample {} not a WAV",
                sample.name
            );
        }
    }

    #[test]
    fn find_returns_pool_entry() {
        assert!(find("909_kick").is_some());
        assert!(find("nonexistent").is_none());
    }
}
