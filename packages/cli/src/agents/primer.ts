/**
 * The operator-authored strategy primer for `codex-cli-memo-primed`
 * (docs/plans/2026-08-03-memo-primed.md — the plan carries the reviewed
 * full text; this constant IS the frozen artifact). The primer is fixed
 * public knowledge injected on every call: written game understanding (H1),
 * never computed assistance (H3). Changing one byte of this text is a new
 * primer revision and a new experiment condition.
 *
 * Length contract: <= 2000 chars (guard-tested; 2500 is the absolute cap
 * adjudicated in the direction dialogue).
 */
export const PRIMER_REVISION = "primer-v1";

export const PRIMER_TEXT = `## Strategy primer (fixed harness guidance)

Priority order for choosing a move:
1. Win now: complete the four center squares, or the capture that
   eliminates the opponent's second color.
2. Stop the opponent's immediate win (center or elimination).
3. Leave nothing capturable. Captures trigger ONLY from the mover's
   landing square: entering a sandwich is safe, being left in one is
   not. For each exposed piece, scan its rook lines: if one end is
   flanked by an opponent color and a NORMAL piece of that SAME color
   can land on the other end before this piece moves again, the whole
   line dies (two of yours on it = double capture). Also check
   enclosure: a group adjacent to the mover's landing square with no
   empty neighbor square is captured whole, anywhere on the board.
4. Prefer multi-captures: a color dies at 3 losses, so a double
   capture can jump 1 -> 3. Aim at the opponent color with more
   losses; protect your color at 2 losses first.
5. Contest the center: winners capture intruders rather than
   blockade. A center piece that can be flanked will be cleared —
   keep support nearby.
6. Then: mobility and position.

Turn order is Red -> Blue -> Yellow -> Green (a color with no pieces
is skipped). Before this color acts again, normally both opponent
colors move and your other color once — list their most dangerous
replies and check your move against them.

Play your two colors as one army. Sandwich flanks must be the SAME
color: build capture geometry with pairs of one color; use the other
to block lanes, hold center, and stage attacks. Friendly
fire: teammate-color pieces inside a line you trigger are captured
and count as its losses.

Voids never capture but still move, and DO count for center
victory. Yours serve as far flanks and enclosure walls. Capturing
opponent Voids wins space, not elimination progress — prefer their
normal pieces.

Efficiency: do not re-derive the history. Trust your memo's plan;
verify only what changed.`;
