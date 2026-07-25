/**
 * Classify a community pull request. Runs inside the base-defined gate with NO
 * write permission and never executes anything from the pull request: the only
 * things read here are the GitHub API's own view of the changed files and, for
 * an accepted submission, its data bytes.
 *
 * Emits a verdict instead of failing, so the decide job can still label a hold.
 * The rules themselves live in gate-rules.mjs and are unit-tested.
 *
 * docs/plans/2026-07-25-community-lane-v2.md
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  COMPARE_FILE_CEILING,
  MAX_SUBMISSION_FILES,
  SUBMISSION_ROOT,
  classify,
  closedPullsInWindow,
  countMergedSubmissions,
} from "./gate-rules.mjs";

const { GH_TOKEN, PR, AUTHOR, VERIFIED_SHA, BASE_SHA, REPO } = process.env;
const API = "https://api.github.com";

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${GH_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status}`);
  return res.json();
}

/**
 * Write job outputs. Values are refused rather than escaped if they contain a
 * newline: `key=value` lines are how a crafted value would forge a second
 * output (a `verdict=pass` of its own choosing), and there is no legitimate
 * multi-line value here.
 */
function output(verdict, reason, submissionDir = "") {
  const values = { verdict, reason, submission_dir: submissionDir };
  for (const [k, v] of Object.entries(values)) {
    if (/[\r\n]/.test(String(v))) {
      throw new Error(`refusing to write a multi-line output: ${k}`);
    }
  }
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}\n`)
      .join("")
  );
  console.log(`verdict=${verdict} reason=${reason}`);
}

/**
 * Enumerate the diff of the SHA under review — not "the pull request's current
 * files". `/pulls/{n}/files` describes whatever the head is at request time, so
 * a push landing mid-run would let the allowlist and the replay look at
 * different trees. `compare` is keyed to two commits and cannot drift.
 *
 * The endpoint is also paginated with a documented ceiling; a submission that
 * approaches it is not a legitimate run, so an oversized inventory is a hold
 * rather than a silently truncated pass.
 */
async function changedFiles(baseSha) {
  const cmp = await api(`/repos/${REPO}/compare/${baseSha}...${VERIFIED_SHA}`);
  const files = cmp.files ?? [];
  // `compare` paginates COMMITS, not files: the file list is returned once and
  // stops at the API's ceiling. Past that we cannot tell a complete list from a
  // truncated one, so anything at or above it is a hold — treating a short list
  // as complete is how the rest would ride in unchecked.
  const truncated = files.length >= COMPARE_FILE_CEILING;
  return { truncated, overLimit: files.length > MAX_SUBMISSION_FILES, files };
}

/** Fetch the submitted data at the pinned SHA into the base checkout. */
async function materialize(files) {
  for (const f of files) {
    const blob = await api(`/repos/${REPO}/git/blobs/${f.sha}`);
    if (blob.encoding !== "base64") {
      throw new Error(`unexpected blob encoding ${blob.encoding}`);
    }
    mkdirSync(dirname(f.filename), { recursive: true });
    writeFileSync(f.filename, Buffer.from(blob.content, "base64"));
  }
}

const { truncated, overLimit, files } = await changedFiles(BASE_SHA);
if (truncated) {
  output("hold", `inventory-truncated:>=${COMPARE_FILE_CEILING}`);
  process.exit(0);
}
if (overLimit) {
  output("hold", `too-many-files:>${MAX_SUBMISSION_FILES}`);
  process.exit(0);
}

// Modes are not in the compare payload, so read the tree at the SHA under
// review — the same commit the file list was derived from.
const tree = await api(`/repos/${REPO}/git/trees/${VERIFIED_SHA}?recursive=1`);
const modes = new Map(tree.tree.map((e) => [e.path, e.mode]));

const mergedInWindow = countMergedSubmissions(
  await closedPullsInWindow(api, REPO, Date.now()),
  AUTHOR,
  Date.now()
);

const verdict = classify({ files, modes, author: AUTHOR, mergedInWindow });

if (!verdict.ok) {
  output("hold", verdict.reason);
  process.exit(0);
}

await materialize(files);
output("pass", "ok", join(SUBMISSION_ROOT, verdict.dir));
