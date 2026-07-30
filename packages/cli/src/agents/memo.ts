import * as fs from "node:fs";
import * as path from "node:path";
import type { TeamId } from "../types";

/**
 * Bounded-memo carryover contract for `codex-cli-memo`
 * (docs/plans/2026-07-31-bounded-memo-harness.md). This module is the single
 * owner of what the memo IS: the fixed format instructions, the cap, the
 * injection block, the extraction syntax, the non-compliance policy, and the
 * append-only JSONL artifact. The codex adapter only calls the hooks.
 *
 * Design intent: Run 9 measured that the persistent thread's cost is 95-96%
 * hidden reasoning growing with thread length (a re-derivation tax on an
 * unbounded, invisible carryover). The memo replaces that with a bounded,
 * PUBLIC carryover: the model's own capped note, recorded per adapter call,
 * so what carries between turns is observable and auditable for the first
 * time.
 */

export const MEMO_CHAR_CAP = 1500;
export const MEMO_HARNESS_REVISION = "memo-v1";

export const MEMO_SECTION_HEADERS = [
  "### Position read",
  "### Our plan",
  "### Opponent tendencies",
  "### Lessons",
] as const;

/**
 * The fixed memo rules handed to the model every turn. Seat-invariant wording
 * is a Run 7 lesson: seat-labeled notes broke under side swaps, so identity
 * words ("we", "the opponent") are required instead of team letters.
 */
export const MEMO_INSTRUCTIONS = `## Bounded strategy memo (your ONLY carryover)

You keep NO context between turns. The single thing carried to your next turn
is the memo you output now; everything else you think this turn is discarded.

After your move JSON and note, output your updated memo as a fenced block:

\`\`\`memo
${MEMO_SECTION_HEADERS[0]}
...
${MEMO_SECTION_HEADERS[1]}
...
${MEMO_SECTION_HEADERS[2]}
...
${MEMO_SECTION_HEADERS[3]}
...
\`\`\`

Memo rules:
- At most ${MEMO_CHAR_CAP} characters inside the block. A longer memo is
  discarded entirely and your previous memo is kept instead.
- Keep all four section headers, even when a section is a single line.
- Use seat-invariant language: say "we" and "the opponent" — never rely on
  team letters as identity.
- The memo is public and recorded. Write it for your future self: it is the
  only memory you will have.`;

export type MemoStatus = "updated" | "missing" | "over-cap-kept-previous";

/** Last ```memo fenced block in the reply, or null when absent. */
export function extractMemo(text: string): string | null {
  const matches = [...text.matchAll(/```memo[^\S\n]*\n([\s\S]*?)```/g)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1].trim();
}

/**
 * The non-compliance policy, mirroring the move-note policy (design-v0.1 §5):
 * a missing or over-cap memo never costs the turn — the previous memo is kept
 * and the outcome is recorded as a reliability observation.
 */
export function applyMemoReply(
  previous: string,
  reply: string
): { memo: string; status: MemoStatus } {
  const extracted = extractMemo(reply);
  if (extracted === null) return { memo: previous, status: "missing" };
  if (extracted.length > MEMO_CHAR_CAP) {
    return { memo: previous, status: "over-cap-kept-previous" };
  }
  return { memo: extracted, status: "updated" };
}

/** The injection block placed after the match instructions on every call. */
export function memoTurnPrelude(current: string): string {
  return [
    MEMO_INSTRUCTIONS,
    "",
    "## Your memo from last turn",
    current || "(no memo yet — this is your first turn; create the memo now)",
  ].join("\n");
}

interface MemoRecord {
  ply: number;
  attempt: number;
  status: MemoStatus;
  memo: string;
  revision: typeof MEMO_HARNESS_REVISION;
}

/**
 * One game-side's memo lifecycle. EVERY adapter call (repair attempts and
 * timeouts included) is one recorded transition — the memo advances on every
 * reply, is never referee-gated, and the JSONL is append-only so no attempt
 * overwrites another. Reset at startGame; artifacts land under
 * runDir/memo/<gameId>/<team>.jsonl (submission-compatible extension).
 */
export class MemoSession {
  private memo = "";
  private gameId = "";
  private team: TeamId | "" = "";

  constructor(private readonly runDir: string) {}

  startGame(team: TeamId, gameId: string): void {
    this.memo = "";
    this.team = team;
    this.gameId = gameId || "game";
  }

  prelude(): string {
    return memoTurnPrelude(this.memo);
  }

  /** Record one adapter-call transition and return its status. */
  record(replyText: string, ply: number, attempt: number): MemoStatus {
    const { memo, status } = applyMemoReply(this.memo, replyText);
    this.memo = memo;
    const dir = path.join(this.runDir, "memo", this.gameId);
    fs.mkdirSync(dir, { recursive: true });
    const record: MemoRecord = {
      ply,
      attempt,
      status,
      memo,
      revision: MEMO_HARNESS_REVISION,
    };
    fs.appendFileSync(
      path.join(dir, `${this.team}.jsonl`),
      JSON.stringify(record) + "\n"
    );
    return status;
  }
}
