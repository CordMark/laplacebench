/**
 * Act on the gate's verdict: merge, or label and leave the pull request open
 * for a human. Fail-closed — anything that is not an explicit `pass` from a
 * successful verify job results in a label and no merge.
 *
 * docs/plans/2026-07-25-community-lane-v2.md
 */
import { SUBMISSION_LABEL, holdLabelFor } from "./gate-rules.mjs";

const {
  GH_TOKEN,
  PR,
  REPO,
  VERIFY_RESULT,
  VERDICT,
  REASON,
  VERIFIED_SHA,
} = process.env;
const API = "https://api.github.com";

/** The workflow that rebuilds the published matchup records after a merge. */
const PUBLISH_WORKFLOW = "community-publish.yml";

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${GH_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

const label = (name) =>
  api(`/repos/${REPO}/issues/${PR}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [name] }),
  });

async function hold(reason) {
  const name = holdLabelFor(reason);
  await label(name);
  console.log(`held (${name}): ${reason}`);
}

// The verify job crashed rather than returning a verdict. Say so and stop —
// silence here would look identical to approval.
if (VERIFY_RESULT !== "success" || !VERDICT) {
  await hold(`verify-${VERIFY_RESULT || "missing"}`);
  process.exit(0);
}

if (VERDICT !== "pass") {
  await hold(REASON || "unspecified");
  process.exit(0);
}

// Label before merging: the rate-limit query counts merged pull requests
// carrying this label, so an unlabelled merge would be uncountable forever.
await label(SUBMISSION_LABEL);

// The head may have moved while we verified. Re-read it, and pass the pinned
// SHA to the merge so GitHub rejects the merge too if they disagree.
const pr = await api(`/repos/${REPO}/pulls/${PR}`);
if (pr.head.sha !== VERIFIED_SHA) {
  await hold(`head-moved:verified-${VERIFIED_SHA}:now-${pr.head.sha}`);
  process.exit(0);
}

// The merge itself can be refused — a conflict, a required check still
// running, a branch rule. Letting that throw would leave the pull request
// merged-nowhere AND unlabelled, which reads exactly like success from the
// outside. Anything that is not a completed merge goes to the human queue.
let merge;
try {
  merge = await api(`/repos/${REPO}/pulls/${PR}/merge`, {
    method: "PUT",
    body: JSON.stringify({ sha: VERIFIED_SHA, merge_method: "squash" }),
  });
} catch (e) {
  await hold(`merge-refused:${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
console.log(`merged ${VERIFIED_SHA} as ${merge.sha}`);

// A push made with GITHUB_TOKEN does not start new workflow runs, so the
// publish step has to be asked for explicitly or the published records would
// silently stop tracking main.
try {
  await api(`/repos/${REPO}/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      ref: "main",
      inputs: { merged_sha: merge.sha },
    }),
  });
} catch (e) {
  // The run is already merged; the records are now behind. Fail loudly so it
  // is visible, and flag it for a human to re-dispatch.
  await hold(`dispatch-failed:${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
console.log(`dispatched ${PUBLISH_WORKFLOW} for ${merge.sha}`);
