import { headlineKey, isLlmSpec, parseAgentSpec, PUBLIC_MATCHUP_HARNESSES } from "./catalog";
import { isHeadline } from "./publicarena-contract";

export type HeadlineKind = "llm" | "product-cpu" | "baseline";
export type LatencyTelemetry = "measured" | "none";

export type RunnableAgentSpec =
  | { kind: "product-cpu"; policy: string; level: string; latency: "measured" }
  | { kind: "random" | "greedy" | "center-greedy" | "chaos" | "takeshi"; latency: "none"; parameter?: number }
  | { kind: "anthropic"; model: string; latency: "measured" }
  | { kind: "claude-cli-learn" | "claude-cli" | "codex-cli" | "codex-cli-reset" | "codex-cli-memo" | "codex-cli-memo-primed" | "codex-cli-notes" | "codex-cli-notes-guided"; model?: string; effort?: string; latency: "measured" };

export interface PublicPair {
  leftId: string;
  rightId: string;
  leftSide: "A" | "B";
  leftAgent: string;
  rightAgent: string;
}

/** Environment-independent ordinal comparison. */
export const ordinal = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Whether a spec may appear in a default public matchup at all. Opaque specs
 * (harness=null: random, takeshi:dN, …) stay eligible opponents; every
 * RECOGNIZED harness must be on the PUBLIC_MATCHUP_HARNESSES allowlist —
 * fail-closed, so a newly recognized harness (learning, turn-reset, or any
 * future condition) stays out of model-versus-model aggregates until it is
 * deliberately classified as arena-eligible.
 */
export function isPublicMatchupEligible(spec: string): boolean {
  const harness = parseAgentSpec(spec).harness;
  return harness === null || PUBLIC_MATCHUP_HARNESSES.includes(harness);
}

/**
 * The single publication rule shared by legacy standings and arena v1.
 * Baseline-only matches, matches carrying a non-arena-eligible harness on
 * either side, and matches whose two sides fold to one headline identity,
 * remain verified ledger data but are not default public matchups.
 *
 * The allowlist — not headline folding — is the aggregate boundary's source
 * of truth: folding only removes same-identity pairs, so without the
 * allowlist a harness-conditioned contender playing a different model would
 * publish as a model-versus-model record it is not
 * (docs/plans/2026-07-30-harness-lab-contract.md).
 *
 * Because the headline identity carries the effort, "one identity" means the
 * same model *at the same effort*: the same model at two different efforts is
 * a match between two contenders and is published.
 */
export function publicPair(specA: string, specB: string): PublicPair | null {
  const headlineA = headlineKey(specA);
  const headlineB = headlineKey(specB);
  if ((!isLlmSpec(specA) && !isLlmSpec(specB)) || headlineA === headlineB ||
      !isPublicMatchupEligible(specA) || !isPublicMatchupEligible(specB) ||
      !isHeadline(headlineA) || !isHeadline(headlineB)) {
    return null;
  }
  const aIsLeft = ordinal(headlineA, headlineB) < 0;
  return {
    leftId: aIsLeft ? headlineA : headlineB,
    rightId: aIsLeft ? headlineB : headlineA,
    leftSide: aIsLeft ? "A" : "B",
    leftAgent: aIsLeft ? specA : specB,
    rightAgent: aIsLeft ? specB : specA,
  };
}

export type MatchupKind =
  | "model-arena"
  | "same-model-harness-ablation"
  | "cross-model-system";

/**
 * The kind of claim a match can support, derived — never stored separately —
 * from the same allowlist and headline identity publicPair reads. A match
 * carrying a non-arena harness is a harness comparison when both sides are
 * the same model identity, and an unresolvable whole-system matchup when they
 * differ (docs/harness-lab-direction-ja.md §6).
 */
export function matchupKind(specA: string, specB: string): MatchupKind {
  if (isPublicMatchupEligible(specA) && isPublicMatchupEligible(specB)) {
    return "model-arena";
  }
  return headlineKey(specA) === headlineKey(specB)
    ? "same-model-harness-ablation"
    : "cross-model-system";
}

export function headlineKind(agent: string): HeadlineKind {
  if (isLlmSpec(agent)) return "llm";
  return parseAgentSpec(agent).harness === "product-cpu"
    ? "product-cpu"
    : "baseline";
}

function modelEffort(value: string | undefined): { model?: string; effort?: string } {
  if (!value) return {};
  const at = value.lastIndexOf("@");
  if (at === -1) return { model: value };
  const model = value.slice(0, at);
  const effort = value.slice(at + 1);
  return { ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
}

/** Exact accepted-spec registry shared by the CLI factory and publisher. */
export function classifyRunnableAgentSpec(spec: string): RunnableAgentSpec | null {
  const product = spec.match(/^product-cpu:([a-z0-9-]+):(level_\d+)$/);
  if (product) return { kind: "product-cpu", policy: product[1], level: product[2], latency: "measured" };
  if (spec === "random" || spec === "greedy" || spec === "chaos" || spec === "takeshi") {
    return { kind: spec, latency: "none" };
  }
  if (spec === "center-greedy") return { kind: "center-greedy", latency: "none" };
  const center = spec.match(/^center-greedy:w(\d+)$/);
  if (center) return { kind: "center-greedy", parameter: Number(center[1]), latency: "none" };
  const takeshi = spec.match(/^takeshi:d(\d+)$/);
  if (takeshi) return { kind: "takeshi", parameter: Number(takeshi[1]), latency: "none" };
  const anthropic = spec.match(/^anthropic:(.+)$/);
  if (anthropic) return { kind: "anthropic", model: anthropic[1], latency: "measured" };
  // Order matters: longer prefixes first, so codex-cli-reset never parses as
  // codex-cli with a model of "-reset...", codex-cli-notes-guided never
  // parses as codex-cli-notes with a model of "-guided...", and
  // codex-cli-memo-primed never parses as codex-cli-memo with "-primed...".
  for (const kind of ["claude-cli-learn", "claude-cli", "codex-cli-reset", "codex-cli-memo-primed", "codex-cli-memo", "codex-cli-notes-guided", "codex-cli-notes", "codex-cli"] as const) {
    const match = spec.match(new RegExp(`^${kind}(?::(.+))?$`));
    if (match) return { kind, ...modelEffort(match[1]), latency: "measured" };
  }
  return null;
}

/**
 * Whether the accepted adapter family records wall-clock response latency.
 * This deliberately shares the public identity classifier: every current LLM
 * and product-CPU adapter measures each reply, while in-process baselines do
 * not. Unknown specs already fail at the CLI factory/public identity boundary.
 */
export function reportsLatency(agent: string): boolean | null {
  return classifyRunnableAgentSpec(agent)?.latency === "measured"
    ? true
    : classifyRunnableAgentSpec(agent)?.latency === "none"
      ? false
      : null;
}
