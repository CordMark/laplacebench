import assert from "node:assert/strict";
import test from "node:test";
// The gate is what replaces human merge review, so its rules are tested here
// rather than only being exercised by real pull requests.
// @ts-expect-error — plain .mjs rules module, no types
import * as rules from "../../../.github/scripts/gate-rules.mjs";

const added = (filename: string) => ({ filename, status: "added" });
const RUN = "community/runs/alice--run-1";
const good = [added(`${RUN}/run.json`), added(`${RUN}/games/g0/events.jsonl`)];
const modesFor = (files: { filename: string }[], mode = "100644") =>
  new Map(files.map((f) => [f.filename, mode]));

const classify = (
  files: { filename: string; status: string }[],
  opts: { modes?: Map<string, string>; author?: string; merged?: number } = {}
) =>
  rules.classify({
    files,
    modes: opts.modes ?? modesFor(files),
    author: opts.author ?? "alice",
    mergedInWindow: opts.merged ?? 0,
  });

test("a clean submission passes", () => {
  const v = classify(good);
  assert.equal(v.ok, true);
  assert.equal(v.dir, "alice--run-1");
});

test("only additions are accepted", () => {
  for (const status of ["modified", "removed", "renamed", "copied"]) {
    const v = classify([{ filename: `${RUN}/run.json`, status }]);
    assert.equal(v.ok, false, status);
    assert.match(v.reason, new RegExp(`^not-an-addition:${status}:`));
  }
});

test("nothing outside a run directory is accepted", () => {
  for (const filename of [
    "packages/cli/src/standings.ts",
    ".github/workflows/community-gate.yml",
    "community/README.md",
  ]) {
    const v = classify([added(filename)]);
    assert.equal(v.ok, false, filename);
    assert.match(v.reason, /^outside-submission-root:|^not-in-a-run-dir:/);
  }
});

test("only replayable extensions are accepted", () => {
  for (const filename of [`${RUN}/notes.md`, `${RUN}/payload.txt`, `${RUN}/x.js`]) {
    const v = classify([added(filename)]);
    assert.equal(v.ok, false, filename);
    assert.match(v.reason, /^unsupported-extension:/);
  }
});

test("the allowed set and the verified set cannot drift apart", () => {
  // Every path that survives the allowlist must be something `verify` reads;
  // if this ever admits another extension, the replay step must grow with it.
  for (const f of good) {
    assert.ok(rules.ALLOWED_EXTENSIONS.some((e: string) => f.filename.endsWith(e)));
  }
});

test("symlinks and submodules are rejected even inside the run directory", () => {
  for (const mode of ["120000", "160000"]) {
    const v = classify(good, { modes: modesFor(good, mode) });
    assert.equal(v.ok, false, mode);
    assert.match(v.reason, new RegExp(`^not-a-regular-file:${mode}:`));
  }
  // A path the tree does not know about is a hold, not a silent pass.
  const v = classify(good, { modes: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.reason, /^missing-in-tree:/);
});

test("a submission may only touch one new run directory", () => {
  const v = classify([
    added("community/runs/alice--run-1/run.json"),
    added("community/runs/alice--run-2/run.json"),
  ]);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "expected-one-run-dir-got-2");
  assert.equal(classify([]).reason, "no-files");
});

test("the directory prefix must be the pull request author", () => {
  const v = classify(good, { author: "mallory" });
  assert.equal(v.ok, false);
  assert.match(v.reason, /^prefix-mismatch:alice--run-1:expected-mallory--/);
  // A prefix that merely starts with the name is not enough.
  const near = [added("community/runs/alicexx--run-1/run.json")];
  assert.equal(classify(near, { author: "alice" }).ok, false);
});

test("rate limit holds at the boundary, not before it", () => {
  assert.equal(classify(good, { merged: rules.RATE_LIMIT - 1 }).ok, true);
  const at = classify(good, { merged: rules.RATE_LIMIT });
  assert.equal(at.ok, false);
  assert.match(at.reason, /^rate-limited:10/);
  assert.equal(classify(good, { merged: rules.RATE_LIMIT + 1 }).ok, false);
});

test("only this author's labelled, merged, in-window submissions are counted", () => {
  const now = Date.parse("2026-07-25T12:00:00Z");
  const pull = (over: Record<string, unknown>) => ({
    user: { login: "alice" },
    labels: [{ name: rules.SUBMISSION_LABEL }],
    merged_at: "2026-07-25T11:00:00Z",
    ...over,
  });
  const pulls = [
    pull({}),                                              // counts
    pull({ merged_at: null }),                             // closed, not merged
    pull({ user: { login: "bob" } }),                      // someone else
    pull({ labels: [] }),                                  // an ordinary code PR
    pull({ labels: [{ name: "needs-human" }] }),           // a different label
    pull({ merged_at: "2026-07-23T11:00:00Z" }),           // outside the window
  ];
  assert.equal(rules.countMergedSubmissions(pulls, "alice", now), 1);
  // Counting from closed pull requests rather than the search index is the
  // point: search is eventually consistent, and a just-merged submission is
  // exactly the one that must already be visible.
  assert.equal(rules.countMergedSubmissions([], "alice", now), 0);
});

test("an oversized inventory has a bound rather than a truncated pass", () => {
  // The API paginates with a ceiling; treating a short page as "that was all"
  // would let everything past it through unchecked.
  assert.ok(rules.MAX_SUBMISSION_FILES > 0);
  assert.ok(rules.MAX_SUBMISSION_FILES < 3000);
});

test("hold reasons route to the right label", () => {
  assert.equal(rules.holdLabelFor("rate-limited:10"), rules.RATE_LIMIT_LABEL);
  assert.equal(rules.holdLabelFor("prefix-mismatch:x"), rules.HOLD_LABEL);
  assert.equal(rules.holdLabelFor("verify-failure"), rules.HOLD_LABEL);
});

test("structural checks run before the account lookup", () => {
  // A hostile pull request should be rejected on its shape, without its author
  // or its bytes mattering.
  const v = classify([added("packages/cli/src/cli.ts")], { merged: 999 });
  assert.match(v.reason, /^outside-submission-root:/);
});

test("a crafted path cannot become shell syntax or a forged job output", () => {
  // git allows any byte but NUL and `/` in a path component, and the directory
  // name reaches both a `run:` block and $GITHUB_OUTPUT. These are the shapes
  // that would turn the replay step into a no-op while still reporting a pass.
  for (const dir of [
    'alice--x"; exit 0; #',
    "alice--x$(id)",
    "alice--x`id`",
    "alice--x;rm -rf /",
    "alice--x\nverdict=pass",
    "alice--x'y",
    "alice--x y",
  ]) {
    const files = [added(`community/runs/${dir}/run.json`)];
    const v = classify(files, { modes: modesFor(files) });
    assert.equal(v.ok, false, dir);
    assert.match(v.reason, /^unsafe-path-segment:/, dir);
  }
  // Nested segments are checked too, not just the run directory.
  const nested = [added('community/runs/alice--ok/games/g"0/final.json')];
  assert.match(
    classify(nested, { modes: modesFor(nested) }).reason,
    /^unsafe-path-segment:/
  );
  // `..` satisfies the alphabet but is traversal, and the fetched bytes are
  // written to these paths.
  for (const traversal of [
    "community/runs/alice--ok/../../escaped.json",
    "community/runs/alice--ok/./final.json",
  ]) {
    const files = [added(traversal)];
    assert.match(
      classify(files, { modes: modesFor(files) }).reason,
      /^unsafe-path-segment:/,
      traversal
    );
  }
  // Ordinary run layouts still pass.
  assert.equal(classify(good).ok, true);
});
