import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolvePythonCommand } from "../src/agents/productcpu";
import { assertBundledProductCpuRole } from "../src/cli";

const BRIDGE_ROOT = path.join(__dirname, "..", "bridge");
const V6_COMMIT = "101b739ff41a612c9b2c512d57d0a5ba4d233d47";
const V4_COMMIT = "d316b30914cb49942486f744099468fe0561ea02";
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

function copiedBridge(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-bundled-cpu-"));
  fs.cpSync(BRIDGE_ROOT, root, { recursive: true });
  return root;
}

function runBridge(root: string, policy: string) {
  const python = resolvePythonCommand();
  return spawnSync(
    python.command,
    [...python.args, path.join(root, "product_cpu_bridge.py"), "--policy", policy],
    { encoding: "utf8", input: "", timeout: 20_000 }
  );
}

function policyRoot(root: string, policy: string): string {
  const index = JSON.parse(
    fs.readFileSync(path.join(root, "trusted_product_cpu_policies.json"), "utf8")
  );
  return path.join(root, "vendor", index.policies[policy].bundle_dir);
}

test("trusted index pins command roles, full commits, and policy-specific symbols", () => {
  const index = JSON.parse(
    fs.readFileSync(path.join(BRIDGE_ROOT, "trusted_product_cpu_policies.json"), "utf8")
  );
  assert.equal(index.schema, "laplace-bundled-product-cpu-index-v1");
  assert.deepEqual(Object.keys(index.policies), ["cpu-v4", "cpu-v6"]);
  assert.equal(index.policies["cpu-v4"].command_role, "regret");
  assert.equal(index.policies["cpu-v4"].product_commit, V4_COMMIT);
  assert.equal(index.policies["cpu-v4"].visible_tiers_symbol, "CPU_V4_VISIBLE_TIERS");
  assert.equal(index.policies["cpu-v6"].command_role, "play");
  assert.equal(index.policies["cpu-v6"].product_commit, V6_COMMIT);
  assert.equal(index.policies["cpu-v6"].visible_tiers_symbol, "CPU_VISIBLE_TIERS");
});

test("command roles reject cross-policy and mixed-policy play before run creation", () => {
  assert.doesNotThrow(() => assertBundledProductCpuRole("cpu-v6", "play"));
  assert.doesNotThrow(() => assertBundledProductCpuRole("cpu-v4", "regret"));
  assert.throws(() => assertBundledProductCpuRole("cpu-v4", "play"), /cpu-v6 only/);
  assert.throws(() => assertBundledProductCpuRole("cpu-v6", "regret"), /cpu-v4 only/);
  assert.throws(() => assertBundledProductCpuRole("cpu-v9", "play"), /cpu-v6 only/);
});

test("bridge rejects unknown policy before import", () => {
  const result = runBridge(copiedBridge(), "cpu-v9");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported bundled product CPU policy/);
});

test("bridge rejects file-only, manifest-only, and manifest+file tampering", () => {
  {
    const root = copiedBridge();
    fs.appendFileSync(path.join(policyRoot(root, "cpu-v6"), "agents/base.py"), "\n# tampered\n");
    const result = runBridge(root, "cpu-v6");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /source digest mismatch/);
  }
  {
    const root = copiedBridge();
    const manifestPath = path.join(policyRoot(root, "cpu-v6"), "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.product_commit = "0".repeat(40);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const result = runBridge(root, "cpu-v6");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest digest mismatch/);
  }
  {
    const root = copiedBridge();
    const sourcePath = path.join(policyRoot(root, "cpu-v6"), "agents/base.py");
    fs.appendFileSync(sourcePath, "\n# coordinated tamper\n");
    const manifestPath = path.join(policyRoot(root, "cpu-v6"), "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.files["agents/base.py"] = sha256(fs.readFileSync(sourcePath));
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const result = runBridge(root, "cpu-v6");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest digest mismatch/);
  }
});

test("bridge imports the verified byte snapshot even if source files change afterward", () => {
  const root = copiedBridge();
  const python = resolvePythonCommand();
  const bridgePath = path.join(root, "product_cpu_bridge.py");
  const script = `
import importlib
import importlib.util
import pathlib
import sys
spec = importlib.util.spec_from_file_location("product_cpu_bridge", ${JSON.stringify(bridgePath)})
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
anchor, policy_root, snapshot = bridge._verified_policy_snapshot("cpu-v6")
(policy_root / "agents" / "cpu_levels.py").write_text("raise RuntimeError('unverified bytes executed')\\n")
sys.meta_path.insert(0, bridge._SnapshotImporter(snapshot, policy_root))
levels = importlib.import_module("agents.cpu_levels")
assert levels.CPU_POLICY_VERSION == "cpu-v6"
`;
  const result = spawnSync(python.command, [...python.args, "-c", script], {
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr);
});

test("bundle publication keeps the old index readable if publication is interrupted", async () => {
  const { publishBundle } = await import("../scripts/sync-bundled-product-cpu.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-bundle-publish-"));
  const first = {
    generation: "1".repeat(64),
    files: new Map([["cpu-v6/agents/__init__.py", Buffer.from("# first\n")]]),
    trustedIndex: Buffer.from('{"generation":"first"}\n'),
  };
  const second = {
    generation: "2".repeat(64),
    files: new Map([["cpu-v6/agents/__init__.py", Buffer.from("# second\n")]]),
    trustedIndex: Buffer.from('{"generation":"second"}\n'),
  };
  publishBundle(first, { bridgeRoot: root });
  assert.throws(
    () => publishBundle(second, { bridgeRoot: root, beforeIndexPublish: () => { throw new Error("stop"); } }),
    /stop/
  );
  assert.equal(
    fs.readFileSync(path.join(root, "trusted_product_cpu_policies.json"), "utf8"),
    first.trustedIndex.toString()
  );
  assert.equal(
    fs.readFileSync(path.join(root, "vendor/generations", first.generation, "cpu-v6/agents/__init__.py"), "utf8"),
    "# first\n"
  );
  assert.equal(
    fs.readFileSync(path.join(root, "vendor/generations", second.generation, "cpu-v6/agents/__init__.py"), "utf8"),
    "# second\n"
  );
});

test("sync and npm packaging share a lock, and packed index references are complete", async () => {
  const lockModulePath = path.join(__dirname, "..", "scripts", "product-cpu-package-lock.mjs");
  const { acquirePackageLock, releasePackageLock } = await import(lockModulePath);
  const lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "laplace-lock-")), "lock");
  acquirePackageLock(lockPath);
  const contender = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { acquirePackageLock, releasePackageLock } from ${JSON.stringify(pathToFileURL(lockModulePath).href)}; acquirePackageLock(${JSON.stringify(lockPath)}, 2000); releasePackageLock(${JSON.stringify(lockPath)});`,
    ],
    { stdio: "ignore" }
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(contender.exitCode, null, "a concurrent publisher must wait for the package lock");
  releasePackageLock(lockPath);
  await new Promise<void>((resolve, reject) => {
    contender.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`lock contender exited ${code}`)));
    contender.once("error", reject);
  });

  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "laplace-pack-"));
  const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", packRoot], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(packed.status, 0, packed.stderr);
  const packResult = JSON.parse(packed.stdout);
  const tarball = path.join(packRoot, packResult[0].filename);
  const indexResult = spawnSync(
    "tar",
    ["-xOf", tarball, "package/bridge/trusted_product_cpu_policies.json"],
    { encoding: "utf8" }
  );
  assert.equal(indexResult.status, 0, indexResult.stderr);
  const packedIndex = JSON.parse(indexResult.stdout);
  const listing = spawnSync("tar", ["-tf", tarball], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  for (const anchor of Object.values(packedIndex.policies) as Array<{ bundle_dir: string }>) {
    assert.match(listing.stdout, new RegExp(`package/bridge/vendor/${anchor.bundle_dir}/manifest\\.json`));
  }
});

test("bridge does not create bytecode inside the packaged snapshot", () => {
  const root = copiedBridge();
  const result = runBridge(root, "cpu-v6");
  assert.equal(result.status, 0, result.stderr);
  const bytecode: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name.endsWith(".pyc")) bytecode.push(absolute);
    }
  };
  walk(root);
  assert.deepEqual(bytecode, []);
});
