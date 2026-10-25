<template>
  <p>Desktop Postflop v0.2.7</p>
  <p>Copyright (C) 2022 Wataru Inariba</p>
  <p>
    <a
      target="_blank"
      class="link"
      href="https://github.com/b-inary/desktop-postflop"
      @click.prevent="openUrl('https://github.com/b-inary/desktop-postflop')"
    >
      https://github.com/b-inary/desktop-postflop
    </a>
  </p>
</template>

<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
</script>

<style scoped>
.link {
  @apply text-blue-500 hover:underline;
}
</style>
