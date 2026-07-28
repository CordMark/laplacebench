import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import {
  ProductCpuBridge,
  createProductCpuAgent,
  preflightProductCpu,
  perMoveSeed,
  resolvePythonCommand,
  type ProductCpuOptions,
} from "../src/agents/productcpu";

const FAKE = path.join(__dirname, "fake-product-bridge.cjs");

function fakeOpts(mode: string, extra?: Partial<ProductCpuOptions>): ProductCpuOptions {
  return {
    expectedPolicy: "cpu-v4",
    bridgeCommand: {
      command: process.execPath,
      args: [FAKE],
    },
    helloTimeoutMs: 3000,
    moveTimeoutMs: 3000,
    scoreTimeoutMs: 3000,
    ...extra,
  };
}

function withMode<T>(mode: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.FAKE_BRIDGE_MODE;
  process.env.FAKE_BRIDGE_MODE = mode;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.FAKE_BRIDGE_MODE;
    else process.env.FAKE_BRIDGE_MODE = prev;
  });
}

test("hello validation rejects policy mismatch and hidden tier", async () => {
  await withMode("bad_policy", async () => {
    await assert.rejects(
      preflightProductCpu(fakeOpts("bad_policy"), "level_3"),
      /policy_version mismatch/
    );
  });
  await withMode("normal", async () => {
    await assert.rejects(
      preflightProductCpu(fakeOpts("normal"), "level_6"),
      /not a visible tier/
    );
    const hello = await preflightProductCpu(fakeOpts("normal"), "level_3");
    assert.equal(hello.policy_version, "cpu-v4");
    assert.equal(hello.visible_tiers.length, 5);
  });
});

test("request correlation survives out-of-order responses", async () => {
  await withMode("reorder", async () => {
    const bridge = new ProductCpuBridge(fakeOpts("reorder"));
    try {
      await bridge.hello;
      // depth echoes currentPlayer, so each reply is attributable.
      const [r1, r2] = await Promise.all([
        bridge.scoreRoots("level_3", { currentPlayer: 1 }),
        bridge.scoreRoots("level_3", { currentPlayer: 2 }),
      ]);
      assert.equal(r1.depth, 1);
      assert.equal(r2.depth, 2);
    } finally {
      bridge.dispose();
    }
  });
});

test("non-JSON output rejects pending requests", async () => {
  await withMode("nonjson", async () => {
    const bridge = new ProductCpuBridge(fakeOpts("nonjson"));
    try {
      await bridge.hello;
      await assert.rejects(bridge.scoreRoots("level_3", {}), /non-JSON/);
    } finally {
      bridge.dispose();
    }
  });
});

test("bridge crash mid-request rejects pending requests", async () => {
  await withMode("crash", async () => {
    const bridge = new ProductCpuBridge(fakeOpts("crash"));
    try {
      await bridge.hello;
      await assert.rejects(bridge.scoreRoots("level_3", {}), /bridge exited/);
    } finally {
      bridge.dispose();
    }
  });
});

test("request deadline rejects when the bridge never answers", async () => {
  await withMode("silent", async () => {
    const bridge = new ProductCpuBridge(fakeOpts("silent", { scoreTimeoutMs: 300 }));
    try {
      await bridge.hello;
      await assert.rejects(bridge.scoreRoots("level_3", {}), /timed out/);
    } finally {
      bridge.dispose();
    }
  });
});

test("hello timeout fails closed when the bridge stays silent", async () => {
  await withMode("no_hello", async () => {
    await assert.rejects(
      preflightProductCpu(fakeOpts("no_hello", { helloTimeoutMs: 300 }), "level_3"),
      /hello timed out|bridge exited/
    );
  });
});

test("dispose terminates the child and closes the client", async () => {
  await withMode("normal", async () => {
    const bridge = new ProductCpuBridge(fakeOpts("normal"));
    await bridge.hello;
    bridge.dispose();
    bridge.dispose(); // idempotent
    await assert.rejects(bridge.scoreRoots("level_3", {}), /closed|disposed/);
  });
});

test("Python resolver accepts 3.11+, rejects old-only and missing hosts", () => {
  const supported = resolvePythonCommand((command, args) => ({
    status: command === "python3" ? 0 : 1,
    stdout: args.at(-1) === "--version" ? "Python 3.11.9" : "",
  }), "darwin");
  assert.deepEqual(supported, { command: "python3", args: [] });

  assert.throws(
    () => resolvePythonCommand(() => ({ status: 0, stdout: "Python 3.10.14" }), "darwin"),
    /Python 3\.11以上.*対局は開始していません/
  );
  assert.throws(
    () => resolvePythonCommand(() => ({ status: null, error: new Error("ENOENT") }), "linux"),
    /Python 3\.11以上/
  );

  const calls: Array<[string, string[]]> = [];
  const windows = resolvePythonCommand((command, args) => {
    calls.push([command, args]);
    return { status: 0, stdout: "Python 3.12.1" };
  }, "win32");
  assert.deepEqual(windows, { command: "py", args: ["-3"] });
  assert.deepEqual(calls[0], ["py", ["-3", "--version"]]);
});

test("perMoveSeed follows the mod 2^31 contract, including large seeds", () => {
  assert.equal(perMoveSeed(0, 0), 0);
  assert.equal(perMoveSeed(1, 2), 1_000_005);
  const MOD = 2 ** 31;
  // Boundary: results always in [0, 2^31), even at the largest agent seeds.
  for (const [s, p] of [
    [2 ** 31 - 1, 299],
    [2 ** 31, 0],
    [123456789, 100],
  ] as const) {
    const v = perMoveSeed(s, p);
    assert.ok(v >= 0 && v < MOD, `${s},${p} -> ${v}`);
    assert.equal(v, (((s * 1_000_003 + p) % MOD) + MOD) % MOD);
  }
});

test("npm package ships the bridge script (files allowlist)", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
  );
  assert.ok(pkg.files.includes("bridge"), "package.json files[] must include bridge/");
  assert.ok(
    fs.existsSync(path.join(__dirname, "..", "bridge", "product_cpu_bridge.py")),
    "bridge script must exist at the packaged path"
  );
  const indexPath = path.join(__dirname, "..", "bridge", "trusted_product_cpu_policies.json");
  assert.ok(fs.existsSync(indexPath));
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.ok(
    fs.existsSync(
      path.join(__dirname, "..", "bridge", "vendor", index.policies["cpu-v6"].bundle_dir, "manifest.json")
    )
  );
});

test("stderr output from the bridge rejects pending requests (fail-closed)", async () => {
  await withMode("stderr", async () => {
    const bridge = new ProductCpuBridge(fakeOpts("stderr"));
    try {
      await bridge.hello;
      await assert.rejects(bridge.scoreRoots("level_3", {}), /wrote to stderr/);
    } finally {
      bridge.dispose();
    }
  });
});

test("agent surfaces per-move seed via meta and derives it deterministically", async () => {
  await withMode("normal", async () => {
    const agent = await createProductCpuAgent("level_3", 77, fakeOpts("normal"));
    try {
      assert.equal(agent.name, "product-cpu:cpu-v4:level_3");
      const reply = await agent.act({
        state: { board: [], currentPlayer: 1, boardSize: 8, eliminatedPlayers: [], capturedPieces: [], consecutiveTimeouts: [] } as never,
        ply: 5,
        actingPlayer: 1,
        team: "A",
        legal: [],
        recent: [],
        attempt: 1,
        maxPlies: 100,
        deadlineAtMs: Date.now() + 1000,
      });
      assert.deepEqual(reply.move, { from: { row: 0, col: 3 }, to: { row: 3, col: 3 } });
      assert.equal((reply.meta as any).product_seed, perMoveSeed(77, 5));
    } finally {
      await agent.dispose?.();
    }
  });
});
