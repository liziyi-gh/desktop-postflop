use postflop_solver::*;
use rayon::ThreadPool;
use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize)]
pub struct NodeLockInfo {
    history: Vec<usize>,
    player: usize,
    actions: Vec<String>,
    cards: Vec<u16>,
    strategy: Vec<f32>,
    locking: Option<Vec<f32>>,
}

fn check_node(game: &PostFlopGame) -> Result<(), String> {
    if !game.is_solved() {
        return Err("Finish solving before editing node locks.".into());
    }
    if game.storage_mode() != BoardState::River {
        return Err("Node locking requires a saved result with the full river tree.".into());
    }
    if game.is_terminal_node() || game.is_chance_node() {
        return Err("Select a player decision node.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn game_node_lock_info(
    game_state: tauri::State<Mutex<PostFlopGame>>,
) -> Result<NodeLockInfo, String> {
    let game = game_state.lock().map_err(|e| e.to_string())?;
    check_node(&game)?;
    let player = game.current_player();
    Ok(NodeLockInfo {
        history: game.history().to_vec(),
        player,
        actions: game
            .available_actions()
            .iter()
            .map(|a| format!("{a:?}"))
            .collect(),
        cards: game
            .private_cards(player)
            .iter()
            .map(|&(a, b)| a as u16 | (b as u16) << 8)
            .collect(),
        strategy: game.strategy(),
        locking: game.current_locking_strategy(),
    })
}

#[tauri::command(async)]
pub fn game_solve_node_lock(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    pool_state: tauri::State<Mutex<ThreadPool>>,
    history: Vec<usize>,
    strategy: Option<Vec<f32>>,
    iterations: u32,
    target: f32,
) -> Result<f32, String> {
    if !(1..=100_000).contains(&iterations) || !target.is_finite() || target < 0.0 {
        return Err("Invalid iteration limit or exploitability target.".into());
    }
    let mut game = game_state.lock().map_err(|e| e.to_string())?;
    check_node(&game)?;
    if game.history() != history {
        return Err("The selected node changed. Reopen the node lock editor.".into());
    }
    let actions = game.available_actions().len();
    let hands = game.num_private_hands(game.current_player());
    if let Some(ref strategy) = strategy {
        validate_strategy(strategy, actions, hands)?;
    }
    let pool = pool_state.lock().map_err(|e| e.to_string())?;
    // Finalized buffers contain EVs, not regrets. Restart while preserving all other locks.
    game.restart_solving()?;
    game.apply_history(&history);
    match strategy {
        Some(ref strategy) => game.lock_current_strategy(strategy),
        None => game.unlock_current_strategy(),
    }
    game.back_to_root();
    let game = &mut *game;
    let exploitability = pool.install(|| solve(game, iterations, target, false));
    game.apply_history(&history);
    Ok(exploitability)
}

fn validate_strategy(strategy: &[f32], actions: usize, hands: usize) -> Result<(), String> {
    if strategy.len() != actions * hands || strategy.iter().any(|x| !x.is_finite()) {
        return Err("Invalid strategy size or non-finite probability.".into());
    }
    for hand in 0..hands {
        let values: Vec<_> = (0..actions).map(|a| strategy[a * hands + hand]).collect();
        if values.iter().all(|&x| x == -1.0) {
            continue;
        }
        let sum: f64 = values.iter().map(|&x| x as f64).sum();
        if values.iter().any(|&x| !(0.0..=1.0).contains(&x)) || (sum - 1.0).abs() > 1e-4 {
            return Err(format!(
                "Hand {}: probabilities must total 100%, or unlock the hand.",
                hand + 1
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_action_major_partial_locks() {
        assert!(validate_strategy(&[0.25, -1.0, 0.75, -1.0], 2, 2).is_ok());
        for invalid in [
            vec![0.0, 0.0],
            vec![f32::NAN, 1.0],
            vec![-1.0, 1.0],
            vec![0.5],
        ] {
            assert!(validate_strategy(&invalid, 2, 1).is_err());
        }
    }
}
