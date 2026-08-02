import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { codexCliAgent } from "../src/agents/cli";
import { MemoSession } from "../src/agents/memo";
import {
  NOTES_ANNOUNCEMENT,
  NOTES_GUIDED,
  NOTES_HARNESS_REVISION,
  NOTES_V1,
  NotesSession,
  notesTurnPrelude,
} from "../src/agents/notes";
import {
  HARNESS_CONDITIONS,
  LLM_HARNESSES,
  PUBLIC_MATCHUP_HARNESSES,
  RECOGNIZED_HARNESSES,
  parseAgentSpec,
} from "../src/catalog";
import { newGame } from "../src/engine";
import { classifyRunnableAgentSpec, isPublicMatchupEligible, publicPair } from "../src/publicgames";
import type { Agent, RecentEvent, TurnInput } from "../src/types";

const MOVE = '{"move":{"from":{"row":0,"col":0},"to":{"row":0,"col":3}}}';
const SPEC = "codex-cli-notes-guided:gpt-5.6-sol@medium";

// ---------------------------------------------------------------------------
// The announcement: content direction only — still not one word about shape
// ---------------------------------------------------------------------------

/**
 * The same token guard v1 lives under (test/notes-carry.test.ts). "Guided"
 * means the announcement may direct WHAT the note is about; it must still say
 * nothing about how the note is written, or the arm stops being a pure
 * instruction ablation against v1 and becomes a weaker memo.
 */
const SHAPE_DENYLIST = [
  "format",
  "structure",
  "structured",
  "section",
  "heading",
  "header",
  "bullet",
  "list",
  "template",
  "schema",
  "outline",
  "length",
  "character",
  "characters",
  "word count",
  "concise",
  "書式",
  "形式",
  "構造",
  "セクション",
  "見出し",
  "箇条書き",
  "文字数",
  "長さ",
  "簡潔",
];

test("the guided denylist is the SAME list v1 is guarded by", () => {
  // Source-level drift guard: "guided vs v1 is the pure effect of the
  // instruction" only holds while both announcements are held to one standard.
  // A token added to v1's guard and not here would silently exempt guided.
  const source = fs.readFileSync(
    path.join(__dirname, "notes-carry.test.ts"),
    "utf8"
  );
  const block = source.match(/const SHAPE_DENYLIST = \[([\s\S]*?)\];/);
  assert.ok(block, "v1 test must still declare SHAPE_DENYLIST");
  const v1Tokens = [...block[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(SHAPE_DENYLIST, v1Tokens);
});

test("the guided announcement directs content and hints at no shape whatsoever", () => {
  // What it MUST add over v1: why this move, and what the next turn needs.
  assert.match(NOTES_GUIDED.announcement, /purpose/i);
  assert.match(NOTES_GUIDED.announcement, /next turn/i);
  // …while keeping the v1 carryover contract itself intact.
  assert.match(NOTES_GUIDED.announcement, /future self/i);
  assert.match(NOTES_GUIDED.announcement, /only memory/i);
  assert.match(NOTES_GUIDED.announcement, /past moves/i);

  // What it must NOT say, in the announcement or in the harness-authored part
  // of the injected block.
  for (const guarded of [
    NOTES_GUIDED.announcement,
    notesTurnPrelude([], NOTES_GUIDED),
  ]) {
    const lowered = guarded.toLowerCase();
    for (const token of SHAPE_DENYLIST) {
      assert.ok(
        !lowered.includes(token.toLowerCase()),
        `guided notes text must not hint at "${token}"`
      );
    }
  }
});

test("the guided announcement is v1 verbatim plus content direction", () => {
  // The delta IS the intervention: anything else that differs would confound
  // "guided vs v1" with a second change nobody declared.
  assert.ok(
    NOTES_GUIDED.announcement.startsWith(NOTES_V1.announcement),
    "guided must keep the v1 framing word for word"
  );
  const added = NOTES_GUIDED.announcement.slice(NOTES_V1.announcement.length);
  assert.ok(added.trim().length > 0);
  assert.match(added, /purpose/i);
  assert.match(added, /next turn/i);
});

test("the guided announcement never injects LAPLACE tactics", () => {
  // Content direction is about the NOTE, not about how to play: a hint at the
  // game's strategy would make this a strategy arm, not a memory arm.
  const lowered = NOTES_GUIDED.announcement.toLowerCase();
  for (const tactic of [
    "center",
    "centre",
    "eliminat",
    "capture",
    "flank",
    "diagonal",
    "row 4",
    "corner",
    "中央",
    "全滅",
  ]) {
    assert.ok(!lowered.includes(tactic), `guided text must not suggest "${tactic}"`);
  }
});

test("the variants declare their identities and v1's aliases still point at v1", () => {
  assert.equal(NOTES_V1.revision, "notes-v1");
  assert.equal(NOTES_V1.specHead, "codex-cli-notes");
  assert.equal(NOTES_GUIDED.revision, "notes-guided-v1");
  assert.equal(NOTES_GUIDED.specHead, "codex-cli-notes-guided");
  // The pre-variant exports are aliases, not a second source of truth.
  assert.equal(NOTES_HARNESS_REVISION, NOTES_V1.revision);
  assert.equal(NOTES_ANNOUNCEMENT, NOTES_V1.announcement);
});

// ---------------------------------------------------------------------------
// The mechanism is shared: only the announcement differs
// ---------------------------------------------------------------------------

const ownMove = (ply: number): RecentEvent => ({ ply, color: "Red", action: "move" });
const ownPass = (ply: number): RecentEvent => ({ ply, color: "Red", action: "pass" });
const theirMove = (ply: number): RecentEvent => ({ ply, color: "Blue", action: "move" });

test("the default variant is v1, so every pre-variant call site is unchanged", () => {
  assert.equal(new NotesSession().variant, NOTES_V1);
  assert.equal(notesTurnPrelude([]), notesTurnPrelude([], NOTES_V1));
  const entries = [{ ply: 0, note: "a" }, { ply: 2, note: "b" }];
  assert.equal(notesTurnPrelude(entries), notesTurnPrelude(entries, NOTES_V1));
});

test("guided and v1 journals differ by the announcement and by nothing else", () => {
  // Same script through both sessions: the committed body, the ply labels, the
  // empty-first-move text and the counts must come out identical, because
  // stage/resolve/prelude never branch on the variant.
  const script: [string, number, RecentEvent[]][] = [
    [`Opening the center.\n${MOVE}`, 0, [ownMove(0), theirMove(1)]],
    [`Trying a pincer.\n${MOVE}`, 2, [ownPass(2), theirMove(3)]],
    [`Holding row 4.\n${MOVE}`, 4, [ownMove(4)]],
  ];
  const v1 = new NotesSession();
  const guided = new NotesSession(NOTES_GUIDED);
  v1.startGame("A", "game-000");
  guided.startGame("A", "game-000");
  assert.equal(
    v1.prelude().text.replace(NOTES_V1.announcement, ""),
    guided.prelude().text.replace(NOTES_GUIDED.announcement, "")
  );

  for (const [raw, ply, recent] of script) {
    for (const session of [v1, guided]) {
      session.stage(raw, ply);
      session.resolve(recent);
    }
    const a = v1.prelude();
    const b = guided.prelude();
    assert.equal(a.count, b.count);
    assert.equal(
      a.text.replace(NOTES_V1.announcement, ""),
      b.text.replace(NOTES_GUIDED.announcement, "")
    );
  }
  assert.equal(guided.prelude().count, 2, "the lost turn is discarded in guided too");
  assert.ok(guided.prelude().text.includes(NOTES_GUIDED.announcement));
  assert.ok(!guided.prelude().text.includes("Trying a pincer."));
});

// ---------------------------------------------------------------------------
// Spec identity: the longer prefix must not be eaten by the shorter ones
// ---------------------------------------------------------------------------

test("codex-cli-notes-guided parses as its own harness, never as notes or codex-cli", () => {
  const parsed = parseAgentSpec(SPEC);
  assert.equal(parsed.harness, "codex-cli-notes-guided");
  assert.equal(parsed.model, "gpt-5.6-sol");
  assert.equal(parsed.effort, "medium");
  assert.deepEqual(classifyRunnableAgentSpec(SPEC), {
    kind: "codex-cli-notes-guided",
    model: "gpt-5.6-sol",
    effort: "medium",
    latency: "measured",
  });
  // The regression the ordering exists to prevent: a model literally named
  // "-guided:gpt-5.6-sol" under the shorter harness prefixes.
  assert.notEqual(classifyRunnableAgentSpec(SPEC)?.model, "-guided:gpt-5.6-sol");
  // Bare spec, no model segment.
  assert.deepEqual(classifyRunnableAgentSpec("codex-cli-notes-guided"), {
    kind: "codex-cli-notes-guided",
    latency: "measured",
  });
  // And the shorter specs are untouched by the longer prefix.
  assert.equal(
    classifyRunnableAgentSpec("codex-cli-notes:gpt-5.6-sol@medium")?.kind,
    "codex-cli-notes"
  );
  assert.equal(
    classifyRunnableAgentSpec("codex-cli:gpt-5.6-sol@medium")?.kind,
    "codex-cli"
  );
  assert.equal(parseAgentSpec("codex-cli-notes:gpt-5.6-sol@medium").harness, "codex-cli-notes");
  assert.equal(parseAgentSpec("codex-cli:gpt-5.6-sol@medium").harness, "codex-cli");
});

test("the guided harness is registered, declared, and NOT a public lane", () => {
  assert.ok(RECOGNIZED_HARNESSES.includes("codex-cli-notes-guided"));
  assert.ok(LLM_HARNESSES.includes("codex-cli-notes-guided"));
  // The existing drift guard in harness-boundary.test.ts covers this too; the
  // assertion is repeated here so a missing declaration names the guided arm.
  assert.ok(HARNESS_CONDITIONS["codex-cli-notes-guided"]);
  assert.match(
    HARNESS_CONDITIONS["codex-cli-notes-guided"].mechanism,
    /notes-guided-v1/
  );
  // Fail-closed: a new harness stays out of the model-arena aggregate.
  assert.ok(!PUBLIC_MATCHUP_HARNESSES.includes("codex-cli-notes-guided"));
  assert.equal(isPublicMatchupEligible(SPEC), false);
  assert.equal(publicPair(SPEC, "codex-cli:gpt-5.6-sol@medium"), null);
  assert.equal(publicPair("codex-cli:gpt-5.6-sol@medium", SPEC), null);
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

function guidedAgent(replies: string[]): { agent: Agent; calls: { argv: string[]; userText: string }[] } {
  const calls: { argv: string[]; userText: string }[] = [];
  const agent = codexCliAgent({
    model: "gpt-5.6-sol",
    effort: "medium",
    notes: new NotesSession(NOTES_GUIDED),
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
  return { agent, calls };
}

test("guided agent: names itself by the variant and injects the guided announcement every turn", async () => {
  const { agent, calls } = guidedAgent([
    `Purpose: squeeze Blue. Next turn: watch the diagonal.\n${MOVE}`,
    `Purpose: seal row 4.\n${MOVE}`,
    `Consolidating.\n${MOVE}`,
  ]);
  assert.equal(agent.name, SPEC);
  await agent.startGame?.("A", "game-000");

  const first = await agent.act(turnInput({ ply: 0 }));
  assert.ok(first.move, "move must parse");
  assert.equal((first.meta as any)?.notes_carried, 0);

  const second = await agent.act(turnInput({ ply: 2, recent: [ownMove(0), theirMove(1)] }));
  assert.equal((second.meta as any)?.notes_carried, 1);

  const third = await agent.act(turnInput({ ply: 4, recent: [ownMove(2), theirMove(3)] }));
  assert.equal((third.meta as any)?.notes_carried, 2);

  for (const call of calls) {
    assert.ok(!call.argv.includes("resume"), "must never resume a thread");
    assert.ok(call.userText.includes("LAPLACE"), "instructions resent every turn");
    assert.ok(
      call.userText.includes(NOTES_GUIDED.announcement),
      "guided announcement on every call"
    );
  }
  assert.ok(calls[0].userText.includes("first move"), "turn 1 has nothing to carry");
  assert.ok(calls[1].userText.includes("Purpose: squeeze Blue."));
  assert.ok(calls[2].userText.includes("Purpose: squeeze Blue."));
  assert.ok(calls[2].userText.includes("Purpose: seal row 4."));
  await agent.dispose?.();
});

test("guided agent: a note the referee rejected is never carried", async () => {
  const { agent, calls } = guidedAgent([
    "Rejected reasoning: I will rush the flank.",
    MOVE,
    `Note from a turn that will be lost.\n${MOVE}`,
    `Fresh thinking.\n${MOVE}`,
  ]);
  await agent.startGame?.("A", "game-000");

  await agent.act(turnInput({ ply: 0, attempt: 1 }));
  await agent.act(turnInput({ ply: 0, attempt: 2, error: { code: "E_BAD_FORMAT" } }));

  const afterAdoption = await agent.act(
    turnInput({ ply: 2, recent: [ownMove(0), theirMove(1)] })
  );
  assert.equal((afterAdoption.meta as any)?.notes_carried, 0);
  assert.ok(!calls[2].userText.includes("Rejected reasoning"));

  const afterPass = await agent.act(
    turnInput({ ply: 4, recent: [ownPass(2), theirMove(3)] })
  );
  assert.equal((afterPass.meta as any)?.notes_carried, 0);
  assert.ok(!calls[3].userText.includes("Note from a turn that will be lost."));
  await agent.dispose?.();
});

test("memo and guided notes cannot be configured together", () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-guided-excl-"));
  try {
    assert.throws(
      () =>
        codexCliAgent({
          model: "gpt-5.6-sol",
          memo: new MemoSession(runDir),
          notes: new NotesSession(NOTES_GUIDED),
          runner: async () => ({ stdout: "", stderr: "", code: 0, timedOut: false }),
        }),
      /mutually exclusive/
    );
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Turn-scoped conditions refuse ambient execution (undeclared-carryover guard)
// ---------------------------------------------------------------------------

test("guided specs refuse --ambient-cli-env on either side (fail-closed)", async () => {
  const { assertTurnScopedCleanRoom } = await import("../src/cli");
  const { MatchPreflightError } = await import("../src/playerrors");

  assert.throws(
    () => assertTurnScopedCleanRoom("ambient", SPEC, "random"),
    MatchPreflightError
  );
  assert.throws(
    () => assertTurnScopedCleanRoom("ambient", "random", SPEC),
    MatchPreflightError
  );
  assert.doesNotThrow(() => assertTurnScopedCleanRoom("clean-room", SPEC, "random"));
});
