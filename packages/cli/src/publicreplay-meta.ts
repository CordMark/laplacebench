import {
  assertSafeCount,
  assertCommentaryText,
  assertText,
  type EndReason,
  type SideFailures,
  type Team,
} from "./publicarena-contract";

const STAT_KEYS = [
  "turns", "moves", "formatFailures", "legalityFailures", "failedTurns",
  "timeoutSkips", "tokenBudgetSkips", "outputTokens", "cacheReadTokens", "avgLatencyMs",
] as const;
const COLORS = new Set(["Red", "Blue", "Yellow", "Green"]);

type CleanStats = Record<Team, { agent: string } & Record<(typeof STAT_KEYS)[number], number>>;

export interface CleanReplayMeta {
  replayed: {
    plies: number;
    reason: EndReason;
    turns: Record<Team, number>;
    failures: Record<Team, { format: number; legality: number }>;
  };
  stats: CleanStats;
  failures: Array<{
    ply: number;
    attempt: 1 | 2;
    kind: "format" | "legality" | "timeout";
    code?: string;
    team: Team;
  }>;
  commentary: Array<{
    ply: number;
    team: Team;
    color: "Red" | "Blue" | "Yellow" | "Green";
    text: string;
  }>;
  summary: Record<Team, SideFailures>;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, required: string[], optional: string[], field: string): void {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`${field} has missing or unknown fields`);
  }
}

function count(value: unknown, field: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number") throw new Error(`${field} must be a number`);
  const number = value;
  assertSafeCount(number, field, max);
  return number;
}

function cleanStats(raw: unknown, side: Team, expectedAgent: string): CleanStats[Team] {
  const value = record(raw, `bench.stats.${side}`);
  exact(value, ["agent", ...STAT_KEYS], [], `bench.stats.${side}`);
  if (value.agent !== expectedAgent) throw new Error(`bench.stats.${side}.agent differs from the recorded team`);
  assertText(expectedAgent, `bench.stats.${side}.agent`, 256);
  const result = { agent: expectedAgent } as CleanStats[Team];
  for (const key of STAT_KEYS) result[key] = count(value[key], `bench.stats.${side}.${key}`);
  return result;
}

function cleanReplayed(raw: unknown, plies: number, reason: EndReason, stats: CleanStats) {
  const value = record(raw, "bench.replayed");
  exact(value, ["plies", "reason", "turns", "failures"], [], "bench.replayed");
  if (value.plies !== plies || value.reason !== reason) throw new Error("bench.replayed result differs from game_end");
  const turns = record(value.turns, "bench.replayed.turns");
  exact(turns, ["A", "B"], [], "bench.replayed.turns");
  const cleanTurns = { A: count(turns.A, "bench.replayed.turns.A", 100), B: count(turns.B, "bench.replayed.turns.B", 100) };
  if (cleanTurns.A + cleanTurns.B !== plies || cleanTurns.A !== stats.A.turns || cleanTurns.B !== stats.B.turns) {
    throw new Error("bench.replayed turns differ from plies/stats");
  }
  const failures = record(value.failures, "bench.replayed.failures");
  exact(failures, ["A", "B"], [], "bench.replayed.failures");
  const cleanFailures = { A: { format: 0, legality: 0 }, B: { format: 0, legality: 0 } };
  for (const side of ["A", "B"] as const) {
    const item = record(failures[side], `bench.replayed.failures.${side}`);
    exact(item, ["format", "legality"], [], `bench.replayed.failures.${side}`);
    cleanFailures[side] = {
      format: count(item.format, `bench.replayed.failures.${side}.format`, 100),
      legality: count(item.legality, `bench.replayed.failures.${side}.legality`, 100),
    };
  }
  return { plies, reason, turns: cleanTurns, failures: cleanFailures };
}

export function cleanReplayMeta(
  raw: Record<string, unknown>,
  expected: { teamA: string; teamB: string; plies: number; reason: EndReason },
): CleanReplayMeta {
  const statsRoot = record(raw.stats, "bench.stats");
  exact(statsRoot, ["A", "B"], [], "bench.stats");
  const stats: CleanStats = {
    A: cleanStats(statsRoot.A, "A", expected.teamA),
    B: cleanStats(statsRoot.B, "B", expected.teamB),
  };
  const replayed = cleanReplayed(raw.replayed, expected.plies, expected.reason, stats);

  if (!Array.isArray(raw.failures) || raw.failures.length > 100) throw new Error("bench.failures exceeds 100 entries");
  const failures = raw.failures.map((rawFailure, index) => {
    const value = record(rawFailure, `bench.failures[${index}]`);
    exact(value, ["ply", "attempt", "kind", "team"], ["code"], `bench.failures[${index}]`);
    const ply = count(value.ply, `bench.failures[${index}].ply`, 99);
    if (ply >= expected.plies || (value.attempt !== 1 && value.attempt !== 2) ||
        (value.kind !== "format" && value.kind !== "legality" && value.kind !== "timeout") ||
        (value.team !== "A" && value.team !== "B")) throw new Error(`bench.failures[${index}] is invalid`);
    const code = value.code;
    if (code !== undefined && (typeof code !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(code))) {
      throw new Error(`bench.failures[${index}].code is invalid`);
    }
    return {
      ply,
      attempt: value.attempt as 1 | 2,
      kind: value.kind as "format" | "legality" | "timeout",
      ...(code ? { code } : {}),
      team: value.team as Team,
    };
  });

  if (!Array.isArray(raw.commentary) || raw.commentary.length > 100) throw new Error("bench.commentary exceeds 100 entries");
  const commentary = raw.commentary.map((rawItem, index) => {
    const value = record(rawItem, `bench.commentary[${index}]`);
    exact(value, ["ply", "team", "color", "text"], [], `bench.commentary[${index}]`);
    const ply = count(value.ply, `bench.commentary[${index}].ply`, 99);
    if (ply >= expected.plies || (value.team !== "A" && value.team !== "B") ||
        typeof value.color !== "string" || !COLORS.has(value.color) || typeof value.text !== "string") {
      throw new Error(`bench.commentary[${index}] is invalid`);
    }
    assertCommentaryText(value.text, `bench.commentary[${index}].text`);
    const text = value.text;
    return {
      ply,
      team: value.team as Team,
      color: value.color as CleanReplayMeta["commentary"][number]["color"],
      text,
    };
  });

  const summary = { A: {} as SideFailures, B: {} as SideFailures };
  for (const side of ["A", "B"] as const) summary[side] = {
    format: stats[side].formatFailures,
    legality: stats[side].legalityFailures,
    timeout: stats[side].timeoutSkips,
    token_budget: stats[side].tokenBudgetSkips,
  };
  return { replayed, stats, failures, commentary, summary };
}
