import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { codexCliAgent } from "../src/agents/cli";
import { MemoSession } from "../src/agents/memo";
import {
  NOTES_ANNOUNCEMENT,
  NOTES_HARNESS_REVISION,
  NotesSession,
  notesTurnPrelude,
} from "../src/agents/notes";
import { randomAgent } from "../src/agents/random";
import { parseAgentSpec } from "../src/catalog";
import { newGame } from "../src/engine";
import { extractMove, recordedNote } from "../src/prompt";
import { MAX_COMMENTARY_SCALARS } from "../src/publicarena-contract";
import { classifyRunnableAgentSpec } from "../src/publicgames";
import { playGame } from "../src/runner";
import type { Agent, RecentEvent, TurnInput } from "../src/types";

const MOVE = '{"move":{"from":{"row":0,"col":0},"to":{"row":0,"col":3}}}';

// ---------------------------------------------------------------------------
// The announcement: the ONLY intervention, and it must stay shape-free
// ---------------------------------------------------------------------------

/**
 * The contrast this harness exists to draw is "raw accumulation (notes) vs
 * designed memory (memo)". A single hint about how to write the note would
 * make the arm a weaker memo instead, so the announcement is guarded token by
 * token rather than by a reviewer's memory.
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

test("the announcement addresses the future self and hints at no shape whatsoever", () => {
  // What it MUST say: these are your own past notes, this one is your only
  // memory, write it for your future self.
  assert.match(NOTES_ANNOUNCEMENT, /future self/i);
  assert.match(NOTES_ANNOUNCEMENT, /only memory/i);
  assert.match(NOTES_ANNOUNCEMENT, /past moves/i);

  // What it must NOT say, in the announcement or in the harness-authored part
  // of the injected block.
  for (const guarded of [NOTES_ANNOUNCEMENT, notesTurnPrelude([])]) {
    const lowered = guarded.toLowerCase();
    for (const token of SHAPE_DENYLIST) {
      assert.ok(
        !lowered.includes(token.toLowerCase()),
        `notes text must not hint at "${token}"`
      );
    }
  }
});

test("the injected block shows the notes themselves, oldest ply first", () => {
  const empty = notesTurnPrelude([]);
  assert.ok(empty.includes(NOTES_ANNOUNCEMENT));
  assert.ok(empty.includes("first move"));

  const filled = notesTurnPrelude([
    { ply: 0, note: "opened the center" },
    { ply: 2, note: "traded on the diagonal" },
  ]);
  assert.ok(filled.indexOf("opened the center") < filled.indexOf("traded on the diagonal"));
  assert.ok(filled.includes("[ply 0]"));
  assert.ok(filled.includes("[ply 2]"));
});

// ---------------------------------------------------------------------------
// The equality: what is carried IS what the spectator record shows
// ---------------------------------------------------------------------------

/** An agent whose reply text is scripted per attempt (movenote.test.ts shape). */
function scripted(name: string, reply: (attempt: number) => string): Agent {
  return {
    name,
    act(input) {
      const raw = reply(input.attempt);
      const move = input.attempt === 1 && !extractMove(raw) ? null : input.legal[0];
      return { move, raw };
    },
  };
}

test("recordedNote truncates in scalars and equals what the runner records", async () => {
  // Astral scalars: each is one scalar but two UTF-16 units, so a String.slice
  // cap would keep half as many and could cut a surrogate pair in half.
  const raw = `${"🜂".repeat(MAX_COMMENTARY_SCALARS + 17)}\n${MOVE}`;
  const expected = recordedNote(raw);
  assert.equal([...expected].length, MAX_COMMENTARY_SCALARS);
  assert.equal(expected, "🜂".repeat(MAX_COMMENTARY_SCALARS));
  assert.notEqual(
    expected,
    raw.slice(0, MAX_COMMENTARY_SCALARS),
    "a UTF-16 slice is a different (broken) string — the two must not agree by accident"
  );

  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-notes-eq-"));
  try {
    await playGame({
      gameId: "game-000",
      runDir,
      seed: 11,
      maxPlies: 2,
      agents: { A: scripted("astral", () => raw), B: randomAgent(3) },
    });
    const move = fs
      .readFileSync(path.join(runDir, "games/game-000/events.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((e) => e.t === "move");
    assert.equal(move.note, expected, "the carried note IS the published note");
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("the runner records its move note through recordedNote, with no truncation site of its own", () => {
  // Source-level drift guard (same discipline as the CLI help-interpolation
  // guard): the equality is only constructive while there is ONE cap.
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "runner.ts"),
    "utf8"
  );
  assert.ok(
    source.includes("recordedNote(reply.raw"),
    "runner must derive the move note from the shared function"
  );
  assert.ok(
    !source.includes("MAX_COMMENTARY_SCALARS"),
    "runner must not carry a second scalar truncation"
  );
});

// ---------------------------------------------------------------------------
// NotesSession lifecycle: the referee decides what survives
// ---------------------------------------------------------------------------

const ownMove = (ply: number): RecentEvent => ({ ply, color: "Red", action: "move" });
const ownPass = (ply: number): RecentEvent => ({ ply, color: "Red", action: "pass" });
const theirMove = (ply: number): RecentEvent => ({ ply, color: "Blue", action: "move" });

test("NotesSession commits on an adopted move and discards on a pass", () => {
  const session = new NotesSession();
  session.startGame("A", "game-000");
  assert.deepEqual(session.prelude().count, 0);

  session.stage(`Opening the center.\n${MOVE}`, 0);
  // Still undecided while the turn is open (a repair attempt re-enters act()
  // with the same recent list).
  session.resolve([]);
  assert.equal(session.prelude().count, 0);

  session.resolve([ownMove(0), theirMove(1)]);
  assert.equal(session.prelude().count, 1);
  assert.ok(session.prelude().text.includes("Opening the center."));

  // A lost turn (both attempts failed, or a timeout) carries nothing.
  session.stage(`Trying a pincer.\n${MOVE}`, 2);
  session.resolve([ownPass(2), theirMove(3)]);
  assert.equal(session.prelude().count, 1);
  assert.ok(!session.prelude().text.includes("Trying a pincer."));

  // The committed journal is append-only: the surviving note stays and the
  // next adopted move is added after it.
  session.stage(`Holding row 4.\n${MOVE}`, 4);
  session.resolve([ownMove(4)]);
  const { text, count } = session.prelude();
  assert.equal(count, 2);
  assert.ok(text.indexOf("Opening the center.") < text.indexOf("Holding row 4."));

  // A new game starts from nothing.
  session.startGame("B", "game-001");
  assert.equal(session.prelude().count, 0);
  assert.ok(session.prelude().text.includes("first move"));
});

test("a re-stage at the same ply always replaces, so a rejected note cannot survive", () => {
  const session = new NotesSession();
  session.startGame("A", "game-000");

  // Attempt 1 is rejected (no move JSON), attempt 2 is adopted.
  session.stage("Rejected idea: rush the flank.", 0);
  session.stage(`Adopted: seal row 4.\n${MOVE}`, 0);
  session.resolve([ownMove(0)]);
  const first = session.prelude();
  assert.equal(first.count, 1);
  assert.ok(first.text.includes("Adopted: seal row 4."));
  assert.ok(!first.text.includes("Rejected idea"));

  // The regression: attempt 1 wrote a note, the ADOPTED attempt 2 wrote none.
  // The empty stage must replace the rejected text, and an empty note is never
  // committed — so this move contributes nothing rather than the rejected note.
  session.stage("Rejected reasoning about a move I will not make.", 2);
  session.stage(MOVE, 2);
  session.resolve([ownMove(2)]);
  const second = session.prelude();
  assert.equal(second.count, 1, "an empty note is never committed");
  assert.ok(!second.text.includes("Rejected reasoning"));
});

test("an empty note clears the stage without ever being injected", () => {
  const session = new NotesSession();
  session.startGame("A", "game-000");
  session.stage(MOVE, 0);
  session.resolve([ownMove(0)]);
  assert.equal(session.prelude().count, 0);
  assert.ok(session.prelude().text.includes("first move"));
});

test("the harness revision is declared", () => {
  assert.equal(NOTES_HARNESS_REVISION, "notes-v1");
});

// ---------------------------------------------------------------------------
// Spec identity
// ---------------------------------------------------------------------------

test("codex-cli-notes parses as its own harness and never as codex-cli", () => {
  const parsed = parseAgentSpec("codex-cli-notes:gpt-5.6-sol@medium");
  assert.equal(parsed.harness, "codex-cli-notes");
  assert.equal(parsed.model, "gpt-5.6-sol");
  assert.equal(parsed.effort, "medium");
  assert.deepEqual(classifyRunnableAgentSpec("codex-cli-notes:gpt-5.6-sol@medium"), {
    kind: "codex-cli-notes",
    model: "gpt-5.6-sol",
    effort: "medium",
    latency: "measured",
  });
  // The plain persistent spec is untouched by the longer prefix.
  assert.equal(parseAgentSpec("codex-cli:gpt-5.6-sol@medium").harness, "codex-cli");
  assert.equal(
    classifyRunnableAgentSpec("codex-cli:gpt-5.6-sol@medium")?.kind,
    "codex-cli"
  );
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

/** A notes agent driven by a scripted reply queue. */
function notesAgent(replies: string[]) {
  const calls: { argv: string[]; userText: string }[] = [];
  const agent = codexCliAgent({
    model: "gpt-5.6-sol",
    effort: "medium",
    notes: new NotesSession(),
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
  return { agent, calls };
}

test("notes agent: fresh exec every turn, adopted notes accumulate, meta counts what was injected", async () => {
  const { agent, calls } = notesAgent([
    `Opening the center to squeeze Blue.\n${MOVE}`,
    `Blue took the diagonal, so I seal row 4.\n${MOVE}`,
    `Consolidating.\n${MOVE}`,
  ]);
  assert.equal(agent.name, "codex-cli-notes:gpt-5.6-sol@medium");
  await agent.startGame?.("A", "game-000");

  const first = await agent.act(turnInput({ ply: 0 }));
  assert.ok(first.move, "move must parse");
  assert.equal((first.meta as any)?.notes_carried, 0);

  const second = await agent.act(
    turnInput({ ply: 2, recent: [ownMove(0), theirMove(1)] })
  );
  assert.equal((second.meta as any)?.notes_carried, 1);

  const third = await agent.act(
    turnInput({ ply: 4, recent: [ownMove(2), theirMove(3)] })
  );
  assert.equal((third.meta as any)?.notes_carried, 2);

  for (const call of calls) {
    assert.ok(!call.argv.includes("resume"), "must never resume a thread");
    assert.ok(call.userText.includes("LAPLACE"), "instructions resent every turn");
    assert.ok(call.userText.includes(NOTES_ANNOUNCEMENT), "announcement every turn");
  }
  assert.ok(calls[0].userText.includes("first move"), "turn 1 has nothing to carry");
  assert.ok(calls[1].userText.includes("Opening the center to squeeze Blue."));
  assert.ok(calls[2].userText.includes("Opening the center to squeeze Blue."));
  assert.ok(calls[2].userText.includes("Blue took the diagonal, so I seal row 4."));
  await agent.dispose?.();
});

test("notes agent: a note the referee rejected is never carried", async () => {
  const { agent, calls } = notesAgent([
    // ply 0 attempt 1: no move JSON — the referee will reject this reply.
    "Rejected reasoning: I will rush the flank.",
    // ply 0 attempt 2: adopted, and it carries NO note of its own.
    MOVE,
    // ply 2: adopted with a note, but the turn is later lost as a pass.
    `Note from a turn that will be lost.\n${MOVE}`,
    // ply 4
    `Fresh thinking.\n${MOVE}`,
  ]);
  await agent.startGame?.("A", "game-000");

  await agent.act(turnInput({ ply: 0, attempt: 1 }));
  await agent.act(turnInput({ ply: 0, attempt: 2, error: { code: "E_BAD_FORMAT" } }));

  // The adopted attempt wrote nothing, so nothing carries — and above all the
  // rejected attempt's note does not sneak through in its place.
  const afterAdoption = await agent.act(
    turnInput({ ply: 2, recent: [ownMove(0), theirMove(1)] })
  );
  assert.equal((afterAdoption.meta as any)?.notes_carried, 0);
  assert.ok(!calls[2].userText.includes("Rejected reasoning"));
  assert.ok(calls[2].userText.includes("first move"));

  // ply 2 ended as a pass (two failures or a timeout): its note is discarded.
  const afterPass = await agent.act(
    turnInput({ ply: 4, recent: [ownPass(2), theirMove(3)] })
  );
  assert.equal((afterPass.meta as any)?.notes_carried, 0);
  assert.ok(!calls[3].userText.includes("Note from a turn that will be lost."));
  await agent.dispose?.();
});

test("notes agent: timeout and CLI-error diagnostics are staged but dissolve at the pass", async () => {
  const calls: { userText: string }[] = [];
  let mode: "timeout" | "cli-error" | "ok" = "timeout";
  const agent = codexCliAgent({
    model: "gpt-5.6-sol",
    notes: new NotesSession(),
    runner: async (_cmd, argv) => {
      calls.push({ userText: argv[argv.length - 1] });
      return {
        stdout: mode === "ok" ? codexReply(`Recovered.\n${MOVE}`) : "",
        stderr: "boom",
        code: mode === "cli-error" ? 1 : 0,
        timedOut: false,
      };
    },
  });
  await agent.startGame?.("A", "game-000");

  const timedOut = await agent.act(
    turnInput({ ply: 0, deadlineAtMs: Date.now() - 1 })
  );
  assert.equal(timedOut.timedOut, true);
  assert.equal((timedOut.meta as any)?.notes_carried, 0);

  mode = "cli-error";
  const errored = await agent.act(
    turnInput({ ply: 2, recent: [ownPass(0), theirMove(1)] })
  );
  assert.equal(errored.move, null);
  assert.ok(errored.raw?.startsWith("CLI_ERROR"));
  assert.equal((errored.meta as any)?.notes_carried, 0);

  mode = "ok";
  const recovered = await agent.act(
    turnInput({ ply: 4, recent: [ownPass(2), theirMove(3)] })
  );
  assert.equal((recovered.meta as any)?.notes_carried, 0);
  for (const call of calls) {
    assert.ok(!call.userText.includes("TURN_TIMEOUT"), "no diagnostic ever carried");
    assert.ok(!call.userText.includes("CLI_ERROR"), "no diagnostic ever carried");
  }

  // And the recovered move's own note is carried once the referee adopts it.
  const next = await agent.act(
    turnInput({ ply: 6, recent: [ownMove(4), theirMove(5)] })
  );
  assert.equal((next.meta as any)?.notes_carried, 1);
  assert.ok(calls[3].userText.includes("Recovered."));
  await agent.dispose?.();
});

test("memo and notes cannot be configured together", () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-notes-excl-"));
  try {
    assert.throws(
      () =>
        codexCliAgent({
          model: "gpt-5.6-sol",
          memo: new MemoSession(runDir),
          notes: new NotesSession(),
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

test("notes specs refuse --ambient-cli-env on either side (fail-closed)", async () => {
  const { assertTurnScopedCleanRoom } = await import("../src/cli");
  const { MatchPreflightError } = await import("../src/playerrors");

  assert.throws(
    () =>
      assertTurnScopedCleanRoom(
        "ambient",
        "codex-cli-notes:gpt-5.6-sol@medium",
        "random"
      ),
    MatchPreflightError
  );
  assert.throws(
    () =>
      assertTurnScopedCleanRoom(
        "ambient",
        "random",
        "codex-cli-notes:gpt-5.6-sol@medium"
      ),
    MatchPreflightError
  );
  assert.doesNotThrow(() =>
    assertTurnScopedCleanRoom(
      "clean-room",
      "codex-cli-notes:gpt-5.6-sol@medium",
      "random"
    )
  );
});
