<template>
  <button class="button-base button-green" @click="submitLoad">Load</button>
</template>

<script setup lang="ts">
import {
  useStore,
  useConfigStore,
  useTmpConfigStore,
  useSavedConfigStore,
  saveConfigTmp,
  saveConfig,
} from "../store";
import * as invokes from "../invokes";
import { dialog } from "@tauri-apps/api";

const store = useStore();
const saved_config = useSavedConfigStore();

const submitLoad = async () => {
  let load_path = await dialog.open({
    defaultPath: "result.psr",
    filters: [
      // Psr: PostSolver result
      { name: "Psr Files", extensions: ["psr"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (load_path === null) {
    return;
  }
  if (Array.isArray(load_path)) {
    return;
  }
  let success = await invokes.loadPostSolveResult(load_path);
  if (!success) {
    return;
  }

  let back_end_card_config = await invokes.loadCardConfig();
  saved_config.board = back_end_card_config.flop;
  const is_valid_card = (card: number) => {
    return card >= 0 && card <= 52;
  };
  if (is_valid_card(back_end_card_config.turn)) {
    saved_config.board.push(back_end_card_config.turn);
  }
  if (is_valid_card(back_end_card_config.river)) {
    saved_config.board.push(back_end_card_config.river);
  }
  saved_config.startingPot = back_end_card_config.starting_pot;
  saved_config.effectiveStack = back_end_card_config.effective_stack;
  store.isSolverFinished = true;
};
</script>
