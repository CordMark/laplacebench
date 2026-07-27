import * as path from "node:path";
import prompts from "prompts";
import { PRODUCT_CPU_POLICY, PROVIDERS, type ProviderEntry } from "./catalog";

/** Injectable I/O so the whole flow is testable with scripted answers. */
export interface WizardIO {
  select(title: string, options: string[]): Promise<number>;
  input(prompt: string, def?: string): Promise<string>;
  print(line: string): void;
}

/** Raised only when the person explicitly cancels an interactive prompt. */
export class WizardCancelledError extends Error {
  constructor() {
    super("wizard cancelled");
    this.name = "WizardCancelledError";
  }
}

/** Narrow prompt-runner seam: production uses `prompts`, tests inject a fake. */
export type PromptRunner = <T extends string = string>(
  question: prompts.PromptObject<T>,
  options?: prompts.Options
) => Promise<prompts.Answers<T>>;

export interface WizardDeps {
  env: NodeJS.ProcessEnv;
  /** Command presence check (injectable; real impl uses `<cmd> --version`). */
  checkCommand(cmd: string): { ok: boolean; version?: string };
  /** Seed source (injectable for determinism in tests). */
  randomSeed(): number;
}

export interface WizardPlan {
  specA: string;
  specB: string;
  games: number;
  swap: boolean;
  seed: number;
  /** Publish the finished run without a second prompt. */
  autoSubmit: boolean;
  /** Extra arena args (e.g. product repo/commit collected interactively). */
  extraArgs: Record<string, string>;
  summaryLines: string[];
}

export type WizardResult = WizardPlan | { cancelled: true };

export function isCancelled(r: WizardResult): r is { cancelled: true } {
  return (r as { cancelled?: boolean }).cancelled === true;
}

/**
 * Flags that must be followed by a value. The shared parser stores `true` when
 * a flag has no value, so a bare `--team-a` would otherwise become the literal
 * spec "true" and start a match against a model nobody named.
 */
const VALUE_FLAGS = [
  "team-a", "team-b", "games", "seed", "max-plies", "output-token-budget",
  "turn-timeout-ms", "run-id", "product-repo", "product-commit",
] as const;

/**
 * Presence-only booleans. A value is rejected rather than interpreted: the
 * parser turns `--submit false` into the string "false", which is truthy, so
 * interpreting values here would publish a run for someone who explicitly
 * wrote that they did not want it published.
 */
const BOOLEAN_FLAGS = ["swap", "submit", "serial"] as const;

const INTEGER_FLAGS = [
  "games", "seed", "max-plies", "output-token-budget", "turn-timeout-ms",
] as const;

/**
 * Integer flags that must be positive. Checked here rather than left to the
 * runner: the contract is that bad input costs nothing, and reaching the
 * runner means the auth preflight already ran and "対局開始" was already
 * printed for a match that then dies.
 */
const POSITIVE_FLAGS = [
  "games", "max-plies", "output-token-budget", "turn-timeout-ms",
] as const;

const RECOGNIZED = new Set<string>([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);

/** The predicate the interactive prompt uses, shared so the two cannot drift. */
export function isIntegerText(text: string): boolean {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) && Number.isSafeInteger(parseInt(trimmed, 10));
}

/** Japanese IME users may enter full-width digits in integer text prompts. */
export function normalizePromptIntegerText(text: string): string {
  return text.replace(/[０-９]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xfee0)
  );
}

/**
 * Syntax and range check for `play`'s flags. Runs before authentication and
 * before any match starts, and reports every problem at once rather than the
 * first one.
 */
export function flagErrors(args: Record<string, string | boolean>): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(args)) {
    if (!RECOGNIZED.has(key)) {
      errors.push(`--${key} は認識できないフラグです`);
      continue;
    }
    const value = args[key];
    if ((BOOLEAN_FLAGS as readonly string[]).includes(key)) {
      if (value !== true) {
        errors.push(`--${key} は値を取りません (--${key} とだけ書いてください)`);
      }
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`--${key} には値が必要です`);
      continue;
    }
    if ((INTEGER_FLAGS as readonly string[]).includes(key)) {
      if (!isIntegerText(value)) {
        errors.push(`--${key} には整数を指定してください`);
      } else if (
        (POSITIVE_FLAGS as readonly string[]).includes(key) &&
        parseInt(value.trim(), 10) < 1
      ) {
        errors.push(`--${key} には 1 以上の整数を指定してください`);
      }
    }
  }
  return errors;
}

/** Strict integer prompt: the WHOLE input must be an integer and satisfy
 * `valid`; otherwise re-prompt. `0` and negatives are legal where `valid`
 * allows them — no silent fallback replaces a parseable answer. */
async function promptInteger(
  io: WizardIO,
  prompt: string,
  def: string,
  valid: (n: number) => boolean
): Promise<number> {
  for (;;) {
    const text = normalizePromptIntegerText(await io.input(prompt, def)).trim();
    if (isIntegerText(text)) {
      const n = parseInt(text, 10);
      if (valid(n)) return n;
    }
    io.print("整数を入力してください");
  }
}

/**
 * The provider a recorded spec belongs to, so a flag-supplied team faces the
 * same auth requirements the menu-selected one would. A spec whose prefix is
 * not a published provider (a baseline like `takeshi:d2`, or anything
 * free-form) maps to the baseline entry, which requires no credentials —
 * matching how such specs already run today.
 */
export function providerFor(spec: string): ProviderEntry {
  const harness = spec.includes(":") ? spec.slice(0, spec.indexOf(":")) : spec;
  // A harness that is not itself a published provider still borrows another
  // provider's credentials. `claude-cli-learn` drives the Claude CLI, so
  // treating it as a baseline would let a headless run start without the CLI
  // installed — the one thing the preflight exists to prevent.
  const owner = AUTH_OWNER[harness] ?? harness;
  return PROVIDERS.find((p) => p.key === owner)
    ?? PROVIDERS.find((p) => p.key === "baseline")!;
}

/** Harnesses whose credentials belong to another provider entry. */
const AUTH_OWNER: Readonly<Record<string, string>> = {
  "claude-cli-learn": "claude-cli",
};

async function pickTeam(io: WizardIO, teamName: string): Promise<{ spec: string; provider: ProviderEntry }> {
  const p = await io.select(
    `Team ${teamName} のAIを選択:`,
    PROVIDERS.map((x) => x.label)
  );
  const provider = PROVIDERS[p];

  const modelOptions = provider.models.map((m) => m.label);
  if (provider.allowCustomModel) modelOptions.push("(手入力)");
  const mi = await io.select("モデル:", modelOptions);
  let model: string;
  if (provider.allowCustomModel && mi === provider.models.length) {
    model = (await io.input("モデルIDを入力:")).trim();
  } else {
    model = provider.models[mi].value;
  }

  let effort = "";
  if (provider.efforts.length > 1) {
    const ei = await io.select(
      "effort:",
      provider.efforts.map((e) => (e === "" ? "default" : e))
    );
    effort = provider.efforts[ei];
  }

  return { spec: provider.buildSpec(model, effort), provider };
}

/**
 * Auth checks run LAST, over the union of the two selected providers'
 * requirements. Fail-closed: the plan is only returned once every
 * requirement passes (or the user aborts).
 */
/**
 * `interactive: false` collapses the retry loop to a single evaluation and
 * never prompts. A headless run must either start or fail saying exactly what
 * is missing — waiting on stdin that nobody is attached to is the one outcome
 * that helps no-one.
 */
async function authGate(
  io: WizardIO,
  deps: WizardDeps,
  providers: ProviderEntry[],
  extraArgs: Record<string, string>,
  interactive = true
): Promise<"ok" | "cancelled" | "failed"> {
  for (;;) {
    const failures: string[] = [];
    io.print("── 認証チェック ──");
    const seen = new Set<string>();
    for (const p of providers) {
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      for (const cmd of p.auth.commands) {
        const res = deps.checkCommand(cmd);
        if (res.ok) {
          io.print(`  ✓ ${cmd} CLI: ${res.version ?? "found"}`);
        } else {
          io.print(`  ✗ ${cmd} CLI が見つかりません — インストール/ログイン後に再チェックしてください`);
          failures.push(cmd);
        }
      }
      for (const envVar of p.auth.envVars) {
        if (p.key === "product-cpu") continue; // handled below (interactive)
        if (deps.env[envVar]) {
          io.print(`  ✓ ${envVar}: 設定済み`);
        } else {
          io.print(`  ✗ ${envVar} が未設定です — export ${envVar}=... を実行してください`);
          failures.push(envVar);
        }
      }
      if (p.key === "product-cpu") {
        const repo =
          extraArgs["product-repo"] ?? deps.env.LAPLACE_PRODUCT_REPO ?? "";
        const commit =
          extraArgs["product-commit"] ?? deps.env.LAPLACE_PRODUCT_COMMIT ?? "";
        if (repo && commit) {
          extraArgs["product-repo"] = repo;
          extraArgs["product-commit"] = commit;
          io.print(`  ✓ product checkout: ${repo} @ ${commit.slice(0, 12)}`);
        } else if (!interactive) {
          io.print("  ✗ product checkout のパスとコミット pin が必要です (--product-repo / --product-commit または LAPLACE_PRODUCT_REPO / LAPLACE_PRODUCT_COMMIT)");
          failures.push("product-cpu");
        } else {
          const r = (await io.input("product checkout のパス:", repo)).trim();
          const c = (await io.input("pin するコミットSHA:", commit)).trim();
          if (r && c) {
            extraArgs["product-repo"] = r;
            extraArgs["product-commit"] = c;
            io.print(`  ✓ product checkout: ${r} @ ${c.slice(0, 12)}`);
          } else {
            io.print("  ✗ product checkout のパスとコミット pin が必要です");
            failures.push("product-cpu");
          }
        }
      }
      if (p.auth.note && (p.auth.commands.length || p.auth.envVars.length)) {
        io.print(`    (${p.auth.note})`);
      }
    }
    if (failures.length === 0) return "ok";
    if (!interactive) {
      io.print(`不足: ${failures.join(", ")} — 解決してから再実行してください。対局は開始していません。`);
      return "failed";
    }
    const choice = await io.select("解決後に再チェックしますか?", [
      "再チェック",
      "中止",
    ]);
    if (choice === 1) return "cancelled";
  }
}

/**
 * One flow for both entry modes. A flag that was supplied replaces its prompt;
 * only what is still unknown is asked, and only when someone is there to
 * answer. With every required flag present this asks nothing at all, which is
 * what makes `play` usable from a script.
 */
export async function runWizardFlow(
  io: WizardIO,
  deps: WizardDeps,
  args: Record<string, string | boolean> = {},
  interactive = true
): Promise<WizardResult> {
  const flag = (key: string): string | undefined =>
    typeof args[key] === "string" ? (args[key] as string) : undefined;

  const a = flag("team-a") !== undefined
    ? { spec: flag("team-a")!, provider: providerFor(flag("team-a")!) }
    : await pickTeam(io, "A");
  const b = flag("team-b") !== undefined
    ? { spec: flag("team-b")!, provider: providerFor(flag("team-b")!) }
    : await pickTeam(io, "B");

  // Resolved independently. Collapsing the two would let `play --games 4`
  // silently decide side-swapping, which the player never chose.
  const gamesFlag = flag("games");
  const swapFlag = args["swap"] === true ? true : undefined;
  let games = gamesFlag !== undefined ? parseInt(gamesFlag, 10) : 2;
  let swap = swapFlag ?? false;
  if (interactive && gamesFlag === undefined && swapFlag === undefined) {
    // Neither supplied: the canonical preset still answers both at once.
    const preset = await io.select("対局数:", [
      "2局・先後交代（推奨）",
      "詳細設定",
    ]);
    swap = true;
    if (preset === 1) {
      games = await promptInteger(io, "対局数:", "2", (n) => n >= 1);
      swap = (await io.select("先後:", ["先後を交代する", "固定する"])) === 0;
    }
  } else if (interactive) {
    // One was supplied: ask for the other rather than assuming it.
    if (gamesFlag === undefined) {
      games = await promptInteger(io, "対局数:", "2", (n) => n >= 1);
    }
    if (swapFlag === undefined) {
      swap = (await io.select("先後:", ["先後を交代する", "固定する"])) === 0;
    }
  }
  if (!Number.isSafeInteger(games) || games < 1) {
    io.print("--games は 1 以上の整数で指定してください");
    return { cancelled: true };
  }

  const seedFlag = flag("seed");
  const seed = seedFlag !== undefined
    ? parseInt(seedFlag, 10)
    : deps.randomSeed();

  // Asked here, while the player is still making decisions, so the run itself
  // ends hands-off. Publishing is on the player's account, so it is never the
  // default — and never implied by a flag the player did not write.
  const autoSubmit = args["submit"] === true
    ? true
    : interactive
      ? (await io.select("終了後に公開台帳へ自動提出しますか?", [
          "今回は提出しない",
          "GitHubで公開提出する（検証後、自動マージ）",
        ])) === 1
      : false;

  const extraArgs: Record<string, string> = {};
  for (const key of ["product-repo", "product-commit"] as const) {
    const value = flag(key);
    if (value !== undefined) extraArgs[key] = value;
  }
  const gate = await authGate(io, deps, [a.provider, b.provider], extraArgs, interactive);
  if (gate === "cancelled" || gate === "failed") return { cancelled: true };

  const matchSummary = `games=${games} swap=${swap ? "on" : "off"}` +
    (!interactive || seedFlag !== undefined ? ` seed=${seed}` : "");
  const summaryLines = [
    `Team A: ${a.spec}`,
    `Team B: ${b.spec}`,
    matchSummary,
    `自動提出: ${autoSubmit ? "する" : "しない"}`,
  ];
  return { specA: a.spec, specB: b.spec, games, swap, seed, autoSubmit, extraArgs, summaryLines };
}

/** Same sanitization as arena's default run-id derivation. */
export function wizardRunId(specA: string, specB: string, now: Date): string {
  return (
    now.toISOString().replace(/[:.]/g, "").slice(0, 15) +
    `-${specA}-vs-${specB}`.replace(/[^a-zA-Z0-9_-]/g, "_")
  );
}

export function submissionGuidance(runId: string): string[] {
  return [
    "── community 提出(任意) ──",
    "このランを公開台帳に載せるには:",
    `  laplacebench submit runs/${runId}`,
    "リプレイ検証を通してから提出まで行います (gh の認証が必要)。",
    "",
    "手動で行う場合:",
    `  cp -R runs/${runId} community/runs/<github名>--${runId}`,
    "その後 laplacebench リポジトリへ pull request を送ってください。",
    "どちらの経路でも CI が凍結エンジンでリプレイ検証し、通れば自動マージ",
    "します。対戦記録はマージ後に CI が再生成するので、こちらで集計を",
    "更新する必要はありません (community/README.md 参照)。",
  ];
}

/**
 * Said on every completion, interactive or not. The whole point of folding the
 * entry points together is that nobody finishes a match wondering whether it
 * was published: the run either says it published, or says it did not and what
 * the next command is.
 */
export function submissionState(
  runId: string,
  outcome: "submitted" | "not-submitted" | "failed"
): string[] {
  if (outcome === "submitted") {
    return [`✓ 公開台帳へ提出しました (runs/${runId})`];
  }
  const head = outcome === "failed"
    ? ["✗ 提出に失敗しました。対局のログは runs/ に残っています。"]
    : ["ℹ このランはまだ提出されていません（提出は既定では行いません）。"];
  return [...head, ...submissionGuidance(runId)];
}

export function makePromptIO(
  runPrompt: PromptRunner = prompts
): WizardIO & { close(): void } {
  const ask = async <T>(question: prompts.PromptObject<"value">): Promise<T> => {
    let cancelled = false;
    const answer = await runPrompt(question, {
      onCancel: () => {
        cancelled = true;
        return false;
      },
    });
    if (cancelled || !Object.prototype.hasOwnProperty.call(answer, "value")) {
      throw new WizardCancelledError();
    }
    return answer.value as T;
  };
  return {
    async select(title, options) {
      return ask<number>({
        type: "select",
        name: "value",
        message: title,
        initial: 0,
        hint: "↑/↓で選択・Enterで決定（Escで中止）",
        choices: options.map((option, index) => ({ title: option, value: index })),
      });
    },
    async input(prompt, def) {
      return ask<string>({
        type: "text",
        name: "value",
        message: prompt,
        ...(def !== undefined ? { initial: def } : {}),
      });
    },
    print(line) {
      console.log(line);
    },
    close() {},
  };
}

export interface RunPlayDeps extends WizardDeps {
  runArena(args: Record<string, string | boolean>): Promise<{ failedGames: number }>;
  /**
   * Publish a finished run; injected so the wizard stays testable offline.
   * Returns the outcome because `submitRun` reports refusal (failed replay
   * verification, missing GitHub auth, already submitted) by RETURNING
   * `blocked`, not by throwing — reporting those as success would be exactly
   * the silent-publication lie this entry point exists to remove.
   */
  submitRun(runDir: string): { status: string; detail?: string } | void;
  isTTY: boolean;
  now(): Date;
}

/** Match settings that pass straight through to the runner. */
const PASSTHROUGH_FLAGS = [
  "max-plies", "output-token-budget", "turn-timeout-ms",
] as const;

/** Presence-only flags that pass straight through to the runner. */
const PASSTHROUGH_BOOLEAN_FLAGS = ["serial"] as const;

/**
 * The single entry point for running a match. Flags decide how much of it is
 * interactive: with `--team-a` and `--team-b` present it asks nothing and works
 * headless, and without them it is the wizard it has always been.
 */
export async function runPlay(
  deps: RunPlayDeps,
  io?: WizardIO,
  args: Record<string, string | boolean> = {}
): Promise<number> {
  const rlio = io ?? makePromptIO();
  try {
    const errors = flagErrors(args);
    if (errors.length > 0) {
      errors.forEach((line) => rlio.print(line));
      rlio.print("対局は開始していません。");
      return 1;
    }
    // Both teams are the one thing no default can supply honestly: guessing an
    // opponent for a headless caller would run a match nobody asked for.
    const missing = (["team-a", "team-b"] as const)
      .filter((key) => typeof args[key] !== "string");
    const interactive = deps.isTTY;
    if (!interactive && missing.length > 0) {
      rlio.print(
        `対話できない環境では ${missing.map((m) => `--${m}`).join(" と ")} が必要です。対局は開始していません。`
      );
      return 1;
    }

    let result: WizardResult;
    try {
      result = await runWizardFlow(rlio, deps, args, interactive);
    } catch (error) {
      if (!(error instanceof WizardCancelledError)) throw error;
      rlio.print("中止しました。対局は開始されていません。");
      return 1;
    }
    if (isCancelled(result)) {
      rlio.print("中止しました。対局は開始されていません。");
      return 1;
    }
    rlio.print("── 対局開始 ──");
    result.summaryLines.forEach((l) => rlio.print(`  ${l}`));
    const runId = typeof args["run-id"] === "string"
      ? args["run-id"]
      : wizardRunId(result.specA, result.specB, deps.now());
    const passthrough: Record<string, string | boolean> = {};
    for (const key of PASSTHROUGH_FLAGS) {
      if (typeof args[key] === "string") passthrough[key] = args[key] as string;
    }
    for (const key of PASSTHROUGH_BOOLEAN_FLAGS) {
      if (args[key] === true) passthrough[key] = true;
    }
    const { failedGames } = await deps.runArena({
      "team-a": result.specA,
      "team-b": result.specB,
      games: String(result.games),
      ...(result.swap ? { swap: true } : {}),
      seed: String(result.seed),
      "run-id": runId,
      ...passthrough,
      ...result.extraArgs,
    });
    if (failedGames > 0) {
      // A partial run must never reach the public ledger, even when the
      // caller asked for --submit: the completed games are on disk for
      // inspection, but publication requires a run whose games all finished.
      rlio.print(
        `${failedGames} 局が失敗しました。部分的な run は提出しません。`
      );
      submissionState(runId, "not-submitted").forEach((l) => rlio.print(l));
      return 1;
    }
    if (result.autoSubmit) {
      rlio.print("── 公開台帳へ提出 ──");
      try {
        const outcome = deps.submitRun(path.join("runs", runId));
        // Only an explicit non-"submitted" status counts as not published; a
        // void return keeps the historical "no news is good news" contract.
        const published = !(
          typeof outcome === "object" &&
          outcome !== null &&
          typeof outcome.status === "string" &&
          outcome.status !== "submitted"
        );
        submissionState(runId, published ? "submitted" : "failed")
          .forEach((l) => rlio.print(l));
      } catch (e) {
        // The match itself succeeded and its log is on disk; a push conflict or
        // a git failure must not end the session with a stack trace and no way
        // forward. Fall back to the manual route.
        rlio.print(`提出に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
        submissionState(runId, "failed").forEach((l) => rlio.print(l));
      }
    } else {
      submissionState(runId, "not-submitted").forEach((l) => rlio.print(l));
    }
    return 0;
  } finally {
    (rlio as { close?: () => void }).close?.();
  }
}
