import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { claudeCliAgent, codexCliAgent } from "../src/agents/cli";
import {
  CONTEXT_TELEMETRY_SCHEMA,
  harvestContextTelemetry,
  locateClaudeTranscript,
  locateCodexRollout,
  parseClaudeTranscript,
  parseCodexRollout,
} from "../src/contexttelemetry";
import { newGame } from "../src/engine";
import type { TurnInput } from "../src/types";

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Real-format synthetic fixtures (shapes verified against live artifacts
// 2026-08-02).
const tokenCount = (input: number, window: number | null = 258_400) =>
  JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        ...(window === null ? {} : { model_context_window: window }),
        last_token_usage: {
          input_tokens: input,
          cached_input_tokens: Math.floor(input / 2),
          output_tokens: 500,
          reasoning_output_tokens: 400,
        },
      },
    },
  });
const compacted = JSON.stringify({ type: "event_msg", payload: { type: "context_compacted" } });
const compactBoundary = (trigger: string, pre: number, post: number) =>
  JSON.stringify({
    type: "system",
    subtype: "compact_boundary",
    compactMetadata: { trigger, preTokens: pre, postTokens: post },
  });

test("parseCodexRollout extracts window, compactions, and per-call token series", () => {
  const lines = [
    JSON.stringify({ type: "session_meta" }),
    tokenCount(100_000),
    "NOT JSON {{{",
    compacted,
    tokenCount(30_000),
    JSON.stringify({ type: "response_item", payload: { type: "message" } }),
  ];
  const r = parseCodexRollout(lines);
  assert.equal(r.status, "ok");
  assert.equal(r.model_context_window, 258_400);
  assert.equal(r.compaction_count, 1);
  assert.equal(r.token_counts!.length, 2);
  assert.equal(r.token_counts![0].input, 100_000);
  assert.equal(r.skipped_lines, 1);
});

test("parseCodexRollout flags structural degradation of known markers", () => {
  // token_count events exist but none carries a context window.
  const r = parseCodexRollout([tokenCount(1000, null), tokenCount(2000, null)]);
  assert.equal(r.status, "marker-format-unknown");
  // No markers at all is a valid zero, NOT format-unknown (a wholesale
  // rename is undetectable by design — documented limitation).
  assert.equal(parseCodexRollout([JSON.stringify({ type: "x" })]).status, "ok");
});

test("parseClaudeTranscript extracts compact boundaries with metadata", () => {
  const r = parseClaudeTranscript([
    JSON.stringify({ type: "user" }),
    compactBoundary("auto", 124_073, 11_613),
    compactBoundary("manual", 90_000, 8_000),
  ]);
  assert.equal(r.status, "ok");
  assert.equal(r.compaction_count, 2);
  assert.deepEqual(
    r.compactions.map((c) => [c.trigger, c.preTokens, c.postTokens]),
    [["auto", 124_073, 11_613], ["manual", 90_000, 8_000]]
  );
  // Boundary without metadata = structural degradation.
  const bad = parseClaudeTranscript([
    JSON.stringify({ type: "system", subtype: "compact_boundary" }),
  ]);
  assert.equal(bad.status, "marker-format-unknown");
  // No boundaries = clean zero.
  assert.equal(parseClaudeTranscript([JSON.stringify({ type: "user" })]).compaction_count, 0);
});

test("locators resolve ids to files in provider home layouts", () => {
  const codexHome = tmp("laplace-ct-codex-");
  const day = path.join(codexHome, "sessions", "2026", "08", "02");
  fs.mkdirSync(day, { recursive: true });
  const rollout = path.join(day, "rollout-2026-08-02T00-00-00-thread-abc123.jsonl");
  fs.writeFileSync(rollout, tokenCount(1) + "\n");
  assert.equal(locateCodexRollout(codexHome, "thread-abc123"), rollout);
  assert.equal(locateCodexRollout(codexHome, "missing"), null);

  const claudeHome = tmp("laplace-ct-claude-");
  const proj = path.join(claudeHome, "projects", "-tmp-somewhere");
  fs.mkdirSync(proj, { recursive: true });
  const transcript = path.join(proj, "sess-1.jsonl");
  fs.writeFileSync(transcript, compactBoundary("auto", 10, 1) + "\n");
  assert.equal(locateClaudeTranscript(claudeHome, "sess-1"), transcript);
  assert.equal(locateClaudeTranscript(claudeHome, "sess-2"), null);
});

test("harvest aggregates mixed multi-id outcomes with worst-status precedence", () => {
  const home = tmp("laplace-ct-mixed-");
  const day = path.join(home, "sessions", "2026", "08", "02");
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(
    path.join(day, "rollout-x-t1.jsonl"),
    [tokenCount(1000), compacted, "broken line"].join("\n")
  );
  const t = harvestContextTelemetry({
    provider: "codex",
    harness: "codex-cli",
    home,
    ids: ["t1", "t-missing"],
    unobservedTimeouts: 1,
  });
  assert.equal(t.schema, CONTEXT_TELEMETRY_SCHEMA);
  assert.equal(t.sources.length, 2);
  assert.equal(t.sources[0].status, "ok");
  assert.equal(t.sources[0].skipped_lines, 1);
  assert.equal(t.sources[1].status, "not-found");
  assert.equal(t.status, "not-found", "worst status wins");
  assert.equal(t.complete, false);
  assert.equal(t.compaction_count, 1);
  assert.equal(t.model_context_window, 258_400);
  assert.equal(t.unobserved_timeouts, 1);
});

// ---------------------------------------------------------------------------
// endGame integration through the adapters (fake runners, no real CLI)
// ---------------------------------------------------------------------------

function turnInput(extra: Partial<TurnInput>): TurnInput {
  return {
    state: newGame().state,
    ply: 0,
    actingPlayer: 1,
    team: "A",
    legal: [],
    recent: [],
    attempt: 1,
    maxPlies: 100,
    deadlineAtMs: Date.now() + 60_000,
    ...extra,
  };
}

const MOVE = '{"action":"move","from":{"row":0,"col":3},"to":{"row":3,"col":3}}';

function codexStdout(threadId: string): string {
  return [
    JSON.stringify({ type: "thread.started", thread_id: threadId }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: MOVE } }),
    JSON.stringify({ type: "turn.completed", usage: {} }),
  ].join("\n");
}

function isolationFixture(homeEnvKey: string, home: string) {
  const cwd = tmp("laplace-ct-cwd-");
  return { env: { PATH: process.env.PATH, [homeEnvKey]: home }, extraArgs: [], cwd };
}

test("codex endGame writes telemetry for observed threads, incl. a timed-out one", async () => {
  const home = tmp("laplace-ct-codexhome-");
  const day = path.join(home, "sessions", "2026", "08", "02");
  fs.mkdirSync(day, { recursive: true });
  for (const id of ["th-1", "th-2", "th-3"]) {
    fs.writeFileSync(path.join(day, `rollout-x-${id}.jsonl`), [tokenCount(5000), id === "th-2" ? compacted : ""].join("\n"));
  }
  const runDir = tmp("laplace-ct-run-");
  const gameDir = path.join(runDir, "games", "game-000");
  fs.mkdirSync(gameDir, { recursive: true });
  const eventsPath = path.join(gameDir, "events.jsonl");

  let call = 0;
  const agent = codexCliAgent({
    model: "gpt-5.6-sol",
    isolation: isolationFixture("CODEX_HOME", home),
    runner: async () => {
      call++;
      if (call === 1) return { stdout: codexStdout("th-1"), stderr: "", code: 0, timedOut: false };
      // Killed call that still flushed thread.started for th-2.
      if (call === 2) return { stdout: codexStdout("th-2"), stderr: "", code: null, timedOut: true };
      // Killed call with NO thread.started -> unobserved.
      if (call === 3) return { stdout: "", stderr: "", code: null, timedOut: true };
      return { stdout: codexStdout("th-3"), stderr: "", code: 0, timedOut: false };
    },
  });
  await agent.startGame?.("A", "game-000");
  await agent.act(turnInput({ ply: 0 }));
  await agent.act(turnInput({ ply: 2 })); // timeout, observed id
  await agent.act(turnInput({ ply: 4 })); // timeout, unobserved
  await agent.act(turnInput({ ply: 6 })); // new thread
  await agent.endGame?.({
    gameId: "game-000", team: "A", result: "win", winner: "A",
    reason: "center", plies: 7, eventsPath,
  });
  const t = JSON.parse(fs.readFileSync(path.join(gameDir, "context-telemetry-A.json"), "utf8"));
  assert.deepEqual(t.ids, ["th-1", "th-2", "th-3"]);
  assert.equal(t.unobserved_timeouts, 1);
  assert.equal(t.compaction_count, 1);
  assert.equal(t.model_context_window, 258_400);
  assert.equal(t.complete, false, "unobserved timeout means incomplete");
  await agent.dispose?.();
});

test("claude endGame writes telemetry with all client-generated session ids", async () => {
  const home = tmp("laplace-ct-claudehome-");
  const runDir = tmp("laplace-ct-run2-");
  const gameDir = path.join(runDir, "games", "game-000");
  fs.mkdirSync(gameDir, { recursive: true });
  const proj = path.join(home, "projects", "-x");
  fs.mkdirSync(proj, { recursive: true });

  let call = 0;
  const seenSessionIds: string[] = [];
  const agent = claudeCliAgent({
    model: "claude-fable-5",
    isolation: isolationFixture("CLAUDE_CONFIG_DIR", home),
    runner: async (_cmd, argv) => {
      call++;
      const flag = argv.includes("--session-id") ? "--session-id" : "--resume";
      const id = argv[argv.indexOf(flag) + 1];
      if (!seenSessionIds.includes(id)) {
        seenSessionIds.push(id);
        fs.writeFileSync(path.join(proj, `${id}.jsonl`), compactBoundary("auto", 100, 10) + "\n");
      }
      if (call === 2) return { stdout: "", stderr: "", code: null, timedOut: true };
      return {
        stdout: JSON.stringify({ is_error: false, result: MOVE, usage: {} }),
        stderr: "",
        code: 0,
        timedOut: false,
      };
    },
  });
  await agent.startGame?.("A", "game-000");
  await agent.act(turnInput({ ply: 0 }));
  await agent.act(turnInput({ ply: 2 })); // timeout -> session rotation
  await agent.act(turnInput({ ply: 4 }));
  await agent.endGame?.({
    gameId: "game-000", team: "A", result: "win", winner: "A",
    reason: "center", plies: 5, eventsPath: path.join(gameDir, "events.jsonl"),
  });
  const t = JSON.parse(fs.readFileSync(path.join(gameDir, "context-telemetry-A.json"), "utf8"));
  assert.equal(t.ids.length, 2, "old and rotated session id");
  assert.deepEqual(t.ids, seenSessionIds);
  assert.equal(t.unobserved_timeouts, 0);
  assert.equal(t.compaction_count, 2);
  assert.equal(t.provider, "claude");
  assert.ok(t.transcript_bytes > 0);
  await agent.dispose?.();
});

test("no telemetry without isolation, and none for turn-scoped policies", async () => {
  const runDir = tmp("laplace-ct-run3-");
  const gameDir = path.join(runDir, "games", "game-000");
  fs.mkdirSync(gameDir, { recursive: true });
  const eventsPath = path.join(gameDir, "events.jsonl");
  const info = {
    gameId: "game-000", team: "A" as const, result: "win" as const,
    winner: "A" as const, reason: "center", plies: 1, eventsPath,
  };

  // Ambient codex (no isolation): nothing written.
  const ambient = codexCliAgent({
    model: "m",
    runner: async () => ({ stdout: codexStdout("t"), stderr: "", code: 0, timedOut: false }),
  });
  await ambient.startGame?.("A", "game-000");
  await ambient.act(turnInput({}));
  await ambient.endGame?.(info);
  assert.ok(!fs.existsSync(path.join(gameDir, "context-telemetry-A.json")));
  await ambient.dispose?.();

  // Turn-reset with isolation: still nothing (no long-lived context).
  const home = tmp("laplace-ct-home3-");
  const reset = codexCliAgent({
    model: "m",
    contextPolicy: "turn-reset",
    isolation: isolationFixture("CODEX_HOME", home),
    runner: async () => ({ stdout: codexStdout("t"), stderr: "", code: 0, timedOut: false }),
  });
  await reset.startGame?.("A", "game-000");
  await reset.act(turnInput({}));
  await reset.endGame?.(info);
  assert.ok(!fs.existsSync(path.join(gameDir, "context-telemetry-A.json")));
  await reset.dispose?.();
});

// ---------------------------------------------------------------------------
// Review-round regressions: strict shapes, lazy claude ids, locator errors
// ---------------------------------------------------------------------------

test("strict marker validation: partial/mis-typed known markers degrade", () => {
  // claude: empty or partial metadata, or unknown trigger -> degraded.
  for (const meta of [{}, { trigger: "auto" }, { trigger: "weekly", preTokens: 1, postTokens: 2 }, { trigger: "auto", preTokens: "1", postTokens: 2 }]) {
    const r = parseClaudeTranscript([
      JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: meta }),
    ]);
    assert.equal(r.status, "marker-format-unknown", JSON.stringify(meta));
  }
  // codex: non-numeric usage values -> degraded, sample excluded.
  const bad = JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        model_context_window: 258_400,
        last_token_usage: { input_tokens: 10, cached_input_tokens: "5", output_tokens: 1, reasoning_output_tokens: 0 },
      },
    },
  });
  const r = parseCodexRollout([bad]);
  assert.equal(r.status, "marker-format-unknown");
  assert.equal(r.token_counts!.length, 0);
});

test("a game ending on a claude timeout lists only sessions that actually ran", async () => {
  const home = tmp("laplace-ct-claudehome2-");
  const runDir = tmp("laplace-ct-run4-");
  const gameDir = path.join(runDir, "games", "game-000");
  fs.mkdirSync(gameDir, { recursive: true });
  const proj = path.join(home, "projects", "-x");
  fs.mkdirSync(proj, { recursive: true });

  let call = 0;
  const agent = claudeCliAgent({
    model: "claude-fable-5",
    isolation: isolationFixture("CLAUDE_CONFIG_DIR", home),
    runner: async (_cmd, argv) => {
      call++;
      const flag = argv.includes("--session-id") ? "--session-id" : "--resume";
      const id = argv[argv.indexOf(flag) + 1];
      fs.writeFileSync(path.join(proj, `${id}.jsonl`), JSON.stringify({ type: "user" }) + "\n");
      if (call === 2) return { stdout: "", stderr: "", code: null, timedOut: true };
      return { stdout: JSON.stringify({ is_error: false, result: MOVE, usage: {} }), stderr: "", code: 0, timedOut: false };
    },
  });
  await agent.startGame?.("A", "game-000");
  await agent.act(turnInput({ ply: 0 }));
  await agent.act(turnInput({ ply: 2 })); // timeout — game ends here
  await agent.endGame?.({
    gameId: "game-000", team: "A", result: "loss", winner: "B",
    reason: "elimination", plies: 3, eventsPath: path.join(gameDir, "events.jsonl"),
  });
  const t = JSON.parse(fs.readFileSync(path.join(gameDir, "context-telemetry-A.json"), "utf8"));
  // The rotated replacement session was never invoked, so it must not appear.
  assert.equal(t.ids.length, 1);
  assert.equal(t.complete, true);
  await agent.dispose?.();
});

test("locator traversal failure becomes an honest parse-error source", () => {
  const home = tmp("laplace-ct-locfail-");
  // `sessions` as a regular FILE makes readdir throw ENOTDIR mid-traversal.
  fs.writeFileSync(path.join(home, "sessions"), "not a directory");
  const t = harvestContextTelemetry({
    provider: "codex",
    harness: "codex-cli",
    home,
    ids: ["t1"],
    unobservedTimeouts: 0,
  });
  assert.equal(t.sources[0].status, "parse-error");
  assert.equal(t.status, "parse-error");
  assert.equal(t.complete, false);
});

test("codex token_count without usable last_token_usage degrades", () => {
  for (const info of [
    { model_context_window: 258_400 },                          // missing usage
    { model_context_window: 258_400, last_token_usage: null },  // null usage
    { model_context_window: 258_400, last_token_usage: "x" },   // non-object
  ]) {
    const line = JSON.stringify({ type: "event_msg", payload: { type: "token_count", info } });
    const r = parseCodexRollout([line]);
    assert.equal(r.status, "marker-format-unknown", JSON.stringify(info));
    assert.equal(r.token_counts!.length, 0);
  }
  // And token_count with no info object at all.
  const bare = JSON.stringify({ type: "event_msg", payload: { type: "token_count" } });
  assert.equal(parseCodexRollout([bare]).status, "marker-format-unknown");
});
