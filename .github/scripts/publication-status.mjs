#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA = "laplace-bench-publication-v1";
const HEX40 = /^[0-9a-f]{40}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const FAILURE_CODES = new Set(["verify_failed", "build_failed", "publish_failed"]);
const KEYS = new Set([
  "schema", "state", "source_sha", "updated_at", "last_success",
  "artifact_commit", "failure_code",
]);

const fail = (message) => { throw new Error(message); };
const sha = (value, field) => HEX40.test(value) || fail(`${field} must be 40 lowercase hex`);
const time = (value, field) =>
  (TIME.test(value) && Number.isFinite(Date.parse(value))) || fail(`${field} must be UTC RFC3339 milliseconds`);

function exactKeys(value, allowed, field) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${field}.${key} is unknown`);
}

export function validateStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("status must be an object");
  exactKeys(value, KEYS, "status");
  if (value.schema !== SCHEMA) fail("unsupported publication status schema");
  if (!["building", "ready", "failed"].includes(value.state)) fail("invalid publication state");
  sha(value.source_sha, "source_sha");
  time(value.updated_at, "updated_at");
  if (value.last_success !== null) {
    if (!value.last_success || typeof value.last_success !== "object" || Array.isArray(value.last_success)) {
      fail("last_success must be null or an object");
    }
    exactKeys(value.last_success, new Set(["source_sha", "artifact_commit", "published_at"]), "last_success");
    sha(value.last_success.source_sha, "last_success.source_sha");
    sha(value.last_success.artifact_commit, "last_success.artifact_commit");
    time(value.last_success.published_at, "last_success.published_at");
  }
  if (value.state === "building") {
    if ("artifact_commit" in value || "failure_code" in value) fail("building has forbidden fields");
  } else if (value.state === "failed") {
    if ("artifact_commit" in value || !FAILURE_CODES.has(value.failure_code)) fail("failed fields are invalid");
  } else {
    sha(value.artifact_commit, "artifact_commit");
    if ("failure_code" in value || value.last_success === null) fail("ready fields are invalid");
    if (value.last_success.source_sha !== value.source_sha ||
        value.last_success.artifact_commit !== value.artifact_commit ||
        value.last_success.published_at !== value.updated_at) {
      fail("ready and last_success generations differ");
    }
  }
  return value;
}

export function readStatus(file) {
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  if (bytes.length > 8192) fail("publication status exceeds 8 KiB");
  return validateStatus(JSON.parse(bytes.toString("utf8")));
}

function writeStatus(file, value) {
  validateStatus(value);
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(bytes) > 8192) fail("publication status exceeds 8 KiB");
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, bytes);
}

export function building(previous, sourceSha, updatedAt) {
  sha(sourceSha, "source_sha"); time(updatedAt, "updated_at");
  return validateStatus({
    schema: SCHEMA, state: "building", source_sha: sourceSha,
    updated_at: updatedAt, last_success: previous?.last_success ?? null,
  });
}

export function ready(previous, sourceSha, artifactCommit, publishedAt) {
  if (!previous || previous.state !== "building" || previous.source_sha !== sourceSha) {
    fail("ready requires the same source in building state");
  }
  sha(artifactCommit, "artifact_commit"); time(publishedAt, "published_at");
  const last = { source_sha: sourceSha, artifact_commit: artifactCommit, published_at: publishedAt };
  return validateStatus({
    schema: SCHEMA, state: "ready", source_sha: sourceSha,
    updated_at: publishedAt, last_success: last, artifact_commit: artifactCommit,
  });
}

export function failed(previous, sourceSha, failureCode, updatedAt) {
  if (!previous || previous.state !== "building" || previous.source_sha !== sourceSha) {
    fail("failed requires the same source in building state");
  }
  if (!FAILURE_CODES.has(failureCode)) fail("invalid failure code");
  time(updatedAt, "updated_at");
  return validateStatus({
    schema: SCHEMA, state: "failed", source_sha: sourceSha,
    updated_at: updatedAt, last_success: previous.last_success, failure_code: failureCode,
  });
}

function main(argv) {
  const [command, file, ...args] = argv;
  if (command === "inspect") {
    const value = readStatus(file);
    console.log(JSON.stringify(value === null ? { exists: false } : {
      exists: true, state: value.state, source_sha: value.source_sha,
      last_success_source: value.last_success?.source_sha ?? null,
    }));
    return;
  }
  const previous = readStatus(file);
  const value = command === "building" ? building(previous, args[0], args[1])
    : command === "ready" ? ready(previous, args[0], args[1], args[2])
      : command === "failed" ? failed(previous, args[0], args[1], args[2])
        : fail("usage: publication-status.mjs inspect|building|ready|failed <file> ...");
  writeStatus(file, value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
