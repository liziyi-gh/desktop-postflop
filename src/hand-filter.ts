import type { Results } from "./result-types";

export const madeHands = {
  "straight-flush": "Straight flush",
  quads: "Four of a kind",
  "full-house": "Full house",
  flush: "Flush",
  straight: "Straight",
  set: "Set",
  trips: "Trips",
  "two-pair": "Two pair",
  overpair: "Overpair",
  "top-pair": "Top pair",
  "second-pair": "Second pair",
  "other-pair": "Other pair",
  underpair: "Underpair",
  "board-pair": "Board pair",
  "high-card": "High card",
} as const;
export type MadeHand = keyof typeof madeHands;

export const drawTypes = {
  "flush-draw": "Flush draw",
  "backdoor-flush": "Backdoor flush draw",
  "straight-draw": "Open-ended / double gutshot",
  gutshot: "Gutshot",
  none: "No draw",
} as const;
export type Draw = keyof typeof drawTypes;

export type HandFeatures = { made: MadeHand; draws: Draw[] };
export type HandFilter = {
  made: MadeHand[];
  draws: Draw[];
  suits: number[];
  suited: "any" | "suited" | "offsuit";
  equityMin: number;
  equityMax: number;
  action: number;
  frequencyMin: number;
  frequencyMax: number;
};

export const emptyHandFilter = (): HandFilter => ({
  made: [],
  draws: [],
  suits: [],
  suited: "any",
  equityMin: 0,
  equityMax: 100,
  action: -1,
  frequencyMin: 0,
  frequencyMax: 100,
});

export const isHandFilterActive = (filter: HandFilter) =>
  filter.made.length > 0 ||
  filter.draws.length > 0 ||
  filter.suits.length > 0 ||
  filter.suited !== "any" ||
  filter.equityMin > 0 ||
  filter.equityMax < 100 ||
  filter.action >= 0;

// Ranks are 0 (deuce) through 12 (ace); the wheel is a separate window.
const straights = [
  [12, 0, 1, 2, 3],
  ...Array.from({ length: 9 }, (_, low) =>
    Array.from({ length: 5 }, (_, i) => low + i)
  ),
];
const hasStraight = (ranks: Set<number>) =>
  straights.some((window) => window.every((rank) => ranks.has(rank)));

/** Best five-card made hand, including hands made entirely by the board. */
export const classifyHand = (
  pair: number,
  board: number[]
): HandFeatures | null => {
  const hole = [pair & 0xff, pair >>> 8];
  const cards = [...board, ...hole];
  if (
    board.length < 3 ||
    board.length > 5 ||
    cards.some((card) => !Number.isInteger(card) || card < 0 || card >= 52) ||
    new Set(cards).size !== cards.length
  )
    return null;

  const ranks = cards.map((card) => card >>> 2);
  const rankSet = new Set(ranks);
  const counts = Array.from(
    { length: 13 },
    (_, rank) => ranks.filter((r) => r === rank).length
  );
  const suits = Array.from({ length: 4 }, (_, suit) =>
    cards.filter((card) => (card & 3) === suit)
  );
  const flush = suits.find((cards) => cards.length >= 5);
  const tripRanks = counts.flatMap((n, r) => (n >= 3 ? [r] : []));
  const pairRanks = counts.flatMap((n, r) => (n >= 2 ? [r] : []));
  const boardRanks = [...new Set(board.map((card) => card >>> 2))].sort(
    (a, b) => b - a
  );
  const holeRanks = hole.map((card) => card >>> 2);
  const pocketPair = holeRanks[0] === holeRanks[1];
  let made: MadeHand;
  if (flush && hasStraight(new Set(flush.map((card) => card >>> 2))))
    made = "straight-flush";
  else if (counts.includes(4)) made = "quads";
  else if (tripRanks.length && pairRanks.length >= 2) made = "full-house";
  else if (flush) made = "flush";
  else if (hasStraight(rankSet)) made = "straight";
  else if (tripRanks.length)
    made = pocketPair && holeRanks[0] === tripRanks[0] ? "set" : "trips";
  else if (pairRanks.length >= 2) made = "two-pair";
  else if (pairRanks.length) {
    const rank = pairRanks[0];
    if (!holeRanks.includes(rank)) made = "board-pair";
    else if (pocketPair) {
      made =
        rank > boardRanks[0]
          ? "overpair"
          : rank < boardRanks[boardRanks.length - 1]
          ? "underpair"
          : "other-pair";
    } else {
      made =
        rank === boardRanks[0]
          ? "top-pair"
          : rank === boardRanks[1]
          ? "second-pair"
          : "other-pair";
    }
  } else made = "high-card";

  const draws: Draw[] = [];
  // Draws must use a hole card and are only meaningful before the river.
  if (
    board.length < 5 &&
    !["straight-flush", "quads", "full-house", "flush"].includes(made)
  ) {
    for (let suit = 0; suit < 4; ++suit) {
      if (!hole.some((card) => (card & 3) === suit)) continue;
      if (suits[suit].length === 4) draws.push("flush-draw");
      else if (board.length === 3 && suits[suit].length === 3)
        draws.push("backdoor-flush");
    }
    if (made !== "straight") {
      const outs = new Set<number>();
      for (const window of straights) {
        const missing = window.filter((rank) => !rankSet.has(rank));
        if (
          missing.length === 1 &&
          holeRanks.some(
            (rank) => window.includes(rank) && !boardRanks.includes(rank)
          )
        ) {
          outs.add(missing[0]);
        }
      }
      if (outs.size >= 2) draws.push("straight-draw");
      else if (outs.size === 1) draws.push("gutshot");
    }
  }
  if (!draws.length) draws.push("none");
  return { made, draws };
};

export const handMatches = (
  pair: number,
  features: HandFeatures | null,
  filter: HandFilter,
  equity: number | undefined,
  strategy: number | undefined
) => {
  if (!features) return false;
  if (filter.made.length && !filter.made.includes(features.made)) return false;
  if (
    filter.draws.length &&
    !filter.draws.some((draw) => features.draws.includes(draw))
  )
    return false;
  const suits = [pair & 3, (pair >>> 8) & 3];
  if (filter.suits.length && !filter.suits.some((suit) => suits.includes(suit)))
    return false;
  if (filter.suited === "suited" && suits[0] !== suits[1]) return false;
  if (filter.suited === "offsuit" && suits[0] === suits[1]) return false;
  if (filter.equityMin > 0 || filter.equityMax < 100) {
    if (
      equity === undefined ||
      !Number.isFinite(equity) ||
      equity * 100 < filter.equityMin ||
      equity * 100 > filter.equityMax
    )
      return false;
  }
  if (filter.action >= 0) {
    if (
      strategy === undefined ||
      !Number.isFinite(strategy) ||
      strategy * 100 < filter.frequencyMin ||
      strategy * 100 > filter.frequencyMax
    )
      return false;
  }
  return true;
};

/** Mask entries rather than removing them: strategy arrays use original hand indices. */
export const filterResults = (
  results: Results,
  cards: number[][],
  features: (HandFeatures | null)[][],
  filters: HandFilter[]
): Results => {
  const masks = cards.map((hands, player) =>
    hands.map((pair, index) => {
      const filter = filters[player];
      const strategy =
        results.currentPlayer === ["oop", "ip"][player] &&
        filter.action < results.numActions
          ? results.strategy[filter.action * hands.length + index]
          : undefined;
      return handMatches(
        pair,
        features[player][index],
        filter,
        results.isEmpty ? undefined : results.equity[player][index],
        strategy
      );
    })
  );
  return {
    ...results,
    weights: results.weights.map((values, player) =>
      values.map((v, i) => (masks[player][i] ? v : 0))
    ),
    normalizer: results.normalizer.map((values, player) =>
      values.map((v, i) => (masks[player][i] ? v : 0))
    ),
  };
};

export const handDistribution = (
  results: Results,
  features: (HandFeatures | null)[],
  player: number
) => {
  const groups = (Object.keys(madeHands) as MadeHand[]).map((made) => ({
    made,
    combos: 0,
    normalizer: 0,
    strategy: Array.from(
      {
        length:
          results.currentPlayer === ["oop", "ip"][player]
            ? results.numActions
            : 0,
      },
      () => 0
    ),
  }));
  features.forEach((feature, i) => {
    const weight = results.weights[player][i];
    const n = results.normalizer[player][i];
    if (!feature || !(weight > 0) || !(n > 0)) return;
    const group = groups.find((group) => group.made === feature.made)!;
    group.combos += weight;
    group.normalizer += n;
    group.strategy.forEach((_, action) => {
      group.strategy[action] +=
        results.strategy[action * features.length + i] * n;
    });
  });
  const total = groups.reduce((sum, group) => sum + group.combos, 0);
  return groups.map((group) => ({
    ...group,
    percentage: total ? (group.combos / total) * 100 : 0,
    strategy: group.strategy.map((sum) =>
      group.normalizer ? sum / group.normalizer : 0
    ),
  }));
};
