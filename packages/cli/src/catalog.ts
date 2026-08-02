/**
 * Canonical catalog of PUBLISHED agent choices — the single owner of
 * "which providers, models, and efforts we advertise" (wizard menus, CLI
 * help, API model shorthands). It is a definition of published options,
 * NOT a restriction: makeAgent keeps accepting free-form spec strings
 * (takeshi:dN, custom models, future policies) unchanged.
 * docs/plans/2026-07-25-play-wizard.md.
 */

import { MAX_PARTICIPANT_LABEL } from "./publicarena-contract";

/**
 * Typing conveniences for the Anthropic API track only: `anthropic:opus`
 * resolves to a full id before the call, and the run records the resolved id.
 *
 * This is NOT model identity. A shorthand names whichever generation it points
 * at today, so it cannot be what a published record is grouped by — the menus
 * below deliberately offer full ids, and `headlineKey` reads the recorded
 * string as-is. That keeps a name in a published record meaning one model
 * forever, and lets an alias be repointed at a new generation without rewriting
 * history.
 */
export const MODEL_SHORTHAND: Record<string, string> = {
  opus: "claude-opus-5",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5",
  fable: "claude-fable-5",
};

/**
 * Models offered in the menus, newest first. Values are full ids so that every
 * spec a menu can produce names exactly one model — `opus` could be any
 * generation, `claude-opus-5` cannot.
 *
 * A newly released model needs a line here to appear in the menu, and nothing
 * else: it is usable the day it ships by typing its id, because every LLM
 * provider accepts a free-form model.
 */
export const CLAUDE_MODELS: { value: string; label: string }[] = [
  { value: "claude-opus-5", label: "Opus 5" },
  { value: "claude-opus-4-8", label: "Opus 4.8" },
  { value: "claude-sonnet-5", label: "Sonnet 5" },
  { value: "claude-fable-5", label: "Fable 5" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
];

/** Current model ids exposed by the Codex CLI. Keep full ids in recorded specs;
 * the custom entry remains available when the CLI adds a model between releases. */
export const CODEX_MODELS: { value: string; label: string }[] = [
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" },
];

/** Stable public labels for exact headline identities. Unknown model ids are
 * deliberately displayed verbatim by the arena publisher. */
export const PUBLIC_HEADLINE_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(CLAUDE_MODELS.map((model) => [model.value, model.label])),
  ...Object.fromEntries(CODEX_MODELS.map((model) => [model.value, model.label])),
  ...Object.fromEntries(Array.from(
    { length: 6 },
    (_, index) => [`cpu-v6:level_${index + 1}`, `LaPlace CPU Lv${index + 1}`],
  )),
  "codex-cli": "Codex CLI (model not recorded)",
};

/** Product policy generation the wizard offers. Bump here when the product
 * ships a new policy; the bridge hello check stays fail-closed at runtime. */
export const PRODUCT_CPU_POLICY = "cpu-v6";

export type ProviderKey =
  | "claude-cli"
  | "codex-cli"
  | "anthropic"
  | "product-cpu"
  | "baseline";

export interface ProviderEntry {
  key: ProviderKey;
  label: string;
  /** Published model choices shown in the menu. */
  models: { value: string; label: string }[];
  /** Whether a free-form model can be typed in. */
  allowCustomModel: boolean;
  /** Published, explicit effort choices. Empty/unrecorded remains parseable but is not selectable. */
  efforts: string[];
  /** Compose the spec string for a selection. */
  buildSpec(model: string, effort: string): string;
  /** What the auth check needs: commands that must exist, env vars, notes. */
  auth: {
    commands: string[];
    envVars: string[];
    note?: string;
  };
}

export const PROVIDERS: ProviderEntry[] = [
  {
    key: "claude-cli",
    label: "Claude (subscription / claude CLI)",
    models: CLAUDE_MODELS,
    allowCustomModel: true,
    efforts: ["low", "medium", "high", "xhigh"],
    buildSpec: (model, effort) =>
      `claude-cli:${model}${effort ? `@${effort}` : ""}`,
    auth: {
      commands: ["claude"],
      envVars: [],
      note: "presence/version only — login state surfaces as an in-game CLI error if missing",
    },
  },
  {
    key: "codex-cli",
    label: "Codex (ChatGPT subscription / codex CLI)",
    models: CODEX_MODELS,
    allowCustomModel: true,
    efforts: ["low", "medium", "high"],
    buildSpec: (model, effort) =>
      `codex-cli${model ? `:${model}` : effort ? ":" : ""}${effort ? `@${effort}` : ""}`,
    auth: {
      commands: ["codex"],
      envVars: [],
      note: "presence/version only — login state surfaces as an in-game CLI error if missing",
    },
  },
  {
    key: "anthropic",
    label: "Anthropic API (API key)",
    models: CLAUDE_MODELS,
    allowCustomModel: true,
    efforts: [],
    buildSpec: (model) => `anthropic:${model}`,
    auth: { commands: [], envVars: ["ANTHROPIC_API_KEY"] },
  },
  {
    key: "product-cpu",
    label: `LaPlace CPU (${PRODUCT_CPU_POLICY}, Lv1-6)`,
    models: [
      { value: "level_1", label: "Lv1 (weakest, local p95 <= 0.25s/move)" },
      { value: "level_2", label: "Lv2 (local p95 <= 0.25s/move)" },
      { value: "level_3", label: "Lv3 (default, local p95 <= 0.50s/move)" },
      { value: "level_4", label: "Lv4 (local p95 <= 1.20s/move)" },
      { value: "level_5", label: "Lv5 (local p95 <= 1.80s/move)" },
      { value: "level_6", label: "Lv6 (strongest; local p95 <= 10s, hosted can be slower)" },
    ],
    allowCustomModel: false,
    efforts: [],
    buildSpec: (model) => `product-cpu:${PRODUCT_CPU_POLICY}:${model}`,
    auth: {
      commands: [],
      envVars: [],
      note: "bundled in this package; Python 3.11+ is checked before the run starts",
    },
  },
  {
    key: "baseline",
    label: "Baseline (no AI cost)",
    models: [
      { value: "random", label: "random (uniform legal moves)" },
      { value: "greedy", label: "greedy (captures first)" },
    ],
    allowCustomModel: false,
    efforts: [],
    buildSpec: (model) => model,
    auth: { commands: [], envVars: [] },
  },
];

/**
 * Harnesses whose spec strings this repo knows how to decompose. Membership —
 * NOT the shape of the string — decides whether a spec is parsed: `takeshi:d2`
 * looks exactly like `claude-cli:opus` but is not ours to interpret, so it stays
 * an opaque raw identity. Adding an entry here is the only way to make a new
 * harness parseable (docs/plans/2026-07-25-community-lane-v2.md).
 *
 * `claude-cli-learn` is deliberately included even though it is not a PROVIDERS
 * key: the learning harness is reachable as a free-form spec and appears in real
 * runs, and it folds into the same model headline as every other harness.
 */
export const RECOGNIZED_HARNESSES: readonly string[] = [
  "claude-cli",
  "claude-cli-learn",
  "codex-cli",
  "codex-cli-reset",
  "codex-cli-memo",
  "codex-cli-notes",
  "anthropic",
  "product-cpu",
];

/**
 * Harnesses that drive an actual language model. Used to keep baseline-only and
 * product-CPU-only games out of the public matchup list. These are SPEC
 * PREFIXES — `anthropic-api` is a usage-accounting source label (agents/llm.ts),
 * never a spec prefix, and must not appear here.
 */
export const LLM_HARNESSES: readonly string[] = [
  "claude-cli",
  "claude-cli-learn",
  "codex-cli",
  "codex-cli-reset",
  "codex-cli-memo",
  "codex-cli-notes",
  "anthropic",
];

/**
 * The POSITIVE classification of harnesses whose games may enter the default
 * public matchups — the code form of the Model Arena aggregate boundary
 * (docs/plans/2026-07-30-harness-lab-contract.md). Headline folding is NOT the
 * boundary's source of truth: it only removes same-identity pairs, so a
 * harness-conditioned contender playing a DIFFERENT model (say
 * `claude-cli-learn:claude-opus-5` vs `codex-cli:gpt-5.6-sol`) would otherwise
 * publish as a model-versus-model record it is not.
 *
 * Membership is fail-closed: a harness added to RECOGNIZED_HARNESSES stays out
 * of public matchups until it is deliberately added here. Opaque specs
 * (random, takeshi:dN, …) parse to harness=null and remain eligible opponents;
 * product-cpu is listed because the published ledger already carries its
 * matches as legitimate opponents.
 */
export const PUBLIC_MATCHUP_HARNESSES: readonly string[] = [
  "claude-cli",
  "codex-cli",
  "anthropic",
  "product-cpu",
];

export interface HarnessConditions {
  /** How long one side's private context lives. */
  context_lifetime: string;
  /** What happens to provider reasoning across the side's own turns. */
  reasoning_retention: string;
  /** Long-context handling policy. */
  compaction: string;
  /** The mechanism that implements the lifetime. */
  mechanism: string;
}

/**
 * The declared context contract of every recognized LLM harness, recorded per
 * side into run.json. These are DECLARATIONS about the adapter mechanism;
 * provider internals we cannot observe are written as provider-managed
 * (opaque), never as verified facts.
 */
export const HARNESS_CONDITIONS: Readonly<Record<string, HarnessConditions>> = {
  "claude-cli": {
    context_lifetime: "persistent-session (whole game)",
    reasoning_retention: "provider-managed (opaque)",
    compaction: "provider-managed (opaque)",
    mechanism: "claude --session-id / --resume",
  },
  "claude-cli-learn": {
    context_lifetime:
      "persistent-session (whole game) + cross-game learning lifecycle (strategy document rewritten after each game)",
    reasoning_retention: "provider-managed (opaque)",
    compaction: "provider-managed (opaque)",
    mechanism: "claude --session-id / --resume + post-game analysis session",
  },
  "codex-cli": {
    context_lifetime: "persistent-thread (whole game)",
    reasoning_retention: "provider-managed (opaque)",
    compaction: "provider-managed (opaque)",
    mechanism: "codex exec / codex exec resume <thread>",
  },
  "codex-cli-reset": {
    context_lifetime: "turn-reset (fresh context every turn)",
    reasoning_retention: "discarded every turn (nothing carries over)",
    compaction: "n/a (no long-lived context to compact)",
    mechanism:
      "fresh codex exec per turn; rulebook + full-state observation resent every turn; clean-room execution required (ambient refused — a reused cwd with tools would be an undeclared carryover channel)",
  },
  "codex-cli-memo": {
    context_lifetime: "turn-scoped + bounded public memo carryover",
    reasoning_retention:
      "discarded every turn; the only carryover is a public, capped memo the model rewrites each turn",
    compaction: "n/a (context never grows; the memo cap is the bound)",
    mechanism:
      "fresh codex exec per turn; harness-injected memo (memo-v1, 1500-char cap) recorded per adapter call to memo/<gameId>/<team>.jsonl; clean-room execution required (ambient refused — the memo must be the ONLY carryover)",
  },
  "codex-cli-notes": {
    context_lifetime: "turn-scoped + append-only public move-note carryover",
    reasoning_retention:
      "discarded except own past move notes (public, uncapped count, 2500 chars/note = spectator-record equality)",
    compaction: "n/a",
    mechanism:
      "fresh codex exec per turn; harness-injected journal (notes-v1) of this side's own ADOPTED move notes, each the same value the events log publishes (prompt.ts recordedNote); clean-room execution required (ambient refused — the notes must be the ONLY carryover)",
  },
  anthropic: {
    context_lifetime: "persistent client-managed transcript (whole game)",
    reasoning_retention:
      "returned assistant content including thinking blocks is replayed verbatim; provider-internal reasoning state is opaque",
    compaction: "none implemented adapter-side (prompt caching is not compaction)",
    mechanism: "append-only messages array resent on every API call",
  },
};

export interface ParsedAgentSpec {
  /** Recognized harness, or null when the spec is opaque to us. */
  harness: string | null;
  /**
   * Model identity within the harness, or null when the harness runs its own
   * default. For product-cpu this keeps the policy generation attached
   * (`cpu-v4:level_5`) so a future cpu-v5 is a different identity, never a
   * silent redefinition of the same one.
   */
  model: string | null;
  effort: string | null;
  raw: string;
}

/**
 * Decompose an agent spec into {harness, model, effort}, mirroring the
 * `buildSpec` grammar above. Unrecognized harnesses fall back to raw identity
 * rather than being guessed at, so `random`, `center-greedy` and `takeshi:d2`
 * all stay whole.
 */
export function parseAgentSpec(spec: string): ParsedAgentSpec {
  const at = spec.lastIndexOf("@");
  const head = at >= 0 ? spec.slice(0, at) : spec;
  const effort = at >= 0 ? spec.slice(at + 1) : "";
  const colon = head.indexOf(":");
  const harness = colon >= 0 ? head.slice(0, colon) : head;
  if (!RECOGNIZED_HARNESSES.includes(harness)) {
    return { harness: null, model: null, effort: null, raw: spec };
  }
  // `codex-cli:@medium` carries an empty model segment — the plan's default
  // model, not a model literally named "".
  const model = colon >= 0 ? head.slice(colon + 1) : "";
  return {
    harness,
    model: model || null,
    effort: effort || null,
    raw: spec,
  };
}

/**
 * A harness running its own unnamed model. The Codex agent writes this
 * literally when the player takes their plan's default model, and "default" is
 * not a model identity — two harnesses could each claim it — so these group
 * under the harness instead.
 *
 * This costs real information: the run does not record which model the plan
 * actually served, so a headline of `codex-cli` can cover more than one model
 * over time. Naming it anyway would be worse — the honest label for an
 * unrecorded model is the harness that ran it. Recording the resolved model at
 * match time is the fix, and it belongs to the harness work, not here.
 */
const UNNAMED_MODEL = "default";

/**
 * The identity a matchup headline is grouped by: the model as it was recorded
 * plus the recorded effort, with every harness folded together (the same model
 * at the same effort is expected to play the same whether it is driven through
 * a subscription CLI or the API). Opaque specs group by themselves.
 *
 * Effort belongs to the identity because it is part of what played. The same
 * model at `high` and at `low` are different contenders, and folding them into
 * one headline would claim a result the games do not support.
 *
 * Effort is appended only when the spec recorded one, so no "unknown" token
 * ever enters an identity: a harness with no effort axis (`product-cpu`) keeps
 * exactly the identity it had before, and an effort-less LLM spec separates
 * from its effort-bearing siblings on its own.
 *
 * The recorded string is taken literally — no alias table is consulted. A
 * published record must keep meaning the same model forever, and resolving
 * `opus` at publish time would move past matchups onto whichever generation
 * that alias points at today. The menus emit full ids so the folding still
 * works; a spec that names a model ambiguously simply groups under the
 * ambiguous name, which is the honest reading of it.
 */
export function headlineKey(spec: string): string {
  const parsed = parseAgentSpec(spec);
  if (parsed.harness === null) return parsed.raw;
  // An unnamed model is not a model identity, so the harness carries the
  // headline — but its efforts separate, exactly as a named model's do.
  const base = parsed.model === null || parsed.model === UNNAMED_MODEL
    ? parsed.harness
    : parsed.model;
  return parsed.effort ? `${base}@${parsed.effort}` : base;
}

/**
 * The public label for the headline `spec` groups under. Composed rather than
 * tabulated: with effort in the identity a table keyed by the exact identity
 * would need one row per model *times* effort, and every new effort would
 * silently fall back to a raw id. `PUBLIC_HEADLINE_LABELS` therefore stays
 * keyed by the model part alone.
 *
 * Two specs that fold to one identity must produce one label — the arena
 * rejects conflicting participant metadata — so this reads the same parsed
 * fields `headlineKey` does and never re-splits the assembled id (an opaque
 * spec may itself contain `@`, which is not an effort).
 *
 * An LLM headline with no recorded effort says so: the arena must not present
 * an unrecorded condition as though it were a known one.
 *
 * A composed label can be longer than the identity it describes, and the
 * product rejects the whole catalog over an oversized label
 * (MAX_PARTICIPANT_LABEL). For the degenerate near-limit names where that
 * would happen, the identity itself becomes the label: every grammar-valid
 * identity stays publishable, and the failure mode is a plainer label rather
 * than an arena that publishes and then renders as nothing.
 */
export function headlineLabel(spec: string, isLlm: boolean): string {
  const parsed = parseAgentSpec(spec);
  if (parsed.harness === null) return parsed.raw;
  const base = parsed.model === null || parsed.model === UNNAMED_MODEL
    ? parsed.harness
    : parsed.model;
  const baseline = PROVIDERS.find((provider) => provider.key === "baseline")
    ?.models.find((model) => model.value === base);
  const name = PUBLIC_HEADLINE_LABELS[base] ?? baseline?.label.split(" (")[0] ?? base;
  const composed = parsed.effort
    ? `${name} (${parsed.effort})`
    : isLlm
      ? `${name} (effort not recorded)`
      : name;
  return Array.from(composed).length > MAX_PARTICIPANT_LABEL
    ? headlineKey(spec)
    : composed;
}

/** Whether this spec drives a language model (see LLM_HARNESSES). */
export function isLlmSpec(spec: string): boolean {
  const parsed = parseAgentSpec(spec);
  return parsed.harness !== null && LLM_HARNESSES.includes(parsed.harness);
}

/** CLI-help agent-specs lines, generated so help can never drift from the
 * catalog. Free-form specs stay allowed; takeshi:dN etc. remain usable via
 * spec strings even though the wizard does not list them. */
export function usageAgentSpecsLine(): string {
  const published = PROVIDERS.map((p) => {
    const models = p.models.map((m) => m.value || "default").join("/");
    const effort = p.efforts.length > 0 ? `@<${p.efforts.join("|")}>` : "";
    switch (p.key) {
      case "claude-cli":
        return `claude-cli:<${models}|model>${effort}`;
      case "codex-cli":
        return `codex-cli[:<model>]${effort}`;
      case "anthropic":
        return `anthropic:<${models}|model-id>`;
      case "product-cpu":
        return `product-cpu:${PRODUCT_CPU_POLICY}:<level_1..6>`;
      case "baseline":
        return models;
    }
  }).join(" | ");
  return (
    `agent specs (published): ${published}\n` +
    `  other specs remain accepted as free-form strings (e.g. takeshi:dN, center-greedy, chaos, custom model ids)`
  );
}
