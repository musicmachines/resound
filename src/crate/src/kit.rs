use serde::Deserialize;

use crate::pattern::NUM_VOICES;
use crate::pool;

#[derive(Deserialize)]
struct KitJson {
    name: String,
    voices: Vec<String>,
}

pub struct Kit {
    pub name: String,
    pub voice_samples: [String; NUM_VOICES],
    /// Raw JSON source, retained for `kit_json` round-tripping (spec §13).
    pub raw_json: &'static str,
}

struct KitSource {
    json: &'static str,
}

const KIT_SOURCES: &[KitSource] = &[
    KitSource { json: include_str!("../kits/909.json") },
    KitSource { json: include_str!("../kits/hip-hop.json") },
];

pub fn load_all() -> Vec<Kit> {
    KIT_SOURCES
        .iter()
        .map(|src| parse(src.json).expect("embedded kit JSON must parse"))
        .collect()
}

fn parse(json: &'static str) -> Result<Kit, String> {
    let parsed: KitJson =
        serde_json::from_str(json).map_err(|e| format!("kit JSON parse: {e}"))?;
    if parsed.voices.len() != NUM_VOICES {
        return Err(format!(
            "kit '{}' has {} voices, expected {}",
            parsed.name,
            parsed.voices.len(),
            NUM_VOICES
        ));
    }
    for v in &parsed.voices {
        if !pool::contains(v) {
            return Err(format!("kit '{}' references unknown pool sample '{}'", parsed.name, v));
        }
    }
    let mut voice_samples: [String; NUM_VOICES] = Default::default();
    for (i, name) in parsed.voices.into_iter().enumerate() {
        voice_samples[i] = name;
    }
    Ok(Kit {
        name: parsed.name,
        voice_samples,
        raw_json: json,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_kits_parse_at_boot() {
        let kits = load_all();
        assert_eq!(kits.len(), 2, "v2 ships two kits per spec §19");
        for kit in &kits {
            assert!(!kit.name.is_empty());
            assert_eq!(kit.voice_samples.len(), NUM_VOICES);
            for name in &kit.voice_samples {
                assert!(pool::contains(name), "kit '{}' has unknown sample '{}'", kit.name, name);
            }
        }
    }

    #[test]
    fn first_kit_is_909() {
        let kits = load_all();
        assert_eq!(kits[0].name, "909");
    }

    #[test]
    fn second_kit_is_hip_hop() {
        let kits = load_all();
        assert_eq!(kits[1].name, "Hip-Hop");
    }

    #[test]
    fn raw_json_round_trips() {
        let kits = load_all();
        for kit in &kits {
            assert!(kit.raw_json.contains(&kit.name));
        }
    }
}
