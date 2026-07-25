import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { randomAgent } from "../src/agents/random";
import { verifyRun } from "../src/exportweb";
import { playGame } from "../src/runner";

/**
 * The published matchup records are built from `final.json`, but the replay
 * reads `events.jsonl`. If verification only covered the event log, the file
 * that actually becomes a public claim would never be checked.
 */
async function soundRun(): Promise<string> {
  const runDir = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "laplace-verify-")),
    "run-v"
  );
  await playGame({
    gameId: "game-000",
    runDir,
    seed: 7,
    maxPlies: 8,
    agents: { A: randomAgent(1), B: randomAgent(2) },
  });
  return runDir;
}

const finalPath = (runDir: string) =>
  path.join(runDir, "games", "game-000", "final.json");

const patchFinal = (runDir: string, patch: Record<string, unknown>) => {
  const fin = JSON.parse(fs.readFileSync(finalPath(runDir), "utf8"));
  fs.writeFileSync(finalPath(runDir), JSON.stringify({ ...fin, ...patch }));
};

test("a genuine run verifies", async () => {
  const result = verifyRun(await soundRun());
  assert.equal(result.games, 1);
  assert.deepEqual(result.failures, []);
});

test("a forged final.json is caught even when the event log replays cleanly", async () => {
  const runDir = await soundRun();
  const truth = JSON.parse(fs.readFileSync(finalPath(runDir), "utf8"));

  // Claim a different winner than the game the events describe.
  patchFinal(runDir, { winner: truth.winner === "A" ? "B" : "A" });
  let result = verifyRun(runDir);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /disagrees with the replay on winner/);

  // Claim a different ending, and a different agent than the one that played.
  fs.writeFileSync(finalPath(runDir), JSON.stringify(truth));
  patchFinal(runDir, { reason: "elimination" });
  assert.match(verifyRun(runDir).failures[0].message, /on reason/);

  fs.writeFileSync(finalPath(runDir), JSON.stringify(truth));
  patchFinal(runDir, {
    teams: { ...truth.teams, A: { ...truth.teams.A, agent: "claude-cli:opus" } },
  });
  assert.match(verifyRun(runDir).failures[0].message, /on teams\.A\.agent/);
});

test("forged telemetry is caught because the replay recomputes it", async () => {
  const runDir = await soundRun();
  const truth = JSON.parse(fs.readFileSync(finalPath(runDir), "utf8"));

  // Inflating `turns` would quietly shrink the published error rate.
  patchFinal(runDir, {
    teams: { ...truth.teams, A: { ...truth.teams.A, turns: truth.teams.A.turns + 50 } },
  });
  assert.match(verifyRun(runDir).failures[0].message, /on teams\.A\.turns/);

  // Hiding illegal-move failures would make an agent look cleaner than it was.
  fs.writeFileSync(finalPath(runDir), JSON.stringify(truth));
  patchFinal(runDir, {
    teams: { ...truth.teams, B: { ...truth.teams.B, legalityFailures: 7 } },
  });
  assert.match(verifyRun(runDir).failures[0].message, /on teams\.B\.legalityFailures/);

  // The exact ending, not just its class: swapping centre for elimination, or
  // horizon for repetition, changes a published count.
  fs.writeFileSync(finalPath(runDir), JSON.stringify(truth));
  const withinClass: Record<string, string> = {
    center: "elimination",
    elimination: "center",
    horizon_draw: "repetition_draw",
    repetition_draw: "horizon_draw",
  };
  patchFinal(runDir, { reason: withinClass[truth.reason] });
  assert.match(verifyRun(runDir).failures[0].message, /on reason/);

  // And an ending name the referee never produces.
  fs.writeFileSync(finalPath(runDir), JSON.stringify(truth));
  patchFinal(runDir, { reason: "resignation" });
  assert.match(verifyRun(runDir).failures[0].message, /on reason/);

  // A plies count that the replay did not produce.
  fs.writeFileSync(finalPath(runDir), JSON.stringify(truth));
  patchFinal(runDir, { plies: truth.plies + 3 });
  assert.match(verifyRun(runDir).failures[0].message, /on plies/);
});

test("a game directory with no event log cannot ride along unverified", async () => {
  const runDir = await soundRun();
  const fabricated = path.join(runDir, "games", "game-001");
  fs.mkdirSync(fabricated, { recursive: true });
  fs.writeFileSync(
    path.join(fabricated, "final.json"),
    JSON.stringify({
      winner: "A",
      reason: "center",
      plies: 12,
      teams: {
        A: { agent: "claude-cli:opus", turns: 6, legalityFailures: 0, formatFailures: 0 },
        B: { agent: "codex-cli:gpt", turns: 6, legalityFailures: 0, formatFailures: 0 },
      },
    })
  );
  const result = verifyRun(runDir);
  assert.equal(result.games, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].gameId, "game-001");
  assert.match(result.failures[0].message, /events\.jsonl is missing/);
});

test("a missing final.json is a failure, not a skipped game", async () => {
  const runDir = await soundRun();
  fs.rmSync(finalPath(runDir));
  const result = verifyRun(runDir);
  assert.equal(result.games, 1);
  assert.match(result.failures[0].message, /final\.json is missing/);
});

test("an empty run reports a failure rather than verifying nothing", () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-verify-empty-"));
  fs.mkdirSync(path.join(runDir, "games"));
  const result = verifyRun(runDir);
  assert.equal(result.games, 0);
  assert.equal(result.failures.length, 1);
  // And a directory that is not a run at all.
  const notARun = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-verify-none-"));
  assert.match(verifyRun(notARun).failures[0].message, /no games\/ directory/);
});
