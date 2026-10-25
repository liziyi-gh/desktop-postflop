<template>
  <el-dialog
    :model-value="true"
    title="Node Lock"
    width="min(64rem, 95vw)"
    top="5vh"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    append-to-body
    @close="$emit('close')"
  >
    <section
      aria-labelledby="node-lock-title"
      class="bg-white text-gray-900 rounded-lg p-5 w-full max-w-5xl max-h-full flex flex-col"
    >
      <h2 id="node-lock-title" class="text-xl font-bold">
        Node Lock — {{ info.player === 0 ? "OOP" : "IP" }}
      </h2>
      <p class="my-2">
        Check a hand to fix its action probabilities. Unchecked hands remain
        free. Each locked row must total 100%.
      </p>
      <p class="text-sm mb-3">
        Applying or removing locks re-solves the entire tree from scratch and
        preserves locks at other nodes.
      </p>
      <fieldset :disabled="busy" class="flex flex-col min-h-0">
        <div class="flex flex-wrap gap-3 mb-3 items-center">
          <label
            >Filter hand
            <input v-model="filter" placeholder="e.g. As" class="w-28"
          /></label>
          <button
            class="button-base button-blue"
            @click="rows.forEach((row) => (row.locked = true))"
          >
            Lock all hands
          </button>
          <button
            class="button-base button-blue"
            @click="rows.forEach((row) => (row.locked = false))"
          >
            Unlock all hands
          </button>
          <button class="button-base button-blue" @click="copyFirst">
            Copy first visible row to all visible hands
          </button>
        </div>
        <div class="overflow-auto min-h-0" style="max-height: 50vh">
          <table class="w-full text-sm text-right">
            <thead class="sticky top-0 bg-white">
              <tr>
                <th class="p-2 text-left">Lock</th>
                <th class="p-2 text-left">Hand</th>
                <th v-for="action in info.actions" :key="action" class="p-2">
                  {{ action }} %
                </th>
                <th class="p-2">Total %</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.card" class="border-t">
                <td class="p-2 text-left">
                  <input
                    v-model="row.locked"
                    type="checkbox"
                    :aria-label="`Lock ${handName(row.card)}`"
                  />
                </td>
                <td class="p-2 text-left">{{ handName(row.card) }}</td>
                <td
                  v-for="(_, action) in info.actions"
                  :key="action"
                  class="p-2"
                >
                  <input
                    v-model.number="row.values[action]"
                    :disabled="!row.locked"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    class="w-24"
                    :aria-label="`${handName(row.card)} ${
                      info.actions[action]
                    } percent`"
                  />
                </td>
                <td
                  class="p-2"
                  :class="
                    row.locked && Math.abs(total(row.values) - 100) > 0.01
                      ? 'text-red-600'
                      : ''
                  "
                >
                  {{ total(row.values).toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex gap-4 my-3">
          <label
            >Max iterations
            <input
              v-model.number="iterations"
              type="number"
              min="1"
              max="100000"
              class="w-28"
          /></label>
          <label
            >Target exploitability (chips)
            <input
              v-model.number="target"
              type="number"
              min="0"
              step="0.001"
              class="w-28"
          /></label>
        </div>
        <p v-if="error" role="alert" class="text-red-600 mb-3">{{ error }}</p>
        <div class="flex gap-3">
          <button class="button-base button-green" @click="apply(false)">
            {{ busy ? "Re-solving..." : "Apply locks and re-solve" }}
          </button>
          <button class="button-base button-blue" @click="apply(true)">
            Remove this node's locks and re-solve
          </button>
          <button class="button-base button-blue" @click="$emit('close')">
            Cancel
          </button>
        </div>
      </fieldset>
      <p v-if="busy" role="status" class="mt-3">
        Solving with the updated locks. This may take a while.
      </p>
    </section>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { cardText } from "../utils";
import { gameSolveNodeLock, type NodeLockInfo } from "../invokes";
import { useStore } from "../store";

const props = defineProps<{ info: NodeLockInfo }>();
const emit = defineEmits<{
  (event: "close"): void;
  (event: "solved", exploitability: number): void;
}>();
const store = useStore();
const busy = ref(false);
const error = ref("");
const filter = ref("");
const iterations = ref(1000);
const target = ref(0.001);
const handName = (card: number) =>
  [card & 255, card >> 8]
    .map((id) => {
      const text = cardText(id);
      return text.rank + text.suitLetter;
    })
    .join("");
const rows = ref(
  props.info.cards.map((card, hand) => {
    const locked = (props.info.locking?.[hand] ?? -1) >= 0;
    const source = locked ? props.info.locking! : props.info.strategy;
    const values = props.info.actions.map((_, action) =>
      Number((source[action * props.info.cards.length + hand] * 100).toFixed(2))
    );
    // Keep the displayed rounded percentages summing to exactly 100.
    const largest = values.indexOf(Math.max(...values));
    values[largest] = Number(
      (values[largest] + 100 - values.reduce((sum, x) => sum + x, 0)).toFixed(2)
    );
    return { card, locked, values };
  })
);
const visibleRows = computed(() =>
  rows.value.filter((row) =>
    handName(row.card).toLowerCase().includes(filter.value.toLowerCase())
  )
);
const total = (values: number[]) =>
  values.reduce((sum, x) => sum + Number(x), 0);
const copyFirst = () => {
  const first = visibleRows.value[0];
  if (!first) return;
  visibleRows.value.forEach((row) => {
    row.values = [...first.values];
    row.locked = true;
  });
};
const apply = async (remove: boolean) => {
  if (busy.value) return;
  error.value = "";
  if (
    !Number.isInteger(iterations.value) ||
    iterations.value < 1 ||
    iterations.value > 100000 ||
    !Number.isFinite(target.value) ||
    target.value < 0
  ) {
    error.value = "Enter a valid iteration limit and exploitability target.";
    return;
  }
  if (
    !remove &&
    rows.value.some(
      (row) =>
        row.locked &&
        (row.values.some((x) => !Number.isFinite(x) || x < 0 || x > 100) ||
          Math.abs(total(row.values) - 100) > 0.01)
    )
  ) {
    error.value =
      "Every locked hand must have valid probabilities totaling 100%.";
    return;
  }
  busy.value = true;
  store.isSolverRunning = true;
  try {
    const strategy =
      remove || rows.value.every((row) => !row.locked)
        ? null
        : props.info.actions.flatMap((_, action) =>
            rows.value.map((row) =>
              row.locked ? row.values[action] / 100 : -1
            )
          );
    const exploitability = await gameSolveNodeLock(
      props.info.history,
      strategy,
      iterations.value,
      target.value
    );
    emit("solved", exploitability);
  } catch (reason) {
    error.value = String(reason);
  } finally {
    busy.value = false;
    store.isSolverRunning = false;
  }
};
</script>
