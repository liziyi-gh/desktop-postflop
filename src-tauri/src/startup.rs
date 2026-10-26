//! Versioned launch API. Parse and validate before constructing Tauri.
use crate::range::RangeManager;
use postflop_solver::{BetSizeOptions, Range};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    ffi::OsString,
    fs,
    io::{Read, Write},
    path::PathBuf,
    sync::Mutex,
};

const MAX_BYTES: u64 = 1024 * 1024;
const HELP: &str = "Desktop Postflop\n\nUsage:\n  desktop-postflop\n  desktop-postflop --import <request.json>\n  desktop-postflop --validate <request.json> [--output <response.json>]\n  desktop-postflop --capabilities [--output <response.json>]\n  desktop-postflop --version [--output <response.json>]\n  desktop-postflop --help [--output <response.txt>]\n\nImport opens a new GUI with an analysis spot. Solving remains manual.\nSee docs/launch-api.md.\n";

#[derive(Debug, PartialEq)]
enum Mode {
    Gui,
    Import(PathBuf),
    Validate(PathBuf),
    Capabilities,
    Version,
    Help,
}

fn parse(args: impl IntoIterator<Item = OsString>) -> Result<(Mode, Option<PathBuf>), String> {
    let mut args = args.into_iter();
    let mut mode = Mode::Gui;
    let mut output = None;
    while let Some(arg) = args.next() {
        if arg == "--output" {
            if output.is_some() {
                return Err("Duplicate --output".into());
            }
            output = Some(PathBuf::from(
                args.next().ok_or("--output requires a path")?,
            ));
            continue;
        }
        if mode != Mode::Gui {
            return Err("Choose exactly one command".into());
        }
        mode = match arg.to_str() {
            Some("--import") => Mode::Import(PathBuf::from(
                args.next().ok_or("--import requires a path")?,
            )),
            Some("--validate") => Mode::Validate(PathBuf::from(
                args.next().ok_or("--validate requires a path")?,
            )),
            Some("--capabilities") => Mode::Capabilities,
            Some("--version" | "-V") => Mode::Version,
            Some("--help" | "-h") => Mode::Help,
            _ => return Err(format!("Unknown argument: {}", arg.to_string_lossy())),
        };
    }
    if output.is_some() && matches!(mode, Mode::Gui | Mode::Import(_)) {
        return Err("--output requires a non-GUI command".into());
    }
    Ok((mode, output))
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRequest {
    pub schema_version: u32,
    pub request_id: Option<String>,
    pub context: Option<Context>,
    pub spot: Spot,
    #[serde(default)]
    pub tree: Tree,
    /// Namespaced metadata, never interpreted as commands.
    #[serde(default)]
    pub extensions: serde_json::Map<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    pub source: Option<String>,
    pub hand_id: Option<String>,
    pub hero_position: Option<Position>,
    pub hero_cards: Option<[String; 2]>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Position {
    Oop,
    Ip,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Spot {
    pub board: Vec<String>,
    pub ranges: Ranges,
    pub starting_pot: i32,
    pub effective_stack: i32,
    #[serde(default)]
    pub rake_percent: f64,
    #[serde(default)]
    pub rake_cap: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Ranges {
    pub oop: String,
    pub ip: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Sizes {
    #[serde(default)]
    pub bet: String,
    #[serde(default)]
    pub raise: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Street {
    #[serde(default)]
    pub oop: Sizes,
    #[serde(default)]
    pub ip: Sizes,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Tree {
    pub flop: Street,
    pub turn: Street,
    pub river: Street,
    pub add_all_in_threshold: f64,
    pub force_all_in_threshold: f64,
    pub merging_threshold: f64,
}

impl Default for Tree {
    fn default() -> Self {
        Self {
            flop: Street::default(),
            turn: Street::default(),
            river: Street::default(),
            add_all_in_threshold: 150.0,
            force_all_in_threshold: 20.0,
            merging_threshold: 10.0,
        }
    }
}

/// UI encoding: rank * 4 + suit, suits c/d/h/s.
fn card_id(card: &str) -> Result<u8, String> {
    let bytes = card.as_bytes();
    if bytes.len() == 2 {
        if let (Some(rank), Some(suit)) = (
            b"23456789TJQKA".iter().position(|&x| x == bytes[0]),
            b"cdhs".iter().position(|&x| x == bytes[1]),
        ) {
            return Ok((rank * 4 + suit) as u8);
        }
    }
    Err(format!("Invalid card {card:?}; expected e.g. As or Td"))
}

fn bounded(name: &str, value: f64, max: f64) -> Result<(), String> {
    if !value.is_finite() || value < 0.0 || value > max {
        return Err(format!("{name} must be between 0 and {max}"));
    }
    Ok(())
}

fn validate(request: &AnalysisRequest) -> Result<[Range; 2], String> {
    if request.schema_version != 1 {
        return Err(format!(
            "Unsupported schemaVersion {}; supported: 1",
            request.schema_version
        ));
    }
    let spot = &request.spot;
    if !(3..=5).contains(&spot.board.len()) {
        return Err("spot.board must contain 3, 4 or 5 cards".into());
    }
    let mut seen = 0u64;
    for card in spot.board.iter().chain(
        request
            .context
            .iter()
            .flat_map(|c| c.hero_cards.iter().flatten()),
    ) {
        let bit = 1u64 << card_id(card)?;
        if seen & bit != 0 {
            return Err(format!("Duplicate card: {card}"));
        }
        seen |= bit;
    }
    for (name, value) in [
        ("startingPot", spot.starting_pot),
        ("effectiveStack", spot.effective_stack),
    ] {
        if !(1..=30000).contains(&value) {
            return Err(format!(
                "spot.{name} must be an integer between 1 and 30000"
            ));
        }
    }
    bounded("spot.rakePercent", spot.rake_percent, 100.0)?;
    bounded("spot.rakeCap", spot.rake_cap, 90000.0)?;
    let tree = &request.tree;
    for (name, value) in [
        ("addAllInThreshold", tree.add_all_in_threshold),
        ("forceAllInThreshold", tree.force_all_in_threshold),
        ("mergingThreshold", tree.merging_threshold),
    ] {
        bounded(name, value, 3000000.0)?;
    }
    for (name, street) in [
        ("flop", &tree.flop),
        ("turn", &tree.turn),
        ("river", &tree.river),
    ] {
        for (player, sizes) in [("oop", &street.oop), ("ip", &street.ip)] {
            BetSizeOptions::try_from((sizes.bet.as_str(), sizes.raise.as_str()))
                .map_err(|e| format!("tree.{name}.{player}: {e}"))?;
            if sizes.bet.split(',').count() > 30 || sizes.raise.split(',').count() > 30 {
                return Err(format!("tree.{name}.{player}: too many sizes"));
            }
        }
    }
    let oop =
        Range::from_sanitized_str(&spot.ranges.oop).map_err(|e| format!("spot.ranges.oop: {e}"))?;
    let ip =
        Range::from_sanitized_str(&spot.ranges.ip).map_err(|e| format!("spot.ranges.ip: {e}"))?;
    for (name, range) in [("oop", &oop), ("ip", &ip)] {
        if !range.raw_data().iter().any(|&weight| weight > 0.0) {
            return Err(format!("spot.ranges.{name} must not be empty"));
        }
    }
    Ok([oop, ip])
}

fn read_request(path: &PathBuf) -> Result<(AnalysisRequest, [Range; 2]), String> {
    let file = fs::File::open(path).map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
    let mut data = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() as u64 > MAX_BYTES {
        return Err("Request exceeds 1 MiB".into());
    }
    let request: AnalysisRequest =
        serde_json::from_slice(&data).map_err(|e| format!("Invalid request JSON: {e}"))?;
    let ranges = validate(&request)?;
    Ok((request, ranges))
}

pub struct Launch {
    pub request: Option<AnalysisRequest>,
    pub ranges: RangeManager,
}

pub struct StartupState(pub Option<AnalysisRequest>);

#[tauri::command]
pub fn startup_request(state: tauri::State<Mutex<StartupState>>) -> Option<AnalysisRequest> {
    state.lock().unwrap().0.clone()
}

fn emit(body: &str, output: Option<PathBuf>) -> Result<(), String> {
    if let Some(path) = output {
        fs::write(&path, body).map_err(|e| format!("Cannot write {}: {e}", path.display()))?;
    } else {
        writeln!(std::io::stdout().lock(), "{body}").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Queries exit before constructing Tauri, GTK or a thread pool.
pub fn prepare() -> Result<Option<Launch>, (i32, String)> {
    let (mode, output) = parse(std::env::args_os().skip(1)).map_err(|e| (2, e))?;
    if let (Mode::Validate(input), Some(output)) = (&mode, &output) {
        if let (Ok(input), Ok(output)) = (fs::canonicalize(input), fs::canonicalize(output)) {
            if input == output {
                return Err((2, "Request and response must use different files".into()));
            }
        }
    }
    let result: Result<Option<Launch>, String> = (|| {
        let body = match mode {
            Mode::Gui => {
                return Ok(Some(Launch {
                    request: None,
                    ranges: RangeManager::default(),
                }));
            }
            Mode::Import(path) => {
                let (request, [oop, ip]) = read_request(&path)?;
                let mut ranges = RangeManager::default();
                ranges.0[0] = oop;
                ranges.0[1] = ip;
                return Ok(Some(Launch {
                    request: Some(request),
                    ranges,
                }));
            }
            Mode::Validate(path) => match read_request(&path) {
                Ok((request, _)) => json!({"ok": true, "schemaVersion": 1, "requestId": request.request_id}).to_string(),
                Err(error) => {
                    emit(&json!({"ok": false, "error": {"code": "INVALID_REQUEST", "message": error}}).to_string(), output)?;
                    return Err(error);
                }
            },
            Mode::Capabilities => json!({
                "application": "desktop-postflop", "version": env!("CARGO_PKG_VERSION"),
                "launchApiVersion": 1, "requestSchemaVersions": [1],
                "commands": ["import", "validate", "capabilities", "version", "help"],
                "features": {"guiImport": true, "autoSolve": false, "singleInstanceForwarding": false},
                "maxRequestBytes": MAX_BYTES
            }).to_string(),
            Mode::Version => json!({"application": "desktop-postflop", "version": env!("CARGO_PKG_VERSION")}).to_string(),
            Mode::Help => HELP.to_string(),
        };
        emit(&body, output)?;
        Ok(None)
    })();
    result.map_err(|e| (1, e))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(values: &[&str]) -> Result<(Mode, Option<PathBuf>), String> {
        parse(values.iter().map(|value| OsString::from(*value)))
    }
    fn request() -> AnalysisRequest {
        serde_json::from_value(json!({"schemaVersion": 1, "spot": {
            "board": ["As", "Kd", "2c"], "ranges": {"oop": "AA,KK", "ip": "QQ,JJ"},
            "startingPot": 20, "effectiveStack": 100
        }}))
        .unwrap()
    }
    #[test]
    fn parses_paths_and_rejects_ambiguous_commands() {
        assert_eq!(args(&[]).unwrap().0, Mode::Gui);
        assert_eq!(
            args(&["--import", "牌局 with spaces.json"]).unwrap().0,
            Mode::Import("牌局 with spaces.json".into())
        );
        assert_eq!(
            args(&["--capabilities", "--output", "response.json"]).unwrap(),
            (Mode::Capabilities, Some("response.json".into()))
        );
        for invalid in [
            vec!["--import"],
            vec!["--unknown"],
            vec!["--help", "--version"],
            vec!["--output", "x"],
            vec!["--import", "x", "--output", "y"],
            vec!["--version", "--output", "x", "--output", "y"],
        ] {
            assert!(args(&invalid).is_err());
        }
    }
    #[test]
    fn validates_version_cards_ranges_and_amounts() {
        let original = request();
        assert!(validate(&original).is_ok());
        let mutations: [fn(&mut AnalysisRequest); 8] = [
            |r| r.schema_version = 2,
            |r| r.spot.board[1] = "As".into(),
            |r| r.spot.board[1] = "10s".into(),
            |r| r.spot.starting_pot = 0,
            |r| r.spot.ranges.ip = "".into(),
            |r| r.tree.flop.oop.bet = "bad".into(),
            |r| r.spot.rake_percent = f64::NAN,
            |r| {
                r.context = Some(Context {
                    source: None,
                    hand_id: None,
                    hero_position: None,
                    hero_cards: Some(["As".into(), "Qs".into()]),
                });
            },
        ];
        for mutate in mutations {
            let mut invalid = original.clone();
            mutate(&mut invalid);
            assert!(validate(&invalid).is_err());
        }
    }
    #[test]
    fn rejects_typos_and_preserves_extensions() {
        let mut value = serde_json::to_value(request()).unwrap();
        value["spot"]["startingPo"] = json!(10);
        assert!(serde_json::from_value::<AnalysisRequest>(value).is_err());
        let mut original = request();
        original
            .extensions
            .insert("com.example.tracker".into(), json!({"id": "123"}));
        let roundtrip: AnalysisRequest =
            serde_json::from_str(&serde_json::to_string(&original).unwrap()).unwrap();
        assert_eq!(original.extensions, roundtrip.extensions);
    }

    #[test]
    fn documented_example_is_accepted() {
        let request: AnalysisRequest =
            serde_json::from_str(include_str!("../../docs/examples/tracker-request.json")).unwrap();
        assert!(validate(&request).is_ok());
    }
}
