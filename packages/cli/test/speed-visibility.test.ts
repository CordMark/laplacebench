import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { randomAgent } from "../src/agents/random";
import {
  arena,
  formatProgressLine,
  isLearningSpec,
  resolveExecution,
  runGameSet,
} from "../src/cli";
import { buildArenaArtifacts, sideTokens } from "../src/publicarena";
import { playGame, type GameProgress } from "../src/runner";

const ROOT = path.resolve(__dirname, "../../..");
const COMMUNITY_RUNS = fs
  .readdirSync(path.join(ROOT, "community/runs"))
  .map((name) => path.join(ROOT, "community/runs", name));

function progress(overrides: Partial<GameProgress>): GameProgress {
  return {
    gameId: "game-000",
    ply: 16,
    maxPlies: 100,
    team: "B",
    agent: "claude-cli:claude-fable-5@medium",
    action: "move",
    summary: "(0,3)→(3,3)",
    outputTokensUsed: { A: 82_134, B: 61_402 },
    outputTokenBudget: 250_000,
    elapsedMs: 723_000,
    ...overrides,
  };
}

test("progress line shows per-team usage against the per-team budget", () => {
  const line = formatProgressLine(progress({}));
  assert.equal(
    line,
    "[game-000] ply 17/100 B (0,3)→(3,3) | out A 82k/250k · B 61k/250k | 12m03s"
  );
});

test("progress line keeps only the metered side in a mixed match", () => {
  const line = formatProgressLine(
    progress({ outputTokensUsed: { A: 82_134, B: null } })
  );
  assert.ok(line.includes("out A 82k/250k"));
  assert.ok(!line.includes("B 61k"));
});

test("progress line omits the token segment without telemetry or budget", () => {
  // baseline: no side reports usage
  const baseline = formatProgressLine(
    progress({ outputTokensUsed: { A: null, B: null } })
  );
  assert.ok(!baseline.includes("out "), baseline);
  // metered sides but no budget configured: show nothing rather than a
  // number the run does not enforce
  const unmetered = formatProgressLine(progress({ outputTokenBudget: undefined }));
  assert.ok(!unmetered.includes("out "), unmetered);
});

test("learning specs are detected exactly, claude-cli is not", () => {
  assert.equal(isLearningSpec("claude-cli-learn"), true);
  assert.equal(isLearningSpec("claude-cli-learn:opus"), true);
  assert.equal(isLearningSpec("claude-cli-learn:opus@high"), true);
  assert.equal(isLearningSpec("claude-cli"), false);
  assert.equal(isLearningSpec("claude-cli:opus"), false);
  assert.equal(isLearningSpec("claude-cli-learnx"), false);
});

test("a learning spec on either side forces serial; --serial always wins", () => {
  assert.equal(resolveExecution(4, false, "random", "greedy"), "parallel");
  assert.equal(resolveExecution(4, true, "random", "greedy"), "serial");
  assert.equal(resolveExecution(1, false, "random", "greedy"), "serial");
  assert.equal(
    resolveExecution(4, false, "claude-cli-learn:opus", "claude-cli:opus"),
    "serial"
  );
  assert.equal(
    resolveExecution(4, false, "claude-cli:opus", "claude-cli-learn"),
    "serial"
  );
  assert.equal(
    resolveExecution(4, false, "claude-cli:opus", "claude-cli:fable"),
    "parallel"
  );
});

test("onProgress fires per resolved turn and its exceptions never damage the game", async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-progress-"));
  try {
    const updates: GameProgress[] = [];
    const result = await playGame({
      gameId: "game-000",
      runDir,
      seed: 7,
      maxPlies: 12,
      agents: { A: randomAgent(1), B: randomAgent(2) },
      onProgress: (p) => {
        updates.push(p);
        throw new Error("display consumer bug");
      },
    });
    assert.equal(updates.length, result.plies);
    for (const p of updates) {
      assert.equal(p.gameId, "game-000");
      assert.equal(p.maxPlies, 12);
      // random agents report no usage telemetry
      assert.deepEqual(p.outputTokensUsed, { A: null, B: null });
    }
    // the throwing callback must not have corrupted the recorded artifacts
    const final = JSON.parse(
      fs.readFileSync(path.join(runDir, "games", "game-000", "final.json"), "utf8")
    );
    assert.equal(final.plies, result.plies);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("runGameSet parallel: one failure never aborts the others", async () => {
  const ran: string[] = [];
  const failures: string[] = [];
  const failedGames = await runGameSet({
    games: 3,
    execution: "parallel",
    makePair: async (g) => ({ gameId: `game-00${g}` }),
    runOne: async (pair) => {
      if (pair.gameId === "game-001") throw new Error("boom");
      ran.push(pair.gameId);
    },
    disposePair: async () => {},
    reportFailure: (gameId) => failures.push(gameId),
  });
  assert.equal(failedGames, 1);
  assert.deepEqual(failures, ["game-001"]);
  assert.deepEqual([...ran].sort(), ["game-000", "game-002"]);
});

test("runGameSet parallel: a preparation failure disposes every created pair", async () => {
  const disposed: string[] = [];
  await assert.rejects(
    runGameSet({
      games: 3,
      execution: "parallel",
      makePair: async (g) => {
        if (g === 2) throw new Error("agent auth failed");
        return { gameId: `game-00${g}` };
      },
      runOne: async () => {
        throw new Error("no game may start when preparation failed");
      },
      disposePair: async (pair) => {
        disposed.push(pair.gameId);
      },
      reportFailure: () => {},
    }),
    /agent auth failed/
  );
  assert.deepEqual(disposed, ["game-000", "game-001"]);
});

test("runGameSet serial: failures are counted and the loop continues", async () => {
  const ran: string[] = [];
  const failedGames = await runGameSet({
    games: 3,
    execution: "serial",
    makePair: async (g) => ({ gameId: `game-00${g}` }),
    runOne: async (pair) => {
      ran.push(pair.gameId);
      if (pair.gameId === "game-000") throw new Error("boom");
    },
    disposePair: async () => {},
    reportFailure: () => {},
  });
  assert.equal(failedGames, 1);
  assert.deepEqual(ran, ["game-000", "game-001", "game-002"]);
});

/**
 * End-to-end determinism: the same seeds must produce identical final.json
 * whether the games ran in parallel (the new default) or serially.
 */
test("arena parallel default matches serial game-for-game", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-parallel-"));
  const cwd = process.cwd();
  process.chdir(base);
  try {
    const shared = {
      "team-a": "random",
      "team-b": "greedy",
      games: "3",
      seed: "42",
      swap: true,
    } as const;
    const parallel = await arena({ ...shared, "run-id": "par" });
    const serial = await arena({ ...shared, "run-id": "ser", serial: true });
    assert.equal(parallel.failedGames, 0);
    assert.equal(serial.failedGames, 0);

    const parRun = JSON.parse(fs.readFileSync(path.join(base, "runs", "par", "run.json"), "utf8"));
    const serRun = JSON.parse(fs.readFileSync(path.join(base, "runs", "ser", "run.json"), "utf8"));
    assert.equal(parRun.execution, "parallel");
    assert.equal(serRun.execution, "serial");

    for (const g of ["game-000", "game-001", "game-002"]) {
      const par = fs.readFileSync(path.join(base, "runs", "par", "games", g, "final.json"), "utf8");
      const ser = fs.readFileSync(path.join(base, "runs", "ser", "games", g, "final.json"), "utf8");
      assert.deepEqual(JSON.parse(par), JSON.parse(ser), `${g} diverged between modes`);
    }
  } finally {
    process.chdir(cwd);
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("a single game or a learning spec keeps the serial execution label", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-serial-label-"));
  const cwd = process.cwd();
  process.chdir(base);
  try {
    await arena({ "team-a": "random", "team-b": "greedy", games: "1", seed: "1", "run-id": "one" });
    const run = JSON.parse(fs.readFileSync(path.join(base, "runs", "one", "run.json"), "utf8"));
    assert.equal(run.execution, "serial");
  } finally {
    process.chdir(cwd);
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("arena catalog carries duration and token totals derived from the ledger", () => {
  const { catalog } = buildArenaArtifacts(
    COMMUNITY_RUNS,
    "0123456789abcdef0123456789abcdef01234567",
    "2026-07-27T00:00:00.000Z"
  );
  let checked = 0;
  for (const matchup of catalog.matchups) {
    for (const game of matchup.games) {
      const [runId, gameId] = game.raw_ref.split("/");
      const runDir = path.join(ROOT, "community/runs", runId);
      const events = fs
        .readFileSync(path.join(runDir, "games", gameId, "events.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const start = events.find((e) => e.t === "game_start");
      const end = events.find((e) => e.t === "game_end");
      assert.equal(
        game.duration_ms,
        Date.parse(end.ts) - Date.parse(start.ts),
        `${game.raw_ref} duration must equal the validated start/end delta`
      );
      const final = JSON.parse(
        fs.readFileSync(path.join(runDir, "games", gameId, "final.json"), "utf8")
      );
      for (const team of ["A", "B"] as const) {
        const usage = final.teams[team].usage;
        const expected =
          usage && (usage.reportedCalls || usage.legacyUnversionedCalls ||
            usage.inputTotalTokens || usage.outputTotalTokens)
            ? {
                output: usage.outputTotalTokens,
                total: usage.inputTotalTokens + usage.outputTotalTokens,
              }
            : null;
        assert.deepEqual(
          game.team_tokens[team],
          expected,
          `${game.raw_ref} team ${team} tokens must mirror final.json usage`
        );
      }
      checked++;
    }
  }
  assert.ok(checked > 0, "the ledger must contain at least one public game");
});

test("sideTokens is null exactly when a side reported no usage", () => {
  assert.equal(sideTokens(undefined, "r/g"), null);
  assert.equal(sideTokens({}, "r/g"), null);
  assert.equal(
    sideTokens(
      { usage: { reportedCalls: 0, legacyUnversionedCalls: 0, inputTotalTokens: 0, outputTotalTokens: 0 } },
      "r/g"
    ),
    null
  );
  assert.deepEqual(
    sideTokens(
      { usage: { reportedCalls: 3, legacyUnversionedCalls: 0, inputTotalTokens: 100, outputTotalTokens: 40 } },
      "r/g"
    ),
    { output: 40, total: 140 }
  );
  // legacy artifacts: calls unversioned but totals present
  assert.deepEqual(
    sideTokens(
      { usage: { reportedCalls: 0, legacyUnversionedCalls: 2, inputTotalTokens: 10, outputTotalTokens: 5 } },
      "r/g"
    ),
    { output: 5, total: 15 }
  );
});

test("sideTokens fails closed on malformed usage instead of publishing zeros", () => {
  const valid = {
    reportedCalls: 3,
    legacyUnversionedCalls: 0,
    inputTotalTokens: 100,
    outputTotalTokens: 40,
  };
  const cases: Array<Record<string, unknown>> = [
    { ...valid, outputTotalTokens: undefined },
    { ...valid, outputTotalTokens: "40" },
    { ...valid, inputTotalTokens: 1.5 },
    { ...valid, reportedCalls: -1 },
    { ...valid, inputTotalTokens: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, legacyUnversionedCalls: null },
  ];
  for (const usage of cases) {
    assert.throws(
      () => sideTokens({ usage }, "r/g"),
      /nonnegative safe integer/,
      JSON.stringify(usage)
    );
  }
  assert.throws(() => sideTokens({ usage: "corrupt" }, "r/g"), /must be an object/);
  assert.throws(() => sideTokens({ usage: null }, "r/g"), /must be an object/);
});
