import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { arena, resolveIsolationMode } from "../src/cli";
import {
  CLAUDE_CLEAN_FLAGS,
  prepareCleanRoom,
  type CanaryCliDeps,
} from "../src/cleanroom";
import { learningClaudeCliAgent } from "../src/agents/learning";
import { MatchPreflightError } from "../src/playerrors";
import { runPlay, type WizardIO } from "../src/wizard";

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeCred(): string {
  const p = path.join(tmp("laplace-cred-"), "cred.json");
  fs.writeFileSync(p, "{}");
  return p;
}

test("resolveIsolationMode: clean-room is the default, ambient only by opt-in, null without CLI agents", () => {
  assert.equal(resolveIsolationMode(false, "claude-cli:m@low", "random").mode, "clean-room");
  assert.equal(resolveIsolationMode(false, "claude-cli-learn:m@low", "codex-cli:@low").mode, "clean-room");
  assert.deepEqual(
    resolveIsolationMode(false, "claude-cli-learn:m@low", "codex-cli:@low").providers.sort(),
    ["claude", "codex"]
  );
  assert.equal(resolveIsolationMode(true, "codex-cli:@low", "random").mode, "ambient");
  assert.equal(resolveIsolationMode(false, "random", "takeshi:d2").mode, null);
  assert.equal(resolveIsolationMode(false, "anthropic:claude-opus-5", "random").mode, null);
});

test("preflight failure leaves no run directory behind (no silent fallback)", async () => {
  const runId = `cleanroom-orchestration-test-${process.pid}`;
  const runDir = path.resolve(process.cwd(), "runs", runId);
  const failingDeps: CanaryCliDeps = {
    async runCli() {
      return { stdout: JSON.stringify({ is_error: false, result: "OK" }), stderr: "", code: 0 };
    },
  };
  try {
    await assert.rejects(
      arena(
        { "team-a": "claude-cli:claude-fable-5@low", "team-b": "random", games: "1", "run-id": runId },
        {
          cleanRoomDeps: { claudeCredentials: fakeCred(), policyPaths: [] },
          canaryCliDeps: failingDeps, // positive control never injects → canary death
          resolveCommandVersion: () => "test-version",
        }
      ),
      (err: unknown) => err instanceof MatchPreflightError && /canary/.test(err.message)
    );
    assert.ok(!fs.existsSync(runDir), "run dir must not exist after a failed preflight");
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("an unresolvable CLI version refuses to start the match", async () => {
  const runId = `cleanroom-orchestration-test-version-${process.pid}`;
  const runDir = path.resolve(process.cwd(), "runs", runId);
  try {
    await assert.rejects(
      arena(
        { "team-a": "codex-cli:@low", "team-b": "random", games: "1", "run-id": runId },
        {
          cleanRoomDeps: { codexAuth: fakeCred(), policyPaths: [] },
          resolveCommandVersion: () => null,
        }
      ),
      (err: unknown) => err instanceof MatchPreflightError && /version/.test(err.message)
    );
    assert.ok(!fs.existsSync(runDir));
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("learning agent: analysis runs inside the live isolation cwd with clean-room flags; dispose cleans up", async () => {
  // A PATH-shimmed `claude` executable records its cwd/args and returns a
  // valid analysis reply — the full learning lifecycle without any real CLI.
  const shimDir = tmp("laplace-shim-");
  const logPath = path.join(shimDir, "shim.log");
  const payload = JSON.stringify({ is_error: false, result: "S".repeat(210) });
  fs.writeFileSync(
    path.join(shimDir, "claude"),
    `#!/bin/sh\necho "cwd=$(pwd)" >> "${logPath}"\necho "args=$*" >> "${logPath}"\ncat <<'PAYLOAD'\n${payload}\nPAYLOAD\n`,
    { mode: 0o755 }
  );

  const ctx = prepareCleanRoom(["claude"], {
    claudeCredentials: fakeCred(),
    baseEnv: { PATH: `${shimDir}:${process.env.PATH}`, CLAUDE_EFFORT: "xhigh" },
    rootParent: tmp("laplace-rootparent-"),
    policyPaths: [],
  });
  const isolation = ctx.agentIsolation("claude");
  const runDir = tmp("laplace-learn-run-");
  const eventsPath = path.join(runDir, "events.jsonl");
  fs.writeFileSync(
    eventsPath,
    [
      JSON.stringify({ t: "move", ply: 0, player: 1, from: [0, 3], to: [4, 3], captures: [] }),
      JSON.stringify({ t: "game_end", winner: "A", reason: "center", plies: 1, losses: {} }),
    ].join("\n") + "\n"
  );

  const agent = learningClaudeCliAgent({ model: "claude-fable-5", runDir, isolation });
  try {
    await agent.endGame?.({
      gameId: "game-000",
      team: "A",
      result: "win",
      winner: "A",
      reason: "center",
      plies: 1,
      eventsPath,
    });

    // The analysis call ran from the isolation cwd, which was still alive.
    // (compare realpaths: sh's pwd resolves macOS's /var -> /private/var link)
    const log = fs.readFileSync(logPath, "utf8");
    const realCwd = fs.realpathSync(isolation.cwd);
    assert.ok(log.includes(`cwd=${realCwd}`), `analysis must run in ${realCwd}`);
    assert.ok(log.includes("--safe-mode"), "analysis call must carry the clean-room flags");
    assert.ok(fs.existsSync(path.join(runDir, "learn", "strategy.md")), "strategy must be written");
    assert.ok(fs.existsSync(isolation.cwd), "cwd must survive endGame for the analysis");

    await agent.dispose?.();
    assert.ok(!fs.existsSync(isolation.cwd), "dispose owns the cwd");
    assert.ok(fs.existsSync(ctx.providers.claude!.homeDir), "dispose must not touch the shared home");
  } finally {
    await agent.dispose?.();
    ctx.cleanup();
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test("wizard passes --ambient-cli-env through to the runner", async () => {
  const printed: string[] = [];
  const io: WizardIO = {
    async select() {
      throw new Error("headless run must not prompt");
    },
    async input() {
      throw new Error("headless run must not prompt");
    },
    print(line: string) {
      printed.push(line);
    },
  };
  let seen: Record<string, string | boolean> | null = null;
  const code = await runPlay(
    {
      env: {} as NodeJS.ProcessEnv,
      checkCommand: () => ({ ok: true, version: "1.0-test" }),
      randomSeed: () => 4242,
      runArena: async (a) => {
        seen = a;
        return { failedGames: 0 };
      },
      submitRun: () => {
        throw new Error("must not submit");
      },
      isTTY: false,
      now: () => new Date("2026-07-30T12:00:00Z"),
    },
    io,
    { "team-a": "random", "team-b": "greedy", games: "1", seed: "7", "ambient-cli-env": true }
  );
  assert.equal(code, 0);
  assert.equal(seen!["ambient-cli-env"], true);
});
