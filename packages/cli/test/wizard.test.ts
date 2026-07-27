import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  MODEL_SHORTHAND,
  PRODUCT_CPU_POLICY,
  PROVIDERS,
  usageAgentSpecsLine,
} from "../src/catalog";
import { arenaDefaults, isLlmSpec } from "../src/cli";
import {
  isCancelled,
  makePromptIO,
  normalizePromptIntegerText,
  providerFor,
  runPlay,
  runWizardFlow,
  submissionGuidance,
  WizardCancelledError,
  wizardRunId,
  type PromptRunner,
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

interface ScriptedIO extends WizardIO {
  printed: string[];
  prompts: Array<
    | { kind: "select"; title: string; options: string[] }
    | { kind: "input"; title: string }
  >;
  assertDone(): void;
}

function scriptedIO(answers: (number | string)[]): ScriptedIO {
  const queue = [...answers];
  const printed: string[] = [];
  const seenPrompts: ScriptedIO["prompts"] = [];
  const next = () => {
    const v = queue.shift();
    if (v === undefined) throw new Error("scripted answers exhausted");
    return v;
  };
  return {
    printed,
    prompts: seenPrompts,
    assertDone() {
      assert.deepEqual(queue, [], `unused scripted answers: ${JSON.stringify(queue)}`);
    },
    async select(title, options) {
      seenPrompts.push({ kind: "select", title, options: [...options] });
      const v = next();
      if (typeof v !== "number") throw new Error(`expected select answer, got ${v}`);
      return v;
    },
    async input(prompt, def) {
      seenPrompts.push({ kind: "input", title: prompt });
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

test("prompt adapter maps arrow-menu choices and text defaults", async () => {
  const questions: Array<Record<string, unknown>> = [];
  const answers: unknown[] = [1, "typed"];
  const runner = (async (question: Record<string, unknown>) => {
    questions.push(question);
    return { value: answers.shift() };
  }) as unknown as PromptRunner;
  const io = makePromptIO(runner);

  assert.equal(await io.select("選択:", ["A", "B"]), 1);
  assert.equal(await io.input("入力:", "default"), "typed");
  assert.equal(questions[0].type, "select");
  assert.equal(questions[0].hint, "↑/↓で選択・Enterで決定（Escで中止）");
  assert.deepEqual(questions[0].choices, [
    { title: "A", value: 0 },
    { title: "B", value: 1 },
  ]);
  assert.equal(questions[1].type, "text");
  assert.equal(questions[1].initial, "default");
});

test("prompt adapter turns Ctrl+C or Escape cancellation into one error type", async () => {
  const runner = (async (
    question: Record<string, unknown>,
    options?: { onCancel?: (question: Record<string, unknown>, answers: object) => unknown }
  ) => {
    options?.onCancel?.(question, {});
    return {};
  }) as unknown as PromptRunner;
  const io = makePromptIO(runner);
  await assert.rejects(() => io.select("選択:", ["A"]), WizardCancelledError);
  await assert.rejects(() => io.input("入力:"), WizardCancelledError);
});

test("runPlay handles select and text cancellation once without starting work", async () => {
  for (const kind of ["select", "input"] as const) {
    const printed: string[] = [];
    let closeCount = 0;
    let arenaCount = 0;
    let submitCount = 0;
    const selectAnswers = [providerIndex("claude-cli"), 5];
    const io: WizardIO & { close(): void } = {
      async select() {
        if (kind === "select") throw new WizardCancelledError();
        const answer = selectAnswers.shift();
        if (answer === undefined) throw new Error("unexpected select");
        return answer;
      },
      async input() {
        throw new WizardCancelledError();
      },
      print(line) { printed.push(line); },
      close() { closeCount++ },
    };
    const code = await runPlay({
      ...okDeps,
      runArena: async () => { arenaCount++ },
      submitRun: () => { submitCount++ },
      isTTY: true,
      now: () => new Date("2026-07-27T00:00:00Z"),
    }, io);
    assert.equal(code, 1, kind);
    assert.equal(
      printed.filter((line) => line === "中止しました。対局は開始されていません。").length,
      1,
      kind
    );
    assert.equal(closeCount, 1, kind);
    assert.equal(arenaCount, 0, kind);
    assert.equal(submitCount, 0, kind);
  }
});

test("wizard flow: claude-cli:opus@high vs product-cpu level_3 with canonical preset", async () => {
  const io = scriptedIO([
    providerIndex("claude-cli"), // Team A provider
    0, // model: Opus 5 (newest first)
    3, // effort: ["", low, medium, high, xhigh] -> index 3 = high
    providerIndex("product-cpu"), // Team B provider
    2, // level_3
    0, // games preset: canonical 2+swap
    0, // 自動提出: しない
  ]);
  const result = await runWizardFlow(io, okDeps);
  io.assertDone();
  assert.ok(!isCancelled(result));
  const plan = result as WizardPlan;
  assert.equal(plan.specA, "claude-cli:claude-opus-5@high");
  assert.equal(plan.specB, `product-cpu:${PRODUCT_CPU_POLICY}:level_3`);
  assert.equal(plan.games, 2);
  assert.equal(plan.swap, true);
  assert.equal(plan.seed, 4242);
  assert.equal(plan.extraArgs["product-repo"], "/repo");
  assert.equal(plan.extraArgs["product-commit"], "abc123");
  assert.deepEqual(io.prompts.map(({ kind, title }) => ({ kind, title })), [
    { kind: "select", title: "Team A のAIを選択:" },
    { kind: "select", title: "モデル:" },
    { kind: "select", title: "effort:" },
    { kind: "select", title: "Team B のAIを選択:" },
    { kind: "select", title: "モデル:" },
    { kind: "select", title: "対局数:" },
    { kind: "select", title: "終了後に公開台帳へ自動提出しますか?" },
  ]);
  const presetPrompt = io.prompts.find((prompt) => prompt.title === "対局数:");
  assert.equal(presetPrompt?.kind, "select");
  assert.deepEqual(presetPrompt?.kind === "select" ? presetPrompt.options : [], [
    "2局・先後交代（推奨）",
    "詳細設定",
  ]);
  const submitPrompt = io.prompts.find(
    (prompt) => prompt.title === "終了後に公開台帳へ自動提出しますか?"
  );
  assert.equal(submitPrompt?.kind, "select");
  assert.deepEqual(submitPrompt?.kind === "select" ? submitPrompt.options : [], [
    "今回は提出しない",
    "GitHubで公開提出する（検証後、自動マージ）",
  ]);
  assert.doesNotMatch(JSON.stringify(io.prompts), /スワップあり|推奨=正準ペア|カスタム/);
  assert.ok(!plan.summaryLines.join("\n").includes("seed="));
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
    0, // 自動提出: しない
  ]);
  const result = await runWizardFlow(io, okDeps, { seed: "777" });
  io.assertDone();
  const plan = result as WizardPlan;
  assert.equal(plan.specA, "claude-cli:my-custom-model");
  assert.equal(plan.specB, "greedy");
  assert.equal(plan.games, 4);
  assert.equal(plan.seed, 777);
  const sidePrompt = io.prompts.find((prompt) => prompt.title === "先後:");
  assert.equal(sidePrompt?.kind, "select");
  assert.deepEqual(sidePrompt?.kind === "select" ? sidePrompt.options : [], [
    "先後を交代する",
    "固定する",
  ]);
  assert.doesNotMatch(JSON.stringify(io.prompts), /サイドスワップ|あり|なし/);
});

test("wizard flow: baseline vs baseline passes with no auth requirements", async () => {
  const io = scriptedIO([
    providerIndex("baseline"), 0, // random
    providerIndex("baseline"), 1, // greedy
    0, // canonical preset
    0, // 自動提出: しない
  ]);
  const deps = { ...okDeps, checkCommand: () => ({ ok: false }) }; // no CLIs at all
  const result = await runWizardFlow(io, deps);
  io.assertDone();
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
    0, // 自動提出: しない
    0, // auth failed -> 再チェック (wrapper flips ok before the next pass)
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
  io.assertDone();
  assert.ok(!isCancelled(result));
  assert.ok(io.printed.some((l) => l.includes("✗ claude")));
});

test("auth gate: 中止 returns cancelled and arena is never called", async () => {
  const deps = { ...okDeps, checkCommand: () => ({ ok: false }) };
  const io = scriptedIO([
    providerIndex("claude-cli"), 0, 0,
    providerIndex("baseline"), 0,
    0, 0,
    1, // 中止
  ]);
  const result = await runWizardFlow(io, deps);
  io.assertDone();
  assert.ok(isCancelled(result));

  // runPlay must not call arena on cancellation and must exit 1
  let arenaCalled = false;
  const runIO = scriptedIO([
    providerIndex("claude-cli"), 0, 0,
    providerIndex("baseline"), 0,
    0, 0,
    1, // 中止
  ]);
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
    runIO
  );
  runIO.assertDone();
  assert.equal(code, 1);
  assert.equal(arenaCalled, false);
});

test("wizard flow: product-cpu env missing prompts for path/commit", async () => {
  const deps = { ...okDeps, env: {} as NodeJS.ProcessEnv };
  const io = scriptedIO([
    providerIndex("product-cpu"), 4, // level_5
    providerIndex("baseline"), 0,
    0, 0,
    "/typed/repo", // product path input
    "deadbeef", // commit input
  ]);
  const result = await runWizardFlow(io, deps);
  io.assertDone();
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
    0, 0, // 自動提出: しない
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
  io.assertDone();
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
    0,
    1, // 自動提出: する
  ]);
  const now = new Date("2026-07-25T12:00:00Z");
  const code = await runPlay(
    {
      ...okDeps,
      runArena: async () => {},
      submitRun: (dir) => { submitted.push(dir); },
      isTTY: true,
      now: () => now,
    },
    io
  );
  io.assertDone();
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
    0,
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
  io.assertDone();
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
    0,
    0, // 自動提出: しない
  ]);
  const plan = (await runWizardFlow(io, okDeps)) as WizardPlan;
  io.assertDone();
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

test("generated seed is internal; explicit --seed remains visible", async () => {
  const generated = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    0,
    0,
  ]);
  const generatedPlan = (await runWizardFlow(generated, okDeps)) as WizardPlan;
  generated.assertDone();
  assert.equal(generatedPlan.seed, 4242);
  assert.ok(!generatedPlan.summaryLines.join("\n").includes("seed="));
  assert.ok(!generated.prompts.some((prompt) => /seed/i.test(prompt.title)));

  const explicit = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    0,
    0,
  ]);
  const explicitPlan = (await runWizardFlow(explicit, okDeps, { seed: "0" })) as WizardPlan;
  explicit.assertDone();
  assert.equal(explicitPlan.seed, 0);
  assert.ok(explicitPlan.summaryLines.join("\n").includes("seed=0"));
  assert.ok(!explicit.prompts.some((prompt) => /seed/i.test(prompt.title)));
});

test("integer prompts accept full-width digits and reject trailing junk", async () => {
  assert.equal(normalizePromptIntegerText("１２"), "12");
  assert.equal(normalizePromptIntegerText("1abc"), "1abc");

  const fullWidth = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    1,
    "１２",
    0,
    0,
  ]);
  const fullWidthPlan = (await runWizardFlow(fullWidth, okDeps)) as WizardPlan;
  fullWidth.assertDone();
  assert.equal(fullWidthPlan.games, 12);

  const retry = scriptedIO([
    providerIndex("baseline"), 0,
    providerIndex("baseline"), 1,
    1,
    "1abc",
    "-1",
    "3",
    0,
    0,
  ]);
  const retryPlan = (await runWizardFlow(retry, okDeps)) as WizardPlan;
  retry.assertDone();
  assert.equal(retryPlan.games, 3);
  assert.equal(
    retry.printed.filter((line) => line.includes("整数を入力してください")).length,
    2
  );
});

test("full-width normalization is limited to interactive integer prompts", async () => {
  const io = scriptedIO([
    providerIndex("claude-cli"),
    5,
    "ｍｙ-model１２",
    0,
    providerIndex("product-cpu"),
    0,
    0,
    0,
    "/tmp/１２",
    "ａｂ１２",
  ]);
  const deps = { ...okDeps, env: {} as NodeJS.ProcessEnv };
  const plan = (await runWizardFlow(io, deps)) as WizardPlan;
  io.assertDone();
  assert.equal(plan.specA, "claude-cli:ｍｙ-model１２");
  assert.equal(plan.extraArgs["product-repo"], "/tmp/１２");
  assert.equal(plan.extraArgs["product-commit"], "ａｂ１２");
});

// ---------------------------------------------------------------------------
// Non-interactive entry (docs/plans/2026-07-27-bench-one-command.md)
// ---------------------------------------------------------------------------

/** Fails loudly if anything tries to prompt: headless must never wait on stdin. */
function headlessIO(): WizardIO & { printed: string[] } {
  const printed: string[] = [];
  return {
    printed,
    async select() { throw new Error("headless run must not prompt"); },
    async input() { throw new Error("headless run must not prompt"); },
    print(line) { printed.push(line); },
  };
}

const headlessDeps = (over: Partial<Parameters<typeof runPlay>[0]> = {}) => ({
  ...okDeps,
  runArena: async () => {},
  submitRun: () => { throw new Error("must not submit"); },
  isTTY: false,
  now: () => new Date("2026-07-27T12:00:00Z"),
  ...over,
});

test("headless: complete flags run the match, publish nothing, and say so", async () => {
  let seen: Record<string, string | boolean> | null = null;
  const io = headlessIO();
  const code = await runPlay(
    headlessDeps({ runArena: async (a) => { seen = a; } }),
    io,
    { "team-a": "random", "team-b": "greedy", games: "1", seed: "7" }
  );
  assert.equal(code, 0);
  assert.equal(seen!["team-a"], "random");
  assert.equal(seen!["games"], "1");
  assert.equal(seen!["seed"], "7");
  const out = io.printed.join("\n");
  assert.ok(out.includes("まだ提出されていません"), "must state it did not publish");
  assert.ok(
    out.includes(`laplacebench submit runs/${seen!["run-id"]}`),
    "must name the exact next command"
  );
});

test("headless: --submit publishes and says it published", async () => {
  const submitted: string[] = [];
  const io = headlessIO();
  const code = await runPlay(
    headlessDeps({ submitRun: (dir) => { submitted.push(dir); } }),
    io,
    { "team-a": "random", "team-b": "greedy", submit: true }
  );
  assert.equal(code, 0);
  assert.equal(submitted.length, 1);
  assert.ok(io.printed.join("\n").includes("公開台帳へ提出しました"));
});

test("headless: a failed submission reports the failure and the manual route", async () => {
  const io = headlessIO();
  const code = await runPlay(
    headlessDeps({ submitRun: () => { throw new Error("push rejected"); } }),
    io,
    { "team-a": "random", "team-b": "greedy", submit: true }
  );
  assert.equal(code, 0);
  const out = io.printed.join("\n");
  assert.ok(out.includes("push rejected"));
  assert.ok(out.includes("提出に失敗しました"));
  assert.ok(out.includes("cp -R runs/"), "manual fallback stays available");
});

test("headless: missing team flags name what is missing and start nothing", async () => {
  let ran = false;
  const io = headlessIO();
  const code = await runPlay(
    headlessDeps({ runArena: async () => { ran = true; } }),
    io,
    { "team-a": "random" }
  );
  assert.equal(code, 1);
  assert.equal(ran, false, "no match may start");
  assert.ok(io.printed.join("\n").includes("--team-b"));
});

test("flag syntax is rejected before anything runs", async () => {
  const cases: [Record<string, string | boolean>, string][] = [
    [{ "team-a": true, "team-b": "greedy" }, "--team-a には値が必要です"],
    // The parser turns `--submit false` into the truthy string "false"; a run
    // must never be published because someone wrote that they did not want it.
    [{ "team-a": "random", "team-b": "greedy", submit: "false" }, "--submit は値を取りません"],
    [{ "team-a": "random", "team-b": "greedy", swap: "false" }, "--swap は値を取りません"],
    [{ "team-a": "random", "team-b": "greedy", games: "two" }, "--games には整数を指定してください"],
    [{ "team-a": "random", "team-b": "greedy", games: "１２" }, "--games には整数を指定してください"],
    [{ "team-a": "random", "team-b": "greedy", "dry-run": true }, "--dry-run は認識できないフラグです"],
  ];
  for (const [args, expected] of cases) {
    let ran = false;
    let submitted = false;
    const io = headlessIO();
    const code = await runPlay(
      headlessDeps({
        runArena: async () => { ran = true; },
        submitRun: () => { submitted = true; },
      }),
      io,
      args
    );
    assert.equal(code, 1, expected);
    assert.equal(ran, false, `no match may start: ${expected}`);
    assert.equal(submitted, false, `nothing may be published: ${expected}`);
    assert.ok(io.printed.join("\n").includes(expected), expected);
  }
});

test("headless: a missing provider CLI fails without prompting", async () => {
  let ran = false;
  const io = headlessIO();
  const code = await runPlay(
    headlessDeps({
      checkCommand: () => ({ ok: false }),
      runArena: async () => { ran = true; },
    }),
    io,
    { "team-a": "claude-cli:claude-opus-5@high", "team-b": "greedy" }
  );
  assert.equal(code, 1);
  assert.equal(ran, false);
  assert.ok(io.printed.join("\n").includes("不足"));
});

test("headless: product-cpu pins are accepted from flags as well as env", async () => {
  for (const [args, deps] of [
    [
      { "product-repo": "/from-flag", "product-commit": "deadbeef" },
      headlessDeps({ env: {} as NodeJS.ProcessEnv }),
    ],
    [{}, headlessDeps()],
  ] as const) {
    let seen: Record<string, string | boolean> | null = null;
    const code = await runPlay(
      { ...deps, runArena: async (a) => { seen = a; } },
      headlessIO(),
      {
        "team-a": `product-cpu:${PRODUCT_CPU_POLICY}:level_3`,
        "team-b": "greedy",
        ...args,
      }
    );
    assert.equal(code, 0);
    assert.ok(seen!["product-repo"], "the pin must reach the runner");
    assert.ok(seen!["product-commit"]);
  }
});

test("interactive: supplied flags replace their prompts, the rest are still asked", async () => {
  // Only the Team B menu, the games preset, and the submit question remain —
  // Team A came from a flag, so its three prompts are gone.
  const io = scriptedIO([
    providerIndex("baseline"), 1, // Team B: greedy
    0,                            // games preset: canonical
    0,                            // 自動提出: しない
  ]);
  let seen: Record<string, string | boolean> | null = null;
  const code = await runPlay(
    { ...okDeps, runArena: async (a) => { seen = a; }, submitRun: () => {}, isTTY: true, now: () => new Date() },
    io,
    { "team-a": "random" }
  );
  io.assertDone();
  assert.equal(code, 0);
  assert.equal(seen!["team-a"], "random");
  assert.equal(seen!["team-b"], "greedy");
});

test("the deprecated arena alias keeps every default it had", () => {
  // The compatibility claim this slice's tier defense rests on: a bare `arena`
  // and any partially-specified one must behave exactly as before, because the
  // published command and the anchor-ladder records still use those defaults.
  assert.deepEqual(arenaDefaults({}), {
    specA: "random", specB: "takeshi", games: 2, swap: false, seed: 42,
  });
  assert.deepEqual(arenaDefaults({ "team-a": "greedy" }), {
    specA: "greedy", specB: "takeshi", games: 2, swap: false, seed: 42,
  });
  assert.deepEqual(arenaDefaults({ "team-b": "greedy" }), {
    specA: "random", specB: "greedy", games: 2, swap: false, seed: 42,
  });
  assert.deepEqual(arenaDefaults({ seed: "9", games: "4", swap: true }), {
    specA: "random", specB: "takeshi", games: 4, swap: true, seed: 9,
  });
});

test("a blocked submission is never reported as published", async () => {
  // `submitRun` signals refusal by RETURNING blocked — failed verification,
  // missing gh auth, already submitted — without throwing. Treating a quiet
  // return as success is exactly the lie this entry point exists to remove.
  for (const reason of ["verify-failed", "not-authenticated"]) {
    const io = headlessIO();
    const code = await runPlay(
      headlessDeps({ submitRun: () => ({ status: "blocked", reason }) }),
      io,
      { "team-a": "random", "team-b": "greedy", submit: true }
    );
    assert.equal(code, 0);
    const out = io.printed.join("\n");
    assert.ok(!out.includes("公開台帳へ提出しました"), `must not claim success: ${reason}`);
    assert.ok(out.includes(`laplacebench submit runs/`), `must show the way forward: ${reason}`);
  }
});

test("a harness that borrows another provider's credentials is preflighted", async () => {
  // claude-cli-learn drives the Claude CLI but is not itself a PROVIDERS key;
  // mapping it to the baseline would start a headless match with no CLI.
  assert.equal(providerFor("claude-cli-learn:claude-opus-5@high").key, "claude-cli");
  let ran = false;
  const io = headlessIO();
  const code = await runPlay(
    headlessDeps({ checkCommand: () => ({ ok: false }), runArena: async () => { ran = true; } }),
    io,
    { "team-a": "claude-cli-learn:claude-opus-5@high", "team-b": "greedy" }
  );
  assert.equal(code, 1);
  assert.equal(ran, false, "no match may start without the CLI it needs");
});

test("out-of-range numbers are rejected before auth and before the match", async () => {
  for (const args of [
    { "max-plies": "0" },
    { "turn-timeout-ms": "-1" },
    { "output-token-budget": "0" },
    { games: "0" },
  ]) {
    let ran = false;
    let authChecked = false;
    const io = headlessIO();
    const code = await runPlay(
      headlessDeps({
        checkCommand: () => { authChecked = true; return { ok: true, version: "x" }; },
        runArena: async () => { ran = true; },
      }),
      io,
      { "team-a": "random", "team-b": "greedy", ...args }
    );
    assert.equal(code, 1, JSON.stringify(args));
    assert.equal(ran, false, `no match may start: ${JSON.stringify(args)}`);
    assert.equal(authChecked, false, `no auth check: ${JSON.stringify(args)}`);
    assert.ok(
      !io.printed.join("\n").includes("対局開始"),
      `must not announce a match it will not run: ${JSON.stringify(args)}`
    );
  }
});

test("interactive: one of games/swap supplied still asks for the other", async () => {
  // --games without --swap must not silently decide side-swapping, and
  // --swap without --games must not silently decide the game count.
  const gamesOnly = scriptedIO([
    providerIndex("baseline"), 1, // Team B
    0,                            // サイドスワップ: あり
    0,                            // 自動提出: しない
  ]);
  let seen: Record<string, string | boolean> | null = null;
  assert.equal(
    await runPlay(
      { ...okDeps, runArena: async (a) => { seen = a; }, submitRun: () => {}, isTTY: true, now: () => new Date() },
      gamesOnly,
      { "team-a": "random", games: "4" }
    ),
    0
  );
  gamesOnly.assertDone();
  assert.equal(seen!["games"], "4");
  assert.equal(seen!["swap"], true, "the answer to the swap question must be used");

  const swapOnly = scriptedIO([
    providerIndex("baseline"), 1,
    "3",  // 対局数
    0,    // 自動提出: しない
  ]);
  seen = null;
  assert.equal(
    await runPlay(
      { ...okDeps, runArena: async (a) => { seen = a; }, submitRun: () => {}, isTTY: true, now: () => new Date() },
      swapOnly,
      { "team-a": "random", swap: true }
    ),
    0
  );
  swapOnly.assertDone();
  assert.equal(seen!["games"], "3", "the answer to the games question must be used");
  assert.equal(seen!["swap"], true);
});
