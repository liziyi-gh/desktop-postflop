<template>
  <details class="shrink-0 border-b border-gray-400 bg-gray-50">
    <summary class="cursor-pointer px-4 py-2">
      Hand filters &amp; distribution
      <span v-for="(summary, i) in summaries" :key="i" class="ml-4 text-sm">
        {{ i === 0 ? "OOP" : "IP" }}: {{ summary.shown.toFixed(2) }} /
        {{ summary.total.toFixed(2) }} combos
        {{ isHandFilterActive(filters[i]) ? "(filtered)" : "" }}
      </span>
    </summary>
    <div
      ref="panel"
      class="hand-filter-panel px-4 pb-4 text-sm"
      :style="{ resize: allowResize ? 'both' : 'none' }"
    >
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <button
          v-for="(name, i) in ['OOP', 'IP']"
          :key="name"
          type="button"
          class="rounded border px-3 py-1"
          :class="
            player === i ? 'bg-emerald-200 border-emerald-700' : 'bg-white'
          "
          :aria-pressed="player === i"
          @click="player = i"
        >
          {{ name }}
        </button>
        <button
          type="button"
          class="underline ml-2"
          @click="update(emptyHandFilter())"
        >
          Reset {{ player === 0 ? "OOP" : "IP" }}
        </button>
        <button
          type="button"
          class="underline"
          @click="
            emit('update:filters', [emptyHandFilter(), emptyHandFilter()])
          "
        >
          Reset all
        </button>
        <div class="flex flex-wrap items-center gap-3 ml-auto">
          <label class="inline-flex items-center gap-1">
            <input v-model="allowResize" type="checkbox" />
            Resize panel
          </label>
          <button type="button" class="underline" @click="resetPanelSize">
            Reset size
          </button>
          <span v-if="allowResize" class="text-gray-600">
            Drag the bottom-right corner
          </span>
        </div>
      </div>
      <p class="mb-2 text-gray-600">
        Select any within a group; groups combine with AND. Percentages below
        use the full range's weighted combos. Strategy averages use matchup
        weights. Filters change the view, not the solution or opponent range
        used for EQ/EV.
      </p>
      <div class="hand-filter-columns">
        <fieldset class="min-w-0">
          <legend class="font-semibold mb-1">
            Made hands — click to filter
          </legend>
          <div class="made-hand-grid">
            <button
              v-for="group in distribution"
              :key="group.made"
              type="button"
              class="border rounded px-2 py-1 text-left"
              :aria-pressed="filter.made.includes(group.made)"
              :class="
                filter.made.includes(group.made)
                  ? 'bg-emerald-100 border-emerald-700'
                  : 'bg-white'
              "
              @click="update({ made: toggle(filter.made, group.made) })"
            >
              <span class="flex justify-between gap-2"
                ><span>{{ madeHands[group.made] }}</span
                ><span class="shrink-0"
                  >{{ group.percentage.toFixed(1) }}%</span
                ></span
              >
              <span class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-gray-600 whitespace-nowrap">
                  {{ group.combos.toFixed(2) }} combos
                </span>
                <span
                  v-if="actions.length && group.combos"
                  class="flex flex-1 h-2"
                  :title="strategyText(group.strategy)"
                >
                  <span
                    v-for="(frequency, i) in group.strategy"
                    :key="i"
                    :style="{
                      width: `${frequency * 100}%`,
                      backgroundColor: actions[i]?.color,
                    }"
                  ></span>
                </span>
              </span>
            </button>
          </div>
          <p v-if="actions.length" class="mt-2">
            Strategy colors:
            <span v-for="action in actions" :key="action.index" class="ml-2">
              <span
                class="inline-block w-3 h-3"
                :style="{ backgroundColor: action.color }"
              ></span>
              {{ action.name }} {{ action.amount !== "0" ? action.amount : "" }}
            </span>
            (hover a bar for frequencies)
          </p>
        </fieldset>
        <div class="min-w-0 space-y-2">
          <fieldset>
            <legend class="font-semibold">
              Hole-card suits (contains at least one)
            </legend>
            <label
              v-for="(suit, i) in [
                '♣ Clubs',
                '♦ Diamonds',
                '♥ Hearts',
                '♠ Spades',
              ]"
              :key="suit"
              class="inline-flex items-center gap-1 mr-3"
            >
              <input
                type="checkbox"
                :checked="filter.suits.includes(i)"
                @change="update({ suits: toggle(filter.suits, i) })"
              />{{ suit }}
            </label>
            <label class="block mt-1"
              >Suit pattern
              <select
                :value="filter.suited"
                class="ml-2 rounded py-0.5"
                @change="
                  update({
                    suited: ($event.target as HTMLSelectElement)
                      .value as HandFilter['suited'],
                  })
                "
              >
                <option value="any">Any</option>
                <option value="suited">Suited</option>
                <option value="offsuit">Offsuit</option>
              </select>
            </label>
          </fieldset>
          <fieldset>
            <legend class="font-semibold">Draws</legend>
            <label
              v-for="(label, draw) in drawTypes"
              :key="draw"
              class="inline-flex items-center gap-1 mr-3"
            >
              <input
                type="checkbox"
                :checked="filter.draws.includes(draw)"
                @change="update({ draws: toggle(filter.draws, draw) })"
              />{{ label }}
            </label>
            <p class="text-gray-600">
              Draws require a hole card; backdoors are flop-only. River hands
              have no draws.
            </p>
          </fieldset>
          <fieldset :disabled="!!results.isEmpty">
            <legend class="font-semibold">Equity bucket (%)</legend>
            <label
              >Min
              <input
                aria-label="Minimum equity"
                type="number"
                min="0"
                max="100"
                :value="filter.equityMin"
                class="w-20 rounded py-0.5"
                @change="updateNumber('equityMin', $event)"
            /></label>
            <label class="ml-2"
              >Max
              <input
                aria-label="Maximum equity"
                type="number"
                min="0"
                max="100"
                :value="filter.equityMax"
                class="w-20 rounded py-0.5"
                @change="updateNumber('equityMax', $event)"
            /></label>
            <p v-if="results.isEmpty" class="text-gray-600">
              Equity unavailable at this node.
            </p>
          </fieldset>
          <fieldset :disabled="!actions.length">
            <legend class="font-semibold">Strategy frequency (%)</legend>
            <label
              >Action
              <select
                :value="filter.action"
                class="ml-2 rounded py-0.5"
                @change="
                  update({
                    action: Number(($event.target as HTMLSelectElement).value),
                  })
                "
              >
                <option :value="-1">Any</option>
                <option v-for="(action, i) in actions" :key="i" :value="i">
                  {{ action.name }}
                  {{ action.amount !== "0" ? action.amount : "" }}
                </option>
              </select>
            </label>
            <div class="mt-1">
              <label
                >Min
                <input
                  aria-label="Minimum action frequency"
                  type="number"
                  min="0"
                  max="100"
                  :value="filter.frequencyMin"
                  class="w-20 rounded py-0.5"
                  @change="updateNumber('frequencyMin', $event)"
              /></label>
              <label class="ml-2"
                >Max
                <input
                  aria-label="Maximum action frequency"
                  type="number"
                  min="0"
                  max="100"
                  :value="filter.frequencyMax"
                  class="w-20 rounded py-0.5"
                  @change="updateNumber('frequencyMax', $event)"
              /></label>
            </div>
            <p v-if="!actions.length" class="text-gray-600">
              Select the acting player at a decision node.
            </p>
          </fieldset>
        </div>
      </div>
    </div>
    <p
      v-if="summaries.some((summary) => summary.shown === 0)"
      role="status"
      class="px-4 pb-2 text-sm"
    >
      {{
        summaries
          .map((summary, i) =>
            summary.shown === 0 ? (i === 0 ? "OOP" : "IP") : ""
          )
          .filter(Boolean)
          .join(" / ")
      }}: No matching hands. Adjust or reset the filters to show more hands.
    </p>
  </details>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Results, Spot, SpotPlayer } from "../result-types";
import {
  madeHands,
  drawTypes,
  emptyHandFilter,
  isHandFilterActive,
  handDistribution,
} from "../hand-filter";
import type { HandFilter, HandFeatures } from "../hand-filter";

const props = defineProps<{
  filters: HandFilter[];
  features: (HandFeatures | null)[][];
  results: Results;
  filteredResults: Results;
  selectedSpot: Spot;
  displayPlayer: "oop" | "ip";
}>();
const emit = defineEmits<{
  (event: "update:filters", filters: HandFilter[]): void;
}>();
const panel = ref<HTMLDivElement | null>(null);
const allowResize = ref(true);
const resetPanelSize = () => {
  panel.value?.style.removeProperty("width");
  panel.value?.style.removeProperty("height");
};
const player = ref(props.displayPlayer === "oop" ? 0 : 1);
watch(
  () => props.displayPlayer,
  (value) => {
    player.value = value === "oop" ? 0 : 1;
  }
);
const filter = computed(() => props.filters[player.value]);
const update = (patch: Partial<HandFilter>) => {
  emit(
    "update:filters",
    props.filters.map((filter, i) =>
      i === player.value ? { ...filter, ...patch } : filter
    )
  );
};
const toggle = <T,>(items: T[], value: T) =>
  items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
const updateNumber = (
  key: "equityMin" | "equityMax" | "frequencyMin" | "frequencyMax",
  event: Event
) => {
  const input = event.target as HTMLInputElement;
  const number = input.valueAsNumber;
  const value = Number.isFinite(number)
    ? Math.max(0, Math.min(100, number))
    : key.endsWith("Min")
    ? 0
    : 100;
  input.value = String(value);
  const patch: Partial<HandFilter> = { [key]: value };
  // Keep each interval ordered, including when its other endpoint moves.
  if (key === "equityMin" && value > filter.value.equityMax)
    patch.equityMax = value;
  if (key === "equityMax" && value < filter.value.equityMin)
    patch.equityMin = value;
  if (key === "frequencyMin" && value > filter.value.frequencyMax)
    patch.frequencyMax = value;
  if (key === "frequencyMax" && value < filter.value.frequencyMin)
    patch.frequencyMin = value;
  update(patch);
};
const distribution = computed(() =>
  handDistribution(props.results, props.features[player.value], player.value)
);
const actions = computed(() =>
  props.selectedSpot.type === "player" &&
  props.results.currentPlayer === ["oop", "ip"][player.value]
    ? (props.selectedSpot as SpotPlayer).actions
    : []
);
const strategyText = (strategy: number[]) =>
  strategy
    .map(
      (value, i) =>
        `${actions.value[i]?.name} ${actions.value[i]?.amount}: ${(
          value * 100
        ).toFixed(1)}%`
    )
    .join(", ");
const combos = (results: Results, player: number) =>
  results.weights[player].reduce(
    (sum, weight, i) => sum + (results.normalizer[player][i] > 0 ? weight : 0),
    0
  );
const summaries = computed(() =>
  [0, 1].map((player) => ({
    total: combos(props.results, player),
    shown: combos(props.filteredResults, player),
  }))
);
</script>

<style scoped>
.hand-filter-panel {
  /* Fill the available width and show the controls without the old 18rem cap. */
  width: 100%;
  height: min(34rem, 68vh);
  min-width: min(42rem, 100%);
  max-width: 100%;
  min-height: 14rem;
  max-height: max(14rem, calc(100vh - 14rem));
  overflow: auto;
  border-right: 1px solid #9ca3af;
  border-bottom: 1px solid #9ca3af;
}

.hand-filter-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
}

.hand-filter-columns > fieldset {
  flex: 3 1 28rem;
}

.hand-filter-columns > div {
  flex: 2 1 22rem;
}

.made-hand-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: 0.375rem;
}
</style>
