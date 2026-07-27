import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";

// Retired positioning claims (2026-07-27 README rewrite). Each phrase was
// deliberately overturned and must not reappear in the public README:
// - "nobody knows": perishable framing replaced by the dated corpus claim
// - "absent from training data": unprovable global negative as a headline
// - "tracking a full board": false — the per-turn observation re-sends the
//   whole board (packages/cli/src/prompt.ts), so there is no memory demand
// - "pure thinking": unfalsifiable faculty claim, rejected wording
const RETIRED = [
  /nobody knows/i,
  /absent from (?:their |the )?training data/i,
  /tracking a full board/i,
  /pure thinking/i,
];

test("README does not reintroduce retired positioning claims", () => {
  const readme = fs.readFileSync(path.resolve(__dirname, "../../../README.md"), "utf8");
  for (const pattern of RETIRED) {
    assert.doesNotMatch(readme, pattern);
  }
});

test("the packaged README only advertises commands present in the package", () => {
  const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8");
  assert.match(readme, /npx laplacebench play/);
  assert.match(readme, /npx laplacebench submit runs\/<run-id>/);
  assert.doesNotMatch(readme, /npx tsx src\/cli\.ts/);
  assert.doesNotMatch(readme, /LAPLACE_APP_ROOT/);
});
