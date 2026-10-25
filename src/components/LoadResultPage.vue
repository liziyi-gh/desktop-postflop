<template>
  <div class="p-4">
    <button
      class="button-base button-green"
      :disabled="busy || store.isSolverRunning || store.isFinalizing"
      @click="submitLoad"
    >
      {{ busy ? "Loading..." : "Load Result" }}
    </button>
    <p v-if="error" role="alert" class="text-red-600 mt-2">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useStore, useSavedConfigStore } from "../store";
import * as invokes from "../invokes";
import * as dialog from "@tauri-apps/plugin-dialog";

const store = useStore();
const saved_config = useSavedConfigStore();
const busy = ref(false);
const error = ref("");

const submitLoad = async () => {
  if (busy.value || store.isSolverRunning || store.isFinalizing) return;
  busy.value = true;
  error.value = "";
  try {
    const load_path = await dialog.open({
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
    await invokes.loadPostSolveResult(load_path);

    const back_end_card_config = await invokes.loadCardConfig();
    saved_config.board = back_end_card_config.flop;
    const is_valid_card = (card: number) => {
      return card >= 0 && card < 52;
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
    store.isSolverPaused = false;
    store.isSolverError = false;
    store.resultRevision++;
    store.navView = "results";
  } catch (reason) {
    error.value = String(reason);
  } finally {
    busy.value = false;
  }
};
</script>
