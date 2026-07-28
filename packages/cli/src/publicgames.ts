import { headlineKey, isLlmSpec, parseAgentSpec } from "./catalog";
import { isHeadline } from "./publicarena-contract";

export type HeadlineKind = "llm" | "product-cpu" | "baseline";
export type LatencyTelemetry = "measured" | "none";

export type RunnableAgentSpec =
  | { kind: "product-cpu"; policy: string; level: string; latency: "measured" }
  | { kind: "random" | "greedy" | "center-greedy" | "chaos" | "takeshi"; latency: "none"; parameter?: number }
  | { kind: "anthropic"; model: string; latency: "measured" }
  | { kind: "claude-cli-learn" | "claude-cli" | "codex-cli"; model?: string; effort?: string; latency: "measured" };

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
 * The single publication rule shared by legacy standings and arena v1.
 * Baseline-only matches, and matches whose two sides fold to one headline
 * identity, remain verified ledger data but are not default public matchups.
 *
 * Because the headline identity carries the effort, "one identity" means the
 * same model *at the same effort*: a learning-harness match against the same
 * model and effort still folds away, while the same model at two different
 * efforts is a match between two contenders and is published.
 */
export function publicPair(specA: string, specB: string): PublicPair | null {
  const headlineA = headlineKey(specA);
  const headlineB = headlineKey(specB);
  if ((!isLlmSpec(specA) && !isLlmSpec(specB)) || headlineA === headlineB ||
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
  for (const kind of ["claude-cli-learn", "claude-cli", "codex-cli"] as const) {
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
