import { invoke } from "@tauri-apps/api/core";
import { rangeGetWeights } from "./invokes";
import { useConfigStore, useStore } from "./store";

type Sizes = { bet: string; raise: string };
type Street = { oop: Sizes; ip: Sizes };

export type LaunchContext = {
  source: string | null;
  handId: string | null;
  heroPosition: "oop" | "ip" | null;
  heroCards: [string, string] | null;
};

type AnalysisRequest = {
  schemaVersion: number;
  requestId: string | null;
  context: LaunchContext | null;
  spot: {
    board: string[];
    startingPot: number;
    effectiveStack: number;
    rakePercent: number;
    rakeCap: number;
  };
  tree: {
    flop: Street;
    turn: Street;
    river: Street;
    addAllInThreshold: number;
    forceAllInThreshold: number;
    mergingThreshold: number;
  };
};

// The engine uses explicit percentages; the GUI stores them without "%" and
// convertBetString adds it back when building the game.
const guiSize = (size: string) =>
  size
    .split(",")
    .map((entry) => entry.trim().replace(/%$/, ""))
    .join(",");

// Called before mounting any components, so their local state sees imported data.
export async function initializeStartup() {
  const request = await invoke<AnalysisRequest | null>("startup_request");
  if (!request) return;
  const weights = await Promise.all([rangeGetWeights(0), rangeGetWeights(1)]);
  const config = useConfigStore();
  const store = useStore();
  config.$patch({
    board: request.spot.board.map(
      (card) => "23456789TJQKA".indexOf(card[0]) * 4 + "cdhs".indexOf(card[1])
    ),
    startingPot: request.spot.startingPot,
    effectiveStack: request.spot.effectiveStack,
    rakePercent: request.spot.rakePercent,
    rakeCap: request.spot.rakeCap,
    oopFlopBet: guiSize(request.tree.flop.oop.bet),
    oopFlopRaise: guiSize(request.tree.flop.oop.raise),
    ipFlopBet: guiSize(request.tree.flop.ip.bet),
    ipFlopRaise: guiSize(request.tree.flop.ip.raise),
    oopTurnBet: guiSize(request.tree.turn.oop.bet),
    oopTurnRaise: guiSize(request.tree.turn.oop.raise),
    ipTurnBet: guiSize(request.tree.turn.ip.bet),
    ipTurnRaise: guiSize(request.tree.turn.ip.raise),
    oopRiverBet: guiSize(request.tree.river.oop.bet),
    oopRiverRaise: guiSize(request.tree.river.oop.raise),
    ipRiverBet: guiSize(request.tree.river.ip.bet),
    ipRiverRaise: guiSize(request.tree.river.ip.raise),
    addAllInThreshold: request.tree.addAllInThreshold,
    forceAllInThreshold: request.tree.forceAllInThreshold,
    mergingThreshold: request.tree.mergingThreshold,
  });
  weights.forEach((range, player) => {
    store.ranges[player] = range.map((weight) => weight * 100);
  });
  store.launchContext = request.context;
  store.launchRequestId = request.requestId;
  store.sideView = "run-solver";
}
