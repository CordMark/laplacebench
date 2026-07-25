import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  UPSTREAM_REPO,
  rawRunUrl,
  submissionDirName,
  submitRun,
  type SubmitDeps,
} from "../src/submit";

interface Call {
  cmd: string;
  args: string[];
  cwd?: string;
}

function harness(
  opts: {
    login?: string | null;
    canPush?: boolean;
    verifyThrows?: string;
    prUrl?: string;
  } = {}
) {
  const calls: Call[] = [];
  const printed: string[] = [];
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-submit-test-"));

  const respond = (cmd: string, args: string[]): string => {
    const joined = args.join(" ");
    if (cmd === "gh" && joined === "api user --jq .login") {
      if (opts.login === null) throw new Error("not authenticated");
      return `${opts.login ?? "alice"}\n`;
    }
    if (cmd === "gh" && joined.startsWith(`api repos/${UPSTREAM_REPO}`)) {
      return `${opts.canPush ? "true" : "false"}\n`;
    }
    if (cmd === "gh" && args[0] === "repo" && args[1] === "clone") {
      // Stand in for the clone: the destination must exist for the copy step.
      fs.mkdirSync(path.join(args[3], "community", "runs"), { recursive: true });
      return "";
    }
    if (cmd === "gh" && args[0] === "pr") {
      return `${opts.prUrl ?? "https://github.com/x/y/pull/9"}\n`;
    }
    if (cmd === "git" && args[0] === "rev-parse") return "cafe1234\n";
    return "";
  };

  const deps: SubmitDeps = {
    run(cmd, args, o) {
      calls.push({ cmd, args, cwd: o?.cwd });
      return respond(cmd, args);
    },
    tryRun(cmd, args, o) {
      calls.push({ cmd, args, cwd: o?.cwd });
      try {
        return respond(cmd, args);
      } catch {
        return null;
      }
    },
    verify() {
      if (opts.verifyThrows) throw new Error(opts.verifyThrows);
    },
    mkdtemp: () => work,
    print: (l) => printed.push(l),
  };
  return { deps, calls, printed, work };
}

function makeRun(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-run-"));
  const runDir = path.join(dir, "20260725-a-vs-b");
  fs.mkdirSync(path.join(runDir, "games", "game-000"), { recursive: true });
  fs.writeFileSync(path.join(runDir, "run.json"), "{}");
  fs.writeFileSync(path.join(runDir, "games", "game-000", "final.json"), "{}");
  return runDir;
}

const ran = (calls: Call[], cmd: string, first: string) =>
  calls.some((c) => c.cmd === cmd && c.args[0] === first);

test("a run that fails replay verification is never published", () => {
  const { deps, calls, printed } = harness({ verifyThrows: "game-000: winner mismatch" });
  const out = submitRun(makeRun(), deps);
  assert.deepEqual(
    { status: out.status, reason: (out as { reason: string }).reason },
    { status: "blocked", reason: "verify-failed" }
  );
  // Nothing left the machine.
  assert.equal(calls.length, 0);
  assert.ok(printed.join("\n").includes("winner mismatch"));
});

test("no GitHub auth prints instructions and stops — it is not a crash", () => {
  const { deps, calls, printed } = harness({ login: null });
  const out = submitRun(makeRun(), deps);
  assert.equal(out.status, "blocked");
  assert.equal((out as { reason: string }).reason, "not-authenticated");
  assert.ok(printed.join("\n").includes("gh auth login"));
  // No clone, no fork, no push was attempted.
  assert.ok(!ran(calls, "gh", "repo"));
  assert.ok(!ran(calls, "git", "push"));
});

test("an account with push access publishes straight to main, no pull request", () => {
  const { deps, calls, printed } = harness({ canPush: true, login: "keisuke70" });
  const out = submitRun(makeRun(), deps);
  assert.equal(out.status, "submitted");
  assert.equal((out as { lane: string }).lane, "direct");

  assert.ok(!calls.some((c) => c.cmd === "gh" && c.args[0] === "repo" && c.args[1] === "fork"));
  assert.ok(!calls.some((c) => c.cmd === "gh" && c.args[0] === "pr"));
  const push = calls.find((c) => c.cmd === "git" && c.args[0] === "push");
  assert.deepEqual(push?.args, ["push", "origin", "HEAD:main"]);
  assert.ok(printed.join("\n").includes("commit/cafe1234"));
});

test("an account without push access forks and opens a pull request", () => {
  const { deps, calls, printed, work } = harness({ canPush: false, login: "alice" });
  const out = submitRun(makeRun(), deps);
  assert.equal(out.status, "submitted");
  assert.equal((out as { lane: string }).lane, "pull-request");
  assert.equal((out as { url: string }).url, "https://github.com/x/y/pull/9");

  assert.ok(calls.some((c) => c.cmd === "gh" && c.args[1] === "fork"));
  const branch = calls.find((c) => c.cmd === "git" && c.args[0] === "checkout");
  assert.match(String(branch?.args[2]), /^submit\/alice--/);
  assert.ok(printed.join("\n").includes("提出PR"));

  // The run landed under the directory name CI checks against the author.
  const dest = path.join(work, "laplacebench", "community", "runs");
  const [dirName] = fs.readdirSync(dest);
  assert.match(dirName, /^alice--/);
  assert.ok(fs.existsSync(path.join(dest, dirName, "games", "game-000", "final.json")));
});

test("submitting the same run twice is refused rather than duplicated", () => {
  const { deps, work } = harness({ canPush: false, login: "alice" });
  const runDir = makeRun();
  assert.equal(submitRun(runDir, deps).status, "submitted");
  // Second attempt reuses the same scratch clone, so the directory is present.
  void work;
  const again = submitRun(runDir, deps);
  assert.equal(again.status, "blocked");
  assert.equal((again as { detail: string }).detail, "already-submitted");
});

test("the submission directory name is what the CI prefix check expects", () => {
  assert.equal(submissionDirName("alice", "run-1"), "alice--run-1");
  assert.ok(
    rawRunUrl("main", "alice--run-1").endsWith(
      `${UPSTREAM_REPO}/main/community/runs/alice--run-1`
    )
  );
});
