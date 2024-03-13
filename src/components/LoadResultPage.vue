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
const config = useConfigStore();

const submitLoad = async () => {
  let load_path = await dialog.open({
  defaultPath: "result.psr",
    filters: [
      // stand for PostSolver result
      { name: "Psr Files", extensions: ["psr"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
   console.log("loadpath is", load_path);
   if (load_path === null) {
     return;
   }
   if (Array.isArray(load_path)) {
     return;
   }
   let success = await invokes.loadPostSolveResult(load_path);
   if (success) {
     store.isSolverFinished = true;
   } else {
     console.log("load result failed!");
   }
   let back_end_card_config = await invokes.loadCardConfig();
   config.board = back_end_card_config.flop;
   const is_valid_card = (card: number) => {
     return (card >= 0) && (card <= 52);
   }
   if (is_valid_card(back_end_card_config.turn)) {
     config.board.push(back_end_card_config.turn);
   }
   if (is_valid_card(back_end_card_config.river)) {
     config.board.push(back_end_card_config.river);
   }
   config.
 };
</script>
