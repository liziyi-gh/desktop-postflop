const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
function loadTypeScript(file, dependencies = {}) {
  const source = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText;
  const sandbox = {
    exports: {},
    require(name) {
      assert(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  };
  vm.runInNewContext(source, sandbox, { filename: file });
  return sandbox.exports;
}

const { convertBetString, sanitizeBetString } = loadTypeScript("src/utils.ts");

function setup(request, rangeError) {
  const config = { $patch: (data) => Object.assign(config, data) };
  const store = { ranges: [[], []], sideView: "oop-range" };
  const calls = [];
  const { initializeStartup } = loadTypeScript("src/startup.ts", {
    "@tauri-apps/api/core": {
      invoke: async (command) => {
        calls.push(command);
        return request;
      },
    },
    "./invokes": {
      rangeGetWeights: async (player) => {
        if (rangeError) throw rangeError;
        return Array(169).fill(player ? 0.5 : 1);
      },
    },
    "./store": {
      useConfigStore: () => config,
      useStore: () => store,
    },
  });
  return { initializeStartup, config, store, calls };
}

function exampleRequest() {
  const request = JSON.parse(
    fs.readFileSync(
      path.join(root, "docs/examples/tracker-request.json"),
      "utf8"
    )
  );
  // Rust serializes all defaults before handing the request to the frontend.
  request.tree = {
    flop: { oop: { bet: "", raise: "" }, ip: { bet: "", raise: "" } },
    addAllInThreshold: 150,
    forceAllInThreshold: 20,
    mergingThreshold: 10,
    ...request.tree,
  };
  return request;
}

test("ordinary startup preserves the initial view and config", async () => {
  const { initializeStartup, config, store, calls } = setup(null);
  await initializeStartup();
  assert.equal(store.sideView, "oop-range");
  assert.equal(config.board, undefined);
  assert.deepEqual(calls, ["startup_request"]);
});

test("tracker example populates the GUI and round-trips engine bet sizes", async () => {
  const request = exampleRequest();
  const { initializeStartup, config, store, calls } = setup(request);
  await initializeStartup();
  assert.equal(JSON.stringify(config.board), "[51,45,0,22]");
  assert.equal(config.startingPot, 200);
  assert.equal(config.effectiveStack, 900);
  assert.equal(config.rakePercent, 5);
  assert.equal(config.rakeCap, 30);
  for (const street of ["Flop", "Turn", "River"]) {
    for (const player of ["oop", "ip"]) {
      for (const kind of ["Bet", "Raise"]) {
        const input =
          request.tree[street.toLowerCase()][player][kind.toLowerCase()];
        const gui = config[`${player}${street}${kind}`];
        assert.equal(sanitizeBetString(gui, kind === "Raise").valid, true);
        assert.equal(convertBetString(gui), input);
      }
    }
  }
  assert.equal(store.ranges[0][0], 100);
  assert.equal(store.ranges[1][0], 50);
  assert.equal(store.launchContext.heroCards.join(""), "QhQs");
  assert.equal(store.launchRequestId, request.requestId);
  assert.equal(store.sideView, "run-solver");
  assert.deepEqual(calls, ["startup_request"]);
});

test("failed backend range read leaves the config unapplied", async () => {
  const { initializeStartup, config, store } = setup(
    exampleRequest(),
    new Error("IPC failed")
  );
  await assert.rejects(initializeStartup(), /IPC failed/);
  assert.equal(config.board, undefined);
  assert.equal(store.sideView, "oop-range");
});
