import assert from "node:assert/strict";
import test from "node:test";
import {
  HARNESS_CONDITIONS,
  LLM_HARNESSES,
  PUBLIC_MATCHUP_HARNESSES,
  RECOGNIZED_HARNESSES,
  parseAgentSpec,
} from "../src/catalog";
import {
  classifyRunnableAgentSpec,
  isPublicMatchupEligible,
  matchupKind,
  publicPair,
} from "../src/publicgames";
import { codexSessionPlan, buildCodexInvocation } from "../src/agents/cli";

// ---------------------------------------------------------------------------
// The aggregate boundary: PUBLIC_MATCHUP_HARNESSES is the source of truth
// ---------------------------------------------------------------------------

test("a learning-harness cross-model match never becomes a public model matchup", () => {
  // The confirmed latent defect: before the allowlist this published as
  // "Opus 5 (medium) vs GPT-5.6 Sol (medium)".
  assert.equal(
    publicPair("claude-cli-learn:claude-opus-5@medium", "codex-cli:gpt-5.6-sol@medium"),
    null
  );
});

test("a turn-reset cross-model match never becomes a public model matchup", () => {
  assert.equal(
    publicPair("codex-cli-reset:gpt-5.6-sol@medium", "claude-cli:claude-opus-5@medium"),
    null
  );
});

test("a same-model harness ablation folds away from public matchups", () => {
  assert.equal(
    publicPair("codex-cli:gpt-5.6-sol@medium", "codex-cli-reset:gpt-5.6-sol@medium"),
    null
  );
});

test("arena-eligible matches keep publishing exactly as before", () => {
  // cross-model LLM vs LLM
  assert.ok(publicPair("claude-cli:claude-opus-5@medium", "codex-cli:gpt-5.6-sol@medium"));
  // LLM vs product CPU
  assert.ok(publicPair("codex-cli:gpt-5.6-sol@high", "product-cpu:cpu-v6:level_5"));
  // LLM vs opaque baseline
  assert.ok(publicPair("claude-cli:claude-fable-5@medium", "takeshi:d2"));
  // same model, different efforts: two contenders
  assert.ok(publicPair("codex-cli:gpt-5.6-sol@high", "codex-cli:gpt-5.6-sol@medium"));
});

test("fail-closed: every recognized harness outside the allowlist stays unpublished", () => {
  // Loops over the REAL lists: a future harness added to RECOGNIZED_HARNESSES
  // is automatically covered here with no second list to edit.
  const nonEligible = RECOGNIZED_HARNESSES.filter(
    (h) => !PUBLIC_MATCHUP_HARNESSES.includes(h)
  );
  assert.ok(nonEligible.length >= 2, "expected learn and reset at minimum");
  for (const harness of nonEligible) {
    const spec = `${harness}:some-model@medium`;
    assert.equal(isPublicMatchupEligible(spec), false, harness);
    assert.equal(
      publicPair(spec, "claude-cli:claude-opus-5@medium"),
      null,
      `${harness} cross-model match must not publish`
    );
    assert.equal(
      publicPair("claude-cli:claude-opus-5@medium", spec),
      null,
      `${harness} must be excluded from either side`
    );
  }
});

test("opaque specs stay eligible opponents; the allowlist is a subset of recognized", () => {
  assert.equal(isPublicMatchupEligible("takeshi:d2"), true);
  assert.equal(isPublicMatchupEligible("random"), true);
  for (const h of PUBLIC_MATCHUP_HARNESSES) {
    assert.ok(RECOGNIZED_HARNESSES.includes(h), `${h} must be recognized`);
  }
});

test("HARNESS_CONDITIONS covers every recognized LLM harness", () => {
  for (const h of LLM_HARNESSES) {
    assert.ok(HARNESS_CONDITIONS[h], `missing harness_conditions for ${h}`);
    assert.ok(HARNESS_CONDITIONS[h].context_lifetime.length > 0);
  }
});

// ---------------------------------------------------------------------------
// matchupKind derivation
// ---------------------------------------------------------------------------

test("matchupKind derives the three claim kinds from the same allowlist", () => {
  assert.equal(
    matchupKind("claude-cli:claude-opus-5@medium", "codex-cli:gpt-5.6-sol@medium"),
    "model-arena"
  );
  assert.equal(matchupKind("random", "takeshi:d2"), "model-arena");
  assert.equal(
    matchupKind("codex-cli:gpt-5.6-sol@medium", "codex-cli-reset:gpt-5.6-sol@medium"),
    "same-model-harness-ablation"
  );
  assert.equal(
    matchupKind("claude-cli-learn:claude-fable-5@low", "claude-cli:claude-fable-5@low"),
    "same-model-harness-ablation"
  );
  assert.equal(
    matchupKind("codex-cli-reset:gpt-5.6-sol@medium", "claude-cli:claude-opus-5@medium"),
    "cross-model-system"
  );
  // Same harness pair at different efforts is NOT a same-model ablation —
  // the identities differ, so it is an unresolvable system matchup when a
  // non-arena harness is involved.
  assert.equal(
    matchupKind("codex-cli-reset:gpt-5.6-sol@high", "codex-cli:gpt-5.6-sol@medium"),
    "cross-model-system"
  );
});

// ---------------------------------------------------------------------------
// codex-cli-reset spec and adapter contract
// ---------------------------------------------------------------------------

test("codex-cli-reset parses as its own harness and is runnable", () => {
  const parsed = parseAgentSpec("codex-cli-reset:gpt-5.6-sol@medium");
  assert.equal(parsed.harness, "codex-cli-reset");
  assert.equal(parsed.model, "gpt-5.6-sol");
  assert.equal(parsed.effort, "medium");
  assert.deepEqual(classifyRunnableAgentSpec("codex-cli-reset:gpt-5.6-sol@medium"), {
    kind: "codex-cli-reset",
    model: "gpt-5.6-sol",
    effort: "medium",
    latency: "measured",
  });
  // The plain persistent spec still parses as codex-cli.
  assert.equal(parseAgentSpec("codex-cli:gpt-5.6-sol@medium").harness, "codex-cli");
});

test("turn-reset never resumes and resends instructions every turn", () => {
  // Turn 1 and turn N behave identically under turn-reset…
  for (const started of [false, true]) {
    const plan = codexSessionPlan("turn-reset", started, "thread-123");
    assert.equal(plan.resumeThreadId, undefined);
    assert.equal(plan.includeInstructions, true);
  }
  // …while persistent keeps the existing lifecycle.
  assert.deepEqual(codexSessionPlan("persistent", false, ""), {
    resumeThreadId: undefined,
    includeInstructions: true,
  });
  assert.deepEqual(codexSessionPlan("persistent", true, "thread-123"), {
    resumeThreadId: "thread-123",
    includeInstructions: false,
  });

  // And the built argv carries no resume subcommand for a reset turn.
  const invocation = buildCodexInvocation({
    userText: "turn text",
    model: "gpt-5.6-sol",
    effortArgs: ["-c", 'model_reasoning_effort="medium"'],
    resumeThreadId: codexSessionPlan("turn-reset", true, "thread-123").resumeThreadId,
    ambientCwd: "/tmp/x",
  });
  assert.equal(invocation.argv[0], "exec");
  assert.ok(!invocation.argv.includes("resume"));
});
