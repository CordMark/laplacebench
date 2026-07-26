/**
 * On-demand cross-repository check: does the product still accept the arena
 * catalog this repo publishes, at the grain it now publishes it?
 *
 * Same role as packages/engine/scripts/verify-against-product.cjs — local,
 * non-CI, run by hand against a checkout of the consuming product. It exists
 * because putting effort into the headline identity changes the *meaning* of
 * `id`, `label`, `public_agent_count` and the matchup id without changing the
 * schema version, and the only consumer of that meaning lives in another
 * repository (laplace-main, `/bench`).
 *
 * The consumer revision is pinned and read with `git show`, never from the
 * sibling working tree: a gate that silently follows whatever is checked out
 * next door is not a gate. The sibling checkout is only read, never modified.
 * When its HEAD differs from the pin, the same assertions run against HEAD too
 * and both results are reported — the pin decides, a HEAD failure is drift to
 * escalate rather than a silent pass.
 *
 * Run from the repo root (tsx loads both sides' TypeScript from source, so no
 * build step is involved and no stale artifact can be verified by mistake):
 *
 *   npx tsx packages/cli/scripts/verify-product-acceptance.mjs
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

/** The consumer revision this slice adjudicated against. */
const PINNED_REVISION = "3a1d474";
const PRODUCT_DIR = path.resolve(
  process.env.LAPLACE_MAIN_DIR ?? path.join(process.cwd(), "..", "laplace-main")
);
const PARSER_DIR = "web/src/lib/bench";
/** parseArenaCatalog's whole dependency cone, minus node: builtins. */
const PARSER_FILES = ["parseArenaCatalog.ts", "contracts.ts", "shape.ts"];

const REPO_ROOT = process.cwd();
const RUNS_DIR = path.join(REPO_ROOT, "community", "runs");
// Imported from source, not from dist: a gate that can pass against yesterday's
// compiled output is not a gate. tsx loads the TypeScript directly, so what is
// verified is exactly what is in the tree.
const { MAX_PARTICIPANT_LABEL } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/cli/src/publicarena-contract.ts")).href
);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", ["-C", PRODUCT_DIR, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** Materialize the parser at `revision` into a throwaway directory. */
function extractParser(revision) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `laplace-consumer-${revision}-`));
  for (const file of PARSER_FILES) {
    const spec = `${revision}:${PARSER_DIR}/${file}`;
    let content;
    try {
      content = git(["show", spec]);
    } catch {
      fail(`cannot read ${spec} from ${PRODUCT_DIR}. The consumer moved or the revision is absent; treat this slice as unverified against the real product.`);
    }
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

function assertEqual(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${what}: expected ${e}, got ${a}`);
  console.log(`  ok  ${what}`);
}

/** The six semantic assertions the plan requires. Parsing alone is not proof. */
function checkCatalog(parsed, raw) {
  if (parsed === null) {
    fail("the product parser rejected the catalog outright (returned null)");
  }
  const [matchup] = parsed.matchups;
  assertEqual(
    [matchup.left.id, matchup.right.id],
    ["claude-opus-5@high", "gpt-5.6-sol@high"],
    "headline identities carry the recorded effort"
  );
  assertEqual(
    [matchup.left.label, matchup.right.label],
    ["Opus 5 (high)", "GPT-5.6 Sol (high)"],
    "labels expose the effort without any product change"
  );
  assertEqual(parsed.public_agent_count, 2, "public_agent_count");
  // Reaching here already proves the parser's own participantMap.size ===
  // public_agent_count check passed; a mismatch would have returned null.
  for (const game of matchup.games) {
    const expectedA = game.left_side === "A" ? matchup.left.id : matchup.right.id;
    const expectedB = game.left_side === "B" ? matchup.left.id : matchup.right.id;
    assertEqual(
      [game.team_a.headline_id, game.team_b.headline_id],
      [expectedA, expectedB],
      `per-game headline_id follows left_side (${game.raw_ref})`
    );
  }
  const expectedId = createHash("sha256")
    .update(`${matchup.left.id}\0${matchup.right.id}`)
    .digest("hex");
  assertEqual(matchup.id, expectedId, "matchup id is the hash of the new identities");
  assertEqual(
    JSON.parse(raw).schema,
    "laplace-bench-arena-v1",
    "schema version is unchanged"
  );
}

/**
 * The consumer rejects the whole catalog when a label exceeds its own cap, so
 * that number is a shared contract, not a producer preference. Read it out of
 * the consumer's source rather than trusting a comment: if it ever moves, this
 * check fails instead of the arena silently going empty in production.
 */
function checkLabelCapAgreement(dir) {
  const source = fs.readFileSync(path.join(dir, "parseArenaCatalog.ts"), "utf8");
  const match = source.match(/isText\(\s*value\.label\s*,\s*(\d+)\s*\)/);
  if (!match) {
    fail("cannot find the consumer's participant label cap; the parser changed shape");
  }
  assertEqual(
    Number(match[1]),
    MAX_PARTICIPANT_LABEL,
    "consumer label cap still agrees with MAX_PARTICIPANT_LABEL"
  );
}

async function verifyAgainst(revision, catalogJson) {
  console.log(`\n--- consumer revision ${revision} ---`);
  const dir = extractParser(revision);
  checkLabelCapAgreement(dir);
  const module = await import(
    pathToFileURL(path.join(dir, "parseArenaCatalog.ts")).href
  );
  const parse = module.parseArenaCatalog ?? module.default;
  if (typeof parse !== "function") {
    fail(`parseArenaCatalog is not exported by the consumer at ${revision}`);
  }
  checkCatalog(parse(JSON.parse(catalogJson)), catalogJson);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  if (!fs.existsSync(path.join(PRODUCT_DIR, ".git"))) {
    fail(`no product checkout at ${PRODUCT_DIR}. Set LAPLACE_MAIN_DIR. Without it this slice has NOT been verified against the real consumer — do not report it green.`);
  }
  const { buildArenaArtifacts } = await import(
    pathToFileURL(path.join(REPO_ROOT, "packages/cli/src/publicarena.ts")).href
  );
  const runDirs = fs.readdirSync(RUNS_DIR)
    .map((entry) => path.join(RUNS_DIR, entry))
    .filter((entry) => fs.statSync(entry).isDirectory());
  const artifacts = buildArenaArtifacts(
    runDirs,
    "0".repeat(40),
    "2026-07-27T00:00:00.000Z"
  );
  const catalogJson = artifacts.catalogBytes.toString("utf8");

  await verifyAgainst(PINNED_REVISION, catalogJson);

  const head = git(["rev-parse", "HEAD"]).trim();
  const pinned = git(["rev-parse", PINNED_REVISION]).trim();
  if (head === pinned) {
    console.log(`\nHEAD is the pinned revision (${head.slice(0, 7)}).`);
  } else {
    console.log(`\nHEAD (${head.slice(0, 7)}) differs from the pin — checking for drift.`);
    await verifyAgainst(head, catalogJson);
  }
  console.log("\nPASS: the pinned consumer accepts the new grain unchanged.");
}

main().catch((error) => fail(error?.stack ?? String(error)));
