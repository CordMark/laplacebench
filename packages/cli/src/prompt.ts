import * as fs from "node:fs";
import * as path from "node:path";
import { observation } from "./engine";
import {
  COMMENTARY_URI_SOURCE,
  MAX_COMMENTARY_SCALARS,
} from "./publicarena-contract";
import type { Move, TeamId, TurnInput } from "./types";

/**
 * Prompt generation label. Canonical-run comparisons are valid only within
 * one generation (same discipline as the regret oracle generation).
 * p2: token-budget disclosure added (docs/plans/2026-07-24-token-budget.md).
 * p3: the move note became required rather than optional
 * (docs/plans/2026-07-27-bench-thinking-channel.md).
 */
export const PROMPT_REV = "p3-move-note";

const RULEBOOK = fs.readFileSync(
  path.join(__dirname, "..", "rulebook", "laplace-8x8-v1.md"),
  "utf8"
);

/**
 * The full instructions given to a model at game start. Used as the system
 * prompt by the API adapter and as the first user-message preamble by the
 * subscription-CLI adapters, so all three tracks see identical rules text.
 */
export function buildInstructions(
  team: TeamId,
  opts?: { outputTokenBudget?: number }
): string {
  const colors = team === "A" ? "Red and Yellow" : "Blue and Green";
  const enemy = team === "A" ? "Blue and Green" : "Red and Yellow";
  const budgetLine = opts?.outputTokenBudget
    ? `\n- Your team has a total output-token budget of ${opts.outputTokenBudget} for the whole game (thinking included). When it is exhausted, your remaining turns are passed automatically — budget your thinking.`
    : "";
  return `You are playing the board game LAPLACE as Team ${team}, controlling BOTH the ${colors} colors for the entire game. Your opponent controls ${enemy}. The complete rulebook follows; it is the only rules authority.

${RULEBOOK}

## How this match is played

- This conversation persists for the whole game. Each of your turns arrives as a message containing an observation JSON with: the current ply, which color is acting now, the board, per-color loss counts, eliminated colors, and every event since your previous turn (opponent moves, captures, passes).
- Board encoding: an array of 8 strings, row 0 (top) first. "." = empty, R/B/Y/G = normal Red/Blue/Yellow/Green pieces, lowercase r/b/y/g = Void pieces. Column 0 is the leftmost character.
- You are NOT given a list of legal moves. You must derive legality from the rules yourself.
- Reply with your chosen move as a JSON object, exactly one move for the acting color:

  {"move": {"from": {"row": R, "col": C}, "to": {"row": R, "col": C}}}

- **Every reply must begin with a move note**: in your own words, why you are playing this move — what you read in the position and what you are trying to achieve. Write it as normal prose before the JSON. It is not a transcript of your private reasoning; write what a spectator would need to follow your play. There is no minimum, and no need to be terse — only the first 2500 characters are kept in the spectator record. This text also stays in the conversation, so it is a good place to accumulate strategy across turns.
- Your note is recorded for human spectators and is NEVER shown to your opponent. Do not address the opponent in it.
- The LAST valid JSON object in your reply is taken as your move, so the note must come before it.
- If your reply is malformed or the move is illegal, you get exactly one corrective chance with an error code; a second failure forfeits the turn, and two consecutive forfeits eliminate the acting color.${budgetLine}

Play to win.`;
}

/**
 * Observation JSON for a turn — the single construction path shared by all
 * LLM adapters (API, claude-cli, codex-cli), so match-resource disclosure
 * stays identical across tracks by construction. Budget fields are present
 * exactly when the match has a token envelope.
 */
export function observationFromInput(input: TurnInput): object {
  const base = observation(
    input.state,
    input.ply,
    input.maxPlies,
    input.team,
    input.recent
  ) as Record<string, unknown>;
  if (input.outputTokenBudget !== undefined) {
    base.output_token_budget = input.outputTokenBudget;
    base.output_tokens_used = input.outputTokensUsed ?? 0;
  }
  return base;
}

/**
 * The last valid move JSON in free-form model text, together with the exact
 * character span it occupied. One scanner owns "which JSON is the move", so the
 * move and the note can never disagree about where the move ended.
 */
export interface FoundMove {
  move: Move;
  start: number;
  end: number;
}

/** Extract the last valid move JSON from free-form model text. */
export function extractMove(text: string): Move | null {
  return findMove(text)?.move ?? null;
}

/**
 * The note is everything the model wrote that was not the move itself: the text
 * before the move JSON, plus anything after it. Prose that follows the JSON is
 * unusual but is still the model's own words, so it is kept rather than
 * silently dropped. An earlier JSON object that did not parse as a move is also
 * kept — only the span actually adopted as the move is removed.
 *
 * Returns "" when the model wrote nothing but the move. That empty result is
 * the compliance signal, not an error.
 */
export function extractNote(text: string): string {
  const found = findMove(text);
  if (!found) return text.trim();
  const before = text.slice(0, found.start).trim();
  const after = text.slice(found.end).trim();
  // Removing the move leaves the surrounding prose adjacent; one newline joins
  // it without inventing the blank lines the JSON used to occupy.
  return before && after ? `${before}\n${after}` : before || after;
}

/**
 * The URI half of the publication commentary boundary, compiled from the
 * validator's own source string. One pattern, two call sites — the recording
 * side cannot drift from what publication rejects
 * (docs/plans/2026-08-02-publishable-note.md).
 */
const COMMENTARY_URI = new RegExp(COMMENTARY_URI_SOURCE, "iu");

/**
 * Rewrite a note into the form publication accepts. Idempotent and
 * deterministic:
 *
 * 1. `->` becomes `→` and `<-` becomes `←`. Models write board talk like
 *    "(0,3)->(3,3)" constantly, and the arrow is what they MEANT; turning it
 *    into the arrow character preserves the meaning rather than mangling it.
 * 2. Every remaining `<` and `>` becomes `‹` / `›`, which also defuses
 *    anything tag-shaped (`<a`, `</`, `<!`) without judging whether it was
 *    markup.
 *
 * The output therefore can never contain `<` or `>`, and because neither
 * character survives, no new `->` or `<-` can exist either: f(f(x)) === f(x).
 *
 * This is what makes "recorded implies publishable" constructive rather than a
 * bet on models avoiding two ASCII characters. `raw` on the move event keeps
 * the reply verbatim, so nothing is lost for audit — the note was always a
 * derived field.
 */
export function publishableNote(text: string): string {
  return text
    .replace(/->/g, "→")
    .replace(/<-/g, "←")
    .replace(/</g, "‹")
    .replace(/>/g, "›");
}

/**
 * The recorded note together with WHY it is empty when it is empty.
 *
 * `suppressed: "uri"` means the model wrote a note that still matched the
 * publication URI pattern after `publishableNote`, so the note was suppressed
 * to empty and the cause recorded. This lives inside the canonical derivation
 * on purpose: suppression IS part of what "the recorded note" means, so every
 * consumer (the runner's event, the notes carryover, the public replay) gets
 * the same answer without any of them re-deciding it. The note policy is
 * unaffected — a bad note never costs the turn; the fail-loud signal is the
 * recorded suppression event, not a lost move.
 */
export interface RecordedNote {
  note: string;
  suppressed: "uri" | null;
}

/**
 * The note EXACTLY as the spectator record keeps it: extractNote made
 * publishable, then bounded in Unicode scalars (not UTF-16 units) to the same
 * limit the public replay enforces, so a surrogate pair is never cut in half.
 *
 * This is one function on purpose. The runner writes the move event's `note`
 * with it, and the notes-carry harness (agents/notes.ts) carries the same
 * value forward, which makes "what is carried between turns" equal to "what
 * the public record shows" by construction rather than by two truncation
 * sites agreeing today (docs/plans/2026-08-02-notes-carry.md). Suppression
 * needs no change there either: the derivation returns "", and an empty note
 * is never committed to the carryover.
 */
export function recordedNoteWithCause(raw: string): RecordedNote {
  const note = [...publishableNote(extractNote(raw))]
    .slice(0, MAX_COMMENTARY_SCALARS)
    .join("");
  if (COMMENTARY_URI.test(note)) return { note: "", suppressed: "uri" };
  return { note, suppressed: null };
}

/** The recorded note alone — an alias for callers that need no cause. */
export function recordedNote(raw: string): string {
  return recordedNoteWithCause(raw).note;
}

export function findMove(text: string): FoundMove | null {
  let best: FoundMove | null = null;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = tryParseMove(text.slice(i, j + 1));
          if (candidate) {
            best = { move: candidate, start: i, end: j + 1 };
            // Skip the accepted object's interior. `{"move":{"from":…,"to":…}}`
            // contains an inner object that also parses as a move, and letting
            // the scan re-enter it would leave the outer braces behind in the
            // note. Only an object that failed to parse is scanned into, so a
            // move wrapped in something unrecognized is still found.
            i = j;
          }
          break;
        }
      }
    }
  }
  return best;
}

function tryParseMove(json: string): Move | null {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const m = parsed?.move ?? parsed;
  const from = coerceRC(m?.from);
  const to = coerceRC(m?.to);
  if (!from || !to) return null;
  return { from, to };
}

/**
 * Accept either {row,col} objects or [row,col] arrays (the arrays were the
 * original schema shape). We deliberately do NOT accept chess algebraic
 * notation ("e2e4") — using it is a genuine failure to adopt the game's
 * coordinate system, which the benchmark should record, not paper over.
 */
function coerceRC(v: any): { row: number; col: number } | null {
  let row: unknown;
  let col: unknown;
  if (Array.isArray(v) && v.length === 2) {
    [row, col] = v;
  } else if (v && typeof v === "object") {
    row = v.row;
    col = v.col;
  } else {
    return null;
  }
  if (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    (row as number) >= 0 &&
    (row as number) <= 7 &&
    (col as number) >= 0 &&
    (col as number) <= 7
  ) {
    return { row: row as number, col: col as number };
  }
  return null;
}

/** The per-turn observation text (attempt 1) or repair message (attempt 2+). */
export function turnMessage(
  obsJson: string,
  attempt: number,
  errorCode: string | undefined,
  ply: number
): string {
  if (attempt === 1) return obsJson;
  return `Your previous reply was rejected (${errorCode}). It is still ply ${ply} and the same color's turn. Reply again, ending with your move as JSON in exactly this shape:

{"move": {"from": {"row": R, "col": C}, "to": {"row": R, "col": C}}}

where row and col are integers 0-7 (row 0 = top edge, col 0 = left edge). Use row/col integers, NOT chess notation. The move must be legal for the acting color under the rules.`;
}
