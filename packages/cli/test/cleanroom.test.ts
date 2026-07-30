import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ambientManifest,
  buildCleanChildEnv,
  CANARY_WORD,
  CLAUDE_CANARY_MODEL,
  CLAUDE_CLEAN_FLAGS,
  CLEAN_ENV_ALLOWLIST,
  CODEX_CLEAN_FLAGS,
  ISOLATION_SCHEMA,
  isolationManifest,
  prepareCleanRoom,
  runCanaryMatrix,
  staticChecks,
  type CanaryCliDeps,
  type CleanRoomContext,
} from "../src/cleanroom";
import { MatchPreflightError } from "../src/playerrors";
import { buildClaudeInvocation, buildCodexInvocation } from "../src/agents/cli";

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeAuth(): { claudeCredentials: string; codexAuth: string } {
  const dir = tmp("laplace-fakeauth-");
  const claudeCredentials = path.join(dir, "cred.json");
  const codexAuth = path.join(dir, "auth.json");
  fs.writeFileSync(claudeCredentials, "{}");
  fs.writeFileSync(codexAuth, "{}");
  return { claudeCredentials, codexAuth };
}

/** Every variable a leaky wrapper would obey, plus normal terminal noise. */
const HOSTILE_ENV: NodeJS.ProcessEnv = {
  PATH: "/usr/bin:/bin",
  SHELL: "/bin/zsh",
  TERM: "xterm-256color",
  LANG: "en_US.UTF-8",
  HOME: "/Users/somebody",
  CLAUDE_EFFORT: "xhigh",
  CLAUDE_CONFIG_DIR: "/tmp/evil-claude",
  CLAUDECODE: "1",
  ANTHROPIC_API_KEY: "sk-evil",
  ANTHROPIC_MODEL: "evil-model",
  ANTHROPIC_BASE_URL: "http://evil.example",
  OPENAI_API_KEY: "sk-evil2",
  OPENAI_BASE_URL: "http://evil2.example",
  CODEX_HOME: "/tmp/evil-codex",
  NODE_OPTIONS: "--require /tmp/evil.js",
  RANDOM_LAUNCHER_VAR: "1",
};

test("buildCleanChildEnv keeps only the allowlist and drops every override channel", () => {
  const env = buildCleanChildEnv(HOSTILE_ENV);
  assert.equal(env.PATH, "/usr/bin:/bin");
  assert.equal(env.SHELL, "/bin/zsh");
  assert.equal(env.TERM, "xterm-256color");
  assert.equal(env.LANG, "en_US.UTF-8");
  // HOME is deliberately NOT inherited — the wrapper sets the isolated one.
  assert.equal(env.HOME, undefined);
  for (const key of Object.keys(env)) {
    assert.ok(CLEAN_ENV_ALLOWLIST.includes(key), `unexpected env key ${key}`);
  }
  for (const key of [
    "CLAUDE_EFFORT", "CLAUDE_CONFIG_DIR", "CLAUDECODE", "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL", "ANTHROPIC_BASE_URL", "OPENAI_API_KEY", "OPENAI_BASE_URL",
    "CODEX_HOME", "NODE_OPTIONS", "RANDOM_LAUNCHER_VAR",
  ]) {
    assert.equal(env[key], undefined, `${key} must be dropped`);
  }
});

test("prepareCleanRoom builds auth-only homes and per-agent isolations", () => {
  const auth = fakeAuth();
  const rootParent = tmp("laplace-rootparent-");
  const ctx = prepareCleanRoom(["claude", "codex"], {
    ...auth,
    baseEnv: HOSTILE_ENV,
    rootParent,
  });
  try {
    const claudeHome = ctx.providers.claude!.homeDir;
    assert.deepEqual(fs.readdirSync(claudeHome).sort(), [".claude.json", ".credentials.json"]);
    assert.equal(fs.readlinkSync(path.join(claudeHome, ".credentials.json")), auth.claudeCredentials);
    const codexHome = ctx.providers.codex!.homeDir;
    assert.deepEqual(fs.readdirSync(codexHome), ["auth.json"]);
    assert.equal(fs.readlinkSync(path.join(codexHome, "auth.json")), auth.codexAuth);

    const iso1 = ctx.agentIsolation("claude");
    const iso2 = ctx.agentIsolation("claude");
    const codexIso = ctx.agentIsolation("codex");
    assert.notEqual(iso1.cwd, iso2.cwd);
    assert.deepEqual(fs.readdirSync(iso1.cwd), []);
    assert.equal(iso1.env.HOME, ctx.osHome);
    assert.equal(iso1.env.CLAUDE_CONFIG_DIR, claudeHome);
    assert.equal(iso1.env.CLAUDE_EFFORT, undefined);
    assert.equal(iso1.env.ANTHROPIC_API_KEY, undefined);
    assert.deepEqual([...iso1.extraArgs], [...CLAUDE_CLEAN_FLAGS]);
    assert.equal(codexIso.env.CODEX_HOME, codexHome);
    assert.equal(codexIso.env.CLAUDE_CONFIG_DIR, undefined);
    assert.deepEqual([...codexIso.extraArgs], [...CODEX_CLEAN_FLAGS]);

    // Ownership: deleting one agent's cwd (its dispose) leaves the shared
    // provider home and the sibling cwd intact; cleanup removes everything.
    fs.rmSync(iso1.cwd, { recursive: true, force: true });
    assert.ok(fs.existsSync(claudeHome));
    assert.ok(fs.existsSync(iso2.cwd));
  } finally {
    ctx.cleanup();
  }
  assert.deepEqual(fs.readdirSync(rootParent), []);
});

test("missing auth material fails closed with the ambient opt-in guidance", () => {
  const rootParent = tmp("laplace-rootparent-");
  assert.throws(
    () =>
      prepareCleanRoom(["claude"], {
        claudeCredentials: "/nonexistent/.credentials.json",
        rootParent,
      }),
    (err: unknown) =>
      err instanceof MatchPreflightError && /--ambient-cli-env/.test(err.message)
  );
  // The partially-built root is cleaned up on failure.
  assert.deepEqual(fs.readdirSync(rootParent), []);
});

test("staticChecks fails on managed policy, foreign home files, and dirty OS home", () => {
  const auth = fakeAuth();
  const makeCtx = (policyPaths?: readonly string[]) =>
    prepareCleanRoom(["claude"], {
      ...auth,
      rootParent: tmp("laplace-rootparent-"),
      ...(policyPaths ? { policyPaths } : { policyPaths: [] }),
    });

  const ok = makeCtx();
  const results = staticChecks(ok);
  assert.equal(results.home_contents_verified, true);
  assert.equal(results.os_home_empty, true);
  ok.cleanup();

  const policyFile = path.join(tmp("laplace-policy-"), "managed-settings.json");
  fs.writeFileSync(policyFile, "{}");
  const managed = makeCtx([policyFile]);
  assert.throws(
    () => staticChecks(managed),
    (err: unknown) => err instanceof MatchPreflightError && err.message.includes(policyFile)
  );
  managed.cleanup();

  const foreign = makeCtx();
  fs.writeFileSync(path.join(foreign.providers.claude!.homeDir, "settings.json"), "{}");
  assert.throws(() => staticChecks(foreign), MatchPreflightError);
  foreign.cleanup();

  const dirty = makeCtx();
  fs.writeFileSync(path.join(dirty.osHome, "stray.txt"), "x");
  assert.throws(() => staticChecks(dirty), MatchPreflightError);
  dirty.cleanup();
});

// ---------------------------------------------------------------------------
// Canary matrix with fake CLI deps
// ---------------------------------------------------------------------------

interface RecordedCall {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

function claudeJson(result: string, isError = false): string {
  return JSON.stringify({ is_error: isError, result });
}

function codexJsonl(text: string, withCommand = false): string {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "t" }),
    ...(withCommand
      ? [JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "echo" } })]
      : []),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }),
    JSON.stringify({ type: "turn.completed", usage: {} }),
  ].join("\n");
}

const CODEX_FEATURES_TABLE = [
  "apps                stable             true",
  "shell_tool          stable             true",
  "web_search          stable             false",
].join("\n");

const CODEX_FAILURE = JSON.stringify({ type: "error", message: "model not supported" });

/**
 * A fake provider pair that behaves exactly like the verified real CLIs:
 * canary homes inject, suppression flags suppress, bogus config models fail,
 * shell exists unless disabled.
 */
function healthyFakeDeps(ctx: CleanRoomContext, calls: RecordedCall[]): CanaryCliDeps {
  return {
    async runCli(cmd, args, opts) {
      calls.push({ cmd, args, env: opts.env, cwd: opts.cwd });
      const joined = args.join(" ");
      if (cmd === "claude") {
        const home = opts.env.CLAUDE_CONFIG_DIR ?? "";
        const suppressed = joined.includes("--safe-mode");
        const hasModel = joined.includes("--model");
        if (!suppressed && fs.existsSync(path.join(home, "settings.json")) && !hasModel) {
          return { stdout: claudeJson("model error", true), stderr: "", code: 1 };
        }
        if (!suppressed && fs.existsSync(path.join(home, "CLAUDE.md"))) {
          return { stdout: claudeJson(`${CANARY_WORD} OK`), stderr: "", code: 0 };
        }
        return { stdout: claudeJson("OK"), stderr: "", code: 0 };
      }
      if (args[0] === "features") {
        return { stdout: CODEX_FEATURES_TABLE, stderr: "", code: 0 };
      }
      const home = opts.env.CODEX_HOME ?? "";
      const ignoresConfig = joined.includes("--ignore-user-config");
      const shellDisabled = joined.includes("shell_tool");
      const isShellProbe = joined.includes("NOSHELL");
      if (!ignoresConfig && fs.existsSync(path.join(home, "config.toml"))) {
        return { stdout: CODEX_FAILURE, stderr: "", code: 0 };
      }
      if (isShellProbe) {
        return {
          // A real shell run produces a command_execution event; a disabled
          // shell produces a plain refusal with no command event.
          stdout: shellDisabled
            ? codexJsonl("NOSHELL")
            : codexJsonl("BANANA42SHELL", true),
          stderr: "",
          code: 0,
        };
      }
      if (!ignoresConfig && fs.existsSync(path.join(home, "AGENTS.md"))) {
        return { stdout: codexJsonl(`${CANARY_WORD} OK`), stderr: "", code: 0 };
      }
      return { stdout: codexJsonl("OK"), stderr: "", code: 0 };
    },
  };
}

function canaryCtx(): { ctx: CleanRoomContext; auth: ReturnType<typeof fakeAuth> } {
  const auth = fakeAuth();
  const ctx = prepareCleanRoom(["claude", "codex"], {
    ...auth,
    baseEnv: HOSTILE_ENV,
    rootParent: tmp("laplace-rootparent-"),
    policyPaths: [],
  });
  return { ctx, auth };
}

test("canary matrix passes on healthy providers and pins the invocation contract", async () => {
  const { ctx, auth } = canaryCtx();
  const calls: RecordedCall[] = [];
  try {
    const results = await runCanaryMatrix(ctx, healthyFakeDeps(ctx, calls), auth);
    assert.equal(results.claude!.model, CLAUDE_CANARY_MODEL);
    assert.equal(results.claude!.effort, "cli-default");
    assert.equal(results.codex!.effort, "low");
    // Feature state is deterministic evidence from `codex features list`.
    assert.deepEqual(results.codex!.enabledFeatures, ["apps", "shell_tool"]);
    assert.deepEqual(results.claude!.outcomes, {
      instructions_positive: "detected",
      instructions_negative: "clean",
      config_positive: "config-read-failed-as-expected",
      config_negative: "config-suppressed",
    });
    assert.deepEqual(results.codex!.outcomes, {
      instructions_positive: "detected",
      instructions_negative: "clean",
      config_positive: "config-read-failed-as-expected",
      config_negative: "config-suppressed",
      shell_positive: "shell-available",
      shell_negative: "shell-removed",
    });

    // Every canary call runs from a fresh empty cwd under the context root
    // with the isolated OS HOME and no hostile launcher variables.
    for (const call of calls) {
      assert.ok(call.cwd.startsWith(ctx.rootDir), `cwd ${call.cwd} outside root`);
      assert.equal(call.env.HOME, ctx.osHome);
      assert.equal(call.env.CLAUDE_EFFORT, undefined);
      assert.equal(call.env.NODE_OPTIONS, undefined);
      assert.equal(call.env.ANTHROPIC_API_KEY, undefined);
    }
    // The negative instruction legs target the REAL isolated homes with the
    // full suppression flag set.
    const claudeNegative = calls.find(
      (c) => c.cmd === "claude" && c.args.join(" ").includes("--safe-mode") &&
        c.env.CLAUDE_CONFIG_DIR === ctx.providers.claude!.homeDir
    );
    assert.ok(claudeNegative, "claude negative leg must run against the real isolated home");
    for (const flag of CLAUDE_CLEAN_FLAGS.filter((f) => f !== "")) {
      assert.ok(claudeNegative!.args.includes(flag), `missing ${flag}`);
    }
    const codexNegative = calls.find(
      (c) => c.cmd === "codex" && c.args.includes("--ignore-user-config") &&
        c.env.CODEX_HOME === ctx.providers.codex!.homeDir &&
        !c.args.join(" ").includes("NOSHELL")
    );
    assert.ok(codexNegative, "codex negative leg must run against the real isolated home");
  } finally {
    ctx.cleanup();
  }
});

test("a dead positive control fails the preflight", async () => {
  const { ctx, auth } = canaryCtx();
  const deps: CanaryCliDeps = {
    async runCli(cmd) {
      // The canary instruction never injects — e.g. the CLI stopped reading
      // the surface. That must fail, not silently pass as "clean".
      return cmd === "claude"
        ? { stdout: claudeJson("OK"), stderr: "", code: 0 }
        : { stdout: codexJsonl("OK"), stderr: "", code: 0 };
    },
  };
  try {
    await assert.rejects(
      runCanaryMatrix(ctx, deps, auth),
      (err: unknown) =>
        err instanceof MatchPreflightError && /canary/.test(err.message)
    );
  } finally {
    ctx.cleanup();
  }
});

test("a leaking negative leg fails the preflight", async () => {
  const { ctx, auth } = canaryCtx();
  const deps: CanaryCliDeps = {
    async runCli() {
      // Everything injects — including the supposedly isolated invocation.
      return { stdout: claudeJson(`${CANARY_WORD} OK`), stderr: "", code: 0 };
    },
  };
  try {
    await assert.rejects(
      runCanaryMatrix(ctx, deps, auth),
      (err: unknown) =>
        err instanceof MatchPreflightError && /漏れ/.test(err.message)
    );
  } finally {
    ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Invocation builders
// ---------------------------------------------------------------------------

test("buildClaudeInvocation appends isolation flags/env/cwd only when isolated", () => {
  const ambient = buildClaudeInvocation({
    userText: "hi",
    model: "claude-fable-5",
    effort: "low",
    sessionArgs: ["--session-id", "s1"],
    ambientCwd: "/tmp/ambient",
  });
  assert.deepEqual(ambient.argv.slice(0, 6), [
    "-p", "hi", "--output-format", "json", "--model", "claude-fable-5",
  ]);
  assert.ok(!ambient.argv.includes("--safe-mode"));
  assert.equal(ambient.cwd, "/tmp/ambient");

  const isolation = {
    env: { PATH: "/usr/bin", HOME: "/iso/home", CLAUDE_CONFIG_DIR: "/iso/claude" },
    extraArgs: CLAUDE_CLEAN_FLAGS,
    cwd: "/iso/cwd-0",
  };
  const clean = buildClaudeInvocation({
    userText: "hi",
    model: "claude-fable-5",
    effort: "low",
    sessionArgs: ["--resume", "s1"],
    ambientCwd: "/tmp/ambient",
    isolation,
  });
  for (const flag of CLAUDE_CLEAN_FLAGS.filter((f) => f !== "")) {
    assert.ok(clean.argv.includes(flag), `missing ${flag}`);
  }
  assert.equal(clean.cwd, "/iso/cwd-0");
  assert.equal(clean.env.CLAUDE_CONFIG_DIR, "/iso/claude");
});

test("buildCodexInvocation keeps the prompt last and injects isolation flags on both paths", () => {
  const isolation = {
    env: { PATH: "/usr/bin", HOME: "/iso/home", CODEX_HOME: "/iso/codex" },
    extraArgs: CODEX_CLEAN_FLAGS,
    cwd: "/iso/cwd-1",
  };
  const fresh = buildCodexInvocation({
    userText: "prompt-text",
    model: "gpt-5.6-sol",
    effortArgs: ["-c", 'model_reasoning_effort="high"'],
    ambientCwd: "/tmp/a",
    isolation,
  });
  assert.equal(fresh.argv[0], "exec");
  assert.equal(fresh.argv[fresh.argv.length - 1], "prompt-text");
  assert.ok(fresh.argv.includes("--ignore-user-config"));
  assert.ok(fresh.argv.includes("shell_tool"));
  const resumed = buildCodexInvocation({
    userText: "prompt-text",
    model: "gpt-5.6-sol",
    effortArgs: [],
    resumeThreadId: "thread-1",
    ambientCwd: "/tmp/a",
    isolation,
  });
  assert.deepEqual(resumed.argv.slice(0, 3), ["exec", "resume", "thread-1"]);
  assert.ok(resumed.argv.includes("--ignore-user-config"));
  assert.equal(resumed.argv[resumed.argv.length - 1], "prompt-text");
  const ambient = buildCodexInvocation({
    userText: "p",
    model: "",
    effortArgs: [],
    ambientCwd: "/tmp/a",
  });
  assert.ok(!ambient.argv.includes("--ignore-user-config"));
});

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

test("isolationManifest records versions, surfaces, and canary evidence", async () => {
  const { ctx, auth } = canaryCtx();
  try {
    const staticResults = staticChecks(ctx);
    const canaryResults = await runCanaryMatrix(ctx, healthyFakeDeps(ctx, []), auth);
    const manifest = isolationManifest(
      ctx,
      { claude: "2.1.220 (Claude Code)", codex: "codex-cli 0.144.5" },
      staticResults,
      canaryResults
    ) as any;
    assert.equal(manifest.schema, ISOLATION_SCHEMA);
    assert.equal(manifest.mode, "clean-room");
    assert.equal(manifest.revision, "clean-room-v1");
    assert.equal(manifest.providers.claude.cli_version, "2.1.220 (Claude Code)");
    assert.equal(manifest.providers.codex.cli_version, "codex-cli 0.144.5");
    assert.equal(manifest.providers.claude.surfaces.instructions, "canary-verified");
    assert.equal(manifest.providers.claude.surfaces.managed_policy, "checked-absent");
    assert.equal(manifest.providers.codex.surfaces.shell_tools, "canary-verified");
    assert.equal(manifest.providers.codex.surfaces.network_web_search, "feature-state-recorded");
    assert.equal(manifest.providers.codex.canary.outcomes.shell_negative, "shell-removed");
    assert.equal(manifest.providers.claude.canary.effort, "cli-default");
    assert.equal(manifest.providers.codex.canary.effort, "low");
    assert.deepEqual(manifest.providers.codex.canary.enabledFeatures, ["apps", "shell_tool"]);
    assert.ok(manifest.providers.claude.opaque_condition_note.includes("version"));
    assert.deepEqual([...manifest.providers.claude.allowed_env_keys], [...CLEAN_ENV_ALLOWLIST]);
  } finally {
    ctx.cleanup();
  }
});

test("ambientManifest is a labeled non-claim", () => {
  const manifest = ambientManifest() as any;
  assert.equal(manifest.schema, ISOLATION_SCHEMA);
  assert.equal(manifest.mode, "ambient");
  assert.equal(manifest.revision, null);
  assert.ok(manifest.note.includes("--ambient-cli-env"));
});
