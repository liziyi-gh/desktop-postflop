use postflop_solver::*;
use std::fs::{self, OpenOptions};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

/// Replace an existing result only after encoding and flushing a complete new file.
pub fn save_result(game: &PostFlopGame, path: &Path) -> Result<(), String> {
    let name = path.file_name().ok_or("Choose a result file.")?;
    let mut temporary_name = name.to_os_string();
    temporary_name.push(format!(
        ".{}.{}.tmp",
        std::process::id(),
        NEXT_FILE.fetch_add(1, Ordering::Relaxed)
    ));
    let temporary_path = path.with_file_name(temporary_name);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary_path)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        save_data_into_std_write(game, "", &mut file, Some(4))?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary_path, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_save_keeps_previous_file_and_removes_temporary_file() {
        let dir = std::env::temp_dir().join(format!(
            "desktop-postflop-save-{}-{}",
            std::process::id(),
            NEXT_FILE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("result.psr");
        fs::write(&path, b"previous result").unwrap();
        assert!(save_result(&PostFlopGame::default(), &path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"previous result");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn saved_result_replaces_previous_file_and_loads() {
        let cards = CardConfig {
            range: ["AsAh".parse().unwrap(), "KsKh".parse().unwrap()],
            flop: flop_from_str("2s3h4d").unwrap(),
            turn: card_from_str("6c").unwrap(),
            river: card_from_str("7c").unwrap(),
        };
        let tree = ActionTree::new(TreeConfig {
            initial_state: BoardState::River,
            starting_pot: 20,
            effective_stack: 10,
            ..Default::default()
        })
        .unwrap();
        let mut game = PostFlopGame::with_config(cards, tree).unwrap();
        game.allocate_memory(false);
        solve(&mut game, 10, 0.001, false);
        let dir = std::env::temp_dir().join(format!(
            "desktop-postflop-roundtrip-{}-{}",
            std::process::id(),
            NEXT_FILE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("result.psr");
        fs::write(&path, b"previous result").unwrap();
        save_result(&game, &path).unwrap();
        let (loaded, _): (PostFlopGame, _) = load_data_from_file(&path, None).unwrap();
        assert!(loaded.is_solved());
        assert_eq!(loaded.card_config().flop, game.card_config().flop);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }
}
