import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  MODEL_SHORTHAND,
  PRODUCT_CPU_POLICY,
  PROVIDERS,
  usageAgentSpecsLine,
} from "../src/catalog";
import { isLlmSpec } from "../src/cli";
import {
  isCancelled,
  runPlay,
  runWizardFlow,
  submissionGuidance,
  wizardRunId,
  type WizardIO,
  type WizardPlan,
} from "../src/wizard";

const PRODUCT_CPU_SPEC = /^product-cpu:([a-z0-9-]+):(level_\d+)$/;

// ---------------------------------------------------------------------------
// Catalog consistency with existing resolvers
// ---------------------------------------------------------------------------

test("catalog specs agree with the resolvers", () => {
  for (const p of PROVIDERS) {
    const spec = p.buildSpec(p.models[0].value, "");
    if (p.key === "claude-cli" || p.key === "codex-cli" || p.key === "anthropic") {
      assert.equal(isLlmSpec(spec), true, spec);
    } else {
      assert.equal(isLlmSpec(spec), false, spec);
    }
    if (p.key === "product-cpu") {
      assert.match(spec, PRODUCT_CPU_SPEC);
      assert.equal(spec.split(":")[1], PRODUCT_CPU_POLICY);
    }
  }
  // effort labeling flows into the spec (condition-label auto consistency)
  const claude = PROVIDERS.find((p) => p.key === "claude-cli")!;
  assert.equal(claude.buildSpec("claude-opus-5", "high"), "claude-cli:claude-opus-5@high");
  assert.equal(claude.buildSpec("claude-opus-5", ""), "claude-cli:claude-opus-5");
  // baselines are random/greedy only (takeshi deliberately unlisted)
  const baseline = PROVIDERS.find((p) => p.key === "baseline")!;
  assert.deepEqual(
    baseline.models.map((m) => m.value),
    ["random", "greedy"]
  );
  const product = PROVIDERS.find((p) => p.key === "product-cpu")!;
  assert.equal(PRODUCT_CPU_POLICY, "cpu-v6");
  assert.deepEqual(product.models.map((model) => model.value), [
    "level_1", "level_2", "level_3", "level_4", "level_5", "level_6",
  ]);
  assert.match(product.models[5].label, /hosted can be slower/);
});

test("usage agent-specs line covers published providers and keeps free-form notice", () => {
  const line = usageAgentSpecsLine();
  for (const key of ["claude-cli", "codex-cli", "anthropic", "product-cpu"]) {
    assert.ok(line.includes(key), key);
  }
  assert.match(line, /random\/greedy/);
  assert.match(line, /takeshi:dN/);
  assert.match(line, /free-form/);
});

test("published model choices are full ids, never ambiguous shorthands", () => {
  // A menu selection has to name exactly one model: `opus` is whichever
  // generation the alias points at today, and a published record grouped by it
  // would change meaning when the alias moves.
  for (const key of ["claude-cli", "anthropic"]) {
    const provider = PROVIDERS.find((p) => p.key === key)!;
    for (const m of provider.models) {
      assert.ok(!(m.value in MODEL_SHORTHAND), `${key}: ${m.value} is a shorthand`);
      assert.match(m.value, /^claude-[a-z]+-[\d-]+$/, `${key}: ${m.value}`);
    }
  }
  // Newest first, so the current flagship is the default selection.
  assert.equal(PROVIDERS.find((p) => p.key === "claude-cli")!.models[0].value, "claude-opus-5");
  // Shorthands survive as a typing convenience for the API track only.
  assert.equal(MODEL_SHORTHAND.opus, "claude-opus-5");
});

// ---------------------------------------------------------------------------
// Scripted-IO wizard flow
// ---------------------------------------------------------------------------

function scriptedIO(answers: (number | string)[]): WizardIO & { printed: string[] } {
  const queue = [...answers];
  const printed: string[] = [];
  const next = () => {
    const v = queue.shift();
    if (v === undefined) throw new Error("scripted answers exhausted");
    return v;
  };
  return {
    printed,
    async select() {
      const v = next();
      if (typeof v !== "number") throw new Error(`expected select answer, got ${v}`);
      return v;
    },
    async input(_prompt, def) {
      const v = next();
      if (typeof v !== "string") throw new Error(`expected input answer, got ${v}`);
      return v === "" && def !== undefined ? def : v;
    },
    print(line) {
      printed.push(line);
    },
  };
}

const okDeps = {
  env: { LAPLACE_PRODUCT_REPO: "/repo", LAPLACE_PRODUCT_COMMIT: "abc123" } as NodeJS.ProcessEnv,
  checkCommand: () => ({ ok: true, version: "1.0-test" }),
  randomSeed: () => 4242,
};

const providerIndex = (key: string) => PROVIDERS.findIndex((p) => p.key === key);

test("wizard flow: claude-cli:opus@high vs product-cpu level_3 with canonical preset", async () => {
  const io = scriptedIO([
    providerIndex("claude-cli"), // Team A provider
    0, // model: Opus 5 (newest first)
    3, // effort: ["", low, medium, high, xhigh] -> index 3 = high
    providerIndex("product-cpu"), // Team B provider
    2, // level_3
    0, // games preset: canonical 2+swap
    "", // seed: accept default (4242)
    0, // 自動提出: しない
  ]);
  const result = await runWizardFlow(io, okDeps);
  assert.ok(!isCancelled(result));
  const plan = result as WizardPlan;
  assert.equal(plan.specA, "claude-cli:claude-opus-5@high");
  assert.equal(plan.specB, `product-cpu:${PRODUCT_CPU_POLICY}:level_3`);
  assert.equal(plan.games, 2);
  assert.equal(plan.swap, true);
  assert.equal(plan.seed, 4242);
  assert.equal(plan.extraArgs["product-repo"], "/repo");
  assert.equal(plan.extraArgs["product-commit"], "abc123");
});

test("wizard flow: default effort omits @effort; custom model input works", async () => {
  const io = scriptedIO([
    providerIndex("claude-cli"),
    5, // (手入力) — after the five published models
    "my-custom-model", // custom model input
    0, // effort default
    providerIndex("baseline"),
    1, // greedy
    1, // games: custom
    "4", // games count
    0, // swap: あり
    "777", // seed override
    0, // 自動提出: しない
  ]);
  const result = await runWizardFlow(io, okDeps);
  const plan = result as WizardPlan;
  assert.equal(plan.specA, "claude-cli:my-custom-model");
  assert.equal(plan.specB, "greedy");
  assert.equal(plan.games, 4);
  assert.equal(plan.seed, 777);
});

test("wizard flow: baseline vs baseline passes with no auth requirements", async () => {
  const io = scriptedIO([
    providerIndex("baseline"), 0, // random
    providerIndex("baseline"), 1, // greedy
    0, // canonical preset
    "", // seed default
    0, // 自動提出: しない
  ]);
  const deps = { ...okDeps, checkCommand: () => ({ ok: false }) }; // no CLIs at all
  const result = await runWizardFlow(io, deps);
  assert.ok(!isCancelled(result));
});

test("auth gate: missing claude CLI loops until recheck succeeds", async () => {
  let ok = false;
  const deps = {
    ...okDeps,
    checkCommand: () => (ok ? { ok: true, version: "v" } : { ok: false }),
  };
  const io = scriptedIO([
    providerIndex("claude-cli"), 0, 0, // A: claude-cli Opus 5, default effort
    providerIndex("baseline"), 0, // B: random
    0, // canonical preset
    "", // seed
    0, // 自動提出: しない
    0, // auth failed -> 再チェック (flip ok before this resolves? we flip via wrapper below)
    0, // second recheck (now ok)
  ]);
  // flip ok to true after the first recheck request
  const origSelect = io.select.bind(io);
  let selects = 0;
  io.select = async (t, o) => {
    const v = await origSelect(t, o);
    selects++;
    if (t.includes("再チェック")) ok = selects >= 0 ? true : ok;
    return v;
  };
  const result = await runWizardFlow(io, deps);
  assert.ok(!isCancelled(result));
  assert.ok(io.printed.some((l) => l.includes("✗ claude")));
});

test("auth gate: 中止 returns cancelled and arena is never called", async () => {
  const deps = { ...okDeps, checkCommand: () => ({ ok: false }) };
  const io = scriptedIO([
    providerIndex("claude-cli"), 0, 0,
    providerIndex("baseline"), 0,
    0, "", 0,
    1, // 中止
  ]);
  const result = await runWizardFlow(io, deps);
  assert.ok(isCancelled(result));

  // runPlay must not call arena on cancellation and must exit 1
  let arenaCalled = false;
  const code = await runPlay(
    {
      ...deps,
      runArena: async () => {
        arenaCalled = true;
      },
      submitRun: () => {
        throw new Error("must not submit");
      },
      isTTY: true,
      now: () => new Date("2026-07-25T00:00:00Z"),
    },
    scriptedIO([
      providerIndex("claude-cli"), 0, 0,
      providerIndex("baseline"), 0,
      0, "", 0,
      1, // 中止
    ])
  );
  assert.equal(code, 1);
  assert.equal(arenaCalled, false);
});

test("wizard flow: product-cpu env missing prompts for path/commit", async () => {
  const deps = { ...okDeps, env: {} as NodeJS.ProcessEnv };
  const io = scriptedIO([
    providerIndex("product-cpu"), 4, // level_5
    providerIndex("baseline"), 0,
    0, "", 0,
    "/typed/repo", // product path input
    "deadbeef", // commit input
  ]);
  const result = await runWizardFlow(io, deps);
  const plan = result as WizardPlan;
  assert.equal(plan.extraArgs["product-repo"], "/typed/repo");
  assert.equal(plan.extraArgs["product-commit"], "deadbeef");
});

// ---------------------------------------------------------------------------
// runPlay: run-id ownership, submission guidance, non-TTY
// ---------------------------------------------------------------------------

test("runPlay passes an explicit run-id and prints submission guidance with it", async () => {
  let seenArgs: Record<string, string | boolean> | null = null;
  const io = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    0, "", 0, // 自動提出: しない
  ]);
  const code = await runPlay(
    {
      ...okDeps,
      runArena: async (a) => {
        seenArgs = a;
      },
      submitRun: () => {
        throw new Error("must not submit");
      },
      isTTY: true,
      now: () => new Date("2026-07-25T12:00:00Z"),
    },
    io
  );
  assert.equal(code, 0);
  const expectedRunId = wizardRunId("random", "greedy", new Date("2026-07-25T12:00:00Z"));
  assert.equal(seenArgs!["run-id"], expectedRunId);
  assert.equal(seenArgs!["team-a"], "random");
  const guidance = io.printed.join("\n");
  assert.ok(
    guidance.includes(
      `cp -R runs/${expectedRunId} community/runs/<github名>--${expectedRunId}`
    )
  );
});

test("opting into auto-submit publishes the run instead of printing instructions", async () => {
  const submitted: string[] = [];
  const io = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    0, "",
    1, // 自動提出: する
  ]);
  const now = new Date("2026-07-25T12:00:00Z");
  const code = await runPlay(
    {
      ...okDeps,
      runArena: async () => {},
      submitRun: (dir) => submitted.push(dir),
      isTTY: true,
      now: () => now,
    },
    io
  );
  assert.equal(code, 0);
  const runId = wizardRunId("random", "greedy", now);
  assert.deepEqual(submitted, [`runs/${runId}`]);
  // The manual copy instructions would be noise once the run is already sent.
  assert.ok(!io.printed.join("\n").includes("cp -R runs/"));
});

test("a failed auto-submit falls back to the manual route instead of throwing", async () => {
  const io = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    0, "",
    1, // 自動提出: する
  ]);
  const code = await runPlay(
    {
      ...okDeps,
      runArena: async () => {},
      submitRun: () => {
        throw new Error("push rejected (non-fast-forward)");
      },
      isTTY: true,
      now: () => new Date("2026-07-25T12:00:00Z"),
    },
    io
  );
  // The match happened and its log is on disk — this is not a failed session.
  assert.equal(code, 0);
  const out = io.printed.join("\n");
  assert.ok(out.includes("push rejected"));
  assert.ok(out.includes("cp -R runs/"));
});

test("the auto-submit choice is asked once, up front, and defaults to off", async () => {
  const io = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    0, "",
    0, // 自動提出: しない
  ]);
  const plan = (await runWizardFlow(io, okDeps)) as WizardPlan;
  assert.equal(plan.autoSubmit, false);
  assert.ok(plan.summaryLines.some((l) => l.includes("自動提出: しない")));
});

test("submissionGuidance pins the exact copy command", () => {
  const lines = submissionGuidance("run-x");
  assert.ok(lines.some((l) => l.includes("cp -R runs/run-x community/runs/<github名>--run-x")));
});

test("runPlay without a TTY errors with flag guidance and exit 1", async () => {
  const code = await runPlay({
    ...okDeps,
    runArena: async () => {
      throw new Error("must not run");
    },
    submitRun: () => {
      throw new Error("must not submit");
    },
    isTTY: false,
    now: () => new Date(),
  });
  assert.equal(code, 1);
});

// ---------------------------------------------------------------------------
// CLI help integration (bin wrapper)
// ---------------------------------------------------------------------------

test("CLI help output is generated from the catalog and exits 1", () => {
  execFileSync("npm", ["run", "build"], { stdio: "ignore" });
  let out = "";
  let status = 0;
  try {
    out = execFileSync("node", ["bin/laplacebench.js", "definitely-unknown-cmd"], {
      encoding: "utf8",
    });
  } catch (err: unknown) {
    const e = err as { status: number; stdout: string };
    status = e.status;
    out = e.stdout ?? "";
  }
  assert.equal(status, 1);
  assert.match(out, /laplacebench play/);
  assert.match(out, /agent specs \(published\)/);
  for (const key of ["claude-cli", "codex-cli", "anthropic", "product-cpu"]) {
    assert.ok(out.includes(key), key);
  }
  assert.match(out, /free-form/);
});

test("numeric inputs are validated: seed 0 honored, bad games re-prompted", async () => {
  // seed "0" must be accepted as 0, not replaced by the random default
  const io1 = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    0, // canonical preset
    "0", // seed = 0 (valid override)
    0, // 自動提出: しない
  ]);
  const plan1 = (await runWizardFlow(io1, okDeps)) as WizardPlan;
  assert.equal(plan1.seed, 0);

  // malformed games ("2abc") and nonpositive ("-1") re-prompt until valid
  const io2 = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    1, // custom
    "2abc", // invalid games -> re-prompt
    "-1", // invalid games -> re-prompt
    "3", // valid
    0, // swap あり
    "not-a-number", // invalid seed -> re-prompt
    "12", // valid seed
    0, // 自動提出: しない
  ]);
  const plan2 = (await runWizardFlow(io2, okDeps)) as WizardPlan;
  assert.equal(plan2.games, 3);
  assert.equal(plan2.seed, 12);
  assert.ok(io2.printed.some((l) => l.includes("整数を入力してください")));
});
