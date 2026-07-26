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
  CANONICAL_OUTPUT_TOKEN_BUDGET,
  LLM_TURN_TIMEOUT_MS,
  playGame,
  resolveMaxPlies,
} from "./runner";
import { PROMPT_REV } from "./prompt";
import { usageAgentSpecsLine } from "./catalog";
import type { Agent } from "./types";

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
 * get the canonical token envelope and the backstop timeout; baseline-only
 * matches keep the old defaults (no tokens to meter). Explicit flags win.
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
      : llmMatch
        ? CANONICAL_OUTPUT_TOKEN_BUDGET
        : undefined;
  return { turnTimeoutMs, outputTokenBudget };
}

interface ProductCpuContext {
  productRepo: string;
  expectedCommit: string;
}

/** Resolve product repo + commit pin from CLI args and env. Fail-closed. */
function productCpuContext(args: Record<string, string | boolean>): ProductCpuContext {
  const productRepo = String(
    args["product-repo"] ?? process.env.LAPLACE_PRODUCT_REPO ?? ""
  );
  const expectedCommit = String(
    args["product-commit"] ?? process.env.LAPLACE_PRODUCT_COMMIT ?? ""
  );
  if (!productRepo) {
    throw new Error(
      "product-cpu specs need the product checkout: pass --product-repo or set LAPLACE_PRODUCT_REPO"
    );
  }
  if (!expectedCommit) {
    throw new Error(
      "product-cpu specs need a commit pin: pass --product-commit or set LAPLACE_PRODUCT_COMMIT"
    );
  }
  return { productRepo, expectedCommit };
}

async function makeAgent(
  spec: string,
  seed: number,
  ctx: { runDir: string; productCpu?: ProductCpuContext }
): Promise<Agent> {
  const productCpu = spec.match(PRODUCT_CPU_SPEC);
  if (productCpu) {
    if (!ctx.productCpu) {
      throw new Error(`product-cpu spec ${spec} used without --product-repo/--product-commit context`);
    }
    const { createProductCpuAgent } = require("./agents/productcpu") as typeof import("./agents/productcpu");
    return createProductCpuAgent(productCpu[2], seed, {
      productRepo: ctx.productCpu.productRepo,
      expectedCommit: ctx.productCpu.expectedCommit,
      expectedPolicy: productCpu[1],
    });
  }
  if (spec === "random") return randomAgent(seed);
  if (spec === "greedy") return greedyAgent(seed);
  if (spec === "center-greedy") return centerGreedyAgent(seed);
  const centerW = spec.match(/^center-greedy:w(\d+)$/);
  if (centerW) return centerGreedyAgent(seed, parseInt(centerW[1], 10));
  if (spec === "chaos") return chaosAgent(seed);
  if (spec === "takeshi") return takeshiAgent();
  const takeshiDepth = spec.match(/^takeshi:d(\d+)$/);
  if (takeshiDepth) return takeshiAgent(parseInt(takeshiDepth[1], 10));
  const anthropic = spec.match(/^anthropic:(.+)$/);
  if (anthropic) {
    // Lazy import so baseline runs never need the SDK or an API key.
    const { anthropicAgent } = require("./agents/llm") as typeof import("./agents/llm");
    return anthropicAgent({ model: anthropic[1] });
  }
  const claudeLearn = spec.match(/^claude-cli-learn(?::(.+))?$/);
  if (claudeLearn) {
    const { learningClaudeCliAgent } = require("./agents/learning") as typeof import("./agents/learning");
    return learningClaudeCliAgent({ ...splitModelEffort(claudeLearn[1]), runDir: ctx.runDir });
  }
  const claudeCli = spec.match(/^claude-cli(?::(.+))?$/);
  if (claudeCli) {
    const { claudeCliAgent } = require("./agents/cli") as typeof import("./agents/cli");
    return claudeCliAgent(splitModelEffort(claudeCli[1]));
  }
  const codexCli = spec.match(/^codex-cli(?::(.+))?$/);
  if (codexCli) {
    const { codexCliAgent } = require("./agents/cli") as typeof import("./agents/cli");
    return codexCliAgent(splitModelEffort(codexCli[1]));
  }
  throw new Error(`Unknown agent spec: ${spec}`);
}

/** "model@effort" | "model" | "@effort" | undefined -> {model?, effort?} */
function splitModelEffort(s: string | undefined): { model?: string; effort?: string } {
  if (!s) return {};
  const at = s.lastIndexOf("@");
  if (at === -1) return { model: s };
  const model = s.slice(0, at);
  const effort = s.slice(at + 1);
  return { model: model || undefined, effort: effort || undefined };
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

export async function arena(args: Record<string, string | boolean>): Promise<void> {
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

  const runId =
    (args["run-id"] as string) ||
    new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + `-${specA}-vs-${specB}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  // Runs live under the caller's working directory, not the package install.
  const runDir = path.resolve(process.cwd(), "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });

  // Metadata-only preflight: for product-cpu specs, spawn a bridge, verify
  // hello (policy/commit/dirty/tier), capture provenance, dispose — all
  // BEFORE run.json is written, so provenance and names are settled first.
  const productSpecs = [specA, specB].filter((s) => PRODUCT_CPU_SPEC.test(s));
  let productCpuCtx: ProductCpuContext | undefined;
  let productProvenance: object | null = null;
  if (productSpecs.length > 0) {
    productCpuCtx = productCpuContext(args);
    const { preflightProductCpu } = require("./agents/productcpu") as typeof import("./agents/productcpu");
    let hello: import("./agents/productcpu").BridgeHello | null = null;
    for (const spec of productSpecs) {
      const m = spec.match(PRODUCT_CPU_SPEC)!;
      hello = await preflightProductCpu(
        {
          productRepo: productCpuCtx.productRepo,
          expectedCommit: productCpuCtx.expectedCommit,
          expectedPolicy: m[1],
        },
        m[2]
      );
    }
    productProvenance = {
      policy_version: hello!.policy_version,
      product_commit: hello!.product_commit,
      python: hello!.python,
      protocol: hello!.protocol,
      product_repo: productCpuCtx.productRepo,
      dirty: hello!.product_dirty,
      teams: {
        A: PRODUCT_CPU_SPEC.test(specA)
          ? { spec: specA, level_id: specA.match(PRODUCT_CPU_SPEC)![2] }
          : null,
        B: PRODUCT_CPU_SPEC.test(specB)
          ? { spec: specB, level_id: specB.match(PRODUCT_CPU_SPEC)![2] }
          : null,
      },
    };
  }

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
          claude:
            specA.startsWith("claude-cli") || specB.startsWith("claude-cli")
              ? commandVersion("claude")
              : null,
          codex:
            specA.startsWith("codex-cli") || specB.startsWith("codex-cli")
              ? commandVersion("codex")
              : null,
        },
        product_cpu: productProvenance,
        started_at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  for (let g = 0; g < games; g++) {
    const swapped = swap && g % 2 === 1;
    const gameSeed = seed + g * 1000;
    const ctx = { runDir, productCpu: productCpuCtx };
    const first = await makeAgent(swapped ? specB : specA, gameSeed + 1, ctx);
    let second: Agent;
    try {
      second = await makeAgent(swapped ? specA : specB, gameSeed + 2, ctx);
    } catch (err) {
      await first.dispose?.();
      throw err;
    }
    const gameId = `game-${String(g).padStart(3, "0")}`;
    const label = `${gameId}: A=${first.name} vs B=${second.name}`;
    process.stdout.write(label + " ... ");
    const result = await playGame({
      gameId,
      runDir,
      seed: gameSeed,
      maxPlies,
      turnTimeoutMs,
      outputTokenBudget,
      agents: { A: first, B: second },
    });
    console.log(
      `${result.winner ? `winner=${result.winner} (${result.reason})` : `draw (${result.reason})`} plies=${result.plies}`
    );
  }

  const summary = summarize(runDir);
  console.log("\n=== summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nrun dir: ${runDir}`);
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
    await arena(args);
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
    const ctx = productCpuContext(args);
    const { analyzeRunRegret } = require("./regret") as typeof import("./regret");
    const summary = await analyzeRunRegret(runDir, {
      productRepo: ctx.productRepo,
      expectedCommit: ctx.expectedCommit,
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
    const result = writeArenaArtifacts(path.resolve(out), dirs, sourceSha, generatedAt);
    console.log(
      `public arena written: ${out} (${result.catalog.public_game_count} public / ` +
      `${result.catalog.verified_game_count} verified games)`
    );
  } else {
    console.log(
      "usage:\n  laplacebench play                                 (interactive: pick providers, models, effort)\n  laplacebench play --team-a <spec> --team-b <spec> [--games N] [--swap] [--seed N] [--run-id <id>] [--submit] [--max-plies N] [--output-token-budget N] [--turn-timeout-ms N]\n                                                    (non-interactive: --team-a and --team-b are required; anything else supplied is not asked for)\n  laplacebench summarize <runDir>\n  laplacebench regret <runDir> [--oracle product-cpu:cpu-v4:level_5]  (offline per-move regret vs frozen product oracle)\n  laplacebench export-web <runDir> [--out <dir>]   (verify + local replay JSON)\n  laplacebench verify <runDir...>                  (deterministic replay verification)\n  laplacebench submit <runDir>                     (verify + publish to the community ledger; needs gh auth)\n  laplacebench standings <runDir...> [--out <md>] [--json-out <json>]  (temporary v2 compatibility output)\n  laplacebench public-arena <runDir...> --out <dir> --source-sha <sha> --generated-at <time>  (CI artifact generator)\n\nmatch resources:\n  --output-token-budget N  per team/game, in-game output tokens; default 250000 for LLM matches (canonical envelope), none for baseline-only\n  --turn-timeout-ms N      shared across both attempts in a turn; default 1200000 for LLM matches (backstop), 300000 otherwise\n  --max-plies N            default 100 (canonical cap for laplace-8x8-v1 matches)\n\nproduct CPU (play + regret):\n  --product-repo <path>    product checkout (or env LAPLACE_PRODUCT_REPO)\n  --product-commit <sha>   required commit pin (or env LAPLACE_PRODUCT_COMMIT)\n\n" +
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
