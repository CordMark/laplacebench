/**
 * Pure classification rules for the community submission gate. Kept free of
 * network and filesystem access so the decision that replaces human merge
 * review can be tested directly (packages/cli/test/gate-rules.test.ts).
 *
 * docs/plans/2026-07-25-community-lane-v2.md
 */

/** Per-account submission budget: merged community submissions in 24 hours. */
export const RATE_LIMIT = 10;
export const RATE_WINDOW_HOURS = 24;

/**
 * Applied by the decide job before merging. It is also what makes a merged pull
 * request countable as a submission — without it, the rate-limit query would
 * count ordinary code and documentation pull requests against a contributor.
 */
export const SUBMISSION_LABEL = "community-submission";
export const HOLD_LABEL = "needs-human";
export const RATE_LIMIT_LABEL = "rate-limited";

export const SUBMISSION_ROOT = "community/runs/";
export const ALLOWED_EXTENSIONS = [".json", ".jsonl"];

/**
 * Paths inside a submission are attacker-chosen and end up in a shell command
 * and in $GITHUB_OUTPUT. git permits any byte except NUL and `/` in a path
 * component, so a name like `alice--x"; exit 0; #` would be perfectly legal —
 * and would turn the replay-verification step into a no-op while the gate still
 * reported a pass. Restricting the alphabet is what makes "the pull request's
 * content never executes here" true rather than merely intended.
 */
export const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * `.` and `..` satisfy the alphabet above but are traversal, not names. git's
 * own fsck rejects them in a tree and GitHub runs fsck on receive, so this is
 * belt-and-braces — but this gate is built not to depend on the other side
 * behaving, and the fetched bytes are written to these paths.
 */
export const TRAVERSAL_SEGMENTS = [".", ".."];

/**
 * git modes for a regular file. A symlink (120000) would be fetched as its
 * target path rather than as data, and a gitlink (160000) is a submodule
 * pointer — neither is something to replay or to merge unexamined.
 */
export const REGULAR_FILE_MODES = ["100644", "100755"];

/**
 * Every changed file must be an addition, under one new run directory, with a
 * replayable extension. The set the gate ALLOWS and the set it later VERIFIES
 * must be identical: narrowing only the verification would let unexamined files
 * ride along into main.
 *
 * @param files `[{filename, status}]` as reported by the pull-request files API
 * @returns `{ok: true, dir}` or `{ok: false, reason}`
 */
export function checkAllowlist(files) {
  if (!files || files.length === 0) return { ok: false, reason: "no-files" };

  const dirs = new Set();
  for (const f of files) {
    if (f.status !== "added") {
      return { ok: false, reason: `not-an-addition:${f.status}:${f.filename}` };
    }
    if (!f.filename.startsWith(SUBMISSION_ROOT)) {
      return { ok: false, reason: `outside-submission-root:${f.filename}` };
    }
    if (!ALLOWED_EXTENSIONS.some((e) => f.filename.endsWith(e))) {
      return { ok: false, reason: `unsupported-extension:${f.filename}` };
    }
    const rest = f.filename.slice(SUBMISSION_ROOT.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) {
      return { ok: false, reason: `not-in-a-run-dir:${f.filename}` };
    }
    // Check EVERY segment, not just the run directory: the whole path is what
    // gets handed to the verifier.
    for (const segment of rest.split("/")) {
      if (!SAFE_PATH_SEGMENT.test(segment) || TRAVERSAL_SEGMENTS.includes(segment)) {
        return { ok: false, reason: `unsafe-path-segment:${f.filename}` };
      }
    }
    dirs.add(rest.slice(0, slash));
  }
  if (dirs.size !== 1) {
    return { ok: false, reason: `expected-one-run-dir-got-${dirs.size}` };
  }
  return { ok: true, dir: [...dirs][0] };
}

/**
 * Attribution, not identity proof: it ties every published game to an account
 * that can be looked at, and makes sockpuppets cost account creation. It says
 * nothing about which model actually produced the moves.
 */
export function checkPrefix(dir, author) {
  if (!dir.startsWith(`${author}--`)) {
    return { ok: false, reason: `prefix-mismatch:${dir}:expected-${author}--` };
  }
  return { ok: true };
}

/**
 * @param modes Map of path -> git mode, read from the tree at the pinned SHA
 *   (the pull-request files API does not report modes).
 */
export function checkFileModes(files, modes) {
  for (const f of files) {
    const mode = modes.get(f.filename);
    if (!mode) return { ok: false, reason: `missing-in-tree:${f.filename}` };
    if (!REGULAR_FILE_MODES.includes(mode)) {
      return { ok: false, reason: `not-a-regular-file:${mode}:${f.filename}` };
    }
  }
  return { ok: true };
}

export function checkRateLimit(mergedInWindow) {
  if (mergedInWindow >= RATE_LIMIT) {
    return { ok: false, reason: `rate-limited:${mergedInWindow}` };
  }
  return { ok: true };
}

/** Search query counting THIS author's merged submissions in the window. */
export function rateLimitQuery(repo, author, now) {
  const since = new Date(
    now - RATE_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();
  return [
    `repo:${repo}`,
    "is:pr",
    "is:merged",
    `label:${SUBMISSION_LABEL}`,
    `author:${author}`,
    `merged:>=${since}`,
  ].join("+");
}

/** Which label a hold reason should carry. */
export function holdLabelFor(reason) {
  return String(reason).startsWith("rate-limited")
    ? RATE_LIMIT_LABEL
    : HOLD_LABEL;
}

/**
 * The whole gate decision, given already-fetched facts. Order matters: cheap
 * structural checks first, so a hostile pull request is rejected before any of
 * its bytes are fetched.
 */
export function classify({ files, modes, author, mergedInWindow }) {
  const allow = checkAllowlist(files);
  if (!allow.ok) return allow;

  const prefix = checkPrefix(allow.dir, author);
  if (!prefix.ok) return prefix;

  const fileModes = checkFileModes(files, modes);
  if (!fileModes.ok) return fileModes;

  const rate = checkRateLimit(mergedInWindow);
  if (!rate.ok) return rate;

  return { ok: true, dir: allow.dir };
}
