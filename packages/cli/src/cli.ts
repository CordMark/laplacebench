import "./env";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { centerGreedyAgent } from "./agents/centergreedy";
import { chaosAgent } from "./agents/chaos";
import { greedyAgent } from "./agents/greedy";
import { randomAgent } from "./agents/random";
import { takeshiAgent } from "./agents/takeshi";
import { summarize } from "./metrics";
import {
  LLM_TURN_TIMEOUT_MS,
  playGame,
  resolveMaxPlies,
  type GameProgress,
} from "./runner";
import { PROMPT_REV } from "./prompt";
import { MatchPreflightError } from "./playerrors";
import {
  HARNESS_CONDITIONS,
  parseAgentSpec,
  PRODUCT_CPU_POLICY,
  usageAgentSpecsLine,
} from "./catalog";
import { matchupKind } from "./publicgames";
import {
  ambientManifest,
  defaultCanaryCliDeps,
  isolationManifest,
  prepareCleanRoom,
  runCanaryMatrix,
  staticChecks,
  type CanaryCliDeps,
  type CleanRoomContext,
  type CleanRoomDeps,
  type CleanRoomProvider,
} from "./cleanroom";
import { classifyRunnableAgentSpec, type LatencyTelemetry } from "./publicgames";
import type { Agent, AgentReply } from "./types";

/** Positional arguments: excludes --flags AND the values they consume.
 * (The old `filter(!startsWith("--"))` silently swallowed option values —
 * e.g. `--out community/STANDINGS.md` fed the md path in as a run dir.) */
export function positionals(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) i++; // skip consumed value
      continue;
    }
    out.push(a);
  }
  return out;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const PRODUCT_CPU_SPEC = /^product-cpu:([a-z0-9-]+):(level_\d+)$/;
export const BUNDLED_REGRET_POLICY = "cpu-v4";

export function assertBundledProductCpuRole(
  policy: string,
  role: "play" | "regret"
): void {
  const expected = role === "play" ? PRODUCT_CPU_POLICY : BUNDLED_REGRET_POLICY;
  if (policy !== expected) {
    throw new Error(
      `${role} supports bundled ${expected} only, got ${policy}. ${role === "play" ? "対局" : "解析"}は開始していません。`
    );
  }
}

/** Specs whose agents consume model tokens (the fairness envelope applies). */
export function isLlmSpec(spec: string): boolean {
  return (
    spec.startsWith("claude-cli") || // includes claude-cli-learn
    spec.startsWith("codex-cli") ||
    spec.startsWith("anthropic:")
  );
}

/**
 * Match resource defaults (docs/match-conduct doc): matches with LLM agents
 * get the backstop timeout, baselines the old one. Since 2026-08-02 there is
 * no default token budget for any match — cost is a recorded column, not a
 * rule — so a budget exists only when `--output-token-budget` asks for one.
 */
export function resolveMatchResources(
  args: Record<string, string | boolean>,
  specA: string,
  specB: string
): { turnTimeoutMs: number; outputTokenBudget: number | undefined } {
  const llmMatch = isLlmSpec(specA) || isLlmSpec(specB);
  const turnTimeoutMs = parseInt(
    String(
      args["turn-timeout-ms"] ??
        (llmMatch ? String(LLM_TURN_TIMEOUT_MS) : "300000")
    ),
    10
  );
  const outputTokenBudget =
    args["output-token-budget"] !== undefined
      ? parseInt(String(args["output-token-budget"]), 10)
      : undefined;
  return { turnTimeoutMs, outputTokenBudget };
}

export function enforceLatencyContract(
  agent: Agent,
  spec: string,
  expected: LatencyTelemetry,
): Agent {
  return {
    ...agent,
    async act(input): Promise<AgentReply> {
      const reply = await agent.act(input);
      const measured = reply.latencyMs !== undefined;
      if ((expected === "measured") !== measured) {
        throw new Error(`${spec}: latency telemetry contract violated`);
      }
      if (measured && (!Number.isSafeInteger(reply.latencyMs) || reply.latencyMs! < 0)) {
        throw new Error(`${spec}: latencyMs must be a nonnegative safe integer`);
      }
      return reply;
    },
  };
}

/**
 * Which clean-room provider a spec's agent talks to, or null for agents the
 * isolation surface does not apply to (API, baselines, product CPU).
 */
export function cleanRoomProviderFor(spec: string): CleanRoomProvider | null {
  if (spec.startsWith("claude-cli")) return "claude"; // includes claude-cli-learn
  if (spec.startsWith("codex-cli")) return "codex";
  return null;
}

/**
 * Subscription-CLI matches run clean-room by default; `--ambient-cli-env` is
 * the explicit opt-in to the legacy environment-copying condition, recorded
 * as its own labeled mode. There is no silent fallback between the two.
 */
export function resolveIsolationMode(
  ambientOptIn: boolean,
  specA: string,
  specB: string
): { mode: "clean-room" | "ambient" | null; providers: CleanRoomProvider[] } {
  const providers = [
    ...new Set(
      [specA, specB]
        .map((spec) => cleanRoomProviderFor(spec))
        .filter((p): p is CleanRoomProvider => p !== null)
    ),
  ];
  return {
    mode: providers.length === 0 ? null : ambientOptIn ? "ambient" : "clean-room",
    providers,
  };
}

/**
 * Turn-scoped codex conditions (reset/memo/notes) declare that nothing — or
 * only the recorded memo, or only the model's own past move notes — carries
 * between turns. Ambient execution cannot guarantee that: without the
 * clean-room suppression flags the model keeps shell access and a reused cwd,
 * an unbounded, unrecorded carryover channel. Rather than silently weakening
 * the declaration, these specs refuse to run ambient (fail-closed).
 */
export function assertTurnScopedCleanRoom(
  mode: "clean-room" | "ambient" | null,
  specA: string,
  specB: string
): void {
  if (mode !== "ambient") return;
  for (const spec of [specA, specB]) {
    const kind = classifyRunnableAgentSpec(spec)?.kind;
    if (
      kind === "codex-cli-reset" ||
      kind === "codex-cli-memo" ||
      kind === "codex-cli-notes" ||
      kind === "codex-cli-notes-guided"
    ) {
      throw new MatchPreflightError(
        `${spec}: turn-scoped 条件(${kind})は「持ち越しは宣言されたもののみ」という不変条件を ` +
          `ambient 環境では保証できません(tool がファイル経由で状態を持ち越せるため)。` +
          `--ambient-cli-env を外して clean-room で実行してください。`
      );
    }
  }
}

/** Test seams for arena(): everything that would otherwise reach a real CLI. */
export interface ArenaOverrides {
  cleanRoomDeps?: CleanRoomDeps;
  canaryCliDeps?: CanaryCliDeps;
  resolveCommandVersion?: (cmd: string) => string | null;
}

async function makeAgent(
  spec: string,
  seed: number,
  ctx: { runDir: string; cleanRoom: CleanRoomContext | null }
): Promise<Agent> {
  const parsed = classifyRunnableAgentSpec(spec);
  if (!parsed) throw new Error(`Unknown agent spec: ${spec}`);
  const cleanRoomProvider = ctx.cleanRoom ? cleanRoomProviderFor(spec) : null;
  const isolation =
    ctx.cleanRoom && cleanRoomProvider
      ? ctx.cleanRoom.agentIsolation(cleanRoomProvider)
      : undefined;
  let agent: Agent;
  switch (parsed.kind) {
    case "product-cpu": {
      assertBundledProductCpuRole(parsed.policy, "play");
      const { createProductCpuAgent } = require("./agents/productcpu") as typeof import("./agents/productcpu");
      agent = await createProductCpuAgent(parsed.level, seed, { expectedPolicy: parsed.policy });
      break;
    }
    case "random": agent = randomAgent(seed); break;
    case "greedy": agent = greedyAgent(seed); break;
    case "center-greedy": agent = centerGreedyAgent(seed, parsed.parameter); break;
    case "chaos": agent = chaosAgent(seed); break;
    case "takeshi": agent = takeshiAgent(parsed.parameter); break;
    case "anthropic": {
      const { anthropicAgent } = require("./agents/llm") as typeof import("./agents/llm");
      agent = anthropicAgent({ model: parsed.model });
      break;
    }
    case "claude-cli-learn": {
      const { learningClaudeCliAgent } = require("./agents/learning") as typeof import("./agents/learning");
      agent = learningClaudeCliAgent({ model: parsed.model, effort: parsed.effort, runDir: ctx.runDir, isolation });
      break;
    }
    case "claude-cli": {
      const { claudeCliAgent } = require("./agents/cli") as typeof import("./agents/cli");
      agent = claudeCliAgent({ model: parsed.model, effort: parsed.effort, isolation });
      break;
    }
    case "codex-cli": {
      const { codexCliAgent } = require("./agents/cli") as typeof import("./agents/cli");
      agent = codexCliAgent({ model: parsed.model, effort: parsed.effort, isolation });
      break;
    }
    case "codex-cli-reset": {
      const { codexCliAgent } = require("./agents/cli") as typeof import("./agents/cli");
      agent = codexCliAgent({
        model: parsed.model,
        effort: parsed.effort,
        contextPolicy: "turn-reset",
        isolation,
      });
      break;
    }
    case "codex-cli-memo": {
      const { codexCliAgent } = require("./agents/cli") as typeof import("./agents/cli");
      const { MemoSession } = require("./agents/memo") as typeof import("./agents/memo");
      agent = codexCliAgent({
        model: parsed.model,
        effort: parsed.effort,
        memo: new MemoSession(ctx.runDir),
        isolation,
      });
      break;
    }
    case "codex-cli-notes": {
      const { codexCliAgent } = require("./agents/cli") as typeof import("./agents/cli");
      const { NotesSession } = require("./agents/notes") as typeof import("./agents/notes");
      agent = codexCliAgent({
        model: parsed.model,
        effort: parsed.effort,
        notes: new NotesSession(),
        isolation,
      });
      break;
    }
    case "codex-cli-notes-guided": {
      // Same adapter, same session class: the variant is the whole difference.
      const { codexCliAgent } = require("./agents/cli") as typeof import("./agents/cli");
      const { NOTES_GUIDED, NotesSession } = require("./agents/notes") as typeof import("./agents/notes");
      agent = codexCliAgent({
        model: parsed.model,
        effort: parsed.effort,
        notes: new NotesSession(NOTES_GUIDED),
        isolation,
      });
      break;
    }
  }
  return enforceLatencyContract(agent, spec, parsed.latency);
}

function commandVersion(command: string): string | null {
  try {
    return execFileSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The defaults the deprecated `arena` alias must keep applying. `play` is
 * deliberately stricter — it refuses to guess an opponent — so these live here,
 * separately, as the thing that makes "existing arena invocations behave
 * exactly as before" true and testable without playing a match.
 */
export function arenaDefaults(args: Record<string, string | boolean>): {
  specA: string;
  specB: string;
  games: number;
  swap: boolean;
  seed: number;
} {
  return {
    specA: String(args["team-a"] ?? "random"),
    specB: String(args["team-b"] ?? "takeshi"),
    games: parseInt(String(args["games"] ?? "2"), 10),
    swap: Boolean(args["swap"]),
    seed: parseInt(String(args["seed"] ?? "42"), 10),
  };
}

/**
 * Learning agents accumulate strategy notes across games in runDir/learn/,
 * so their whole premise is that game N+1 starts after game N's post-game
 * analysis. Detection shares its source of truth with the spec parser above
 * (the `claudeLearn` match): same head, optional `:model@effort` tail.
 */
export function isLearningSpec(spec: string): boolean {
  return /^claude-cli-learn(?::|$)/.test(spec);
}

/**
 * Multi-game runs execute in parallel by default; `--serial` opts out, and a
 * learning spec on either side forces serial because its strategy notes are
 * a cross-game sequential lifecycle.
 */
export function resolveExecution(
  games: number,
  serialRequested: boolean,
  specA: string,
  specB: string
): "parallel" | "serial" {
  return games > 1 &&
    !serialRequested &&
    !isLearningSpec(specA) &&
    !isLearningSpec(specB)
    ? "parallel"
    : "serial";
}

/** One-thousand shorthand for progress lines: 82134 -> "82k". */
function kTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

/**
 * Display-only live progress line. Token usage is shown per team against the
 * per-team budget — never summed across teams against a single budget. When
 * the run has no output-token budget, or neither side reports usage
 * telemetry, the token segment is omitted entirely: only facts we actually
 * meter are shown.
 */
export function formatProgressLine(p: GameProgress): string {
  const sides =
    p.outputTokenBudget === undefined
      ? []
      : (["A", "B"] as const)
          .filter((t) => p.outputTokensUsed[t] !== null)
          .map(
            (t) =>
              `${t} ${kTokens(p.outputTokensUsed[t]!)}/${kTokens(p.outputTokenBudget!)}`
          );
  const tokens = sides.length > 0 ? ` | out ${sides.join(" · ")}` : "";
  const mins = Math.floor(p.elapsedMs / 60_000);
  const secs = Math.floor((p.elapsedMs % 60_000) / 1000);
  return `[${p.gameId}] ply ${p.ply + 1}/${p.maxPlies} ${p.team} ${p.summary}${tokens} | ${mins}m${String(secs).padStart(2, "0")}s`;
}

interface ArenaGamePair {
  gameId: string;
  gameSeed: number;
  first: Agent;
  second: Agent;
}

/**
 * Runs a set of games serially or in parallel and returns how many failed.
 * One game's failure never aborts the others; the caller decides what a
 * partial run means (non-zero exit, submit suppression). In parallel mode
 * every pair is created before any game starts, so a mid-preparation failure
 * can dispose all agents that already exist instead of leaking their
 * subprocess state — in that case the error is rethrown, because no game has
 * run yet and there is nothing partial to keep.
 */
export async function runGameSet<P extends { gameId: string }>(opts: {
  games: number;
  execution: "parallel" | "serial";
  makePair: (g: number) => Promise<P>;
  runOne: (pair: P) => Promise<void>;
  disposePair: (pair: P) => Promise<void>;
  reportFailure: (gameId: string, err: unknown) => void;
}): Promise<number> {
  let failedGames = 0;
  const report = (gameId: string, err: unknown) => {
    failedGames++;
    opts.reportFailure(gameId, err);
  };

  if (opts.execution === "parallel") {
    const pairs: P[] = [];
    try {
      for (let g = 0; g < opts.games; g++) pairs.push(await opts.makePair(g));
    } catch (err) {
      for (const pair of pairs) await opts.disposePair(pair);
      throw err;
    }
    const settled = await Promise.allSettled(pairs.map((pair) => opts.runOne(pair)));
    settled.forEach((s, g) => {
      if (s.status === "rejected") report(pairs[g].gameId, s.reason);
    });
  } else {
    for (let g = 0; g < opts.games; g++) {
      const pair = await opts.makePair(g);
      try {
        await opts.runOne(pair);
      } catch (err) {
        report(pair.gameId, err);
      }
    }
  }
  return failedGames;
}

export async function arena(
  args: Record<string, string | boolean>,
  overrides: ArenaOverrides = {}
): Promise<{ failedGames: number }> {
  const { specA, specB, games, swap, seed } = arenaDefaults(args);
  const maxPlies = resolveMaxPlies(args["max-plies"]);
  const { turnTimeoutMs, outputTokenBudget } = resolveMatchResources(
    args,
    specA,
    specB
  );
  if (!Number.isSafeInteger(turnTimeoutMs) || turnTimeoutMs <= 0) {
    throw new Error("--turn-timeout-ms must be a positive integer");
  }
  if (
    outputTokenBudget !== undefined &&
    (!Number.isSafeInteger(outputTokenBudget) || outputTokenBudget <= 0)
  ) {
    throw new Error("--output-token-budget must be a positive integer");
  }

  const serialRequested = Boolean(args["serial"]);
  const learning = isLearningSpec(specA) || isLearningSpec(specB);
  const execution = resolveExecution(games, serialRequested, specA, specB);

  const runId =
    (args["run-id"] as string) ||
    new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + `-${specA}-vs-${specB}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  // Runs live under the caller's working directory, not the package install.
  const runDir = path.resolve(process.cwd(), "runs", runId);

  const { mode: isolationMode, providers: cliProviders } = resolveIsolationMode(
    args["ambient-cli-env"] === true,
    specA,
    specB
  );
  assertTurnScopedCleanRoom(isolationMode, specA, specB);
  const resolveVersion = overrides.resolveCommandVersion ?? commandVersion;
  const claudeVersion = cliProviders.includes("claude") ? resolveVersion("claude") : null;
  const codexVersion = cliProviders.includes("codex") ? resolveVersion("codex") : null;

  // Metadata-only preflight happens before the run directory exists.
  const productSpecs = [specA, specB].filter((s) => PRODUCT_CPU_SPEC.test(s));
  let productProvenance: object | null = null;
  if (productSpecs.length > 0) {
    try {
      const { preflightProductCpu } = require("./agents/productcpu") as typeof import("./agents/productcpu");
      let hello: import("./agents/productcpu").BridgeHello | null = null;
      for (const spec of productSpecs) {
        const m = spec.match(PRODUCT_CPU_SPEC)!;
        assertBundledProductCpuRole(m[1], "play");
        hello = await preflightProductCpu(
          { expectedPolicy: m[1] },
          m[2]
        );
      }
      productProvenance = {
        policy_version: hello!.policy_version,
        product_commit: hello!.product_commit,
        distribution: hello!.distribution,
        python: hello!.python,
        protocol: hello!.protocol,
        teams: {
          A: PRODUCT_CPU_SPEC.test(specA)
            ? { spec: specA, level_id: specA.match(PRODUCT_CPU_SPEC)![2] }
            : null,
          B: PRODUCT_CPU_SPEC.test(specB)
            ? { spec: specB, level_id: specB.match(PRODUCT_CPU_SPEC)![2] }
            : null,
        },
      };
    } catch (error) {
      throw new MatchPreflightError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Fail-closed clean-room preflight, BEFORE the run directory exists: a run
  // that cannot certify its isolation leaves no run.json behind.
  let cleanRoom: CleanRoomContext | null = null;
  let isolationRecord: object | null = null;
  if (isolationMode === "clean-room") {
    for (const provider of cliProviders) {
      const version = provider === "claude" ? claudeVersion : codexVersion;
      if (!version) {
        throw new MatchPreflightError(
          `${provider} CLI の version を解決できませんでした。clean-room 条件は CLI version の記録を要求します。` +
            `従来条件で実行するには --ambient-cli-env を指定してください。`
        );
      }
    }
    cleanRoom = prepareCleanRoom(cliProviders, overrides.cleanRoomDeps);
    try {
      const staticResults = staticChecks(cleanRoom);
      console.log("clean-room preflight: canary 検査を実行中…");
      const canaryResults = await runCanaryMatrix(
        cleanRoom,
        overrides.canaryCliDeps ?? defaultCanaryCliDeps,
        {
          claudeCredentials: overrides.cleanRoomDeps?.claudeCredentials,
          codexAuth: overrides.cleanRoomDeps?.codexAuth,
        }
      );
      isolationRecord = isolationManifest(
        cleanRoom,
        {
          ...(claudeVersion ? { claude: claudeVersion } : {}),
          ...(codexVersion ? { codex: codexVersion } : {}),
        },
        staticResults,
        canaryResults
      );
      console.log("clean-room preflight: 合格");
    } catch (err) {
      cleanRoom.cleanup();
      throw err;
    }
  } else if (isolationMode === "ambient") {
    console.log(
      "--ambient-cli-env: 従来の環境コピー条件で実行します(run.json に ambient として記録)"
    );
    isolationRecord = ambientManifest();
  }

  try {
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
    path.join(runDir, "run.json"),
    JSON.stringify(
      {
        run_id: runId,
        ruleset: "laplace-8x8-v1",
        prompt_rev: PROMPT_REV,
        team_a: specA,
        team_b: specB,
        games,
        swap,
        seed,
        max_plies: maxPlies,
        turn_timeout_ms: turnTimeoutMs,
        output_token_budget_per_team_per_game: outputTokenBudget ?? null,
        output_token_budget_metric: "in-game output_tokens_total (reasoning inclusive)",
        sampling: "provider-default (no temperature control on current models)",
        usage_schema: "laplace-model-usage-v1",
        usage_scope: "in-game act calls, including repair attempts; excludes post-game learning",
        cli_versions: {
          claude: claudeVersion,
          codex: codexVersion,
        },
        isolation: isolationRecord,
        matchup_kind: matchupKind(specA, specB),
        harness_conditions: {
          team_a: HARNESS_CONDITIONS[parseAgentSpec(specA).harness ?? ""] ?? null,
          team_b: HARNESS_CONDITIONS[parseAgentSpec(specB).harness ?? ""] ?? null,
        },
        product_cpu: productProvenance,
        execution,
        started_at: new Date().toISOString(),
      },
      null,
      2
    )
    );
  } catch (err) {
    // The preflight passed but the run could not be recorded: release the
    // isolation resources here too — no exit path may leak them.
    cleanRoom?.cleanup();
    throw err;
  }

  if (execution === "parallel") {
    console.log(`${games} 局を並列実行します(--serial で直列)`);
  } else if (games > 1 && !serialRequested && learning) {
    console.log("learning agent のため直列実行します");
  }

  const makePair = async (g: number): Promise<ArenaGamePair> => {
    const swapped = swap && g % 2 === 1;
    const gameSeed = seed + g * 1000;
    const ctx = { runDir, cleanRoom };
    const first = await makeAgent(swapped ? specB : specA, gameSeed + 1, ctx);
    let second: Agent;
    try {
      second = await makeAgent(swapped ? specA : specB, gameSeed + 2, ctx);
    } catch (err) {
      await first.dispose?.();
      throw err;
    }
    return { gameId: `game-${String(g).padStart(3, "0")}`, gameSeed, first, second };
  };

  const runOne = async (pair: ArenaGamePair): Promise<void> => {
    console.log(`[${pair.gameId}] A=${pair.first.name} vs B=${pair.second.name}`);
    const result = await playGame({
      gameId: pair.gameId,
      runDir,
      seed: pair.gameSeed,
      maxPlies,
      turnTimeoutMs,
      outputTokenBudget,
      agents: { A: pair.first, B: pair.second },
      onProgress: (p) => console.log(formatProgressLine(p)),
    });
    console.log(
      `[${pair.gameId}] ${result.winner ? `winner=${result.winner} (${result.reason})` : `draw (${result.reason})`} plies=${result.plies}`
    );
  };

  let failedGames: number;
  try {
    failedGames = await runGameSet({
      games,
      execution,
      makePair,
      runOne,
      disposePair: async (pair) => {
        try {
          await pair.first.dispose?.();
        } catch {}
        try {
          await pair.second.dispose?.();
        } catch {}
      },
      reportFailure: (gameId, err) => {
        console.error(
          `[${gameId}] failed: ${err instanceof Error ? err.message : String(err)}`
        );
      },
    });
  } finally {
    // Run scope is the sole owner of the isolation homes: they are deleted
    // only after every game (including failures) is finished, never by an
    // individual agent whose sibling may still be mid-game.
    cleanRoom?.cleanup();
  }

  const summary = summarize(runDir);
  console.log("\n=== summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nrun dir: ${runDir}`);
  if (failedGames > 0) {
    console.error(`${failedGames}/${games} 局が失敗しました`);
  }
  return { failedGames };
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === "arena") {
    // Deprecated alias. It keeps its own historical defaults (see `arena()`),
    // so every existing invocation — including the bare one — behaves exactly
    // as it always has. The stricter argument contract lives on `play` alone;
    // tightening it here would break the published command this alias exists
    // to preserve.
    //
    // REMOVAL CONDITION: drop this branch once BOTH docs/anchor-ladder-v1.md
    // and docs/anchor-ladder-v2.md record commands newly executed with `play`
    // and carry the measurements from that execution. Those files document how
    // the published baseline ordering was produced; while either still names
    // `arena`, this alias is what keeps that record reproducible.
    console.error(
      "warning: `arena` は非推奨です。`laplacebench play --team-a <spec> --team-b <spec>` を使ってください。"
    );
    const { failedGames } = await arena(args);
    if (failedGames > 0) process.exitCode = 1;
  } else if (cmd === "play") {
    const { runPlay } = require("./wizard") as typeof import("./wizard");
    process.exitCode = await runPlay(
      {
        env: process.env,
        checkCommand: (c) => {
          const v = commandVersion(c);
          return v ? { ok: true, version: v } : { ok: false };
        },
        randomSeed: () => Math.floor(Math.random() * 90000) + 10000,
        runArena: (a) => arena(a),
        submitRun: (runDir) => {
          const { submitRun, defaultSubmitDeps } = require("./submit") as typeof import("./submit");
          // Returned, not discarded: `submitRun` reports refusal by returning
          // `blocked`, so swallowing it would let `play` claim a publication
          // that never happened.
          return submitRun(runDir, defaultSubmitDeps());
        },
        isTTY: Boolean(process.stdin.isTTY),
        now: () => new Date(),
      },
      undefined,
      args
    );
  } else if (cmd === "summarize") {
    const runDir = String(args["run"] ?? rest[0]);
    console.log(JSON.stringify(summarize(runDir), null, 2));
  } else if (cmd === "export-web") {
    const { exportRun, defaultOutDir } = require("./exportweb") as typeof import("./exportweb");
    const runDir = path.resolve(String(args["run"] ?? rest[0]));
    const outDir = args["out"] ? path.resolve(String(args["out"])) : defaultOutDir();
    exportRun(runDir, outDir);
  } else if (cmd === "verify") {
    const { verifyRun } = require("./exportweb") as typeof import("./exportweb");
    const runDirs = rest.filter((a) => !a.startsWith("--")).map((d) => path.resolve(d));
    let games = 0;
    let failed = 0;
    for (const runDir of runDirs) {
      const result = verifyRun(runDir);
      const name = path.basename(runDir);
      games += result.games;
      failed += result.failures.length;
      for (const f of result.failures) {
        console.error(`FAILED: ${name}/${f.gameId}: ${f.message}`);
      }
      if (result.failures.length === 0) {
        console.log(`verified: ${name} (${result.games} game(s))`);
      }
    }
    console.log(
      `${Math.max(0, games - failed)}/${games} games verified across ${runDirs.length} run(s)`
    );
    if (failed > 0 || games === 0) process.exitCode = 1;
  } else if (cmd === "submit") {
    const { submitRun, defaultSubmitDeps } = require("./submit") as typeof import("./submit");
    const runDir = String(rest.find((a) => !a.startsWith("--")) ?? "");
    if (!runDir) throw new Error("submit needs a run directory: laplacebench submit <runDir>");
    try {
      const outcome = submitRun(runDir, defaultSubmitDeps());
      // An unauthenticated machine is a normal state with printed instructions,
      // not a crash; a run that fails verification is a real failure.
      if (outcome.status === "blocked" && outcome.reason === "verify-failed") {
        process.exitCode = 1;
      }
    } catch (e) {
      // git/gh failures (push conflict, network, an existing pull request) are
      // reportable outcomes, not something to hand back as a stack trace.
      console.error(`submit failed: ${e instanceof Error ? e.message : String(e)}`);
      console.error("手動提出の手順は community/README.md を参照してください。");
      process.exitCode = 1;
    }
  } else if (cmd === "regret") {
    const runDir = path.resolve(String(args["run"] ?? rest[0]));
    const oracleSpec = String(args["oracle"] ?? "product-cpu:cpu-v4:level_5");
    const m = oracleSpec.match(PRODUCT_CPU_SPEC);
    if (!m) throw new Error(`--oracle must be a product-cpu spec, got: ${oracleSpec}`);
    assertBundledProductCpuRole(m[1], "regret");
    const { analyzeRunRegret } = require("./regret") as typeof import("./regret");
    const summary = await analyzeRunRegret(runDir, {
      expectedPolicy: m[1],
      oracleLevelId: m[2],
    });
    console.log(JSON.stringify(summary, null, 2));
  } else if (cmd === "standings") {
    const { matchupsJson, matchupsMarkdown } = require("./standings") as typeof import("./standings");
    const dirs = positionals(rest).map((d) => path.resolve(d));
    const md = matchupsMarkdown(dirs);
    let printed = false;
    if (args["out"]) {
      fs.writeFileSync(path.resolve(String(args["out"])), md);
      console.log(`matchups written: ${args["out"]}`);
      printed = true;
    }
    if (args["json-out"]) {
      fs.writeFileSync(path.resolve(String(args["json-out"])), matchupsJson(dirs));
      console.log(`matchups json written: ${args["json-out"]}`);
      printed = true;
    }
    if (!printed) console.log(md);
  } else if (cmd === "public-arena") {
    const { writeArenaArtifacts } = require("./publicarena") as typeof import("./publicarena");
    const dirs = positionals(rest).map((dir) => path.resolve(dir));
    const out = String(args["out"] ?? "");
    const sourceSha = String(args["source-sha"] ?? "");
    const generatedAt = String(args["generated-at"] ?? "");
    if (!out || !sourceSha || !generatedAt) {
      throw new Error("public-arena needs --out, --source-sha, and --generated-at");
    }
    // The curated Harness Lab list is named explicitly — no implicit repo-root
    // lookup. Omitting it writes an EMPTY harnesslab.json (never skips it), so
    // "no experiment is curated" and "the artifact was not generated" stay
    // different observable states.
    const harnessArg = args["harness-experiments"];
    if (harnessArg !== undefined && (typeof harnessArg !== "string" || harnessArg === "")) {
      throw new Error("--harness-experiments needs a path to the curated list");
    }
    const harnessExperiments = harnessArg === undefined ? null : path.resolve(harnessArg);
    const result = writeArenaArtifacts(
      path.resolve(out), dirs, sourceSha, generatedAt, harnessExperiments
    );
    console.log(
      `public arena written: ${out} (${result.catalog.public_game_count} public / ` +
      `${result.catalog.verified_game_count} verified games; harness lab: ` +
      `${result.harnesslab.experiment_count} experiments / ` +
      `${result.harnesslab.game_count} games)`
    );
  } else {
    console.log(
      "usage:\n  laplacebench play                                 (interactive: pick providers, models, effort)\n  laplacebench play --team-a <spec> --team-b <spec> [--games N] [--swap] [--serial] [--seed N] [--run-id <id>] [--submit] [--max-plies N] [--output-token-budget N] [--turn-timeout-ms N] [--ambient-cli-env]\n                                                    (non-interactive: --team-a and --team-b are required; anything else supplied is not asked for)\n  laplacebench summarize <runDir>\n  laplacebench regret <runDir> [--oracle product-cpu:cpu-v4:level_5]  (offline per-move regret vs frozen product oracle)\n  laplacebench export-web <runDir> [--out <dir>]   (verify + local replay JSON)\n  laplacebench verify <runDir...>                  (deterministic replay verification)\n  laplacebench submit <runDir>                     (verify + publish to the community ledger; needs gh auth)\n  laplacebench standings <runDir...> [--out <md>] [--json-out <json>]  (temporary v2 compatibility output)\n  laplacebench public-arena <runDir...> --out <dir> --source-sha <sha> --generated-at <time> [--harness-experiments <path>]  (CI artifact generator)\n\nmatch resources:\n  --serial                 run multiple games sequentially (default: parallel when --games > 1; learning agents always run sequentially)\n  --output-token-budget N  per team/game, in-game output tokens; optional cap with no default for any match (token cost is recorded and displayed, not capped)\n  --turn-timeout-ms N      shared across both attempts in a turn; default 1200000 for LLM matches (backstop), 300000 otherwise\n  --max-plies N            default 100 (canonical cap for laplace-8x8-v1 matches)\n  --ambient-cli-env        opt out of the default clean-room isolation for subscription-CLI agents; the run is recorded as the ambient (environment-copying) condition\n\nproduct CPU (play + regret):\n  bundled in the package; Python 3.11+ is required (no product checkout or commit input)\n\n" +
        usageAgentSpecsLine() +
        "\n  (claude-cli/codex-cli run under your Claude/ChatGPT subscription — no API key)"
    );
    process.exitCode = 1;
  }
}

// Guarded so tests can import arena() without executing the CLI entry point.
// The packaged binary (bin/laplacebench.js) calls runCli() explicitly.
export function runCli(): void {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

if (require.main === module) {
  runCli();
}
