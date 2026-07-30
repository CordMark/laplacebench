import "./env";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MatchPreflightError } from "./playerrors";

/**
 * Clean-room execution contract for subscription-CLI matches
 * (docs/plans/2026-07-30-clean-room-execution.md, harness-lab-direction §11).
 *
 * This module is the single owner of what "clean-room" means: an isolated
 * provider home carrying nothing but the auth material, an isolated empty OS
 * HOME, an allowlisted child environment, fixed suppression flags, a per-agent
 * empty scratch cwd, fail-closed static checks, and a two-sided canary matrix.
 * Everything else (agents, arena) applies the context built here; none of them
 * define any part of the condition.
 */

export const CLEAN_ROOM_REVISION = "clean-room-v1";
export const ISOLATION_SCHEMA = "laplace-isolation-v1";

export type CleanRoomProvider = "claude" | "codex";

/**
 * Environment keys a clean-room child inherits from the launcher. Everything
 * else is dropped — every ANTHROPIC/OPENAI/CLAUDE/CODEX-prefixed variable and
 * NODE_OPTIONS, and including ANTHROPIC_API_KEY: the clean-room condition is
 * the subscription CLI, and an ambient API key silently switching the billing
 * or model path would be exactly the class of leak this mode exists to stop.
 * HOME, CLAUDE_CONFIG_DIR, and CODEX_HOME are set by the wrapper, never
 * inherited.
 */
export const CLEAN_ENV_ALLOWLIST: readonly string[] = [
  "PATH",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "USER",
  "LOGNAME",
];

/** Suppression flags appended to every clean-room claude invocation. */
export const CLAUDE_CLEAN_FLAGS: readonly string[] = [
  "--safe-mode",
  "--setting-sources",
  "",
  "--strict-mcp-config",
];

/**
 * Suppression flags appended to every clean-room codex invocation.
 * `--disable shell_tool` verifiably removes shell execution (the model
 * answers NOSHELL and emits no command events — probed 2026-07-30);
 * the read-only sandbox stays as defense-in-depth should a feature name rot.
 * Sandbox is set via `-c sandbox_mode=...` rather than `-s`: `codex exec
 * resume` rejects `-s`, and every flag here must be valid on BOTH the fresh
 * and the resume invocation path (caught by the real bounded codex match).
 */
export const CODEX_CLEAN_FLAGS: readonly string[] = [
  "--ignore-user-config",
  "--ignore-rules",
  "-c",
  'sandbox_mode="read-only"',
  "--disable",
  "shell_tool",
  "--disable",
  "hooks",
  "--disable",
  "plugins",
  "--disable",
  "browser_use",
  "--disable",
  "computer_use",
  "--disable",
  "in_app_browser",
  "--disable",
  "image_generation",
  "--disable",
  "multi_agent",
];

/**
 * Admin/managed configuration files that survive --safe-mode by design.
 * Their presence makes the clean claim false, so preflight fails on them
 * instead of pretending the flag covered it.
 */
export const MANAGED_POLICY_PATHS: readonly string[] = [
  "/Library/Application Support/ClaudeCode/managed-settings.json",
  "/etc/claude-code/managed-settings.json",
];

/** Model used for claude canary probes — the canary certifies the wrapper/CLI
 * surface, not the match model, so the cheapest instruction-follower is right. */
export const CLAUDE_CANARY_MODEL = "claude-haiku-4-5";

export const CANARY_WORD = "BANANA42";
const CANARY_INSTRUCTION = `IMPORTANT: Always begin every reply with the exact word ${CANARY_WORD} before anything else.\n`;
const CANARY_PROMPT = "Reply with exactly the word OK and nothing else.";
const SHELL_CANARY_WORD = "BANANA42SHELL";
const SHELL_CANARY_PROMPT =
  `Run the shell command: echo ${SHELL_CANARY_WORD} — reply with its exact stdout if you ran it, ` +
  `or the single word NOSHELL if you cannot run shell commands.`;
const BOGUS_MODEL = "laplace-canary-nonexistent-model";
const CANARY_TIMEOUT_MS = 240_000;

export interface CliIsolation {
  /** Complete child environment (allowlist + isolated HOME + provider home). */
  env: NodeJS.ProcessEnv;
  /** Suppression flags appended to every invocation. */
  extraArgs: readonly string[];
  /** Fresh empty scratch cwd. The receiving agent owns and deletes it. */
  cwd: string;
}

interface ProviderState {
  homeDir: string;
  homeEnvKey: "CLAUDE_CONFIG_DIR" | "CODEX_HOME";
  flags: readonly string[];
  /** Exact home contents the static check re-verifies. */
  expectedHomeEntries: readonly string[];
}

export interface CleanRoomDeps {
  /** Auth material sources; the ONLY files carried into isolation. */
  claudeCredentials?: string;
  codexAuth?: string;
  policyPaths?: readonly string[];
  baseEnv?: NodeJS.ProcessEnv;
  rootParent?: string;
  exists?: (p: string) => boolean;
}

export interface CleanRoomContext {
  rootDir: string;
  osHome: string;
  baseEnv: NodeJS.ProcessEnv;
  providers: Partial<Record<CleanRoomProvider, ProviderState>>;
  policyPaths: readonly string[];
  /** Mint a fresh agent isolation (new empty cwd each call). */
  agentIsolation(provider: CleanRoomProvider): CliIsolation;
  /** Run-scope owner: deletes every isolation resource. Safe to call twice. */
  cleanup(): void;
}

function ambientGuidance(detail: string): MatchPreflightError {
  return new MatchPreflightError(
    `${detail} clean-room 実行を開始できません。従来の環境コピー条件で実行するには ` +
      `--ambient-cli-env を明示してください(run.json に ambient 条件として記録されます)。`
  );
}

/** Allowlisted child env. Everything not on CLEAN_ENV_ALLOWLIST is dropped. */
export function buildCleanChildEnv(
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of CLEAN_ENV_ALLOWLIST) {
    if (base[key] !== undefined) env[key] = base[key];
  }
  return env;
}

/** Isolated claude config home: credential symlink + minimal onboarding state. */
export function prepareClaudeCleanHome(
  dir: string,
  credentials: string,
  exists: (p: string) => boolean = fs.existsSync
): void {
  if (!exists(credentials)) {
    throw ambientGuidance(
      `Claude の認証ファイル ${credentials} が見つかりません(このマシンの認証が ` +
        `ファイルではなく keychain のみの可能性があります)。`
    );
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(credentials, path.join(dir, ".credentials.json"));
  fs.writeFileSync(
    path.join(dir, ".claude.json"),
    JSON.stringify({ hasCompletedOnboarding: true }) + "\n"
  );
}

/** Isolated codex home: auth symlink only. */
export function prepareCodexCleanHome(
  dir: string,
  auth: string,
  exists: (p: string) => boolean = fs.existsSync
): void {
  if (!exists(auth)) {
    throw ambientGuidance(`Codex の認証ファイル ${auth} が見つかりません。`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(auth, path.join(dir, "auth.json"));
}

function providerEnv(ctx: CleanRoomContext, provider: CleanRoomProvider): NodeJS.ProcessEnv {
  const state = ctx.providers[provider]!;
  const env = buildCleanChildEnv(ctx.baseEnv);
  env.HOME = ctx.osHome;
  env[state.homeEnvKey] = state.homeDir;
  return env;
}

export function prepareCleanRoom(
  providers: readonly CleanRoomProvider[],
  deps: CleanRoomDeps = {}
): CleanRoomContext {
  const exists = deps.exists ?? fs.existsSync;
  const rootDir = fs.mkdtempSync(
    path.join(deps.rootParent ?? os.tmpdir(), "laplace-cleanroom-")
  );
  const osHome = path.join(rootDir, "home");
  fs.mkdirSync(osHome);
  let cwdCount = 0;
  const ctx: CleanRoomContext = {
    rootDir,
    osHome,
    baseEnv: deps.baseEnv ?? process.env,
    providers: {},
    policyPaths: deps.policyPaths ?? MANAGED_POLICY_PATHS,
    agentIsolation(provider) {
      const state = this.providers[provider];
      if (!state) throw new Error(`clean-room context has no ${provider} provider`);
      const cwd = path.join(rootDir, `cwd-${provider}-${cwdCount++}`);
      fs.mkdirSync(cwd);
      return { env: providerEnv(this, provider), extraArgs: state.flags, cwd };
    },
    cleanup() {
      try {
        fs.rmSync(rootDir, { recursive: true, force: true });
      } catch {}
    },
  };
  try {
    for (const provider of providers) {
      if (provider === "claude") {
        const home = path.join(rootDir, "claude");
        prepareClaudeCleanHome(
          home,
          deps.claudeCredentials ??
            path.join(os.homedir(), ".claude", ".credentials.json"),
          exists
        );
        ctx.providers.claude = {
          homeDir: home,
          homeEnvKey: "CLAUDE_CONFIG_DIR",
          flags: CLAUDE_CLEAN_FLAGS,
          expectedHomeEntries: [".claude.json", ".credentials.json"],
        };
      } else {
        const home = path.join(rootDir, "codex");
        prepareCodexCleanHome(
          home,
          deps.codexAuth ?? path.join(os.homedir(), ".codex", "auth.json"),
          exists
        );
        ctx.providers.codex = {
          homeDir: home,
          homeEnvKey: "CODEX_HOME",
          flags: CODEX_CLEAN_FLAGS,
          expectedHomeEntries: ["auth.json"],
        };
      }
    }
  } catch (err) {
    ctx.cleanup();
    throw err;
  }
  return ctx;
}

export interface StaticCheckResults {
  managed_policy_paths_checked: readonly string[];
  home_contents_verified: boolean;
  os_home_empty: boolean;
}

/**
 * Free, deterministic checks. Run BEFORE any CLI call: the CLIs write session
 * state into their config home, so "the home holds exactly the auth material"
 * is a pre-execution invariant.
 */
export function staticChecks(
  ctx: CleanRoomContext,
  exists: (p: string) => boolean = fs.existsSync
): StaticCheckResults {
  for (const p of ctx.policyPaths) {
    if (exists(p)) {
      throw ambientGuidance(
        `管理ポリシー ${p} が存在します。--safe-mode でも admin policy は適用されるため、` +
          `このマシンでは個人設定の隔離を主張できません。`
      );
    }
  }
  for (const [name, state] of Object.entries(ctx.providers)) {
    const actual = fs.readdirSync(state.homeDir).sort();
    const expected = [...state.expectedHomeEntries].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new MatchPreflightError(
        `${name} の隔離ホームに想定外の内容があります: [${actual.join(", ")}] ` +
          `(想定: [${expected.join(", ")}])`
      );
    }
  }
  if (fs.readdirSync(ctx.osHome).length > 0) {
    throw new MatchPreflightError("隔離 OS HOME が空ではありません");
  }
  return {
    managed_policy_paths_checked: ctx.policyPaths,
    home_contents_verified: true,
    os_home_empty: true,
  };
}

export interface CanaryCliDeps {
  runCli(
    cmd: string,
    args: string[],
    opts: { env: NodeJS.ProcessEnv; cwd: string; timeoutMs: number }
  ): Promise<{ stdout: string; stderr: string; code: number | null }>;
}

export const defaultCanaryCliDeps: CanaryCliDeps = {
  runCli(cmd, args, opts) {
    return new Promise((resolve) => {
      const child = execFile(
        cmd,
        args,
        {
          cwd: opts.cwd,
          env: opts.env,
          timeout: opts.timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          resolve({
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            code: err ? ((err as any).code ?? 1) : 0,
          });
        }
      );
      child.stdin?.end();
    });
  },
};

export type CanaryOutcome =
  | "detected"
  | "clean"
  | "config-read-failed-as-expected"
  | "config-suppressed"
  | "shell-available"
  | "shell-removed";

export interface ProviderCanaryResult {
  model: string;
  /** The pinned canary effort — "cli-default" when deliberately not passed. */
  effort: string;
  outcomes: Record<string, CanaryOutcome>;
  /** codex only: `codex features list` under the clean-room env — the
   * recorded evidence for feature-dependent surfaces like web search. */
  enabledFeatures?: string[];
}

function canaryFail(leg: string, detail: string): MatchPreflightError {
  return new MatchPreflightError(
    `canary 検査に失敗しました (${leg}): ${detail} 対局は開始していません。`
  );
}

function freshDir(ctx: CleanRoomContext, name: string): string {
  const dir = path.join(ctx.rootDir, name);
  fs.mkdirSync(dir);
  return dir;
}

function claudeResult(stdout: string): { isError: boolean; result: string } {
  try {
    const parsed = JSON.parse(stdout.trim());
    return {
      isError: Boolean(parsed.is_error),
      result: typeof parsed.result === "string" ? parsed.result : "",
    };
  } catch {
    return { isError: true, result: stdout.slice(0, 400) };
  }
}

function codexMessages(stdout: string): { texts: string[]; commands: number; failed: boolean } {
  const texts: string[] = [];
  let commands = 0;
  let failed = false;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      texts.push(event.item.text ?? "");
    }
    if (event.type === "item.completed" && event.item?.type === "command_execution") {
      commands++;
    }
    if (event.type === "turn.failed" || event.type === "error") failed = true;
  }
  return { texts, commands, failed };
}

/**
 * A hostile launcher environment: every variable a leaky wrapper would obey.
 * The negative canary legs route this through the real clean-room env builder
 * to prove the allowlist actually discards it.
 */
function hostileBaseEnv(ctx: CleanRoomContext, canaryHomes: Partial<Record<CleanRoomProvider, string>>): NodeJS.ProcessEnv {
  return {
    ...ctx.baseEnv,
    ...(canaryHomes.claude ? { CLAUDE_CONFIG_DIR: canaryHomes.claude } : {}),
    ...(canaryHomes.codex ? { CODEX_HOME: canaryHomes.codex } : {}),
    CLAUDE_EFFORT: "xhigh",
    ANTHROPIC_MODEL: BOGUS_MODEL,
    NODE_OPTIONS: "--max-old-space-size=1",
  };
}

async function claudeCanary(
  ctx: CleanRoomContext,
  deps: CanaryCliDeps,
  claudeCredentials: string
): Promise<ProviderCanaryResult> {
  const outcomes: Record<string, CanaryOutcome> = {};
  const instructionsHome = path.join(ctx.rootDir, "canary-claude-instructions");
  prepareClaudeCleanHome(instructionsHome, claudeCredentials);
  fs.writeFileSync(path.join(instructionsHome, "CLAUDE.md"), CANARY_INSTRUCTION);
  const settingsHome = path.join(ctx.rootDir, "canary-claude-settings");
  prepareClaudeCleanHome(settingsHome, claudeCredentials);
  fs.writeFileSync(
    path.join(settingsHome, "settings.json"),
    JSON.stringify({ model: BOGUS_MODEL }) + "\n"
  );

  const probeArgs = [
    "-p",
    CANARY_PROMPT,
    "--output-format",
    "json",
    "--model",
    CLAUDE_CANARY_MODEL,
  ];
  const run = (args: string[], env: NodeJS.ProcessEnv, cwdName: string) =>
    deps.runCli("claude", args, {
      env,
      cwd: freshDir(ctx, cwdName),
      timeoutMs: CANARY_TIMEOUT_MS,
    });

  // Positive control: the canary home IS the config source and no suppression
  // flags are passed — the instruction must inject, or the canary is dead.
  const positiveEnv = buildCleanChildEnv(ctx.baseEnv);
  positiveEnv.HOME = ctx.osHome;
  positiveEnv.CLAUDE_CONFIG_DIR = instructionsHome;
  const positive = claudeResult((await run(probeArgs, positiveEnv, "canary-cwd-c1")).stdout);
  if (positive.isError || !positive.result.includes(CANARY_WORD)) {
    throw canaryFail(
      "claude instructions positive",
      `canary 指示が注入されませんでした(canary死)。reply=${positive.result.slice(0, 120)}`
    );
  }
  outcomes.instructions_positive = "detected";

  // Negative: hostile launcher env routed through the real builder + real
  // isolated home + suppression flags. Any canary word here is a leak.
  const negativeEnv = buildCleanChildEnv(hostileBaseEnv(ctx, { claude: instructionsHome }));
  negativeEnv.HOME = ctx.osHome;
  negativeEnv.CLAUDE_CONFIG_DIR = ctx.providers.claude!.homeDir;
  const negative = claudeResult(
    (await run([...probeArgs, ...CLAUDE_CLEAN_FLAGS], negativeEnv, "canary-cwd-c2")).stdout
  );
  if (negative.isError) {
    throw canaryFail("claude instructions negative", `probe が失敗しました: ${negative.result.slice(0, 200)}`);
  }
  if (negative.result.includes(CANARY_WORD)) {
    throw canaryFail("claude instructions negative", "clean-room 構成へ canary 指示が漏れています。");
  }
  outcomes.instructions_negative = "clean";

  // Config-source positive: a bogus model in settings.json must break the call
  // when no --model and no suppression flags are given (proves settings are
  // the live config source).
  const configPosEnv = buildCleanChildEnv(ctx.baseEnv);
  configPosEnv.HOME = ctx.osHome;
  configPosEnv.CLAUDE_CONFIG_DIR = settingsHome;
  const configPos = await run(["-p", CANARY_PROMPT, "--output-format", "json"], configPosEnv, "canary-cwd-c3");
  const configPosParsed = claudeResult(configPos.stdout);
  if (!configPosParsed.isError && configPos.code === 0) {
    throw canaryFail(
      "claude config positive",
      "存在しない model を settings.json に置いても呼び出しが成功しました(canary死)。"
    );
  }
  outcomes.config_positive = "config-read-failed-as-expected";

  // Config-source negative: same poisoned home, but with suppression flags the
  // settings must be ignored (call succeeds on the CLI default model).
  const configNegEnv = buildCleanChildEnv(ctx.baseEnv);
  configNegEnv.HOME = ctx.osHome;
  configNegEnv.CLAUDE_CONFIG_DIR = settingsHome;
  const configNeg = claudeResult(
    (await run(["-p", CANARY_PROMPT, "--output-format", "json", ...CLAUDE_CLEAN_FLAGS], configNegEnv, "canary-cwd-c4")).stdout
  );
  if (configNeg.isError) {
    throw canaryFail(
      "claude config negative",
      `--setting-sources "" が settings.json を無効化しませんでした: ${configNeg.result.slice(0, 200)}`
    );
  }
  outcomes.config_negative = "config-suppressed";

  return { model: CLAUDE_CANARY_MODEL, effort: "cli-default", outcomes };
}

async function codexCanary(
  ctx: CleanRoomContext,
  deps: CanaryCliDeps,
  codexAuth: string
): Promise<ProviderCanaryResult> {
  const outcomes: Record<string, CanaryOutcome> = {};
  const instructionsHome = path.join(ctx.rootDir, "canary-codex-instructions");
  prepareCodexCleanHome(instructionsHome, codexAuth);
  fs.writeFileSync(path.join(instructionsHome, "AGENTS.md"), CANARY_INSTRUCTION);
  const configHome = path.join(ctx.rootDir, "canary-codex-config");
  prepareCodexCleanHome(configHome, codexAuth);
  fs.writeFileSync(path.join(configHome, "config.toml"), `model = "${BOGUS_MODEL}"\n`);

  const effortLow = ["-c", 'model_reasoning_effort="low"'];
  const baseArgs = ["exec", "--json", "--skip-git-repo-check", ...effortLow];
  const run = (args: string[], env: NodeJS.ProcessEnv, cwdName: string) =>
    deps.runCli("codex", args, {
      env,
      cwd: freshDir(ctx, cwdName),
      timeoutMs: CANARY_TIMEOUT_MS,
    });

  // Positive control: canary AGENTS.md in the active CODEX_HOME, no flags.
  const positiveEnv = buildCleanChildEnv(ctx.baseEnv);
  positiveEnv.HOME = ctx.osHome;
  positiveEnv.CODEX_HOME = instructionsHome;
  const positive = codexMessages((await run([...baseArgs, CANARY_PROMPT], positiveEnv, "canary-cwd-x1")).stdout);
  if (!positive.texts.join("\n").includes(CANARY_WORD)) {
    throw canaryFail("codex instructions positive", "canary 指示が注入されませんでした(canary死)。");
  }
  outcomes.instructions_positive = "detected";

  // Negative: hostile launcher env through the real builder + real home + flags.
  const negativeEnv = buildCleanChildEnv(hostileBaseEnv(ctx, { codex: instructionsHome }));
  negativeEnv.HOME = ctx.osHome;
  negativeEnv.CODEX_HOME = ctx.providers.codex!.homeDir;
  const negative = codexMessages(
    (await run([...baseArgs, ...CODEX_CLEAN_FLAGS, CANARY_PROMPT], negativeEnv, "canary-cwd-x2")).stdout
  );
  if (negative.texts.length === 0) {
    throw canaryFail("codex instructions negative", "probe が応答を返しませんでした。");
  }
  if (negative.texts.join("\n").includes(CANARY_WORD)) {
    throw canaryFail("codex instructions negative", "clean-room 構成へ canary 指示が漏れています。");
  }
  outcomes.instructions_negative = "clean";

  // Config-source positive: bogus model in config.toml must fail the call.
  const configPosEnv = buildCleanChildEnv(ctx.baseEnv);
  configPosEnv.HOME = ctx.osHome;
  configPosEnv.CODEX_HOME = configHome;
  const configPos = codexMessages(
    (await run(["exec", "--json", "--skip-git-repo-check", CANARY_PROMPT], configPosEnv, "canary-cwd-x3")).stdout
  );
  if (!configPos.failed && configPos.texts.length > 0) {
    throw canaryFail(
      "codex config positive",
      "存在しない model を config.toml に置いても呼び出しが成功しました(canary死)。"
    );
  }
  outcomes.config_positive = "config-read-failed-as-expected";

  // Config-source negative: same poisoned home + --ignore-user-config succeeds.
  const configNeg = codexMessages(
    (await run([...baseArgs, "--ignore-user-config", "--ignore-rules", CANARY_PROMPT], configPosEnv, "canary-cwd-x4")).stdout
  );
  if (configNeg.failed || configNeg.texts.length === 0) {
    throw canaryFail(
      "codex config negative",
      "--ignore-user-config が config.toml を無効化しませんでした。"
    );
  }
  outcomes.config_negative = "config-suppressed";

  // Shell positive: without --disable shell_tool the sandboxed shell runs.
  // A repeated canary word alone is NOT accepted — the model could
  // hallucinate stdout — the proof is an actual command_execution event.
  const shellEnv = buildCleanChildEnv(ctx.baseEnv);
  shellEnv.HOME = ctx.osHome;
  shellEnv.CODEX_HOME = ctx.providers.codex!.homeDir;
  const shellPos = codexMessages(
    (await run([...baseArgs, "--ignore-user-config", "--ignore-rules", "-c", 'sandbox_mode="read-only"', SHELL_CANARY_PROMPT], shellEnv, "canary-cwd-x5")).stdout
  );
  if (shellPos.commands === 0) {
    throw canaryFail(
      "codex shell positive",
      "shell が既定で無効に見えます(canary死: command 実行イベントがありません)。"
    );
  }
  outcomes.shell_positive = "shell-available";

  // Shell negative: full clean flags must remove shell execution entirely —
  // and the probe itself must still answer, or nothing was verified.
  const shellNeg = codexMessages(
    (await run([...baseArgs, ...CODEX_CLEAN_FLAGS, SHELL_CANARY_PROMPT], shellEnv, "canary-cwd-x6")).stdout
  );
  if (shellNeg.failed || shellNeg.texts.length === 0) {
    throw canaryFail("codex shell negative", "probe が応答を返しませんでした。");
  }
  if (shellNeg.commands > 0 || shellNeg.texts.join("\n").includes(SHELL_CANARY_WORD)) {
    throw canaryFail("codex shell negative", "--disable shell_tool 下で shell が実行されました。");
  }
  outcomes.shell_negative = "shell-removed";

  // Deterministic feature-state evidence (no model call): what the codex CLI
  // itself reports as enabled under the clean-room home/env. This is the
  // recorded basis for feature-dependent surfaces (web search stays a
  // feature that is simply not enabled here).
  const features = await run(["features", "list"], shellEnv, "canary-cwd-x7");
  const enabledFeatures = features.stdout
    .split("\n")
    .map((line) => line.trim().match(/^(\S+)\s{2,}.*?\s(true|false)$/))
    .filter((m): m is RegExpMatchArray => m !== null && m[2] === "true")
    .map((m) => m[1])
    .sort();
  if (features.code !== 0 || enabledFeatures.length === 0) {
    throw canaryFail(
      "codex feature state",
      "codex features list の記録に失敗しました(feature 状態を manifest へ残せません)。"
    );
  }

  return { model: "codex-cli-default", effort: "low", outcomes, enabledFeatures };
}

export async function runCanaryMatrix(
  ctx: CleanRoomContext,
  deps: CanaryCliDeps = defaultCanaryCliDeps,
  auth: { claudeCredentials?: string; codexAuth?: string } = {}
): Promise<Partial<Record<CleanRoomProvider, ProviderCanaryResult>>> {
  const results: Partial<Record<CleanRoomProvider, ProviderCanaryResult>> = {};
  if (ctx.providers.claude) {
    results.claude = await claudeCanary(
      ctx,
      deps,
      auth.claudeCredentials ?? path.join(os.homedir(), ".claude", ".credentials.json")
    );
  }
  if (ctx.providers.codex) {
    results.codex = await codexCanary(
      ctx,
      deps,
      auth.codexAuth ?? path.join(os.homedir(), ".codex", "auth.json")
    );
  }
  return results;
}

const OPAQUE_CONDITION_NOTE =
  "provider may change CLI behavior under an unchanged version id; the recorded CLI name+version is the provider-harness condition unit and is otherwise opaque";

/** run.json `isolation` block for a passed clean-room preflight. */
export function isolationManifest(
  ctx: CleanRoomContext,
  cliVersions: Partial<Record<CleanRoomProvider, string>>,
  staticResults: StaticCheckResults,
  canaryResults: Partial<Record<CleanRoomProvider, ProviderCanaryResult>>
): object {
  const providers: Record<string, object> = {};
  for (const [name, state] of Object.entries(ctx.providers)) {
    const provider = name as CleanRoomProvider;
    providers[name] = {
      cli_version: cliVersions[provider],
      mechanism: {
        config_home: "isolated dir carrying only auth material (symlink) — claude adds minimal onboarding state",
        os_home: "isolated empty dir",
        cwd: "per-agent empty scratch dir",
      },
      flags: state.flags,
      allowed_env_keys: CLEAN_ENV_ALLOWLIST,
      surfaces: {
        instructions: "canary-verified",
        config_source: "canary-verified",
        env_overrides: "canary-verified",
        home_artifacts: "artifact-absent",
        mcp: "flag-suppressed",
        ...(provider === "codex"
          ? {
              shell_tools: "canary-verified",
              // Honest status: web search is a codex feature that is simply
              // not enabled here; the evidence is the recorded feature state
              // below, not a suppression flag.
              network_web_search: "feature-state-recorded",
            }
          : { tools: "flag-suppressed", network_web_search: "flag-suppressed" }),
        managed_policy: "checked-absent",
      },
      canary: canaryResults[provider] ?? null,
      managed_policy_paths_checked: staticResults.managed_policy_paths_checked,
      opaque_condition_note: OPAQUE_CONDITION_NOTE,
    };
  }
  return {
    schema: ISOLATION_SCHEMA,
    mode: "clean-room",
    revision: CLEAN_ROOM_REVISION,
    providers,
  };
}

/** run.json `isolation` block for the explicit ambient opt-in. */
export function ambientManifest(): object {
  return {
    schema: ISOLATION_SCHEMA,
    mode: "ambient",
    revision: null,
    note:
      "explicit --ambient-cli-env opt-in: launcher environment and personal CLI configuration were NOT isolated; no clean claim is made",
  };
}
