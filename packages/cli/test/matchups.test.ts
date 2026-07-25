import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { randomAgent } from "../src/agents/random";
import {
  PROVIDERS,
  headlineKey,
  isLlmSpec,
  parseAgentSpec,
} from "../src/catalog";
import { positionals } from "../src/cli";
import { playGame } from "../src/runner";
import {
  MATCHUPS_SCHEMA,
  matchupData,
  matchupsJson,
  matchupsMarkdown,
} from "../src/standings";
import { submissionGuidance } from "../src/wizard";

function writeRun(dir: string, gameId: string, fin: object): void {
  const g = path.join(dir, "games", gameId);
  fs.mkdirSync(g, { recursive: true });
  fs.writeFileSync(path.join(g, "final.json"), JSON.stringify(fin));
}

function team(agent: string, turns = 10, legality = 0, format = 0) {
  return { agent, turns, legalityFailures: legality, formatFailures: format };
}

const tmp = (tag: string) => fs.mkdtempSync(path.join(os.tmpdir(), tag));

test("matchup golden bytes: property order, orientation, rounding, one trailing newline", () => {
  const runDir = path.join(tmp("laplace-golden-"), "run-a");
  // Fable (claude-cli) vs GPT (codex-cli), sides swapped between the two games.
  writeRun(runDir, "game-000", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli:fable@medium"), B: team("codex-cli:gpt@medium") },
  });
  writeRun(runDir, "game-001", {
    winner: "A", reason: "elimination",
    teams: { A: team("codex-cli:gpt@medium"), B: team("claude-cli:fable@medium", 3, 1, 0) },
  });
  const json = matchupsJson([runDir]);
  const expected = `{
  "schema": "laplace-bench-standings-v2",
  "lane": "community",
  "game_count": 2,
  "run_count": 1,
  "matchup_count": 1,
  "matchups": [
    {
      "headline": {
        "left": "fable",
        "right": "gpt"
      },
      "games": 2,
      "left_wins": 1,
      "right_wins": 1,
      "draws": 0,
      "last_game": "run-a/game-001",
      "breakdown": [
        {
          "left_agent": "claude-cli:fable@medium",
          "right_agent": "codex-cli:gpt@medium",
          "games": 2,
          "left_wins": 1,
          "right_wins": 1,
          "draws": 0,
          "center_wins": 1,
          "elim_wins": 1,
          "horizon_draws": 0,
          "repetition_draws": 0,
          "left_err_per_turn": 0.077,
          "right_err_per_turn": 0
        }
      ]
    }
  ],
  "agents": [
    {
      "agent": "claude-cli:fable@medium",
      "games": 2,
      "err_per_turn": 0.077
    },
    {
      "agent": "codex-cli:gpt@medium",
      "games": 2,
      "err_per_turn": 0
    }
  ]
}
`;
  assert.equal(json, expected);
  // Both games land in ONE breakdown row despite the side swap.
  assert.equal(matchupData([runDir]).matchups[0].breakdown.length, 1);
});

test("headline folds every harness onto the model; unknown specs stay whole", () => {
  assert.equal(headlineKey("claude-cli:opus@high"), "opus");
  assert.equal(headlineKey("anthropic:opus"), "opus");
  // The learning harness folds in too — it is part of the harness axis, not a
  // separate contender (direction correction 363555d9).
  assert.equal(headlineKey("claude-cli-learn:opus@high"), "opus");

  // `anthropic-api` is a usage-accounting label, NOT a spec prefix: it must not
  // be mistaken for the anthropic harness.
  assert.equal(headlineKey("anthropic-api:opus"), "anthropic-api:opus");
  assert.equal(isLlmSpec("anthropic-api:opus"), false);

  // Recognition is by allowlist, not by shape: same colon form, different fate.
  assert.deepEqual(parseAgentSpec("claude-cli-learn:claude-fable-5@low"), {
    harness: "claude-cli-learn", model: "claude-fable-5", effort: "low",
    raw: "claude-cli-learn:claude-fable-5@low",
  });
  assert.deepEqual(parseAgentSpec("takeshi:d2"), {
    harness: null, model: null, effort: null, raw: "takeshi:d2",
  });
  assert.equal(headlineKey("takeshi:d2"), "takeshi:d2");
});

test("every published catalog spec round-trips through parseAgentSpec", () => {
  for (const p of PROVIDERS) {
    for (const model of p.models) {
      for (const effort of p.efforts.length ? p.efforts : [""]) {
        const spec = p.buildSpec(model.value, effort);
        const parsed = parseAgentSpec(spec);
        if (p.key === "baseline") {
          // Bare names carry no harness, so they stay opaque — and therefore
          // never count as LLM games.
          assert.equal(parsed.harness, null, spec);
          assert.equal(isLlmSpec(spec), false, spec);
          continue;
        }
        assert.equal(parsed.harness, p.key, spec);
        assert.equal(parsed.effort, effort || null, spec);
        if (p.key === "product-cpu") {
          // The policy generation stays attached: cpu-v5 must never silently
          // reuse a cpu-v4 identity.
          assert.equal(parsed.model, `cpu-v4:${model.value}`, spec);
          assert.equal(isLlmSpec(spec), false, spec);
        } else {
          assert.equal(parsed.model, model.value || null, spec);
          assert.equal(isLlmSpec(spec), true, spec);
        }
      }
    }
  }
  // The one model-omitted + effort form the catalog can emit.
  assert.deepEqual(parseAgentSpec("codex-cli:@medium"), {
    harness: "codex-cli", model: null, effort: "medium", raw: "codex-cli:@medium",
  });
  assert.equal(headlineKey("codex-cli:@medium"), "codex-cli:@medium");
});

test("publication conditions: baseline-only out, one-sided LLM in, self-matchup out", () => {
  const runDir = path.join(tmp("laplace-publish-"), "run-p");
  // baseline vs baseline — no model involved, not public content
  writeRun(runDir, "game-000", {
    winner: "A", reason: "center",
    teams: { A: team("random"), B: team("greedy") },
  });
  // one side is a real model against the reference opponent — public
  writeRun(runDir, "game-001", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli:opus@high"), B: team("product-cpu:cpu-v4:level_5") },
  });
  // harness comparison: same model AND effort, so both sides fold to "opus"
  writeRun(runDir, "game-002", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli-learn:opus@high"), B: team("claude-cli:opus@high") },
  });
  const data = matchupData([runDir]);
  assert.equal(data.matchup_count, 1);
  assert.deepEqual(data.matchups[0].headline, {
    left: "cpu-v4:level_5", right: "opus",
  });
  // Excluded games are still counted in the ledger totals and participants.
  assert.equal(data.game_count, 3);
  assert.deepEqual(
    data.agents.map((a) => a.agent),
    [
      "claude-cli-learn:opus@high",
      "claude-cli:opus@high",
      "greedy",
      "product-cpu:cpu-v4:level_5",
      "random",
    ]
  );
});

test("orientation follows the headline pair, not the raw spec order", () => {
  const runDir = path.join(tmp("laplace-orient-"), "run-o");
  // Raw order is the REVERSE of headline order here:
  //   raw:      "claude-cli:zzz" < "codex-cli:aaa"   ('l' < 'o')
  //   headline: "aaa"            < "zzz"
  // Sorting raw first would flip left/right against the headline.
  writeRun(runDir, "game-000", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli:zzz"), B: team("codex-cli:aaa") },
  });
  // A second breakdown under the SAME headline, with the raw order agreeing.
  writeRun(runDir, "game-001", {
    winner: "B", reason: "center",
    teams: { A: team("anthropic:aaa"), B: team("claude-cli:zzz") },
  });
  const m = matchupData([runDir]).matchups[0];
  assert.deepEqual(m.headline, { left: "aaa", right: "zzz" });
  // Game 0: zzz won. Game 1: zzz won. Both must land on the RIGHT side.
  assert.equal(m.left_wins, 0);
  assert.equal(m.right_wins, 2);
  for (const b of m.breakdown) {
    assert.equal(headlineKey(b.left_agent), "aaa");
    assert.equal(headlineKey(b.right_agent), "zzz");
    assert.equal(b.right_wins, 1);
  }
});

test("output is a total order: independent of runDirs order and of tied rows", () => {
  const base = tmp("laplace-order-");
  const r1 = path.join(base, "run-1");
  const r2 = path.join(base, "run-2");
  // Two breakdowns under one headline, identical games and identical last_game
  // position — only the raw specs can break the tie.
  writeRun(r1, "game-000", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli:opus@high"), B: team("codex-cli:gpt") },
  });
  writeRun(r2, "game-000", {
    winner: "A", reason: "center",
    teams: { A: team("anthropic:opus"), B: team("codex-cli:gpt") },
  });
  const forward = matchupsJson([r1, r2]);
  const reversed = matchupsJson([r2, r1]);
  assert.equal(forward, reversed);
  assert.equal(matchupsJson([r1, r2]), forward);
  // Headline is gpt|opus, so both rows share left_agent — the tie can only be
  // broken by the LAST comparator, right_agent.
  const breakdown = matchupData([r1, r2]).matchups[0].breakdown;
  assert.deepEqual(
    breakdown.map((b) => [b.left_agent, b.right_agent]),
    [
      ["codex-cli:gpt", "anthropic:opus"],
      ["codex-cli:gpt", "claude-cli:opus@high"],
    ]
  );
});

test("breakdown reports draw causes separately", () => {
  const runDir = path.join(tmp("laplace-draws-"), "run-d");
  writeRun(runDir, "game-000", {
    winner: null, reason: "horizon_draw",
    teams: { A: team("claude-cli:opus"), B: team("codex-cli:gpt") },
  });
  writeRun(runDir, "game-001", {
    winner: null, reason: "repetition_draw",
    teams: { A: team("claude-cli:opus"), B: team("codex-cli:gpt") },
  });
  const b = matchupData([runDir]).matchups[0].breakdown[0];
  assert.equal(b.draws, 2);
  assert.equal(b.horizon_draws, 1);
  assert.equal(b.repetition_draws, 1);
  assert.equal(b.left_wins + b.right_wins, 0);
});

test("matchups are ordered by games played, most first", () => {
  const runDir = path.join(tmp("laplace-rank-"), "run-r");
  writeRun(runDir, "game-000", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli:opus"), B: team("codex-cli:gpt") },
  });
  writeRun(runDir, "game-001", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli:opus"), B: team("codex-cli:gpt") },
  });
  writeRun(runDir, "game-002", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli:haiku"), B: team("codex-cli:gpt") },
  });
  const data = matchupData([runDir]);
  assert.deepEqual(
    data.matchups.map((m) => [m.headline.left, m.headline.right, m.games]),
    [["gpt", "opus", 2], ["gpt", "haiku", 1]]
  );
});

test("empty states: zero runs, and games that all fail the publication test", () => {
  const zero = matchupData([]);
  assert.equal(zero.game_count, 0);
  assert.equal(zero.run_count, 0);
  assert.equal(zero.matchup_count, 0);
  assert.deepEqual(zero.matchups, []);
  assert.deepEqual(zero.agents, []);
  assert.ok(matchupsJson([]).endsWith("\n"));
  assert.ok(matchupsMarkdown([]).includes("No public matchups yet"));

  // Games exist, but none of them belong on the public list.
  const runDir = path.join(tmp("laplace-empty-"), "run-e");
  writeRun(runDir, "game-000", {
    winner: "A", reason: "center",
    teams: { A: team("random"), B: team("greedy") },
  });
  const data = matchupData([runDir]);
  assert.equal(data.game_count, 1);
  assert.equal(data.matchup_count, 0);
  assert.deepEqual(data.matchups, []);
  assert.equal(data.agents.length, 2);
});

test("markdown says CI owns the file and keeps the self-reported caveat", () => {
  const runDir = path.join(tmp("laplace-md-"), "run-m");
  writeRun(runDir, "game-000", {
    winner: "A", reason: "center",
    teams: { A: team("claude-cli:opus"), B: team("codex-cli:gpt") },
  });
  const md = matchupsMarkdown([runDir]);
  assert.ok(md.includes("do not edit by hand"));
  assert.ok(md.includes("## gpt vs opus"));
  assert.ok(md.includes("self-reported"));
  // No regeneration command is advertised to submitters any more.
  assert.ok(!md.includes("npx laplacebench standings"));
});

test("submission guidance no longer asks submitters to regenerate anything", () => {
  const lines = submissionGuidance("run-y").join("\n");
  assert.ok(lines.includes("cp -R runs/run-y"));
  assert.ok(!lines.includes("laplacebench standings"));
  assert.ok(lines.includes("自動マージ"));
});

test("positionals exclude option values", () => {
  assert.deepEqual(
    positionals(["community/runs/a", "--out", "x.md", "--json-out", "y.json", "community/runs/b"]),
    ["community/runs/a", "community/runs/b"]
  );
});

test("CLI standings writes json alone and combined with md", async () => {
  const workDir = tmp("laplace-cli-json-");
  await playGame({
    gameId: "game-000",
    runDir: path.join(workDir, "r1"),
    seed: 5,
    maxPlies: 6,
    agents: { A: randomAgent(1), B: randomAgent(2) },
  });
  const { execFileSync } = await import("node:child_process");
  const jsonPath = path.join(workDir, "matchups.json");
  const mdPath = path.join(workDir, "MATCHUPS.md");
  execFileSync("npx", ["tsx", "src/cli.ts", "standings", path.join(workDir, "r1"), "--json-out", jsonPath], { stdio: "ignore" });
  const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  assert.equal(parsed.schema, MATCHUPS_SCHEMA);
  execFileSync("npx", ["tsx", "src/cli.ts", "standings", path.join(workDir, "r1"), "--out", mdPath, "--json-out", jsonPath], { stdio: "ignore" });
  assert.ok(fs.existsSync(mdPath));
  assert.ok(fs.existsSync(jsonPath));
});
