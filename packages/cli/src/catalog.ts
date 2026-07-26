/**
 * Canonical catalog of PUBLISHED agent choices — the single owner of
 * "which providers, models, and efforts we advertise" (wizard menus, CLI
 * help, API model shorthands). It is a definition of published options,
 * NOT a restriction: makeAgent keeps accepting free-form spec strings
 * (takeshi:dN, custom models, future policies) unchanged.
 * docs/plans/2026-07-25-play-wizard.md.
 */

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

/** Stable public labels for exact headline identities. Unknown model ids are
 * deliberately displayed verbatim by the arena publisher. */
export const PUBLIC_HEADLINE_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(CLAUDE_MODELS.map((model) => [model.value, model.label])),
  ...Object.fromEntries(Array.from(
    { length: 6 },
    (_, index) => [`cpu-v6:level_${index + 1}`, `LaPlace CPU Lv${index + 1}`],
  )),
  "gpt-5.6-sol": "GPT-5.6 Sol",
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
  /** Published effort choices ("" = provider default, omitted from spec). */
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
    efforts: ["", "low", "medium", "high", "xhigh"],
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
    models: [{ value: "", label: "default (plan's default model)" }],
    allowCustomModel: true,
    efforts: ["", "low", "medium", "high"],
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
      envVars: ["LAPLACE_PRODUCT_REPO", "LAPLACE_PRODUCT_COMMIT"],
      note: "a pinned product checkout; the wizard will prompt if unset",
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
  "anthropic",
];

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
 * The identity a matchup headline is grouped by: the model as it was recorded,
 * with every harness folded together (a given model at a given effort is
 * expected to play the same whether it is driven through a subscription CLI or
 * the API). Opaque specs group by themselves.
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
  if (parsed.model === null || parsed.model === UNNAMED_MODEL) {
    // Group by harness so its efforts still fold together.
    return parsed.harness;
  }
  return parsed.model;
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
    const effort = p.efforts.length > 1 ? "[@effort]" : "";
    const sample = p.buildSpec(
      p.models[0].value,
      p.efforts.length > 1 ? "" : ""
    );
    void sample;
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
