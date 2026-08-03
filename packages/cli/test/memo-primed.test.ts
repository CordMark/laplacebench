import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { codexCliAgent } from "../src/agents/cli";
import { MemoSession, memoTurnPrelude } from "../src/agents/memo";
import { PRIMER_REVISION, PRIMER_TEXT } from "../src/agents/primer";
import {
  HARNESS_CONDITIONS,
  LLM_HARNESSES,
  PUBLIC_MATCHUP_HARNESSES,
  RECOGNIZED_HARNESSES,
  parseAgentSpec,
} from "../src/catalog";
import { assertTurnScopedCleanRoom } from "../src/cli";
import { newGame } from "../src/engine";
import {
  classifyRunnableAgentSpec,
  isPublicMatchupEligible,
  publicPair,
} from "../src/publicgames";
import type { Agent, TurnInput } from "../src/types";

const SPEC = "codex-cli-memo-primed:gpt-5.6-sol@high";
const MOVE = '{"move":{"from":{"row":0,"col":3},"to":{"row":3,"col":3}}}';

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function memoBlock(body: string): string {
  return "```memo\n" + body + "\n```";
}

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

// ---------------------------------------------------------------------------
// The frozen primer artifact
// ---------------------------------------------------------------------------

test("primer-v1 honors the adjudicated length contract", () => {
  // <= 2000 is the reviewed freeze-time requirement (2500 is the absolute
  // cap from the direction dialogue; the tighter bound is what the plan
  // committed to, so the tighter bound is what the guard pins).
  assert.equal(PRIMER_REVISION, "primer-v1");
  assert.ok(PRIMER_TEXT.length > 0, "primer must not be empty");
  assert.ok(
    PRIMER_TEXT.length <= 2000,
    `primer is ${PRIMER_TEXT.length} chars; the frozen contract is <= 2000`
  );
});

test("primer text is seat-invariant: identity by we/opponent, never seat letters", () => {
  // Run 7 lesson, same standard the memo instructions are held to: color
  // names are rulebook vocabulary and allowed; seat identities are not.
  assert.ok(!/Team A|Team B/i.test(PRIMER_TEXT));
});

// ---------------------------------------------------------------------------
// Catalog and classifier recognition
// ---------------------------------------------------------------------------

test("memo-primed is a recognized LLM harness excluded from public matchups", () => {
  assert.ok(RECOGNIZED_HARNESSES.includes("codex-cli-memo-primed"));
  assert.ok(LLM_HARNESSES.includes("codex-cli-memo-primed"));
  assert.ok(!PUBLIC_MATCHUP_HARNESSES.includes("codex-cli-memo-primed"));
  assert.equal(isPublicMatchupEligible(SPEC), false);
  assert.equal(publicPair(SPEC, "codex-cli:gpt-5.6-sol@high"), null);
  assert.equal(publicPair("codex-cli:gpt-5.6-sol@high", SPEC), null);

  const conditions = HARNESS_CONDITIONS["codex-cli-memo-primed"];
  assert.ok(conditions, "conditions must be declared");
  assert.equal(
    conditions.context_lifetime,
    HARNESS_CONDITIONS["codex-cli-memo"].context_lifetime,
    "primed shares memo's declared context lifetime"
  );
  assert.ok(conditions.mechanism.includes("primer-v1"));

  const parsed = parseAgentSpec(SPEC);
  assert.equal(parsed.harness, "codex-cli-memo-primed");
  assert.equal(parsed.model, "gpt-5.6-sol");
  assert.equal(parsed.effort, "high");
});

test("classifier: primed never parses as memo or base codex-cli (prefix order)", () => {
  const full = classifyRunnableAgentSpec(SPEC);
  assert.deepEqual(full, {
    kind: "codex-cli-memo-primed",
    model: "gpt-5.6-sol",
    effort: "high",
    latency: "measured",
  });
  const bare = classifyRunnableAgentSpec("codex-cli-memo-primed");
  assert.deepEqual(bare, { kind: "codex-cli-memo-primed", latency: "measured" });
  // The shorter prefixes still classify as themselves.
  assert.equal(classifyRunnableAgentSpec("codex-cli-memo")?.kind, "codex-cli-memo");
  assert.equal(classifyRunnableAgentSpec("codex-cli:gpt-5.6-sol@high")?.kind, "codex-cli");
});

test("turn-scoped clean-room requirement fails closed for memo-primed in ambient", () => {
  assert.throws(
    () => assertTurnScopedCleanRoom("ambient", SPEC, "random"),
    /codex-cli-memo-primed/
  );
  assert.doesNotThrow(() => assertTurnScopedCleanRoom("clean-room", SPEC, "random"));
});

// ---------------------------------------------------------------------------
// act() path with an injected runner (no real CLI)
// ---------------------------------------------------------------------------

function scriptedAgent(
  replies: string[],
  primer?: string
): { agent: Agent; calls: { argv: string[]; userText: string }[]; runDir: string } {
  const runDir = tmp("laplace-memo-primed-");
  const calls: { argv: string[]; userText: string }[] = [];
  const agent = codexCliAgent({
    model: "gpt-5.6-sol",
    effort: "high",
    memo: new MemoSession(runDir, primer),
    runner: async (_cmd, argv) => {
      calls.push({ argv, userText: argv[argv.length - 1] });
      return {
        stdout: codexReply(replies[calls.length - 1] ?? "late reply"),
        stderr: "",
        code: 0,
        timedOut: false,
      };
    },
  });
  return { agent, calls, runDir };
}

const REPLIES = [
  `${MOVE}\nnote\n${memoBlock("### Position read\nwe opened center\n### Our plan\nhold\n### Opponent tendencies\n?\n### Lessons\n-")}`,
  `${MOVE}\nno memo this time`,
  `${MOVE}\nnote\n${memoBlock("### Position read\nply four\n### Our plan\npress\n### Opponent tendencies\npassive\n### Lessons\nnone")}`,
];

test("primed agent: names itself by the variant and injects the primer every call", async () => {
  const { agent, calls } = scriptedAgent(REPLIES, PRIMER_TEXT);
  assert.equal(agent.name, SPEC);
  await agent.startGame?.("A", "game-000");

  const first = await agent.act(turnInput({ ply: 0 }));
  assert.ok(first.move, "move must parse");
  assert.equal((first.meta as any)?.memo_status, "updated");

  const second = await agent.act(turnInput({ ply: 2 }));
  assert.equal((second.meta as any)?.memo_status, "missing");

  for (const call of calls) {
    assert.ok(!call.argv.includes("resume"), "must never resume a thread");
    assert.ok(call.userText.includes("LAPLACE"), "instructions resent every turn");
    assert.ok(call.userText.includes(PRIMER_TEXT), "primer on every call");
    assert.ok(call.userText.includes("Bounded strategy memo"), "memo rules every call");
    assert.ok(
      call.userText.indexOf(PRIMER_TEXT) < call.userText.indexOf("Bounded strategy memo"),
      "primer precedes the memo instructions"
    );
  }
  assert.ok(calls[1].userText.includes("we opened center"), "memo still propagates");
  await agent.dispose?.();
});

test("differential: stripping the primer from every primed call reproduces memo-v1 byte-for-byte", async () => {
  const v1 = scriptedAgent(REPLIES);
  const primed = scriptedAgent(REPLIES, PRIMER_TEXT);
  for (const side of [v1, primed]) await side.agent.startGame?.("A", "game-000");

  // Identical scripted turns through both arms: first turn, a propagated-memo
  // turn, and a turn after a missing memo (previous memo carried).
  const turns: Partial<TurnInput>[] = [{ ply: 0 }, { ply: 2 }, { ply: 4 }];
  for (const t of turns) {
    await v1.agent.act(turnInput(t));
    await primed.agent.act(turnInput(t));
  }

  assert.equal(v1.calls.length, primed.calls.length);
  // The prelude joins [primer, "", instructions, ...] with "\n", so the
  // variant's entire footprint in the user text is PRIMER_TEXT + "\n\n".
  const footprint = PRIMER_TEXT + "\n\n";
  for (let i = 0; i < primed.calls.length; i++) {
    const stripped = primed.calls[i].userText.replace(footprint, "");
    assert.equal(
      stripped,
      v1.calls[i].userText,
      `call ${i}: primed minus primer must equal memo-v1`
    );
  }

  // Memo artifacts are the same mechanism: identical JSONL bytes.
  const read = (dir: string) =>
    fs.readFileSync(path.join(dir, "memo", "game-000", "A.jsonl"), "utf8");
  assert.equal(read(primed.runDir), read(v1.runDir));

  // And the prelude helper honors the same contract directly.
  assert.equal(
    memoTurnPrelude("m", PRIMER_TEXT).replace(footprint, ""),
    memoTurnPrelude("m")
  );
  await v1.agent.dispose?.();
  await primed.agent.dispose?.();
});
