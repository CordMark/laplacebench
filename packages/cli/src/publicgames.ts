import { headlineKey, isLlmSpec, parseAgentSpec } from "./catalog";
import { isHeadline } from "./publicarena-contract";

export type HeadlineKind = "llm" | "product-cpu" | "baseline";

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
