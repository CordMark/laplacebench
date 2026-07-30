import * as path from "node:path";
import prompts from "prompts";
import { PRODUCT_CPU_POLICY, PROVIDERS, type ProviderEntry } from "./catalog";
import { MatchPreflightError } from "./playerrors";

/** Injectable I/O so the whole flow is testable with scripted answers. */
export interface WizardIO {
  select(title: string, options: string[], initial?: number): Promise<number>;
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
  "turn-timeout-ms", "run-id",
] as const;

/**
 * Presence-only booleans. A value is rejected rather than interpreted: the
 * parser turns `--submit false` into the string "false", which is truthy, so
 * interpreting values here would publish a run for someone who explicitly
 * wrote that they did not want it published.
 */
const BOOLEAN_FLAGS = ["swap", "submit", "serial", "ambient-cli-env"] as const;

const INTEGER_FLAGS = [
  "games", "seed", "max-plies", "output-token-budget", "turn-timeout-ms",
] as const;

/**
 * Integer flags that must be positive. Checked here rather than left to the
 * runner: the contract is that bad input costs nothing, and reaching the
 * runner means the auth preflight already ran and the settings were already
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
  valid: (n: number) => boolean,
  allowBack = false
): Promise<number | "back"> {
  for (;;) {
    const text = normalizePromptIntegerText(await io.input(prompt, def)).trim();
    if (text === "" && allowBack) return "back";
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

const BACK_LABEL = "← 前の項目に戻る";

type TeamState = {
  providerIndex: number;
  model: string;
  customModel: boolean;
  customModelValue: string;
  effort: string;
};

type Step =
  | { kind: "provider" | "model" | "custom-model" | "effort"; team: "A" | "B" }
  | { kind: "match-preset" | "games" | "swap" | "submit" };

function initialTeam(): TeamState {
  const provider = PROVIDERS[0];
  return {
    providerIndex: 0,
    model: provider.models[0].value,
    customModel: false,
    customModelValue: "",
    effort: provider.efforts[0] ?? "",
  };
}

function teamProvider(state: TeamState): ProviderEntry {
  return PROVIDERS[state.providerIndex];
}

function teamSpec(state: TeamState): string {
  return teamProvider(state).buildSpec(
    state.customModel ? state.customModelValue : state.model,
    state.effort
  );
}

async function selectStep(
  io: WizardIO,
  title: string,
  options: string[],
  initial: number,
  allowBack: boolean
): Promise<number | "back"> {
  const shown = allowBack ? [...options, BACK_LABEL] : options;
  const selected = await io.select(title, shown, Math.max(0, Math.min(initial, options.length - 1)));
  return allowBack && selected === options.length ? "back" : selected;
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
  interactive = true,
  allowBack = false
): Promise<"ok" | "back" | "cancelled" | "failed"> {
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
        if (deps.env[envVar]) {
          io.print(`  ✓ ${envVar}: 設定済み`);
        } else {
          io.print(`  ✗ ${envVar} が未設定です — export ${envVar}=... を実行してください`);
          failures.push(envVar);
        }
      }
      if (p.auth.note) {
        io.print(`    (${p.auth.note})`);
      }
    }
    if (failures.length === 0) return "ok";
    if (!interactive) {
      io.print(`不足: ${failures.join(", ")} — 解決してから再実行してください。対局は開始していません。`);
      return "failed";
    }
    const options = allowBack
      ? ["再チェック", "設定に戻る", "中止"]
      : ["再チェック", "中止"];
    const choice = await io.select("解決後に再チェックしますか?", options, 0);
    if (allowBack && choice === 1) return "back";
    if (choice === options.length - 1) return "cancelled";
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
  const teamAFlag = flag("team-a");
  const teamBFlag = flag("team-b");
  const gamesFlag = flag("games");
  const swapFlag = args["swap"] === true ? true : undefined;
  const submitFlag = args["submit"] === true ? true : undefined;

  if (!interactive) {
    const a = { spec: teamAFlag!, provider: providerFor(teamAFlag!) };
    const b = { spec: teamBFlag!, provider: providerFor(teamBFlag!) };
    const games = gamesFlag === undefined ? 2 : parseInt(gamesFlag, 10);
    const swap = swapFlag ?? false;
    const gate = await authGate(io, deps, [a.provider, b.provider], false);
    if (gate !== "ok") return { cancelled: true };
    const seed = flag("seed") === undefined ? deps.randomSeed() : parseInt(flag("seed")!, 10);
    const summaryLines = [
      `Team A: ${a.spec}`,
      `Team B: ${b.spec}`,
      `games=${games} swap=${swap ? "on" : "off"} seed=${seed}`,
      `自動提出: ${submitFlag ? "する" : "しない"}`,
    ];
    return { specA: a.spec, specB: b.spec, games, swap, seed, autoSubmit: submitFlag ?? false, summaryLines };
  }

  const teams: Record<"A" | "B", TeamState> = { A: initialTeam(), B: initialTeam() };
  let detailed = false;
  let customGames = gamesFlag === undefined ? 2 : parseInt(gamesFlag, 10);
  let customSwap = swapFlag ?? true;
  let autoSubmit = submitFlag ?? false;

  const steps = (): Step[] => {
    const result: Step[] = [];
    for (const team of ["A", "B"] as const) {
      if ((team === "A" ? teamAFlag : teamBFlag) !== undefined) continue;
      const state = teams[team];
      const provider = teamProvider(state);
      result.push({ kind: "provider", team }, { kind: "model", team });
      if (state.customModel) result.push({ kind: "custom-model", team });
      if (provider.efforts.length > 0) result.push({ kind: "effort", team });
    }
    if (gamesFlag === undefined && swapFlag === undefined) {
      result.push({ kind: "match-preset" });
      if (detailed) result.push({ kind: "games" }, { kind: "swap" });
    } else {
      if (gamesFlag === undefined) result.push({ kind: "games" });
      if (swapFlag === undefined) result.push({ kind: "swap" });
    }
    if (submitFlag === undefined) result.push({ kind: "submit" });
    return result;
  };

  let position = 0;
  for (;;) {
    const currentSteps = steps();
    if (position >= currentSteps.length) {
      const providers = [
        teamAFlag === undefined ? teamProvider(teams.A) : providerFor(teamAFlag),
        teamBFlag === undefined ? teamProvider(teams.B) : providerFor(teamBFlag),
      ];
      const gate = await authGate(io, deps, providers, true, currentSteps.length > 0);
      if (gate === "back") {
        position = currentSteps.length - 1;
        continue;
      }
      if (gate !== "ok") return { cancelled: true };
      break;
    }

    const step = currentSteps[position];
    const allowBack = position > 0;
    let goBack = false;
    if (step.kind === "provider") {
      const state = teams[step.team];
      const selected = await selectStep(
        io,
        `Team ${step.team} のAIを選択:`,
        PROVIDERS.map((provider) => provider.label),
        state.providerIndex,
        allowBack
      );
      if (selected === "back") goBack = true;
      else if (selected !== state.providerIndex) {
        const next = PROVIDERS[selected];
        state.providerIndex = selected;
        if (!next.models.some((model) => model.value === state.model) || state.customModel) {
          state.model = next.models[0].value;
          state.customModel = false;
          state.customModelValue = "";
        }
        if (!next.efforts.includes(state.effort)) state.effort = next.efforts[0] ?? "";
      }
    } else if (step.kind === "model") {
      const state = teams[step.team];
      const provider = teamProvider(state);
      const options = provider.models.map((model) => model.label);
      if (provider.allowCustomModel) options.push("(手入力)");
      const current = state.customModel
        ? provider.models.length
        : Math.max(0, provider.models.findIndex((model) => model.value === state.model));
      const selected = await selectStep(io, "モデル:", options, current, allowBack);
      if (selected === "back") goBack = true;
      else if (provider.allowCustomModel && selected === provider.models.length) {
        state.customModel = true;
      } else {
        state.model = provider.models[selected].value;
        state.customModel = false;
      }
    } else if (step.kind === "custom-model") {
      const state = teams[step.team];
      const value = (await io.input(
        allowBack ? "モデルIDを入力（空のままEnterで戻る）:" : "モデルIDを入力:",
        state.customModelValue || undefined
      )).trim();
      if (value === "" && allowBack) goBack = true;
      else if (value === "") io.print("モデルIDを入力してください");
      else state.customModelValue = value;
    } else if (step.kind === "effort") {
      const state = teams[step.team];
      const provider = teamProvider(state);
      const initial = Math.max(0, provider.efforts.indexOf(state.effort));
      const selected = await selectStep(io, "effort:", provider.efforts, initial, allowBack);
      if (selected === "back") goBack = true;
      else state.effort = provider.efforts[selected];
    } else if (step.kind === "match-preset") {
      const selected = await selectStep(
        io,
        "対局数:",
        ["2局・先後交代（推奨）", "詳細設定"],
        detailed ? 1 : 0,
        allowBack
      );
      if (selected === "back") goBack = true;
      else detailed = selected === 1;
    } else if (step.kind === "games") {
      const selected = await promptInteger(
        io,
        allowBack ? "対局数（空のままEnterで戻る）:" : "対局数:",
        String(customGames),
        (value) => value >= 1,
        allowBack
      );
      if (selected === "back") goBack = true;
      else customGames = selected;
    } else if (step.kind === "swap") {
      const selected = await selectStep(
        io,
        "先後:",
        ["先後を交代する", "固定する"],
        customSwap ? 0 : 1,
        allowBack
      );
      if (selected === "back") goBack = true;
      else customSwap = selected === 0;
    } else {
      const selected = await selectStep(
        io,
        "終了後に公開台帳へ自動提出しますか?",
        ["GitHubで公開提出する（検証後、自動マージ）", "今回は提出しない"],
        autoSubmit ? 0 : 1,
        allowBack
      );
      if (selected === "back") goBack = true;
      else autoSubmit = selected === 0;
    }

    if (goBack) position = Math.max(0, position - 1);
    else position += 1;
  }

  const specA = teamAFlag ?? teamSpec(teams.A);
  const specB = teamBFlag ?? teamSpec(teams.B);
  const games = gamesFlag !== undefined ? parseInt(gamesFlag, 10) : detailed || swapFlag !== undefined ? customGames : 2;
  const swap = swapFlag !== undefined ? swapFlag : detailed || gamesFlag !== undefined ? customSwap : true;
  const seedFlag = flag("seed");
  const seed = seedFlag === undefined ? deps.randomSeed() : parseInt(seedFlag, 10);
  const matchSummary = `games=${games} swap=${swap ? "on" : "off"}` +
    (seedFlag !== undefined ? ` seed=${seed}` : "");
  return {
    specA,
    specB,
    games,
    swap,
    seed,
    autoSubmit,
    summaryLines: [
      `Team A: ${specA}`,
      `Team B: ${specB}`,
      matchSummary,
      `自動提出: ${autoSubmit ? "する" : "しない"}`,
    ],
  };
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
    async select(title, options, initial = 0) {
      return ask<number>({
        type: "select",
        name: "value",
        message: title,
        initial: Math.max(0, Math.min(initial, options.length - 1)),
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
const PASSTHROUGH_BOOLEAN_FLAGS = ["serial", "ambient-cli-env"] as const;

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
    rlio.print("── 対局設定 ──");
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
    let failedGames: number;
    try {
      ({ failedGames } = await deps.runArena({
        "team-a": result.specA,
        "team-b": result.specB,
        games: String(result.games),
        ...(result.swap ? { swap: true } : {}),
        seed: String(result.seed),
        "run-id": runId,
        ...passthrough,
      }));
    } catch (error) {
      if (!(error instanceof MatchPreflightError)) throw error;
      rlio.print(
        `対局を開始できません: ${error.message}`
      );
      return 1;
    }
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
