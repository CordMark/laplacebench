import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  buildHarnesslabCatalog,
  emptyExperimentsList,
  illegalRatePerTurn,
  readExperimentsList,
  type ExperimentsList,
} from "../src/harnesslab";
import { writeArenaArtifacts } from "../src/publicarena";

const ROOT = path.resolve(__dirname, "../../..");
const RUNS = fs.readdirSync(path.join(ROOT, "community/runs"))
  .map((name) => path.join(ROOT, "community/runs", name));
/** Recorded harness experiment: clean-room, non-arena, capped-era budget. */
const HARNESS_RUN = RUNS.find((run) => run.includes("persistent-vs-reset-20260730"))!;
/** Recorded model-versus-model run, used to prove the arena-lane rejection. */
const ARENA_RUN = RUNS.find((run) => run.includes("sol56h-vs-opus5h"))!;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const GENERATED = "2026-07-26T00:00:00.000Z";
const LEFT_SPEC = "codex-cli-reset:gpt-5.6-sol@medium";
const RIGHT_SPEC = "codex-cli:gpt-5.6-sol@medium";

interface Manifest {
  output_token_budget_per_team_per_game: number | null;
  isolation: { mode?: string } | null;
  [key: string]: unknown;
}

/**
 * A curated-run fixture: a real recorded run, renamed (the ledger directory
 * name is the canonical id) and made uncapped, since every recorded harness run
 * predates the budget removal. `patch` re-breaks one condition at a time.
 */
function fixtureRun(
  source: string,
  name: string,
  patch: (manifest: Manifest) => void = () => {}
): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-harnesslab-"));
  const copy = path.join(base, name);
  fs.cpSync(source, copy, { recursive: true });
  const manifestPath = path.join(copy, "run.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  manifest.output_token_budget_per_team_per_game = null;
  patch(manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return copy;
}

const listOf = (...runs: string[]): ExperimentsList => ({
  schema: "laplace-harnesslab-experiments-v1",
  experiments: runs.map((run) => ({
    run,
    description: `experiment ${run}`,
    plan: "docs/plans/2026-08-02-harnesslab-catalog.md",
  })),
});

const build = (runs: string[], listed: string[] = runs.map((run) => path.basename(run))) =>
  buildHarnesslabCatalog(listOf(...listed), [...RUNS, ...runs], SHA, GENERATED);

const readFinal = (runDir: string, gameId: string): any =>
  JSON.parse(fs.readFileSync(path.join(runDir, "games", gameId, "final.json"), "utf8"));

function writeList(value: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-harnesslab-list-"));
  const file = path.join(dir, "harnesslab-experiments.json");
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  return file;
}

test("no curated experiment yields an empty catalog rather than a failure", () => {
  const built = buildHarnesslabCatalog(emptyExperimentsList(), RUNS, SHA, GENERATED);
  assert.equal(built.catalog.schema, "laplace-bench-harnesslab-catalog-v1");
  assert.equal(built.catalog.source_sha, SHA);
  assert.equal(built.catalog.generated_at, GENERATED);
  assert.equal(built.catalog.experiment_count, 0);
  assert.equal(built.catalog.game_count, 0);
  assert.deepEqual(built.catalog.experiments, []);
  assert.deepEqual(built.catalog.matchups, []);
  assert.equal(built.replays.size, 0);
  // The shipped list is living curated data (3 experiments as of 2026-08-02);
  // assert only that it stays schema-valid, never its contents.
  assert.ok(
    readExperimentsList(path.join(ROOT, "community/harnesslab-experiments.json"))
      .experiments.length >= 0
  );
});

test("games from several runs of one contender pair accumulate into one record", () => {
  const first = fixtureRun(HARNESS_RUN, "harness-run-one");
  const second = fixtureRun(HARNESS_RUN, "harness-run-two");
  const built = build([first, second]);
  const ledgerGames = [first, second].flatMap((run) =>
    fs.readdirSync(path.join(run, "games")).map((id) => `${path.basename(run)}/${id}`));

  assert.equal(built.catalog.experiment_count, 2);
  assert.deepEqual(
    built.catalog.experiments.map((item) => item.run),
    ["harness-run-one", "harness-run-two"]
  );
  // The ledger directory name is the id; run.json's own id is informational and
  // is the same string for both copies.
  assert.deepEqual(
    new Set(built.catalog.experiments.map((item) => item.run_id)),
    new Set(["harnesslab-sol56m-persistent-vs-reset-20260730"])
  );

  assert.equal(built.catalog.matchups.length, 1, "one contender pair is one record");
  const matchup = built.catalog.matchups[0];
  assert.equal(matchup.id, `${LEFT_SPEC} vs ${RIGHT_SPEC}`);
  assert.equal(matchup.left_spec, LEFT_SPEC);
  assert.equal(matchup.right_spec, RIGHT_SPEC);
  assert.equal(matchup.matchup_kind, "same-model-harness-ablation");
  assert.equal(
    matchup.harness_conditions.right?.context_lifetime,
    "persistent-thread (whole game)"
  );
  assert.equal(
    matchup.harness_conditions.left?.context_lifetime,
    "turn-reset (fresh context every turn)"
  );

  // Accumulation, and no silent exclusion: every ledger game of both runs is
  // present exactly once, ordered by (run, game_id).
  assert.deepEqual(
    matchup.games.map((game) => `${game.run}/${game.game_id}`),
    [...ledgerGames].sort()
  );
  assert.equal(built.catalog.game_count, ledgerGames.length);
  assert.ok(matchup.games.length > 4, "a second run must add games, not replace them");

  // W-D-L is derived: recomputing it from games[] must reproduce it exactly,
  // and no rating or ranking field exists to disagree with.
  const derived = { wins_left: 0, wins_right: 0, draws: 0 };
  for (const game of matchup.games) {
    if (game.winner === "left") derived.wins_left++;
    else if (game.winner === "right") derived.wins_right++;
    else derived.draws++;
  }
  assert.deepEqual(
    { wins_left: matchup.wins_left, wins_right: matchup.wins_right, draws: matchup.draws },
    derived
  );
  assert.equal(derived.wins_left + derived.wins_right + derived.draws, matchup.games.length);
  assert.deepEqual(
    Object.keys(matchup).filter((key) => /rating|rank|score/.test(key)),
    []
  );

  const runDirOf = (name: string): string =>
    [first, second].find((run) => path.basename(run) === name)!;
  for (const game of matchup.games) {
    const runDir = runDirOf(game.run);
    const fin = readFinal(runDir, game.game_id);
    const leftTeam = fin.teams.A.agent === LEFT_SPEC ? "A" : "B";
    const rightTeam = leftTeam === "A" ? "B" : "A";

    // Side mapping is by recorded spec, not by ledger side: this run swaps.
    assert.equal(game.first_side, leftTeam === "A" ? "left" : "right");
    assert.equal(
      game.winner,
      fin.winner === null ? null : fin.winner === leftTeam ? "left" : "right"
    );
    assert.equal(game.plies, fin.plies);
    assert.equal(game.reason, fin.reason);

    // Replay lands in the shared content-addressed namespace.
    const bytes = built.replays.get(game.replay);
    assert.ok(bytes, `${game.run}/${game.game_id} has no replay bytes`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), game.replay);
    assert.equal(JSON.parse(bytes.toString("utf8")).schema, "laplace-bench-replay-v1");

    for (const [side, team] of [["left", leftTeam], ["right", rightTeam]] as const) {
      const recorded = fin.teams[team];
      const columns = game.per_side[side];
      assert.equal(columns.output_tokens, recorded.usage.outputTotalTokens);
      assert.equal(typeof columns.avg_latency_ms, "number", "codex-cli measures latency");
      assert.equal(columns.failed_turns, recorded.failedTurns);
      assert.equal(
        columns.illegal_rate_per_turn,
        illegalRatePerTurn(recorded.legalityFailures, recorded.turns)
      );
      // No telemetry file was recorded for these games.
      assert.equal(columns.compaction, null);
    }
  }
  assert.equal(built.replays.size, ledgerGames.length);
});

test("illegal move rate is a 3-decimal per-turn rate, and null without turns", () => {
  assert.equal(illegalRatePerTurn(1, 3), 0.333);
  assert.equal(illegalRatePerTurn(2, 3), 0.667);
  assert.equal(illegalRatePerTurn(0, 7), 0);
  assert.equal(illegalRatePerTurn(7, 7), 1);
  assert.equal(
    illegalRatePerTurn(0, 0),
    null,
    "a side that never moved has no rate, not a zero"
  );

  // The column carries that rate for real recorded turns. Only the failure
  // count is patched: turn counts are cross-checked against the replay.
  const run = fixtureRun(HARNESS_RUN, "harness-rate");
  const fin = readFinal(run, "game-000");
  const leftTeam = fin.teams.A.agent === LEFT_SPEC ? "A" : "B";
  fin.teams[leftTeam].legalityFailures = 1;
  fs.writeFileSync(
    path.join(run, "games/game-000/final.json"), JSON.stringify(fin, null, 2)
  );
  const game = build([run]).catalog.matchups[0].games
    .find((item) => item.game_id === "game-000")!;
  assert.equal(
    game.per_side.left.illegal_rate_per_turn,
    illegalRatePerTurn(1, fin.teams[leftTeam].turns)
  );
});

test("a curated run with a recorded output-token budget stops the catalog", () => {
  const run = fixtureRun(HARNESS_RUN, "harness-capped", (manifest) => {
    manifest.output_token_budget_per_team_per_game = 350_000;
  });
  assert.throws(
    () => build([run]),
    /harness-capped: output_token_budget_per_team_per_game must be null \(capped-era run, budget 350000\)/
  );
});

test("a curated run whose matchup belongs to the arena stops the catalog", () => {
  const run = fixtureRun(ARENA_RUN, "harness-arena-lane");
  assert.throws(
    () => build([run]),
    /harness-arena-lane: .* is a model-arena matchup, which belongs to the arena catalog/
  );
});

test("a curated run that did not run clean-room stops the catalog", () => {
  for (const [name, isolation] of [
    ["harness-ambient", { schema: "laplace-isolation-v1", mode: "ambient" }],
    ["harness-no-isolation", null],
  ] as const) {
    const run = fixtureRun(HARNESS_RUN, name, (manifest) => {
      manifest.isolation = isolation;
    });
    assert.throws(
      () => build([run]),
      new RegExp(`${name}: isolation\\.mode must be "clean-room"`)
    );
  }
});

test("a curated run missing from the published set stops the catalog", () => {
  // The run exists on disk but is not among the directories being published:
  // publishing a record for an unpublished, unverified run is the failure.
  const run = fixtureRun(HARNESS_RUN, "harness-unpublished");
  assert.throws(
    () => buildHarnesslabCatalog(listOf("harness-unpublished"), RUNS, SHA, GENERATED),
    /harness experiment harness-unpublished is not among the published run directories/
  );
  assert.ok(fs.existsSync(path.join(run, "run.json")));
});

test("compaction is published as an exact count only when telemetry says so", () => {
  const telemetry = (run: string, body: unknown): void => {
    const fin = readFinal(run, "game-000");
    const team = fin.teams.A.agent === RIGHT_SPEC ? "A" : "B";
    fs.writeFileSync(
      path.join(run, "games/game-000", `context-telemetry-${team}.json`),
      JSON.stringify(body, null, 2)
    );
  };
  const rightOf = (run: string) => build([run]).catalog.matchups[0].games
    .find((game) => game.game_id === "game-000")!.per_side.right;

  const verified = fixtureRun(HARNESS_RUN, "harness-compaction-ok");
  telemetry(verified, {
    schema: "laplace-context-telemetry-v1", status: "ok", complete: true, compaction_count: 3,
  });
  assert.deepEqual(rightOf(verified).compaction, { count: 3, status: "ok" });

  // Present but unusable: the count exists in the file and is deliberately not
  // republished as a fact — the status that made it unusable is.
  for (const [name, body] of [
    ["harness-compaction-degraded", {
      status: "marker-format-unknown", complete: false, compaction_count: 9,
    }],
    ["harness-compaction-incomplete", { status: "ok", complete: false, compaction_count: 7 }],
  ] as const) {
    const run = fixtureRun(HARNESS_RUN, name);
    telemetry(run, { schema: "laplace-context-telemetry-v1", ...body });
    assert.deepEqual(rightOf(run).compaction, { count: null, status: body.status });
  }

  // No file at all: not observed, which is not "zero compactions".
  assert.equal(rightOf(fixtureRun(HARNESS_RUN, "harness-compaction-absent")).compaction, null);
});

test("the curated list is schema-checked before anything is published", () => {
  const entry = {
    run: "harness-run-one",
    description: "one line",
    plan: "docs/plans/2026-08-02-harnesslab-catalog.md",
  };
  const cases: [unknown, RegExp][] = [
    ["{ not json", /is not valid JSON/],
    [[entry], /list must be an object/],
    [{ experiments: [] }, /schema must be laplace-harnesslab-experiments-v1/],
    [
      { schema: "laplace-harnesslab-experiments-v2", experiments: [] },
      /schema must be laplace-harnesslab-experiments-v1/,
    ],
    [{ schema: "laplace-harnesslab-experiments-v1" }, /experiments must be an array/],
    [
      { schema: "laplace-harnesslab-experiments-v1", experiments: [{ ...entry, extra: 1 }] },
      /experiments\[0\] has unknown field extra/,
    ],
    [
      { schema: "laplace-harnesslab-experiments-v1", experiments: [{ run: entry.run }] },
      /experiments\[0\]\.description must be a string/,
    ],
    [
      {
        schema: "laplace-harnesslab-experiments-v1",
        experiments: [{ ...entry, run: "../escape" }],
      },
      /experiments\[0\]\.run is not a ledger directory name/,
    ],
    [
      { schema: "laplace-harnesslab-experiments-v1", experiments: [entry, entry] },
      /experiments\[1\]\.run is listed twice/,
    ],
  ];
  for (const [body, expected] of cases) {
    assert.throws(() => readExperimentsList(writeList(body)), expected);
  }
  // A named-but-absent list is "there is no list", never "the list is empty".
  assert.throws(
    () => readExperimentsList(path.join(os.tmpdir(), "laplace-absent-list.json")),
    /harness experiments list not found/
  );
});

test("a rejected generation leaves the previous published artifacts untouched", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-harnesslab-write-"));
  const target = path.join(base, "arena");
  const good = fixtureRun(HARNESS_RUN, "harness-published");
  const bad = fixtureRun(HARNESS_RUN, "harness-capped-later", (manifest) => {
    manifest.output_token_budget_per_team_per_game = 350_000;
  });
  const runDirs = [...RUNS, good, bad];

  const okList = writeList(listOf("harness-published"));
  const result = writeArenaArtifacts(target, runDirs, SHA, GENERATED, okList);
  assert.equal(result.harnesslab.experiment_count, 1);
  assert.ok(result.harnesslab.game_count > 0);
  assert.equal(fs.existsSync(path.join(target, "harnesslab.json")), true);

  const snapshot = (): Record<string, string> => {
    const files: Record<string, string> = {};
    const walk = (dir: string, prefix: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort()) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, `${prefix}${entry.name}/`);
        else files[`${prefix}${entry.name}`] = createHash("sha256")
          .update(fs.readFileSync(full)).digest("hex");
      }
    };
    walk(target, "");
    return files;
  };
  const before = snapshot();
  assert.ok(Object.keys(before).some((name) => name.startsWith("replays/")));

  const badList = writeList(listOf("harness-published", "harness-capped-later"));
  assert.throws(
    () => writeArenaArtifacts(target, runDirs, SHA, GENERATED, badList),
    /output_token_budget_per_team_per_game must be null/
  );
  assert.deepEqual(
    snapshot(),
    before,
    "arena.json, harnesslab.json and every replay must survive byte-identical"
  );
  assert.deepEqual(
    fs.readdirSync(base),
    ["arena"],
    "a rejected generation leaves no temp directory and no .previous residue"
  );
});
