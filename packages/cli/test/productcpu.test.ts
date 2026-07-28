import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { randomAgent } from "../src/agents/random";
import { summarize } from "../src/metrics";
import { playGame } from "../src/runner";
import { matchupsMarkdown } from "../src/standings";
import type { Agent } from "../src/types";

// ---------------------------------------------------------------------------
// Repo-independent coverage: runner disposal + colon-name handling.
// ---------------------------------------------------------------------------

test("runner disposes agents even when act throws", async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-dispose-"));
  const disposals: string[] = [];
  const bomb: Agent = {
    name: "bomb-test",
    act() {
      throw new Error("agent exploded");
    },
    dispose() {
      disposals.push("bomb");
    },
  };
  const quiet: Agent = {
    ...randomAgent(3),
    dispose() {
      disposals.push("quiet");
    },
  };
  await assert.rejects(
    playGame({
      gameId: "game-000",
      runDir,
      seed: 1,
      maxPlies: 10,
      agents: { A: bomb, B: quiet },
    }),
    /agent exploded/
  );
  assert.deepEqual(disposals.sort(), ["bomb", "quiet"]);
});

test("colon-containing agent names stay verbatim in run data, summary, standings", async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-colon-"));
  const named: Agent = { ...randomAgent(1), name: "product-cpu:cpu-v4:level_3" };
  const result = await playGame({
    gameId: "game-000",
    runDir,
    seed: 4,
    maxPlies: 8,
    agents: { A: named, B: randomAgent(2) },
  });
  assert.equal(result.teams.A.agent, "product-cpu:cpu-v4:level_3");

  const events = fs
    .readFileSync(path.join(runDir, "games/game-000/events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(events.find((e) => e.t === "game_start").team_a, "product-cpu:cpu-v4:level_3");

  const summary = summarize(runDir) as { agents: Record<string, object> };
  assert.ok(summary.agents["product-cpu:cpu-v4:level_3"]);

  const md = matchupsMarkdown([runDir]);
  assert.match(md, /`product-cpu:cpu-v4:level_3`/);
});

// ---------------------------------------------------------------------------
// Real bundled-policy integration (runs from the package itself).
// ---------------------------------------------------------------------------

const CPU_V6_COMMIT = "101b739ff41a612c9b2c512d57d0a5ba4d233d47";
const CPU_V4_COMMIT = "d316b30914cb49942486f744099468fe0561ea02";

test("real bundled bridge: hello reports current cpu-v6 with six visible tiers", async () => {
  const { preflightProductCpu } = await import("../src/agents/productcpu");
  const hello = await preflightProductCpu(
    { expectedPolicy: "cpu-v6" },
    "level_3"
  );
  assert.equal(hello.policy_version, "cpu-v6");
  assert.equal(hello.visible_tiers.length, 6);
  assert.equal(hello.product_commit, CPU_V6_COMMIT);
  assert.equal(hello.distribution, "bundled");
});

test("real bundled bridge: same seed + position => same move (stochastic tier)", async () => {
  const { ProductCpuBridge, toMoveRequestState } = await import("../src/agents/productcpu");
  const { newGame } = await import("../src/engine");
  const bridge = new ProductCpuBridge({
    expectedPolicy: "cpu-v6",
  });
  try {
    await bridge.hello;
    const state = toMoveRequestState(newGame().state);
    const a = await bridge.move("level_1", 12345, state);
    const b = await bridge.move("level_1", 12345, state);
    assert.deepEqual(a.move, b.move);
    const scored = await bridge.scoreRoots("level_5", state);
    assert.ok(scored.roots.length > 0);
    const best = scored.roots.find((r) => r.rank === 1);
    assert.ok(best && Number.isFinite(best.value));
  } finally {
    bridge.dispose();
  }
});

test("real bundled cpu-v4 bridge remains the frozen five-tier regret oracle", async () => {
  const { ProductCpuBridge, toMoveRequestState } = await import("../src/agents/productcpu");
  const { newGame } = await import("../src/engine");
  const bridge = new ProductCpuBridge({ expectedPolicy: "cpu-v4" });
  try {
    const hello = await bridge.hello;
    assert.equal(hello.product_commit, CPU_V4_COMMIT);
    assert.equal(hello.visible_tiers.length, 5);
    const scored = await bridge.scoreRoots("level_5", toMoveRequestState(newGame().state));
    assert.ok(scored.roots.some((root) => root.rank === 1));
  } finally {
    bridge.dispose();
  }
});

test("cross-role and mixed product policies create no run directory", async () => {
  const { arena } = await import("../src/cli");
  for (const [teamA, teamB] of [
    ["product-cpu:cpu-v4:level_1", "random"],
    ["product-cpu:cpu-v6:level_1", "product-cpu:cpu-v4:level_1"],
  ]) {
    const previous = process.cwd();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-product-role-"));
    try {
      process.chdir(workDir);
      await assert.rejects(
        arena({
          "team-a": teamA,
          "team-b": teamB,
          games: "1",
          seed: "1",
          "run-id": "must-not-exist",
        }),
        /play supports bundled cpu-v6 only/
      );
      assert.equal(fs.existsSync(path.join(workDir, "runs")), false);
    } finally {
      process.chdir(previous);
    }
  }
});

test("missing Python is actionable and creates no run", async () => {
  const { arena } = await import("../src/cli");
  const previousCwd = process.cwd();
  const previousPath = process.env.PATH;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-product-python-"));
  try {
    process.chdir(workDir);
    process.env.PATH = "";
    await assert.rejects(
      arena({
        "team-a": "product-cpu:cpu-v6:level_1",
        "team-b": "random",
        games: "1",
        seed: "1",
        "run-id": "must-not-exist",
      }),
      /Python 3\.11以上.*対局は開始していません/
    );
    assert.equal(fs.existsSync(path.join(workDir, "runs")), false);
  } finally {
    process.chdir(previousCwd);
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("real bundled arena game: names and provenance are consistent end to end", async () => {
  const { arena } = await import("../src/cli");
  const prevCwd = process.cwd();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-product-arena-"));
  try {
    process.chdir(workDir);
    await arena({
      "team-a": "product-cpu:cpu-v6:level_1",
      "team-b": "random",
      games: "1",
      seed: "11",
      "max-plies": "20",
      "run-id": "product-integration",
    });
  } finally {
    process.chdir(prevCwd);
  }
  const runDir = path.join(workDir, "runs", "product-integration");
  const runJson = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
  assert.equal(runJson.product_cpu.policy_version, "cpu-v6");
  assert.equal(runJson.product_cpu.product_commit, CPU_V6_COMMIT);
  assert.equal(runJson.product_cpu.distribution, "bundled");
  assert.equal("product_repo" in runJson.product_cpu, false);
  assert.equal("dirty" in runJson.product_cpu, false);
  assert.deepEqual(runJson.product_cpu.teams.A, {
    spec: "product-cpu:cpu-v6:level_1",
    level_id: "level_1",
  });

  const events = fs
    .readFileSync(path.join(runDir, "games/game-000/events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const start = events.find((e) => e.t === "game_start");
  assert.equal(start.team_a, "product-cpu:cpu-v6:level_1");
  const moveWithSeed = events.find((e) => e.t === "move" && e.meta?.product_seed !== undefined);
  assert.ok(moveWithSeed, "product moves record their effective seed");

  const finalJson = JSON.parse(
    fs.readFileSync(path.join(runDir, "games/game-000/final.json"), "utf8")
  );
  assert.equal(finalJson.teams.A.agent, "product-cpu:cpu-v6:level_1");
  const summary = JSON.parse(fs.readFileSync(path.join(runDir, "summary.json"), "utf8"));
  assert.ok(summary.agents["product-cpu:cpu-v6:level_1"]);
  const md = matchupsMarkdown([runDir]);
  assert.match(md, /`product-cpu:cpu-v6:level_1`/);
});
