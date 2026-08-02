import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { NotesSession } from "../src/agents/notes";
import { randomAgent } from "../src/agents/random";
import {
  extractMove,
  publishableNote,
  recordedNote,
  recordedNoteWithCause,
} from "../src/prompt";
import {
  COMMENTARY_URI_SOURCE,
  assertCommentaryText,
} from "../src/publicarena-contract";
import { buildPublicReplay } from "../src/publicreplay";
import { playGame } from "../src/runner";
import type { Agent, RecentEvent } from "../src/types";

/**
 * docs/plans/2026-08-02-publishable-note.md — "recorded implies publishable"
 * is made CONSTRUCTIVE here. The validator in publicarena-contract.ts keeps
 * its exact semantics and becomes a backstop that should never fire.
 */

const MOVE = '{"move":{"from":{"row":0,"col":0},"to":{"row":0,"col":3}}}';

// ---------------------------------------------------------------------------
// publishableNote: the transform itself
// ---------------------------------------------------------------------------

test("publishableNote turns board arrows into arrows and defuses the rest", () => {
  // The overwhelmingly common case: models write moves as ASCII arrows.
  assert.equal(publishableNote("(0,3)->(3,3) seals the file"), "(0,3)→(3,3) seals the file");
  assert.equal(publishableNote("Blue <- Red retreats"), "Blue ← Red retreats");
  assert.equal(
    publishableNote("a->b and c<-d and a->b"),
    "a→b and c←d and a→b",
    "every occurrence is rewritten, not just the first"
  );

  // Whatever angle brackets remain become their guillemet look-alikes.
  assert.equal(publishableNote("value < 3 and 4 > 2"), "value ‹ 3 and 4 › 2");

  // Tag-shaped text is defused by the same rule, without anyone deciding
  // whether it was "really" markup.
  for (const [input, expected] of [
    ["<a href=x>", "‹a href=x›"],
    ["</script>", "‹/script›"],
    // Arrows are rewritten FIRST, so the trailing "->" of an HTML comment
    // becomes the arrow. The order is fixed and deterministic; what matters is
    // that nothing tag-shaped survives.
    ["<!-- comment -->", "‹!-- comment -→"],
    ["<script>alert(1)</script>", "‹script›alert(1)‹/script›"],
  ] as const) {
    assert.equal(publishableNote(input), expected);
  }

  // Nothing to do is a no-op, including the empty string.
  assert.equal(publishableNote(""), "");
  assert.equal(publishableNote("Sealing row 4 with the yellow rook."), "Sealing row 4 with the yellow rook.");
});

test("publishableNote is idempotent and can never emit an angle bracket", () => {
  const samples = [
    "(0,3)->(3,3)",
    "<-",
    "->",
    "<->",
    "<<-->>",
    "a < b -> c > d",
    "<script>x</script>",
    "<<<",
    ">>>",
    "-->",
    "<!--",
    "plain prose with no brackets",
    "",
  ];
  for (const sample of samples) {
    const once = publishableNote(sample);
    assert.equal(publishableNote(once), once, `f(f(x)) must equal f(x) for ${JSON.stringify(sample)}`);
    // The postcondition the whole design rests on.
    assert.ok(!once.includes("<"), `output must not contain "<" for ${JSON.stringify(sample)}`);
    assert.ok(!once.includes(">"), `output must not contain ">" for ${JSON.stringify(sample)}`);
    // And therefore the angle-bracket half of the validator can never fire.
    assert.doesNotThrow(() => assertCommentaryText(once || "x", "sample"));
  }
});

// ---------------------------------------------------------------------------
// URI pattern parity: the constant moved, the semantics did not
// ---------------------------------------------------------------------------

/** The literal that lived in publicarena-contract.ts before the extraction. */
const LEGACY_UNSAFE_COMMENTARY =
  /[<>]|\b(?:https?|ftp|data|javascript|mailto):|\bfile:(?=\S)/iu;

const ASSEMBLED_UNSAFE_COMMENTARY = new RegExp(`[<>]|${COMMENTARY_URI_SOURCE}`, "iu");

test("the assembled commentary pattern is byte-identical to the literal it replaced", () => {
  assert.equal(ASSEMBLED_UNSAFE_COMMENTARY.source, LEGACY_UNSAFE_COMMENTARY.source);
  assert.equal(ASSEMBLED_UNSAFE_COMMENTARY.flags, LEGACY_UNSAFE_COMMENTARY.flags);
});

test("old and new agree on every scheme, on the file: lookahead, and on prose", () => {
  const cases = [
    // Every scheme the boundary names, plus case-insensitivity.
    "see https://example.test/x",
    "http://example.test",
    "ftp://files.example.test",
    "data:text/html;base64,AAAA",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "mailto:someone@example.test",
    "MAILTO:someone@example.test",
    // file: with a non-whitespace continuation — URI-shaped, fail-closed.
    "file:secret",
    "file:C:secret",
    "file:?q",
    "file:#fragment",
    "file:%2Fetc",
    "file:///etc/passwd",
    "file:relative/path",
    String.raw`file:C:\secret`,
    // ...and the prose-safe cases the lookahead exists for.
    "Yellow set a trap on my back file: if I sit still, the piece falls.",
    "I am guarding the back file:",
    "the back file:\nnext line",
    // Ordinary commentary, and near-misses that must stay allowed.
    "Sealing row 4.",
    "profile:the shape of the position",
    "(0,3)→(3,3)",
    "",
  ];
  for (const text of cases) {
    assert.equal(
      ASSEMBLED_UNSAFE_COMMENTARY.test(text),
      LEGACY_UNSAFE_COMMENTARY.test(text),
      `verdict must not change for ${JSON.stringify(text)}`
    );
  }
});

// ---------------------------------------------------------------------------
// The canonical derivation
// ---------------------------------------------------------------------------

test("recordedNoteWithCause suppresses a URI note to empty and names the cause", () => {
  const arrows = recordedNoteWithCause(`(0,3)->(3,3) seals the file.\n${MOVE}`);
  assert.deepEqual(arrows, { note: "(0,3)→(3,3) seals the file.", suppressed: null });

  const uri = recordedNoteWithCause(`I checked https://example.test for openings.\n${MOVE}`);
  assert.deepEqual(uri, { note: "", suppressed: "uri" });

  // Silence is an omission, not a suppression.
  assert.deepEqual(recordedNoteWithCause(MOVE), { note: "", suppressed: null });

  // recordedNote is exactly the note half.
  assert.equal(recordedNote(`(0,3)->(3,3).\n${MOVE}`), "(0,3)→(3,3).");
  assert.equal(recordedNote(`See https://example.test.\n${MOVE}`), "");

  // Prose that merely looks like a file URI is untouched (the lookahead).
  const prose = "Yellow set a trap on my back file: if I sit still, the piece falls.";
  assert.deepEqual(recordedNoteWithCause(`${prose}\n${MOVE}`), {
    note: prose,
    suppressed: null,
  });
});

// ---------------------------------------------------------------------------
// The recording path through the runner
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

async function playWith(agentA: Agent, maxPlies: number) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-publishable-"));
  const result = await playGame({
    gameId: "game-000",
    runDir,
    seed: 11,
    maxPlies,
    agents: { A: agentA, B: randomAgent(3) },
  });
  const moves = fs
    .readFileSync(path.join(runDir, "games/game-000/events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.t === "move" && event.player === 1);
  return { runDir, result, moves };
}

test("an arrow note is recorded as an arrow and passes the publication boundary", async () => {
  const { runDir, result, moves } = await playWith(
    scripted("arrows", () => `Pushing (0,3)->(3,3); Blue <- must answer.\n${MOVE}`),
    2
  );
  try {
    const note = moves[0].note;
    assert.equal(note, "Pushing (0,3)→(3,3); Blue ← must answer.");
    assert.ok(!("note_suppressed" in moves[0]), "an arrow note is not a suppression");
    assert.doesNotThrow(() => assertCommentaryText(note, "recorded"));
    assert.equal(result.teams.A.noteOmissions, 0);
    assert.equal(result.teams.A.noteSuppressed, 0);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("a URI note is recorded empty with its cause, and counts ONLY as a suppression", async () => {
  const { runDir, result, moves } = await playWith(
    scripted("linky", () => `My plan is at https://example.test/plan.\n${MOVE}`),
    4
  );
  try {
    const a = result.teams.A;
    assert.ok(a.moves > 0);
    for (const move of moves) {
      assert.equal(move.note, "", "the unpublishable note is suppressed to empty");
      assert.equal(move.note_suppressed, "uri", "and the cause is recorded on the event");
      // The verbatim reply is untouched: nothing is lost for audit.
      assert.ok(String(move.raw).includes("https://example.test/plan"));
    }
    assert.equal(a.noteSuppressed, a.moves);
    assert.equal(a.noteOmissions, 0, "suppression is NOT an omission — the counters are exclusive");
    assert.equal(a.failedTurns, 0, "an unpublishable note never costs the turn");
    assert.equal(a.formatFailures, 0);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("an empty note is an omission only, and never a suppression", async () => {
  const { runDir, result, moves } = await playWith(scripted("silent", () => MOVE), 4);
  try {
    const a = result.teams.A;
    assert.ok(a.moves > 0);
    assert.equal(a.noteOmissions, a.moves);
    assert.equal(a.noteSuppressed, 0);
    for (const move of moves) {
      assert.equal(move.note, "");
      assert.ok(!("note_suppressed" in move), "silence carries no cause field");
    }
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("an ordinary note is recorded unchanged and moves neither counter", async () => {
  const plain = "Blue took the center, so I seal row 4 and keep the yellow rook home.";
  const { runDir, result, moves } = await playWith(
    scripted("plain", () => `${plain}\n${MOVE}`),
    2
  );
  try {
    assert.equal(moves[0].note, plain);
    assert.ok(!("note_suppressed" in moves[0]));
    assert.equal(result.teams.A.noteOmissions, 0);
    assert.equal(result.teams.A.noteSuppressed, 0);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// notes-carry: the equality survives, and a suppressed note is carried nowhere
// ---------------------------------------------------------------------------

const ownMove = (ply: number): RecentEvent => ({ ply, color: "Red", action: "move" });

test("a suppressed note is absent from the carryover as well as from the event", async () => {
  const { runDir, moves } = await playWith(
    scripted("linky", () => `Plan: https://example.test/plan\n${MOVE}`),
    2
  );
  try {
    assert.equal(moves[0].note, "");
    assert.equal(moves[0].note_suppressed, "uri");
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }

  // NotesSession is UNCHANGED by this slice: the derivation returns "", and an
  // empty note is never committed. The URI never reaches a future turn.
  const session = new NotesSession();
  session.startGame("A", "game-000");
  session.stage(`Plan: https://example.test/plan\n${MOVE}`, 0);
  session.resolve([ownMove(0)]);
  const { text, count } = session.prelude();
  assert.equal(count, 0, "an adopted URI note carries nothing forward");
  assert.ok(!text.includes("example.test"));
  assert.ok(text.includes("first move"));
});

test("an arrow note is carried forward byte-identically to what was recorded", async () => {
  const raw = `Pushing (0,3)->(3,3); Blue <- must answer.\n${MOVE}`;
  const { runDir, moves } = await playWith(scripted("arrows", () => raw), 2);
  try {
    const session = new NotesSession();
    session.startGame("A", "game-000");
    session.stage(raw, 0);
    session.resolve([ownMove(0)]);
    const carried = session.prelude();
    assert.equal(carried.count, 1);
    assert.ok(
      carried.text.includes(moves[0].note),
      "the carried note IS the published note, byte for byte"
    );
    assert.equal(moves[0].note, recordedNote(raw));
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Publish-side rescue: buildPublicReplay, the one shared application point
// ---------------------------------------------------------------------------

/**
 * A real recorded run, copied under a short id, with the first move event's
 * note rewritten. This exercises the SAME entry point publicarena.ts and
 * harnesslab.ts both call.
 */
function runWithNote(note: string, runId: string): string {
  const root = path.resolve(__dirname, "../../..");
  const sourceName = fs
    .readdirSync(path.join(root, "community/runs"))
    .find((name) => name.includes("2026-07-27T1032"));
  assert.ok(sourceName, "the fixture run must exist");
  const copy = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "laplace-rescue-")),
    runId
  );
  fs.cpSync(path.join(root, "community/runs", sourceName), copy, { recursive: true });
  const eventsPath = path.join(copy, "games/game-000/events.jsonl");
  const events = fs
    .readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const move = events.find((event) => event.t === "move");
  assert.ok(move);
  move.note = note;
  fs.writeFileSync(eventsPath, `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
  return copy;
}

test("buildPublicReplay rescues an already-recorded arrow note", () => {
  // Runs 12-14 and the memo run were recorded before publishableNote existed:
  // their stored notes still contain "->" and would otherwise be permanently
  // unpublishable. Stored events stay untouched; only the derived commentary
  // is rewritten, idempotently.
  const runDir = runWithNote("Sealing (0,3)->(3,3) before Blue <- answers.", "alice--rescue");
  try {
    const artifact = buildPublicReplay(runDir, "game-000");
    const replay = JSON.parse(artifact.bytes.toString("utf8")) as {
      bench: { commentary: { ply: number; text: string }[] };
    };
    const rescued = replay.bench.commentary[0];
    assert.equal(rescued.text, "Sealing (0,3)→(3,3) before Blue ← answers.");
    // The stored event is NOT rewritten — the rescue is publish-side only.
    const stored = fs
      .readFileSync(path.join(runDir, "games/game-000/events.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((event) => event.t === "move");
    assert.equal(stored.note, "Sealing (0,3)->(3,3) before Blue <- answers.");
  } finally {
    fs.rmSync(path.dirname(runDir), { recursive: true, force: true });
  }
});

test("a note recorded by the current runner is unchanged by the publish-side rewrite", () => {
  const already = recordedNote(`Sealing (0,3)->(3,3).\n${MOVE}`);
  const runDir = runWithNote(already, "alice--idempotent");
  try {
    const artifact = buildPublicReplay(runDir, "game-000");
    const replay = JSON.parse(artifact.bytes.toString("utf8")) as {
      bench: { commentary: { text: string }[] };
    };
    assert.equal(replay.bench.commentary[0].text, already, "double application is a no-op");
  } finally {
    fs.rmSync(path.dirname(runDir), { recursive: true, force: true });
  }
});

test("a historical URI note is NOT rescued — publication still fails loud", () => {
  // Suppression is a recording-time rule. Blanking a stored note at publish
  // time would be rewriting the record, so the backstop fires instead. (No
  // such note exists in the current ledger; this pins the asymmetry.)
  const runDir = runWithNote("My plan is at https://example.test/plan.", "alice--uri");
  try {
    assert.throws(
      () => buildPublicReplay(runDir, "game-000"),
      /commentary content boundary/
    );
  } finally {
    fs.rmSync(path.dirname(runDir), { recursive: true, force: true });
  }
});
