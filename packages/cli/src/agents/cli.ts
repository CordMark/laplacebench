import "../env";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CliIsolation } from "../cleanroom";
import {
  harvestContextTelemetry,
  writeContextTelemetry,
} from "../contexttelemetry";
import { buildInstructions, extractMove, observationFromInput, turnMessage } from "../prompt";
import type { Agent, AgentReply, TeamId, TurnInput } from "../types";
import { normalizeAnthropicUsage, normalizeOpenAIUsage } from "../usage";

const DISALLOWED_CLAUDE_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "TodoWrite",
  "NotebookEdit",
].join(",");

interface Spawned {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

/**
 * Child environment for CLI agents. The bench's contract is that run
 * conditions are labeled in agent names; ambient session variables must not
 * silently change them. CLAUDE_EFFORT leaked from a launching Claude Code
 * session and ran the whole 2026-07-24 pilot at effort=high without any
 * label — the explicit `--effort` flag is the only sanctioned channel.
 */
export function buildChildEnv(
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.CLAUDE_EFFORT;
  return env;
}

/**
 * Diagnostic line for a failed CLI reply. Each field is bounded
 * individually — the provider cause (`error`, then `result`) must survive
 * the event-log truncation no matter how large the other fields are. At a
 * single 400-char bound the usage block swallowed the actual error message
 * during the 2026-07-24 rate-limit incident.
 */
export function formatCliResultError(parsed: Record<string, unknown>): string {
  const bounded = (v: unknown, n: number) =>
    v === undefined ? undefined : JSON.stringify(v)?.slice(0, n);
  const head = {
    is_error: parsed.is_error,
    error: bounded(parsed.error, 300),
    result: bounded(parsed.result, 300),
  };
  return `CLI_RESULT_ERROR: ${JSON.stringify(head)} | full: ${JSON.stringify(parsed).slice(0, 600)}`;
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
  input?: string
): Promise<Spawned> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      {
        cwd,
        timeout: Math.max(1, timeoutMs),
        maxBuffer: 64 * 1024 * 1024,
        env,
      },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code: (err as any)?.code ?? 0,
          timedOut: Boolean((err as any)?.killed),
        });
      }
    );
    // Always close stdin. codex exec prints "Reading additional input from
    // stdin..." and blocks if it sees an open pipe with a positional prompt.
    if (child.stdin) {
      if (input !== undefined) child.stdin.write(input);
      child.stdin.end();
    }
  });
}

function scratchDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function uuid(): string {
  // Node >=14.17 has crypto.randomUUID
  return require("node:crypto").randomUUID();
}

export interface CliInvocation {
  argv: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

/**
 * Pure claude invocation builder — the ONE place a claude argv/env/cwd is
 * assembled, shared by the match path, the learning analysis path, and the
 * tests that pin the clean-room flag contract. `isolation` appends the
 * clean-room suppression flags and swaps in the isolated env/cwd; without it
 * the ambient-mode env (buildChildEnv) and the caller's scratch cwd apply.
 */
export function buildClaudeInvocation(opts: {
  userText: string;
  model: string;
  effort?: string;
  sessionArgs: string[];
  ambientCwd: string;
  isolation?: CliIsolation;
}): CliInvocation {
  const argv = [
    "-p",
    opts.userText,
    "--output-format",
    "json",
    "--model",
    opts.model,
  ];
  if (opts.effort) argv.push("--effort", opts.effort);
  argv.push(...opts.sessionArgs);
  if (opts.isolation) argv.push(...opts.isolation.extraArgs);
  return {
    argv,
    env: opts.isolation ? opts.isolation.env : buildChildEnv(),
    cwd: opts.isolation ? opts.isolation.cwd : opts.ambientCwd,
  };
}

/** Pure codex invocation builder — same contract as buildClaudeInvocation. */
export function buildCodexInvocation(opts: {
  userText: string;
  model: string;
  effortArgs: string[];
  resumeThreadId?: string;
  ambientCwd: string;
  isolation?: CliIsolation;
}): CliInvocation {
  const modelArgs = opts.model ? ["-m", opts.model] : [];
  const isolationArgs = opts.isolation ? [...opts.isolation.extraArgs] : [];
  const argv = opts.resumeThreadId
    ? ["exec", "resume", opts.resumeThreadId, "--json", "--skip-git-repo-check", ...opts.effortArgs, ...modelArgs, ...isolationArgs, opts.userText]
    : ["exec", "--json", "--skip-git-repo-check", ...opts.effortArgs, ...modelArgs, ...isolationArgs, opts.userText];
  return {
    argv,
    env: opts.isolation ? opts.isolation.env : buildChildEnv(),
    cwd: opts.isolation ? opts.isolation.cwd : opts.ambientCwd,
  };
}

/** Clean-room contract: an agent's cwd must be empty when its game starts. */
function assertEmptyCwd(cwd: string, agentName: string): void {
  if (fs.readdirSync(cwd).length > 0) {
    throw new Error(
      `${agentName}: clean-room scratch cwd ${cwd} is not empty at game start`
    );
  }
}

export type CodexContextPolicy = "persistent" | "turn-reset";

/**
 * Pure user-text composition shared by every codex turn — the seam that lets
 * tests assert exactly what reaches the model without launching a process.
 */
export function composeCodexUserText(parts: {
  instructions?: string;
  memoPrelude?: string;
  turnText: string;
}): string {
  const chunks: string[] = [];
  if (parts.instructions) chunks.push(parts.instructions);
  if (parts.memoPrelude) chunks.push(parts.memoPrelude);
  chunks.push(parts.turnText);
  return chunks.join("\n\n---\n\n");
}

/**
 * The per-turn session decision for the codex adapter, pure so the
 * turn-reset contract is testable without launching codex: under
 * "turn-reset" no thread is ever resumed and the instructions are resent
 * with every turn; under "persistent" the first turn starts the thread and
 * later turns resume it (docs/plans/2026-07-30-harness-lab-contract.md).
 */
export function codexSessionPlan(
  policy: CodexContextPolicy,
  started: boolean,
  threadId: string
): { resumeThreadId: string | undefined; includeInstructions: boolean } {
  if (policy === "turn-reset") {
    return { resumeThreadId: undefined, includeInstructions: true };
  }
  return {
    resumeThreadId: started && threadId ? threadId : undefined,
    includeInstructions: !started,
  };
}

/**
 * Subscription-driven adapter that drives the Claude Code CLI as a
 * subprocess. Persistent context is the CLI's own session: --session-id on
 * the first turn, --resume thereafter. All Claude Code tools are disabled so
 * the model only reasons and returns a move. Runs under the user's Claude
 * subscription, so no API key or per-token billing.
 *
 * Caveat: the CLI injects its own large Claude Code system prompt ahead of
 * our rulebook (sent as the first user message). This is a confound versus
 * the clean-slate API track and must be labeled as a distinct condition.
 */
export function claudeCliAgent(opts: {
  model?: string;
  effort?: string;
  /** Override the display/metrics name (used by wrappers). */
  name?: string;
  /** Called at startGame; returned text is appended after the rulebook in the first message. */
  preludeProvider?: () => string;
  /** Clean-room context (env/flags/cwd). Absent = ambient condition. */
  isolation?: CliIsolation;
  /** Injectable subprocess runner (tests). Defaults to the real one. */
  runner?: typeof run;
}): Agent {
  const model = opts.model ?? "sonnet";
  const exec = opts.runner ?? run;
  const cwd = opts.isolation?.cwd ?? scratchDir("laplace-claude-");
  let sessionId = "";
  // Client-generated, so every session this game used is known by
  // construction (unlike codex thread ids) — context-telemetry harvest.
  let sessionIds: string[] = [];
  let started = false;
  let team: TeamId = "A";
  let prelude = "";

  return {
    name: opts.name ?? `claude-cli:${model}${opts.effort ? `@${opts.effort}` : ""}`,
    usageProfile: { provider: "anthropic", source: "claude-cli" },
    startGame(t: TeamId) {
      if (opts.isolation) assertEmptyCwd(cwd, "claude-cli");
      team = t;
      // Session ids are allocated lazily at invocation time so the telemetry
      // id list only ever contains sessions that actually ran.
      sessionId = "";
      sessionIds = [];
      started = false;
      prelude = opts.preludeProvider?.() ?? "";
    },
    async act(input: TurnInput): Promise<AgentReply> {
      if (!sessionId) {
        sessionId = uuid();
        sessionIds.push(sessionId);
      }
      const obsJson = JSON.stringify(
        observationFromInput(input)
      );
      let userText = turnMessage(obsJson, input.attempt, input.error?.code, input.ply);
      if (!started) {
        const parts = [buildInstructions(team, { outputTokenBudget: input.outputTokenBudget })];
        if (prelude) parts.push(prelude);
        parts.push(userText);
        userText = parts.join("\n\n---\n\n");
      }

      const invocation = buildClaudeInvocation({
        userText,
        model,
        effort: opts.effort,
        sessionArgs: !started
          ? ["--session-id", sessionId, "--disallowedTools", DISALLOWED_CLAUDE_TOOLS]
          : ["--resume", sessionId],
        ambientCwd: cwd,
        isolation: opts.isolation,
      });

      const start = Date.now();
      const { stdout, stderr, code, timedOut } = await exec(
        "claude",
        invocation.argv,
        invocation.cwd,
        input.deadlineAtMs - Date.now(),
        invocation.env
      );
      const latencyMs = Date.now() - start;
      started = true;

      if (timedOut || Date.now() >= input.deadlineAtMs) {
        // The killed session may contain a dangling user turn or partial
        // assistant output. Restart from the next full-state observation;
        // the replacement id is allocated only when that invocation happens.
        sessionId = "";
        started = false;
        return {
          move: null,
          raw: `TURN_TIMEOUT: stderr=${stderr.slice(0, 300)}`,
          latencyMs,
          timedOut: true,
        };
      }

      let parsed: any;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        return {
          move: null,
          raw: `CLI_ERROR: exit=${code} stderr=${stderr.slice(0, 300)} stdout=${stdout.slice(0, 300)}`,
          latencyMs,
        };
      }

      if (parsed.is_error || typeof parsed.result !== "string") {
        return {
          move: null,
          raw: formatCliResultError(parsed),
          latencyMs,
        };
      }

      const text: string = parsed.result;
      const usage = parsed.usage ?? {};
      return {
        move: extractMove(text),
        raw: text,
        latencyMs,
        usage: normalizeAnthropicUsage(
          usage,
          "claude-cli",
          userText,
          text
        ),
      };
    },
    endGame(info) {
      // Context telemetry (clean-room persistent sessions only): harvest
      // compaction markers from this game's own transcripts. Failure never
      // affects the game result.
      const configDir = opts.isolation?.env.CLAUDE_CONFIG_DIR;
      if (!info || !configDir) return;
      try {
        writeContextTelemetry(
          info.eventsPath,
          info.team,
          harvestContextTelemetry({
            provider: "claude",
            harness: opts.name?.split(":")[0] ?? "claude-cli",
            home: configDir,
            ids: sessionIds,
            unobservedTimeouts: 0,
          })
        );
      } catch {}
    },
    // The scratch cwd is released in dispose, NOT endGame: the learning
    // wrapper runs its post-game analysis inside endGame, and the runner
    // calls dispose on every exit path after endGame completes.
    dispose() {
      try {
        fs.rmSync(cwd, { recursive: true, force: true });
      } catch {}
    },
  };
}

/**
 * Subscription-driven adapter for the Codex CLI (`codex exec`). Persistent
 * context via `codex exec resume <thread_id>`. Output is a JSONL event
 * stream; we read the thread id from thread.started, the answer from the last
 * agent_message, and usage from turn.completed. Runs under the user's ChatGPT
 * subscription.
 *
 * Note: an empty `model` uses the ChatGPT plan's default model (gpt-5-codex
 * is rejected on ChatGPT-account auth). Same harness-system-prompt confound
 * as the Claude CLI track.
 */
export function codexCliAgent(opts: {
  model?: string;
  effort?: string;
  /** "turn-reset" discards the whole context every turn (fresh exec, no
   * resume, instructions resent). Default "persistent". */
  contextPolicy?: CodexContextPolicy;
  /** Bounded-memo carryover (agents/memo.ts). Implies turn-reset execution;
   * the memo prelude is injected on every call and every reply (timeouts
   * included) is recorded as a memo transition. */
  memo?: import("./memo").MemoSession;
  /** Clean-room context (env/flags/cwd). Absent = ambient condition. */
  isolation?: CliIsolation;
  /** Injectable subprocess runner (tests). Defaults to the real one. */
  runner?: typeof run;
}): Agent {
  const model = opts.model ?? "";
  const policy: CodexContextPolicy = opts.memo
    ? "turn-reset"
    : opts.contextPolicy ?? "persistent";
  const specHead = opts.memo
    ? "codex-cli-memo"
    : policy === "turn-reset"
      ? "codex-cli-reset"
      : "codex-cli";
  const exec = opts.runner ?? run;
  const cwd = opts.isolation?.cwd ?? scratchDir("laplace-codex-");
  let threadId = "";
  // Every OBSERVED thread id this game used (timeout restarts create new
  // threads); a timed-out call whose stdout never carried thread.started is
  // counted, never guessed at — context-telemetry harvest.
  let threadIds: string[] = [];
  let unobservedTimeouts = 0;
  let started = false;
  let team: TeamId = "A";
  const effortArgs = opts.effort
    ? ["-c", `model_reasoning_effort="${opts.effort}"`]
    : [];

  return {
    name: `${specHead}:${model || "default"}${opts.effort ? `@${opts.effort}` : ""}`,
    usageProfile: { provider: "openai", source: "codex-cli" },
    startGame(t: TeamId, gameId?: string) {
      if (opts.isolation) assertEmptyCwd(cwd, specHead);
      team = t;
      threadId = "";
      threadIds = [];
      unobservedTimeouts = 0;
      started = false;
      opts.memo?.startGame(t, gameId ?? "");
    },
    async act(input: TurnInput): Promise<AgentReply> {
      const obsJson = JSON.stringify(
        observationFromInput(input)
      );
      const plan = codexSessionPlan(policy, started, threadId);
      const userText = composeCodexUserText({
        instructions: plan.includeInstructions
          ? buildInstructions(team, { outputTokenBudget: input.outputTokenBudget })
          : undefined,
        memoPrelude: opts.memo?.prelude(),
        turnText: turnMessage(obsJson, input.attempt, input.error?.code, input.ply),
      });

      const invocation = buildCodexInvocation({
        userText,
        model,
        effortArgs,
        resumeThreadId: plan.resumeThreadId,
        ambientCwd: cwd,
        isolation: opts.isolation,
      });

      const start = Date.now();
      const { stdout, stderr, code, timedOut } = await exec(
        "codex",
        invocation.argv,
        invocation.cwd,
        input.deadlineAtMs - Date.now(),
        invocation.env
      );
      const latencyMs = Date.now() - start;

      if (timedOut || Date.now() >= input.deadlineAtMs) {
        // Even a killed call usually flushed thread.started — record the id
        // for context telemetry before discarding the thread; when it never
        // appeared, count the gap honestly instead of guessing.
        const killedThread = stdout
          .split("\n")
          .map((l) => { try { return JSON.parse(l.trim()); } catch { return null; } })
          .find((e: any) => e?.type === "thread.started");
        if (killedThread?.thread_id) {
          if (!threadIds.includes(killedThread.thread_id)) threadIds.push(killedThread.thread_id);
        } else if (policy === "persistent") {
          unobservedTimeouts++;
        }
        // Do not resume a thread whose last turn was interrupted and whose
        // move was discarded by the referee.
        threadId = "";
        started = false;
        // A timeout is still a memo transition: no reply text, so the memo
        // stays and the record says so.
        const memoStatus = opts.memo?.record("", input.ply, input.attempt);
        return {
          move: null,
          raw: `TURN_TIMEOUT: stderr=${stderr.slice(0, 300)}`,
          latencyMs,
          timedOut: true,
          ...(memoStatus ? { meta: { memo_status: memoStatus } } : {}),
        };
      }

      const events = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const threadStarted = events.find((e: any) => e.type === "thread.started");
      if (threadStarted) {
        threadId = threadStarted.thread_id;
        if (!threadIds.includes(threadId)) threadIds.push(threadId);
      }
      started = true;

      const failed = events.find(
        (e: any) => e.type === "turn.failed" || e.type === "error"
      );
      const messages = events.filter(
        (e: any) => e.type === "item.completed" && e.item?.type === "agent_message"
      );

      if (messages.length === 0) {
        const memoStatus = opts.memo?.record("", input.ply, input.attempt);
        return {
          move: null,
          raw: `CLI_ERROR: exit=${code} failed=${JSON.stringify(failed ?? null).slice(0, 300)} stderr=${stderr.slice(0, 200)}`,
          latencyMs,
          ...(memoStatus ? { meta: { memo_status: memoStatus } } : {}),
        };
      }

      // Concatenate all agent messages so the move is found wherever codex
      // put it (reasoning narration may precede the final answer).
      const text: string = messages.map((m: any) => m.item.text ?? "").join("\n");
      const usageEvent = events.find((e: any) => e.type === "turn.completed");
      const u = usageEvent?.usage ?? {};
      const memoStatus = opts.memo?.record(text, input.ply, input.attempt);
      return {
        move: extractMove(text),
        raw: text,
        latencyMs,
        usage: normalizeOpenAIUsage(u, "codex-cli", userText, text),
        ...(memoStatus ? { meta: { memo_status: memoStatus } } : {}),
      };
    },
    endGame(info) {
      // Context telemetry: persistent clean-room threads only (turn-scoped
      // policies have no long-lived context to compact). Failure never
      // affects the game result.
      const home = opts.isolation?.env.CODEX_HOME;
      if (!info || !home || policy !== "persistent") return;
      try {
        writeContextTelemetry(
          info.eventsPath,
          info.team,
          harvestContextTelemetry({
            provider: "codex",
            harness: specHead,
            home,
            ids: threadIds,
            unobservedTimeouts,
          })
        );
      } catch {}
    },
    // dispose, not endGame — see claudeCliAgent.
    dispose() {
      try {
        fs.rmSync(cwd, { recursive: true, force: true });
      } catch {}
    },
  };
}
