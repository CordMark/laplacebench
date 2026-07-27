import assert from "node:assert/strict";
import test from "node:test";
import { cleanReplayMeta } from "../src/publicreplay-meta";

const stat = (agent: string, turns: number) => ({
  agent,
  turns,
  moves: turns,
  formatFailures: 0,
  legalityFailures: 0,
  failedTurns: 0,
  timeoutSkips: 0,
  tokenBudgetSkips: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  avgLatencyMs: 0,
});

const valid = () => ({
  replayed: {
    plies: 1,
    reason: "center",
    turns: { A: 1, B: 0 },
    failures: { A: { format: 0, legality: 0 }, B: { format: 0, legality: 0 } },
  },
  stats: { A: stat("model-a", 1), B: stat("model-b", 0) },
  failures: [{ ply: 0, attempt: 1, kind: "format", team: "A" }],
  commentary: [{ ply: 0, team: "A", color: "Red", text: "reasoning" }],
});

const expected = { teamA: "model-a", teamB: "model-b", plies: 1, reason: "center" as const };

test("public replay metadata is emitted with only exact bounded v1 fields", () => {
  const raw = valid();
  const clean = cleanReplayMeta(raw, expected);
  assert.equal(clean.commentary[0].text, "reasoning");
  assert.deepEqual(clean.summary.A, { format: 0, legality: 0, timeout: 0, token_budget: 0 });
});

test("commentary distinguishes a natural file label from an actual file URI", () => {
  const prose: any = valid();
  prose.commentary[0].text = "Yellow set a trap on my back file: if I sit still, the piece falls.";
  assert.equal(cleanReplayMeta(prose, expected).commentary[0].text, prose.commentary[0].text);

  const terminal: any = valid();
  terminal.commentary[0].text = "I am guarding the back file:";
  assert.equal(cleanReplayMeta(terminal, expected).commentary[0].text, terminal.commentary[0].text);

  for (const text of [
    "file:secret", "file:C:secret", "file:?q", "file:#fragment", "file:%2Fetc",
    "file:///etc/passwd", "file:relative/path", String.raw`file:C:\secret`,
  ]) {
    const commentary: any = valid();
    commentary.commentary[0].text = text;
    assert.throws(() => cleanReplayMeta(commentary, expected), /commentary content boundary/);
  }
});

test("public replay metadata rejects unknown fields, coercible counts, and impossible entries", () => {
  const unknown: any = valid();
  unknown.stats.A.rate = 0;
  assert.throws(() => cleanReplayMeta(unknown, expected), /missing or unknown/);

  const coercible: any = valid();
  coercible.stats.A.turns = "1";
  assert.throws(() => cleanReplayMeta(coercible, expected), /must be a number/);

  const attempt: any = valid();
  attempt.failures[0].attempt = 3;
  assert.throws(() => cleanReplayMeta(attempt, expected), /is invalid/);

  const turns: any = valid();
  turns.replayed.turns.A = 0;
  assert.throws(() => cleanReplayMeta(turns, expected), /differ from plies/);

  for (const text of ["x".repeat(2_501), "<script>", "https://example.test", "javascript:alert(1)"]) {
    const commentary: any = valid();
    commentary.commentary[0].text = text;
    assert.throws(() => cleanReplayMeta(commentary, expected), /commentary content boundary/);
  }
});
