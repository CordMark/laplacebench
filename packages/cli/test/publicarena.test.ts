import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { buildArenaArtifacts, writeArenaArtifacts } from "../src/publicarena";
import { publicPair } from "../src/publicgames";

const ROOT = path.resolve(__dirname, "../../..");
const RUNS = fs.readdirSync(path.join(ROOT, "community/runs"))
  .map((name) => path.join(ROOT, "community/runs", name));
const SHA = "0123456789abcdef0123456789abcdef01234567";
const GENERATED = "2026-07-26T00:00:00.000Z";
const RECORDED_CODEX = "codex-cli:gpt-5.6-sol@high";

function copyRunWithAgent(replacement: string): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-public-agent-"));
  const copy = path.join(base, "copied-run");
  fs.cpSync(RUNS.find((run) => run.includes("sol56h"))!, copy, { recursive: true });
  for (const relative of [
    "run.json", "summary.json",
    "games/game-000/events.jsonl", "games/game-000/final.json",
    "games/game-001/events.jsonl", "games/game-001/final.json",
  ]) {
    const file = path.join(copy, relative);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replaceAll(RECORDED_CODEX, replacement));
  }
  return copy;
}

const copyRunWithCodexModel = (model: string): string =>
  copyRunWithAgent(`codex-cli:${model}@high`);

function copyRunWithEventMutation(mutator: (events: any[]) => void): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-public-commentary-"));
  const copy = path.join(base, "copied-run");
  fs.cpSync(RUNS.find((run) => run.includes("sol56h"))!, copy, { recursive: true });
  const eventFile = path.join(copy, "games/game-000/events.jsonl");
  const events = fs.readFileSync(eventFile, "utf8").split("\n").filter(Boolean)
    .map((line) => JSON.parse(line));
  mutator(events);
  fs.writeFileSync(eventFile, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  return copy;
}

const copyRunWithMoveRaw = (raw: string): string => copyRunWithEventMutation((events) => {
  events.find((event) => event.t === "move").raw = raw;
});

test("current ledger publishes deterministic content-addressed public games", () => {
  const first = buildArenaArtifacts(RUNS, SHA, GENERATED);
  const second = buildArenaArtifacts([...RUNS].reverse(), SHA, GENERATED);
  assert.deepEqual(first.catalogBytes, second.catalogBytes);

  // Which ledger games SHOULD be public is derived independently here, from the
  // recorded agent specs, so that omitting a game the ledger contains fails the
  // test — a count-only check would pass while publishing nothing.
  const ledgerGames: string[] = [];
  const expectedPublic: string[] = [];
  const expectedIds = new Set<string>();
  for (const run of RUNS) {
    for (const gameId of fs.readdirSync(path.join(run, "games")).sort()) {
      ledgerGames.push(gameId);
      const final = JSON.parse(
        fs.readFileSync(path.join(run, "games", gameId, "final.json"), "utf8")
      );
      const pair = publicPair(final.teams.A.agent, final.teams.B.agent);
      if (!pair) continue;
      expectedPublic.push(`${path.basename(run)}/${gameId}`);
      expectedIds.add(pair.leftId).add(pair.rightId);
    }
  }
  assert.equal(first.catalog.verified_run_count, RUNS.length);
  assert.equal(first.catalog.verified_game_count, ledgerGames.length);

  const published = first.catalog.matchups.flatMap((m) => m.games.map((g) => g.raw_ref));
  assert.deepEqual(
    [...published].sort(),
    [...expectedPublic].sort(),
    "every publishable ledger game must appear exactly once in the catalog"
  );
  assert.equal(first.catalog.public_game_count, published.length);
  assert.equal(first.replays.size, published.length);
  assert.deepEqual(
    new Set(first.catalog.matchups.flatMap((m) => [m.left.id, m.right.id])),
    expectedIds,
    "published participant identities must match what the ledger implies"
  );
  assert.equal(first.catalog.public_agent_count, expectedIds.size);

  // The flagship matchup is found by identity, not by position: ordering is by
  // recency, so a newer submission legitimately takes index 0.
  const flagship = first.catalog.matchups.find(
    (m) => m.left.id === "claude-opus-5@high" && m.right.id === "gpt-5.6-sol@high"
  );
  assert.ok(flagship, "the published Opus-vs-Sol matchup is missing from the ledger");
  assert.deepEqual(
    [flagship.left.label, flagship.right.label],
    ["Opus 5 (high)", "GPT-5.6 Sol (high)"]
  );

  // Content addressing holds for every published game, not just one matchup's.
  for (const matchup of first.catalog.matchups) {
    for (const game of matchup.games) {
      const bytes = first.replays.get(game.replay.id);
      assert.ok(bytes);
      assert.equal(bytes.length, game.replay.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), game.replay.id);
      const replay = JSON.parse(bytes.toString("utf8"));
      assert.equal(replay.schema, "laplace-bench-replay-v1");
      assert.equal(replay.history.length, game.plies + 1);
      assert.equal(replay.bench.exported_at, game.played_at);
    }
  }
});

test("atomic writer emits only the accepted catalog and digest paths", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-public-arena-"));
  const target = path.join(base, "arena");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "old.json"), "old");
  const result = writeArenaArtifacts(target, RUNS, SHA, GENERATED);
  assert.equal(fs.existsSync(path.join(target, "old.json")), false);
  assert.deepEqual(
    fs.readdirSync(path.join(target, "replays")).sort(),
    [...result.replays.keys()].sort().map((id) => `${id}.json`)
  );
});

test("malformed endpoint timestamps fail the whole artifact set", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-public-time-"));
  const copy = path.join(base, "copied-run");
  fs.cpSync(RUNS.find((run) => run.includes("sol56h"))!, copy, { recursive: true });
  const eventFile = path.join(copy, "games/game-000/events.jsonl");
  const events = fs.readFileSync(eventFile, "utf8").split("\n").filter(Boolean)
    .map((line) => JSON.parse(line));
  events.find((event) => event.t === "game_end").ts = "not-a-time";
  fs.writeFileSync(eventFile, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  assert.throws(() => buildArenaArtifacts([copy], SHA, GENERATED), /game_end\.ts/);
});

test("every grammar-valid unknown headline remains publishable and verbatim", () => {
  // The last name is at the grammar's edge: `<122 chars>@high` is a 127-scalar
  // id, and its composed label is 129 — longer than the identity it describes.
  // Composing labels must not turn a publishable identity into a crash.
  for (const model of ["gpt-5-", "gpt-5--turbo", `m${"x".repeat(99)}`, `m${"x".repeat(121)}`]) {
    const result = buildArenaArtifacts([copyRunWithCodexModel(model)], SHA, GENERATED);
    // copyRunWithCodexModel records `codex-cli:<model>@high`, so the identity
    // and the label both carry that effort.
    const id = `${model}@high`;
    const participant = [result.catalog.matchups[0].left, result.catalog.matchups[0].right]
      .find((item) => item.id === id);
    assert.ok(participant, model);
    // The product rejects the whole catalog over a label above 128 scalars, so
    // an emitted label must never cross it. When composition would, the
    // identity itself becomes the label.
    assert.ok(
      Array.from(participant.label).length <= 128,
      `label for ${model} must stay inside the consumer's cap`
    );
    assert.equal(
      participant.label,
      Array.from(`${model} (high)`).length <= 128 ? `${model} (high)` : id
    );
  }
});

test("one identity reached with conflicting metadata stops publication", () => {
  // Labels are composed now, so two specs that fold to one identity must still
  // agree on label and kind. `cpu-v6:level_3` is reachable both as a product
  // CPU and — grammatically — as an LLM harness's model name, which yields the
  // same identity with a different kind and label. Publication must refuse
  // rather than pick one and publish a participant that is half of each.
  // raw_ref carries the run directory name, so the two copies need distinct
  // names or the duplicate-ref guard fires before the metadata check.
  const named = (spec: string, name: string): string => {
    const copy = copyRunWithAgent(spec);
    const renamed = path.join(path.dirname(copy), name);
    fs.renameSync(copy, renamed);
    return renamed;
  };
  assert.throws(
    () => buildArenaArtifacts(
      [
        named("claude-cli:cpu-v6:level_3", "run-as-llm"),
        named("product-cpu:cpu-v6:level_3", "run-as-cpu"),
      ],
      SHA,
      GENERATED
    ),
    /conflicting participant metadata/
  );
});

test("a grammar-invalid headline stays verified without wedging publication", () => {
  const result = buildArenaArtifacts([copyRunWithCodexModel("my model")], SHA, GENERATED);
  assert.equal(result.catalog.verified_run_count, 1);
  assert.equal(result.catalog.verified_game_count, 2);
  assert.equal(result.catalog.public_game_count, 0);
  assert.deepEqual(result.catalog.matchups, []);
  assert.equal(result.replays.size, 0);
});

test("only exact current product identities receive friendly public labels", () => {
  for (const [agent, id, label] of [
    ["product-cpu:cpu-v6:level_6", "cpu-v6:level_6", "LaPlace CPU Lv6"],
    ["product-cpu:cpu-v999:level_999", "cpu-v999:level_999", "cpu-v999:level_999"],
    ["product-cpu:cpu-v6:level_999", "cpu-v6:level_999", "cpu-v6:level_999"],
  ]) {
    const result = buildArenaArtifacts([copyRunWithAgent(agent)], SHA, GENERATED);
    const participant = [result.catalog.matchups[0].left, result.catalog.matchups[0].right]
      .find((item) => item.id === id);
    assert.ok(participant, id);
    assert.equal(participant.label, label);
  }
});

test("public replay preserves valid Unicode commentary without UTF-16 truncation", () => {
  const raw = "😀".repeat(1_300);
  const result = buildArenaArtifacts([copyRunWithMoveRaw(raw)], SHA, GENERATED);
  const game = result.catalog.matchups[0].games.find((item) => item.raw_ref.endsWith("/game-000"));
  assert.ok(game);
  const replay = JSON.parse(result.replays.get(game.replay.id)!.toString("utf8"));
  assert.equal(replay.bench.commentary[0].text, raw);
});

test("public artifact generation rejects original commentary before any lossy export", () => {
  for (const raw of [
    "😀".repeat(2_501),
    `${"😀".repeat(1_300)} https://example.test`,
  ]) {
    assert.throws(
      () => buildArenaArtifacts([copyRunWithMoveRaw(raw)], SHA, GENERATED),
      /commentary content boundary/,
    );
  }
});

test("public artifact generation rejects a forged in-range advancing ply", () => {
  const copy = copyRunWithEventMutation((events) => {
    const advancing = events.filter((event) => event.t === "move" || event.t === "pass");
    advancing[1].ply = 0;
  });
  assert.throws(
    () => buildArenaArtifacts([copy], SHA, GENERATED),
    /advancing event has non-canonical ply/,
  );
});
