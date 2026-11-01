const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, "../src/hand-filter.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }
).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(source, sandbox);
const {
  classifyHand,
  emptyHandFilter,
  filterResults,
  handDistribution,
  handMatches,
} = sandbox.exports;
const card = (text) =>
  "23456789TJQKA".indexOf(text[0]) * 4 + "cdhs".indexOf(text[1]);
const board = (text) => text.split(" ").map(card);
const pair = (text) => {
  const [a, b] = board(text);
  return a | (b << 8);
};
const classify = (hole, community) =>
  classifyHand(pair(hole), board(community));

for (const [hole, community, made] of [
  ["As Ks", "Qs Js Ts", "straight-flush"],
  ["Ac 2d", "Ah As Ad", "quads"],
  ["Ac Kc", "Ah As Kh Ks 2d", "full-house"],
  ["As 9s", "Ks 5s 2s", "flush"],
  ["Ac 2d", "3h 4s 5c", "straight"],
  ["Ac 2d", "3h 4s 6c", "high-card"],
  ["Ah Ad", "As 8d 2c", "set"],
  ["Ah Kd", "As Ac 2c", "trips"],
  ["Ah Kd", "As Kc 2c", "two-pair"],
  ["Ah Ad", "Ks 8c 2c", "overpair"],
  ["Ah Kd", "As 8c 2c", "top-pair"],
  ["Kh Qd", "As Kc 2c", "second-pair"],
  ["Qh Qd", "As Kc 2c", "other-pair"],
  ["2h 2d", "As Kc 3c", "underpair"],
  ["Kh Qd", "As Ac 2c", "board-pair"],
  ["Kh Qd", "As Ac Ad 2c 3s", "trips"],
  ["2h 3d", "Ts Js Qs Ks As", "straight-flush"],
  ["Ah Ad", "2s 2c 2h As Kc", "full-house"],
  ["Kh Qd", "As Ac 2c 2h 3s", "two-pair"],
  ["Kh Qd", "As Ac Ad Ah 3s", "quads"],
  ["2h 3d", "As Ks 9s 7s 5s", "flush"],
  ["2h 3d", "As Kc Qd Jh Ts", "straight"],
]) {
  test(`${hole} on ${community}: ${made}`, () => {
    assert.equal(classify(hole, community).made, made);
    const reversed = hole.split(" ").reverse().join(" ");
    assert.equal(classify(reversed, community).made, made);
  });
}

test("dead or malformed cards are excluded", () => {
  assert.equal(classify("As Ks", "As 7c 2d"), null);
  assert.equal(classify("As As", "Ts 7c 2d"), null);
  assert.equal(classify("As Ks", "Ts 7c"), null);
  assert.equal(classifyHand(0xff00, board("Ts 7c 2d")), null);
});

test("draws handle the wheel, double gutshots, backdoors and river", () => {
  for (const [hole, community, draw] of [
    ["Ah Kh", "Qh 7h 2c", "flush-draw"],
    ["Ah Kh", "Qh 7c 2c", "backdoor-flush"],
    ["8h 7h", "6c 5d Ks", "straight-draw"],
    ["8h 7h", "Jc 9d 5s", "straight-draw"],
    ["Ah 2h", "3c 4d Ks", "gutshot"],
    ["Kh Qh", "Jc Td 2s", "straight-draw"],
    ["8h 7h", "6h 5h Ks", "flush-draw"],
    ["8h 7h", "6h 5h Ks", "straight-draw"],
  ])
    assert.ok(
      classify(hole, community).draws.includes(draw),
      `${hole} / ${community}: ${draw}`
    );
  assert.equal(
    classify("Ah Kh", "Qh 7c 2c 3s").draws.includes("backdoor-flush"),
    false
  );
  assert.equal(classify("Ah Kh", "Qh 7h 2c 3s 4c").draws.join(), "none");
  assert.equal(classify("Ah Kh", "Qh Jh Th").draws.join(), "none");
  assert.equal(classify("Ah Kh", "6s 7s 8s 9s").draws.join(), "none");
});

function fixture() {
  const cards = [
    [pair("Ah Kh"), pair("Qh Qd"), pair("8h 7h"), pair("As Kc")],
    [pair("Ah Qh"), pair("4h 4d")],
  ];
  const features = cards.map((hands) =>
    hands.map((hand) => classifyHand(hand, board("As 8c 2d")))
  );
  const results = {
    currentPlayer: "oop",
    numActions: 2,
    isEmpty: 0,
    eqrBase: [100, 100],
    weights: [
      [0.5, 1, 0.25, 1],
      [1, 0.5],
    ],
    normalizer: [
      [2, 1, 0.5, 0],
      [1, 2],
    ],
    equity: [
      [0.8, 0.5, 0.2, 0],
      [0.75, 0.25],
    ],
    ev: [
      [80, 50, 20, 0],
      [75, 25],
    ],
    eqr: [
      [1, 1, 1, 0],
      [1, 1],
    ],
    strategy: [0.2, 0.6, 0.9, 0, 0.8, 0.4, 0.1, 0],
    actionEv: [10, 20, 30, 0, 40, 50, 60, 0],
  };
  return { cards, features, results };
}

test("OR within a group, AND between groups, inclusive EQ and action endpoints", () => {
  const { cards, features, results } = fixture();
  const filter = {
    ...emptyHandFilter(),
    made: ["top-pair", "other-pair"],
    suits: [2, 3],
    equityMin: 50,
    equityMax: 80,
    action: 1,
    frequencyMin: 40,
    frequencyMax: 80,
  };
  const filtered = filterResults(results, cards, features, [
    filter,
    emptyHandFilter(),
  ]);
  assert.equal(filtered.weights[0].join(), "0.5,1,0,0");
  filter.suited = "suited";
  assert.equal(
    filterResults(results, cards, features, [
      filter,
      emptyHandFilter(),
    ]).weights[0].join(),
    "0.5,0,0,0"
  );
  filter.suited = "offsuit";
  assert.equal(
    filterResults(results, cards, features, [
      filter,
      emptyHandFilter(),
    ]).weights[0].join(),
    "0,1,0,0"
  );
});

test("mask preserves solver data, original array indices and independent opponent weights", () => {
  const { cards, features, results } = fixture();
  const before = JSON.stringify(results);
  const filtered = filterResults(results, cards, features, [
    { ...emptyHandFilter(), made: ["other-pair"] },
    emptyHandFilter(),
  ]);
  assert.equal(filtered.weights[0].join(), "0,1,0,0");
  assert.equal(filtered.normalizer[0].join(), "0,1,0,0");
  assert.equal(filtered.weights[1].join(), results.weights[1].join());
  assert.strictEqual(filtered.strategy, results.strategy);
  assert.strictEqual(filtered.actionEv, results.actionEv);
  assert.strictEqual(filtered.ev, results.ev);
  assert.equal(filtered.strategy[cards[0].length + 1], 0.4);
  assert.equal(JSON.stringify(results), before);
});

test("distribution uses range weights for combos and normalizers for strategy", () => {
  const { features, results } = fixture();
  // Give two hands the same category to distinguish the two weighting schemes.
  features[0][1] = features[0][0];
  const groups = handDistribution(results, features[0], 0);
  const top = groups.find((group) => group.made === "top-pair");
  assert.equal(top.combos, 1.5);
  assert.ok(Math.abs(top.percentage - (1.5 / 1.75) * 100) < 1e-9);
  assert.ok(Math.abs(top.strategy[0] - 1 / 3) < 1e-9);
  assert.ok(
    Math.abs(groups.reduce((sum, group) => sum + group.percentage, 0) - 100) <
      1e-9
  );
  assert.equal(handDistribution(results, features[1], 1)[0].strategy.length, 0);
});

test("empty selection restores all live hands; no matches produce zero distribution", () => {
  const { cards, features, results } = fixture();
  const filters = [emptyHandFilter(), emptyHandFilter()];
  filters[0].made = ["quads"];
  const filtered = filterResults(results, cards, features, filters);
  assert.equal(filtered.weights[0].join(), "0,0,0,0");
  assert.ok(
    handDistribution(filtered, features[0], 0).every(
      (group) => group.percentage === 0 && group.strategy.every((f) => f === 0)
    )
  );
  filters[0] = emptyHandFilter();
  assert.equal(
    filterResults(results, cards, features, filters).weights[0].join(),
    "0.5,1,0.25,0"
  );
});

test("missing equity and non-acting-player strategy cannot match restricted filters", () => {
  const { cards, features, results } = fixture();
  results.isEmpty = 2;
  results.equity = [[], []];
  const filters = [
    { ...emptyHandFilter(), equityMin: 10 },
    { ...emptyHandFilter(), action: 0 },
  ];
  assert.ok(
    filterResults(results, cards, features, filters)
      .weights.flat()
      .every((weight) => weight === 0)
  );
  const feature = classify("Ah Kh", "Qh 7h 2c");
  assert.equal(
    handMatches(pair("Ah Kh"), feature, {
      ...emptyHandFilter(),
      draws: ["gutshot", "flush-draw"],
    }),
    true
  );
  assert.equal(
    handMatches(pair("Ah Kh"), feature, {
      ...emptyHandFilter(),
      draws: ["none"],
    }),
    false
  );
});
