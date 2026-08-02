import { recordedNote } from "../prompt";
import type { RecentEvent, TeamId } from "../types";

/**
 * Append-only public note carryover for `codex-cli-notes`
 * (docs/plans/2026-08-02-notes-carry.md). This module is the single owner of
 * what the carryover IS: the announcement, the injection shape, and the
 * lifecycle that decides which notes survive. The codex adapter only calls
 * the hooks.
 *
 * Design intent: this is the third arm of "carry privately (persistent) vs
 * carry PUBLICLY (notes) vs carry nothing (reset)". It moves only output the
 * arena already produces on every turn — the p3 move note — so the carryover
 * is, by construction, identical to what the spectator record publishes
 * (both sides call prompt.ts recordedNote).
 *
 * Two properties are load-bearing and deliberate:
 *
 * 1. NO shape is ever suggested to the model. The contrast against
 *    `codex-cli-memo` is exactly "raw accumulation vs designed memory", so a
 *    single hint about how to write the note would collapse the axis. The
 *    announcement is drift-guarded by an explicit denylist in
 *    test/notes-carry.test.ts.
 * 2. Only notes from ADOPTED moves are carried. The runner records the full
 *    note of an adopted move, but a format-failed attempt keeps only a raw
 *    prefix and a legality-failed attempt keeps no raw at all — carrying a
 *    rejected attempt would both break the equality with the public record
 *    and feed the model's future self a note about a move it never made.
 *
 * VARIANTS (docs/plans/2026-08-02-notes-guided.md). The mechanism above is the
 * whole harness; the only thing a variant may change is the ANNOUNCEMENT text.
 * `NOTES_V1` says nothing about what to write; `NOTES_GUIDED` adds one sentence
 * of CONTENT direction (this move's purpose, and what the next turn's self will
 * need) and nothing else. Because the announcement is the only difference,
 * "guided vs v1" measures the pure effect of the instruction — so stage(),
 * resolve(), the recordedNote equality and the whole lifecycle must stay free
 * of any branch on the variant, and both denylists stay identical.
 */

/**
 * The immutable configuration of one notes variant. Everything that varies
 * lives here, which is what keeps the mechanism single-implementation.
 */
export interface NotesVariant {
  /** The announcement injected on every turn, above the past notes. */
  readonly announcement: string;
  /** The declared harness revision recorded with the condition. */
  readonly revision: string;
  /** The spec prefix this variant is reachable as. */
  readonly specHead: string;
}

/**
 * The carryover announcement of the original (unguided) notes harness.
 *
 * Every word here is under the denylist guard: it may tell the model WHAT the
 * block is and WHO the note is for, and nothing about how to write it.
 */
const V1_ANNOUNCEMENT = `## Your notes from your own past moves (your ONLY memory)

You keep nothing between turns. Each note you wrote after one of your own past
moves in this game appears below, and it is all that remains of what you were
thinking then.

The note you write this turn will be carried to your future self the same way,
and it is the only memory your future self is given. Write it for that future
self — whatever you would want to have when you come back to this game
remembering none of it.`;

/**
 * The guided announcement: v1 verbatim plus ONE added sentence.
 *
 * The added sentence directs CONTENT (why this move, what the next turn's self
 * needs) and deliberately not shape — it names no writing form, and it names no
 * LAPLACE tactic either, because a hint about the game itself would make the
 * arm a strategy injection rather than a memory-instruction ablation. It is
 * guarded by the same token denylist as v1 in test/notes-guided.test.ts.
 */
const GUIDED_ANNOUNCEMENT =
  `${V1_ANNOUNCEMENT} State the purpose behind the move you are making now,
and what the you of the next turn will need to know.`;

/** The unguided original: no direction about the note's content at all. */
export const NOTES_V1: NotesVariant = {
  announcement: V1_ANNOUNCEMENT,
  revision: "notes-v1",
  specHead: "codex-cli-notes",
};

/** Same mechanism, same framing, plus purpose-and-handoff content direction. */
export const NOTES_GUIDED: NotesVariant = {
  announcement: GUIDED_ANNOUNCEMENT,
  revision: "notes-guided-v1",
  specHead: "codex-cli-notes-guided",
};

/** Backward-compatible aliases for v1's fields (pre-variant call sites). */
export const NOTES_HARNESS_REVISION = NOTES_V1.revision;
export const NOTES_ANNOUNCEMENT = NOTES_V1.announcement;

/** One carried note, keyed by the ply of the move it was written for. */
export interface NoteEntry {
  ply: number;
  note: string;
}

/**
 * The injection block placed after the match instructions on every call. The
 * variant supplies the announcement and nothing else: the body below is
 * identical for every variant, so the injected block differs by exactly the
 * announcement text.
 */
export function notesTurnPrelude(
  entries: readonly NoteEntry[],
  variant: NotesVariant = NOTES_V1
): string {
  const body =
    entries.length === 0
      ? "(nothing yet — this is your first move of the game)"
      : entries.map((e) => `[ply ${e.ply}]\n${e.note}`).join("\n\n");
  return [variant.announcement, "", body].join("\n");
}

/**
 * One game-side's note journal: append-only, uncapped in count, and gated by
 * the referee rather than by the adapter's own guess about what happened.
 *
 * Each adapter call stages its note under the ply it was written for. The
 * next call resolves that stage against `TurnInput.recent`, which carries
 * every event since this side's previous turn. Ply numbers are unique across
 * a game (the runner emits exactly one move-or-pass event per ply), so the
 * staged ply appears in `recent` exactly once and identifies this side's own
 * outcome for that turn without any inference:
 *
 * - a `move` event at that ply means the referee adopted it → commit;
 * - a `pass` event at that ply means the turn was lost (both attempts failed,
 *   or a timeout, or a budget/legal-move skip) → discard;
 * - absent means the turn is still open (a repair attempt re-enters act()
 *   with the same `recent`) → leave it staged for the retry to replace.
 *
 * The last staged note of a game is never resolved, but there is no turn left
 * to inject it into, so it simply falls away.
 */
export class NotesSession {
  private committed: NoteEntry[] = [];
  private pending: NoteEntry | null = null;

  /**
   * The variant this journal announces itself with. It is read (never branched
   * on) by the codex adapter for the spec head, and it is the ONLY thing that
   * distinguishes one notes harness from another.
   */
  constructor(readonly variant: NotesVariant = NOTES_V1) {}

  /**
   * Reset for a new game. The team/gameId identity MemoSession needs for its
   * artifact path is accepted for hook symmetry but not stored: notes write
   * no artifact of their own, because what they carry is already published
   * verbatim as the move events' `note` field.
   */
  startGame(_team: TeamId, _gameId: string): void {
    this.committed = [];
    this.pending = null;
  }

  /** Decide the fate of the staged note from this side's previous turn. */
  resolve(recent: readonly RecentEvent[]): void {
    const pending = this.pending;
    if (!pending) return;
    const outcome = recent.find((e) => e.ply === pending.ply);
    if (!outcome) return;
    // An adopted move with an empty note is a real (recorded) omission, not
    // something to carry: injecting a blank entry would only tell the future
    // self that a turn happened.
    if (outcome.action === "move" && pending.note) this.committed.push(pending);
    this.pending = null;
  }

  /** The injected block and the number of notes it carries. */
  prelude(): { text: string; count: number } {
    return {
      text: notesTurnPrelude(this.committed, this.variant),
      count: this.committed.length,
    };
  }

  /**
   * Stage this reply's note for `ply`, ALWAYS replacing whatever was staged
   * before — including with an empty note. The replacement is what keeps a
   * rejected attempt's note from surviving: when attempt 1 wrote a note and
   * the adopted attempt 2 wrote none, the empty stage overwrites the rejected
   * text and resolve() then commits nothing.
   *
   * Timeout and CLI-error replies pass through here too. Their raw carries no
   * note, and their ply resolves as a pass regardless.
   */
  stage(replyRaw: string, ply: number): void {
    this.pending = { ply, note: recordedNote(replyRaw) };
  }
}
