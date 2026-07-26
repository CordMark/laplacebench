import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

const SCRIPT = path.resolve(__dirname, "../../../.github/scripts/publication-status.mjs");
const SOURCE = "0123456789abcdef0123456789abcdef01234567";
const ARTIFACT = "89abcdef0123456789abcdef0123456789abcdef";
const T1 = "2026-07-26T00:00:00.000Z";
const T2 = "2026-07-26T00:01:00.000Z";

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "publication-status-")), "status.json");
const run = (...args: string[]) => execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

test("first publication moves building to ready with one exact last-success pointer", () => {
  const file = tempFile();
  assert.deepEqual(JSON.parse(run("inspect", file)), { exists: false });
  run("building", file, SOURCE, T1);
  let status = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(status, {
    schema: "laplace-bench-publication-v1", state: "building", source_sha: SOURCE,
    updated_at: T1, last_success: null,
  });
  run("ready", file, SOURCE, ARTIFACT, T2);
  status = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(status.state, "ready");
  assert.equal(status.artifact_commit, ARTIFACT);
  assert.deepEqual(status.last_success, {
    source_sha: SOURCE, artifact_commit: ARTIFACT, published_at: T2,
  });
});

test("failed publication retains the previous success and rejects cross-source completion", () => {
  const file = tempFile();
  run("building", file, SOURCE, T1);
  run("ready", file, SOURCE, ARTIFACT, T2);
  const next = "1111111111111111111111111111111111111111";
  run("building", file, next, "2026-07-26T00:02:00.000Z");
  run("failed", file, next, "build_failed", "2026-07-26T00:03:00.000Z");
  const status = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(status.state, "failed");
  assert.equal(status.failure_code, "build_failed");
  assert.equal(status.last_success.source_sha, SOURCE);

  const bad = spawnSync(process.execPath, [SCRIPT, "ready", file, SOURCE, ARTIFACT, T2], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /same source in building state/);
});

test("unknown fields and impossible ready documents fail closed", () => {
  const file = tempFile();
  fs.writeFileSync(file, JSON.stringify({
    schema: "laplace-bench-publication-v1", state: "ready", source_sha: SOURCE,
    updated_at: T2, last_success: null, artifact_commit: ARTIFACT, url: "https://attacker.invalid",
  }));
  const result = spawnSync(process.execPath, [SCRIPT, "inspect", file], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown/);
});
