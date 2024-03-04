<template>
  <button class="button-base button-green" @click="submitLoad">Load</button>
</template>

<script setup lang="ts">
 import * as invokes from "../invokes";
 import { dialog } from "@tauri-apps/api";

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
 };
</script>
