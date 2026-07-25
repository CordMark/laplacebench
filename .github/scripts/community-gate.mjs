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
import { SUBMISSION_ROOT, classify, rateLimitQuery } from "./gate-rules.mjs";

const { GH_TOKEN, PR, AUTHOR, VERIFIED_SHA, REPO } = process.env;
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

function output(verdict, reason, submissionDir = "") {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `verdict=${verdict}\nreason=${reason}\nsubmission_dir=${submissionDir}\n`
  );
  console.log(`verdict=${verdict} reason=${reason}`);
}

async function changedFiles() {
  const files = [];
  for (let page = 1; ; page++) {
    const batch = await api(
      `/repos/${REPO}/pulls/${PR}/files?per_page=100&page=${page}`
    );
    files.push(...batch);
    if (batch.length < 100) return files;
  }
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

const files = await changedFiles();

// Modes are not in the files API, so read the tree at the SHA under review.
const tree = await api(`/repos/${REPO}/git/trees/${VERIFIED_SHA}?recursive=1`);
const modes = new Map(tree.tree.map((e) => [e.path, e.mode]));

const q = rateLimitQuery(REPO, AUTHOR, Date.now());
const merged = await api(`/search/issues?q=${q}&per_page=1`);

const verdict = classify({
  files,
  modes,
  author: AUTHOR,
  mergedInWindow: merged.total_count,
});

if (!verdict.ok) {
  output("hold", verdict.reason);
  process.exit(0);
}

await materialize(files);
output("pass", "ok", join(SUBMISSION_ROOT, verdict.dir));
