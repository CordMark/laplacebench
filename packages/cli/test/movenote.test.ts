import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { randomAgent } from "../src/agents/random";
import { PROMPT_REV, extractMove, extractNote } from "../src/prompt";
import { moveCommentary, exportGame } from "../src/exportweb";
import { MAX_COMMENTARY_SCALARS } from "../src/publicarena-contract";
import { playGame } from "../src/runner";
import type { Agent } from "../src/types";

const MOVE = '{"move":{"from":{"row":0,"col":0},"to":{"row":0,"col":3}}}';

/** An agent whose reply text is scripted per attempt. */
function scripted(name: string, reply: (attempt: number) => string): Agent {
  return {
    name,
    act(input) {
      const raw = reply(input.attempt);
      const move = input.attempt === 1 && !extractMove(raw)
        ? null
        : input.legal[0];
      return { move, raw };
    },
  };
}

async function playWith(agentA: Agent, maxPlies: number) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-note-"));
  const result = await playGame({
    gameId: "game-000",
    runDir,
    seed: 11,
    maxPlies,
    agents: { A: agentA, B: randomAgent(3) },
  });
  return { runDir, result };
}

test("the note is everything the model wrote that was not the adopted move", () => {
  assert.equal(
    extractNote(`Blue took the center, so I seal row 4.\n\n${MOVE}`),
    "Blue took the center, so I seal row 4."
  );
  // The compliance signal: the model was asked and wrote nothing but the move.
  assert.equal(extractNote(MOVE), "");
  assert.equal(extractNote(`  ${MOVE}  `), "");
  assert.equal(extractNote("   "), "");
  // Prose after the JSON is unusual but is still the model's own words.
  assert.equal(
    extractNote(`Sealing row 4.\n${MOVE}\nI will follow up on (4,5).`),
    "Sealing row 4.\nI will follow up on (4,5)."
  );
  // Only the span actually adopted as the move is removed. An earlier object
  // that is not a move stays in the note rather than being silently eaten.
  assert.equal(
    extractNote(`Considered {"idea":"rush"} first.\n${MOVE}`),
    'Considered {"idea":"rush"} first.'
  );
  // A fenced block is prose as far as the note is concerned.
  const fenced = "```\nplan: pincer at (4,5)\n```\n" + MOVE;
  assert.equal(extractNote(fenced), "```\nplan: pincer at (4,5)\n```");
});

test("when two move objects appear, note and move agree on which one was adopted", () => {
  const first = '{"move":{"from":{"row":1,"col":1},"to":{"row":1,"col":2}}}';
  const text = `First idea ${first} but actually ${MOVE}`;
  // extractMove takes the LAST valid move...
  assert.deepEqual(extractMove(text), {
    from: { row: 0, col: 0 },
    to: { row: 0, col: 3 },
  });
  // ...so the note keeps the earlier one and drops exactly the adopted span.
  assert.equal(extractNote(text), `First idea ${first} but actually`);
});

test("commentary is chosen by whether the log carries a note at all", () => {
  // A log from before the note was required: raw is all there is, and dropping
  // it would erase the commentary of already-published games.
  assert.equal(moveCommentary({ raw: `Sealing row 4.\n${MOVE}` }), `Sealing row 4.\n${MOVE}`);
  // Note present and non-empty: publish the note, move JSON already removed.
  assert.equal(moveCommentary({ raw: `Sealing row 4.\n${MOVE}`, note: "Sealing row 4." }), "Sealing row 4.");
  // Note present and empty: the model was required to write one and did not.
  // Publishing raw here would present the bare move JSON as its reasoning.
  assert.equal(moveCommentary({ raw: MOVE, note: "" }), "");
  assert.equal(moveCommentary({ raw: MOVE, note: "   " }), "");
  // No reply text at all.
  assert.equal(moveCommentary({}), "");
  // A log that HAS the field but carries something unusable fails closed:
  // falling through to raw here would publish the bare move JSON.
  assert.equal(moveCommentary({ raw: MOVE, note: null }), "");
  assert.equal(moveCommentary({ raw: MOVE, note: 42 }), "");
});

test("the prompt generation names the note requirement, and the log records it", async () => {
  assert.equal(PROMPT_REV, "p3-move-note");
  const { runDir } = await playWith(scripted("noted", () => `Opening.\n${MOVE}`), 2);
  try {
    const start = fs.readFileSync(path.join(runDir, "games/game-000/events.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((line) => JSON.parse(line))
      .find((event) => event.t === "game_start");
    assert.equal(start.prompt_rev, "p3-move-note");
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("a missing note is counted against adopted moves and never costs the turn", async () => {
  // Writes only the move JSON: compliant as a move, silent as a note.
  const { runDir, result } = await playWith(scripted("silent", () => MOVE), 4);
  try {
    const a = result.teams.A;
    assert.ok(a.moves > 0);
    assert.equal(a.noteOmissions, a.moves, "every adopted move lacked a note");
    assert.equal(a.failedTurns, 0, "a missing note must not fail the turn");
    assert.equal(a.formatFailures, 0);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("a reply discarded by a format failure enters neither numerator nor denominator", async () => {
  // Attempt 1 is unparseable (no move, no note), attempt 2 carries both.
  const { runDir, result } = await playWith(
    scripted("repairing", (attempt) => (attempt === 1 ? "I am thinking." : `Recovered.\n${MOVE}`)),
    2
  );
  try {
    const a = result.teams.A;
    assert.ok(a.formatFailures > 0, "the discarded reply is owned by the failure metric");
    assert.equal(a.noteOmissions, 0, "only adopted replies are judged for a note");
    assert.equal(a.moves, 1);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("a note longer than the publishable limit is still recorded and still exports", async () => {
  const long = "x".repeat(MAX_COMMENTARY_SCALARS + 500);
  const { runDir } = await playWith(scripted("verbose", () => `${long}\n${MOVE}`), 2);
  try {
    const exported = exportGame(runDir, "game-000") as unknown as {
      meta: { commentary: { text: string }[] };
    };
    const entry = exported.meta.commentary[0];
    assert.ok(entry, "a compliant long note must still produce commentary");
    assert.ok(
      Array.from(entry.text).length <= MAX_COMMENTARY_SCALARS,
      "the recorded note must already fit what publication accepts"
    );
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("truncation counts scalars, so an astral note is never cut short or split", async () => {
  // Every emoji is one scalar but two UTF-16 units: a String.slice cap would
  // keep only half of them, and could cut between the surrogates.
  const note = "🜂".repeat(MAX_COMMENTARY_SCALARS - 1);
  const { runDir } = await playWith(scripted("astral", () => `${note}\n${MOVE}`), 2);
  try {
    const exported = exportGame(runDir, "game-000") as unknown as {
      meta: { commentary: { text: string }[] };
    };
    const text = exported.meta.commentary[0]!.text;
    assert.equal(Array.from(text).length, MAX_COMMENTARY_SCALARS - 1);
    assert.equal(text, note, "no surrogate pair was split and nothing was lost");
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("an empty p3 note yields no commentary entry rather than the bare move JSON", async () => {
  const { runDir } = await playWith(scripted("silent", () => MOVE), 4);
  try {
    const exported = exportGame(runDir, "game-000") as unknown as {
      meta: { commentary: { team: string }[] };
    };
    assert.equal(
      exported.meta.commentary.filter((entry) => entry.team === "A").length,
      0,
      "silence must publish nothing, not the move JSON"
    );
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});
