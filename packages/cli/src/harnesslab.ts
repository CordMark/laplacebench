import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessConditions } from "./catalog";
import { sideLatency, sideTokens } from "./publicarena";
import {
  assertHex40,
  assertSafeCount,
  assertText,
  assertTimestamp,
  canonicalJson,
  type EndReason,
  type Team,
} from "./publicarena-contract";
import { matchupKind, ordinal, type MatchupKind } from "./publicgames";
import { buildPublicReplay } from "./publicreplay";

/**
 * Harness Lab accumulation surface (docs/plans/2026-08-02-harnesslab-catalog.md).
 *
 * The arena publishes MODEL-versus-model records; this second catalog publishes
 * the operator's harness experiments as the arena-isomorphic shape: a contender
 * is a full spec string (harness:model@effort) and games accumulate per
 * contender pair. Two boundaries are load-bearing and deliberate:
 *
 * - **Curation selects, machinery verifies.** The only way into this catalog is
 *   the repo's curated list (`laplace-harnesslab-experiments-v1`). Since the
 *   default output-token budget was removed, "budget is null" is true of every
 *   run and can no longer stand in for curation. The three conditions below are
 *   therefore VERIFIERS, not filters: a listed run that violates one fails the
 *   whole build. A silent exclusion would quietly erode the adjudication that
 *   put the run on the list.
 * - **Facts only.** Aggregation stops at W-D-L recomputable from the record's
 *   own games. No rating, no ranking, no cross-run combined claim.
 */
export const HARNESSLAB_SCHEMA = "laplace-bench-harnesslab-catalog-v1" as const;
export const HARNESSLAB_EXPERIMENTS_SCHEMA = "laplace-harnesslab-experiments-v1" as const;

export const MAX_HARNESSLAB_MATCHUPS = 500;
export const MAX_HARNESSLAB_GAMES_PER_MATCHUP = 1_000;
/**
 * Scalar cap for one curated one-line field (description / plan path). The list
 * is hand-written in-repo, so this only stops an artifact from being inflated by
 * a pasted essay; it is not a content boundary.
 */
export const MAX_HARNESSLAB_TEXT = 500;

/** Ledger directory name: the same segment grammar `raw_ref` accepts. */
const RUN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

export type Side = "left" | "right";

export interface ExperimentEntry {
  /** Ledger directory name under community/runs — the canonical run id. */
  run: string;
  description: string;
  /** Pre-registered plan path, recorded verbatim. */
  plan: string;
}

export interface ExperimentsList {
  schema: typeof HARNESSLAB_EXPERIMENTS_SCHEMA;
  experiments: ExperimentEntry[];
}

export interface HarnesslabExperiment {
  run: string;
  /** run.json's own run_id: informational only, never the join key. */
  run_id: string;
  description: string;
  plan: string;
}

/**
 * Provider-side compaction for one side of one game, read from the game's
 * context telemetry. `count` is a verified number ONLY when the telemetry says
 * so; every other observable state publishes a null count with the status that
 * produced it, so an unverified number is never shown as an exact value.
 */
export interface CompactionRecord {
  count: number | null;
  status: string;
}

export interface HarnesslabSide {
  /** usage.outputTotalTokens; null when the side reported no usage at all. */
  output_tokens: number | null;
  /** sideLatency semantics: null for families that do not measure latency. */
  avg_latency_ms: number | null;
  /** legality failures / turns, 3 decimals; null when the side had no turns. */
  illegal_rate_per_turn: number | null;
  failed_turns: number;
  compaction: CompactionRecord | null;
}

export interface HarnesslabGame {
  run: string;
  game_id: string;
  /** Which side moved first (team A opens under laplace-8x8-v1). */
  first_side: Side;
  winner: Side | null;
  reason: EndReason;
  plies: number;
  /** sha256 of the replay bytes in the shared `replays/<digest>.json` space. */
  replay: string;
  per_side: { left: HarnesslabSide; right: HarnesslabSide };
}

export interface HarnesslabMatchup {
  /** "<left_spec> vs <right_spec>". */
  id: string;
  left_spec: string;
  right_spec: string;
  matchup_kind: MatchupKind;
  harness_conditions: {
    left: HarnessConditions | null;
    right: HarnessConditions | null;
  };
  wins_left: number;
  wins_right: number;
  draws: number;
  games: HarnesslabGame[];
}

export interface HarnesslabCatalog {
  schema: typeof HARNESSLAB_SCHEMA;
  source_sha: string;
  generated_at: string;
  experiment_count: number;
  game_count: number;
  experiments: HarnesslabExperiment[];
  matchups: HarnesslabMatchup[];
}

export interface HarnesslabArtifacts {
  catalog: HarnesslabCatalog;
  catalogBytes: Buffer;
  replays: Map<string, Buffer>;
}

/** The catalog written when no curated list is supplied: zero inclusions. */
export function emptyExperimentsList(): ExperimentsList {
  return { schema: HARNESSLAB_EXPERIMENTS_SCHEMA, experiments: [] };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string, maxScalars: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  assertText(value, field, maxScalars);
  return value;
}

/**
 * Read and schema-check the curated list. A missing file is "there is no list",
 * not "the list is empty": the caller asked for a specific path, so an absent
 * one is a wrong invocation and fails loudly rather than publishing zero
 * inclusions under a name that implies some.
 */
export function readExperimentsList(listPath: string): ExperimentsList {
  const resolved = path.resolve(listPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`harness experiments list not found: ${resolved}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(
      `harness experiments list is not valid JSON (${resolved}): ${(error as Error).message}`
    );
  }
  const root = record(parsed, `${resolved}: list`);
  if (root.schema !== HARNESSLAB_EXPERIMENTS_SCHEMA) {
    throw new Error(
      `${resolved}: schema must be ${HARNESSLAB_EXPERIMENTS_SCHEMA}, got ${String(root.schema)}`
    );
  }
  if (!Array.isArray(root.experiments)) {
    throw new Error(`${resolved}: experiments must be an array`);
  }
  const seen = new Set<string>();
  const experiments = root.experiments.map((raw, index) => {
    const field = `${resolved}: experiments[${index}]`;
    const entry = record(raw, field);
    for (const key of Object.keys(entry)) {
      if (key !== "run" && key !== "description" && key !== "plan") {
        throw new Error(`${field} has unknown field ${key}`);
      }
    }
    const run = requireString(entry.run, `${field}.run`, MAX_HARNESSLAB_TEXT);
    if (!RUN_NAME.test(run)) {
      throw new Error(`${field}.run is not a ledger directory name: ${run}`);
    }
    if (seen.has(run)) throw new Error(`${field}.run is listed twice: ${run}`);
    seen.add(run);
    return {
      run,
      description: requireString(entry.description, `${field}.description`, MAX_HARNESSLAB_TEXT),
      plan: requireString(entry.plan, `${field}.plan`, MAX_HARNESSLAB_TEXT),
    };
  });
  return { schema: HARNESSLAB_EXPERIMENTS_SCHEMA, experiments };
}

interface MatchupAccumulator {
  left_spec: string;
  right_spec: string;
  matchup_kind: MatchupKind;
  harness_conditions: {
    left: HarnessConditions | null;
    right: HarnessConditions | null;
  };
  /** The run whose manifest supplied the conditions, for conflict reporting. */
  conditions_run: string;
  games: HarnesslabGame[];
}

function readJson(file: string, field: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${field} could not be read (${file}): ${(error as Error).message}`);
  }
}

function conditionsOf(value: unknown, field: string): HarnessConditions | null {
  if (value === null) return null;
  const entry = record(value, field);
  const read = (key: keyof HarnessConditions): string =>
    requireString(entry[key], `${field}.${key}`, MAX_HARNESSLAB_TEXT);
  return {
    context_lifetime: read("context_lifetime"),
    reasoning_retention: read("reasoning_retention"),
    compaction: read("compaction"),
    mechanism: read("mechanism"),
  };
}

/**
 * The three conditions the adjudication attached to Harness Lab inclusion. They
 * are checked, never used to filter: a listed run that fails one stops the whole
 * catalog with the reason. Returns the run's declared contender specs.
 */
function assertHarnessRun(
  run: string,
  manifest: Record<string, unknown>
): { teamA: string; teamB: string } {
  if (!("output_token_budget_per_team_per_game" in manifest)) {
    throw new Error(
      `harness experiment ${run}: run.json records no ` +
      `output_token_budget_per_team_per_game, so the uncapped condition is unverified`
    );
  }
  const budget = manifest.output_token_budget_per_team_per_game;
  if (budget !== null) {
    throw new Error(
      `harness experiment ${run}: output_token_budget_per_team_per_game must be null ` +
      `(capped-era run, budget ${String(budget)})`
    );
  }
  const specA = requireString(manifest.team_a, `${run}: run.json team_a`, 256);
  const specB = requireString(manifest.team_b, `${run}: run.json team_b`, 256);
  const kind = matchupKind(specA, specB);
  if (kind === "model-arena") {
    throw new Error(
      `harness experiment ${run}: ${specA} vs ${specB} is a model-arena matchup, ` +
      `which belongs to the arena catalog, not the harness lab`
    );
  }
  const isolation = manifest.isolation;
  const mode = isolation && typeof isolation === "object"
    ? (isolation as Record<string, unknown>).mode
    : undefined;
  if (mode !== "clean-room") {
    throw new Error(
      `harness experiment ${run}: isolation.mode must be "clean-room", got ${String(mode)}`
    );
  }
  return { teamA: specA, teamB: specB };
}

/**
 * Legality failures per turn, rounded to 3 decimals. A side that never took a
 * turn has no rate at all: publishing 0 there would read as "never played an
 * illegal move" when the truth is that it never moved.
 */
export function illegalRatePerTurn(legalityFailures: number, turns: number): number | null {
  return turns === 0 ? null : Math.round((legalityFailures / turns) * 1000) / 1000;
}

/**
 * Compaction honesty: an exact count is published only when the telemetry for
 * that side is both `ok` and complete. A present-but-degraded file publishes a
 * null count next to the status that made it unusable; an absent file publishes
 * null, which reads as "not observed" rather than "zero compactions".
 */
export function sideCompaction(
  runDir: string,
  gameId: string,
  team: Team
): CompactionRecord | null {
  const file = path.join(runDir, "games", gameId, `context-telemetry-${team}.json`);
  if (!fs.existsSync(file)) return null;
  const telemetry = record(
    readJson(file, `${gameId}.context-telemetry-${team}`),
    `${gameId}.context-telemetry-${team}`
  );
  const status = telemetry.status;
  if (typeof status !== "string" || status.length === 0) {
    throw new Error(`${gameId}.context-telemetry-${team}: status must be a non-empty string`);
  }
  if (status !== "ok" || telemetry.complete !== true) {
    return { count: null, status };
  }
  const count = telemetry.compaction_count;
  if (typeof count !== "number") {
    throw new Error(
      `${gameId}.context-telemetry-${team}: compaction_count must be a number when status is ok`
    );
  }
  assertSafeCount(count, `${gameId}.context-telemetry-${team}.compaction_count`);
  return { count, status };
}

function sideColumns(
  runDir: string,
  gameId: string,
  team: Team,
  teamRecord: unknown,
  spec: string,
  latencyMs: number,
  rawRef: string
): HarnesslabSide {
  const side = record(teamRecord, `${rawRef}.teams.${team}`);
  const counter = (field: string): number => {
    const value = side[field];
    if (typeof value !== "number") {
      throw new Error(`${rawRef}.teams.${team}.${field} must be a number`);
    }
    assertSafeCount(value, `${rawRef}.teams.${team}.${field}`);
    return value;
  };
  return {
    output_tokens: sideTokens(side, rawRef)?.output ?? null,
    avg_latency_ms: sideLatency(spec, latencyMs, `${rawRef}.${team}`),
    illegal_rate_per_turn: illegalRatePerTurn(counter("legalityFailures"), counter("turns")),
    failed_turns: counter("failedTurns"),
    compaction: sideCompaction(runDir, gameId, team),
  };
}

export function buildHarnesslabCatalog(
  list: ExperimentsList,
  runDirs: string[],
  sourceSha: string,
  generatedAt: string
): HarnesslabArtifacts {
  assertHex40(sourceSha);
  assertTimestamp(generatedAt, "generated_at");

  // Ledger directory name is the canonical id, so two published directories
  // cannot share one: the list entry would name both.
  const byName = new Map<string, string>();
  for (const dir of runDirs) {
    const resolved = path.resolve(dir);
    const name = path.basename(resolved);
    const existing = byName.get(name);
    if (existing !== undefined && existing !== resolved) {
      throw new Error(`two published run directories share the name ${name}`);
    }
    byName.set(name, resolved);
  }

  const experiments: HarnesslabExperiment[] = [];
  const matchups = new Map<string, MatchupAccumulator>();
  const replays = new Map<string, Buffer>();
  // Also enforced when the list is read; repeated here because counting one
  // run's games twice would publish a W-D-L nothing on disk supports.
  const listed = new Set<string>();

  for (const entry of list.experiments) {
    if (listed.has(entry.run)) {
      throw new Error(`harness experiment ${entry.run} is listed twice`);
    }
    listed.add(entry.run);
    const runDir = byName.get(entry.run);
    if (runDir === undefined) {
      throw new Error(
        `harness experiment ${entry.run} is not among the published run directories`
      );
    }
    const manifest = record(
      readJson(path.join(runDir, "run.json"), `${entry.run}: run.json`),
      `${entry.run}: run.json`
    );
    const declared = assertHarnessRun(entry.run, manifest);
    experiments.push({
      run: entry.run,
      run_id: requireString(manifest.run_id, `${entry.run}: run.json run_id`, 256),
      description: entry.description,
      plan: entry.plan,
    });

    const conditions = record(
      manifest.harness_conditions,
      `${entry.run}: run.json harness_conditions`
    );
    // Joined by SPEC, never by ledger side: a run with --swap records the same
    // contender as team A in one game and team B in the next, so reading
    // conditions off the side would attach the wrong harness to half the games.
    const conditionsBySpec = new Map<string, HarnessConditions | null>([
      [declared.teamA, conditionsOf(
        conditions.team_a, `${entry.run}: run.json harness_conditions.team_a`
      )],
      [declared.teamB, conditionsOf(
        conditions.team_b, `${entry.run}: run.json harness_conditions.team_b`
      )],
    ]);
    const conditionsFor = (spec: string, rawRef: string): HarnessConditions | null => {
      if (!conditionsBySpec.has(spec)) {
        throw new Error(
          `harness experiment ${rawRef}: recorded spec ${spec} is neither contender ` +
          `declared in run.json (${declared.teamA}, ${declared.teamB})`
        );
      }
      return conditionsBySpec.get(spec) ?? null;
    };
    const gamesDir = path.join(runDir, "games");
    for (const gameId of fs.readdirSync(gamesDir).sort(ordinal)) {
      const rawRef = `${entry.run}/${gameId}`;
      const finalPath = path.join(gamesDir, gameId, "final.json");
      if (!fs.existsSync(finalPath)) {
        throw new Error(`harness experiment ${rawRef} has no final.json`);
      }
      const fin = record(readJson(finalPath, `${rawRef}: final.json`), `${rawRef}: final.json`);
      const teams = record(fin.teams, `${rawRef}.teams`);
      const specA = requireString(
        record(teams.A, `${rawRef}.teams.A`).agent, `${rawRef}.teams.A.agent`, 256
      );
      const specB = requireString(
        record(teams.B, `${rawRef}.teams.B`).agent, `${rawRef}.teams.B.agent`, 256
      );
      const order = ordinal(specA, specB);
      if (order === 0) {
        throw new Error(`harness experiment ${rawRef}: both sides record the same spec ${specA}`);
      }
      const kind = matchupKind(specA, specB);
      if (kind === "model-arena") {
        throw new Error(
          `harness experiment ${rawRef}: ${specA} vs ${specB} is a model-arena matchup, ` +
          `which belongs to the arena catalog, not the harness lab`
        );
      }
      const leftTeam: Team = order < 0 ? "A" : "B";
      const rightTeam: Team = order < 0 ? "B" : "A";
      const leftSpec = order < 0 ? specA : specB;
      const rightSpec = order < 0 ? specB : specA;

      const artifact = buildPublicReplay(runDir, gameId);
      const existingReplay = replays.get(artifact.digest);
      if (existingReplay !== undefined && !existingReplay.equals(artifact.bytes)) {
        throw new Error(`replay digest collision: ${artifact.digest}`);
      }
      replays.set(artifact.digest, artifact.bytes);

      const id = `${leftSpec} vs ${rightSpec}`;
      const observed = {
        left: conditionsFor(leftSpec, rawRef),
        right: conditionsFor(rightSpec, rawRef),
      };
      let matchup = matchups.get(id);
      if (!matchup) {
        matchup = {
          left_spec: leftSpec,
          right_spec: rightSpec,
          matchup_kind: kind,
          harness_conditions: observed,
          conditions_run: entry.run,
          games: [],
        };
        matchups.set(id, matchup);
      } else {
        // One record carries ONE conditions block, so two runs of the same
        // contender pair must have recorded the same harness. Differing text
        // means the "same" contender was two different harness revisions —
        // keeping the first would silently misdescribe the other's games.
        if (canonicalJson(observed) !== canonicalJson(matchup.harness_conditions)) {
          throw new Error(
            `harness matchup ${id}: ${entry.run} records different harness_conditions ` +
            `than ${matchup.conditions_run}`
          );
        }
        if (matchup.matchup_kind !== kind) {
          throw new Error(`harness matchup ${id}: conflicting matchup_kind in ${entry.run}`);
        }
      }

      matchup.games.push({
        run: entry.run,
        game_id: gameId,
        // Team A opens every laplace-8x8-v1 game (player 1 is team A).
        first_side: leftTeam === "A" ? "left" : "right",
        winner: artifact.winner === null ? null : artifact.winner === leftTeam ? "left" : "right",
        reason: artifact.reason,
        plies: artifact.plies,
        replay: artifact.digest,
        per_side: {
          left: sideColumns(
            runDir, gameId, leftTeam, teams[leftTeam], leftSpec,
            artifact.teamLatencyMs[leftTeam], rawRef
          ),
          right: sideColumns(
            runDir, gameId, rightTeam, teams[rightTeam], rightSpec,
            artifact.teamLatencyMs[rightTeam], rawRef
          ),
        },
      });
    }
  }

  if (matchups.size > MAX_HARNESSLAB_MATCHUPS) {
    throw new Error(
      `harness lab catalog has ${matchups.size} matchups (max ${MAX_HARNESSLAB_MATCHUPS})`
    );
  }
  const rows: HarnesslabMatchup[] = [...matchups.entries()]
    .map(([id, acc]) => {
      if (acc.games.length > MAX_HARNESSLAB_GAMES_PER_MATCHUP) {
        throw new Error(
          `harness matchup ${id} has ${acc.games.length} games ` +
          `(max ${MAX_HARNESSLAB_GAMES_PER_MATCHUP})`
        );
      }
      const games = [...acc.games].sort((a, b) =>
        ordinal(a.run, b.run) || ordinal(a.game_id, b.game_id));
      const row: HarnesslabMatchup = {
        id,
        left_spec: acc.left_spec,
        right_spec: acc.right_spec,
        matchup_kind: acc.matchup_kind,
        harness_conditions: acc.harness_conditions,
        wins_left: 0,
        wins_right: 0,
        draws: 0,
        games,
      };
      // Derived only: every published aggregate is recomputable from games[].
      for (const game of games) {
        if (game.winner === "left") row.wins_left++;
        else if (game.winner === "right") row.wins_right++;
        else row.draws++;
      }
      return row;
    })
    .sort((a, b) => ordinal(a.id, b.id));

  const catalog: HarnesslabCatalog = {
    schema: HARNESSLAB_SCHEMA,
    source_sha: sourceSha,
    generated_at: generatedAt,
    experiment_count: experiments.length,
    game_count: rows.reduce((total, row) => total + row.games.length, 0),
    experiments,
    matchups: rows,
  };
  return {
    catalog,
    catalogBytes: Buffer.from(canonicalJson(catalog), "utf8"),
    replays,
  };
}
