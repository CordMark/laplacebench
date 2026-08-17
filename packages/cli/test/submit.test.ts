import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  UPSTREAM_REPO,
  rawRunUrl,
  replayHandoffUrl,
  replayHandoffs,
  submissionDirName,
  submitRun,
  validatePublicSubmission,
  type SubmitDeps,
} from "../src/submit";
import { buildPublicReplay } from "../src/publicreplay";

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
    publicVerifyThrows?: string;
    publicVerifyFinalThrows?: string;
    prUrl?: string;
    pushThrows?: string;
    prThrows?: string;
  } = {}
) {
  const calls: Call[] = [];
  const printed: string[] = [];
  const publicChecks: string[] = [];
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
      if (opts.prThrows) throw new Error(opts.prThrows);
      return `${opts.prUrl ?? "https://github.com/x/y/pull/9"}\n`;
    }
    if (cmd === "git" && args[0] === "push" && opts.pushThrows) {
      throw new Error(opts.pushThrows);
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
    verifyPublic(_runDir, effectiveRunId) {
      publicChecks.push(effectiveRunId);
      if (opts.publicVerifyThrows) throw new Error(opts.publicVerifyThrows);
      if (effectiveRunId !== "preflight" && opts.publicVerifyFinalThrows) {
        throw new Error(opts.publicVerifyFinalThrows);
      }
    },
    mkdtemp: () => work,
    print: (l) => printed.push(l),
  };
  return { deps, calls, printed, publicChecks, work };
}

interface GameAgents {
  id: string;
  teamA: string;
  teamB: string;
}

const PUBLIC_A = "claude-cli:claude-opus-5@high";
const PUBLIC_B = "codex-cli:gpt-5.6-sol@high";

function makeRun(games: GameAgents[] = [
  { id: "game-000", teamA: PUBLIC_A, teamB: PUBLIC_B },
]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-run-"));
  const runDir = path.join(dir, "20260725-a-vs-b");
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "run.json"), "{}");
  for (const game of games) {
    const gameDir = path.join(runDir, "games", game.id);
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(
      path.join(gameDir, "final.json"),
      JSON.stringify({
        teams: {
          A: { agent: game.teamA },
          B: { agent: game.teamB },
        },
      })
    );
  }
  return runDir;
}

const ran = (calls: Call[], cmd: string, first: string) =>
  calls.some((c) => c.cmd === cmd && c.args[0] === first);

test("submission routing pins the transferred canonical repository owner", () => {
  assert.equal(UPSTREAM_REPO, "CordMark/laplacebench");
  assert.equal(
    rawRunUrl("main", "alice--run-1"),
    "https://raw.githubusercontent.com/CordMark/laplacebench/main/community/runs/alice--run-1",
  );
});

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

test("unsafe public commentary is rejected before any external lookup", () => {
  const { deps, calls, printed, publicChecks } = harness({
    publicVerifyThrows: "game-000.events[7].commentary exceeds the commentary content boundary",
  });
  const out = submitRun(makeRun(), deps);
  assert.equal(out.status, "blocked");
  assert.deepEqual(publicChecks, ["preflight"]);
  assert.equal(calls.length, 0);
  assert.match(printed.join("\n"), /公開リプレイ検証に失敗/);
  assert.match(printed.join("\n"), /game-000\.events\[7\]/);
});

test("final submission identity is rejected after login but before repository actions", () => {
  const { deps, calls, printed, publicChecks } = harness({
    login: "alice",
    publicVerifyFinalThrows: "invalid raw_ref segment",
  });
  const out = submitRun(makeRun(), deps);
  assert.equal(out.status, "blocked");
  assert.deepEqual(publicChecks, ["preflight", "alice--20260725-a-vs-b"]);
  assert.deepEqual(calls.map(({ cmd, args }) => [cmd, ...args]), [
    ["gh", "api", "user", "--jq", ".login"],
  ]);
  assert.ok(!printed.join("\n").includes("laplace.zone/bench/replay"));
});

test("default public preflight uses final identity and matches publisher bytes", () => {
  const root = path.resolve(__dirname, "../../..");
  const runDir = fs.readdirSync(path.join(root, "community/runs"))
    .find((name) => name.includes("2026-07-27T1032"));
  assert.ok(runDir);
  const source = path.join(root, "community/runs", runDir);
  const effectiveRunId = "alice--public-preflight-equivalence";
  assert.doesNotThrow(() => validatePublicSubmission(source, effectiveRunId));

  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-submit-identity-"));
  const copied = path.join(parent, effectiveRunId);
  fs.cpSync(source, copied, { recursive: true });
  const preflight = buildPublicReplay(source, "game-000", effectiveRunId);
  const publisher = buildPublicReplay(copied, "game-000");
  assert.equal(preflight.digest, publisher.digest);
  assert.deepEqual(preflight.bytes, publisher.bytes);

  const tooLong = "a".repeat(97);
  assert.throws(() => validatePublicSubmission(source, tooLong), /invalid raw_ref/);
});

test("default public preflight rejects unsafe eligible notes and skips non-public games", () => {
  const root = path.resolve(__dirname, "../../..");
  const sourceName = fs.readdirSync(path.join(root, "community/runs"))
    .find((name) => name.includes("2026-07-27T1032"));
  assert.ok(sourceName);
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "laplace-submit-note-")), "run");
  fs.cpSync(path.join(root, "community/runs", sourceName), copy, { recursive: true });
  const eventsPath = path.join(copy, "games/game-000/events.jsonl");
  const events = fs.readFileSync(eventsPath, "utf8").split("\n").filter(Boolean)
    .map((line) => JSON.parse(line));
  const move = events.find((event) => event.t === "move");
  move.note = "file:secret";
  fs.writeFileSync(eventsPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  assert.throws(
    () => validatePublicSubmission(copy, "alice--unsafe-note"),
    /commentary content boundary/
  );

  const baseline = makeRun([{ id: "game-000", teamA: "random", teamB: "greedy" }]);
  assert.doesNotThrow(() => validatePublicSubmission(baseline, "alice--baseline"));
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
  const { deps, calls, printed, work } = harness({ canPush: true, login: "keisuke70" });
  const out = submitRun(makeRun(), deps);
  assert.equal(out.status, "submitted");
  assert.equal((out as { lane: string }).lane, "direct");

  const permission = calls.find(
    (c) => c.cmd === "gh" && c.args[0] === "api" && c.args[1]?.startsWith("repos/"),
  );
  assert.deepEqual(permission?.args, [
    "api", "repos/CordMark/laplacebench", "--jq", ".permissions.push",
  ]);
  const clone = calls.find(
    (c) => c.cmd === "gh" && c.args[0] === "repo" && c.args[1] === "clone",
  );
  assert.deepEqual(clone?.args, [
    "repo", "clone", "CordMark/laplacebench", path.join(work, "laplacebench"),
    "--", "--depth", "1",
  ]);
  assert.ok(!calls.some((c) => c.cmd === "gh" && c.args[0] === "repo" && c.args[1] === "fork"));
  assert.ok(!calls.some((c) => c.cmd === "gh" && c.args[0] === "pr"));
  const push = calls.find((c) => c.cmd === "git" && c.args[0] === "push");
  assert.deepEqual(push?.args, ["push", "origin", "HEAD:main"]);
  assert.ok(printed.join("\n").includes("commit/cafe1234"));
  assert.equal((out as { replays: unknown[] }).replays.length, 1);
  assert.ok(printed.join("\n").includes("laplace.zone/bench/replay?ref="));
});

test("an account without push access forks and opens a pull request", () => {
  const { deps, calls, printed, work } = harness({ canPush: false, login: "alice" });
  const out = submitRun(makeRun(), deps);
  assert.equal(out.status, "submitted");
  assert.equal((out as { lane: string }).lane, "pull-request");
  assert.equal((out as { url: string }).url, "https://github.com/x/y/pull/9");

  const permission = calls.find(
    (c) => c.cmd === "gh" && c.args[0] === "api" && c.args[1]?.startsWith("repos/"),
  );
  assert.deepEqual(permission?.args, [
    "api", "repos/CordMark/laplacebench", "--jq", ".permissions.push",
  ]);
  const fork = calls.find((c) => c.cmd === "gh" && c.args[1] === "fork");
  assert.deepEqual(fork?.args, [
    "repo", "fork", "CordMark/laplacebench", "--clone=false", "--remote=false",
  ]);
  const clone = calls.find(
    (c) => c.cmd === "gh" && c.args[0] === "repo" && c.args[1] === "clone",
  );
  assert.deepEqual(clone?.args, [
    "repo", "clone", "alice/laplacebench", path.join(work, "laplacebench"),
    "--", "--depth", "1",
  ]);
  const pr = calls.find((c) => c.cmd === "gh" && c.args[0] === "pr");
  assert.deepEqual(pr?.args, [
    "pr", "create",
    "--repo", "CordMark/laplacebench",
    "--head", "alice:submit/alice--20260725-a-vs-b",
    "--title", "Add community run alice--20260725-a-vs-b",
    "--body",
    "`laplacebench submit` による自動提出。CI がリプレイ検証を通せば自動マージされます。",
  ]);
  const branch = calls.find((c) => c.cmd === "git" && c.args[0] === "checkout");
  assert.match(String(branch?.args[2]), /^submit\/alice--/);
  assert.ok(printed.join("\n").includes("提出PR"));

  // The run landed under the directory name CI checks against the author.
  const dest = path.join(work, "laplacebench", "community", "runs");
  const [dirName] = fs.readdirSync(dest);
  assert.match(dirName, /^alice--/);
  assert.ok(fs.existsSync(path.join(dest, dirName, "games", "game-000", "final.json")));
  assert.equal((out as { replays: unknown[] }).replays.length, 1);
  assert.ok(printed.join("\n").includes("laplace.zone/bench/replay?ref="));
});

test("a canonical pair returns two strict replay handoffs after one successful submission", () => {
  const runDir = makeRun([
    { id: "game-001", teamA: PUBLIC_B, teamB: PUBLIC_A },
    { id: "game-000", teamA: PUBLIC_A, teamB: PUBLIC_B },
  ]);
  const { deps, printed } = harness({ canPush: true, login: "alice" });
  const out = submitRun(runDir, deps);
  assert.equal(out.status, "submitted");
  if (out.status !== "submitted") return;

  assert.deepEqual(out.replays.map(({ gameId }) => gameId), ["game-000", "game-001"]);
  assert.deepEqual(out.replays.map(({ rawRef }) => rawRef), [
    "alice--20260725-a-vs-b/game-000",
    "alice--20260725-a-vs-b/game-001",
  ]);
  for (const replay of out.replays) {
    const url = new URL(replay.url);
    assert.equal(url.origin, "https://laplace.zone");
    assert.equal(url.pathname, "/bench/replay");
    assert.equal(url.searchParams.get("ref"), replay.rawRef);
    assert.equal(url.searchParams.get("lang"), "ja");
    assert.equal(url.searchParams.has("id"), false);
    assert.equal(url.searchParams.has("pending"), false);
    assert.equal(url.searchParams.has("src"), false);
  }
  assert.equal(
    printed.filter((line) => line.includes("laplace.zone/bench/replay?ref=")).length,
    2
  );
});

test("direct and pull-request lanes return the same product handoff contract", () => {
  const direct = submitRun(makeRun(), harness({ canPush: true, login: "alice" }).deps);
  const pullRequest = submitRun(makeRun(), harness({ canPush: false, login: "alice" }).deps);
  assert.equal(direct.status, "submitted");
  assert.equal(pullRequest.status, "submitted");
  if (direct.status !== "submitted" || pullRequest.status !== "submitted") return;
  assert.deepEqual(direct.replays, pullRequest.replays);
});

test("courtesy filtering mirrors public arena eligibility without predicting publication", () => {
  const cases: Array<{ name: string; teamA: string; teamB: string; count: number }> = [
    { name: "baseline-only", teamA: "random", teamB: "greedy", count: 0 },
    {
      name: "same headline through another harness",
      teamA: "claude-cli-learn:claude-opus-5@high",
      teamB: "claude-cli:claude-opus-5@high",
      count: 0,
    },
    {
      name: "LLM versus product CPU",
      teamA: PUBLIC_A,
      teamB: "product-cpu:cpu-v6:level_3",
      count: 1,
    },
  ];
  for (const example of cases) {
    const runDir = makeRun([{ id: "game-000", teamA: example.teamA, teamB: example.teamB }]);
    assert.equal(replayHandoffs(runDir, "alice--20260725-a-vs-b").length, example.count, example.name);
  }
});

test("verification, authentication, and publication failures never print success handoffs", () => {
  const cases = [
    harness({ verifyThrows: "bad replay" }),
    harness({ login: null }),
    harness({ canPush: true, pushThrows: "push failed" }),
    harness({ canPush: false, prThrows: "PR failed" }),
  ];
  for (const example of cases) {
    try {
      submitRun(makeRun(), example.deps);
    } catch {
      // Publication process errors are intentionally surfaced to runPlay.
    }
    assert.equal(
      example.printed.some((line) => line.includes("laplace.zone/bench/replay?ref=")),
      false
    );
  }
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
  assert.equal(
    replayHandoffUrl("alice--run-1/game-000"),
    "https://laplace.zone/bench/replay?ref=alice--run-1%2Fgame-000&lang=ja"
  );
});
