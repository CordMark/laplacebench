# Pilot findings

Running log of what the discrimination pilot has told us. Newest first.

## Runs 22-23 — the operator primer (memo-primed): 3-1 over reset, and a clean 4-0 over memo-v1 with both off-seat games — the first content intervention that wins

`runs/harnesslab-sol56h-uncapped-primed-vs-reset-20260803/` and
`…-primed-vs-memo-20260803/` (both verified 4/4, in the ledger and on
the accumulating surface). Pre-registered serial pair in
`docs/plans/2026-08-03-memo-primed.md`: `codex-cli-memo-primed` is
memo-v1 plus one frozen, operator-authored strategy primer (primer-v1,
1,986 chars, full text in the plan) injected before the memo
instructions every turn — the differential test pins that the primer is
the arm's only delta. The pair was labeled in advance: primed-vs-reset
is the **system test** of the user's proposition ("a proper harness
beats reset"); primed-vs-memo is the **pure primer effect** (identical
mechanism, the primer is the only difference).

**Run 22, primed vs reset at high: primed 3-1**, with one off-seat
center win (36 plies). The loss was reset's first-seat 23-ply center
race, uncontested (0-0 center captures) — the one game where nothing
the primer teaches got to matter. Decision reasons 2/4 center, 2/4
elimination; primed took every contested center-capture exchange
(5-3, 5-3, 3-0). Reliability near-parity (primed 0.022 illegal/turn +
1 failed turn, reset 0.023 + 2). The cost column is the honest
counterweight: primed spent 3,577 output tokens/move to reset's 2,658
(1.35x) at 115s/move — the primer does not buy back its own reading
cost here, and the average game ran long (44 plies, one 79-ply grind).

**Run 23, primed vs memo-v1 at high — the pure effect: primed 4-0,
including BOTH off-seat games** (16-ply center, 36-ply elimination).
Both arms fully clean (zero illegal, zero failed turns, all 128 memo
transitions `updated`). Output tokens/move is roughly flat (primed
2,951 vs memo 3,061) — but the primer rides on the input side, and the
totals show it: ~17,399 total tokens/turn for primed vs ~17,051 for
memo (fresh ~12,098 vs ~11,903). The output-side parity does NOT
offset the primer's input, so the plan's net-light criterion was not
met — the primer did not demonstrate net token-cost payback; what it
demonstrated is a clean W-L flip at a small net-cost premium. Primed
won every center-capture contest (3-1, 3-0, 4-2, 6-0). Whatever Run
22's larger output inflation was, the within-mechanism comparison does
not reproduce it.

Read against Run 17 (guided vs v1 at medium: the content instruction
LOST 1-3), this is the first content-level intervention in the lab
that wins on W-L — at high effort, in the same direction as the Run
20/21 capability story: medium could not exploit
carried content, high can, and high with *better* content wins more.
Ranking claims stay bounded: n=4 per pairing, and 22/23 are different
opponents, so "primed > memo > reset" is a reading across pairings,
not a measured round-robin. What disappears next per the plan's
absences: no self-distilled primer yet (the named follow-up: can the
model's own rulebook distillation match the operator's?), no medium
primed run, no template change. **Compaction: still zero** (longest
game 79 plies).

## Run 21 — the missing baseline: memo vs reset at medium is 2-2 on a pure seat split — directional evidence consistent with effort unlocking the carryover

`runs/harnesslab-sol56m-uncapped-memo-vs-reset-20260803/` (verified 4/4,
in the ledger and on the accumulating surface). Pre-registered in
`docs/plans/2026-08-03-memo-reset-medium-baseline.md` to close the limit
Run 20 named explicitly: memo-vs-reset had no medium baseline, so "high
effort unlocked it" was an inference across the notes pair.

**Result: 2-2, all four games to the first seat** (the pre-committed
reading: no W-L signal). Decision reasons split 2/4 center, 2/4
elimination; winners took the center-capture contest in three of the
four games. The same pair that at high effort produced memo's 4-0 with
two off-seat eliminations produces, at medium, exactly the seat-split
texture of every other medium uncapped pair. The within-pair effort
comparison now reads: **medium 2-2 (seat) → high 4-0 (two off-seat
wins)** — n=4 each, but the direction matches the capability
hypothesis, and it is no longer resting on a cross-pair analogy.

The reliability column tells the same story from another angle. At
medium the carryover arm takes the blemishes: memo 0.088 illegal/turn
and TWO fully failed turns (reset: zeros) — echoing Run 12-14's
notes-side illegals at medium. At high the roles were exactly reversed
(memo clean, reset 0.038 + one failed turn). Format compliance is not
the issue: all 60 memo transitions across the run are `updated`, no
omissions, no over-cap discards. Medium-effort Sol writes the memo
reliably — it plays worse *around* it. Cost is memo 1,482 vs reset
1,283 output tokens/move (~1.16x), clock 51s vs 48s/move.

Honest limits: n=4 per arm per rule; and effort is the only varied
condition but these are different games (different lengths, different
tactical paths), so "unlocked" stays a directional reading, not a
measured per-position effect. **Compaction: zero** (longest game 39
plies).

## Runs 19-20 — turn-scoped memory vs reset at high effort: the bounded memo sweeps 4-0 with two off-seat wins — the first W-L break of reset by a designed carryover

`runs/harnesslab-sol56h-uncapped-notes-vs-reset-20260803/` and
`…-memo-vs-reset-20260803/` (both verified 4/4, in the ledger and on the
accumulating surface). Pre-registered serial pair in
`docs/plans/2026-08-03-high-turnscoped-vs-reset.md`, testing the user's
hypothesis that the flat notes/memo results at medium are a capability
floor: medium-effort Sol may be too weak to *exploit* a carried plan, so
raising effort should let the designed carryover show up in W-L. Both
preflights passed first try (no canary retries).

**Run 19, notes-carry vs reset at high: 2-2, all four games to the first
seat** (the pre-committed reading: no W-L signal). Decision reasons:
3/4 center occupations, 1/4 elimination (the notes arm's 41-ply g0).
What did move is reliability, in the opposite direction from medium: at
medium the notes arm carried the only blemish (0.068 illegal/turn in
the uncapped pair); at high notes is fully clean and **reset takes the
blemishes** (0.044 illegal/turn plus one fully failed turn). Cost and
clock are near-equal (2,754 vs 2,627 output tokens/move; 107s vs
95s/move) — with both arms rebuilding input every turn, the flat-cost
advantage that notes holds over persistent has nothing to bite on here.

**Run 20, bounded memo vs reset at high — the first direct pairing of
these arms anywhere in the lab: memo 4W-0L, including both games from
the second seat** (34-ply eliminations in each). Decision reasons flip
against the lab's usual texture: 1/4 center occupation, 3/4
eliminations. This is the first harness-ablation result in the lab that
breaks seat dominance against reset, and the first time any
designed-memory arm has beaten reset on W-L rather than on cost. The off-seat wins were not center races: memo
won the center-capture contest 5-0 and 5-1 in those games and drove
through to elimination. Reset again took the reliability blemishes
(0.038 illegal/turn, one failed turn; memo zero) at near-equal cost
(2,359 vs 2,148 output tokens/move) and clock (80s vs 74s/move). Memo
format compliance was clean throughout (no omissions, no over-cap
discards).

Why memo and not notes? One verified observation, then a hypothesis —
this pair cannot separate the candidate causes. The observation: the
memo genuinely carries attack lines across turns. In game-001 the
winning double-capture (6,3)->(6,4) appears as the standing plan in the
ply-29 memo, two of its turns before it is played at ply 33 — a carried
plan, not a per-move rationale. The hypothesis: the memo-v1 template
(`agents/memo.ts`) *structurally requires* a rewritten position read,
standing plan, opponent tendencies, and lessons every turn, and that
designed rewrite may be what beats fresh re-derivation. But the notes
artifacts do not support the strong version of that reading: the
high-effort notes also contain conditional multi-turn plans ("On Red’s
next turn, the key tactic remains…", g0), not just board-re-derivable
rationale — and notes still tied. Whether the 4-0 comes from the
structured single-document rewrite, from the bounded form itself, from
high effort finally exploiting a carried plan, or from run variance is
not isolatable at n=4 with this design. Two further honest limits:
memo-vs-reset was never run at medium, so "high effort unlocked it" is
an inference across the notes pair, not a measured within-arm flip; and
n=4 per rule stays suggestive — though a 4-0 with two off-seat
eliminations is the strongest single-run harness signal the lab has
produced. **Compaction: still zero everywhere** (no game exceeded 41
plies).

## Runs 17-18 — notes-guided (write purpose + handoff every move): the instruction does not help at medium, and v1 wins the clean comparison

`runs/harnesslab-sol56m-guided-vs-notes-20260802/` and
`…-guided-vs-persistent-20260802/` (both verified 4/4, in the ledger and
on the accumulating surface). Pre-registered serial pair in
`docs/plans/2026-08-02-notes-guided.md`, testing the user's hypothesis
that telling the model *what to carry* — "state the purpose behind this
move, and what the you of the next turn needs to know" — is the
strongest form of the notes harness. The two runs were labeled in
advance: guided-vs-v1 is the **pure instruction effect** (identical
mechanism, announcement is the only difference); guided-vs-persistent
is a **system comparison** (no factor decomposition claimed).

**Run 17, guided vs notes-v1: v1 3W-1L, two of the three wins from the
second seat.** The pure-instruction comparison came out against the
guidance: the un-instructed notes arm beat the purpose/handoff arm at
essentially identical cost (1,375 vs 1,461 output tokens per move) and
both arms were fully clean (zero illegal, zero failed turns). At n=4
this is suggestive, not settled — but the direction is the opposite of
the hypothesis, and the off-seat wins mean it is not a seat artifact.

**Run 18, guided vs persistent: 2-2, every game won by the first mover**
(the pre-committed reading: no W-L signal). The texture repeats Run 13
almost exactly: persistent's wins were twin 11-ply center rushes;
guided's wins were longer fights (45-ply center, 29-ply elimination).
Persistent spent 345,724 output tokens to guided's 55,532 — **6.2x**
for the same split. Reliability cut against guided here: 4 illegal
moves and one fully failed turn vs persistent's zeros (echoing Run 14's
notes-side blemish, and unlike Run 17 where guided was clean).

Reading across the notes family so far: the *mechanism* (append-only
accepted-note journal) keeps matching persistent at a flat fraction of
its token bill, but *steering the content* of the notes has not paid
for itself — v1's freely-written notes beat the purpose/handoff
template at medium. The symmetric completion the plan names as the next
set's headliner — guided-notes vs primed-persistent, where both arms
get told what matters — is now the interesting question: is the loss
in the template, or does medium-effort Sol simply not follow carried
intent? **Compaction: still zero everywhere** (no game exceeded 50
plies).

## Run 16 — flagship at high effort (claude-opus-5@high vs gpt-5.6-sol@high): Opus sweeps 4-0; the token and clock columns point in opposite directions

`runs/arena-opus5h-vs-sol56h-uncapped-20260802/` (verified 4/4, in the
ledger; `matchup_kind: model-arena`, public-matchup eligible — this is a
normal arena game, not a Harness Lab entry). Pre-registered alongside
Run 15 in `docs/plans/2026-08-02-high-capability-probe.md`: both CLIs
persistent, clean-room, uncapped, seeds 42-series, alternating seats.

**Availability note (canary flake, documented as promised):** the first
launch attempt died in preflight — the claude *positive* control failed
once (the canary instruction was not echoed), so the fail-closed gate
refused to start and no run record existed. A second attempt under the
same run-id (permissible exactly because attempt one recorded nothing)
passed preflight and produced this run. The retry of the surrounding
plan is recorded here rather than in a separate availability file.

**Opus 4W-0L**: center in 15 and 17 from the first seat, center in 50
and elimination in 38 **from the second seat** — the sweep is not
seat-driven. In the two long games Sol built an early center presence
and Opus won the eviction war anyway (center captures 9-1 across the
run, Sol's single one coming in the 50-ply game-001 — the same
asymmetry that separated winners from losers in Runs 12-15).

**Token and clock columns, reported descriptively.** Sol emitted
811,938 output tokens to Opus's 628,174 (13.8k vs 10.3k per move);
Sol's game-001 alone ran 444k output tokens at 17.8k/move. Per the
usage schema's own comparability rule, **cross-provider token totals
are descriptive only** (tokenizers and provider-injected CLI context
differ), so this is not a cost ranking — the observation is simply
that the losing side's token column is the larger one. The clock
points the other way: Opus averaged 123s/move to Sol's 56s/move.
Whatever normalization one adopts, a single-axis "cost" column would
tell a different story than the pair does.

**Second fully clean run**: zero illegal, zero format failures, zero
failed turns, all eight sides. At high effort the reliability signal of
the medium generation (illegal moves, failed turns) vanishes entirely.

**Compaction: zero on both providers.** Codex threads peaked at 8-20%
of the 258,400 window even in the 50-ply game; Claude's telemetry
(`compact_boundary` counting) reports 0 compactions with status ok.
Uncapped games still end long before either provider's compressor
wakes up.

## Run 15 — the same ablation at high effort: persistent 3-1, including an off-seat center win, at 4.0x cost and *lower* per-move latency

`runs/harnesslab-sol56h-uncapped-persistent-vs-reset-20260802/` (verified
4/4, in the ledger and on the Harness Lab surface). Pre-registered in
`docs/plans/2026-08-02-high-capability-probe.md` to test the user's
hypothesis that Run 12-14's noisy W-L and center-rush monoculture were
artifacts of Sol@medium's capability, not properties of the game. Same
pairing as Run 12 (persistent vs turn-reset), same seeds/seats/clean-room,
only the effort knob moved: gpt-5.6-sol@high.

**Persistent 3W-1L** — center 17 (first seat), center 34 (**second
seat**), elimination 25; the loss an elimination at 23 as second seat. At
medium this exact pairing went reset 3-1 (Run 12). At n=4 nothing is
settled, but the direction of the flip is the one the capability
hypothesis predicts: raise effort and the carryover arm stops losing.

**The cost picture inverted on latency.** Persistent spent 497,155 output
tokens to reset's 125,038 (**4.0x**, cheaper ratio than medium's 5.2x) —
but persistent's per-move latency was 43-57s against reset's 69-105s.
Mechanism: reset re-derives the whole game from a cold prompt every turn
at high effort, while persistent's cached thread lets it think
incrementally. At high effort the "expensive" harness is the faster one
per move — the bill and the clock disagree about which arm is costly.

**First fully clean run of the series**: zero illegal moves, zero format
failures, zero failed turns on both arms across all four games.

**Compaction still never fired** (`compaction_count: 0`; threads peaked at
9-17% of the 258,400 window). Uncapped high-effort games still end long
before context pressure begins.

**Center defense, read honestly (and a detector correction).** The
pre-registered post-hoc read asked whether the second mover physically
contests the center. First pass said "no captures on center anywhere" —
that was a parser bug (capture events are `{"at":[r,c],"owner"}` objects,
not bare coordinates). Corrected: the center is contested in **all 16
uncapped games** (Runs 12-15) — every losing team entered the center at
least once, and center squares are captured regularly (medium: 34
winner-side vs 14 loser-side center captures; high: 11 vs 5). What
distinguishes winners is not that defenders never showed up but that
winners win the eviction war roughly 2.2-2.4x over (34/14 at medium,
11/5 at high). At high, center endings fell
to 2/4 (from 8/12 at medium) and one of them was the second mover winning
a 34-ply mutual-eviction fight — against the "center = first-mover
artifact" reading, and consistent with capability raising the cost of a
center rush without abolishing the route.

## Runs 12-14 — the uncapped three-arm set (persistent / notes-carry / reset): W-L is noisy, the cost column is not

`runs/harnesslab-sol56m-uncapped-*-20260802/` (all three tracked in the
ledger and, for the first time, published on the Harness Lab accumulating
surface via `community/harnesslab-experiments.json`). Pre-registered as one
fixed-order serial set (plan `docs/plans/2026-08-02-uncapped-three-arm.md`):
same model/effort (gpt-5.6-sol@medium), seeds 42-series, alternating seats,
clean-room, **no token budget** (the new default), context telemetry armed.
Per-pairing n=4; no cross-run league aggregation (pre-committed).

**Run 12, persistent vs reset: reset 3W-1L** (center 30/9, elim 25 vs
persistent's center 25). Persistent spent 264,600 output tokens vs reset's
51,316 (5.2x) for a losing record. Note the instability against history:
the same pairing went reset 3-1 at 350k (budget-forfeit driven), persistent
3-1 at 600k, and now reset 3-1 uncapped — at n=4, W-L for this pairing has
not stabilized in any direction. No game exceeded 30 plies, so this run did
not exercise genuinely long-thread behavior.

**Run 13, persistent vs notes-carry: 2-2, every game won by the first
mover** (pre-committed reading: no harness signal in W-L). The texture
differed by arm: persistent's wins were 11/19-ply center rushes; notes'
wins were 41/43-ply elimination wars. Persistent spent 651,163 output
tokens vs notes' 87,112 — **7.5x** — for the same 2-2.

**Run 14, notes-carry vs reset: 2-2 with both off-seat wins** (reset won
from the second seat at 32 plies; notes won from the second seat at 34).
Cost nearly identical (66,321 vs 51,985). Reliability cut against notes
here: 0.068 illegal/turn and one fully failed turn vs reset's zero — the
carried notes did not prevent (and at n=4 may even accompany) board-state
errors, unlike memo's clean Run 10.

**Compaction: still never observed.** All persistent-side telemetry files
recorded `compaction_count: 0` (games peaked at 43 plies; threads never
approached the 258,400 window). The instrument is armed and waiting for a
genuinely long game.

Reading, within the pre-registered discipline: across twelve uncapped
games, **no carryover policy separated itself in W-L at n=4, while
persistent cost 5.2x and 7.5x more than its two turn-scoped opponents
(notes and reset were near-identical to each other)** — persistent pays a
compounding bill for no measurable strength advantage at these game
lengths, and the public-carryover arm (notes) matches everyone at flat
cost without memo's reliability cleanliness. Seat continues to dominate
short games (6 of 12 games were first-mover center wins). The honest
headline for the accumulating surface is exactly its two columns: results
and bills, side by side.

## Run 11 — persistent vs turn-reset again, now at 600k: the Run 9 result flips to persistent 3-1

`runs/harnesslab-sol56m-persistent-vs-reset-600k-20260731/` (tracked at
`community/runs/keisuke70--harnesslab-sol56m-persistent-vs-reset-600k-20260731/`).
Third pre-registered Harness Lab ablation
(plan `docs/plans/2026-07-31-budget-600k-and-run11.md`): the SAME pairing,
seeds, seats, and protocol as Run 9, with one change — the canonical output
budget raised from 350k to 600k, intended to keep budget exhaustion from
deciding the games (600k = Run 9's measured 46-ply requirement of
~470-510k plus ~20% headroom). Comparisons with Run 9 are cross-run observations under a
different disclosed budget, not same-condition results.

**Score: persistent 3W-1L — the mirror image of Run 9's reset 3-1.** With
the cap out of the way in three of four games, the thread-carrying side won
from both seats and by both victory routes (eliminations at 51 plies,
center at 17 and at 42 plies). Zero illegal moves, zero format failures on
the persistent side across 83 turns.

**The one loss is the exception that restates the rule.** Game-001 ran 54
plies — the longest game in the series so far — and even 600k ran out:
the persistent side forfeited every turn from ply 47 (`token_budget`
passes at 47/49/51/53) and lost by elimination, exactly the Run 9 failure
mode one budget tier higher. Game-000 finished at 637k spent (the final
winning turns overshot the ledger after admission) — a 51-ply win with
almost nothing to spare.

Cost: persistent 1,731,054 output tokens vs reset 272,515 over ~82 turns
each — **6.4x** — with per-turn peaks near 50k late in long games. Reset
kept its familiar profile: flat spend, one illegal-move blip
(0.012/turn), and notably doubled latency this run (~102s/turn vs
persistent's ~54s — rulebook re-reads plus whatever the provider was doing
that hour; recorded, not interpreted).

Reading, within n=4 discipline and the cross-run caveat: **when the budget
does not bind, carrying your thinking forward wins** — directionally
consistent with the ARC-AGI-3 retention report. But the carryover's cost
grows with game length without bound, so ANY finite budget eventually
becomes the opponent again: at 350k that happened at ply ~39, at 600k at
ply ~47. Raising the cap moves the crossover point; it does not remove it.
Across the three arms measured so far: full retention beat zero retention
3-1 once the cap mostly stopped binding, at a bill that compounds with
game length; zero retention stays cheap but error-prone; and the bounded
memo (Run 10) established a flat cost profile with clean reliability —
though its seat-dominated 2-2 resolves nothing about memo strength versus
persistent. What a harness should carry — and when to compact it — is now
measurably a design variable, which is the Harness Lab's reason to
exist.

## Run 10 — bounded-memo vs persistent (gpt-5.6-sol@medium): 2-2 on a pure seat split, at 4.6x lower cost

`runs/harnesslab-sol56m-persistent-vs-memo-20260731/` (tracked at
`community/runs/keisuke70--harnesslab-sol56m-persistent-vs-memo-20260731/`).
Second pre-registered Harness Lab ablation
(plan `docs/plans/2026-07-31-bounded-memo-harness.md`), same protocol as
Run 9 (4 games, seeds 42/1042/2042/3042, alternating seats, 350k envelope,
clean-room). Same model and effort on both sides; the difference is the
H0+H1 compound policy:

- `codex-cli` — persistent thread (unbounded, invisible carryover);
- `codex-cli-memo` — fresh context every turn; the ONLY carryover is a
  1500-char, harness-formatted strategy memo the model rewrites each turn,
  recorded per adapter call in `memo/<gameId>/<team>.jsonl` (memo-v1).

**Score: 2-2 — and every single game was won by Team A, the first-moving
side, by center occupation in 15-21 plies.** The W-L therefore carries no
harness signal in this run: the dominant observed factor was the seat.
(That is itself a game-dynamics observation for this pairing — both
conditions raced the center and neither defended it well enough at medium —
in sharp contrast to Run 9's 46-ply elimination wars against the reset
arm.)

**The cost result is the finding.** With identical W-L, zero illegal moves,
zero format failures, and zero forfeited turns on BOTH sides:

- output tokens: memo 64,847 vs persistent 300,545 over the same 34 turns
  each — **4.6x lower**;
- per-turn shape: memo stays flat (game means 1.1-2.3k/turn, max 5.4k)
  while persistent's re-derivation curve is visible even in 15-21-ply
  games (game means 5.0-13.2k/turn, max 23.6k and rising at game end);
- latency: comparable (memo ~59s/turn vs persistent ~55s/turn);
- the envelope never bound (games were short), so this run does NOT test
  "efficiency wins when the budget bites" — it shows equal results at a
  fraction of the spend.

**Memo mechanics held up completely**: 34/34 transitions returned an
in-cap, well-formed memo (`updated`; zero missing, zero over-cap), in
seat-invariant language, strategically coherent to the end — the winning
memo's final entry reads "Center occupation is complete, so we win
immediately", with the lesson "preserving the staged one-step center entry
through the intervening turns converted the positional advantage into an
immediate win". The carryover is, for the first time, an auditable public
artifact rather than hidden reasoning.

Pre-registered observational reads against Run 9's reset arm (same
opponent condition, same seeds, DIFFERENT run — persistent's actual moves
diverge, so these are cross-run observations, not head-to-head claims):

- cost: memo's flat curve sits at or below reset's (1.1-2.3k vs 2-4k/turn)
  — the memo pays for itself; carrying a bounded plan costs no more than
  carrying nothing;
- reliability: memo made **zero** illegal moves where reset showed the
  state-drift signature (0.036 illegal/turn, one forfeited turn) — the
  memo's position-read section appears to remove the memory-loss cost of a
  fresh context, though n=4 keeps this suggestive;
- W-L vs the common opponent: reset went 3-1, memo 2-2 — but Run 9's
  persistent losses were budget-forfeit driven in long games and Run 10's
  games were short seat-decided center rushes, so no cross-run strength
  ordering is claimed.

Reading, within n=4 discipline: **a bounded, visible carryover matched the
unbounded, invisible one at 4.6x lower cost, with perfect format
compliance and no reliability regression.** This is the first concrete
data point for the fixed-model division's thesis — under a finite
envelope, what you choose to carry is an engineering variable worth
competing on — while the seat-swept W-L is a reminder that per-move and
telemetry metrics, not 4-game W-L, must carry these comparisons. Next
ablations worth pre-registering: a pairing where the envelope binds
(longer games or smaller budget), cap-size sweeps, and first-team
advantage measurement for this ruleset at scale.

## Run 9 — first curated Harness Lab ablation (gpt-5.6-sol@medium, persistent vs turn-reset): reset 3-1; budget exhaustion is the dominant observed failure mode

`runs/harnesslab-sol56m-persistent-vs-reset-20260730/` (also tracked at
`community/runs/keisuke70--harnesslab-sol56m-persistent-vs-reset-20260730/`).
The first pre-registered controlled ablation under the Harness Lab contract
(plan `docs/plans/2026-07-30-harness-lab-contract.md` §5 fixed the exact
command, 4 games, seeds 42/1042/2042/3042, alternating seats, canonical
envelope, no early stop, before execution). Both sides are the SAME model at
the SAME effort — `gpt-5.6-sol@medium` — through the same codex CLI under
clean-room isolation; the only difference is the H0 context policy:

- `codex-cli` — persistent thread for the whole game (`codex exec resume`),
  provider-managed reasoning retention/compaction (opaque);
- `codex-cli-reset` — fresh `codex exec` every turn, rulebook + full-state
  observation resent, nothing carries over.

Motivated by OpenAI's ARC-AGI-3 report that reasoning retention + compaction
tripled their scores. This is NOT a replication of that result — the codex
CLI exposes no independent retention/compaction toggles — it is the same H0
axis (context lifetime) measured as a compound policy on this benchmark.

**Score: turn-reset 3W-1L**, winning from both seats (eliminations at 46
plies in games 000/001/003). Persistent's only win was the short game —
a 31-ply center win in game-002.

**The dominant observed terminal failure mode is budget exhaustion.** The
persistent side's per-turn output (reasoning inclusive) grows with the
thread: first-half mean ~5-10k tokens/turn, second-half mean ~15-30k,
peaking around 40k/turn. In every 46-ply game it exhausted the 350k/team
output envelope around ply 39-40 and then forfeited EVERY remaining turn
(`token_budget` passes at plies 39-45; 11 forfeited turns across the run),
after which the reset side converted by elimination against a paralyzed
opponent. The reset side's cost profile stays flat (~2-4k/turn; 0 budget
skips). Aggregate output: 1.22M tokens (persistent) vs 225k (reset) — 5.4x —
for 85 vs 84 turns. What this run cannot separate is the counterfactual:
whether the persistent side's pre-exhaustion play was building winning or
losing positions before the forfeits decided the games — the W-L result
compounds any strategic difference with the forfeit effect.

On the narrower reliability metrics, persistent recorded zero illegal moves
and zero format failures in 85 turns, while reset showed the familiar codex
state-drift signature without context (0.036 illegal/turn, one fully
forfeited turn at game-003 ply 4). Legality/format rates are not a measure
of strategic quality. Latency: persistent ~63s/turn, reset ~81s/turn (it
re-reads the rulebook every turn).

Reading — and the honest limit of it: **under an equal, finite output
envelope, context retention is not free.** Persistent Sol spends
progressively more reasoning per turn as its thread grows, and in these
games that exhausted its envelope while turn-reset's flat cost curve never
approached it; the series result follows the forfeits. This is a retention
x resource-envelope interaction observed at n=4 — not evidence that
retention hurts (or helps) strategic play quality, which this run does not
isolate. One model, one effort, one envelope; suggestive, not conclusive.
The obvious next ablations (same pair at a larger envelope; a
compaction-style middle condition) are noted in the Harness Lab direction
doc, not run here.

Contract notes: run.json records `matchup_kind:
"same-model-harness-ablation"`, both sides' `harness_conditions`, and the
clean-room `isolation` manifest (this was the first curated run executed
under clean-room-by-default). The `PUBLIC_MATCHUP_HARNESSES` boundary keeps
all 4 games out of the default public matchups — `standings` over this run
reports 0 matchups by design — so nothing here enters model-versus-model
records.

## Run 8 — flagship pair v2 (fable@medium vs gpt-5.6-sol@medium): 2-0 again

`runs/flagship-fable-codex-v2/`. Rematch of the Run 3/4 pair, now with
per-move commentary recorded. **Fable swept 2-0 again — cumulative
head-to-head 4-0** — winning by center from both seats (9 plies as A;
28 plies as B with real capture exchanges). Codex's error signature
persisted (0.056 illegal/turn, 1 forfeited turn); Fable remains at zero
errors across all games to date.

Notable variance datum: the same matchup produced a 43-ply elimination
war in Run 3 and a 9-ply center rush here — game-level outcomes swing
widely even when the winner is stable. Supports the strategy doc's
position that per-move metrics and multi-game samples, not single games,
must carry the ratings.

Commentary revealed a spectator-visible personality difference: Fable
narrates its plans before each move ("Red has jumped straight into the
center at (3,3) — the center-occupation threat and a capture opportunity
both revolve around that square..."), while codex replies with the bare
move JSON and nothing else. Same protocol, opposite communication
styles — now visible per-move in the replay viewer.

> **Condition note (2026-07-27):** this observation is specific to prompt
> generation `p2-token-budget`, where narrating was invited but optional. From
> `p3-move-note` the note is required, so silence is no longer a style choice
> the protocol permits — it is recorded as `note_omission_rate_per_move`.
> Do not read this entry as a standing property of either model.

## Run 7 — learning-vs-cold (fable@low, 4 games): modest edge, rich failure modes

> **Status (updated 2026-07-30):** this remains the project's only completed
> excursion into harness-versus-harness territory. Model Arena scores models,
> not agent designs, so the run never enters model-versus-model results. Its
> lessons are now prior evidence for the separately scoped Harness Lab
> direction; no public Harness Lab lane or competition exists yet. See [Scope
> in the README](../../README.md#scope-this-is-a-model-benchmark) and [Harness
> Lab direction](../../docs/harness-lab-direction-ja.md).

`runs/fable-low-learn-vs-cold/`. Both sides claude-fable-5@low. The only
variable: the learn side gets a post-game analysis pass (same model, same
effort) that reads the referee's ground-truth record and maintains a
format-constrained strategy document, injected at the next game's start.

**Score: learn 2W-1D-1L** (game 0: center win as A, 69 plies, captures 6-2;
game 1: center win as B in 18 plies; game 2: 80-ply horizon draw; game 3:
LOST to the cold side's center rush as B, 23 plies). Decisive games 2-1.
n=4 — suggestive, not conclusive. Protocol note: 190 turns at LOW effort,
zero illegal moves from either side.

**The strategy corpus is the real result** (learn/strategy-after-game-*.md,
817→1125 words). Genuine rule extraction through play, with evidence tags:

- After a failed capture attempt it wrote: "mixed-color flanks do not
  capture — build a SAME-COLOR sandwich" (a real rule it wasn't told
  explicitly in that form, learned from one failed attempt).
- Correct meta-lessons: "a vacated center cell is a free win condition";
  "held 3/4 center for 38 plies and drew — every move must progress the
  eviction".

**Two identified failure modes of naive accumulation** (the interesting
part):

1. **Seat-scrambled opponent model.** Games alternate seats, and the notes
   say "Team B opens Blue (3,7)->(3,4)..." — written when the opponent was
   Team B. In game 3 the LEARN side played Team B, so its own opponent-
   modeling section described itself and said nothing about the actual
   opponent. Naive seat-labeled notes break under side-swapping; the memo
   format needs seat-invariant language ("the opponent", "we"). This is a
   harness-design lesson, not a model lesson — which is precisely why the
   harness division was parked: the variable under test stopped being the
   model.
2. **Attack-biased distillation.** The center section accumulated eviction/
   conversion rules from long games but no defensive rule for "opponent
   rushes center from move 1" — and game 3 was lost to precisely that,
   while the learn side developed flank pieces. Wins teach attack; losses
   must be force-distilled into defense.

**Latency observation worth chasing:** learn averaged 62s/turn vs cold's
82s/turn — the side WITH strategy notes thought ~24% faster while scoring
better. Hypothesis: injected strategy substitutes for in-context
re-derivation. Cheap to test at larger n.

## PILOT VERDICT (after Runs 1-6): Laplace discriminates frontier models

The Phase-0.5 question — "does Laplace separate frontier models at all?" —
is answered **yes**, on three independent axes, with a consistent picture:

| agent (@medium, subscription CLI) | head-to-head | vs center-greedy | errors |
|---|---|---|---|
| claude-fable-5 | 2-0 vs codex (elim + center, both seats) | 1-0 (center, 21 plies, 0 pieces lost) | **0 in 43 turns** |
| gpt-5.6-sol | 0-2 | 1-0 (center, 23 plies, 2 lost, 1 forfeited turn) | every game: 0.10-0.17 illegal/turn |

1. **W/L**: Fable swept the side-swapped pair, winning by both victory
   routes; both LLMs beat the center-aware baseline, which splits with the
   product minimax. Clean ladder: Fable > codex > center-greedy ~ takeshi >
   greedy > random.
2. **Piece economy**: pair aggregate 10-3 captures for Fable; vs baseline,
   Fable conceded 0, codex conceded 2.
3. **Error rates** (independent of W/L): Fable zero across all games;
   codex shows a persistent signature — board-state drift after captures
   (E_NO_PIECE_AT_FROM on just-captured pieces), occasional format lapses,
   one fully forfeited turn. The per-turn failure metrics separate models
   even in games codex wins.

Qualitative capabilities actually observed in play: novel-rule acquisition
from a cold rulebook (zero legal-move hints), two-color coordination,
mixed-line double captures (both models), pre-staged multi-move tactics and
dual-purpose moves (Fable), correct Void handling, both victory routes.

Also validated along the way: center defense neutralizes the center rush
(game balance holds when both sides know the rule); the referee handles
elimination/Void/center correctly in real games; the subscription-CLI
harness is viable (wall-clock ~40-75s/turn at medium, ~$0 marginal cost);
raw-reply auditing is essential (Run 2's harness bugs masqueraded as model
failure).

Caveats for anything public: n is tiny (1 pair + 2 calibration games);
subscription CLIs inject their own system prompts (label as a distinct
condition; API track exists for clean runs); codex ran with the user's
`model_instructions_file` present; per-move regret not yet measured.

## Run 6 — fable@medium vs center-greedy: calibration closed

`runs/fable-vs-centergreedy/`. **Fable won by center in 21 plies, captures
3-0, zero pieces lost, zero errors** (~62s/turn). Where codex needed 23
plies and conceded 2 pieces plus a forfeited turn against the same
opponent, Fable gave up nothing. Calibration ladder complete — see verdict
above.

## Run 5 — codex@medium vs center-greedy: ladder holds, error signature persists

`runs/codex56-vs-centergreedy/`. **Codex won by center occupation in 23
plies** (captures 3-1) — so the ladder ordering holds: frontier LLMs >
center-greedy (which itself splits 2-2 with takeshi). The baseline can't
match multi-move center planning; codex assembled the 4-cell occupation
against active center defense.

But codex's error signature repeated: ply 14 format failure then
E_NO_PIECE_AT_FROM on the repair -> forfeited the turn entirely; ply 18
E_DEST_OCCUPIED (recovered). That's 0.167 illegal/turn and 1 failed turn
in a *won* game — codex wins through its errors, but errors recur in every
codex game so far (state drift + occasional format lapses), while Fable has
zero errors in 32 turns. Per-turn error rate is discriminating models
independently of W/L, exactly as the metric design hoped.

Ladder so far (all @medium, subscription CLIs):
Fable 5 (2-0 vs codex, 0 errors) > codex gpt-5.6-sol (1-0 vs center-greedy,
errors every game) > center-greedy (2-2 with takeshi) ~ takeshi > greedy >
random.

## Run 4 — return game (sides swapped): Fable sweeps the pair 2-0

`runs/fable-vs-codex56-medium-swap/`. Codex first-moving (Team A), Fable
second (Team B). **Fable won by CENTER occupation in 20 plies** — so the
pair ends 2-0 Fable, one win by each victory route, from both seats.
First-move advantage does not explain the result.

The finish was the strongest sequence seen yet. Fable (B) set an anchor at
(2,3) on ply 3, then ply 7 Green (5,0)->(5,3) double-captured the mixed line
Red@(4,3)+Yellow@(3,3) against that anchor — the same mixed-line trick Codex
found in game 1, but *pre-staged two moves earlier*. Ply 17 Blue
(4,5)->(4,4) was dual-purpose: captured Yellow@(5,4) (third loss ->
Yellow eliminated) AND placed Blue on center cell (4,4). Ply 19 Green
(2,3)->(3,3) completed (3,3)(3,4)(4,3)(4,4) for the center win — the
eventual center squares were assembled via capture threats, not a rush.

**First genuine state-tracking failure captured:** ply 8, Codex attempted
to move a piece that had just been captured on the previous ply
(E_NO_PIECE_AT_FROM) — exactly the failure mode the benchmark is designed
to expose (board-state drift after an opponent's capture). It recovered on
its single repair attempt. Codex: illegal_rate 0.1/turn this game.

Pair aggregate (both games): Fable captured 10 pieces and lost 3; Codex
captured 3 and lost 10. Fable: 0 illegal / 0 format failures in 32 turns.
Codex: 1 illegal (recovered) in 31 turns. Lengths 43 and 20 plies — real
games, not rushes.

Reading: at medium effort, this matchup discriminates clearly — the
stronger-looking play (piece safety, pre-staged multi-move tactics, dual-
purpose moves, exploiting both victory routes) belongs to the same side
that wins, from either seat. Still n=1 pair; a small series would firm it
up, and both models still need calibration vs `center-greedy`.

## Run 3 — claude-fable-5@medium vs gpt-5.6-sol@medium (first real match)

`runs/fable-vs-codex56-medium/`. Both sides subscription CLIs, effort=medium.

**Result: Fable 5 won by team elimination in 43 plies.** Captures 6-2 in
Fable's favor; final losses Red 1 / Yellow 1 vs Blue 3 / Green 3. Zero
illegal moves and zero format failures on BOTH sides across 43 turns.

Game arc — the first full-spectrum LAPLACE game we've seen:

- **Center rush neutralized by contest.** Red opened to (3,3); Codex's Blue
  immediately contested (3,7)->(3,4) on ply 1. The center changed hands
  through plies 4-17 and nobody completed the 4-cell occupation. When both
  sides know the center rule, the rush is not dominant — first positive
  evidence on the game-balance question from Runs 1-2.
- **Both models executed real sandwich tactics.** Fable: repeated
  coordinated captures using same-color anchor pairs (plies 4, 12, 26, 32,
  34, 42). Codex ply 17 was the most sophisticated single move of the game:
  Blue (2,5)->(2,3) captured Red@(3,3) AND Yellow@(4,3) in one line — the
  mixed-color multi-piece sandwich rule, found unprompted.
- **Fable converted material into the elimination route:** third Blue loss
  at ply 32 (Blue -> Void), third Green loss at ply 42 -> both enemy colors
  eliminated. Codex correctly kept playing its Void Blue pieces after
  elimination (plies 33/37/41) — no rule confusion on either side.
- Fable's only losses were the ply-17 double capture; it gave up nothing
  else in 22 turns.

Cost/latency (subscription, so wall-clock is the real constraint):
- Fable: 22 turns, ~75s/turn avg, 114k output tokens, 1.85M cache-read.
- Codex: 21 turns, ~41s/turn avg, 225k output tokens, ~5.1M cached input.
- Whole game ~42 minutes.

Usage note (added 2026-07-22): these are historical pre-
`laplace-model-usage-v1` figures. The old Claude collector omitted
`cache_creation_input_tokens`, while OpenAI `input_tokens` already included
its cached subset. They are descriptive provider-local diagnostics, not a
cross-provider token-efficiency comparison. See `docs/usage-semantics.md`.

Interpretation: one game is an anecdote, not a rating — but the pilot's
core question ("does Laplace discriminate?") is trending yes: a capable
model pair produces a long, legal, tactically rich game with a clear
winner, and the visible quality gap (capture ratio, piece safety) matches
the result. Protocol adherence at medium effort is a solved problem for
both vendors' frontier CLIs.

Next measurements that matter: the side-swapped return game (was Team A /
first-move an advantage?), a small series for W/L stability, and each model
vs `center-greedy` to calibrate against the baseline ladder.

## Run 2 — claude-cli:sonnet vs codex-cli (first attempt, then fixed)

`runs/llm-vs-llm-1/` (first attempt). Sonnet "won" by center in 7 plies —
but only because **codex forfeited all 3 of its turns**. Digging into the raw
replies separated two causes, which is the point of running a pilot:

**Harness bug (mine, not the model):** codex's first call hung on
`Reading additional input from stdin...` — the adapter left the child's stdin
pipe open, and `codex exec` waits on it. Fixed by always closing stdin.

**Overly strict parsing (mine):** codex replied with `{"action":"move",
"from":[4,0],"to":[4,4]}` — array coordinates, which the parser rejected. But
`[row,col]` arrays were the *original* schema shape (`schemas/`); rejecting
them was my bug, not codex's. Now accepted.

**Genuine model signal:** codex also emitted chess algebraic notation
(`{"move":"e2e4"}`, `"a4e4"`, `"h4e4"`) — it partly models the board as chess.
Using notation the game never defines is a real failure to adopt the
coordinate system — one of the six target capabilities ("reliable structured
action"). We still reject chess notation; the one repair attempt now re-shows
the exact `{row,col}` schema, which is the fair remedy.

**Methodology note:** a harness bug and overly strict I/O both masquerade as a
model failure. The first game looked like "codex can't play"; it was mostly
"my adapter can't read codex." Any published number must survive this kind of
raw-reply audit — which is why the benchmark stores every raw reply.

After the fixes, a codex-vs-takeshi smoke (`runs/smoke-codex/`) showed codex
playing with **zero failures** — and, like Sonnet, immediately rushing the
center (Red→(3,3), Yellow→(4,3), Red→(3,4) in its first three moves). So both
frontier models independently discover the center-rush. The fair head-to-head
(`runs/llm-vs-llm-2/`) is running.

## Baseline addition — `center-greedy`

Built a one-ply greedy that values center occupation alongside material
(`agents/centergreedy.ts`), to fix takeshi's center-blindness (Run 1). Check
vs plain takeshi, 4 games side-swapped: **2W-2L each**. center-greedy's wins
are both by center (13, 8 plies); takeshi's are both by elimination (22, 43).
So it genuinely contests and defends the center while staying roughly balanced
with material-only minimax — a valid opponent for testing whether a model can
take the center against real defense. Side note: even a 1-ply center-aware
player wins by center in 8–13 plies, reinforcing that the center route is fast
and rushable (open game-balance question, not yet a verdict).

## Run 1 — claude-cli:sonnet (Team A) vs takeshi:d2 (Team B)

`runs/validate-claude-cli/`. 1 game, JSON observations, subscription-driven
Claude Code CLI as the model. Seed 42, max-plies 60.

**Result: Sonnet won by center occupation in 11 plies. 6 moves, 0 illegal,
0 format failures.**

Full game:

```
ply  0    Red: [0,3] -> [4,3]     (center 4,3)
ply  2 Yellow: [7,4] -> [4,4]     (center 4,4)
ply  4    Red: [0,4] -> [3,4]     (center 3,4)
ply  6 Yellow: [7,2] -> [3,2]     (staging)
ply 10 Yellow: [3,2] -> [3,3]     (center 3,3) -> WIN
```

Red holds (4,3)+(3,4); Yellow holds (4,4)+(3,3). Team A occupied all four
center cells using **both colors in coordination** — exactly the two-armies-
one-mind capability the benchmark targets. Referee detected the center win
correctly.

### What works

- **Subscription-driven pipeline is sound.** Claude Code CLI as a persistent-
  session subprocess: rulebook in first message, `--session-id`/`--resume`
  for continuity, tools disabled. Zero API key, zero per-token billing.
- **Sonnet learned the rules cold.** No legal-move list, novel rulebook, and
  it produced 6 legal rook-moves and a valid win plan with no rule errors.
- **Prompt caching is heavily used.** The historical collector recorded
  205,735 cache-read tokens across 6 turns. Its old "12 uncached input"
  figure omitted Claude cache-creation tokens, so it must not be read as a
  complete fresh-input total; this is corrected by
  `laplace-model-usage-v1`.
- **Cost/latency:** ~35s per Sonnet turn (212s for 6 turns). Center-rush wins
  are short; expect full strategic games to run much longer. Wall-clock, not
  dollars, is the constraint under a subscription.

### The load-bearing caveat: takeshi is blind to the center

TakeshiPolicy's evaluation (`TakeshiPolicy.ts:17` weights) scores only
`teamPieces`, `deathRisk`, `immediateThreat`, `immediateCapture`, `mobility`.
**There is no center-control term.** So minimax literally cannot see the
center-victory threat: through the whole game Blue/Green wandered on material
heuristics while Team A stacked the center unopposed.

Consequences:

1. **takeshi is not a valid baseline for the center-victory route.** Against
   it, "rush the center" is a free win for any model that notices the center
   rule. This game measures "did the model spot and execute the center rush,"
   not deep strategy. Sonnet passed that bar cleanly; it does not yet tell us
   how Sonnet fares against competent center defense.
2. This concretely validates design-v0.1 §13: minimax must not define good
   play, and its evaluation needs review before it anchors anything.
3. **Possible game-balance issue:** an 11-ply center rush may be a dominant
   opening even against real defense. Unknown until tested against an opponent
   that defends the center. Flag, don't conclude.

### Immediate next steps

- LLM vs LLM (claude-cli vs codex-cli): both understand the center rule, so
  it won't be a trivial rush — first real strategic/discrimination signal.
  (Running.)
- Give the baseline a center term (benchmark-side, not by mutating the product
  minimax) so there is an opponent that actually defends the center.
- Only then is "does center-rush beat competent defense" answerable.
