export const PUBLICATION_SCHEMA = "laplace-bench-publication-v1" as const;
export const ARENA_SCHEMA = "laplace-bench-arena-v1" as const;
export const PUBLIC_REPLAY_SCHEMA = "laplace-bench-replay-v1" as const;
export const RULESET = "laplace-8x8-v1" as const;

export const STATUS_MAX_BYTES = 8 * 1024;
export const ARENA_MAX_BYTES = 16 * 1024 * 1024;
export const REPLAY_MAX_BYTES = 1024 * 1024;
export const MAX_MATCHUPS = 1_000;
export const MAX_GAMES_PER_MATCHUP = 500;
export const MAX_CONDITIONS_PER_MATCHUP = 64;
export const MAX_PUBLIC_GAMES = 5_000;

/**
 * Scalar cap for a participant label. This is not a local preference: the
 * product rejects the ENTIRE catalog when any label exceeds 128 scalars
 * (`isText(value.label, 128)` in its arena parser), so emitting a longer label
 * would not fail loudly here — it would publish successfully and leave the
 * public arena silently empty. The producer must stay inside what the consumer
 * accepts, and this constant is that contract, not a knob.
 *
 * Labels are composed from the headline's parts, so a composed label can be
 * longer than the identity it describes. `headlineLabel` falls back to the
 * identity when composition would cross this line, restoring
 * label <= identity <= headline grammar by construction.
 */
export const MAX_PARTICIPANT_LABEL = 128;

export type Team = "A" | "B";
export type EndReason =
  | "center"
  | "elimination"
  | "horizon_draw"
  | "repetition_draw";

export interface Participant {
  id: string;
  label: string;
  kind: "llm" | "product-cpu" | "baseline";
}

export interface TeamRef {
  agent: string;
  headline_id: string;
}

export interface SideFailures {
  format: number;
  legality: number;
  timeout: number;
  token_budget: number;
}

/**
 * In-game token totals for one side. `output` is the reasoning-inclusive
 * in-game output total; `total` is inputTotalTokens + outputTotalTokens
 * (UsageAggregate has no total field of its own, so the sum IS the contract).
 */
export interface SideTokens {
  output: number;
  total: number;
}

export interface PublicGame {
  raw_ref: string;
  played_at: string;
  /**
   * Wall-clock game duration from the replay-validated game_start/game_end
   * timestamps. Always present: runs whose timestamps are missing, malformed
   * or reversed are rejected at replay build, so no published game lacks it.
   */
  duration_ms: number;
  team_a: TeamRef;
  team_b: TeamRef;
  left_side: Team;
  winner: Team | null;
  reason: EndReason;
  plies: number;
  failures: { A: SideFailures; B: SideFailures };
  /** Null side = no usage telemetry reported (e.g. baseline agents). */
  team_tokens: { A: SideTokens | null; B: SideTokens | null };
  /**
   * Replay-validated average response latency per side and turn. Baselines do
   * not report response latency; their side is null rather than a fabricated 0.
   */
  team_latency_ms: { A: number | null; B: number | null };
  replay: {
    id: string;
    bytes: number;
    schema: typeof PUBLIC_REPLAY_SCHEMA;
  };
}

export interface Condition {
  left_agent: string;
  right_agent: string;
  game_count: number;
  left_wins: number;
  right_wins: number;
  draws: number;
}

export interface ArenaMatchup {
  id: string;
  left: Participant;
  right: Participant;
  game_count: number;
  left_wins: number;
  right_wins: number;
  draws: number;
  last_played_at: string;
  conditions: Condition[];
  games: PublicGame[];
}

export interface ArenaCatalog {
  schema: typeof ARENA_SCHEMA;
  ruleset: typeof RULESET;
  lane: "community";
  source_sha: string;
  generated_at: string;
  verified_run_count: number;
  verified_game_count: number;
  public_agent_count: number;
  public_game_count: number;
  matchups: ArenaMatchup[];
}

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const RFC3339_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HEADLINE = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,127}$/;
const RAW_REF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// Keep file URIs out, but do not mistake ordinary prose such as
// "back file: if I sit still" for one. Only whitespace/end after the colon is
// prose-safe; any non-whitespace continuation stays fail-closed as URI-shaped.
const UNSAFE_COMMENTARY =
  /[<>]|\b(?:https?|ftp|data|javascript|mailto):|\bfile:(?=\S)/iu;

export function assertHex40(value: string, field = "source_sha"): void {
  if (!HEX40.test(value)) throw new Error(`${field} must be 40 lowercase hex`);
}

export function assertHex64(value: string, field = "digest"): void {
  if (!HEX64.test(value)) throw new Error(`${field} must be 64 lowercase hex`);
}

export function assertTimestamp(value: string, field: string): number {
  if (!RFC3339_MS.test(value)) throw new Error(`${field} must be UTC RFC3339 with milliseconds`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} is not a real timestamp`);
  return parsed;
}

export function assertRawRef(value: string): void {
  if (!RAW_REF.test(value)) throw new Error(`invalid raw_ref: ${value}`);
  for (const part of value.split("/")) {
    if (part === "." || part === "..") throw new Error(`invalid raw_ref segment: ${part}`);
  }
}

export function assertHeadline(value: string): void {
  if (!isHeadline(value)) throw new Error(`invalid headline identity: ${value}`);
}

export function isHeadline(value: string): boolean {
  return HEADLINE.test(value);
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertSafeCount(value: number, field: string, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${field} must be an integer in 0..${max}`);
  }
}

export function assertText(value: string, field: string, maxScalars: number): void {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${field} must be non-empty and contain no controls`);
  }
  if (Array.from(value).length > maxScalars) throw new Error(`${field} exceeds ${maxScalars}`);
}

/**
 * Scalar cap for one published commentary entry. The producer bounds notes to
 * this at the event boundary, so "recorded" always implies "publishable": a
 * model that writes a very long note must not make its own game unexportable.
 */
export const MAX_COMMENTARY_SCALARS = 2_500;

export function assertCommentaryText(value: string, field: string): void {
  if (Array.from(value).length > MAX_COMMENTARY_SCALARS || UNSAFE_COMMENTARY.test(value)) {
    throw new Error(`${field} exceeds the commentary content boundary`);
  }
}

export function isEndReason(value: unknown): value is EndReason {
  return value === "center" || value === "elimination" ||
    value === "horizon_draw" || value === "repetition_draw";
}
