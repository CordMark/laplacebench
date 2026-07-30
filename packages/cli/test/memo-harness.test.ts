import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { codexCliAgent } from "../src/agents/cli";
import {
  applyMemoReply,
  extractMemo,
  MEMO_CHAR_CAP,
  MEMO_HARNESS_REVISION,
  MEMO_INSTRUCTIONS,
  MEMO_SECTION_HEADERS,
  MemoSession,
  memoTurnPrelude,
} from "../src/agents/memo";
import { parseAgentSpec } from "../src/catalog";
import { classifyRunnableAgentSpec } from "../src/publicgames";
import { newGame } from "../src/engine";
import type { TurnInput } from "../src/types";

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const memoBlock = (body: string) => "```memo\n" + body + "\n```";

// ---------------------------------------------------------------------------
// Contract primitives
// ---------------------------------------------------------------------------

test("extractMemo takes the LAST fenced memo block and null when absent", () => {
  const reply = `{"move":...}\n${memoBlock("first")}\ntext\n${memoBlock("second")}`;
  assert.equal(extractMemo(reply), "second");
  assert.equal(extractMemo("no memo here"), null);
});

test("applyMemoReply: updated within cap, previous kept on missing or over-cap", () => {
  const ok = applyMemoReply("old", memoBlock("new memo"));
  assert.deepEqual(ok, { memo: "new memo", status: "updated" });

  const missing = applyMemoReply("old", "a reply with no block");
  assert.deepEqual(missing, { memo: "old", status: "missing" });

  const over = applyMemoReply("old", memoBlock("x".repeat(MEMO_CHAR_CAP + 1)));
  assert.deepEqual(over, { memo: "old", status: "over-cap-kept-previous" });

  const exact = applyMemoReply("old", memoBlock("y".repeat(MEMO_CHAR_CAP)));
  assert.equal(exact.status, "updated");
});

test("memoTurnPrelude marks the first turn and injects the current memo later", () => {
  assert.ok(memoTurnPrelude("").includes("first turn"));
  assert.ok(memoTurnPrelude("### Position read\nwe hold the center").includes("we hold the center"));
});

test("the fixed instructions carry the cap, all four sections, and the seat-invariant rule", () => {
  assert.ok(MEMO_INSTRUCTIONS.includes(String(MEMO_CHAR_CAP)));
  for (const header of MEMO_SECTION_HEADERS) {
    assert.ok(MEMO_INSTRUCTIONS.includes(header), header);
  }
  assert.ok(/seat-invariant/i.test(MEMO_INSTRUCTIONS));
});

// ---------------------------------------------------------------------------
// MemoSession lifecycle
// ---------------------------------------------------------------------------

test("MemoSession appends one attempt-indexed record per adapter call and never overwrites", () => {
  const runDir = tmp("laplace-memo-");
  const session = new MemoSession(runDir);
  session.startGame("A", "game-000");

  assert.equal(session.record(memoBlock("memo v1"), 0, 1), "updated");
  // Failed repair attempt with no memo: recorded, previous kept.
  assert.equal(session.record("E_BAD reply, no memo", 2, 1), "missing");
  assert.equal(session.record(memoBlock("memo v2"), 2, 2), "updated");
  // Timeout transition (empty reply text).
  assert.equal(session.record("", 4, 1), "missing");

  const lines = fs
    .readFileSync(path.join(runDir, "memo", "game-000", "A.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.equal(lines.length, 4);
  assert.deepEqual(
    lines.map((l) => [l.ply, l.attempt, l.status]),
    [
      [0, 1, "updated"],
      [2, 1, "missing"],
      [2, 2, "updated"],
      [4, 1, "missing"],
    ]
  );
  // The failed attempt kept v1; the timeout kept v2.
  assert.equal(lines[1].memo, "memo v1");
  assert.equal(lines[3].memo, "memo v2");
  assert.ok(lines.every((l) => l.revision === MEMO_HARNESS_REVISION));

  // A new game resets the memo and writes to its own file.
  session.startGame("B", "game-001");
  assert.ok(session.prelude().includes("first turn"));
  session.record(memoBlock("fresh"), 0, 1);
  assert.ok(fs.existsSync(path.join(runDir, "memo", "game-001", "B.jsonl")));
  // game-000's history is untouched.
  assert.equal(
    fs.readFileSync(path.join(runDir, "memo", "game-000", "A.jsonl"), "utf8").trim().split("\n").length,
    4
  );
});

// ---------------------------------------------------------------------------
// Spec identity
// ---------------------------------------------------------------------------

test("codex-cli-memo parses as its own harness and is runnable", () => {
  const parsed = parseAgentSpec("codex-cli-memo:gpt-5.6-sol@medium");
  assert.equal(parsed.harness, "codex-cli-memo");
  assert.equal(parsed.model, "gpt-5.6-sol");
  assert.deepEqual(classifyRunnableAgentSpec("codex-cli-memo:gpt-5.6-sol@medium"), {
    kind: "codex-cli-memo",
    model: "gpt-5.6-sol",
    effort: "medium",
    latency: "measured",
  });
  assert.equal(parseAgentSpec("codex-cli:gpt-5.6-sol@medium").harness, "codex-cli");
});

// ---------------------------------------------------------------------------
// act() path with an injected runner (no real CLI)
// ---------------------------------------------------------------------------

function codexReply(text: string): string {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "t-1" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } }),
  ].join("\n");
}

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

test("memo agent: fresh exec every turn, memo propagates, status lands on meta", async () => {
  const runDir = tmp("laplace-memo-agent-");
  const calls: { argv: string[]; userText: string }[] = [];
  const replies = [
    `{"action":"move","from":{"row":0,"col":3},"to":{"row":3,"col":3}}\nnote text\n${memoBlock("### Position read\nwe opened center\n### Our plan\nhold\n### Opponent tendencies\n?\n### Lessons\n-")}`,
    `{"action":"move","from":{"row":7,"col":3},"to":{"row":4,"col":3}}\nno memo this time`,
  ];
  const memo = new MemoSession(runDir);
  const agent = codexCliAgent({
    model: "gpt-5.6-sol",
    effort: "medium",
    memo,
    runner: async (_cmd, argv) => {
      const userText = argv[argv.length - 1];
      calls.push({ argv, userText });
      return {
        stdout: codexReply(replies[calls.length - 1] ?? "late reply"),
        stderr: "",
        code: 0,
        timedOut: false,
      };
    },
  });

  assert.equal(agent.name, "codex-cli-memo:gpt-5.6-sol@medium");
  await agent.startGame?.("A", "game-000");

  const first = await agent.act(turnInput({ ply: 0 }));
  assert.ok(first.move, "move must parse");
  assert.equal((first.meta as any)?.memo_status, "updated");

  const second = await agent.act(turnInput({ ply: 2 }));
  assert.equal((second.meta as any)?.memo_status, "missing");

  // Both calls are fresh execs with full instructions + memo prelude.
  for (const call of calls) {
    assert.ok(!call.argv.includes("resume"), "must never resume");
    assert.ok(call.userText.includes("LAPLACE"), "instructions resent every turn");
    assert.ok(call.userText.includes("Bounded strategy memo"), "memo rules every turn");
  }
  // First turn: no memo yet; second turn: turn-1's memo injected.
  assert.ok(calls[0].userText.includes("first turn"));
  assert.ok(calls[1].userText.includes("we opened center"));

  // Timeout transition keeps the previous memo and is recorded.
  const timedOut = await agent.act(
    turnInput({ ply: 4, deadlineAtMs: Date.now() - 1 })
  );
  assert.equal(timedOut.timedOut, true);
  assert.equal((timedOut.meta as any)?.memo_status, "missing");

  const lines = fs
    .readFileSync(path.join(runDir, "memo", "game-000", "A.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.equal(lines.length, 3);
  assert.equal(lines[2].memo, lines[0].memo, "timeout keeps the last good memo");
  await agent.dispose?.();
});

// ---------------------------------------------------------------------------
// Turn-scoped conditions refuse ambient execution (undeclared-carryover guard)
// ---------------------------------------------------------------------------

test("memo and reset specs refuse --ambient-cli-env (fail-closed, no run dir)", async () => {
  const { arena, assertTurnScopedCleanRoom } = await import("../src/cli");
  const { MatchPreflightError } = await import("../src/playerrors");

  assert.throws(
    () => assertTurnScopedCleanRoom("ambient", "codex-cli-memo:gpt-5.6-sol@medium", "random"),
    MatchPreflightError
  );
  assert.throws(
    () => assertTurnScopedCleanRoom("ambient", "random", "codex-cli-reset:gpt-5.6-sol@medium"),
    MatchPreflightError
  );
  // Clean-room and non-turn-scoped ambient stay allowed.
  assert.doesNotThrow(() =>
    assertTurnScopedCleanRoom("clean-room", "codex-cli-memo:gpt-5.6-sol@medium", "random")
  );
  assert.doesNotThrow(() =>
    assertTurnScopedCleanRoom("ambient", "codex-cli:gpt-5.6-sol@medium", "random")
  );

  // End-to-end: the arena refuses before any run directory exists.
  const runId = `memo-ambient-guard-${process.pid}`;
  const runDir = path.resolve(process.cwd(), "runs", runId);
  try {
    await assert.rejects(
      arena({
        "team-a": "codex-cli-memo:gpt-5.6-sol@medium",
        "team-b": "random",
        games: "1",
        "run-id": runId,
        "ambient-cli-env": true,
      }),
      MatchPreflightError
    );
    assert.ok(!fs.existsSync(runDir));
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});
