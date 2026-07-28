#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquirePackageLock, releasePackageLock } from "./product-cpu-package-lock.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(here, "..");
const bridgeRoot = path.join(cliRoot, "bridge");
const vendorRoot = path.join(bridgeRoot, "vendor");
const generationsRoot = path.join(vendorRoot, "generations");
const trustedIndexPath = path.join(bridgeRoot, "trusted_product_cpu_policies.json");
const defaultProductRepo = path.resolve(cliRoot, "..", "..", "..", "laplace-main");

const COMMON_FILES = [
  "__init__.py",
  "base.py",
  "cpu_levels.py",
  "cpu_tier_profiles.py",
  "minimax.py",
  "weight_profiles.py",
];

export const POLICIES = Object.freeze({
  "cpu-v4": Object.freeze({
    command_role: "regret",
    product_commit: "d316b30914cb49942486f744099468fe0561ea02",
    visible_tiers_symbol: "CPU_V4_VISIBLE_TIERS",
    level_resolver_symbol: "get_cpu_level",
    files: COMMON_FILES,
  }),
  "cpu-v6": Object.freeze({
    command_role: "play",
    product_commit: "101b739ff41a612c9b2c512d57d0a5ba4d233d47",
    visible_tiers_symbol: "CPU_VISIBLE_TIERS",
    level_resolver_symbol: "get_cpu_level",
    files: [...COMMON_FILES, "tactical_candidates.py"],
  }),
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function parseArgs(argv) {
  let productRepo = process.env.LAPLACE_MAIN_DIR || defaultProductRepo;
  let check = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--check") check = true;
    else if (arg === "--product-repo") {
      productRepo = argv[++index];
      if (!productRepo) throw new Error("--product-repo needs a path");
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { productRepo: path.resolve(productRepo), check };
}

function gitObject(repo, commit, relativePath) {
  try {
    return execFileSync(
      "git",
      ["-C", repo, "show", `${commit}:ai/src/agents/${relativePath}`],
      { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 }
    );
  } catch (error) {
    throw new Error(
      `cannot read ${commit}:ai/src/agents/${relativePath} from ${repo}: ${error.message}`
    );
  }
}

export function expectedBundle(productRepo) {
  const files = new Map();
  const trustedPolicies = {};
  for (const [policy, config] of Object.entries(POLICIES)) {
    const manifestFiles = {};
    for (const name of [...config.files].sort()) {
      const bytes = gitObject(productRepo, config.product_commit, name);
      const relative = path.posix.join("agents", name);
      files.set(path.posix.join(policy, relative), bytes);
      manifestFiles[relative] = sha256(bytes);
    }
    const manifest = {
      schema: "laplace-bundled-product-cpu-policy-v1",
      policy_version: policy,
      command_role: config.command_role,
      source_repository: "https://github.com/Japan-Automation-Technology/Laplace.git",
      source_root: "ai/src/agents",
      product_commit: config.product_commit,
      generated_notice: "Generated from exact Git objects; do not edit vendored files by hand.",
      files: manifestFiles,
    };
    const manifestBytes = jsonBytes(manifest);
    files.set(path.posix.join(policy, "manifest.json"), manifestBytes);
    trustedPolicies[policy] = {
      command_role: config.command_role,
      product_commit: config.product_commit,
      manifest_sha256: sha256(manifestBytes),
      visible_tiers_symbol: config.visible_tiers_symbol,
      level_resolver_symbol: config.level_resolver_symbol,
    };
  }
  const generationHash = createHash("sha256");
  for (const [relative, bytes] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    generationHash.update(relative);
    generationHash.update("\0");
    generationHash.update(bytes);
    generationHash.update("\0");
  }
  const generation = generationHash.digest("hex");
  for (const [policy, anchor] of Object.entries(trustedPolicies)) {
    anchor.bundle_dir = `generations/${generation}/${policy}`;
  }
  const trustedIndex = jsonBytes({
    schema: "laplace-bundled-product-cpu-index-v1",
    policies: trustedPolicies,
  });
  return { files, trustedIndex, generation };
}

function diskFiles(root) {
  const found = new Map();
  if (!fs.existsSync(root)) return found;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else found.set(path.relative(root, absolute).split(path.sep).join("/"), fs.readFileSync(absolute));
    }
  };
  visit(root);
  return found;
}

function assertExact(actual, expected, label) {
  const actualNames = [...actual.keys()].sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${label} file set differs\nexpected: ${expectedNames.join(", ")}\nactual: ${actualNames.join(", ")}`);
  }
  for (const name of expectedNames) {
    if (!actual.get(name).equals(expected.get(name))) {
      throw new Error(`${label} differs: ${name}`);
    }
  }
}

export function syncBundle({ productRepo, check }) {
  const expected = expectedBundle(productRepo);
  if (check) {
    assertExact(
      diskFiles(path.join(generationsRoot, expected.generation)),
      expected.files,
      "bundled product CPU"
    );
    if (!fs.existsSync(trustedIndexPath) || !fs.readFileSync(trustedIndexPath).equals(expected.trustedIndex)) {
      throw new Error("trusted product CPU policy index differs");
    }
    return;
  }
  acquirePackageLock();
  try {
    publishBundle(expected);
  } finally {
    releasePackageLock();
  }
}

export function publishBundle(expected, options = {}) {
  const targetBridgeRoot = options.bridgeRoot || bridgeRoot;
  const targetVendorRoot = path.join(targetBridgeRoot, "vendor");
  const targetGenerationsRoot = path.join(targetVendorRoot, "generations");
  const targetIndexPath = path.join(targetBridgeRoot, "trusted_product_cpu_policies.json");
  const finalGeneration = path.join(targetGenerationsRoot, expected.generation);
  fs.mkdirSync(targetGenerationsRoot, { recursive: true });

  if (!fs.existsSync(finalGeneration)) {
    const staging = fs.mkdtempSync(path.join(targetGenerationsRoot, ".staging-"));
    try {
      for (const [relative, bytes] of expected.files) {
        const destination = path.join(staging, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, bytes);
      }
      assertExact(diskFiles(staging), expected.files, "staged bundled product CPU");
      try {
        fs.renameSync(staging, finalGeneration);
      } catch (error) {
        if (!fs.existsSync(finalGeneration)) throw error;
        assertExact(diskFiles(finalGeneration), expected.files, "concurrent bundled product CPU");
        fs.rmSync(staging, { recursive: true, force: true });
      }
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  } else {
    assertExact(diskFiles(finalGeneration), expected.files, "existing bundled product CPU");
  }

  options.beforeIndexPublish?.();
  const temporaryIndex = path.join(
    targetBridgeRoot,
    `.trusted-product-cpu-${process.pid}-${Date.now()}.tmp`
  );
  try {
    fs.writeFileSync(temporaryIndex, expected.trustedIndex);
    fs.renameSync(temporaryIndex, targetIndexPath);
  } finally {
    fs.rmSync(temporaryIndex, { force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    syncBundle(args);
    console.log(args.check ? "bundled product CPU is current" : "bundled product CPU updated");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
