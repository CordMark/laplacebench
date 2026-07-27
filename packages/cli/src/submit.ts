import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { assertRawRef } from "./publicarena-contract";
import { publicPair } from "./publicgames";

/**
 * Submit a finished run to the public ledger without the submitter touching git
 * by hand. Most people reach this through `npx laplacebench`, so nothing here
 * assumes a repository checkout — the work happens in a throwaway clone.
 *
 * Two paths, chosen by what the account can actually do: push access means the
 * run goes straight to main, everyone else gets a fork and a pull request that
 * CI merges on its own. Verification runs locally first either way, so a run
 * that cannot replay is never published.
 *
 * docs/plans/2026-07-25-community-lane-v2.md
 */

export const UPSTREAM_REPO = "keisuke70/laplacebench";

export interface SubmitDeps {
  /** Run a command; throws on non-zero exit. */
  run(cmd: string, args: string[], opts?: { cwd?: string }): string;
  /** Same, but returns null instead of throwing. */
  tryRun(cmd: string, args: string[], opts?: { cwd?: string }): string | null;
  /** Replay-verify a run directory; throws with the reason when it fails. */
  verify(runDir: string): void;
  mkdtemp(): string;
  print(line: string): void;
}

export type SubmitOutcome =
  | {
      status: "submitted";
      lane: "direct" | "pull-request";
      url: string;
      dir: string;
      replays: ReplayHandoff[];
    }
  | { status: "blocked"; reason: "not-authenticated" | "verify-failed"; detail?: string };

export interface ReplayHandoff {
  gameId: string;
  rawRef: string;
  url: string;
}

/** `<login>--<run-id>` — the prefix CI checks against the pull request author. */
export function submissionDirName(login: string, runId: string): string {
  return `${login}--${runId}`;
}

/**
 * Where the immutable source record lands once published. The product replay
 * handoff is separate: it resolves a strict catalog raw_ref, never this URL.
 */
export function rawRunUrl(ref: string, dirName: string): string {
  return `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${ref}/community/runs/${dirName}`;
}

export function replayHandoffUrl(rawRef: string): string {
  assertRawRef(rawRef);
  return `https://laplace.zone/bench/replay?ref=${encodeURIComponent(rawRef)}&lang=ja`;
}

/**
 * Build temporary product locators from the final submitted basename. The CLI
 * deliberately does not predict replay digests: the verified publisher-issued
 * catalog remains the only digest and readiness authority.
 */
export function replayHandoffs(runDir: string, dirName: string): ReplayHandoff[] {
  const gamesDir = path.join(runDir, "games");
  return fs.readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((gameId) => {
      const finalPath = path.join(gamesDir, gameId, "final.json");
      if (!fs.existsSync(finalPath)) return [];
      const final = JSON.parse(fs.readFileSync(finalPath, "utf8"));
      const specA = final?.teams?.A?.agent;
      const specB = final?.teams?.B?.agent;
      if (typeof specA !== "string" || typeof specB !== "string") {
        throw new Error(`${gameId}: final.json has no recorded team agents`);
      }
      if (!publicPair(specA, specB)) return [];
      const rawRef = `${dirName}/${gameId}`;
      assertRawRef(rawRef);
      return [{ gameId, rawRef, url: replayHandoffUrl(rawRef) }];
    });
}

function printReplayHandoffs(deps: SubmitDeps, replays: ReplayHandoff[]): void {
  if (replays.length === 0) {
    deps.print("▸ この対局セットは公開アリーナの対象外です。リプレイURLはありません。");
    return;
  }
  deps.print("▸ 公開リプレイ（反映後に自動表示）:");
  for (const replay of replays) deps.print(`  ${replay.gameId}: ${replay.url}`);
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    // Anything else (symlink, socket) is dropped: the gate rejects non-regular
    // files anyway, so copying them would only produce a submission that holds.
  }
}

export function submitRun(
  runDir: string,
  deps: SubmitDeps
): SubmitOutcome {
  const resolved = path.resolve(runDir);
  const runId = path.basename(resolved);

  // Fail-closed before anything leaves the machine.
  try {
    deps.verify(resolved);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    deps.print(`✗ リプレイ検証に失敗しました。提出しません:\n  ${detail}`);
    return { status: "blocked", reason: "verify-failed", detail };
  }
  deps.print("✓ リプレイ検証を通過");

  const login = deps.tryRun("gh", ["api", "user", "--jq", ".login"])?.trim();
  if (!login) {
    deps.print(
      [
        "GitHub CLI の認証が必要です。次を実行してから、もう一度お試しください:",
        "  gh auth login",
        "",
        "手動で提出する場合は community/README.md を参照してください。",
      ].join("\n")
    );
    return { status: "blocked", reason: "not-authenticated" };
  }

  const canPush =
    deps
      .tryRun("gh", ["api", `repos/${UPSTREAM_REPO}`, "--jq", ".permissions.push"])
      ?.trim() === "true";

  const dirName = submissionDirName(login, runId);
  const work = deps.mkdtemp();
  const repoDir = path.join(work, "laplacebench");

  if (canPush) {
    deps.run("gh", ["repo", "clone", UPSTREAM_REPO, repoDir, "--", "--depth", "1"]);
  } else {
    // `--force` keeps this idempotent when the fork already exists.
    deps.run("gh", ["repo", "fork", UPSTREAM_REPO, "--clone=false", "--remote=false"]);
    deps.run("gh", ["repo", "clone", `${login}/laplacebench`, repoDir, "--", "--depth", "1"]);
  }

  const dest = path.join(repoDir, "community", "runs", dirName);
  if (fs.existsSync(dest)) {
    deps.print(`✗ ${dirName} は既に提出済みです。`);
    return { status: "blocked", reason: "verify-failed", detail: "already-submitted" };
  }
  copyDir(resolved, dest);
  const replays = replayHandoffs(dest, dirName);

  const message = [
    `Add community run ${dirName}`,
    "",
    "意図: 自分が回した対局を公開台帳へ提出する (laplacebench submit)。",
    "やったこと: リプレイ検証済みの run ディレクトリを community/runs へ追加した。",
  ].join("\n");

  deps.run("git", ["add", "--", `community/runs/${dirName}`], { cwd: repoDir });
  deps.run("git", ["commit", "-m", message], { cwd: repoDir });

  if (canPush) {
    deps.run("git", ["push", "origin", "HEAD:main"], { cwd: repoDir });
    const sha = deps.run("git", ["rev-parse", "HEAD"], { cwd: repoDir }).trim();
    const url = `https://github.com/${UPSTREAM_REPO}/commit/${sha}`;
    deps.print(`▸ 反映済み: ${url}`);
    deps.print(`▸ 生ログ:   ${rawRunUrl("main", dirName)}`);
    printReplayHandoffs(deps, replays);
    return { status: "submitted", lane: "direct", url, dir: dirName, replays };
  }

  const branch = `submit/${dirName}`;
  deps.run("git", ["checkout", "-b", branch], { cwd: repoDir });
  deps.run("git", ["push", "origin", branch], { cwd: repoDir });
  const url = deps
    .run(
      "gh",
      [
        "pr", "create",
        "--repo", UPSTREAM_REPO,
        "--head", `${login}:${branch}`,
        "--title", `Add community run ${dirName}`,
        "--body",
        "`laplacebench submit` による自動提出。CI がリプレイ検証を通せば自動マージされます。",
      ],
      { cwd: repoDir }
    )
    .trim()
    .split("\n")
    .pop() as string;

  deps.print(`▸ 提出PR: ${url}`);
  deps.print("  CI の検証を通ると自動マージされ、対戦記録に反映されます。");
  printReplayHandoffs(deps, replays);
  return { status: "submitted", lane: "pull-request", url, dir: dirName, replays };
}

/** Real-process dependencies. */
export function defaultSubmitDeps(): SubmitDeps {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const exec = (cmd: string, args: string[], opts?: { cwd?: string }) =>
    execFileSync(cmd, args, { encoding: "utf8", cwd: opts?.cwd });
  return {
    run: exec,
    tryRun(cmd, args, opts) {
      try {
        return exec(cmd, args, opts);
      } catch {
        return null;
      }
    },
    verify(runDir) {
      const { verifyRun } = require("./exportweb") as typeof import("./exportweb");
      const result = verifyRun(runDir);
      if (result.failures.length > 0) {
        throw new Error(
          result.failures.map((f) => `${f.gameId}: ${f.message}`).join("\n  ")
        );
      }
    },
    mkdtemp: () => fs.mkdtempSync(path.join(os.tmpdir(), "laplacebench-submit-")),
    print: (line) => console.log(line),
  };
}
